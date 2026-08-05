/**
 * PlateTectonicsPreferencesNode.ts
 *
 * Custom preferences UI shown in Preferences → Simulation. Controls are bound
 * to PlateTectonicsPreferencesModel Properties (whose initial values come from
 * plateTectonicsQueryParameters).
 */

import { Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import type { Tandem } from "scenerystack/tandem";
import { StringManager } from "../i18n/StringManager.js";
import PlateTectonicsColors from "../PlateTectonicsColors.js";
import PlateTectonicsNamespace from "../PlateTectonicsNamespace.js";
import type { PlateTectonicsPreferencesModel } from "./PlateTectonicsPreferencesModel.js";

export class PlateTectonicsPreferencesNode extends VBox {
  public constructor(preferencesModel: PlateTectonicsPreferencesModel, tandem?: Tandem) {
    const prefStrings = StringManager.getInstance().getPreferences();

    // The Preferences dialog is always white, so use the dark "light control surface"
    // colors (readable on white in both default and projector profiles), not textColorProperty
    // (which is near-white in default mode and would be invisible on the white dialog).
    const header = new Text(prefStrings.titleStringProperty, {
      font: new PhetFont({ size: 18, weight: "bold" }),
      fill: PlateTectonicsColors.controlSurfaceTextColorProperty,
    });

    const showPlateLabelsCheckbox = new Checkbox(
      preferencesModel.showPlateLabelsProperty,
      new Text(prefStrings.showPlateLabelsStringProperty, {
        font: new PhetFont(14),
        fill: PlateTectonicsColors.controlSurfaceTextColorProperty,
      }),
      {
        checkboxColor: PlateTectonicsColors.controlSurfaceTextColorProperty,
        checkboxColorBackground: PlateTectonicsColors.controlSurfaceColorProperty,
        spacing: 8,
        ...(tandem && { tandem: tandem.createTandem("showPlateLabelsCheckbox") }),
      },
    );

    super({
      align: "left",
      spacing: 12,
      children: [header, showPlateLabelsCheckbox],
    });
  }
}

PlateTectonicsNamespace.register("PlateTectonicsPreferencesNode", PlateTectonicsPreferencesNode);
