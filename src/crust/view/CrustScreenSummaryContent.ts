/**
 * CrustScreenSummaryContent.ts
 *
 * The accessible screen summary for the Crust screen.
 *
 * `currentDetailsContent` is derived from the model, so a screen-reader user re-reading
 * the summary hears the same things a sighted user reads off the picture: how thick
 * and how dense the middle block is, how high it is floating, what the colours mean, how
 * far down the view reaches, and whether the section is drawn flat or as a block. The elevation sentence switches between "above" and
 * "below sea level" rather than reading out a negative number, because a block at
 * −4.2 km is a sea floor, and that is the fact worth hearing.
 */

import { DerivedStringProperty } from "scenerystack/axon";
import { ScreenSummaryContent } from "scenerystack/sim";
import type { ColorMode } from "../../common/model/ColorMode.js";
import { createSectionViewDescription } from "../../common/view/sectionViewDescription.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { CrustModel, CrustZoom } from "../model/CrustModel.js";

export class CrustScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: CrustModel) {
    const a11y = StringManager.getInstance().getCrustA11yStrings();

    const crustDetails = new DerivedStringProperty(
      [model.crustThicknessProperty, model.crustDensityProperty, a11y.crustDetailsStringProperty],
      (thicknessM: number, density: number, pattern: string) =>
        pattern.replace("{{thickness}}", (thicknessM / 1000).toFixed(0)).replace("{{density}}", density.toFixed(0)),
    );

    const elevationDetails = new DerivedStringProperty(
      [model.crustElevationProperty, a11y.elevationAboveStringProperty, a11y.elevationBelowStringProperty],
      (elevationM: number, above: string, below: string) => {
        const km = Math.abs(elevationM / 1000).toFixed(1);
        return (elevationM >= 0 ? above : below).replace("{{value}}", km);
      },
    );

    const colorModeDetails = new DerivedStringProperty(
      [
        model.colorModeProperty,
        a11y.colorModeDetailsStringProperty,
        a11y.modeDensityStringProperty,
        a11y.modeTemperatureStringProperty,
        a11y.modeBothStringProperty,
      ],
      (mode: ColorMode, pattern: string, density: string, temperature: string, both: string) => {
        const name = mode === "density" ? density : mode === "temperature" ? temperature : both;
        return pattern.replace("{{mode}}", name);
      },
    );

    const zoomDetails = new DerivedStringProperty(
      [
        model.zoomProperty,
        a11y.zoomDetailsStringProperty,
        a11y.extentCrustStringProperty,
        a11y.extentLithosphereStringProperty,
        a11y.extentEarthStringProperty,
      ],
      (zoom: CrustZoom, pattern: string, crust: string, lithosphere: string, earth: string) => {
        const extent = zoom === "crust" ? crust : zoom === "lithosphere" ? lithosphere : earth;
        return pattern.replace("{{extent}}", extent);
      },
    );

    const viewDetails = createSectionViewDescription(model.sectionView);

    const currentDetails = new DerivedStringProperty(
      [a11y.currentDetailsStringProperty, crustDetails, elevationDetails, colorModeDetails, zoomDetails, viewDetails],
      (pattern: string, crust: string, elevation: string, colorMode: string, zoom: string, view: string) =>
        pattern
          .replace("{{crust}}", crust)
          .replace("{{elevation}}", elevation)
          .replace("{{colorMode}}", colorMode)
          .replace("{{zoom}}", zoom)
          .replace("{{view}}", view),
    );

    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: currentDetails,
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });

    this.disposeEmitter.addListener(() => {
      currentDetails.dispose();
      viewDetails.dispose();
      zoomDetails.dispose();
      colorModeDetails.dispose();
      elevationDetails.dispose();
      crustDetails.dispose();
    });
  }
}
