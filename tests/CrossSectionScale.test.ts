/**
 * CrossSectionScale.test.ts
 *
 * The two-band vertical mapping: that it fills the viewport, stays monotonic, magnifies
 * the shallow band, round-trips for the probe, and collapses to a uniform scale when
 * asked to.
 */

import { Bounds2 } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import { CrossSectionScale } from "../src/common/model/CrossSectionScale.js";
import { SECTION_VIEW_BOUNDS } from "../src/PlateTectonicsConstants.js";

const bounds = new Bounds2(
  SECTION_VIEW_BOUNDS.minX,
  SECTION_VIEW_BOUNDS.minY,
  SECTION_VIEW_BOUNDS.maxX,
  SECTION_VIEW_BOUNDS.maxY,
);

/** The Crust screen's scale: ±10 km of relief magnified above a 70 km root. */
function crustScale(): CrossSectionScale {
  return new CrossSectionScale({
    bounds,
    halfWidthM: 225000,
    topM: 12000,
    bottomM: -80000,
    bandBottomM: -12000,
    bandHeightFraction: 0.4,
  });
}

/** The zoomed-out scale: one uniform map from the surface to the centre of the Earth. */
function wholeEarthScale(): CrossSectionScale {
  return new CrossSectionScale({
    bounds,
    halfWidthM: 6371000,
    topM: 0,
    bottomM: -6371000,
    bandBottomM: -6371000,
    bandHeightFraction: 1,
  });
}

describe("CrossSectionScale horizontal mapping", () => {
  it("spans the viewport symmetrically about the centre", () => {
    const scale = crustScale();
    expect(scale.x(-scale.halfWidthM)).toBeCloseTo(bounds.minX, 9);
    expect(scale.x(0)).toBeCloseTo(bounds.centerX, 9);
    expect(scale.x(scale.halfWidthM)).toBeCloseTo(bounds.maxX, 9);
  });

  it("round-trips through its inverse", () => {
    const scale = crustScale();
    for (const xM of [-200000, -50000, 0, 75000, 220000]) {
      expect(scale.modelX(scale.x(xM))).toBeCloseTo(xM, 6);
    }
  });
});

describe("CrossSectionScale vertical mapping", () => {
  it("fills the viewport from top to bottom", () => {
    const scale = crustScale();
    expect(scale.y(scale.topM)).toBeCloseTo(bounds.minY, 9);
    expect(scale.y(scale.bottomM)).toBeCloseTo(bounds.maxY, 9);
  });

  it("puts higher ground higher on screen", () => {
    const scale = crustScale();
    expect(scale.y(8000)).toBeLessThan(scale.y(0));
    expect(scale.y(0)).toBeLessThan(scale.y(-5000));
    expect(scale.y(-5000)).toBeLessThan(scale.y(-60000));
  });

  it("is continuous across the band boundary", () => {
    const scale = crustScale();
    const above = scale.y(scale.bandBottomM + 1);
    const below = scale.y(scale.bandBottomM - 1);
    expect(scale.y(scale.bandBottomM)).toBeCloseTo(scale.bandBottomY, 9);
    expect(below - above).toBeLessThan(bounds.height * 0.05);
    expect(below).toBeGreaterThan(above);
  });

  it("magnifies the shallow band, which is the whole point of two bands", () => {
    // 24 km of relief gets 40% of the height while 68 km of root gets the other 60%,
    // so the part the sliders actually move is stretched about 1.9× against the root.
    const scale = crustScale();
    expect(scale.verticalExaggeration).toBeGreaterThan(1.5);
    expect(scale.shallowPixelsPerMetre).toBeGreaterThan(scale.deepPixelsPerMetre);
  });

  it("clamps outside the range instead of running off the viewport", () => {
    const scale = crustScale();
    expect(scale.y(999999)).toBeCloseTo(bounds.minY, 9);
    expect(scale.y(-999999)).toBeCloseTo(bounds.maxY, 9);
  });

  it("round-trips through its inverse in both bands", () => {
    const scale = crustScale();
    for (const elevationM of [10000, 2000, 0, -6000, -11000, -30000, -75000]) {
      expect(scale.modelElevation(scale.y(elevationM))).toBeCloseTo(elevationM, 3);
    }
  });

  it("reports sea level inside the shallow band", () => {
    const scale = crustScale();
    expect(scale.seaLevelY).toBeGreaterThan(bounds.minY);
    expect(scale.seaLevelY).toBeLessThan(scale.bandBottomY);
  });

  it("measures depth the same way as elevation, sign flipped", () => {
    const scale = crustScale();
    expect(scale.yFromDepth(30000)).toBeCloseTo(scale.y(-30000), 9);
  });
});

describe("CrossSectionScale as a uniform scale", () => {
  it("collapses to one linear map when the band bottom is the viewport bottom", () => {
    const scale = wholeEarthScale();
    expect(scale.verticalExaggeration).toBeCloseTo(1, 6);
    // Half way down the Earth should be half way down the viewport.
    expect(scale.y(-6371000 / 2)).toBeCloseTo(bounds.centerY, 6);
  });

  it("still round-trips", () => {
    const scale = wholeEarthScale();
    for (const elevationM of [0, -750000, -2921000, -5180000, -6371000]) {
      expect(scale.modelElevation(scale.y(elevationM))).toBeCloseTo(elevationM, 0);
    }
  });
});
