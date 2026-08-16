/**
 * DeepTimeReconstruction.test.ts
 *
 * The deep-time reconstruction, checked as claims about the Earth rather than as
 * claims about arithmetic.
 *
 * This is the guard on a long chain — pyGPlates resolves a rotation hierarchy at
 * build time, `build-data.ts` flattens and de-duplicates it, and the runtime slerps
 * between the samples — and a sign error, a swapped pole latitude and longitude, or
 * a quaternion taking the long way round anywhere along it would put continents in
 * the wrong hemisphere. So the assertions below are things any introductory geology
 * text states: India was part of Gondwana and crossed the equator; Pangaea was
 * assembled at 250 Ma; Antarctica has been polar throughout.
 */

import { describe, expect, it } from "vitest";
import {
  DeepTimeReconstruction,
  HISTORY_OLDEST_MA,
  HISTORY_STEP_MYR,
  IDENTITY_ROTATION_SLOT,
} from "../src/common/DeepTimeReconstruction.js";
import { HISTORY_ROTATION_SLOTS, HISTORY_TIMES_MA } from "../src/common/data/generated/plateHistoryData.js";
import { PLATE_SNAPSHOTS } from "../src/common/data/generated/plateSnapshotData.js";

/** GPlates reconstruction plate IDs, from the model's own plate-ID table. */
const INDIA = 501;
const AUSTRALIA = 801;
const AFRICA = 701;
const SOUTH_AMERICA = 201;
const NORTH_AMERICA = 101;
const ANTARCTICA = 802;

/** Rotation row for a plate ID, failing the test rather than the type check if absent. */
function slot(plateId: number): number {
  const row = HISTORY_ROTATION_SLOTS[plateId];
  expect(row, `plate ID ${plateId} has no rotation row`).toBeDefined();
  return row as number;
}

/** Reconstructs a present-day point on a plate, at a given age. */
function at(timeMa: number, plateId: number, lon: number, lat: number): { lon: number; lat: number } {
  const reconstruction = new DeepTimeReconstruction();
  reconstruction.setTime(timeMa);
  reconstruction.transform(lon, lat, slot(plateId));
  return { lon: reconstruction.lon, lat: reconstruction.lat };
}

describe("DeepTimeReconstruction", () => {
  it("is the identity at the present day", () => {
    const reconstruction = new DeepTimeReconstruction();
    expect(reconstruction.isPresentDay).toBe(true);

    reconstruction.transform(77, 19, slot(INDIA));
    expect(reconstruction.lon).toBe(77);
    expect(reconstruction.lat).toBe(19);
  });

  it("keeps every reconstructed point on the sphere", () => {
    const reconstruction = new DeepTimeReconstruction();
    for (const timeMa of [7, 63, 128, 199, 241]) {
      reconstruction.setTime(timeMa);
      for (const plateId of [INDIA, AFRICA, NORTH_AMERICA, ANTARCTICA]) {
        reconstruction.transform(30, 45, slot(plateId));
        expect(Number.isFinite(reconstruction.lon)).toBe(true);
        expect(reconstruction.lat).toBeGreaterThanOrEqual(-90);
        expect(reconstruction.lat).toBeLessThanOrEqual(90);
      }
    }
  });

  // ── Paleogeography ──────────────────────────────────────────────────────────

  it("puts India deep in the southern hemisphere before it collided with Asia", () => {
    // India rifted from Gondwana and crossed 7 000 km of ocean in ~100 Myr — the
    // fastest sustained plate motion in the record.
    expect(at(140, INDIA, 77, 19).lat).toBeLessThan(-45);
    expect(at(100, INDIA, 77, 19).lat).toBeLessThan(-35);
    expect(at(50, INDIA, 77, 19).lat).toBeLessThan(0);
    expect(at(0, INDIA, 77, 19).lat).toBeCloseTo(19, 5);
  });

  it("carries India northward monotonically once it has left Gondwana", () => {
    let previous = -Infinity;
    for (let timeMa = 100; timeMa >= 20; timeMa -= 5) {
      const latitude = at(timeMa, INDIA, 77, 19).lat;
      expect(latitude, `India went backwards at ${timeMa} Ma`).toBeGreaterThan(previous);
      previous = latitude;
    }
  });

  it("assembles Pangaea at 250 Ma", () => {
    // The interior of North America sat on the equator, and South America and Africa
    // were joined along what is now the South Atlantic.
    expect(Math.abs(at(250, NORTH_AMERICA, -98, 38).lat)).toBeLessThan(15);

    const brazil = at(250, SOUTH_AMERICA, -38, -8);
    const congo = at(250, AFRICA, 12, -5);
    const separation = Math.hypot(brazil.lon - congo.lon, brazil.lat - congo.lat);
    expect(separation, "the South Atlantic had not opened at 250 Ma").toBeLessThan(20);
  });

  it("opens the South Atlantic between 250 Ma and today", () => {
    const gap = (timeMa: number): number => {
      const brazil = at(timeMa, SOUTH_AMERICA, -38, -8);
      const congo = at(timeMa, AFRICA, 12, -5);
      return Math.hypot(brazil.lon - congo.lon, brazil.lat - congo.lat);
    };
    expect(gap(0)).toBeGreaterThan(gap(100));
    expect(gap(100)).toBeGreaterThan(gap(200));
  });

  it("keeps Antarctica polar throughout", () => {
    for (const timeMa of [0, 60, 120, 180, 250]) {
      expect(at(timeMa, ANTARCTICA, 0, -85).lat, `Antarctica left the pole at ${timeMa} Ma`).toBeLessThan(-60);
    }
  });

  it("holds Australia against Antarctica until the Cenozoic", () => {
    // Australia only separated from Antarctica around 85–45 Ma; before that it was
    // far south, and it has been moving north ever since.
    expect(at(100, AUSTRALIA, 134, -23).lat).toBeLessThan(-40);
    expect(at(0, AUSTRALIA, 134, -23).lat).toBeCloseTo(-23, 5);
  });

  // ── Interpolation ───────────────────────────────────────────────────────────

  it("moves continuously between samples rather than jumping at them", () => {
    // The step between two consecutive half-sample points must never be much larger
    // than the steps either side of it, which is what a slerp gone the long way round
    // or a mishandled sign flip would produce.
    const reconstruction = new DeepTimeReconstruction();
    const positions: { lon: number; lat: number }[] = [];
    for (let timeMa = 60; timeMa <= 120; timeMa += HISTORY_STEP_MYR / 4) {
      reconstruction.setTime(timeMa);
      reconstruction.transform(77, 19, slot(INDIA));
      positions.push({ lon: reconstruction.lon, lat: reconstruction.lat });
    }

    const steps = positions.slice(1).map((position, index) => {
      const previous = positions[index] as { lon: number; lat: number };
      return Math.hypot(position.lon - previous.lon, position.lat - previous.lat);
    });
    const median = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)] as number;
    for (const step of steps) {
      expect(step, "the reconstruction jumped between samples").toBeLessThan(median * 4 + 0.5);
    }
  });

  it("clamps to the span the model covers", () => {
    const reconstruction = new DeepTimeReconstruction();

    reconstruction.setTime(HISTORY_OLDEST_MA + 100);
    reconstruction.transform(77, 19, slot(INDIA));
    const beyond = { lon: reconstruction.lon, lat: reconstruction.lat };

    reconstruction.setTime(HISTORY_OLDEST_MA);
    reconstruction.transform(77, 19, slot(INDIA));
    expect(beyond.lon).toBeCloseTo(reconstruction.lon, 6);
    expect(beyond.lat).toBeCloseTo(reconstruction.lat, 6);

    // The future is not reconstructed: no published model runs forward.
    reconstruction.setTime(-25);
    expect(reconstruction.isPresentDay).toBe(true);
  });

  it("leaves resolved geometry alone on the identity row", () => {
    // Plate polygons and boundaries are already at the instant being drawn, and go
    // through the same painter as the coastlines. If this row ever stopped being the
    // identity they would be rotated a second time, and the plates would slide off
    // the continents they belong to.
    const reconstruction = new DeepTimeReconstruction();
    for (const timeMa of [0, 37, 125, 250]) {
      reconstruction.setTime(timeMa);
      reconstruction.transform(-122, 47, IDENTITY_ROTATION_SLOT);
      expect(reconstruction.lon, `identity row moved a point at ${timeMa} Ma`).toBeCloseTo(-122, 6);
      expect(reconstruction.lat).toBeCloseTo(47, 6);
    }
  });

  it("agrees with the snapshot it is nearest", () => {
    const reconstruction = new DeepTimeReconstruction();
    reconstruction.setTime(0);
    expect(reconstruction.nearestSnapshotIndex).toBe(0);

    reconstruction.setTime(HISTORY_STEP_MYR * 3 + 1);
    expect(reconstruction.nearestSnapshotIndex).toBe(3);

    reconstruction.setTime(HISTORY_OLDEST_MA);
    expect(reconstruction.nearestSnapshotIndex).toBe(HISTORY_TIMES_MA.length - 1);
    expect(PLATE_SNAPSHOTS[reconstruction.nearestSnapshotIndex]?.timeMa).toBe(HISTORY_OLDEST_MA);
  });
});

describe("the baked plate history", () => {
  it("has one snapshot per sample time, in step", () => {
    expect(PLATE_SNAPSHOTS.length).toBe(HISTORY_TIMES_MA.length);
    PLATE_SNAPSHOTS.forEach((snapshot, index) => {
      expect(snapshot.timeMa).toBe(HISTORY_TIMES_MA[index]);
    });
    expect(HISTORY_TIMES_MA[0]).toBe(0);
  });

  it("loses plates going back in time, as ocean basins close", () => {
    // Fifty-odd plates today; a dozen or so in the Triassic, when most of the ocean
    // floor that carried the rest had not been made yet.
    const rigid = (index: number): number =>
      (PLATE_SNAPSHOTS[index]?.plates ?? []).filter((plate) => !plate.deforming).length;
    expect(rigid(0)).toBeGreaterThan(30);
    expect(rigid(PLATE_SNAPSHOTS.length - 1)).toBeLessThan(rigid(0));
  });

  it("stores closed rings and drawable boundary lines", () => {
    for (const snapshot of PLATE_SNAPSHOTS) {
      for (const plate of snapshot.plates) {
        expect(plate.ring.length % 2, `odd coordinate count at ${snapshot.timeMa} Ma`).toBe(0);
        expect(plate.ring.length).toBeGreaterThanOrEqual(8);
      }
      for (const set of snapshot.boundaries) {
        expect(["divergent", "convergent", "transform"]).toContain(set.type);
        for (const line of set.lines) {
          expect(line.length % 2).toBe(0);
          expect(line.length).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it("has divergent and convergent boundaries at every instant", () => {
    // Crust is made somewhere and destroyed somewhere at all times, or the Earth
    // would be growing.
    for (const snapshot of PLATE_SNAPSHOTS) {
      for (const type of ["divergent", "convergent"] as const) {
        const set = snapshot.boundaries.find((candidate) => candidate.type === type);
        expect(set?.lines.length, `no ${type} boundary at ${snapshot.timeMa} Ma`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every coordinate in range", () => {
    for (const snapshot of PLATE_SNAPSHOTS) {
      for (const plate of snapshot.plates) {
        for (let i = 0; i < plate.ring.length; i += 2) {
          expect(Math.abs(plate.ring[i] as number)).toBeLessThanOrEqual(180.01);
          expect(Math.abs(plate.ring[i + 1] as number)).toBeLessThanOrEqual(90.01);
        }
      }
    }
  });
});
