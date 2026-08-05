/**
 * MapProjection.test.ts
 *
 * The equirectangular projection that keeps every overlay in register with the
 * relief raster.
 */

import { Bounds2 } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import { MapProjection } from "../src/common/MapProjection.js";
import { MAP_VIEW_BOUNDS } from "../src/PlateTectonicsConstants.js";

const bounds = new Bounds2(10, 20, 730, 380);
const projection = new MapProjection(bounds);

describe("MapProjection", () => {
  it("maps the corners of the world to the corners of the viewport", () => {
    expect(projection.viewX(-180)).toBeCloseTo(bounds.minX, 9);
    expect(projection.viewX(180)).toBeCloseTo(bounds.maxX, 9);
    expect(projection.viewY(90)).toBeCloseTo(bounds.minY, 9);
    expect(projection.viewY(-90)).toBeCloseTo(bounds.maxY, 9);
  });

  it("puts the origin at the centre and north at the top", () => {
    expect(projection.viewX(0)).toBeCloseTo(bounds.centerX, 9);
    expect(projection.viewY(0)).toBeCloseTo(bounds.centerY, 9);
    expect(projection.viewY(45)).toBeLessThan(projection.viewY(-45));
  });

  it("round-trips longitude and latitude", () => {
    for (const [lon, lat] of [
      [0, 0],
      [-155.5, 19.6],
      [139.7, 35.7],
      [-70.7, -33.4],
    ] as const) {
      expect(projection.longitudeAt(projection.viewX(lon))).toBeCloseTo(lon, 9);
      expect(projection.latitudeAt(projection.viewY(lat))).toBeCloseTo(lat, 9);
    }
  });

  it("uses the same pixels per degree on both axes in the sim's viewport", () => {
    // A 2:1 viewport is what keeps the equirectangular map from being stretched.
    const simProjection = new MapProjection(MAP_VIEW_BOUNDS);
    const perDegreeX = MAP_VIEW_BOUNDS.width / 360;
    const perDegreeY = MAP_VIEW_BOUNDS.height / 180;
    expect(perDegreeX).toBeCloseTo(perDegreeY, 9);
    expect(simProjection.pixelsPerDegree).toBeCloseTo(perDegreeX, 9);
  });
});
