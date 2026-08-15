/**
 * SectionRulerNode.ts
 *
 * A ruler the user drags across the cross-section, to measure how thick a plate is or
 * how deep a slab has got.
 *
 * ── Why it is back ────────────────────────────────────────────────────────────
 * PhET's Java version had one (`RulerNode3D`) and this port dropped it, on the grounds
 * that a flat section carries its own implied scale. The 3-D block takes that away: it
 * is a perspective picture, so a distance near the front of the block is drawn larger
 * than the same distance further back, and the vertical-exaggeration control means the
 * relationship between a vertical distance and a horizontal one is something the user
 * sets. A ruler is the only honest way to answer "how thick is that" once both of those
 * are true.
 *
 * ── How it sits on a picture with depth ───────────────────────────────────────
 * The ruler is a Scenery `RulerNode`, not something painted into the block's canvas, so
 * its numbers stay localizable and reachable by a screen reader — the same split the
 * whole simulation makes between the painted picture and the words on top of it.
 *
 * That means it is a rigid rectangle laid over a picture whose scale varies across it.
 * The compromise is to fit the rectangle to the section *at the ruler's own position*:
 * each time it moves, its two ends are projected through the placement, and the result
 * sets the ruler's pixel length and its angle. Over the ruler's own length the residual
 * error is well under a tick, and in exchange the reading is exact at both ends, the
 * ruler lies along the curve of the block rather than cutting across it, and the tick
 * labels are real text.
 *
 * ── How little the section can give it ────────────────────────────────────────
 * That fitted length varies by more than a factor of a hundred. Stretching the block
 * vertically makes the camera pull back to keep the whole thing in frame, so the same
 * ruler is 143 px across the Plate Motion block at true scale and 28 px at eight times
 * exaggeration near the bottom of the section; the Crust screen's whole-Earth zoom draws
 * 150 km as ten pixels, and one pixel once stretched. So the drawn ruler has to degrade
 * rather than assume it has room: numbers are dropped as they crowd (see
 * {@link fitTickLabels}), and below {@link MIN_BODY_PIXELS} the whole body is scaled down,
 * which keeps its ends on the two points it is measuring between instead of drawing a
 * legible ruler that would be lying about the distance.
 *
 * Draggable by pointer and by keyboard, following the same pattern as EarthProbeNode.
 */

import type { Property, TReadOnlyProperty } from "scenerystack/axon";
import { type Bounds2, Matrix3, Vector2 } from "scenerystack/dot";
import { DragListener, KeyboardListener, Node, type NodeOptions } from "scenerystack/scenery";
import { PhetFont, RulerNode } from "scenerystack/scenery-phet";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { SectionPlacement } from "./SectionPlacement.js";

const TICK_FONT = new PhetFont(9);
const UNITS_FONT = new PhetFont(9);

/** Height of the ruler's body, view pixels. */
const RULER_HEIGHT = 26;

/** View pixels the ruler moves per arrow-key press. */
const KEYBOARD_STEP_PIXELS = 8;

/**
 * Width allowed for one character of a tick label, view pixels.
 *
 * A digit at `TICK_FONT` is about five pixels wide, and this is deliberately over that.
 * These estimates only decide when a number is dropped, so erring high drops one slightly
 * early, which is a better failure than leaving two numbers touching — and unlike a
 * measured width it is the same number in a test as it is in a browser.
 */
const TICK_CHAR_PIXELS = 6;

/** Clear space kept between neighbouring tick labels, view pixels. */
const LABEL_GAP_PIXELS = 6;

/** Space RulerNode leaves between a tick label and the units — its own default. */
const UNITS_SPACING_PIXELS = 3;

/** Room kept for the units label after the last numbered tick, view pixels. */
const UNITS_PIXELS = 12;

/**
 * Shortest body the ruler is built at, view pixels.
 *
 * Below this the body is built at this length and scaled down, rather than built shorter:
 * a uniform shrink cannot make labels collide, and it keeps the ruler honest about a view
 * in which the distance it measures really is a few pixels across.
 */
const MIN_BODY_PIXELS = 48;

/** How a ruler of a given drawn length is numbered. */
export type TickLabelFit = {
  /** One entry per major tick: its number, or "" for a tick drawn without one. */
  readonly labels: string[];

  /** The tick the units label follows. Always the last numbered one. */
  readonly unitsMajorTickIndex: number;
};

/**
 * Which of a ruler's major ticks carry a number when its body is `pixelLength` long.
 *
 * Two things decide this, and only the first is about legibility. Numbers that would
 * crowd are dropped — half of them at a time, until the rest are clear — while the ticks
 * themselves all stay, so a shrunken ruler is still a ruler and not a blank bar.
 *
 * The second is that RulerNode places its units label between the tick it is given and
 * the next *numbered* tick, and asserts that the space between them is positive. Numbering
 * the far end and putting the units before it makes that space shrink with the ruler,
 * which is what the section does to it. So the units always follow the last numbered tick
 * and every tick after it is left blank: with no next number there is no space to run out
 * of. Nothing is lost by that, because with `insetsWidth: 0` RulerNode does not draw the
 * first or last label anyway — the ends of the body are those two marks.
 */
export function fitTickLabels(values: readonly string[], pixelLength: number): TickLabelFit {
  const spacing = pixelLength / (values.length - 1);

  /** A tick that could carry a number, and how wide that number would be. */
  type Numbered = { readonly index: number; readonly width: number };

  // Only the interior ticks are candidates, for the reason in the doc above.
  let numbered: Numbered[] = values
    .map((value, index) => ({ index, width: value.length * TICK_CHAR_PIXELS }))
    .slice(1, -1);

  /** Whether neighbouring numbers clear each other. */
  const areClear = (ticks: Numbered[]): boolean =>
    ticks.every((tick, i) => {
      const previous = ticks[i - 1];
      return (
        previous === undefined ||
        (tick.index - previous.index) * spacing >= (tick.width + previous.width) / 2 + LABEL_GAP_PIXELS
      );
    });

  /** Whether the units still fit between the last number and the end of the body. */
  const unitsFit = (ticks: Numbered[]): boolean => {
    const last = ticks[ticks.length - 1];
    const unitsLeft = last === undefined ? 0 : last.index * spacing + last.width / 2;
    return unitsLeft + UNITS_SPACING_PIXELS + UNITS_PIXELS <= pixelLength - UNITS_SPACING_PIXELS;
  };

  while (numbered.length > 0 && !(areClear(numbered) && unitsFit(numbered))) {
    numbered = numbered.length === 1 ? [] : numbered.filter((_tick, i) => i % 2 === 0);
  }

  const kept = new Set(numbered.map((tick) => tick.index));
  return {
    labels: values.map((value, index) => (kept.has(index) ? value : "")),
    unitsMajorTickIndex: numbered[numbered.length - 1]?.index ?? 0,
  };
}

export type SectionRulerNodeOptions = {
  /** How the ruler reaches the picture. Replaced when the view or the zoom changes. */
  placement: SectionPlacement;

  /** Length of the ruler in model metres — what it actually measures end to end. */
  lengthM: number;

  /** Model metres between labelled ticks. Must divide `lengthM`. */
  majorTickM: number;

  /** Where the ruler's left end may go, in view coordinates. */
  dragBounds: Bounds2;

  /** Localized "km". */
  unitsStringProperty: TReadOnlyProperty<string>;

  /** Accessible name and help text, from the owning screen's a11y strings. */
  rulerAccessibleName: TReadOnlyProperty<string>;
  rulerAccessibleHelpText: TReadOnlyProperty<string>;
} & NodeOptions;

export class SectionRulerNode extends Node {
  /**
   * Re-places the ruler from its unchanged model position.
   *
   * Called by the owning screen after swapping in a new placement — a zoom change or a
   * switch between the flat section and the block moves the picture under a ruler that
   * has not itself moved, and a ruler left where it was would be measuring in the units
   * of the picture it was last drawn against.
   */
  public readonly refreshPosition: () => void;

  public constructor(positionProperty: Property<Vector2>, providedOptions: SectionRulerNodeOptions) {
    const { placement, lengthM, majorTickM, dragBounds, unitsStringProperty, ...nodeOptions } = providedOptions;

    super({ cursor: "pointer", ...nodeOptions });

    let currentPlacement = placement;

    // Labels are in kilometres, which is the unit every other distance on these screens
    // is quoted in. Built once: the tick *values* never change, only the pixel spacing
    // between them and how many of them there is room to draw.
    const tickValues: string[] = [];
    for (let distanceM = 0; distanceM <= lengthM + 1; distanceM += majorTickM) {
      tickValues.push(String(Math.round(distanceM / 1000)));
    }

    const body = new Node();
    this.addChild(body);

    // The RulerNode currently drawn, kept so it can be disposed on the next rebuild — it
    // links its units label to a translated string Property, and a ruler is rebuilt on
    // every step of a drag.
    let ruler: RulerNode | null = null;

    /** Rebuilds the ruler at the pixel length the section currently gives it. */
    const rebuild = (): void => {
      const position = positionProperty.value;
      const left = currentPlacement.modelToView(position.x, position.y);
      const right = currentPlacement.modelToView(position.x + lengthM, position.y);

      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const pixelLength = Math.hypot(dx, dy);

      // Sub-pixel means the section has compressed the distance to nothing; there is no
      // ruler to draw. The node itself stays in the traversal order, so the keyboard can
      // still move it back out of wherever that happened.
      body.visible = Number.isFinite(pixelLength) && pixelLength >= 1;
      if (!body.visible) {
        return;
      }

      // Never built shorter than MIN_BODY_PIXELS: past that the body is drawn at its
      // minimum and shrunk to fit, which keeps its ends on the points it measures between
      // without letting its labels pile up.
      const bodyLength = Math.max(pixelLength, MIN_BODY_PIXELS);
      const spacing = bodyLength / (tickValues.length - 1);
      const fit = fitTickLabels(tickValues, bodyLength);

      ruler?.dispose();
      ruler = new RulerNode(bodyLength, RULER_HEIGHT, spacing, fit.labels, unitsStringProperty, {
        insetsWidth: 0,
        majorTickFont: TICK_FONT,
        unitsFont: UNITS_FONT,
        unitsMajorTickIndex: fit.unitsMajorTickIndex,
        unitsSpacing: UNITS_SPACING_PIXELS,
        // Minor ticks are dropped before they turn into a smudge, at the point where four
        // of them would be a few pixels apart.
        minorTicksPerMajorTick: spacing >= 30 ? 4 : spacing >= 12 ? 1 : 0,
        backgroundFill: PlateTectonicsColors.controlSurfaceColorProperty,
        backgroundStroke: PlateTectonicsColors.panelBorderColorProperty,
        majorTickStroke: PlateTectonicsColors.controlSurfaceTextColorProperty,
        minorTickStroke: PlateTectonicsColors.controlSurfaceTextColorProperty,
        tickMarksOnBottom: false,
        opacity: 0.92,
      });

      // Scaled and turned about its own origin, which is the zero tick on the ruler's
      // measuring edge — so a ruler on a steeply curved part of the block still starts
      // exactly on the point the model position names.
      ruler.matrix = Matrix3.rotation2(Math.atan2(dy, dx)).timesMatrix(Matrix3.scaling(pixelLength / bodyLength));
      body.addChild(ruler);
      body.translation = new Vector2(left.x, left.y);
    };

    this.refreshPosition = rebuild;

    positionProperty.link(() => rebuild());

    /** Moves the ruler so its left end lands on a view point, clamped to the play area. */
    const moveTo = (viewPoint: Vector2): void => {
      const clamped = dragBounds.closestPointTo(viewPoint);
      positionProperty.value = currentPlacement.viewToModel(clamped.x, clamped.y);
    };

    const dragListener = new DragListener({
      // The drag is applied to the ruler's left end rather than to wherever it was
      // grabbed, so a ruler picked up by its middle jumps once. That is the same
      // behaviour the probe has, and the alternative — carrying a grab offset through a
      // non-uniform projection — does not stay consistent across a curved section.
      drag: (event) => moveTo(this.globalToParentPoint(event.pointer.point)),
    });
    this.addInputListener(dragListener);

    this.focusable = true;
    this.tagName = "div";
    this.ariaRole = "application";
    this.accessibleName = providedOptions.rulerAccessibleName;
    this.accessibleHelpText = providedOptions.rulerAccessibleHelpText;

    const keyboardListener = new KeyboardListener({
      keys: ["arrowLeft", "arrowRight", "arrowUp", "arrowDown"],
      fire: (_event, keysPressed) => {
        const left = currentPlacement.modelToView(positionProperty.value.x, positionProperty.value.y);
        const step = KEYBOARD_STEP_PIXELS;
        const delta =
          keysPressed === "arrowLeft"
            ? new Vector2(-step, 0)
            : keysPressed === "arrowRight"
              ? new Vector2(step, 0)
              : keysPressed === "arrowUp"
                ? new Vector2(0, -step)
                : new Vector2(0, step);
        moveTo(left.plus(delta));
      },
    });
    this.addInputListener(keyboardListener);

    this.disposeEmitter.addListener(() => {
      ruler?.dispose();
      dragListener.dispose();
      keyboardListener.dispose();
    });

    /** Re-aims the ruler at a new view of the section. */
    this.setPlacement = (next: SectionPlacement): void => {
      currentPlacement = next;
      rebuild();
    };

    // The first ruler is built by the link above, which fires on registration.
  }

  /** Re-aims the ruler after a zoom change or a switch between the two views. */
  public readonly setPlacement: (placement: SectionPlacement) => void;
}
