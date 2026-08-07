/**
 * CrustLabelsNode.ts
 *
 * The text layer over the Crust screen's cross-section: which block is which, which
 * shell is which at the current zoom, and where sea level is.
 *
 * Scenery `Text` rather than canvas text, so every label is localizable and reachable
 * by a screen reader — the same split the rest of the sim makes between the painted
 * picture and the words on top of it.
 */

import { Multilink } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { Line, Node, type NodeOptions, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import type { CrossSectionScale } from "../../common/model/CrossSectionScale.js";
import type { EARTH_LAYERS } from "../../common/model/EarthStructure.js";
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

  /** Named sectionScale, not scale: Node.scale() is a method on the base class. */
  private sectionScale: CrossSectionScale;

  public constructor(
    model: CrustModel,
    sectionScale: CrossSectionScale,
    viewBounds: Bounds2,
    providedOptions?: CrustLabelsNodeOptions,
  ) {
    super(providedOptions);
    this.model = model;
    this.viewBounds = viewBounds;
    this.sectionScale = sectionScale;

    const rebuild = Multilink.multilinkAny(
      [model.showLabelsProperty, model.zoomProperty, model.crustElevationProperty, model.crustThicknessProperty],
      () => this.rebuild(),
    );

    this.disposeEmitter.addListener(() => rebuild.dispose());
  }

  /** Re-aims the labels at a new vertical scale, after a zoom change. */
  public setSectionScale(sectionScale: CrossSectionScale): void {
    this.sectionScale = sectionScale;
    this.rebuild();
  }

  private rebuild(): void {
    this.removeAllChildren();
    if (!this.model.showLabelsProperty.value) {
      return;
    }

    const strings = StringManager.getInstance();
    const section = strings.getSectionStrings();
    const scale = this.sectionScale;
    const bounds = this.viewBounds;
    const model = this.model;

    // ── Sea level ─────────────────────────────────────────────────────────────
    // Drawn at every zoom: without it there is no way to tell whether a block's
    // surface is a plateau or a sea floor, which is half of what the screen is about.
    const seaLevelY = scale.seaLevelY;
    if (seaLevelY > bounds.minY && seaLevelY < bounds.maxY) {
      this.addChild(
        new Line(bounds.minX, seaLevelY, bounds.maxX, seaLevelY, {
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
          bottom: seaLevelY - 2,
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
        const centreX = scale.x((column.leftM + column.rightM) / 2);
        const surfaceY = scale.y(column.elevationM);
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
    const scale = this.sectionScale;
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
      { layer: "innerCore", topM: -INNER_OUTER_CORE_BOUNDARY_KM * 1000, bottomM: scale.bottomM },
    ];

    // At the crust zoom only the mantle is in frame, and it is not "upper mantle" at
    // that scale — it is just what the blocks are floating in.
    if (zoom === "crust") {
      const topY = scale.y(scale.bandBottomM);
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
      const topY = scale.y(band.topM);
      const bottomY = scale.y(band.bottomM);
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
