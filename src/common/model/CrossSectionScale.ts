/**
 * CrossSectionScale.ts
 *
 * Maps a schematic cross-section — model metres, x across and elevation up — onto the
 * viewport, and back again for the draggable probe.
 *
 * The problem this solves is that the interesting vertical structure is not evenly
 * distributed. On the Crust screen the elevations that the sliders actually move span
 * about ±10 km, while the crustal root below them reaches 70 km and the zoomed-out view
 * reaches 6371 km. Mapping all of that linearly would squash the part the user is
 * manipulating into a few pixels. So the scale is piecewise linear in two bands: a
 * shallow band that gets a disproportionate share of the viewport height, and a deep
 * band that takes the rest. Setting `bandBottomM` equal to `bottomM` collapses the two
 * into one uniform scale, which is what the whole-Earth zoom wants.
 *
 * The horizontal scale is always uniform — a cross-section that exaggerates
 * horizontally as well would stop being readable as a slice of the Earth.
 *
 * Pure and unit-tested in tests/CrossSectionScale.test.ts. Model units are metres,
 * elevation positive upwards from sea level; view units are pixels, y positive down.
 */

import type { Bounds2 } from "scenerystack/dot";

export type CrossSectionScaleOptions = {
  /** Viewport the section is drawn into. */
  bounds: Bounds2;

  /** Model x at the right edge; −halfWidthM is at the left edge. */
  halfWidthM: number;

  /** Elevation at the top edge of the viewport, m. */
  topM: number;

  /** Elevation at the bottom edge of the viewport, m — normally negative. */
  bottomM: number;

  /**
   * Elevation dividing the magnified shallow band from the compressed deep band, m.
   * Pass `bottomM` for a single uniform scale.
   */
  bandBottomM: number;

  /** Fraction of the viewport height the shallow band occupies, 0 to 1. */
  bandHeightFraction: number;
};

export class CrossSectionScale {
  public readonly bounds: Bounds2;
  public readonly halfWidthM: number;
  public readonly topM: number;
  public readonly bottomM: number;
  public readonly bandBottomM: number;

  /** View y of the boundary between the two bands. */
  public readonly bandBottomY: number;

  /** View y of sea level, which may be in either band. */
  public readonly seaLevelY: number;

  public constructor(options: CrossSectionScaleOptions) {
    const { bounds, halfWidthM, topM, bottomM, bandBottomM, bandHeightFraction } = options;

    this.bounds = bounds;
    this.halfWidthM = halfWidthM;
    this.topM = topM;
    this.bottomM = bottomM;

    // Clamping keeps a caller that passes a band outside [bottomM, topM] — or a
    // fraction outside [0, 1] — from producing a non-monotonic map, which would show
    // up as a cross-section folded over itself rather than as an exception.
    this.bandBottomM = Math.max(bottomM, Math.min(topM, bandBottomM));
    const fraction = Math.max(0, Math.min(1, bandHeightFraction));

    this.bandBottomY = this.bandBottomM <= bottomM ? bounds.maxY : bounds.minY + fraction * bounds.height;
    this.seaLevelY = this.y(0);
  }

  /** Pixels per metre of elevation in the magnified shallow band. */
  public get shallowPixelsPerMetre(): number {
    const span = this.topM - this.bandBottomM;
    return span <= 0 ? 0 : (this.bandBottomY - this.bounds.minY) / span;
  }

  /** Pixels per metre of elevation in the compressed deep band. */
  public get deepPixelsPerMetre(): number {
    const span = this.bandBottomM - this.bottomM;
    return span <= 0 ? 0 : (this.bounds.maxY - this.bandBottomY) / span;
  }

  /**
   * How much the shallow band is stretched relative to the deep one. 1 means the scale
   * is uniform; the Crust screen runs around 2.
   */
  public get verticalExaggeration(): number {
    const deep = this.deepPixelsPerMetre;
    return deep === 0 ? 1 : this.shallowPixelsPerMetre / deep;
  }

  /** View x for a model x, m. */
  public x(xM: number): number {
    return this.bounds.centerX + (xM / this.halfWidthM) * (this.bounds.width / 2);
  }

  /** View y for an elevation, m — positive up, clamped to the viewport. */
  public y(elevationM: number): number {
    const clamped = Math.max(this.bottomM, Math.min(this.topM, elevationM));
    if (clamped >= this.bandBottomM) {
      const span = this.topM - this.bandBottomM;
      if (span <= 0) {
        return this.bounds.minY;
      }
      return this.bounds.minY + ((this.topM - clamped) / span) * (this.bandBottomY - this.bounds.minY);
    }
    const span = this.bandBottomM - this.bottomM;
    if (span <= 0) {
      return this.bounds.maxY;
    }
    return this.bandBottomY + ((this.bandBottomM - clamped) / span) * (this.bounds.maxY - this.bandBottomY);
  }

  /** View y for a depth below sea level, m — the same map as {@link y}, sign flipped. */
  public yFromDepth(depthM: number): number {
    return this.y(-depthM);
  }

  /** Model x for a view x, m — the inverse of {@link x}. */
  public modelX(viewX: number): number {
    return ((viewX - this.bounds.centerX) / (this.bounds.width / 2)) * this.halfWidthM;
  }

  /** Elevation for a view y, m — the inverse of {@link y}. */
  public modelElevation(viewY: number): number {
    const clamped = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, viewY));
    if (clamped <= this.bandBottomY) {
      const height = this.bandBottomY - this.bounds.minY;
      if (height <= 0) {
        return this.topM;
      }
      return this.topM - ((clamped - this.bounds.minY) / height) * (this.topM - this.bandBottomM);
    }
    const height = this.bounds.maxY - this.bandBottomY;
    if (height <= 0) {
      return this.bandBottomM;
    }
    return this.bandBottomM - ((clamped - this.bandBottomY) / height) * (this.bandBottomM - this.bottomM);
  }
}
