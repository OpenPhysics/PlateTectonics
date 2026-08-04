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
  bounds: [number, number, number, number][];
  labelLon: number;
  labelLat: number;
  poleLat: number;
  poleLon: number;
  poleRate: number;
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
      "  },",
    ].join("\n");
  });

  writeGeneratedModule(
    `${GENERATED_DIR}/plateData.ts`,
    `The ${plates.length} tectonic plates of the PB2002 model: simplified outlines,
label anchors, and absolute (no-net-rotation) Euler poles obtained by adding the
NNR-NUVEL-1A Pacific rotation to PB2002's Pacific-relative poles.`,
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

interface BoundarySegmentBuild {
  type: BoundaryType;
  plates: string;
  velocity: number;
  points: LonLat[];
}

async function buildBoundaries(): Promise<BoundarySegmentBuild[]> {
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
      ` velocityMmPerYear: ${round(segment.velocity, 1)},\n    coords: ${coords} },`
    );
  });
  writeGeneratedModule(
    `${GENERATED_DIR}/boundaryData.ts`,
    `Plate boundary polylines from the PB2002 step file, merged into runs of a single
boundary class and tagged with the mean relative velocity across the boundary.`,
    `import type { BoundarySegmentRecord } from "../dataTypes.js";\n\nexport const BOUNDARY_SEGMENTS: readonly BoundarySegmentRecord[] = [\n${entries.join("\n")}\n];\n`,
  );
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

async function buildGlobalEarthquakes(): Promise<QuakeRecord[]> {
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
    `Global earthquake hypocentres from the USGS ANSS catalogue, stored column-wise.`,
    [
      `import type { EarthquakeCatalog } from "../dataTypes.js";\n`,
      "export const EARTHQUAKES: EarthquakeCatalog = {",
      `  lon: ${wrap(numberArray(quakes.map((q) => q.lon)), "    ").trimStart()},`,
      `  lat: ${wrap(numberArray(quakes.map((q) => q.lat)), "    ").trimStart()},`,
      `  depthKm: ${wrap(numberArray(quakes.map((q) => q.depthKm)), "    ").trimStart()},`,
      `  magnitude: ${wrap(numberArray(quakes.map((q) => q.magnitude)), "    ").trimStart()},`,
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

async function buildVolcanoes(): Promise<VolcanoBuild[]> {
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
      ` elevationM: ${volcano.elevationM}, historical: ${volcano.historical} },`,
  );
  writeGeneratedModule(
    `${GENERATED_DIR}/volcanoData.ts`,
    `Holocene volcanoes from the NOAA NCEI volcano location service (Smithsonian
Global Volcanism Program holdings). \`historical\` marks volcanoes with eruptions
in recorded history.`,
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
    maxDepthKm: 30,
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

async function main(): Promise<void> {
  console.log("Building plate data…");
  const plates = await buildPlates();
  emitPlates(plates);

  console.log("Building coastlines…");
  await buildLand(plates);

  console.log("Building plate boundaries…");
  const boundaries = await buildBoundaries();
  emitBoundaries(boundaries);

  console.log("Building earthquake catalogue…");
  const quakes = await buildGlobalEarthquakes();
  console.log(`  ${quakes.length} events`);

  console.log("Building volcano catalogue…");
  const volcanoes = await buildVolcanoes();
  console.log(`  ${volcanoes.length} volcanoes`);

  console.log("Building relief raster…");
  await buildRelief();

  console.log("Building cross-sections…");
  await buildCrossSections(boundaries, volcanoes);

  console.log("\nDone.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
