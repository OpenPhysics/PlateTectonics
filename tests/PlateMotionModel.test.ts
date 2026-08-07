/**
 * PlateMotionModel.test.ts
 *
 * The Plate Motion screen's state machine — empty → both plates → running — and the
 * clock that runs inside it. The transitions matter because the screen's meaning depends
 * on them: a motion chosen halfway through a run would put two different histories in
 * one picture.
 */

import { describe, expect, it } from "vitest";
import { PLATE_MOTION_STEP_MYR, SUBDUCTION_TIME_LIMIT_MYR } from "../src/PlateTectonicsConstants.js";
import { PlateMotionModel } from "../src/plate-motion/model/PlateMotionModel.js";

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
