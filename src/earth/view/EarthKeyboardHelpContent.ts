/**
 * EarthKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog (the "?" button in the navigation bar).
 *
 * The sim has three kinds of keyboard interaction, so the dialog has a section for
 * each: the geological-time slider, moving the Earth, and the usual basic actions
 * (tab, checkboxes, radio buttons and the view switch, Reset All).
 *
 * Moving the Earth — turning the globe, panning the flat map — is documented with the
 * stock "move draggable items" section: whichever view is showing *is* the draggable
 * item, and both take the arrow keys exactly as that section describes.
 */

import {
  BasicActionsKeyboardHelpSection,
  MoveDraggableItemsKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";

export class EarthKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super(
      [new SliderControlsKeyboardHelpSection(), new MoveDraggableItemsKeyboardHelpSection()],
      [new BasicActionsKeyboardHelpSection({ withCheckboxContent: true })],
    );
  }
}
