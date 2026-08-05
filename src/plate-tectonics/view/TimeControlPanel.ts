/**
 * TimeControlPanel.ts
 *
 * Geological-time controls: a slider that scrubs plate positions from 50 million
 * years in the past to 50 million years into the future, play/pause/step buttons
 * with a speed setting, and a readout of where in time the reconstruction is.
 *
 * One second of wall-clock time is one million years at the normal speed, which is
 * the point of the whole panel: plate motion is imperceptible on a human timescale
 * and obvious on a geological one.
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
import { CONTROL_PANEL_WIDTH, PRESENT_DAY_TOLERANCE_MYR, TIME_STEP_MYR } from "../../PlateTectonicsConstants.js";
import { type PlateTectonicsModel, TIME_RANGE } from "../model/PlateTectonicsModel.js";

const TITLE_FONT = new PhetFont({ size: 14, weight: "bold" });
const READOUT_FONT = new PhetFont({ size: 14, weight: "bold" });
const NOTE_FONT = new PhetFont(10);

/** Size of the time slider's track and thumb, in view pixels. */
const SLIDER_TRACK_SIZE = new Dimension2(CONTROL_PANEL_WIDTH - 60, 4);
const SLIDER_THUMB_SIZE = new Dimension2(13, 24);

/** Major slider ticks every 25 Myr, minor ticks every 10 Myr. */
const MAJOR_TICK_MYR = 25;
const MINOR_TICK_MYR = 10;

export type TimeControlPanelOptions = PlateTectonicsPanelOptions;

export class TimeControlPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  public constructor(model: PlateTectonicsModel, providedOptions?: TimeControlPanelOptions) {
    const strings = StringManager.getInstance();
    const timeStrings = strings.getTimeStrings();
    const a11y = strings.getPlateTectonicsA11yStrings().controls;

    // "Present day" / "12 million years ago" / "12 million years from now".
    const pastReadout = new PatternStringProperty(timeStrings.pastStringProperty, {
      value: new DerivedProperty([model.timeMillionsOfYearsProperty], (time: number) => Math.abs(time).toFixed(1)),
    });
    const futureReadout = new PatternStringProperty(timeStrings.futureStringProperty, {
      value: new DerivedProperty([model.timeMillionsOfYearsProperty], (time: number) => time.toFixed(1)),
    });
    const readoutProperty = new DerivedStringProperty(
      [model.timeMillionsOfYearsProperty, timeStrings.presentStringProperty, pastReadout, futureReadout],
      (time: number, present: string, past: string, future: string) => {
        if (Math.abs(time) <= PRESENT_DAY_TOLERANCE_MYR) {
          return present;
        }
        return time < 0 ? past : future;
      },
    );

    const slider = new HSlider(model.timeMillionsOfYearsProperty, TIME_RANGE, {
      trackSize: SLIDER_TRACK_SIZE,
      thumbSize: SLIDER_THUMB_SIZE,
      trackFillEnabled: PlateTectonicsColors.controlSurfaceColorProperty,
      trackStroke: PlateTectonicsColors.panelBorderColorProperty,
      thumbFill: PlateTectonicsColors.accentColorProperty,
      constrainValue: (value: number) => Math.round(value / TIME_STEP_MYR) * TIME_STEP_MYR,
      keyboardStep: 1,
      shiftKeyboardStep: TIME_STEP_MYR,
      pageKeyboardStep: 10,
      accessibleName: a11y.timeSliderStringProperty,
      accessibleHelpText: a11y.timeSliderHelpStringProperty,
    });
    for (let tick = TIME_RANGE.min; tick <= TIME_RANGE.max; tick += MINOR_TICK_MYR) {
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
        new Text(timeStrings.titleStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
        }),
        new Text(readoutProperty, { font: READOUT_FONT, fill: PlateTectonicsColors.accentColorProperty }),
        slider,
        timeControlNode,
        new Text(timeStrings.rateStringProperty, {
          font: NOTE_FONT,
          fill: PlateTectonicsColors.secondaryTextColorProperty,
        }),
      ],
    });

    const options = optionize<TimeControlPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      { minWidth: CONTROL_PANEL_WIDTH },
      providedOptions,
    );
    super(content, options);

    this.focusOrder = [slider, timeControlNode];
  }
}
