/**
 * EarthMaterial.test.ts
 *
 * The density and temperature colour ramps: that they run the right way, saturate
 * rather than wrap at the ends, and that the combined mode keeps both quantities
 * readable at once.
 */

import { describe, expect, it } from "vitest";
import {
  combinedFill,
  densityFill,
  densityRatio,
  materialFill,
  temperatureFill,
  temperatureRatio,
} from "../src/common/view/EarthMaterial.js";
import {
  DENSITY_SCALE_RANGE,
  EARTH_CENTRE_DENSITY_KG_M3,
  SURFACE_TEMPERATURE_K,
  TEMPERATURE_RAMP_CLAMP_RANGE,
  TEMPERATURE_SCALE_MAX_K,
} from "../src/PlateTectonicsConstants.js";

/** Perceived lightness, near enough for asserting "darker than". */
function luminance(color: { r: number; g: number; b: number }): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

describe("densityRatio", () => {
  it("gives crust-and-mantle densities the bulk of the ramp", () => {
    expect(densityRatio(DENSITY_SCALE_RANGE.min)).toBeCloseTo(0, 6);
    expect(densityRatio(DENSITY_SCALE_RANGE.max)).toBeCloseTo(0.8, 6);
    expect(densityRatio(DENSITY_SCALE_RANGE.getCenter())).toBeCloseTo(0.4, 6);
  });

  it("reaches the top of the ramp only at the centre of the Earth", () => {
    expect(densityRatio(EARTH_CENTRE_DENSITY_KG_M3)).toBeCloseTo(1, 6);
    expect(densityRatio(0)).toBeCloseTo(0, 6);
    expect(densityRatio(99999)).toBeCloseTo(1, 6);
  });

  it("keeps crust and mantle apart while still ranking the core above them", () => {
    // The failure this guards against: a single linear ramp to 13100 kg/m³ makes every
    // crustal density the same colour, and one that stops at 3500 makes the whole
    // interior the same colour once the view zooms out.
    const granite = densityRatio(2700);
    const basalt = densityRatio(3000);
    const mantle = densityRatio(3300);
    const outerCore = densityRatio(10000);

    expect(basalt - granite).toBeGreaterThan(0.15);
    expect(mantle - basalt).toBeGreaterThan(0.15);
    expect(outerCore).toBeGreaterThan(mantle);
    expect(outerCore).toBeLessThan(1);
  });
});

describe("temperatureRatio", () => {
  it("stays inside the clamp range at both extremes", () => {
    expect(temperatureRatio(SURFACE_TEMPERATURE_K)).toBeCloseTo(TEMPERATURE_RAMP_CLAMP_RANGE.min, 6);
    expect(temperatureRatio(TEMPERATURE_SCALE_MAX_K)).toBeCloseTo(TEMPERATURE_RAMP_CLAMP_RANGE.max, 6);
    expect(temperatureRatio(99999)).toBeCloseTo(TEMPERATURE_RAMP_CLAMP_RANGE.max, 6);
    expect(temperatureRatio(0)).toBeCloseTo(TEMPERATURE_RAMP_CLAMP_RANGE.min, 6);
  });

  it("increases with temperature", () => {
    expect(temperatureRatio(1500)).toBeGreaterThan(temperatureRatio(800));
    expect(temperatureRatio(800)).toBeGreaterThan(temperatureRatio(400));
  });

  it("spends most of the ramp on the cold end, where the contrasts that matter are", () => {
    // Lithosphere against asthenosphere is a few hundred K out of six thousand. Gamma
    // correction is what stops that difference vanishing.
    const span = TEMPERATURE_SCALE_MAX_K - SURFACE_TEMPERATURE_K;
    const atTenPercent = temperatureRatio(SURFACE_TEMPERATURE_K + 0.1 * span);
    expect(atTenPercent).toBeGreaterThan(0.3);
  });
});

describe("densityFill", () => {
  it("paints denser rock darker", () => {
    expect(luminance(densityFill(3300))).toBeLessThan(luminance(densityFill(2600)));
  });
});

describe("temperatureFill", () => {
  it("paints hotter rock redder", () => {
    const hot = temperatureFill(SURFACE_TEMPERATURE_K + 4000);
    const cold = temperatureFill(SURFACE_TEMPERATURE_K + 100);
    expect(hot.r - hot.b).toBeGreaterThan(cold.r - cold.b);
  });
});

describe("combinedFill", () => {
  it("darkens the temperature colour by density", () => {
    const light = combinedFill(2600, 1500);
    const dense = combinedFill(3400, 1500);
    expect(luminance(dense)).toBeLessThan(luminance(light));
  });

  it("keeps temperature readable at fixed density", () => {
    const hot = combinedFill(3000, SURFACE_TEMPERATURE_K + 4000);
    const cold = combinedFill(3000, SURFACE_TEMPERATURE_K + 100);
    expect(hot.r - hot.b).toBeGreaterThan(cold.r - cold.b);
  });

  it("makes a cold dense slab the darkest thing on screen", () => {
    // The picture the mode exists for: slab against mantle.
    const slab = combinedFill(3400, SURFACE_TEMPERATURE_K + 400);
    const mantle = combinedFill(3300, SURFACE_TEMPERATURE_K + 1400);
    expect(luminance(slab)).toBeLessThan(luminance(mantle));
  });
});

describe("materialFill", () => {
  it("dispatches to the mode it is given", () => {
    expect(materialFill("density", 3000, 1000).toCSS()).toBe(densityFill(3000).toCSS());
    expect(materialFill("temperature", 3000, 1000).toCSS()).toBe(temperatureFill(1000).toCSS());
    expect(materialFill("both", 3000, 1000).toCSS()).toBe(combinedFill(3000, 1000).toCSS());
  });
});
