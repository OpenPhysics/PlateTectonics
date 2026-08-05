/**
 * PlateEvolution.test.ts
 *
 * What the reconstruction does to the *picture* when the clock runs, as opposed to
 * the point-by-point rotation arithmetic that `PlateReconstruction.test.ts` covers.
 *
 * Two things have to hold for the evolution to be worth showing a student:
 *
 *  1. The plates stay a mosaic. Carry each plate outline rigidly about its own Euler
 *     pole and the two sides of every boundary drift apart — a gap where a naive model
 *     tears the Atlantic open, an overlap where it drives Nazca through South America.
 *     Because outline vertices ride the boundary beneath them instead, neighbouring
 *     plates keep a shared edge, and what changes is each plate's area.
 *  2. Boundaries move where the physics puts them: a ridge stays midway between the
 *     two plates it separates, and a trench stays with the plate that is not going
 *     down it.
 *
 * The velocity checks in the other file guard the poles; these guard the geometry.
 */

import { describe, expect, it } from "vitest";
import type { BoundaryType } from "../src/common/data/dataTypes.js";
import { BOUNDARY_SEGMENTS } from "../src/common/data/generated/boundaryData.js";
import { PLATES } from "../src/common/data/generated/plateData.js";
import { MOTION_FRAMES, PlateReconstruction } from "../src/common/PlateReconstruction.js";
import { EARTH_RADIUS_KM } from "../src/PlateTectonicsConstants.js";
import { TIME_RANGE } from "../src/plate-tectonics/model/PlateTectonicsModel.js";

const DEG_TO_RAD = Math.PI / 180;

/** Index of a plate by its PB2002 code. */
function plateIndex(code: string): number {
  const index = PLATES.findIndex((plate) => plate.code === code);
  expect(index, `plate ${code} is missing from the dataset`).toBeGreaterThanOrEqual(0);
  return index;
}

/** Great-circle distance between two lon/lat points, in km (the haversine formula). */
function distanceKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const fromLat = aLat * DEG_TO_RAD;
  const toLat = bLat * DEG_TO_RAD;
  const halfLatSpan = Math.sin((toLat - fromLat) / 2);
  const halfLonSpan = Math.sin(((bLon - aLon) * DEG_TO_RAD) / 2);
  const h = halfLatSpan * halfLatSpan + Math.cos(fromLat) * Math.cos(toLat) * halfLonSpan * halfLonSpan;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Where a point ends up after `timeMyr`, on a given motion frame. */
function movedTo(reconstruction: PlateReconstruction, lon: number, lat: number, frame: number): [number, number] {
  reconstruction.transform(lon, lat, frame);
  return [reconstruction.lon, reconstruction.lat];
}

/** The ends of the reconstruction slider, which is as far as the sim ever runs. */
const EXTREMES = [TIME_RANGE.min, TIME_RANGE.max];

describe("the plate mosaic stays closed", () => {
  /**
   * Every boundary segment lies on the edge of both plates it separates. Carrying it
   * with either plate on its own would leave it that plate's distance from the other;
   * carrying it on its own frame must not.
   */
  it("keeps a boundary with both of the plates it separates, not just one", () => {
    const reconstruction = new PlateReconstruction();

    for (const timeMyr of EXTREMES) {
      reconstruction.setTime(timeMyr);
      const rigidGaps: number[] = [];
      const frameGaps: number[] = [];

      for (const segment of BOUNDARY_SEGMENTS) {
        const codes = segment.plates.split(/[\\/-]/);
        const left = PLATES.findIndex((plate) => plate.code === codes[0]);
        const right = PLATES.findIndex((plate) => plate.code === codes[1]);
        if (left < 0 || right < 0) {
          continue;
        }
        const lon = segment.coords[0] as number;
        const lat = segment.coords[1] as number;

        // How far apart the two plates carry the same boundary point: the gap or the
        // overlap a rigid reconstruction opens up there.
        const [leftLon, leftLat] = movedTo(reconstruction, lon, lat, left);
        const [rightLon, rightLat] = movedTo(reconstruction, lon, lat, right);
        rigidGaps.push(distanceKm(leftLon, leftLat, rightLon, rightLat));

        // On its own frame the boundary is a single point again, and it stays between
        // the two plates rather than running off with one of them.
        const [frameLon, frameLat] = movedTo(reconstruction, lon, lat, segment.frameIndex);
        frameGaps.push(
          Math.abs(
            distanceKm(frameLon, frameLat, leftLon, leftLat) - distanceKm(frameLon, frameLat, rightLon, rightLat),
          ),
        );
      }

      const median = (values: number[]): number => [...values].sort((a, b) => a - b)[values.length >> 1] as number;

      // A rigid reconstruction puts the two sides of a typical boundary several
      // hundred kilometres apart at the ends of the slider.
      expect(median(rigidGaps)).toBeGreaterThan(500);

      // A ridge or a transform sits equidistant from the two plates. It is not exact
      // to the last kilometre — averaging two rotation *vectors* averages the two
      // velocities, and a finite rotation is not quite linear in time — but a few
      // kilometres against the several hundred above is the point.
      // (A trench is deliberately not equidistant: it rides the overriding plate.
      // Trenches are 13% of the segments, so they stay out of the median.)
      expect(median(frameGaps)).toBeLessThan(25);
    }
  });

  /**
   * The real test of the mosaic: take every plate outline vertex where it ends up, and
   * check that some *other* plate's outline still has a vertex on top of it. The
   * present day sets the floor, because the two plates' rings were simplified
   * separately and do not share vertices exactly.
   */
  it("leaves plate outlines sitting on their neighbours' after 50 Myr", () => {
    const reconstruction = new PlateReconstruction();

    const spread = (timeMyr: number): number => {
      reconstruction.setTime(timeMyr);
      const points: { lon: number; lat: number; plate: number }[] = [];
      PLATES.forEach((plate, index) => {
        plate.rings.forEach((ring, ringIndex) => {
          const frames = plate.ringFrames[ringIndex] as readonly number[];
          for (let i = 0; i < ring.length; i += 2) {
            const [lon, lat] = movedTo(
              reconstruction,
              ring[i] as number,
              ring[i + 1] as number,
              frames[i / 2] as number,
            );
            points.push({ lon, lat, plate: index });
          }
        });
      });

      const nearest = points.map((point) => {
        let best = Number.POSITIVE_INFINITY;
        for (const other of points) {
          if (other.plate !== point.plate) {
            best = Math.min(best, distanceKm(point.lon, point.lat, other.lon, other.lat));
          }
        }
        return best;
      });
      nearest.sort((a, b) => a - b);
      // The 90th percentile: the tail is dominated by vertices in the middle of a long
      // straight edge, whose neighbour simply has no vertex there to match.
      return nearest[Math.floor(nearest.length * 0.9)] as number;
    };

    const today = spread(0);
    for (const timeMyr of EXTREMES) {
      // Running the clock must not scatter the outlines noticeably further apart than
      // simplifying them already did.
      expect(spread(timeMyr)).toBeLessThan(Math.max(150, today * 1.5));
    }
  });
});

describe("plates keep their shape", () => {
  /**
   * Area of a reconstructed plate, in steradian-like units: the shoelace formula on
   * longitude against the sine of latitude, which is an equal-area projection, so the
   * number is proportional to the real area whatever the plate's shape.
   */
  function plateArea(plate: (typeof PLATES)[number], reconstruction: PlateReconstruction): number {
    let total = 0;
    plate.rings.forEach((ring, ringIndex) => {
      const frames = plate.ringFrames[ringIndex] as readonly number[];
      const lon: number[] = [];
      const sinLat: number[] = [];
      for (let i = 0; i < ring.length; i += 2) {
        const [movedLon, movedLat] = movedTo(
          reconstruction,
          ring[i] as number,
          ring[i + 1] as number,
          frames[i / 2] as number,
        );
        lon.push(movedLon);
        sinLat.push(Math.sin(movedLat * DEG_TO_RAD));
      }
      let sum = 0;
      for (let i = 0, j = lon.length - 1; i < lon.length; j = i, i++) {
        // Take the step in longitude the short way round, so a plate that straddles
        // the antimeridian is not credited with the rest of the globe.
        const step = (((((lon[i] as number) - (lon[j] as number)) % 360) + 540) % 360) - 180;
        sum += step * ((sinLat[i] as number) + (sinLat[j] as number));
      }
      total += Math.abs(sum / 2);
    });
    return total;
  }

  it("holds every major plate's area within a factor of a few over the slider's range", () => {
    const reconstruction = new PlateReconstruction();
    const majors = PLATES.filter((plate) => plate.major);
    expect(majors.length).toBeGreaterThan(10);

    for (const plate of majors) {
      reconstruction.setTime(0);
      const today = plateArea(plate, reconstruction);
      expect(today, `${plate.code} has no area today`).toBeGreaterThan(0);

      for (const timeMyr of EXTREMES) {
        reconstruction.setTime(timeMyr);
        const then = plateArea(plate, reconstruction);
        const ratio = Math.max(then / today, today / then);
        // A plate really does change area as it runs — that is the sea floor being
        // made at its ridges and consumed at its trenches, and it is the point. What
        // this rules out is an outline flying apart. The loosest are the Philippine
        // Sea and Scotia plates, hemmed in by microplates whose motion is nonsense
        // this far out; see doc/model.md.
        expect(ratio, `${plate.code} (${plate.name}) area × ${ratio.toFixed(1)} at ${timeMyr} Myr`).toBeLessThan(5);
      }
    }
  });
});

describe("boundaries ride the right motion", () => {
  it("puts a spreading ridge midway between the plates it separates", () => {
    const reconstruction = new PlateReconstruction();
    reconstruction.setTime(-50);

    // The Mid-Atlantic Ridge between Africa and South America, at the equator.
    const segment = BOUNDARY_SEGMENTS.find(
      (candidate) => candidate.plates === "AF-SA" && candidate.type === "divergent",
    );
    expect(segment, "the Africa–South America ridge is missing").toBeDefined();
    const lon = (segment as (typeof BOUNDARY_SEGMENTS)[number]).coords[0] as number;
    const lat = (segment as (typeof BOUNDARY_SEGMENTS)[number]).coords[1] as number;

    const [africaLon, africaLat] = movedTo(reconstruction, lon, lat, plateIndex("AF"));
    const [americaLon, americaLat] = movedTo(reconstruction, lon, lat, plateIndex("SA"));
    const [ridgeLon, ridgeLat] = movedTo(
      reconstruction,
      lon,
      lat,
      (segment as (typeof BOUNDARY_SEGMENTS)[number]).frameIndex,
    );

    const opening = distanceKm(africaLon, africaLat, americaLon, americaLat);
    // 50 Myr at ~25 mm/yr of opening is well over a thousand kilometres of Atlantic.
    expect(opening).toBeGreaterThan(800);

    // The ridge should sit in the middle of that, to well within a percent — the
    // slack is the difference between averaging velocities and averaging finite
    // rotations, plus the rounding in the generated pole.
    const toAfrica = distanceKm(ridgeLon, ridgeLat, africaLon, africaLat);
    const toAmerica = distanceKm(ridgeLon, ridgeLat, americaLon, americaLat);
    expect(Math.abs(toAfrica - opening / 2) / opening).toBeLessThan(0.01);
    expect(Math.abs(toAmerica - opening / 2) / opening).toBeLessThan(0.01);
  });

  it("leaves a trench with the overriding plate, not the one going down it", () => {
    // PB2002 writes the polarity into the boundary name: "\" for the left-hand plate
    // descending, "/" for the right-hand one. Each case below is a subduction zone a
    // student is expected to recognise.
    const cases: [name: string, overriding: string][] = [
      ["NZ\\SA", "SA"], // Peru–Chile trench: Nazca under South America
      ["CO\\NA", "NA"], // Middle America trench: Cocos under North America
      ["JF\\NA", "NA"], // Cascadia: Juan de Fuca under North America
      ["TO/PA", "TO"], // Tonga trench: Pacific under Tonga
      ["NA/PA", "NA"], // Aleutians: Pacific under North America
      ["PA\\OK", "OK"], // Kuril–Japan: Pacific under Okhotsk
      ["SU/AU", "SU"], // Java trench: Australia under Sunda
      ["MA/PA", "MA"], // Marianas: Pacific under the Mariana plate
    ];

    for (const [name, overriding] of cases) {
      const segments = BOUNDARY_SEGMENTS.filter((segment) => segment.plates === name && segment.type === "convergent");
      expect(segments.length, `no convergent segment named ${name}`).toBeGreaterThan(0);
      for (const segment of segments) {
        expect(segment.frameIndex, `${name} should ride ${overriding}`).toBe(plateIndex(overriding));
      }
    }
  });

  it("gives the same motion to a boundary however PB2002 happened to order its name", () => {
    // Bird names each *section* of a boundary independently, so one ridge can appear
    // as both "AF-AN" and "AN-AF", and one trench as both "AU\\PA" and "PA/AU".
    // Taking the first plate named — as the model used to — tore such a boundary in
    // half at the point where the naming flipped. What a section means is the pair of
    // plates plus which of them, if either, is going down: reduce a name to that and
    // every spelling of it has to ride the same motion.
    const meaningOf = (name: string, type: BoundaryType): string => {
      const match = /^([A-Z]{2})([-\\/])([A-Z]{2})$/.exec(name) as [string, string, string, string] | null;
      expect(match, `unrecognised boundary name ${name}`).not.toBeNull();
      const [, left, separator, right] = match as [string, string, string, string];
      const subducting = separator === "\\" ? left : separator === "/" ? right : null;
      return `${[left, right].sort().join(":")} ${type} under ${subducting ?? "neither"}`;
    };

    const framesByMeaning = new Map<string, Set<number>>();
    for (const segment of BOUNDARY_SEGMENTS) {
      const key = meaningOf(segment.plates, segment.type);
      const frames = framesByMeaning.get(key) ?? new Set<number>();
      frames.add(segment.frameIndex);
      framesByMeaning.set(key, frames);
    }

    for (const [meaning, frames] of framesByMeaning) {
      expect([...frames], `${meaning} rides more than one motion`).toHaveLength(1);
    }
    // And the reduction has to be doing some work: the Australia–Pacific boundary is
    // spelled all four ways in PB2002.
    expect(framesByMeaning.size).toBeLessThan(new Set(BOUNDARY_SEGMENTS.map((s) => `${s.plates}${s.type}`)).size);
  });
});

describe("motion frames", () => {
  it("starts with the plates, so a plate index is also a frame index", () => {
    expect(MOTION_FRAMES.length).toBeGreaterThan(PLATES.length);
    PLATES.forEach((plate, index) => {
      expect(MOTION_FRAMES[index]).toBe(plate);
    });
  });

  it("moves a derived frame at the mean of the two plates' velocities", () => {
    // The Mid-Atlantic Ridge frame: half of Africa's velocity plus half of South
    // America's, which is what symmetric spreading means.
    const segment = BOUNDARY_SEGMENTS.find((candidate) => candidate.plates === "AF-SA");
    expect(segment).toBeDefined();
    const lon = (segment as (typeof BOUNDARY_SEGMENTS)[number]).coords[0] as number;
    const lat = (segment as (typeof BOUNDARY_SEGMENTS)[number]).coords[1] as number;

    const toEastNorth = (frame: number): [number, number] => {
      const { speedMmPerYear, azimuthDeg } = PlateReconstruction.velocityAt(frame, lon, lat);
      return [speedMmPerYear * Math.sin(azimuthDeg * DEG_TO_RAD), speedMmPerYear * Math.cos(azimuthDeg * DEG_TO_RAD)];
    };

    const [africaEast, africaNorth] = toEastNorth(plateIndex("AF"));
    const [americaEast, americaNorth] = toEastNorth(plateIndex("SA"));
    const [ridgeEast, ridgeNorth] = toEastNorth((segment as (typeof BOUNDARY_SEGMENTS)[number]).frameIndex);

    // Exact but for the rounding the generated pole is written with — the frames are
    // stored to the same precision as the plate poles themselves.
    const speed = Math.hypot(africaEast, africaNorth);
    expect(Math.abs(ridgeEast - (africaEast + americaEast) / 2) / speed).toBeLessThan(1e-3);
    expect(Math.abs(ridgeNorth - (africaNorth + americaNorth) / 2) / speed).toBeLessThan(1e-3);
  });
});
