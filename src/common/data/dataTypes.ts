/**
 * dataTypes.ts
 *
 * Shapes of the geophysical datasets the simulation renders. The data itself is
 * produced by `npm run build-data` into `./generated/`, from these public sources:
 *
 *  - Plate outlines, boundaries and Euler poles — Bird (2003), "An updated digital
 *    model of plate boundaries", G3 4(3), 1027 (PB2002), via the GeoJSON conversion
 *    at github.com/fraxen/tectonicplates (ODC-BY 1.0).
 *  - Coastlines — Natural Earth 1:110m land (public domain).
 *  - Earthquakes — USGS ANSS ComCat (public domain).
 *  - Volcanoes — NOAA NCEI / Smithsonian GVP Holocene volcano list (public domain).
 *  - Elevation and bathymetry — NOAA NCEI global DEM mosaic (public domain).
 *
 * Geometry is stored as flat `[lon, lat, lon, lat, …]` arrays of degrees, which is
 * both compact on disk and cheap to transform at runtime (see MapProjection and
 * PlateReconstruction).
 */

/** How the two plates on either side of a boundary move relative to each other. */
export type BoundaryType = "divergent" | "convergent" | "transform";

/** A rigid tectonic plate: outline, motion and label placement. */
export interface PlateRecord {
  /** PB2002 two-letter plate code, e.g. `"PA"`. */
  readonly code: string;
  /** English plate name, e.g. `"Pacific"`. */
  readonly name: string;
  /** Whether the plate is large enough to label and to draw a motion vector for. */
  readonly major: boolean;
  /** Outline rings, each a flat `[lon, lat, …]` array. Plates that cross the antimeridian have several. */
  readonly rings: readonly (readonly number[])[];
  /** Where to anchor the plate's name and motion vector, in degrees. */
  readonly labelLon: number;
  readonly labelLat: number;
  /** Euler pole of the plate's absolute (no-net-rotation) motion, in degrees. */
  readonly poleLat: number;
  readonly poleLon: number;
  /** Rotation rate about that pole, degrees per million years, counter-clockwise. */
  readonly poleRateDegPerMyr: number;
}

/**
 * One closed coastline ring.
 *
 * `plateIndices[i]` is the index (into `PLATES`) of the plate carrying vertex `i`,
 * so coastlines break apart correctly when plate motion is run forward or backward
 * in time — Baja California rides the Pacific plate away from North America, the
 * Afar region rifts away from Africa, and so on.
 */
export interface LandRing {
  readonly coords: readonly number[];
  readonly plateIndices: readonly number[];
}

/** A stretch of plate boundary of a single kind. */
export interface BoundarySegmentRecord {
  readonly type: BoundaryType;
  /** PB2002 boundary name, e.g. `"NZ-SA"`. */
  readonly plates: string;
  /** Mean relative velocity across the boundary, mm/year. */
  readonly velocityMmPerYear: number;
  /** Index of the plate the segment rides during a reconstruction (the first plate named). */
  readonly plateIndex: number;
  /** Flat `[lon, lat, …]` polyline in degrees. */
  readonly coords: readonly number[];
}

/**
 * Earthquake hypocentres, stored column-wise: entry `i` of each array describes
 * the same event. Column storage keeps the generated file small and lets the
 * renderer walk the catalogue without allocating per-event objects.
 */
export interface EarthquakeCatalog {
  readonly lon: readonly number[];
  readonly lat: readonly number[];
  /** Focal depth in km below sea level. */
  readonly depthKm: readonly number[];
  /** Moment (or equivalent) magnitude. */
  readonly magnitude: readonly number[];
  /** Index (into `PLATES`) of the plate each epicentre rides. */
  readonly plateIndex: readonly number[];
  /** Human-readable description of the catalogue's extent, shown in the legend. */
  readonly description: string;
}

/** A Holocene volcano or an intraplate hotspot. */
export interface VolcanoRecord {
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
  /** Summit elevation in metres (negative for submarine volcanoes). */
  readonly elevationM: number;
  /** True when the volcano has erupted in recorded history. */
  readonly historical: boolean;
  /** Index (into `PLATES`) of the plate the volcano rides. */
  readonly plateIndex: number;
}

/** A mantle plume / hotspot, which stays put while plates move over it. */
export interface HotspotRecord {
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
}

/** Where a plate boundary crosses a cross-section profile. */
export interface BoundaryCrossing {
  /** Distance from the profile's left-hand end, km. */
  readonly distanceKm: number;
  readonly type: BoundaryType;
  /** PB2002 boundary name, e.g. `"NZ-SA"`. */
  readonly plates: string;
  /** Relative velocity across the boundary at the crossing, mm/year. */
  readonly velocityMmPerYear: number;
}

/** An earthquake projected onto a cross-section profile. */
export interface SectionEarthquake {
  readonly distanceKm: number;
  readonly depthKm: number;
  readonly magnitude: number;
}

/** A volcano projected onto a cross-section profile. */
export interface SectionVolcano {
  readonly distanceKm: number;
  readonly elevationM: number;
  readonly name: string;
}

/** Which cross-section (or the global map) is on screen. */
export type ViewKey = "global" | "subduction" | "divergent" | "transform";

/** Everything needed to draw one boundary cross-section. */
export interface CrossSectionData {
  readonly key: Exclude<ViewKey, "global">;
  /** Total profile length, km. */
  readonly lengthKm: number;
  /** Deepest depth to draw, km — 700 for a subduction zone, tens of km for a ridge or fault. */
  readonly maxDepthKm: number;
  /** Evenly spaced surface elevations (metres) from the profile start to its end. */
  readonly elevationsM: readonly number[];
  readonly boundaryCrossings: readonly BoundaryCrossing[];
  readonly earthquakes: readonly SectionEarthquake[];
  readonly volcanoes: readonly SectionVolcano[];
  /** Half-width of the corridor of real data projected onto the profile, km. */
  readonly corridorHalfWidthKm: number;
  /** Description of the earthquake catalogue used for this section. */
  readonly earthquakeDescription: string;
}
