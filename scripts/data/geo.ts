/**
 * scripts/data/geo.ts
 *
 * Geographic helpers shared by the data-generation scripts: polyline
 * simplification, point-in-polygon tests, great-circle math, and the
 * profile projection used to build cross-section data.
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

/**
 * A great-circle profile between two points, used to build cross-sections.
 * Projects any nearby point onto the profile, giving distance along the profile
 * and signed perpendicular offset.
 */
export class Profile {
  private readonly start: [number, number, number];
  private readonly normal: [number, number, number];
  /** Unit vector in the profile plane, perpendicular to `start` (the "along" direction). */
  private readonly along: [number, number, number];
  public readonly lengthKm: number;
  public readonly startLonLat: LonLat;
  public readonly endLonLat: LonLat;

  public constructor(startLonLat: LonLat, endLonLat: LonLat) {
    this.startLonLat = startLonLat;
    this.endLonLat = endLonLat;
    this.start = toUnitVector(startLonLat[0], startLonLat[1]);
    const end = toUnitVector(endLonLat[0], endLonLat[1]);
    const normal = cross(this.start, end);
    const normalLength = Math.hypot(...normal);
    if (normalLength === 0) {
      throw new Error("Profile endpoints must not be coincident or antipodal");
    }
    this.normal = [normal[0] / normalLength, normal[1] / normalLength, normal[2] / normalLength];
    this.along = cross(this.normal, this.start);
    this.lengthKm = greatCircleDistanceKm(startLonLat, endLonLat);
  }

  /** Point at `distanceKm` along the profile from its start. */
  public pointAt(distanceKm: number): LonLat {
    const angle = distanceKm / EARTH_RADIUS_KM;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return toLonLat([
      this.start[0] * c + this.along[0] * s,
      this.start[1] * c + this.along[1] * s,
      this.start[2] * c + this.along[2] * s,
    ]);
  }

  /**
   * Projects a geographic point onto the profile.
   *
   * @returns `distanceKm` measured from the profile start (may be negative or
   * beyond the end) and `offsetKm`, the signed perpendicular distance from the
   * profile's great circle.
   */
  public project(lon: number, lat: number): { distanceKm: number; offsetKm: number } {
    const v = toUnitVector(lon, lat);
    const offsetAngle = Math.asin(Math.max(-1, Math.min(1, dot(v, this.normal))));
    const distanceAngle = Math.atan2(dot(v, this.along), dot(v, this.start));
    return {
      distanceKm: distanceAngle * EARTH_RADIUS_KM,
      offsetKm: offsetAngle * EARTH_RADIUS_KM,
    };
  }
}
