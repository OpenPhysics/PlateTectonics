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
 *
 * ── The camera ────────────────────────────────────────────────────────────────
 * Like the globe, the flat map has a camera: the longitude and latitude at the
 * centre of the viewport, plus a zoom level the map is scaled by 2^level. At level 0
 * the whole world is on screen exactly as it always was, and only the longitude can
 * move — there is no more latitude to show, so panning north and south is clamped to
 * nothing. Zooming in shrinks what fits, and the up/down room appears with it.
 *
 * Longitude wraps and latitude clamps, so the map can be panned east forever but
 * never past a pole. That asymmetry is the projection's, not the interaction's:
 * a cylinder is periodic in longitude and bounded in latitude.
 */

import { NumberProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { Range } from "scenerystack/dot";
import { MAP_MAX_ZOOM_LEVEL, MAP_MIN_ZOOM_LEVEL, MAP_VIEWPORT_CULL_MARGIN } from "../PlateTectonicsConstants.js";
import { type EarthProjection, wrapLongitude } from "./EarthProjection.js";

export class MapProjection implements EarthProjection {
  public readonly viewBounds: Bounds2;

  /** Zoom level; the map is drawn at 2^level, so level 0 fits the world in the viewport. */
  public readonly zoomLevelProperty: NumberProperty;

  /** Longitude at the centre of the viewport; horizontal panning moves it, and it wraps. */
  public readonly centerLongitudeProperty: NumberProperty;

  /** Latitude at the centre of the viewport; pinned to the equator until zoomed in. */
  public readonly centerLatitudeProperty: NumberProperty;

  /** Moving any of these moves every projected point at once. */
  public readonly cameraProperties: readonly TReadOnlyProperty<unknown>[];

  /** View x written by the most recent {@link project} call. */
  public x = 0;

  /** View y written by the most recent {@link project} call. */
  public y = 0;

  /** x component of the unit vector written by the most recent {@link bearing} call. */
  public bearingX = 0;

  /** y component of the unit vector written by the most recent {@link bearing} call. */
  public bearingY = -1;

  // The camera, cached from the Properties above: every projected point needs all
  // three, and they only change when the user pans or zooms.
  private scale = 1;
  private centerLon = 0;
  private centerLat = 0;

  public constructor(viewBounds: Bounds2) {
    this.viewBounds = viewBounds;

    this.zoomLevelProperty = new NumberProperty(MAP_MIN_ZOOM_LEVEL, {
      range: new Range(MAP_MIN_ZOOM_LEVEL, MAP_MAX_ZOOM_LEVEL),
      numberType: "Integer",
    });
    this.centerLongitudeProperty = new NumberProperty(0);
    this.centerLatitudeProperty = new NumberProperty(0);
    this.cameraProperties = [this.zoomLevelProperty, this.centerLongitudeProperty, this.centerLatitudeProperty];

    this.zoomLevelProperty.link((level: number) => {
      this.scale = 2 ** level;
      // Zooming out shows more latitude at once, which can leave the camera further
      // north or south than the new zoom level has room for.
      this.centerLatitudeProperty.value = this.constrainLatitude(this.centerLatitudeProperty.value);
    });
    this.centerLongitudeProperty.link((lon: number) => {
      this.centerLon = lon;
    });
    this.centerLatitudeProperty.link((lat: number) => {
      this.centerLat = lat;
    });
  }

  /**
   * Projects a geographic point, writing view coordinates to {@link x} and {@link y}.
   *
   * The longitude is first wrapped into the half-turn either side of the camera, so a
   * point is placed on the copy of the world the map is currently looking at rather
   * than always at its ±180° home. Returns false when the result falls outside the
   * viewport, which at level 0 never happens and when zoomed in is most of the world.
   */
  public project(lon: number, lat: number): boolean {
    this.x = this.viewX(this.centerLon + wrapLongitude(lon - this.centerLon));
    this.y = this.viewY(lat);
    return this.isOnScreen(this.x, this.y);
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

  /**
   * View x for a longitude, which is *not* wrapped: the mapping stays linear so a
   * polyline that has been unwrapped past the antimeridian keeps its shape, and the
   * renderer repeats it a world-width either side to cover the seam.
   */
  public viewX(lon: number): number {
    return this.viewBounds.centerX + (lon - this.centerLon) * this.pixelsPerDegree;
  }

  /** View y for a latitude in [-90, 90]; y increases downwards, so north is up. */
  public viewY(lat: number): number {
    return this.viewBounds.centerY - (lat - this.centerLat) * this.pixelsPerDegreeY;
  }

  /** Longitude at a view x, in the same unwrapped sense as {@link viewX}. */
  public longitudeAt(viewX: number): number {
    return this.centerLon + (viewX - this.viewBounds.centerX) / this.pixelsPerDegree;
  }

  /** Latitude at a view y. */
  public latitudeAt(viewY: number): number {
    return this.centerLat - (viewY - this.viewBounds.centerY) / this.pixelsPerDegreeY;
  }

  /** View pixels per degree of longitude at the current zoom. */
  public get pixelsPerDegree(): number {
    return (this.viewBounds.width / 360) * this.scale;
  }

  /** Degrees of longitude one view pixel of drag is worth at the current zoom. */
  public get degreesPerPixel(): number {
    return 1 / this.pixelsPerDegree;
  }

  /** Width in view pixels of one whole world at the current zoom. */
  public get worldWidth(): number {
    return this.viewBounds.width * this.scale;
  }

  /** Height in view pixels of one whole world at the current zoom. */
  public get worldHeight(): number {
    return this.viewBounds.height * this.scale;
  }

  /**
   * How far the camera may move from the equator: zero at level 0, where the whole
   * 180° of latitude is already on screen, and approaching a pole as the visible
   * span shrinks. Keeping to it is what stops the map being panned off its own top.
   */
  public get latitudeLimit(): number {
    return 90 - 90 / this.scale;
  }

  /** True when the map is showing the whole world, its opening state. */
  public get isWholeWorld(): boolean {
    return this.scale === 1;
  }

  /**
   * Pans the camera by the given number of degrees. Longitude wraps, so the map can
   * be dragged east indefinitely; latitude is clamped to {@link latitudeLimit}, so
   * the viewport never runs off the top or bottom of the map.
   */
  public panBy(deltaLongitude: number, deltaLatitude: number): void {
    this.centerLongitudeProperty.value = wrapLongitude(this.centerLongitudeProperty.value + deltaLongitude);
    this.centerLatitudeProperty.value = this.constrainLatitude(this.centerLatitudeProperty.value + deltaLatitude);
  }

  /** Returns the camera to the whole-world view the map opens on. */
  public reset(): void {
    this.zoomLevelProperty.reset();
    this.centerLongitudeProperty.reset();
    this.centerLatitudeProperty.reset();
  }

  /** View pixels per degree of latitude; equal to {@link pixelsPerDegree} in a 2:1 viewport. */
  private get pixelsPerDegreeY(): number {
    return (this.viewBounds.height / 180) * this.scale;
  }

  /**
   * True when a view point is close enough to the viewport to be worth drawing. The
   * margin covers markers and labels whose centre is just outside it, which would
   * otherwise pop out of existence a few pixels early instead of being clipped.
   */
  private isOnScreen(viewX: number, viewY: number): boolean {
    const margin = MAP_VIEWPORT_CULL_MARGIN;
    return (
      viewX >= this.viewBounds.minX - margin &&
      viewX <= this.viewBounds.maxX + margin &&
      viewY >= this.viewBounds.minY - margin &&
      viewY <= this.viewBounds.maxY + margin
    );
  }

  /** Clamps a camera latitude to what the current zoom level has room for. */
  private constrainLatitude(lat: number): number {
    const limit = this.latitudeLimit;
    return Math.max(-limit, Math.min(limit, lat));
  }
}
