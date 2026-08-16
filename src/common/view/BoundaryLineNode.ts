/**
 * BoundaryLineNode.ts
 *
 * A dotted line traced along a boundary in the model — on the Plate Motion screen, the
 * base of each plate's lithosphere.
 *
 * ── Why it is drawn at all ────────────────────────────────────────────────────
 * The lithosphere and the asthenosphere beneath it are the same rock; what separates
 * them is temperature, not composition, and in density mode the two are only 3% apart.
 * So the base of the plate — the surface that decides how thick "the plate" is, and the
 * thing that has to be crossed for anything to subduct — is nearly invisible in the
 * painted section. PhET drew a dotted line along it for exactly that reason, and a dotted
 * line is the right register: it says *this is a named surface*, not *this is a layer of
 * something else*.
 *
 * ── The cutoffs ───────────────────────────────────────────────────────────────
 * The line takes a model-x window. The overriding plate at a subduction zone needs one:
 * past the point where the slab has passed underneath, its lithosphere base is no longer
 * the bottom of anything the user can see, and a line drawn there runs across the slab as
 * if the slab were inside the plate. PhET clamped that cutoff at ±55 km so the line could
 * not vanish altogether once the slab had travelled far; the same clamp is applied by the
 * caller here.
 *
 * Positioned through a {@link SectionPlacement}, so it lands on the same surface in the
 * flat section and on the block.
 */

import type { Bounds2, Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Node, type NodeOptions, Path, type TColor } from "scenerystack/scenery";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { SectionPlacement } from "./SectionPlacement.js";

/** The dash pattern, view pixels. Matches PhET's 0xFF00 line stipple closely enough. */
const LINE_DASH = [5, 4];

type SelfOptions = {
  /** How the line reaches the picture that is currently showing. */
  placement: SectionPlacement;

  /** The surface to trace, in model metres. Need not be sorted or run in either direction. */
  points: readonly Vector2[];

  /** Model x window the line is drawn over. Defaults to the whole polyline. */
  minXM?: number;
  maxXM?: number;

  /** The viewport, so a line that lies entirely off it is not built. */
  viewBounds: Bounds2;

  fill?: TColor;
};

export type BoundaryLineNodeOptions = SelfOptions & NodeOptions;

/**
 * The part of a polyline inside a model-x window, with the crossings interpolated.
 *
 * Free-standing and exported so the clip can be reasoned about on its own: cutting at a
 * sample rather than at the crossing would make the line's end jump from one sample to
 * the next as the window moved, which on the overriding plate is every frame.
 */
export function clipPolylineToX(
  points: readonly Vector2[],
  minXM: number,
  maxXM: number,
): { readonly x: number; readonly y: number }[] {
  // The polylines this traces come from PlateOutline, whose only invariant is that all
  // three of a plate's run the *same* way — not which way. Sorting makes the clip
  // independent of that, and a surface is a function of x, so sorting cannot reorder it
  // into a different curve.
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const clipped: { x: number; y: number }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    if (!point) {
      continue;
    }
    const previous = sorted[i - 1];

    if (previous) {
      // Interpolate wherever the segment crosses either edge of the window.
      for (const edge of [minXM, maxXM]) {
        const entering = previous.x < edge && point.x >= edge;
        const leaving = previous.x <= edge && point.x > edge;
        if (!(entering || leaving)) {
          continue;
        }
        const span = point.x - previous.x;
        const t = span === 0 ? 0 : (edge - previous.x) / span;
        clipped.push({ x: edge, y: previous.y + (point.y - previous.y) * t });
      }
    }

    if (point.x >= minXM && point.x <= maxXM) {
      clipped.push({ x: point.x, y: point.y });
    }
  }

  // The interpolated crossings are pushed before the sample that produced them, which can
  // put a duplicate x out of order at an edge; one more sort settles it.
  return clipped.sort((a, b) => a.x - b.x);
}

export class BoundaryLineNode extends Node {
  public constructor(providedOptions: BoundaryLineNodeOptions) {
    const {
      placement,
      points,
      minXM = Number.NEGATIVE_INFINITY,
      maxXM = Number.POSITIVE_INFINITY,
      viewBounds,
      fill = PlateTectonicsColors.secondaryTextColorProperty,
      ...nodeOptions
    } = providedOptions;

    super(nodeOptions);

    const clipped = clipPolylineToX(points, minXM, maxXM);
    if (clipped.length < 2) {
      return;
    }

    const projected = clipped.map((point) => placement.modelToView(point.x, point.y));
    const first = projected[0];
    if (!first) {
      return;
    }

    // Nothing to draw if the whole surface has been pushed below the section — which the
    // block does at a high exaggeration, and the flat view does by clamping.
    if (projected.every((point) => point.y <= viewBounds.minY || point.y >= viewBounds.maxY)) {
      return;
    }

    const shape = new Shape().moveToPoint(first);
    for (const point of projected.slice(1)) {
      shape.lineToPoint(point);
    }

    this.addChild(new Path(shape, { stroke: fill, lineWidth: 1.5, lineDash: LINE_DASH }));
  }
}
