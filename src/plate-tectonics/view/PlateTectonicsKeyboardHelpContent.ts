/**
 * PlateTectonicsKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog (the "?" button in the navigation bar).
 *
 * The sim has three kinds of keyboard interaction, so the dialog has a section for
 * each: the view combo box, the geological-time slider, and the usual basic
 * actions (tab, checkboxes and radio buttons, Reset All).
 */

import {
  BasicActionsKeyboardHelpSection,
  ComboBoxKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";

export class PlateTectonicsKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    const views = StringManager.getInstance().getViewStrings();
    super(
      [new SliderControlsKeyboardHelpSection()],
      [
        new ComboBoxKeyboardHelpSection({ headingString: views.titleStringProperty }),
        new BasicActionsKeyboardHelpSection({ withCheckboxContent: true }),
      ],
    );
  }
}
