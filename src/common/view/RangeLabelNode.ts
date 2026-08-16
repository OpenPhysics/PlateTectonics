/**
 * RangeLabelNode.ts
 *
 * A label that names a *range* rather than a point: the top and the bottom of a layer,
 * with the name between them.
 *
 * ── Why an extent and not a caption ───────────────────────────────────────────
 * PhET's `RangeLabelNode` is the thing that makes the Crust screen's thickness slider
 * legible — a caption reading "Crust" floating in a band says only which rock it is,
 * while a bar drawn from the top of the crust to its base says *where the crust starts
 * and stops*, which is the quantity the slider changes. On the Plate Motion screen it is
 * the only thing that distinguishes the crust from the lithosphere it rides on: the two
 * ranges share a top edge and differ only in where they end, so nothing short of two
 * extents can tell them apart.
 *
 * Drawn in the "error bars" style PhET used: a crossbar at each end and a line between
 * them, broken where the name sits. The text itself stays horizontal rather than being
 * rotated onto the range's own axis, which Java did — these ranges are near-vertical in
 * both views, and rotated text is harder to read and worse for a translator whose string
 * is twice as long.
 *
 * ── Positioning ───────────────────────────────────────────────────────────────
 * Both ends go through a {@link SectionPlacement}, so the same label lands on the same
 * rock whether the screen is showing the flat section or the 3-D block, and follows the
 * block's vertical exaggeration for free.
 *
 * A range can also run off the viewport — the whole-Earth zoom puts the inner core's
 * base below the bottom edge — and a label centred between two points, one of which is
 * off screen, is itself off screen. {@link rangeLabelLayout} therefore centres the name
 * in the *visible* part of the range, which is PhET's `getLabelPosition`.
 *
 * When the range is too short to hold the name at all the label collapses: the name moves
 * out to the side with a leader line back to the middle of the range, rather than being
 * dropped. That is what lets a 6 km crust still be named on a picture 300 km deep.
 *
 * The layout is a pure function, tested in tests/RangeLabelNode.test.ts.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { type Bounds2, Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Node, type NodeOptions, Path, type TColor, Text } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { SectionPlacement } from "./SectionPlacement.js";

/** Half-width of the crossbar at each end of a range, view pixels. */
const BAR_HALF_WIDTH = 5;

/** Clear space left between the name and the two line segments meeting it, view pixels. */
const LABEL_CLEARANCE = 1.3;

/** The collapsed leader line: a diagonal out of the range, then a horizontal run. */
const COLLAPSED_DIAGONAL = 10;
const COLLAPSED_HORIZONTAL = 20;

/** Gap between the end of the leader line and the name it points to, view pixels. */
const COLLAPSED_LABEL_GAP = 4;

const DEFAULT_FONT = new PhetFont(12);

/** Where the pieces of one range label go, in view pixels. */
export type RangeLabelLayout = {
  /** The projected top and bottom of the range. */
  readonly top: Vector2;
  readonly bottom: Vector2;

  /** Where the middle of the name sits — inside the range, or out to the side. */
  readonly labelCenter: Vector2;

  /** Whether the range was too short to hold the name and the label was moved aside. */
  readonly collapsed: boolean;
};

/**
 * Where a range label's parts land, given how tall its name is.
 *
 * `labelHeight` is in view pixels and has to be measured from the built `Text`, which is
 * why this takes it rather than working it out: text height depends on the font, the
 * locale and the platform, and guessing it is what makes a label overlap its own bar.
 */
export function rangeLabelLayout(
  placement: SectionPlacement,
  topM: Vector2,
  bottomM: Vector2,
  viewBounds: Bounds2,
  labelHeight: number,
): RangeLabelLayout {
  const top = placement.modelToView(topM.x, topM.y);
  const bottom = placement.modelToView(bottomM.x, bottomM.y);

  // Centre the name in the part of the range that is actually on screen. Expressed as a
  // fraction along the range rather than as a y, so a range that leans — which it does on
  // the block, where the section is curved — keeps its label on the line joining its ends.
  const visibleTopY = Math.max(top.y, viewBounds.minY);
  const visibleBottomY = Math.min(bottom.y, viewBounds.maxY);
  const span = bottom.y - top.y;
  const rawRatio = span === 0 ? 0.5 : ((visibleTopY + visibleBottomY) / 2 - top.y) / span;
  const ratio = Math.min(1, Math.max(0, rawRatio));
  const labelCenter = top.plus(bottom.minus(top).timesScalar(ratio));

  // Does the name fit between the two ends? PhET's test, kept: the top edge of the name
  // (with its clearance) must still be below the top of the range, measured along the
  // range's own direction.
  const direction = bottom.minus(top);
  const length = direction.magnitude;
  const unit = length === 0 ? new Vector2(0, 1) : direction.timesScalar(1 / length);
  const allowance = (labelHeight / 2) * LABEL_CLEARANCE;
  const collapsed = labelCenter.minus(unit.timesScalar(allowance)).minus(top).dot(unit) < 0;

  return { top, bottom, labelCenter, collapsed };
}

type SelfOptions = {
  /** How the label reaches the picture that is currently showing. */
  placement: SectionPlacement;

  /** The two ends of the range, in model metres (x across, elevation up). */
  topM: Vector2;
  bottomM: Vector2;

  /** The name to put between them. */
  label: TReadOnlyProperty<string>;

  /** The viewport, so a range running off it can be pulled back inside. */
  viewBounds: Bounds2;

  /** Colour of the bars, the leader line and the name. */
  fill?: TColor;

  font?: PhetFont;

  /** Longest the name is allowed to be drawn, view pixels. */
  maxTextWidth?: number;
};

export type RangeLabelNodeOptions = SelfOptions & NodeOptions;

export class RangeLabelNode extends Node {
  /** Where the parts of this label ended up — the same layout the node was built from. */
  public readonly layout: RangeLabelLayout;

  public constructor(providedOptions: RangeLabelNodeOptions) {
    const {
      placement,
      topM,
      bottomM,
      label,
      viewBounds,
      fill = PlateTectonicsColors.textColorProperty,
      font = DEFAULT_FONT,
      maxTextWidth = 140,
      ...nodeOptions
    } = providedOptions;

    super(nodeOptions);

    // Built first so its height is known: the layout turns on whether the name fits
    // between the two ends, which cannot be decided without measuring it.
    const text = new Text(label, { font, fill, maxWidth: maxTextWidth });
    const layout = rangeLabelLayout(placement, topM, bottomM, viewBounds, text.height);
    this.layout = layout;

    const { top, bottom, labelCenter, collapsed } = layout;

    const direction = bottom.minus(top);
    const length = direction.magnitude;
    const unit = length === 0 ? new Vector2(0, 1) : direction.timesScalar(1 / length);

    // Perpendicular to the range, so the crossbars sit square across it even where the
    // block's curvature has tilted it.
    const across = new Vector2(-unit.y, unit.x).timesScalar(BAR_HALF_WIDTH);

    const shape = new Shape();

    if (collapsed) {
      // No room between the ends: the name goes out to the side, on a leader line back to
      // the middle of the range. The crossbars are dropped with it — at this size they
      // would be two marks a pixel apart, which reads as noise rather than as an extent.
      const elbow = labelCenter.plusXY(COLLAPSED_DIAGONAL, -COLLAPSED_DIAGONAL);
      const end = elbow.plusXY(COLLAPSED_HORIZONTAL, 0);
      shape.moveToPoint(labelCenter).lineToPoint(elbow).lineToPoint(end);

      text.left = end.x + COLLAPSED_LABEL_GAP;
      text.centerY = end.y;
    } else {
      // The extent proper: a crossbar at each end, and the line between them broken where
      // the name sits.
      shape.moveToPoint(top.minus(across)).lineToPoint(top.plus(across));
      shape.moveToPoint(bottom.minus(across)).lineToPoint(bottom.plus(across));

      const allowance = (text.height / 2) * LABEL_CLEARANCE;
      shape.moveToPoint(top).lineToPoint(labelCenter.minus(unit.timesScalar(allowance)));
      shape.moveToPoint(labelCenter.plus(unit.timesScalar(allowance))).lineToPoint(bottom);

      text.center = labelCenter;
    }

    // The bar is clipped to the viewport; the name is not. A range that runs off the
    // section — the whole-Earth zoom's core, or any shell on a stretched block — has an
    // end that projects hundreds of pixels past the picture, and an unclipped leg is drawn
    // straight across the legend and the navigation bar below it. The name has already
    // been pulled inside by the layout, so it needs no clip and keeps its full bounds for
    // anything that measures it.
    this.addChild(new Path(shape, { stroke: fill, lineWidth: 1, clipArea: Shape.bounds(viewBounds) }));
    this.addChild(text);
  }
}
