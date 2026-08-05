/**
 * MapCanvasNode.ts
 *
 * The flat global map: relief base, plate outlines, plate boundaries, earthquake
 * epicentres and volcanoes, painted on one canvas in the equirectangular projection.
 *
 * Everything that is the same on the globe — which layers exist, in what order, in
 * what colours — lives in {@link EarthCanvasNode}. What is left here is the part that
 * is peculiar to drawing a sphere on a rectangle: the antimeridian, circumpolar
 * rings, and ring closure. Each rule below is there because of a specific artifact;
 * read the comments before touching them.
 */

import type { Bounds2 } from "scenerystack/dot";
import type { CanvasNodeOptions } from "scenerystack/scenery";
import type { MapProjection } from "../../common/MapProjection.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";
import { EarthCanvasNode, type RingMode } from "./EarthCanvasNode.js";

/** Longitude jump (degrees) that means a polyline wrapped across the antimeridian. */
const ANTIMERIDIAN_JUMP = 180;

/** Longitude span above which a ring is treated as encircling a pole. */
const CIRCUMPOLAR_SPAN_DEGREES = 300;

export type MapCanvasNodeOptions = CanvasNodeOptions;

export class MapCanvasNode extends EarthCanvasNode {
  private readonly mapProjection: MapProjection;
  private readonly mapBounds: Bounds2;

  /** True when the polyline most recently traced wrapped across the antimeridian. */
  private wrapped = false;

  public constructor(model: PlateTectonicsModel, projection: MapProjection, options?: MapCanvasNodeOptions) {
    super(model, projection, options);
    this.mapProjection = projection;
    this.mapBounds = projection.viewBounds;
  }

  protected override clipToViewport(context: CanvasRenderingContext2D): void {
    context.beginPath();
    context.rect(this.mapBounds.minX, this.mapBounds.minY, this.mapBounds.width, this.mapBounds.height);
    context.clip();
  }

  // ── Base map ────────────────────────────────────────────────────────────────

  /**
   * Paints the relief raster when it applies, and otherwise a flat ocean with
   * coastlines on top. The raster is drawn straight across the viewport because it
   * is rendered on exactly this grid by `npm run build-data`.
   */
  protected override paintBase(context: CanvasRenderingContext2D): void {
    if (this.showRelief && this.reliefImage) {
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

    this.paintLandRings(context);
  }

  // ── Path helpers ────────────────────────────────────────────────────────────

  /**
   * Appends one feature, repeating it either side of the map when it wraps across
   * the antimeridian so the wrapped half is not simply missing.
   */
  protected override appendFeature(
    context: CanvasRenderingContext2D,
    coords: readonly number[],
    frames: number | readonly number[],
    mode: RingMode,
    tearAtFrameChanges = false,
  ): void {
    this.appendPolyline(context, coords, frames, mode, tearAtFrameChanges, 0);
    if (this.wrapped) {
      // The feature runs off one side of the map, so repeat it a world-width either
      // way; the clip keeps whichever copy is on screen.
      this.appendPolyline(context, coords, frames, mode, tearAtFrameChanges, -this.mapBounds.width);
      this.appendPolyline(context, coords, frames, mode, tearAtFrameChanges, this.mapBounds.width);
    }
  }

  /**
   * Appends one polyline to the current path, shifted by `offsetX` view pixels.
   *
   * Longitudes are unwrapped as the polyline is walked — each vertex is nudged by
   * whole turns so it stays within half a turn of the previous one — which keeps a
   * feature that straddles the antimeridian in one piece instead of stringing a
   * chord back across the map. {@link wrapped} records that this happened, so the
   * caller knows to repeat the feature either side.
   */
  private appendPolyline(
    context: CanvasRenderingContext2D,
    coords: readonly number[],
    frames: number | readonly number[],
    mode: RingMode,
    tearAtFrameChanges: boolean,
    offsetX: number,
  ): void {
    const perVertex = typeof frames !== "number";
    // Once the plates are moved, two neighbouring coastline vertices that ride
    // different plates end up hundreds of kilometres apart. The polygon still has
    // to be filled across that gap, but drawing the outline across it would leave a
    // stray line over the ocean, so the outline is broken there instead.
    const breakAtFrameChanges = tearAtFrameChanges && perVertex && mode !== "fill" && !this.reconstruction.isPresentDay;
    let previousFrame = -1;
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
      const frame = perVertex ? ((frames[vertex] as number) ?? 0) : frames;
      this.reconstruction.transform(coords[i] as number, coords[i + 1] as number, frame);

      let lon = this.reconstruction.lon + turns * 360;
      if (vertex > 0 && Math.abs(lon - previousLon) > ANTIMERIDIAN_JUMP) {
        const correction = Math.round((previousLon - lon) / 360);
        turns += correction;
        lon += correction * 360;
        this.wrapped = true;
      }

      const x = this.mapProjection.viewX(lon) + offsetX;
      const y = this.mapProjection.viewY(this.reconstruction.lat);
      if (vertex === 0) {
        context.moveTo(x, y);
        firstX = x;
      } else if (breakAtFrameChanges && frame !== previousFrame) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
      previousFrame = frame;
      lastX = x;
      latitudeSum += this.reconstruction.lat;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      previousLon = lon;
    }

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
        const poleY = this.mapProjection.viewY(latitudeSum >= 0 ? 90 : -90);
        context.lineTo(lastX, poleY);
        context.lineTo(firstX, poleY);
      }
      context.closePath();
    }
  }
}
