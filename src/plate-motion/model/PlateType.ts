/**
 * PlateType.ts
 *
 * The three kinds of plate the user can drop into a boundary, and the numbers that
 * distinguish them.
 *
 * Only three, and the choice is doing real work: continental crust is thick and light,
 * oceanic crust is thin and heavy, and old oceanic crust is heavier and thicker than
 * young oceanic crust because it has had time to cool. That last difference is the
 * whole reason the sim can ask "which one subducts?" and have a defensible answer —
 * age, not composition, is what decides between two ocean plates.
 *
 * A string union with a lookup table, matching EarthquakeDepthFilter, which is how this
 * simulation models a small closed set of choices.
 */

import {
  CONTINENTAL_PLATE_BASE_M,
  CONTINENTAL_PLATE_DENSITY_KG_M3,
  CONTINENTAL_PLATE_MANTLE_LITHOSPHERE_M,
  CONTINENTAL_PLATE_TOP_M,
  OLD_OCEANIC_PLATE_BASE_M,
  OLD_OCEANIC_PLATE_DENSITY_KG_M3,
  OLD_OCEANIC_PLATE_MANTLE_LITHOSPHERE_M,
  OLD_OCEANIC_PLATE_TOP_M,
  YOUNG_OCEANIC_PLATE_BASE_M,
  YOUNG_OCEANIC_PLATE_DENSITY_KG_M3,
  YOUNG_OCEANIC_PLATE_MANTLE_LITHOSPHERE_M,
  YOUNG_OCEANIC_PLATE_TOP_M,
} from "../../PlateTectonicsConstants.js";

/** A kind of plate. */
export type PlateType = "continental" | "youngOceanic" | "oldOceanic";

/** The types, in the order they appear in the crust chooser. */
export const PLATE_TYPES: readonly PlateType[] = ["continental", "youngOceanic", "oldOceanic"];

/** What distinguishes one kind of plate from another. All lengths m, densities kg/m³. */
export type PlateProperties = {
  /** Bulk density of the crust. */
  readonly densityKgM3: number;

  /** Elevation of the top of the crust. */
  readonly crustTopM: number;

  /** Elevation of the base of the crust. */
  readonly crustBaseM: number;

  /** Thickness of the rigid mantle below the crust; crust + this is the lithosphere. */
  readonly mantleLithosphereM: number;

  /** Whether this is ocean floor rather than a continent. */
  readonly isOceanic: boolean;
};

const PROPERTIES: Record<PlateType, PlateProperties> = {
  continental: {
    densityKgM3: CONTINENTAL_PLATE_DENSITY_KG_M3,
    crustTopM: CONTINENTAL_PLATE_TOP_M,
    crustBaseM: CONTINENTAL_PLATE_BASE_M,
    mantleLithosphereM: CONTINENTAL_PLATE_MANTLE_LITHOSPHERE_M,
    isOceanic: false,
  },
  youngOceanic: {
    densityKgM3: YOUNG_OCEANIC_PLATE_DENSITY_KG_M3,
    crustTopM: YOUNG_OCEANIC_PLATE_TOP_M,
    crustBaseM: YOUNG_OCEANIC_PLATE_BASE_M,
    mantleLithosphereM: YOUNG_OCEANIC_PLATE_MANTLE_LITHOSPHERE_M,
    isOceanic: true,
  },
  oldOceanic: {
    densityKgM3: OLD_OCEANIC_PLATE_DENSITY_KG_M3,
    crustTopM: OLD_OCEANIC_PLATE_TOP_M,
    crustBaseM: OLD_OCEANIC_PLATE_BASE_M,
    mantleLithosphereM: OLD_OCEANIC_PLATE_MANTLE_LITHOSPHERE_M,
    isOceanic: true,
  },
};

/** The numbers for a kind of plate. */
export function plateProperties(type: PlateType): PlateProperties {
  return PROPERTIES[type];
}

/** Thickness of the crust alone, m. */
export function crustThickness(type: PlateType): number {
  const { crustTopM, crustBaseM } = PROPERTIES[type];
  return crustTopM - crustBaseM;
}

/** Thickness of the whole rigid plate — crust plus lithospheric mantle, m. */
export function lithosphereThickness(type: PlateType): number {
  return crustThickness(type) + PROPERTIES[type].mantleLithosphereM;
}

/** Elevation of the base of the lithosphere, m. */
export function lithosphereBaseM(type: PlateType): number {
  return PROPERTIES[type].crustBaseM - PROPERTIES[type].mantleLithosphereM;
}
