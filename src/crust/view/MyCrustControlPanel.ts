/**
 * MyCrustControlPanel.ts
 *
 * The three sliders that are the entire input to the Crust screen: how warm the middle
 * block is, what it is made of, and how thick it is.
 *
 * Each slider is labelled at both ends rather than with numbers, because two of the
 * three quantities have no unit a student would recognise — "composition" is a mixing
 * ratio, not a measurement. Thickness does have a unit, so it gets a readout; the other
 * two get their consequences instead, shown as a live elevation and density below.
 */

import { DerivedStringProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { Dimension2, Range } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { HSlider } from "scenerystack/sun";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH, MY_CRUST_THICKNESS_RANGE_M } from "../../PlateTectonicsConstants.js";
import type { CrustModel } from "../model/CrustModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);
const END_LABEL_FONT = new PhetFont(11);
const READOUT_FONT = new PhetFont(12);

const SLIDER_WIDTH = CONTROL_PANEL_WIDTH - 40;
const SLIDER_TRACK_SIZE = new Dimension2(SLIDER_WIDTH, 4);
const SLIDER_THUMB_SIZE = new Dimension2(14, 24);

/** Both the temperature and composition sliders are plain 0-to-1 ratios. */
const RATIO_RANGE = new Range(0, 1);

/** Two labels pinned to the ends of a slider-width row. */
function endLabelRow(low: Text, high: Text): Node {
  low.left = 0;
  high.right = SLIDER_WIDTH;
  return new Node({ children: [low, high] });
}

export type MyCrustControlPanelOptions = PlateTectonicsPanelOptions;

export class MyCrustControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: CrustModel, providedOptions?: MyCrustControlPanelOptions) {
    const strings = StringManager.getInstance();
    const crust = strings.getCrustStrings();
    const a11y = strings.getCrustA11yStrings().controls;

    const label = (text: TReadOnlyProperty<string>, font = LABEL_FONT): Text =>
      new Text(text, { font, fill: PlateTectonicsColors.textColorProperty, maxWidth: SLIDER_WIDTH });

    const endLabel = (text: TReadOnlyProperty<string>): Text =>
      new Text(text, {
        font: END_LABEL_FONT,
        fill: PlateTectonicsColors.secondaryTextColorProperty,
        maxWidth: SLIDER_WIDTH / 2 - 4,
      });

    /** A slider with its title above and its two end labels below. */
    const labelledSlider = (
      titleText: TReadOnlyProperty<string>,
      slider: HSlider,
      lowText: TReadOnlyProperty<string>,
      highText: TReadOnlyProperty<string>,
    ): VBox =>
      new VBox({
        spacing: 2,
        align: "left",
        children: [
          label(titleText),
          slider,
          // Pinned to the ends of a fixed-width strut rather than laid out by an HBox:
          // "spaceBetween" only spreads children when the box is given a width larger
          // than its content, which a plain HBox is not, so the two labels ran together.
          endLabelRow(endLabel(lowText), endLabel(highText)),
        ],
      });

    const sliderOptions = {
      trackSize: SLIDER_TRACK_SIZE,
      thumbSize: SLIDER_THUMB_SIZE,
      thumbFill: PlateTectonicsColors.accentColorProperty,
      trackFillEnabled: PlateTectonicsColors.controlSurfaceColorProperty,
      trackStroke: PlateTectonicsColors.panelBorderColorProperty,
    };

    const temperatureSlider = new HSlider(model.temperatureRatioProperty, RATIO_RANGE, {
      ...sliderOptions,
      accessibleName: a11y.temperatureSliderStringProperty,
      accessibleHelpText: a11y.temperatureSliderHelpStringProperty,
      keyboardStep: 0.05,
      shiftKeyboardStep: 0.01,
      pageKeyboardStep: 0.2,
    });

    const compositionSlider = new HSlider(model.compositionRatioProperty, RATIO_RANGE, {
      ...sliderOptions,
      accessibleName: a11y.compositionSliderStringProperty,
      accessibleHelpText: a11y.compositionSliderHelpStringProperty,
      keyboardStep: 0.05,
      shiftKeyboardStep: 0.01,
      pageKeyboardStep: 0.2,
    });

    const thicknessSlider = new HSlider(model.crustThicknessProperty, MY_CRUST_THICKNESS_RANGE_M, {
      ...sliderOptions,
      accessibleName: a11y.thicknessSliderStringProperty,
      accessibleHelpText: a11y.thicknessSliderHelpStringProperty,
      keyboardStep: 2000,
      shiftKeyboardStep: 500,
      pageKeyboardStep: 10000,
    });

    // ── Live consequences of the three sliders ────────────────────────────────
    const thicknessReadout = new DerivedStringProperty(
      [model.crustThicknessProperty, crust.thicknessPatternStringProperty],
      (thicknessM: number, pattern: string) => pattern.replace("{{value}}", (thicknessM / 1000).toFixed(0)),
    );
    const elevationReadout = new DerivedStringProperty(
      [model.crustElevationProperty, crust.elevationPatternStringProperty],
      (elevationM: number, pattern: string) => pattern.replace("{{value}}", (elevationM / 1000).toFixed(1)),
    );
    const densityReadout = new DerivedStringProperty(
      [model.crustDensityProperty, crust.densityPatternStringProperty],
      (density: number, pattern: string) => pattern.replace("{{value}}", density.toFixed(0)),
    );

    const readout = (text: TReadOnlyProperty<string>): Text =>
      new Text(text, {
        font: READOUT_FONT,
        fill: PlateTectonicsColors.secondaryTextColorProperty,
        maxWidth: SLIDER_WIDTH,
      });

    const content = new VBox({
      spacing: 10,
      align: "left",
      children: [
        label(crust.myCrustStringProperty, TITLE_FONT),
        labelledSlider(
          crust.temperatureStringProperty,
          temperatureSlider,
          crust.coolStringProperty,
          crust.warmStringProperty,
        ),
        labelledSlider(
          crust.compositionStringProperty,
          compositionSlider,
          crust.moreIronStringProperty,
          crust.moreSilicaStringProperty,
        ),
        labelledSlider(
          crust.thicknessStringProperty,
          thicknessSlider,
          crust.thinStringProperty,
          crust.thickStringProperty,
        ),
        new VBox({
          spacing: 1,
          align: "left",
          children: [readout(thicknessReadout), readout(elevationReadout), readout(densityReadout)],
        }),
      ],
    });

    const options = optionize<MyCrustControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [temperatureSlider, compositionSlider, thicknessSlider];

    this.disposeEmitter.addListener(() => {
      densityReadout.dispose();
      elevationReadout.dispose();
      thicknessReadout.dispose();
    });
  }
}
