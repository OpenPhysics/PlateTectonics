/**
 * PlateHandleNode.ts
 *
 * A handle standing on each plate, which the user pulls to move it. This is manual mode:
 * the clock does not run, and dragging a handle is what advances time.
 *
 * ── Why this is worth having ──────────────────────────────────────────────────
 * Automatic mode reaches the same states, but not the same claim. Choosing "divergent"
 * from a list and watching a ridge appear teaches that divergent boundaries have ridges.
 * Pulling two plates apart and watching a ridge appear teaches that pulling plates apart
 * *makes* a ridge — which is the screen's causal story and the reason PhET made manual the
 * default mode rather than an extra.
 *
 * The handle also selects the motion. Drag outward and the boundary becomes divergent;
 * drag inward and it becomes convergent. Nothing has to be chosen first, and the choice is
 * made by doing the thing rather than by naming it. If the pairing cannot do the motion
 * being asked for, the handle simply refuses and the disabled radio button in the boundary
 * chooser is what explains why — one error surface, not two.
 *
 * ── This does not break time-as-a-pure-parameter ──────────────────────────────
 * A handle moves `timeMillionsOfYearsProperty` and nothing else; every shape on the screen
 * is still a pure function of it, so Rewind and step-while-paused stay exact. PhET did the
 * same — `manualHandleDragTimeChange` called `clock.stepByWallSecondsForced`. See
 * doc/implementation-notes.md.
 *
 * ── Divergence from PhET ──────────────────────────────────────────────────────
 * PhET took the absolute value of the drag rate, so a handle pushed *back* the way it came
 * still ran the boundary forwards. Here the sign is kept: pulling in the direction of the
 * chosen motion advances the clock, and pushing against it retreats. That makes the handle
 * a scrub control as well as a throttle, which is what lets the arrow keys on a focused
 * handle do something a keyboard user would expect, and it costs nothing — the clock is a
 * parameter, so running it backwards is exact.
 */

import { Multilink, type TReadOnlyProperty } from "scenerystack/axon";
import { type Bounds2, Vector2 } from "scenerystack/dot";
import { Circle, DragListener, KeyboardListener, Line, Node, type NodeOptions } from "scenerystack/scenery";
import type { SectionPlacement } from "../../common/view/SectionPlacement.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { Side } from "../model/BoundaryRules.js";
import { boundaryGeometry, elevationAtX, restingGeometry } from "../model/PlateGeometry.js";
import { manualDragRateMyrPerSecond, type PlateMotionModel } from "../model/PlateMotionModel.js";

/** Model x each handle stands at, m either side of the boundary — on the plate, not its edge. */
const HANDLE_ANCHOR_XM = 320000;

/** Height of the stick above the ground it stands on, view pixels. */
const STICK_HEIGHT = 44;

/** Radius of the ball on top, view pixels. */
const BALL_RADIUS = 10;

/** Width of the stick, view pixels. */
const STICK_WIDTH = 4;

/**
 * How far the ball travels for a full-rate drag, as a fraction of the viewport's width.
 *
 * Against the viewport rather than against a pixel count, which is PhET's one substantive
 * change here: its handles were tilted through an angle in a fixed 1008 × 676 stage, and
 * this simulation's play area is not a fixed size.
 */
const TRAVEL_FRACTION = 0.11;

/** Deflection below which a drag has not yet said which motion is wanted, as a fraction. */
const SELECTION_THRESHOLD = 0.12;

/** How much of the clock one arrow-key press moves, Myr. */
const KEYBOARD_STEP_MYR = 1;

export type PlateHandleNodeOptions = {
  /** How the handle reaches the picture that is currently showing. */
  placement: SectionPlacement;

  /** The viewport, which sets how far the ball travels. */
  viewBounds: Bounds2;

  accessibleName: TReadOnlyProperty<string>;
  accessibleHelpText: TReadOnlyProperty<string>;
} & NodeOptions;

export class PlateHandleNode extends Node {
  private readonly model: PlateMotionModel;
  private readonly side: Side;
  /** Named viewBounds, not bounds: Node.bounds is a property on the base class. */
  private readonly viewBounds: Bounds2;

  private placement: SectionPlacement;

  /**
   * How far the ball has been pulled from rest, as a signed fraction of its travel.
   *
   * Positive is *outward*, away from the boundary, whichever side this handle is on — so
   * one sign convention covers both handles and "outward means diverging" is true of each.
   */
  private deflection = 0;

  private readonly stick: Line;
  private readonly ball: Circle;

  public constructor(model: PlateMotionModel, side: Side, providedOptions: PlateHandleNodeOptions) {
    const { placement, viewBounds, accessibleName, accessibleHelpText, ...nodeOptions } = providedOptions;

    super({ cursor: "pointer", ...nodeOptions });

    this.model = model;
    this.side = side;
    this.viewBounds = viewBounds;
    this.placement = placement;

    this.stick = new Line(0, 0, 0, 0, {
      stroke: PlateTectonicsColors.accentColorProperty,
      lineWidth: STICK_WIDTH,
      lineCap: "round",
    });
    this.ball = new Circle(BALL_RADIUS, {
      fill: PlateTectonicsColors.accentColorProperty,
      stroke: PlateTectonicsColors.panelBorderColorProperty,
      lineWidth: 1,
    });
    this.addChild(this.stick);
    this.addChild(this.ball);

    // Only in manual mode, and only once there is something to move. In automatic mode a
    // handle would be a control that did nothing, which is worse than no control.
    const visible = Multilink.multilinkAny([model.isManualModeProperty, model.hasBothPlatesProperty], () => {
      this.visible = model.isManualModeProperty.value && model.hasBothPlatesProperty.value;
    });

    // The ground under the handle moves as the boundary runs — a collision lifts it, a
    // trench drops it — so the handle is re-placed on every change to the picture.
    const reposition = Multilink.multilinkAny(
      [
        model.leftPlateTypeProperty,
        model.rightPlateTypeProperty,
        model.motionTypeProperty,
        model.timeMillionsOfYearsProperty,
      ],
      () => this.updateShape(),
    );

    const dragListener = new DragListener({
      start: () => {
        this.deflection = 0;
      },
      drag: (event) => {
        const local = this.globalToParentPoint(event.pointer.point);
        const rest = this.restPosition();
        const sign = this.side === "left" ? -1 : 1;
        const outward = ((local.x - rest.x) * sign) / this.travelPixels();
        this.setDeflection(outward);
      },
      end: () => {
        this.setDeflection(0);
      },
    });
    this.addInputListener(dragListener);

    this.focusable = true;
    this.tagName = "div";
    this.ariaRole = "application";
    this.accessibleName = accessibleName;
    this.accessibleHelpText = accessibleHelpText;

    // Arrow keys move the clock in fixed steps rather than holding the handle out: a key
    // press is an event, not a duration, and a keyboard user should get the same amount of
    // history per press however long the browser takes to deliver the next one.
    const keyboardListener = new KeyboardListener({
      keys: ["arrowLeft", "arrowRight"],
      fire: (_event, keysPressed) => {
        const sign = this.side === "left" ? -1 : 1;
        const outward = (keysPressed === "arrowRight" ? 1 : -1) * sign;
        if (!this.chooseMotion(outward)) {
          return;
        }
        model.advanceManual(this.towardChosenMotion(outward) * KEYBOARD_STEP_MYR);
      },
    });
    this.addInputListener(keyboardListener);

    this.disposeEmitter.addListener(() => {
      keyboardListener.dispose();
      dragListener.dispose();
      reposition.dispose();
      visible.dispose();
    });

    this.updateShape();
  }

  /** Re-aims the handle, after a switch between the flat section and the block. */
  public setPlacement(placement: SectionPlacement): void {
    this.placement = placement;
    this.updateShape();
  }

  /**
   * Runs the clock for one frame of being held out.
   *
   * Called from the screen's `step`, because a held handle advances time for as long as it
   * is held and there is no Property change to hang that on.
   */
  public step(dt: number): void {
    if (this.deflection === 0 || !this.visible) {
      return;
    }
    const signed = this.towardChosenMotion(this.deflection) * Math.abs(this.deflection);
    this.model.advanceManual(manualDragRateMyrPerSecond(signed) * dt);
  }

  /**
   * Takes a new deflection, choosing the motion if one has not been chosen yet.
   *
   * A deflection that would select an illegal motion is dropped rather than clamped to
   * zero silently — the ball follows the pointer, but nothing happens, which is the same
   * feedback a disabled control gives.
   */
  private setDeflection(outward: number): void {
    const clamped = Math.min(1, Math.max(-1, outward));
    this.deflection = this.chooseMotion(clamped) ? clamped : 0;
    this.updateShape();
  }

  /**
   * Whether a deflection of this sign can drive the boundary.
   *
   * Only the threshold is decided here — below it the pointer has wandered rather than
   * pulled, and PhET guarded the same way so a stray twitch could not commit the user to a
   * boundary type. Which motion a deflection means, and whether this pairing can do it, is
   * the model's rule.
   */
  private chooseMotion(outward: number): boolean {
    if (this.model.motionTypeProperty.value === null && Math.abs(outward) < SELECTION_THRESHOLD) {
      return false;
    }
    return this.model.selectMotionFromDrag(outward);
  }

  /**
   * +1 if a deflection of this sign runs the chosen motion forwards, −1 if it runs it
   * back, 0 if there is nothing chosen to run.
   */
  private towardChosenMotion(outward: number): number {
    const motion = this.model.motionTypeProperty.value;
    if (motion === null || outward === 0) {
      return 0;
    }
    const forwards = motion === "divergent" ? outward > 0 : outward < 0;
    return forwards ? 1 : -1;
  }

  /** How far the ball moves for a full-rate drag, view pixels. */
  private travelPixels(): number {
    return this.viewBounds.width * TRAVEL_FRACTION;
  }

  /** Where the foot of the stick sits: on the plate's surface, at the handle's own x. */
  private restPosition(): Vector2 {
    const model = this.model;
    const left = model.leftPlateTypeProperty.value;
    const right = model.rightPlateTypeProperty.value;
    const xM = (this.side === "left" ? -1 : 1) * HANDLE_ANCHOR_XM;
    if (!(left && right)) {
      return this.placement.modelToView(xM, 0);
    }

    const motion = model.motionTypeProperty.value;
    const geometry = motion
      ? boundaryGeometry(motion, left, right, model.timeMillionsOfYearsProperty.value)
      : restingGeometry(left, right);
    const outline = this.side === "left" ? geometry.left : geometry.right;
    return this.placement.modelToView(xM, elevationAtX(outline.crustTop, xM));
  }

  /**
   * Redraws the stick and ball at the handle's current lean.
   *
   * The foot stays on the ground and the ball moves, so the handle leans the way it is
   * being pulled — a gear lever rather than a slider, which is PhET's shape and reads as
   * something to grab rather than something to point at.
   */
  private updateShape(): void {
    const foot = this.restPosition();
    const sign = this.side === "left" ? -1 : 1;
    const lean = this.deflection * sign * this.travelPixels();

    const ballX = foot.x + lean;
    const ballY = foot.y - STICK_HEIGHT;

    this.stick.setLine(foot.x, foot.y, ballX, ballY);
    this.ball.center = new Vector2(ballX, ballY);
  }
}
