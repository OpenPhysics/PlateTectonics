/**
 * PlayModeControl.ts
 *
 * Automatic or manual: whether the clock runs the boundary, or the user does.
 *
 * PhET put this first among the controls, and it belongs there — it decides what all the
 * other controls on the screen are for. In automatic mode the boundary type is chosen from
 * a list and the clock runs it; in manual mode there is no clock to run and the plates are
 * pulled by hand, which is what makes the ridge appear *because the user pulled* rather
 * than because they picked the word "divergent" off a menu.
 *
 * The two modes are not two ways of doing the same thing. Automatic answers "what happens
 * when two plates like these converge"; manual answers "what happens when I push these two
 * plates together", and only the second has the user in it.
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { VerticalAquaRadioButtonGroup } from "scenerystack/sun";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../PlateTectonicsConstants.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);

export type PlayModeControlOptions = PlateTectonicsPanelOptions;

export class PlayModeControl extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: PlateMotionModel, providedOptions?: PlayModeControlOptions) {
    const strings = StringManager.getInstance();
    const motion = strings.getPlateMotionStrings();
    const a11y = strings.getPlateMotionA11yStrings().controls;

    const label = (text: typeof motion.automaticStringProperty): Text =>
      new Text(text, {
        font: LABEL_FONT,
        fill: PlateTectonicsColors.textColorProperty,
        maxWidth: CONTROL_PANEL_WIDTH - 60,
      });

    // Boolean-valued, matching `isManualModeProperty`, so the default — automatic — is
    // the falsy one and Reset All needs no special case.
    const radioButtons = new VerticalAquaRadioButtonGroup<boolean>(
      model.isManualModeProperty,
      [
        { value: false, createNode: () => label(motion.automaticStringProperty) },
        { value: true, createNode: () => label(motion.manualStringProperty) },
      ],
      {
        spacing: 4,
        radioButtonOptions: {
          radius: 7,
          selectedColor: PlateTectonicsColors.accentColorProperty,
          deselectedColor: PlateTectonicsColors.controlSurfaceColorProperty,
          stroke: PlateTectonicsColors.panelBorderColorProperty,
        },
        accessibleName: a11y.motionModeStringProperty,
        accessibleHelpText: a11y.motionModeHelpStringProperty,
      },
    );

    const content = new VBox({
      spacing: 8,
      align: "left",
      children: [
        new Text(motion.motionModeStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 30,
        }),
        radioButtons,
      ],
    });

    const options = optionize<PlayModeControlOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [radioButtons];
  }
}
