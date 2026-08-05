/**
 * geophysicalData.test.ts
 *
 * Integrity checks on the generated datasets. `npm run build-data` reaches out to
 * five public services and reshapes what they return; these tests are what stands
 * between a silently mangled regeneration and a sim that draws nonsense.
 *
 * They also encode a few facts about the Earth — the Ring of Fire really is where
 * the deep earthquakes are — so a wrong sign or a swapped latitude/longitude column
 * fails loudly rather than looking merely odd.
 */

import { describe, expect, it } from "vitest";
import type { BoundaryType } from "../src/common/data/dataTypes.js";
import { BOUNDARY_SEGMENTS } from "../src/common/data/generated/boundaryData.js";
import { CROSS_SECTIONS } from "../src/common/data/generated/crossSectionData.js";
import { EARTHQUAKES } from "../src/common/data/generated/earthquakeData.js";
import { LAND_RINGS } from "../src/common/data/generated/landData.js";
import { PLATES } from "../src/common/data/generated/plateData.js";
import { VOLCANOES } from "../src/common/data/generated/volcanoData.js";
import { HOTSPOTS } from "../src/common/data/hotspots.js";
import { MOTION_FRAMES, PlateReconstruction } from "../src/common/PlateReconstruction.js";
import { MAX_EARTHQUAKE_DEPTH_KM } from "../src/PlateTectonicsConstants.js";

const BOUNDARY_TYPES: readonly BoundaryType[] = ["divergent", "convergent", "transform"];

/** Every coordinate in a flat `[lon, lat, …]` array is on the globe. */
function expectValidCoordinates(coords: readonly number[]): void {
  expect(coords.length % 2).toBe(0);
  for (let i = 0; i < coords.length; i += 2) {
    expect(Math.abs(coords[i] as number)).toBeLessThanOrEqual(180);
    expect(Math.abs(coords[i + 1] as number)).toBeLessThanOrEqual(90);
  }
}

describe("plates", () => {
  it("covers the major plates with sane Euler poles", () => {
    expect(PLATES.length).toBeGreaterThan(40);
    for (const code of ["PA", "NA", "SA", "EU", "AF", "AN", "AU", "IN", "NZ", "AR"]) {
      expect(
        PLATES.some((plate) => plate.code === code),
        `missing plate ${code}`,
      ).toBe(true);
    }
    for (const plate of PLATES) {
      expect(Math.abs(plate.poleLat)).toBeLessThanOrEqual(90);
      expect(Math.abs(plate.poleLon)).toBeLessThanOrEqual(180);
      // No plate in the model turns faster than a few degrees per million years.
      expect(plate.poleRateDegPerMyr).toBeGreaterThanOrEqual(0);
      expect(plate.poleRateDegPerMyr).toBeLessThan(60);
      expect(plate.rings.length).toBeGreaterThan(0);
      expect(plate.ringFrames.length).toBe(plate.rings.length);
      plate.rings.forEach((ring, index) => {
        expectValidCoordinates(ring);
        // Rings repeat their first vertex at the end; the renderer relies on it.
        expect(ring[0]).toBe(ring[ring.length - 2]);
        expect(ring[1]).toBe(ring[ring.length - 1]);

        // One motion frame per vertex, and the repeated vertex repeats its frame too,
        // or the ring would not close once the clock runs.
        const frames = plate.ringFrames[index] as readonly number[];
        expect(frames.length).toBe(ring.length / 2);
        expect(frames[0]).toBe(frames[frames.length - 1]);
        for (const frame of frames) {
          expect(frame).toBeGreaterThanOrEqual(0);
          expect(frame).toBeLessThan(MOTION_FRAMES.length);
        }
      });
    }
  });

  it("pins nearly every outline vertex to a boundary rather than to its own plate", () => {
    let onOwnPlate = 0;
    let total = 0;
    PLATES.forEach((plate, plateIndex) => {
      for (const frames of plate.ringFrames) {
        for (const frame of frames) {
          total++;
          if (frame === plateIndex) {
            onOwnPlate++;
          }
        }
      }
    });
    // A vertex keeps its own plate's motion only where there is no boundary beneath
    // it — the seam a polygon is cut along at the antimeridian — or where the plate
    // genuinely is the overriding side of a trench.
    expect(total).toBeGreaterThan(1000);
    expect(onOwnPlate / total).toBeLessThan(0.15);
  });

  it("labels the plates a student is expected to name", () => {
    const majors = PLATES.filter((plate) => plate.major).map((plate) => plate.code);
    for (const code of ["PA", "NA", "SA", "EU", "AF", "AN", "AU", "NZ"]) {
      expect(majors, `plate ${code} should be labelled`).toContain(code);
    }
  });
});

describe("coastlines", () => {
  it("assigns every vertex to a plate that exists", () => {
    expect(LAND_RINGS.length).toBeGreaterThan(20);
    for (const ring of LAND_RINGS) {
      expectValidCoordinates(ring.coords);
      expect(ring.plateIndices.length).toBe(ring.coords.length / 2);
      for (const index of ring.plateIndices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(PLATES.length);
      }
    }
  });
});

describe("plate boundaries", () => {
  it("classifies every segment and gives it a plausible relative velocity", () => {
    expect(BOUNDARY_SEGMENTS.length).toBeGreaterThan(500);
    for (const segment of BOUNDARY_SEGMENTS) {
      expect(BOUNDARY_TYPES).toContain(segment.type);
      expect(segment.coords.length).toBeGreaterThanOrEqual(4);
      expectValidCoordinates(segment.coords);
      expect(segment.frameIndex).toBeGreaterThanOrEqual(0);
      expect(segment.frameIndex).toBeLessThan(MOTION_FRAMES.length);
      // The fastest boundary in the model is the Pacific–Tonga pair at about
      // 26 cm/year — the Tonga microplate is the fastest-moving plate on Earth.
      expect(segment.velocityMmPerYear).toBeGreaterThanOrEqual(0);
      expect(segment.velocityMmPerYear).toBeLessThan(300);
    }
  });

  it("has all three kinds of boundary", () => {
    for (const type of BOUNDARY_TYPES) {
      expect(BOUNDARY_SEGMENTS.filter((segment) => segment.type === type).length).toBeGreaterThan(20);
    }
  });

  /**
   * An independent check on the Euler poles, using data the poles were not derived
   * from. PB2002 publishes a relative velocity across every boundary step; the same
   * number can be recomputed from the two plates' absolute poles as |ω₁ × r − ω₂ × r|.
   * The two agree only if the whole chain — Bird's Pacific-relative poles, the
   * NNR-NUVEL-1A Pacific rotation, and the vector addition of the two — is right.
   */
  it("reproduces PB2002's own relative velocity at each boundary", () => {
    const errors: number[] = [];

    for (const segment of BOUNDARY_SEGMENTS) {
      const codes = segment.plates.split(/[\\/-]/);
      const left = PLATES.find((plate) => plate.code === codes[0]);
      const right = PLATES.find((plate) => plate.code === codes[1]);
      if (!(left && right)) {
        continue;
      }

      // The published figure is the mean over the steps the segment was merged from,
      // and a small fast-spinning plate changes speed sharply along its own edge, so
      // compare against the closest match along the segment rather than one vertex.
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < segment.coords.length; i += 2) {
        const lon = segment.coords[i] as number;
        const lat = segment.coords[i + 1] as number;
        const leftVelocity = PlateReconstruction.velocityAt(PLATES.indexOf(left), lon, lat);
        const rightVelocity = PlateReconstruction.velocityAt(PLATES.indexOf(right), lon, lat);
        const toEastNorth = (velocity: { speedMmPerYear: number; azimuthDeg: number }): [number, number] => [
          velocity.speedMmPerYear * Math.sin((velocity.azimuthDeg * Math.PI) / 180),
          velocity.speedMmPerYear * Math.cos((velocity.azimuthDeg * Math.PI) / 180),
        ];
        const [leftEast, leftNorth] = toEastNorth(leftVelocity);
        const [rightEast, rightNorth] = toEastNorth(rightVelocity);
        const relative = Math.hypot(leftEast - rightEast, leftNorth - rightNorth);
        best = Math.min(best, Math.abs(relative - segment.velocityMmPerYear));
      }
      errors.push(best);
    }

    expect(errors.length).toBeGreaterThan(1000);
    errors.sort((a, b) => a - b);
    const median = errors[errors.length >> 1] as number;
    const ninetyFifth = errors[Math.floor(errors.length * 0.95)] as number;

    // Agreement is essentially exact for the great majority. What is left in the tail
    // is the handful of tiny, fast-spinning microplates — Manus, Niuafo'ou, Easter,
    // Juan Fernandez — whose velocity varies by tens of mm/yr across a plate only a
    // few degrees wide, so simplifying the geometry moves the sample point enough to
    // matter. A sign error anywhere in the pole chain would move the median instead.
    expect(median).toBeLessThan(0.5);
    expect(ninetyFifth).toBeLessThan(5);
  });
});

describe("earthquake catalogue", () => {
  it("has matching columns of plausible values", () => {
    const { lon, lat, depthKm, magnitude, plateIndex } = EARTHQUAKES;
    expect(lon.length).toBeGreaterThan(1000);
    expect(lat.length).toBe(lon.length);
    expect(depthKm.length).toBe(lon.length);
    expect(magnitude.length).toBe(lon.length);
    expect(plateIndex.length).toBe(lon.length);

    for (let i = 0; i < lon.length; i++) {
      expect(Math.abs(lon[i] as number)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat[i] as number)).toBeLessThanOrEqual(90);
      expect(depthKm[i] as number).toBeGreaterThanOrEqual(0);
      expect(depthKm[i] as number).toBeLessThanOrEqual(MAX_EARTHQUAKE_DEPTH_KM + 50);
      expect(magnitude[i] as number).toBeGreaterThan(3);
      expect(magnitude[i] as number).toBeLessThan(10);
      expect(plateIndex[i] as number).toBeLessThan(PLATES.length);
    }
  });

  it("puts the deep earthquakes around the Pacific, where slabs sink", () => {
    const { lon, depthKm } = EARTHQUAKES;
    let deep = 0;
    let deepAroundPacific = 0;
    for (let i = 0; i < lon.length; i++) {
      if ((depthKm[i] as number) < 300) {
        continue;
      }
      deep++;
      // The Pacific rim, plus the Sunda and Mediterranean slabs to its west.
      const longitude = lon[i] as number;
      if (longitude > 90 || longitude < -60) {
        deepAroundPacific++;
      }
    }
    expect(deep).toBeGreaterThan(50);
    expect(deepAroundPacific / deep).toBeGreaterThan(0.85);
  });
});

describe("volcanoes and hotspots", () => {
  it("lists Holocene volcanoes with plate assignments", () => {
    expect(VOLCANOES.length).toBeGreaterThan(500);
    for (const volcano of VOLCANOES) {
      expect(volcano.name.length).toBeGreaterThan(0);
      expect(Math.abs(volcano.lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(volcano.lat)).toBeLessThanOrEqual(90);
      expect(volcano.plateIndex).toBeGreaterThanOrEqual(0);
      expect(volcano.plateIndex).toBeLessThan(PLATES.length);
    }
  });

  it("includes the hotspots every course mentions", () => {
    const names = HOTSPOTS.map((hotspot) => hotspot.name);
    for (const name of ["Hawaii", "Iceland", "Yellowstone", "Galápagos", "Réunion"]) {
      expect(names).toContain(name);
    }
  });
});

describe("cross-sections", () => {
  it("has one profile per boundary type", () => {
    expect(CROSS_SECTIONS.map((section) => section.key).sort()).toEqual(["divergent", "subduction", "transform"]);
  });

  it("keeps every projected feature inside its profile", () => {
    for (const section of CROSS_SECTIONS) {
      expect(section.lengthKm).toBeGreaterThan(100);
      expect(section.elevationsM.length).toBeGreaterThan(100);
      for (const elevationM of section.elevationsM) {
        expect(elevationM).toBeGreaterThan(-11500);
        expect(elevationM).toBeLessThan(9000);
      }
      for (const quake of section.earthquakes) {
        expect(quake.distanceKm).toBeGreaterThanOrEqual(0);
        expect(quake.distanceKm).toBeLessThanOrEqual(section.lengthKm);
        expect(quake.depthKm).toBeGreaterThanOrEqual(0);
      }
      for (const volcano of section.volcanoes) {
        expect(volcano.distanceKm).toBeGreaterThanOrEqual(0);
        expect(volcano.distanceKm).toBeLessThanOrEqual(section.lengthKm);
      }
      for (const crossing of section.boundaryCrossings) {
        expect(crossing.distanceKm).toBeGreaterThanOrEqual(0);
        expect(crossing.distanceKm).toBeLessThanOrEqual(section.lengthKm);
      }
    }
  });

  it("shows a Wadati–Benioff zone that deepens away from the trench", () => {
    const subduction = CROSS_SECTIONS.find((section) => section.key === "subduction");
    expect(subduction).toBeDefined();
    if (!subduction) {
      return;
    }

    const trench = subduction.boundaryCrossings.find((crossing) => crossing.type === "convergent");
    expect(trench, "the Chile profile must cross a trench").toBeDefined();
    if (!trench) {
      return;
    }

    const deepQuakes = subduction.earthquakes.filter((quake) => quake.depthKm > 300);
    const shallowQuakes = subduction.earthquakes.filter((quake) => quake.depthKm < 70);
    expect(deepQuakes.length).toBeGreaterThan(20);
    expect(shallowQuakes.length).toBeGreaterThan(100);

    // Shallow events hug the trench; deep ones sit hundreds of km inland, because
    // the slab dips as it descends. That is the whole point of the section.
    const meanDistance = (quakes: typeof deepQuakes): number =>
      quakes.reduce((sum, quake) => sum + quake.distanceKm, 0) / quakes.length;
    expect(meanDistance(deepQuakes)).toBeGreaterThan(meanDistance(shallowQuakes) + 200);
  });

  it("puts only shallow earthquakes on the ridge and the fault", () => {
    for (const key of ["divergent", "transform"] as const) {
      const section = CROSS_SECTIONS.find((candidate) => candidate.key === key);
      expect(section).toBeDefined();
      if (!section) {
        continue;
      }
      expect(section.maxDepthKm).toBeLessThanOrEqual(70);
      const deepest = section.earthquakes.reduce((deep, quake) => Math.max(deep, quake.depthKm), 0);
      expect(deepest).toBeLessThan(70);
    }
  });
});
