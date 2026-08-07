/**
 * EarthProbeNode.ts
 *
 * A probe the user drags through a cross-section; it reads out the temperature and
 * density of whatever it is sitting in.
 *
 * This replaces the three separate tools PhET's version had — a thermometer, a density
 * meter and a ruler. One probe reporting both quantities is better here for a reason
 * beyond tidiness: the point of the screen is that temperature and density are not
 * independent, and reading them at the same place at the same time is what makes that
 * legible. The ruler is dropped; the section carries its own depth and distance axes.
 *
 * Draggable by pointer and by keyboard, following the same focusable-Node pattern as
 * `attachMapNavigation`. Position is model metres and lives in the model; the transform
 * between model and view is supplied by the owning screen, so the probe stays correct
 * across a zoom change without knowing anything about zoom.
 */

import { DerivedProperty, type Property, type TReadOnlyProperty } from "scenerystack/axon";
import type { Bounds2, Vector2 } from "scenerystack/dot";
import { Shape } from "scenerystack/kite";
import { Circle, DragListener, KeyboardListener, Node, type NodeOptions, Path, Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import PlateTectonicsColors from "../../PlateTectonicsColors.js";
import { PANEL_CORNER_RADIUS } from "../../PlateTectonicsConstants.js";
import { PlateTectonicsPanel } from "../PlateTectonicsPanel.js";

const READOUT_FONT = new PhetFont(11);

/** Radius of the probe's tip, view pixels. */
const TIP_RADIUS = 5;

/** View pixels the probe moves per arrow-key press. */
const KEYBOARD_STEP_PIXELS = 8;

export type EarthProbeNodeOptions = {
  /** Model metres → view pixels, supplied by the owning screen's scale. */
  modelToView: (xM: number, elevationM: number) => Vector2;

  /** View pixels → model metres. */
  viewToModel: (viewX: number, viewY: number) => Vector2;

  /** Where the probe's tip may go, in view coordinates. */
  dragBounds: Bounds2;

  /** Temperature at a model point, K. */
  temperatureAt: (xM: number, elevationM: number) => number;

  /** Density at a model point, kg/m³. */
  densityAt: (xM: number, elevationM: number) => number;

  /**
   * Model properties that change what the probe is sitting in. Moving the thickness
   * slider has to update a stationary probe, because the rock under it has changed.
   */
  readoutDependencies: readonly TReadOnlyProperty<unknown>[];

  /** Accessible help text, from the owning screen's a11y strings. */
  probeAccessibleHelpText: TReadOnlyProperty<string>;
} & NodeOptions;

export class EarthProbeNode extends Node {
  /**
   * Re-places the probe from its unchanged model position.
   *
   * The owning screen calls this after swapping in a new scale. Without it the probe
   * would keep the view position it was last drawn at while the picture underneath it
   * changed scale, so it would end up pointing at the wrong depth — and reading out a
   * temperature and density for somewhere it is no longer sitting.
   */
  public readonly refreshPosition: () => void;

  public constructor(positionProperty: Property<Vector2>, providedOptions: EarthProbeNodeOptions) {
    const {
      modelToView,
      viewToModel,
      dragBounds,
      temperatureAt,
      densityAt,
      readoutDependencies,
      probeAccessibleHelpText,
      ...nodeOptions
    } = providedOptions;

    super(nodeOptions);

    const material = StringManager.getInstance().getMaterialStrings();

    this.cursor = "pointer";
    this.tagName = "div";
    this.focusable = true;
    this.accessibleName = material.probeStringProperty;
    this.accessibleHelpText = probeAccessibleHelpText;

    // ── The probe itself: a crosshair on a tip ────────────────────────────────
    const tip = new Circle(TIP_RADIUS, {
      fill: PlateTectonicsColors.controlSurfaceColorProperty,
      stroke: PlateTectonicsColors.accentColorProperty,
      lineWidth: 2,
    });
    const crosshair = new Path(
      new Shape()
        .moveTo(-TIP_RADIUS * 2.2, 0)
        .lineTo(TIP_RADIUS * 2.2, 0)
        .moveTo(0, -TIP_RADIUS * 2.2)
        .lineTo(0, TIP_RADIUS * 2.2),
      { stroke: PlateTectonicsColors.accentColorProperty, lineWidth: 1 },
    );

    // ── The readout, floating above the tip ───────────────────────────────────
    const readoutLine = (
      pattern: TReadOnlyProperty<string>,
      valueAt: (xM: number, elevationM: number) => number,
    ): { text: Text; property: TReadOnlyProperty<string> } => {
      const property = DerivedProperty.deriveAny([positionProperty, pattern, ...readoutDependencies], () => {
        const { x, y } = positionProperty.value;
        return pattern.value.replace("{{value}}", Math.round(valueAt(x, y)).toString());
      });
      const text = new Text(property, {
        font: READOUT_FONT,
        fill: PlateTectonicsColors.controlSurfaceTextColorProperty,
      });
      return { text, property };
    };

    // Kelvin in the model, Celsius on screen: nobody reads a rock temperature in K.
    const temperature = readoutLine(
      material.probeTemperatureStringProperty,
      (xM, elevationM) => temperatureAt(xM, elevationM) - 273.15,
    );
    const density = readoutLine(material.probeDensityStringProperty, densityAt);

    const readout = new PlateTectonicsPanel(new VBox({ children: [temperature.text, density.text], spacing: 1 }), {
      fill: PlateTectonicsColors.controlSurfaceColorProperty,
      stroke: PlateTectonicsColors.panelBorderColorProperty,
      cornerRadius: PANEL_CORNER_RADIUS,
      xMargin: 6,
      yMargin: 4,
    });

    this.children = [readout, crosshair, tip];

    // ── Follow the model position ─────────────────────────────────────────────
    const followPosition = (position: Vector2): void => {
      const view = modelToView(position.x, position.y);
      tip.center = view;
      crosshair.center = view;
      readout.centerX = view.x;
      // Above the tip by default, below it when there is no room above — otherwise the
      // readout slides off the top of the screen exactly when the probe is somewhere
      // interesting, like the base of the crust at the shallowest zoom.
      const above = view.y - TIP_RADIUS * 3 - readout.height;
      readout.top = above < dragBounds.minY ? view.y + TIP_RADIUS * 3 : above;
      // Keep it inside the viewport horizontally too, at the left and right edges.
      readout.left = Math.max(dragBounds.minX, Math.min(dragBounds.maxX - readout.width, readout.left));
    };
    positionProperty.link(followPosition);
    this.refreshPosition = () => followPosition(positionProperty.value);

    // ── Dragging, by pointer and by keyboard ──────────────────────────────────
    const moveToView = (viewPoint: Vector2): void => {
      const clamped = dragBounds.closestPointTo(viewPoint);
      positionProperty.value = viewToModel(clamped.x, clamped.y);
    };
    const nudge = (dx: number, dy: number): void => {
      const current = modelToView(positionProperty.value.x, positionProperty.value.y);
      moveToView(current.plusXY(dx, dy));
    };

    let lastPoint: Vector2 | null = null;
    const dragListener = new DragListener({
      start: (event) => {
        lastPoint = event.pointer.point.copy();
      },
      drag: (event) => {
        if (!lastPoint) {
          return;
        }
        const point = event.pointer.point;
        nudge(point.x - lastPoint.x, point.y - lastPoint.y);
        lastPoint = point.copy();
      },
      end: () => {
        lastPoint = null;
      },
    });
    this.addInputListener(dragListener);

    const keyboardListener = new KeyboardListener({
      keys: ["arrowLeft", "arrowRight", "arrowUp", "arrowDown"],
      fireOnHold: true,
      fire: (_event, keysPressed) => {
        if (keysPressed === "arrowLeft") {
          nudge(-KEYBOARD_STEP_PIXELS, 0);
        } else if (keysPressed === "arrowRight") {
          nudge(KEYBOARD_STEP_PIXELS, 0);
        } else if (keysPressed === "arrowUp") {
          nudge(0, -KEYBOARD_STEP_PIXELS);
        } else if (keysPressed === "arrowDown") {
          nudge(0, KEYBOARD_STEP_PIXELS);
        }
      },
    });
    this.addInputListener(keyboardListener);

    this.disposeEmitter.addListener(() => {
      positionProperty.unlink(followPosition);
      this.removeInputListener(keyboardListener);
      this.removeInputListener(dragListener);
      keyboardListener.dispose();
      dragListener.dispose();
      density.property.dispose();
      temperature.property.dispose();
    });
  }
}
