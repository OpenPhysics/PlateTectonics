/**
 * EarthquakeDepthFilter.ts
 *
 * The depth bands earthquakes are grouped into, and the filter the user applies to
 * them. The band boundaries at 70 km and 300 km are the conventional shallow /
 * intermediate / deep divisions: below about 70 km the crust is cold and brittle
 * everywhere, so shallow earthquakes happen at every kind of plate boundary, while
 * intermediate and deep events occur almost only inside a subducting slab — the
 * Wadati–Benioff zone.
 */

import { INTERMEDIATE_DEPTH_LIMIT_KM, SHALLOW_DEPTH_LIMIT_KM } from "../../PlateTectonicsConstants.js";

/** Depth band of a single earthquake. */
export type DepthBand = "shallow" | "intermediate" | "deep";

/** What the user has chosen to show. */
export type EarthquakeDepthFilter = "all" | DepthBand;

/** The filter values, in the order they appear in the radio-button group. */
export const EARTHQUAKE_DEPTH_FILTERS: readonly EarthquakeDepthFilter[] = ["all", "shallow", "intermediate", "deep"];

/** The depth band a hypocentre falls in. */
export function depthBand(depthKm: number): DepthBand {
  if (depthKm < SHALLOW_DEPTH_LIMIT_KM) {
    return "shallow";
  }
  return depthKm < INTERMEDIATE_DEPTH_LIMIT_KM ? "intermediate" : "deep";
}

/** Whether an earthquake at `depthKm` passes the given filter. */
export function passesDepthFilter(depthKm: number, filter: EarthquakeDepthFilter): boolean {
  return filter === "all" || depthBand(depthKm) === filter;
}
