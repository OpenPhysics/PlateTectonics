/**
 * TerrainColors.test.ts
 *
 * The elevation ramp on the block's top surface: that each band is where PhET put it,
 * that the ramp is continuous across the joins, and that the ground gets lighter going
 * up out of the deeps and lighter again going up into the snow.
 */

import { Color } from "scenerystack/scenery";
import { describe, expect, it } from "vitest";
import {
  landColor,
  SEABED_DEEPEST_M,
  SEABED_TOP_M,
  SHORE_TOP_M,
  SNOW_FULL_M,
  SNOW_START_M,
  seabedColor,
  terrainColor,
} from "../src/common/view/TerrainColors.js";
import PlateTectonicsColors from "../src/PlateTectonicsColors.js";

/** Perceived lightness, near enough for ordering two colours on the same ramp. */
function luminance(elevationM: number): number {
  const color = terrainColor(elevationM);
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

describe("TerrainColors", () => {
  it("puts the deepest sea floor at the deep anchor and the shelf at the shallow one", () => {
    expect(terrainColor(SEABED_DEEPEST_M).toCSS()).toBe(
      PlateTectonicsColors.terrainDeepSeabedColorProperty.value.toCSS(),
    );
    // Sea level itself is inside the shore blend, so the shallow anchor is reached just
    // below the top of the seabed band.
    expect(terrainColor(SEABED_TOP_M).r).toBeGreaterThan(terrainColor(SEABED_DEEPEST_M).r);
  });

  it("clamps below the deepest sea floor rather than running off the ramp", () => {
    expect(terrainColor(-20000).toCSS()).toBe(terrainColor(SEABED_DEEPEST_M).toCSS());
  });

  it("gets lighter coming up off the abyssal plain", () => {
    expect(luminance(-1000)).toBeGreaterThan(luminance(-4000));
    expect(luminance(-4000)).toBeGreaterThan(luminance(-6500));
  });

  it("is fully grass between the shoreline blend and the snow line", () => {
    const grass = PlateTectonicsColors.terrainGrassColorProperty.value.toCSS();
    expect(terrainColor(SHORE_TOP_M).toCSS()).toBe(grass);
    expect(terrainColor(2000).toCSS()).toBe(grass);
    expect(terrainColor(SNOW_START_M).toCSS()).toBe(grass);
  });

  it("blends to snow above the snow line and stays there", () => {
    const snow = PlateTectonicsColors.terrainSnowColorProperty.value.toCSS();
    expect(terrainColor(SNOW_FULL_M).toCSS()).toBe(snow);
    expect(terrainColor(30000).toCSS()).toBe(snow);
    expect(luminance(6000)).toBeGreaterThan(luminance(SNOW_START_M));
    expect(luminance(SNOW_FULL_M)).toBeGreaterThan(luminance(6000));
  });

  it("starts the blend to land at the ridge crest, not at sea level", () => {
    // −500 m is the crest of a mid-ocean ridge, and the blend to land begins there
    // rather than at 0 m. The consequence worth pinning down is that sea level is not
    // the *start* of the blend but a third of the way along it — (0 − −500) / 1500 — so
    // a shoreline is a gradient that has already begun underwater.
    expect(terrainColor(0).toCSS()).toBe(Color.interpolateRGBA(seabedColor(0), landColor(0), 1 / 3).toCSS());

    // Outside the band each side is its own ramp, undiluted.
    expect(terrainColor(SEABED_TOP_M).toCSS()).toBe(seabedColor(SEABED_TOP_M).toCSS());
    expect(terrainColor(-3000).toCSS()).toBe(seabedColor(-3000).toCSS());
    expect(terrainColor(SHORE_TOP_M).toCSS()).toBe(landColor(SHORE_TOP_M).toCSS());
    expect(terrainColor(5000).toCSS()).toBe(landColor(5000).toCSS());
  });

  it("has no visible step at any band join", () => {
    for (const boundary of [SEABED_TOP_M, SHORE_TOP_M, SNOW_START_M, SNOW_FULL_M]) {
      const below = terrainColor(boundary - 1);
      const above = terrainColor(boundary + 1);
      const step = Math.abs(below.r - above.r) + Math.abs(below.g - above.g) + Math.abs(below.b - above.b);

      // One unit per channel is the most that rounding an interpolated colour can move
      // it; anything larger would be a real discontinuity in the ramp.
      expect(step).toBeLessThanOrEqual(3);
    }
  });
});
