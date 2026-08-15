/**
 * SceneCamera.ts
 *
 * The perspective camera the two schematic screens are drawn through, and the inverse
 * ray that lets a tool be dragged in a picture that has depth.
 *
 * ── Why there is a camera at all ──────────────────────────────────────────────
 * The Crust and Plate Motion screens draw a *block* of Earth, not a diagram of one: a
 * slab with a terrain surface on top, a cross-section across its front face, and real
 * thickness between them. That is how PhET's Java version presented both tabs, and it
 * is the thing a flat cross-section cannot say — that the section is a cut through
 * something, and that the surface it cuts is the ground.
 *
 * ── Why it is written out rather than taken from a 3-D library ────────────────
 * The whole pipeline is one rotation, one translation and a perspective divide. Writing
 * it here keeps it a pure function of numbers, which means the projection is unit-tested
 * rather than trusted, the picture is reproducible without a GPU, and the sim keeps its
 * current dependency set. What is given up is a depth buffer — see QuadRenderer, which
 * sorts back to front instead.
 *
 * ── The pipeline ──────────────────────────────────────────────────────────────
 * A point arrives already curved by EarthCurvature, in metres, in the frame where the
 * origin is sea level at the centre of the block's front face. Then:
 *
 *   1. translate by `offset`, which pushes the block away down −z and slides it up or
 *      down to centre it;
 *   2. rotate about the x axis by `tilt`, which lifts the far side of the block up the
 *      screen — this is what makes the top face visible and the block read as solid;
 *   3. divide by depth against a vertical half-angle field of view;
 *   4. scale into the viewport in pixels.
 *
 * Steps 1–3 are a port of `PlateTectonicsTab.getSceneModelViewMatrix` and
 * `getGluPerspective`, including the original's convention that the field-of-view
 * number is the *half*-angle (Java passed 20° into a `cot(fov)` that standard
 * `gluPerspective` writes as `cot(fovy/2)`, so the full vertical angle is 40°).
 *
 * Where this deliberately departs from Java is framing: Java hard-coded the camera
 * distance for a 1008 × 676 stage and interpolated it against a zoom slider. Here
 * {@link SceneCamera.framing} solves for the distance that fits a given block into a
 * given viewport, so a zoom level changes what the block *is* and the camera follows.
 *
 * Pure and unit-tested in tests/SceneCamera.test.ts. Model lengths in metres, view
 * lengths in pixels, y positive up in the scene and positive down in the view.
 */

import { type Bounds2, type Vector2, Vector3 } from "scenerystack/dot";

/** Vertical half-angle of the frustum, degrees. PhET's value, and it is a narrow lens:
 * a long focal length keeps the block's parallel edges nearly parallel, so the picture
 * reads as a geological block diagram rather than a wide-angle photograph. */
export const DEFAULT_HALF_FOV_DEGREES = 20;

/** How far the far side of the block is lifted up the screen, degrees. PhET's value at
 * full zoom-in, kept fixed here because the framing solver now does the job their
 * zoom-dependent angle was doing. */
export const DEFAULT_TILT_DEGREES = 13;

/** Fraction of the viewport the framed block fills, leaving a margin round the edge. */
const DEFAULT_FILL_FRACTION = 0.92;

/** Nearest a point may be to the eye and still be drawn, m. Behind this it is culled. */
const NEAR_PLANE_M = 1;

export type SceneCameraOptions = {
  /** Viewport the scene is drawn into, view pixels. */
  viewBounds: Bounds2;

  /** Translation applied to the scene before the tilt, m. Its z is large and negative. */
  offset: Vector3;

  /** Vertical half-angle of the frustum, radians. */
  halfFov?: number;

  /** Rotation about the x axis, radians — positive lifts the far side of the block. */
  tilt?: number;
};

/** Where a point landed, and how far away it was. */
export type ProjectedPoint = {
  /** View x, pixels. Meaningless when `visible` is false. */
  readonly x: number;

  /** View y, pixels, positive down. Meaningless when `visible` is false. */
  readonly y: number;

  /** Distance in front of the eye, m. Larger is further away; this is the sort key. */
  readonly depth: number;

  /** False when the point is at or behind the eye, where the divide has no meaning. */
  readonly visible: boolean;
};

/** A ray back out of the camera, for picking. */
export type SceneRay = {
  readonly origin: Vector3;

  /** Not normalised — `origin + t · direction` with t in metres along −z of the eye. */
  readonly direction: Vector3;
};

export class SceneCamera {
  public readonly viewBounds: Bounds2;
  public readonly offset: Vector3;
  public readonly halfFov: number;
  public readonly tilt: number;

  /** cot of the half-angle: the eye-space y that fills half the viewport at unit depth. */
  private readonly cotHalfFov: number;
  private readonly sinTilt: number;
  private readonly cosTilt: number;
  private readonly aspect: number;

  public constructor(options: SceneCameraOptions) {
    this.viewBounds = options.viewBounds;
    this.offset = options.offset;
    this.halfFov = options.halfFov ?? (DEFAULT_HALF_FOV_DEGREES * Math.PI) / 180;
    this.tilt = options.tilt ?? (DEFAULT_TILT_DEGREES * Math.PI) / 180;

    this.cotHalfFov = Math.cos(this.halfFov) / Math.sin(this.halfFov);
    this.sinTilt = Math.sin(this.tilt);
    this.cosTilt = Math.cos(this.tilt);
    this.aspect = this.viewBounds.width / this.viewBounds.height;
  }

  /**
   * A curved scene point as a place on the screen.
   *
   * Allocates a small record per call and is called once per vertex per repaint, which
   * for the largest block here is a few thousand times — well inside the frame budget,
   * and worth the clarity over the scratch-field trick `PlateReconstruction.transform`
   * needs at ten thousand times that rate.
   */
  public project(point: Vector3): ProjectedPoint {
    const tx = point.x + this.offset.x;
    const ty = point.y + this.offset.y;
    const tz = point.z + this.offset.z;

    // Rotate about x. The camera sits at the origin looking down −z, so lifting the
    // far side of the block is the same as rotating the block itself.
    const ey = ty * this.cosTilt - tz * this.sinTilt;
    const ez = ty * this.sinTilt + tz * this.cosTilt;

    const depth = -ez;
    if (depth <= NEAR_PLANE_M) {
      return { x: 0, y: 0, depth, visible: false };
    }

    const ndcX = ((this.cotHalfFov / this.aspect) * tx) / depth;
    const ndcY = (this.cotHalfFov * ey) / depth;

    return {
      x: this.viewBounds.centerX + ndcX * (this.viewBounds.width / 2),
      y: this.viewBounds.centerY - ndcY * (this.viewBounds.height / 2),
      depth,
      visible: true,
    };
  }

  /** Convenience for the common case of projecting a planar-but-already-curved triple. */
  public projectXYZ(x: number, y: number, z: number): ProjectedPoint {
    return this.project(new Vector3(x, y, z));
  }

  /**
   * The ray through a point on the screen, back out into the scene.
   *
   * The inverse of {@link project} up to the depth that was divided away, which is
   * exactly what a drag needs: the tool's depth is fixed by whatever surface it is
   * being dropped onto, and the ray supplies the rest.
   */
  public rayFromView(viewPoint: Vector2): SceneRay {
    const ndcX = (viewPoint.x - this.viewBounds.centerX) / (this.viewBounds.width / 2);
    const ndcY = (this.viewBounds.centerY - viewPoint.y) / (this.viewBounds.height / 2);

    const tanHalfFov = 1 / this.cotHalfFov;
    const dx = ndcX * this.aspect * tanHalfFov;
    const dy = ndcY * tanHalfFov;
    const dz = -1;

    // Undo the tilt, then undo the translation. The eye is at the scene origin before
    // the offset is applied, so its scene position is simply −offset.
    return {
      origin: this.offset.negated(),
      direction: new Vector3(dx, dy * this.cosTilt + dz * this.sinTilt, -dy * this.sinTilt + dz * this.cosTilt),
    };
  }

  /**
   * Where a screen point meets a plane of constant scene z, or null if it never does.
   *
   * The plane wanted is almost always the block's front face, which is where every tool
   * on these screens lives — a thermometer reading the rock behind the section would be
   * reading rock the user cannot see.
   */
  public intersectPlaneZ(viewPoint: Vector2, planeZ: number): Vector3 | null {
    const ray = this.rayFromView(viewPoint);
    if (Math.abs(ray.direction.z) < 1e-12) {
      return null;
    }
    const t = (planeZ - ray.origin.z) / ray.direction.z;
    if (t <= 0) {
      return null;
    }
    return ray.origin.plus(ray.direction.timesScalar(t));
  }

  /**
   * A camera that fits `points` into `viewBounds`.
   *
   * The block is not a box once it has been curved, and its silhouette is not its
   * corners — the middle of the top face bulges toward the eye — so the caller passes a
   * sample of the whole surface rather than eight corners, and the solve is over all of
   * them.
   *
   * Solving rather than interpolating a hard-coded distance is what lets a zoom level
   * change the block's depth and have the framing follow, and what keeps the picture
   * correct at any viewport size.
   */
  public static framing(
    points: readonly Vector3[],
    options: {
      viewBounds: Bounds2;
      halfFov?: number;
      tilt?: number;
      fillFraction?: number;
    },
  ): SceneCamera {
    const halfFov = options.halfFov ?? (DEFAULT_HALF_FOV_DEGREES * Math.PI) / 180;
    const tilt = options.tilt ?? (DEFAULT_TILT_DEGREES * Math.PI) / 180;
    const fill = options.fillFraction ?? DEFAULT_FILL_FRACTION;
    const aspect = options.viewBounds.width / options.viewBounds.height;

    // Divided by the fill fraction, not multiplied: the solve below turns "this point's
    // normalised coordinate must not exceed `fill`" into a lower bound on the distance,
    // and a *smaller* permitted coordinate needs a *larger* distance.
    const cot = Math.cos(halfFov) / Math.sin(halfFov) / fill;
    const sinTilt = Math.sin(tilt);
    const cosTilt = Math.cos(tilt);

    if (points.length === 0) {
      return new SceneCamera({ viewBounds: options.viewBounds, offset: new Vector3(0, 0, -1), halfFov, tilt });
    }

    // Everything below works in the tilted frame, because the tilt does not depend on
    // the distance being solved for.
    const rotated = points.map((p) => new Vector3(p.x, p.y * cosTilt - p.z * sinTilt, p.y * sinTilt + p.z * cosTilt));

    let minRotY = Number.POSITIVE_INFINITY;
    let maxRotY = Number.NEGATIVE_INFINITY;
    for (const p of rotated) {
      minRotY = Math.min(minRotY, p.y);
      maxRotY = Math.max(maxRotY, p.y);
    }

    /** The nearest distance at which every sample still fits, for a given centring. */
    const distanceFor = (centring: number): number => {
      let distance = NEAR_PLANE_M;
      for (const p of rotated) {
        // |ndc| ≤ fill rearranges to a lower bound on the distance, one per axis.
        distance = Math.max(distance, cot * Math.abs(p.y + centring) + p.z, (cot / aspect) * Math.abs(p.x) + p.z);
      }
      return distance;
    };

    // Centring and distance are coupled through the perspective divide — moving the
    // block up the screen changes which point is the binding one. Two rounds of
    // "solve the distance, re-centre against it" converge well inside the margin that
    // `fill` leaves, and the distance is solved once more afterwards so the value
    // returned is the one that matches the centring returned with it. Without that last
    // solve the block can overflow the viewport by the amount of the final re-centring.
    let yOffset = -(minRotY + maxRotY) / 2;

    for (let pass = 0; pass < 2; pass++) {
      const distance = distanceFor(yOffset);

      let minScreenY = Number.POSITIVE_INFINITY;
      let maxScreenY = Number.NEGATIVE_INFINITY;
      for (const p of rotated) {
        const depth = distance - p.z;
        if (depth > NEAR_PLANE_M) {
          const screenY = (p.y + yOffset) / depth;
          minScreenY = Math.min(minScreenY, screenY);
          maxScreenY = Math.max(maxScreenY, screenY);
        }
      }
      if (minScreenY <= maxScreenY) {
        // Shift by the residual mis-centring, taken back out of the divide at the
        // representative depth of the block's middle.
        yOffset -= ((minScreenY + maxScreenY) / 2) * distance;
      }
    }

    const distance = distanceFor(yOffset);

    // `project` applies the offset *before* the tilt, so what was solved for here —
    // "sit the block at (0, yOffset, −distance) in the tilted frame" — has to be rotated
    // back out of it: offset = rotX(−tilt) · (0, yOffset, −distance).
    return new SceneCamera({
      viewBounds: options.viewBounds,
      offset: new Vector3(0, yOffset * cosTilt - distance * sinTilt, -yOffset * sinTilt - distance * cosTilt),
      halfFov,
      tilt,
    });
  }
}
