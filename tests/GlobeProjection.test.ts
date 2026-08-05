/**
 * GlobeProjection.test.ts
 *
 * The orthographic projection behind the 3-D globe: where a place lands on the disc,
 * which half of the world is visible, which way is north on screen, and how the
 * camera responds to a drag.
 */

import { Bounds2 } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import { GlobeProjection, wrapLongitude } from "../src/common/GlobeProjection.js";
import { GLOBE_INITIAL_CENTER_LAT, GLOBE_INITIAL_CENTER_LON } from "../src/PlateTectonicsConstants.js";

const bounds = new Bounds2(10, 20, 738, 384);

/** A projection looking straight at the intersection of the equator and Greenwich. */
function equatorialProjection(): GlobeProjection {
  const projection = new GlobeProjection(bounds);
  projection.centerLongitudeProperty.value = 0;
  projection.centerLatitudeProperty.value = 0;
  return projection;
}

describe("GlobeProjection", () => {
  it("fits the disc inside the viewport", () => {
    const projection = new GlobeProjection(bounds);
    expect(projection.radius).toBeGreaterThan(0);
    expect(projection.radius * 2).toBeLessThanOrEqual(Math.min(bounds.width, bounds.height));
    expect(projection.centerX).toBeCloseTo(bounds.centerX, 9);
    expect(projection.centerY).toBeCloseTo(bounds.centerY, 9);
  });

  it("puts the point the camera looks at in the middle of the disc", () => {
    const projection = equatorialProjection();
    expect(projection.project(0, 0)).toBe(true);
    expect(projection.x).toBeCloseTo(projection.centerX, 9);
    expect(projection.y).toBeCloseTo(projection.centerY, 9);
    expect(projection.depth).toBeCloseTo(1, 9);
  });

  it("puts north up, east right, and the quarter-turn points on the limb", () => {
    const projection = equatorialProjection();

    projection.project(0, 90);
    expect(projection.y).toBeCloseTo(projection.centerY - projection.radius, 9);
    expect(projection.x).toBeCloseTo(projection.centerX, 9);

    projection.project(90, 0);
    expect(projection.x).toBeCloseTo(projection.centerX + projection.radius, 9);
    expect(projection.y).toBeCloseTo(projection.centerY, 9);

    // A point exactly 90° away sits on the limb: still drawn, but only just.
    expect(projection.depth).toBeCloseTo(0, 9);
  });

  it("hides the hemisphere facing away from the camera", () => {
    const projection = equatorialProjection();
    expect(projection.project(0, 0)).toBe(true);
    expect(projection.project(89, 0)).toBe(true);
    expect(projection.project(91, 0)).toBe(false);
    expect(projection.project(180, 0)).toBe(false);
    expect(projection.project(-135, 40)).toBe(false);

    // Turning the globe brings the far side round to the front.
    projection.centerLongitudeProperty.value = 180;
    expect(projection.project(180, 0)).toBe(true);
    expect(projection.project(0, 0)).toBe(false);
  });

  it("round-trips a visible point through project and unproject", () => {
    const projection = new GlobeProjection(bounds);
    projection.centerLongitudeProperty.value = -30;
    projection.centerLatitudeProperty.value = 20;

    for (const [lon, lat] of [
      [-30, 20],
      [0, 0],
      [-70.7, -33.4],
      [-9.1, 38.7],
      [30, 60],
    ] as const) {
      expect(projection.project(lon, lat)).toBe(true);
      expect(projection.unproject(projection.x, projection.y)).toBe(true);
      expect(projection.lon).toBeCloseTo(lon, 6);
      expect(projection.lat).toBeCloseTo(lat, 6);
    }
  });

  it("reports no Earth outside the disc", () => {
    const projection = equatorialProjection();
    expect(projection.unproject(projection.centerX, projection.centerY)).toBe(true);
    expect(projection.unproject(projection.centerX + projection.radius * 1.01, projection.centerY)).toBe(false);
    expect(projection.containsViewPoint(projection.centerX, projection.centerY)).toBe(true);
    expect(projection.containsViewPoint(projection.centerX, projection.centerY - projection.radius * 1.01)).toBe(false);
  });

  it("points a compass bearing the right way on screen", () => {
    const projection = equatorialProjection();

    // At the centre of the disc the projection is undistorted, so north is up and
    // east is right, exactly as on the flat map.
    projection.bearing(0, 0, 0);
    expect(projection.bearingX).toBeCloseTo(0, 6);
    expect(projection.bearingY).toBeCloseTo(-1, 6);

    projection.bearing(0, 0, 90);
    expect(projection.bearingX).toBeCloseTo(1, 6);
    expect(projection.bearingY).toBeCloseTo(0, 6);

    // Away from the centre the meridians fan out: at 45° N on the central meridian,
    // due east still points right, but north tips towards the top of the disc while
    // staying above the horizontal.
    projection.bearing(0, 45, 0);
    expect(projection.bearingY).toBeLessThan(0);
    expect(projection.bearingX).toBeCloseTo(0, 6);
  });

  it("turns the globe by whole degrees of arc per pixel of drag", () => {
    const projection = equatorialProjection();
    // A drag across the full diameter turns the globe by two radians' worth of arc.
    const degrees = projection.degreesPerPixel * projection.radius;
    expect(degrees).toBeCloseTo(180 / Math.PI, 9);
  });

  it("wraps longitude and stops latitude at the poles", () => {
    const projection = equatorialProjection();

    projection.rotateBy(200, 0);
    expect(projection.centerLongitudeProperty.value).toBeCloseTo(-160, 9);
    projection.rotateBy(-200, 0);
    expect(projection.centerLongitudeProperty.value).toBeCloseTo(0, 9);

    projection.rotateBy(0, 200);
    expect(projection.centerLatitudeProperty.value).toBe(90);
    projection.rotateBy(0, -400);
    expect(projection.centerLatitudeProperty.value).toBe(-90);
  });

  it("returns to the opening view on reset", () => {
    const projection = new GlobeProjection(bounds);
    projection.rotateBy(75, -40);
    projection.reset();
    expect(projection.centerLongitudeProperty.value).toBe(GLOBE_INITIAL_CENTER_LON);
    expect(projection.centerLatitudeProperty.value).toBe(GLOBE_INITIAL_CENTER_LAT);
  });
});

describe("wrapLongitude", () => {
  it("brings any longitude into [-180, 180)", () => {
    expect(wrapLongitude(0)).toBe(0);
    expect(wrapLongitude(179)).toBe(179);
    expect(wrapLongitude(180)).toBe(-180);
    expect(wrapLongitude(181)).toBe(-179);
    expect(wrapLongitude(-181)).toBe(179);
    expect(wrapLongitude(540)).toBe(-180);
    expect(wrapLongitude(-720)).toBe(0);
  });
});
