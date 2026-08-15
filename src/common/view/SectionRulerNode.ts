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
 * Draggable by pointer and by keyboard, following the same pattern as EarthProbeNode.
 */

import type { Property, TReadOnlyProperty } from "scenerystack/axon";
import { type Bounds2, Vector2 } from "scenerystack/dot";
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
    // between them.
    const tickLabels: string[] = [];
    for (let distanceM = 0; distanceM <= lengthM + 1; distanceM += majorTickM) {
      tickLabels.push(String(Math.round(distanceM / 1000)));
    }

    const body = new Node();
    this.addChild(body);

    /** Rebuilds the ruler at the pixel length the section currently gives it. */
    const rebuild = (): void => {
      const position = positionProperty.value;
      const left = currentPlacement.modelToView(position.x, position.y);
      const right = currentPlacement.modelToView(position.x + lengthM, position.y);

      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const pixelLength = Math.hypot(dx, dy);
      if (!(pixelLength > 1 && Number.isFinite(pixelLength))) {
        return;
      }

      body.removeAllChildren();
      const ruler = new RulerNode(
        pixelLength,
        RULER_HEIGHT,
        pixelLength / (tickLabels.length - 1),
        tickLabels,
        unitsStringProperty,
        {
          insetsWidth: 0,
          majorTickFont: TICK_FONT,
          unitsFont: UNITS_FONT,
          unitsMajorTickIndex: Math.max(0, tickLabels.length - 2),
          minorTicksPerMajorTick: 4,
          backgroundFill: PlateTectonicsColors.controlSurfaceColorProperty,
          backgroundStroke: PlateTectonicsColors.panelBorderColorProperty,
          majorTickStroke: PlateTectonicsColors.controlSurfaceTextColorProperty,
          minorTickStroke: PlateTectonicsColors.controlSurfaceTextColorProperty,
          tickMarksOnBottom: false,
          opacity: 0.92,
        },
      );

      // Rotated about its own left end, which is the end the model position names, so a
      // ruler on a steeply curved part of the block still starts where it is meant to.
      ruler.rotation = Math.atan2(dy, dx);
      ruler.left = 0;
      ruler.top = 0;
      body.addChild(ruler);

      body.translation = new Vector2(left.x, left.y).minus(new Vector2(ruler.bounds.minX, ruler.bounds.minY));
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
      dragListener.dispose();
      keyboardListener.dispose();
    });

    /** Re-aims the ruler at a new view of the section. */
    this.setPlacement = (next: SectionPlacement): void => {
      currentPlacement = next;
      rebuild();
    };

    rebuild();
  }

  /** Re-aims the ruler after a zoom change or a switch between the two views. */
  public readonly setPlacement: (placement: SectionPlacement) => void;
}
