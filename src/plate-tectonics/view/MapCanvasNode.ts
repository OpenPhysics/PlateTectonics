/**
 * MapCanvasNode.ts
 *
 * Draws the global map: relief base, plate outlines, plate boundaries, earthquake
 * epicentres and volcanoes, all in one CanvasNode.
 *
 * ── Why a canvas instead of a Scenery Path per feature ────────────────────────
 * The datasets are large — roughly 9 000 earthquakes, 1 600 volcanoes, 1 580
 * boundary segments and a few thousand outline vertices — and every one of them
 * moves when the reconstruction clock runs, because each vertex is rotated about
 * its plate's Euler pole. Rebuilding thousands of `Shape`s per frame would not keep
 * up; painting them straight onto a canvas does, and it is the same "custom Node"
 * escape hatch Scenery provides for exactly this case.
 *
 * The node repaints only when something it depends on changes: any layer toggle,
 * the depth filter, the reconstruction time, or a colour-profile switch.
 */

import { Multilink } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { CanvasNode, type CanvasNodeOptions, type Color } from "scenerystack/scenery";
import type { BoundaryType } from "../../common/data/dataTypes.js";
import { BOUNDARY_SEGMENTS } from "../../common/data/generated/boundaryData.js";
import { EARTHQUAKES } from "../../common/data/generated/earthquakeData.js";
import { LAND_RINGS } from "../../common/data/generated/landData.js";
import { PLATES } from "../../common/data/generated/plateData.js";
import { VOLCANOES } from "../../common/data/generated/volcanoData.js";
import { HOTSPOTS } from "../../common/data/hotspots.js";
import type { MapProjection } from "../../common/MapProjection.js";
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

/** Longitude jump (degrees) that means a polyline wrapped across the antimeridian. */
const ANTIMERIDIAN_JUMP = 180;

/** Smallest magnitude in the catalogue, used as the zero point of the marker size ramp. */
const MIN_CATALOGUE_MAGNITUDE = Math.min(...EARTHQUAKES.magnitude);

/** Longitude span above which a ring is treated as encircling a pole. */
const CIRCUMPOLAR_SPAN_DEGREES = 300;

/** How a traced ring will be used, which decides how (and whether) it is closed. */
type RingMode = "fill" | "stroke" | "open";

/** Depth bands in draw order: deep first, so the shallow crowd along the trenches stays on top. */
const DEPTH_BANDS: readonly DepthBand[] = ["deep", "intermediate", "shallow"];

export type MapCanvasNodeOptions = CanvasNodeOptions;

export class MapCanvasNode extends CanvasNode {
  private readonly model: PlateTectonicsModel;
  private readonly projection: MapProjection;
  private readonly reconstruction = new PlateReconstruction();
  private readonly mapBounds: Bounds2;

  /** The shaded relief raster, once it has finished decoding. */
  private reliefImage: HTMLImageElement | null = null;

  /** True when the polyline most recently traced wrapped across the antimeridian. */
  private wrapped = false;

  public constructor(model: PlateTectonicsModel, projection: MapProjection, options?: MapCanvasNodeOptions) {
    super({ canvasBounds: projection.viewBounds, ...options });
    this.model = model;
    this.projection = projection;
    this.mapBounds = projection.viewBounds;

    // Repaint whenever anything drawn here changes. The colour properties are
    // included so a switch to Projector Mode repaints the canvas too.
    Multilink.multilinkAny(
      [
        model.showBoundariesProperty,
        model.showEarthquakesProperty,
        model.showVolcanoesProperty,
        model.showTopographyProperty,
        model.earthquakeDepthFilterProperty,
        model.timeMillionsOfYearsProperty,
        PlateTectonicsColors.oceanColorProperty,
        PlateTectonicsColors.landColorProperty,
        PlateTectonicsColors.divergentBoundaryColorProperty,
        PlateTectonicsColors.shallowQuakeColorProperty,
        PlateTectonicsColors.volcanoColorProperty,
      ],
      () => this.invalidatePaint(),
    );
  }

  /** Supplies the decoded relief raster; the map repaints once it arrives. */
  public setReliefImage(image: HTMLImageElement): void {
    this.reliefImage = image;
    this.invalidatePaint();
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    this.reconstruction.setTime(this.model.timeMillionsOfYearsProperty.value);

    context.save();
    context.beginPath();
    context.rect(this.mapBounds.minX, this.mapBounds.minY, this.mapBounds.width, this.mapBounds.height);
    context.clip();

    this.paintBase(context);
    this.paintPlates(context);
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

  // ── Base map ────────────────────────────────────────────────────────────────

  /**
   * Paints the relief raster when it applies, and otherwise a flat ocean with
   * coastlines on top.
   *
   * The raster shows the sea floor and land surface *as they are today*, so it is
   * only truthful at the present day; as soon as the user runs the clock the map
   * falls back to plain ocean-and-coastline, and the coastlines themselves move
   * with their plates.
   */
  private paintBase(context: CanvasRenderingContext2D): void {
    const showRelief =
      this.model.showTopographyProperty.value && this.model.isPresentDayProperty.value && this.reliefImage !== null;

    if (showRelief && this.reliefImage) {
      context.drawImage(
        this.reliefImage,
        this.mapBounds.minX,
        this.mapBounds.minY,
        this.mapBounds.width,
        this.mapBounds.height,
      );
      return;
    }

    context.fillStyle = PlateTectonicsColors.oceanColorProperty.value.toCSS();
    context.fillRect(this.mapBounds.minX, this.mapBounds.minY, this.mapBounds.width, this.mapBounds.height);

    context.fillStyle = PlateTectonicsColors.landColorProperty.value.toCSS();
    context.strokeStyle = PlateTectonicsColors.coastlineColorProperty.value.toCSS();
    context.lineWidth = 0.6;
    for (const ring of LAND_RINGS) {
      this.traceRing(context, ring.coords, ring.plateIndices, "fill");
      context.fill();
    }
    for (const ring of LAND_RINGS) {
      this.traceRing(context, ring.coords, ring.plateIndices, "stroke");
      context.stroke();
    }
  }

  // ── Plates ──────────────────────────────────────────────────────────────────

  /** Washes each plate in its palette colour and outlines it. */
  private paintPlates(context: CanvasRenderingContext2D): void {
    const palette = PlateTectonicsColors.platePaletteColorProperties;

    context.globalAlpha = PLATE_FILL_OPACITY;
    for (let index = 0; index < PLATES.length; index++) {
      const plate = PLATES[index] as (typeof PLATES)[number];
      const paletteColor = palette[index % palette.length] as (typeof palette)[number];
      context.fillStyle = paletteColor.value.toCSS();
      for (const ring of plate.rings) {
        this.traceRing(context, ring, index, "fill");
        context.fill();
      }
    }
    context.globalAlpha = 1;

    context.strokeStyle = PlateTectonicsColors.plateOutlineColorProperty.value.toCSS();
    context.lineWidth = 0.7;
    for (let index = 0; index < PLATES.length; index++) {
      for (const ring of (PLATES[index] as (typeof PLATES)[number]).rings) {
        this.traceRing(context, ring, index, "stroke");
        context.stroke();
      }
    }
  }

  // ── Boundaries ──────────────────────────────────────────────────────────────

  /** Draws boundary polylines grouped by type, so the colour changes three times. */
  private paintBoundaries(context: CanvasRenderingContext2D): void {
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
        this.appendPolyline(context, segment.coords, segment.plateIndex, "open", 0);
        if (this.wrapped) {
          this.appendPolyline(context, segment.coords, segment.plateIndex, "open", -this.mapBounds.width);
          this.appendPolyline(context, segment.coords, segment.plateIndex, "open", this.mapBounds.width);
        }
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
  private paintEarthquakes(context: CanvasRenderingContext2D): void {
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
        const x = this.projection.viewX(this.reconstruction.lon);
        const y = this.projection.viewY(this.reconstruction.lat);
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
  private paintVolcanoes(context: CanvasRenderingContext2D): void {
    const size = VOLCANO_MARKER_SIZE;

    context.fillStyle = PlateTectonicsColors.volcanoColorProperty.value.toCSS();
    context.beginPath();
    for (const volcano of VOLCANOES) {
      this.reconstruction.transform(volcano.lon, volcano.lat, volcano.plateIndex);
      const x = this.projection.viewX(this.reconstruction.lon);
      const y = this.projection.viewY(this.reconstruction.lat);
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
      const x = this.projection.viewX(hotspot.lon);
      const y = this.projection.viewY(hotspot.lat);
      context.moveTo(x, y - size * 1.2);
      context.lineTo(x + size, y);
      context.lineTo(x, y + size * 1.2);
      context.lineTo(x - size, y);
      context.closePath();
    }
    context.fill();
    context.stroke();
  }

  // ── Path helpers ────────────────────────────────────────────────────────────

  /**
   * Begins a path for one closed ring, repeating it either side of the map when it
   * wraps across the antimeridian so the wrapped half is not simply missing.
   *
   * @param plateIndices - a single plate index for the whole ring, or one per vertex
   * (coastlines use the per-vertex form so a coastline that straddles a boundary
   * tears apart correctly under reconstruction).
   */
  private traceRing(
    context: CanvasRenderingContext2D,
    coords: readonly number[],
    plateIndices: number | readonly number[],
    mode: RingMode,
  ): void {
    context.beginPath();
    this.appendPolyline(context, coords, plateIndices, mode, 0);
    if (this.wrapped) {
      // The ring runs off one side of the map, so repeat it a world-width either
      // way; the clip keeps whichever copy is on screen.
      this.appendPolyline(context, coords, plateIndices, mode, -this.mapBounds.width);
      this.appendPolyline(context, coords, plateIndices, mode, this.mapBounds.width);
    }
  }

  /**
   * Appends one polyline to the current path, shifted by `offsetX` view pixels.
   * `mode` says whether the path is about to be filled, stroked as a closed ring,
   * or stroked as an open line.
   *
   * Longitudes are unwrapped as the polyline is walked — each vertex is nudged by
   * whole turns so it stays within half a turn of the previous one — which keeps a
   * feature that straddles the antimeridian in one piece instead of stringing a
   * chord back across the map. {@link wrapped} records that this happened, so the
   * caller knows to repeat the ring either side.
   */
  private appendPolyline(
    context: CanvasRenderingContext2D,
    coords: readonly number[],
    plateIndices: number | readonly number[],
    mode: RingMode,
    offsetX: number,
  ): void {
    const perVertex = typeof plateIndices !== "number";
    // Once the plates are moved, two neighbouring coastline vertices that ride
    // different plates end up hundreds of kilometres apart. The polygon still has
    // to be filled across that gap, but drawing the outline across it would leave a
    // stray line over the ocean, so the outline is broken there instead.
    const breakAtPlateChanges = perVertex && mode !== "fill" && !this.reconstruction.isPresentDay;
    let previousPlateIndex = -1;
    let previousLon = Number.NaN;
    let turns = 0;
    let firstX = 0;
    let lastX = 0;
    let latitudeSum = 0;
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    if (offsetX === 0) {
      this.wrapped = false;
    }

    for (let i = 0; i < coords.length; i += 2) {
      const vertex = i / 2;
      const plateIndex = perVertex ? ((plateIndices[vertex] as number) ?? 0) : plateIndices;
      this.reconstruction.transform(coords[i] as number, coords[i + 1] as number, plateIndex);

      let lon = this.reconstruction.lon + turns * 360;
      if (vertex > 0 && Math.abs(lon - previousLon) > ANTIMERIDIAN_JUMP) {
        const correction = Math.round((previousLon - lon) / 360);
        turns += correction;
        lon += correction * 360;
        this.wrapped = true;
      }

      const x = this.projection.viewX(lon) + offsetX;
      const y = this.projection.viewY(this.reconstruction.lat);
      if (vertex === 0) {
        context.moveTo(x, y);
        firstX = x;
      } else if (breakAtPlateChanges && plateIndex !== previousPlateIndex) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
      previousPlateIndex = plateIndex;
      lastX = x;
      latitudeSum += this.reconstruction.lat;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      previousLon = lon;
    }

    // A ring that gains a whole turn of longitude encircles a pole: the North
    // American plate reaches right around the Arctic, the Antarctic plate around
    // the South Pole. To fill such a ring its two ends have to be joined over that
    // pole, or the fill would spill across the map; to stroke it they must not be
    // joined at all, or a spurious outline would run down the map.
    // Every ring in the data repeats its first vertex at the end, so an outline is
    // already closed and needs no `closePath` — which is just as well, because on a
    // ring that has been unwrapped past the antimeridian `closePath` would draw a
    // chord straight across the map.
    //
    // A fill does need closing, and a ring that gains a whole turn of longitude
    // encircles a pole — the North American plate reaches right around the Arctic,
    // the Antarctic plate around the South Pole — so its fill is routed over that
    // pole rather than being cut straight across.
    if (mode === "fill") {
      if (turns !== 0 || maxLon - minLon > CIRCUMPOLAR_SPAN_DEGREES) {
        const poleY = this.projection.viewY(latitudeSum >= 0 ? 90 : -90);
        context.lineTo(lastX, poleY);
        context.lineTo(firstX, poleY);
      }
      context.closePath();
    }
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
