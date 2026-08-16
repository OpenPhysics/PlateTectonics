/**
 * DeepTimeScreen.ts
 *
 * The top-level Screen component for the Deep Time screen. Wires the model and view
 * factories together and passes screen-level options up to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createDeepTimeIcon() in src/common/PlateTectonicsScreenIcons.ts.
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createDeepTimeIcon } from "../common/PlateTectonicsScreenIcons.js";
import PlateTectonicsColors from "../PlateTectonicsColors.js";
import { DeepTimeModel } from "./model/DeepTimeModel.js";
import { DeepTimeKeyboardHelpContent } from "./view/DeepTimeKeyboardHelpContent.js";
import { DeepTimeScreenView } from "./view/DeepTimeScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type DeepTimeScreenOptions = ScreenOptions & { tandem: Tandem };

export class DeepTimeScreen extends Screen<DeepTimeModel, DeepTimeScreenView> {
  public constructor(options: DeepTimeScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new DeepTimeModel(),
      // View factory — receives the model instance
      (model) =>
        new DeepTimeScreenView(model, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<DeepTimeScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: PlateTectonicsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new DeepTimeKeyboardHelpContent(),
          homeScreenIcon: createDeepTimeIcon(),
          navigationBarIcon: createDeepTimeIcon(),
        },
        options,
      ),
    );
  }
}
