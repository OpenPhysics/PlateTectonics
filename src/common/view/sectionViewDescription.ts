/**
 * sectionViewDescription.ts
 *
 * The sentence a screen summary reads out about how its section is currently drawn.
 *
 * Shared by both schematic screens, because the control is shared and describing it
 * twice would create two descriptions to keep in step with one control. It belongs in
 * the live `currentDetails` paragraph rather than in the static control-area description:
 * which view is showing and how far it is stretched are things the user changes, and a
 * screen-reader user re-reading the summary should hear the current state — the same
 * reason the depth filter and the geological time are in there.
 */

import { DerivedStringProperty, type TReadOnlyProperty } from "scenerystack/axon";
import { toFixedNumber } from "scenerystack/dot";
import { StringManager } from "../../i18n/StringManager.js";
import type { SectionViewModel } from "../model/SectionViewModel.js";

/**
 * A live description of the section view, for a screen summary's `currentDetails`.
 *
 * The caller owns the returned Property and must dispose it, matching how every other
 * derived sentence in those summaries is handled.
 */
export function createSectionViewDescription(sectionView: SectionViewModel): TReadOnlyProperty<string> {
  const strings = StringManager.getInstance();
  const a11y = strings.getBlockViewA11yStrings();
  const material = strings.getMaterialStrings();

  return new DerivedStringProperty(
    [
      sectionView.modeProperty,
      sectionView.verticalExaggerationProperty,
      a11y.viewBlockStringProperty,
      a11y.viewFlatStringProperty,
      material.exaggerationValueStringProperty,
      material.trueScaleStringProperty,
    ],
    (mode, exaggeration, blockPattern, flat, exaggerationPattern, trueScale) => {
      if (mode !== "block") {
        return flat;
      }

      // "true scale" rather than "1×" at the bottom of the range, matching what the
      // control itself reads out — it is the named case, not just a number.
      const amount =
        exaggeration === 1
          ? trueScale
          : exaggerationPattern.replace("{{value}}", String(toFixedNumber(exaggeration, 1)));
      return blockPattern.replace("{{exaggeration}}", amount);
    },
  );
}
