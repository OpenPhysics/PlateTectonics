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
  ARC_X_DECAY_M,
  ARC_Z_PERIOD_FACTOR_M,
  BLOCK_DEPTH_PER_HEIGHT,
  BLOCK_MAX_DEPTH_FRACTION,
  LITHOSPHERIC_MANTLE_DENSITY_KG_M3,
  MANTLE_DENSITY_KG_M3,
  PLATE_X_LIMIT_M,
  SLAB_DENSITY_KG_M3,
  SURFACE_TEMPERATURE_K,
} from "../../PlateTectonicsConstants.js";
import {
  arcCones,
  arcRiseM,
  arcSectionProfile,
  type BoundaryGeometry,
  boundaryGeometry,
  elevationAtX,
  type PlateOutline,
} from "../model/PlateGeometry.js";
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
        PlateTectonicsColors.convergentBoundaryColorProperty,
        PlateTectonicsColors.divergentBoundaryColorProperty,
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
   * Constant in z almost everywhere: the boundary is a two-dimensional model extruded back
   * into the block, which is exactly what a cross-section assumes, and it is the right
   * assumption for a trench and for a mountain belt. The volcanic arc is the one place it
   * is wrong — an arc is a *chain* of separate cones, and that is the shape that makes an
   * island arc recognisable — so {@link arcRiseM} adds structure in z, and only within a
   * window either side of the arc.
   *
   * Restricting it that way is not just thrift. The block resamples this whole grid every
   * frame while the clock runs, and PhET's own code carried a performance TODO asking for
   * exactly this bound.
   */
  protected terrainElevationM(xM: number, zM: number): number {
    const base = this.baseGroundM(xM);
    const geometry = this.geometry();
    return geometry ? base + arcRiseM(geometry, xM, zM) : base;
  }

  /**
   * The ground before the arc is added, interpolated across x from the merged profile.
   *
   * Clamped at both ends so the block's edges sit at the elevation of the outermost sample
   * rather than falling to zero.
   */
  private baseGroundM(xM: number): number {
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
    // Against the ground before the arc is added: the walls are at the far edges of the
    // block, hundreds of kilometres from any arc, and a z-dependent ground here would be
    // asking a question whose answer is always the same.
    if (elevationM > this.baseGroundM(xM)) {
      return null;
    }
    const mode = this.model.colorModeProperty.value;
    const geometry = this.geometry();
    if (!geometry) {
      return materialFill(mode, MANTLE_DENSITY_KG_M3, simpleMantleTemperatureK(-elevationM));
    }

    const outline = xM < 0 ? geometry.left : geometry.right;
    const type = (xM < 0 ? this.model.leftPlateTypeProperty : this.model.rightPlateTypeProperty).value;

    if (type && elevationM >= elevationAtX(outline.crustBase, xM)) {
      return materialFill(mode, plateProperties(type).densityKgM3, SURFACE_TEMPERATURE_K + 450);
    }
    if (elevationM >= elevationAtX(outline.lithosphereBase, xM)) {
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

  /**
   * Magma and the volcanoes it feeds, over the plates they have come up through.
   *
   * Three stages, in the order they happen: blobs rising off the slab, the chamber they
   * collect in, and — once it is full — the conduit and the cone it feeds. Drawing the
   * chamber long before anything erupts is what makes the wait legible rather than
   * looking like nothing is happening.
   */
  protected override paintSectionFeatures(): void {
    const geometry = this.geometry();
    if (!geometry) {
      return;
    }

    const magmaColor = PlateTectonicsColors.magmaColorProperty.value;

    for (const blob of geometry.magmaBlobs) {
      this.addFrontPolygon(
        polygonCircle(blob.xM, blob.elevationM, blob.radiusM),
        magmaColor.withAlpha(blob.opacity),
        SECTION_LAYER.magma,
      );
    }
    if (geometry.magma.length > 2) {
      this.addFrontPolygon(geometry.magma, magmaColor, SECTION_LAYER.magma);
    }
    if (geometry.magmaConduit.length > 2) {
      this.addFrontPolygon(geometry.magmaConduit, magmaColor, SECTION_LAYER.magma);
    }

    // The cone on the cut face, drawn from the same profile the terrain uses, so the
    // section's volcano is the cut through the arc rather than a triangle beside it.
    const volcanoColor = PlateTectonicsColors.volcanoColorProperty.value;
    for (const volcano of geometry.volcanoes) {
      if (volcano.heightM <= 0) {
        continue;
      }
      this.addFrontPolygon(arcSectionProfile(volcano), volcanoColor, SECTION_LAYER.volcanoes);
    }

    // A plume on every cone of the chain, not just the one the section happens to pass
    // through — a single column of smoke on an otherwise bare ridge is what made the arc
    // read as one volcano.
    for (const cone of arcCones(geometry, this.blockBounds().minZM)) {
      this.paintSmoke(cone.xM, cone.zM, cone.baseM + cone.heightM, cone.heightM);
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
  private paintSmoke(xM: number, zM: number, apexM: number, volcanoHeightM: number): void {
    const timeMyr = this.model.timeMillionsOfYearsProperty.value;
    const base = PlateTectonicsColors.volcanicSmokeColorProperty.value;

    // Measured against the cone's own height, so the plume is always a couple of volcanoes
    // tall however big the volcano has grown.
    //
    // In unexaggerated metres, unlike the width: elevations are what the exaggeration
    // stretches, so a rise given here in true metres already grows with the section.
    const riseM = volcanoHeightM * SMOKE_RISE_PER_HEIGHT;
    const halfWidthM = ARC_X_DECAY_M;

    // Each cone's plume is offset in phase by its own position, so the chain does not puff
    // in unison — which would read as one object seen several times rather than as several
    // volcanoes. Derived from z, so it is still a pure function of the clock.
    const conePhase = Math.abs(zM / (2 * Math.PI * ARC_Z_PERIOD_FACTOR_M)) * 0.37;

    for (let index = 0; index < SMOKE_PUFFS; index++) {
      const phase = (timeMyr / SMOKE_PERIOD_MYR + index / SMOKE_PUFFS + conePhase) % 1;

      // Grows and fades as it climbs, so the plume thins out with height.
      const radiusM = halfWidthM * (SMOKE_START_RADIUS + phase * SMOKE_GROWTH);
      const centreXM = xM + phase * halfWidthM * SMOKE_DRIFT;
      const centreYM = apexM + phase * riseM;
      const color = base.withAlpha(SMOKE_MAX_ALPHA * (1 - phase));

      this.addPolygonAtZ(polygonCircle(centreXM, centreYM, radiusM), zM, color, SECTION_LAYER.smoke);
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
      const yM = Math.min(block.maxYM - clearanceM, this.terrainElevationM(tailXM, block.maxZM) + clearanceM);

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

/** Sides a circle is drawn with. At these sizes it is indistinguishable from a disc. */
const CIRCLE_SIDES = 12;

/** A circle as a polygon, because the renderer takes polygons. */
function polygonCircle(centreXM: number, centreYM: number, radiusM: number): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i < CIRCLE_SIDES; i++) {
    const angle = (i / CIRCLE_SIDES) * 2 * Math.PI;
    points.push(new Vector2(centreXM + radiusM * Math.cos(angle), centreYM + radiusM * Math.sin(angle)));
  }
  return points;
}
