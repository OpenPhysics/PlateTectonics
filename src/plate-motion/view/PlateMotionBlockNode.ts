/**
 * PlateMotionBlockNode.ts
 *
 * The Plate Motion screen drawn as a 3-D block: two plates meeting at a boundary, cut
 * open across the front face, with the landscape the boundary is building on top.
 *
 * ── What the block adds ───────────────────────────────────────────────────────
 * Each of the three behaviours makes a landform, and flat none of them looks like one.
 * A collision draws a triangle; as a block it raises a mountain range with snow on it. A
 * rift draws a notch; as a block it opens a sea. A subduction zone draws a wedge going
 * down; as a block it puts a trench offshore and a line of volcanoes inland of it, which
 * is the arrangement the screen exists to explain.
 *
 * ── Why the section is painted as bands rather than sampled ───────────────────
 * The base class's default section samples a colour per grid cell, which is what the
 * Crust screen needs because its content is a continuous field. Here the content is a
 * set of layers with exact boundaries — the top of the crust, its base, the base of the
 * lithosphere, the two edges of the descending slab — and those boundaries carry the
 * meaning. Sampling them onto a grid would turn every one of them into a staircase, so
 * `paintSectionFace` is overridden to lay each band down as a single polygon closed from
 * the polylines PlateGeometry already produces. That is also much cheaper, which matters
 * because this screen repaints every frame while its clock runs.
 *
 * Everything drawn here comes from `boundaryGeometry`; the painter owns z-order and
 * nothing else, exactly as PlateMotionCanvasNode does. If the picture is wrong, the
 * geometry is wrong, and there is a unit test for that.
 */

import { Multilink } from "scenerystack/axon";
import { type Bounds2, Vector2 } from "scenerystack/dot";
import type { Color } from "scenerystack/scenery";
import {
  BLOCK_LAYER,
  type BlockBounds,
  EarthBlockNode,
  type EarthBlockNodeOptions,
} from "../../common/view/EarthBlockNode.js";
import { materialFill } from "../../common/view/EarthMaterial.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import {
  BLOCK_DEPTH_PER_HEIGHT,
  BLOCK_MAX_DEPTH_FRACTION,
  LITHOSPHERIC_MANTLE_DENSITY_KG_M3,
  MANTLE_DENSITY_KG_M3,
  PLATE_X_LIMIT_M,
  SLAB_DENSITY_KG_M3,
  SURFACE_TEMPERATURE_K,
} from "../../PlateTectonicsConstants.js";
import { type BoundaryGeometry, boundaryGeometry, type PlateOutline } from "../model/PlateGeometry.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";
import { simpleMantleTemperatureK } from "../model/PlateThermal.js";
import { plateProperties } from "../model/PlateType.js";

/** Horizontal bands the mantle backdrop is painted in, so its geotherm shows as a gradient. */
const MANTLE_BANDS = 26;

/**
 * Draw-order groups within the section, all above {@link BLOCK_LAYER.sectionRock}.
 *
 * The order is the content: the slab has to pass *under* the overriding plate, or it
 * looks like it is riding over it; magma has to sit over the slab that produced it and
 * over the crust it has not yet broken through, or the arc reads as unconnected to the
 * subduction that causes it.
 */
const SECTION_LAYER = {
  mantle: BLOCK_LAYER.sectionRock,
  slab: BLOCK_LAYER.sectionRock + 1,
  lithosphere: BLOCK_LAYER.sectionRock + 2,
  crust: BLOCK_LAYER.sectionRock + 3,
  magma: BLOCK_LAYER.sectionFeature,
  volcanoes: BLOCK_LAYER.sectionFeature + 1,
  smoke: BLOCK_LAYER.sectionFeature + 2,
} as const;

/** Elevation of the ground far from the boundary before any plate has been dropped, m. */
const EMPTY_GROUND_M = -4000;

/**
 * How wide a volcano is drawn relative to how tall, as seen on screen.
 *
 * Matches the ratio the flat painter uses in pixels, so the two views draw the same cone.
 */
const VOLCANO_WIDTH_PER_HEIGHT = 0.8;

/** How many puffs are in the air above an erupting volcano at once. */
const SMOKE_PUFFS = 5;

/** How long one puff takes to climb its full height and fade out, Myr. */
const SMOKE_PERIOD_MYR = 1.6;

/** How far a puff rises, as a multiple of the volcano's own height. */
const SMOKE_RISE_PER_HEIGHT = 2.2;

/** How far a puff drifts sideways by the end of its life, per volcano half-width. */
const SMOKE_DRIFT = 1.4;

/** A puff's radius as a multiple of the volcano's half-width, at birth and at its end. */
const SMOKE_START_RADIUS = 0.45;
const SMOKE_GROWTH = 1.3;

/** Opacity of a puff at birth; it fades linearly from there. */
const SMOKE_MAX_ALPHA = 0.55;

export type PlateMotionBlockNodeOptions = EarthBlockNodeOptions;

export class PlateMotionBlockNode extends EarthBlockNode {
  private readonly model: PlateMotionModel;

  private readonly topM: number;

  private readonly bottomM: number;

  /**
   * The geometry for the moment being painted.
   *
   * Cached for the duration of one repaint rather than recomputed by each of the five
   * things that need it — the terrain, the walls, the bands, the features and the
   * overlay all want the same instant, and `boundaryGeometry` walks forty samples of
   * three polylines per plate.
   */
  private cachedGeometry: BoundaryGeometry | null = null;

  public constructor(
    model: PlateMotionModel,
    viewBounds: Bounds2,
    extent: { topM: number; bottomM: number },
    providedOptions?: PlateMotionBlockNodeOptions,
  ) {
    super(viewBounds, providedOptions);

    this.model = model;
    this.topM = extent.topM;
    this.bottomM = extent.bottomM;

    const repaint = Multilink.multilinkAny(
      [
        model.leftPlateTypeProperty,
        model.rightPlateTypeProperty,
        model.motionTypeProperty,
        model.timeMillionsOfYearsProperty,
        model.colorModeProperty,
        model.showSeawaterProperty,
        model.sectionView.verticalExaggerationProperty,
        PlateTectonicsColors.skyColorProperty,
        PlateTectonicsColors.seaWaterColorProperty,
        PlateTectonicsColors.magmaColorProperty,
        PlateTectonicsColors.volcanoColorProperty,
        PlateTectonicsColors.volcanicSmokeColorProperty,
        PlateTectonicsColors.densityRampLowColorProperty,
        PlateTectonicsColors.densityRampHighColorProperty,
        PlateTectonicsColors.temperatureRampLowColorProperty,
        PlateTectonicsColors.temperatureRampHighColorProperty,
        PlateTectonicsColors.terrainDeepSeabedColorProperty,
        PlateTectonicsColors.terrainShallowSeabedColorProperty,
        PlateTectonicsColors.terrainGrassColorProperty,
        PlateTectonicsColors.terrainSnowColorProperty,
      ],
      () => {
        this.cachedGeometry = null;
        this.setVerticalExaggeration(model.sectionView.verticalExaggerationProperty.value);
        this.invalidatePaint();
      },
    );

    this.disposeEmitter.addListener(() => repaint.dispose());
  }

  protected blockBounds(): BlockBounds {
    const width = 2 * PLATE_X_LIMIT_M;
    const height = this.topM - this.bottomM;
    return {
      minXM: -PLATE_X_LIMIT_M,
      maxXM: PLATE_X_LIMIT_M,
      minYM: this.bottomM,
      maxYM: this.topM,
      minZM: -Math.min(width * BLOCK_MAX_DEPTH_FRACTION, height * BLOCK_DEPTH_PER_HEIGHT),
      maxZM: 0,
    };
  }

  /**
   * The boundary at the moment being painted.
   *
   * Falls back to the resting shape when no motion has been chosen, so a boundary that
   * has been built but not started still has ground on it. Before either plate is
   * dropped there is no geometry at all and callers get null.
   */
  private geometry(): BoundaryGeometry | null {
    if (this.cachedGeometry) {
      return this.cachedGeometry;
    }
    const left = this.model.leftPlateTypeProperty.value;
    const right = this.model.rightPlateTypeProperty.value;
    if (!(left && right)) {
      return null;
    }
    const motion = this.model.motionTypeProperty.value;
    this.cachedGeometry = motion
      ? boundaryGeometry(motion, left, right, this.model.timeMillionsOfYearsProperty.value)
      : boundaryGeometry("convergent", left, right, 0);
    return this.cachedGeometry;
  }

  /**
   * The ground profile across the whole section, left edge to right edge.
   *
   * The same merge PlateMotionCanvasNode does, and for the same reason: the two plates
   * tile the section between them, but neither the order of their samples nor which of
   * them covers which side is fixed, and sorting by x is what makes the result
   * independent of that.
   */
  private groundProfile(): Vector2[] | null {
    const geometry = this.geometry();
    if (!geometry) {
      return null;
    }
    return [...geometry.left.crustTop, ...geometry.right.crustTop].sort((a, b) => a.x - b.x);
  }

  /**
   * Elevation of the ground at a point.
   *
   * Constant in z: the boundary is a two-dimensional model extruded back into the block,
   * which is exactly what a cross-section assumes. Interpolated across x from the merged
   * ground profile, and clamped at both ends so the block's edges sit at the elevation
   * of the outermost sample rather than falling to zero.
   */
  protected terrainElevationM(xM: number): number {
    const profile = this.groundProfile();
    const first = profile?.[0];
    const last = profile?.[profile.length - 1];
    if (!(profile && first && last)) {
      return EMPTY_GROUND_M;
    }
    if (xM <= first.x) {
      return first.y;
    }
    if (xM >= last.x) {
      return last.y;
    }

    for (let i = 1; i < profile.length; i++) {
      const previous = profile[i - 1];
      const point = profile[i];
      if (!(previous && point) || xM > point.x) {
        continue;
      }
      const span = point.x - previous.x;
      const t = span <= 0 ? 0 : (xM - previous.x) / span;
      return previous.y + (point.y - previous.y) * t;
    }
    return last.y;
  }

  /**
   * The rock at a point, for the block's two end walls.
   *
   * Only the walls use this — the front face is painted as bands below. The walls are at
   * the far edges of the section, well outside anything the boundary is doing, so the
   * layer test only has to resolve crust, lithospheric mantle and asthenosphere.
   */
  protected materialColorAt(xM: number, elevationM: number): Color | null {
    if (elevationM > this.terrainElevationM(xM)) {
      return null;
    }
    const mode = this.model.colorModeProperty.value;
    const geometry = this.geometry();
    if (!geometry) {
      return materialFill(mode, MANTLE_DENSITY_KG_M3, simpleMantleTemperatureK(-elevationM));
    }

    const outline = xM < 0 ? geometry.left : geometry.right;
    const type = (xM < 0 ? this.model.leftPlateTypeProperty : this.model.rightPlateTypeProperty).value;

    if (type && elevationM >= profileAt(outline.crustBase, xM)) {
      return materialFill(mode, plateProperties(type).densityKgM3, SURFACE_TEMPERATURE_K + 450);
    }
    if (elevationM >= profileAt(outline.lithosphereBase, xM)) {
      return materialFill(mode, LITHOSPHERIC_MANTLE_DENSITY_KG_M3, SURFACE_TEMPERATURE_K + 900);
    }
    return materialFill(mode, MANTLE_DENSITY_KG_M3, simpleMantleTemperatureK(-elevationM));
  }

  protected get showWater(): boolean {
    return this.model.showSeawaterProperty.value;
  }

  /**
   * The front face: mantle behind, then the slab, then the two plates over it.
   *
   * Each band is one polygon rather than a run of sampled cells, so the boundaries the
   * screen is about stay exact. The mantle is the exception — it is banded horizontally
   * so its geotherm reads as a gradient rather than as one flat colour.
   */
  protected override paintSectionFace(): void {
    const mode = this.model.colorModeProperty.value;
    const block = this.blockBounds();

    // The mantle first, as a backdrop the plates move through. Painted right across the
    // section and then covered by whatever sits on top of it, rather than clipped to
    // below the ground: on the front face the plates and the water cover everything the
    // mantle should not show through, and a clip would cost a path per band.
    const bandHeight = (block.maxYM - block.minYM) / MANTLE_BANDS;
    for (let band = 0; band < MANTLE_BANDS; band++) {
      const topM = block.maxYM - band * bandHeight;
      const bottomM = topM - bandHeight;
      const temperatureK = simpleMantleTemperatureK(-(topM + bottomM) / 2);
      this.addFrontQuad(
        block.minXM,
        topM,
        block.maxXM,
        bottomM,
        materialFill(mode, MANTLE_DENSITY_KG_M3, temperatureK),
        SECTION_LAYER.mantle,
      );
    }

    const geometry = this.geometry();
    if (!geometry) {
      return;
    }

    if (geometry.slab.length > 1) {
      this.paintSlab(geometry, mode);
    }

    this.paintPlate(geometry.left, this.model.leftPlateTypeProperty.value, mode);
    this.paintPlate(geometry.right, this.model.rightPlateTypeProperty.value, mode);
  }

  /** One plate: lithospheric mantle first, then the crust on top of it. */
  private paintPlate(
    outline: PlateOutline,
    type: Parameters<typeof plateProperties>[0] | null,
    mode: Parameters<typeof materialFill>[0],
  ): void {
    if (!type) {
      return;
    }

    // Drawn at the lithospheric density rather than the asthenosphere's: the two are the
    // same rock at different temperatures, and painting both at the mantle density makes
    // the rigid part of every plate vanish into its surroundings in density mode.
    this.addFrontBand(
      outline.crustBase,
      outline.lithosphereBase,
      materialFill(mode, LITHOSPHERIC_MANTLE_DENSITY_KG_M3, SURFACE_TEMPERATURE_K + 900),
      SECTION_LAYER.lithosphere,
    );
    this.addFrontBand(
      outline.crustTop,
      outline.crustBase,
      materialFill(mode, plateProperties(type).densityKgM3, SURFACE_TEMPERATURE_K + 450),
      SECTION_LAYER.crust,
    );
  }

  /** The descending slab, as a ribbon of constant thickness about its centreline. */
  private paintSlab(geometry: BoundaryGeometry, mode: Parameters<typeof materialFill>[0]): void {
    // Cut off at the bottom of the block: a slab that has descended past the view would
    // otherwise be drawn smeared along the floor, since every point below it clamps there.
    const past = geometry.slab.findIndex((point) => point.y < this.bottomM);
    const centreline = past < 0 ? geometry.slab : geometry.slab.slice(0, past + 1);
    if (centreline.length < 2) {
      return;
    }

    // Offset perpendicular to the local heading, so the ribbon keeps its thickness round
    // the bend instead of pinching where the curve is tightest.
    const upper: Vector2[] = [];
    const lower: Vector2[] = [];
    for (let i = 0; i < centreline.length; i++) {
      const point = centreline[i];
      const next = centreline[Math.min(centreline.length - 1, i + 1)];
      const previous = centreline[Math.max(0, i - 1)];
      if (!(point && next && previous)) {
        continue;
      }
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = (-dy / length) * geometry.slabHalfThicknessM;
      const ny = (dx / length) * geometry.slabHalfThicknessM;
      upper.push(point.plusXY(nx, ny));
      lower.push(point.plusXY(-nx, -ny));
    }

    // A slab is cold — that is why it is dense enough to sink, and why it stays rigid far
    // below the depth where the surrounding mantle does not.
    this.addFrontBand(
      upper,
      lower,
      materialFill(mode, SLAB_DENSITY_KG_M3, SURFACE_TEMPERATURE_K + 500),
      SECTION_LAYER.slab,
    );
  }

  /** Magma and the volcanoes it feeds, over the plates they have come up through. */
  protected override paintSectionFeatures(): void {
    const geometry = this.geometry();
    if (!geometry) {
      return;
    }

    if (geometry.magma.length > 2) {
      this.addFrontPolygon(geometry.magma, PlateTectonicsColors.magmaColorProperty.value, SECTION_LAYER.magma);
    }

    const volcanoColor = PlateTectonicsColors.volcanoColorProperty.value;
    for (const volcano of geometry.volcanoes) {
      // Half-width from the height, so a volcano keeps its shape whatever the camera is
      // doing — and multiplied by the exaggeration, because only the height is stretched.
      // Without that factor a stretched section draws its arc as a needle: the cone grows
      // three times taller while staying exactly as wide.
      const halfWidth = Math.max(8000, volcano.heightM * VOLCANO_WIDTH_PER_HEIGHT * this.verticalExaggeration);
      this.addFrontPolygon(
        [
          new Vector2(volcano.xM, volcano.baseM + volcano.heightM),
          new Vector2(volcano.xM + halfWidth, volcano.baseM),
          new Vector2(volcano.xM - halfWidth, volcano.baseM),
        ],
        volcanoColor,
        SECTION_LAYER.volcanoes,
      );

      this.paintSmoke(volcano.xM, volcano.baseM + volcano.heightM, volcano.heightM, halfWidth);
    }
  }

  /**
   * Ash and steam over an erupting arc volcano.
   *
   * PhET's Java version emitted these from a Poisson process into a list of live
   * `SmokePuff`s. Here each puff is a pure function of the clock instead — a fixed phase
   * offset, advanced by the reconstruction time and wrapped — for the reason the whole
   * screen is built that way: nothing may accumulate, or Rewind, step-while-paused and
   * scrubbing the clock all stop being exact. See doc/implementation-notes.md. The
   * visible difference is that the puffs repeat rather than being individually random,
   * which at this size is not a difference anyone can see.
   */
  private paintSmoke(xM: number, apexM: number, volcanoHeightM: number, volcanoHalfWidthM: number): void {
    const timeMyr = this.model.timeMillionsOfYearsProperty.value;
    const base = PlateTectonicsColors.volcanicSmokeColorProperty.value;

    // Measured against the cone's own height, so the plume is always a couple of volcanoes
    // tall however big the volcano has grown. Against its *width* it would instead be
    // driven by the minimum width a cone is allowed to be drawn at, which is a floor for
    // legibility rather than anything about the volcano — and a plume scaled to that
    // climbs off the top of the block.
    //
    // In unexaggerated metres, unlike the width: elevations are what the exaggeration
    // stretches, so a rise given here in true metres already grows with the section.
    const riseM = volcanoHeightM * SMOKE_RISE_PER_HEIGHT;

    for (let index = 0; index < SMOKE_PUFFS; index++) {
      const phase = (timeMyr / SMOKE_PERIOD_MYR + index / SMOKE_PUFFS) % 1;

      // Grows and fades as it climbs, so the plume thins out with height.
      const radiusM = volcanoHalfWidthM * (SMOKE_START_RADIUS + phase * SMOKE_GROWTH);
      const centreXM = xM + phase * volcanoHalfWidthM * SMOKE_DRIFT;
      const centreYM = apexM + phase * riseM;
      const color = base.withAlpha(SMOKE_MAX_ALPHA * (1 - phase));

      // An octagon rather than a circle: the renderer takes polygons, and at this size
      // eight sides are indistinguishable from a disc.
      const corners: Vector2[] = [];
      for (let corner = 0; corner < 8; corner++) {
        const angle = (corner / 8) * 2 * Math.PI;
        corners.push(new Vector2(centreXM + radiusM * Math.cos(angle), centreYM + radiusM * Math.sin(angle)));
      }
      this.addFrontPolygon(corners, color, SECTION_LAYER.smoke);
    }
  }

  /**
   * Which way each plate is going, as an arrow over each half of the section.
   *
   * In model metres rather than view pixels, unlike the flat painter's arrows, so that
   * they sit on the plates they describe however the block is framed or stretched — and
   * so that they foreshorten with the rest of the picture instead of floating above it
   * at a fixed size.
   */
  protected override paintOverlay(): void {
    const motion = this.model.motionTypeProperty.value;
    const geometry = this.geometry();
    if (!(motion && geometry)) {
      return;
    }

    const diverging = motion === "divergent";
    const color = diverging
      ? PlateTectonicsColors.divergentBoundaryColorProperty.value
      : PlateTectonicsColors.convergentBoundaryColorProperty.value;

    for (const sign of [-1, 1] as const) {
      // Converging plates point inwards, diverging plates outwards.
      const direction = diverging ? sign : -sign;
      const tailXM = sign * ARROW_ANCHOR_XM;
      const tipXM = tailXM + direction * ARROW_LENGTH_M;
      const headBaseXM = tipXM - direction * ARROW_HEAD_M;

      // Above the ground under the tail rather than above sea level, so an arrow over a
      // mountain belt does not end up buried in it — but clamped inside the top of the
      // block, because the camera frames the block and anything above it is off screen.
      // The clearance is a fraction of the block's height rather than a fixed distance,
      // which keeps the arrow the same distance up the *picture* at every exaggeration:
      // stretching the section stretches the block, and the camera refits to match.
      const block = this.blockBounds();
      const clearanceM = (block.maxYM - block.minYM) * ARROW_CLEARANCE_FRACTION;
      const yM = Math.min(block.maxYM - clearanceM, this.terrainElevationM(tailXM) + clearanceM);

      this.addFrontPolygon(
        [
          new Vector2(tailXM, yM + ARROW_HALF_WIDTH_M),
          new Vector2(headBaseXM, yM + ARROW_HALF_WIDTH_M),
          new Vector2(headBaseXM, yM - ARROW_HALF_WIDTH_M),
          new Vector2(tailXM, yM - ARROW_HALF_WIDTH_M),
        ],
        color,
        BLOCK_LAYER.overlay,
      );
      this.addFrontPolygon(
        [
          new Vector2(tipXM, yM),
          new Vector2(headBaseXM, yM - ARROW_HEAD_HALF_WIDTH_M),
          new Vector2(headBaseXM, yM + ARROW_HEAD_HALF_WIDTH_M),
        ],
        color,
        BLOCK_LAYER.overlay,
      );
    }
  }
}

/** Where each motion arrow starts, m either side of the boundary. */
const ARROW_ANCHOR_XM = 320000;

/** Length, head length, and half-widths of a motion arrow, m. */
const ARROW_LENGTH_M = 190000;
const ARROW_HEAD_M = 70000;
const ARROW_HALF_WIDTH_M = 5000;
const ARROW_HEAD_HALF_WIDTH_M = 17000;

/** How far above the ground an arrow floats, as a fraction of the block's height. */
const ARROW_CLEARANCE_FRACTION = 0.05;

/**
 * Elevation of a profile at a given x, by linear interpolation.
 *
 * Free-standing rather than a method because it makes no use of the node: it is the same
 * "read a polyline as a function of x" that the ground profile does, applied to the
 * layer boundaries instead. Clamps outside the profile's own range.
 */
function profileAt(profile: readonly Vector2[], xM: number): number {
  if (profile.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  // The polylines run in whichever direction their behaviour produced them — see
  // PlateOutline — so the ends have to be identified by value, not by index.
  let low = profile[0];
  let high = profile[0];
  for (const point of profile) {
    if (!low || point.x < low.x) {
      low = point;
    }
    if (!high || point.x > high.x) {
      high = point;
    }
  }
  if (!(low && high)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (xM <= low.x) {
    return low.y;
  }
  if (xM >= high.x) {
    return high.y;
  }

  let best = low;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of profile) {
    const distance = Math.abs(point.x - xM);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best.y;
}
