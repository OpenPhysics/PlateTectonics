/**
 * EarthModel.test.ts
 *
 * The screen model: layer visibility, the earthquake depth filter, the choice
 * between the globe and the flat map, and the geological-time clock.
 */

import { TimeSpeed } from "scenerystack/scenery-phet";
import { describe, expect, it } from "vitest";
import { EarthModel, TIME_RANGE } from "../src/earth/model/EarthModel.js";
import { depthBand, passesDepthFilter } from "../src/earth/model/EarthquakeDepthFilter.js";
import { MYR_PER_SECOND, TIME_STEP_MYR } from "../src/PlateTectonicsConstants.js";

describe("EarthModel", () => {
  it("starts with every layer off, at the present day, on the globe", () => {
    const model = new EarthModel();
    expect(model.showPlatesProperty.value).toBe(false);
    expect(model.showGlobeProperty.value).toBe(true);
    expect(model.isFlatMapProperty.value).toBe(false);
    expect(model.showBoundariesProperty.value).toBe(false);
    expect(model.showVectorsProperty.value).toBe(false);
    expect(model.showEarthquakesProperty.value).toBe(false);
    expect(model.showVolcanoesProperty.value).toBe(false);
    expect(model.showTopographyProperty.value).toBe(false);
    expect(model.showSeafloorAgeProperty.value).toBe(false);
    expect(model.earthquakeDepthFilterProperty.value).toBe("all");
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
    expect(model.isPresentDayProperty.value).toBe(true);
    expect(model.timer.isPlayingProperty.value).toBe(false);
  });

  it("shows exactly one of the globe and the flat map", () => {
    const model = new EarthModel();
    const shown = (): string[] =>
      [model.showGlobeProperty.value ? "globe" : null, model.isFlatMapProperty.value ? "flat" : null].filter(
        (name): name is string => name !== null,
      );

    expect(shown()).toEqual(["globe"]);

    model.showGlobeProperty.value = false;
    expect(shown()).toEqual(["flat"]);

    model.showGlobeProperty.value = true;
    expect(shown()).toEqual(["globe"]);
  });

  it("does not advance geological time while paused", () => {
    const model = new EarthModel();
    model.step(1);
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
  });

  it("advances one million years per second at the normal speed", () => {
    const model = new EarthModel();
    model.timer.isPlayingProperty.value = true;
    model.step(1);
    expect(model.timeMillionsOfYearsProperty.value).toBeCloseTo(MYR_PER_SECOND, 6);
  });

  it("runs faster and slower when the speed changes", () => {
    const model = new EarthModel();
    model.timer.isPlayingProperty.value = true;

    model.timeSpeedProperty.value = TimeSpeed.FAST;
    const fast = model.millionYearsPerSecond;
    model.timeSpeedProperty.value = TimeSpeed.SLOW;
    const slow = model.millionYearsPerSecond;

    expect(fast).toBeGreaterThan(MYR_PER_SECOND);
    expect(slow).toBeLessThan(MYR_PER_SECOND);
  });

  it("stops at the end of the reconstruction range instead of wrapping", () => {
    const model = new EarthModel();
    model.timer.isPlayingProperty.value = true;
    model.step(TIME_RANGE.max * 2);

    expect(model.timeMillionsOfYearsProperty.value).toBe(TIME_RANGE.max);
    expect(model.timer.isPlayingProperty.value).toBe(false);
  });

  it("steps by a fixed amount and clamps at the ends", () => {
    const model = new EarthModel();
    model.stepTime(1);
    expect(model.timeMillionsOfYearsProperty.value).toBeCloseTo(TIME_STEP_MYR, 6);

    model.stepTime(-1);
    expect(model.timeMillionsOfYearsProperty.value).toBeCloseTo(0, 6);

    model.timeMillionsOfYearsProperty.value = TIME_RANGE.min;
    model.stepTime(-1);
    expect(model.timeMillionsOfYearsProperty.value).toBe(TIME_RANGE.min);
  });

  it("resetTime returns to the present without touching the layers", () => {
    const model = new EarthModel();
    model.showVolcanoesProperty.value = true;
    model.timeMillionsOfYearsProperty.value = -20;
    model.timer.isPlayingProperty.value = true;

    model.resetTime();
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
    expect(model.timer.isPlayingProperty.value).toBe(false);
    expect(model.showVolcanoesProperty.value).toBe(true);
  });

  it("reset() restores every property", () => {
    const model = new EarthModel();
    model.showPlatesProperty.value = true;
    model.showGlobeProperty.value = false;
    model.showBoundariesProperty.value = true;
    model.showVectorsProperty.value = true;
    model.showEarthquakesProperty.value = true;
    model.showVolcanoesProperty.value = true;
    model.showTopographyProperty.value = true;
    model.showSeafloorAgeProperty.value = true;
    model.earthquakeDepthFilterProperty.value = "deep";
    model.timeSpeedProperty.value = TimeSpeed.FAST;
    model.timeMillionsOfYearsProperty.value = 33;

    model.reset();

    expect(model.showPlatesProperty.value).toBe(false);
    expect(model.showGlobeProperty.value).toBe(true);
    expect(model.showBoundariesProperty.value).toBe(false);
    expect(model.showVectorsProperty.value).toBe(false);
    expect(model.showEarthquakesProperty.value).toBe(false);
    expect(model.showVolcanoesProperty.value).toBe(false);
    expect(model.showTopographyProperty.value).toBe(false);
    expect(model.showSeafloorAgeProperty.value).toBe(false);
    expect(model.earthquakeDepthFilterProperty.value).toBe("all");
    expect(model.timeSpeedProperty.value).toBe(TimeSpeed.NORMAL);
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
  });
});

describe("earthquake depth bands", () => {
  it("splits at the conventional 70 km and 300 km boundaries", () => {
    expect(depthBand(0)).toBe("shallow");
    expect(depthBand(69.9)).toBe("shallow");
    expect(depthBand(70)).toBe("intermediate");
    expect(depthBand(299)).toBe("intermediate");
    expect(depthBand(300)).toBe("deep");
    expect(depthBand(690)).toBe("deep");
  });

  it("lets everything through the 'all' filter", () => {
    for (const depth of [5, 100, 400]) {
      expect(passesDepthFilter(depth, "all")).toBe(true);
    }
  });

  it("passes only the selected band", () => {
    expect(passesDepthFilter(30, "shallow")).toBe(true);
    expect(passesDepthFilter(150, "shallow")).toBe(false);
    expect(passesDepthFilter(150, "intermediate")).toBe(true);
    expect(passesDepthFilter(500, "intermediate")).toBe(false);
    expect(passesDepthFilter(500, "deep")).toBe(true);
    expect(passesDepthFilter(30, "deep")).toBe(false);
  });
});
