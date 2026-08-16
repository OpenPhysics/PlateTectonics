/**
 * geophysicalData.test.ts
 *
 * Integrity checks on the generated datasets. `npm run build-data` reaches out to
 * several public services and reshapes what they return; these tests are what stands
 * between a silently mangled regeneration and a sim that draws nonsense.
 *
 * They also encode a few facts about the Earth — the Ring of Fire really is where
 * the deep earthquakes are — so a wrong sign or a swapped latitude/longitude column
 * fails loudly rather than looking merely odd.
 */

import { describe, expect, it } from "vitest";
import type { BoundaryType } from "../src/common/data/dataTypes.js";
import { BOUNDARY_SEGMENTS } from "../src/common/data/generated/boundaryData.js";
import { EARTHQUAKES } from "../src/common/data/generated/earthquakeData.js";
import { LAND_RINGS } from "../src/common/data/generated/landData.js";
import { PLATES } from "../src/common/data/generated/plateData.js";
import { ISOCHRON_AGES_MA, ISOCHRONS } from "../src/common/data/generated/seafloorAgeData.js";
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

describe("seafloor isochrons", () => {
  it("labels every line with one of the ages the ramp is built for", () => {
    expect(ISOCHRON_AGES_MA.length).toBeGreaterThan(5);
    expect(ISOCHRONS.length).toBeGreaterThan(100);
    for (const isochron of ISOCHRONS) {
      expect(ISOCHRON_AGES_MA).toContain(isochron.ageMa);
      expect(isochron.coords.length).toBeGreaterThanOrEqual(4);
      expectValidCoordinates(isochron.coords);
      expect(isochron.plateIndices.length).toBe(isochron.coords.length / 2);
      for (const index of isochron.plateIndices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(PLATES.length);
      }
    }
    for (const ageMa of ISOCHRON_AGES_MA) {
      expect(
        ISOCHRONS.filter((isochron) => isochron.ageMa === ageMa).length,
        `no ${ageMa} Ma isochron`,
      ).toBeGreaterThan(0);
    }
  });

  /**
   * The seafloor spreading argument, as an assertion.
   *
   * Across the Atlantic at 24° N the profile is as clean as it gets: no trench, no
   * transform in the way, continental margins either side. Every isochron crosses that
   * latitude exactly twice, and both crossings step away from the ridge as the age
   * goes up — which is what "the sea floor is made at the ridge and carried away from
   * it" looks like in the data. A latitude/longitude swap, a sign error in the contour
   * levels, or a mangled age grid all break the ordering.
   */
  it("steps out symmetrically from the Mid-Atlantic Ridge as the crust gets older", () => {
    const crossingsAt24North = (ageMa: number): number[] => {
      const longitudes: number[] = [];
      for (const isochron of ISOCHRONS) {
        if (isochron.ageMa !== ageMa) {
          continue;
        }
        const coords = isochron.coords;
        for (let i = 3; i < coords.length; i += 2) {
          const from = coords[i - 2] as number;
          const to = coords[i] as number;
          if (from === to || from > 24 === to > 24) {
            continue;
          }
          const t = (24 - from) / (to - from);
          const lon = (coords[i - 3] as number) + t * ((coords[i - 1] as number) - (coords[i - 3] as number));
          // The Atlantic between the American and African margins, and nowhere else.
          if (lon > -80 && lon < -5) {
            longitudes.push(lon);
          }
        }
      }
      return longitudes;
    };

    // Everything from 10 Ma to 160 Ma reaches this latitude on both flanks; the 180 Ma
    // line only survives on the African side, so it is left out of the comparison.
    const ages = ISOCHRON_AGES_MA.filter((ageMa) => ageMa >= 10 && ageMa <= 160);
    const flanks = ages.map((ageMa) => {
      const longitudes = crossingsAt24North(ageMa);
      expect(longitudes.length, `${ageMa} Ma does not cross 24° N in the Atlantic`).toBeGreaterThan(0);
      return { ageMa, west: Math.min(...longitudes), east: Math.max(...longitudes) };
    });

    // The ridge axis, read off the youngest pair rather than assumed.
    const youngest = flanks[0] as (typeof flanks)[number];
    const axis = (youngest.west + youngest.east) / 2;
    expect(axis).toBeGreaterThan(-50);
    expect(axis).toBeLessThan(-42);

    for (let i = 1; i < flanks.length; i++) {
      const older = flanks[i] as (typeof flanks)[number];
      const younger = flanks[i - 1] as (typeof flanks)[number];
      expect(older.west, `${older.ageMa} Ma should sit west of ${younger.ageMa} Ma`).toBeLessThan(younger.west);
      expect(older.east, `${older.ageMa} Ma should sit east of ${younger.ageMa} Ma`).toBeGreaterThan(younger.east);

      // Accretion is symmetric to within a degree or two per flank; the tolerance here
      // is loose enough for the real asymmetry and the 0.3° contouring mesh, and tight
      // enough that one flank drifting would fail.
      expect(Math.abs(axis - older.west - (older.east - axis)), `${older.ageMa} Ma is lopsided`).toBeLessThan(6);
    }

    // Over 160 Myr the two flanks together have opened the whole ocean.
    const oldest = flanks[flanks.length - 1] as (typeof flanks)[number];
    expect(oldest.east - oldest.west).toBeGreaterThan(40);
  });
});
