/**
 * ViewControlPanel.ts
 *
 * The combo box that chooses what the main viewport shows: the global map, or a
 * cross-section through a subduction zone, a spreading ridge or a transform fault.
 * Below it, a checkbox switches the global map between the flat equirectangular map
 * and a 3-D globe the user can turn — which is a property of *how* the global map is
 * drawn rather than a fifth thing to look at, so it lives here as its own control and
 * is disabled while a cross-section is showing.
 *
 * The cross-section items are marked with the colour of the boundary type they cut
 * through, matching the boundary colours on the global map.
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox, ComboBox } from "scenerystack/sun";
import type { ViewKey } from "../../common/data/dataTypes.js";
import {
  LIGHT_SURFACE_TEXT_FILL,
  PLATE_TECTONICS_COMBO_BOX_OPTIONS,
} from "../../common/PlateTectonicsButtonOptions.js";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../PlateTectonicsConstants.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";
import { createLegendSwatch, type SwatchKind } from "./LegendSwatches.js";

const ITEM_FONT = new PhetFont(12.5);

/** Keeps the longest section name from stretching the control column over the map. */
const ITEM_MAX_WIDTH = CONTROL_PANEL_WIDTH - 66;
const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);
const HINT_FONT = new PhetFont(11);

export type ViewControlPanelOptions = PlateTectonicsPanelOptions;

export class ViewControlPanel extends PlateTectonicsPanel {
  /** The combo box, so the ScreenView can place it in the traversal order. */
  public readonly comboBox: ComboBox<ViewKey>;

  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: PlateTectonicsModel, listParent: Node, providedOptions?: ViewControlPanelOptions) {
    const strings = StringManager.getInstance();
    const viewStrings = strings.getViewStrings();
    const a11y = strings.getPlateTectonicsA11yStrings().controls;

    const items: { value: ViewKey; label: typeof viewStrings.globalStringProperty; swatch: SwatchKind | null }[] = [
      { value: "global", label: viewStrings.globalStringProperty, swatch: null },
      { value: "subduction", label: viewStrings.subductionStringProperty, swatch: "convergent" },
      { value: "divergent", label: viewStrings.divergentStringProperty, swatch: "divergent" },
      { value: "transform", label: viewStrings.transformStringProperty, swatch: "transform" },
    ];

    const comboBox = new ComboBox<ViewKey>(
      model.selectedViewProperty,
      items.map((item) => ({
        value: item.value,
        createNode: () => {
          const text = new Text(item.label, {
            font: ITEM_FONT,
            fill: LIGHT_SURFACE_TEXT_FILL,
            maxWidth: ITEM_MAX_WIDTH,
          });
          return item.swatch === null
            ? text
            : new HBox({ spacing: 6, children: [createLegendSwatch(item.swatch), text] });
        },
        accessibleName: item.label,
      })),
      listParent,
      {
        ...PLATE_TECTONICS_COMBO_BOX_OPTIONS,
        xMargin: 8,
        yMargin: 5,
        accessibleName: a11y.viewSelectorStringProperty,
        accessibleHelpText: a11y.viewSelectorHelpStringProperty,
      },
    );

    const globeCheckbox = new Checkbox(
      model.showGlobeProperty,
      new Text(viewStrings.globeStringProperty, {
        font: LABEL_FONT,
        fill: PlateTectonicsColors.textColorProperty,
      }),
      {
        // The box itself is a light control surface, so the tick has to be dark.
        checkboxColor: PlateTectonicsColors.controlSurfaceTextColorProperty,
        checkboxColorBackground: PlateTectonicsColors.controlSurfaceColorProperty,
        boxWidth: 15,
        spacing: 7,
        accessibleName: a11y.globeToggleStringProperty,
        accessibleHelpText: a11y.globeToggleHelpStringProperty,
      },
    );

    // A cross-section is a slice through the Earth, not a map of it, so there is
    // nothing for the globe to do while one is showing.
    model.isCrossSectionProperty.link((isCrossSection: boolean) => {
      globeCheckbox.enabled = !isCrossSection;
    });

    // One hint per global view, because in both cases the thing a first-time user
    // will not guess is the same: that the Earth on screen can be taken hold of and
    // moved. Only one of the two is ever showing, so they share a slot.
    const globeHint = new Text(viewStrings.globeHintStringProperty, {
      font: HINT_FONT,
      fill: PlateTectonicsColors.secondaryTextColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
    });
    model.isGlobeProperty.link((isGlobe: boolean) => {
      globeHint.visible = isGlobe;
    });

    const mapHint = new Text(viewStrings.mapHintStringProperty, {
      font: HINT_FONT,
      fill: PlateTectonicsColors.secondaryTextColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
    });
    model.isFlatMapProperty.link((isFlatMap: boolean) => {
      mapHint.visible = isFlatMap;
    });

    const content = new VBox({
      spacing: 6,
      align: "left",
      children: [
        new Text(viewStrings.titleStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        comboBox,
        globeCheckbox,
        globeHint,
        mapHint,
      ],
    });

    const options = optionize<ViewControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH, align: "left" },
      providedOptions,
    );
    super(content, options);

    this.comboBox = comboBox;
    this.focusOrder = [comboBox, globeCheckbox];
  }
}
