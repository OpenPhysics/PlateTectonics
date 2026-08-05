/**
 * PlateReconstruction.ts
 *
 * Plate kinematics: where a point on the Earth's surface was (or will be) after `t`
 * million years of today's plate motions.
 *
 * Each plate in `PLATES` carries an Euler pole — an axis through the centre of the
 * Earth — and a rotation rate about it in degrees per million years, in the
 * no-net-rotation frame. Moving a plate by `t` Myr is therefore a single rotation
 * of every point on it by `rate · t` degrees about that axis, which this class
 * evaluates with Rodrigues' rotation formula.
 *
 *   reconstruction.setTime(-20);                       // 20 Myr ago
 *   reconstruction.transform(lon, lat, frameIndex);    // writes .lon and .lat
 *
 * `transform` writes its result into public scratch fields instead of returning an
 * object: the map renderer calls it tens of thousands of times per frame while the
 * clock runs, and allocating there would dominate the frame budget.
 *
 * ── Why a *frame* index and not a plate index ─────────────────────────────────
 * Anything in the interior of a plate — a coastline, an epicentre, a volcano — rides
 * that plate. A plate *boundary* cannot: it belongs to two plates at once, and moving
 * it with either one drives it into the other. Carrying every plate outline rigidly
 * is what makes a naive reconstruction tear the map open at the ridges and pile it up
 * at the trenches, with the two sides of a boundary a thousand kilometres apart after
 * 50 Myr.
 *
 * So boundaries ride rotations of their own, computed at build time and listed in
 * `DERIVED_MOTION_FRAMES`: the mean of the two plates' rotation vectors at a ridge or
 * a transform, and the overriding plate at a subduction zone. {@link MOTION_FRAMES}
 * puts the plates first and those frames after, so a plate index *is* a frame index
 * and everything below takes one kind of number.
 *
 * The plate outlines are pinned to those same frames vertex by vertex
 * (`PlateRecord.ringFrames`), so two plates that share an edge carry it identically
 * and the mosaic stays closed. What changes through time is each plate's *area*:
 * it grows along its ridges and shrinks at its trenches, which is the sea floor being
 * made and unmade — the thing the reconstruction is there to show.
 *
 * ── Caveats worth teaching ────────────────────────────────────────────────────
 * This extrapolates *today's* velocities. It is a good approximation for the last
 * few million years, a rough sketch at ±50 Myr (plate motions change as ridges and
 * subduction zones are born and die), and says nothing about plates that no longer
 * exist. Plate interiors are treated as rigid, so the deformed belts along their
 * edges — the Andes, the Himalaya, the Basin and Range — are drawn as if they were
 * not deforming at all.
 */

import { EARTH_RADIUS_KM } from "../PlateTectonicsConstants.js";
import type { RotationVector } from "./data/dataTypes.js";
import { DERIVED_MOTION_FRAMES } from "./data/generated/motionFrameData.js";
import { PLATES } from "./data/generated/plateData.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Number of matrix entries stored per frame. */
const MATRIX_SIZE = 9;

/**
 * Every rotation the reconstruction can apply, in index order: the plates first — so
 * a plate index and a frame index are the same number — then the rotations derived
 * for the plate boundaries.
 */
export const MOTION_FRAMES: readonly RotationVector[] = [...PLATES, ...DERIVED_MOTION_FRAMES];

/** Absolute velocity of a point riding a plate. */
export interface PlateVelocity {
  /** Speed in mm/year (numerically identical to km per million years). */
  readonly speedMmPerYear: number;
  /** Direction of motion, degrees clockwise from north. */
  readonly azimuthDeg: number;
}

export class PlateReconstruction {
  /** Row-major 3×3 rotation matrix per motion frame, packed end to end. */
  private readonly matrices = new Float64Array(MOTION_FRAMES.length * MATRIX_SIZE);

  /** Longitude written by the most recent {@link transform} call, in degrees. */
  public lon = 0;

  /** Latitude written by the most recent {@link transform} call, in degrees. */
  public lat = 0;

  private timeMyr = Number.NaN;

  public constructor() {
    this.setTime(0);
  }

  /** True while the reconstruction is at the present day, where `transform` is the identity. */
  public get isPresentDay(): boolean {
    return this.timeMyr === 0;
  }

  /**
   * Rebuilds the per-frame rotation matrices for `timeMyr` million years from the
   * present (negative into the past). Cheap enough to call every animation frame.
   */
  public setTime(timeMyr: number): void {
    if (timeMyr === this.timeMyr) {
      return;
    }
    this.timeMyr = timeMyr;

    for (let index = 0; index < MOTION_FRAMES.length; index++) {
      const plate = MOTION_FRAMES[index] as RotationVector;
      const angle = plate.poleRateDegPerMyr * timeMyr * DEG_TO_RAD;

      const poleLatRad = plate.poleLat * DEG_TO_RAD;
      const poleLonRad = plate.poleLon * DEG_TO_RAD;
      const cosLat = Math.cos(poleLatRad);
      const kx = cosLat * Math.cos(poleLonRad);
      const ky = cosLat * Math.sin(poleLonRad);
      const kz = Math.sin(poleLatRad);

      // Rodrigues: R = I + sin(θ)·K + (1 − cos(θ))·K², with K the cross-product
      // matrix of the unit pole vector k.
      const s = Math.sin(angle);
      const c = 1 - Math.cos(angle);
      const at = index * MATRIX_SIZE;

      this.matrices[at] = 1 + c * (kx * kx - 1);
      this.matrices[at + 1] = -s * kz + c * kx * ky;
      this.matrices[at + 2] = s * ky + c * kx * kz;
      this.matrices[at + 3] = s * kz + c * kx * ky;
      this.matrices[at + 4] = 1 + c * (ky * ky - 1);
      this.matrices[at + 5] = -s * kx + c * ky * kz;
      this.matrices[at + 6] = -s * ky + c * kx * kz;
      this.matrices[at + 7] = s * kx + c * ky * kz;
      this.matrices[at + 8] = 1 + c * (kz * kz - 1);
    }
  }

  /**
   * Moves a geographic point with whatever carries it, writing the result to
   * {@link lon} and {@link lat}. At the present day this is the identity and returns
   * immediately.
   *
   * @param lon - present-day longitude, degrees
   * @param lat - present-day latitude, degrees
   * @param frameIndex - index into {@link MOTION_FRAMES}; a plate index for anything
   * inside a plate, and the boundary's own frame for anything on one
   */
  public transform(lon: number, lat: number, frameIndex: number): void {
    if (this.isPresentDay) {
      this.lon = lon;
      this.lat = lat;
      return;
    }

    const latRad = lat * DEG_TO_RAD;
    const lonRad = lon * DEG_TO_RAD;
    const cosLat = Math.cos(latRad);
    const x = cosLat * Math.cos(lonRad);
    const y = cosLat * Math.sin(lonRad);
    const z = Math.sin(latRad);

    const m = this.matrices;
    const at = frameIndex * MATRIX_SIZE;
    const rx = (m[at] as number) * x + (m[at + 1] as number) * y + (m[at + 2] as number) * z;
    const ry = (m[at + 3] as number) * x + (m[at + 4] as number) * y + (m[at + 5] as number) * z;
    const rz = (m[at + 6] as number) * x + (m[at + 7] as number) * y + (m[at + 8] as number) * z;

    this.lon = Math.atan2(ry, rx) * RAD_TO_DEG;
    this.lat = Math.asin(Math.max(-1, Math.min(1, rz))) * RAD_TO_DEG;
  }

  /**
   * Absolute (no-net-rotation) velocity of a motion frame at a point: v = ω × r.
   *
   * With ω in radians per million year and r in km, |v| comes out in km per million
   * years, which is the same number as mm/year — the unit plate speeds are quoted in.
   */
  public static velocityAt(frameIndex: number, lon: number, lat: number): PlateVelocity {
    const plate = MOTION_FRAMES[frameIndex];
    if (!plate) {
      return { speedMmPerYear: 0, azimuthDeg: 0 };
    }

    const rate = plate.poleRateDegPerMyr * DEG_TO_RAD;
    const poleLatRad = plate.poleLat * DEG_TO_RAD;
    const poleLonRad = plate.poleLon * DEG_TO_RAD;
    const wx = rate * Math.cos(poleLatRad) * Math.cos(poleLonRad);
    const wy = rate * Math.cos(poleLatRad) * Math.sin(poleLonRad);
    const wz = rate * Math.sin(poleLatRad);

    const latRad = lat * DEG_TO_RAD;
    const lonRad = lon * DEG_TO_RAD;
    const cosLat = Math.cos(latRad);
    const rx = EARTH_RADIUS_KM * cosLat * Math.cos(lonRad);
    const ry = EARTH_RADIUS_KM * cosLat * Math.sin(lonRad);
    const rz = EARTH_RADIUS_KM * Math.sin(latRad);

    const vx = wy * rz - wz * ry;
    const vy = wz * rx - wx * rz;
    const vz = wx * ry - wy * rx;

    // Resolve into the local east / north frame.
    const east = vx * -Math.sin(lonRad) + vy * Math.cos(lonRad);
    const north = vx * -Math.sin(latRad) * Math.cos(lonRad) + vy * -Math.sin(latRad) * Math.sin(lonRad) + vz * cosLat;

    return {
      speedMmPerYear: Math.hypot(east, north),
      azimuthDeg: (Math.atan2(east, north) * RAD_TO_DEG + 360) % 360,
    };
  }
}
