/**
 * PlateTectonicsModel.ts
 *
 * All simulation state, as AXON Properties the view observes.
 *
 * The model holds no geometry of its own: the plates, boundaries, earthquakes and
 * volcanoes are fixed observational datasets (see `src/common/data/`), and the only
 * thing that evolves is *where the plates are*. That is captured by a single number
 * — `timeMillionsOfYearsProperty` — which the view feeds to `PlateReconstruction`
 * to rotate every plate about its Euler pole.
 *
 * ── State groups ──────────────────────────────────────────────────────────────
 *  - Layer visibility: which overlays are drawn.
 *  - Earthquake depth filter: which hypocentres are drawn.
 *  - View selection: the global map — flat or as a 3-D globe — or one of the three
 *    boundary cross-sections.
 *  - Time: the reconstruction clock, plus play/pause and speed.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { BooleanProperty, DerivedProperty, EnumerationProperty, NumberProperty, Property } from "scenerystack/axon";
import { Range } from "scenerystack/dot";
import type { TModel } from "scenerystack/joist";
import { TimeSpeed } from "scenerystack/scenery-phet";
import type { ViewKey } from "../../common/data/dataTypes.js";
import { TimeModel } from "../../common/TimeModel.js";
import {
  FAST_SPEED_MULTIPLIER,
  MYR_PER_SECOND,
  PRESENT_DAY_TOLERANCE_MYR,
  SLOW_SPEED_MULTIPLIER,
  TIME_RANGE_MYR,
  TIME_STEP_MYR,
} from "../../PlateTectonicsConstants.js";
import type { EarthquakeDepthFilter } from "./EarthquakeDepthFilter.js";

/** Range of the reconstruction clock, in millions of years from the present. */
export const TIME_RANGE = new Range(-TIME_RANGE_MYR, TIME_RANGE_MYR);

export class PlateTectonicsModel implements TModel {
  // ── Layer visibility ────────────────────────────────────────────────────────
  //
  // Every layer starts off. The sim opens on a bare ocean-and-coastline map, and the
  // question it asks is which of these datasets to put on it — which is a question a
  // student can only see if the answer is not already drawn for them. Switching two
  // layers on and finding where they coincide is the interaction hint the screen
  // summary gives, and it only means anything from an empty map.

  /** The per-plate colour wash and plate outlines. */
  public readonly showPlatesProperty = new BooleanProperty(false);

  /** Plate boundaries, colour-coded divergent / convergent / transform. */
  public readonly showBoundariesProperty = new BooleanProperty(false);

  /** Absolute plate motion vectors, scaled in mm/year. */
  public readonly showVectorsProperty = new BooleanProperty(false);

  /** Earthquake epicentres, sized by magnitude and coloured by depth. */
  public readonly showEarthquakesProperty = new BooleanProperty(false);

  /** Holocene volcanoes and intraplate hotspots. */
  public readonly showVolcanoesProperty = new BooleanProperty(false);

  /** The shaded relief raster: land topography and ocean-floor bathymetry. */
  public readonly showTopographyProperty = new BooleanProperty(false);

  // ── Filtering ───────────────────────────────────────────────────────────────

  /** Which earthquake depth band to show. */
  public readonly earthquakeDepthFilterProperty = new Property<EarthquakeDepthFilter>("all");

  // ── View selection ──────────────────────────────────────────────────────────

  /** The global map, or one of the boundary cross-sections. */
  public readonly selectedViewProperty = new Property<ViewKey>("global");

  /**
   * Whether the global view draws the Earth as a rotatable 3-D globe rather than as
   * the flat equirectangular map. The flat map shows the whole world at once and is
   * the better place to compare one ocean with another; the globe shows shapes and
   * distances honestly, which is what makes a circum-Pacific belt of earthquakes look
   * like a ring rather than a horseshoe smeared across two edges of a rectangle.
   */
  public readonly showGlobeProperty = new BooleanProperty(false);

  /** True while a cross-section is on screen rather than the global map. */
  public readonly isCrossSectionProperty: TReadOnlyProperty<boolean>;

  /** True while the flat map is on screen. */
  public readonly isFlatMapProperty: TReadOnlyProperty<boolean>;

  /** True while the 3-D globe is on screen. */
  public readonly isGlobeProperty: TReadOnlyProperty<boolean>;

  // ── Time ────────────────────────────────────────────────────────────────────

  /**
   * Reconstruction time in millions of years relative to the present: negative is
   * the past, positive the future.
   */
  public readonly timeMillionsOfYearsProperty = new NumberProperty(0, { range: TIME_RANGE });

  /** Play/pause plus the elapsed wall-clock time that drives cross-section animation. */
  public readonly timer = new TimeModel();

  /** Slow / normal / fast, applied to {@link MYR_PER_SECOND}. */
  public readonly timeSpeedProperty = new EnumerationProperty(TimeSpeed.NORMAL);

  /** True while the reconstruction is (within rounding) at the present day. */
  public readonly isPresentDayProperty: TReadOnlyProperty<boolean>;

  public constructor() {
    this.isCrossSectionProperty = new DerivedProperty(
      [this.selectedViewProperty],
      (view: ViewKey) => view !== "global",
    );
    this.isGlobeProperty = new DerivedProperty(
      [this.selectedViewProperty, this.showGlobeProperty],
      (view: ViewKey, showGlobe: boolean) => view === "global" && showGlobe,
    );
    this.isFlatMapProperty = new DerivedProperty(
      [this.selectedViewProperty, this.showGlobeProperty],
      (view: ViewKey, showGlobe: boolean) => view === "global" && !showGlobe,
    );
    this.isPresentDayProperty = new DerivedProperty(
      [this.timeMillionsOfYearsProperty],
      (time: number) => Math.abs(time) <= PRESENT_DAY_TOLERANCE_MYR,
    );
  }

  /** Millions of years of plate motion per second of wall-clock time, at the current speed. */
  public get millionYearsPerSecond(): number {
    if (this.timeSpeedProperty.value === TimeSpeed.SLOW) {
      return MYR_PER_SECOND * SLOW_SPEED_MULTIPLIER;
    }
    if (this.timeSpeedProperty.value === TimeSpeed.FAST) {
      return MYR_PER_SECOND * FAST_SPEED_MULTIPLIER;
    }
    return MYR_PER_SECOND;
  }

  /**
   * Advances the reconstruction by one press of the step button, clamped to the
   * ends of {@link TIME_RANGE}.
   */
  public stepTime(direction: 1 | -1): void {
    this.timeMillionsOfYearsProperty.value = TIME_RANGE.constrainValue(
      this.timeMillionsOfYearsProperty.value + direction * TIME_STEP_MYR,
    );
  }

  /** Returns the reconstruction to the present day, leaving layer settings alone. */
  public resetTime(): void {
    this.timeMillionsOfYearsProperty.reset();
    this.timer.reset();
  }

  /**
   * Steps the model forward by `dt` seconds of wall-clock time. While playing, the
   * reconstruction clock advances and stops (rather than wrapping) at the end of
   * its range, because extrapolating today's velocities further would be meaningless.
   */
  public step(dt: number): void {
    this.timer.step(dt);
    if (!this.timer.isPlayingProperty.value) {
      return;
    }

    const advanced = this.timeMillionsOfYearsProperty.value + dt * this.millionYearsPerSecond;
    this.timeMillionsOfYearsProperty.value = TIME_RANGE.constrainValue(advanced);
    if (advanced >= TIME_RANGE.max) {
      this.timer.isPlayingProperty.value = false;
    }
  }

  /** Resets all model state to its initial values (the Reset All button). */
  public reset(): void {
    this.showPlatesProperty.reset();
    this.showGlobeProperty.reset();
    this.showBoundariesProperty.reset();
    this.showVectorsProperty.reset();
    this.showEarthquakesProperty.reset();
    this.showVolcanoesProperty.reset();
    this.showTopographyProperty.reset();
    this.earthquakeDepthFilterProperty.reset();
    this.selectedViewProperty.reset();
    this.timeSpeedProperty.reset();
    this.resetTime();
  }
}
