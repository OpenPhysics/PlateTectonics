/**
 * DeepTimeClockPanel.ts
 *
 * The geological clock: a slider from the present day back to 250 million years ago,
 * play/pause/step buttons with a speed setting, and a readout of the age on screen.
 *
 * ── Why the slider runs the way it does ───────────────────────────────────────
 * Left is today and right is the deep past, which is how an age is quoted — "250 Ma"
 * is a bigger number than "50 Ma" — and the reverse of the Earth screen's slider,
 * where the middle is the present and both directions are available. That screen
 * extrapolates today's velocities and can therefore run forwards; this one replays a
 * published reconstruction, and there is nothing published about the future.
 */

import { DerivedProperty, DerivedStringProperty, PatternStringProperty } from "scenerystack/axon";
import { Dimension2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { type Node, Text, VBox } from "scenerystack/scenery";
import { PhetFont, TimeControlNode, TimeSpeed } from "scenerystack/scenery-phet";
import { HSlider } from "scenerystack/sun";
import {
  FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS,
  TIME_CONTROL_SPEED_RADIO_OPTIONS,
} from "../../common/PlateTectonicsButtonOptions.js";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { CONTROL_PANEL_WIDTH, DEEP_TIME_STEP_MYR, PRESENT_DAY_TOLERANCE_MYR } from "../../PlateTectonicsConstants.js";
import { DEEP_TIME_RANGE, type DeepTimeModel } from "../model/DeepTimeModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const READOUT_FONT = new PhetFont({ size: 14, weight: "bold" });
const NOTE_FONT = new PhetFont(10);

/** Size of the time slider's track and thumb, in view pixels. */
const SLIDER_TRACK_SIZE = new Dimension2(CONTROL_PANEL_WIDTH - 60, 4);
const SLIDER_THUMB_SIZE = new Dimension2(13, 24);

/** Major slider ticks every 50 Myr, minor ticks every 25 Myr. */
const MAJOR_TICK_MYR = 50;
const MINOR_TICK_MYR = 25;

export type DeepTimeClockPanelOptions = PlateTectonicsPanelOptions;

export class DeepTimeClockPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: DeepTimeModel, providedOptions?: DeepTimeClockPanelOptions) {
    const strings = StringManager.getInstance();
    const deepTime = strings.getDeepTimeStrings();
    const a11y = strings.getDeepTimeA11yStrings().controls;

    const ageReadout = new PatternStringProperty(deepTime.ageStringProperty, {
      value: new DerivedProperty([model.timeMaProperty], (time: number) => time.toFixed(0)),
    });
    const readoutProperty = new DerivedStringProperty(
      [model.timeMaProperty, deepTime.presentStringProperty, ageReadout],
      (time: number, present: string, age: string) => (time <= PRESENT_DAY_TOLERANCE_MYR ? present : age),
    );

    const slider = new HSlider(model.timeMaProperty, DEEP_TIME_RANGE, {
      trackSize: SLIDER_TRACK_SIZE,
      thumbSize: SLIDER_THUMB_SIZE,
      trackFillEnabled: PlateTectonicsColors.controlSurfaceColorProperty,
      trackStroke: PlateTectonicsColors.panelBorderColorProperty,
      thumbFill: PlateTectonicsColors.accentColorProperty,
      // Free rather than snapped to the snapshot step: the continents move
      // continuously, and letting the slider land between snapshots is what shows it.
      keyboardStep: DEEP_TIME_STEP_MYR,
      shiftKeyboardStep: 1,
      pageKeyboardStep: MINOR_TICK_MYR,
      accessibleName: a11y.timeSliderStringProperty,
      accessibleHelpText: a11y.timeSliderHelpStringProperty,
    });
    for (let tick = DEEP_TIME_RANGE.min; tick <= DEEP_TIME_RANGE.max; tick += MINOR_TICK_MYR) {
      if (tick % MAJOR_TICK_MYR === 0) {
        slider.addMajorTick(tick);
      } else {
        slider.addMinorTick(tick);
      }
    }

    const timeControlNode = new TimeControlNode(model.timer.isPlayingProperty, {
      timeSpeedProperty: model.timeSpeedProperty,
      timeSpeeds: [TimeSpeed.FAST, TimeSpeed.NORMAL, TimeSpeed.SLOW],
      playPauseStepButtonOptions: {
        ...FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS,
        includeStepBackwardButton: true,
        playPauseButtonOptions: { radius: 18, ...FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS.playPauseButtonOptions },
        stepForwardButtonOptions: {
          ...FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS.stepForwardButtonOptions,
          radius: 13,
          listener: () => model.stepTime(1),
        },
        stepBackwardButtonOptions: {
          ...FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS.stepBackwardButtonOptions,
          radius: 13,
          listener: () => model.stepTime(-1),
        },
      },
      ...TIME_CONTROL_SPEED_RADIO_OPTIONS,
      flowBoxSpacing: 12,
    });

    const content = new VBox({
      align: "center",
      spacing: 7,
      children: [
        new Text(deepTime.titleStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        new Text(readoutProperty, { font: READOUT_FONT, fill: PlateTectonicsColors.accentColorProperty }),
        slider,
        timeControlNode,
        new Text(deepTime.rateStringProperty, {
          font: NOTE_FONT,
          fill: PlateTectonicsColors.secondaryTextColorProperty,
        }),
      ],
    });

    const options = optionize<DeepTimeClockPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [slider, timeControlNode];
  }
}
