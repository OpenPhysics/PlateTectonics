/**
 * MotionTypeControlPanel.ts
 *
 * What the two plates are doing: converging or diverging.
 *
 * Each option is disabled whenever this particular pair of plates cannot do it, and the
 * whole panel is disabled until both sides have a plate. That is doing pedagogical work
 * rather than defensive work — discovering that two identical ocean plates *cannot* be
 * made to converge is the point, and it is a discovery only if the control says so
 * rather than silently drawing something arbitrary.
 *
 * Once a motion is chosen the group locks: changing it halfway through 30 million years
 * of history would put two different histories in one picture.
 */

import { DerivedProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { HBox, type Node, Rectangle, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { VerticalAquaRadioButtonGroup } from "scenerystack/sun";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH } from "../../PlateTectonicsConstants.js";
import { MOTION_TYPES, type MotionType } from "../model/BoundaryRules.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(13);

export type MotionTypeControlPanelOptions = PlateTectonicsPanelOptions;

export class MotionTypeControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: PlateMotionModel, providedOptions?: MotionTypeControlPanelOptions) {
    const strings = StringManager.getInstance();
    const motion = strings.getPlateMotionStrings();
    const a11y = strings.getPlateMotionA11yStrings().controls;

    const nameFor: Record<MotionType, typeof motion.convergentStringProperty> = {
      convergent: motion.convergentStringProperty,
      divergent: motion.divergentStringProperty,
    };

    // The same colours the global map uses for these boundary types, so a divergent
    // boundary is the same colour wherever it appears in the simulation.
    const colorFor: Record<MotionType, typeof PlateTectonicsColors.convergentBoundaryColorProperty> = {
      convergent: PlateTectonicsColors.convergentBoundaryColorProperty,
      divergent: PlateTectonicsColors.divergentBoundaryColorProperty,
    };

    const disposers: (() => void)[] = [];

    const items = MOTION_TYPES.map((type) => {
      // A motion is available only while this pairing can do it and nothing has started.
      const enabled = new DerivedProperty(
        [model.legalMotionTypesProperty, model.animationStartedProperty],
        (legal: readonly MotionType[], started: boolean) => !started && legal.includes(type),
      );
      disposers.push(() => enabled.dispose());

      return {
        value: type as MotionType | null,
        createNode: () =>
          new HBox({
            spacing: 6,
            children: [
              new Rectangle(0, 0, 14, 14, {
                fill: colorFor[type],
                stroke: PlateTectonicsColors.panelBorderColorProperty,
                cornerRadius: 2,
              }),
              new Text(nameFor[type], {
                font: LABEL_FONT,
                fill: PlateTectonicsColors.textColorProperty,
                maxWidth: CONTROL_PANEL_WIDTH - 70,
              }),
            ],
          }),
        options: { enabledProperty: enabled },
      };
    });

    const radioButtons = new VerticalAquaRadioButtonGroup<MotionType | null>(model.motionTypeProperty, items, {
      spacing: 4,
      radioButtonOptions: {
        radius: 7,
        selectedColor: PlateTectonicsColors.accentColorProperty,
        deselectedColor: PlateTectonicsColors.controlSurfaceColorProperty,
        stroke: PlateTectonicsColors.panelBorderColorProperty,
      },
      accessibleName: a11y.boundaryTypeStringProperty,
      accessibleHelpText: a11y.boundaryTypeHelpStringProperty,
    });

    const content = new VBox({
      spacing: 8,
      align: "left",
      children: [
        new Text(motion.boundaryTypeStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 30,
        }),
        radioButtons,
      ],
    });

    const options = optionize<MotionTypeControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [radioButtons];
    this.disposeEmitter.addListener(() => {
      for (const dispose of disposers) {
        dispose();
      }
    });
  }
}
