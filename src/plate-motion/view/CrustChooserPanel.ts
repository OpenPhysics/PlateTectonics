/**
 * CrustChooserPanel.ts
 *
 * The three kinds of crust the user can put at the boundary, and the two zones they go
 * into.
 *
 * Each piece is a button rather than a drag source. PhET's version had them dragged into
 * place, which is a nice affordance with a pointer and an awkward one without; a piece
 * that can be clicked, or focused and activated, works identically for every input the
 * sim supports. Activating a piece fills the first empty zone, so two presses build a
 * boundary. A filled zone can be cleared by activating it, which is how a user changes
 * their mind without pressing New Crust.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { HBox, type Node, Rectangle, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { RectangularPushButton } from "scenerystack/sun";
import { FLAT_RECTANGULAR_BUTTON_OPTIONS, LIGHT_SURFACE_TEXT_FILL } from "../../common/PlateTectonicsButtonOptions.js";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";
import { PLATE_TYPES, type PlateType } from "../model/PlateType.js";

const TITLE_FONT = new PhetFont({ size: 13, weight: "bold" });
const PIECE_FONT = new PhetFont(12);

/** Size of the swatch on each crust piece, view pixels. */
const SWATCH_WIDTH = 22;
const SWATCH_HEIGHT = 12;

export type CrustChooserPanelOptions = PlateTectonicsPanelOptions;

export class CrustChooserPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: PlateMotionModel, providedOptions?: CrustChooserPanelOptions) {
    const strings = StringManager.getInstance();
    const motion = strings.getPlateMotionStrings();
    const a11y = strings.getPlateMotionA11yStrings().controls;

    const nameFor: Record<PlateType, TReadOnlyProperty<string>> = {
      continental: motion.continentalStringProperty,
      youngOceanic: motion.youngOceanicStringProperty,
      oldOceanic: motion.oldOceanicStringProperty,
    };
    const colorFor: Record<PlateType, typeof PlateTectonicsColors.continentalCrustColorProperty> = {
      continental: PlateTectonicsColors.continentalCrustColorProperty,
      youngOceanic: PlateTectonicsColors.newCrustColorProperty,
      oldOceanic: PlateTectonicsColors.oceanicCrustColorProperty,
    };

    const buttons = PLATE_TYPES.map((type) => {
      const accessibleName = new DerivedProperty(
        [a11y.crustPieceStringProperty, nameFor[type]],
        (pattern: string, name: string) => pattern.replace("{{name}}", name),
      );

      const button = new RectangularPushButton({
        ...FLAT_RECTANGULAR_BUTTON_OPTIONS,
        content: new HBox({
          spacing: 6,
          children: [
            new Rectangle(0, 0, SWATCH_WIDTH, SWATCH_HEIGHT, {
              fill: colorFor[type],
              stroke: PlateTectonicsColors.panelBorderColorProperty,
            }),
            new Text(nameFor[type], { font: PIECE_FONT, fill: LIGHT_SURFACE_TEXT_FILL, maxWidth: 96 }),
          ],
        }),
        baseColor: PlateTectonicsColors.controlSurfaceColorProperty,
        accessibleName,
        accessibleHelpText: a11y.crustPieceHelpStringProperty,
        listener: () => {
          // Fills the first empty side, so two presses make a boundary and a third does
          // nothing until something is cleared.
          if (model.leftPlateTypeProperty.value === null) {
            model.setPlate("left", type);
          } else if (model.rightPlateTypeProperty.value === null) {
            model.setPlate("right", type);
          }
        },
      });

      // Nothing to add once both sides are full; clear a side first.
      const enabled = new DerivedProperty([model.hasBothPlatesProperty], (hasBoth: boolean) => !hasBoth);
      enabled.link((value) => {
        button.enabled = value;
      });
      button.disposeEmitter.addListener(() => {
        enabled.dispose();
        accessibleName.dispose();
      });

      return button;
    });

    const content = new VBox({
      spacing: 6,
      align: "left",
      children: [
        new Text(motion.chooseCrustStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          maxWidth: 200,
        }),
        new HBox({ spacing: 6, children: buttons }),
      ],
    });

    const options = optionize<CrustChooserPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      {},
      providedOptions,
    );
    super(content, options);

    this.focusOrder = buttons;
  }
}
