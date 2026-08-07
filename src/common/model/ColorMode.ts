/**
 * ColorMode.ts
 *
 * What the rock in a cross-section is colored by on the Crust and Plate Motion screens.
 *
 * The point of offering a choice at all is that the two quantities tell different
 * stories about the same picture. Density explains why a plate floats where it does and
 * which of two plates subducts; temperature explains why the lithosphere is rigid and
 * the asthenosphere is not, and where melt comes from. "Both" multiplies them, so a
 * cold dense slab is unmistakable against warm light mantle.
 *
 * Modelled as a string union rather than an EnumerationValue class to match
 * EarthquakeDepthFilter, which is the established shape for a small closed choice in
 * this simulation.
 */

/** How the cross-section paints rock. */
export type ColorMode = "density" | "temperature" | "both";

/** The modes in the order they appear in the radio-button group. */
export const COLOR_MODES: readonly ColorMode[] = ["density", "temperature", "both"];
