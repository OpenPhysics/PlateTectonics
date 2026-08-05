/**
 * PlateTectonicsScreenView.ts
 *
 * Lays the screen out and wires the view together:
 *
 *   ┌──────────────────────────────────────────┬───────────────┐
 *   │ title                                    │ view selector │
 *   │ ┌──────────────────────────────────────┐ ├───────────────┤
 *   │ │ global map  ·or·  cross-section      │ │ layers        │
 *   │ └──────────────────────────────────────┘ │ depth filter  │
 *   │ legend                                   ├───────────────┤
 *   │                                          │ geological    │
 *   │                                          │ time          │
 *   │                                    reset │               │
 *   └──────────────────────────────────────────┴───────────────┘
 *
 * The global map and the cross-section share one viewport; the view selector swaps
 * which of them is visible. The relief raster is fetched here, once, and handed to
 * the map canvas when it has decoded.
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Node, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont, ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import reliefImageUrl from "../../common/data/generated/relief.png";
import { MapProjection } from "../../common/MapProjection.js";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/PlateTectonicsButtonOptions.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { MAP_VIEW_BOUNDS, PANEL_SPACING, SCREEN_VIEW_MARGIN } from "../../PlateTectonicsConstants.js";
import type { PlateTectonicsPreferencesModel } from "../../preferences/PlateTectonicsPreferencesModel.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";
import { CrossSectionNode } from "./CrossSectionNode.js";
import { LayerControlPanel } from "./LayerControlPanel.js";
import { MapCanvasNode } from "./MapCanvasNode.js";
import { MapLegendNode } from "./MapLegendNode.js";
import { PlateOverlayNode } from "./PlateOverlayNode.js";
import { PlateTectonicsScreenSummaryContent } from "./PlateTectonicsScreenSummaryContent.js";
import { TimeControlPanel } from "./TimeControlPanel.js";
import { ViewControlPanel } from "./ViewControlPanel.js";

const TITLE_FONT = new PhetFont({ size: 17, weight: "bold" });
const NOTE_FONT = new PhetFont(11);

export type PlateTectonicsScreenViewOptions = ScreenViewOptions;

export class PlateTectonicsScreenView extends ScreenView {
  private readonly mapCanvas: MapCanvasNode;

  public constructor(
    model: PlateTectonicsModel,
    preferences: PlateTectonicsPreferencesModel,
    providedOptions?: PlateTectonicsScreenViewOptions,
  ) {
    const options = optionize<PlateTectonicsScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      { screenSummaryContent: new PlateTectonicsScreenSummaryContent(model) },
      providedOptions,
    );
    super(options);

    const strings = StringManager.getInstance();
    const projection = new MapProjection(MAP_VIEW_BOUNDS);

    // ── Viewport ──────────────────────────────────────────────────────────────
    this.mapCanvas = new MapCanvasNode(model, projection);
    const plateOverlay = new PlateOverlayNode(model, projection);
    const globalView = new Node({ children: [this.mapCanvas, plateOverlay] });
    const crossSectionView = new CrossSectionNode(model, MAP_VIEW_BOUNDS);

    const viewportFrame = new Rectangle(MAP_VIEW_BOUNDS, {
      stroke: PlateTectonicsColors.mapFrameColorProperty,
      lineWidth: 1.5,
      cornerRadius: 2,
    });

    this.addChild(globalView);
    this.addChild(crossSectionView);
    this.addChild(viewportFrame);

    model.isCrossSectionProperty.link((isCrossSection: boolean) => {
      globalView.visible = !isCrossSection;
      crossSectionView.visible = isCrossSection;
    });
    preferences.showPlateLabelsProperty.link((showLabels: boolean) => {
      plateOverlay.visible = showLabels;
    });

    // ── Title and reconstruction note ─────────────────────────────────────────
    const title = new Text(strings.getScreenNames().plateTectonicsStringProperty, {
      font: TITLE_FONT,
      fill: PlateTectonicsColors.textColorProperty,
      left: MAP_VIEW_BOUNDS.minX,
      bottom: MAP_VIEW_BOUNDS.minY - 8,
    });
    this.addChild(title);

    // Shown only while the plates are away from their present-day positions, where
    // the relief raster no longer matches the geometry on screen.
    const reconstructionNote = new Text(strings.getTimeStrings().reconstructionStringProperty, {
      font: NOTE_FONT,
      fill: PlateTectonicsColors.secondaryTextColorProperty,
      right: MAP_VIEW_BOUNDS.maxX,
      bottom: MAP_VIEW_BOUNDS.minY - 9,
    });
    this.addChild(reconstructionNote);
    model.isPresentDayProperty.link((isPresentDay: boolean) => {
      reconstructionNote.visible = !isPresentDay;
    });

    // ── Legend ────────────────────────────────────────────────────────────────
    const legend = new MapLegendNode({
      left: MAP_VIEW_BOUNDS.minX,
      top: MAP_VIEW_BOUNDS.maxY + PANEL_SPACING,
    });
    this.addChild(legend);

    // ── Control column ────────────────────────────────────────────────────────
    // The combo-box list has to be added above everything else, so it gets its own
    // parent Node placed last in the z-order.
    const comboBoxListParent = new Node();

    const viewPanel = new ViewControlPanel(model, comboBoxListParent, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: MAP_VIEW_BOUNDS.minY,
    });
    const layerPanel = new LayerControlPanel(model, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: viewPanel.bottom + PANEL_SPACING,
    });
    const timePanel = new TimeControlPanel(model, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: layerPanel.bottom + PANEL_SPACING,
    });
    this.addChild(viewPanel);
    this.addChild(layerPanel);
    this.addChild(timePanel);

    // ── Reset All ─────────────────────────────────────────────────────────────
    // Bottom-right of the play area rather than of the whole screen: the control
    // column runs the full height, and the space under the legend is free.
    const resetAllButton = new ResetAllButton({
      ...FLAT_RESET_ALL_BUTTON_OPTIONS,
      listener: () => {
        model.reset();
        this.reset();
      },
      right: MAP_VIEW_BOUNDS.maxX,
      bottom: this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    });
    this.addChild(resetAllButton);
    this.addChild(comboBoxListParent);

    // ── Relief raster ─────────────────────────────────────────────────────────
    this.loadReliefImage();

    // ── Accessibility: keyboard / reading traversal order ─────────────────────
    this.addChild(
      new Node({
        pdomOrder: [viewPanel.comboBox, ...layerPanel.focusOrder, ...timePanel.focusOrder, resetAllButton],
      }),
    );
  }

  /**
   * Loads the shaded relief raster and hands it to the map once it has decoded.
   * The map draws a flat ocean until then, so a slow load never blocks the sim.
   */
  private loadReliefImage(): void {
    const image = new window.Image();
    image.addEventListener("load", () => this.mapCanvas.setReliefImage(image));
    image.src = reliefImageUrl;
  }

  /** Resets view-side state. All state that matters lives in the model. */
  public reset(): void {
    // Nothing view-only to reset: layer visibility, the view selection and the
    // reconstruction clock are all model state.
  }

  /**
   * Cross-section animation is driven by the model clock, which the Sim steps; the
   * canvas nodes repaint from their Property links, so nothing is needed here.
   */
  public override step(_dt: number): void {
    // Intentionally empty — see the class documentation.
  }
}
