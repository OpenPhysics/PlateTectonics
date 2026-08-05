/**
 * GlobeProjection.ts
 *
 * Orthographic projection of the Earth onto a disc — the view you get looking at a
 * globe from far away — with a camera the user can turn by dragging.
 *
 * The camera is two numbers: the longitude and latitude of the point at the centre
 * of the disc. Turning the globe is therefore just moving that point, which keeps
 * "drag left, see what was to the east" honest at every zoom and tilt, and makes the
 * state trivial to reset.
 *
 *   const projection = new GlobeProjection(MAP_VIEW_BOUNDS);
 *   if (projection.project(lon, lat)) { … }   // false ⇒ far side, do not draw
 *   projection.rotateBy(deltaLon, deltaLat);  // from a DragListener
 *
 * The standard orthographic formulae (Snyder, *Map Projections — A Working Manual*,
 * pp. 145–153) are used in both directions:
 *
 *   cos c = sin φ₁ sin φ + cos φ₁ cos φ cos(λ − λ₀)     (≥ 0 ⇒ near side)
 *   x     = R cos φ sin(λ − λ₀)
 *   y     = R (cos φ₁ sin φ − sin φ₁ cos φ cos(λ − λ₀))
 *
 * Unlike the equirectangular map, nothing here wraps: the antimeridian is not a
 * special place on a sphere. What replaces it is the limb — the circle where the
 * near hemisphere ends — which is why `project` reports visibility.
 */

import { NumberProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { GLOBE_INITIAL_CENTER_LAT, GLOBE_INITIAL_CENTER_LON, GLOBE_RADIUS_MARGIN } from "../PlateTectonicsConstants.js";
import { type EarthProjection, wrapLongitude } from "./EarthProjection.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Angular length of the probe step {@link GlobeProjection.bearing} takes along a
 * compass bearing: one degree of arc, small enough that the projected direction is
 * the direction at the point rather than an average over a long way round the Earth.
 */
const BEARING_STEP_RAD = 1 * DEG_TO_RAD;

export class GlobeProjection implements EarthProjection {
  public readonly viewBounds: Bounds2;

  /** Radius of the projected disc, in view pixels. */
  public readonly radius: number;

  /** Centre of the projected disc, in view coordinates. */
  public readonly centerX: number;
  public readonly centerY: number;

  /** Longitude of the point at the centre of the disc; horizontal drag moves it. */
  public readonly centerLongitudeProperty: NumberProperty;

  /** Latitude of the point at the centre of the disc; vertical drag moves it. */
  public readonly centerLatitudeProperty: NumberProperty;

  public readonly cameraProperties: readonly TReadOnlyProperty<unknown>[];

  /** View x written by the most recent {@link project} call. */
  public x = 0;

  /** View y written by the most recent {@link project} call. */
  public y = 0;

  /**
   * Cosine of the angular distance from the camera to the point most recently
   * projected: 1 at the centre of the disc, 0 on the limb, negative on the far side.
   * A renderer that has to find where a polyline crosses the limb interpolates on
   * this, because it changes sign exactly there.
   */
  public depth = 0;

  /** x component of the unit vector written by the most recent {@link bearing} call. */
  public bearingX = 0;

  /** y component of the unit vector written by the most recent {@link bearing} call. */
  public bearingY = -1;

  /** Longitude written by the most recent {@link unproject} call, in degrees. */
  public lon = 0;

  /** Latitude written by the most recent {@link unproject} call, in degrees. */
  public lat = 0;

  // Sine and cosine of the camera latitude, which every projection needs and which
  // only change when the camera moves.
  private sinCenterLat = 0;
  private cosCenterLat = 1;
  private centerLonDegrees = 0;

  public constructor(viewBounds: Bounds2) {
    this.viewBounds = viewBounds;
    this.radius = Math.min(viewBounds.width, viewBounds.height) / 2 - GLOBE_RADIUS_MARGIN;
    this.centerX = viewBounds.centerX;
    this.centerY = viewBounds.centerY;

    this.centerLongitudeProperty = new NumberProperty(GLOBE_INITIAL_CENTER_LON);
    this.centerLatitudeProperty = new NumberProperty(GLOBE_INITIAL_CENTER_LAT);
    this.cameraProperties = [this.centerLongitudeProperty, this.centerLatitudeProperty];

    this.centerLongitudeProperty.link((lon: number) => {
      this.centerLonDegrees = lon;
    });
    this.centerLatitudeProperty.link((lat: number) => {
      this.sinCenterLat = Math.sin(lat * DEG_TO_RAD);
      this.cosCenterLat = Math.cos(lat * DEG_TO_RAD);
    });
  }

  /** Degrees of rotation one view pixel of drag is worth, at the centre of the disc. */
  public get degreesPerPixel(): number {
    return RAD_TO_DEG / this.radius;
  }

  /**
   * Projects a geographic point onto the disc, writing view coordinates to
   * {@link x} and {@link y}. Returns false for a point on the far hemisphere, whose
   * projection lands inside the disc as well and would otherwise be drawn through
   * the Earth.
   */
  public project(lon: number, lat: number): boolean {
    const deltaLon = (lon - this.centerLonDegrees) * DEG_TO_RAD;
    const latRad = lat * DEG_TO_RAD;
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);
    const cosDeltaLon = Math.cos(deltaLon);

    this.x = this.centerX + this.radius * cosLat * Math.sin(deltaLon);
    this.y = this.centerY - this.radius * (this.cosCenterLat * sinLat - this.sinCenterLat * cosLat * cosDeltaLon);
    this.depth = this.sinCenterLat * sinLat + this.cosCenterLat * cosLat * cosDeltaLon;

    return this.depth >= 0;
  }

  /**
   * Writes the screen direction of a compass bearing at a geographic point to
   * {@link bearingX} and {@link bearingY}.
   *
   * On a globe north is only "up" at the centre of the disc: towards the limb the
   * meridians fan out, and near the visible pole they point every which way. So the
   * direction is found the honest way — take a step along the bearing across the
   * sphere, project both ends, and use the screen direction between them.
   */
  public bearing(lon: number, lat: number, azimuthDegrees: number): void {
    const azimuth = azimuthDegrees * DEG_TO_RAD;
    const latRad = lat * DEG_TO_RAD;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const cosStep = Math.cos(BEARING_STEP_RAD);
    const sinStep = Math.sin(BEARING_STEP_RAD);

    // Destination of a great-circle step of BEARING_STEP_RAD along the bearing.
    const sinStepLat = sinLat * cosStep + cosLat * sinStep * Math.cos(azimuth);
    const stepLat = Math.asin(Math.max(-1, Math.min(1, sinStepLat)));
    const stepLon = lon + Math.atan2(Math.sin(azimuth) * sinStep * cosLat, cosStep - sinLat * sinStepLat) * RAD_TO_DEG;

    this.project(stepLon, stepLat * RAD_TO_DEG);
    const toX = this.x;
    const toY = this.y;
    this.project(lon, lat);

    const dx = toX - this.x;
    const dy = toY - this.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      // Standing on the pole the camera is looking straight down at: no direction
      // survives projection, so leave the arrow pointing up rather than dividing by zero.
      this.bearingX = 0;
      this.bearingY = -1;
      return;
    }
    this.bearingX = dx / length;
    this.bearingY = dy / length;
  }

  /**
   * Inverse of {@link project}: the geographic point under a view coordinate, written
   * to {@link lon} and {@link lat}. Returns false outside the disc, where there is no
   * Earth to hit — which is how the relief raster knows to leave a pixel transparent.
   */
  public unproject(viewX: number, viewY: number): boolean {
    const dx = (viewX - this.centerX) / this.radius;
    const dy = (this.centerY - viewY) / this.radius;
    const rhoSquared = dx * dx + dy * dy;
    if (rhoSquared > 1) {
      return false;
    }

    const rho = Math.sqrt(rhoSquared);
    if (rho === 0) {
      this.lon = this.centerLonDegrees;
      this.lat = Math.asin(this.sinCenterLat) * RAD_TO_DEG;
      return true;
    }

    // For an orthographic projection sin c is the distance from the centre, so the
    // cosine follows from the disc geometry without a trigonometric call.
    const sinC = rho;
    const cosC = Math.sqrt(1 - rhoSquared);

    const sinLat = cosC * this.sinCenterLat + (dy * sinC * this.cosCenterLat) / rho;
    this.lat = Math.asin(Math.max(-1, Math.min(1, sinLat))) * RAD_TO_DEG;
    this.lon = wrapLongitude(
      this.centerLonDegrees +
        Math.atan2(dx * sinC, rho * cosC * this.cosCenterLat - dy * sinC * this.sinCenterLat) * RAD_TO_DEG,
    );
    return true;
  }

  /** True when a view coordinate lies on the projected disc. */
  public containsViewPoint(viewX: number, viewY: number): boolean {
    const dx = viewX - this.centerX;
    const dy = viewY - this.centerY;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  /**
   * Turns the globe by the given number of degrees. Latitude is clamped at the
   * poles rather than wrapped, so the globe never turns upside down mid-drag;
   * longitude wraps, so it can be spun indefinitely.
   */
  public rotateBy(deltaLongitude: number, deltaLatitude: number): void {
    this.centerLongitudeProperty.value = wrapLongitude(this.centerLongitudeProperty.value + deltaLongitude);
    this.centerLatitudeProperty.value = Math.max(-90, Math.min(90, this.centerLatitudeProperty.value + deltaLatitude));
  }

  /** Returns the camera to the view the globe opens on. */
  public reset(): void {
    this.centerLongitudeProperty.reset();
    this.centerLatitudeProperty.reset();
  }
}
