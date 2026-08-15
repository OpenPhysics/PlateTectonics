/**
 * EarthCurvature.test.ts
 *
 * The mapping that bends a flat slab around the planet: that it fixes the origin,
 * round-trips, drops by the amount spherical geometry says it should, and stays
 * continuous across the middle of the block.
 */

import { Vector3 } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import {
  curvatureDropM,
  EARTH_CENTER,
  EARTH_RADIUS_M,
  toPlanar,
  toRadial,
  xRadialVector,
  zRadialVector,
} from "../src/common/model/EarthCurvature.js";

describe("EarthCurvature", () => {
  it("leaves the origin alone", () => {
    const origin = toRadial(0, 0, 0);
    expect(origin.x).toBeCloseTo(0, 6);
    expect(origin.y).toBeCloseTo(0, 6);
    expect(origin.z).toBeCloseTo(0, 6);
  });

  it("keeps sea level exactly one Earth radius from the centre", () => {
    for (const [xM, zM] of [
      [0, 0],
      [700000, 0],
      [-1500000, -400000],
      [225000, -1000000],
    ] as const) {
      const point = toRadial(xM, 0, zM);
      expect(point.minus(EARTH_CENTER).magnitude).toBeCloseTo(EARTH_RADIUS_M, 3);
    }
  });

  it("puts elevation along the radius, so a column of rock stays a column", () => {
    const surface = toRadial(600000, 0, -300000);
    const deep = toRadial(600000, -50000, -300000);
    expect(deep.minus(EARTH_CENTER).magnitude).toBeCloseTo(EARTH_RADIUS_M - 50000, 3);

    // Same direction from the centre, 50 km shorter.
    const surfaceDirection = surface.minus(EARTH_CENTER).normalized();
    const deepDirection = deep.minus(EARTH_CENTER).normalized();
    expect(deepDirection.distance(surfaceDirection)).toBeLessThan(1e-9);
  });

  it("round-trips planar → radial → planar", () => {
    for (const [xM, yM, zM] of [
      [0, 0, 0],
      [700000, 3500, -1000000],
      [-1500000, -150000, -2000000],
      [225000, 12000, -400000],
    ] as const) {
      const back = toPlanar(toRadial(xM, yM, zM));
      expect(back.x).toBeCloseTo(xM, 2);
      expect(back.y).toBeCloseTo(yM, 2);
      expect(back.z).toBeCloseTo(zM, 2);
    }
  });

  it("drops away from the origin by R(1 − cos(s/R)), the spherical sagitta", () => {
    for (const arcM of [100000, 700000, 1500000]) {
      const expected = EARTH_RADIUS_M * (1 - Math.cos(arcM / EARTH_RADIUS_M));
      expect(curvatureDropM(arcM, 0)).toBeCloseTo(expected, 3);
      expect(curvatureDropM(0, arcM)).toBeCloseTo(expected, 3);
    }
  });

  it("curves enough at block scale to be worth drawing", () => {
    // The Plate Motion block is ±700 km across; the Crust block ±1500 km. Both drop
    // further than the crust drawn on them is thick, which is why the block is bent
    // rather than left flat.
    expect(curvatureDropM(700000, 0)).toBeGreaterThan(38000);
    expect(curvatureDropM(1500000, 0)).toBeGreaterThan(175000);

    // And is negligible across a single crustal column, so the Crust screen's ±225 km
    // section is only gently bowed.
    expect(curvatureDropM(75000, 0)).toBeLessThan(500);
  });

  it("is symmetric about the middle of the block and continuous across it", () => {
    expect(curvatureDropM(400000, 0)).toBeCloseTo(curvatureDropM(-400000, 0), 6);

    // Straddling x = 0 must not jump a whole turn: the planar inverse unwraps θ about
    // the front face, and a sign error there shows up here as a discontinuity.
    const justLeft = toPlanar(toRadial(-1, 0, 0));
    const justRight = toPlanar(toRadial(1, 0, 0));
    expect(justRight.x - justLeft.x).toBeCloseTo(2, 3);
  });

  it("decomposes into per-row and per-column direction vectors", () => {
    // The renderer hoists these out of its inner loop, so the decomposed form has to
    // agree with the direct one exactly.
    const xM = 350000;
    const zM = -600000;
    const elevationM = -12000;

    const xRadial = xRadialVector(xM);
    const zRadial = zRadialVector(zM);
    const radius = elevationM + EARTH_RADIUS_M;
    const decomposed = new Vector3(
      xRadial.x * zRadial.x * radius,
      xRadial.y * zRadial.y * radius,
      xRadial.z * zRadial.z * radius,
    ).plus(EARTH_CENTER);

    expect(decomposed.distance(toRadial(xM, elevationM, zM))).toBeLessThan(1e-6);
  });
});
