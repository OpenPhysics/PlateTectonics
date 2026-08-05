/**
 * PlateTectonicsScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createPlateTectonicsIcon() in src/common/PlateTectonicsScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createPlateTectonicsIcon } from "../common/PlateTectonicsScreenIcons.js";
import PlateTectonicsColors from "../PlateTectonicsColors.js";
import type { PlateTectonicsPreferencesModel } from "../preferences/PlateTectonicsPreferencesModel.js";
import { PlateTectonicsModel } from "./model/PlateTectonicsModel.js";
import { PlateTectonicsKeyboardHelpContent } from "./view/PlateTectonicsKeyboardHelpContent.js";
import { PlateTectonicsScreenView } from "./view/PlateTectonicsScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type PlateTectonicsScreenOptions = ScreenOptions & { tandem: Tandem };

export class PlateTectonicsScreen extends Screen<PlateTectonicsModel, PlateTectonicsScreenView> {
  public constructor(preferences: PlateTectonicsPreferencesModel, options: PlateTectonicsScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new PlateTectonicsModel(),
      // View factory — receives the model instance, plus the sim-level preferences
      // it needs (whether plate names are drawn on the map).
      (model) =>
        new PlateTectonicsScreenView(model, preferences, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<PlateTectonicsScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: PlateTectonicsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new PlateTectonicsKeyboardHelpContent(),
          homeScreenIcon: createPlateTectonicsIcon(),
          navigationBarIcon: createPlateTectonicsIcon(),
        },
        options,
      ),
    );
  }
}
