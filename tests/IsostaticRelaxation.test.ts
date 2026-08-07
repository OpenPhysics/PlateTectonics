/**
 * IsostaticRelaxation.test.ts
 *
 * The settling of the crustal block: that it converges on its target, never overshoots,
 * and lands in the same place regardless of frame rate.
 */

import { describe, expect, it } from "vitest";
import { type RelaxationState, settledAt, stepRelaxation } from "../src/crust/model/IsostaticRelaxation.js";

/** Run the relaxation for `seconds` at a fixed frame time, returning the final state. */
function relaxFor(state: RelaxationState, targetM: number, seconds: number, dt: number): RelaxationState {
  let current = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    current = stepRelaxation(current, targetM, dt);
  }
  return current;
}

describe("stepRelaxation", () => {
  it("converges on the target", () => {
    const settled = relaxFor(settledAt(0), 5000, 10, 1 / 60);
    expect(settled.elevationM).toBeCloseTo(5000, 1);
    expect(settled.velocityMPerS).toBeCloseTo(0, 1);
  });

  it("never overshoots, because it is critically damped", () => {
    // The misconception this guards against: a bobbing block implies the mantle is
    // springy. It is viscous, so the approach is monotonic.
    let state = settledAt(0);
    const target = 5000;
    for (let i = 0; i < 600; i++) {
      state = stepRelaxation(state, target, 1 / 60);
      expect(state.elevationM).toBeLessThanOrEqual(target + 1e-6);
    }
  });

  it("approaches from above without undershooting either", () => {
    let state = settledAt(5000);
    const target = -2000;
    for (let i = 0; i < 600; i++) {
      state = stepRelaxation(state, target, 1 / 60);
      expect(state.elevationM).toBeGreaterThanOrEqual(target - 1e-6);
    }
  });

  it("settles in the same place at 30, 60 and 144 fps", () => {
    // Frame-rate independence is why this uses a sub-stepped semi-implicit scheme
    // rather than the per-frame exponential damping it replaces.
    const target = 4200;
    const at30 = relaxFor(settledAt(-1000), target, 8, 1 / 30);
    const at60 = relaxFor(settledAt(-1000), target, 8, 1 / 60);
    const at144 = relaxFor(settledAt(-1000), target, 8, 1 / 144);

    // Measured against the 5200 m the block travelled, not in absolute metres: the
    // residual spread across a 5× range of frame times is under a thousandth of a
    // percent, which is far below one screen pixel.
    const travel = target - -1000;
    expect(Math.abs(at30.elevationM - at60.elevationM) / travel).toBeLessThan(1e-4);
    expect(Math.abs(at60.elevationM - at144.elevationM) / travel).toBeLessThan(1e-4);
  });

  it("stays stable when a backgrounded tab hands back a huge dt", () => {
    const state = stepRelaxation(settledAt(0), 5000, 12);
    expect(Number.isFinite(state.elevationM)).toBe(true);
    expect(state.elevationM).toBeGreaterThan(4000);
    expect(state.elevationM).toBeLessThanOrEqual(5000 + 1e-6);
  });

  it("does nothing for a non-positive time step", () => {
    const before = { elevationM: 123, velocityMPerS: 45 };
    expect(stepRelaxation(before, 999, 0)).toEqual(before);
    expect(stepRelaxation(before, 999, -1)).toEqual(before);
  });

  it("does not mutate the state it is given", () => {
    const before = { elevationM: 0, velocityMPerS: 0 };
    stepRelaxation(before, 5000, 1 / 60);
    expect(before).toEqual({ elevationM: 0, velocityMPerS: 0 });
  });

  it("stays put when it is already at the target", () => {
    const state = relaxFor(settledAt(3000), 3000, 3, 1 / 60);
    expect(state.elevationM).toBeCloseTo(3000, 9);
    expect(state.velocityMPerS).toBeCloseTo(0, 9);
  });

  it("settles faster with a shorter time constant", () => {
    const target = 5000;
    const quick = stepRelaxation(settledAt(0), target, 1, 0.2);
    const slow = stepRelaxation(settledAt(0), target, 1, 2);
    expect(quick.elevationM).toBeGreaterThan(slow.elevationM);
  });
});

describe("settledAt", () => {
  it("is at rest at the given elevation", () => {
    expect(settledAt(1234)).toEqual({ elevationM: 1234, velocityMPerS: 0 });
  });
});
