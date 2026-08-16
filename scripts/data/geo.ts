/**
 * scripts/data/geo.ts
 *
 * Geographic helpers shared by the data-generation scripts: polyline
 * simplification, point-in-polygon tests and great-circle math.
 *
 * Angles are degrees, distances kilometres, unless a name says otherwise.
 */

/** Mean Earth radius (km). */
export const EARTH_RADIUS_KM = 6371.0;

export type LonLat = readonly [number, number];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ── Simplification ────────────────────────────────────────────────────────────

/** Perpendicular distance from `p` to the segment `a`–`b`, in degrees. */
function perpendicularDistance(p: LonLat, a: LonLat, b: LonLat): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ramer–Douglas–Peucker simplification in plain lon/lat space. `tolerance` is in
 * degrees; endpoints are always kept.
 */
export function simplify(points: readonly LonLat[], tolerance: number): LonLat[] {
  if (points.length <= 2) {
    return [...points];
  }

  const first = points[0] as LonLat;
  const last = points[points.length - 1] as LonLat;

  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i] as LonLat, first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= tolerance) {
    return [first, last];
  }

  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

// ── Polygons ──────────────────────────────────────────────────────────────────

/** Signed area of a ring in square degrees (positive = counter-clockwise). */
export function signedArea(ring: readonly LonLat[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as LonLat;
    const [xj, yj] = ring[j] as LonLat;
    area += xj * yi - xi * yj;
  }
  return area / 2;
}

/** Ray-casting point-in-ring test in plain lon/lat space. */
export function pointInRing(lon: number, lat: number, ring: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as LonLat;
    const [xj, yj] = ring[j] as LonLat;
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

/** Axis-aligned bounds of a ring: `[minLon, minLat, maxLon, maxLat]`. */
export function ringBounds(ring: readonly LonLat[]): [number, number, number, number] {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLon, minLat, maxLon, maxLat];
}

/** Area-weighted centroid of a ring, in degrees. */
export function ringCentroid(ring: readonly LonLat[]): LonLat {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as LonLat;
    const [xj, yj] = ring[j] as LonLat;
    const crossProduct = xj * yi - xi * yj;
    area += crossProduct;
    cx += (xi + xj) * crossProduct;
    cy += (yi + yj) * crossProduct;
  }
  if (area === 0) {
    return ring[0] as LonLat;
  }
  return [cx / (3 * area), cy / (3 * area)];
}

// ── Spherical math ────────────────────────────────────────────────────────────

/** Unit vector (ECEF, x through 0°E/0°N, z through the north pole). */
export function toUnitVector(lon: number, lat: number): [number, number, number] {
  const phi = lat * DEG_TO_RAD;
  const lambda = lon * DEG_TO_RAD;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
}

/** Inverse of {@link toUnitVector}. */
export function toLonLat(v: readonly [number, number, number]): LonLat {
  const [x, y, z] = v;
  const length = Math.hypot(x, y, z);
  return [Math.atan2(y, x) * RAD_TO_DEG, Math.asin(z / length) * RAD_TO_DEG];
}

export function cross(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Great-circle distance between two points, in km. */
export function greatCircleDistanceKm(a: LonLat, b: LonLat): number {
  const va = toUnitVector(a[0], a[1]);
  const vb = toUnitVector(b[0], b[1]);
  const angle = Math.atan2(Math.hypot(...cross(va, vb)), dot(va, vb));
  return angle * EARTH_RADIUS_KM;
}

/** Angular distance from `p` to the great circle through `a` and `b`, in degrees. */
function greatCircleDeviation(
  p: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const normal = cross(a, b);
  const length = Math.hypot(...normal);
  if (length === 0) {
    // Coincident endpoints: fall back to the distance from the point they share.
    return Math.atan2(Math.hypot(...cross(p, a)), dot(p, a)) * RAD_TO_DEG;
  }
  return Math.asin(Math.min(1, Math.abs(dot(p, normal)) / length)) * RAD_TO_DEG;
}

/**
 * Ramer–Douglas–Peucker simplification done on the sphere, with `tolerance` an
 * angular distance in degrees.
 *
 * {@link simplify} measures deviation in the lon/lat plane, which is the right answer
 * for data already cut to fit a rectangle. Reconstructed geometry is not: a plate at
 * 100 Ma sits wherever the rotation put it, so its outline crosses ±180° without a
 * seam and runs close to the poles, and both wreck a planar measurement — a segment
 * stepping from 179° to −179° reads as a 358° jump. Measuring the deviation as an
 * angle off the great circle through the endpoints has neither problem.
 */
export function simplifyGreatCircle(points: readonly LonLat[], tolerance: number): LonLat[] {
  if (points.length <= 2) {
    return [...points];
  }
  const vectors = points.map(([lon, lat]) => toUnitVector(lon, lat));

  // Iterative rather than recursive: a reconstructed ring can carry thousands of
  // vertices, and the recursive form overflows the stack on the pathological cases.
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const pending: [number, number][] = [[0, points.length - 1]];

  while (pending.length > 0) {
    const [first, last] = pending.pop() as [number, number];
    if (last <= first + 1) {
      continue;
    }
    const a = vectors[first] as [number, number, number];
    const b = vectors[last] as [number, number, number];

    let worst = 0;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const deviation = greatCircleDeviation(vectors[i] as [number, number, number], a, b);
      if (deviation > worst) {
        worst = deviation;
        worstIndex = i;
      }
    }
    if (worst > tolerance && worstIndex > 0) {
      keep[worstIndex] = 1;
      pending.push([first, worstIndex], [worstIndex, last]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}
