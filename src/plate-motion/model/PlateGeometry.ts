/**
 * PlateGeometry.ts
 *
 * The shape of the boundary at a given moment: where each plate's crust and lithosphere
 * are, where the slab has got to, where magma has collected and what has been built on
 * the surface.
 *
 * ── Why this is a pure function ───────────────────────────────────────────────
 * PhET's version accumulated this frame by frame, mutating arrays of samples inside five
 * behaviour classes. This computes it from `tMyr` and nothing else. The gain is not
 * tidiness — it is that Rewind, step-while-paused and scrubbing the clock all become
 * free and exact, the whole evolution is testable without a clock, and the picture cannot
 * drift with frame rate. The one thing given up is PhET's Poisson process for individual
 * magma blobs; deterministic blobs at fixed phase offsets look the same and reproduce.
 *
 * ── The three behaviours ──────────────────────────────────────────────────────
 * **Rifting** — the plates separate at a steady rate and new ocean floor fills the gap
 * from a ridge at the axis. The ridge stands high because the rock there is hot; the
 * floor deepens away from it as it cools, which is why abyssal plains get deeper with
 * distance from a spreading centre.
 *
 * **Subduction** — the denser plate bends over a hinge and descends along SlabCurve. It
 * drags a trench down at the surface. Where it passes through 100-150 km it dehydrates,
 * releasing water that melts the mantle above it, and that melt rises to build a
 * volcanic arc on the overriding plate — offset inland from the trench by exactly as far
 * as the slab has travelled sideways in reaching that depth.
 *
 * **Collision** — neither plate can subduct, so the convergence has nowhere to go but
 * up and down. The crust shortens horizontally and thickens to match, conserving its
 * cross-sectional area, which puts a mountain range on top and a root underneath. The
 * shortening slows logarithmically: the thicker the pile, the harder it is to push.
 *
 * Pure and unit-tested in tests/PlateGeometry.test.ts. Model coordinates: x across with
 * the boundary at 0, y elevation up, both in metres.
 */

import { Vector2 } from "scenerystack/dot";
import {
  COLLISION_ELEVATION_RANGE_M,
  MELT_SPEED_M_PER_MYR,
  MELT_TOP_DEPTH_M,
  NEW_CRUST_LABEL_DELAY_MYR,
  PLATE_SPEED_M_PER_MYR,
  PLATE_X_LIMIT_M,
  RIDGE_TOP_M,
} from "../../PlateTectonicsConstants.js";
import { behaviorFor, type MotionType, subductingSide } from "./BoundaryRules.js";
import { crustThickness, lithosphereBaseM, type PlateType, plateProperties } from "./PlateType.js";
import { SlabCurve, slabHinge } from "./SlabCurve.js";

/** One plate, as three polylines from its outer edge in towards the boundary. */
export type PlateOutline = {
  readonly crustTop: readonly Vector2[];
  readonly crustBase: readonly Vector2[];
  readonly lithosphereBase: readonly Vector2[];
};

/** A volcano on the surface. */
export type Volcano = {
  readonly xM: number;
  readonly baseM: number;
  readonly heightM: number;
};

/** Everything the painter needs for one moment of one boundary. */
export type BoundaryGeometry = {
  readonly left: PlateOutline;
  readonly right: PlateOutline;

  /** Centreline of the descending slab, or empty when nothing is subducting. */
  readonly slab: readonly Vector2[];

  /** Half-thickness of the slab, m — it is drawn as a ribbon about its centreline. */
  readonly slabHalfThicknessM: number;

  /** Outline of the magma that has collected under the arc, or empty when there is none. */
  readonly magma: readonly Vector2[];

  /** Volcanoes built on the overriding plate. */
  readonly volcanoes: readonly Volcano[];

  /** Model x of the spreading axis, or null when this is not a rift. */
  readonly ridgeAxisM: number | null;

  /**
   * Half-width of the ocean floor made since the rift opened, m. Zero for anything that
   * is not a rift. The view uses it to place the "new crust" label over floor that
   * actually is new, rather than guessing from the plate outlines.
   */
  readonly newCrustHalfWidthM: number;

  /** Whether new ocean floor has been made long enough to be worth labelling. */
  readonly hasNewCrust: boolean;
};

/** How many points each polyline is sampled at. Enough to keep a bend smooth. */
const SAMPLES = 40;

/** Tightest a collision squeezes the crust: down to a quarter of its original width. */
const MAX_SQUEEZE = 0.75;

/** How quickly a collision approaches that limit, Myr. */
const COLLISION_TIME_SCALE_MYR = 16;

/** How far either side of the boundary a collision shortens the crust, m. */
const COLLISION_REACH_M = 260000;

/** Fraction of a collision's thickening that goes down as a root rather than up. */
const COLLISION_ROOT_SHARE = 0.85;

/** A flat plate outline spanning [x0, x1] at its rest elevations. */
function flatOutline(type: PlateType, x0M: number, x1M: number): PlateOutline {
  const { crustTopM, crustBaseM } = plateProperties(type);
  const baseM = lithosphereBaseM(type);
  const xs = [x0M, x1M];
  return {
    crustTop: xs.map((x) => new Vector2(x, crustTopM)),
    crustBase: xs.map((x) => new Vector2(x, crustBaseM)),
    lithosphereBase: xs.map((x) => new Vector2(x, baseM)),
  };
}

/**
 * Elevation of ocean floor of a given age, m.
 *
 * New crust at the ridge is hot and therefore buoyant; as it cools it contracts and
 * sinks. The observed relationship goes as the square root of age, which is what a
 * cooling half-space gives, and it is the reason the ocean basins have the shape they do.
 */
function ridgeProfileM(ageMyr: number, floorM: number): number {
  const settled = Math.min(1, Math.sqrt(Math.max(0, ageMyr) / NEW_CRUST_LABEL_DELAY_MYR));
  return RIDGE_TOP_M + settled * (floorM - RIDGE_TOP_M);
}

/** The two plates drawing apart, with new ocean floor filling the gap behind them. */
function riftingGeometry(left: PlateType, right: PlateType, tMyr: number): BoundaryGeometry {
  const openingM = PLATE_SPEED_M_PER_MYR * tMyr;
  const floorM = plateProperties(right).crustTopM;

  // Each original plate is simply carried outward; the new floor between them is drawn
  // as part of each plate's outline, deepening away from the axis with its age.
  const newFloor = (sign: number): Vector2[] => {
    const points: Vector2[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const xM = (sign * openingM * i) / SAMPLES;
      // Crust at the axis was made just now; crust at the outer edge of the new floor is
      // as old as the rift. Age therefore grows *with* distance from the axis, which is
      // what makes the sea floor deepen outwards rather than towards the ridge.
      const ageMyr = (tMyr * i) / SAMPLES;
      points.push(new Vector2(xM, ridgeProfileM(ageMyr, floorM)));
    }
    return points;
  };

  const side = (type: PlateType, sign: number): PlateOutline => {
    const { crustBaseM } = plateProperties(type);
    const outerM = sign * PLATE_X_LIMIT_M;
    const edgeM = sign * openingM;
    const flat = flatOutline(type, edgeM, outerM);
    return {
      // The ridge profile runs from the axis out to the old plate's edge, then the old
      // plate continues at its own elevation.
      crustTop: [...newFloor(sign), ...flat.crustTop],
      crustBase: [new Vector2(0, crustBaseM), ...flat.crustBase],
      lithosphereBase: [new Vector2(0, lithosphereBaseM(type)), ...flat.lithosphereBase],
    };
  };

  return {
    left: side(left, -1),
    right: side(right, 1),
    slab: [],
    slabHalfThicknessM: 0,
    magma: [],
    volcanoes: [],
    ridgeAxisM: 0,
    newCrustHalfWidthM: openingM,
    hasNewCrust: tMyr > NEW_CRUST_LABEL_DELAY_MYR,
  };
}

/** One plate bending over and descending beneath the other. */
function subductionGeometry(left: PlateType, right: PlateType, down: "left" | "right", tMyr: number): BoundaryGeometry {
  const downType = down === "left" ? left : right;
  const overType = down === "left" ? right : left;
  const downSign = down === "left" ? -1 : 1;

  const travelledM = PLATE_SPEED_M_PER_MYR * tMyr;
  const hinge = slabHinge(downType, 0);
  const curve = new SlabCurve(downType, hinge);

  // SlabCurve is written descending to the right of the hinge, so it is reflected about
  // the boundary when the left-hand plate is the one going down.
  const mirror = (point: Vector2): Vector2 => new Vector2(downSign * point.x, point.y);
  const slab = curve.trace(travelledM).map(mirror);

  // A trench where the plate bends down — it is pulled below the surrounding sea floor
  // by the slab hanging off it.
  const trenchDepthM = Math.min(4000, travelledM / 40);
  const downPlate = ((): PlateOutline => {
    const { crustTopM, crustBaseM } = plateProperties(downType);
    const outerM = downSign * PLATE_X_LIMIT_M;
    const top: Vector2[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const xM = (outerM * i) / SAMPLES;
      // The flexural bulge and trench, deepest at the hinge and dying away outboard.
      const fromHinge = Math.abs(xM) / 120000;
      top.push(new Vector2(xM, crustTopM - trenchDepthM * Math.exp(-fromHinge * fromHinge)));
    }
    return {
      crustTop: top.reverse(),
      crustBase: [new Vector2(0, crustBaseM), new Vector2(outerM, crustBaseM)],
      lithosphereBase: [new Vector2(0, lithosphereBaseM(downType)), new Vector2(outerM, lithosphereBaseM(downType))],
    };
  })();

  // ── The volcanic arc ──────────────────────────────────────────────────────
  // Melt is generated where the slab passes through the dehydration window, and rises
  // vertically. Its horizontal offset from the trench is therefore set by how far the
  // slab has moved sideways by the time it is that deep — which is why arcs sit a
  // characteristic distance inland and not at the trench itself.
  const meltTopS = curve.lengthAtDepth(MELT_TOP_DEPTH_M);
  const reachedMelt = meltTopS !== null && travelledM > meltTopS;

  let magma: Vector2[] = [];
  let volcanoes: Volcano[] = [];

  if (reachedMelt && meltTopS !== null) {
    const sourceM = mirror(curve.positionAt(meltTopS));
    const arcXM = sourceM.x;

    // How far the melt has risen since it was first generated. Melt is buoyant, so it
    // goes straight up from where it was made — it does not follow the slab down.
    const risenM = Math.max(0, (travelledM - meltTopS) / PLATE_SPEED_M_PER_MYR) * MELT_SPEED_M_PER_MYR;
    const overTopM = plateProperties(overType).crustTopM;
    const chamberTopM = Math.min(overTopM, sourceM.y + risenM);
    const baseHalfWidthM = 22000;

    // A vertical conduit that tapers upwards: wide where the melt is being collected off
    // the slab, narrow where it is being funnelled into the crust above.
    magma = [
      new Vector2(arcXM - baseHalfWidthM * 0.3, chamberTopM),
      new Vector2(arcXM + baseHalfWidthM * 0.3, chamberTopM),
      new Vector2(arcXM + baseHalfWidthM, sourceM.y),
      new Vector2(arcXM - baseHalfWidthM, sourceM.y),
    ];

    // Once the melt has reached the base of the overriding crust, it starts building
    // a volcano rather than continuing to rise as a chamber.
    const brokeThrough = sourceM.y + risenM - plateProperties(overType).crustBaseM;
    if (brokeThrough > 0) {
      const heightM = Math.min(4000, brokeThrough / 12);
      volcanoes = [{ xM: arcXM, baseM: overTopM, heightM }];
    }
  }

  const overPlate = ((): PlateOutline => {
    const { crustTopM, crustBaseM } = plateProperties(overType);
    const outerM = -downSign * PLATE_X_LIMIT_M;
    return {
      crustTop: [new Vector2(0, crustTopM), new Vector2(outerM, crustTopM)],
      crustBase: [new Vector2(0, crustBaseM), new Vector2(outerM, crustBaseM)],
      lithosphereBase: [new Vector2(0, lithosphereBaseM(overType)), new Vector2(outerM, lithosphereBaseM(overType))],
    };
  })();

  return {
    left: down === "left" ? downPlate : overPlate,
    right: down === "left" ? overPlate : downPlate,
    slab,
    slabHalfThicknessM: (crustThickness(downType) + plateProperties(downType).mantleLithosphereM) / 2,
    magma,
    volcanoes,
    ridgeAxisM: null,
    newCrustHalfWidthM: 0,
    hasNewCrust: false,
  };
}

/**
 * Two continents crumpling, because neither can go down.
 *
 * The crust shortens horizontally by a factor that grows with time and thickens by the
 * reciprocal of it, so each column keeps its cross-sectional area: rock is conserved, it
 * is just rearranged. Half the thickening goes up as mountains and half down as a root,
 * in the ratio isostasy demands.
 */
function collisionGeometry(left: PlateType, right: PlateType, tMyr: number): BoundaryGeometry {
  // How hard the crust has been squeezed, 0 to just under 1. Grows and saturates, which
  // is the logarithmic slowdown: the thicker the pile gets, the harder it is to push.
  const squeeze = MAX_SQUEEZE * (1 - Math.exp(-tMyr / COLLISION_TIME_SCALE_MYR));

  const side = (type: PlateType, sign: number): PlateOutline => {
    const { crustTopM, crustBaseM, mantleLithosphereM } = plateProperties(type);
    const restThicknessM = crustTopM - crustBaseM;

    const top: Vector2[] = [];
    const base: Vector2[] = [];
    const lithosphere: Vector2[] = [];

    // Walk the *material*, not the screen. `u` is where a column started; `x` is where
    // it is now. Compressing a column to a fraction f of its original width thickens it
    // by 1/f, and integrating f to get x is what makes the area come out exactly
    // conserved rather than approximately: ∫ (rest/f) dx = ∫ (rest/f) f du = rest · L.
    let xM = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const uM = (sign * PLATE_X_LIMIT_M * i) / SAMPLES;

      // Shortening is concentrated at the boundary and dies away outboard, which is why
      // a collision makes a belt of mountains rather than lifting a whole continent.
      const widthFraction = 1 - squeeze * Math.exp(-((uM / COLLISION_REACH_M) ** 2));
      const thicknessM = restThicknessM / widthFraction;

      // Airy: most of the extra thickness goes down as a root, not up as topography.
      const extraM = thicknessM - restThicknessM;
      const elevationM = Math.min(COLLISION_ELEVATION_RANGE_M.max, crustTopM + extraM * (1 - COLLISION_ROOT_SHARE));

      top.push(new Vector2(xM, elevationM));
      base.push(new Vector2(xM, elevationM - thicknessM));
      lithosphere.push(new Vector2(xM, elevationM - thicknessM - mantleLithosphereM));

      // Advance the current position by the compressed width of this step.
      const duM = (sign * PLATE_X_LIMIT_M) / SAMPLES;
      xM += duM * widthFraction;
    }

    // Shortening pulls the plate's outer end in from the edge of the frame. On a real
    // margin the far field simply continues, so extend the last column out to the limit
    // at its own (unthickened) dimensions rather than leaving a gap of bare mantle.
    const lastTop = top[top.length - 1];
    const lastBase = base[base.length - 1];
    const lastLithosphere = lithosphere[lithosphere.length - 1];
    if (lastTop && lastBase && lastLithosphere) {
      const edgeM = sign * PLATE_X_LIMIT_M;
      top.push(new Vector2(edgeM, lastTop.y));
      base.push(new Vector2(edgeM, lastBase.y));
      lithosphere.push(new Vector2(edgeM, lastLithosphere.y));
    }

    return { crustTop: top, crustBase: base, lithosphereBase: lithosphere };
  };

  return {
    left: side(left, -1),
    right: side(right, 1),
    slab: [],
    slabHalfThicknessM: 0,
    magma: [],
    volcanoes: [],
    ridgeAxisM: null,
    newCrustHalfWidthM: 0,
    hasNewCrust: false,
  };
}

/** Two plates sitting at rest, before a motion has been chosen. */
export function restingGeometry(left: PlateType, right: PlateType): BoundaryGeometry {
  return {
    left: flatOutline(left, -PLATE_X_LIMIT_M, 0),
    right: flatOutline(right, 0, PLATE_X_LIMIT_M),
    slab: [],
    slabHalfThicknessM: 0,
    magma: [],
    volcanoes: [],
    ridgeAxisM: null,
    newCrustHalfWidthM: 0,
    hasNewCrust: false,
  };
}

/**
 * The boundary at time `tMyr`.
 *
 * Returns the resting geometry for an illegal pairing rather than throwing: the view
 * asks for a shape every frame, and a boundary that cannot exist should look like two
 * plates sitting there, not like a crash.
 */
export function boundaryGeometry(
  motion: MotionType,
  left: PlateType,
  right: PlateType,
  tMyr: number,
): BoundaryGeometry {
  const behavior = behaviorFor(motion, left, right);
  if (behavior === null || tMyr <= 0) {
    return restingGeometry(left, right);
  }
  if (behavior === "rifting") {
    return riftingGeometry(left, right, tMyr);
  }
  if (behavior === "collision") {
    return collisionGeometry(left, right, tMyr);
  }
  const down = subductingSide(motion, left, right);
  return down === null ? restingGeometry(left, right) : subductionGeometry(left, right, down, tMyr);
}
