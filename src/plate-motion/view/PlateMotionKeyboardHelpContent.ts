/**
 * PlateMotionKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog while the Plate Motion screen is showing.
 *
 * Three kinds of interaction: the speed slider, the things in the play area that take
 * arrow keys, and the time controls. Everything else on the screen is a button, a radio
 * group or a checkbox, all covered by the basic-actions section — including the two drop
 * zones, which are buttons precisely so that placing a plate needs no special explanation.
 *
 * The play-area section covers the probe and the ruler, which arrow keys *move*, and the
 * manual-mode handles, which arrow keys use to run the clock forwards and back instead.
 * That difference is in the handle's own `accessibleHelpText` rather than here: it is a
 * fact about one control, and a dialog that explained every control's arrow keys
 * separately would be a worse place to find any of them.
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
