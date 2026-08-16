/**
 * CrustChooserPanel.ts
 *
 * The three kinds of crust the user can put at the boundary, and the two zones they go
 * into.
 *
 * ── Picking a side ────────────────────────────────────────────────────────────
 * Activating a piece *picks it up* rather than placing it, and the two zones drawn on the
 * section are what it is then handed to. The earlier version filled the first empty zone,
 * which meant the user could not say which side a plate went to — and a boundary is a
 * comparison between two sides, so "old ocean on the left" and "old ocean on the right"
 * are not the same experiment. Two presses still build one side, exactly as before; they
 * are now piece-then-side instead of piece-then-nothing.
 *
 * While a piece is in hand both zones highlight, which is PhET's `BoxHighlightNode`, and
 * the piece itself is ringed so it is obvious what is being carried. Pressing it again puts
 * it down. A filled zone can be cleared by activating it with nothing in hand, which is how
 * a user changes their mind without pressing New Crust.
 *
 * ── Two routes to the same place ──────────────────────────────────────────────
 * Each piece is a push button *and* a drag source, and both end at `model.activateZone`.
 *
 * The button is the route every input can take: a click, or Tab to the piece and Tab to a
 * zone. PhET had only the drag, which is a fine affordance with a pointer and no
 * affordance at all without one.
 *
 * The drag is the route a pointer expects, and it is what the piece looks like it wants —
 * a labelled slab of crust next to a picture with two crust-shaped holes in it. It is a
 * shortcut through the same two steps rather than a second mechanism: leaving the piece
 * arms it (so the zones light up exactly as a click would), and releasing over a zone
 * activates that zone. A drag that is released anywhere else leaves the piece in hand, so a
 * miss degrades into the click path instead of losing what was picked up.
 *
 * The two listeners stay out of each other's way by a distance threshold: below it nothing
 * has happened and the button fires as usual on release, and past it the drag takes over
 * and interrupts the button so the press cannot also count as a click.
 */

import { DerivedProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Vector2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { HBox, Node, PressListener, Rectangle, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { RectangularPushButton } from "scenerystack/sun";
import { FLAT_RECTANGULAR_BUTTON_OPTIONS, LIGHT_SURFACE_TEXT_FILL } from "../../common/PlateTectonicsButtonOptions.js";
import { PlateTectonicsPanel, type PlateTectonicsPanelOptions } from "../../common/PlateTectonicsPanel.js";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import type { Side } from "../model/BoundaryRules.js";
import type { PlateMotionModel } from "../model/PlateMotionModel.js";
import { PLATE_TYPES, type PlateType } from "../model/PlateType.js";

const TITLE_FONT = new PhetFont({ size: 13, weight: "bold" });
const PIECE_FONT = new PhetFont(12);

/** Size of the swatch on each crust piece, view pixels. */
const SWATCH_WIDTH = 22;
const SWATCH_HEIGHT = 12;

/**
 * How far the pointer must travel before a press on a piece becomes a drag, view pixels.
 *
 * Small enough that a deliberate drag is never mistaken for a click, large enough that the
 * hand-wobble in a click never starts one — and the two paths differ only in the shortcut,
 * so guessing wrong at the margin costs the user a press rather than a mistake.
 */
const DRAG_THRESHOLD_PX = 5;

/** What a piece being dragged needs from the screen it is being dragged across. */
export type CrustDropTarget = {
  /** Which drop zone is under a point in global coordinates, or null if neither is. */
  sideAtGlobalPoint: (globalPoint: Vector2) => Side | null;

  /** Told which zone the carried piece is over, so that zone can show it is the one. */
  setHoveredSide: (side: Side | null) => void;

  /** The layer the carried piece is drawn in, above everything it is dragged over. */
  dragLayer: Node;
};

/** The name of one kind of crust, localized. */
function nameProperty(type: PlateType): TReadOnlyProperty<string> {
  const motion = StringManager.getInstance().getPlateMotionStrings();
  return {
    continental: motion.continentalStringProperty,
    youngOceanic: motion.youngOceanicStringProperty,
    oldOceanic: motion.oldOceanicStringProperty,
  }[type];
}

/** The colour one kind of crust is painted in on the section, so the piece matches it. */
function colorProperty(type: PlateType): typeof PlateTectonicsColors.continentalCrustColorProperty {
  return {
    continental: PlateTectonicsColors.continentalCrustColorProperty,
    youngOceanic: PlateTectonicsColors.newCrustColorProperty,
    oldOceanic: PlateTectonicsColors.oceanicCrustColorProperty,
  }[type];
}

/** A swatch of the crust and its name — what a piece looks like, in the panel and in hand. */
function pieceContent(type: PlateType): Node {
  return new HBox({
    spacing: 6,
    children: [
      new Rectangle(0, 0, SWATCH_WIDTH, SWATCH_HEIGHT, {
        fill: colorProperty(type),
        stroke: PlateTectonicsColors.panelBorderColorProperty,
      }),
      new Text(nameProperty(type), { font: PIECE_FONT, fill: LIGHT_SURFACE_TEXT_FILL, maxWidth: 96 }),
    ],
  });
}

export type CrustChooserPanelOptions = PlateTectonicsPanelOptions;

export class CrustChooserPanel extends PlateTectonicsPanel {
  /** The interactive children, in the order the user should reach them. */
  public readonly focusOrder: Node[];

  /** Where a dragged piece can be dropped; null until the screen has built its section. */
  private dropTarget: CrustDropTarget | null = null;

  public constructor(model: PlateMotionModel, providedOptions?: CrustChooserPanelOptions) {
    const strings = StringManager.getInstance();
    const motion = strings.getPlateMotionStrings();
    const a11y = strings.getPlateMotionA11yStrings().controls;

    const buttons = PLATE_TYPES.map((type) => {
      const accessibleName = new DerivedProperty(
        [a11y.crustPieceStringProperty, nameProperty(type)],
        (pattern: string, name: string) => pattern.replace("{{name}}", name),
      );

      const button = new RectangularPushButton({
        ...FLAT_RECTANGULAR_BUTTON_OPTIONS,
        content: pieceContent(type),
        baseColor: PlateTectonicsColors.controlSurfaceColorProperty,
        accessibleName,
        accessibleHelpText: a11y.crustPieceHelpStringProperty,
        listener: () => {
          // Picks the piece up, or puts it back down if it was already in hand.
          model.armedPlateTypeProperty.value = model.armedPlateTypeProperty.value === type ? null : type;
        },
      });

      // Nothing to place once the boundary is running. Both sides being full is *not* a
      // reason to disable a piece: it can still be swapped onto either of them, which is
      // the comparison the screen is asking the user to make.
      const enabled = new DerivedProperty([model.animationStartedProperty], (started: boolean) => !started);
      enabled.link((value) => {
        button.enabled = value;
      });

      // Ringed while it is the piece being carried, in the same colour the two zones take
      // when they are waiting for it — so it is obvious at a glance what is in hand and
      // that pressing the piece again puts it down, rather than being a press that did
      // nothing.
      const armedHere = new DerivedProperty(
        [model.armedPlateTypeProperty],
        (armed: PlateType | null) => armed === type,
      );
      const highlight = new Rectangle(button.bounds.dilated(3), {
        stroke: PlateTectonicsColors.dropZoneActiveColorProperty,
        lineWidth: 3,
        cornerRadius: 6,
        visibleProperty: armedHere,
      });

      button.disposeEmitter.addListener(() => {
        armedHere.dispose();
        enabled.dispose();
        accessibleName.dispose();
      });

      return { type, button, piece: new Node({ children: [highlight, button] }) };
    });

    const content = new VBox({
      spacing: 6,
      align: "left",
      children: [
        new Text(motion.chooseCrustStringProperty, {
          font: TITLE_FONT,
          fill: PlateTectonicsColors.textColorProperty,
          maxWidth: 200,
        }),
        new HBox({ spacing: 6, children: buttons.map((entry) => entry.piece) }),
      ],
    });

    const options = optionize<CrustChooserPanelOptions, EmptySelfOptions, PlateTectonicsPanelOptions>()(
      {},
      providedOptions,
    );
    super(content, options);

    this.focusOrder = buttons.map((entry) => entry.button);

    for (const entry of buttons) {
      this.attachDrag(model, entry.piece, entry.button, entry.type);
    }
  }

  /**
   * Tells the panel where a dragged piece can be dropped.
   *
   * Set after construction rather than passed in, because the zones do not exist yet when
   * the panel is built: the section is laid out below the panel, so its bounds — and with
   * them the zones' — depend on how tall this panel turned out to be. Until it is set, a
   * drag simply does nothing and the buttons are the only route, which is also what happens
   * in a test that builds the panel on its own.
   */
  public setDropTarget(dropTarget: CrustDropTarget): void {
    this.dropTarget = dropTarget;
  }

  /**
   * Makes one piece draggable into a zone.
   *
   * Not attached to the pointer: the push button underneath presses first and claims it,
   * and a listener that took the pointer away would be taking it from the very button whose
   * click this is meant to leave working.
   */
  private attachDrag(model: PlateMotionModel, piece: Node, button: Node, type: PlateType): void {
    /** Where the press began, so that "has the pointer moved yet" can be answered. */
    let pressPoint: Vector2 | null = null;

    /** The last place the pointer was, which is where a release happens. */
    let lastPoint: Vector2 | null = null;

    /**
     * The piece as it looks in hand. Built once and parked between drags rather than built
     * per drag: it holds a localized Text, and one that was thrown away on every drop would
     * leave its link to the string behind.
     */
    let carriedPiece: Node | null = null;

    /** Whether that piece is currently under the pointer, rather than this being a click. */
    let carrying = false;

    const stopCarrying = (): void => {
      carriedPiece?.detach();
      carrying = false;
      this.dropTarget?.setHoveredSide(null);
      pressPoint = null;
      lastPoint = null;
    };

    const listener = new PressListener({
      attach: false,
      canStartPress: () => !model.animationStartedProperty.value && this.dropTarget !== null,

      press: () => {
        pressPoint = listener.pointer?.point.copy() ?? null;
        lastPoint = pressPoint;
      },

      drag: () => {
        const target = this.dropTarget;
        const point = listener.pointer?.point;
        if (!(target && point && pressPoint)) {
          return;
        }
        lastPoint = point;

        if (!carrying) {
          if (point.distance(pressPoint) < DRAG_THRESHOLD_PX) {
            return;
          }
          // Past the threshold this is a drag, so the button's pending click is cancelled:
          // otherwise the release would both drop the piece and toggle it back out of hand.
          button.interruptSubtreeInput();
          model.armedPlateTypeProperty.value = type;
          carriedPiece = carriedPiece ?? this.createCarriedPiece(type);
          target.dragLayer.addChild(carriedPiece);
          carrying = true;
        }

        if (carriedPiece) {
          carriedPiece.center = target.dragLayer.globalToLocalPoint(point);
        }
        target.setHoveredSide(target.sideAtGlobalPoint(point));
      },

      release: () => {
        const target = this.dropTarget;
        const point = listener.pointer?.point ?? lastPoint;
        const dropped = carrying && !listener.interrupted;
        stopCarrying();

        if (!(dropped && target && point)) {
          return;
        }
        const side = target.sideAtGlobalPoint(point);
        if (side !== null) {
          // The same call the zone makes when it is pressed — one way for a piece to be
          // placed, whichever route the user took to get there.
          model.activateZone(side);
        }
        // Released short of a zone, the piece stays in hand: the drag has done the first
        // half of the click path, and a zone press finishes it.
      },
    });
    piece.addInputListener(listener);

    // Anything that takes the piece out of the user's hand mid-drag — Reset All, New Crust,
    // arming another piece — ends the drag too, rather than leaving a piece being carried
    // that the model no longer believes in.
    const armedListener = (armed: PlateType | null): void => {
      if (carrying && armed !== type) {
        listener.interrupt();
      }
    };
    model.armedPlateTypeProperty.link(armedListener);

    this.disposeEmitter.addListener(() => {
      model.armedPlateTypeProperty.unlink(armedListener);
      listener.dispose();
      carriedPiece?.disposeSubtree();
    });
  }

  /**
   * The piece as it looks while it is being carried: the same swatch and name as the button,
   * on a card of its own so it reads as lifted off the panel rather than smeared across the
   * picture. Not pickable, or it would be the thing under the pointer at every drop.
   */
  private createCarriedPiece(type: PlateType): Node {
    const content = pieceContent(type);
    const card = new Rectangle(content.bounds.dilated(6), {
      fill: PlateTectonicsColors.controlSurfaceColorProperty,
      stroke: PlateTectonicsColors.dropZoneActiveColorProperty,
      lineWidth: 2,
      cornerRadius: 4,
    });
    return new Node({ children: [card, content], opacity: 0.9, pickable: false });
  }
}
