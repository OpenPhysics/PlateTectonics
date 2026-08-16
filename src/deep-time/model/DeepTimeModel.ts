/**
 * DeepTimeModel.ts
 *
 * State for the Deep Time screen, as AXON Properties the view observes.
 *
 * Like the Plate Tectonics screen, the model holds no geometry: the reconstruction is
 * a fixed dataset (`plateHistoryData` and `plateSnapshotData`) and the only thing that
 * evolves is `timeMaProperty`, the age being looked at.
 *
 * ── Why the clock only runs backwards ─────────────────────────────────────────
 * The Plate Tectonics screen's clock is symmetric — it extrapolates today's plate
 * velocities forwards as readily as backwards, and is honest about neither beyond
 * ±50 Myr. This screen replays a *published reconstruction* instead, and no published
 * reconstruction runs into the future: there is nothing to reconstruct there. So the
 * range is 0 to 250 Ma, "0" is today, and larger numbers are further into the past —
 * which is also how geologists quote an age, and why the slider runs the way it does.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { BooleanProperty, DerivedProperty, EnumerationProperty, NumberProperty } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import type { TModel } from "scenerystack/joist";
import { TimeSpeed } from "scenerystack/scenery-phet";
import { HISTORY_OLDEST_MA } from "../../common/DeepTimeReconstruction.js";
import { TimeModel } from "../../common/TimeModel.js";
import {
  DEEP_TIME_MYR_PER_SECOND,
  DEEP_TIME_STEP_MYR,
  FAST_SPEED_MULTIPLIER,
  PRESENT_DAY_TOLERANCE_MYR,
  SLOW_SPEED_MULTIPLIER,
} from "../../PlateTectonicsConstants.js";

/** Range of the geological clock, in millions of years before the present. */
export const DEEP_TIME_RANGE = new Range(0, HISTORY_OLDEST_MA);

export class DeepTimeModel implements TModel {
  // ── Layer visibility ────────────────────────────────────────────────────────
  //
  // Unlike the Plate Tectonics screen, the continents start *on*: they are the thing
  // being watched move, and an empty globe at 250 Ma says nothing at all.

  /** Reconstructed coastlines — the continents, carried by their plates. */
  public readonly showCoastlinesProperty = new BooleanProperty(true);

  /** The per-plate colour wash and plate outlines, from the resolved topologies. */
  public readonly showPlatesProperty = new BooleanProperty(true);

  /** Plate boundaries, colour-coded divergent / convergent / transform. */
  public readonly showBoundariesProperty = new BooleanProperty(true);

  /**
   * The deforming belts — orogens and rifts — where the model explicitly does not
   * treat the lithosphere as rigid. Off by default: they are the subtlest thing on
   * the screen and they clutter the plate mosaic before a student has read it.
   */
  public readonly showDeformingProperty = new BooleanProperty(false);

  // ── Time ────────────────────────────────────────────────────────────────────

  /** Age being looked at, in millions of years before the present. */
  public readonly timeMaProperty = new NumberProperty(0, { range: DEEP_TIME_RANGE });

  /** Play/pause for the geological clock, plus the elapsed wall-clock time. */
  public readonly timer = new TimeModel();

  /** Slow / normal / fast, applied to {@link DEEP_TIME_MYR_PER_SECOND}. */
  public readonly timeSpeedProperty = new EnumerationProperty(TimeSpeed.NORMAL);

  /** True while the reconstruction is (within rounding) at the present day. */
  public readonly isPresentDayProperty: TReadOnlyProperty<boolean>;

  public constructor() {
    this.isPresentDayProperty = new DerivedProperty(
      [this.timeMaProperty],
      (time: number) => time <= PRESENT_DAY_TOLERANCE_MYR,
    );
  }

  /** Millions of years of plate motion per second of wall-clock time, at the current speed. */
  public get millionYearsPerSecond(): number {
    if (this.timeSpeedProperty.value === TimeSpeed.SLOW) {
      return DEEP_TIME_MYR_PER_SECOND * SLOW_SPEED_MULTIPLIER;
    }
    if (this.timeSpeedProperty.value === TimeSpeed.FAST) {
      return DEEP_TIME_MYR_PER_SECOND * FAST_SPEED_MULTIPLIER;
    }
    return DEEP_TIME_MYR_PER_SECOND;
  }

  /**
   * Advances the clock by one press of the step button. `direction` is +1 for
   * *further into the past*, matching the way the clock plays.
   */
  public stepTime(direction: 1 | -1): void {
    this.timeMaProperty.value = DEEP_TIME_RANGE.constrainValue(
      this.timeMaProperty.value + direction * DEEP_TIME_STEP_MYR,
    );
  }

  /** Returns the reconstruction to the present day, leaving layer settings alone. */
  public resetTime(): void {
    this.timeMaProperty.reset();
    this.timer.reset();
  }

  /**
   * Steps the model by `dt` seconds of wall-clock time. Playing runs *backwards into
   * the past*, which is the direction the story goes: today, then the Atlantic closing,
   * then Pangaea. It stops at the oldest reconstructed instant rather than wrapping.
   */
  public step(dt: number): void {
    this.timer.step(dt);
    if (!this.timer.isPlayingProperty.value) {
      return;
    }

    const advanced = this.timeMaProperty.value + dt * this.millionYearsPerSecond;
    this.timeMaProperty.value = DEEP_TIME_RANGE.constrainValue(advanced);
    if (advanced >= DEEP_TIME_RANGE.max) {
      this.timer.isPlayingProperty.value = false;
    }
  }

  /** Resets all model state to its initial values (the Reset All button). */
  public reset(): void {
    this.showCoastlinesProperty.reset();
    this.showPlatesProperty.reset();
    this.showBoundariesProperty.reset();
    this.showDeformingProperty.reset();
    this.timeSpeedProperty.reset();
    this.resetTime();
  }
}
