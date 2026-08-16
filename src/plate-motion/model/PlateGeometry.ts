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
  ARC_X_DECAY_M,
  ARC_X_OFFSET_M,
  ARC_Z_PERIOD_FACTOR_M,
  COLLISION_ELEVATION_RANGE_M,
  MAGMA_FILL_END_OLD_MYR,
  MAGMA_FILL_END_YOUNG_MYR,
  MAGMA_FILL_OCEANIC_SPEEDUP,
  MAGMA_FILL_START_OLD_MYR,
  MAGMA_FILL_START_YOUNG_MYR,
  MELT_TOP_DEPTH_M,
  NEW_CRUST_LABEL_DELAY_MYR,
  PLATE_SPEED_M_PER_MYR,
  PLATE_X_LIMIT_M,
  RIDGE_TOP_M,
} from "../../PlateTectonicsConstants.js";
import { behaviorFor, type MotionType, subductingSide } from "./BoundaryRules.js";
import { crustThickness, lithosphereBaseM, type PlateType, plateProperties } from "./PlateType.js";
import { SlabCurve, slabHinge } from "./SlabCurve.js";

/**
 * One plate, as three polylines across it.
 *
 * The invariant every producer here has to keep is that all three run in the *same*
 * direction along x. The painter closes a band by walking one polyline forward and the
 * other back, so two that disagree produce a self-crossing bowtie rather than a plate.
 * Which direction that is does not matter, and it differs between behaviours.
 */
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

/**
 * A blob of melt on its way up off the slab.
 *
 * PhET released these from a Poisson process. Here each is a fixed phase of the clock, for
 * the reason the whole screen is built that way: nothing may accumulate, or Rewind and
 * step-while-paused stop being exact. Blobs at fixed phases repeat instead of being
 * individually random, which at this size is not a difference anyone can see.
 */
export type MagmaBlob = {
  readonly xM: number;
  readonly elevationM: number;
  readonly radiusM: number;

  /** 1 where the blob was made, falling to 0 as it is absorbed into the chamber. */
  readonly opacity: number;
};

/**
 * One cone of the volcanic arc, placed across the block as well as along the section.
 *
 * `zM` is 0 at the cut face and negative into the block. A real arc is a line of cones,
 * and putting them at different z is the only way a cross-section-plus-extrusion can say
 * so — which is what {@link arcCones} and {@link arcRiseM} exist for.
 */
export type ArcCone = {
  readonly xM: number;
  readonly zM: number;
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

  /**
   * Outline of the chamber the melt has collected in, or empty when there is none.
   *
   * The chamber appears as soon as the slab reaches the dehydration window and grows as it
   * fills; the conduit is a separate shape that only exists once it is full.
   */
  readonly magma: readonly Vector2[];

  /** The column from the full chamber to the surface, or empty until the chamber is full. */
  readonly magmaConduit: readonly Vector2[];

  /** Melt rising off the slab towards the chamber. */
  readonly magmaBlobs: readonly MagmaBlob[];

  /**
   * How full the chamber is, 0 to 1. Nothing erupts below 1.
   *
   * Exposed rather than kept private because it is the screen's answer to "why is nothing
   * happening yet", and the view has to be able to say so.
   */
  readonly chamberFullness: number;

  /**
   * Volcanoes built on the overriding plate, on the cut face.
   *
   * The arc is a chain across the block; these are the cones the *section* passes through.
   * {@link arcCones} gives the rest.
   */
  readonly volcanoes: readonly Volcano[];

  /**
   * Which way the slab is going, as a sign on x, or 0 when nothing is subducting.
   *
   * The arc's cones step sideways in a pattern that is mirrored with the subduction, so
   * the chain leans the same way relative to the trench whichever side goes down.
   */
  readonly downSign: number;

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

/**
 * Fraction of a collision's thickening that goes down as a root rather than up. Set by
 * Airy isostasy for continental crust on the mantle — ρc/ρm = 2750/3300 = 5/6 — which is
 * why a mountain range has a root about five times deeper than it is high.
 */
const COLLISION_ROOT_SHARE = 5 / 6;

/**
 * Elevation of a polyline at a given x, by linear interpolation; clamped outside it.
 *
 * A plate's three polylines are each a function of x, but they run in whichever direction
 * the behaviour that produced them happened to walk — see {@link PlateOutline} — so the
 * ends are found by value rather than by index. Everything that has to read a layer
 * boundary as a depth goes through this: the block's end walls, and every label pinned to
 * one.
 */
export function elevationAtX(profile: readonly Vector2[], xM: number): number {
  if (profile.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  let low = profile[0];
  let high = profile[0];
  for (const point of profile) {
    if (!low || point.x < low.x) {
      low = point;
    }
    if (!high || point.x > high.x) {
      high = point;
    }
  }
  if (!(low && high)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (xM <= low.x) {
    return low.y;
  }
  if (xM >= high.x) {
    return high.y;
  }

  // The bracketing pair, found by value for the same reason. Interpolated rather than
  // snapped to the nearer sample: a collision samples the crust base forty times across
  // 700 km, so a nearest-sample read is out by up to 9 km of x, which on a thickening
  // root is hundreds of metres of depth.
  let before = low;
  let after = high;
  for (const point of profile) {
    if (point.x <= xM && point.x >= before.x) {
      before = point;
    }
    if (point.x >= xM && point.x <= after.x) {
      after = point;
    }
  }
  const span = after.x - before.x;
  return span === 0 ? before.y : before.y + ((after.y - before.y) * (xM - before.x)) / span;
}

// ── The magma chamber and the arc ─────────────────────────────────────────────

/** Half-width and height of a completely full magma chamber, m. */
const CHAMBER_MAX_HALF_WIDTH_M = 26000;
const CHAMBER_MAX_HEIGHT_M = 14000;

/** How big an empty chamber is drawn, as a fraction of a full one. */
const CHAMBER_MIN_SIZE = 0.25;

/** Half-widths of the conduit where it leaves the chamber and where it reaches the summit, m. */
const CONDUIT_BASE_HALF_WIDTH_M = 6000;
const CONDUIT_TOP_HALF_WIDTH_M = 1500;

/** Tallest an arc volcano grows, m, and how fast it gets there. */
const ARC_MAX_HEIGHT_M = 4000;
const ARC_GROWTH_M_PER_MYR = 320;

/** How many blobs are on their way up off the slab at once, and their size. */
const BLOB_COUNT = 4;
const BLOB_RADIUS_M = 3500;

/** How long one blob takes to travel from the melt source to the chamber, Myr. */
const BLOB_PERIOD_MYR = 2.4;

/** Points a chamber outline is drawn with. Enough that it reads as a blob, not a polygon. */
const ELLIPSE_POINTS = 16;

/** When the chamber under the arc starts and finishes filling, Myr. */
function chamberWindow(down: PlateType, over: PlateType): { startMyr: number; endMyr: number } {
  const young = down === "youngOceanic";
  const startMyr = young ? MAGMA_FILL_START_YOUNG_MYR : MAGMA_FILL_START_OLD_MYR;
  const fullMyr = young ? MAGMA_FILL_END_YOUNG_MYR : MAGMA_FILL_END_OLD_MYR;

  // Under thin oceanic crust the melt has far less to get through, so the same chamber
  // fills in a fifth of the time. PhET's factor, applied to the *span* rather than to the
  // start: the melt does not arrive any sooner, it just accumulates faster once it does.
  const spanMyr = (fullMyr - startMyr) / (plateProperties(over).isOceanic ? MAGMA_FILL_OCEANIC_SPEEDUP : 1);
  return { startMyr, endMyr: startMyr + spanMyr };
}

/** When the chamber under this pairing's arc is full, Myr. */
export function chamberFullAtMyr(down: PlateType, over: PlateType): number {
  return chamberWindow(down, over).endMyr;
}

/**
 * How full the chamber under the arc is at `tMyr`, 0 to 1.
 *
 * The screen's answer to "why is there a slab but no volcano yet". Nothing erupts below 1.
 */
export function chamberFullness(down: PlateType, over: PlateType, tMyr: number): number {
  const { startMyr, endMyr } = chamberWindow(down, over);
  if (tMyr <= startMyr) {
    return 0;
  }
  if (tMyr >= endMyr) {
    return 1;
  }
  return (tMyr - startMyr) / (endMyr - startMyr);
}

/** An ellipse as a closed polygon, for the chamber and the blobs. */
function ellipse(centreXM: number, centreYM: number, halfWidthM: number, halfHeightM: number): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i < ELLIPSE_POINTS; i++) {
    const angle = (i / ELLIPSE_POINTS) * 2 * Math.PI;
    points.push(new Vector2(centreXM + halfWidthM * Math.cos(angle), centreYM + halfHeightM * Math.sin(angle)));
  }
  return points;
}

/**
 * Blobs of melt between the slab and the chamber.
 *
 * Each is at a fixed phase of the clock, so replaying the same instant gives the same
 * blobs in the same places — the deterministic stand-in for PhET's Poisson arrivals. They
 * fade as they arrive, so the chamber reads as being fed rather than as having a queue of
 * objects bumping into it.
 */
function risingBlobs(xM: number, sourceM: number, chamberBaseM: number, tMyr: number): MagmaBlob[] {
  const blobs: MagmaBlob[] = [];
  const riseM = chamberBaseM - sourceM;
  if (riseM <= 0) {
    return blobs;
  }

  for (let index = 0; index < BLOB_COUNT; index++) {
    const phase = (tMyr / BLOB_PERIOD_MYR + index / BLOB_COUNT) % 1;
    blobs.push({
      xM,
      elevationM: sourceM + phase * riseM,
      radiusM: BLOB_RADIUS_M,
      // Full for most of the climb, fading over the last quarter of it.
      opacity: Math.min(1, (1 - phase) * 4),
    });
  }
  return blobs;
}

/**
 * How far the arc's cone at `zM` is stepped sideways from the melt source, m.
 *
 * PhET's modulo-3 stagger. Neighbouring cones sit at the centre, then one side, then the
 * other, which is what turns a ridge into a chain — a straight row of identical cones
 * reads as an extruded triangle, and a real arc is neither straight nor evenly spaced.
 */
function arcConeOffsetM(zM: number, downSign: number): number {
  const theta = zM / ARC_Z_PERIOD_FACTOR_M;
  // The half turn is where the cones are; the +0.5 puts the switch between bands in the
  // valleys between them rather than on a summit, which is PhET's own comment.
  const band = Math.floor(Math.abs(theta / Math.PI) + 0.5) % 3;
  if (band === 0) {
    return 0;
  }
  return downSign * ARC_X_OFFSET_M * (band === 1 ? 1 : -1);
}

/**
 * How much the volcanic arc raises the ground at a point on the block's top surface, m.
 *
 * Zero everywhere except near the arc, which is deliberate as well as cheap: the two-
 * dimensional model extruded straight back is the right picture for a trench and for a
 * mountain belt, and the arc is the one feature where it is wrong. Restricting the z
 * variation to a window in x is also what keeps this affordable — the block resamples its
 * whole terrain grid every frame while the clock runs.
 */
export function arcRiseM(geometry: BoundaryGeometry, xM: number, zM: number): number {
  const volcano = geometry.volcanoes[0];
  if (!volcano || volcano.heightM <= 0) {
    return 0;
  }
  if (Math.abs(xM - volcano.xM) > ARC_WINDOW_M) {
    return 0;
  }

  // Cubed, as PhET had it, so the cones are separated by real flat ground rather than by
  // a gentle undulation — the gaps are what make it read as a chain of islands.
  const upDown = (Math.cos(zM / ARC_Z_PERIOD_FACTOR_M) + 1) / 2;
  const centreXM = volcano.xM - arcConeOffsetM(zM, geometry.downSign);
  return volcano.heightM * upDown ** 3 * Math.exp(-Math.abs(xM - centreXM) / ARC_X_DECAY_M);
}

/**
 * The summits of the arc's cones between `minZM` and the cut face.
 *
 * Where `arcRiseM` is maximal in z, which is every 2π of its cosine. The view puts a smoke
 * plume on each of them, which is the difference between one erupting volcano and an
 * erupting arc.
 */
export function arcCones(geometry: BoundaryGeometry, minZM: number): ArcCone[] {
  const volcano = geometry.volcanoes[0];
  if (!volcano || volcano.heightM <= 0) {
    return [];
  }

  const periodM = 2 * Math.PI * ARC_Z_PERIOD_FACTOR_M;
  const cones: ArcCone[] = [];
  for (let index = 0; ; index++) {
    const zM = -index * periodM;
    if (zM < minZM) {
      break;
    }
    cones.push({
      xM: volcano.xM - arcConeOffsetM(zM, geometry.downSign),
      zM,
      baseM: volcano.baseM,
      heightM: volcano.heightM,
    });
  }
  return cones;
}

/** How far either side of the arc the ground is allowed to vary with z, m. */
const ARC_WINDOW_M = 6 * ARC_X_DECAY_M;

/** Samples across the arc's cross-section, and how wide that section reaches. */
const ARC_SECTION_SAMPLES = 24;
export const ARC_SECTION_HALF_WIDTH_M = 3 * ARC_X_DECAY_M;

/**
 * The shape of a cut through an arc volcano, in its own units.
 *
 * `u` runs −1 to 1 across the cone and `h` is 0 at its foot and 1 at its summit, so both
 * views can draw the same cone in the proportions each of them is honest about.
 *
 * They need different proportions, and this is why the shape is shared rather than the
 * geometry. On the block, x and elevation are the same scale (up to the exaggeration
 * slider), so the cone is drawn in true metres — and it has to be, because the same
 * profile is what the terrain grid is built from and any disagreement shows as a sliver of
 * sky along the cone's flanks. The flat section magnifies its shallow band about thirty
 * times against x, so a cone drawn there in true metres is a needle; it scales the same
 * shape to a legible width in pixels instead, exactly as it does for nothing else, because
 * nothing else on that view is this steep.
 *
 * The falloff is `exp(−3|u|)`, which is {@link arcRiseM}'s own decay over
 * {@link ARC_SECTION_HALF_WIDTH_M} — so on the block the two agree exactly.
 */
export function arcSectionShape(): { readonly u: number; readonly h: number }[] {
  const decayPerHalfWidth = ARC_SECTION_HALF_WIDTH_M / ARC_X_DECAY_M;
  const points: { u: number; h: number }[] = [];
  for (let i = 0; i <= ARC_SECTION_SAMPLES; i++) {
    const u = -1 + (2 * i) / ARC_SECTION_SAMPLES;
    points.push({ u, h: Math.exp(-decayPerHalfWidth * Math.abs(u)) });
  }
  return points;
}

/**
 * The arc's cross-section on the block's cut face, as a closed polygon on its base.
 *
 * In true model metres, which is what the block wants: the cone drawn on the section is
 * then exactly the cut through the cone standing on the terrain beside it.
 */
export function arcSectionProfile(volcano: {
  readonly xM: number;
  readonly baseM: number;
  readonly heightM: number;
}): Vector2[] {
  const points = arcSectionShape().map(
    ({ u, h }) => new Vector2(volcano.xM + u * ARC_SECTION_HALF_WIDTH_M, volcano.baseM + h * volcano.heightM),
  );
  points.push(new Vector2(volcano.xM + ARC_SECTION_HALF_WIDTH_M, volcano.baseM));
  points.push(new Vector2(volcano.xM - ARC_SECTION_HALF_WIDTH_M, volcano.baseM));
  return points;
}

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
    magmaConduit: [],
    magmaBlobs: [],
    chamberFullness: 0,
    volcanoes: [],
    downSign: 0,
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

  // SlabCurve is written descending to the right of the hinge. A subducting slab does
  // not descend under its own plate — it passes the hinge and carries on down beneath
  // the overriding one — so it is mirrored to the side opposite the subducting plate.
  const overSign = -downSign;
  const mirror = (point: Vector2): Vector2 => new Vector2(overSign * point.x, point.y);
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
    // All three polylines run boundary → outer edge. The painter closes a band by walking
    // the top forward and the base back, so a polyline that ran the other way would fold
    // the band into a bowtie rather than reversing it harmlessly.
    return {
      crustTop: top,
      crustBase: [new Vector2(0, crustBaseM), new Vector2(outerM, crustBaseM)],
      lithosphereBase: [new Vector2(0, lithosphereBaseM(downType)), new Vector2(outerM, lithosphereBaseM(downType))],
    };
  })();

  // ── The volcanic arc ──────────────────────────────────────────────────────
  // Melt is generated where the slab passes through the dehydration window, and rises
  // vertically. Its horizontal offset from the trench is therefore set by how far the
  // slab has moved sideways by the time it is that deep — which is why arcs sit a
  // characteristic distance inland and not at the trench itself.
  //
  // What happens then is a sequence, not an event. Melt rises off the slab as blobs,
  // pools at the base of the overriding crust, and only once enough has collected does a
  // conduit open and a volcano start to grow. The waiting is the claim: an arc lags its
  // trench by millions of years.
  const meltTopS = curve.lengthAtDepth(MELT_TOP_DEPTH_M);
  const reachedMelt = meltTopS !== null && travelledM > meltTopS;

  let magma: Vector2[] = [];
  let magmaConduit: Vector2[] = [];
  let magmaBlobs: MagmaBlob[] = [];
  let volcanoes: Volcano[] = [];
  const fullness = chamberFullness(downType, overType, tMyr);

  if (reachedMelt && meltTopS !== null) {
    const sourceM = mirror(curve.positionAt(meltTopS));
    const arcXM = sourceM.x;
    const overTopM = plateProperties(overType).crustTopM;
    const overBaseM = plateProperties(overType).crustBaseM;

    // The chamber sits at the base of the overriding crust, which is where rising melt
    // stops: it is buoyant relative to the mantle it came from but not relative to the
    // crust above, so it ponds at the interface. It widens as it fills.
    const chamberHalfWidthM = CHAMBER_MAX_HALF_WIDTH_M * (CHAMBER_MIN_SIZE + (1 - CHAMBER_MIN_SIZE) * fullness);
    const chamberHeightM = CHAMBER_MAX_HEIGHT_M * (CHAMBER_MIN_SIZE + (1 - CHAMBER_MIN_SIZE) * fullness);
    magma = ellipse(arcXM, overBaseM - chamberHeightM / 2, chamberHalfWidthM, chamberHeightM / 2);

    // Blobs on their way from the slab to the chamber, at fixed phases of the clock.
    magmaBlobs = risingBlobs(arcXM, sourceM.y, overBaseM - chamberHeightM, tMyr);

    if (fullness >= 1) {
      // The conduit opens, and the volcano grows from the moment it does. Height is a
      // function of how long it has been erupting, not of how far the melt has risen —
      // the rising is over.
      const eruptingMyr = tMyr - chamberFullAtMyr(downType, overType);
      const heightM = Math.min(ARC_MAX_HEIGHT_M, eruptingMyr * ARC_GROWTH_M_PER_MYR);
      volcanoes = [{ xM: arcXM, baseM: overTopM, heightM }];

      // Tapering upwards, and tracking the summit rather than stopping at the ground: the
      // conduit is what feeds the cone, and one that stopped at the old ground level would
      // leave the cone sitting on nothing as it grew.
      const summitM = overTopM + heightM;
      magmaConduit = [
        new Vector2(arcXM - CONDUIT_TOP_HALF_WIDTH_M, summitM),
        new Vector2(arcXM + CONDUIT_TOP_HALF_WIDTH_M, summitM),
        new Vector2(arcXM + CONDUIT_BASE_HALF_WIDTH_M, overBaseM - chamberHeightM / 2),
        new Vector2(arcXM - CONDUIT_BASE_HALF_WIDTH_M, overBaseM - chamberHeightM / 2),
      ];
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
    magmaConduit,
    magmaBlobs,
    chamberFullness: fullness,
    volcanoes,
    downSign,
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
    magmaConduit: [],
    magmaBlobs: [],
    chamberFullness: 0,
    volcanoes: [],
    downSign: 0,
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
    magmaConduit: [],
    magmaBlobs: [],
    chamberFullness: 0,
    volcanoes: [],
    downSign: 0,
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
