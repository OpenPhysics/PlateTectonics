/**
 * SlabCurve.ts
 *
 * The path a subducting plate follows as it bends over and descends into the mantle.
 *
 * A slab does not turn a corner at the trench and go down at a fixed angle; it bends
 * through a finite radius, because it is a rigid sheet and bending it costs energy. So
 * the path here is three circular arcs of decreasing then increasing radius — a gentle
 * start, a tight middle, a gentle finish — followed by a straight ray once the plate has
 * reached its final dip. The arc radii and the way the total dip is split between them
 * were derived for PhET's version in a Mathematica notebook (assets/shapes.nb) and are
 * reproduced here.
 *
 * The curve is parameterised by **arc length**, not by angle or by x. That matters: the
 * plate is not stretching, so a point on it travels a fixed distance per million years
 * along the path, whatever part of the bend it is in. Parameterising any other way would
 * make the plate appear to speed up and slow down as it went round the corner.
 *
 * Old oceanic lithosphere dips steeper than young — it is colder, thicker and denser, so
 * it sinks more readily. That is the one place the plate's *age* changes its shape.
 *
 * Pure and unit-tested in tests/SlabCurve.test.ts. Lengths m, angles radians, and the
 * returned points are model coordinates (x across, elevation up).
 */

import { Vector2 } from "scenerystack/dot";
import {
  SUBDUCTION_ARC_ANGLE_FRACTIONS,
  SUBDUCTION_ARC_RADII_M,
  SUBDUCTION_TOTAL_ANGLE_OLD_RAD,
  SUBDUCTION_TOTAL_ANGLE_YOUNG_RAD,
} from "../../PlateTectonicsConstants.js";
import { type PlateType, plateProperties } from "./PlateType.js";

/** One arc of the bend: how far it turns, and how tightly. */
type Arc = {
  readonly angle: number;
  readonly radius: number;
  /** Arc length of this segment, m. */
  readonly length: number;
};

export class SlabCurve {
  /** Total dip the slab reaches once it has finished bending, radians. */
  public readonly totalAngleRad: number;

  /** Where the bend starts — the hinge at the trench, in model coordinates. */
  public readonly startM: Vector2;

  private readonly arcs: readonly Arc[];

  /** Arc length at which the bend finishes and the straight ray begins, m. */
  public readonly bendLengthM: number;

  public constructor(type: PlateType, startM: Vector2) {
    this.startM = startM;

    // Steeper for old ocean floor: colder, thicker, denser, so it sinks more readily.
    this.totalAngleRad = type === "oldOceanic" ? SUBDUCTION_TOTAL_ANGLE_OLD_RAD : SUBDUCTION_TOTAL_ANGLE_YOUNG_RAD;

    this.arcs = SUBDUCTION_ARC_RADII_M.map((radius, index) => {
      const angle = this.totalAngleRad * (SUBDUCTION_ARC_ANGLE_FRACTIONS[index] ?? 0);
      return { angle, radius, length: angle * radius };
    });

    this.bendLengthM = this.arcs.reduce((total, arc) => total + arc.length, 0);
  }

  /**
   * The point a distance `sM` along the slab from the hinge, in model coordinates.
   *
   * The slab descends to the right of the hinge by convention; the caller mirrors it
   * when the left-hand plate is the one going down.
   */
  public positionAt(sM: number): Vector2 {
    if (sM <= 0) {
      return this.startM.copy();
    }

    // Walk the arcs, accumulating position and heading. Each arc turns the heading
    // downwards by its own angle about its own centre of curvature.
    let x = this.startM.x;
    let y = this.startM.y;
    let heading = 0; // horizontal, pointing towards the trench
    let remaining = sM;

    for (const arc of this.arcs) {
      const travelled = Math.min(remaining, arc.length);
      const swept = travelled / arc.radius;

      // Exact integral of the circular arc from the current heading through `swept`.
      x += arc.radius * (Math.sin(heading + swept) - Math.sin(heading));
      y -= arc.radius * (Math.cos(heading) - Math.cos(heading + swept));

      heading += swept;
      remaining -= travelled;
      if (remaining <= 0) {
        return new Vector2(x, y);
      }
    }

    // Past the bend: a straight ray at the final dip.
    return new Vector2(x + remaining * Math.cos(heading), y - remaining * Math.sin(heading));
  }

  /** The slab's heading a distance `sM` along it, radians below horizontal. */
  public angleAt(sM: number): number {
    let remaining = Math.max(0, sM);
    let heading = 0;
    for (const arc of this.arcs) {
      const travelled = Math.min(remaining, arc.length);
      heading += travelled / arc.radius;
      remaining -= travelled;
      if (remaining <= 0) {
        break;
      }
    }
    return heading;
  }

  /** Depth below sea level a distance `sM` along the slab, m — positive downwards. */
  public depthAt(sM: number): number {
    return -this.positionAt(sM).y;
  }

  /**
   * Arc length at which the slab first reaches a given depth, m, or null if it never
   * does. Used to find where the slab enters the melt window.
   */
  public lengthAtDepth(depthM: number): number | null {
    if (depthM <= -this.startM.y) {
      return 0;
    }
    // Monotonic in s once past the hinge, so a bisection is exact enough and cannot be
    // fooled the way a closed-form inverse of the piecewise curve could be.
    let low = 0;
    let high = this.bendLengthM;
    while (this.depthAt(high) < depthM) {
      high *= 2;
      if (high > 1e9) {
        return null;
      }
    }
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      if (this.depthAt(mid) < depthM) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return (low + high) / 2;
  }

  /** The centreline of the slab, sampled from the hinge down to `lengthM`. */
  public trace(lengthM: number, samples = 48): Vector2[] {
    const points: Vector2[] = [];
    for (let i = 0; i <= samples; i++) {
      points.push(this.positionAt((lengthM * i) / samples));
    }
    return points;
  }
}

/** The hinge of the bend: mid-lithosphere at the plate's leading edge. */
export function slabHinge(type: PlateType, xM: number): Vector2 {
  const { crustTopM, crustBaseM, mantleLithosphereM } = plateProperties(type);
  return new Vector2(xM, crustTopM - (crustTopM - crustBaseM + mantleLithosphereM) / 2);
}
