/**
 * CrossSectionGeometry.test.ts
 *
 * The two-scale cross-section layout and the slab fitted to the hypocentres.
 */

import { Bounds2 } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import { CROSS_SECTIONS } from "../src/common/data/generated/crossSectionData.js";
import {
  CONTINENTAL_CRUST_THICKNESS_KM,
  MAP_VIEW_BOUNDS,
  OCEANIC_CRUST_THICKNESS_KM,
} from "../src/PlateTectonicsConstants.js";
import { CrossSectionGeometry } from "../src/plate-tectonics/view/CrossSectionGeometry.js";

const bounds = new Bounds2(MAP_VIEW_BOUNDS.minX, MAP_VIEW_BOUNDS.minY, MAP_VIEW_BOUNDS.maxX, MAP_VIEW_BOUNDS.maxY);

function geometryFor(key: "subduction" | "divergent" | "transform"): CrossSectionGeometry {
  const data = CROSS_SECTIONS.find((section) => section.key === key);
  if (!data) {
    throw new Error(`no cross-section data for ${key}`);
  }
  return new CrossSectionGeometry(data, bounds);
}

describe("CrossSectionGeometry", () => {
  it("maps distance along the profile across the viewport", () => {
    const geometry = geometryFor("subduction");
    expect(geometry.x(0)).toBeCloseTo(bounds.minX, 9);
    expect(geometry.x(geometry.data.lengthKm)).toBeCloseTo(bounds.maxX, 9);
  });

  it("puts depth below the relief band and increasing downwards", () => {
    const geometry = geometryFor("subduction");
    expect(geometry.y(0)).toBeCloseTo(geometry.surfaceY, 9);
    expect(geometry.y(geometry.data.maxDepthKm)).toBeCloseTo(bounds.maxY, 9);
    expect(geometry.y(100)).toBeGreaterThan(geometry.y(50));
  });

  it("keeps the relief band above the depth band, with sea level inside it", () => {
    for (const key of ["subduction", "divergent", "transform"] as const) {
      const geometry = geometryFor(key);
      expect(geometry.surfaceY).toBeGreaterThan(bounds.minY);
      expect(geometry.surfaceY).toBeLessThan(bounds.maxY);
      expect(geometry.seaLevelY).toBeGreaterThanOrEqual(bounds.minY);
      expect(geometry.seaLevelY).toBeLessThanOrEqual(geometry.surfaceY);
      // High ground plots above sea level, deep sea floor below it.
      expect(geometry.yFromElevation(3000)).toBeLessThan(geometry.seaLevelY);
      expect(geometry.yFromElevation(-3000)).toBeGreaterThan(geometry.seaLevelY);
    }
  });

  it("exaggerates the relief, and says by how much", () => {
    const geometry = geometryFor("subduction");
    // 700 km of depth against a few km of relief: the stretch is large and known.
    expect(geometry.verticalExaggeration).toBeGreaterThan(5);
    expect(geometry.pixelsPerElevationKm).toBeGreaterThan(geometry.pixelsPerDepthKm);
  });

  it("reads the trench and the Andes off the real elevation profile", () => {
    const geometry = geometryFor("subduction");
    const trench = geometry.crossingOfType("convergent");
    expect(trench).not.toBeNull();
    if (!trench) {
      return;
    }
    // The trench really is the deepest point near the crossing …
    expect(geometry.elevationAt(trench.distanceKm)).toBeLessThan(-4000);
    // … and the Andes rise east of it.
    const highest = Math.max(...geometry.data.elevationsM);
    expect(highest).toBeGreaterThan(2500);
  });

  it("switches between oceanic and continental crust where the bathymetry does", () => {
    const geometry = geometryFor("subduction");
    const trench = geometry.crossingOfType("convergent");
    if (!trench) {
      return;
    }
    expect(geometry.isOceanic(trench.distanceKm - 150)).toBe(true);
    expect(geometry.crustThicknessKm(trench.distanceKm - 150)).toBeCloseTo(OCEANIC_CRUST_THICKNESS_KM, 6);

    const underTheAndes = geometry.data.lengthKm * 0.75;
    expect(geometry.isOceanic(underTheAndes)).toBe(false);
    expect(geometry.crustThicknessKm(underTheAndes)).toBeGreaterThanOrEqual(CONTINENTAL_CRUST_THICKNESS_KM);
  });

  it("fits a slab that descends away from the trench", () => {
    const geometry = geometryFor("subduction");
    const trace = geometry.slabTrace;
    expect(trace.length).toBeGreaterThanOrEqual(4);

    for (let i = 1; i < trace.length; i++) {
      // Monotonically deeper, and always further from the trench.
      expect((trace[i] as { y: number }).y).toBeGreaterThan((trace[i - 1] as { y: number }).y);
    }
    expect((trace[trace.length - 1] as { x: number }).x).toBeGreaterThan((trace[0] as { x: number }).x);
  });

  it("draws no slab where there is no subduction", () => {
    expect(geometryFor("divergent").slabTrace).toHaveLength(0);
    expect(geometryFor("transform").slabTrace).toHaveLength(0);
  });

  it("thickens the oceanic plate away from the spreading ridge", () => {
    const geometry = geometryFor("divergent");
    const ridge = geometry.crossingOfType("divergent");
    expect(ridge).not.toBeNull();
    if (!ridge) {
      return;
    }
    const atAxis = geometry.lithosphereBaseAt(ridge.distanceKm);
    const nearby = geometry.lithosphereBaseAt(ridge.distanceKm + 100);
    const faraway = geometry.lithosphereBaseAt(ridge.distanceKm + 400);
    expect(atAxis).toBeLessThan(nearby);
    expect(nearby).toBeLessThan(faraway);
  });

  it("keeps a constant plate thickness where there is no ridge", () => {
    const geometry = geometryFor("transform");
    expect(geometry.lithosphereBaseAt(10)).toBeCloseTo(geometry.lithosphereBaseAt(200), 9);
  });

  it("places the volcanic arc behind the trench", () => {
    const geometry = geometryFor("subduction");
    const trench = geometry.crossingOfType("convergent");
    const arcDistanceKm = geometry.arcDistanceKm;
    expect(arcDistanceKm).not.toBeNull();
    if (!trench || arcDistanceKm === null) {
      return;
    }
    // Arcs sit 100–400 km behind the trench, above the ~100 km contour of the slab.
    expect(arcDistanceKm - trench.distanceKm).toBeGreaterThan(100);
    expect(arcDistanceKm - trench.distanceKm).toBeLessThan(450);
  });
});
