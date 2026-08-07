/**
 * BoundaryRules.ts
 *
 * Which pairs of plates can do which kind of motion, what happens when they do, and how
 * long it takes to finish happening.
 *
 * This is the sim's answer to the question a student should be asking: *why* does one
 * plate go under and not the other? The rule is density, and density here is a
 * consequence of what the plate is and how old it is. Continental crust never subducts,
 * because it is too light to be pushed into the mantle — that single fact is why
 * continents are billions of years old and ocean floor is nowhere older than 180 Ma.
 * Between two ocean plates, the older one is the colder and denser one, so it goes down.
 *
 * Some combinations are refused rather than approximated. Two identical ocean plates
 * converging have no reason to pick a winner, and a divergent boundary between a
 * continent and an ocean floor is not a thing that happens — it would be a rift, which
 * is a different picture. Offering them and then drawing something arbitrary would be
 * worse than not offering them.
 *
 * Transform motion is absent by design: it is displacement into the page, which a
 * cross-section cannot show. See doc/model.md.
 *
 * Pure and unit-tested in tests/BoundaryRules.test.ts.
 */

import {
  COLLISION_TIME_LIMIT_MYR,
  RIFTING_TIME_LIMIT_MYR,
  SUBDUCTION_TIME_LIMIT_MYR,
} from "../../PlateTectonicsConstants.js";
import { type PlateType, plateProperties } from "./PlateType.js";

/** What the two plates are doing relative to each other. */
export type MotionType = "convergent" | "divergent";

/** The motions, in the order they appear in the radio-button group. */
export const MOTION_TYPES: readonly MotionType[] = ["convergent", "divergent"];

/** What actually happens at the boundary — the shape the geometry will take. */
export type BoundaryBehavior = "subduction" | "collision" | "rifting";

/** Which side of the boundary a plate is on. */
export type Side = "left" | "right";

/**
 * Whether a motion is possible for a pair of plates.
 *
 * Convergence is refused only between two identical *ocean* plates: there is no density
 * contrast to decide which one goes down, and picking arbitrarily would imply the choice
 * was physical when it was not. Two continents converging is very much allowed — neither
 * subducts, they crumple instead, and that is the whole point of the collision case.
 *
 * Divergence needs the two sides to be the same kind of crust, because a spreading
 * centre makes new crust of one kind and it has to match what is either side of it.
 */
export function isLegal(motion: MotionType, left: PlateType, right: PlateType): boolean {
  if (motion === "divergent") {
    return plateProperties(left).isOceanic === plateProperties(right).isOceanic;
  }
  const bothOceanic = plateProperties(left).isOceanic && plateProperties(right).isOceanic;
  return !(bothOceanic && left === right);
}

/** Every motion this pair of plates can do. */
export function legalMotions(left: PlateType, right: PlateType): readonly MotionType[] {
  return MOTION_TYPES.filter((motion) => isLegal(motion, left, right));
}

/**
 * What happens at a legal boundary.
 *
 * Two continents converging cannot subduct either side, so they crumple: that is a
 * collision, and it is how the Himalayas exist. Anything else convergent has one plate
 * dense enough to go down.
 */
export function behaviorFor(motion: MotionType, left: PlateType, right: PlateType): BoundaryBehavior | null {
  if (!isLegal(motion, left, right)) {
    return null;
  }
  if (motion === "divergent") {
    return "rifting";
  }
  const bothContinental = !(plateProperties(left).isOceanic || plateProperties(right).isOceanic);
  return bothContinental ? "collision" : "subduction";
}

/**
 * Which side goes down, or null when neither does.
 *
 * Purely the denser one. With the plate densities as defined that resolves to
 * "continental always wins" and "older ocean floor loses", which are the two rules
 * worth taking away from the screen.
 */
export function subductingSide(motion: MotionType, left: PlateType, right: PlateType): Side | null {
  if (behaviorFor(motion, left, right) !== "subduction") {
    return null;
  }
  return plateProperties(left).densityKgM3 > plateProperties(right).densityKgM3 ? "left" : "right";
}

/**
 * How long the boundary runs before it stops, Myr.
 *
 * Each is the point at which the process has finished saying what it has to say: a
 * collision has built its mountains, a rift has opened an ocean, a slab has reached the
 * depth where it melts and fed an arc.
 */
export function timeLimitMyr(motion: MotionType, left: PlateType, right: PlateType): number {
  const behavior = behaviorFor(motion, left, right);
  if (behavior === "collision") {
    return COLLISION_TIME_LIMIT_MYR;
  }
  return behavior === "rifting" ? RIFTING_TIME_LIMIT_MYR : SUBDUCTION_TIME_LIMIT_MYR;
}
