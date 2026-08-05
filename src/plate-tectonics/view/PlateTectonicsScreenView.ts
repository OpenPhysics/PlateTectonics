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
 * The flat map, the globe and the cross-section share one viewport; the view selector
 * and the globe checkbox decide which of the three is visible. The relief raster is
 * fetched here, once, and handed to both map canvases when it has decoded.
 */

import { Shape } from "scenerystack/kite";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Circle, Node, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont, ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { attachGlobeRotation } from "../../common/attachGlobeRotation.js";
import reliefImageUrl from "../../common/data/generated/relief.png";
import { GlobeProjection } from "../../common/GlobeProjection.js";
import { MapProjection } from "../../common/MapProjection.js";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/PlateTectonicsButtonOptions.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { MAP_VIEW_BOUNDS, PANEL_SPACING, SCREEN_VIEW_MARGIN } from "../../PlateTectonicsConstants.js";
import type { PlateTectonicsPreferencesModel } from "../../preferences/PlateTectonicsPreferencesModel.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";
import { CrossSectionNode } from "./CrossSectionNode.js";
import { GlobeCanvasNode } from "./GlobeCanvasNode.js";
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
  private readonly globeCanvas: GlobeCanvasNode;
  private readonly globeProjection: GlobeProjection;

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
    const a11y = strings.getPlateTectonicsA11yStrings().controls;
    const projection = new MapProjection(MAP_VIEW_BOUNDS);
    this.globeProjection = new GlobeProjection(MAP_VIEW_BOUNDS);

    // ── Viewport ──────────────────────────────────────────────────────────────
    // Three things share the viewport: the flat map, the globe, and a cross-section.
    // Each carries its own plate-label overlay, because the labels are positioned by
    // the projection they belong to.
    this.mapCanvas = new MapCanvasNode(model, projection);
    const flatOverlay = new PlateOverlayNode(model, projection);
    const flatView = new Node({ children: [this.mapCanvas, flatOverlay] });

    this.globeCanvas = new GlobeCanvasNode(model, this.globeProjection);
    const globeOverlay = new PlateOverlayNode(model, this.globeProjection);
    const globeLimb = new Circle(this.globeProjection.radius, {
      center: MAP_VIEW_BOUNDS.center,
      stroke: PlateTectonicsColors.mapFrameColorProperty,
      lineWidth: 1.5,
    });
    const globeView = attachGlobeRotation(new Node({ children: [this.globeCanvas, globeLimb, globeOverlay] }), {
      projection: this.globeProjection,
      accessibleNameProperty: a11y.globeStringProperty,
      accessibleHelpTextProperty: a11y.globeHelpStringProperty,
    });
    // Only the disc takes the drag, so a pointer on the empty corners of the viewport
    // is not silently grabbing a globe that is not there.
    const globeDiscShape = Shape.circle(MAP_VIEW_BOUNDS.centerX, MAP_VIEW_BOUNDS.centerY, this.globeProjection.radius);
    globeView.mouseArea = globeDiscShape;
    globeView.touchArea = globeDiscShape;
    // ...and the focus highlight traces the same disc, so a keyboard user is shown the
    // globe rather than the empty rectangle it sits in.
    globeView.focusHighlight = globeDiscShape;

    const crossSectionView = new CrossSectionNode(model, MAP_VIEW_BOUNDS);

    const viewportFrame = new Rectangle(MAP_VIEW_BOUNDS, {
      stroke: PlateTectonicsColors.mapFrameColorProperty,
      lineWidth: 1.5,
      cornerRadius: 2,
    });

    this.addChild(flatView);
    this.addChild(globeView);
    this.addChild(crossSectionView);
    this.addChild(viewportFrame);

    model.isFlatMapProperty.link((isFlatMap: boolean) => {
      flatView.visible = isFlatMap;
    });
    model.isGlobeProperty.link((isGlobe: boolean) => {
      globeView.visible = isGlobe;
    });
    model.isCrossSectionProperty.link((isCrossSection: boolean) => {
      crossSectionView.visible = isCrossSection;
    });
    preferences.showPlateLabelsProperty.link((showLabels: boolean) => {
      flatOverlay.visible = showLabels;
      globeOverlay.visible = showLabels;
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
    // The globe comes first: it is the only thing in the play area that can be
    // operated, so a keyboard user should reach it before the controls.
    this.addChild(
      new Node({
        pdomOrder: [
          globeView,
          ...viewPanel.focusOrder,
          ...layerPanel.focusOrder,
          ...timePanel.focusOrder,
          resetAllButton,
        ],
      }),
    );
  }

  /**
   * Loads the shaded relief raster and hands it to both map views once it has
   * decoded. They draw a plain ocean until then, so a slow load never blocks the sim.
   */
  private loadReliefImage(): void {
    const image = new window.Image();
    image.addEventListener("load", () => {
      this.mapCanvas.setReliefImage(image);
      this.globeCanvas.setReliefImage(image);
    });
    image.src = reliefImageUrl;
  }

  /** Resets view-side state: only the globe's camera, which is not model state. */
  public reset(): void {
    this.globeProjection.reset();
  }

  /**
   * Cross-section animation is driven by the model clock, which the Sim steps; the
   * canvas nodes repaint from their Property links, so nothing is needed here.
   */
  public override step(_dt: number): void {
    // Intentionally empty — see the class documentation.
  }
}
