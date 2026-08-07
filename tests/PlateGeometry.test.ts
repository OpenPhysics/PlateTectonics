/**
 * PlateGeometry.test.ts
 *
 * What each kind of boundary does as its clock runs. These are the claims the screen
 * makes about the Earth, so they are tested as claims — a rift opens, a slab goes down
 * and feeds an arc inland of the trench, a collision builds mountains without creating
 * or destroying rock.
 */

import { describe, expect, it } from "vitest";
import {
  COLLISION_TIME_LIMIT_MYR,
  NEW_CRUST_LABEL_DELAY_MYR,
  PLATE_X_LIMIT_M,
  RIFTING_TIME_LIMIT_MYR,
  SUBDUCTION_TIME_LIMIT_MYR,
} from "../src/PlateTectonicsConstants.js";
import { boundaryGeometry, type PlateOutline, restingGeometry } from "../src/plate-motion/model/PlateGeometry.js";
import { PLATE_TYPES, type PlateType } from "../src/plate-motion/model/PlateType.js";

/** Cross-sectional area of the crust in an outline, by the trapezium rule. */
function crustArea(outline: PlateOutline): number {
  const top = outline.crustTop;
  const base = outline.crustBase;
  if (top.length < 2 || base.length < 2) {
    return 0;
  }
  // Both polylines are sampled at the same x values in the collision case, which is the
  // only place this is used.
  let area = 0;
  for (let i = 1; i < top.length; i++) {
    const x0 = top[i - 1]?.x ?? 0;
    const x1 = top[i]?.x ?? 0;
    const t0 = (top[i - 1]?.y ?? 0) - (base[i - 1]?.y ?? 0);
    const t1 = (top[i]?.y ?? 0) - (base[i]?.y ?? 0);
    area += (Math.abs(x1 - x0) * (t0 + t1)) / 2;
  }
  return area;
}

/** Highest point on a plate's surface. */
function peakM(outline: PlateOutline): number {
  return Math.max(...outline.crustTop.map((point) => point.y));
}

describe("boundaryGeometry at rest", () => {
  it("returns two flat plates at t = 0, whatever the motion", () => {
    const geometry = boundaryGeometry("convergent", "continental", "oldOceanic", 0);
    expect(geometry.slab).toEqual([]);
    expect(geometry.volcanoes).toEqual([]);
    expect(geometry.ridgeAxisM).toBeNull();
  });

  it("falls back to rest for an illegal pairing rather than throwing", () => {
    // The view asks for a shape every frame; a boundary that cannot exist should look
    // like two plates sitting there, not like a crash.
    const geometry = boundaryGeometry("convergent", "oldOceanic", "oldOceanic", 20);
    expect(geometry).toEqual(restingGeometry("oldOceanic", "oldOceanic"));
  });

  it("runs every polyline of an outline in the same direction along x", () => {
    // The painter closes a band by walking one polyline forward and the other back, so
    // two that disagree in direction produce a self-crossing bowtie instead of a plate.
    // The subducting plate used to reverse its crustTop and not its base lines, which
    // drew the down-going plate as an X across the whole half of the section.
    const direction = (points: readonly { x: number }[]): number =>
      Math.sign((points[points.length - 1]?.x ?? 0) - (points[0]?.x ?? 0));

    for (const left of PLATE_TYPES) {
      for (const right of PLATE_TYPES) {
        for (const motion of ["convergent", "divergent"] as const) {
          for (const tMyr of [0, 1, 17, 35, 50]) {
            const geometry = boundaryGeometry(motion, left, right, tMyr);
            for (const outline of [geometry.left, geometry.right]) {
              const expected = direction(outline.crustTop);
              expect(direction(outline.crustBase), `${left}/${right} ${motion} t=${tMyr} crustBase`).toBe(expected);
              expect(direction(outline.lithosphereBase), `${left}/${right} ${motion} t=${tMyr} lithosphere`).toBe(
                expected,
              );
            }
          }
        }
      }
    }
  });

  it("never throws for any pairing, motion or time", () => {
    for (const left of PLATE_TYPES) {
      for (const right of PLATE_TYPES) {
        for (const motion of ["convergent", "divergent"] as const) {
          for (const tMyr of [0, 1, 17, 35, 50, 500]) {
            expect(() => boundaryGeometry(motion, left, right, tMyr)).not.toThrow();
          }
        }
      }
    }
  });
});

describe("rifting", () => {
  const left: PlateType = "youngOceanic";
  const right: PlateType = "oldOceanic";

  it("opens a gap that grows with time", () => {
    let previous = 0;
    for (const tMyr of [5, 15, 25, RIFTING_TIME_LIMIT_MYR]) {
      const geometry = boundaryGeometry("divergent", left, right, tMyr);
      expect(geometry.newCrustHalfWidthM).toBeGreaterThan(previous);
      previous = geometry.newCrustHalfWidthM;
    }
  });

  it("makes no new crust at any boundary that is not a rift", () => {
    expect(boundaryGeometry("convergent", "continental", "oldOceanic", 30).newCrustHalfWidthM).toBe(0);
    expect(boundaryGeometry("convergent", "continental", "continental", 30).newCrustHalfWidthM).toBe(0);
  });

  it("puts the ridge crest at the axis, and drops away from it", () => {
    // New crust is hot and buoyant; it cools and sinks as it moves away. This is why
    // abyssal plains get deeper with distance from a spreading centre.
    const geometry = boundaryGeometry("divergent", left, right, 20);
    const atAxis = geometry.right.crustTop.find((p) => Math.abs(p.x) < 1000);
    const away = geometry.right.crustTop.find((p) => p.x > 100000 && p.x < 300000);
    expect(atAxis).toBeDefined();
    expect(away).toBeDefined();
    expect((atAxis as { y: number }).y).toBeGreaterThan((away as { y: number }).y);
  });

  it("marks the spreading axis and nothing else", () => {
    const geometry = boundaryGeometry("divergent", left, right, 10);
    expect(geometry.ridgeAxisM).toBe(0);
    expect(geometry.slab).toEqual([]);
    expect(geometry.volcanoes).toEqual([]);
  });

  it("waits before calling the new floor new crust", () => {
    expect(boundaryGeometry("divergent", left, right, 2).hasNewCrust).toBe(false);
    expect(boundaryGeometry("divergent", left, right, NEW_CRUST_LABEL_DELAY_MYR + 1).hasNewCrust).toBe(true);
  });
});

describe("subduction", () => {
  const left: PlateType = "continental";
  const right: PlateType = "oldOceanic";

  it("sends a slab down that gets longer and deeper with time", () => {
    let previousDepth = 0;
    for (const tMyr of [5, 15, 30, SUBDUCTION_TIME_LIMIT_MYR]) {
      const geometry = boundaryGeometry("convergent", left, right, tMyr);
      expect(geometry.slab.length).toBeGreaterThan(1);
      const deepest = Math.min(...geometry.slab.map((p) => p.y));
      expect(-deepest).toBeGreaterThan(previousDepth);
      previousDepth = -deepest;
    }
  });

  it("descends beneath the overriding plate, on the side opposite the denser one", () => {
    // Old ocean floor on the right goes down, and a subducting slab passes the hinge and
    // carries on down *under the overriding plate* — so the slab runs to the left, not
    // back out under the ocean floor it came from.
    const geometry = boundaryGeometry("convergent", left, right, 30);
    const far = geometry.slab[geometry.slab.length - 1];
    expect(far?.x).toBeLessThan(0);

    // Mirrored when the plates are swapped: the slab then runs to the right.
    const mirrored = boundaryGeometry("convergent", right, left, 30);
    expect(mirrored.slab[mirrored.slab.length - 1]?.x).toBeGreaterThan(0);
  });

  it("digs a trench at the boundary", () => {
    const geometry = boundaryGeometry("convergent", left, right, 30);
    const atBoundary = geometry.right.crustTop.find((p) => Math.abs(p.x) < 20000);
    const farOut = geometry.right.crustTop.find((p) => p.x > 400000);
    expect(atBoundary).toBeDefined();
    expect(farOut).toBeDefined();
    expect((atBoundary as { y: number }).y).toBeLessThan((farOut as { y: number }).y);
  });

  it("builds no arc until the slab has reached the melt window", () => {
    // No magma before the slab is deep enough to dehydrate: the arc is a *consequence*
    // of the slab reaching 100 km, not something that appears with the trench.
    expect(boundaryGeometry("convergent", left, right, 1).magma).toEqual([]);
    expect(boundaryGeometry("convergent", left, right, SUBDUCTION_TIME_LIMIT_MYR).magma.length).toBeGreaterThan(0);
  });

  it("puts the arc inland on the overriding plate, not on top of the trench", () => {
    // The arc is a consequence of the slab reaching melt depth *under the overriding
    // plate*, so it sits a characteristic way inland from the trench — on the continent,
    // not out on the subducting sea floor. Here the left plate is the overriding one, so
    // the arc is at negative x.
    const geometry = boundaryGeometry("convergent", left, right, SUBDUCTION_TIME_LIMIT_MYR);
    for (const point of geometry.magma) {
      expect(point.x).toBeLessThan(-30000);
    }
  });

  it("eventually grows a volcano, on the overriding plate", () => {
    const geometry = boundaryGeometry("convergent", left, right, SUBDUCTION_TIME_LIMIT_MYR);
    expect(geometry.volcanoes.length).toBeGreaterThan(0);
    for (const volcano of geometry.volcanoes) {
      expect(volcano.heightM).toBeGreaterThan(0);
      expect(volcano.xM).toBeLessThan(0);
    }
  });

  it("gives the slab a real thickness to be drawn with", () => {
    const geometry = boundaryGeometry("convergent", left, right, 20);
    expect(geometry.slabHalfThicknessM).toBeGreaterThan(10000);
  });
});

describe("collision", () => {
  const both: PlateType = "continental";

  it("builds mountains that grow with time", () => {
    let previous = -Infinity;
    for (const tMyr of [2, 10, 20, COLLISION_TIME_LIMIT_MYR]) {
      const peak = peakM(boundaryGeometry("convergent", both, both, tMyr).left);
      expect(peak).toBeGreaterThan(previous);
      previous = peak;
    }
  });

  it("conserves the cross-sectional area of the crust that started in frame", () => {
    // The claim the screen makes: rock is not created, it is rearranged. Squeezing the
    // crust horizontally has to thicken it by the reciprocal amount.
    //
    // Measured over the material columns only, dropping the final segment. That segment
    // is the far field being extended back out to the edge of the frame, and it is crust
    // that has flowed *in* from beyond the view — real, but not part of what started here.
    const materialOnly = (outline: PlateOutline): PlateOutline => ({
      crustTop: outline.crustTop.slice(0, -1),
      crustBase: outline.crustBase.slice(0, -1),
      lithosphereBase: outline.lithosphereBase.slice(0, -1),
    });

    const atRest = crustArea(materialOnly(boundaryGeometry("convergent", both, both, 0.0001).left));
    for (const tMyr of [10, 20, COLLISION_TIME_LIMIT_MYR]) {
      const collided = crustArea(materialOnly(boundaryGeometry("convergent", both, both, tMyr).left));
      expect(Math.abs(collided - atRest) / atRest).toBeLessThan(0.02);
    }
  });

  it("reaches the edge of the frame, because the far field continues off-screen", () => {
    // Without this the compressed plates would visibly pull back from the viewport,
    // leaving bare mantle where a continent should be.
    const geometry = boundaryGeometry("convergent", both, both, COLLISION_TIME_LIMIT_MYR);
    const leftmost = Math.min(...geometry.left.crustTop.map((point) => point.x));
    expect(leftmost).toBeCloseTo(-PLATE_X_LIMIT_M, 6);
  });

  it("puts a root under the mountains, deeper than the range is high", () => {
    // Isostasy: most of the thickening goes down, not up. A range standing 4 km high has
    // roughly 25 km of root beneath it.
    const geometry = boundaryGeometry("convergent", both, both, COLLISION_TIME_LIMIT_MYR);
    const peak = peakM(geometry.left);
    const deepest = Math.min(...geometry.left.crustBase.map((p) => p.y));
    const restBase = Math.min(...restingGeometry(both, both).left.crustBase.map((p) => p.y));
    expect(restBase - deepest).toBeGreaterThan(peak);
  });

  it("concentrates the shortening at the boundary, making a belt not a plateau", () => {
    const geometry = boundaryGeometry("convergent", both, both, COLLISION_TIME_LIMIT_MYR);
    const nearBoundary = geometry.left.crustTop.find((p) => Math.abs(p.x) < 40000);
    const farField = geometry.left.crustTop.find((p) => p.x < -500000);
    expect((nearBoundary as { y: number }).y).toBeGreaterThan((farField as { y: number }).y + 1000);
  });

  it("keeps the range below the highest elevation the Earth sustains", () => {
    const geometry = boundaryGeometry("convergent", both, both, COLLISION_TIME_LIMIT_MYR * 3);
    expect(peakM(geometry.left)).toBeLessThanOrEqual(COLLISION_ELEVATION_MAX);
  });

  it("subducts nothing", () => {
    const geometry = boundaryGeometry("convergent", both, both, 20);
    expect(geometry.slab).toEqual([]);
    expect(geometry.ridgeAxisM).toBeNull();
  });
});

/** The cap the collision geometry clamps to, re-declared for readability above. */
const COLLISION_ELEVATION_MAX = 13000;
