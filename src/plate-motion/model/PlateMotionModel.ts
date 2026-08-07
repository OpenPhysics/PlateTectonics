/**
 * PlateMotionModel.ts
 *
 * State for the Plate Motion screen: which plates are at the boundary, what they are
 * doing, and how far through the process the clock has run.
 *
 * ── The state machine ─────────────────────────────────────────────────────────
 * Three states, and the screen refuses to skip any of them:
 *
 *   A  empty        — no plates yet; the crust chooser is the only thing to touch
 *   B  both dropped — a boundary exists, so a motion can be chosen
 *   C  running      — the motion is locked in and the clock can run
 *
 * The lock at C is deliberate. Changing what two plates are doing halfway through 30
 * million years of doing it is not a thing that has a meaning, and allowing it would
 * make the picture on screen a composite of two different histories. "New Crust" goes
 * back to A; "Rewind" goes back to the start of C keeping the same setup.
 *
 * ── Time is a parameter, not an integrator ────────────────────────────────────
 * Nothing here accumulates geometry. `timeMillionsOfYearsProperty` is the only thing
 * that evolves, and the shape of the boundary is a pure function of it (see
 * PlateGeometry). That is what makes Rewind, step-while-paused and the time slider all
 * free, and what stops the picture depending on frame rate.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { BooleanProperty, DerivedProperty, NumberProperty, Property } from "scenerystack/axon";
import { Range, Vector2 } from "scenerystack/dot";
import type { TModel } from "scenerystack/joist";
import type { ColorMode } from "../../common/model/ColorMode.js";
import { TimeModel } from "../../common/TimeModel.js";
import {
  PLATE_MOTION_SPEED_RANGE,
  PLATE_MOTION_STEP_MYR,
  SUBDUCTION_TIME_LIMIT_MYR,
} from "../../PlateTectonicsConstants.js";
import {
  type BoundaryBehavior,
  behaviorFor,
  legalMotions,
  type MotionType,
  type Side,
  subductingSide,
  timeLimitMyr,
} from "./BoundaryRules.js";
import type { PlateType } from "./PlateType.js";

/** Where the probe starts: in the mantle, well clear of both drop zones. */
const PROBE_START = new Vector2(-260000, -120000);

export class PlateMotionModel implements TModel {
  // ── The boundary ────────────────────────────────────────────────────────────

  /** The plate on each side, or null until one has been dropped there. */
  public readonly leftPlateTypeProperty = new Property<PlateType | null>(null);
  public readonly rightPlateTypeProperty = new Property<PlateType | null>(null);

  /** Whether a boundary exists yet — state B. */
  public readonly hasBothPlatesProperty: TReadOnlyProperty<boolean>;

  /** What the two plates are doing, or null until chosen. */
  public readonly motionTypeProperty = new Property<MotionType | null>(null);

  /** The motions this pair of plates is allowed to do; empty before both are dropped. */
  public readonly legalMotionTypesProperty: TReadOnlyProperty<readonly MotionType[]>;

  /** What actually happens at this boundary, or null before it is fully specified. */
  public readonly behaviorProperty: TReadOnlyProperty<BoundaryBehavior | null>;

  /** Which side goes down, or null when neither does. */
  public readonly subductingSideProperty: TReadOnlyProperty<Side | null>;

  /** Latches once the motion is locked in — state C. */
  public readonly animationStartedProperty = new BooleanProperty(false);

  // ── The clock ───────────────────────────────────────────────────────────────

  /** How far the boundary has run, in millions of years. */
  public readonly timeMillionsOfYearsProperty = new NumberProperty(0, {
    range: new Range(0, SUBDUCTION_TIME_LIMIT_MYR),
  });

  /** How long this boundary runs before it stops. */
  public readonly timeLimitMyrProperty: TReadOnlyProperty<number>;

  /** Whether the boundary has run as far as it goes. */
  public readonly isFinishedProperty: TReadOnlyProperty<boolean>;

  /** Play/pause and elapsed wall-clock time, shared with the rest of the sim. */
  public readonly timer = new TimeModel();

  /** Millions of years per second of wall-clock time. */
  public readonly speedProperty = new NumberProperty(1, { range: PLATE_MOTION_SPEED_RANGE });

  // ── View state that belongs to the model ────────────────────────────────────

  public readonly colorModeProperty = new Property<ColorMode>("density");
  public readonly showLabelsProperty = new BooleanProperty(true);
  public readonly showSeawaterProperty = new BooleanProperty(true);

  /** Where the probe's tip sits, in model metres (x across, elevation up). */
  public readonly probePositionProperty = new Property<Vector2>(PROBE_START, {
    valueComparisonStrategy: "equalsFunction",
  });

  public constructor() {
    this.hasBothPlatesProperty = new DerivedProperty(
      [this.leftPlateTypeProperty, this.rightPlateTypeProperty],
      (left, right) => left !== null && right !== null,
    );

    this.legalMotionTypesProperty = new DerivedProperty(
      [this.leftPlateTypeProperty, this.rightPlateTypeProperty],
      (left, right): readonly MotionType[] => (left && right ? legalMotions(left, right) : []),
    );

    this.behaviorProperty = new DerivedProperty(
      [this.leftPlateTypeProperty, this.rightPlateTypeProperty, this.motionTypeProperty],
      (left, right, motion) => (left && right && motion ? behaviorFor(motion, left, right) : null),
    );

    this.subductingSideProperty = new DerivedProperty(
      [this.leftPlateTypeProperty, this.rightPlateTypeProperty, this.motionTypeProperty],
      (left, right, motion) => (left && right && motion ? subductingSide(motion, left, right) : null),
    );

    this.timeLimitMyrProperty = new DerivedProperty(
      [this.leftPlateTypeProperty, this.rightPlateTypeProperty, this.motionTypeProperty],
      (left, right, motion) =>
        left && right && motion ? timeLimitMyr(motion, left, right) : SUBDUCTION_TIME_LIMIT_MYR,
    );

    this.isFinishedProperty = new DerivedProperty(
      [this.timeMillionsOfYearsProperty, this.timeLimitMyrProperty],
      (time, limit) => time >= limit,
    );

    // Choosing a motion is what starts the run, and it is a one-way door until New
    // Crust. Clearing a plate necessarily unchooses the motion, because the motion may
    // no longer be legal for whatever is dropped next.
    this.motionTypeProperty.link((motion) => {
      if (motion !== null) {
        this.animationStartedProperty.value = true;
      }
    });
    this.hasBothPlatesProperty.link((hasBoth) => {
      if (!hasBoth) {
        this.motionTypeProperty.value = null;
        this.animationStartedProperty.value = false;
      }
    });
  }

  /** Drops a plate into one side of the boundary. */
  public setPlate(side: Side, type: PlateType | null): void {
    if (side === "left") {
      this.leftPlateTypeProperty.value = type;
    } else {
      this.rightPlateTypeProperty.value = type;
    }
  }

  /** Advances by one press of the step button, clamped to the end of the run. */
  public stepManual(): void {
    this.timeMillionsOfYearsProperty.value = Math.min(
      this.timeLimitMyrProperty.value,
      this.timeMillionsOfYearsProperty.value + PLATE_MOTION_STEP_MYR,
    );
  }

  /** Runs the same boundary again from the beginning, keeping both plates and the motion. */
  public rewind(): void {
    this.timeMillionsOfYearsProperty.value = 0;
    this.timer.reset();
  }

  /** Clears the boundary back to empty, keeping the view settings. */
  public newCrust(): void {
    this.leftPlateTypeProperty.value = null;
    this.rightPlateTypeProperty.value = null;
    this.motionTypeProperty.value = null;
    this.animationStartedProperty.value = false;
    this.rewind();
  }

  /**
   * Steps the clock by `dt` seconds of wall-clock time. Stops at the time limit rather
   * than looping: past it the process is over, and continuing would show a boundary
   * still moving after it had finished.
   */
  public step(dt: number): void {
    this.timer.step(dt);
    if (!(this.timer.isPlayingProperty.value && this.animationStartedProperty.value)) {
      return;
    }

    const limit = this.timeLimitMyrProperty.value;
    const advanced = this.timeMillionsOfYearsProperty.value + dt * this.speedProperty.value;
    this.timeMillionsOfYearsProperty.value = Math.min(limit, advanced);
    if (advanced >= limit) {
      this.timer.isPlayingProperty.value = false;
    }
  }

  /** Resets all model state to its initial values (the Reset All button). */
  public reset(): void {
    this.newCrust();
    this.speedProperty.reset();
    this.colorModeProperty.reset();
    this.showLabelsProperty.reset();
    this.showSeawaterProperty.reset();
    this.probePositionProperty.reset();
  }

  /** Releases the derived properties, so a discarded screen can be collected. */
  public dispose(): void {
    this.isFinishedProperty.dispose();
    this.timeLimitMyrProperty.dispose();
    this.subductingSideProperty.dispose();
    this.behaviorProperty.dispose();
    this.legalMotionTypesProperty.dispose();
    this.hasBothPlatesProperty.dispose();
    this.timer.dispose();
  }
}
