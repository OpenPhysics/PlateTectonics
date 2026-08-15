/**
 * CrustLabelsNode.ts
 *
 * The text layer over the Crust screen's cross-section: which block is which, which
 * shell is which at the current zoom, and where sea level is.
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
 */

import { Multilink } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Node, type NodeOptions, Path, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import type { EARTH_LAYERS } from "../../common/model/EarthStructure.js";
import type { SectionPlacement } from "../../common/view/SectionPlacement.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import {
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

export type CrustLabelsNodeOptions = NodeOptions;

export class CrustLabelsNode extends Node {
  private readonly model: CrustModel;
  /** Named viewBounds, not bounds: Node.bounds is a property on the base class. */
  private readonly viewBounds: Bounds2;

  private placement: SectionPlacement;

  /** Elevation the "mantle" label sits at when only the crust zoom is in frame, m. */
  private readonly mantleLabelElevationM: number;

  public constructor(
    model: CrustModel,
    placement: SectionPlacement,
    viewBounds: Bounds2,
    mantleLabelElevationM: number,
    providedOptions?: CrustLabelsNodeOptions,
  ) {
    super(providedOptions);
    this.model = model;
    this.viewBounds = viewBounds;
    this.placement = placement;
    this.mantleLabelElevationM = mantleLabelElevationM;

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
      const blockNames = [
        section.oceanicCrustStringProperty,
        section.crustStringProperty,
        section.continentalCrustStringProperty,
      ];
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

    // ── The shells below ──────────────────────────────────────────────────────
    this.addLayerLabels(model.zoomProperty.value);
  }

  /** Labels each shell the current zoom actually reaches, centred in its band. */
  private addLayerLabels(zoom: CrustZoom): void {
    const section = StringManager.getInstance().getSectionStrings();
    const placement = this.placement;
    const bounds = this.viewBounds;

    const names: Record<(typeof EARTH_LAYERS)[number], typeof section.mantleStringProperty> = {
      crust: section.crustStringProperty,
      upperMantle: section.upperMantleStringProperty,
      lowerMantle: section.lowerMantleStringProperty,
      outerCore: section.outerCoreStringProperty,
      innerCore: section.innerCoreStringProperty,
    };

    // Top and bottom of each shell in metres of elevation, deepest boundary last.
    // The upper mantle starts at sea level rather than at the base of the crust: at
    // these zooms the crust is thinner than a pixel, and using the scale's band boundary
    // would put the label's top *below* its bottom, which silently dropped it.
    const bands: { layer: (typeof EARTH_LAYERS)[number]; topM: number; bottomM: number }[] = [
      { layer: "upperMantle", topM: 0, bottomM: -UPPER_LOWER_MANTLE_BOUNDARY_KM * 1000 },
      {
        layer: "lowerMantle",
        topM: -UPPER_LOWER_MANTLE_BOUNDARY_KM * 1000,
        bottomM: -MANTLE_CORE_BOUNDARY_KM * 1000,
      },
      { layer: "outerCore", topM: -MANTLE_CORE_BOUNDARY_KM * 1000, bottomM: -INNER_OUTER_CORE_BOUNDARY_KM * 1000 },
      { layer: "innerCore", topM: -INNER_OUTER_CORE_BOUNDARY_KM * 1000, bottomM: placement.bottomM },
    ];

    // At the crust zoom only the mantle is in frame, and it is not "upper mantle" at
    // that scale — it is just what the blocks are floating in.
    if (zoom === "crust") {
      const topY = placement.modelToView(-placement.halfWidthM, this.mantleLabelElevationM).y;
      this.addChild(
        new Text(section.mantleStringProperty, {
          font: LAYER_LABEL_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          left: bounds.minX + 8,
          top: topY + 8,
          maxWidth: 140,
        }),
      );
      return;
    }

    for (const band of bands) {
      const topY = placement.modelToView(-placement.halfWidthM, band.topM).y;
      const bottomY = placement.modelToView(-placement.halfWidthM, band.bottomM).y;
      // Skip a shell the current zoom does not reach, or one squeezed too thin to label.
      if (bottomY - topY < 18 || topY >= bounds.maxY) {
        continue;
      }
      this.addChild(
        new Text(names[band.layer], {
          font: LAYER_LABEL_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          left: bounds.minX + 8,
          centerY: (topY + Math.min(bottomY, bounds.maxY)) / 2,
          maxWidth: 140,
        }),
      );
    }
  }
}
