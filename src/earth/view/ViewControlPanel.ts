/**
 * ViewControlPanel.ts
 *
 * The switch that chooses how the Earth is drawn: as the flat equirectangular map, or
 * as a 3-D globe the user can turn. Both show the same data — this is a choice about
 * the shape of the world on screen, not about what is on it — so it is one two-position
 * switch rather than a list of views.
 *
 * Below the switch sits a one-line hint. There is one per view, because in both cases
 * the thing a first-time user will not guess is the same: that the Earth on screen can
 * be taken hold of and moved.
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { ABSwitch } from "scenerystack/sun";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../PlateTectonicsConstants.js";
import type { EarthModel } from "../model/EarthModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);
const HINT_FONT = new PhetFont(11);

/** Keeps the two switch labels from stretching the control column over the map. */
const LABEL_MAX_WIDTH = (CONTROL_PANEL_WIDTH - 90) / 2;

export type ViewControlPanelOptions = PlateTectonicsPanelOptions;

export class ViewControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: EarthModel, providedOptions?: ViewControlPanelOptions) {
    const strings = StringManager.getInstance();
    const viewStrings = strings.getViewStrings();
    const a11y = strings.getEarthA11yStrings().controls;

    const switchLabel = (label: typeof viewStrings.globeStringProperty) =>
      new Text(label, {
        font: LABEL_FONT,
        fill: PlateTectonicsColors.textColorProperty,
        maxWidth: LABEL_MAX_WIDTH,
      });

    // `false` (the flat map) sits on the left, so the switch reads left-to-right as
    // "flat map → globe" and its `true` position is the one the sim opens on.
    const viewSwitch = new ABSwitch<boolean>(
      model.showGlobeProperty,
      false,
      switchLabel(viewStrings.flatMapStringProperty),
      true,
      switchLabel(viewStrings.globeStringProperty),
      {
        spacing: 8,
        toggleSwitchOptions: {
          thumbFill: PlateTectonicsColors.controlSurfaceColorProperty,
          trackFillLeft: PlateTectonicsColors.panelBorderColorProperty,
          trackFillRight: PlateTectonicsColors.accentColorProperty,
        },
        valueAAccessibleName: viewStrings.flatMapStringProperty,
        valueBAccessibleName: viewStrings.globeStringProperty,
        accessibleHelpText: a11y.viewSwitchHelpStringProperty,
      },
    );

    // Only one of the two hints is ever showing, so they share a slot.
    const globeHint = new Text(viewStrings.globeHintStringProperty, {
      font: HINT_FONT,
      fill: PlateTectonicsColors.secondaryTextColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
      visibleProperty: model.showGlobeProperty,
    });
    const mapHint = new Text(viewStrings.mapHintStringProperty, {
      font: HINT_FONT,
      fill: PlateTectonicsColors.secondaryTextColorProperty,
      maxWidth: CONTROL_PANEL_WIDTH - 30,
      visibleProperty: model.isFlatMapProperty,
    });

    const content = new VBox({
      spacing: 6,
      align: "left",
      children: [
        new Text(viewStrings.titleStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        viewSwitch,
        globeHint,
        mapHint,
      ],
    });

    const options = optionize<ViewControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH, align: "left" },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [viewSwitch];
  }
}
