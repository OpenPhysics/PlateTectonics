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
import type { EarthquakeDepthFilter } from "../model/EarthquakeDepthFilter.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";
import { createLegendSwatch } from "./LegendSwatches.js";

const LABEL_FONT = new PhetFont(13);
const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });

export type LayerControlPanelOptions = PlateTectonicsPanelOptions;

export class LayerControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: PlateTectonicsModel, providedOptions?: LayerControlPanelOptions) {
    const strings = StringManager.getInstance();
    const layerStrings = strings.getLayerStrings();
    const depthStrings = strings.getDepthFilterStrings();
    const a11y = strings.getPlateTectonicsA11yStrings().controls;

    const checkboxes = [
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
            checkboxColor: PlateTectonicsColors.controlSurfaceTextColorProperty,
            checkboxColorBackground: PlateTectonicsColors.controlSurfaceColorProperty,
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
        spacing: 5,
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

    const content = new VBox({
      align: "left",
      spacing: 9,
      children: [
        new Text(layerStrings.titleStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        new VBox({ align: "left", spacing: 7, children: checkboxes }),
        new Text(depthStrings.titleStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        depthRadioButtons,
      ],
    });

    const options = optionize<LayerControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH, align: "left" },
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
