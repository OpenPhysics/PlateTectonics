/**
 * EarthScreenView.ts
 *
 * Lays the screen out and wires the view together:
 *
 *   ┌──────────────────────────────────────────┬───────────────┐
 *   │ title                                    │ view switch   │
 *   │ ┌──────────────────────────────────────┐ ├───────────────┤
 *   │ │ globe  ·or·  flat map                │ │ layers        │
 *   │ └──────────────────────────────────────┘ │ depth filter  │
 *   │ legend                                   ├───────────────┤
 *   │                                          │ geological    │
 *   │                                          │ time          │
 *   │                                    reset │               │
 *   └──────────────────────────────────────────┴───────────────┘
 *
 * The flat map and the globe share one viewport, and the view switch decides which of
 * the two is visible. The relief raster is fetched here, once, and handed to both map
 * canvases when it has decoded.
 *
 * Both global views can be moved: the globe turns, and the flat map pans and zooms.
 * Their cameras live here in the view rather than in the model, because a camera is
 * a way of looking at the Earth rather than a fact about it — which is why Reset All
 * puts both of them back through {@link EarthScreenView.reset}.
 */

import { Shape } from "scenerystack/kite";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Circle, Node, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont, PlusMinusZoomButtonGroup, ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { attachGlobeRotation } from "../../common/attachGlobeRotation.js";
import { attachMapNavigation } from "../../common/attachMapNavigation.js";
import reliefImageUrl from "../../common/data/generated/relief.png";
import { GlobeProjection } from "../../common/GlobeProjection.js";
import { MapProjection } from "../../common/MapProjection.js";
import {
  FLAT_RECTANGULAR_BUTTON_OPTIONS,
  FLAT_RESET_ALL_BUTTON_OPTIONS,
} from "../../common/PlateTectonicsButtonOptions.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { MAP_VIEW_BOUNDS, PANEL_SPACING, SCREEN_VIEW_MARGIN } from "../../PlateTectonicsConstants.js";
import type { PlateTectonicsPreferencesModel } from "../../preferences/PlateTectonicsPreferencesModel.js";
import type { EarthModel } from "../model/EarthModel.js";
import { EarthScreenSummaryContent } from "./EarthScreenSummaryContent.js";
import { GlobeCanvasNode } from "./GlobeCanvasNode.js";
import { LayerControlPanel } from "./LayerControlPanel.js";
import { MapCanvasNode } from "./MapCanvasNode.js";
import { MapLegendNode } from "./MapLegendNode.js";
import { PlateOverlayNode } from "./PlateOverlayNode.js";
import { TimeControlPanel } from "./TimeControlPanel.js";
import { ViewControlPanel } from "./ViewControlPanel.js";

const TITLE_FONT = new PhetFont({ size: 17, weight: "bold" });
const NOTE_FONT = new PhetFont(11);

export type EarthScreenViewOptions = ScreenViewOptions;

/** Gap between the zoom buttons and the corner of the viewport they sit in. */
const ZOOM_BUTTON_MARGIN = 6;

export class EarthScreenView extends ScreenView {
  private readonly mapCanvas: MapCanvasNode;
  private readonly globeCanvas: GlobeCanvasNode;
  private readonly mapProjection: MapProjection;
  private readonly globeProjection: GlobeProjection;

  public constructor(
    model: EarthModel,
    preferences: PlateTectonicsPreferencesModel,
    providedOptions?: EarthScreenViewOptions,
  ) {
    const options = optionize<EarthScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      { screenSummaryContent: new EarthScreenSummaryContent(model) },
      providedOptions,
    );
    super(options);

    const strings = StringManager.getInstance();
    const a11y = strings.getEarthA11yStrings().controls;
    this.mapProjection = new MapProjection(MAP_VIEW_BOUNDS);
    this.globeProjection = new GlobeProjection(MAP_VIEW_BOUNDS);

    // ── Viewport ──────────────────────────────────────────────────────────────
    // Two things share the viewport: the flat map and the globe. Each carries its own
    // plate-label overlay, because the labels are positioned by the projection they
    // belong to.
    this.mapCanvas = new MapCanvasNode(model, this.mapProjection);
    const flatOverlay = new PlateOverlayNode(model, this.mapProjection);
    // The canvas clips its own painting; the labels are Scenery nodes, so once the
    // map can be panned they need clipping too or one near the edge spills over the
    // frame and onto the legend.
    flatOverlay.clipArea = Shape.bounds(MAP_VIEW_BOUNDS);
    const flatView = attachMapNavigation(new Node({ children: [this.mapCanvas, flatOverlay] }), {
      projection: this.mapProjection,
      accessibleNameProperty: a11y.mapStringProperty,
      accessibleHelpTextProperty: a11y.mapHelpStringProperty,
    });
    // Only the viewport takes the drag, and the focus highlight traces it, so the map
    // reads as the one rectangular thing it is.
    const mapShape = Shape.bounds(MAP_VIEW_BOUNDS);
    flatView.mouseArea = mapShape;
    flatView.touchArea = mapShape;
    flatView.focusHighlight = mapShape;

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

    const viewportFrame = new Rectangle(MAP_VIEW_BOUNDS, {
      stroke: PlateTectonicsColors.mapFrameColorProperty,
      lineWidth: 1.5,
      cornerRadius: 2,
    });

    // Zoom sits in the corner of the map it acts on, the way it does on any map, and
    // over the Southern Ocean rather than over anything worth looking at.
    const mapZoomButtons = new PlusMinusZoomButtonGroup(this.mapProjection.zoomLevelProperty, {
      orientation: "horizontal",
      spacing: 4,
      buttonOptions: {
        ...FLAT_RECTANGULAR_BUTTON_OPTIONS,
        baseColor: PlateTectonicsColors.controlSurfaceColorProperty,
        stroke: PlateTectonicsColors.panelBorderColorProperty,
        cornerRadius: 3,
        xMargin: 7,
        yMargin: 7,
      },
      iconOptions: { fill: PlateTectonicsColors.controlSurfaceTextColorProperty },
      accessibleNameZoomIn: a11y.zoomInStringProperty,
      accessibleNameZoomOut: a11y.zoomOutStringProperty,
      accessibleHelpTextZoomIn: a11y.zoomHelpStringProperty,
      accessibleHelpTextZoomOut: a11y.zoomHelpStringProperty,
      right: MAP_VIEW_BOUNDS.maxX - ZOOM_BUTTON_MARGIN,
      bottom: MAP_VIEW_BOUNDS.maxY - ZOOM_BUTTON_MARGIN,
    });

    this.addChild(flatView);
    this.addChild(globeView);
    this.addChild(viewportFrame);
    this.addChild(mapZoomButtons);

    model.isFlatMapProperty.link((isFlatMap: boolean) => {
      flatView.visible = isFlatMap;
      mapZoomButtons.visible = isFlatMap;
    });
    model.showGlobeProperty.link((showGlobe: boolean) => {
      globeView.visible = showGlobe;
    });
    preferences.showPlateLabelsProperty.link((showLabels: boolean) => {
      flatOverlay.visible = showLabels;
      globeOverlay.visible = showLabels;
    });

    // ── Title and reconstruction note ─────────────────────────────────────────
    const title = new Text(strings.getScreenNames().earthStringProperty, {
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
    const viewPanel = new ViewControlPanel(model, {
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

    // ── Relief raster ─────────────────────────────────────────────────────────
    this.loadReliefImage();

    // ── Accessibility: keyboard / reading traversal order ─────────────────────
    // The map comes first: it is the only thing in the play area that can be
    // operated, so a keyboard user should reach it before the controls. Whichever of
    // the flat map and the globe is hidden drops out of the order on its own.
    this.addChild(
      new Node({
        pdomOrder: [
          globeView,
          flatView,
          mapZoomButtons,
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

  /** Resets view-side state: the two cameras, which are not model state. */
  public reset(): void {
    this.mapProjection.reset();
    this.globeProjection.reset();
  }

  /**
   * The reconstruction is driven by the model clock, which the Sim steps; the canvas
   * nodes repaint from their Property links, so nothing is needed here.
   */
  public override step(_dt: number): void {
    // Intentionally empty — see the class documentation.
  }
}
