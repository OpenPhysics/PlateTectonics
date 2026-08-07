/**
 * CanvasArrows.ts
 *
 * Arrow-heads on a canvas, and lines of them marching along a path.
 *
 * Motion is the one thing a still cross-section cannot show, so every screen that draws
 * one ends up needing the same two marks: a triangle pointing the way something is
 * going, and a row of them strung along a path to say that the whole path is flowing.
 * Both were written for the global screen's cross-sections; the Plate Motion screen
 * needs them verbatim, for convergence and divergence arrows and for the descending
 * slab, so they live here rather than being written twice.
 *
 * Free functions taking a context: they carry no state, and the caller sets the fill
 * before calling, which is what lets one arrow be a plate motion and the next a mantle
 * flow line without either function knowing about colour.
 */

/** Distance between successive arrow-heads on a flow line, view pixels. */
export const FLOW_MARKER_SPACING = 34;

/** Half-angle of the arrow-head, radians. Wide enough to read at 5 px. */
const HEAD_HALF_ANGLE = 2.4;

/** One filled triangular arrow-head at (x, y), pointing along `angle`. */
export function paintArrowHead(context: CanvasRenderingContext2D, x: number, y: number, angle: number, size = 5): void {
  context.beginPath();
  context.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
  context.lineTo(x + Math.cos(angle + HEAD_HALF_ANGLE) * size, y + Math.sin(angle + HEAD_HALF_ANGLE) * size);
  context.lineTo(x + Math.cos(angle - HEAD_HALF_ANGLE) * size, y + Math.sin(angle - HEAD_HALF_ANGLE) * size);
  context.closePath();
  context.fill();
}

/**
 * Arrow-heads marching from (x1, y1) towards (x2, y2), offset along the line by
 * `phase`. Animating the phase is what turns a static row of triangles into flow.
 */
export function paintFlowLine(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  phase: number,
  spacing = FLOW_MARKER_SPACING,
): void {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length === 0) {
    return;
  }
  const angle = Math.atan2(y2 - y1, x2 - x1);
  for (let along = phase; along < length; along += spacing) {
    const t = along / length;
    paintArrowHead(context, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, angle);
  }
}
