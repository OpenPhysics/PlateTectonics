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
 *
 * The map can be panned and zoomed, which turns the antimeridian from a fixed seam at
 * the edge of the viewport into a seam that can be anywhere — so a feature is traced
 * relative to wherever the camera is looking, and repeated a world-width either side
 * whenever a neighbouring copy of the world would show it too.
 */

import type { Bounds2 } from "scenerystack/dot";
import type { CanvasNodeOptions } from "scenerystack/scenery";
import type { MapProjection } from "../../common/MapProjection.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { EarthModel } from "../model/EarthModel.js";
import { EarthCanvasNode, isSeamSegment, type RingMode } from "./EarthCanvasNode.js";

/** Longitude jump (degrees) that means a polyline wrapped across the antimeridian. */
const ANTIMERIDIAN_JUMP = 180;

/**
 * Whether the segment arriving at the vertex starting at index `i` of a flat
 * `[lon, lat, …]` array is one of the seams the dataset was cut along. False at the
 * first vertex, which no segment arrives at.
 */
function isSeamAt(coords: readonly number[], i: number): boolean {
  return (
    i >= 2 &&
    isSeamSegment(coords[i - 2] as number, coords[i - 1] as number, coords[i] as number, coords[i + 1] as number)
  );
}

/** Longitude span above which a ring is treated as encircling a pole. */
const CIRCUMPOLAR_SPAN_DEGREES = 300;

export type MapCanvasNodeOptions = CanvasNodeOptions;

export class MapCanvasNode extends EarthCanvasNode {
  private readonly mapProjection: MapProjection;
  private readonly mapBounds: Bounds2;

  /** View-x extent of the polyline most recently traced at offset zero. */
  private featureMinX = 0;
  private featureMaxX = 0;

  public constructor(model: EarthModel, projection: MapProjection, options?: MapCanvasNodeOptions) {
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
   * coastlines on top. The raster covers exactly one world, because it is rendered on
   * exactly this grid by `npm run build-data`, so it is drawn into the world rectangle
   * and repeated either side for whichever part of the seam is on screen.
   */
  protected override paintBase(context: CanvasRenderingContext2D): void {
    // Ocean first even under the raster: the raster's copies meet at a fractional
    // pixel once the map is panned, and ocean is a better colour to see through a
    // hairline seam than whatever was on the canvas before.
    context.fillStyle = PlateTectonicsColors.oceanColorProperty.value.toCSS();
    context.fillRect(this.mapBounds.minX, this.mapBounds.minY, this.mapBounds.width, this.mapBounds.height);

    if (this.showRelief && this.reliefImage) {
      const left = this.mapProjection.viewX(-180);
      const top = this.mapProjection.viewY(90);
      const worldWidth = this.mapProjection.worldWidth;
      const worldHeight = this.mapProjection.worldHeight;
      for (const offsetX of [-worldWidth, 0, worldWidth]) {
        if (this.worldCopyVisible(left, left + worldWidth, offsetX)) {
          context.drawImage(this.reliefImage, left + offsetX, top, worldWidth, worldHeight);
        }
      }
      return;
    }

    this.paintLandRings(context);
  }

  // ── Path helpers ────────────────────────────────────────────────────────────

  /**
   * Appends one feature, repeating it a world-width either side whenever the copy of
   * the world there would put it on screen — which is what covers the antimeridian
   * seam, wherever the camera has moved it to.
   */
  protected override appendFeature(
    context: CanvasRenderingContext2D,
    coords: readonly number[],
    frames: number | readonly number[],
    mode: RingMode,
    tearAtFrameChanges = false,
  ): void {
    this.appendPolyline(context, coords, frames, mode, tearAtFrameChanges, 0);

    const worldWidth = this.mapProjection.worldWidth;
    for (const offsetX of [-worldWidth, worldWidth]) {
      if (this.worldCopyVisible(this.featureMinX, this.featureMaxX, offsetX)) {
        this.appendPolyline(context, coords, frames, mode, tearAtFrameChanges, offsetX);
      }
    }
  }

  /**
   * True when something spanning `[minX, maxX]` in view pixels, shifted by `offsetX`,
   * has any part inside the viewport. One world-width either side is enough: no
   * feature in the data spans more than a full turn of longitude, so a copy two
   * worlds away can never reach back into a viewport the nearer copy misses.
   */
  private worldCopyVisible(minX: number, maxX: number, offsetX: number): boolean {
    return maxX + offsetX >= this.mapBounds.minX && minX + offsetX <= this.mapBounds.maxX;
  }

  /**
   * Appends one polyline to the current path, shifted by `offsetX` view pixels, and —
   * at offset zero — records its view-x extent for {@link appendFeature}.
   *
   * Longitudes are unwrapped as the polyline is walked — each vertex is nudged by
   * whole turns so it stays within half a turn of the previous one — which keeps a
   * feature that straddles the antimeridian in one piece instead of stringing a
   * chord back across the map. The *first* vertex is unwrapped against the camera
   * instead, which puts the whole feature on the copy of the world the map is
   * currently looking at.
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
    // ±180° used to be the edge of the viewport, where the seams the dataset was cut
    // along could not be seen. Panning moves that edge, so an outline now has to be
    // broken at them or the Pacific gets a bright line up the middle of it.
    const breakAtSeams = mode !== "fill";
    const centerLon = this.mapProjection.centerLongitudeProperty.value;
    let previousFrame = -1;
    let previousLon = Number.NaN;
    // Whole turns that carry the feature to the camera, fixed at the first vertex,
    // kept apart from the turns the walk accumulates so that `turns` below keeps
    // meaning "this ring went right round the world".
    let originTurns = 0;
    let turns = 0;
    let firstX = 0;
    let lastX = 0;
    let latitudeSum = 0;
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < coords.length; i += 2) {
      const vertex = i / 2;
      const frame = perVertex ? ((frames[vertex] as number) ?? 0) : frames;
      this.reconstruction.transform(coords[i] as number, coords[i + 1] as number, frame);

      if (vertex === 0) {
        originTurns = Math.round((centerLon - this.reconstruction.lon) / 360);
      }
      let lon = this.reconstruction.lon + (originTurns + turns) * 360;
      if (vertex > 0 && Math.abs(lon - previousLon) > ANTIMERIDIAN_JUMP) {
        const correction = Math.round((previousLon - lon) / 360);
        turns += correction;
        lon += correction * 360;
      }

      const x = this.mapProjection.viewX(lon) + offsetX;
      const y = this.mapProjection.viewY(this.reconstruction.lat);
      const torn = (breakAtFrameChanges && frame !== previousFrame) || (breakAtSeams && isSeamAt(coords, i));
      if (vertex === 0) {
        context.moveTo(x, y);
        firstX = x;
      } else if (torn) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
      previousFrame = frame;
      lastX = x;
      latitudeSum += this.reconstruction.lat;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      previousLon = lon;
    }

    if (offsetX === 0) {
      this.featureMinX = minX;
      this.featureMaxX = maxX;
    }

    // Every ring in the data repeats its first vertex at the end, so an outline is
    // already closed and needs no `closePath` — which is just as well, because on a
    // ring that has been unwrapped past the antimeridian `closePath` would draw a
    // chord straight across the map. A fill does need closing.
    if (mode === "fill") {
      this.closeFill(context, {
        circumpolar: turns !== 0 || maxLon - minLon > CIRCUMPOLAR_SPAN_DEGREES,
        northern: latitudeSum >= 0,
        firstX,
        lastX,
      });
    }
  }

  /**
   * Closes a filled ring. A ring that gains a whole turn of longitude encircles a pole
   * — the North American plate reaches right around the Arctic, the Antarctic plate
   * around the South Pole — so its fill is routed over that pole rather than being cut
   * straight across the map.
   */
  private closeFill(
    context: CanvasRenderingContext2D,
    ring: { circumpolar: boolean; northern: boolean; firstX: number; lastX: number },
  ): void {
    if (ring.circumpolar) {
      const poleY = this.mapProjection.viewY(ring.northern ? 90 : -90);
      context.lineTo(ring.lastX, poleY);
      context.lineTo(ring.firstX, poleY);
    }
    context.closePath();
  }
}
