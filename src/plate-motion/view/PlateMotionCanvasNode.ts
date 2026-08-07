/**
 * PlateMotionCanvasNode.ts
 *
 * Paints whatever shape PlateGeometry reports for the current moment: sky, sea, mantle,
 * the two plates, the descending slab, magma and volcanoes.
 *
 * Everything drawn here is a polygon closed from one of the geometry's polylines, so the
 * painter contains no physics of its own — if the picture is wrong, the geometry is
 * wrong, and there is a unit test for that. What the painter does own is z-order, and it
 * matters: the slab has to go under the overriding plate, and magma over the slab but
 * under the crust it has not broken through yet.
 */

import { Multilink } from "scenerystack/axon";
import type { Bounds2, Vector2 } from "scenerystack/dot";
import { CanvasNode, type CanvasNodeOptions } from "scenerystack/scenery";
import type { CrossSectionScale } from "../../common/model/CrossSectionScale.js";
import { paintArrowHead } from "../../common/view/CanvasArrows.js";
import { materialFill } from "../../common/view/EarthMaterial.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import {
  LITHOSPHERIC_MANTLE_DENSITY_KG_M3,
  MANTLE_DENSITY_KG_M3,
  SLAB_DENSITY_KG_M3,
  SURFACE_TEMPERATURE_K,
} from "../../PlateTectonicsConstants.js";
import { boundaryGeometry, type PlateOutline } from "../model/PlateGeometry.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";
import { simpleMantleTemperatureK } from "../model/PlateThermal.js";
import { plateProperties } from "../model/PlateType.js";

/** Length of the motion arrows drawn on each plate, view pixels. */
const MOTION_ARROW_LENGTH = 46;

export type PlateMotionCanvasNodeOptions = CanvasNodeOptions;

/**
 * The ground profile across the whole section, left edge to right edge.
 *
 * The two plates tile the section between them, but neither the order of their samples
 * nor which of them covers which side is fixed — a rift walks outwards from the axis, a
 * collision walks in from the far field. Sorting the combined samples by x is what makes
 * this independent of that: each plate's surface is a function of x, so the merge of the
 * two is the ground.
 */
function groundSurface(geometry: ReturnType<typeof boundaryGeometry>): Vector2[] {
  return [...geometry.left.crustTop, ...geometry.right.crustTop].sort((a, b) => a.x - b.x);
}

export class PlateMotionCanvasNode extends CanvasNode {
  private readonly model: PlateMotionModel;

  /** Named sectionScale, not scale: Node.scale() is a method on the base class. */
  private sectionScale: CrossSectionScale;

  public constructor(
    model: PlateMotionModel,
    sectionScale: CrossSectionScale,
    bounds: Bounds2,
    providedOptions?: PlateMotionCanvasNodeOptions,
  ) {
    super({ canvasBounds: bounds, ...providedOptions });
    this.model = model;
    this.sectionScale = sectionScale;

    const repaint = Multilink.multilinkAny(
      [
        model.leftPlateTypeProperty,
        model.rightPlateTypeProperty,
        model.motionTypeProperty,
        model.timeMillionsOfYearsProperty,
        model.colorModeProperty,
        model.showSeawaterProperty,
        PlateTectonicsColors.skyColorProperty,
        PlateTectonicsColors.seaWaterColorProperty,
        PlateTectonicsColors.magmaColorProperty,
        PlateTectonicsColors.volcanoColorProperty,
        PlateTectonicsColors.densityRampLowColorProperty,
        PlateTectonicsColors.densityRampHighColorProperty,
        PlateTectonicsColors.temperatureRampLowColorProperty,
        PlateTectonicsColors.temperatureRampHighColorProperty,
      ],
      () => this.invalidatePaint(),
    );

    this.disposeEmitter.addListener(() => repaint.dispose());
  }

  /** Re-aims the painter at a new vertical scale. */
  public setSectionScale(sectionScale: CrossSectionScale): void {
    this.sectionScale = sectionScale;
    this.invalidatePaint();
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    const scale = this.sectionScale;
    const model = this.model;
    const bounds = this.canvasBounds;
    const mode = model.colorModeProperty.value;

    // ── Sky, sea and mantle ───────────────────────────────────────────────────
    context.fillStyle = PlateTectonicsColors.skyColorProperty.value.toCSS();
    context.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);

    if (model.showSeawaterProperty.value) {
      context.fillStyle = PlateTectonicsColors.seaWaterColorProperty.value.toCSS();
      context.fillRect(bounds.minX, scale.seaLevelY, bounds.width, bounds.maxY - scale.seaLevelY);
    }

    const left = model.leftPlateTypeProperty.value;
    const right = model.rightPlateTypeProperty.value;
    if (!(left && right)) {
      // Nothing has been placed yet, so there is no ground for the sea to lie on and the
      // mantle simply fills the section below sea level.
      this.paintMantle(context, mode, null);
      return;
    }

    const motion = model.motionTypeProperty.value;
    const geometry = motion
      ? boundaryGeometry(motion, left, right, model.timeMillionsOfYearsProperty.value)
      : boundaryGeometry("convergent", left, right, 0);

    // The mantle is painted as a band rather than sampled per column: on this screen it
    // is a backdrop for the plates, not the subject, and a uniform fill reads as one
    // continuous medium the plates are moving *through*. It is clipped to below the
    // ground, though — an unclipped band starts at sea level and paints over the ocean,
    // which is why the sea used to be invisible everywhere the sea floor lies (that is,
    // everywhere it exists).
    this.paintMantle(context, mode, groundSurface(geometry));

    // ── The slab, under everything it passes beneath ──────────────────────────
    if (geometry.slab.length > 1) {
      this.paintSlab(context, geometry.slab, geometry.slabHalfThicknessM, mode);
    }

    // ── The two plates ────────────────────────────────────────────────────────
    this.paintPlate(context, geometry.left, left, mode);
    this.paintPlate(context, geometry.right, right, mode);

    // ── Magma, over the plates ────────────────────────────────────────────────
    // Painted last so the conduit reads as one continuous column from the slab to the
    // surface. Drawing it under the crust would hide its middle and make the arc look
    // like it had no connection to the slab that produced it — which is the single
    // relationship this part of the screen exists to show.
    if (geometry.magma.length > 2) {
      context.fillStyle = PlateTectonicsColors.magmaColorProperty.value.toCSS();
      this.fillPolygon(context, geometry.magma);
    }

    // ── Volcanoes ─────────────────────────────────────────────────────────────
    context.fillStyle = PlateTectonicsColors.volcanoColorProperty.value.toCSS();
    for (const volcano of geometry.volcanoes) {
      const apexY = scale.y(volcano.baseM + volcano.heightM);
      const baseY = scale.y(volcano.baseM);
      const halfWidth = Math.max(6, (baseY - apexY) * 0.8);
      const centreX = scale.x(volcano.xM);
      context.beginPath();
      context.moveTo(centreX, apexY);
      context.lineTo(centreX + halfWidth, baseY);
      context.lineTo(centreX - halfWidth, baseY);
      context.closePath();
      context.fill();
    }

    // ── Which way each plate is going ─────────────────────────────────────────
    if (motion) {
      this.paintMotionArrows(context, geometry, motion === "divergent");
    }
  }

  /**
   * The mantle, from the ground down to the bottom of the viewport.
   *
   * `surface` is the ground profile across the whole section; the fill is clipped to
   * below it so the mantle never intrudes into the air or the sea. Pass null before any
   * plate has been placed, when there is no ground and the band starts at sea level.
   */
  private paintMantle(
    context: CanvasRenderingContext2D,
    mode: Parameters<typeof materialFill>[0],
    surface: readonly Vector2[] | null,
  ): void {
    const scale = this.sectionScale;
    const bounds = this.canvasBounds;

    context.save();
    let topY = scale.y(0);
    if (surface && surface.length > 1) {
      context.beginPath();
      context.moveTo(bounds.minX, bounds.maxY);
      for (const point of surface) {
        context.lineTo(scale.x(point.x), scale.y(point.y));
      }
      context.lineTo(bounds.maxX, bounds.maxY);
      context.closePath();
      context.clip();

      // Start at the highest point of the ground rather than at sea level, so a mountain
      // belt standing above the water still gets mantle painted under it.
      topY = Math.min(...surface.map((point) => scale.y(point.y)));
    }

    // Sampled in horizontal bands so the geotherm shows as a gradient rather than a
    // single flat colour — the whole point of the temperature mode.
    const bandHeight = 4;
    for (let y = topY; y < bounds.maxY; y += bandHeight) {
      const elevationM = scale.modelElevation(y + bandHeight / 2);
      const temperatureK = simpleMantleTemperatureK(-elevationM);
      context.fillStyle = materialFill(mode, MANTLE_DENSITY_KG_M3, temperatureK).toCSS();
      context.fillRect(bounds.minX, y, bounds.width, bandHeight + 0.75);
    }
    context.restore();
  }

  /** One plate: crust over lithospheric mantle, each as a closed band. */
  private paintPlate(
    context: CanvasRenderingContext2D,
    outline: PlateOutline,
    type: Parameters<typeof plateProperties>[0],
    mode: Parameters<typeof materialFill>[0],
  ): void {
    const properties = plateProperties(type);

    // The lithospheric mantle first, so the crust sits on top of it. Drawn at the
    // lithospheric density rather than the asthenosphere's: they are the same rock at
    // different temperatures, and painting both at MANTLE_DENSITY_KG_M3 made the rigid
    // part of every plate vanish into its surroundings in density mode.
    context.fillStyle = materialFill(mode, LITHOSPHERIC_MANTLE_DENSITY_KG_M3, SURFACE_TEMPERATURE_K + 900).toCSS();
    this.fillBand(context, outline.crustBase, outline.lithosphereBase);

    context.fillStyle = materialFill(mode, properties.densityKgM3, SURFACE_TEMPERATURE_K + 450).toCSS();
    this.fillBand(context, outline.crustTop, outline.crustBase);
  }

  /** The descending slab, as a ribbon of constant thickness about its centreline. */
  private paintSlab(
    context: CanvasRenderingContext2D,
    fullCentreline: readonly Vector2[],
    halfThicknessM: number,
    mode: Parameters<typeof materialFill>[0],
  ): void {
    const scale = this.sectionScale;

    // Cut the slab off at the bottom of the section. CrossSectionScale.y clamps, so every
    // point below the floor lands *on* the floor: an untrimmed slab that has descended
    // past the view is drawn as a horizontal smear along the bottom edge, with its
    // arrow-heads strung out sideways along it. Keeping the first point past the floor and
    // dropping the rest lets the ribbon run off the edge and stop there.
    const past = fullCentreline.findIndex((point) => point.y < scale.bottomM);
    const centreline = past < 0 ? fullCentreline : fullCentreline.slice(0, past + 1);
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
      const nx = (-dy / length) * halfThicknessM;
      const ny = (dx / length) * halfThicknessM;
      upper.push(point.plusXY(nx, ny));
      lower.push(point.plusXY(-nx, -ny));
    }

    // A slab is cold — that is why it is dense enough to sink, and why it stays rigid
    // far below the depth where the surrounding mantle does not.
    context.fillStyle = materialFill(mode, SLAB_DENSITY_KG_M3, SURFACE_TEMPERATURE_K + 500).toCSS();
    this.fillBand(context, upper, lower);

    // Arrow-heads down the centreline, showing which way it is going.
    context.fillStyle = PlateTectonicsColors.convectionArrowColorProperty.value.toCSS();
    for (let i = 4; i < centreline.length - 1; i += 8) {
      const point = centreline[i];
      const next = centreline[i + 1];
      if (!(point && next)) {
        continue;
      }
      const angle = Math.atan2(scale.y(next.y) - scale.y(point.y), scale.x(next.x) - scale.x(point.x));
      paintArrowHead(context, scale.x(point.x), scale.y(point.y), angle, 6);
    }
  }

  /** Horizontal arrows on each plate showing which way it is travelling. */
  private paintMotionArrows(
    context: CanvasRenderingContext2D,
    geometry: ReturnType<typeof boundaryGeometry>,
    diverging: boolean,
  ): void {
    const scale = this.sectionScale;
    context.fillStyle = diverging
      ? PlateTectonicsColors.divergentBoundaryColorProperty.value.toCSS()
      : PlateTectonicsColors.convergentBoundaryColorProperty.value.toCSS();

    const y = scale.y(geometry.left.crustTop[0]?.y ?? 0) - 22;
    for (const sign of [-1, 1]) {
      // Converging plates point inwards, diverging plates outwards.
      const direction = diverging ? sign : -sign;
      const x = scale.x(sign * 320000);
      context.beginPath();
      context.moveTo(x, y - 2);
      context.lineTo(x + direction * MOTION_ARROW_LENGTH, y - 2);
      context.lineTo(x + direction * MOTION_ARROW_LENGTH, y + 2);
      context.lineTo(x, y + 2);
      context.closePath();
      context.fill();
      paintArrowHead(context, x + direction * MOTION_ARROW_LENGTH, y, direction > 0 ? 0 : Math.PI, 9);
    }
  }

  /** Fills the region between two polylines sampled at matching positions. */
  private fillBand(context: CanvasRenderingContext2D, top: readonly Vector2[], base: readonly Vector2[]): void {
    if (top.length < 2 || base.length < 2) {
      return;
    }
    const scale = this.sectionScale;
    context.beginPath();
    top.forEach((point, index) => {
      const x = scale.x(point.x);
      const y = scale.y(point.y);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    for (let i = base.length - 1; i >= 0; i--) {
      const point = base[i];
      if (point) {
        context.lineTo(scale.x(point.x), scale.y(point.y));
      }
    }
    context.closePath();
    context.fill();
  }

  /** Fills a closed polygon of model points. */
  private fillPolygon(context: CanvasRenderingContext2D, points: readonly Vector2[]): void {
    const scale = this.sectionScale;
    context.beginPath();
    points.forEach((point, index) => {
      const x = scale.x(point.x);
      const y = scale.y(point.y);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.closePath();
    context.fill();
  }
}
