/**
 * PlateMotionTimeControlPanel.ts
 *
 * Running the boundary: play, pause, step, a speed slider, an elapsed-time readout, and
 * the two buttons that start it over.
 *
 * Rewind and New Crust are different things and both are needed. Rewind replays the same
 * two plates, which is what you want after watching a subduction zone once and wanting to
 * watch the arc appear again knowing where to look. New Crust clears the boundary so a
 * different pairing can be tried — that is the comparison the screen is for.
 *
 * The whole panel is disabled until a motion has been chosen, because until then there is
 * no history to run.
 *
 * In manual mode it collapses to the elapsed readout plus Rewind and New Crust, as PhET's
 * `TectonicsTimeControl` does: there is no clock to play, pause, step or set the speed of,
 * because the user *is* the clock. Leaving the transport controls on screen but inert
 * would say the mode had not taken effect.
 */

import { DerivedProperty, DerivedStringProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { Dimension2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { HBox, type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont, PlayPauseButton, StepForwardButton } from "scenerystack/scenery-phet";
import { HSlider, RectangularPushButton } from "scenerystack/sun";
import {
  FLAT_BUTTON_APPEARANCE_OPTIONS,
  FLAT_RECTANGULAR_BUTTON_OPTIONS,
  LIGHT_SURFACE_TEXT_FILL,
} from "../../common/PlateTectonicsButtonOptions.js";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH, PLATE_MOTION_SPEED_RANGE } from "../../PlateTectonicsConstants.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const LABEL_FONT = new PhetFont(12);
const READOUT_FONT = new PhetFont({ size: 13, weight: "bold" });

const SLIDER_WIDTH = CONTROL_PANEL_WIDTH - 50;
const SLIDER_TRACK_SIZE = new Dimension2(SLIDER_WIDTH, 4);
const SLIDER_THUMB_SIZE = new Dimension2(13, 22);

export type PlateMotionTimeControlPanelOptions = PlateTectonicsPanelOptions;

export class PlateMotionTimeControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: PlateMotionModel, providedOptions?: PlateMotionTimeControlPanelOptions) {
    const strings = StringManager.getInstance();
    const motion = strings.getPlateMotionStrings();
    const a11y = strings.getPlateMotionA11yStrings().controls;

    // Nothing to run until a boundary type has been chosen.
    const running = new DerivedProperty([model.animationStartedProperty], (started: boolean) => started);

    // The transport controls exist only while there is a clock for them to control.
    const automatic = new DerivedProperty([model.isManualModeProperty], (manual: boolean) => !manual);

    const elapsed = new DerivedStringProperty(
      [model.timeMillionsOfYearsProperty, motion.elapsedPatternStringProperty],
      (tMyr: number, pattern: string) => pattern.replace("{{value}}", tMyr.toFixed(0)),
    );

    const playPauseButton = new PlayPauseButton(model.timer.isPlayingProperty, {
      ...FLAT_BUTTON_APPEARANCE_OPTIONS,
      radius: 18,
      enabledProperty: running,
    });

    // Stepping only makes sense while paused; while playing it would fight the clock.
    const canStep = new DerivedProperty(
      [model.animationStartedProperty, model.timer.isPlayingProperty, model.isFinishedProperty],
      (started: boolean, playing: boolean, finished: boolean) => started && !playing && !finished,
    );

    const stepButton = new StepForwardButton({
      ...FLAT_BUTTON_APPEARANCE_OPTIONS,
      radius: 14,
      enabledProperty: canStep,
      listener: () => model.stepManual(),
    });

    const speedSlider = new HSlider(model.speedProperty, PLATE_MOTION_SPEED_RANGE, {
      trackSize: SLIDER_TRACK_SIZE,
      thumbSize: SLIDER_THUMB_SIZE,
      thumbFill: PlateTectonicsColors.accentColorProperty,
      trackFillEnabled: PlateTectonicsColors.controlSurfaceColorProperty,
      trackStroke: PlateTectonicsColors.panelBorderColorProperty,
      accessibleName: a11y.speedStringProperty,
      accessibleHelpText: a11y.speedHelpStringProperty,
      keyboardStep: 0.5,
      shiftKeyboardStep: 0.1,
      pageKeyboardStep: 2,
    });

    const pushButton = (
      label: TReadOnlyProperty<string>,
      accessibleName: TReadOnlyProperty<string>,
      accessibleHelpText: TReadOnlyProperty<string>,
      listener: () => void,
      enabledProperty?: TReadOnlyProperty<boolean>,
    ): RectangularPushButton =>
      new RectangularPushButton({
        ...FLAT_RECTANGULAR_BUTTON_OPTIONS,
        content: new Text(label, { font: LABEL_FONT, fill: LIGHT_SURFACE_TEXT_FILL, maxWidth: 96 }),
        baseColor: PlateTectonicsColors.controlSurfaceColorProperty,
        accessibleName,
        accessibleHelpText,
        listener,
        ...(enabledProperty ? { enabledProperty } : {}),
      });

    const rewindButton = pushButton(
      motion.rewindStringProperty,
      a11y.rewindStringProperty,
      a11y.rewindHelpStringProperty,
      () => model.rewind(),
      running,
    );
    const newCrustButton = pushButton(
      motion.newCrustStringProperty,
      a11y.newCrustStringProperty,
      a11y.newCrustHelpStringProperty,
      () => model.newCrust(),
    );

    const endLabel = (text: TReadOnlyProperty<string>): Text =>
      new Text(text, { font: LABEL_FONT, fill: PlateTectonicsColors.secondaryTextColorProperty, maxWidth: 70 });

    const content = new VBox({
      spacing: 8,
      align: "left",
      children: [
        new Text(motion.timeStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 30,
        }),
        new Text(elapsed, {
          font: READOUT_FONT,
          fill: PlateTectonicsColors.accentColorProperty,
          maxWidth: CONTROL_PANEL_WIDTH - 30,
        }),
        new VBox({
          spacing: 8,
          align: "left",
          visibleProperty: automatic,
          children: [
            new HBox({ spacing: 10, align: "center", children: [playPauseButton, stepButton] }),
            new VBox({
              spacing: 2,
              align: "left",
              children: [
                new Text(motion.speedStringProperty, {
                  font: LABEL_FONT,
                  fill: PlateTectonicsColors.textColorProperty,
                  maxWidth: SLIDER_WIDTH,
                }),
                speedSlider,
                new HBox({
                  spacing: SLIDER_WIDTH - 88,
                  children: [endLabel(motion.slowStringProperty), endLabel(motion.fastStringProperty)],
                }),
              ],
            }),
          ],
        }),
        new HBox({ spacing: 6, children: [rewindButton, newCrustButton] }),
      ],
    });

    const options = optionize<PlateMotionTimeControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [playPauseButton, stepButton, speedSlider, rewindButton, newCrustButton];

    this.disposeEmitter.addListener(() => {
      canStep.dispose();
      elapsed.dispose();
      automatic.dispose();
      running.dispose();
    });
  }
}
