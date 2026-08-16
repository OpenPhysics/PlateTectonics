/**
 * CrustLabelsNode.ts
 *
 * The text layer over the Crust screen's cross-section: which block is which, how far
 * each shell reaches at the current zoom, and where sea level is.
 *
 * Scenery `Text` rather than canvas text, so every label is localizable and reachable
 * by a screen reader — the same split the rest of the sim makes between the painted
 * picture and the words on top of it.
 *
 * Positioned through a SectionPlacement rather than against the flat view's scale, so
 * the same labels land on the same features whether the screen is showing the flat
 * section or the 3-D block. Sea level is drawn as whatever polyline the placement says
 * it is: a straight line on the flat view, an arc on the block, because sea level is a
 * circle and a chord through it would put the horizon under the ocean.
 *
 * ── Extents, not captions ─────────────────────────────────────────────────────
 * The shells and the user's own crust are named by {@link RangeLabelNode}, which draws a
 * bar from the top of the range to its bottom. That is what PhET did and it is doing real
 * work here: the whole screen is about how thick the middle block is and how deep it
 * reaches, and a caption floating in a band cannot say either. The user's block in
 * particular had no extent indicator at all, so the thickness slider had nothing to read
 * against.
 *
 * Each range sits at its own model x — see {@link SHELL_LABEL_X_FRACTION} — because five
 * extents at the same x would be five bars in one column with their names on top of one
 * another. That staggering is PhET's, and it is why its layer labels are legible at the
 * whole-Earth zoom.
 */

import { Multilink } from "scenerystack/axon";
import { type Bounds2, Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Node, type NodeOptions, Path, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import type { EARTH_LAYERS } from "../../common/model/EarthStructure.js";
import { RangeLabelNode } from "../../common/view/RangeLabelNode.js";
import type { SectionPlacement } from "../../common/view/SectionPlacement.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import {
  CRUST_BLOCK_HALF_WIDTH_M,
  INNER_OUTER_CORE_BOUNDARY_KM,
  MANTLE_CORE_BOUNDARY_KM,
  UPPER_LOWER_MANTLE_BOUNDARY_KM,
} from "../../PlateTectonicsConstants.js";
import type { CrustModel, CrustZoom } from "../model/CrustModel.js";

const BLOCK_LABEL_FONT = new PhetFont({ size: 12, weight: "bold" });
const LAYER_LABEL_FONT = new PhetFont(12);
const SEA_LEVEL_FONT = new PhetFont(10);

/** Gap between a block label and the surface it names, view pixels. */
const BLOCK_LABEL_MARGIN = 6;

/**
 * Model x of each shell's extent bar, as a fraction of the viewport's half-width.
 *
 * Spread across the picture so the bars do not stack. Alternating sides rather than
 * marching in one direction, so that neighbouring shells — the ones whose bars meet at a
 * shared boundary — are the furthest apart.
 */
const SHELL_LABEL_X_FRACTION: Record<(typeof EARTH_LAYERS)[number], number> = {
  crust: -0.5,
  upperMantle: -0.45,
  lowerMantle: 0.3,
  outerCore: -0.72,
  innerCore: 0.72,
};

/** Model x of the user's crust extent bar, inside the middle block. */
const MY_CRUST_LABEL_X_M = -0.5 * CRUST_BLOCK_HALF_WIDTH_M;

export type CrustLabelsNodeOptions = NodeOptions;

export class CrustLabelsNode extends Node {
  private readonly model: CrustModel;
  /** Named viewBounds, not bounds: Node.bounds is a property on the base class. */
  private readonly viewBounds: Bounds2;

  private placement: SectionPlacement;

  public constructor(
    model: CrustModel,
    placement: SectionPlacement,
    viewBounds: Bounds2,
    providedOptions?: CrustLabelsNodeOptions,
  ) {
    super(providedOptions);
    this.model = model;
    this.viewBounds = viewBounds;
    this.placement = placement;

    const rebuild = Multilink.multilinkAny(
      [model.showLabelsProperty, model.zoomProperty, model.crustElevationProperty, model.crustThicknessProperty],
      () => this.rebuild(),
    );

    this.disposeEmitter.addListener(() => rebuild.dispose());
  }

  /** Re-aims the labels, after a zoom change or a switch between the two views. */
  public setPlacement(placement: SectionPlacement): void {
    this.placement = placement;
    this.rebuild();
  }

  private rebuild(): void {
    this.removeAllChildren();
    if (!this.model.showLabelsProperty.value) {
      return;
    }

    const strings = StringManager.getInstance();
    const section = strings.getSectionStrings();
    const placement = this.placement;
    const bounds = this.viewBounds;
    const model = this.model;

    // ── Sea level ─────────────────────────────────────────────────────────────
    // Drawn at every zoom: without it there is no way to tell whether a block's
    // surface is a plateau or a sea floor, which is half of what the screen is about.
    const seaLevel = placement.contour(0);
    const seaLevelStart = seaLevel[0];
    const seaLevelY = placement.modelToView(0, 0).y;
    if (seaLevelStart && seaLevel.some((point) => point.y > bounds.minY && point.y < bounds.maxY)) {
      const shape = new Shape().moveToPoint(seaLevelStart);
      for (const point of seaLevel.slice(1)) {
        shape.lineToPoint(point);
      }
      this.addChild(
        new Path(shape, {
          stroke: PlateTectonicsColors.secondaryTextColorProperty,
          lineWidth: 1,
          lineDash: [4, 4],
        }),
      );
      this.addChild(
        new Text(section.seaLevelStringProperty, {
          font: SEA_LEVEL_FONT,
          fill: PlateTectonicsColors.secondaryTextColorProperty,
          left: bounds.minX + 4,
          bottom: seaLevelStart.y - 2,
          maxWidth: 90,
        }),
      );
    }

    // ── The three blocks ──────────────────────────────────────────────────────
    // Only at the crust zoom: once the whole Earth is on screen the blocks are a few
    // pixels tall and a label on each would be three labels on one line of pixels.
    if (model.zoomProperty.value === "crust") {
      // The middle block gets no caption: its extent bar already names it, and a caption
      // as well put the word "Crust" on the screen twice within a few pixels. The outer
      // two keep theirs — they are fixed, so their names are the only thing distinguishing
      // them, and neither carries an extent.
      const blockNames = [section.oceanicCrustStringProperty, null, section.continentalCrustStringProperty];
      model.columns.forEach((column, index) => {
        const name = blockNames[index];
        if (!name) {
          return;
        }
        const surface = placement.modelToView((column.leftM + column.rightM) / 2, column.elevationM);
        const centreX = surface.x;
        const surfaceY = surface.y;
        const label = new Text(name, {
          font: BLOCK_LABEL_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          centerX: centreX,
          maxWidth: (bounds.width / model.columns.length) * 0.9,
        });

        // A block standing above the water gets its name in the sky above it. A block
        // whose surface is under water gets it just *inside* the rock instead: the space
        // above such a block is only a few pixels of sea, and a label placed there lands
        // on the sea-level line and its caption — which is exactly where the user's own
        // block sits at its default thickness.
        if (surfaceY <= seaLevelY - label.height - BLOCK_LABEL_MARGIN) {
          label.bottom = surfaceY - BLOCK_LABEL_MARGIN;
        } else {
          label.top = surfaceY + BLOCK_LABEL_MARGIN;
        }
        this.addChild(label);
      });
    }

    // ── The user's crust, as an extent ────────────────────────────────────────
    this.addMyCrustLabel();

    // ── The shells below ──────────────────────────────────────────────────────
    this.addLayerLabels(model.zoomProperty.value);
  }

  /**
   * The middle block's thickness, drawn as a bar from its surface to its base.
   *
   * The one label on this screen that answers the question the thickness slider asks. Only
   * at the crust zoom: at the two wider zooms the block is thinner than the bar's own
   * crossbars, and the label would collapse into a leader line pointing at a hairline.
   */
  private addMyCrustLabel(): void {
    if (this.model.zoomProperty.value !== "crust") {
      return;
    }
    const section = StringManager.getInstance().getSectionStrings();
    const column = this.model.myCrust;

    this.addChild(
      new RangeLabelNode({
        placement: this.placement,
        topM: new Vector2(MY_CRUST_LABEL_X_M, column.elevationM),
        bottomM: new Vector2(MY_CRUST_LABEL_X_M, column.elevationM - column.thicknessM),
        label: section.crustStringProperty,
        viewBounds: this.viewBounds,
        fill: PlateTectonicsColors.textColorProperty,
        font: LAYER_LABEL_FONT,
        maxTextWidth: 110,
      }),
    );
  }

  /** Each shell the current zoom reaches, as a bar from its top to its bottom. */
  private addLayerLabels(zoom: CrustZoom): void {
    const section = StringManager.getInstance().getSectionStrings();
    const placement = this.placement;
    const bounds = this.viewBounds;

    // At the crust zoom only the topmost mantle is in frame, and it is not "upper mantle"
    // at that scale — it is just what the blocks are floating in. The bar still runs to
    // the real base of the upper mantle; the label is what the clamp pulls back on screen.
    const upperMantleName = zoom === "crust" ? section.mantleStringProperty : section.upperMantleStringProperty;

    // Top and bottom of each shell in metres of elevation, deepest boundary last.
    //
    // The upper mantle starts at the base of the user's crust, which is what PhET tracked
    // — the mantle really does begin where that block ends, and at the crust zoom that
    // boundary is the one thing on screen moving as the sliders are dragged. At the wider
    // zooms it is within a pixel of sea level either way.
    const myCrustBaseM = this.model.myCrust.elevationM - this.model.myCrust.thicknessM;
    const bands: {
      layer: (typeof EARTH_LAYERS)[number];
      topM: number;
      bottomM: number;
      name: typeof section.mantleStringProperty;
    }[] = [
      {
        layer: "upperMantle",
        topM: zoom === "crust" ? myCrustBaseM : Math.min(0, myCrustBaseM),
        bottomM: -UPPER_LOWER_MANTLE_BOUNDARY_KM * 1000,
        name: upperMantleName,
      },
      {
        layer: "lowerMantle",
        topM: -UPPER_LOWER_MANTLE_BOUNDARY_KM * 1000,
        bottomM: -MANTLE_CORE_BOUNDARY_KM * 1000,
        name: section.lowerMantleStringProperty,
      },
      {
        layer: "outerCore",
        topM: -MANTLE_CORE_BOUNDARY_KM * 1000,
        bottomM: -INNER_OUTER_CORE_BOUNDARY_KM * 1000,
        name: section.outerCoreStringProperty,
      },
      {
        layer: "innerCore",
        topM: -INNER_OUTER_CORE_BOUNDARY_KM * 1000,
        bottomM: placement.bottomM,
        name: section.innerCoreStringProperty,
      },
    ];

    for (const band of bands) {
      const xM = SHELL_LABEL_X_FRACTION[band.layer] * placement.halfWidthM;
      const topY = placement.modelToView(xM, band.topM).y;

      // A shell whose top is already below the section is not reachable at this zoom.
      // Unlike the old "too thin to label" test, a shell that *is* reached but is squeezed
      // still gets a label — that is what the collapsed style exists for, and dropping it
      // was the divergence from PhET this replaces.
      if (topY >= bounds.maxY) {
        continue;
      }

      this.addChild(
        new RangeLabelNode({
          placement,
          topM: new Vector2(xM, band.topM),
          bottomM: new Vector2(xM, band.bottomM),
          label: band.name,
          viewBounds: bounds,
          fill: PlateTectonicsColors.textColorProperty,
          font: LAYER_LABEL_FONT,
          maxTextWidth: 130,
        }),
      );
    }
  }
}
