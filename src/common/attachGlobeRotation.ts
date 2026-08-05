/**
 * attachGlobeRotation.ts
 *
 * Makes a Node a handle for turning a {@link GlobeProjection}, by pointer and by
 * keyboard:
 *
 *  - **Drag** moves the globe under the pointer: drag right and the surface goes
 *    right, so what was to the west comes into view. One view pixel of drag turns the
 *    globe by one pixel's worth of arc at the centre of the disc, which is what makes
 *    a drag feel like it has hold of the surface rather than of a slider.
 *  - **Arrow keys** move the viewpoint instead: right looks further east, up looks
 *    further north. That is the opposite sense to the drag, and deliberately so —
 *    it is the convention every mapping application uses for arrows, and the
 *    accessible help text says which way they go.
 *
 * Latitude stops at the poles rather than tipping over, and longitude wraps, so the
 * globe can be spun as long as the user likes without the camera drifting out of range.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import type { Vector2 } from "scenerystack/dot";
import { DragListener, KeyboardListener, type Node } from "scenerystack/scenery";
import { GLOBE_KEYBOARD_STEP_DEGREES } from "../PlateTectonicsConstants.js";
import type { GlobeProjection } from "./GlobeProjection.js";

export type AttachGlobeRotationOptions = {
  projection: GlobeProjection;
  /** Localized accessible name for the focusable globe. */
  accessibleNameProperty: TReadOnlyProperty<string>;
  /** Localized help text describing the drag and the arrow keys. */
  accessibleHelpTextProperty?: TReadOnlyProperty<string>;
};

/**
 * Makes `target` a focusable, draggable globe control. Returns `target` for chaining.
 */
export function attachGlobeRotation<T extends Node>(target: T, options: AttachGlobeRotationOptions): T {
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
        // Drag right ⇒ the surface travels right ⇒ the centre longitude moves west.
        // Drag down ⇒ the surface travels down ⇒ the centre latitude moves north.
        projection.rotateBy(-(point.x - lastPoint.x) * degreesPerPixel, (point.y - lastPoint.y) * degreesPerPixel);
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
        const step = GLOBE_KEYBOARD_STEP_DEGREES;
        if (keysPressed === "arrowLeft") {
          projection.rotateBy(-step, 0);
        } else if (keysPressed === "arrowRight") {
          projection.rotateBy(step, 0);
        } else if (keysPressed === "arrowUp") {
          projection.rotateBy(0, step);
        } else if (keysPressed === "arrowDown") {
          projection.rotateBy(0, -step);
        }
      },
    }),
  );

  return target;
}
