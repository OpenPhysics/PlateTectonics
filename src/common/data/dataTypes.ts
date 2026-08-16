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

/**
 * One rigid rotation of the Earth's surface: an axis through the centre of the Earth
 * and a rate about it. Every feature the reconstruction moves is moved by one of
 * these — see `PlateReconstruction` for the list, and for why a plate boundary needs
 * a rotation that is not either neighbouring plate's.
 */
export interface RotationVector {
  /** Euler pole of the rotation, in degrees. */
  readonly poleLat: number;
  readonly poleLon: number;
  /** Rotation rate about that pole, degrees per million years, counter-clockwise. */
  readonly poleRateDegPerMyr: number;
}

/** A tectonic plate: outline, absolute (no-net-rotation) motion and label placement. */
export interface PlateRecord extends RotationVector {
  /** PB2002 two-letter plate code, e.g. `"PA"`. */
  readonly code: string;
  /** English plate name, e.g. `"Pacific"`. */
  readonly name: string;
  /** Whether the plate is large enough to label and to draw a motion vector for. */
  readonly major: boolean;
  /** Outline rings, each a flat `[lon, lat, …]` array. Plates that cross the antimeridian have several. */
  readonly rings: readonly (readonly number[])[];
  /**
   * Motion frame index per outline vertex, one array per ring.
   *
   * A plate's outline is not the plate: it is the plate's share of the boundaries
   * around it, and a boundary belongs to both of the plates it separates. So an
   * outline vertex rides the boundary under it rather than the plate inside it, which
   * is what keeps the mosaic of plates a mosaic when the clock runs — the plate grows
   * along its ridges and shrinks at its trenches instead of overlapping and gapping
   * with its neighbours. See `PlateReconstruction`.
   */
  readonly ringFrames: readonly (readonly number[])[];
  /** Where to anchor the plate's name and motion vector, in degrees. */
  readonly labelLon: number;
  readonly labelLat: number;
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
  /**
   * Motion frame the segment rides during a reconstruction: the mean of the two
   * plates at a ridge or a transform, the overriding plate at a subduction zone.
   */
  readonly frameIndex: number;
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

/**
 * One isochron of the ocean floor: a line along which the crust is all the same age.
 *
 * `plateIndices[i]` is the index (into `PLATES`) of the plate carrying vertex `i`.
 * An isochron is frozen into the crust, so unlike a plate boundary it rides the plate
 * it is part of — which is what makes running the clock backwards walk each isochron
 * into the ridge it was made at, from both sides at once.
 */
export interface IsochronRecord {
  /** Age of the crust along the line, millions of years. */
  readonly ageMa: number;
  /** Flat `[lon, lat, …]` polyline in degrees. */
  readonly coords: readonly number[];
  readonly plateIndices: readonly number[];
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

// ── Deep time ─────────────────────────────────────────────────────────────────
//
// The Deep Time screen is driven by a published *reconstruction* — Müller et al.
// (2019) — rather than by extrapolating today's velocities, and that changes the
// shape of the data in one important way. See `doc/model.md` for the provenance and
// `DeepTimeReconstruction.ts` for how the two halves below are used together.
//
// A coastline is a static feature cookie-cut by plate ID: it has present-day
// geometry, and reconstructing it is one rigid rotation of that geometry. So it is
// stored once and moved by {@link HISTORY_ROTATIONS}, which lets it move continuously.
//
// A plate polygon is not. It has no present-day geometry to rotate — it is rebuilt
// at each instant from whichever boundary features bounded it then, and plates
// themselves appear and vanish as ocean basins open and close. So it is baked per
// time step, in {@link PlateHistorySnapshot}.

/** One coastline piece, and the plate that carries it through time. */
export interface HistoryCoastline {
  /** Row of `HISTORY_ROTATIONS` giving this piece's motion. */
  readonly rotationSlot: number;
  /** Present-day flat `[lon, lat, …]` polyline in degrees. */
  readonly coords: readonly number[];
}

/** One plate (or deforming belt) as it stood at a single reconstructed instant. */
export interface HistoryPlate {
  /** GPlates reconstruction plate ID, stable across snapshots so colours do not flicker. */
  readonly plateId: number;
  /** The model's own name for the topology, e.g. `"Pacific"`. */
  readonly name: string;
  /**
   * True for a deforming belt — an orogen or a rift — rather than a rigid plate.
   * The Earth screen treats plate interiors as rigid and says so; this
   * model does not, and draws the deforming belts separately.
   */
  readonly deforming: boolean;
  /** Closed outline as a flat `[lon, lat, …]` ring in degrees. */
  readonly ring: readonly number[];
}

/** Everything the reconstruction says about one instant. */
export interface PlateHistorySnapshot {
  /** Millions of years before the present. Zero is today. */
  readonly timeMa: number;
  readonly plates: readonly HistoryPlate[];
  readonly boundaries: readonly HistoryBoundarySet[];
}

/**
 * Every boundary of one kind at one instant, gathered into a single record.
 *
 * A resolved instant has some four hundred separate boundary pieces, and giving each
 * its own object would spend more of the generated file on punctuation than on
 * coordinates. They are grouped by kind instead, which is also exactly how they are
 * painted: one canvas path per colour.
 */
export interface HistoryBoundarySet {
  readonly type: BoundaryType;
  /** Each entry is one flat `[lon, lat, …]` polyline in degrees. */
  readonly lines: readonly (readonly number[])[];
}
