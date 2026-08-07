/**
 * BoundaryRules.test.ts
 *
 * Which plate pairings are allowed to do what, and which plate goes down. Every one of
 * the 9 pairings is checked against both motions, because the rules are the pedagogical
 * content of the screen and a quietly wrong one would teach a quietly wrong fact.
 */

import { describe, expect, it } from "vitest";
import {
  COLLISION_TIME_LIMIT_MYR,
  RIFTING_TIME_LIMIT_MYR,
  SUBDUCTION_TIME_LIMIT_MYR,
} from "../src/PlateTectonicsConstants.js";
import {
  behaviorFor,
  isLegal,
  legalMotions,
  MOTION_TYPES,
  type MotionType,
  subductingSide,
  timeLimitMyr,
} from "../src/plate-motion/model/BoundaryRules.js";
import { PLATE_TYPES, type PlateType } from "../src/plate-motion/model/PlateType.js";

/** All 9 orderings of two plate types. */
const PAIRS: readonly (readonly [PlateType, PlateType])[] = PLATE_TYPES.flatMap((left) =>
  PLATE_TYPES.map((right) => [left, right] as const),
);

describe("isLegal", () => {
  it("covers all 9 pairings for both motions without throwing", () => {
    for (const [left, right] of PAIRS) {
      for (const motion of MOTION_TYPES) {
        expect(typeof isLegal(motion, left, right)).toBe("boolean");
      }
    }
  });

  it("refuses convergence between two identical ocean plates", () => {
    // No density contrast, so nothing decides which goes down. Better to refuse than to
    // pick arbitrarily and imply the choice was physical.
    expect(isLegal("convergent", "youngOceanic", "youngOceanic")).toBe(false);
    expect(isLegal("convergent", "oldOceanic", "oldOceanic")).toBe(false);
  });

  it("allows two continents to converge, because that is the collision case", () => {
    // Neither subducts; they crumple. Refusing this pairing would make the collision
    // behaviour unreachable, and take the Himalayas off the screen entirely.
    expect(isLegal("convergent", "continental", "continental")).toBe(true);
  });

  it("allows convergence whenever the two plates differ", () => {
    for (const [left, right] of PAIRS) {
      if (left !== right) {
        expect(isLegal("convergent", left, right)).toBe(true);
      }
    }
  });

  it("allows divergence only between the same kind of crust", () => {
    expect(isLegal("divergent", "continental", "continental")).toBe(true);
    expect(isLegal("divergent", "youngOceanic", "oldOceanic")).toBe(true);
    expect(isLegal("divergent", "oldOceanic", "youngOceanic")).toBe(true);
    expect(isLegal("divergent", "continental", "youngOceanic")).toBe(false);
    expect(isLegal("divergent", "oldOceanic", "continental")).toBe(false);
  });

  it("is symmetric — which plate you dropped first cannot matter", () => {
    for (const [left, right] of PAIRS) {
      for (const motion of MOTION_TYPES) {
        expect(isLegal(motion, left, right)).toBe(isLegal(motion, right, left));
      }
    }
  });

  it("leaves every pairing with at least one thing it can do", () => {
    for (const [left, right] of PAIRS) {
      expect(legalMotions(left, right).length).toBeGreaterThan(0);
    }
  });
});

describe("behaviorFor", () => {
  it("crumples two continents rather than subducting either", () => {
    // Continental crust is too buoyant to be pushed into the mantle. This is why the
    // Himalayas are a mountain range and not a trench.
    expect(behaviorFor("convergent", "continental", "continental")).toBe("collision");
    expect(behaviorFor("divergent", "continental", "continental")).toBe("rifting");
  });

  it("reaches all three behaviours across the legal pairings", () => {
    // A guard against a rule change quietly making one of them unreachable.
    const reached = new Set(
      PAIRS.flatMap(([left, right]) => MOTION_TYPES.map((motion) => behaviorFor(motion, left, right))),
    );
    expect(reached).toContain("subduction");
    expect(reached).toContain("collision");
    expect(reached).toContain("rifting");
  });

  it("subducts whenever an ocean plate meets something different", () => {
    expect(behaviorFor("convergent", "continental", "oldOceanic")).toBe("subduction");
    expect(behaviorFor("convergent", "youngOceanic", "oldOceanic")).toBe("subduction");
    expect(behaviorFor("convergent", "youngOceanic", "continental")).toBe("subduction");
  });

  it("rifts at every legal divergent boundary", () => {
    expect(behaviorFor("divergent", "youngOceanic", "oldOceanic")).toBe("rifting");
    expect(behaviorFor("divergent", "continental", "continental")).toBe("rifting");
  });

  it("returns null for anything illegal", () => {
    expect(behaviorFor("divergent", "continental", "oldOceanic")).toBeNull();
    expect(behaviorFor("convergent", "oldOceanic", "oldOceanic")).toBeNull();
  });
});

describe("subductingSide", () => {
  it("never subducts a continent", () => {
    // The rule with the most consequences in the whole of geology.
    expect(subductingSide("convergent", "continental", "oldOceanic")).toBe("right");
    expect(subductingSide("convergent", "oldOceanic", "continental")).toBe("left");
    expect(subductingSide("convergent", "continental", "youngOceanic")).toBe("right");
    expect(subductingSide("convergent", "youngOceanic", "continental")).toBe("left");
  });

  it("sends the older ocean plate down, because it is the colder and denser one", () => {
    expect(subductingSide("convergent", "youngOceanic", "oldOceanic")).toBe("right");
    expect(subductingSide("convergent", "oldOceanic", "youngOceanic")).toBe("left");
  });

  it("subducts nothing at a rift or an illegal boundary", () => {
    expect(subductingSide("divergent", "youngOceanic", "oldOceanic")).toBeNull();
    expect(subductingSide("convergent", "oldOceanic", "oldOceanic")).toBeNull();
  });

  it("mirrors when the plates are swapped", () => {
    for (const [left, right] of PAIRS) {
      const side = subductingSide("convergent", left, right);
      const mirrored = subductingSide("convergent", right, left);
      if (side === null) {
        expect(mirrored).toBeNull();
      } else {
        expect(mirrored).toBe(side === "left" ? "right" : "left");
      }
    }
  });
});

describe("timeLimitMyr", () => {
  it("gives each behaviour the time it needs to finish", () => {
    expect(timeLimitMyr("convergent", "continental", "oldOceanic")).toBe(SUBDUCTION_TIME_LIMIT_MYR);
    expect(timeLimitMyr("convergent", "continental", "continental")).toBe(COLLISION_TIME_LIMIT_MYR);
    expect(timeLimitMyr("divergent", "youngOceanic", "oldOceanic")).toBe(RIFTING_TIME_LIMIT_MYR);
  });

  it("is always positive, for every pairing and motion", () => {
    for (const [left, right] of PAIRS) {
      for (const motion of MOTION_TYPES as readonly MotionType[]) {
        expect(timeLimitMyr(motion, left, right)).toBeGreaterThan(0);
      }
    }
  });

  it("gives subduction longer than rifting, because the slab has further to go", () => {
    expect(SUBDUCTION_TIME_LIMIT_MYR).toBeGreaterThan(RIFTING_TIME_LIMIT_MYR);
    expect(COLLISION_TIME_LIMIT_MYR).toBeGreaterThan(0);
  });
});
