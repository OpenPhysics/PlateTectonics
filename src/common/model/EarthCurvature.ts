/**
 * EarthCurvature.ts
 *
 * Turns a "planar" point on a slab of Earth into a point in real 3-D space, by bending
 * the slab around the centre of the planet.
 *
 * The schematic screens describe a block of crust in flat coordinates: x across the
 * block, z into it, both measured as distance *along the surface*, and y as elevation
 * above sea level. That is a convenient frame to compute isostasy and plate motion in,
 * but it is not the shape of the Earth: a block 1400 km across drops ~38 km below the
 * chord joining its ends, which is more than the thickness of the crust drawn on it. So
 * a block drawn flat and a block drawn curved are visibly different pictures, and only
 * the second one is honest about the fact that the surface is a sphere.
 *
 * This is a direct port of `PlateTectonicsModel.convertToRadial` and its helpers from
 * PhET's Java version, kept faithful so the 3-D block matches the original. The mapping
 * is spherical coordinates in disguise: x and z are arc lengths, which divided by the
 * Earth's radius give the two angles, and y + R is the radius. The origin — x = 0,
 * y = 0, z = 0 — maps to itself, so sea level at the centre of the front face is the
 * fixed point everything else curves away from.
 *
 * Pure and unit-tested in tests/EarthCurvature.test.ts. All lengths in metres.
 */

import { Vector3 } from "scenerystack/dot";
import { EARTH_RADIUS_KM } from "../../PlateTectonicsConstants.js";

/** Mean radius of the Earth, m — the radius the slab is bent around. */
export const EARTH_RADIUS_M = EARTH_RADIUS_KM * 1000;

/**
 * Centre of the Earth in the same frame, m.
 *
 * Directly below the origin by one Earth radius, which is what makes the origin the
 * fixed point of the mapping: a point at sea level under the middle of the front face
 * is exactly R from the centre and stays where it is.
 */
export const EARTH_CENTER = new Vector3(0, -EARTH_RADIUS_M, 0);

/**
 * The x half of the radial direction, for a distance x along the surface.
 *
 * Returned as a vector to be multiplied component-wise with {@link zRadialVector},
 * rather than as an angle, because a whole grid row shares one x and a whole column
 * shares one z: computing the two families of vectors once each turns O(rows × cols)
 * trigonometry into O(rows + cols). The third component is 1 so that it leaves z alone.
 */
export function xRadialVector(xM: number): Vector3 {
  const theta = Math.PI / 2 - xM / EARTH_RADIUS_M;
  return new Vector3(Math.cos(theta), Math.sin(theta), 1);
}

/** The z half of the same decomposition, for a distance z along the surface. */
export function zRadialVector(zM: number): Vector3 {
  const phi = Math.PI / 2 - zM / EARTH_RADIUS_M;
  const sinPhi = Math.sin(phi);
  return new Vector3(sinPhi, sinPhi, Math.cos(phi));
}

/**
 * Combines the two direction halves with an elevation into a point in space.
 *
 * Separate from {@link toRadial} so a caller walking a grid can hoist the two
 * trigonometric calls out of its inner loop; the terrain heightfield does exactly that.
 */
export function radialFromDirections(xRadial: Vector3, zRadial: Vector3, elevationM: number): Vector3 {
  const radius = elevationM + EARTH_RADIUS_M;
  return new Vector3(
    xRadial.x * zRadial.x * radius + EARTH_CENTER.x,
    xRadial.y * zRadial.y * radius + EARTH_CENTER.y,
    xRadial.z * zRadial.z * radius + EARTH_CENTER.z,
  );
}

/**
 * A planar point — x and z along the surface, y above sea level — as a point in space.
 */
export function toRadial(xM: number, elevationM: number, zM: number): Vector3 {
  return radialFromDirections(xRadialVector(xM), zRadialVector(zM), elevationM);
}

/**
 * The inverse: a point in space back to arc lengths and an elevation.
 *
 * Needed by the tools, which are dragged in screen space and have to report where they
 * are in the flat frame the models compute in.
 */
export function toPlanar(point: Vector3): Vector3 {
  const fromCentre = point.minus(EARTH_CENTER);
  const radius = fromCentre.magnitude;
  if (radius === 0) {
    return new Vector3(0, -EARTH_RADIUS_M, 0);
  }
  const phi = Math.acos(Math.max(-1, Math.min(1, fromCentre.z / radius)));
  const theta = Math.atan2(fromCentre.y, fromCentre.x);

  // atan2 puts the branch cut behind the observer at ±π, and the slab straddles it —
  // the front face sits at θ = π/2, so a point one degree to either side of centre
  // would otherwise come back a whole turn apart. Unwrapping onto (−π, π] about the
  // slab's own centre keeps x continuous across the middle of the block.
  let mappedTheta = Math.PI / 2 - theta;
  if (mappedTheta > Math.PI) {
    mappedTheta -= 2 * Math.PI;
  }

  return new Vector3(mappedTheta * EARTH_RADIUS_M, radius - EARTH_RADIUS_M, (Math.PI / 2 - phi) * EARTH_RADIUS_M);
}

/**
 * How far below the flat plane through the origin the curved surface has dropped, m.
 *
 * Not used by the renderer — the full mapping covers that — but it is the quantity that
 * says whether curvature is worth drawing at a given block size, and the tests assert
 * against it.
 */
export function curvatureDropM(xM: number, zM: number): number {
  return -toRadial(xM, 0, zM).y;
}
