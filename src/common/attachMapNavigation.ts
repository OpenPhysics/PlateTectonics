/**
 * attachMapNavigation.ts
 *
 * Makes a Node a handle for panning a {@link MapProjection}, by pointer and by
 * keyboard — the flat map's counterpart to {@link attachGlobeRotation}, and
 * deliberately the same two gestures in the same two senses:
 *
 *  - **Drag** moves the map under the pointer: drag right and the map goes right, so
 *    what was to the west comes into view. One view pixel of drag moves the map by
 *    one pixel, at every zoom level, which is what makes a drag feel like it has hold
 *    of the map rather than of a slider.
 *  - **Arrow keys** move the viewpoint instead: right looks further east, up looks
 *    further north. That is the opposite sense to the drag, and deliberately so — it
 *    is the convention every mapping application uses for arrows, and the accessible
 *    help text says which way they go.
 *
 * Panning east and west always does something, because the map wraps. Panning north
 * and south does nothing until the user zooms in: while the whole world is on screen
 * there is no more latitude to bring into view, so the camera is clamped to the
 * equator (see `MapProjection.latitudeLimit`) and the up and down arrows are inert.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import type { Vector2 } from "scenerystack/dot";
import { DragListener, KeyboardListener, type Node } from "scenerystack/scenery";
import { MAP_KEYBOARD_STEP_PIXELS } from "../PlateTectonicsConstants.js";
import type { MapProjection } from "./MapProjection.js";

export type AttachMapNavigationOptions = {
  projection: MapProjection;
  /** Localized accessible name for the focusable map. */
  accessibleNameProperty: TReadOnlyProperty<string>;
  /** Localized help text describing the drag and the arrow keys. */
  accessibleHelpTextProperty?: TReadOnlyProperty<string>;
};

/**
 * Makes `target` a focusable, draggable map. Returns `target` for chaining.
 */
export function attachMapNavigation<T extends Node>(target: T, options: AttachMapNavigationOptions): T {
  const { projection, accessibleNameProperty, accessibleHelpTextProperty } = options;

  target.tagName = "div";
  target.focusable = true;
  target.accessibleName = accessibleNameProperty;
  if (accessibleHelpTextProperty) {
    target.accessibleHelpText = accessibleHelpTextProperty;
  }

  let lastPoint: Vector2 | null = null;

  target.addInputListener(
    new DragListener({
      start: (event) => {
        lastPoint = event.pointer.point.copy();
      },
      drag: (event) => {
        if (!lastPoint) {
          return;
        }
        const point = event.pointer.point;
        const degreesPerPixel = projection.degreesPerPixel;
        // Drag right ⇒ the map travels right ⇒ the centre longitude moves west.
        // Drag down ⇒ the map travels down ⇒ the centre latitude moves north.
        projection.panBy(-(point.x - lastPoint.x) * degreesPerPixel, (point.y - lastPoint.y) * degreesPerPixel);
        lastPoint = point.copy();
      },
      end: () => {
        lastPoint = null;
      },
    }),
  );

  target.addInputListener(
    new KeyboardListener({
      keys: ["arrowLeft", "arrowRight", "arrowUp", "arrowDown"],
      fireOnHold: true,
      fire: (_event, keysPressed) => {
        // A fixed number of view pixels rather than of degrees, so one press covers
        // the same distance on screen however far the map is zoomed in.
        const step = MAP_KEYBOARD_STEP_PIXELS * projection.degreesPerPixel;
        if (keysPressed === "arrowLeft") {
          projection.panBy(-step, 0);
        } else if (keysPressed === "arrowRight") {
          projection.panBy(step, 0);
        } else if (keysPressed === "arrowUp") {
          projection.panBy(0, step);
        } else if (keysPressed === "arrowDown") {
          projection.panBy(0, -step);
        }
      },
    }),
  );

  return target;
}
