/**
 * DeepTimeScreenSummaryContent.ts
 *
 * The screen summary a screen reader announces, with a live `currentDetails`
 * paragraph rebuilt from the model — which age is on screen, and which layers are
 * drawn. Mirrors `EarthScreenSummaryContent`.
 */

import { DerivedStringProperty, PatternStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import { StringManager } from "../../i18n/StringManager.js";
import { PRESENT_DAY_TOLERANCE_MYR } from "../../PlateTectonicsConstants.js";
import type { DeepTimeModel } from "../model/DeepTimeModel.js";

export class DeepTimeScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: DeepTimeModel) {
    const strings = StringManager.getInstance();
    const a11y = strings.getDeepTimeA11yStrings();
    const deepTime = strings.getDeepTimeStrings();

    const pastDetails = new PatternStringProperty(a11y.timeDetails.pastStringProperty, {
      value: new DerivedStringProperty([model.timeMaProperty], (time: number) => time.toFixed(0)),
    });
    const timeDetails = new DerivedStringProperty(
      [model.timeMaProperty, a11y.timeDetails.presentStringProperty, pastDetails],
      (time: number, present: string, past: string) => (time <= PRESENT_DAY_TOLERANCE_MYR ? present : past),
    );

    const layerList = new DerivedStringProperty(
      [
        model.showCoastlinesProperty,
        model.showPlatesProperty,
        model.showBoundariesProperty,
        model.showDeformingProperty,
        deepTime.coastlinesStringProperty,
        deepTime.platesStringProperty,
        deepTime.boundariesStringProperty,
        deepTime.deformingStringProperty,
      ],
      (
        coastlines: boolean,
        plates: boolean,
        boundaries: boolean,
        deforming: boolean,
        coastlinesLabel: string,
        platesLabel: string,
        boundariesLabel: string,
        deformingLabel: string,
      ) =>
        [
          coastlines ? coastlinesLabel : null,
          plates ? platesLabel : null,
          boundaries ? boundariesLabel : null,
          deforming ? deformingLabel : null,
        ]
          .filter((label): label is string => label !== null)
          .join(", "),
    );

    const layersDetails = new PatternStringProperty(a11y.layersDetailsStringProperty, { layers: layerList });
    const layersOrNone = new DerivedStringProperty(
      [layerList, layersDetails, a11y.noLayersStringProperty],
      (list: string, withLayers: string, none: string) => (list.length === 0 ? none : withLayers),
    );

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: new PatternStringProperty(a11y.currentDetailsStringProperty, {
        time: timeDetails,
        layers: layersOrNone,
      }),
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });
  }
}
