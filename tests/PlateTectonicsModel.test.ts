/**
 * PlateTectonicsModel.test.ts
 *
 * The screen model: layer visibility, the earthquake depth filter, the view
 * selection, and the geological-time clock.
 */

import { TimeSpeed } from "scenerystack/scenery-phet";
import { describe, expect, it } from "vitest";
import { MYR_PER_SECOND, TIME_STEP_MYR } from "../src/PlateTectonicsConstants.js";
import { depthBand, passesDepthFilter } from "../src/plate-tectonics/model/EarthquakeDepthFilter.js";
import { PlateTectonicsModel, TIME_RANGE } from "../src/plate-tectonics/model/PlateTectonicsModel.js";

describe("PlateTectonicsModel", () => {
  it("starts with every layer on, at the present day, on the flat global map", () => {
    const model = new PlateTectonicsModel();
    expect(model.showPlatesProperty.value).toBe(true);
    expect(model.showGlobeProperty.value).toBe(false);
    expect(model.isFlatMapProperty.value).toBe(true);
    expect(model.isGlobeProperty.value).toBe(false);
    expect(model.showBoundariesProperty.value).toBe(true);
    expect(model.showVectorsProperty.value).toBe(true);
    expect(model.showEarthquakesProperty.value).toBe(true);
    expect(model.showVolcanoesProperty.value).toBe(true);
    expect(model.showTopographyProperty.value).toBe(true);
    expect(model.earthquakeDepthFilterProperty.value).toBe("all");
    expect(model.selectedViewProperty.value).toBe("global");
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
    expect(model.isPresentDayProperty.value).toBe(true);
    expect(model.timer.isPlayingProperty.value).toBe(false);
  });

  it("knows when a cross-section is showing", () => {
    const model = new PlateTectonicsModel();
    expect(model.isCrossSectionProperty.value).toBe(false);
    model.selectedViewProperty.value = "subduction";
    expect(model.isCrossSectionProperty.value).toBe(true);
    model.selectedViewProperty.value = "global";
    expect(model.isCrossSectionProperty.value).toBe(false);
  });

  it("shows exactly one of the flat map, the globe and a cross-section", () => {
    const model = new PlateTectonicsModel();
    const shown = (): string[] =>
      [
        model.isFlatMapProperty.value ? "flat" : null,
        model.isGlobeProperty.value ? "globe" : null,
        model.isCrossSectionProperty.value ? "section" : null,
      ].filter((name): name is string => name !== null);

    expect(shown()).toEqual(["flat"]);

    model.showGlobeProperty.value = true;
    expect(shown()).toEqual(["globe"]);

    // A cross-section is a slice through the Earth, so it wins over both — and the
    // globe setting is remembered for when the global map comes back.
    model.selectedViewProperty.value = "subduction";
    expect(shown()).toEqual(["section"]);

    model.selectedViewProperty.value = "global";
    expect(shown()).toEqual(["globe"]);
  });

  it("does not advance geological time while paused", () => {
    const model = new PlateTectonicsModel();
    model.step(1);
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
  });

  it("advances one million years per second at the normal speed", () => {
    const model = new PlateTectonicsModel();
    model.timer.isPlayingProperty.value = true;
    model.step(1);
    expect(model.timeMillionsOfYearsProperty.value).toBeCloseTo(MYR_PER_SECOND, 6);
  });

  it("runs faster and slower when the speed changes", () => {
    const model = new PlateTectonicsModel();
    model.timer.isPlayingProperty.value = true;

    model.timeSpeedProperty.value = TimeSpeed.FAST;
    const fast = model.millionYearsPerSecond;
    model.timeSpeedProperty.value = TimeSpeed.SLOW;
    const slow = model.millionYearsPerSecond;

    expect(fast).toBeGreaterThan(MYR_PER_SECOND);
    expect(slow).toBeLessThan(MYR_PER_SECOND);
  });

  it("stops at the end of the reconstruction range instead of wrapping", () => {
    const model = new PlateTectonicsModel();
    model.timer.isPlayingProperty.value = true;
    model.step(TIME_RANGE.max * 2);

    expect(model.timeMillionsOfYearsProperty.value).toBe(TIME_RANGE.max);
    expect(model.timer.isPlayingProperty.value).toBe(false);
  });

  it("steps by a fixed amount and clamps at the ends", () => {
    const model = new PlateTectonicsModel();
    model.stepTime(1);
    expect(model.timeMillionsOfYearsProperty.value).toBeCloseTo(TIME_STEP_MYR, 6);

    model.stepTime(-1);
    expect(model.timeMillionsOfYearsProperty.value).toBeCloseTo(0, 6);

    model.timeMillionsOfYearsProperty.value = TIME_RANGE.min;
    model.stepTime(-1);
    expect(model.timeMillionsOfYearsProperty.value).toBe(TIME_RANGE.min);
  });

  it("resetTime returns to the present without touching the layers", () => {
    const model = new PlateTectonicsModel();
    model.showVolcanoesProperty.value = false;
    model.timeMillionsOfYearsProperty.value = -20;
    model.timer.isPlayingProperty.value = true;

    model.resetTime();
    expect(model.timeMillionsOfYearsProperty.value).toBe(0);
    expect(model.timer.isPlayingProperty.value).toBe(false);
    expect(model.showVolcanoesProperty.value).toBe(false);
  });

  it("reset() restores every property", () => {
    const model = new PlateTectonicsModel();
    model.showPlatesProperty.value = false;
    model.showGlobeProperty.value = true;
    model.showBoundariesProperty.value = false;
    model.showVectorsProperty.value = false;
    model.showEarthquakesProperty.value = false;
    model.showVolcanoesProperty.value = false;
    model.showTopographyProperty.value = false;
    model.earthquakeDepthFilterProperty.value = "deep";
    model.selectedViewProperty.value = "transform";
    model.timeSpeedProperty.value = TimeSpeed.FAST;
    model.timeMillionsOfYearsProperty.value = 33;

    model.reset();

    expect(model.showPlatesProperty.value).toBe(true);
    expect(model.showGlobeProperty.value).toBe(false);
    expect(model.showBoundariesProperty.value).toBe(true);
    expect(model.showVectorsProperty.value).toBe(true);
    expect(model.showEarthquakesProperty.value).toBe(true);
    expect(model.showVolcanoesProperty.value).toBe(true);
    expect(model.showTopographyProperty.value).toBe(true);
    expect(model.earthquakeDepthFilterProperty.value).toBe("all");
    expect(model.selectedViewProperty.value).toBe("global");
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
