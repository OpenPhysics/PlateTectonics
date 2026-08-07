/**
 * CrustModel.test.ts
 *
 * The Crust screen's state: that the slider → density → elevation chain behaves the way
 * the screen claims it does, that the probe reads the right material, and that reset
 * puts everything back.
 */

import { describe, expect, it } from "vitest";
import { CrustModel } from "../src/crust/model/CrustModel.js";
import {
  FIXED_CONTINENTAL_DENSITY_KG_M3,
  FIXED_OCEANIC_DENSITY_KG_M3,
  MY_CRUST_THICKNESS_DEFAULT_M,
  MY_CRUST_THICKNESS_RANGE_M,
  SURFACE_TEMPERATURE_K,
  TERRAIN_DENSITY_KG_M3,
} from "../src/PlateTectonicsConstants.js";

/** Run the relaxation to convergence, so the block is at its target. */
function settle(model: CrustModel): void {
  for (let i = 0; i < 600; i++) {
    model.step(1 / 60);
  }
}

describe("CrustModel sliders", () => {
  it("opens already at its isostatic equilibrium", () => {
    // Nothing to wait for on load: the screen is in equilibrium before it is touched.
    const model = new CrustModel();
    expect(model.crustElevationProperty.value).toBeCloseTo(model.targetElevationProperty.value, 6);
    expect(model.crustThicknessProperty.value).toBe(MY_CRUST_THICKNESS_DEFAULT_M);
  });

  it("floats a thicker block higher", () => {
    const model = new CrustModel();
    model.crustThicknessProperty.value = MY_CRUST_THICKNESS_RANGE_M.min;
    settle(model);
    const thin = model.crustElevationProperty.value;

    model.crustThicknessProperty.value = MY_CRUST_THICKNESS_RANGE_M.max;
    settle(model);
    expect(model.crustElevationProperty.value).toBeGreaterThan(thin);
  });

  it("floats a denser block lower", () => {
    const model = new CrustModel();
    model.compositionRatioProperty.value = 1; // most silica-rich, least dense
    settle(model);
    const light = model.crustElevationProperty.value;

    model.compositionRatioProperty.value = 0; // most iron-rich, densest
    settle(model);
    expect(model.crustElevationProperty.value).toBeLessThan(light);
  });

  it("makes warm crust slightly less dense, and so slightly higher", () => {
    const model = new CrustModel();
    model.temperatureRatioProperty.value = 0;
    const coldDensity = model.crustDensityProperty.value;
    settle(model);
    const cold = model.crustElevationProperty.value;

    model.temperatureRatioProperty.value = 1;
    expect(model.crustDensityProperty.value).toBeLessThan(coldDensity);
    settle(model);
    expect(model.crustElevationProperty.value).toBeGreaterThan(cold);
  });

  it("lets composition dominate temperature, as the rock physics requires", () => {
    const model = new CrustModel();
    model.temperatureRatioProperty.value = 0.5;
    model.compositionRatioProperty.value = 0;
    const ironDensity = model.crustDensityProperty.value;
    model.compositionRatioProperty.value = 1;
    const silicaDensity = model.crustDensityProperty.value;

    model.compositionRatioProperty.value = 0.5;
    model.temperatureRatioProperty.value = 0;
    const coldDensity = model.crustDensityProperty.value;
    model.temperatureRatioProperty.value = 1;
    const hotDensity = model.crustDensityProperty.value;

    expect(ironDensity - silicaDensity).toBeGreaterThan(5 * (coldDensity - hotDensity));
  });

  it("settles rather than snapping when a slider moves", () => {
    const model = new CrustModel();
    model.crustThicknessProperty.value = MY_CRUST_THICKNESS_RANGE_M.max;

    // One frame in, it is on its way but nowhere near there.
    model.step(1 / 60);
    const afterOneFrame = model.crustElevationProperty.value;
    expect(afterOneFrame).not.toBeCloseTo(model.targetElevationProperty.value, 0);

    settle(model);
    expect(model.crustElevationProperty.value).toBeCloseTo(model.targetElevationProperty.value, 1);
  });
});

describe("CrustModel columns", () => {
  it("puts the user's block between the two fixed ones", () => {
    const model = new CrustModel();
    const [oceanic, mine, continental] = model.columns;
    expect(oceanic?.densityKgM3).toBe(FIXED_OCEANIC_DENSITY_KG_M3);
    expect(continental?.densityKgM3).toBe(FIXED_CONTINENTAL_DENSITY_KG_M3);
    expect(mine).toEqual(model.myCrust);
    expect(oceanic?.rightM).toBe(mine?.leftM);
    expect(mine?.rightM).toBe(continental?.leftM);
  });

  it("floats the fixed continental block above the fixed oceanic one", () => {
    // The comparison the whole screen exists to make: continents stand high, ocean
    // floors lie low, and it is thickness and density that decide which.
    const model = new CrustModel();
    const [oceanic, , continental] = model.columns;
    expect(continental?.elevationM).toBeGreaterThan(0);
    expect(oceanic?.elevationM).toBeLessThan(0);
  });

  it("finds the block containing a point, and nothing beyond them", () => {
    const model = new CrustModel();
    const mine = model.myCrust;
    expect(model.columnAt(0)).toEqual(mine);
    expect(model.columnAt(mine.leftM - 1)).not.toEqual(mine);
    expect(model.columnAt(1e9)).toBeNull();
  });
});

describe("CrustModel probe readings", () => {
  it("reports surface rock rather than air above the ground", () => {
    const model = new CrustModel();
    const aboveSurface = model.myCrust.elevationM + 5000;
    expect(model.densityAtPoint(0, aboveSurface)).toBe(TERRAIN_DENSITY_KG_M3);
    expect(model.temperatureAtPoint(0, aboveSurface)).toBeCloseTo(SURFACE_TEMPERATURE_K, 6);
  });

  it("reports the block's own density inside it", () => {
    const model = new CrustModel();
    const mine = model.myCrust;
    const insideCrust = mine.elevationM - mine.thicknessM / 2;
    expect(model.densityAtPoint(0, insideCrust)).toBeCloseTo(mine.densityKgM3, 6);
  });

  it("reports mantle density below the block, which is denser than the crust", () => {
    const model = new CrustModel();
    const mine = model.myCrust;
    const belowCrust = mine.elevationM - mine.thicknessM - 20000;
    expect(model.densityAtPoint(0, belowCrust)).toBeGreaterThan(mine.densityKgM3);
  });

  it("warms with depth inside the block", () => {
    const model = new CrustModel();
    model.temperatureRatioProperty.value = 1;
    const mine = model.myCrust;
    const shallow = model.temperatureAtPoint(0, mine.elevationM - 1000);
    const deep = model.temperatureAtPoint(0, mine.elevationM - mine.thicknessM + 1000);
    expect(deep).toBeGreaterThan(shallow);
    expect(shallow).toBeGreaterThanOrEqual(SURFACE_TEMPERATURE_K);
  });

  it("keeps warming below the block, into the mantle", () => {
    const model = new CrustModel();
    const mine = model.myCrust;
    const base = model.temperatureAtPoint(0, mine.elevationM - mine.thicknessM);
    expect(model.temperatureAtPoint(0, mine.elevationM - mine.thicknessM - 200000)).toBeGreaterThan(base);
  });

  it("names the layer a point is in", () => {
    const model = new CrustModel();
    const mine = model.myCrust;
    expect(model.layerAtPoint(0, mine.elevationM - 1000)).toBe("crust");
    expect(model.layerAtPoint(0, -2000000)).toBe("lowerMantle");
    expect(model.layerAtPoint(0, -6000000)).toBe("innerCore");
  });
});

describe("CrustModel reset", () => {
  it("restores every slider and snaps the block back without animating", () => {
    const model = new CrustModel();
    model.temperatureRatioProperty.value = 1;
    model.compositionRatioProperty.value = 0;
    model.crustThicknessProperty.value = MY_CRUST_THICKNESS_RANGE_M.max;
    model.colorModeProperty.value = "both";
    model.showLabelsProperty.value = false;
    model.zoomProperty.value = "earth";
    settle(model);

    model.reset();

    expect(model.temperatureRatioProperty.value).toBe(0.5);
    expect(model.compositionRatioProperty.value).toBe(0.5);
    expect(model.crustThicknessProperty.value).toBe(MY_CRUST_THICKNESS_DEFAULT_M);
    expect(model.colorModeProperty.value).toBe("density");
    expect(model.showLabelsProperty.value).toBe(true);
    expect(model.zoomProperty.value).toBe("crust");
    // Snapped, not relaxing: a reset should look like a reset.
    expect(model.crustElevationProperty.value).toBeCloseTo(model.targetElevationProperty.value, 6);
  });

  it("stays put when stepped straight after a reset", () => {
    const model = new CrustModel();
    model.crustThicknessProperty.value = MY_CRUST_THICKNESS_RANGE_M.max;
    settle(model);
    model.reset();
    const afterReset = model.crustElevationProperty.value;
    model.step(1 / 60);
    expect(model.crustElevationProperty.value).toBeCloseTo(afterReset, 6);
  });
});
