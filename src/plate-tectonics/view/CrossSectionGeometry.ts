/**
 * CrossSectionGeometry.ts
 *
 * Turns one `CrossSectionData` profile into view coordinates, and derives the
 * features the cross-section draws: the surface profile, the crust/lithosphere
 * layering, the descending slab, and where the trench, ridge, fault and volcanic
 * arc sit along the profile.
 *
 * ── Two vertical scales ───────────────────────────────────────────────────────
 * Depth and surface relief differ by two orders of magnitude — a slab reaches
 * 700 km down while the Andes rise 6 km up — so the band above sea level gets its
 * own, much larger scale. {@link verticalExaggeration} reports the ratio so the
 * view can say so on screen instead of quietly distorting the picture.
 *
 * ── The slab comes from the earthquakes ───────────────────────────────────────
 * The dipping slab is not drawn from a hand-tuned curve: {@link slabTrace} fits it
 * to the real hypocentres in the profile by taking, in each depth bin, the median
 * distance of the earthquakes in that bin. That *is* the Wadati–Benioff zone, so
 * the slab the sim draws is the one the seismicity describes.
 */

import type { Bounds2 } from "scenerystack/dot";
import type { BoundaryType, CrossSectionData } from "../../common/data/dataTypes.js";
import {
  ASTHENOSPHERE_BASE_KM,
  CONTINENTAL_CRUST_THICKNESS_KM,
  LITHOSPHERE_THICKNESS_KM,
  OCEANIC_CRUST_THICKNESS_KM,
} from "../../PlateTectonicsConstants.js";

/**
 * Fraction of the viewport height given to the relief band. Surface relief and slab
 * depth differ by two orders of magnitude — the Andes rise 6 km while the slab below
 * them reaches 600 km — so each gets its own band with its own scale, which is how
 * cross-sections are drawn in the literature.
 */
const RELIEF_BAND_FRACTION = 0.26;

/** Padding added above and below the profile's own elevation range, metres. */
const RELIEF_PADDING_M = 700;

/** Smallest elevation span the relief band will show, metres — keeps flat profiles from filling it. */
const MIN_RELIEF_SPAN_M = 4000;

/** Depth bins used when fitting the slab to the hypocentres, km. */
const SLAB_BIN_KM = 30;

/** Shallowest bin included in the slab fit: above this, seismicity is not slab-specific. */
const SLAB_MIN_DEPTH_KM = 45;

/** A depth bin needs at least this many earthquakes before it constrains the slab. */
const SLAB_MIN_EVENTS = 4;

/** Half-thickness of the drawn slab, km. */
export const SLAB_HALF_THICKNESS_KM = 45;

/**
 * Constant in the half-space cooling law for oceanic lithosphere thickness,
 * km · Myr^-1/2. Around 9.5 reproduces the observed thickening of a young plate.
 */
const LITHOSPHERE_COOLING_COEFFICIENT = 9.5;

/** Elevation (m) below which a column is treated as oceanic rather than continental crust. */
const OCEANIC_ELEVATION_M = -1500;

/** A point along the profile in view coordinates. */
export interface ViewPoint {
  readonly x: number;
  readonly y: number;
}

export class CrossSectionGeometry {
  public readonly data: CrossSectionData;
  public readonly bounds: Bounds2;

  /** View y of sea level, inside the relief band. */
  public readonly seaLevelY: number;

  /** View y of the boundary between the relief band and the depth band (depth 0). */
  public readonly surfaceY: number;

  /** View pixels per km of depth, in the depth band. */
  public readonly pixelsPerDepthKm: number;

  /** View pixels per km of elevation, in the relief band. */
  public readonly pixelsPerElevationKm: number;

  /** Highest and lowest elevation the relief band shows, metres. */
  public readonly reliefMaxM: number;
  public readonly reliefMinM: number;

  /** Centreline of the subducting slab, or an empty array when the section has none. */
  public readonly slabTrace: readonly ViewPoint[];

  public constructor(data: CrossSectionData, bounds: Bounds2) {
    this.data = data;
    this.bounds = bounds;

    // The relief band is scaled to this profile's own range, so a mid-ocean ridge
    // and the Andes both fill it rather than one of them hugging the axis.
    // Sea level is always inside the band: on an all-ocean profile the water column
    // is what tells a student they are looking at a sea floor rather than at land.
    const summitM = data.volcanoes.reduce((highestSummit, volcano) => Math.max(highestSummit, volcano.elevationM), 0);
    const highest = Math.max(...data.elevationsM, summitM, 0);
    const lowest = Math.min(...data.elevationsM, 0);
    const midpoint = (highest + lowest) / 2;
    const span = Math.max(MIN_RELIEF_SPAN_M, highest - lowest + 2 * RELIEF_PADDING_M);
    this.reliefMaxM = midpoint + span / 2;
    this.reliefMinM = midpoint - span / 2;

    const reliefHeight = bounds.height * RELIEF_BAND_FRACTION;
    this.surfaceY = bounds.minY + reliefHeight;
    this.pixelsPerElevationKm = reliefHeight / (span / 1000);
    this.seaLevelY = bounds.minY + ((this.reliefMaxM - 0) / span) * reliefHeight;
    this.pixelsPerDepthKm = (bounds.height - reliefHeight) / data.maxDepthKm;
    this.slabTrace = this.fitSlab();
  }

  /** How much the relief above sea level is stretched relative to the depth axis. */
  public get verticalExaggeration(): number {
    return this.pixelsPerElevationKm / this.pixelsPerDepthKm;
  }

  /** View x for a distance along the profile, km. */
  public x(distanceKm: number): number {
    return this.bounds.minX + (distanceKm / this.data.lengthKm) * this.bounds.width;
  }

  /** View y for a depth below the surface, km — in the depth band. */
  public y(depthKm: number): number {
    return this.surfaceY + depthKm * this.pixelsPerDepthKm;
  }

  /** View y for a surface elevation, metres (positive up) — in the relief band. */
  public yFromElevation(elevationM: number): number {
    const clamped = Math.max(this.reliefMinM, Math.min(this.reliefMaxM, elevationM));
    return (
      this.bounds.minY +
      ((this.reliefMaxM - clamped) / (this.reliefMaxM - this.reliefMinM)) * (this.surfaceY - this.bounds.minY)
    );
  }

  /** Surface elevation (m) at a distance along the profile, linearly interpolated. */
  public elevationAt(distanceKm: number): number {
    const samples = this.data.elevationsM;
    const position = (distanceKm / this.data.lengthKm) * (samples.length - 1);
    const index = Math.max(0, Math.min(samples.length - 2, Math.floor(position)));
    const t = Math.max(0, Math.min(1, position - index));
    return (samples[index] as number) * (1 - t) + (samples[index + 1] as number) * t;
  }

  /** The surface profile as view points, one per elevation sample. */
  public surfacePoints(): ViewPoint[] {
    return this.data.elevationsM.map((elevationM, index) => ({
      x: this.x((this.data.lengthKm * index) / (this.data.elevationsM.length - 1)),
      y: this.yFromElevation(elevationM),
    }));
  }

  /** Crust thickness (km) at a distance: thin oceanic crust, or thick continental crust. */
  public crustThicknessKm(distanceKm: number): number {
    const elevationM = this.elevationAt(distanceKm);
    if (elevationM <= OCEANIC_ELEVATION_M) {
      return OCEANIC_CRUST_THICKNESS_KM;
    }
    if (elevationM >= 0) {
      // Mountain belts have crustal roots: the higher the ground, the deeper the root.
      return CONTINENTAL_CRUST_THICKNESS_KM + Math.min(30, (elevationM / 1000) * 6);
    }
    // Continental shelves and slopes: blend across the ocean–continent transition.
    const t = elevationM / OCEANIC_ELEVATION_M;
    return CONTINENTAL_CRUST_THICKNESS_KM * (1 - t) + OCEANIC_CRUST_THICKNESS_KM * t;
  }

  /** True where the column is oceanic crust. */
  public isOceanic(distanceKm: number): boolean {
    return this.elevationAt(distanceKm) <= OCEANIC_ELEVATION_M;
  }

  /** Representative base of the rigid lithosphere, km — used for layer labels. */
  public get lithosphereBaseKm(): number {
    return Math.min(LITHOSPHERE_THICKNESS_KM, this.data.maxDepthKm);
  }

  /**
   * Base of the rigid lithosphere at a point along the profile, km.
   *
   * Away from a spreading ridge the ocean floor cools and the plate thickens with
   * the square root of its age — the half-space cooling law, which is also why the
   * sea floor deepens away from the axis. Where the profile has no ridge the plate
   * is drawn at a constant thickness instead.
   */
  public lithosphereBaseAt(distanceKm: number): number {
    const ridge = this.crossingOfType("divergent");
    if (!ridge || this.data.key !== "divergent" || ridge.velocityMmPerYear <= 0) {
      return this.lithosphereBaseKm;
    }
    // Half the relative velocity is how fast each plate moves away from the axis;
    // mm/yr is numerically km/Myr, so this is an age in millions of years.
    const halfRateKmPerMyr = ridge.velocityMmPerYear / 2;
    const ageMyr = Math.abs(distanceKm - ridge.distanceKm) / halfRateKmPerMyr;
    const thicknessKm = LITHOSPHERE_COOLING_COEFFICIENT * Math.sqrt(ageMyr);
    return Math.min(this.lithosphereBaseKm, Math.max(this.crustThicknessKm(distanceKm) + 2, thicknessKm));
  }

  /** Base of the asthenosphere, km below sea level. */
  public get asthenosphereBaseKm(): number {
    return Math.min(ASTHENOSPHERE_BASE_KM, this.data.maxDepthKm);
  }

  /** The first boundary crossing of a given type, if the profile has one. */
  public crossingOfType(type: BoundaryType): CrossSectionData["boundaryCrossings"][number] | null {
    return this.data.boundaryCrossings.find((crossing) => crossing.type === type) ?? null;
  }

  /** The crossing that defines this section — the deepest-reaching kind present. */
  public get primaryCrossing(): CrossSectionData["boundaryCrossings"][number] | null {
    const preferred: BoundaryType =
      this.data.key === "subduction" ? "convergent" : this.data.key === "divergent" ? "divergent" : "transform";
    return this.crossingOfType(preferred) ?? this.data.boundaryCrossings[0] ?? null;
  }

  /**
   * Distance along the profile of the volcanic arc: the mean position of the
   * volcanoes projected onto it, or null when the section has none.
   */
  public get arcDistanceKm(): number | null {
    const volcanoes = this.data.volcanoes;
    if (volcanoes.length === 0) {
      return null;
    }
    return volcanoes.reduce((sum, volcano) => sum + volcano.distanceKm, 0) / volcanoes.length;
  }

  /**
   * Fits the slab centreline to the earthquake hypocentres: within each depth bin,
   * the median distance along the profile of the events in that bin. The trace
   * starts at the trench, so the drawn slab and the plotted seismicity cannot
   * disagree.
   */
  private fitSlab(): ViewPoint[] {
    const trench = this.crossingOfType("convergent");
    if (!trench || this.data.maxDepthKm < 150) {
      return [];
    }

    const points: ViewPoint[] = [{ x: this.x(trench.distanceKm), y: this.y(0) }];
    for (let depth = SLAB_MIN_DEPTH_KM; depth < this.data.maxDepthKm; depth += SLAB_BIN_KM) {
      const inBin = this.data.earthquakes
        .filter((quake) => quake.depthKm >= depth && quake.depthKm < depth + SLAB_BIN_KM)
        .map((quake) => quake.distanceKm)
        .sort((a, b) => a - b);
      if (inBin.length < SLAB_MIN_EVENTS) {
        continue;
      }
      const median = inBin[Math.floor(inBin.length / 2)] as number;
      points.push({ x: this.x(median), y: this.y(depth + SLAB_BIN_KM / 2) });
    }

    return points.length >= 3 ? points : [];
  }
}
