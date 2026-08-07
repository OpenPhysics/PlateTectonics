/**
 * SlabCurve.test.ts
 *
 * The path a subducting slab bends along: that it is continuous, that it is
 * parameterised by arc length so the plate does not stretch, and that old ocean floor
 * dips steeper than young.
 */

import { describe, expect, it } from "vitest";
import { SUBDUCTION_TOTAL_ANGLE_OLD_RAD, SUBDUCTION_TOTAL_ANGLE_YOUNG_RAD } from "../src/PlateTectonicsConstants.js";
import { SlabCurve, slabHinge } from "../src/plate-motion/model/SlabCurve.js";

function oldSlab(): SlabCurve {
  return new SlabCurve("oldOceanic", slabHinge("oldOceanic", 0));
}

function youngSlab(): SlabCurve {
  return new SlabCurve("youngOceanic", slabHinge("youngOceanic", 0));
}

describe("SlabCurve shape", () => {
  it("starts at the hinge", () => {
    const slab = oldSlab();
    expect(slab.positionAt(0).x).toBeCloseTo(slab.startM.x, 6);
    expect(slab.positionAt(0).y).toBeCloseTo(slab.startM.y, 6);
  });

  it("descends monotonically and moves away from the trench", () => {
    const slab = oldSlab();
    let previous = slab.positionAt(0);
    for (let s = 10000; s <= 400000; s += 10000) {
      const point = slab.positionAt(s);
      expect(point.y).toBeLessThan(previous.y);
      expect(point.x).toBeGreaterThan(previous.x);
      previous = point;
    }
  });

  it("is continuous across the three arc joins", () => {
    // A jump here would show up as a kink or a gap in the drawn slab.
    const slab = oldSlab();
    for (let s = 0; s < slab.bendLengthM; s += slab.bendLengthM / 200) {
      const gap = slab.positionAt(s + 1).distance(slab.positionAt(s));
      expect(gap).toBeLessThan(1.2);
    }
  });

  it("reaches its full dip at the end of the bend and holds it after", () => {
    const slab = oldSlab();
    expect(slab.angleAt(slab.bendLengthM)).toBeCloseTo(SUBDUCTION_TOTAL_ANGLE_OLD_RAD, 6);
    expect(slab.angleAt(slab.bendLengthM * 3)).toBeCloseTo(SUBDUCTION_TOTAL_ANGLE_OLD_RAD, 6);
  });

  it("dips steeper for old ocean floor than for young", () => {
    // Old lithosphere is colder, thicker and denser, so it sinks more readily. This is
    // the one place a plate's age changes its shape rather than just its density.
    expect(SUBDUCTION_TOTAL_ANGLE_OLD_RAD).toBeGreaterThan(SUBDUCTION_TOTAL_ANGLE_YOUNG_RAD);
    expect(oldSlab().angleAt(1e6)).toBeGreaterThan(youngSlab().angleAt(1e6));
  });

  it("starts out horizontal, because a rigid sheet cannot turn a corner", () => {
    expect(oldSlab().angleAt(0)).toBeCloseTo(0, 9);
  });
});

describe("SlabCurve arc-length parameterisation", () => {
  it("covers equal distances for equal steps, everywhere along the path", () => {
    // The plate is not stretching: a point on it travels a fixed distance per million
    // years whatever part of the bend it is in. Any other parameterisation would make
    // the slab appear to speed up and slow down as it went round the corner.
    // Measured as a straight line between the two points, which is the chord rather
    // than the arc, so it is always a shade shorter through the bend — 0.01% at this
    // step on the tightest arc. The test is that the ratio is the same everywhere.
    const slab = oldSlab();
    const step = 2000;
    for (let s = 0; s < 300000; s += step) {
      const chord = slab.positionAt(s + step).distance(slab.positionAt(s));
      // Exactly 1 on the straight ray past the bend, so allow for float noise there.
      expect(chord / step).toBeGreaterThan(0.999);
      expect(chord / step).toBeLessThan(1 + 1e-9);
    }
  });
});

describe("SlabCurve depth lookups", () => {
  it("finds the arc length at which it reaches a depth", () => {
    const slab = oldSlab();
    for (const depthM of [50000, 100000, 150000, 300000]) {
      const s = slab.lengthAtDepth(depthM);
      expect(s).not.toBeNull();
      expect(slab.depthAt(s as number)).toBeCloseTo(depthM, 0);
    }
  });

  it("reaches the melt window, which is what feeds the volcanic arc", () => {
    // If the slab never got to 100-150 km there would be no magma and no arc, and the
    // subduction picture would be missing its most recognisable feature.
    const s = oldSlab().lengthAtDepth(100000);
    expect(s).not.toBeNull();
    expect(s as number).toBeGreaterThan(0);
  });

  it("returns zero for a depth it starts below", () => {
    expect(oldSlab().lengthAtDepth(0)).toBe(0);
  });
});

describe("SlabCurve trace", () => {
  it("returns a polyline from the hinge to the requested length", () => {
    const slab = oldSlab();
    const trace = slab.trace(200000, 20);
    expect(trace.length).toBe(21);
    expect(trace[0]?.y).toBeCloseTo(slab.startM.y, 6);
    expect(trace[20]?.y).toBeCloseTo(slab.positionAt(200000).y, 6);
  });
});

describe("slabHinge", () => {
  it("sits at mid-lithosphere, so the slab bends about its own centre", () => {
    const hinge = slabHinge("oldOceanic", 0);
    expect(hinge.x).toBe(0);
    expect(hinge.y).toBeLessThan(0);
    // Below the crust but above the base of the lithosphere.
    expect(hinge.y).toBeLessThan(-10000);
    expect(hinge.y).toBeGreaterThan(-70000);
  });
});
