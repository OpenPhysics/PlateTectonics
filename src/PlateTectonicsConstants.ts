/**
 * PlateTectonicsConstants.ts
 *
 * Every named numeric constant used across the simulation: view layout in screen
 * pixels, and Earth-science quantities in their conventional units (km for depths
 * and distances, mm/year for plate speeds, million years for geological time).
 *
 * Colors live in PlateTectonicsColors.ts; user-visible text lives in the locale JSON.
 */

import { Bounds2, Range } from "scenerystack/dot";
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

/**
 * The viewport for the schematic cross-sections on the Crust and Plate Motion
 * screens. Same x-range as {@link MAP_VIEW_BOUNDS}, but taller: those screens draw
 * depth rather than a world map, so the 2:1 aspect ratio that keeps an
 * equirectangular projection honest buys them nothing, and the extra 112 px of
 * height is what lets a 70 km crustal root and a 150 km slab share one picture. The
 * strip left below is where the legend and Reset All sit.
 */
export const SECTION_VIEW_BOUNDS = new Bounds2(SCREEN_VIEW_MARGIN, 52, SCREEN_VIEW_MARGIN + 728, 52 + 476);

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

/**
 * Line width of a seafloor isochron, in view pixels. Thinner than a plate boundary,
 * because a hundred isochrons are drawn at once and they are a field to be read as a
 * pattern rather than a symbol to be picked out one at a time.
 */
export const ISOCHRON_LINE_WIDTH = 1.1;

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

/**
 * Oldest ocean floor left on Earth, in millions of years, and the top of the
 * isochron colour ramp. Older crust than this has been subducted — the sea floor is
 * recycled on a timescale a hundred times shorter than the continents, which is the
 * whole reason an isochron map looks the way it does. A few patches in the eastern
 * Mediterranean and off Florida are older still, and sit at the end of the ramp.
 */
export const MAX_SEAFLOOR_AGE_MA = 180;

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

// ── Isostasy and the crust (Crust screen) ─────────────────────────────────────
// Lengths here are in metres rather than km, because the Crust screen works at the
// scale of a single crustal column and its slider spans 4–70 km.

/** Density of the mantle the crust floats on, kg/m³. */
export const MANTLE_DENSITY_KG_M3 = 3300;

/** Density of sea water loading a submarine column, kg/m³. */
export const SEAWATER_DENSITY_KG_M3 = 1030;

/**
 * Elevation subtracted from the raw Airy result so that the reference column sits at
 * sea level, m. Airy isostasy on its own answers "how high does this column stand
 * above a column of bare mantle", which is not a useful datum — every real crustal
 * column stands kilometres above bare mantle. This offset re-datums the answer onto a
 * water-covered reference column; see doc/model.md for the derivation of the implied
 * reference depth. Value inherited from PhET so elevations stay comparable.
 */
export const AIRY_REFERENCE_OFFSET_M = 3500;

/** Density of cold, fully silica-rich crust — the granitic end member, kg/m³. */
export const CRUST_SILICA_DENSITY_KG_M3 = 2670;

/** Density of cold, fully iron-rich crust — the mafic end member, kg/m³. */
export const CRUST_IRON_DENSITY_KG_M3 = 3230;

/**
 * Volumetric thermal expansivity of crustal rock, 1/K. The textbook value. Solving
 * PhET's undocumented density expression for its implied expansivity gives
 * ≈ 3.4 × 10⁻⁵ 1/K, so their number was right; it just was not written as a physical
 * quantity. The round textbook value is used here and differs by under 20 kg/m³ across
 * the whole slider.
 */
export const CRUST_THERMAL_EXPANSIVITY_PER_K = 3.0e-5;

/** Temperature rise from the top of the user's crust to its base at the warmest setting, K. */
export const CRUST_GEOTHERM_SPAN_K = 700;

/** The same span for the fixed continental block, which is cooler, K. */
export const CONTINENTAL_GEOTHERM_SPAN_K = 450;

/**
 * Temperature at the surface, K — the datum every other temperature is measured from.
 * 293.15 K is 20 °C. PhET called this constant ZERO_CELSIUS, which it is not; the
 * value is kept so the temperature color ramp is unchanged.
 */
export const SURFACE_TEMPERATURE_K = 293.15;

/** Range and starting value of the crustal thickness slider, m. */
export const MY_CRUST_THICKNESS_RANGE_M = new Range(4000, 70000);
export const MY_CRUST_THICKNESS_DEFAULT_M = 20000;

/** The fixed oceanic block to the left of the user's crust. */
export const FIXED_OCEANIC_DENSITY_KG_M3 = 3000;
export const FIXED_OCEANIC_THICKNESS_M = 7000;

/** The fixed continental block to the right of the user's crust. */
export const FIXED_CONTINENTAL_DENSITY_KG_M3 = 2700;
export const FIXED_CONTINENTAL_THICKNESS_M = 45000;

/** Half-width of each of the three crustal blocks, m. */
export const CRUST_BLOCK_HALF_WIDTH_M = 75000;

/**
 * Time constant of the crust's approach to its isostatic equilibrium, s. This is a
 * view-time constant, not a geological one: real isostatic rebound takes ~10 ka, and
 * the point of animating it at all is to show that the block *settles* rather than
 * teleports when a slider moves.
 */
export const ISOSTATIC_RELAXATION_TIME_CONSTANT_S = 0.6;

// ── Deep Earth (Crust screen, zoomed out) ─────────────────────────────────────

/** Depth to the upper/lower mantle boundary, km. */
export const UPPER_LOWER_MANTLE_BOUNDARY_KM = 750;

/** Depth to the core–mantle boundary, km. */
export const MANTLE_CORE_BOUNDARY_KM = 2921;

/** Depth to the inner/outer core boundary, km. */
export const INNER_OUTER_CORE_BOUNDARY_KM = 5180;

/** Temperatures bracketing each deep layer, K. */
export const UPPER_MANTLE_TOP_TEMPERATURE_K = SURFACE_TEMPERATURE_K + 700;
export const UPPER_MANTLE_BASE_TEMPERATURE_K = SURFACE_TEMPERATURE_K + 1100;
export const LOWER_MANTLE_BASE_TEMPERATURE_K = SURFACE_TEMPERATURE_K + 4000;
export const OUTER_CORE_TOP_TEMPERATURE_K = SURFACE_TEMPERATURE_K + 4400;
export const INNER_CORE_TEMPERATURE_K = 5778;

/** Densities at the two core boundaries and at the centre, kg/m³. */
export const CORE_BOUNDARY_DENSITY_KG_M3 = 10000;
export const INNER_OUTER_CORE_DENSITY_KG_M3 = 12800;
export const EARTH_CENTRE_DENSITY_KG_M3 = 13100;

/** Densities spanned by the density color ramp, kg/m³. Deliberately narrow: it has to
 * resolve the 2600–3230 kg/m³ the composition slider covers, not the whole Earth. */
export const DENSITY_SCALE_RANGE = new Range(2500, 3500);

/** Top of the temperature color ramp, K. */
export const TEMPERATURE_SCALE_MAX_K = SURFACE_TEMPERATURE_K + 6400;

/** Gamma applied to the temperature ramp, and the lightness range it is clamped to. */
export const TEMPERATURE_RAMP_GAMMA = 0.4;
export const TEMPERATURE_RAMP_CLAMP_RANGE = new Range(0.08, 0.95);

/** Full-scale readings of the draggable probe. */
export const PROBE_MAX_TEMPERATURE_C = 2000;
export const PROBE_MAX_DENSITY_KG_M3 = 3500;

/** Density the probe reports when it is on the ground rather than inside a layer, kg/m³. */
export const TERRAIN_DENSITY_KG_M3 = 2720;

// ── Plate motion (Plate Motion screen) ────────────────────────────────────────

/** Continental crust: density kg/m³, top and base elevation m, lithospheric mantle m. */
export const CONTINENTAL_PLATE_DENSITY_KG_M3 = 2750;
export const CONTINENTAL_PLATE_TOP_M = 3500;
export const CONTINENTAL_PLATE_BASE_M = -40000;
export const CONTINENTAL_PLATE_MANTLE_LITHOSPHERE_M = 70000;

/** Young oceanic crust: still warm, so thinner lithosphere and lower density. */
export const YOUNG_OCEANIC_PLATE_DENSITY_KG_M3 = 3000;
export const YOUNG_OCEANIC_PLATE_TOP_M = -4000;
export const YOUNG_OCEANIC_PLATE_BASE_M = -10000;
export const YOUNG_OCEANIC_PLATE_MANTLE_LITHOSPHERE_M = 45000;

/** Old oceanic crust: cooled, so denser and thicker — which is why it subducts first. */
export const OLD_OCEANIC_PLATE_DENSITY_KG_M3 = 3070;
export const OLD_OCEANIC_PLATE_TOP_M = -4000;
export const OLD_OCEANIC_PLATE_BASE_M = -10000;
export const OLD_OCEANIC_PLATE_MANTLE_LITHOSPHERE_M = 55000;

/**
 * Density of the rigid mantle inside a plate, below its crust, kg/m³.
 *
 * Deliberately higher than {@link MANTLE_DENSITY_KG_M3}, which stands for the hotter
 * asthenosphere the plates ride on. The two are the same rock; the difference is
 * thermal, and it is the whole reason plate tectonics happens. Lithospheric mantle
 * averages something like 1000 K colder than the asthenosphere beneath it, and with a
 * coefficient of thermal expansion around 3 × 10⁻⁵ /K that makes it roughly 3% denser.
 * That excess is what makes a cooled plate negatively buoyant, and therefore what makes
 * old ocean floor able to sink. Painting the plate and the asthenosphere at one density
 * would erase the quantity in density mode.
 */
export const LITHOSPHERIC_MANTLE_DENSITY_KG_M3 = 3400;

/**
 * Density of a descending slab, kg/m³.
 *
 * Denser still than the lithospheric mantle it is made of: a slab is thick enough to keep
 * its cold interior on the way down, so it warms far more slowly than it descends and its
 * contrast against the surrounding mantle grows with depth rather than fading. That
 * persistent excess density is slab pull.
 */
export const SLAB_DENSITY_KG_M3 = 3450;

/** Speed a plate moves at the boundary, m per million years — i.e. 15 mm/year. */
export const PLATE_SPEED_M_PER_MYR = 15000;

/**
 * The subducting slab is three circular arcs followed by a straight ray. These are
 * the arc radii (m) and the fraction of the total dip each arc turns through; the
 * shape was derived in PhET's assets/shapes.nb and is reproduced here.
 */
export const SUBDUCTION_ARC_RADII_M = [90000, 40000, 90000] as const;
export const SUBDUCTION_ARC_ANGLE_FRACTIONS = [0.25, 0.5, 0.25] as const;

/** Total dip of the slab, radians. Old oceanic lithosphere is colder, so it dips steeper. */
export const SUBDUCTION_TOTAL_ANGLE_YOUNG_RAD = (Math.PI / 4) * 0.8;
export const SUBDUCTION_TOTAL_ANGLE_OLD_RAD = (Math.PI / 4) * 1.2;

/** Depth below which the slab loses its identity into the mantle, m, and the rate it does so. */
export const SLAB_BLEND_DEPTH_M = 150000;
export const SLAB_BLEND_RATE_PER_MYR = 0.08;

/** The depth window in which the slab dehydrates and melt is generated, m. */
export const MELT_TOP_DEPTH_M = 100000;
export const MELT_BOTTOM_DEPTH_M = 150000;

/** Speed magma rises through the overriding plate, m per million years. */
export const MELT_SPEED_M_PER_MYR = 10000;

/** Elevation of the crest of a spreading ridge, m. */
export const RIDGE_TOP_M = -500;

/** How long a spreading ridge runs before its new crust is labelled, Myr. */
export const NEW_CRUST_LABEL_DELAY_MYR = 8.44;

/** Elevations between which a continental collision roughens into individual peaks, m. */
export const COLLISION_ELEVATION_RANGE_M = new Range(6000, 13000);

/** Top and bottom of the simplified mantle drawn on this screen, m. */
export const SIMPLE_MANTLE_TOP_M = -10000;
export const SIMPLE_MANTLE_BOTTOM_M = -600000;

/** Magma is hot and buoyant: it rises because of this density contrast with the mantle. */
export const MAGMA_DENSITY_KG_M3 = 2000;
export const MAGMA_TEMPERATURE_K = SURFACE_TEMPERATURE_K + 1300;

/** Half-width of the modelled region, m. Crust is created and destroyed just outside it. */
export const PLATE_X_LIMIT_M = 700000;

/**
 * Coefficients of the simplified mantle geotherm T(d) = 273.15 + (a − b·d)·d, where d
 * is depth in metres. The quadratic term is radiogenic heating; see doc/model.md.
 */
export const GEOTHERM_LINEAR_K_PER_M = 0.0175;
export const GEOTHERM_QUADRATIC_K_PER_M2 = 3.04425e-9;

/**
 * How long each kind of boundary runs before it stops, Myr. These are the times at
 * which each process has finished saying what it has to say: a collision has built its
 * mountains, a rift has opened an ocean, a slab has reached the depth where it melts.
 */
export const COLLISION_TIME_LIMIT_MYR = 35;
export const RIFTING_TIME_LIMIT_MYR = 35;
export const SUBDUCTION_TIME_LIMIT_MYR = 50;

/** Range of the plate-motion speed slider, Myr per second of wall-clock time. */
export const PLATE_MOTION_SPEED_RANGE = new Range(0.1, 10);

/** One press of the step button on the Plate Motion screen, Myr. */
export const PLATE_MOTION_STEP_MYR = 5;

PlateTectonicsNamespace.register("PlateTectonicsConstants", {
  SCREEN_VIEW_MARGIN,
  PANEL_CORNER_RADIUS,
  MAP_VIEW_BOUNDS,
  SECTION_VIEW_BOUNDS,
  CONTROL_PANEL_WIDTH,
  PANEL_SPACING,
  BOUNDARY_LINE_WIDTH,
  PLATE_FILL_OPACITY,
  QUAKE_BASE_RADIUS,
  QUAKE_RADIUS_PER_MAGNITUDE,
  VOLCANO_MARKER_SIZE,
  VELOCITY_VECTOR_SCALE,
  ISOCHRON_LINE_WIDTH,
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
  MAX_SEAFLOOR_AGE_MA,
  LITHOSPHERE_THICKNESS_KM,
  ASTHENOSPHERE_BASE_KM,
  TIME_RANGE_MYR,
  MYR_PER_SECOND,
  SLOW_SPEED_MULTIPLIER,
  FAST_SPEED_MULTIPLIER,
  TIME_STEP_MYR,
  PRESENT_DAY_TOLERANCE_MYR,
  MANTLE_DENSITY_KG_M3,
  SEAWATER_DENSITY_KG_M3,
  AIRY_REFERENCE_OFFSET_M,
  CRUST_SILICA_DENSITY_KG_M3,
  CRUST_IRON_DENSITY_KG_M3,
  CRUST_THERMAL_EXPANSIVITY_PER_K,
  CRUST_GEOTHERM_SPAN_K,
  CONTINENTAL_GEOTHERM_SPAN_K,
  SURFACE_TEMPERATURE_K,
  MY_CRUST_THICKNESS_RANGE_M,
  MY_CRUST_THICKNESS_DEFAULT_M,
  FIXED_OCEANIC_DENSITY_KG_M3,
  FIXED_OCEANIC_THICKNESS_M,
  FIXED_CONTINENTAL_DENSITY_KG_M3,
  FIXED_CONTINENTAL_THICKNESS_M,
  CRUST_BLOCK_HALF_WIDTH_M,
  ISOSTATIC_RELAXATION_TIME_CONSTANT_S,
  UPPER_LOWER_MANTLE_BOUNDARY_KM,
  MANTLE_CORE_BOUNDARY_KM,
  INNER_OUTER_CORE_BOUNDARY_KM,
  UPPER_MANTLE_TOP_TEMPERATURE_K,
  UPPER_MANTLE_BASE_TEMPERATURE_K,
  LOWER_MANTLE_BASE_TEMPERATURE_K,
  OUTER_CORE_TOP_TEMPERATURE_K,
  INNER_CORE_TEMPERATURE_K,
  CORE_BOUNDARY_DENSITY_KG_M3,
  INNER_OUTER_CORE_DENSITY_KG_M3,
  EARTH_CENTRE_DENSITY_KG_M3,
  DENSITY_SCALE_RANGE,
  TEMPERATURE_SCALE_MAX_K,
  TEMPERATURE_RAMP_GAMMA,
  TEMPERATURE_RAMP_CLAMP_RANGE,
  PROBE_MAX_TEMPERATURE_C,
  PROBE_MAX_DENSITY_KG_M3,
  TERRAIN_DENSITY_KG_M3,
  CONTINENTAL_PLATE_DENSITY_KG_M3,
  CONTINENTAL_PLATE_TOP_M,
  CONTINENTAL_PLATE_BASE_M,
  CONTINENTAL_PLATE_MANTLE_LITHOSPHERE_M,
  YOUNG_OCEANIC_PLATE_DENSITY_KG_M3,
  YOUNG_OCEANIC_PLATE_TOP_M,
  YOUNG_OCEANIC_PLATE_BASE_M,
  YOUNG_OCEANIC_PLATE_MANTLE_LITHOSPHERE_M,
  OLD_OCEANIC_PLATE_DENSITY_KG_M3,
  OLD_OCEANIC_PLATE_TOP_M,
  OLD_OCEANIC_PLATE_BASE_M,
  OLD_OCEANIC_PLATE_MANTLE_LITHOSPHERE_M,
  LITHOSPHERIC_MANTLE_DENSITY_KG_M3,
  SLAB_DENSITY_KG_M3,
  PLATE_SPEED_M_PER_MYR,
  SUBDUCTION_ARC_RADII_M,
  SUBDUCTION_ARC_ANGLE_FRACTIONS,
  SUBDUCTION_TOTAL_ANGLE_YOUNG_RAD,
  SUBDUCTION_TOTAL_ANGLE_OLD_RAD,
  SLAB_BLEND_DEPTH_M,
  SLAB_BLEND_RATE_PER_MYR,
  MELT_TOP_DEPTH_M,
  MELT_BOTTOM_DEPTH_M,
  MELT_SPEED_M_PER_MYR,
  RIDGE_TOP_M,
  NEW_CRUST_LABEL_DELAY_MYR,
  COLLISION_ELEVATION_RANGE_M,
  SIMPLE_MANTLE_TOP_M,
  SIMPLE_MANTLE_BOTTOM_M,
  MAGMA_DENSITY_KG_M3,
  MAGMA_TEMPERATURE_K,
  PLATE_X_LIMIT_M,
  GEOTHERM_LINEAR_K_PER_M,
  GEOTHERM_QUADRATIC_K_PER_M2,
  COLLISION_TIME_LIMIT_MYR,
  RIFTING_TIME_LIMIT_MYR,
  SUBDUCTION_TIME_LIMIT_MYR,
  PLATE_MOTION_SPEED_RANGE,
  PLATE_MOTION_STEP_MYR,
});
