/**
 * PlateTectonicsPanel.ts
 *
 * A pre-themed Panel that automatically uses PlateTectonicsColors for background and
 * border. Use this for all control panels and info boxes in the sim so that
 * default / projector mode switching is handled automatically.
 *
 * ── Basic usage ───────────────────────────────────────────────────────────────
 *
 *   import { PlateTectonicsPanel } from "../../common/PlateTectonicsPanel.js";
 *   import { VBox, Text } from "scenerystack/scenery";
 *
 *   const content = new VBox({
 *     children: [ new Text("label"), slider ],
 *     spacing: 8,
 *   });
 *   const panel = new PlateTectonicsPanel(content);
 *
 * ── Overriding defaults ───────────────────────────────────────────────────────
 *
 *   // Wider margins, sharper corners, custom stroke
 *   const panel = new PlateTectonicsPanel(content, { xMargin: 20, cornerRadius: 0 });
 *
 *   // Transparent background (decorative border only)
 *   const panel = new PlateTectonicsPanel(content, { fill: "transparent" });
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { Node } from "scenerystack/scenery";
import { Panel, type PanelOptions } from "scenerystack/sun";
import PlateTectonicsColors from "../PlateTectonicsColors.js";
import { PANEL_CORNER_RADIUS } from "../PlateTectonicsConstants.js";

export type PlateTectonicsPanelOptions = PanelOptions;

export class PlateTectonicsPanel extends Panel {
  public constructor(content: Node, providedOptions?: PlateTectonicsPanelOptions) {
    const options = optionize<PlateTectonicsPanelOptions, EmptySelfOptions, PanelOptions>()(
      {
        fill: PlateTectonicsColors.panelBackgroundColorProperty,
        stroke: PlateTectonicsColors.panelBorderColorProperty,
        cornerRadius: PANEL_CORNER_RADIUS,
        xMargin: 12,
        yMargin: 10,
      },
      providedOptions,
    );
    super(content, options);
  }
}
