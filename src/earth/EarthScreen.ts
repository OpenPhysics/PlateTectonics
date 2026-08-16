/**
 * EarthScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createEarthIcon() in src/common/PlateTectonicsScreenIcons.ts.
 */
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createEarthIcon } from "../common/PlateTectonicsScreenIcons.js";
import PlateTectonicsColors from "../PlateTectonicsColors.js";
import type { PlateTectonicsPreferencesModel } from "../preferences/PlateTectonicsPreferencesModel.js";
import { EarthModel } from "./model/EarthModel.js";
import { EarthKeyboardHelpContent } from "./view/EarthKeyboardHelpContent.js";
import { EarthScreenView } from "./view/EarthScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type EarthScreenOptions = ScreenOptions & { tandem: Tandem };

export class EarthScreen extends Screen<EarthModel, EarthScreenView> {
  public constructor(preferences: PlateTectonicsPreferencesModel, options: EarthScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new EarthModel(),
      // View factory — receives the model instance, plus the sim-level preferences
      // it needs (whether plate names are drawn on the map).
      (model) =>
        new EarthScreenView(model, preferences, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<EarthScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: PlateTectonicsColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new EarthKeyboardHelpContent(),
          homeScreenIcon: createEarthIcon(),
          navigationBarIcon: createEarthIcon(),
        },
        options,
      ),
    );
  }
}
