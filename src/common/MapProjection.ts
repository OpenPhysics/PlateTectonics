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

import type { Bounds2 } from "scenerystack/dot";

export class MapProjection {
  public readonly viewBounds: Bounds2;

  public constructor(viewBounds: Bounds2) {
    this.viewBounds = viewBounds;
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
