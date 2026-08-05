/**
 * EarthCanvasNode.ts
 *
 * What the flat map and the 3-D globe have in common: the same datasets, painted in
 * the same order, with the same colours, on a canvas.
 *
 * ── Why a canvas instead of a Scenery Path per feature ────────────────────────
 * The datasets are large — roughly 9 000 earthquakes, 1 600 volcanoes, 1 580
 * boundary segments and a few thousand outline vertices — and every one of them
 * moves when the reconstruction clock runs, because each vertex is rotated about
 * its plate's Euler pole. Rebuilding thousands of `Shape`s per frame would not keep
 * up; painting them straight onto a canvas does, and it is the same "custom Node"
 * escape hatch Scenery provides for exactly this case.
 *
 * The node repaints only when something it depends on changes: any layer toggle, the
 * depth filter, the reconstruction time, a colour-profile switch, or — on the globe —
 * the camera.
 *
 * ── What a subclass supplies ──────────────────────────────────────────────────
 * Everything that depends on the *shape of the world*: how the drawing area is
 * clipped, what the base map looks like, and how one polyline of geographic
 * coordinates becomes a canvas path. That last one is where the two projections
 * really differ — the flat map has to cope with features that wrap across the
 * antimeridian, the globe with features that disappear round the limb.
 */

import { Multilink } from "scenerystack/axon";
import { CanvasNode, type CanvasNodeOptions, type Color } from "scenerystack/scenery";
import type { BoundaryType } from "../../common/data/dataTypes.js";
import { BOUNDARY_SEGMENTS } from "../../common/data/generated/boundaryData.js";
import { EARTHQUAKES } from "../../common/data/generated/earthquakeData.js";
import { LAND_RINGS } from "../../common/data/generated/landData.js";
import { PLATES } from "../../common/data/generated/plateData.js";
import { VOLCANOES } from "../../common/data/generated/volcanoData.js";
import { HOTSPOTS } from "../../common/data/hotspots.js";
import type { EarthProjection } from "../../common/EarthProjection.js";
import { PlateReconstruction } from "../../common/PlateReconstruction.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import {
  BOUNDARY_LINE_WIDTH,
  PLATE_FILL_OPACITY,
  QUAKE_BASE_RADIUS,
  QUAKE_RADIUS_PER_MAGNITUDE,
  VOLCANO_MARKER_SIZE,
} from "../../PlateTectonicsConstants.js";
import { type DepthBand, depthBand, passesDepthFilter } from "../model/EarthquakeDepthFilter.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";

/** Smallest magnitude in the catalogue, used as the zero point of the marker size ramp. */
const MIN_CATALOGUE_MAGNITUDE = Math.min(...EARTHQUAKES.magnitude);

/** How a traced feature will be used, which decides how (and whether) it is closed. */
export type RingMode = "fill" | "stroke" | "open";

/** Depth bands in draw order: deep first, so the shallow crowd along the trenches stays on top. */
const DEPTH_BANDS: readonly DepthBand[] = ["deep", "intermediate", "shallow"];

/**
 * How close to ±180° of longitude, or to a pole, a vertex has to be for its segment to
 * count as a dataset seam. The seams sit on those lines exactly, so this only has to
 * absorb the last digit of the stored coordinate — see {@link isSeamSegment}.
 */
const SEAM_TOLERANCE_DEGREES = 1e-6;

/**
 * Whether a source segment is a seam cut into the dataset to make it fit a rectangle,
 * rather than a real edge of the feature.
 *
 * A plate that straddles the antimeridian is stored as a polygon slit open along
 * ±180°, and one that reaches a pole is closed off along the pole itself — fourteen
 * such segments in `PLATES`, plus two along the poles. They are not edges of anything,
 * so they are never *stroked*: on the globe they would draw as bright lines up the
 * middle of the Pacific and across the Arctic, and on the flat map they do the same as
 * soon as the map is panned off centre and ±180° stops being the edge of the viewport.
 * They are still *filled*, because the polygon needs them to close.
 *
 * Judged on the source coordinates, because a seam is a property of how the dataset
 * was cut, not of where the reconstruction has since carried it.
 */
export function isSeamSegment(lonA: number, latA: number, lonB: number, latB: number): boolean {
  const onAntimeridian =
    Math.abs(Math.abs(lonA) - 180) < SEAM_TOLERANCE_DEGREES && Math.abs(Math.abs(lonB) - 180) < SEAM_TOLERANCE_DEGREES;
  const alongPole =
    Math.abs(Math.abs(latA) - 90) < SEAM_TOLERANCE_DEGREES && Math.abs(Math.abs(latB) - 90) < SEAM_TOLERANCE_DEGREES;
  return onAntimeridian || alongPole;
}

export type EarthCanvasNodeOptions = CanvasNodeOptions;

export abstract class EarthCanvasNode extends CanvasNode {
  protected readonly model: PlateTectonicsModel;
  protected readonly projection: EarthProjection;
  protected readonly reconstruction = new PlateReconstruction();

  /** The shaded relief raster, once it has finished decoding. */
  protected reliefImage: HTMLImageElement | null = null;

  protected constructor(model: PlateTectonicsModel, projection: EarthProjection, options?: EarthCanvasNodeOptions) {
    super({ canvasBounds: projection.viewBounds, ...options });
    this.model = model;
    this.projection = projection;

    // Repaint whenever anything drawn here changes. The colour properties are
    // included so a switch to Projector Mode repaints the canvas too, and the
    // camera properties so turning the globe redraws it.
    Multilink.multilinkAny(
      [
        model.showPlatesProperty,
        model.showBoundariesProperty,
        model.showEarthquakesProperty,
        model.showVolcanoesProperty,
        model.showTopographyProperty,
        model.earthquakeDepthFilterProperty,
        model.timeMillionsOfYearsProperty,
        ...projection.cameraProperties,
        PlateTectonicsColors.oceanColorProperty,
        PlateTectonicsColors.landColorProperty,
        PlateTectonicsColors.divergentBoundaryColorProperty,
        PlateTectonicsColors.shallowQuakeColorProperty,
        PlateTectonicsColors.volcanoColorProperty,
      ],
      () => this.invalidatePaint(),
    );
  }

  /** Supplies the decoded relief raster; the view repaints once it arrives. */
  public setReliefImage(image: HTMLImageElement): void {
    this.reliefImage = image;
    this.reliefImageChanged();
    this.invalidatePaint();
  }

  /** Hook for a subclass that caches something derived from the relief raster. */
  protected reliefImageChanged(): void {
    // Nothing by default.
  }

  /**
   * True when the relief raster should be drawn. The raster shows the sea floor and
   * land surface *as they are today*, so it is only truthful at the present day; as
   * soon as the user runs the clock the base map falls back to plain
   * ocean-and-coastline, and the coastlines themselves move with their plates.
   */
  protected get showRelief(): boolean {
    return (
      this.model.showTopographyProperty.value && this.model.isPresentDayProperty.value && this.reliefImage !== null
    );
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    this.reconstruction.setTime(this.model.timeMillionsOfYearsProperty.value);

    context.save();
    this.clipToViewport(context);

    this.paintBase(context);
    if (this.model.showPlatesProperty.value) {
      this.paintPlates(context);
    }
    if (this.model.showBoundariesProperty.value) {
      this.paintBoundaries(context);
    }
    if (this.model.showEarthquakesProperty.value) {
      this.paintEarthquakes(context);
    }
    if (this.model.showVolcanoesProperty.value) {
      this.paintVolcanoes(context);
    }

    context.restore();
  }

  // ── What the projection decides ─────────────────────────────────────────────

  /** Clips the context to the area the Earth occupies: a rectangle, or a disc. */
  protected abstract clipToViewport(context: CanvasRenderingContext2D): void;

  /** Paints the relief raster or the plain ocean-and-coastline base map. */
  protected abstract paintBase(context: CanvasRenderingContext2D): void;

  /**
   * Appends one polyline of geographic coordinates to the *current* path — the
   * caller owns `beginPath`, `fill` and `stroke`, so many features can share one
   * path. `mode` says whether the path is about to be filled, stroked as a closed
   * ring, or stroked as an open line.
   *
   * @param coords - flat `[lon, lat, …]` array in degrees
   * @param frames - a single motion frame for the whole feature, or one per vertex
   * (see `PlateReconstruction.MOTION_FRAMES`)
   * @param mode - how the traced path is about to be used
   * @param tearAtFrameChanges - whether to break the outline where consecutive
   * vertices ride different frames. True for coastlines, which really are cut where
   * a plate boundary crosses them — Baja California leaves the mainland behind. False
   * for plate outlines, whose vertices change frame at every triple junction while
   * the outline itself stays a single closed ring.
   */
  protected abstract appendFeature(
    context: CanvasRenderingContext2D,
    coords: readonly number[],
    frames: number | readonly number[],
    mode: RingMode,
    tearAtFrameChanges?: boolean,
  ): void;

  // ── Base map ────────────────────────────────────────────────────────────────

  /** Fills and outlines the coastlines, for a base map without the relief raster. */
  protected paintLandRings(context: CanvasRenderingContext2D): void {
    context.fillStyle = PlateTectonicsColors.landColorProperty.value.toCSS();
    for (const ring of LAND_RINGS) {
      context.beginPath();
      this.appendFeature(context, ring.coords, ring.plateIndices, "fill", true);
      context.fill();
    }

    context.strokeStyle = PlateTectonicsColors.coastlineColorProperty.value.toCSS();
    context.lineWidth = 0.6;
    for (const ring of LAND_RINGS) {
      context.beginPath();
      this.appendFeature(context, ring.coords, ring.plateIndices, "stroke", true);
      context.stroke();
    }
  }

  // ── Plates ──────────────────────────────────────────────────────────────────

  /**
   * Washes each plate in its palette colour and outlines it.
   *
   * The outline vertices ride the boundaries beneath them rather than the plate
   * itself (`PlateRecord.ringFrames`), which is what keeps neighbouring plates
   * edge to edge while the clock runs instead of overlapping and leaving gaps. A
   * plate therefore changes shape as well as position: it gains area along its
   * spreading ridges and loses it at its trenches.
   */
  protected paintPlates(context: CanvasRenderingContext2D): void {
    const palette = PlateTectonicsColors.platePaletteColorProperties;

    context.globalAlpha = PLATE_FILL_OPACITY;
    for (let index = 0; index < PLATES.length; index++) {
      const plate = PLATES[index] as (typeof PLATES)[number];
      const paletteColor = palette[index % palette.length] as (typeof palette)[number];
      context.fillStyle = paletteColor.value.toCSS();
      plate.rings.forEach((ring, ringIndex) => {
        context.beginPath();
        this.appendFeature(context, ring, plate.ringFrames[ringIndex] as readonly number[], "fill");
        context.fill();
      });
    }
    context.globalAlpha = 1;

    context.strokeStyle = PlateTectonicsColors.plateOutlineColorProperty.value.toCSS();
    context.lineWidth = 0.7;
    for (const plate of PLATES) {
      plate.rings.forEach((ring, ringIndex) => {
        context.beginPath();
        this.appendFeature(context, ring, plate.ringFrames[ringIndex] as readonly number[], "stroke");
        context.stroke();
      });
    }
  }

  // ── Boundaries ──────────────────────────────────────────────────────────────

  /** Draws boundary polylines grouped by type, so the colour changes three times. */
  protected paintBoundaries(context: CanvasRenderingContext2D): void {
    context.lineWidth = BOUNDARY_LINE_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const type of ["convergent", "divergent", "transform"] as const) {
      context.strokeStyle = boundaryColor(type).toCSS();
      context.beginPath();
      for (const segment of BOUNDARY_SEGMENTS) {
        if (segment.type !== type) {
          continue;
        }
        this.appendFeature(context, segment.coords, segment.frameIndex, "open");
      }
      context.stroke();
    }
  }

  // ── Earthquakes ─────────────────────────────────────────────────────────────

  /**
   * Draws every epicentre that passes the depth filter, one canvas path per depth
   * band, sized by magnitude. Deep events are painted first so the dense shallow
   * ribbon along the trenches and ridges stays legible on top of them.
   */
  protected paintEarthquakes(context: CanvasRenderingContext2D): void {
    const filter = this.model.earthquakeDepthFilterProperty.value;
    const { lon, lat, depthKm, magnitude, plateIndex } = EARTHQUAKES;

    for (const band of DEPTH_BANDS) {
      context.fillStyle = quakeColor(band).toCSS();
      context.beginPath();
      for (let i = 0; i < lon.length; i++) {
        const depth = depthKm[i] as number;
        if (depthBand(depth) !== band || !passesDepthFilter(depth, filter)) {
          continue;
        }
        this.reconstruction.transform(lon[i] as number, lat[i] as number, plateIndex[i] as number);
        if (!this.projection.project(this.reconstruction.lon, this.reconstruction.lat)) {
          continue;
        }
        const x = this.projection.x;
        const y = this.projection.y;
        const radius =
          QUAKE_BASE_RADIUS + ((magnitude[i] as number) - MIN_CATALOGUE_MAGNITUDE) * QUAKE_RADIUS_PER_MAGNITUDE;
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, 2 * Math.PI);
      }
      context.fill();
    }
  }

  // ── Volcanoes and hotspots ──────────────────────────────────────────────────

  /**
   * Volcanoes are upward triangles; hotspots are diamonds, because a hotspot is a
   * feature of the mantle below rather than of the plate above — it stays put while
   * the plate slides over it.
   */
  protected paintVolcanoes(context: CanvasRenderingContext2D): void {
    const size = VOLCANO_MARKER_SIZE;

    context.fillStyle = PlateTectonicsColors.volcanoColorProperty.value.toCSS();
    context.beginPath();
    for (const volcano of VOLCANOES) {
      this.reconstruction.transform(volcano.lon, volcano.lat, volcano.plateIndex);
      if (!this.projection.project(this.reconstruction.lon, this.reconstruction.lat)) {
        continue;
      }
      const x = this.projection.x;
      const y = this.projection.y;
      context.moveTo(x, y - size);
      context.lineTo(x + size * 0.9, y + size * 0.7);
      context.lineTo(x - size * 0.9, y + size * 0.7);
      context.closePath();
    }
    context.fill();

    context.fillStyle = PlateTectonicsColors.hotspotColorProperty.value.toCSS();
    context.strokeStyle = PlateTectonicsColors.labelHaloColorProperty.value.toCSS();
    context.lineWidth = 0.8;
    context.beginPath();
    for (const hotspot of HOTSPOTS) {
      if (!this.projection.project(hotspot.lon, hotspot.lat)) {
        continue;
      }
      const x = this.projection.x;
      const y = this.projection.y;
      context.moveTo(x, y - size * 1.2);
      context.lineTo(x + size, y);
      context.lineTo(x, y + size * 1.2);
      context.lineTo(x - size, y);
      context.closePath();
    }
    context.fill();
    context.stroke();
  }
}

/** Colour property for a boundary type. */
function boundaryColor(type: BoundaryType): Color {
  if (type === "divergent") {
    return PlateTectonicsColors.divergentBoundaryColorProperty.value;
  }
  return type === "convergent"
    ? PlateTectonicsColors.convergentBoundaryColorProperty.value
    : PlateTectonicsColors.transformBoundaryColorProperty.value;
}

/** Colour property for an earthquake depth band. */
function quakeColor(band: DepthBand): Color {
  if (band === "shallow") {
    return PlateTectonicsColors.shallowQuakeColorProperty.value;
  }
  return band === "intermediate"
    ? PlateTectonicsColors.intermediateQuakeColorProperty.value
    : PlateTectonicsColors.deepQuakeColorProperty.value;
}
