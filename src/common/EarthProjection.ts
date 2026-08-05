/**
 * EarthProjection.ts
 *
 * The contract shared by the two ways this sim puts the Earth on screen: the flat
 * equirectangular {@link MapProjection} and the rotatable orthographic
 * {@link GlobeProjection}. Everything that draws geography — the canvas layers, the
 * plate labels and motion arrows — is written against this interface, so the same
 * datasets are painted the same way on either.
 *
 * `project` writes its result into public scratch fields instead of returning a
 * point, for the same reason `PlateReconstruction.transform` does: the renderer calls
 * it tens of thousands of times per frame and allocating there would dominate the
 * frame budget.
 *
 *   if (projection.project(lon, lat)) {
 *     context.lineTo(projection.x, projection.y);
 *   }
 *
 * The boolean is what separates a sphere from a rectangle: on the flat map every
 * point is on screen, while on the globe half the world faces away from the viewer.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";

export interface EarthProjection {
  /** The rectangle the projection draws inside. */
  readonly viewBounds: Bounds2;

  /**
   * Properties that move every projected point when they change, so a view can link
   * to them and redraw. Empty for a projection with no camera of its own.
   */
  readonly cameraProperties: readonly TReadOnlyProperty<unknown>[];

  /** View x written by the most recent {@link project} call. */
  readonly x: number;

  /** View y written by the most recent {@link project} call. */
  readonly y: number;

  /** x component of the unit vector written by the most recent {@link bearing} call. */
  readonly bearingX: number;

  /** y component of the unit vector written by the most recent {@link bearing} call. */
  readonly bearingY: number;

  /**
   * Projects a geographic point, writing view coordinates to {@link x} and {@link y}.
   * Returns false when the point faces away from the viewer, in which case the
   * coordinates are still written but must not be drawn.
   */
  project(lon: number, lat: number): boolean;

  /**
   * Writes to {@link bearingX} and {@link bearingY} a unit screen vector along a
   * compass bearing (degrees clockwise from north) at a geographic point — which way
   * a plate-motion arrow should point. How a bearing turns into a screen direction is
   * the projection's business, and the two answer it differently.
   */
  bearing(lon: number, lat: number, azimuthDegrees: number): void;
}
