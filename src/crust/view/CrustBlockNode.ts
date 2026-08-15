/**
 * CrustBlockNode.ts
 *
 * The Crust screen drawn as a 3-D block: three columns of crust floating in the mantle,
 * with the landscape each one produces on top of it.
 *
 * ── What the block adds over the flat section ─────────────────────────────────
 * The claim this screen makes is that a block of crust *floats*, and that where its
 * surface ends up is a consequence of how thick and how dense it is. Flat, that reads as
 * a rectangle sliding up and down. As a block it reads as what it actually is: a
 * continent standing above the water beside an ocean floor lying under it, with the join
 * between them a coastline. Making the middle column denser does not just move a line —
 * it drowns a landscape.
 *
 * ── Where the ground comes from ───────────────────────────────────────────────
 * Each column has one elevation, so the terrain would be three flat plateaux separated
 * by vertical cliffs. PhET's Java version smoothed those joins with `TerrainConnectorStrip`
 * and this does the same thing analytically, over {@link JOIN_BLEND_M}: a real crustal
 * boundary is a slope, and a cliff at the join would read as a fault the screen is not
 * modelling.
 *
 * The rock itself is sampled from the model rather than filled per layer, for the same
 * reason CrustCanvasNode samples it — a continuous geotherm and a continuous density
 * profile are the content, and flat-shaded layers would throw both away.
 */

import { Multilink } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import type { Color } from "scenerystack/scenery";
import { type BlockBounds, EarthBlockNode, type EarthBlockNodeOptions } from "../../common/view/EarthBlockNode.js";
import { materialFill } from "../../common/view/EarthMaterial.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { BLOCK_DEPTH_PER_HEIGHT, BLOCK_MAX_DEPTH_FRACTION } from "../../PlateTectonicsConstants.js";
import type { CrustModel } from "../model/CrustModel.js";

/**
 * How far either side of a join between two columns the ground ramps from one
 * elevation to the other, m. Roughly a fifth of a column's width — wide enough to read
 * as a slope rather than a step, narrow enough that each column still has a plateau of
 * its own to be judged by.
 */
const JOIN_BLEND_M = 30000;

/** A smooth ramp from 0 to 1 with zero slope at both ends, so the joins have no crease. */
function smoothStep(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped * (3 - 2 * clamped);
}

export type CrustBlockNodeOptions = EarthBlockNodeOptions;

export class CrustBlockNode extends EarthBlockNode {
  private readonly model: CrustModel;

  /** The vertical extent of the block, which the zoom control changes. */
  private depthM: number;

  private halfWidthM: number;

  private topM: number;

  public constructor(
    model: CrustModel,
    viewBounds: Bounds2,
    extent: { halfWidthM: number; topM: number; bottomM: number },
    providedOptions?: CrustBlockNodeOptions,
  ) {
    super(viewBounds, providedOptions);

    this.model = model;
    this.halfWidthM = extent.halfWidthM;
    this.topM = extent.topM;
    this.depthM = -extent.bottomM;

    const repaint = Multilink.multilinkAny(
      [
        model.crustElevationProperty,
        model.crustThicknessProperty,
        model.crustDensityProperty,
        model.temperatureRatioProperty,
        model.colorModeProperty,
        PlateTectonicsColors.skyColorProperty,
        PlateTectonicsColors.seaWaterColorProperty,
        PlateTectonicsColors.densityRampLowColorProperty,
        PlateTectonicsColors.densityRampHighColorProperty,
        PlateTectonicsColors.temperatureRampLowColorProperty,
        PlateTectonicsColors.temperatureRampHighColorProperty,
        PlateTectonicsColors.terrainDeepSeabedColorProperty,
        PlateTectonicsColors.terrainShallowSeabedColorProperty,
        PlateTectonicsColors.terrainGrassColorProperty,
        PlateTectonicsColors.terrainSnowColorProperty,

        // In the same multilink as everything else, because changing the stretch has to
        // reframe the camera *before* the repaint it triggers, and a separate link would
        // leave the ordering of the two up to registration order.
        model.sectionView.verticalExaggerationProperty,
      ],
      () => {
        this.setVerticalExaggeration(model.sectionView.verticalExaggerationProperty.value);
        this.invalidatePaint();
      },
    );

    this.disposeEmitter.addListener(() => repaint.dispose());
  }

  /**
   * Re-aims the block after a zoom change.
   *
   * Takes the same extent the flat view's CrossSectionScale is built from, so the two
   * views of a given zoom level are showing the same slice of the Earth — only the
   * vertical mapping differs, and on the block it is uniform.
   */
  public setExtent(extent: { halfWidthM: number; topM: number; bottomM: number }): void {
    this.halfWidthM = extent.halfWidthM;
    this.topM = extent.topM;
    this.depthM = -extent.bottomM;
    this.invalidateCamera();
  }

  protected blockBounds(): BlockBounds {
    const width = 2 * this.halfWidthM;
    const height = this.topM + this.depthM;
    return {
      minXM: -this.halfWidthM,
      maxXM: this.halfWidthM,
      minYM: -this.depthM,
      maxYM: this.topM,
      minZM: -Math.min(width * BLOCK_MAX_DEPTH_FRACTION, height * BLOCK_DEPTH_PER_HEIGHT),
      maxZM: 0,
    };
  }

  /**
   * The ground across the block.
   *
   * Constant in z — none of the three columns varies front to back — but blended across
   * x wherever two columns meet, so the joins are slopes.
   */
  protected terrainElevationM(xM: number): number {
    const columns = this.model.columns;
    if (columns.length === 0) {
      return 0;
    }

    // Clamp beyond the ends rather than falling off into open mantle: the three columns
    // tile the whole section, and the block's ends are the outer edges of the outer two.
    const first = columns[0];
    const last = columns[columns.length - 1];
    if (!(first && last)) {
      return 0;
    }
    if (xM <= first.leftM) {
      return first.elevationM;
    }
    if (xM >= last.rightM) {
      return last.elevationM;
    }

    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      if (!column || xM < column.leftM || xM > column.rightM) {
        continue;
      }

      // Inside a column, but possibly within reach of a join at either end.
      const previous = columns[i - 1];
      if (previous && xM < column.leftM + JOIN_BLEND_M) {
        const t = 0.5 + (xM - column.leftM) / (2 * JOIN_BLEND_M);
        return previous.elevationM + (column.elevationM - previous.elevationM) * smoothStep(t);
      }

      const next = columns[i + 1];
      if (next && xM > column.rightM - JOIN_BLEND_M) {
        const t = (xM - (column.rightM - JOIN_BLEND_M)) / (2 * JOIN_BLEND_M);
        return column.elevationM + (next.elevationM - column.elevationM) * smoothStep(t);
      }

      return column.elevationM;
    }

    return first.elevationM;
  }

  /**
   * The rock at a point, or null above the ground.
   *
   * Returning null above the surface rather than a sky colour is what lets the base
   * class stop each column of the section at its own ground level, so the section's top
   * edge is the landscape rather than a straight line.
   */
  protected materialColorAt(xM: number, elevationM: number): Color | null {
    if (elevationM > this.terrainElevationM(xM)) {
      return null;
    }
    return materialFill(
      this.model.colorModeProperty.value,
      this.model.densityAtPoint(xM, elevationM),
      this.model.temperatureAtPoint(xM, elevationM),
    );
  }

  /** The Crust screen always has an ocean; whether any of it is wet depends on the sliders. */
  protected get showWater(): boolean {
    return true;
  }
}
