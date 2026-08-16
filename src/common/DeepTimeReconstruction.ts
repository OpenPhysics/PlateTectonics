/**
 * DeepTimeReconstruction.ts
 *
 * Where a point on the Earth's surface actually was, according to a published plate
 * reconstruction — Müller et al. (2019) — rather than according to an extrapolation
 * of today's velocities.
 *
 *   reconstruction.setTime(140);                          // 140 Ma
 *   reconstruction.transform(lon, lat, rotationSlot);     // writes .lon and .lat
 *
 * ── How this differs from PlateReconstruction ─────────────────────────────────
 * {@link PlateReconstruction} carries one Euler pole and a constant rate per plate,
 * so a reconstruction is `rate · t` degrees about a fixed axis. That is exact for a
 * few million years and a sketch at fifty, which is why that screen stops there.
 *
 * A real model does not have a constant rate. Its rotations are sampled: for each
 * plate, at each sample time, a *total* finite rotation carrying present-day geometry
 * back to where it was. Both the axis and the angle wander as the plate's history
 * unfolds. So this class interpolates between samples rather than scaling a rate, and
 * it does that by turning both bracketing rotations into quaternions and slerping —
 * a rotation has to be interpolated *as a rotation*, and linearly blending pole
 * latitude, pole longitude and angle gives visibly wrong paths, worst exactly where
 * a plate is moving fastest.
 *
 * ── What it can and cannot move ───────────────────────────────────────────────
 * Only *static* features: a coastline, cookie-cut by plate ID at the present day and
 * carried rigidly. That is the whole trick that keeps the data small — see
 * `dataTypes.ts`. Plate polygons and boundaries have no present-day geometry to
 * carry, and come from `PLATE_SNAPSHOTS` instead.
 *
 * `transform` writes its result into public scratch fields instead of returning an
 * object, for the reason {@link PlateReconstruction} does: the renderer calls it tens
 * of thousands of times per frame while the clock runs.
 */

import { HISTORY_ROTATIONS, HISTORY_TIMES_MA } from "./data/generated/plateHistoryData.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Numbers stored per sample in a `HISTORY_ROTATIONS` row: pole lat, pole lon, angle. */
const NUMBERS_PER_SAMPLE = 3;

/** Matrix entries stored per rotation row. */
const MATRIX_SIZE = 9;

/** Oldest time the reconstruction covers, in Ma. */
export const HISTORY_OLDEST_MA = HISTORY_TIMES_MA[HISTORY_TIMES_MA.length - 1] as number;

/** Spacing of the samples, in Myr. Uniform, by construction in `build-data.ts`. */
export const HISTORY_STEP_MYR = (HISTORY_TIMES_MA[1] as number) - (HISTORY_TIMES_MA[0] as number);

/**
 * Row of `HISTORY_ROTATIONS` that never moves anything, reserved at build time.
 *
 * Resolved topologies — plate polygons, boundary lines — are *already* at the instant
 * being drawn, so they must not be rotated again. They still go through the same
 * painter as the coastlines, because everything else it does (subdividing long
 * segments, cutting at the limb) applies to them just as much; this is the row that
 * makes the transform step a no-op for them.
 */
export const IDENTITY_ROTATION_SLOT = 0;

export class DeepTimeReconstruction {
  /** Row-major 3×3 rotation matrix per rotation row, packed end to end. */
  private readonly matrices = new Float64Array(HISTORY_ROTATIONS.length * MATRIX_SIZE);

  /** Longitude written by the most recent {@link transform} call, in degrees. */
  public lon = 0;

  /** Latitude written by the most recent {@link transform} call, in degrees. */
  public lat = 0;

  private timeMa = Number.NaN;

  public constructor() {
    this.setTime(0);
  }

  /** True at the present day, where {@link transform} is the identity. */
  public get isPresentDay(): boolean {
    return this.timeMa === 0;
  }

  /**
   * Index of the snapshot nearest the current time — what the stepped half of the
   * data is drawn from. See `PLATE_SNAPSHOTS`.
   */
  public get nearestSnapshotIndex(): number {
    const index = Math.round(this.timeMa / HISTORY_STEP_MYR);
    return Math.max(0, Math.min(HISTORY_TIMES_MA.length - 1, index));
  }

  /**
   * Rebuilds every rotation matrix for `timeMa` million years before the present.
   * Cheap enough to call every animation frame: there are a couple of hundred rows,
   * not one per plate ID.
   */
  public setTime(timeMa: number): void {
    const clamped = Math.max(0, Math.min(HISTORY_OLDEST_MA, timeMa));
    if (clamped === this.timeMa) {
      return;
    }
    this.timeMa = clamped;

    // Bracketing samples, and how far between them this time falls.
    const position = clamped / HISTORY_STEP_MYR;
    const lower = Math.min(HISTORY_TIMES_MA.length - 1, Math.floor(position));
    const upper = Math.min(HISTORY_TIMES_MA.length - 1, lower + 1);
    const fraction = position - lower;

    for (let row = 0; row < HISTORY_ROTATIONS.length; row++) {
      const samples = HISTORY_ROTATIONS[row] as readonly number[];
      quaternionFromSample(samples, lower, quaternionA);
      quaternionFromSample(samples, upper, quaternionB);
      slerp(quaternionA, quaternionB, fraction, quaternionOut);
      writeMatrix(quaternionOut, this.matrices, row * MATRIX_SIZE);
    }
  }

  /**
   * Carries a present-day geographic point back to where it was, writing the result
   * to {@link lon} and {@link lat}.
   *
   * @param lon - present-day longitude, degrees
   * @param lat - present-day latitude, degrees
   * @param rotationSlot - row of `HISTORY_ROTATIONS`, from `HISTORY_ROTATION_SLOTS`
   */
  public transform(lon: number, lat: number, rotationSlot: number): void {
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
    const at = rotationSlot * MATRIX_SIZE;
    const rx = (m[at] as number) * x + (m[at + 1] as number) * y + (m[at + 2] as number) * z;
    const ry = (m[at + 3] as number) * x + (m[at + 4] as number) * y + (m[at + 5] as number) * z;
    const rz = (m[at + 6] as number) * x + (m[at + 7] as number) * y + (m[at + 8] as number) * z;

    this.lon = Math.atan2(ry, rx) * RAD_TO_DEG;
    this.lat = Math.asin(Math.max(-1, Math.min(1, rz))) * RAD_TO_DEG;
  }
}

// ── Quaternion helpers ────────────────────────────────────────────────────────
// These write into caller-supplied scratch arrays rather than returning objects,
// because `setTime` runs them a few hundred times on every frame the clock moves.

type Quaternion = Float64Array;

const quaternionA: Quaternion = new Float64Array(4);
const quaternionB: Quaternion = new Float64Array(4);
const quaternionOut: Quaternion = new Float64Array(4);

/** Reads sample `index` of a rotation row as a quaternion `[w, x, y, z]`. */
function quaternionFromSample(samples: readonly number[], index: number, out: Quaternion): void {
  const at = index * NUMBERS_PER_SAMPLE;
  const poleLat = (samples[at] as number) * DEG_TO_RAD;
  const poleLon = (samples[at + 1] as number) * DEG_TO_RAD;
  const half = ((samples[at + 2] as number) * DEG_TO_RAD) / 2;

  const cosPoleLat = Math.cos(poleLat);
  const sinHalf = Math.sin(half);
  out[0] = Math.cos(half);
  out[1] = sinHalf * cosPoleLat * Math.cos(poleLon);
  out[2] = sinHalf * cosPoleLat * Math.sin(poleLon);
  out[3] = sinHalf * Math.sin(poleLat);
}

/**
 * Spherical linear interpolation, taking the short way round.
 *
 * A rotation and its negation are the same rotation, so two consecutive samples can
 * come out of the model with opposite signs — the pole flips hemisphere and the angle
 * flips with it. Interpolating those as they stand would send the plate the long way
 * around the Earth between one sample and the next. Negating one when the two point
 * away from each other is what prevents it.
 */
function slerp(from: Quaternion, to: Quaternion, fraction: number, out: Quaternion): void {
  let dot = (from[0] as number) * (to[0] as number) + (from[1] as number) * (to[1] as number);
  dot += (from[2] as number) * (to[2] as number) + (from[3] as number) * (to[3] as number);

  const sign = dot < 0 ? -1 : 1;
  dot *= sign;

  let scaleFrom = 1 - fraction;
  let scaleTo = fraction * sign;

  // Above this the two are close enough that the linear blend below is within
  // floating-point noise of the arc, and the sine denominator has stopped being safe.
  if (dot < 0.9995) {
    const angle = Math.acos(Math.min(1, dot));
    const sinAngle = Math.sin(angle);
    scaleFrom = Math.sin((1 - fraction) * angle) / sinAngle;
    scaleTo = (sign * Math.sin(fraction * angle)) / sinAngle;
  }

  let w = scaleFrom * (from[0] as number) + scaleTo * (to[0] as number);
  let x = scaleFrom * (from[1] as number) + scaleTo * (to[1] as number);
  let y = scaleFrom * (from[2] as number) + scaleTo * (to[2] as number);
  let z = scaleFrom * (from[3] as number) + scaleTo * (to[3] as number);

  const length = Math.hypot(w, x, y, z) || 1;
  w /= length;
  x /= length;
  y /= length;
  z /= length;

  out[0] = w;
  out[1] = x;
  out[2] = y;
  out[3] = z;
}

/** Writes a unit quaternion into `target` as a row-major 3×3 rotation matrix. */
function writeMatrix(quaternion: Quaternion, target: Float64Array, at: number): void {
  const w = quaternion[0] as number;
  const x = quaternion[1] as number;
  const y = quaternion[2] as number;
  const z = quaternion[3] as number;

  target[at] = 1 - 2 * (y * y + z * z);
  target[at + 1] = 2 * (x * y - w * z);
  target[at + 2] = 2 * (x * z + w * y);
  target[at + 3] = 2 * (x * y + w * z);
  target[at + 4] = 1 - 2 * (x * x + z * z);
  target[at + 5] = 2 * (y * z - w * x);
  target[at + 6] = 2 * (x * z - w * y);
  target[at + 7] = 2 * (y * z + w * x);
  target[at + 8] = 1 - 2 * (x * x + y * y);
}
