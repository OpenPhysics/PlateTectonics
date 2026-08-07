/**
 * PlateMotionScreen.ts
 *
 * The top-level Screen component for the Plate Motion screen. Wires the model and view
 * factories together and passes screen-level options up to Screen.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createPlateMotionIcon() in src/common/PlateTectonicsScreenIcons.ts.
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Screen, type ScreenOptions } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createPlateMotionIcon } from "../common/PlateTectonicsScreenIcons.js";
import PlateTectonicsColors from "../PlateTectonicsColors.js";
import type { PlateTectonicsPreferencesModel } from "../preferences/PlateTectonicsPreferencesModel.js";
import { PlateMotionModel } from "./model/PlateMotionModel.js";
import { PlateMotionKeyboardHelpContent } from "./view/PlateMotionKeyboardHelpContent.js";
import { PlateMotionScreenView } from "./view/PlateMotionScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type PlateMotionScreenOptions = ScreenOptions & { tandem: Tandem };

export class PlateMotionScreen extends Screen<PlateMotionModel, PlateMotionScreenView> {
  public constructor(preferences: PlateTectonicsPreferencesModel, options: PlateMotionScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new PlateMotionModel(),
      // View factory — receives the model instance
      (model) =>
        new PlateMotionScreenView(model, preferences, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<PlateMotionScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: PlateTectonicsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new PlateMotionKeyboardHelpContent(),
          homeScreenIcon: createPlateMotionIcon(),
          navigationBarIcon: createPlateMotionIcon(),
        },
        options,
      ),
    );
  }
}
