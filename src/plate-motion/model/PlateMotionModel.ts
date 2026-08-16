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
 *
 * ── Automatic and manual ──────────────────────────────────────────────────────
 * In automatic mode the clock runs itself and the motion is picked from a list. In
 * manual mode the clock does not tick at all — the user drags a handle on a plate and
 * *that* is what advances time, which is the screen's causal story: the ridge appears
 * because they pulled the plates apart, not because they chose the word "divergent".
 *
 * Manual mode does not weaken the paragraph above. A handle only moves
 * `timeMillionsOfYearsProperty`; no geometry accumulates, and Rewind is still exact.
 * PhET did the same thing — its `manualHandleDragTimeChange` called
 * `clock.stepByWallSecondsForced`.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { BooleanProperty, DerivedProperty, NumberProperty, Property } from "scenerystack/axon";
import { Range, Vector2 } from "scenerystack/dot";
import type { TModel } from "scenerystack/joist";
import type { ColorMode } from "../../common/model/ColorMode.js";
import { SectionViewModel } from "../../common/model/SectionViewModel.js";
import { TimeModel } from "../../common/TimeModel.js";
import {
  MANUAL_DRAG_MAX_ANGLE_RAD,
  MANUAL_DRAG_RATE_COEFFICIENT,
  PLATE_MOTION_SPEED_RANGE,
  PLATE_MOTION_STEP_MYR,
  SUBDUCTION_TIME_LIMIT_MYR,
} from "../../PlateTectonicsConstants.js";
import {
  type BoundaryBehavior,
  behaviorFor,
  isLegal,
  legalMotions,
  type MotionType,
  type Side,
  subductingSide,
  timeLimitMyr,
} from "./BoundaryRules.js";
import type { PlateType } from "./PlateType.js";

/** Where the probe starts: in the mantle, well clear of both drop zones. */
const PROBE_START = new Vector2(-260000, -120000);

/**
 * How fast the boundary runs while a handle is deflected by `fraction` of its travel,
 * in millions of years per second of wall-clock time.
 *
 * PhET's `mapDragMagnitude`, in our units: the deflection fraction stands in for the
 * angle its handle was tilted through, and the response is the same 2.5·θ². Quadratic, so
 * a small pull creeps and a hard pull runs. The sign of the result is the sign of the
 * deflection, which is what lets pushing a handle back the way it came rewind.
 *
 * Pure, and unit-tested in tests/PlateMotionModel.test.ts.
 */
export function manualDragRateMyrPerSecond(fraction: number): number {
  if (!Number.isFinite(fraction)) {
    return 0;
  }
  const clamped = Math.min(1, Math.max(-1, fraction));
  const angle = clamped * MANUAL_DRAG_MAX_ANGLE_RAD;
  return Math.sign(clamped) * MANUAL_DRAG_RATE_COEFFICIENT * angle * angle;
}

export class PlateMotionModel implements TModel {
  // ── The boundary ────────────────────────────────────────────────────────────

  /** The plate on each side, or null until one has been dropped there. */
  public readonly leftPlateTypeProperty = new Property<PlateType | null>(null);
  public readonly rightPlateTypeProperty = new Property<PlateType | null>(null);

  /**
   * The crust piece the user has picked up and not yet placed, or null.
   *
   * The chooser used to fill the first empty side, which meant the user could not say
   * *which* side a piece went to — and the two drop zones drawn on the section were
   * decoration rather than targets. Arming a piece and then activating a zone gives the
   * choice back through every input the sim supports, pointer and keyboard alike.
   */
  public readonly armedPlateTypeProperty = new Property<PlateType | null>(null);

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

  /**
   * Whether the user is driving the boundary by hand rather than letting the clock run.
   *
   * PhET's `isAutoMode`, inverted so the default — automatic — is the falsy one. While
   * this is set, `step` does not advance the reconstruction clock: the only thing that
   * moves it is {@link advanceManual}, called by a handle being dragged.
   */
  public readonly isManualModeProperty = new BooleanProperty(false);

  // ── View state that belongs to the model ────────────────────────────────────

  public readonly colorModeProperty = new Property<ColorMode>("density");
  public readonly showLabelsProperty = new BooleanProperty(true);
  public readonly showSeawaterProperty = new BooleanProperty(true);

  /** Whether the screen is drawn as a 3-D block or as a flat section, and how stretched. */
  public readonly sectionView = new SectionViewModel();

  /**
   * Left end of the ruler, in model metres.
   *
   * Starts low and to the left, over open mantle: the one part of either section where
   * nothing else is drawn and no other tool or label is parked, so the ruler does not
   * open sitting on top of the first thing the user wants to look at.
   */
  public readonly rulerPositionProperty = new Property<Vector2>(new Vector2(-690000, -170000), {
    valueComparisonStrategy: "equalsFunction",
  });

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

  /** The plate on a side, without the caller having to pick the Property. */
  public plateAt(side: Side): PlateType | null {
    return side === "left" ? this.leftPlateTypeProperty.value : this.rightPlateTypeProperty.value;
  }

  /**
   * Activates one of the two drop zones.
   *
   * Placing what is armed if anything is, and otherwise clearing whatever is already
   * there. One action on one target, which is what lets the same press work for a pointer
   * and for a keyboard — and what lets a user change their mind about one side without
   * pressing New Crust and losing the other.
   *
   * Refused once a motion has been chosen: the boundary is running, and swapping a plate
   * under a history that has already happened would make the picture a composite of two.
   */
  public activateZone(side: Side): void {
    if (this.animationStartedProperty.value) {
      return;
    }
    const armed = this.armedPlateTypeProperty.value;
    if (armed !== null) {
      this.setPlate(side, armed);
      this.armedPlateTypeProperty.value = null;
      return;
    }
    if (this.plateAt(side) !== null) {
      this.setPlate(side, null);
    }
  }

  /**
   * Chooses the motion a handle deflection is asking for, and reports whether it took.
   *
   * `outward` is positive when the handle is being pulled away from the boundary, whichever
   * side it is on. Pulling apart is divergent; pushing together is convergent — so in
   * manual mode the motion is selected by *doing* it rather than by naming it, which is the
   * whole point of the mode.
   *
   * Returns true once a motion is settled, so a handle can go on driving the clock. Returns
   * false when the pairing cannot do what is being asked: the drag then does nothing, and
   * the already-disabled radio button in the boundary chooser is what explains why. One
   * error surface rather than two.
   */
  public selectMotionFromDrag(outward: number): boolean {
    if (this.motionTypeProperty.value !== null) {
      return true;
    }
    const left = this.leftPlateTypeProperty.value;
    const right = this.rightPlateTypeProperty.value;
    if (!(left && right) || outward === 0) {
      return false;
    }

    const wanted: MotionType = outward > 0 ? "divergent" : "convergent";
    if (!isLegal(wanted, left, right)) {
      return false;
    }
    this.motionTypeProperty.value = wanted;
    return true;
  }

  /**
   * Advances the reconstruction clock by a handle drag, in millions of years.
   *
   * Clamped at both ends: at the time limit, as the automatic clock is, and at zero, so
   * that pushing a handle back the way it came rewinds rather than running the boundary
   * backwards past its own beginning.
   *
   * Nothing accumulates here beyond the clock itself — this moves the one parameter every
   * shape is a pure function of, which is why manual mode costs nothing in exactness.
   */
  public advanceManual(deltaMyr: number): void {
    if (!(this.animationStartedProperty.value && Number.isFinite(deltaMyr))) {
      return;
    }
    const limit = this.timeLimitMyrProperty.value;
    this.timeMillionsOfYearsProperty.value = Math.min(
      limit,
      Math.max(0, this.timeMillionsOfYearsProperty.value + deltaMyr),
    );
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
    this.armedPlateTypeProperty.value = null;
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

    // PhET's `allowClockTickOnFrame`: in manual mode the only thing that moves the
    // reconstruction clock is a handle. The wall-clock timer above still runs, because it
    // is what the rest of the sim uses to pace anything not tied to the boundary.
    if (this.isManualModeProperty.value) {
      return;
    }
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
    this.isManualModeProperty.reset();
    this.speedProperty.reset();
    this.colorModeProperty.reset();
    this.showLabelsProperty.reset();
    this.showSeawaterProperty.reset();
    this.sectionView.reset();
    this.rulerPositionProperty.reset();
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
    this.sectionView.dispose();
    this.timer.dispose();
  }
}
