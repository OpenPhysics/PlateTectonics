/**
 * LayerControlPanel.ts
 *
 * The panel of checkboxes that switch each data layer on and off, plus the
 * earthquake depth filter.
 *
 * Each checkbox carries a small swatch drawn in the same colour the layer uses on
 * the map, so the panel doubles as part of the legend. The depth filter is a radio
 * group rather than a slider because the three bands — shallow, intermediate, deep
 * — are the categories geologists actually use, and isolating one of them is what
 * makes the Wadati–Benioff zone visible.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox, VerticalAquaRadioButtonGroup } from "scenerystack/sun";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../PlateTectonicsConstants.js";
import type { EarthModel } from "../model/EarthModel.js";
import type { EarthquakeDepthFilter } from "../model/EarthquakeDepthFilter.js";
import { createLegendSwatch } from "./LegendSwatches.js";

const LABEL_FONT = new PhetFont(13);
const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });

export type LayerControlPanelOptions = PlateTectonicsPanelOptions;

export class LayerControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: EarthModel, providedOptions?: LayerControlPanelOptions) {
    const strings = StringManager.getInstance();
    const layerStrings = strings.getLayerStrings();
    const depthStrings = strings.getDepthFilterStrings();
    const a11y = strings.getEarthA11yStrings().controls;

    const checkboxes = [
      {
        property: model.showPlatesProperty,
        label: layerStrings.platesStringProperty,
        accessibleName: a11y.platesStringProperty,
        swatch: createLegendSwatch("plates"),
      },
      {
        property: model.showBoundariesProperty,
        label: layerStrings.plateBoundariesStringProperty,
        accessibleName: a11y.plateBoundariesStringProperty,
        swatch: createLegendSwatch("boundaries"),
      },
      {
        property: model.showVectorsProperty,
        label: layerStrings.motionVectorsStringProperty,
        accessibleName: a11y.motionVectorsStringProperty,
        swatch: createLegendSwatch("motion"),
      },
      {
        property: model.showEarthquakesProperty,
        label: layerStrings.earthquakesStringProperty,
        accessibleName: a11y.earthquakesStringProperty,
        swatch: createLegendSwatch("earthquakes"),
      },
      {
        property: model.showVolcanoesProperty,
        label: layerStrings.volcanoesStringProperty,
        accessibleName: a11y.volcanoesStringProperty,
        swatch: createLegendSwatch("volcanoes"),
      },
      {
        property: model.showTopographyProperty,
        label: layerStrings.topographyStringProperty,
        accessibleName: a11y.topographyStringProperty,
        swatch: createLegendSwatch("topography"),
      },
      {
        property: model.showSeafloorAgeProperty,
        label: layerStrings.seafloorAgeStringProperty,
        accessibleName: a11y.seafloorAgeStringProperty,
        swatch: createLegendSwatch("seafloorAge"),
      },
    ].map(
      (entry) =>
        new Checkbox(
          entry.property,
          new HBox({
            spacing: 6,
            children: [
              entry.swatch,
              new Text(entry.label, { font: LABEL_FONT, fill: PlateTectonicsColors.textColorProperty }),
            ],
          }),
          {
            // The box itself is a light control surface, so the tick has to be dark.
            checkboxColor: PlateTectonicsColors.textColorProperty,
            checkboxColorBackground: PlateTectonicsColors.panelBackgroundColorProperty,
            boxWidth: 15,
            spacing: 7,
            accessibleName: entry.accessibleName,
          },
        ),
    );

    const depthRadioButtons = new VerticalAquaRadioButtonGroup<EarthquakeDepthFilter>(
      model.earthquakeDepthFilterProperty,
      [
        { value: "all", createNode: () => depthLabel(depthStrings.allStringProperty, "all") },
        { value: "shallow", createNode: () => depthLabel(depthStrings.shallowStringProperty, "shallow") },
        {
          value: "intermediate",
          createNode: () => depthLabel(depthStrings.intermediateStringProperty, "intermediate"),
        },
        { value: "deep", createNode: () => depthLabel(depthStrings.deepStringProperty, "deep") },
      ],
      {
        spacing: 4,
        radioButtonOptions: {
          radius: 7,
          selectedColor: PlateTectonicsColors.accentColorProperty,
          deselectedColor: PlateTectonicsColors.controlSurfaceColorProperty,
          stroke: PlateTectonicsColors.panelBorderColorProperty,
        },
        accessibleName: a11y.depthFilterStringProperty,
        accessibleHelpText: a11y.depthFilterHelpStringProperty,
      },
    );

    // The depth filter only means anything while earthquakes are drawn.
    model.showEarthquakesProperty.link((showEarthquakes: boolean) => {
      depthRadioButtons.enabled = showEarthquakes;
    });

    // Spacings are tight because the control column has to hold this panel, the view
    // selector and the whole geological-time panel inside the ScreenView's height —
    // every row of layers here comes out of the time controls below.
    const content = new VBox({
      align: "left",
      spacing: 7,
      children: [
        new Text(layerStrings.titleStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        new VBox({ align: "left", spacing: 5, children: checkboxes }),
        new Text(depthStrings.titleStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        depthRadioButtons,
      ],
    });

    const options = optionize<LayerControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH, align: "left", yMargin: 8 },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [...checkboxes, depthRadioButtons];
  }
}

/** A depth-filter label with the matching earthquake colour beside it. */
function depthLabel(labelProperty: TReadOnlyProperty<string>, band: "all" | "shallow" | "intermediate" | "deep"): Node {
  const text = new Text(labelProperty, { font: LABEL_FONT, fill: PlateTectonicsColors.textColorProperty });
  return band === "all"
    ? new HBox({ spacing: 6, children: [createLegendSwatch("allDepths"), text] })
    : new HBox({ spacing: 6, children: [createLegendSwatch(band), text] });
}
