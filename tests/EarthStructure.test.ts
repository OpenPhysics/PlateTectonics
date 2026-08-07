/**
 * EarthStructure.test.ts
 *
 * The PREM density profile and the layer boundaries built on it. These numbers are an
 * observation of the Earth rather than a model of it, so the tests check them against
 * facts about the planet, not against the implementation.
 */

import { describe, expect, it } from "vitest";
import {
  coreDensityAt,
  densityAt,
  EARTH_LAYERS,
  layerAt,
  layerTemperatureAt,
  mantleDensityAt,
} from "../src/common/model/EarthStructure.js";
import {
  EARTH_RADIUS_KM,
  INNER_CORE_TEMPERATURE_K,
  INNER_OUTER_CORE_BOUNDARY_KM,
  MANTLE_CORE_BOUNDARY_KM,
  UPPER_LOWER_MANTLE_BOUNDARY_KM,
} from "../src/PlateTectonicsConstants.js";

describe("mantleDensityAt", () => {
  it("increases with depth all the way to the core", () => {
    let previous = mantleDensityAt(30);
    for (let depthKm = 40; depthKm <= MANTLE_CORE_BOUNDARY_KM; depthKm += 10) {
      const density = mantleDensityAt(depthKm);
      // The 71–220 km low-velocity zone is very slightly inverted in PREM, so allow a
      // few kg/m³ of decrease rather than demanding strict monotonicity.
      expect(density).toBeGreaterThan(previous - 25);
      previous = density;
    }
    expect(mantleDensityAt(MANTLE_CORE_BOUNDARY_KM)).toBeGreaterThan(mantleDensityAt(100));
  });

  it("never reports a crustal density, however shallow it is asked", () => {
    // PREM's top entries are ocean and crust (1020, 2600, 2900 kg/m³), because it
    // describes a whole standard column. These screens draw their own crust, so those
    // entries must not leak through — otherwise the rock beneath a crustal block would
    // come out less dense than the block, and it would appear to float on something
    // lighter than itself. Everything above the Moho reads as Moho mantle.
    expect(mantleDensityAt(0)).toBeCloseTo(mantleDensityAt(25), 6);
    expect(mantleDensityAt(15)).toBeCloseTo(mantleDensityAt(25), 6);
    expect(mantleDensityAt(-100)).toBeCloseTo(mantleDensityAt(25), 6);
    expect(mantleDensityAt(25)).toBeGreaterThan(3300);
  });

  it("is denser than any crust the sim can make, everywhere", () => {
    // The densest crust the composition slider reaches is 3230 kg/m³.
    for (const depthKm of [0, 25, 100, 500, 2000, 2891]) {
      expect(mantleDensityAt(depthKm)).toBeGreaterThan(3230);
    }
  });

  it("steps up at the 400 km olivine phase change", () => {
    expect(mantleDensityAt(400) - mantleDensityAt(371)).toBeGreaterThan(150);
  });

  it("reaches about 5566 kg/m³ at the core-mantle boundary", () => {
    expect(mantleDensityAt(2891)).toBeCloseTo(5566, 0);
  });

  it("clamps rather than extrapolating past the ends of the table", () => {
    expect(mantleDensityAt(-100)).toBeCloseTo(mantleDensityAt(0), 6);
    expect(mantleDensityAt(9999)).toBeCloseTo(mantleDensityAt(2891), 6);
  });
});

describe("coreDensityAt", () => {
  it("is far denser than the mantle just above it", () => {
    // The largest density contrast anywhere in the Earth — bigger than rock against air.
    expect(coreDensityAt(MANTLE_CORE_BOUNDARY_KM)).toBeGreaterThan(1.7 * mantleDensityAt(2891));
  });

  it("increases from the core-mantle boundary to the centre", () => {
    expect(coreDensityAt(INNER_OUTER_CORE_BOUNDARY_KM)).toBeGreaterThan(coreDensityAt(MANTLE_CORE_BOUNDARY_KM));
    expect(coreDensityAt(EARTH_RADIUS_KM)).toBeGreaterThan(coreDensityAt(INNER_OUTER_CORE_BOUNDARY_KM));
  });
});

describe("densityAt", () => {
  it("switches from the mantle table to the core curve at the boundary", () => {
    expect(densityAt(MANTLE_CORE_BOUNDARY_KM - 1)).toBeLessThan(6000);
    expect(densityAt(MANTLE_CORE_BOUNDARY_KM)).toBeGreaterThan(9000);
  });
});

describe("layerAt", () => {
  const crustBase = 35;

  it("names each shell at a depth inside it", () => {
    expect(layerAt(10, crustBase)).toBe("crust");
    expect(layerAt(300, crustBase)).toBe("upperMantle");
    expect(layerAt(1500, crustBase)).toBe("lowerMantle");
    expect(layerAt(4000, crustBase)).toBe("outerCore");
    expect(layerAt(6000, crustBase)).toBe("innerCore");
  });

  it("takes the crust base from the caller rather than a fixed depth", () => {
    // Oceanic crust is 7 km thick and continental 35 km; the same depth is in different
    // layers depending on which column you are standing on.
    expect(layerAt(20, 7)).toBe("upperMantle");
    expect(layerAt(20, 35)).toBe("crust");
  });

  it("returns every layer somewhere, and only known layers", () => {
    const seen = new Set([10, 300, 1500, 4000, 6000].map((depth) => layerAt(depth, crustBase)));
    expect(seen.size).toBe(EARTH_LAYERS.length);
    for (const layer of seen) {
      expect(EARTH_LAYERS).toContain(layer);
    }
  });
});

describe("layerTemperatureAt", () => {
  const crustBase = 35;
  const crustBaseTemperature = 900;

  it("warms monotonically from the crust to the inner core", () => {
    const depths = [crustBase, 300, UPPER_LOWER_MANTLE_BOUNDARY_KM, 1500, MANTLE_CORE_BOUNDARY_KM, 5500];
    let previous = -Infinity;
    for (const depthKm of depths) {
      const temperature = layerTemperatureAt(depthKm, crustBase, crustBaseTemperature);
      expect(temperature).toBeGreaterThan(previous);
      previous = temperature;
    }
  });

  it("treats the inner core as isothermal", () => {
    expect(layerTemperatureAt(5500, crustBase, crustBaseTemperature)).toBeCloseTo(INNER_CORE_TEMPERATURE_K, 6);
    expect(layerTemperatureAt(EARTH_RADIUS_KM, crustBase, crustBaseTemperature)).toBeCloseTo(
      INNER_CORE_TEMPERATURE_K,
      6,
    );
  });

  it("reports the crust's own base temperature inside the crust", () => {
    expect(layerTemperatureAt(10, crustBase, crustBaseTemperature)).toBeCloseTo(crustBaseTemperature, 6);
  });
});
