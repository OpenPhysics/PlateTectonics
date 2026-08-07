/**
 * ColorModeControlPanel.ts
 *
 * The "View" panel: what the cross-section colours rock by, whether labels are drawn,
 * and — on screens that have an ocean to hide — whether sea water is shown.
 *
 * Shared by the Crust and Plate Motion screens, which need exactly the same control.
 * It takes bare Properties rather than a model so that neither screen's model has to
 * satisfy an interface invented for one panel.
 */

import type { Property, TReadOnlyProperty } from "scenerystack/axon";
import { combineOptions } from "scenerystack/phet-core";
import { type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox, VerticalAquaRadioButtonGroup } from "scenerystack/sun";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../PlateTectonicsConstants.js";
import type { ColorMode } from "../model/ColorMode.js";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../PlateTectonicsPanel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);

type SelfOptions = {
  /** The property driving the label checkbox. */
  showLabelsProperty: Property<boolean>;

  /** Supply to add a "Show seawater" checkbox; omit on screens without an ocean to hide. */
  showSeawaterProperty?: Property<boolean>;

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
      checkboxColorBackground: PlateTectonicsColors.controlSurfaceColorProperty,
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
      });
      children.push(seawaterCheckbox);
      focusOrder.push(seawaterCheckbox);
    }

    super(new VBox({ children, spacing: 8, align: "left" }), options);
    this.focusOrder = focusOrder;
  }
}
