/**
 * PlateReconstruction.test.ts
 *
 * The plate kinematics the whole simulation rests on: rotating points about Euler
 * poles, and the surface velocities those poles imply.
 *
 * The velocity checks double as a sanity check on the *data*: the poles are derived
 * at build time by adding the NNR-NUVEL-1A Pacific rotation to PB2002's
 * Pacific-relative poles, and a sign error or a mixed-up latitude/longitude column
 * anywhere in that chain would show up here as a plate moving the wrong way.
 */

import { describe, expect, it } from "vitest";
import { PLATES } from "../src/common/data/generated/plateData.js";
import { PlateReconstruction } from "../src/common/PlateReconstruction.js";

/** Index of a plate by its PB2002 code. */
function plateIndex(code: string): number {
  const index = PLATES.findIndex((plate) => plate.code === code);
  expect(index, `plate ${code} is missing from the dataset`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("PlateReconstruction", () => {
  it("is the identity at the present day", () => {
    const reconstruction = new PlateReconstruction();
    expect(reconstruction.isPresentDay).toBe(true);

    reconstruction.transform(-71.5, -21.5, plateIndex("NZ"));
    expect(reconstruction.lon).toBe(-71.5);
    expect(reconstruction.lat).toBe(-21.5);
  });

  it("moves a point on a fast plate by roughly its speed × elapsed time", () => {
    const nazca = plateIndex("NZ");
    const reconstruction = new PlateReconstruction();
    const { speedMmPerYear } = PlateReconstruction.velocityAt(nazca, -85, -20);

    reconstruction.setTime(10);
    reconstruction.transform(-85, -20, nazca);

    // mm/year is km per million year, so 10 Myr of motion is 10 × the speed in km.
    const expectedKm = speedMmPerYear * 10;
    const movedKm =
      Math.hypot((reconstruction.lon - -85) * Math.cos((-20 * Math.PI) / 180), reconstruction.lat - -20) * 111.19;
    expect(movedKm).toBeGreaterThan(expectedKm * 0.9);
    expect(movedKm).toBeLessThan(expectedKm * 1.1);
  });

  it("returns a point to where it started when time is wound back", () => {
    const pacific = plateIndex("PA");
    const reconstruction = new PlateReconstruction();

    reconstruction.setTime(30);
    reconstruction.transform(-155.5, 19.6, pacific);
    const movedLon = reconstruction.lon;
    const movedLat = reconstruction.lat;

    reconstruction.setTime(-30);
    reconstruction.transform(movedLon, movedLat, pacific);
    expect(reconstruction.lon).toBeCloseTo(-155.5, 6);
    expect(reconstruction.lat).toBeCloseTo(19.6, 6);
  });

  it("leaves a point on the rotation axis where it is", () => {
    const pacific = plateIndex("PA");
    const plate = PLATES[pacific] as (typeof PLATES)[number];
    const reconstruction = new PlateReconstruction();

    reconstruction.setTime(40);
    reconstruction.transform(plate.poleLon, plate.poleLat, pacific);
    expect(reconstruction.lon).toBeCloseTo(plate.poleLon, 6);
    expect(reconstruction.lat).toBeCloseTo(plate.poleLat, 6);
  });

  it("gives a speed of zero at the Euler pole itself", () => {
    const plate = PLATES[plateIndex("AU")] as (typeof PLATES)[number];
    const velocity = PlateReconstruction.velocityAt(plateIndex("AU"), plate.poleLon, plate.poleLat);
    expect(velocity.speedMmPerYear).toBeCloseTo(0, 6);
  });

  describe("absolute plate velocities", () => {
    // Speeds and directions every introductory text quotes, with generous bounds:
    // the model is NUVEL-1A-based, so it differs from GPS-era models by a few mm/yr.
    const cases: {
      code: string;
      where: string;
      lon: number;
      lat: number;
      speed: [number, number];
      azimuth: [number, number];
    }[] = [
      { code: "PA", where: "Hawaii", lon: -155.5, lat: 19.6, speed: [55, 85], azimuth: [280, 320] },
      { code: "NZ", where: "off Peru", lon: -80, lat: -20, speed: [60, 90], azimuth: [55, 100] },
      { code: "AU", where: "central Australia", lon: 134, lat: -24, speed: [55, 80], azimuth: [10, 50] },
      { code: "IN", where: "India", lon: 78, lat: 20, speed: [40, 70], azimuth: [20, 60] },
      { code: "NA", where: "Kansas", lon: -98, lat: 39, speed: [8, 25], azimuth: [230, 275] },
      { code: "AN", where: "Antarctica", lon: 0, lat: -80, speed: [0, 25], azimuth: [0, 360] },
    ];

    for (const testCase of cases) {
      it(`${testCase.code} at ${testCase.where}`, () => {
        const velocity = PlateReconstruction.velocityAt(plateIndex(testCase.code), testCase.lon, testCase.lat);
        expect(velocity.speedMmPerYear).toBeGreaterThanOrEqual(testCase.speed[0]);
        expect(velocity.speedMmPerYear).toBeLessThanOrEqual(testCase.speed[1]);
        expect(velocity.azimuthDeg).toBeGreaterThanOrEqual(testCase.azimuth[0]);
        expect(velocity.azimuthDeg).toBeLessThanOrEqual(testCase.azimuth[1]);
      });
    }

    it("has Nazca converging on South America at the rate the Andes are built at", () => {
      const nazca = PlateReconstruction.velocityAt(plateIndex("NZ"), -73, -21.5);
      const southAmerica = PlateReconstruction.velocityAt(plateIndex("SA"), -70, -21.5);

      const toEastNorth = (velocity: { speedMmPerYear: number; azimuthDeg: number }): [number, number] => [
        velocity.speedMmPerYear * Math.sin((velocity.azimuthDeg * Math.PI) / 180),
        velocity.speedMmPerYear * Math.cos((velocity.azimuthDeg * Math.PI) / 180),
      ];
      const [nazcaEast, nazcaNorth] = toEastNorth(nazca);
      const [southAmericaEast, southAmericaNorth] = toEastNorth(southAmerica);
      const convergence = Math.hypot(nazcaEast - southAmericaEast, nazcaNorth - southAmericaNorth);

      // PB2002 puts this boundary at 65–80 mm/yr; GPS models give a little less.
      expect(convergence).toBeGreaterThan(60);
      expect(convergence).toBeLessThan(95);
      // And Nazca has to be going east relative to South America, or it would not subduct.
      expect(nazcaEast - southAmericaEast).toBeGreaterThan(0);
    });
  });
});
