/**
 * PlateTectonicsPreferencesModel.ts
 *
 * Model for the simulation-specific preferences shown in Preferences →
 * Simulation. Each preference Property takes its initial value from the
 * corresponding query parameter in plateTectonicsQueryParameters.
 */

import { BooleanProperty } from "scenerystack/axon";
import type { Tandem } from "scenerystack/tandem";
import PlateTectonicsNamespace from "../PlateTectonicsNamespace.js";
import plateTectonicsQueryParameters from "./plateTectonicsQueryParameters.js";

export class PlateTectonicsPreferencesModel {
  /** Whether plate names are drawn on the map; initial value from the `showPlateLabels` query parameter. */
  public readonly showPlateLabelsProperty: BooleanProperty;

  public constructor(tandem?: Tandem) {
    this.showPlateLabelsProperty = new BooleanProperty(
      plateTectonicsQueryParameters.showPlateLabels,
      tandem ? { tandem: tandem.createTandem("showPlateLabelsProperty") } : undefined,
    );
  }

  public reset(): void {
    this.showPlateLabelsProperty.reset();
  }
}

PlateTectonicsNamespace.register("PlateTectonicsPreferencesModel", PlateTectonicsPreferencesModel);
