/**
 * DeepTimeCanvasNode.ts
 *
 * The reconstructed Earth, painted onto a rotatable globe.
 *
 * ── The two halves, drawn together ────────────────────────────────────────────
 * This screen draws data of two different kinds at once, and the difference is
 * visible if you look for it:
 *
 *  - The **continents** are present-day coastlines carried by an interpolated
 *    rotation, so they move *continuously* — dragging the time slider glides them.
 *  - The **plates and boundaries** are resolved topologies, baked every 5 Myr, so
 *    they *step*. A ridge appears between one snapshot and the next rather than
 *    growing.
 *
 * That is not an oversight; it falls out of what the data can be. A coastline has
 * present-day geometry to rotate. A plate polygon does not — it is rebuilt at each
 * instant from whichever boundaries bounded it then, and plates are born and die.
 * See `dataTypes.ts` and `doc/model.md`.
 *
 * ── Why a canvas ──────────────────────────────────────────────────────────────
 * The same reason as `EarthCanvasNode`: every vertex moves whenever the clock does,
 * so rebuilding Scenery `Shape`s per frame would not keep up. The sphere-specific
 * path work — subdividing long segments, cutting at the limb, closing a polygon that
 * runs round the back — is all in {@link GlobeFeaturePainter}, shared with the Plate
 * Tectonics screen's globe.
 */

import { Multilink } from "scenerystack/axon";
import { CanvasNode, type CanvasNodeOptions, type Color } from "scenerystack/scenery";
import { DeepTimeReconstruction, IDENTITY_ROTATION_SLOT } from "../../common/DeepTimeReconstruction.js";
import type { BoundaryType } from "../../common/data/dataTypes.js";
import { HISTORY_COASTLINES } from "../../common/data/generated/plateHistoryData.js";
import { PLATE_SNAPSHOTS } from "../../common/data/generated/plateSnapshotData.js";
import type { GlobeProjection } from "../../common/GlobeProjection.js";
import { GlobeFeaturePainter } from "../../common/view/GlobeFeaturePainter.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { BOUNDARY_LINE_WIDTH, PLATE_FILL_OPACITY } from "../../PlateTectonicsConstants.js";
import type { DeepTimeModel } from "../model/DeepTimeModel.js";

const TWO_PI = 2 * Math.PI;

/** Opacity of the deforming-belt wash, below the plate wash so it reads as texture. */
const DEFORMING_FILL_OPACITY = 0.5;

export type DeepTimeCanvasNodeOptions = CanvasNodeOptions;

export class DeepTimeCanvasNode extends CanvasNode {
  private readonly model: DeepTimeModel;
  private readonly globe: GlobeProjection;
  private readonly reconstruction = new DeepTimeReconstruction();
  private readonly painter: GlobeFeaturePainter;

  /** Offscreen canvas the plate wash is composited on; see {@link paintPlates}. */
  private washCanvas: HTMLCanvasElement | null = null;

  public constructor(model: DeepTimeModel, projection: GlobeProjection, options?: DeepTimeCanvasNodeOptions) {
    super({ canvasBounds: projection.viewBounds, ...options });
    this.model = model;
    this.globe = projection;
    this.painter = new GlobeFeaturePainter(projection, this.reconstruction);

    Multilink.multilinkAny(
      [
        model.showCoastlinesProperty,
        model.showPlatesProperty,
        model.showBoundariesProperty,
        model.showDeformingProperty,
        model.timeMaProperty,
        ...projection.cameraProperties,
        PlateTectonicsColors.oceanColorProperty,
        PlateTectonicsColors.landColorProperty,
        PlateTectonicsColors.coastlineColorProperty,
        PlateTectonicsColors.plateOutlineColorProperty,
        PlateTectonicsColors.divergentBoundaryColorProperty,
        PlateTectonicsColors.convergentBoundaryColorProperty,
        PlateTectonicsColors.transformBoundaryColorProperty,
        ...PlateTectonicsColors.platePaletteColorProperties,
      ],
      () => this.invalidatePaint(),
    );
  }

  /**
   * Offscreen canvas the plate wash is composited on, created once and reused. Returns
   * null if the browser will not give a 2-D context, in which case the wash is skipped
   * and the boundaries and continents still draw.
   */
  private plateWashLayer(width: number, height: number): CanvasRenderingContext2D | null {
    const canvas = this.washCanvas ?? document.createElement("canvas");
    this.washCanvas = canvas;
    const pixelWidth = Math.ceil(width);
    const pixelHeight = Math.ceil(height);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    return canvas.getContext("2d");
  }

  /** The snapshot currently on screen — what the stepped layers are drawn from. */
  private get snapshot(): (typeof PLATE_SNAPSHOTS)[number] {
    this.reconstruction.setTime(this.model.timeMaProperty.value);
    return PLATE_SNAPSHOTS[this.reconstruction.nearestSnapshotIndex] as (typeof PLATE_SNAPSHOTS)[number];
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    this.reconstruction.setTime(this.model.timeMaProperty.value);
    const snapshot = this.snapshot;

    context.save();
    context.beginPath();
    context.arc(this.globe.centerX, this.globe.centerY, this.globe.radius, 0, TWO_PI);
    context.clip();

    context.fillStyle = PlateTectonicsColors.oceanColorProperty.value.toCSS();
    context.beginPath();
    context.arc(this.globe.centerX, this.globe.centerY, this.globe.radius, 0, TWO_PI);
    context.fill();

    if (this.model.showPlatesProperty.value) {
      this.paintPlates(context, snapshot);
    }
    if (this.model.showDeformingProperty.value) {
      this.paintDeformingBelts(context, snapshot);
    }
    // Over the plate wash and under the boundaries: the continents are the thing being
    // watched, and a ridge running through one should still be legible on top of it.
    if (this.model.showCoastlinesProperty.value) {
      this.paintCoastlines(context);
    }
    if (this.model.showBoundariesProperty.value) {
      this.paintBoundaries(context, snapshot);
    }

    context.restore();
  }

  // ── Continents ──────────────────────────────────────────────────────────────

  /**
   * Fills and outlines the reconstructed coastlines.
   *
   * Each piece was cookie-cut by plate ID at the present day, so it carries a single
   * rotation for the whole piece — India is one piece, and it crosses the Indian Ocean
   * as a unit. Nothing has to tear, which is why these take a single frame index
   * rather than one per vertex.
   */
  private paintCoastlines(context: CanvasRenderingContext2D): void {
    context.fillStyle = PlateTectonicsColors.landColorProperty.value.toCSS();
    for (const piece of HISTORY_COASTLINES) {
      context.beginPath();
      this.painter.appendFeature(context, piece.coords, piece.rotationSlot, "fill");
      context.fill();
    }

    context.strokeStyle = PlateTectonicsColors.coastlineColorProperty.value.toCSS();
    context.lineWidth = 0.6;
    for (const piece of HISTORY_COASTLINES) {
      context.beginPath();
      this.painter.appendFeature(context, piece.coords, piece.rotationSlot, "stroke");
      context.stroke();
    }
  }

  // ── Plates ──────────────────────────────────────────────────────────────────

  /**
   * Washes each rigid plate in its palette colour and outlines it.
   *
   * The colour is keyed on the GPlates plate ID rather than on the plate's position in
   * the snapshot, so a plate keeps its colour from one instant to the next instead of
   * flickering as its neighbours appear and vanish.
   *
   * The ring is already the resolved topology at this instant, so it is drawn as it
   * stands — see {@link DeepTimeCanvasNode.appendResolved}.
   *
   * ── Why the wash goes through an offscreen canvas ───────────────────────────
   * The model's topologies are not a clean tiling: several plate IDs resolve to more
   * than one polygon at the same instant — flat slabs and sub-plates that overlap the
   * plate they belong to. Filling each one straight onto the globe at
   * {@link PLATE_FILL_OPACITY} stacks the alpha wherever two overlap, and the overlaps
   * are narrow slivers, so they came out as near-black streaks across the Pacific.
   * Compositing the whole wash once at full opacity and then drawing *that* at
   * `PLATE_FILL_OPACITY` makes an overlap look exactly like a single plate, which is
   * what it should look like.
   */
  private paintPlates(context: CanvasRenderingContext2D, snapshot: (typeof PLATE_SNAPSHOTS)[number]): void {
    const palette = PlateTectonicsColors.platePaletteColorProperties;
    const bounds = this.globe.viewBounds;
    const layer = this.plateWashLayer(bounds.width, bounds.height);

    if (layer) {
      layer.clearRect(0, 0, bounds.width, bounds.height);
      layer.save();
      // The painter works in the projection's view coordinates, which need not start
      // at the origin; the offscreen canvas does.
      layer.translate(-bounds.minX, -bounds.minY);
      for (const plate of snapshot.plates) {
        if (plate.deforming) {
          continue;
        }
        const paletteColor = palette[plate.plateId % palette.length] as (typeof palette)[number];
        layer.fillStyle = paletteColor.value.toCSS();
        layer.beginPath();
        this.appendResolved(layer, plate.ring, "fill");
        layer.fill();
      }
      layer.restore();

      context.globalAlpha = PLATE_FILL_OPACITY;
      context.drawImage(layer.canvas, bounds.minX, bounds.minY);
      context.globalAlpha = 1;
    }

    context.strokeStyle = PlateTectonicsColors.plateOutlineColorProperty.value.toCSS();
    context.lineWidth = 0.7;
    for (const plate of snapshot.plates) {
      if (plate.deforming) {
        continue;
      }
      context.beginPath();
      this.appendResolved(context, plate.ring, "stroke");
      context.stroke();
    }
  }

  /**
   * Washes the deforming belts — the orogens and rifts where the model does not treat
   * the lithosphere as rigid. Drawn in the coastline colour at low opacity rather than
   * in a palette colour, because a belt is not a plate and should not read as one.
   */
  private paintDeformingBelts(context: CanvasRenderingContext2D, snapshot: (typeof PLATE_SNAPSHOTS)[number]): void {
    context.globalAlpha = DEFORMING_FILL_OPACITY;
    context.fillStyle = PlateTectonicsColors.plateOutlineColorProperty.value.toCSS();
    for (const plate of snapshot.plates) {
      if (!plate.deforming) {
        continue;
      }
      context.beginPath();
      this.appendResolved(context, plate.ring, "fill");
      context.fill();
    }
    context.globalAlpha = 1;
  }

  // ── Boundaries ──────────────────────────────────────────────────────────────

  /** Draws the boundaries grouped by kind, so the colour changes three times. */
  private paintBoundaries(context: CanvasRenderingContext2D, snapshot: (typeof PLATE_SNAPSHOTS)[number]): void {
    context.lineWidth = BOUNDARY_LINE_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const set of snapshot.boundaries) {
      context.strokeStyle = boundaryColor(set.type).toCSS();
      context.beginPath();
      for (const line of set.lines) {
        this.appendResolved(context, line, "open");
      }
      context.stroke();
    }
  }

  /**
   * Appends geometry that is *already* at the reconstructed instant, so no rotation is
   * applied to it. The painter still does the work that matters on a sphere —
   * subdividing long segments and cutting at the limb.
   */
  private appendResolved(
    context: CanvasRenderingContext2D,
    coords: readonly number[],
    mode: "fill" | "stroke" | "open",
  ): void {
    this.painter.appendFeature(context, coords, IDENTITY_ROTATION_SLOT, mode);
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
