/**
 * MapProjection.ts
 *
 * Equirectangular (plate carrée) projection between geographic coordinates and
 * the view. Longitude maps linearly to x and latitude linearly to y, so a 2:1
 * viewport (see `MAP_VIEW_BOUNDS`) gives equal pixels per degree on both axes.
 *
 * The projection is deliberately simple: it keeps every overlay — plate outlines,
 * boundaries, epicentres, motion vectors — in exact register with the relief
 * raster, which is rendered on the same grid by `npm run build-data`.
 *
 *   const projection = new MapProjection(MAP_VIEW_BOUNDS);
 *   const x = projection.viewX(lon);
 *   const y = projection.viewY(lat);
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import type { EarthProjection } from "./EarthProjection.js";

export class MapProjection implements EarthProjection {
  public readonly viewBounds: Bounds2;

  /** The flat map has no camera to turn, so nothing ever moves every point at once. */
  public readonly cameraProperties: readonly TReadOnlyProperty<unknown>[] = [];

  /** View x written by the most recent {@link project} call. */
  public x = 0;

  /** View y written by the most recent {@link project} call. */
  public y = 0;

  /** x component of the unit vector written by the most recent {@link bearing} call. */
  public bearingX = 0;

  /** y component of the unit vector written by the most recent {@link bearing} call. */
  public bearingY = -1;

  public constructor(viewBounds: Bounds2) {
    this.viewBounds = viewBounds;
  }

  /**
   * Projects a geographic point, writing view coordinates to {@link x} and
   * {@link y}. Always visible: an equirectangular map shows the whole world at once.
   */
  public project(lon: number, lat: number): boolean {
    this.x = this.viewX(lon);
    this.y = this.viewY(lat);
    return true;
  }

  /**
   * A motion arrow on the flat map points along its compass bearing as read off the
   * map's own north — 45° draws up and to the right wherever the plate is.
   *
   * That is not the direction the plate's path would take across an equirectangular
   * map, which stretches longitude by 1/cos(latitude) and so would swing a
   * high-latitude arrow towards the horizontal. The compass bearing is what the
   * arrow is *for* — "the Nazca plate moves east" — so it is what is drawn, and the
   * position of a plate is left to say the rest.
   */
  public bearing(_lon: number, _lat: number, azimuthDegrees: number): void {
    const azimuth = azimuthDegrees * (Math.PI / 180);
    this.bearingX = Math.sin(azimuth);
    this.bearingY = -Math.cos(azimuth);
  }

  /** View x for a longitude in [-180, 180]. */
  public viewX(lon: number): number {
    return this.viewBounds.minX + ((lon + 180) / 360) * this.viewBounds.width;
  }

  /** View y for a latitude in [-90, 90]; y increases downwards, so north is up. */
  public viewY(lat: number): number {
    return this.viewBounds.minY + ((90 - lat) / 180) * this.viewBounds.height;
  }

  /** Longitude at a view x. */
  public longitudeAt(viewX: number): number {
    return ((viewX - this.viewBounds.minX) / this.viewBounds.width) * 360 - 180;
  }

  /** Latitude at a view y. */
  public latitudeAt(viewY: number): number {
    return 90 - ((viewY - this.viewBounds.minY) / this.viewBounds.height) * 180;
  }

  /** View pixels per degree of longitude. */
  public get pixelsPerDegree(): number {
    return this.viewBounds.width / 360;
  }
}
