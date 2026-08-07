/**
 * EarthStructure.ts
 *
 * Density and temperature everywhere inside the Earth, and which named layer a given
 * depth belongs to. This is what the Crust screen draws once it is zoomed out past the
 * crust, and what the draggable probe reads when it is below the crustal blocks.
 *
 * The density profile is the PREM (Preliminary Reference Earth Model) curve, sampled at
 * 35 depths through the mantle and interpolated linearly between them, then continued
 * through the core. PREM is derived from seismic wave speeds, so unlike everything else
 * on this screen it is an *observation* of the Earth's interior rather than a model of
 * it — worth saying out loud, because the crustal blocks above it are schematic.
 *
 * All functions are pure. Depths are km below sea level, densities kg/m³, temperatures K.
 */

import {
  CORE_BOUNDARY_DENSITY_KG_M3,
  EARTH_CENTRE_DENSITY_KG_M3,
  EARTH_RADIUS_KM,
  INNER_CORE_TEMPERATURE_K,
  INNER_OUTER_CORE_BOUNDARY_KM,
  INNER_OUTER_CORE_DENSITY_KG_M3,
  LOWER_MANTLE_BASE_TEMPERATURE_K,
  MANTLE_CORE_BOUNDARY_KM,
  OUTER_CORE_TOP_TEMPERATURE_K,
  UPPER_LOWER_MANTLE_BOUNDARY_KM,
  UPPER_MANTLE_BASE_TEMPERATURE_K,
  UPPER_MANTLE_TOP_TEMPERATURE_K,
} from "../../PlateTectonicsConstants.js";

/** The named concentric shells, outermost first. */
export type EarthLayer = "crust" | "upperMantle" | "lowerMantle" | "outerCore" | "innerCore";

/** The layers in order, for legends and label stacks. */
export const EARTH_LAYERS: readonly EarthLayer[] = ["crust", "upperMantle", "lowerMantle", "outerCore", "innerCore"];

/**
 * PREM density against depth: [depth km, density kg/m³] pairs from the surface to the
 * core–mantle boundary. The steps at 25 km (Moho), 400 km and 670 km are the real
 * seismic discontinuities — the phase changes of olivine — and are why this is a table
 * rather than a formula.
 */
const MANTLE_DEPTH_DENSITY: readonly (readonly [number, number])[] = [
  [0, 1020],
  [3, 2600],
  [15, 2900],
  [25, 3381],
  [71, 3376],
  [171, 3364],
  [220, 3436],
  [271, 3466],
  [371, 3526],
  [400, 3723],
  [471, 3813],
  [571, 3939],
  [670, 4381],
  [771, 4443],
  [871, 4503],
  [971, 4563],
  [1071, 4621],
  [1171, 4678],
  [1271, 4734],
  [1371, 4789],
  [1471, 4844],
  [1571, 4897],
  [1671, 4950],
  [1771, 5003],
  [1871, 5054],
  [1971, 5106],
  [2071, 5157],
  [2171, 5207],
  [2271, 5257],
  [2371, 5307],
  [2471, 5357],
  [2571, 5407],
  [2671, 5457],
  [2771, 5506],
  [2871, 5556],
  [2891, 5566],
];

/** Linear interpolation between the bracketing entries of a sorted [x, y] table. */
function interpolateTable(table: readonly (readonly [number, number])[], x: number): number {
  const first = table[0];
  const last = table[table.length - 1];
  if (!(first && last)) {
    throw new Error("interpolateTable requires a non-empty table");
  }
  if (x <= first[0]) {
    return first[1];
  }
  if (x >= last[0]) {
    return last[1];
  }
  for (let i = 1; i < table.length; i++) {
    const lo = table[i - 1];
    const hi = table[i];
    if (!(lo && hi)) {
      continue;
    }
    if (x <= hi[0]) {
      const span = hi[0] - lo[0];
      return span === 0 ? hi[1] : lo[1] + ((x - lo[0]) * (hi[1] - lo[1])) / span;
    }
  }
  return last[1];
}

/**
 * Depth of the Moho in the PREM table, km, and the depth the mantle lookup is clamped at.
 *
 * The table's first three entries — 1020, 2600 and 2900 kg/m³ at 0, 3 and 15 km — are
 * ocean and *crust*, not mantle: PREM describes a whole standard column. These screens
 * draw their own crust, of their own thickness and density, so reading those entries for
 * the rock beneath it would substitute a second crust for the mantle: the sub-crustal
 * rock would come out *less* dense than the crust above it, and the blocks would appear
 * to float on something lighter than themselves. Clamping at the Moho (the fourth entry,
 * 25 km, 3381 kg/m³) stands the topmost mantle value in for everything shallower.
 */
const MANTLE_TABLE_TOP_KM = 25;

/**
 * Density of the mantle at a given depth, kg/m³, from the PREM table.
 *
 * Clamped at the Moho: above it the table is describing crust, which this simulation
 * supplies itself. See {@link MANTLE_TABLE_TOP_KM}.
 */
export function mantleDensityAt(depthKm: number): number {
  return interpolateTable(MANTLE_DEPTH_DENSITY, Math.max(MANTLE_TABLE_TOP_KM, depthKm));
}

/**
 * Density of the core at a given depth, kg/m³.
 *
 * Two straight lines rather than a table: one across the liquid outer core, one across
 * the solid inner core. The jump at the core–mantle boundary — 5566 to 10000 kg/m³ — is
 * the largest density contrast anywhere in the Earth, considerably larger than the one
 * between rock and air at the surface.
 */
export function coreDensityAt(depthKm: number): number {
  if (depthKm < INNER_OUTER_CORE_BOUNDARY_KM) {
    const t = (depthKm - MANTLE_CORE_BOUNDARY_KM) / (INNER_OUTER_CORE_BOUNDARY_KM - MANTLE_CORE_BOUNDARY_KM);
    return CORE_BOUNDARY_DENSITY_KG_M3 + t * (INNER_OUTER_CORE_DENSITY_KG_M3 - CORE_BOUNDARY_DENSITY_KG_M3);
  }
  const t = (depthKm - INNER_OUTER_CORE_BOUNDARY_KM) / (EARTH_RADIUS_KM - INNER_OUTER_CORE_BOUNDARY_KM);
  return INNER_OUTER_CORE_DENSITY_KG_M3 + t * (EARTH_CENTRE_DENSITY_KG_M3 - INNER_OUTER_CORE_DENSITY_KG_M3);
}

/** Density anywhere below the crust, kg/m³ — mantle or core, whichever the depth is in. */
export function densityAt(depthKm: number): number {
  return depthKm < MANTLE_CORE_BOUNDARY_KM ? mantleDensityAt(depthKm) : coreDensityAt(depthKm);
}

/**
 * Which layer a depth belongs to.
 *
 * The crust/mantle boundary is not a fixed depth — it is wherever the bottom of the
 * local crustal column is — so the caller passes it in. Everything below is at the
 * global discontinuities.
 */
export function layerAt(depthKm: number, crustBaseDepthKm: number): EarthLayer {
  if (depthKm < crustBaseDepthKm) {
    return "crust";
  }
  if (depthKm < UPPER_LOWER_MANTLE_BOUNDARY_KM) {
    return "upperMantle";
  }
  if (depthKm < MANTLE_CORE_BOUNDARY_KM) {
    return "lowerMantle";
  }
  return depthKm < INNER_OUTER_CORE_BOUNDARY_KM ? "outerCore" : "innerCore";
}

/**
 * Temperature at a given depth below the crust, K.
 *
 * Linear across each layer between the temperatures at its boundaries, except the inner
 * core, which is treated as isothermal. The real geotherm is not piecewise linear — the
 * mantle is nearly adiabatic and the boundary layers are steep — but the layer-boundary
 * temperatures are the ones worth reading off, and interpolating between them keeps the
 * color ramp continuous.
 */
export function layerTemperatureAt(depthKm: number, crustBaseDepthKm: number, crustBaseTemperatureK: number): number {
  if (depthKm < crustBaseDepthKm) {
    return crustBaseTemperatureK;
  }
  if (depthKm < UPPER_LOWER_MANTLE_BOUNDARY_KM) {
    const t = (depthKm - crustBaseDepthKm) / Math.max(1, UPPER_LOWER_MANTLE_BOUNDARY_KM - crustBaseDepthKm);
    return UPPER_MANTLE_TOP_TEMPERATURE_K + t * (UPPER_MANTLE_BASE_TEMPERATURE_K - UPPER_MANTLE_TOP_TEMPERATURE_K);
  }
  if (depthKm < MANTLE_CORE_BOUNDARY_KM) {
    const t = (depthKm - UPPER_LOWER_MANTLE_BOUNDARY_KM) / (MANTLE_CORE_BOUNDARY_KM - UPPER_LOWER_MANTLE_BOUNDARY_KM);
    return UPPER_MANTLE_BASE_TEMPERATURE_K + t * (LOWER_MANTLE_BASE_TEMPERATURE_K - UPPER_MANTLE_BASE_TEMPERATURE_K);
  }
  if (depthKm < INNER_OUTER_CORE_BOUNDARY_KM) {
    const t = (depthKm - MANTLE_CORE_BOUNDARY_KM) / (INNER_OUTER_CORE_BOUNDARY_KM - MANTLE_CORE_BOUNDARY_KM);
    return OUTER_CORE_TOP_TEMPERATURE_K + t * (INNER_CORE_TEMPERATURE_K - OUTER_CORE_TOP_TEMPERATURE_K);
  }
  return INNER_CORE_TEMPERATURE_K;
}
