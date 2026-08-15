/**
 * CrustModel.ts
 *
 * State for the Crust screen, as AXON Properties the view observes.
 *
 * Three blocks of crust float in the mantle side by side. The outer two are fixed —
 * oceanic on the left, continental on the right — and exist to be compared against.
 * The middle one is the user's: its temperature, composition and thickness are the
 * only inputs to the whole screen, and everything else follows from them.
 *
 * The chain is short and worth stating, because it is the entire physics content:
 *
 *   composition + temperature  →  density        (Isostasy.crustDensity)
 *   density     + thickness    →  target height  (Isostasy.airyElevation)
 *   target height              →  actual height  (IsostaticRelaxation, over ~1 s)
 *
 * Only the last step needs a clock, and only so the block is seen to settle rather
 * than teleport. Everything above it is a DerivedProperty.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { BooleanProperty, DerivedProperty, NumberProperty, Property } from "scenerystack/axon";
import { Range, Vector2 } from "scenerystack/dot";
import type { TModel } from "scenerystack/joist";
import type { ColorMode } from "../../common/model/ColorMode.js";
import { densityAt, type EarthLayer, layerAt, layerTemperatureAt } from "../../common/model/EarthStructure.js";
import { airyElevation, crustDensity, crustGeotherm } from "../../common/model/Isostasy.js";
import { SectionViewModel } from "../../common/model/SectionViewModel.js";
import {
  CONTINENTAL_GEOTHERM_SPAN_K,
  CRUST_BLOCK_HALF_WIDTH_M,
  CRUST_GEOTHERM_SPAN_K,
  FIXED_CONTINENTAL_DENSITY_KG_M3,
  FIXED_CONTINENTAL_THICKNESS_M,
  FIXED_OCEANIC_DENSITY_KG_M3,
  FIXED_OCEANIC_THICKNESS_M,
  MY_CRUST_THICKNESS_DEFAULT_M,
  MY_CRUST_THICKNESS_RANGE_M,
  SURFACE_TEMPERATURE_K,
  TERRAIN_DENSITY_KG_M3,
} from "../../PlateTectonicsConstants.js";
import { type RelaxationState, settledAt, stepRelaxation } from "./IsostaticRelaxation.js";

/** How far down the view reaches. */
export type CrustZoom = "crust" | "lithosphere" | "earth";

/** The zoom levels, in the order they appear in the radio-button group. */
export const CRUST_ZOOMS: readonly CrustZoom[] = ["crust", "lithosphere", "earth"];

/** Ratios run 0 to 1; both sliders start in the middle. */
const RATIO_RANGE = new Range(0, 1);
const RATIO_DEFAULT = 0.5;

/** One of the three blocks, resolved to the numbers the view and the probe need. */
export type CrustColumn = {
  /** Model x of the block's left and right edges, m. */
  readonly leftM: number;
  readonly rightM: number;

  /** Surface elevation, m above sea level. */
  readonly elevationM: number;

  /** Thickness, m. */
  readonly thicknessM: number;

  /** Bulk density, kg/m³. */
  readonly densityKgM3: number;

  /** Temperature rise from the top of this block to its base at full scale, K. */
  readonly geothermSpanK: number;

  /** How warm this block is, 0 to 1. The fixed blocks are at their nominal geotherm. */
  readonly temperatureRatio: number;
};

export class CrustModel implements TModel {
  // ── The user's crust ────────────────────────────────────────────────────────

  /** How warm the middle block is: 0 is the coolest crust, 1 the warmest. */
  public readonly temperatureRatioProperty = new NumberProperty(RATIO_DEFAULT, { range: RATIO_RANGE });

  /** What the middle block is made of: 0 is the most iron-rich, 1 the most silica-rich. */
  public readonly compositionRatioProperty = new NumberProperty(RATIO_DEFAULT, { range: RATIO_RANGE });

  /** Thickness of the middle block, m. */
  public readonly crustThicknessProperty = new NumberProperty(MY_CRUST_THICKNESS_DEFAULT_M, {
    range: MY_CRUST_THICKNESS_RANGE_M,
  });

  /** Bulk density of the middle block, kg/m³ — composition mixing plus thermal expansion. */
  public readonly crustDensityProperty: TReadOnlyProperty<number>;

  /** Where isostasy says the middle block's surface belongs, m. */
  public readonly targetElevationProperty: TReadOnlyProperty<number>;

  /** Where its surface actually is, m — relaxing toward the target. */
  public readonly crustElevationProperty: NumberProperty;

  // ── View state that belongs to the model ────────────────────────────────────

  /** Whether rock is painted by density, by temperature, or by both. */
  public readonly colorModeProperty = new Property<ColorMode>("density");

  /** Whether the layer and block labels are drawn. */
  public readonly showLabelsProperty = new BooleanProperty(true);

  /** How far down the view reaches. */
  public readonly zoomProperty = new Property<CrustZoom>("crust");

  /** Whether the screen is drawn as a 3-D block or as a flat section, and how stretched. */
  public readonly sectionView = new SectionViewModel();

  /**
   * Left end of the ruler, in model metres.
   *
   * Starts low and to the left, over open mantle: the one part of either section where
   * nothing else is drawn and no other tool or label is parked, so the ruler does not
   * open sitting on top of the first thing the user wants to look at.
   */
  public readonly rulerPositionProperty = new Property<Vector2>(new Vector2(-3 * CRUST_BLOCK_HALF_WIDTH_M, -42000), {
    valueComparisonStrategy: "equalsFunction",
  });

  // ── The probe ───────────────────────────────────────────────────────────────

  /** Whether the probe is still in its toolbox rather than out in the cross-section. */
  public readonly probeInToolboxProperty = new BooleanProperty(true);

  /**
   * Where the probe's tip sits, in model metres (x across, elevation up).
   *
   * Opens in the mantle below the fixed oceanic block rather than at the origin: the
   * origin is the middle of the user's crust, where the probe's readout would sit on
   * top of that block's own label, and where it would be in the way of the first thing
   * anyone does on this screen.
   */
  public readonly probePositionProperty = new Property<Vector2>(new Vector2(-2 * CRUST_BLOCK_HALF_WIDTH_M, -30000), {
    valueComparisonStrategy: "equalsFunction",
  });

  /**
   * Velocity of the relaxing surface, m/s. Deliberately not a Property: it is an
   * integrator's scratch state, nothing observes it, and exposing it would invite the
   * view to draw something that is not physics.
   */
  private crustVelocityMPerS = 0;

  public constructor() {
    this.crustDensityProperty = new DerivedProperty(
      [this.compositionRatioProperty, this.temperatureRatioProperty],
      (composition, temperature) => crustDensity(composition, temperature),
    );

    this.targetElevationProperty = new DerivedProperty(
      [this.crustThicknessProperty, this.crustDensityProperty],
      (thickness, density) => airyElevation(thickness, density),
    );

    // Opens already settled, so the screen is in equilibrium before it is touched.
    this.crustElevationProperty = new NumberProperty(this.targetElevationProperty.value);
  }

  /** Index of the user's block within {@link columns}. */
  public static readonly MY_CRUST_INDEX = 1;

  /** The middle block — the one the sliders control. */
  public get myCrust(): CrustColumn {
    const column = this.columns[CrustModel.MY_CRUST_INDEX];
    if (!column) {
      throw new Error("columns must always contain the user's crust");
    }
    return column;
  }

  /** The three blocks, left to right, as the view and the probe want them. */
  public get columns(): readonly CrustColumn[] {
    const half = CRUST_BLOCK_HALF_WIDTH_M;
    return [
      {
        leftM: -3 * half,
        rightM: -half,
        elevationM: airyElevation(FIXED_OCEANIC_THICKNESS_M, FIXED_OCEANIC_DENSITY_KG_M3),
        thicknessM: FIXED_OCEANIC_THICKNESS_M,
        densityKgM3: FIXED_OCEANIC_DENSITY_KG_M3,
        geothermSpanK: CONTINENTAL_GEOTHERM_SPAN_K,
        temperatureRatio: 1,
      },
      {
        leftM: -half,
        rightM: half,
        elevationM: this.crustElevationProperty.value,
        thicknessM: this.crustThicknessProperty.value,
        densityKgM3: this.crustDensityProperty.value,
        geothermSpanK: CRUST_GEOTHERM_SPAN_K,
        temperatureRatio: this.temperatureRatioProperty.value,
      },
      {
        leftM: half,
        rightM: 3 * half,
        elevationM: airyElevation(FIXED_CONTINENTAL_THICKNESS_M, FIXED_CONTINENTAL_DENSITY_KG_M3),
        thicknessM: FIXED_CONTINENTAL_THICKNESS_M,
        densityKgM3: FIXED_CONTINENTAL_DENSITY_KG_M3,
        geothermSpanK: CONTINENTAL_GEOTHERM_SPAN_K,
        temperatureRatio: 1,
      },
    ];
  }

  /**
   * The block containing a given model x, or null between and beyond them.
   *
   * Half-open on the right so neighbouring blocks do not both claim a shared edge, except
   * at the outermost edge of the last block, which has no neighbour to hand the point on
   * to. Without that exception the right-hand edge of the viewport — which is exactly that
   * outermost edge — reads as being outside every block, so the painter and the probe both
   * treat the last sliver of the picture as open mantle.
   */
  public columnAt(xM: number): CrustColumn | null {
    const columns = this.columns;
    const last = columns[columns.length - 1];
    if (last && xM >= last.leftM && xM <= last.rightM) {
      return last;
    }
    return columns.find((column) => xM >= column.leftM && xM < column.rightM) ?? null;
  }

  /** Which named shell a point is in, for the probe's readout and the labels. */
  public layerAtPoint(xM: number, elevationM: number): EarthLayer {
    const column = this.columnAt(xM);
    const crustBaseKm = column ? (column.elevationM - column.thicknessM) / -1000 : 0;
    return layerAt(-elevationM / 1000, crustBaseKm);
  }

  /**
   * Density at a point, kg/m³ — what the probe reads.
   *
   * Above the surface there is nothing to weigh, so the probe reports the surface rock
   * itself rather than air; that matches what a hand sample would give and avoids a
   * reading that swings by three orders of magnitude as the probe crosses the ground.
   */
  public densityAtPoint(xM: number, elevationM: number): number {
    const column = this.columnAt(xM);
    if (!column) {
      return densityAt(Math.max(0, -elevationM / 1000));
    }
    if (elevationM > column.elevationM) {
      return TERRAIN_DENSITY_KG_M3;
    }
    if (elevationM > column.elevationM - column.thicknessM) {
      return column.densityKgM3;
    }
    return densityAt(-elevationM / 1000);
  }

  /** Temperature at a point, K — what the probe reads. */
  public temperatureAtPoint(xM: number, elevationM: number): number {
    const column = this.columnAt(xM);
    if (!column) {
      return SURFACE_TEMPERATURE_K;
    }
    if (elevationM > column.elevationM) {
      return SURFACE_TEMPERATURE_K;
    }
    const depthBelowTopM = column.elevationM - elevationM;
    if (depthBelowTopM <= column.thicknessM) {
      return crustGeotherm(depthBelowTopM, column.thicknessM, column.temperatureRatio, column.geothermSpanK);
    }
    const crustBaseKm = (column.elevationM - column.thicknessM) / -1000;
    const baseTemperature = crustGeotherm(
      column.thicknessM,
      column.thicknessM,
      column.temperatureRatio,
      column.geothermSpanK,
    );
    return layerTemperatureAt(-elevationM / 1000, crustBaseKm, baseTemperature);
  }

  /**
   * Steps the relaxation by `dt` seconds. There is no play/pause on this screen: the
   * crust is always seeking equilibrium, and once it is there this is a no-op.
   */
  public step(dt: number): void {
    const state: RelaxationState = {
      elevationM: this.crustElevationProperty.value,
      velocityMPerS: this.crustVelocityMPerS,
    };
    const next = stepRelaxation(state, this.targetElevationProperty.value, dt);
    this.crustElevationProperty.value = next.elevationM;
    this.crustVelocityMPerS = next.velocityMPerS;
  }

  /** Resets all model state to its initial values (the Reset All button). */
  public reset(): void {
    this.temperatureRatioProperty.reset();
    this.compositionRatioProperty.reset();
    this.crustThicknessProperty.reset();
    this.colorModeProperty.reset();
    this.showLabelsProperty.reset();
    this.zoomProperty.reset();
    this.sectionView.reset();
    this.rulerPositionProperty.reset();
    this.probeInToolboxProperty.reset();
    this.probePositionProperty.reset();

    // Snap rather than relax: Reset All should look like a reset, not like an
    // animation the user has to wait out.
    const settled = settledAt(this.targetElevationProperty.value);
    this.crustElevationProperty.value = settled.elevationM;
    this.crustVelocityMPerS = settled.velocityMPerS;
  }

  /** Releases the derived properties, so a discarded screen can be collected. */
  public dispose(): void {
    this.sectionView.dispose();
    this.targetElevationProperty.dispose();
    this.crustDensityProperty.dispose();
  }
}
