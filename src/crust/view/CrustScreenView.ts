/**
 * CrustScreenView.ts
 *
 * Layout for the Crust screen: the painted cross-section and its labels in the play
 * area, the three sliders and the view options down the right, the probe on top.
 *
 * The vertical scale is rebuilt whenever the zoom changes, and handed to the canvas,
 * the labels and the probe — they all read the same mapping, so nothing can drift out
 * of register with the picture.
 */

import { Multilink } from "scenerystack/axon";
import { Bounds2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Node, Rectangle } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { CrossSectionScale } from "../../common/model/CrossSectionScale.js";
import type { SectionViewMode } from "../../common/model/SectionViewModel.js";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/PlateTectonicsButtonOptions.js";
import { ColorModeControlPanel } from "../../common/view/ColorModeControlPanel.js";
import { EarthProbeNode } from "../../common/view/EarthProbeNode.js";
import { MaterialLegendNode } from "../../common/view/MaterialLegendNode.js";
import { blockPlacement, flatPlacement, type SectionPlacement } from "../../common/view/SectionPlacement.js";
import { SectionRulerNode } from "../../common/view/SectionRulerNode.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import {
  CRUST_BLOCK_HALF_WIDTH_M,
  EARTH_RADIUS_KM,
  LITHOSPHERE_THICKNESS_KM,
  PANEL_SPACING,
  SCREEN_VIEW_MARGIN,
  SECTION_VIEW_BOUNDS,
} from "../../PlateTectonicsConstants.js";
import type { PlateTectonicsPreferencesModel } from "../../preferences/PlateTectonicsPreferencesModel.js";
import type { CrustModel, CrustZoom } from "../model/CrustModel.js";
import { CrustBlockNode } from "./CrustBlockNode.js";
import { CrustCanvasNode } from "./CrustCanvasNode.js";
import { CrustLabelsNode } from "./CrustLabelsNode.js";
import { CrustScreenSummaryContent } from "./CrustScreenSummaryContent.js";
import { CrustZoomControl } from "./CrustZoomControl.js";
import { MyCrustControlPanel } from "./MyCrustControlPanel.js";

/** The three blocks sit side by side, so the viewport is three block-widths across. */
const VIEW_HALF_WIDTH_M = 3 * CRUST_BLOCK_HALF_WIDTH_M;

/** Highest elevation the shallow band shows, m. Clears the thickest, lightest crust. */
const RELIEF_TOP_M = 12000;

/** Elevation the shallow band gives way to the compressed deep band, m. */
const RELIEF_BOTTOM_M = -12000;

/** Fraction of the viewport height the magnified shallow band takes. */
const RELIEF_BAND_FRACTION = 0.4;

export type CrustScreenViewOptions = ScreenViewOptions;

export class CrustScreenView extends ScreenView {
  private readonly model: CrustModel;
  private readonly canvas: CrustCanvasNode;
  private readonly block: CrustBlockNode;
  private readonly labels: CrustLabelsNode;
  /** Named sectionScale, not scale: ScreenView.scale() is a method on the base class. */
  private sectionScale: CrossSectionScale;

  public constructor(
    model: CrustModel,
    _preferences: PlateTectonicsPreferencesModel,
    providedOptions?: CrustScreenViewOptions,
  ) {
    const options = optionize<CrustScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      { screenSummaryContent: new CrustScreenSummaryContent(model) },
      providedOptions,
    );
    super(options);

    this.model = model;

    const strings = StringManager.getInstance();
    const a11y = strings.getCrustA11yStrings().controls;

    const bounds = new Bounds2(
      SECTION_VIEW_BOUNDS.minX,
      SECTION_VIEW_BOUNDS.minY,
      SECTION_VIEW_BOUNDS.maxX,
      SECTION_VIEW_BOUNDS.maxY,
    );

    this.sectionScale = CrustScreenView.scaleFor(model.zoomProperty.value, bounds);

    // ── The cross-section ─────────────────────────────────────────────────────
    // A frame under everything, so the viewport reads as a window even before the
    // canvas has painted.
    this.addChild(
      new Rectangle(bounds, {
        fill: PlateTectonicsColors.skyColorProperty,
        stroke: PlateTectonicsColors.mapFrameColorProperty,
        lineWidth: 1,
      }),
    );

    // Both painters are built and kept. Only one is visible at a time, but the flat one
    // is cheap to hold and rebuilding it on every toggle would throw away the Property
    // links it sets up — and the toggle is a control the user is expected to flip back
    // and forth while comparing the two pictures.
    this.canvas = new CrustCanvasNode(model, this.sectionScale, bounds);
    this.addChild(this.canvas);

    this.block = new CrustBlockNode(model, bounds, CrustScreenView.extentFor(model.zoomProperty.value));
    this.addChild(this.block);

    this.labels = new CrustLabelsNode(model, this.placement(), bounds, RELIEF_BOTTOM_M);
    this.addChild(this.labels);

    // ── The probe ─────────────────────────────────────────────────────────────
    // Routed through whichever placement is current rather than through the flat scale,
    // so the probe stays on the rock it is reading out when the view is switched. It
    // reads `this.placement()` on every call instead of capturing one, because the
    // placement is replaced on both a zoom change and a view change.
    const probe = new EarthProbeNode(model.probePositionProperty, {
      modelToView: (xM, elevationM) => this.placement().modelToView(xM, elevationM),
      viewToModel: (viewX, viewY) => this.placement().viewToModel(viewX, viewY),
      dragBounds: bounds,
      temperatureAt: (xM, elevationM) => model.temperatureAtPoint(xM, elevationM),
      densityAt: (xM, elevationM) => model.densityAtPoint(xM, elevationM),
      readoutDependencies: [
        model.crustElevationProperty,
        model.crustThicknessProperty,
        model.crustDensityProperty,
        model.temperatureRatioProperty,
      ],
      probeAccessibleHelpText: a11y.probeHelpStringProperty,
    });
    this.addChild(probe);

    // ── The ruler ─────────────────────────────────────────────────────────────
    // Back from PhET's Java version, because the block is a perspective picture with an
    // adjustable vertical stretch and there is otherwise no way to answer "how thick is
    // that". 150 km long: enough to span the deepest crustal root the thickness slider
    // reaches, which is the measurement this screen invites.
    const ruler = new SectionRulerNode(model.rulerPositionProperty, {
      placement: this.placement(),
      lengthM: 150000,
      majorTickM: 50000,
      dragBounds: bounds,
      unitsStringProperty: strings.getMaterialStrings().kilometresStringProperty,
      rulerAccessibleName: strings.getBlockViewA11yStrings().rulerStringProperty,
      rulerAccessibleHelpText: strings.getBlockViewA11yStrings().rulerHelpStringProperty,
    });
    this.addChild(ruler);

    // Rebuilding the scale on a zoom change, rather than letting each consumer work it
    // out, is what guarantees the labels stay on the layers they name and the probe
    // stays at the depth it is reading out. Everything that draws against the scale has
    // to be told; the probe in particular has no Property change to react to, since a
    // zoom moves the picture under it without moving it.
    model.zoomProperty.link((zoom: CrustZoom) => {
      this.sectionScale = CrustScreenView.scaleFor(zoom, bounds);
      this.canvas.setSectionScale(this.sectionScale);
      this.block.setExtent(CrustScreenView.extentFor(zoom));
      this.labels.setPlacement(this.placement());
      probe.refreshPosition();
      ruler.setPlacement(this.placement());
    });

    // Switching view swaps which painter is showing and re-aims everything drawn over
    // it. The exaggeration is in here too: stretching the block moves every feature, so
    // the labels and the probe have to be told even though nothing they own changed.
    Multilink.multilink(
      [model.sectionView.modeProperty, model.sectionView.verticalExaggerationProperty],
      (mode: SectionViewMode) => {
        this.block.visible = mode === "block";
        this.canvas.visible = mode === "flat";
        this.labels.setPlacement(this.placement());
        probe.refreshPosition();
        ruler.setPlacement(this.placement());
      },
    );

    // ── Legend ────────────────────────────────────────────────────────────────
    const legend = new MaterialLegendNode(model.colorModeProperty, {
      left: bounds.minX,
      top: bounds.maxY + PANEL_SPACING,
    });
    this.addChild(legend);

    // ── Control column ────────────────────────────────────────────────────────
    const crustPanel = new MyCrustControlPanel(model, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: bounds.minY,
    });
    const viewPanel = new ColorModeControlPanel(model.colorModeProperty, {
      showLabelsProperty: model.showLabelsProperty,
      sectionViewModel: model.sectionView,
      colorModeAccessibleName: a11y.colorModeStringProperty,
      colorModeAccessibleHelpText: a11y.colorModeHelpStringProperty,
      showLabelsAccessibleName: a11y.showLabelsStringProperty,
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: crustPanel.bottom + PANEL_SPACING,
    });
    const zoomPanel = new CrustZoomControl(model.zoomProperty, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: viewPanel.bottom + PANEL_SPACING,
    });
    this.addChild(crustPanel);
    this.addChild(viewPanel);
    this.addChild(zoomPanel);

    // ── Reset All ─────────────────────────────────────────────────────────────
    const resetAllButton = new ResetAllButton({
      ...FLAT_RESET_ALL_BUTTON_OPTIONS,
      listener: () => {
        model.reset();
      },
      right: bounds.maxX,
      bottom: this.layoutBounds.maxY - SCREEN_VIEW_MARGIN,
    });
    this.addChild(resetAllButton);

    // ── Accessibility: keyboard / reading traversal order ─────────────────────
    // The probe first: it is the only thing in the play area that can be operated, so
    // a keyboard user should reach it before the controls. Reset All last, as ever.
    this.addChild(
      new Node({
        pdomOrder: [
          probe,
          ruler,
          ...crustPanel.focusOrder,
          ...viewPanel.focusOrder,
          ...zoomPanel.focusOrder,
          resetAllButton,
        ],
      }),
    );
  }

  /** How the labels and the probe reach the picture that is currently showing. */
  private placement(): SectionPlacement {
    return this.model.sectionView.showsBlock
      ? blockPlacement(this.block, VIEW_HALF_WIDTH_M, this.sectionScale.bottomM)
      : flatPlacement(this.sectionScale);
  }

  /**
   * How much of the Earth a zoom level puts in frame.
   *
   * Shared by both views so that switching between them changes only *how* the slice is
   * drawn, never *which* slice — the block gets the same extent the flat scale is built
   * from, and maps it uniformly instead of in two bands.
   */
  private static extentFor(zoom: CrustZoom): { halfWidthM: number; topM: number; bottomM: number } {
    const scale = CrustScreenView.scaleFor(zoom, SECTION_VIEW_BOUNDS);
    return { halfWidthM: VIEW_HALF_WIDTH_M, topM: scale.topM, bottomM: scale.bottomM };
  }

  /**
   * The vertical scale for a zoom level.
   *
   * Only the crust zoom uses two bands. Once the lithosphere or the whole Earth is in
   * frame, the crust is a sliver either way, and a magnified surface band would just be
   * a stripe of sky at the top of the picture.
   */
  private static scaleFor(zoom: CrustZoom, bounds: Bounds2): CrossSectionScale {
    if (zoom === "crust") {
      return new CrossSectionScale({
        bounds,
        halfWidthM: VIEW_HALF_WIDTH_M,
        topM: RELIEF_TOP_M,
        bottomM: -80000,
        bandBottomM: RELIEF_BOTTOM_M,
        bandHeightFraction: RELIEF_BAND_FRACTION,
      });
    }
    const bottomM = zoom === "lithosphere" ? -LITHOSPHERE_THICKNESS_KM * 3000 : -EARTH_RADIUS_KM * 1000;
    return new CrossSectionScale({
      bounds,
      halfWidthM: VIEW_HALF_WIDTH_M,
      topM: RELIEF_TOP_M,
      bottomM,
      bandBottomM: bottomM,
      bandHeightFraction: 1,
    });
  }

  /**
   * The crust relaxes toward its isostatic equilibrium in the model, and the canvas
   * repaints from its Property links, so nothing is needed here.
   */
  public override step(_dt: number): void {
    // Intentionally empty — see the class documentation.
  }
}
