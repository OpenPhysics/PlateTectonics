/**
 * MapProjection.test.ts
 *
 * The equirectangular projection that keeps every overlay in register with the
 * relief raster, and the camera that pans and zooms it.
 */

import { Bounds2 } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import { MapProjection } from "../src/common/MapProjection.js";
import { MAP_MAX_ZOOM_LEVEL, MAP_VIEW_BOUNDS } from "../src/PlateTectonicsConstants.js";

const bounds = new Bounds2(10, 20, 730, 380);
const projection = new MapProjection(bounds);

/** A projection of its own, so a test that moves the camera cannot disturb another. */
function freshProjection(): MapProjection {
  return new MapProjection(bounds);
}

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

  it("shows the whole world at level 0, so every point projects on screen", () => {
    for (const [lon, lat] of [
      [0, 0],
      [-180, -90],
      [180, 90],
      [139.7, 35.7],
    ] as const) {
      expect(projection.project(lon, lat)).toBe(true);
      expect(projection.y).toBeCloseTo(projection.viewY(lat), 9);
    }
  });

  it("draws a motion arrow along its compass bearing, wherever the plate is", () => {
    // North is up and east is right at every latitude — the map does not swing the
    // arrow to follow the way longitude is stretched near the poles.
    for (const lat of [0, 60, -60]) {
      projection.bearing(0, lat, 0);
      expect(projection.bearingX).toBeCloseTo(0, 9);
      expect(projection.bearingY).toBeCloseTo(-1, 9);

      projection.bearing(0, lat, 90);
      expect(projection.bearingX).toBeCloseTo(1, 9);
      expect(projection.bearingY).toBeCloseTo(0, 9);
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

describe("MapProjection camera", () => {
  it("opens on the whole world, centred on the equator and the prime meridian", () => {
    const map = freshProjection();
    expect(map.zoomLevelProperty.value).toBe(0);
    expect(map.centerLongitudeProperty.value).toBe(0);
    expect(map.centerLatitudeProperty.value).toBe(0);
    expect(map.isWholeWorld).toBe(true);
    expect(map.worldWidth).toBeCloseTo(bounds.width, 9);
  });

  it("puts the camera's longitude at the centre of the viewport", () => {
    const map = freshProjection();
    map.panBy(90, 0);
    expect(map.centerLongitudeProperty.value).toBeCloseTo(90, 9);
    expect(map.viewX(90)).toBeCloseTo(bounds.centerX, 9);
  });

  it("wraps eastward panning instead of stopping at the antimeridian", () => {
    const map = freshProjection();
    map.panBy(200, 0);
    expect(map.centerLongitudeProperty.value).toBeCloseTo(-160, 9);
    map.panBy(-40, 0);
    expect(map.centerLongitudeProperty.value).toBeCloseTo(160, 9);
  });

  it("places a point on the copy of the world the camera is looking at", () => {
    // Centred on the Pacific, Fiji (178°E) and Samoa (172°W) are neighbours, so they
    // must land near each other rather than at opposite edges of the viewport.
    const map = freshProjection();
    map.panBy(175, 0);

    map.project(178, -18);
    const fijiX = map.x;
    map.project(-172, -14);
    const samoaX = map.x;

    expect(Math.abs(samoaX - fijiX)).toBeLessThan(map.pixelsPerDegree * 20);
    expect(map.project(178, -18)).toBe(true);
  });

  it("reports a point outside the viewport as not on screen", () => {
    const map = freshProjection();
    map.zoomLevelProperty.value = 2;
    expect(map.project(0, 0)).toBe(true);
    // A quarter turn away at 4×, which is four viewport widths off to the side.
    expect(map.project(90, 0)).toBe(false);
  });

  it("cannot be panned off the equator until it is zoomed in", () => {
    const map = freshProjection();
    expect(map.latitudeLimit).toBe(0);
    map.panBy(0, 40);
    expect(map.centerLatitudeProperty.value).toBe(0);

    map.zoomLevelProperty.value = 1;
    expect(map.latitudeLimit).toBeCloseTo(45, 9);
    map.panBy(0, 40);
    expect(map.centerLatitudeProperty.value).toBeCloseTo(40, 9);
    map.panBy(0, 40);
    expect(map.centerLatitudeProperty.value).toBeCloseTo(45, 9);
  });

  it("keeps the map covering the viewport when it is zoomed back out", () => {
    const map = freshProjection();
    map.zoomLevelProperty.value = MAP_MAX_ZOOM_LEVEL;
    map.panBy(0, 90);
    expect(map.centerLatitudeProperty.value).toBeCloseTo(map.latitudeLimit, 9);

    map.zoomLevelProperty.value = 0;
    expect(map.centerLatitudeProperty.value).toBe(0);
    expect(map.viewY(90)).toBeCloseTo(bounds.minY, 9);
    expect(map.viewY(-90)).toBeCloseTo(bounds.maxY, 9);
  });

  it("scales by a factor of two per zoom level", () => {
    const map = freshProjection();
    const wholeWorld = map.pixelsPerDegree;
    map.zoomLevelProperty.value = 3;
    expect(map.pixelsPerDegree).toBeCloseTo(wholeWorld * 8, 9);
    expect(map.worldWidth).toBeCloseTo(bounds.width * 8, 9);
    expect(map.degreesPerPixel).toBeCloseTo(1 / map.pixelsPerDegree, 9);
  });

  it("round-trips longitude and latitude at every zoom level", () => {
    const map = freshProjection();
    for (let level = 0; level <= MAP_MAX_ZOOM_LEVEL; level++) {
      map.zoomLevelProperty.value = level;
      map.panBy(37, 12);
      for (const [lon, lat] of [
        [0, 0],
        [-155.5, 19.6],
        [139.7, 35.7],
      ] as const) {
        expect(map.longitudeAt(map.viewX(lon))).toBeCloseTo(lon, 9);
        expect(map.latitudeAt(map.viewY(lat))).toBeCloseTo(lat, 9);
      }
    }
  });

  it("resets to the whole world", () => {
    const map = freshProjection();
    map.zoomLevelProperty.value = 2;
    map.panBy(120, 30);

    map.reset();
    expect(map.zoomLevelProperty.value).toBe(0);
    expect(map.centerLongitudeProperty.value).toBe(0);
    expect(map.centerLatitudeProperty.value).toBe(0);
  });
});
