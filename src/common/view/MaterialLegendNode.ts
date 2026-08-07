/**
 * MaterialLegendNode.ts
 *
 * The key for whichever colour ramp is currently painting the rock: a continuous strip
 * from one end of the ramp to the other, labelled at both ends.
 *
 * Continuous rather than a row of discrete swatches, because the quantity it stands for
 * is continuous — the map legend on the global screen uses discrete symbols precisely
 * because *those* quantities are categories. In "both" mode there is nothing honest to
 * put on a one-dimensional strip, so the legend hides itself rather than showing a ramp
 * that misrepresents what is on screen.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { HBox, LinearGradient, type Node, Rectangle, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { ColorMode } from "../model/ColorMode.js";

const LABEL_FONT = new PhetFont(11);
const RAMP_WIDTH = 128;
const RAMP_HEIGHT = 12;

export type MaterialLegendNodeOptions = NonNullable<ConstructorParameters<typeof HBox>[0]>;

export class MaterialLegendNode extends HBox {
  public constructor(colorModeProperty: TReadOnlyProperty<ColorMode>, providedOptions?: MaterialLegendNodeOptions) {
    const material = StringManager.getInstance().getMaterialStrings();

    const endLabel = (text: TReadOnlyProperty<string>): Text =>
      new Text(text, { font: LABEL_FONT, fill: PlateTectonicsColors.secondaryTextColorProperty, maxWidth: 90 });

    // The gradient is rebuilt whenever either ramp endpoint changes, which is what
    // makes the legend follow a Projector Mode switch.
    const ramp = new Rectangle(0, 0, RAMP_WIDTH, RAMP_HEIGHT, {
      stroke: PlateTectonicsColors.panelBorderColorProperty,
      lineWidth: 0.5,
      cornerRadius: 2,
    });

    const rampFill = new DerivedProperty(
      [
        colorModeProperty,
        PlateTectonicsColors.densityRampLowColorProperty,
        PlateTectonicsColors.densityRampHighColorProperty,
        PlateTectonicsColors.temperatureRampLowColorProperty,
        PlateTectonicsColors.temperatureRampHighColorProperty,
      ],
      (mode, densityLow, densityHigh, temperatureLow, temperatureHigh) => {
        const [low, high] = mode === "temperature" ? [temperatureLow, temperatureHigh] : [densityLow, densityHigh];
        return new LinearGradient(0, 0, RAMP_WIDTH, 0).addColorStop(0, low).addColorStop(1, high);
      },
    );
    rampFill.link((fill) => {
      ramp.fill = fill;
    });

    const lowLabel = endLabel(material.lessDenseStringProperty);
    const highLabel = endLabel(material.moreDenseStringProperty);

    // The end labels change with the mode: "less dense" and "cooler" are the same end
    // of the strip only by coincidence of how the ramps were chosen.
    const lowText = new DerivedProperty(
      [colorModeProperty, material.lessDenseStringProperty, material.coolerStringProperty],
      (mode: ColorMode, lessDense: string, cooler: string) => (mode === "temperature" ? cooler : lessDense),
    );
    const highText = new DerivedProperty(
      [colorModeProperty, material.moreDenseStringProperty, material.hotterStringProperty],
      (mode: ColorMode, moreDense: string, hotter: string) => (mode === "temperature" ? hotter : moreDense),
    );
    lowText.link((text) => {
      lowLabel.string = text;
    });
    highText.link((text) => {
      highLabel.string = text;
    });

    const options = optionize<MaterialLegendNodeOptions, EmptySelfOptions, MaterialLegendNodeOptions>()(
      { spacing: 8, align: "center", children: [lowLabel, ramp, highLabel] as Node[] },
      providedOptions,
    );
    super(options);

    // In "both" mode neither ramp alone describes the picture, so say nothing.
    const visibility = new DerivedProperty([colorModeProperty], (mode: ColorMode) => mode !== "both");
    visibility.link((visible) => {
      this.visible = visible;
    });

    this.disposeEmitter.addListener(() => {
      visibility.dispose();
      highText.dispose();
      lowText.dispose();
      rampFill.dispose();
    });
  }
}
