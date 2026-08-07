/**
 * PlateTectonicsColors.ts
 *
 * Every dynamic color in the simulation, as a ProfileColorProperty with a
 * "default" (dark) and a "projector" (light) value. SceneryStack switches
 * profiles automatically when the user toggles Projector Mode in Preferences.
 *
 * ── Palette rationale ─────────────────────────────────────────────────────────
 * The three plate-boundary colors and the three earthquake-depth colors must stay
 * mutually distinguishable *and* readable on top of the shaded relief raster,
 * which is mostly deep blue ocean and green/tan land. Boundaries therefore use
 * saturated red / cyan / violet, and earthquakes a warm yellow → orange → magenta
 * depth ramp. Projector-mode values are darkened so they keep contrast against a
 * white background.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   import PlateTectonicsColors from "../../PlateTectonicsColors.js";
 *
 *   new Rectangle(0, 0, 100, 50, { fill: PlateTectonicsColors.oceanColorProperty });
 *
 * Canvas painting reads the same properties through `.value.toCSS()`; see
 * MapCanvasNode.
 */
import { ProfileColorProperty } from "scenerystack/scenery";
import PlateTectonicsNamespace from "./PlateTectonicsNamespace.js";

const PlateTectonicsColors = {
  /** Background color for the simulation screen. */
  backgroundColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "background", {
    default: "#12182b",
    projector: "#ffffff",
  }),

  /** Primary accent color for highlights, selected items, and key UI elements. */
  accentColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "accent", {
    default: "#4fc3f7",
    projector: "#1a1a2e",
  }),

  /** Background fill for control panels and dialogs. */
  panelBackgroundColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "panelBackground", {
    default: "#1b2440",
    projector: "#f2f3f7",
  }),

  /** Border/stroke color for control panels and dialogs. */
  panelBorderColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "panelBorder", {
    default: "#2d4270",
    projector: "#999999",
  }),

  /** Text color for labels, readouts, and general UI text. */
  textColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "text", {
    default: "#e6e9f2",
    projector: "#1a1a1a",
  }),

  /** Secondary text: units, footnotes, data provenance. */
  secondaryTextColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "secondaryText", {
    default: "#9fb0cc",
    projector: "#555f70",
  }),

  // ── Map base ────────────────────────────────────────────────────────────────

  /** Ocean fill, used when the topography/bathymetry layer is switched off. */
  oceanColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "ocean", {
    default: "#16294d",
    projector: "#d7e6f5",
  }),

  /** Land fill, used when the topography/bathymetry layer is switched off. */
  landColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "land", {
    default: "#3d556f",
    projector: "#eae3d2",
  }),

  /** Coastline stroke. */
  coastlineColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "coastline", {
    default: "#8fa9c9",
    projector: "#8a8578",
  }),

  /**
   * Stops of the elevation ramp shown in the topography swatch, sampled from the
   * shaded relief raster: abyssal plain → shelf → lowland → upland → ice and peak.
   *
   * These are the one group whose `projector` values match their `default` ones.
   * The raster is a fixed build-time image that Projector Mode cannot repaint, so
   * a swatch that claims to be a slice of it has to stay the same colour too —
   * they are ProfileColorProperties so the ramp is declared here with every other
   * color rather than inlined at the point of use.
   */
  reliefRampColorProperties: [
    new ProfileColorProperty(PlateTectonicsNamespace, "reliefDeepOcean", {
      default: "#0d2a5c",
      projector: "#0d2a5c",
    }),
    new ProfileColorProperty(PlateTectonicsNamespace, "reliefShelf", {
      default: "#3c7fbe",
      projector: "#3c7fbe",
    }),
    new ProfileColorProperty(PlateTectonicsNamespace, "reliefLowland", {
      default: "#5a8256",
      projector: "#5a8256",
    }),
    new ProfileColorProperty(PlateTectonicsNamespace, "reliefUpland", {
      default: "#b08a5c",
      projector: "#b08a5c",
    }),
    new ProfileColorProperty(PlateTectonicsNamespace, "reliefPeak", {
      default: "#efefef",
      projector: "#efefef",
    }),
  ],

  /**
   * Wash colors used to tell neighbouring plates apart. Plate *i* uses entry
   * *i* mod `platePaletteColorProperties.length`; the palette is longer than the
   * number of large plates that are visible at once, so neighbours rarely repeat.
   * Drawn at {@link PLATE_FILL_OPACITY} so the relief underneath still reads.
   */
  platePaletteColorProperties: [
    new ProfileColorProperty(PlateTectonicsNamespace, "plate1", { default: "#4f9dff", projector: "#2f6dbd" }),
    new ProfileColorProperty(PlateTectonicsNamespace, "plate2", { default: "#ff9d4f", projector: "#c96a12" }),
    new ProfileColorProperty(PlateTectonicsNamespace, "plate3", { default: "#5ce0a8", projector: "#1f8f61" }),
    new ProfileColorProperty(PlateTectonicsNamespace, "plate4", { default: "#e678d6", projector: "#a13a92" }),
    new ProfileColorProperty(PlateTectonicsNamespace, "plate5", { default: "#ffd95c", projector: "#b58900" }),
    new ProfileColorProperty(PlateTectonicsNamespace, "plate6", { default: "#8f9dff", projector: "#4a52c4" }),
    new ProfileColorProperty(PlateTectonicsNamespace, "plate7", { default: "#63d8e0", projector: "#0f7f8c" }),
    new ProfileColorProperty(PlateTectonicsNamespace, "plate8", { default: "#ff8080", projector: "#b83b3b" }),
  ],

  /**
   * Stops of the seafloor-age ramp, youngest first, evenly spaced from brand-new
   * crust to {@link MAX_SEAFLOOR_AGE_MA}. An isochron is drawn in the colour its own
   * age falls at, interpolated between the two stops either side of it.
   *
   * Red for the youngest and blue for the oldest is the convention every published
   * age grid uses, and it is worth keeping even though it puts the young end of the
   * ramp near the red of a divergent boundary: the youngest crust genuinely *is* the
   * crust along the ridge, so the two agreeing is the point rather than a collision.
   * They stay apart in the ways that matter — an isochron is drawn thinner than a
   * boundary ({@link ISOCHRON_LINE_WIDTH}), underneath it, and never alone, since a
   * lone red line is a ridge and a fan of them is the sea floor it made.
   */
  seafloorAgeRampColorProperties: [
    new ProfileColorProperty(PlateTectonicsNamespace, "seafloorAgeYoungest", {
      default: "#ff4b3e",
      projector: "#c0271b",
    }),
    new ProfileColorProperty(PlateTectonicsNamespace, "seafloorAgeYoung", {
      default: "#ffa33c",
      projector: "#b56a00",
    }),
    new ProfileColorProperty(PlateTectonicsNamespace, "seafloorAgeMiddle", {
      default: "#8ad46a",
      projector: "#3f8b2f",
    }),
    new ProfileColorProperty(PlateTectonicsNamespace, "seafloorAgeOld", {
      default: "#4aa8d8",
      projector: "#1a6a92",
    }),
    new ProfileColorProperty(PlateTectonicsNamespace, "seafloorAgeOldest", {
      default: "#4257c9",
      projector: "#26307f",
    }),
  ],

  /** Outline drawn around every plate polygon. */
  plateOutlineColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "plateOutline", {
    default: "#dbe4f5",
    projector: "#37415a",
  }),

  /** Plate name labels drawn on the map. */
  plateLabelColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "plateLabel", {
    default: "#ffffff",
    projector: "#101828",
  }),

  /** Halo behind map labels, so they stay readable over the relief raster. */
  labelHaloColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "labelHalo", {
    default: "#0b1020",
    projector: "#ffffff",
  }),

  /** Frame around the map / cross-section view. */
  mapFrameColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "mapFrame", {
    default: "#4a628f",
    projector: "#7a8291",
  }),

  // ── Plate boundaries ────────────────────────────────────────────────────────

  /** Divergent boundaries: spreading ridges and continental rifts. */
  divergentBoundaryColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "divergentBoundary", {
    default: "#ff5f52",
    projector: "#c62828",
  }),

  /** Convergent boundaries: subduction zones and collision belts. */
  convergentBoundaryColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "convergentBoundary", {
    default: "#29d3ff",
    projector: "#00629e",
  }),

  /** Transform boundaries: strike-slip faults. */
  transformBoundaryColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "transformBoundary", {
    default: "#c79bff",
    projector: "#6a1b9a",
  }),

  // ── Data overlays ───────────────────────────────────────────────────────────

  /** Plate motion vectors. */
  velocityVectorColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "velocityVector", {
    default: "#ffffff",
    projector: "#12203a",
  }),

  /** Shallow earthquakes (less than 70 km deep). */
  shallowQuakeColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "shallowQuake", {
    default: "#ffe066",
    projector: "#b57e00",
  }),

  /** Intermediate-depth earthquakes (70–300 km). */
  intermediateQuakeColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "intermediateQuake", {
    default: "#ff9642",
    projector: "#d1590a",
  }),

  /** Deep earthquakes (more than 300 km deep). */
  deepQuakeColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "deepQuake", {
    default: "#ff4d8d",
    projector: "#ad1457",
  }),

  /** Volcano markers. */
  volcanoColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "volcano", {
    default: "#ff3b30",
    projector: "#b71c1c",
  }),

  /** Intraplate hotspot markers. */
  hotspotColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "hotspot", {
    default: "#ffd60a",
    projector: "#c77800",
  }),

  // ── Cross-section earth layers ──────────────────────────────────────────────

  /** Sky above the cross-section profile. */
  skyColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "sky", {
    default: "#1d2b4a",
    projector: "#dff0fb",
  }),

  /** Sea water in a cross-section. */
  seaWaterColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "seaWater", {
    default: "#1b4b7a",
    projector: "#9ccbe8",
  }),

  /** Continental crust: thick, buoyant, granitic. */
  continentalCrustColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "continentalCrust", {
    default: "#9c7b52",
    projector: "#c8a878",
  }),

  /** Oceanic crust: thin, dense, basaltic. */
  oceanicCrustColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "oceanicCrust", {
    default: "#4c4340",
    projector: "#6d615c",
  }),

  /** Rigid lithospheric mantle beneath the crust. */
  lithosphereColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "lithosphere", {
    default: "#6b5f7a",
    projector: "#a79eb5",
  }),

  /** Weak, ductile asthenosphere. */
  asthenosphereColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "asthenosphere", {
    default: "#7a4230",
    projector: "#d98a63",
  }),

  /** Deeper mantle below the asthenosphere. */
  mantleColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "mantle", {
    default: "#5a2a20",
    projector: "#b2603f",
  }),

  /** Magma rising into a volcanic arc or a spreading ridge. */
  magmaColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "magma", {
    default: "#ff7a1a",
    projector: "#e2560c",
  }),

  /** Mantle convection arrows in a cross-section. */
  convectionArrowColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "convectionArrow", {
    default: "#ffd9b0",
    projector: "#7a3316",
  }),

  // ── Material color ramps ────────────────────────────────────────────────────
  // The Crust and Plate Motion screens paint rock by what it *is* rather than by
  // which layer it belongs to, so density and temperature each get a two-stop ramp
  // interpolated per sample. Both ramps have to read as a single quantity increasing,
  // which is why each is a lightness/saturation sweep within one hue family rather
  // than a trip across the color wheel.

  /** Least dense rock on the density ramp. */
  densityRampLowColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "densityRampLow", {
    default: "#e8ecf5",
    projector: "#f2f4f8",
  }),

  /** Densest rock on the density ramp. */
  densityRampHighColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "densityRampHigh", {
    default: "#2a3242",
    projector: "#1e242f",
  }),

  /** Coolest rock on the temperature ramp. */
  temperatureRampLowColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "temperatureRampLow", {
    default: "#5a6272",
    projector: "#8c93a1",
  }),

  /** Hottest rock on the temperature ramp. */
  temperatureRampHighColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "temperatureRampHigh", {
    default: "#ff4d1a",
    projector: "#d63200",
  }),

  // ── Deep Earth ──────────────────────────────────────────────────────────────
  // Only visible when the Crust screen is zoomed out to the whole planet.

  /** Upper mantle, above the 750 km discontinuity. */
  upperMantleColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "upperMantle", {
    default: "#8a3a24",
    projector: "#c4714b",
  }),

  /** Lower mantle, below the 750 km discontinuity. */
  lowerMantleColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "lowerMantle", {
    default: "#6b2418",
    projector: "#a8522f",
  }),

  /** Liquid outer core. */
  outerCoreColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "outerCore", {
    default: "#ffb347",
    projector: "#e08800",
  }),

  /** Solid inner core. */
  innerCoreColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "innerCore", {
    default: "#fff3c4",
    projector: "#f0c419",
  }),

  // ── Plate Motion chrome ─────────────────────────────────────────────────────

  /** Outline of an empty zone waiting for a crust piece to be dropped into it. */
  dropZoneColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "dropZone", {
    default: "#6f7f9c",
    projector: "#8a93a3",
  }),

  /** The same outline while a crust piece is over it, or it holds keyboard focus. */
  dropZoneActiveColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "dropZoneActive", {
    default: "#4fc3f7",
    projector: "#0277bd",
  }),

  /** Crust created at a spreading ridge during the run, distinct from what was dropped in. */
  newCrustColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "newCrust", {
    default: "#3f6b63",
    projector: "#5f9187",
  }),

  // ── Light control surfaces ──────────────────────────────────────────────────
  // White chrome (combo boxes, flat push buttons, editable input fields) stays light
  // in both profiles; its text stays dark.

  /** Fill of light control surfaces: combo-box button/list, editable input fields. */
  controlSurfaceColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "controlSurface", {
    default: "#ffffff",
    projector: "#ffffff",
  }),

  /** Fill of a disabled control surface (grayed-out editable input field). */
  controlSurfaceDisabledColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "controlSurfaceDisabled", {
    default: "#cccccc",
    projector: "#cccccc",
  }),

  /** Text on light control surfaces: combo items, flat-button labels, field values, preferences. */
  controlSurfaceTextColorProperty: new ProfileColorProperty(PlateTectonicsNamespace, "controlSurfaceText", {
    default: "#1a1a1a",
    projector: "#1a1a1a",
  }),
};

export default PlateTectonicsColors;
