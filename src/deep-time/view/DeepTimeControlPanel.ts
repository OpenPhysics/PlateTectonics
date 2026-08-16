/**
 * DeepTimeControlPanel.ts
 *
 * The Deep Time screen's layer checkboxes: continents, plates, boundaries and the
 * deforming belts.
 *
 * Shorter than the Earth screen's `LayerControlPanel` because there is less to choose
 * from — everything drawn here comes from one reconstruction, rather than from six
 * independent observational datasets.
 */

import type { BooleanProperty, ReadOnlyProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../PlateTectonicsConstants.js";
import type { DeepTimeModel } from "../model/DeepTimeModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);
const CREDIT_FONT = new PhetFont(10);

export type DeepTimeControlPanelOptions = PlateTectonicsPanelOptions;

export class DeepTimeControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: DeepTimeModel, providedOptions?: DeepTimeControlPanelOptions) {
    const strings = StringManager.getInstance();
    const deepTime = strings.getDeepTimeStrings();
    const a11y = strings.getDeepTimeA11yStrings().controls;

    const makeCheckbox = (
      property: BooleanProperty,
      label: ReadOnlyProperty<string>,
      help: ReadOnlyProperty<string>,
    ): Checkbox =>
      new Checkbox(
        property,
        // The label sits on the panel, so it takes the panel's text colour; only the
        // tick is drawn on the light control surface. Mixing these up makes the label
        // dark-on-dark and all but invisible.
        new Text(label, { font: LABEL_FONT, fill: PlateTectonicsColors.textColorProperty }),
        {
          boxWidth: 15,
          checkboxColor: PlateTectonicsColors.controlSurfaceTextColorProperty,
          checkboxColorBackground: PlateTectonicsColors.controlSurfaceColorProperty,
          accessibleName: label,
          accessibleHelpText: help,
        },
      );

    const checkboxes = [
      makeCheckbox(model.showCoastlinesProperty, deepTime.coastlinesStringProperty, a11y.coastlinesStringProperty),
      makeCheckbox(model.showPlatesProperty, deepTime.platesStringProperty, a11y.platesStringProperty),
      makeCheckbox(model.showBoundariesProperty, deepTime.boundariesStringProperty, a11y.boundariesStringProperty),
      makeCheckbox(model.showDeformingProperty, deepTime.deformingStringProperty, a11y.deformingStringProperty),
    ];

    const content = new VBox({
      align: "left",
      spacing: 8,
      children: [
        new Text(deepTime.layersStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        ...checkboxes,
        // The model is credited on screen as well as in Help → About, because it is
        // published work under a licence that asks for attribution.
        new Text(deepTime.modelStringProperty, {
          font: CREDIT_FONT,
          fill: PlateTectonicsColors.secondaryTextColorProperty,
        }),
      ],
    });

    const options = optionize<DeepTimeControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = checkboxes;
  }
}
