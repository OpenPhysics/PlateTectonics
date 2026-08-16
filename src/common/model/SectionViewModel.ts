/**
 * SectionViewModel.ts
 *
 * How a schematic screen is drawn: as a flat cross-section, or as a 3-D block of Earth,
 * and by how much the block stretches its elevations.
 *
 * ── Why this is model state ───────────────────────────────────────────────────
 * The same reasoning as `showGlobeProperty` on the Earth screen: a *camera* is
 * a view concern and lives in the view, but the choice between two ways of presenting
 * the subject is a choice about what is shown, it is described in the screen summary, it
 * has to survive Reset All, and both the picture and its labels depend on it. The camera
 * that draws the block is still owned by EarthBlockNode.
 *
 * ── The exaggeration ──────────────────────────────────────────────────────────
 * The block defaults to true scale, which is what PhET's Java version drew and the only
 * scale at which the curvature of the Earth and the thickness of the crust are in an
 * honest relationship with each other. That is affordable here because these blocks are
 * a few hundred kilometres across rather than thousands: the Crust screen's three
 * columns span 450 km with a crust up to 70 km thick, so the layers are legible without
 * help.
 *
 * The slider is there because "legible" runs out. Once the Crust screen is zoomed to the
 * lithosphere or the whole Earth, the crust is a sliver at true scale, and the flat view
 * solved that with a two-band vertical scale (see CrossSectionScale) that magnifies the
 * shallow part and compresses the deep part. The block cannot do that — a piecewise
 * vertical map would bend the layers relative to the surface and make the curvature mean
 * nothing — so it offers a single honest stretch instead, with the amount on screen.
 */

import { NumberProperty, Property } from "scenerystack/axon";
import { VERTICAL_EXAGGERATION_DEFAULT, VERTICAL_EXAGGERATION_RANGE } from "../../PlateTectonicsConstants.js";

/** How a schematic screen presents its subject. */
export type SectionViewMode = "block" | "flat";

/** The modes in the order they appear in the control. */
export const SECTION_VIEW_MODES: readonly SectionViewMode[] = ["block", "flat"];

export class SectionViewModel {
  /**
   * Which way the screen is drawn. Opens on the block, which is the view PhET's Java
   * version had and the one that shows the section is a cut through a landscape.
   */
  public readonly modeProperty = new Property<SectionViewMode>("block");

  /** Vertical stretch applied to every elevation on the block. 1 is true scale. */
  public readonly verticalExaggerationProperty = new NumberProperty(VERTICAL_EXAGGERATION_DEFAULT, {
    range: VERTICAL_EXAGGERATION_RANGE,
  });

  /** True when the block is showing, for the many places that only care about that. */
  public get showsBlock(): boolean {
    return this.modeProperty.value === "block";
  }

  public reset(): void {
    this.modeProperty.reset();
    this.verticalExaggerationProperty.reset();
  }

  public dispose(): void {
    this.modeProperty.dispose();
    this.verticalExaggerationProperty.dispose();
  }
}
