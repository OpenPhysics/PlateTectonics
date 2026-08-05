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
