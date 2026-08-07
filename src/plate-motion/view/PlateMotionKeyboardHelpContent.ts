/**
 * PlateMotionKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog while the Plate Motion screen is showing.
 *
 * Three kinds of interaction: the speed slider, the probe (which takes arrow keys like
 * any draggable item), and the time controls. Everything else on the screen is a button,
 * a radio group or a checkbox, all covered by the basic-actions section.
 */

import {
  BasicActionsKeyboardHelpSection,
  MoveDraggableItemsKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TimeControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";

export class PlateMotionKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super(
      [new TimeControlsKeyboardHelpSection(), new SliderControlsKeyboardHelpSection()],
      [new MoveDraggableItemsKeyboardHelpSection(), new BasicActionsKeyboardHelpSection({ withCheckboxContent: true })],
    );
  }
}
