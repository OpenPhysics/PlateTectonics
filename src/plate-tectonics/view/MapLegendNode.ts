/**
 * MapLegendNode.ts
 *
 * The legend strip under the viewport: what each colour and symbol means, and a
 * one-line credit naming the datasets on screen. Students are looking at real
 * observations here, so the sim says whose observations they are.
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { MAP_VIEW_BOUNDS } from "../../PlateTectonicsConstants.js";
import { createLegendSwatch, type SwatchKind } from "./LegendSwatches.js";

const LABEL_FONT = new PhetFont(11);

/** Legend entries per row; two rows fit under the viewport at every supported locale. */
const ITEMS_PER_ROW = 5;
const CREDIT_FONT = new PhetFont(9.5);

export type MapLegendNodeOptions = PlateTectonicsPanelOptions;

export class MapLegendNode extends PlateTectonicsPanel {
  public constructor(providedOptions?: MapLegendNodeOptions) {
    const strings = StringManager.getInstance();
    const legendStrings = strings.getLegendStrings();

    const entries: { swatch: SwatchKind; label: typeof legendStrings.divergentStringProperty }[] = [
      { swatch: "divergent", label: legendStrings.divergentStringProperty },
      { swatch: "convergent", label: legendStrings.convergentStringProperty },
      { swatch: "transform", label: legendStrings.transformStringProperty },
      { swatch: "shallow", label: legendStrings.shallowStringProperty },
      { swatch: "intermediate", label: legendStrings.intermediateStringProperty },
      { swatch: "deep", label: legendStrings.deepStringProperty },
      { swatch: "volcano", label: legendStrings.volcanoStringProperty },
      { swatch: "hotspot", label: legendStrings.hotspotStringProperty },
      { swatch: "motion", label: legendStrings.motionStringProperty },
      { swatch: "seafloorAge", label: legendStrings.seafloorAgeStringProperty },
    ];

    const items: Node[] = entries.map(
      (entry) =>
        new HBox({
          spacing: 5,
          align: "center",
          children: [
            createLegendSwatch(entry.swatch),
            new Text(entry.label, { font: LABEL_FONT, fill: PlateTectonicsColors.textColorProperty }),
          ],
        }),
    );

    // Two rows keep the strip inside the viewport width in every locale.
    const rows: Node[] = [];
    for (let start = 0; start < items.length; start += ITEMS_PER_ROW) {
      rows.push(new HBox({ spacing: 13, align: "center", children: items.slice(start, start + ITEMS_PER_ROW) }));
    }

    const content = new VBox({
      align: "left",
      spacing: 4,
      children: [
        ...rows,
        new Text(strings.getDataSourcesStringProperty(), {
          font: CREDIT_FONT,
          fill: PlateTectonicsColors.secondaryTextColorProperty,
          maxWidth: MAP_VIEW_BOUNDS.width - 24,
        }),
      ],
    });

    const options = optionize<MapLegendNodeOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { xMargin: 10, yMargin: 6 },
      providedOptions,
    );
    super(content, options);
  }
}
