/**
 * EarthMaterial.ts
 *
 * What colour a piece of rock is painted, given how dense and how hot it is.
 *
 * The Crust and Plate Motion screens colour rock by a *property* rather than by which
 * named layer it belongs to, which is the whole reason those screens can say anything.
 * A layer diagram asserts that the lithosphere and the asthenosphere are different
 * things; a temperature map shows *why* — one is cold enough to be rigid and the other
 * is not. Likewise a density map is what makes it obvious that the slab going down is
 * the denser of the two plates, rather than something the caption has to claim.
 *
 * Three modes, and the combined one is not a gimmick: a cold, dense slab against warm,
 * light mantle is the single most legible picture of subduction, and it only exists if
 * both quantities are on screen at once.
 *
 * Reads the ramp endpoints from PlateTectonicsColors, so Projector Mode works for free.
 * Pure apart from those reads, and unit-tested in tests/EarthMaterial.test.ts.
 */

import { Color } from "scenerystack/scenery";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import {
  DENSITY_SCALE_RANGE,
  EARTH_CENTRE_DENSITY_KG_M3,
  SURFACE_TEMPERATURE_K,
  TEMPERATURE_RAMP_CLAMP_RANGE,
  TEMPERATURE_RAMP_GAMMA,
  TEMPERATURE_SCALE_MAX_K,
} from "../../PlateTectonicsConstants.js";
import type { ColorMode } from "../model/ColorMode.js";

/** Fraction of the density ramp given to crust-and-mantle densities. */
const SHALLOW_RAMP_SHARE = 0.8;

/**
 * Position of a density on the density ramp, 0 to 1.
 *
 * Piecewise, because the densities on screen span a factor of five and the ones worth
 * telling apart are all crowded into the bottom fifth. Crust and mantle — 2500 to
 * 3300 kg/m³, where every contrast this simulation is *about* lives — get the first
 * {@link SHALLOW_RAMP_SHARE} of the ramp; everything from there to the 13100 kg/m³ at
 * the centre of the Earth is compressed into what is left. A single linear ramp over
 * the full span would make the entire interior one flat colour, and one over the
 * crustal span alone would saturate the moment the view zoomed out past the mantle.
 */
export function densityRatio(densityKgM3: number): number {
  const { min, max } = DENSITY_SCALE_RANGE;
  if (densityKgM3 <= min) {
    return 0;
  }
  if (densityKgM3 <= max) {
    return (SHALLOW_RAMP_SHARE * (densityKgM3 - min)) / (max - min);
  }
  const deep = Math.min(1, (densityKgM3 - max) / (EARTH_CENTRE_DENSITY_KG_M3 - max));
  return SHALLOW_RAMP_SHARE + deep * (1 - SHALLOW_RAMP_SHARE);
}

/**
 * Position of a temperature on the temperature ramp, 0 to 1.
 *
 * Gamma-corrected, and clamped away from both ends. The gamma is there because the
 * interesting temperature contrasts are all at the cold end — the difference between
 * rigid lithosphere and ductile asthenosphere is a few hundred kelvin out of six
 * thousand, and on a linear ramp it would be invisible. The clamp keeps the coldest
 * rock from going pure black, where nothing can be distinguished from anything else.
 */
export function temperatureRatio(temperatureK: number): number {
  const span = TEMPERATURE_SCALE_MAX_K - SURFACE_TEMPERATURE_K;
  const linear = Math.max(0, Math.min(1, (temperatureK - SURFACE_TEMPERATURE_K) / span));
  const corrected = linear ** TEMPERATURE_RAMP_GAMMA;
  const { min, max } = TEMPERATURE_RAMP_CLAMP_RANGE;
  return min + corrected * (max - min);
}

/** Fill for rock of a given density. Denser rock is darker. */
export function densityFill(densityKgM3: number): Color {
  return Color.interpolateRGBA(
    PlateTectonicsColors.densityRampLowColorProperty.value,
    PlateTectonicsColors.densityRampHighColorProperty.value,
    densityRatio(densityKgM3),
  );
}

/** Fill for rock at a given temperature. Hotter rock is redder. */
export function temperatureFill(temperatureK: number): Color {
  return Color.interpolateRGBA(
    PlateTectonicsColors.temperatureRampLowColorProperty.value,
    PlateTectonicsColors.temperatureRampHighColorProperty.value,
    temperatureRatio(temperatureK),
  );
}

/**
 * Fill carrying both quantities: the temperature hue, darkened by density.
 *
 * Multiplying rather than averaging, so density reads as *shading* on top of the
 * temperature colour instead of washing it out. A cold dense slab therefore comes out
 * near-black against warm pale mantle, which is exactly the contrast worth seeing.
 */
export function combinedFill(densityKgM3: number, temperatureK: number): Color {
  const hot = temperatureFill(temperatureK);
  const shade = 1 - 0.55 * densityRatio(densityKgM3);
  return new Color(Math.round(hot.r * shade), Math.round(hot.g * shade), Math.round(hot.b * shade), hot.a);
}

/** Fill for rock, in whichever mode the user has selected. */
export function materialFill(mode: ColorMode, densityKgM3: number, temperatureK: number): Color {
  if (mode === "density") {
    return densityFill(densityKgM3);
  }
  return mode === "temperature" ? temperatureFill(temperatureK) : combinedFill(densityKgM3, temperatureK);
}
