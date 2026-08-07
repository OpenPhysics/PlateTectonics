/**
 * Isostasy.test.ts
 *
 * Airy isostasy: that a column floats where the physics says, that the two branches of
 * the elevation formula meet, and that the crust density expression stays calibrated
 * against the PhET sim this screen is ported from.
 */

import { describe, expect, it } from "vitest";
import { airyElevation, crustDensity, crustGeotherm, referenceColumnDepth } from "../src/common/model/Isostasy.js";
import {
  CRUST_GEOTHERM_SPAN_K,
  CRUST_IRON_DENSITY_KG_M3,
  CRUST_SILICA_DENSITY_KG_M3,
  FIXED_CONTINENTAL_DENSITY_KG_M3,
  FIXED_CONTINENTAL_THICKNESS_M,
  FIXED_OCEANIC_DENSITY_KG_M3,
  FIXED_OCEANIC_THICKNESS_M,
  MANTLE_DENSITY_KG_M3,
  SEAWATER_DENSITY_KG_M3,
  SURFACE_TEMPERATURE_K,
} from "../src/PlateTectonicsConstants.js";

describe("airyElevation", () => {
  it("puts the fixed continental block where PhET put it", () => {
    // Subaerial, so this branch is unchanged from the original sim and the number is a
    // direct calibration check: 45 km of 2700 kg/m³ crust stands 4682 m above sea level.
    const elevation = airyElevation(FIXED_CONTINENTAL_THICKNESS_M, FIXED_CONTINENTAL_DENSITY_KG_M3);
    expect(elevation).toBeCloseTo(4681.8, 0);
  });

  it("puts the fixed oceanic block at a realistic abyssal depth", () => {
    // Submarine, so the water-loading branch applies and this deliberately differs from
    // PhET, which had it at −2864 m by using the subaerial formula below sea level.
    // Real abyssal plains sit near −4000 m.
    const elevation = airyElevation(FIXED_OCEANIC_THICKNESS_M, FIXED_OCEANIC_DENSITY_KG_M3);
    expect(elevation).toBeCloseTo(-4163.0, 0);
    expect(elevation).toBeLessThan(-3500);
    expect(elevation).toBeGreaterThan(-5000);
  });

  it("is continuous where the two branches meet", () => {
    // The thickness at which a given crust sits exactly at sea level; approaching it
    // from either side must give the same answer, or the block would jump at the shore.
    const density = 2900;
    const seaLevelThickness =
      (referenceColumnDepth() * (MANTLE_DENSITY_KG_M3 - SEAWATER_DENSITY_KG_M3)) / (MANTLE_DENSITY_KG_M3 - density);

    expect(airyElevation(seaLevelThickness, density)).toBeCloseTo(0, 6);

    const justBelow = airyElevation(seaLevelThickness - 0.001, density);
    const justAbove = airyElevation(seaLevelThickness + 0.001, density);
    expect(justBelow).toBeLessThan(0);
    expect(justAbove).toBeGreaterThan(0);
    expect(justAbove - justBelow).toBeLessThan(0.001);
  });

  it("rises faster below sea level than above it, because new crust displaces water", () => {
    // Same crust either side of the shoreline, so the only difference is what the new
    // thickness has to lift: water below, air above. The ratio of the two slopes is
    // exactly ρm / (ρm − ρw) ≈ 1.45. This is the physics PhET omitted, and it is why
    // ocean bathymetry is such a sensitive record of crustal thickness.
    const density = 2900;
    const submarineSlope = airyElevation(20001, density) - airyElevation(20000, density);
    const subaerialSlope = airyElevation(40001, density) - airyElevation(40000, density);

    expect(airyElevation(20000, density)).toBeLessThan(0);
    expect(airyElevation(40000, density)).toBeGreaterThan(0);
    expect(submarineSlope / subaerialSlope).toBeCloseTo(
      MANTLE_DENSITY_KG_M3 / (MANTLE_DENSITY_KG_M3 - SEAWATER_DENSITY_KG_M3),
      3,
    );
  });

  it("floats thicker crust higher and denser crust lower", () => {
    expect(airyElevation(50000, 2800)).toBeGreaterThan(airyElevation(30000, 2800));
    expect(airyElevation(50000, 2600)).toBeGreaterThan(airyElevation(50000, 3100));
  });

  it("does not float crust as dense as the mantle at all", () => {
    // Neutral buoyancy: the column has nothing to stand on, so it sits at the reference.
    expect(airyElevation(40000, MANTLE_DENSITY_KG_M3)).toBeLessThan(0);
  });
});

describe("crustDensity", () => {
  it("spans the iron and silica end members when cold", () => {
    expect(crustDensity(0, 0)).toBeCloseTo(CRUST_IRON_DENSITY_KG_M3, 6);
    expect(crustDensity(1, 0)).toBeCloseTo(CRUST_SILICA_DENSITY_KG_M3, 6);
  });

  it("stays within 20 kg/m³ of PhET's expression at every slider corner", () => {
    // PhET: 2600 + 700 · (0.8·(1−c) + 0.10·(1−T)). Rewriting it as composition mixing
    // plus thermal expansion has to leave the numbers where teachers already know them.
    const phet = (c: number, t: number): number => 2600 + 700 * (0.8 * (1 - c) + 0.1 * (1 - t));
    for (const [c, t] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [0.5, 0.5],
    ] as const) {
      expect(Math.abs(crustDensity(c, t) - phet(c, t))).toBeLessThan(20);
    }
  });

  it("makes hot crust less dense than cold crust of the same composition", () => {
    expect(crustDensity(0.5, 1)).toBeLessThan(crustDensity(0.5, 0));
  });

  it("is dominated by composition rather than temperature", () => {
    const compositionSpan = crustDensity(0, 0.5) - crustDensity(1, 0.5);
    const temperatureSpan = crustDensity(0.5, 0) - crustDensity(0.5, 1);
    expect(compositionSpan).toBeGreaterThan(5 * temperatureSpan);
  });
});

describe("crustGeotherm", () => {
  it("starts at the surface temperature and warms with depth", () => {
    expect(crustGeotherm(0, 30000, 1)).toBeCloseTo(SURFACE_TEMPERATURE_K, 6);
    expect(crustGeotherm(30000, 30000, 1)).toBeCloseTo(SURFACE_TEMPERATURE_K + CRUST_GEOTHERM_SPAN_K, 6);
    expect(crustGeotherm(20000, 30000, 1)).toBeGreaterThan(crustGeotherm(10000, 30000, 1));
  });

  it("is isothermal at the coolest slider setting", () => {
    expect(crustGeotherm(30000, 30000, 0)).toBeCloseTo(SURFACE_TEMPERATURE_K, 6);
  });

  it("clamps outside the column instead of extrapolating", () => {
    expect(crustGeotherm(-5000, 30000, 1)).toBeCloseTo(SURFACE_TEMPERATURE_K, 6);
    expect(crustGeotherm(90000, 30000, 1)).toBeCloseTo(SURFACE_TEMPERATURE_K + CRUST_GEOTHERM_SPAN_K, 6);
  });

  it("survives a degenerate column without dividing by zero", () => {
    expect(crustGeotherm(0, 0, 1)).toBeCloseTo(SURFACE_TEMPERATURE_K, 6);
  });
});
