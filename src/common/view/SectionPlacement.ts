/**
 * SectionPlacement.ts
 *
 * Where a point on a cross-section lands on the screen — the one thing everything drawn
 * *over* the section needs, and the only thing that changes when the section is drawn as
 * a 3-D block instead of flat.
 *
 * The labels, the probe and the tools are Scenery nodes, not painted pixels, so that
 * they stay localizable and reachable by a screen reader. That means each of them has to
 * be positioned in view coordinates, and each of them would otherwise have to know which
 * of the two views is showing. This interface is what keeps that knowledge in one place:
 * the screen picks a placement when the view mode changes, and hands the same one to
 * everything.
 *
 * The two implementations differ in more than a transform, which is why `contour` is
 * part of the interface rather than something callers work out from `modelToView`. On
 * the flat section a line of constant elevation is a horizontal line and two points
 * describe it. On the block it is an arc — sea level is a circle, not a line — and
 * drawing it as a chord would put the horizon through the middle of the ocean.
 */

import { type Bounds2, Vector2 } from "scenerystack/dot";
import type { CrossSectionScale } from "../model/CrossSectionScale.js";
import type { EarthBlockNode } from "./EarthBlockNode.js";

/** Points used to trace a line of constant elevation across the block. */
const CONTOUR_SAMPLES = 48;

export type SectionPlacement = {
  /** The viewport the section occupies, view pixels. */
  readonly viewBounds: Bounds2;

  /** Model x at the right-hand edge of the section, m; −this at the left. */
  readonly halfWidthM: number;

  /** Deepest elevation the view reaches, m — normally negative. */
  readonly bottomM: number;

  /** Where a point on the section lands, view pixels. */
  modelToView(xM: number, elevationM: number): Vector2;

  /** The point on the section under a screen point, model metres. */
  viewToModel(viewX: number, viewY: number): Vector2;

  /**
   * A line of constant elevation across the whole section, as a polyline. Two points
   * when the section is flat, an arc when it is a block.
   */
  contour(elevationM: number): Vector2[];
};

/** Placement for the flat cross-section, backed by its two-band vertical scale. */
export function flatPlacement(scale: CrossSectionScale): SectionPlacement {
  return {
    viewBounds: scale.bounds,
    halfWidthM: scale.halfWidthM,
    bottomM: scale.bottomM,
    modelToView: (xM, elevationM) => new Vector2(scale.x(xM), scale.y(elevationM)),
    viewToModel: (viewX, viewY) => new Vector2(scale.modelX(viewX), scale.modelElevation(viewY)),
    contour: (elevationM) => [
      new Vector2(scale.x(-scale.halfWidthM), scale.y(elevationM)),
      new Vector2(scale.x(scale.halfWidthM), scale.y(elevationM)),
    ],
  };
}

/**
 * Placement for the 3-D block, projecting onto its front face.
 *
 * Everything an annotation names is on that face — it is the cut, and a label pinned to
 * rock behind it would be naming rock the user cannot see.
 */
export function blockPlacement(block: EarthBlockNode, halfWidthM: number, bottomM: number): SectionPlacement {
  const frontZ = 0;

  return {
    viewBounds: block.canvasBounds,
    halfWidthM,
    bottomM,
    modelToView: (xM, elevationM) => block.modelToView(xM, elevationM, frontZ),
    viewToModel: (viewX, viewY) => block.viewToFrontFace(new Vector2(viewX, viewY)) ?? new Vector2(0, 0),
    contour: (elevationM) => {
      const points: Vector2[] = [];
      for (let i = 0; i <= CONTOUR_SAMPLES; i++) {
        const xM = -halfWidthM + (2 * halfWidthM * i) / CONTOUR_SAMPLES;
        points.push(block.modelToView(xM, elevationM, frontZ));
      }
      return points;
    },
  };
}
