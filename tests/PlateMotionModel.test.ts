/**
 * PlateMotionModel.test.ts
 *
 * The Plate Motion screen's state machine — empty → both plates → running — and the
 * clock that runs inside it. The transitions matter because the screen's meaning depends
 * on them: a motion chosen halfway through a run would put two different histories in
 * one picture.
 */

import { describe, expect, it } from "vitest";
import {
  MANUAL_DRAG_MAX_ANGLE_RAD,
  MANUAL_DRAG_RATE_COEFFICIENT,
  PLATE_MOTION_STEP_MYR,
  SUBDUCTION_TIME_LIMIT_MYR,
} from "../src/PlateTectonicsConstants.js";
import { manualDragRateMyrPerSecond, PlateMotionModel } from "../src/plate-motion/model/PlateMotionModel.js";

/** A model in state C: continental against old oceanic, converging. */
function running(): PlateMotionModel {
  const model = new PlateMotionModel();
  model.setPlate("left", "continental");
  model.setPlate("right", "oldOceanic");
  model.motionTypeProperty.value = "convergent";
  model.timer.isPlayingProperty.value = true;
  return model;
}

describe("PlateMotionModel state machine", () => {
  it("starts empty, with nothing chosen and nothing legal", () => {
    const model = new PlateMotionModel();
    expect(model.leftPlateTypeProperty.value).toBeNull();
    expect(model.rightPlateTypeProperty.value).toBeNull();
    expect(model.hasBothPlatesProperty.value).toBe(false);
    expect(model.legalMotionTypesProperty.value).toEqual([]);
    expect(model.animationStartedProperty.value).toBe(false);
  });

  it("offers no motion until both sides have a plate", () => {
    const model = new PlateMotionModel();
    model.setPlate("left", "continental");
    expect(model.hasBothPlatesProperty.value).toBe(false);
    expect(model.legalMotionTypesProperty.value).toEqual([]);

    model.setPlate("right", "oldOceanic");
    expect(model.hasBothPlatesProperty.value).toBe(true);
    expect(model.legalMotionTypesProperty.value).toContain("convergent");
  });

  it("offers only the motions this pairing can actually do", () => {
    const model = new PlateMotionModel();
    model.setPlate("left", "continental");
    model.setPlate("right", "oldOceanic");
    // Continent against ocean floor: they can converge, but they cannot rift apart.
    expect(model.legalMotionTypesProperty.value).toEqual(["convergent"]);
  });

  it("starts running as soon as a motion is chosen", () => {
    const model = new PlateMotionModel();
    model.setPlate("left", "continental");
    model.setPlate("right", "oldOceanic");
    expect(model.animationStartedProperty.value).toBe(false);

    model.motionTypeProperty.value = "convergent";
    expect(model.animationStartedProperty.value).toBe(true);
    expect(model.behaviorProperty.value).toBe("subduction");
    expect(model.subductingSideProperty.value).toBe("right");
  });

  it("unchooses the motion when a plate is taken away", () => {
    // The motion may not be legal for whatever is dropped next, so it cannot survive.
    const model = running();
    model.setPlate("left", null);
    expect(model.motionTypeProperty.value).toBeNull();
    expect(model.animationStartedProperty.value).toBe(false);
    expect(model.behaviorProperty.value).toBeNull();
  });

  it("goes back to empty on New Crust", () => {
    const model = running();
    model.step(1);
    model.newCrust();

    expect(model.leftPlateTypeProperty.value).toBeNull();
    expect(model.rightPlateTypeProperty.value).toBeNull();
    expect(model.motionTypeProperty.value).toBeNull();
    expect(model.animationStartedProperty.value).toBe(false);
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
  });

  it("keeps the same boundary on Rewind, only resetting the clock", () => {
    const model = running();
    model.step(3);
    expect(model.timeMillionsOfYearsProperty.value).toBeGreaterThan(0);

    model.rewind();
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
    expect(model.leftPlateTypeProperty.value).toBe("continental");
    expect(model.rightPlateTypeProperty.value).toBe("oldOceanic");
    expect(model.motionTypeProperty.value).toBe("convergent");
    expect(model.animationStartedProperty.value).toBe(true);
  });
});

describe("PlateMotionModel clock", () => {
  it("does not run before a motion has been chosen", () => {
    const model = new PlateMotionModel();
    model.setPlate("left", "continental");
    model.setPlate("right", "oldOceanic");
    model.timer.isPlayingProperty.value = true;
    model.step(5);
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
  });

  it("advances at the speed setting", () => {
    const model = running();
    model.speedProperty.value = 2;
    model.step(3);
    expect(model.timeMillionsOfYearsProperty.value).toBeCloseTo(6, 6);
  });

  it("stops and pauses itself at the time limit", () => {
    // Past the limit the process is over; continuing would show a boundary still moving
    // after it had finished.
    const model = running();
    model.step(1000);
    expect(model.timeMillionsOfYearsProperty.value).toBe(SUBDUCTION_TIME_LIMIT_MYR);
    expect(model.timer.isPlayingProperty.value).toBe(false);
    expect(model.isFinishedProperty.value).toBe(true);
  });

  it("takes the time limit from the behaviour, not a fixed number", () => {
    const subducting = running();
    expect(subducting.timeLimitMyrProperty.value).toBe(SUBDUCTION_TIME_LIMIT_MYR);

    const rifting = new PlateMotionModel();
    rifting.setPlate("left", "youngOceanic");
    rifting.setPlate("right", "oldOceanic");
    rifting.motionTypeProperty.value = "divergent";
    expect(rifting.timeLimitMyrProperty.value).toBeLessThan(SUBDUCTION_TIME_LIMIT_MYR);
  });

  it("steps by a fixed amount while paused, and clamps at the end", () => {
    const model = running();
    model.timer.isPlayingProperty.value = false;
    model.stepManual();
    expect(model.timeMillionsOfYearsProperty.value).toBe(PLATE_MOTION_STEP_MYR);

    for (let i = 0; i < 100; i++) {
      model.stepManual();
    }
    expect(model.timeMillionsOfYearsProperty.value).toBe(SUBDUCTION_TIME_LIMIT_MYR);
  });
});

describe("PlateMotionModel reset", () => {
  it("clears the boundary and every view setting", () => {
    const model = running();
    model.step(4);
    model.colorModeProperty.value = "both";
    model.showLabelsProperty.value = false;
    model.showSeawaterProperty.value = false;
    model.speedProperty.value = 8;

    model.reset();

    expect(model.leftPlateTypeProperty.value).toBeNull();
    expect(model.motionTypeProperty.value).toBeNull();
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
    expect(model.colorModeProperty.value).toBe("density");
    expect(model.showLabelsProperty.value).toBe(true);
    expect(model.showSeawaterProperty.value).toBe(true);
    expect(model.speedProperty.value).toBe(1);
  });
});

describe("PlateMotionModel manual mode", () => {
  it("does not advance the clock on its own", () => {
    // The whole point of the mode: nothing happens until the user makes it happen. PhET's
    // `allowClockTickOnFrame`.
    const model = running();
    model.isManualModeProperty.value = true;

    model.step(5);

    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
  });

  it("still advances on its own in automatic mode", () => {
    // The control against the test above — otherwise a `step` that had stopped working
    // for an unrelated reason would look like manual mode working.
    const model = running();
    model.step(5);
    expect(model.timeMillionsOfYearsProperty.value).toBeGreaterThan(0);
  });

  it("advances by a handle drag, clamped at both ends of the run", () => {
    const model = running();
    model.isManualModeProperty.value = true;

    model.advanceManual(6);
    expect(model.timeMillionsOfYearsProperty.value).toBeCloseTo(6, 9);

    // Pushing a handle back the way it came rewinds — but not past the beginning, which
    // is a state the boundary was never in.
    model.advanceManual(-20);
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);

    model.advanceManual(1000);
    expect(model.timeMillionsOfYearsProperty.value).toBe(SUBDUCTION_TIME_LIMIT_MYR);
  });

  it("does nothing before a motion has been chosen", () => {
    const model = new PlateMotionModel();
    model.setPlate("left", "continental");
    model.setPlate("right", "oldOceanic");
    model.isManualModeProperty.value = true;

    model.advanceManual(5);

    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
  });

  it("maps a drag to a rate the way PhET did: quadratic, and signed", () => {
    // PhET's `mapDragMagnitude` is 2.5·θ² with θ reaching 0.8·π/2 at full deflection.
    const full = MANUAL_DRAG_MAX_ANGLE_RAD;
    expect(manualDragRateMyrPerSecond(1)).toBeCloseTo(MANUAL_DRAG_RATE_COEFFICIENT * full * full, 9);

    // Quadratic, which is what makes a small pull creep and a hard pull run: halving the
    // deflection quarters the rate.
    expect(manualDragRateMyrPerSecond(0.5)).toBeCloseTo(manualDragRateMyrPerSecond(1) / 4, 9);

    // At rest, nothing.
    expect(manualDragRateMyrPerSecond(0)).toBe(0);

    // Signed, unlike PhET's, which took the absolute value — pushing back rewinds.
    expect(manualDragRateMyrPerSecond(-1)).toBeCloseTo(-manualDragRateMyrPerSecond(1), 9);

    // Beyond full deflection the rate stops growing, so a pointer dragged off the screen
    // cannot run 50 Myr in a frame.
    expect(manualDragRateMyrPerSecond(40)).toBeCloseTo(manualDragRateMyrPerSecond(1), 9);
  });

  it("selects the motion a drag implies: apart is divergent, together is convergent", () => {
    const apart = new PlateMotionModel();
    apart.setPlate("left", "youngOceanic");
    apart.setPlate("right", "youngOceanic");
    expect(apart.selectMotionFromDrag(1)).toBe(true);
    expect(apart.motionTypeProperty.value).toBe("divergent");

    const together = new PlateMotionModel();
    together.setPlate("left", "continental");
    together.setPlate("right", "oldOceanic");
    expect(together.selectMotionFromDrag(-1)).toBe(true);
    expect(together.motionTypeProperty.value).toBe("convergent");
  });

  it("refuses a drag that would select a motion this pairing cannot do", () => {
    // Two identical ocean plates have no density contrast to decide which subducts, so
    // there is no convergent boundary to make. Pulling them together must do nothing at
    // all rather than pick a winner — and the already-disabled radio button is what says
    // why, so the handle needs no error surface of its own.
    const model = new PlateMotionModel();
    model.setPlate("left", "oldOceanic");
    model.setPlate("right", "oldOceanic");

    expect(model.selectMotionFromDrag(-1)).toBe(false);
    expect(model.motionTypeProperty.value).toBeNull();
    expect(model.animationStartedProperty.value).toBe(false);

    // The other direction is legal, and still is after the refusal.
    expect(model.selectMotionFromDrag(1)).toBe(true);
    expect(model.motionTypeProperty.value).toBe("divergent");
  });

  it("does not change a motion that has already been chosen", () => {
    // Same one-way door the radio group has: half a history of diverging plus half a
    // history of converging is not a picture of anything.
    const model = running();
    expect(model.selectMotionFromDrag(1)).toBe(true);
    expect(model.motionTypeProperty.value).toBe("convergent");
  });

  it("returns to automatic on Reset All", () => {
    const model = running();
    model.isManualModeProperty.value = true;
    model.reset();
    expect(model.isManualModeProperty.value).toBe(false);
  });
});

describe("PlateMotionModel drop zones", () => {
  it("places the armed piece on the side that was activated", () => {
    // The gap this closes: the chooser used to fill the first empty side, so "old ocean
    // on the left" and "old ocean on the right" were not both reachable.
    const model = new PlateMotionModel();
    model.armedPlateTypeProperty.value = "oldOceanic";
    model.activateZone("right");

    expect(model.rightPlateTypeProperty.value).toBe("oldOceanic");
    expect(model.leftPlateTypeProperty.value).toBeNull();
    expect(model.armedPlateTypeProperty.value).toBeNull();
  });

  it("clears a settled side when nothing is in hand", () => {
    const model = new PlateMotionModel();
    model.setPlate("left", "continental");

    model.activateZone("left");

    expect(model.leftPlateTypeProperty.value).toBeNull();
  });

  it("swaps a settled side for what is in hand", () => {
    const model = new PlateMotionModel();
    model.setPlate("left", "continental");
    model.armedPlateTypeProperty.value = "youngOceanic";

    model.activateZone("left");

    expect(model.leftPlateTypeProperty.value).toBe("youngOceanic");
  });

  it("is inert once the boundary is running", () => {
    const model = running();
    model.armedPlateTypeProperty.value = "continental";

    model.activateZone("left");

    expect(model.leftPlateTypeProperty.value).toBe("continental");
    expect(model.rightPlateTypeProperty.value).toBe("oldOceanic");
  });

  it("drops whatever is in hand when the boundary is cleared", () => {
    const model = new PlateMotionModel();
    model.armedPlateTypeProperty.value = "continental";
    model.newCrust();
    expect(model.armedPlateTypeProperty.value).toBeNull();
  });
});
