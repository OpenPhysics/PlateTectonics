/**
 * PlateThermal.ts
 *
 * The temperature of the mantle beneath a plate boundary.
 *
 * The Plate Motion screen uses a simpler geotherm than the Crust screen's layer-by-layer
 * one, because it only ever shows the top 600 km and what matters there is the shape of
 * the curve rather than the deep layer boundaries. The form is
 *
 *   T(d) = T₀ + (q/k)·d − (ρH/2k)·d²
 *
 * the steady-state solution for a layer that conducts heat upwards *and* generates it
 * internally by radioactive decay. The linear term is the heat flowing through from
 * below; the quadratic term is the crust's own heat production, which is why a real
 * geotherm flattens with depth instead of rising forever.
 *
 * Pure. Depths in metres below sea level, temperatures in kelvin.
 */

import { GEOTHERM_LINEAR_K_PER_M, GEOTHERM_QUADRATIC_K_PER_M2 } from "../../PlateTectonicsConstants.js";

/**
 * Mantle temperature at a depth, K.
 *
 * Uses 273.15 K as its datum rather than the sim's 293.15 K surface temperature: the
 * coefficients were fitted against the former, and shifting them to match the latter
 * would change the curve rather than just relabel it.
 */
export function simpleMantleTemperatureK(depthM: number): number {
  const depth = Math.max(0, depthM);
  return 273.15 + (GEOTHERM_LINEAR_K_PER_M - GEOTHERM_QUADRATIC_K_PER_M2 * depth) * depth;
}
