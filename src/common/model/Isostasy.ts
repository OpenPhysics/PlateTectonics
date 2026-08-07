/**
 * Isostasy.ts
 *
 * Airy isostasy: how high a crustal column stands when it floats in the mantle, and
 * how dense that column is given what it is made of and how hot it is.
 *
 * The whole Crust screen rests on one idea — the crust is not resting *on* the mantle,
 * it is floating *in* it, so a column's surface elevation is set by its thickness and
 * its density and by nothing else. Thicker floats higher because there is more of it
 * above the level where the pressures balance; denser floats lower because it has to
 * sink further before it displaces its own weight.
 *
 * Every function here is pure and unit-tested in tests/Isostasy.test.ts. Lengths are
 * metres, densities kg/m³, temperatures kelvin.
 */

import {
  AIRY_REFERENCE_OFFSET_M,
  CRUST_GEOTHERM_SPAN_K,
  CRUST_IRON_DENSITY_KG_M3,
  CRUST_SILICA_DENSITY_KG_M3,
  CRUST_THERMAL_EXPANSIVITY_PER_K,
  MANTLE_DENSITY_KG_M3,
  SEAWATER_DENSITY_KG_M3,
  SURFACE_TEMPERATURE_K,
} from "../../PlateTectonicsConstants.js";

/**
 * Depth of the water-covered reference column that {@link AIRY_REFERENCE_OFFSET_M}
 * implicitly defines, m.
 *
 * Airy isostasy compares a column against a reference column, and on its own the
 * natural reference — bare mantle outcropping at sea level — is useless, because every
 * real crustal column stands kilometres above it. PhET dealt with this by subtracting
 * a flat 3500 m from the subaerial answer without saying what that number was. It is
 * this: the depth of water over bare mantle that puts the reference at sea level.
 * Deriving it explicitly is what lets the submarine case below be written down at all,
 * because the two cases have to share a reference or they will not meet at e = 0.
 */
const REFERENCE_COLUMN_DEPTH_M =
  (AIRY_REFERENCE_OFFSET_M * MANTLE_DENSITY_KG_M3) / (MANTLE_DENSITY_KG_M3 - SEAWATER_DENSITY_KG_M3);

/**
 * Surface elevation of a crustal column in Airy isostatic equilibrium, m, positive
 * upwards from sea level.
 *
 * Two cases, because what sits on top of the column is part of its load:
 *
 *   subaerial (e ≥ 0)   e = t·(ρm − ρc)/ρm − C
 *   submarine (e < 0)   e = [t·(ρm − ρc) − C·ρm] / (ρm − ρw)
 *
 * They agree at e = 0, so the function is continuous. They do *not* have the same
 * slope: a submarine column that thickens displaces water rather than air, so it rises
 * ρm/(ρm − ρw) ≈ 1.45 times faster per metre of new crust than a subaerial one. PhET
 * applied the subaerial formula everywhere and so under-responded below sea level.
 * The visible consequence is that the sea floor here sits at a realistic abyssal depth
 * rather than about a kilometre too shallow.
 */
export function airyElevation(thicknessM: number, densityKgM3: number): number {
  const buoyancy = thicknessM * (MANTLE_DENSITY_KG_M3 - densityKgM3);
  const subaerial = buoyancy / MANTLE_DENSITY_KG_M3 - AIRY_REFERENCE_OFFSET_M;
  if (subaerial >= 0) {
    return subaerial;
  }
  return (buoyancy - AIRY_REFERENCE_OFFSET_M * MANTLE_DENSITY_KG_M3) / (MANTLE_DENSITY_KG_M3 - SEAWATER_DENSITY_KG_M3);
}

/** The reference column depth the offset implies, exposed for the model documentation and tests. */
export function referenceColumnDepth(): number {
  return REFERENCE_COLUMN_DEPTH_M;
}

/**
 * Bulk density of the user's crust, kg/m³, from the two sliders.
 *
 * Composition mixes linearly between an iron-rich and a silica-rich end member, which
 * is the dominant term by an order of magnitude. Temperature then expands the result
 * thermally, Δρ/ρ = −α·ΔT, over the geotherm the temperature slider commands. Written
 * this way both terms have a name and a source; PhET's single expression
 * `2600 + 700·(0.8·(1−c) + 0.10·(1−T))` is numerically almost the same, and back-solving
 * its thermal term gives α ≈ 3.4 × 10⁻⁵ K⁻¹ — so it was right, just not legible.
 *
 * @param compositionRatio - 0 is the most iron-rich, 1 the most silica-rich.
 * @param temperatureRatio - 0 is the coolest crust, 1 the warmest.
 */
export function crustDensity(compositionRatio: number, temperatureRatio: number): number {
  const cold = CRUST_IRON_DENSITY_KG_M3 + (CRUST_SILICA_DENSITY_KG_M3 - CRUST_IRON_DENSITY_KG_M3) * compositionRatio;
  return cold * (1 - CRUST_THERMAL_EXPANSIVITY_PER_K * CRUST_GEOTHERM_SPAN_K * temperatureRatio);
}

/**
 * Temperature inside a crustal column, K.
 *
 * A linear geotherm: the surface is at {@link SURFACE_TEMPERATURE_K} and the base is
 * `spanK · temperatureRatio` above it, with everything between interpolated. Real
 * geotherms curve, because the crust generates heat as well as conducting it, but over
 * the few tens of km this screen shows, the curvature is smaller than the difference
 * between two settings of the slider.
 *
 * @param depthBelowTopM - depth below the top of the column, m; clamped to the column.
 * @param thicknessM - thickness of the column, m.
 * @param temperatureRatio - 0 is the coolest crust, 1 the warmest.
 * @param spanK - temperature rise across the full column at ratio 1.
 */
export function crustGeotherm(
  depthBelowTopM: number,
  thicknessM: number,
  temperatureRatio: number,
  spanK: number = CRUST_GEOTHERM_SPAN_K,
): number {
  if (thicknessM <= 0) {
    return SURFACE_TEMPERATURE_K;
  }
  const fraction = Math.max(0, Math.min(1, depthBelowTopM / thicknessM));
  return SURFACE_TEMPERATURE_K + fraction * spanK * temperatureRatio;
}
