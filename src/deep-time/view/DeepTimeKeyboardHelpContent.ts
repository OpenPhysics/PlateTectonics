/**
 * DeepTimeKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog (the "?" button in the navigation bar).
 *
 * The same three kinds of interaction as the Earth screen, minus the flat map: the
 * geological-time slider, turning the globe, and the usual basic actions. Turning the
 * globe is documented with the stock "move draggable items" section, because the globe
 * *is* the draggable item and takes the arrow keys exactly as that section describes.
 */

import {
  BasicActionsKeyboardHelpSection,
  MoveDraggableItemsKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";

export class DeepTimeKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super(
      [new SliderControlsKeyboardHelpSection(), new MoveDraggableItemsKeyboardHelpSection()],
      [new BasicActionsKeyboardHelpSection({ withCheckboxContent: true })],
    );
  }
}
