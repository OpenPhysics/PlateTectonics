/**
 * PlateTectonicsKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog (the "?" button in the navigation bar).
 *
 * The sim has four kinds of keyboard interaction, so the dialog has a section for
 * each: the geological-time slider, turning the globe, the view combo box, and the
 * usual basic actions (tab, checkboxes and radio buttons, Reset All).
 *
 * Turning the globe is documented with the stock "move draggable items" section:
 * the globe *is* the draggable item, and its arrow keys behave exactly as that
 * section describes.
 */

import {
  BasicActionsKeyboardHelpSection,
  ComboBoxKeyboardHelpSection,
  MoveDraggableItemsKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";

export class PlateTectonicsKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    const views = StringManager.getInstance().getViewStrings();
    super(
      [new SliderControlsKeyboardHelpSection(), new MoveDraggableItemsKeyboardHelpSection()],
      [
        new ComboBoxKeyboardHelpSection({ headingString: views.titleStringProperty }),
        new BasicActionsKeyboardHelpSection({ withCheckboxContent: true }),
      ],
    );
  }
}
