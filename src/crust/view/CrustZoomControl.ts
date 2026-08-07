/**
 * CrustZoomControl.ts
 *
 * How far down the Crust screen looks: at the crust itself, out to the base of the
 * lithosphere, or all the way to the centre of the Earth.
 *
 * Three discrete steps rather than PhET's continuous zoom slider. A continuous zoom
 * across four orders of magnitude spends most of its travel at scales where nothing
 * is legible — the crust is a hairline for the top three quarters of the slider. The
 * three stops are the three scales worth looking at, and each one is a scale a
 * textbook figure would actually be drawn at.
 */

import type { Property, TReadOnlyProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { VerticalAquaRadioButtonGroup } from "scenerystack/sun";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../PlateTectonicsConstants.js";
import type { CrustZoom } from "../model/CrustModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);

export type CrustZoomControlOptions = PlateTectonicsPanelOptions;

export class CrustZoomControl extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(zoomProperty: Property<CrustZoom>, providedOptions?: CrustZoomControlOptions) {
    const strings = StringManager.getInstance();
    const crust = strings.getCrustStrings();
    const a11y = strings.getCrustA11yStrings().controls;

    const label = (text: TReadOnlyProperty<string>): Text =>
      new Text(text, {
        font: LABEL_FONT,
        fill: PlateTectonicsColors.textColorProperty,
        maxWidth: CONTROL_PANEL_WIDTH - 60,
      });

    const radioButtons = new VerticalAquaRadioButtonGroup<CrustZoom>(
      zoomProperty,
      [
        { value: "crust", createNode: () => label(crust.zoomCrustStringProperty) },
        { value: "lithosphere", createNode: () => label(crust.zoomLithosphereStringProperty) },
        { value: "earth", createNode: () => label(crust.zoomEarthStringProperty) },
      ],
      {
        spacing: 4,
        radioButtonOptions: {
          radius: 7,
          selectedColor: PlateTectonicsColors.accentColorProperty,
          deselectedColor: PlateTectonicsColors.controlSurfaceColorProperty,
          stroke: PlateTectonicsColors.panelBorderColorProperty,
        },
        accessibleName: a11y.zoomStringProperty,
        accessibleHelpText: a11y.zoomHelpStringProperty,
      },
    );

    const content = new VBox({
      spacing: 8,
      align: "left",
      children: [
        new Text(crust.zoomStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 30,
        }),
        radioButtons,
      ],
    });

    const options = optionize<CrustZoomControlOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [radioButtons];
  }
}
