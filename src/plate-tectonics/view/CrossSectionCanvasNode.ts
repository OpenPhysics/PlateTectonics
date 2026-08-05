/**
 * CrossSectionCanvasNode.ts
 *
 * Paints a side view through one plate boundary: sky and sea, the real topographic
 * profile, the crust / lithosphere / asthenosphere / mantle layering, the
 * subducting slab where there is one, and the real earthquakes and volcanoes that
 * fall within the corridor either side of the profile line.
 *
 * The layer boundaries are schematic — a textbook's average crustal and
 * lithospheric thicknesses — but everything a student is asked to read off the
 * figure is measured: the surface comes from the NOAA DEM, the hypocentres and
 * volcanoes from USGS and NOAA catalogues, and the slab is fitted to the
 * hypocentres themselves (see CrossSectionGeometry).
 *
 * Mantle flow and plate-motion arrows animate off the model clock, so pressing
 * play shows material moving rather than a still diagram.
 */

import { Multilink } from "scenerystack/axon";
import { CanvasNode, type CanvasNodeOptions } from "scenerystack/scenery";
import type { CrossSectionData } from "../../common/data/dataTypes.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { QUAKE_BASE_RADIUS, QUAKE_RADIUS_PER_MAGNITUDE, VOLCANO_MARKER_SIZE } from "../../PlateTectonicsConstants.js";
import { depthBand, passesDepthFilter } from "../model/EarthquakeDepthFilter.js";
import type { PlateTectonicsModel } from "../model/PlateTectonicsModel.js";
import { CrossSectionGeometry, SLAB_HALF_THICKNESS_KM, type ViewPoint } from "./CrossSectionGeometry.js";

/** Spacing of the marching arrow-heads that show plate and mantle motion, in pixels. */
const FLOW_MARKER_SPACING = 34;

/** How fast flow markers travel along their path, pixels per second of wall-clock time. */
const FLOW_MARKER_SPEED = 9;

/** Smallest magnitude drawn in a section; sets the zero point of the marker size ramp. */
const MIN_SECTION_MAGNITUDE = 3;

/** Columns used when drawing a lithosphere base that varies along the profile. */
const LITHOSPHERE_COLUMNS = 80;

/** Depth at which a subducting slab starts to release the water that melts the mantle above it, km. */
const ARC_MAGMA_SOURCE_DEPTH_KM = 110;

export type CrossSectionCanvasNodeOptions = CanvasNodeOptions;

export class CrossSectionCanvasNode extends CanvasNode {
  private readonly model: PlateTectonicsModel;
  private geometry: CrossSectionGeometry;

  public constructor(
    model: PlateTectonicsModel,
    geometry: CrossSectionGeometry,
    options?: CrossSectionCanvasNodeOptions,
  ) {
    super({ canvasBounds: geometry.bounds, ...options });
    this.model = model;
    this.geometry = geometry;

    Multilink.multilinkAny(
      [
        model.showBoundariesProperty,
        model.showEarthquakesProperty,
        model.showVolcanoesProperty,
        model.showTopographyProperty,
        model.showVectorsProperty,
        model.earthquakeDepthFilterProperty,
        model.timer.timeProperty,
        PlateTectonicsColors.asthenosphereColorProperty,
        PlateTectonicsColors.shallowQuakeColorProperty,
      ],
      () => this.invalidatePaint(),
    );
  }

  /** Switches the section being drawn (the user picked another view). */
  public setSection(data: CrossSectionData): void {
    this.geometry = new CrossSectionGeometry(data, this.geometry.bounds);
    this.invalidatePaint();
  }

  public override paintCanvas(context: CanvasRenderingContext2D): void {
    const bounds = this.geometry.bounds;

    context.save();
    context.beginPath();
    context.rect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    context.clip();

    this.paintMantle(context);
    this.paintLithosphere(context);
    this.paintSlab(context);
    this.paintMagma(context);
    this.paintRelief(context);
    if (this.model.showVectorsProperty.value) {
      this.paintFlow(context);
    }
    if (this.model.showBoundariesProperty.value) {
      this.paintBoundaryMarkers(context);
    }
    if (this.model.showEarthquakesProperty.value) {
      this.paintEarthquakes(context);
    }
    if (this.model.showVolcanoesProperty.value) {
      this.paintVolcanoes(context);
    }

    context.restore();
  }

  // ── Earth layers ────────────────────────────────────────────────────────────

  /** Fills the mantle and asthenosphere bands across the whole depth band. */
  private paintMantle(context: CanvasRenderingContext2D): void {
    const geometry = this.geometry;
    const bounds = geometry.bounds;

    context.fillStyle = PlateTectonicsColors.mantleColorProperty.value.toCSS();
    context.fillRect(bounds.minX, geometry.surfaceY, bounds.width, bounds.maxY - geometry.surfaceY);

    context.fillStyle = PlateTectonicsColors.asthenosphereColorProperty.value.toCSS();
    const top = geometry.y(geometry.lithosphereBaseKm);
    context.fillRect(bounds.minX, top, bounds.width, geometry.y(geometry.asthenosphereBaseKm) - top);
  }

  /**
   * Fills crust and lithospheric mantle down from the real surface profile. Each
   * column is oceanic or continental according to its own elevation, so the
   * ocean–continent transition falls where the bathymetry says it does.
   */
  private paintLithosphere(context: CanvasRenderingContext2D): void {
    const geometry = this.geometry;
    const bounds = geometry.bounds;

    // Lithospheric mantle, from the surface down to a base that can vary along the
    // profile (an oceanic plate thickens as it ages away from its ridge).
    context.fillStyle = PlateTectonicsColors.lithosphereColorProperty.value.toCSS();
    context.beginPath();
    context.moveTo(bounds.minX, geometry.surfaceY);
    context.lineTo(bounds.maxX, geometry.surfaceY);
    for (let i = LITHOSPHERE_COLUMNS; i >= 0; i--) {
      const distanceKm = (geometry.data.lengthKm * i) / LITHOSPHERE_COLUMNS;
      context.lineTo(geometry.x(distanceKm), geometry.y(geometry.lithosphereBaseAt(distanceKm)));
    }
    context.closePath();
    context.fill();

    // Crust, column by column, so the ocean–continent transition falls where the
    // bathymetry puts it and mountain belts carry their crustal root.
    const oceanicColor = PlateTectonicsColors.oceanicCrustColorProperty.value.toCSS();
    const continentalColor = PlateTectonicsColors.continentalCrustColorProperty.value.toCSS();
    const columns = 160;
    const step = geometry.data.lengthKm / columns;
    for (let i = 0; i < columns; i++) {
      const distanceKm = i * step;
      const x = geometry.x(distanceKm);
      const nextX = geometry.x(distanceKm + step) + 0.5;
      const baseY = geometry.y(geometry.crustThicknessKm(distanceKm));
      const nextBaseY = geometry.y(geometry.crustThicknessKm(distanceKm + step));

      context.fillStyle = geometry.isOceanic(distanceKm) ? oceanicColor : continentalColor;
      context.beginPath();
      context.moveTo(x, geometry.surfaceY);
      context.lineTo(nextX, geometry.surfaceY);
      context.lineTo(nextX, nextBaseY);
      context.lineTo(x, baseY);
      context.closePath();
      context.fill();
    }
  }

  /**
   * Draws the subducting slab as a band of oceanic lithosphere following the
   * centreline fitted to the hypocentres.
   */
  private paintSlab(context: CanvasRenderingContext2D): void {
    const trace = this.geometry.slabTrace;
    if (trace.length < 2) {
      return;
    }

    context.strokeStyle = PlateTectonicsColors.lithosphereColorProperty.value.toCSS();
    context.lineWidth = 2 * SLAB_HALF_THICKNESS_KM * this.geometry.pixelsPerDepthKm;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo((trace[0] as ViewPoint).x, (trace[0] as ViewPoint).y);
    for (const point of trace.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();

    // The slab's own crust: a thin dark stripe along its upper surface, the
    // basaltic layer whose dehydration feeds the arc volcanoes above.
    context.strokeStyle = PlateTectonicsColors.oceanicCrustColorProperty.value.toCSS();
    context.lineWidth = Math.max(1.5, 10 * this.geometry.pixelsPerDepthKm);
    context.beginPath();
    for (let i = 0; i < trace.length; i++) {
      const point = trace[i] as ViewPoint;
      const offset = this.slabNormal(i);
      const x = point.x + offset.x * SLAB_HALF_THICKNESS_KM * this.geometry.pixelsPerDepthKm;
      const y = point.y + offset.y * SLAB_HALF_THICKNESS_KM * this.geometry.pixelsPerDepthKm;
      if (i === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
  }

  /** Unit normal pointing to the upper side of the slab at trace point `index`. */
  private slabNormal(index: number): ViewPoint {
    const trace = this.geometry.slabTrace;
    const before = trace[Math.max(0, index - 1)] as ViewPoint;
    const after = trace[Math.min(trace.length - 1, index + 1)] as ViewPoint;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    // Rotate the tangent by −90°, which points up-dip on a slab descending to the right.
    return { x: dy / length, y: -dx / length };
  }

  /**
   * The relief band: sky, sea water, and the ground beneath the surface profile.
   * This band has its own vertical scale (see CrossSectionGeometry), which is what
   * makes a 6 km trench or a 4 km ridge visible above a 700 km deep section.
   */
  private paintRelief(context: CanvasRenderingContext2D): void {
    const geometry = this.geometry;
    const bounds = geometry.bounds;
    const surface = geometry.surfacePoints();
    const first = surface[0] as ViewPoint;
    const last = surface[surface.length - 1] as ViewPoint;

    context.fillStyle = PlateTectonicsColors.skyColorProperty.value.toCSS();
    context.fillRect(bounds.minX, bounds.minY, bounds.width, geometry.surfaceY - bounds.minY);

    // Ground below the surface profile, coloured per column like the crust in the
    // depth band, so the ocean–continent transition reads the same in both.
    const oceanicColor = PlateTectonicsColors.oceanicCrustColorProperty.value.toCSS();
    const continentalColor = PlateTectonicsColors.continentalCrustColorProperty.value.toCSS();
    const step = geometry.data.lengthKm / (surface.length - 1);
    for (let i = 0; i < surface.length - 1; i++) {
      const point = surface[i] as ViewPoint;
      const next = surface[i + 1] as ViewPoint;
      context.fillStyle = geometry.isOceanic(i * step) ? oceanicColor : continentalColor;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(next.x + 0.6, next.y);
      context.lineTo(next.x + 0.6, geometry.surfaceY);
      context.lineTo(point.x, geometry.surfaceY);
      context.closePath();
      context.fill();
    }

    // Sea water fills the gap between sea level and a surface that lies below it.
    context.fillStyle = PlateTectonicsColors.seaWaterColorProperty.value.toCSS();
    context.beginPath();
    context.moveTo(first.x, geometry.seaLevelY);
    for (const point of surface) {
      context.lineTo(point.x, Math.max(point.y, geometry.seaLevelY));
    }
    context.lineTo(last.x, geometry.seaLevelY);
    context.closePath();
    context.fill();

    // A crisp line for the surface itself.
    context.strokeStyle = PlateTectonicsColors.coastlineColorProperty.value.toCSS();
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of surface) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
  }

  /**
   * Magma: an upwelling column beneath a spreading ridge, or a conduit from the
   * slab up to the volcanic arc above a subduction zone. Arc magma is generated
   * where the slab reaches about 100 km depth, which is why the arc sits a fixed
   * distance behind the trench rather than on top of it.
   */
  private paintMagma(context: CanvasRenderingContext2D): void {
    const geometry = this.geometry;
    context.fillStyle = PlateTectonicsColors.magmaColorProperty.value.toCSS();

    const ridge = geometry.crossingOfType("divergent");
    if (ridge && geometry.data.key === "divergent") {
      const x = geometry.x(ridge.distanceKm);
      // A shallow chamber and the dyke feeding it, not a column through the section:
      // ridge melt is generated in the top few tens of kilometres.
      const baseY = geometry.y(Math.min(geometry.data.maxDepthKm * 0.55, 45));
      const halfWidth = geometry.bounds.width * 0.014;
      context.beginPath();
      context.moveTo(x - halfWidth * 0.4, geometry.surfaceY);
      context.lineTo(x + halfWidth * 0.4, geometry.surfaceY);
      context.lineTo(x + halfWidth, baseY);
      context.lineTo(x - halfWidth, baseY);
      context.closePath();
      context.fill();
    }

    const arcDistanceKm = geometry.arcDistanceKm;
    if (arcDistanceKm !== null && geometry.slabTrace.length >= 2) {
      const x = geometry.x(arcDistanceKm);
      const sourceY = geometry.y(ARC_MAGMA_SOURCE_DEPTH_KM);
      context.beginPath();
      context.moveTo(x - 3, geometry.surfaceY);
      context.lineTo(x + 3, geometry.surfaceY);
      context.lineTo(x + 11, sourceY);
      context.lineTo(x - 11, sourceY);
      context.closePath();
      context.fill();
    }
  }

  // ── Motion ──────────────────────────────────────────────────────────────────

  /**
   * Marching arrow-heads showing how material moves: plates converging on a trench,
   * spreading away from a ridge, and the slab sinking. Their phase comes from the
   * model clock, so material only moves while the sim is playing.
   *
   * A transform fault is the exception: its two sides slide past each other, into
   * and out of the page, so it gets the conventional pair of symbols instead —
   * a dot for motion towards the viewer, a cross for motion away.
   */
  private paintFlow(context: CanvasRenderingContext2D): void {
    const geometry = this.geometry;
    const crossing = geometry.primaryCrossing;
    if (!crossing) {
      return;
    }
    const phase = (this.model.timer.timeProperty.value * FLOW_MARKER_SPEED) % FLOW_MARKER_SPACING;
    const color = PlateTectonicsColors.convectionArrowColorProperty.value.toCSS();
    context.fillStyle = color;
    context.strokeStyle = color;

    const crossingX = geometry.x(crossing.distanceKm);
    const plateY = geometry.y(geometry.data.maxDepthKm * 0.09);

    if (crossing.type === "convergent") {
      this.paintFlowLine(context, geometry.bounds.minX + 14, plateY, crossingX - 16, plateY, phase);
      for (const point of this.sampleSlab(phase)) {
        this.paintArrowHead(context, point.x, point.y, point.angle);
      }
    } else if (crossing.type === "divergent") {
      this.paintFlowLine(context, crossingX + 16, plateY, geometry.bounds.maxX - 14, plateY, phase);
      this.paintFlowLine(context, crossingX - 16, plateY, geometry.bounds.minX + 14, plateY, phase);
      // Upwelling beneath the axis, feeding the new crust either side.
      this.paintFlowLine(
        context,
        crossingX,
        geometry.y(geometry.asthenosphereBaseKm),
        crossingX,
        geometry.y(geometry.lithosphereBaseKm * 0.3),
        phase,
      );
    } else {
      this.paintStrikeSlipSymbols(context, crossingX, plateY);
    }
  }

  /**
   * The into-page / out-of-page pair used for strike-slip motion: a circled dot on
   * the side moving towards the viewer, a circled cross on the side moving away.
   */
  private paintStrikeSlipSymbols(context: CanvasRenderingContext2D, faultX: number, y: number): void {
    const radius = 9;
    const offset = 52;

    context.lineWidth = 1.6;
    for (const side of [-1, 1] as const) {
      const x = faultX + side * offset;
      context.beginPath();
      context.arc(x, y, radius, 0, 2 * Math.PI);
      context.stroke();

      if (side < 0) {
        // Towards the viewer: the point of the arrow, seen head-on.
        context.beginPath();
        context.arc(x, y, radius * 0.34, 0, 2 * Math.PI);
        context.fill();
      } else {
        // Away from the viewer: the flights of the arrow, seen from behind.
        const arm = radius * 0.62;
        context.beginPath();
        context.moveTo(x - arm, y - arm);
        context.lineTo(x + arm, y + arm);
        context.moveTo(x + arm, y - arm);
        context.lineTo(x - arm, y + arm);
        context.stroke();
      }
    }
  }

  /** Draws arrow-heads marching from (x1,y1) towards (x2,y2), offset by `phase`. */
  private paintFlowLine(
    context: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    phase: number,
  ): void {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    for (let along = phase; along < length; along += FLOW_MARKER_SPACING) {
      const t = along / length;
      this.paintArrowHead(context, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, angle);
    }
  }

  /** Samples marching positions down the slab centreline. */
  private sampleSlab(phase: number): { x: number; y: number; angle: number }[] {
    const trace = this.geometry.slabTrace;
    const markers: { x: number; y: number; angle: number }[] = [];
    let travelled = 0;
    for (let i = 1; i < trace.length; i++) {
      const from = trace[i - 1] as ViewPoint;
      const to = trace[i] as ViewPoint;
      const segmentLength = Math.hypot(to.x - from.x, to.y - from.y);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      let along = (FLOW_MARKER_SPACING - ((travelled + phase) % FLOW_MARKER_SPACING)) % FLOW_MARKER_SPACING;
      while (along < segmentLength) {
        const t = along / segmentLength;
        markers.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, angle });
        along += FLOW_MARKER_SPACING;
      }
      travelled += segmentLength;
    }
    return markers;
  }

  /** One filled triangular arrow-head pointing along `angle`. */
  private paintArrowHead(context: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
    const size = 5;
    context.beginPath();
    context.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
    context.lineTo(x + Math.cos(angle + 2.4) * size, y + Math.sin(angle + 2.4) * size);
    context.lineTo(x + Math.cos(angle - 2.4) * size, y + Math.sin(angle - 2.4) * size);
    context.closePath();
    context.fill();
  }

  // ── Boundary, earthquakes, volcanoes ────────────────────────────────────────

  /**
   * Marks the boundary itself: a fault plane for a transform, and a tick at the
   * trench or ridge axis otherwise.
   */
  private paintBoundaryMarkers(context: CanvasRenderingContext2D): void {
    const geometry = this.geometry;
    for (const crossing of geometry.data.boundaryCrossings) {
      const x = geometry.x(crossing.distanceKm);
      const surfaceY = geometry.yFromElevation(geometry.elevationAt(crossing.distanceKm));
      const color =
        crossing.type === "divergent"
          ? PlateTectonicsColors.divergentBoundaryColorProperty.value
          : crossing.type === "convergent"
            ? PlateTectonicsColors.convergentBoundaryColorProperty.value
            : PlateTectonicsColors.transformBoundaryColorProperty.value;

      // Only the fault this section was cut to show gets its whole plane drawn; the
      // other boundaries the profile happens to cross are marked at the surface.
      const isSectionFault = crossing.type === "transform" && geometry.data.key === "transform";
      context.strokeStyle = color.toCSS();
      context.lineWidth = isSectionFault ? 2.5 : 2;
      context.setLineDash(isSectionFault ? [] : [5, 4]);
      context.beginPath();
      context.moveTo(x, surfaceY - 10);
      context.lineTo(x, isSectionFault ? geometry.y(geometry.data.maxDepthKm) : geometry.surfaceY + 12);
      context.stroke();
      context.setLineDash([]);
    }
  }

  /** Real hypocentres, coloured by depth band and sized by magnitude. */
  private paintEarthquakes(context: CanvasRenderingContext2D): void {
    const filter = this.model.earthquakeDepthFilterProperty.value;
    const geometry = this.geometry;

    for (const band of ["deep", "intermediate", "shallow"] as const) {
      context.fillStyle = (
        band === "shallow"
          ? PlateTectonicsColors.shallowQuakeColorProperty
          : band === "intermediate"
            ? PlateTectonicsColors.intermediateQuakeColorProperty
            : PlateTectonicsColors.deepQuakeColorProperty
      ).value.toCSS();

      context.beginPath();
      for (const quake of geometry.data.earthquakes) {
        if (depthBand(quake.depthKm) !== band || !passesDepthFilter(quake.depthKm, filter)) {
          continue;
        }
        const x = geometry.x(quake.distanceKm);
        const y = geometry.y(quake.depthKm);
        const radius = QUAKE_BASE_RADIUS + (quake.magnitude - MIN_SECTION_MAGNITUDE) * QUAKE_RADIUS_PER_MAGNITUDE * 0.7;
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, 2 * Math.PI);
      }
      context.fill();
    }
  }

  /** Volcanoes sitting on the surface profile at their real distance along it. */
  private paintVolcanoes(context: CanvasRenderingContext2D): void {
    const geometry = this.geometry;
    context.fillStyle = PlateTectonicsColors.volcanoColorProperty.value.toCSS();
    context.beginPath();
    for (const volcano of geometry.data.volcanoes) {
      const x = geometry.x(volcano.distanceKm);
      const y = geometry.yFromElevation(Math.max(volcano.elevationM, geometry.elevationAt(volcano.distanceKm)));
      context.moveTo(x, y - VOLCANO_MARKER_SIZE * 2);
      context.lineTo(x + VOLCANO_MARKER_SIZE * 1.4, y);
      context.lineTo(x - VOLCANO_MARKER_SIZE * 1.4, y);
      context.closePath();
    }
    context.fill();
  }
}
