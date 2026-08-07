/**
 * IsostaticRelaxation.ts
 *
 * How the crust gets from where it is to where isostasy says it should be.
 *
 * The Crust screen could snap the block to its equilibrium elevation the instant a
 * slider moves, and it would still be correct. It does not, because the thing worth
 * noticing is that the block *floats* — that it settles, the way a boat settles when
 * cargo comes off. So the elevation is relaxed toward the target rather than assigned.
 *
 * The relaxation is critically damped (ζ = 1): the block approaches equilibrium as fast
 * as it can without going past it. That is a deliberate departure from PhET, whose
 * integrator was underdamped and let the crust oscillate about its equilibrium. Real
 * isostatic adjustment is viscous — the mantle is a fluid with a ~10 ka relaxation time,
 * not a spring — so a bobbing block would be teaching a misconception. It also matters
 * for a second reason: an undamped mode makes the settled state depend on frame rate.
 *
 * Integrated semi-implicitly (velocity updated first, then position from the *new*
 * velocity), which is what keeps the scheme stable at large dt instead of needing the
 * exponential fudge factor PhET applied per frame.
 *
 * Pure and unit-tested in tests/IsostaticRelaxation.test.ts.
 */

import { ISOSTATIC_RELAXATION_TIME_CONSTANT_S } from "../../PlateTectonicsConstants.js";

/** Position and velocity of the relaxing column. Elevation m, velocity m/s. */
export type RelaxationState = {
  elevationM: number;
  velocityMPerS: number;
};

/**
 * Largest time step integrated in one go, s. A tab left in the background hands back a
 * multi-second dt on return; splitting it keeps the step within the range where the
 * scheme is well behaved, rather than letting one huge step fling the block.
 */
const MAX_SUB_STEP_S = 1 / 30;

/**
 * Advance one critically damped step toward `targetM`.
 *
 * With ω = 1/τ the equation of motion is ẍ = ω²(target − x) − 2ω·ẋ, whose ζ = 1 makes
 * the approach the fastest non-overshooting one available.
 *
 * @returns the new state; the input is not mutated.
 */
export function stepRelaxation(
  state: RelaxationState,
  targetM: number,
  dt: number,
  timeConstantS: number = ISOSTATIC_RELAXATION_TIME_CONSTANT_S,
): RelaxationState {
  if (dt <= 0 || timeConstantS <= 0) {
    return { elevationM: state.elevationM, velocityMPerS: state.velocityMPerS };
  }

  const omega = 1 / timeConstantS;
  const steps = Math.max(1, Math.ceil(dt / MAX_SUB_STEP_S));
  const h = dt / steps;

  let elevationM = state.elevationM;
  let velocityMPerS = state.velocityMPerS;

  for (let i = 0; i < steps; i++) {
    const acceleration = omega * omega * (targetM - elevationM) - 2 * omega * velocityMPerS;
    velocityMPerS += acceleration * h;
    elevationM += velocityMPerS * h;
  }

  return { elevationM, velocityMPerS };
}

/** A column already at rest at its target — the state Reset All restores. */
export function settledAt(targetM: number): RelaxationState {
  return { elevationM: targetM, velocityMPerS: 0 };
}
