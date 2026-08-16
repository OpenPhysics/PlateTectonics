/**
 * EarthScreenSummaryContent.ts
 *
 * The accessible screen summary: what the play area holds, what the controls do,
 * a live description of the current state, and a hint for getting started.
 *
 * `currentDetailsContent` is derived from the model, so a screen-reader user who
 * re-reads the summary always hears which view is on screen, which data layers are
 * drawn, which earthquake depths pass the filter, and where in geological time the
 * plates are — the same information a sighted user reads off the map.
 */

import { DerivedStringProperty, PatternStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import { StringManager } from "../../i18n/StringManager.js";
import { PRESENT_DAY_TOLERANCE_MYR } from "../../PlateTectonicsConstants.js";
import type { EarthModel } from "../model/EarthModel.js";
import type { EarthquakeDepthFilter } from "../model/EarthquakeDepthFilter.js";

export class EarthScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: EarthModel) {
    const strings = StringManager.getInstance();
    const a11y = strings.getEarthA11yStrings();
    const layerStrings = strings.getLayerStrings();

    // Which view is on screen.
    const viewDescription = new DerivedStringProperty(
      [model.showGlobeProperty, a11y.viewDetails.globalStringProperty, a11y.viewDetails.globeStringProperty],
      (showGlobe: boolean, global: string, globe: string) => (showGlobe ? globe : global),
    );

    // Which layers are switched on, listed by name.
    const layerList = new DerivedStringProperty(
      [
        model.showPlatesProperty,
        model.showBoundariesProperty,
        model.showVectorsProperty,
        model.showEarthquakesProperty,
        model.showVolcanoesProperty,
        model.showTopographyProperty,
        model.showSeafloorAgeProperty,
        layerStrings.platesStringProperty,
        layerStrings.plateBoundariesStringProperty,
        layerStrings.motionVectorsStringProperty,
        layerStrings.earthquakesStringProperty,
        layerStrings.volcanoesStringProperty,
        layerStrings.topographyStringProperty,
        layerStrings.seafloorAgeStringProperty,
      ],
      (
        plates: boolean,
        boundaries: boolean,
        vectors: boolean,
        earthquakes: boolean,
        volcanoes: boolean,
        topography: boolean,
        seafloorAge: boolean,
        platesName: string,
        boundariesName: string,
        vectorsName: string,
        earthquakesName: string,
        volcanoesName: string,
        topographyName: string,
        seafloorAgeName: string,
      ) =>
        [
          plates ? platesName : null,
          boundaries ? boundariesName : null,
          vectors ? vectorsName : null,
          earthquakes ? earthquakesName : null,
          volcanoes ? volcanoesName : null,
          topography ? topographyName : null,
          seafloorAge ? seafloorAgeName : null,
        ]
          .filter((name): name is string => name !== null)
          .join(", "),
    );
    const layersDescription = new DerivedStringProperty(
      [
        layerList,
        new PatternStringProperty(a11y.layersDetailsStringProperty, { layers: layerList }),
        a11y.noLayersStringProperty,
      ],
      (list: string, withLayers: string, none: string) => (list === "" ? none : withLayers),
    );

    // Which earthquake depths pass the filter.
    const depthDescription = new DerivedStringProperty(
      [
        model.earthquakeDepthFilterProperty,
        a11y.depthDetails.allStringProperty,
        a11y.depthDetails.shallowStringProperty,
        a11y.depthDetails.intermediateStringProperty,
        a11y.depthDetails.deepStringProperty,
      ],
      (filter: EarthquakeDepthFilter, all: string, shallow: string, intermediate: string, deep: string) => {
        if (filter === "shallow") {
          return shallow;
        }
        if (filter === "intermediate") {
          return intermediate;
        }
        return filter === "deep" ? deep : all;
      },
    );

    // Where in geological time the plates are.
    const magnitudeOfTime = new DerivedStringProperty([model.timeMillionsOfYearsProperty], (time: number) =>
      Math.abs(time).toFixed(0),
    );
    const timeDescription = new DerivedStringProperty(
      [
        model.timeMillionsOfYearsProperty,
        a11y.timeDetails.presentStringProperty,
        new PatternStringProperty(a11y.timeDetails.pastStringProperty, { value: magnitudeOfTime }),
        new PatternStringProperty(a11y.timeDetails.futureStringProperty, { value: magnitudeOfTime }),
      ],
      (time: number, present: string, past: string, future: string) => {
        if (Math.abs(time) <= PRESENT_DAY_TOLERANCE_MYR) {
          return present;
        }
        return time < 0 ? past : future;
      },
    );

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: new PatternStringProperty(a11y.currentDetailsStringProperty, {
        view: viewDescription,
        layers: layersDescription,
        depths: depthDescription,
        time: timeDescription,
      }),
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });
  }
}
