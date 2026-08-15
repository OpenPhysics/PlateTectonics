/**
 * TerrainColors.ts
 *
 * What colour the ground is at a given elevation, on the top surface of the 3-D block.
 *
 * A port of the elevation ramp in PhET's Java `TerrainNode`, band for band and threshold
 * for threshold, because those thresholds carry meaning rather than being arbitrary
 * design choices:
 *
 *   • **−500 m** is where the blend to land begins, not 0 m, because that is the
 *     elevation of a mid-ocean ridge crest. A ridge is the shallowest sea floor there
 *     is, and starting the blend at sea level would have painted it the same grey as the
 *     abyssal plain three miles below it.
 *   • **1000 m** is where the blend finishes, so the coastline is a gradient rather than
 *     a hard line — which is what a shore looks like from orbit, and which hides the
 *     terrain grid's own resolution at the one place the eye goes looking for it.
 *   • **3000 m** is where snow starts to appear and **10000 m** where it has taken over.
 *     Real snow lines are latitude-dependent and nothing here has a latitude, so this is
 *     a legibility choice: it is what makes a collision's mountain range read as
 *     mountains instead of as very high grass.
 *
 * The anchors themselves come from PlateTectonicsColors, so Projector Mode repaints the
 * ground along with everything else.
 *
 * Pure apart from those colour reads, and unit-tested in tests/TerrainColors.test.ts.
 * Elevations in metres, positive up.
 */

import { Color } from "scenerystack/scenery";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";

/** Below this, the ground is bare sea floor and its colour depends only on depth. */
export const SEABED_TOP_M = -500;

/** Above this, the ground is fully vegetated; between the two it blends. */
export const SHORE_TOP_M = 1000;

/** Depth at which the sea floor reaches its darkest, m below sea level. */
export const SEABED_DEEPEST_M = -7000;

/** Above this, snow begins to show through the vegetation. */
export const SNOW_START_M = 3000;

/** Above this, the ground is entirely snow. */
export const SNOW_FULL_M = 10000;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The bare sea floor at a given elevation: paler on the shelf, darker in the deeps. */
export function seabedColor(elevationM: number): Color {
  return Color.interpolateRGBA(
    PlateTectonicsColors.terrainDeepSeabedColorProperty.value,
    PlateTectonicsColors.terrainShallowSeabedColorProperty.value,
    clamp01((elevationM - SEABED_DEEPEST_M) / (0 - SEABED_DEEPEST_M)),
  );
}

/** Vegetated land at a given elevation: grass, going to snow up high. */
export function landColor(elevationM: number): Color {
  if (elevationM <= SNOW_START_M) {
    return PlateTectonicsColors.terrainGrassColorProperty.value;
  }
  return Color.interpolateRGBA(
    PlateTectonicsColors.terrainGrassColorProperty.value,
    PlateTectonicsColors.terrainSnowColorProperty.value,
    clamp01((elevationM - SNOW_START_M) / (SNOW_FULL_M - SNOW_START_M)),
  );
}

/** The colour of the ground at a given elevation. */
export function terrainColor(elevationM: number): Color {
  if (elevationM <= SEABED_TOP_M) {
    return seabedColor(elevationM);
  }
  if (elevationM >= SHORE_TOP_M) {
    return landColor(elevationM);
  }
  return Color.interpolateRGBA(
    seabedColor(elevationM),
    landColor(elevationM),
    clamp01((elevationM - SEABED_TOP_M) / (SHORE_TOP_M - SEABED_TOP_M)),
  );
}
