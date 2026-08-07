/**
 * CrustKeyboardHelpContent.ts
 *
 * Content for the keyboard-help dialog while the Crust screen is showing.
 *
 * Two kinds of interaction on this screen: the three sliders, and dragging the probe
 * through the cross-section. The probe is documented with the stock "move draggable
 * items" section, because it takes the arrow keys exactly as that section describes.
 */

import {
  BasicActionsKeyboardHelpSection,
  MoveDraggableItemsKeyboardHelpSection,
  SliderControlsKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";

export class CrustKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super(
      [new SliderControlsKeyboardHelpSection(), new MoveDraggableItemsKeyboardHelpSection()],
      [new BasicActionsKeyboardHelpSection({ withCheckboxContent: true })],
    );
  }
}
