/**
 * PlateTectonicsConstants.ts
 *
 * Every named numeric constant used across the simulation: view layout in screen
 * pixels, and Earth-science quantities in their conventional units (km for depths
 * and distances, mm/year for plate speeds, million years for geological time).
 *
 * Colors live in PlateTectonicsColors.ts; user-visible text lives in the locale JSON.
 */

import { Bounds2 } from "scenerystack/dot";
import PlateTectonicsNamespace from "./PlateTectonicsNamespace.js";

// ── Layout / chrome (screen pixels in the 1024 × 618 ScreenView space) ─────────

/** Margin between the screen edge and edge-anchored controls (e.g. Reset All). */
export const SCREEN_VIEW_MARGIN = 15;

/** Corner radius shared by control panels and dialogs. */
export const PANEL_CORNER_RADIUS = 6;

/**
 * The main viewport, shared by the global map and every cross-section. Its 2:1
 * aspect ratio is what keeps an equirectangular world map undistorted in the sense
 * that 1° of longitude and 1° of latitude occupy the same number of pixels.
 */
export const MAP_VIEW_BOUNDS = new Bounds2(SCREEN_VIEW_MARGIN, 52, SCREEN_VIEW_MARGIN + 728, 52 + 364);

/** Width of the control column down the right-hand side. */
export const CONTROL_PANEL_WIDTH = 250;

/** Vertical gap between stacked panels. */
export const PANEL_SPACING = 8;

// ── Map rendering ─────────────────────────────────────────────────────────────

/** Line width of plate-boundary polylines, in view pixels. */
export const BOUNDARY_LINE_WIDTH = 2.4;

/** Opacity of the per-plate color wash drawn over the base map. */
export const PLATE_FILL_OPACITY = 0.22;

/** Radius of an earthquake marker at the catalogue's smallest magnitude. */
export const QUAKE_BASE_RADIUS = 1.1;

/** Extra marker radius per magnitude unit above the smallest. */
export const QUAKE_RADIUS_PER_MAGNITUDE = 1.15;

/** Half-width of the triangle drawn for a volcano. */
export const VOLCANO_MARKER_SIZE = 3.4;

/** Length in view pixels of a motion vector representing 100 mm/year. */
export const VELOCITY_VECTOR_SCALE = 26;

// ── Panning and zooming the flat map ──────────────────────────────────────────

/** Zoom level at which the whole world fits the viewport; the map opens here. */
export const MAP_MIN_ZOOM_LEVEL = 0;

/**
 * Deepest zoom level, as a power of two: level 3 is 8×, which puts 45° of longitude
 * across the viewport — enough to look along the Chile trench or the San Andreas
 * fault. Going further would only magnify the relief raster, which is 1440 × 720 and
 * is already being upscaled fourfold by then.
 */
export const MAP_MAX_ZOOM_LEVEL = 3;

/** View pixels the map pans per press of an arrow key, at every zoom level. */
export const MAP_KEYBOARD_STEP_PIXELS = 10;

/**
 * How far outside the viewport a feature's centre may be and still count as on
 * screen. Wide enough for the largest earthquake marker and for a plate label, so
 * neither vanishes while part of it should still be visible at the edge.
 */
export const MAP_VIEWPORT_CULL_MARGIN = 30;

// ── Globe rendering ───────────────────────────────────────────────────────────

/**
 * Gap in view pixels between the globe's limb and the nearest edge of the
 * viewport, so the disc never touches the frame.
 */
export const GLOBE_RADIUS_MARGIN = 6;

/**
 * The point the globe faces when it opens, and returns to on Reset All. Centred on
 * the Atlantic so the Mid-Atlantic Ridge — the clearest divergent boundary in the
 * dataset — runs straight down the middle of the disc, with the Americas and Africa
 * either side of it.
 */
export const GLOBE_INITIAL_CENTER_LON = -30;
export const GLOBE_INITIAL_CENTER_LAT = 15;

/** Degrees the globe turns per press of an arrow key. */
export const GLOBE_KEYBOARD_STEP_DEGREES = 5;

// ── Earth science ─────────────────────────────────────────────────────────────

/** Mean radius of the Earth, km. */
export const EARTH_RADIUS_KM = 6371;

/** Depth (km) below which earthquakes stop counting as "shallow". */
export const SHALLOW_DEPTH_LIMIT_KM = 70;

/** Depth (km) below which earthquakes count as "deep". */
export const INTERMEDIATE_DEPTH_LIMIT_KM = 300;

/** The deepest earthquakes ever recorded are just over 700 km down. */
export const MAX_EARTHQUAKE_DEPTH_KM = 700;

/** Typical thickness of continental crust, km. */
export const CONTINENTAL_CRUST_THICKNESS_KM = 35;

/** Typical thickness of oceanic crust, km. */
export const OCEANIC_CRUST_THICKNESS_KM = 7;

/** Typical thickness of the rigid lithosphere (crust + lithospheric mantle), km. */
export const LITHOSPHERE_THICKNESS_KM = 100;

/** Base of the asthenosphere, km. */
export const ASTHENOSPHERE_BASE_KM = 350;

// ── Geological time ───────────────────────────────────────────────────────────

/**
 * How far the reconstruction may be run in each direction, in millions of years.
 * Present-day plate velocities are only a good guide over a few tens of millions
 * of years, so the range is deliberately modest.
 */
export const TIME_RANGE_MYR = 50;

/** Million years of plate motion per second of wall-clock time at normal speed. */
export const MYR_PER_SECOND = 1;

/** Multipliers applied to {@link MYR_PER_SECOND} at the slow and fast settings. */
export const SLOW_SPEED_MULTIPLIER = 0.25;
export const FAST_SPEED_MULTIPLIER = 4;

/** One press of the step button, in millions of years. */
export const TIME_STEP_MYR = 0.5;

/**
 * Reconstruction times within this tolerance of the present count as "now", so the
 * present-day relief raster stays visible.
 */
export const PRESENT_DAY_TOLERANCE_MYR = 0.05;

PlateTectonicsNamespace.register("PlateTectonicsConstants", {
  SCREEN_VIEW_MARGIN,
  PANEL_CORNER_RADIUS,
  MAP_VIEW_BOUNDS,
  CONTROL_PANEL_WIDTH,
  PANEL_SPACING,
  BOUNDARY_LINE_WIDTH,
  PLATE_FILL_OPACITY,
  QUAKE_BASE_RADIUS,
  QUAKE_RADIUS_PER_MAGNITUDE,
  VOLCANO_MARKER_SIZE,
  VELOCITY_VECTOR_SCALE,
  MAP_MIN_ZOOM_LEVEL,
  MAP_MAX_ZOOM_LEVEL,
  MAP_KEYBOARD_STEP_PIXELS,
  MAP_VIEWPORT_CULL_MARGIN,
  GLOBE_RADIUS_MARGIN,
  GLOBE_INITIAL_CENTER_LON,
  GLOBE_INITIAL_CENTER_LAT,
  GLOBE_KEYBOARD_STEP_DEGREES,
  EARTH_RADIUS_KM,
  SHALLOW_DEPTH_LIMIT_KM,
  INTERMEDIATE_DEPTH_LIMIT_KM,
  MAX_EARTHQUAKE_DEPTH_KM,
  CONTINENTAL_CRUST_THICKNESS_KM,
  OCEANIC_CRUST_THICKNESS_KM,
  LITHOSPHERE_THICKNESS_KM,
  ASTHENOSPHERE_BASE_KM,
  TIME_RANGE_MYR,
  MYR_PER_SECOND,
  SLOW_SPEED_MULTIPLIER,
  FAST_SPEED_MULTIPLIER,
  TIME_STEP_MYR,
  PRESENT_DAY_TOLERANCE_MYR,
});
