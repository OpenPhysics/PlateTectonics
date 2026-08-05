#!/usr/bin/env tsx
/**
 * scripts/build-data.ts
 *
 * Builds every geophysical dataset the simulation renders, from public sources,
 * into `src/common/data/generated/`. Run it with:
 *
 *   npm run build-data
 *
 * Downloads are cached under `.cache/data/` (git-ignored); delete that directory
 * to refresh from the servers. The generated modules are committed, so a normal
 * `npm run build` never touches the network.
 *
 * Sources
 * ───────
 *  - PB2002 plate model — Bird (2003), doi:10.1029/2001GC000252. Outlines and
 *    boundary steps via github.com/fraxen/tectonicplates (ODC-BY 1.0); Euler poles
 *    from the author's own distribution at peterbird.name.
 *  - Natural Earth 1:110m land polygons (public domain).
 *  - USGS ANSS ComCat earthquake catalogue (public domain).
 *  - NOAA NCEI Holocene volcano list (public domain).
 *  - NOAA NCEI global elevation/bathymetry DEM mosaic (public domain).
 */

import { fetchElevationGrid, sampleElevation } from "./data/dem.js";
import { numberArray, round, wrap, writeGeneratedModule } from "./data/emit.js";
import { fetchJson, fetchText } from "./data/fetchCache.js";
import {
  cross,
  dot,
  greatCircleDistanceKm,
  type LonLat,
  Profile,
  pointInRing,
  ringBounds,
  ringCentroid,
  signedArea,
  simplify,
  toLonLat,
  toUnitVector,
} from "./data/geo.js";

const GENERATED_DIR = "src/common/data/generated";

// ── Source URLs ───────────────────────────────────────────────────────────────

const TECTONIC_PLATES_BASE = "https://raw.githubusercontent.com/fraxen/tectonicplates/master";
const PLATES_URL = `${TECTONIC_PLATES_BASE}/GeoJSON/PB2002_plates.json`;
const STEPS_URL = `${TECTONIC_PLATES_BASE}/GeoJSON/PB2002_steps.json`;
const POLES_URL = "http://peterbird.name/oldFTP/PB2002/PB2002_poles.dat.txt";
const LAND_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";
const USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const VOLCANO_QUERY = "https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/volcanolocs";

// ── Tuning ────────────────────────────────────────────────────────────────────

/** Douglas–Peucker tolerances, in degrees. */
const LAND_TOLERANCE = 0.35;
const PLATE_TOLERANCE = 0.4;
const BOUNDARY_TOLERANCE = 0.25;

/** Plates below this area (square degrees) are drawn but never labelled. */
const MAJOR_PLATE_AREA = 250;

/**
 * How far {@link BoundaryMotionField} looks for boundary steps, and the distance floor
 * in its weighting. The reach sets how far from a junction the blend has settled onto
 * a single boundary's motion; the floor — about a tenth of a degree, the spacing of
 * the steps themselves — keeps a step lying under the query point from taking all the
 * weight, which would make the field discontinuous again.
 */
const BOUNDARY_BLEND_DEGREES = 4;
const BOUNDARY_BLEND_FLOOR = 0.01;

/**
 * Longest edge, in degrees, left in a plate outline. Simplification leaves edges tens
 * of degrees long — the Pacific plate's eastern edge is one straight run up the
 * antimeridian — and an edge only deforms at its ends, so a long one is drawn as a
 * chord across whatever its two ends do. Splitting them up lets an outline follow the
 * motion field along its length instead of cutting the corner.
 */
const PLATE_OUTLINE_STEP_DEGREES = 5;

/**
 * How much an outline edge may stretch, in km, over the reconstruction's range before
 * it is split again.
 *
 * The motion field is continuous, so halving an edge brings its two ends closer
 * together in motion as well as in space, and this converges. It is what stops an
 * outline drawing a straight line across an ocean where one boundary hands over to the
 * next — worst around the south-west Pacific microplates, which are only degrees wide
 * and turn several degrees per million years.
 */
const MAX_OUTLINE_STRETCH_KM = 200;

/**
 * Limits on that refinement, so it terminates whatever the field does. The step floor
 * is well inside the distance floor of the blend, below which the field is smooth, and
 * the depth is only a backstop — an outline edge tens of degrees long has to be halved
 * a dozen times to reach it.
 */
const MAX_OUTLINE_SUBDIVISIONS = 14;
const MIN_OUTLINE_STEP_DEGREES = 0.02;

/** How far the reconstruction is ever run, which is what the refinement is judged over. */
const RECONSTRUCTION_RANGE_MYR = 50;

const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * Label anchors that read better than the computed centroid: a plate's centroid
 * can land in an ocean far from the landmass students associate with the plate.
 */
const LABEL_OVERRIDES: Record<string, LonLat> = {
  AF: [20, 4],
  NA: [-100, 46],
  SA: [-58, -12],
  EU: [82, 55],
};

/** Global earthquake catalogue extent. */
const GLOBAL_QUAKE_START = "1990-01-01";
const GLOBAL_QUAKE_MIN_MAGNITUDE = 5.8;

/** Relief raster size (equirectangular, whole globe). */
const RELIEF_WIDTH = 1440;
const RELIEF_HEIGHT = 720;

/**
 * Rotation of the Pacific plate in the no-net-rotation frame (NNR-NUVEL-1A;
 * Argus & Gordon, 1991). PB2002's Euler poles are given relative to the Pacific
 * plate, so adding this vector converts them to absolute plate motions.
 */
const PACIFIC_NNR_POLE = { lat: -63.045, lon: 107.374, rate: 0.6408 };

// ── GeoJSON shapes (as published; property names are the source's own) ─────────

interface GeoJsonFeature<P> {
  readonly properties: P;
  readonly geometry: {
    readonly type: string;
    readonly coordinates: number[][][] | number[][][][] | number[][];
  };
}

interface GeoJsonCollection<P> {
  readonly features: readonly GeoJsonFeature<P>[];
}

// biome-ignore-start lint/style/useNamingConvention: property names come from the published GeoJSON
type PlateProperties = { readonly Code: string; readonly PlateName: string };
type StepProperties = {
  readonly SEQNUM: number;
  readonly PLATEBOUND: string;
  readonly STEPCLASS: string;
  readonly VELOCITYLE: number;
};
// biome-ignore-end lint/style/useNamingConvention: end of published-GeoJSON property names

/** Returns every ring of a Polygon / MultiPolygon / LineString feature. */
function featureRings<P>(feature: GeoJsonFeature<P>): LonLat[][] {
  const { type, coordinates } = feature.geometry;
  if (type === "LineString") {
    return [coordinates as unknown as LonLat[]];
  }
  if (type === "Polygon") {
    return coordinates as unknown as LonLat[][];
  }
  if (type === "MultiPolygon") {
    return (coordinates as number[][][][]).flat() as unknown as LonLat[][];
  }
  if (type === "MultiLineString") {
    return coordinates as unknown as LonLat[][];
  }
  throw new Error(`Unsupported geometry type ${type}`);
}

// ── Plates ────────────────────────────────────────────────────────────────────

interface PlateBuild {
  code: string;
  name: string;
  major: boolean;
  rings: LonLat[][];
  /** Motion frame index per ring vertex; filled in once the boundaries are known. */
  ringFrames: number[][];
  bounds: [number, number, number, number][];
  labelLon: number;
  labelLat: number;
  poleLat: number;
  poleLon: number;
  poleRate: number;
}

/** An Euler pole plus a rate about it, in degrees and degrees per million years. */
interface Rotation {
  lat: number;
  lon: number;
  rate: number;
}

/**
 * Adds two rotation vectors (each given as an Euler pole plus a rate in °/Myr)
 * and returns the resulting pole.
 */
function addRotationVectors(
  a: { lat: number; lon: number; rate: number },
  b: { lat: number; lon: number; rate: number },
): { lat: number; lon: number; rate: number } {
  const va = toUnitVector(a.lon, a.lat).map((component) => component * a.rate) as [number, number, number];
  const vb = toUnitVector(b.lon, b.lat).map((component) => component * b.rate) as [number, number, number];
  const sum: [number, number, number] = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
  const rate = Math.hypot(...sum);
  if (rate === 0) {
    return { lat: 0, lon: 0, rate: 0 };
  }
  const [lon, lat] = toLonLat(sum);
  return { lat, lon, rate };
}

/** Parses `PB2002_poles.dat`: plate code, pole latitude, pole longitude, °/Myr. */
function parsePoles(text: string): Map<string, { lat: number; lon: number; rate: number }> {
  const poles = new Map<string, { lat: number; lon: number; rate: number }>();
  for (const line of text.split("\n")) {
    const match = /^([A-Z]{2})\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(\d+\.\d+)/.exec(line);
    if (match) {
      const [, code, lat, lon, rate] = match;
      poles.set(code as string, { lat: Number(lat), lon: Number(lon), rate: Number(rate) });
    }
  }
  return poles;
}

async function buildPlates(): Promise<PlateBuild[]> {
  const collection = await fetchJson<GeoJsonCollection<PlateProperties>>(PLATES_URL, "PB2002_plates.json");
  const polesRelativeToPacific = parsePoles(await fetchText(POLES_URL, "PB2002_poles.txt"));

  const byCode = new Map<string, PlateBuild>();
  for (const feature of collection.features) {
    const code = feature.properties.Code;
    const relative = polesRelativeToPacific.get(code);
    if (!relative) {
      throw new Error(`No Euler pole for plate ${code}`);
    }
    const absolute = addRotationVectors(relative, PACIFIC_NNR_POLE);

    const existing = byCode.get(code);
    const plate: PlateBuild = existing ?? {
      code,
      name: feature.properties.PlateName,
      major: false,
      rings: [],
      ringFrames: [],
      bounds: [],
      labelLon: 0,
      labelLat: 0,
      poleLat: absolute.lat,
      poleLon: absolute.lon,
      poleRate: absolute.rate,
    };

    for (const ring of featureRings(feature)) {
      const simplified = simplify(ring, PLATE_TOLERANCE);
      if (simplified.length >= 4) {
        plate.rings.push(simplified);
      }
    }
    byCode.set(code, plate);
  }

  const plates = [...byCode.values()];
  for (const plate of plates) {
    plate.bounds = plate.rings.map(ringBounds);

    // Label the plate at the centroid of its largest ring, nudged to a point that
    // is actually inside the outline (centroids of C-shaped plates fall outside).
    const largest = plate.rings.reduce((best, ring) =>
      Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best,
    );
    const area = Math.abs(signedArea(largest));
    plate.major = area >= MAJOR_PLATE_AREA;

    const centroid = ringCentroid(largest);
    const anchor =
      LABEL_OVERRIDES[plate.code] ??
      (pointInRing(centroid[0], centroid[1], largest) ? centroid : interiorPoint(largest, centroid));
    plate.labelLon = round(anchor[0], 2);
    plate.labelLat = round(anchor[1], 2);
  }

  plates.sort((a, b) => a.code.localeCompare(b.code));
  return plates;
}

/** Finds a point inside `ring`, searching outwards from `near`. */
function interiorPoint(ring: readonly LonLat[], near: LonLat): LonLat {
  const [minLon, minLat, maxLon, maxLat] = ringBounds(ring);
  let best: LonLat = near;
  let bestDistance = Number.POSITIVE_INFINITY;
  const steps = 40;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const lon = minLon + ((maxLon - minLon) * i) / steps;
      const lat = minLat + ((maxLat - minLat) * j) / steps;
      if (pointInRing(lon, lat, ring)) {
        const distance = Math.hypot(lon - near[0], lat - near[1]);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = [lon, lat];
        }
      }
    }
  }
  return best;
}

/** Index of the plate containing a point, or the nearest plate when none contains it. */
function plateIndexAt(plates: readonly PlateBuild[], lon: number, lat: number): number {
  for (let p = 0; p < plates.length; p++) {
    const plate = plates[p] as PlateBuild;
    for (let r = 0; r < plate.rings.length; r++) {
      const [minLon, minLat, maxLon, maxLat] = plate.bounds[r] as [number, number, number, number];
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
        continue;
      }
      if (pointInRing(lon, lat, plate.rings[r] as LonLat[])) {
        return p;
      }
    }
  }

  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let p = 0; p < plates.length; p++) {
    for (const ring of (plates[p] as PlateBuild).rings) {
      for (const [ringLon, ringLat] of ring) {
        const distance = Math.hypot(ringLon - lon, ringLat - lat);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = p;
        }
      }
    }
  }
  return nearest;
}

function emitPlates(plates: readonly PlateBuild[]): void {
  const entries = plates.map((plate) => {
    const rings = plate.rings
      .map((ring) => numberArray(ring.flatMap(([lon, lat]) => [round(lon, 2), round(lat, 2)])))
      .join(",");
    const ringFrames = plate.ringFrames.map((frames) => numberArray(frames)).join(",");
    return [
      "  {",
      `    code: ${JSON.stringify(plate.code)},`,
      `    name: ${JSON.stringify(plate.name)},`,
      `    major: ${plate.major},`,
      `    labelLon: ${plate.labelLon},`,
      `    labelLat: ${plate.labelLat},`,
      `    poleLat: ${round(plate.poleLat, 3)},`,
      `    poleLon: ${round(plate.poleLon, 3)},`,
      `    poleRateDegPerMyr: ${round(plate.poleRate, 4)},`,
      `    rings: [\n${wrap(rings, "      ")}\n    ],`,
      `    ringFrames: [\n${wrap(ringFrames, "      ")}\n    ],`,
      "  },",
    ].join("\n");
  });

  writeGeneratedModule(
    `${GENERATED_DIR}/plateData.ts`,
    `The ${plates.length} tectonic plates of the PB2002 model: simplified outlines,
label anchors, and absolute (no-net-rotation) Euler poles obtained by adding the
NNR-NUVEL-1A Pacific rotation to PB2002's Pacific-relative poles.

\`ringFrames\` gives the motion frame of each outline vertex — the boundary under it
rather than the plate inside it, so neighbouring plates keep a shared edge when the
reconstruction runs. See MOTION_FRAMES in PlateReconstruction.ts.`,
    `import type { PlateRecord } from "../dataTypes.js";\n\nexport const PLATES: readonly PlateRecord[] = [\n${entries.join("\n")}\n];\n`,
  );
}

// ── Coastlines ────────────────────────────────────────────────────────────────

async function buildLand(plates: readonly PlateBuild[]): Promise<void> {
  const collection = await fetchJson<GeoJsonCollection<Record<string, unknown>>>(LAND_URL, "ne_110m_land.geojson");

  const rings: { coords: number[]; plateIndices: number[] }[] = [];
  for (const feature of collection.features) {
    for (const ring of featureRings(feature)) {
      const simplified = simplify(ring, LAND_TOLERANCE);
      if (simplified.length < 5 || Math.abs(signedArea(simplified)) < 1.5) {
        continue;
      }
      rings.push({
        coords: simplified.flatMap(([lon, lat]) => [round(lon, 2), round(lat, 2)]),
        plateIndices: simplified.map(([lon, lat]) => plateIndexAt(plates, lon, lat)),
      });
    }
  }

  const entries = rings.map(
    (ring) => `  { coords: ${numberArray(ring.coords)},\n    plateIndices: ${numberArray(ring.plateIndices)} },`,
  );
  writeGeneratedModule(
    `${GENERATED_DIR}/landData.ts`,
    `Simplified Natural Earth 1:110m coastlines. Every vertex carries the index of the
plate that carries it, so coastlines deform correctly when plate motion is run
forwards or backwards in time.`,
    `import type { LandRing } from "../dataTypes.js";\n\nexport const LAND_RINGS: readonly LandRing[] = [\n${entries.join("\n")}\n];\n`,
  );
}

// ── Plate boundaries ──────────────────────────────────────────────────────────

type BoundaryType = "divergent" | "convergent" | "transform";

/** PB2002 step classes → the three boundary kinds taught in an introductory course. */
const STEP_CLASS_TO_TYPE: Record<string, BoundaryType> = {
  // Oceanic spreading ridge, continental rift boundary.
  OSR: "divergent",
  CRB: "divergent",
  // Oceanic transform fault, continental transform fault.
  OTF: "transform",
  CTF: "transform",
  // Subduction zone, oceanic convergent boundary, continental convergent boundary.
  SUB: "convergent",
  OCB: "convergent",
  CCB: "convergent",
};

// ── Motion frames ─────────────────────────────────────────────────────────────

/**
 * What each feature rides when the reconstruction clock runs.
 *
 * A plate's interior rides the plate: one rigid rotation about its Euler pole. A plate
 * *boundary* cannot, because it belongs to two plates at once — carry it with either
 * one and it ploughs into the other, which is exactly where the gaps and overlaps in a
 * naive rigid reconstruction come from. So every boundary gets a rotation of its own:
 *
 *  - **Ridge or transform** — the mean of the two plates' rotation vectors. The
 *    velocity that gives is the average of the two plate velocities at every point,
 *    which is where a spreading axis sits when accretion is symmetric, and is
 *    stationary with respect to a fault the two plates merely slide along.
 *  - **Subduction zone** — the overriding plate. A trench is a feature of the plate
 *    that stays; the descending plate is the one being consumed at it.
 *
 * Both plates' outlines then use the *same* rotation along the boundary they share, so
 * the mosaic stays a mosaic: what changes through time is each plate's area, growing
 * along its ridges and shrinking at its trenches. That is the point of the picture.
 */
class MotionFrames {
  /** Rotations that are not simply a plate's, in the order they were first needed. */
  private readonly derived: Rotation[] = [];

  /** Frame index already assigned to a pair of plates, keyed by the sorted pair. */
  private readonly byPlatePair = new Map<string, number>();

  /** Frame index already assigned to a rotation, keyed by its rounded numbers. */
  private readonly byRotation = new Map<string, number>();

  private readonly plates: readonly PlateBuild[];

  public constructor(plates: readonly PlateBuild[]) {
    this.plates = plates;
  }

  /** The derived rotations, which the runtime appends to the plates' own. */
  public get derivedFrames(): readonly Rotation[] {
    return this.derived;
  }

  /** The rotation a frame index stands for, whether it is a plate's or derived. */
  public rotationOf(frameIndex: number): Rotation {
    return frameIndex < this.plates.length
      ? plateRotation(this.plates[frameIndex] as PlateBuild)
      : (this.derived[frameIndex - this.plates.length] as Rotation);
  }

  /**
   * Frame index for an arbitrary rotation — what the blended field returns along a
   * plate outline. Rotations that round to the same numbers share an entry, which
   * collapses the long stretches of outline where the blend has settled onto one
   * boundary's motion.
   */
  public intern(rotation: Rotation): number {
    const rounded: Rotation = {
      lat: round(rotation.lat, 3),
      lon: round(rotation.lon, 3),
      rate: round(rotation.rate, 4),
    };
    const key = `${rounded.lat}:${rounded.lon}:${rounded.rate}`;
    const existing = this.byRotation.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const index = this.plates.length + this.derived.length;
    this.derived.push(rounded);
    this.byRotation.set(key, index);
    return index;
  }

  /**
   * Frame index for a PB2002 boundary of the given class. Indices below
   * `plates.length` are plates; the rest index {@link derivedFrames}.
   */
  public forBoundary(boundaryName: string, type: BoundaryType): number {
    const parsed = parseBoundaryName(boundaryName);
    if (!parsed) {
      throw new Error(`Unrecognised PB2002 boundary name ${boundaryName}`);
    }
    const left = this.plates.findIndex((plate) => plate.code === parsed.left);
    const right = this.plates.findIndex((plate) => plate.code === parsed.right);
    if (left === -1 || right === -1) {
      throw new Error(`Boundary ${boundaryName} names a plate that is not in the model`);
    }

    // A trench rides whichever plate is not going down it.
    if (type === "convergent" && parsed.overriding !== null) {
      return parsed.overriding === "left" ? left : right;
    }

    const key = left < right ? `${left}:${right}` : `${right}:${left}`;
    const existing = this.byPlatePair.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const leftPlate = this.plates[left] as PlateBuild;
    const rightPlate = this.plates[right] as PlateBuild;
    const index = this.intern(meanRotationVector(plateRotation(leftPlate), plateRotation(rightPlate)));
    this.byPlatePair.set(key, index);
    return index;
  }
}

/** A plate's absolute rotation, in the shape the vector helpers take. */
function plateRotation(plate: PlateBuild): Rotation {
  return { lat: plate.poleLat, lon: plate.poleLon, rate: plate.poleRate };
}

/**
 * Averages two rotation vectors. Halving the rate of the sum halves the vector, and
 * v = ω × r is linear in ω, so the result moves every point at the mean of the two
 * plates' velocities.
 */
function meanRotationVector(a: Rotation, b: Rotation): Rotation {
  const sum = addRotationVectors(a, b);
  return { lat: sum.lat, lon: sum.lon, rate: sum.rate / 2 };
}

/**
 * Splits a PB2002 boundary name into its two plate codes and its subduction polarity.
 *
 * Bird names each boundary section with the two plate codes and a separator that
 * doubles as a cross-section through it: `-` where neither plate descends, `\` where
 * the left-hand plate descends beneath the right-hand one, and `/` where the
 * right-hand plate descends beneath the left. So `"NZ\\SA"` is Nazca going down under
 * South America, and `"TO/PA"` is the Pacific going down under Tonga — and the
 * separator names the overriding plate wherever there is one.
 */
function parseBoundaryName(name: string): { left: string; right: string; overriding: "left" | "right" | null } | null {
  const match = /^([A-Z]{2})([-\\/])([A-Z]{2})$/.exec(name);
  if (!match) {
    return null;
  }
  const [, left, separator, right] = match as unknown as [string, string, string, string];
  return {
    left,
    right,
    overriding: separator === "\\" ? "right" : separator === "/" ? "left" : null,
  };
}

/**
 * The motion of the boundary network as a *field* over the globe, built from the raw
 * PB2002 step vertices on a 1° grid.
 *
 * Snapping each outline vertex to the single nearest boundary is not enough, because
 * the answer then jumps where one boundary hands over to the next. Neighbouring
 * boundaries genuinely move differently — a trench rides the overriding plate while
 * the transform it grades into rides the mean — so at every junction two consecutive
 * outline vertices would fly apart, and the edge drawn between them would sweep a line
 * across an ocean. Around the south-west Pacific microplates that reached 6 000 km.
 *
 * Instead each point takes an inverse-distance-weighted blend of the boundary motions
 * near it. Close to a boundary the nearest steps dominate and the blend is that
 * boundary's own motion, to a fraction of a percent; approaching a junction it turns
 * smoothly into the next one's. Because the blend is a function of *position alone*,
 * two plates that share an edge get the same answer along it however their outlines
 * were simplified — which is what keeps the mosaic closed.
 *
 * Rotation vectors may be averaged like this because velocity is linear in them:
 * v = ω × r, so a blend of rotations moves a point at the blend of their velocities.
 */
class BoundaryMotionField {
  private readonly cells = new Map<number, { lon: number; lat: number; rotation: Rotation }[]>();

  /** Longitude is wrapped into the key so a lookup at −180° finds steps at +180°. */
  private static cellKey(lon: number, lat: number): number {
    const cellLon = (((Math.floor(lon) % 360) + 360) % 360) + 1;
    return cellLon * 1000 + Math.floor(lat) + 90;
  }

  public add(lon: number, lat: number, rotation: Rotation): void {
    const key = BoundaryMotionField.cellKey(lon, lat);
    const cell = this.cells.get(key);
    if (cell) {
      cell.push({ lon, lat, rotation });
    } else {
      this.cells.set(key, [{ lon, lat, rotation }]);
    }
  }

  /**
   * The blended rotation at a point.
   *
   * `interior` is the motion to fall back on away from every boundary — the plate's
   * own. It joins the blend as though it were one more sample sitting at exactly the
   * cutoff distance, rather than being switched to, because switching would put a
   * discontinuity back into the field: that is what used to tear the Pacific plate
   * open along the seam it is cut at on the antimeridian, out in open ocean where the
   * nearest boundary is thousands of kilometres away. Against a boundary the samples
   * on it outweigh this term by three orders of magnitude, so a shared edge is still
   * shared however the two plates either side of it are labelled.
   */
  public at(lon: number, lat: number, interior: Rotation): Rotation {
    const interiorWeight = 1 / (BOUNDARY_BLEND_DEGREES * BOUNDARY_BLEND_DEGREES + BOUNDARY_BLEND_FLOOR);
    const [ix, iy, iz] = toUnitVector(interior.lon, interior.lat);
    let x = interiorWeight * ix * interior.rate;
    let y = interiorWeight * iy * interior.rate;
    let z = interiorWeight * iz * interior.rate;
    let totalWeight = interiorWeight;
    // Longitudes converge towards the poles, so a degree of longitude is worth less
    // there; the floor keeps the search from exploding at the poles themselves.
    const lonScale = Math.max(0.05, Math.cos(lat * DEGREES_TO_RADIANS));
    const reach = Math.ceil(BOUNDARY_BLEND_DEGREES);

    for (let dLon = -reach; dLon <= reach; dLon++) {
      for (let dLat = -reach; dLat <= reach; dLat++) {
        const cell = this.cells.get(BoundaryMotionField.cellKey(lon + dLon, lat + dLat));
        if (!cell) {
          continue;
        }
        for (const step of cell) {
          const eastward = (((step.lon - lon + 540) % 360) - 180) * lonScale;
          const distance = Math.hypot(eastward, step.lat - lat);
          if (distance > BOUNDARY_BLEND_DEGREES) {
            continue;
          }
          // Shepard weighting, with a floor on the distance so a step lying exactly
          // under the point does not take infinite weight, and a taper that reaches
          // zero at the cutoff so a step passing out of range does not step the
          // answer — the field has to be continuous or the whole point is lost.
          const taper = 1 - (distance * distance) / (BOUNDARY_BLEND_DEGREES * BOUNDARY_BLEND_DEGREES);
          const weight = (taper * taper) / (distance * distance + BOUNDARY_BLEND_FLOOR);
          const [wx, wy, wz] = toUnitVector(step.rotation.lon, step.rotation.lat);
          x += weight * wx * step.rotation.rate;
          y += weight * wy * step.rotation.rate;
          z += weight * wz * step.rotation.rate;
          totalWeight += weight;
        }
      }
    }

    const blended: [number, number, number] = [x / totalWeight, y / totalWeight, z / totalWeight];
    const rate = Math.hypot(...blended);
    if (rate === 0) {
      return { lat: 0, lon: 0, rate: 0 };
    }
    const [poleLon, poleLat] = toLonLat(blended);
    return { lat: poleLat, lon: poleLon, rate };
  }
}

interface BoundarySegmentBuild {
  type: BoundaryType;
  plates: string;
  velocity: number;
  points: LonLat[];
  /** Motion frame the segment rides; see {@link MotionFrames}. */
  frameIndex: number;
}

/**
 * Builds the boundary polylines, and along the way indexes every step vertex by the
 * motion frame its boundary rides, so the plate outlines can be pinned to the same
 * frames afterwards.
 */
async function buildBoundaries(frames: MotionFrames, field: BoundaryMotionField): Promise<BoundarySegmentBuild[]> {
  const collection = await fetchJson<GeoJsonCollection<StepProperties>>(STEPS_URL, "PB2002_steps.json");

  const steps = [...collection.features].sort((a, b) => {
    const byBoundary = a.properties.PLATEBOUND.localeCompare(b.properties.PLATEBOUND);
    return byBoundary === 0 ? a.properties.SEQNUM - b.properties.SEQNUM : byBoundary;
  });

  // Walk the ordered steps, starting a new segment whenever the boundary, the step
  // class, or the geographic continuity breaks.
  const segments: BoundarySegmentBuild[] = [];
  let current: (BoundarySegmentBuild & { velocitySum: number; stepCount: number }) | null = null;

  for (const step of steps) {
    const type = STEP_CLASS_TO_TYPE[step.properties.STEPCLASS];
    if (!type) {
      continue;
    }
    const points = featureRings(step)[0] as LonLat[];
    const frameIndex = frames.forBoundary(step.properties.PLATEBOUND, type);

    // Sample the step into the motion field at full resolution, before any
    // simplification: this is the field the plate outlines are carried by.
    const rotation = frames.rotationOf(frameIndex);
    for (const [lon, lat] of points) {
      field.add(lon, lat, rotation);
    }

    const first = points[0] as LonLat;
    const continues =
      current !== null &&
      current.plates === step.properties.PLATEBOUND &&
      current.type === type &&
      Math.hypot(
        (current.points[current.points.length - 1] as LonLat)[0] - first[0],
        (current.points[current.points.length - 1] as LonLat)[1] - first[1],
      ) < 1.0;

    if (current && continues) {
      current.points.push(...points.slice(1));
      current.velocitySum += step.properties.VELOCITYLE;
      current.stepCount += 1;
      continue;
    }

    if (current) {
      current.velocity = current.velocitySum / current.stepCount;
      segments.push(current);
    }
    current = {
      type,
      plates: step.properties.PLATEBOUND,
      velocity: 0,
      velocitySum: step.properties.VELOCITYLE,
      stepCount: 1,
      points: [...points],
      frameIndex,
    };
  }
  if (current) {
    current.velocity = current.velocitySum / current.stepCount;
    segments.push(current);
  }

  for (const segment of segments) {
    segment.points = simplify(segment.points, BOUNDARY_TOLERANCE);
  }
  return segments.filter((segment) => segment.points.length >= 2);
}

function emitBoundaries(segments: readonly BoundarySegmentBuild[]): void {
  const entries = segments.map((segment) => {
    const coords = numberArray(segment.points.flatMap(([lon, lat]) => [round(lon, 2), round(lat, 2)]));
    return (
      `  { type: ${JSON.stringify(segment.type)}, plates: ${JSON.stringify(segment.plates)},` +
      ` velocityMmPerYear: ${round(segment.velocity, 1)}, frameIndex: ${segment.frameIndex},` +
      `\n    coords: ${coords} },`
    );
  });
  writeGeneratedModule(
    `${GENERATED_DIR}/boundaryData.ts`,
    `Plate boundary polylines from the PB2002 step file, merged into runs of a single
boundary class and tagged with the mean relative velocity across the boundary.

\`frameIndex\` is the motion the segment rides when the reconstruction runs — not
either neighbouring plate's, in general. See MOTION_FRAMES in PlateReconstruction.ts.`,
    `import type { BoundarySegmentRecord } from "../dataTypes.js";\n\nexport const BOUNDARY_SEGMENTS: readonly BoundarySegmentRecord[] = [\n${entries.join("\n")}\n];\n`,
  );
}

/** Writes the rotations that belong to the boundary network rather than to a plate. */
function emitMotionFrames(plates: readonly PlateBuild[], frames: MotionFrames): void {
  const packed = numberArray(frames.derivedFrames.flatMap((frame) => [frame.lat, frame.lon, frame.rate]));
  writeGeneratedModule(
    `${GENERATED_DIR}/motionFrameData.ts`,
    `The ${frames.derivedFrames.length} rotations that belong to a plate *boundary* rather than to a plate.

A boundary drawn on the map rides the mean of its two plates' rotation vectors, which
is how a spreading axis moves when accretion is symmetric and is stationary with
respect to a fault the two plates merely slide along. (A subduction zone is the
exception, and is not in this table: a trench rides the overriding plate, which is a
plate index.) A plate *outline* vertex rides a blend of the boundaries near it, so the
mosaic of plates stays closed as it deforms; most of the entries here are those
blends, which is why there are so many and why consecutive ones are so alike.

Indices continue from PLATES — entry 0 here is frame number ${plates.length}. See
MOTION_FRAMES in PlateReconstruction.ts.`,
    [
      `import type { RotationVector } from "../dataTypes.js";\n`,
      "/** Pole latitude, pole longitude and rate in °/Myr, three numbers per rotation. */",
      `const PACKED = ${wrap(packed, "  ").trimStart()};\n`,
      "export const DERIVED_MOTION_FRAMES: readonly RotationVector[] = Array.from(",
      "  { length: PACKED.length / 3 },",
      "  (_unused, index) => ({",
      "    poleLat: PACKED[index * 3] as number,",
      "    poleLon: PACKED[index * 3 + 1] as number,",
      "    poleRateDegPerMyr: PACKED[index * 3 + 2] as number,",
      "  }),",
      ");",
    ].join("\n"),
  );
}

/** Turns a point by a rotation vector for `timeMyr`, with Rodrigues' formula. */
function rotateBy(point: LonLat, rotation: Rotation, timeMyr: number): LonLat {
  const angle = rotation.rate * timeMyr * DEGREES_TO_RADIANS;
  const axis = toUnitVector(rotation.lon, rotation.lat);
  const v = toUnitVector(point[0], point[1]);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const axisCrossV = cross(axis, v);
  const axisDotV = dot(axis, v);
  return toLonLat([
    v[0] * cos + axisCrossV[0] * sin + axis[0] * axisDotV * (1 - cos),
    v[1] * cos + axisCrossV[1] * sin + axis[1] * axisDotV * (1 - cos),
    v[2] * cos + axisCrossV[2] * sin + axis[2] * axisDotV * (1 - cos),
  ]);
}

/** Angular separation of two points in degrees, taking the short way round. */
function separationDegrees(a: LonLat, b: LonLat): number {
  const eastward = (((b[0] - a[0] + 540) % 360) - 180) * Math.max(0.05, Math.cos(a[1] * DEGREES_TO_RADIANS));
  return Math.hypot(eastward, b[1] - a[1]);
}

/** Midpoint of an edge in lon/lat, which is the line the map draws between its ends. */
function edgeMidpoint(a: LonLat, b: LonLat): LonLat {
  return [a[0] + (((b[0] - a[0] + 540) % 360) - 180) / 2, (a[1] + b[1]) / 2];
}

/**
 * Worst distance, over the reconstruction's range, between where the two ends of an
 * edge finish up and how far apart they started: how far the drawn edge is stretched
 * by its ends riding different motions.
 */
function edgeStretchKm(a: LonLat, aMotion: Rotation, b: LonLat, bMotion: Rotation): number {
  const restLength = greatCircleDistanceKm(a, b);
  let worst = 0;
  for (const timeMyr of [-RECONSTRUCTION_RANGE_MYR, RECONSTRUCTION_RANGE_MYR]) {
    const moved = greatCircleDistanceKm(rotateBy(a, aMotion, timeMyr), rotateBy(b, bMotion, timeMyr));
    worst = Math.max(worst, Math.abs(moved - restLength));
  }
  return worst;
}

/**
 * Gives every plate-outline vertex the motion of the boundary network beneath it, so
 * that two plates sharing an edge carry it identically and the mosaic stays closed.
 *
 * The outline is refined as it goes. An edge whose two ends ride motions far enough
 * apart to stretch it noticeably is split in half and both halves reconsidered, which
 * converges because the field is continuous: the closer two points are, the closer
 * their motions. Without it an outline draws a straight line across an ocean wherever
 * one boundary hands over to the next.
 *
 * Away from every boundary the field returns the plate's own motion, which is what
 * carries the seam a polygon is cut along at the antimeridian; the two halves of such
 * a seam are the same points, so they stay together.
 */
function assignRingFrames(plates: readonly PlateBuild[], field: BoundaryMotionField, frames: MotionFrames): void {
  let vertices = 0;

  for (const plate of plates) {
    const ownMotion = plateRotation(plate);
    const motionAt = (point: LonLat): Rotation => field.at(point[0], point[1], ownMotion);

    const refinedRings: LonLat[][] = [];
    const refinedFrames: number[][] = [];

    for (const ring of plate.rings) {
      const points: LonLat[] = [];
      const motions: Rotation[] = [];

      /** Appends the piece from `from` to `to`, splitting it while it stretches. */
      const walk = (from: LonLat, fromMotion: Rotation, to: LonLat, toMotion: Rotation, depth: number): void => {
        const splittable =
          depth < MAX_OUTLINE_SUBDIVISIONS && separationDegrees(from, to) > 2 * MIN_OUTLINE_STEP_DEGREES;
        const tooLong = separationDegrees(from, to) > PLATE_OUTLINE_STEP_DEGREES;
        if (splittable && (tooLong || edgeStretchKm(from, fromMotion, to, toMotion) > MAX_OUTLINE_STRETCH_KM)) {
          const middle = edgeMidpoint(from, to);
          const middleMotion = motionAt(middle);
          walk(from, fromMotion, middle, middleMotion, depth + 1);
          walk(middle, middleMotion, to, toMotion, depth + 1);
          return;
        }
        points.push(to);
        motions.push(toMotion);
      };

      const first = ring[0] as LonLat;
      const firstMotion = motionAt(first);
      points.push(first);
      motions.push(firstMotion);

      let previous = first;
      let previousMotion = firstMotion;
      for (let i = 1; i < ring.length; i++) {
        const next = ring[i] as LonLat;
        // The ring repeats its first vertex at the end, and that repeat has to keep
        // the frame it was given the first time or the ring will not close.
        const nextMotion = i === ring.length - 1 ? firstMotion : motionAt(next);
        walk(previous, previousMotion, next, nextMotion, 0);
        previous = next;
        previousMotion = nextMotion;
      }

      refinedRings.push(points);
      refinedFrames.push(
        motions.map((motion) => {
          vertices++;
          return frames.intern(motion);
        }),
      );
    }

    plate.rings = refinedRings;
    plate.ringFrames = refinedFrames;
  }

  console.log(`  ${vertices} outline vertices carried by the boundary motion field`);
}

// ── Earthquakes ───────────────────────────────────────────────────────────────

interface UsgsFeature {
  readonly properties: { readonly mag: number | null };
  readonly geometry: { readonly coordinates: [number, number, number] };
}

interface QuakeRecord {
  lon: number;
  lat: number;
  depthKm: number;
  magnitude: number;
}

async function fetchQuakes(parameters: Record<string, string | number>, cacheName: string): Promise<QuakeRecord[]> {
  const query = new URLSearchParams({
    format: "geojson",
    ...Object.fromEntries(Object.entries(parameters).map(([k, v]) => [k, String(v)])),
  });
  const collection = await fetchJson<{ features: readonly UsgsFeature[] }>(`${USGS_QUERY}?${query}`, cacheName);
  return collection.features
    .filter((feature) => feature.properties.mag !== null)
    .map((feature) => {
      const [lon, lat, depth] = feature.geometry.coordinates;
      return {
        lon: round(lon, 2),
        lat: round(lat, 2),
        depthKm: Math.max(0, Math.round(depth)),
        magnitude: round(feature.properties.mag as number, 1),
      };
    });
}

async function buildGlobalEarthquakes(plates: readonly PlateBuild[]): Promise<QuakeRecord[]> {
  const quakes = await fetchQuakes(
    {
      starttime: GLOBAL_QUAKE_START,
      minmagnitude: GLOBAL_QUAKE_MIN_MAGNITUDE,
      orderby: "time",
    },
    "usgs_global.json",
  );

  const description = `USGS/ANSS, magnitude ${GLOBAL_QUAKE_MIN_MAGNITUDE}+ since ${GLOBAL_QUAKE_START.slice(0, 4)}`;
  writeGeneratedModule(
    `${GENERATED_DIR}/earthquakeData.ts`,
    `Global earthquake hypocentres from the USGS ANSS catalogue, stored column-wise.
\`plateIndex\` is the plate each epicentre sits on, so the markers travel with their
plate when plate motion is run forwards or backwards in time.`,
    [
      `import type { EarthquakeCatalog } from "../dataTypes.js";\n`,
      "export const EARTHQUAKES: EarthquakeCatalog = {",
      `  lon: ${wrap(numberArray(quakes.map((q) => q.lon)), "    ").trimStart()},`,
      `  lat: ${wrap(numberArray(quakes.map((q) => q.lat)), "    ").trimStart()},`,
      `  depthKm: ${wrap(numberArray(quakes.map((q) => q.depthKm)), "    ").trimStart()},`,
      `  magnitude: ${wrap(numberArray(quakes.map((q) => q.magnitude)), "    ").trimStart()},`,
      `  plateIndex: ${wrap(numberArray(quakes.map((q) => plateIndexAt(plates, q.lon, q.lat))), "    ").trimStart()},`,
      `  description: ${JSON.stringify(description)},`,
      "};",
    ].join("\n"),
  );
  return quakes;
}

// ── Volcanoes ─────────────────────────────────────────────────────────────────

interface VolcanoLocation {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number | null;
  readonly status: string | null;
}

interface VolcanoBuild {
  name: string;
  lon: number;
  lat: number;
  elevationM: number;
  historical: boolean;
}

async function buildVolcanoes(plates: readonly PlateBuild[]): Promise<VolcanoBuild[]> {
  const volcanoes: VolcanoBuild[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await fetchJson<{ items: readonly VolcanoLocation[]; totalPages: number }>(
      `${VOLCANO_QUERY}?itemsPerPage=100&page=${page}`,
      `volcanoes_${page}.json`,
    );
    totalPages = response.totalPages;
    for (const item of response.items) {
      if (typeof item.latitude !== "number" || typeof item.longitude !== "number") {
        continue;
      }
      volcanoes.push({
        name: item.name,
        lon: round(item.longitude, 2),
        lat: round(item.latitude, 2),
        elevationM: Math.round(item.elevation ?? 0),
        historical: item.status === "Historical",
      });
    }
    page += 1;
  } while (page <= totalPages);

  const entries = volcanoes.map(
    (volcano) =>
      `  { name: ${JSON.stringify(volcano.name)}, lon: ${volcano.lon}, lat: ${volcano.lat},` +
      ` elevationM: ${volcano.elevationM}, historical: ${volcano.historical},` +
      ` plateIndex: ${plateIndexAt(plates, volcano.lon, volcano.lat)} },`,
  );
  writeGeneratedModule(
    `${GENERATED_DIR}/volcanoData.ts`,
    `Holocene volcanoes from the NOAA NCEI volcano location service (Smithsonian
Global Volcanism Program holdings). \`historical\` marks volcanoes with eruptions
in recorded history; \`plateIndex\` is the plate the volcano rides.`,
    `import type { VolcanoRecord } from "../dataTypes.js";\n\nexport const VOLCANOES: readonly VolcanoRecord[] = [\n${entries.join("\n")}\n];\n`,
  );
  return volcanoes;
}

// ── Relief raster ─────────────────────────────────────────────────────────────

/**
 * Colour ramp for the relief map: a bathymetric blue ramp below sea level and a
 * conventional green → tan → brown → white ramp above it.
 */
const RELIEF_RAMP: readonly { elevationM: number; color: [number, number, number] }[] = [
  { elevationM: -11000, color: [4, 12, 40] },
  { elevationM: -6000, color: [8, 32, 84] },
  { elevationM: -4000, color: [14, 56, 122] },
  { elevationM: -3000, color: [22, 78, 150] },
  { elevationM: -2000, color: [33, 102, 172] },
  { elevationM: -1000, color: [56, 130, 190] },
  { elevationM: -200, color: [104, 172, 214] },
  { elevationM: -1, color: [158, 202, 225] },
  { elevationM: 0, color: [80, 130, 80] },
  { elevationM: 300, color: [120, 158, 92] },
  { elevationM: 900, color: [178, 168, 110] },
  { elevationM: 1800, color: [176, 136, 92] },
  { elevationM: 3000, color: [150, 110, 88] },
  { elevationM: 4500, color: [206, 196, 190] },
  { elevationM: 6000, color: [252, 252, 252] },
];

function reliefColor(elevationM: number): [number, number, number] {
  const ramp = RELIEF_RAMP;
  if (elevationM <= (ramp[0] as { elevationM: number }).elevationM) {
    return (ramp[0] as { color: [number, number, number] }).color;
  }
  for (let i = 1; i < ramp.length; i++) {
    const upper = ramp[i] as { elevationM: number; color: [number, number, number] };
    const lower = ramp[i - 1] as { elevationM: number; color: [number, number, number] };
    if (elevationM <= upper.elevationM) {
      const t = (elevationM - lower.elevationM) / (upper.elevationM - lower.elevationM);
      return [
        Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * t),
        Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * t),
        Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * t),
      ];
    }
  }
  return (ramp[ramp.length - 1] as { color: [number, number, number] }).color;
}

/**
 * Renders the global relief PNG. Shaded relief (a simple north-west illumination)
 * is mixed into the colour ramp so trenches, ridges and mountain belts read as
 * three-dimensional rather than as flat colour bands.
 */
async function buildRelief(): Promise<void> {
  const grid = await fetchElevationGrid([-180, -90, 180, 90], RELIEF_WIDTH, RELIEF_HEIGHT, "dem_global.tif");
  const pixels = Buffer.alloc(RELIEF_WIDTH * RELIEF_HEIGHT * 3);

  for (let y = 0; y < RELIEF_HEIGHT; y++) {
    for (let x = 0; x < RELIEF_WIDTH; x++) {
      const at = (px: number, py: number): number =>
        grid.values[
          Math.max(0, Math.min(RELIEF_HEIGHT - 1, py)) * RELIEF_WIDTH + ((px + RELIEF_WIDTH) % RELIEF_WIDTH)
        ] ?? 0;

      const elevation = at(x, y);
      // Slope towards the north-west, exaggerated far more under water (where
      // relief is subtle) than on land.
      const gradient = (at(x - 1, y) - at(x + 1, y) + (at(x, y - 1) - at(x, y + 1))) / 2;
      const exaggeration = elevation < 0 ? 1 / 260 : 1 / 900;
      const shade = Math.max(-0.32, Math.min(0.32, gradient * exaggeration));

      // The DEM is an ice-surface model, so the Greenland and Antarctic ice sheets
      // read as high ground. Whiten high polar ground so they look like ice rather
      // than like a mountain range.
      const latitude = 90 - ((y + 0.5) / RELIEF_HEIGHT) * 180;
      const iceFraction =
        Math.abs(latitude) > 60 && elevation > 400
          ? Math.min(1, ((Math.abs(latitude) - 60) / 8) * Math.min(1, (elevation - 400) / 1200)) * 0.85
          : 0;

      const [baseR, baseG, baseB] = reliefColor(elevation);
      const r = baseR + (244 - baseR) * iceFraction;
      const g = baseG + (248 - baseG) * iceFraction;
      const b = baseB + (255 - baseB) * iceFraction;
      const index = (y * RELIEF_WIDTH + x) * 3;
      pixels[index] = Math.max(0, Math.min(255, Math.round(r * (1 + shade))));
      pixels[index + 1] = Math.max(0, Math.min(255, Math.round(g * (1 + shade))));
      pixels[index + 2] = Math.max(0, Math.min(255, Math.round(b * (1 + shade))));
    }
  }

  const sharp = (await import("sharp")).default;
  const path = `src/common/data/generated/relief.png`;
  await sharp(pixels, { raw: { width: RELIEF_WIDTH, height: RELIEF_HEIGHT, channels: 3 } })
    .png({ palette: true, colors: 128, effort: 10 })
    .toFile(path);
  console.log(`  wrote ${path}`);
}

// ── Cross-sections ────────────────────────────────────────────────────────────

interface SectionConfig {
  key: "subduction" | "divergent" | "transform";
  /** Profile end points, degrees. The profile runs left-to-right on screen. */
  start: LonLat;
  end: LonLat;
  /** How far either side of the profile earthquakes are collected, km. */
  corridorHalfWidthKm: number;
  maxDepthKm: number;
  /** Minimum magnitude for this section's earthquake query. */
  minMagnitude: number;
  /** Number of evenly spaced elevation samples along the profile. */
  sampleCount: number;
}

/**
 * One profile per boundary type, each across a classic example:
 *
 *  - subduction: the Peru–Chile trench at 21.5° S, where the Nazca plate dives
 *    beneath South America and the Wadati–Benioff zone reaches ~650 km.
 *  - divergent: the Mid-Atlantic Ridge at 24° N, halfway between North America
 *    and Africa.
 *  - transform: the San Andreas fault at Parkfield, sampled perpendicular to the
 *    fault's N40°W strike.
 */
const SECTIONS: readonly SectionConfig[] = [
  {
    key: "subduction",
    start: [-74.5, -21.5],
    end: [-60.5, -21.5],
    corridorHalfWidthKm: 200,
    maxDepthKm: 700,
    minMagnitude: 4.5,
    sampleCount: 320,
  },
  {
    key: "divergent",
    start: [-50.0, 24.0],
    end: [-40.0, 24.0],
    corridorHalfWidthKm: 120,
    maxDepthKm: 60,
    minMagnitude: 4.0,
    sampleCount: 320,
  },
  {
    key: "transform",
    start: [-121.62, 35.09],
    end: [-119.24, 36.71],
    corridorHalfWidthKm: 40,
    maxDepthKm: 40,
    minMagnitude: 3.0,
    sampleCount: 320,
  },
];

async function buildCrossSections(
  boundaries: readonly BoundarySegmentBuild[],
  volcanoes: readonly VolcanoBuild[],
): Promise<void> {
  const modules: string[] = [];

  for (const config of SECTIONS) {
    const { start, end } = config;
    const profile = new Profile(start, end);

    // Elevation along the profile, from a DEM tile covering its neighbourhood.
    const pad = 1.5;
    const bounds: [number, number, number, number] = [
      Math.min(start[0], end[0]) - pad,
      Math.min(start[1], end[1]) - pad,
      Math.max(start[0], end[0]) + pad,
      Math.max(start[1], end[1]) + pad,
    ];
    const spanLon = bounds[2] - bounds[0];
    const spanLat = bounds[3] - bounds[1];
    const tileWidth = Math.min(1200, Math.max(200, Math.round(spanLon * 60)));
    const tileHeight = Math.min(1200, Math.max(200, Math.round(spanLat * 60)));
    const grid = await fetchElevationGrid(bounds, tileWidth, tileHeight, `dem_${config.key}.tif`);

    const elevations: number[] = [];
    for (let i = 0; i < config.sampleCount; i++) {
      const distanceKm = (profile.lengthKm * i) / (config.sampleCount - 1);
      const [lon, lat] = profile.pointAt(distanceKm);
      elevations.push(Math.round(sampleElevation(grid, lon, lat)));
    }

    // Earthquakes inside the corridor, projected onto the profile.
    const latitudes = [start[1], end[1]];
    const longitudes = [start[0], end[0]];
    const degreePad = config.corridorHalfWidthKm / 111 + 0.5;
    const quakes = await fetchQuakes(
      {
        starttime: "1980-01-01",
        minmagnitude: config.minMagnitude,
        minlatitude: round(Math.min(...latitudes) - degreePad, 2),
        maxlatitude: round(Math.max(...latitudes) + degreePad, 2),
        minlongitude: round(Math.min(...longitudes) - degreePad, 2),
        maxlongitude: round(Math.max(...longitudes) + degreePad, 2),
        orderby: "time",
      },
      `usgs_${config.key}.json`,
    );

    const sectionQuakes = quakes
      .map((quake) => ({ quake, projected: profile.project(quake.lon, quake.lat) }))
      .filter(
        ({ projected }) =>
          Math.abs(projected.offsetKm) <= config.corridorHalfWidthKm &&
          projected.distanceKm >= 0 &&
          projected.distanceKm <= profile.lengthKm,
      )
      .map(({ quake, projected }) => ({
        distanceKm: round(projected.distanceKm, 1),
        depthKm: quake.depthKm,
        magnitude: quake.magnitude,
      }));

    // Volcanoes inside the corridor.
    const sectionVolcanoes = volcanoes
      .map((volcano) => ({ volcano, projected: profile.project(volcano.lon, volcano.lat) }))
      .filter(
        ({ projected }) =>
          Math.abs(projected.offsetKm) <= config.corridorHalfWidthKm &&
          projected.distanceKm >= 0 &&
          projected.distanceKm <= profile.lengthKm,
      )
      .map(({ volcano, projected }) => ({
        distanceKm: round(projected.distanceKm, 1),
        elevationM: volcano.elevationM,
        name: volcano.name,
      }));

    // Where plate boundaries cross the profile. A boundary crosses when the signed
    // perpendicular offset of two consecutive vertices changes sign; the crossing
    // point is interpolated between them.
    const crossings: { distanceKm: number; type: BoundaryType; plates: string; velocity: number }[] = [];
    for (const segment of boundaries) {
      for (let i = 1; i < segment.points.length; i++) {
        const previous = profile.project(...(segment.points[i - 1] as LonLat));
        const next = profile.project(...(segment.points[i] as LonLat));
        if (previous.offsetKm === next.offsetKm || previous.offsetKm > 0 === next.offsetKm > 0) {
          continue;
        }
        const t = previous.offsetKm / (previous.offsetKm - next.offsetKm);
        const distanceKm = previous.distanceKm + t * (next.distanceKm - previous.distanceKm);
        if (distanceKm < 0 || distanceKm > profile.lengthKm) {
          continue;
        }
        crossings.push({
          distanceKm: round(distanceKm, 1),
          type: segment.type,
          plates: segment.plates,
          velocity: round(segment.velocity, 1),
        });
      }
    }
    crossings.sort((a, b) => a.distanceKm - b.distanceKm);

    modules.push(
      [
        `  {`,
        `    key: ${JSON.stringify(config.key)},`,
        `    lengthKm: ${round(profile.lengthKm, 1)},`,
        `    maxDepthKm: ${config.maxDepthKm},`,
        `    corridorHalfWidthKm: ${config.corridorHalfWidthKm},`,
        `    earthquakeDescription: ${JSON.stringify(
          `USGS/ANSS, magnitude ${config.minMagnitude}+ since 1980, within ${config.corridorHalfWidthKm} km of the profile`,
        )},`,
        `    elevationsM: ${numberArray(elevations)},`,
        `    boundaryCrossings: [`,
        ...crossings.map(
          (crossing) =>
            `      { distanceKm: ${crossing.distanceKm}, type: ${JSON.stringify(crossing.type)},` +
            ` plates: ${JSON.stringify(crossing.plates)}, velocityMmPerYear: ${crossing.velocity} },`,
        ),
        `    ],`,
        `    earthquakes: [`,
        wrap(
          sectionQuakes
            .map((q) => `{ distanceKm: ${q.distanceKm}, depthKm: ${q.depthKm}, magnitude: ${q.magnitude} },`)
            .join(""),
          "      ",
        ),
        `    ],`,
        `    volcanoes: [`,
        ...sectionVolcanoes.map(
          (v) => `      { distanceKm: ${v.distanceKm}, elevationM: ${v.elevationM}, name: ${JSON.stringify(v.name)} },`,
        ),
        `    ],`,
        `  },`,
      ].join("\n"),
    );

    console.log(
      `  ${config.key}: ${round(profile.lengthKm, 0)} km profile, ${sectionQuakes.length} earthquakes, ` +
        `${sectionVolcanoes.length} volcanoes, ${crossings.length} boundary crossings`,
    );
  }

  writeGeneratedModule(
    `${GENERATED_DIR}/crossSectionData.ts`,
    `Cross-section profiles through a subduction zone (Chile trench), an oceanic
spreading ridge (Mid-Atlantic Ridge) and a continental transform (San Andreas
fault). Surface elevation comes from the NOAA DEM; earthquakes and volcanoes are
real events projected onto the profile from a corridor either side of it.`,
    `import type { CrossSectionData } from "../dataTypes.js";\n\nexport const CROSS_SECTIONS: readonly CrossSectionData[] = [\n${modules.join("\n")}\n];\n`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * The datasets that can be rebuilt, each writing its own generated module.
 *
 * `plate-model` covers the plates, their boundaries and the motion frames together,
 * because those three index into each other and only mean anything as a set.
 */
const STEPS = ["plate-model", "land", "earthquakes", "volcanoes", "relief", "cross-sections"] as const;
type Step = (typeof STEPS)[number];

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const unknown = requested.filter((name) => !(STEPS as readonly string[]).includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown step ${unknown.join(", ")}. Known steps: ${STEPS.join(", ")}`);
  }
  // No arguments rebuilds everything, which is what `npm run build-data` does. Naming
  // steps rebuilds only those, so a change to the plate model does not also pull a
  // newer earthquake catalogue and a fresh DEM into the diff.
  const wanted = (step: Step): boolean => requested.length === 0 || requested.includes(step);

  // The PB2002 model is the backbone — every other dataset is tagged with indices into
  // it — so it is always built, and only written when it was asked for.
  console.log("Building plate model…");
  const plates = await buildPlates();
  const frames = new MotionFrames(plates);
  const field = new BoundaryMotionField();
  const boundaries = await buildBoundaries(frames, field);
  assignRingFrames(plates, field, frames);
  console.log(
    `  ${plates.length} plates, ${boundaries.length} boundary segments, ${frames.derivedFrames.length} derived motion frames`,
  );
  if (wanted("plate-model")) {
    emitPlates(plates);
    emitBoundaries(boundaries);
    emitMotionFrames(plates, frames);
  }

  if (wanted("land")) {
    console.log("Building coastlines…");
    await buildLand(plates);
  }

  if (wanted("earthquakes")) {
    console.log("Building earthquake catalogue…");
    const quakes = await buildGlobalEarthquakes(plates);
    console.log(`  ${quakes.length} events`);
  }

  // The cross-sections project real volcanoes onto their profiles, so asking for them
  // rebuilds the volcano catalogue too.
  let volcanoes: VolcanoBuild[] | null = null;
  if (wanted("volcanoes") || wanted("cross-sections")) {
    console.log("Building volcano catalogue…");
    volcanoes = await buildVolcanoes(plates);
    console.log(`  ${volcanoes.length} volcanoes`);
  }

  if (wanted("relief")) {
    console.log("Building relief raster…");
    await buildRelief();
  }

  if (wanted("cross-sections")) {
    console.log("Building cross-sections…");
    await buildCrossSections(boundaries, volcanoes as VolcanoBuild[]);
  }

  console.log("\nDone.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
