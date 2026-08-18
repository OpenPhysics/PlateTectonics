/**
 * ColorModeControlPanel.ts
 *
 * The "View" panel: what the cross-section colours rock by, whether it is drawn flat or
 * as a 3-D block, whether labels are drawn, and — on screens that have an ocean to hide
 * — whether sea water is shown.
 *
 * Shared by the Crust and Plate Motion screens, which need exactly the same control.
 * It takes bare Properties rather than a model so that neither screen's model has to
 * satisfy an interface invented for one panel.
 */

import { DerivedProperty, type Property, type TReadOnlyProperty } from "scenerystack/axon";
import { Dimension2, toFixedNumber } from "scenerystack/dot";
import { combineOptions } from "scenerystack/phet-core";
import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox, HSlider, VerticalAquaRadioButtonGroup } from "scenerystack/sun";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH, VERTICAL_EXAGGERATION_RANGE } from "../../PlateTectonicsConstants.js";
import type { ColorMode } from "../model/ColorMode.js";
import type { SectionViewMode, SectionViewModel } from "../model/SectionViewModel.js";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../PlateTectonicsPanel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);

/** Matches the sliders on the Crust screen's own panel, so the column reads as one. */
const SLIDER_TRACK_SIZE = new Dimension2(CONTROL_PANEL_WIDTH - 40, 4);
const SLIDER_THUMB_SIZE = new Dimension2(14, 24);

type SelfOptions = {
  /** The property driving the label checkbox. */
  showLabelsProperty: Property<boolean>;

  /** Supply to add a "Show seawater" checkbox; omit on screens without an ocean to hide. */
  showSeawaterProperty?: Property<boolean>;

  /**
   * When the seawater checkbox is live. PhET disabled it until both plates existed, and
   * that is worth keeping: before then there is no ground for a sea to lie on, so the
   * control has no visible effect and reads as broken rather than as not-yet-applicable.
   */
  showSeawaterEnabledProperty?: TReadOnlyProperty<boolean>;

  /**
   * Supply to add the flat/block choice and the vertical-exaggeration slider. The
   * slider is only enabled while the block is showing — the flat view has its own
   * two-band vertical scale, which the exaggeration has no say over.
   */
  sectionViewModel?: SectionViewModel;

  /** Accessible name for the colour-mode group, from the owning screen's a11y strings. */
  colorModeAccessibleName: TReadOnlyProperty<string>;

  /** Accessible help text for the colour-mode group. */
  colorModeAccessibleHelpText: TReadOnlyProperty<string>;

  /** Accessible name for the labels checkbox. */
  showLabelsAccessibleName: TReadOnlyProperty<string>;
};

export type ColorModeControlPanelOptions = SelfOptions & PlateTectonicsPanelOptions;

export class ColorModeControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(colorModeProperty: Property<ColorMode>, providedOptions: ColorModeControlPanelOptions) {
    const options = combineOptions<ColorModeControlPanelOptions>({ minWidth: CONTROL_PANEL_WIDTH }, providedOptions);

    const material = StringManager.getInstance().getMaterialStrings();

    const label = (text: TReadOnlyProperty<string>): Text =>
      new Text(text, {
        font: LABEL_FONT,
        fill: PlateTectonicsColors.textColorProperty,
        maxWidth: CONTROL_PANEL_WIDTH - 60,
      });

    const modeRadioButtons = new VerticalAquaRadioButtonGroup<ColorMode>(
      colorModeProperty,
      [
        { value: "density", createNode: () => label(material.densityStringProperty) },
        { value: "temperature", createNode: () => label(material.temperatureStringProperty) },
        { value: "both", createNode: () => label(material.bothStringProperty) },
      ],
      {
        spacing: 4,
        radioButtonOptions: {
          radius: 7,
          selectedColor: PlateTectonicsColors.accentColorProperty,
          deselectedColor: PlateTectonicsColors.controlSurfaceColorProperty,
          stroke: PlateTectonicsColors.panelBorderColorProperty,
        },
        accessibleName: options.colorModeAccessibleName,
        accessibleHelpText: options.colorModeAccessibleHelpText,
      },
    );

    const checkboxOptions = {
      boxWidth: 15,
      checkboxColor: PlateTectonicsColors.panelBorderColorProperty,
      checkboxColorBackground: PlateTectonicsColors.panelBackgroundColorProperty,
    };

    const labelsCheckbox = new Checkbox(options.showLabelsProperty, label(material.showLabelsStringProperty), {
      ...checkboxOptions,
      accessibleName: options.showLabelsAccessibleName,
    });

    const children: Node[] = [
      new Text(material.titleStringProperty, {
        font: TITLE_FONT,
        fill: PlateTectonicsColors.textColorProperty,
        maxWidth: CONTROL_PANEL_WIDTH - 30,
      }),
      modeRadioButtons,
      labelsCheckbox,
    ];
    const focusOrder: Node[] = [modeRadioButtons, labelsCheckbox];

    if (options.showSeawaterProperty) {
      const seawaterCheckbox = new Checkbox(options.showSeawaterProperty, label(material.showSeawaterStringProperty), {
        ...checkboxOptions,
        accessibleName: material.showSeawaterStringProperty,
        ...(options.showSeawaterEnabledProperty ? { enabledProperty: options.showSeawaterEnabledProperty } : {}),
      });
      children.push(seawaterCheckbox);
      focusOrder.push(seawaterCheckbox);
    }

    if (options.sectionViewModel) {
      const sectionView = options.sectionViewModel;
      const blockA11y = StringManager.getInstance().getBlockViewA11yStrings();

      const viewRadioButtons = new VerticalAquaRadioButtonGroup<SectionViewMode>(
        sectionView.modeProperty,
        [
          { value: "block", createNode: () => label(material.blockViewStringProperty) },
          { value: "flat", createNode: () => label(material.flatViewStringProperty) },
        ],
        {
          spacing: 4,
          radioButtonOptions: {
            radius: 7,
            selectedColor: PlateTectonicsColors.accentColorProperty,
            deselectedColor: PlateTectonicsColors.controlSurfaceColorProperty,
            stroke: PlateTectonicsColors.panelBorderColorProperty,
          },
          accessibleName: blockA11y.sectionViewStringProperty,
          accessibleHelpText: blockA11y.sectionViewHelpStringProperty,
        },
      );

      // Reads "true scale" at 1 rather than "1×", because that is the claim the number
      // is making: at 1 a kilometre down and a kilometre across the block are the same
      // number of pixels, which is the only setting at which the picture's proportions
      // can be trusted.
      const exaggerationReadout = new Text(
        new DerivedProperty(
          [
            sectionView.verticalExaggerationProperty,
            material.exaggerationValueStringProperty,
            material.trueScaleStringProperty,
          ],
          (value, pattern, trueScale) =>
            value === 1 ? trueScale : pattern.replace("{{value}}", String(toFixedNumber(value, 1))),
        ),
        { font: LABEL_FONT, fill: PlateTectonicsColors.textColorProperty, maxWidth: 90 },
      );

      const enabledProperty = new DerivedProperty([sectionView.modeProperty], (mode) => mode === "block");

      const exaggerationSlider = new HSlider(sectionView.verticalExaggerationProperty, VERTICAL_EXAGGERATION_RANGE, {
        trackSize: SLIDER_TRACK_SIZE,
        thumbSize: SLIDER_THUMB_SIZE,
        thumbFill: PlateTectonicsColors.accentColorProperty,
        trackFillEnabled: PlateTectonicsColors.controlSurfaceColorProperty,
        trackStroke: PlateTectonicsColors.panelBorderColorProperty,
        enabledProperty,
        constrainValue: (value: number) => toFixedNumber(value, 1),
        keyboardStep: 0.5,
        shiftKeyboardStep: 0.1,
        pageKeyboardStep: 2,
        accessibleName: blockA11y.verticalExaggerationStringProperty,
        accessibleHelpText: blockA11y.verticalExaggerationHelpStringProperty,
      });

      children.push(
        viewRadioButtons,
        new VBox({
          align: "left",
          spacing: 2,
          children: [
            new HBox({
              spacing: 6,
              children: [label(material.verticalExaggerationStringProperty), exaggerationReadout],
            }),
            exaggerationSlider,
          ],
          visibleProperty: enabledProperty,
        }),
      );
      focusOrder.push(viewRadioButtons, exaggerationSlider);
    }

    super(new VBox({ children, spacing: 8, align: "left" }), options);
    this.focusOrder = focusOrder;
  }
}
