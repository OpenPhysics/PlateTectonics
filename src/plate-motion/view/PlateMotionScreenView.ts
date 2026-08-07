/**
 * PlateMotionScreenView.ts
 *
 * Layout for the Plate Motion screen: the boundary cross-section and its labels in the
 * play area, the crust chooser above it, and the boundary type, clock and view options
 * down the right.
 *
 * The vertical scale is fixed here, unlike on the Crust screen — this screen has no zoom,
 * because everything it shows lives in the top 300 km and a wider view would only add
 * empty mantle.
 */

import { Bounds2, Vector2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Node, Rectangle } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { CrossSectionScale } from "../../common/model/CrossSectionScale.js";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../../common/PlateTectonicsButtonOptions.js";
import { ColorModeControlPanel } from "../../common/view/ColorModeControlPanel.js";
import { EarthProbeNode } from "../../common/view/EarthProbeNode.js";
import { MaterialLegendNode } from "../../common/view/MaterialLegendNode.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import {
  MANTLE_DENSITY_KG_M3,
  PANEL_SPACING,
  PLATE_X_LIMIT_M,
  SCREEN_VIEW_MARGIN,
  SECTION_VIEW_BOUNDS,
} from "../../PlateTectonicsConstants.js";
import type { PlateTectonicsPreferencesModel } from "../../preferences/PlateTectonicsPreferencesModel.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";
import { simpleMantleTemperatureK } from "../model/PlateThermal.js";
import { CrustChooserPanel } from "./CrustChooserPanel.js";
import { MotionTypeControlPanel } from "./MotionTypeControlPanel.js";
import { PlateMotionCanvasNode } from "./PlateMotionCanvasNode.js";
import { PlateMotionLabelsNode } from "./PlateMotionLabelsNode.js";
import { PlateMotionScreenSummaryContent } from "./PlateMotionScreenSummaryContent.js";
import { PlateMotionTimeControlPanel } from "./PlateMotionTimeControlPanel.js";

/** Highest elevation the shallow band shows, m — clears the tallest collision belt. */
const RELIEF_TOP_M = 16000;

/** Elevation the shallow band gives way to the compressed deep band, m. */
const RELIEF_BOTTOM_M = -20000;

/** Deepest the view reaches, m. Past the melt window, and no further. */
const SECTION_BOTTOM_M = -300000;

/** Fraction of the viewport height the magnified shallow band takes. */
const RELIEF_BAND_FRACTION = 0.3;

export type PlateMotionScreenViewOptions = ScreenViewOptions;

export class PlateMotionScreenView extends ScreenView {
  public constructor(
    model: PlateMotionModel,
    _preferences: PlateTectonicsPreferencesModel,
    providedOptions?: PlateMotionScreenViewOptions,
  ) {
    const options = optionize<PlateMotionScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()(
      { screenSummaryContent: new PlateMotionScreenSummaryContent(model) },
      providedOptions,
    );
    super(options);

    const strings = StringManager.getInstance();
    const a11y = strings.getPlateMotionA11yStrings().controls;

    // The chooser sits above the section, so the section starts below it. Built first and
    // measured rather than allowed for by a constant: the panel's height depends on the
    // font and on the length of the three localized crust names, and a guess that is too
    // small puts the panel on top of the cross-section.
    const chooser = new CrustChooserPanel(model, {
      left: SECTION_VIEW_BOUNDS.minX,
      top: SECTION_VIEW_BOUNDS.minY,
    });

    const bounds = new Bounds2(
      SECTION_VIEW_BOUNDS.minX,
      SECTION_VIEW_BOUNDS.minY + chooser.height + PANEL_SPACING,
      SECTION_VIEW_BOUNDS.maxX,
      SECTION_VIEW_BOUNDS.maxY,
    );

    const sectionScale = new CrossSectionScale({
      bounds,
      halfWidthM: PLATE_X_LIMIT_M,
      topM: RELIEF_TOP_M,
      bottomM: SECTION_BOTTOM_M,
      bandBottomM: RELIEF_BOTTOM_M,
      bandHeightFraction: RELIEF_BAND_FRACTION,
    });

    // ── The cross-section ─────────────────────────────────────────────────────
    this.addChild(
      new Rectangle(bounds, {
        fill: PlateTectonicsColors.skyColorProperty,
        stroke: PlateTectonicsColors.mapFrameColorProperty,
        lineWidth: 1,
      }),
    );

    const canvas = new PlateMotionCanvasNode(model, sectionScale, bounds);
    this.addChild(canvas);

    const labels = new PlateMotionLabelsNode(model, sectionScale, bounds);
    this.addChild(labels);

    // ── The probe ─────────────────────────────────────────────────────────────
    // Reads the mantle geotherm and a nominal mantle density. Unlike the Crust screen it
    // does not resolve which plate it is inside: the plates here are moving shapes rather
    // than columns with a well-defined interior, and a reading that flickered as a plate
    // slid past would be worse than one that describes the medium they move through.
    const probe = new EarthProbeNode(model.probePositionProperty, {
      modelToView: (xM, elevationM) => new Vector2(sectionScale.x(xM), sectionScale.y(elevationM)),
      viewToModel: (viewX, viewY) => new Vector2(sectionScale.modelX(viewX), sectionScale.modelElevation(viewY)),
      dragBounds: bounds,
      temperatureAt: (_xM, elevationM) => simpleMantleTemperatureK(-elevationM),
      densityAt: () => MANTLE_DENSITY_KG_M3,
      readoutDependencies: [model.timeMillionsOfYearsProperty],
      probeAccessibleHelpText: a11y.probeHelpStringProperty,
    });
    this.addChild(probe);

    // ── Crust chooser, above the section ──────────────────────────────────────
    this.addChild(chooser);

    // ── Legend ────────────────────────────────────────────────────────────────
    const legend = new MaterialLegendNode(model.colorModeProperty, {
      left: bounds.minX,
      top: bounds.maxY + PANEL_SPACING,
    });
    this.addChild(legend);

    // ── Control column ────────────────────────────────────────────────────────
    const motionPanel = new MotionTypeControlPanel(model, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: SECTION_VIEW_BOUNDS.minY,
    });
    const timePanel = new PlateMotionTimeControlPanel(model, {
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: motionPanel.bottom + PANEL_SPACING,
    });
    const viewPanel = new ColorModeControlPanel(model.colorModeProperty, {
      showLabelsProperty: model.showLabelsProperty,
      showSeawaterProperty: model.showSeawaterProperty,
      colorModeAccessibleName: a11y.colorModeStringProperty,
      colorModeAccessibleHelpText: a11y.colorModeHelpStringProperty,
      showLabelsAccessibleName: a11y.showLabelsStringProperty,
      right: this.layoutBounds.maxX - SCREEN_VIEW_MARGIN,
      top: timePanel.bottom + PANEL_SPACING,
    });
    this.addChild(motionPanel);
    this.addChild(timePanel);
    this.addChild(viewPanel);

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
    // The chooser first, because building a boundary is the first thing to do and
    // nothing else on the screen does anything until it is done. Reset All last.
    this.addChild(
      new Node({
        pdomOrder: [
          ...chooser.focusOrder,
          probe,
          ...motionPanel.focusOrder,
          ...timePanel.focusOrder,
          ...viewPanel.focusOrder,
          resetAllButton,
        ],
      }),
    );
  }

  /**
   * The boundary evolves from the model clock and the canvas repaints from its Property
   * links, so nothing is needed here.
   */
  public override step(_dt: number): void {
    // Intentionally empty — see the class documentation.
  }
}
