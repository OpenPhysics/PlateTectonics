/**
 * CrustScreen.ts
 *
 * The top-level Screen component for the Crust screen. Wires the model and view
 * factories together and passes screen-level options up to Screen.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createCrustIcon() in src/common/PlateTectonicsScreenIcons.ts.
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Screen, type ScreenOptions } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createCrustIcon } from "../common/PlateTectonicsScreenIcons.js";
import PlateTectonicsColors from "../PlateTectonicsColors.js";
import type { PlateTectonicsPreferencesModel } from "../preferences/PlateTectonicsPreferencesModel.js";
import { CrustModel } from "./model/CrustModel.js";
import { CrustKeyboardHelpContent } from "./view/CrustKeyboardHelpContent.js";
import { CrustScreenView } from "./view/CrustScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type CrustScreenOptions = ScreenOptions & { tandem: Tandem };

export class CrustScreen extends Screen<CrustModel, CrustScreenView> {
  public constructor(preferences: PlateTectonicsPreferencesModel, options: CrustScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new CrustModel(),
      // View factory — receives the model instance
      (model) =>
        new CrustScreenView(model, preferences, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<CrustScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: PlateTectonicsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new CrustKeyboardHelpContent(),
          homeScreenIcon: createCrustIcon(),
          navigationBarIcon: createCrustIcon(),
        },
        options,
      ),
    );
  }
}
