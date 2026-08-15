/**
 * SectionRulerNode.test.ts
 *
 * The ruler has to survive being handed almost no room. Both schematic screens project it
 * through the block, and the block's camera pulls back as the vertical exaggeration goes
 * up, so the same 300 km can be 143 view pixels or 28; the Crust screen's whole-Earth zoom
 * takes 150 km down to ten pixels, and to one once stretched. These are claims about what
 * the ruler does across that whole range — that it keeps numbering what it can, that it
 * never asks RulerNode to fit a units label into space that has run out, and that it stays
 * anchored to the point it is measuring from.
 */

import { enableAssert } from "scenerystack/assert";
import { Property, StringProperty } from "scenerystack/axon";
import { Bounds2, Vector2 } from "scenerystack/dot";
import { beforeAll, describe, expect, it } from "vitest";
import type { SectionPlacement } from "../src/common/view/SectionPlacement.js";
import { fitTickLabels, SectionRulerNode } from "../src/common/view/SectionRulerNode.js";

/** The Plate Motion ruler: 300 km in 100 km steps. */
const PLATE_MOTION_TICKS = ["0", "100", "200", "300"];

/** The Crust ruler: 150 km in 50 km steps. */
const CRUST_TICKS = ["0", "50", "100", "150"];

/** How many ticks carry a number. */
function numberedCount(labels: readonly string[]): number {
  return labels.filter((label) => label !== "").length;
}

describe("fitTickLabels", () => {
  it("numbers every tick it can when the section is generous", () => {
    // 143 px is what the Plate Motion block gives the ruler at true scale.
    const fit = fitTickLabels(PLATE_MOTION_TICKS, 143);

    // The end ticks are never numbered: RulerNode leaves those labels undrawn when
    // insetsWidth is zero, because the ends of the body are those two marks.
    expect(fit.labels).toEqual(["", "100", "200", ""]);
    expect(fit.unitsMajorTickIndex).toBe(2);
  });

  it("drops numbers rather than letting them collide as the section squeezes the ruler", () => {
    // 48 px is roughly the Plate Motion block at eight times exaggeration.
    const fit = fitTickLabels(PLATE_MOTION_TICKS, 48);

    expect(numberedCount(fit.labels)).toBe(1);
    expect(fit.labels).toHaveLength(PLATE_MOTION_TICKS.length);
    expect(fit.labels[1]).toBe("100");
  });

  it("gives up numbering entirely rather than crowding out the units", () => {
    const fit = fitTickLabels(PLATE_MOTION_TICKS, 18);

    expect(numberedCount(fit.labels)).toBe(0);
    expect(fit.unitsMajorTickIndex).toBe(0);
  });

  it("never numbers a tick past the one the units follow, at any length", () => {
    // This is the whole reason the units go last: RulerNode measures the space for them
    // against the *next* numbered tick and asserts that it is positive, and that space is
    // what shrinks when the block's camera pulls back.
    for (const ticks of [PLATE_MOTION_TICKS, CRUST_TICKS]) {
      for (let pixelLength = 4; pixelLength <= 400; pixelLength += 1) {
        const fit = fitTickLabels(ticks, pixelLength);

        for (let index = fit.unitsMajorTickIndex + 1; index < fit.labels.length; index++) {
          expect(fit.labels[index]).toBe("");
        }
      }
    }
  });

  it("numbers no more ticks as the ruler gets shorter", () => {
    let previous = numberedCount(fitTickLabels(CRUST_TICKS, 400).labels);

    for (let pixelLength = 399; pixelLength >= 4; pixelLength -= 1) {
      const count = numberedCount(fitTickLabels(CRUST_TICKS, pixelLength).labels);
      expect(count).toBeLessThanOrEqual(previous);
      previous = count;
    }
  });

  it("keeps the numbers it does draw in their own places", () => {
    const fit = fitTickLabels(CRUST_TICKS, 218);

    fit.labels.forEach((label, index) => {
      expect(label === "" || label === CRUST_TICKS[index]).toBe(true);
    });
  });
});

/**
 * A section that draws one model metre as `pixelsPerMetre` view pixels, standing in for
 * the placements the two screens build. A tiny scale is not a contrivance: it is the Crust
 * screen at its whole-Earth zoom.
 */
function scaledPlacement(pixelsPerMetre: number): SectionPlacement {
  const viewBounds = new Bounds2(0, 0, 728, 476);
  return {
    viewBounds,
    halfWidthM: 225000,
    bottomM: -6371000,
    modelToView: (xM, elevationM) =>
      new Vector2(viewBounds.centerX + xM * pixelsPerMetre, viewBounds.centerY - elevationM * pixelsPerMetre),
    viewToModel: (viewX, viewY) =>
      new Vector2((viewX - viewBounds.centerX) / pixelsPerMetre, (viewBounds.centerY - viewY) / pixelsPerMetre),
    contour: (elevationM) => [
      new Vector2(viewBounds.minX, viewBounds.centerY - elevationM * pixelsPerMetre),
      new Vector2(viewBounds.maxX, viewBounds.centerY - elevationM * pixelsPerMetre),
    ],
  };
}

function makeRuler(placement: SectionPlacement, position = new Vector2(0, -20000)): SectionRulerNode {
  return new SectionRulerNode(new Property(position), {
    placement,
    lengthM: 150000,
    majorTickM: 50000,
    dragBounds: placement.viewBounds,
    unitsStringProperty: new StringProperty("km"),
    rulerAccessibleName: new StringProperty("Ruler"),
    rulerAccessibleHelpText: new StringProperty("Move the ruler"),
  });
}

describe("SectionRulerNode", () => {
  // RulerNode's own layout assertions are the ones this is guarding against, so they have
  // to be on: without them a ruler with no room for its units label builds silently.
  beforeAll(() => {
    enableAssert();
  });

  it("builds at every scale the two screens can hand it", () => {
    // 218 px down to under one, which spans the Crust screen's three zooms and the whole
    // exaggeration range on top of them.
    for (const pixelsPerMetre of [218 / 150000, 48 / 150000, 10 / 150000, 1.2 / 150000, 0.2 / 150000]) {
      expect(() => makeRuler(scaledPlacement(pixelsPerMetre)).dispose()).not.toThrow();
    }
  });

  it("builds again at every scale when the view under it is replaced", () => {
    const ruler = makeRuler(scaledPlacement(218 / 150000));

    for (const pixelsPerMetre of [48 / 150000, 1.2 / 150000, 0.2 / 150000, 218 / 150000]) {
      expect(() => ruler.setPlacement(scaledPlacement(pixelsPerMetre))).not.toThrow();
    }
    ruler.dispose();
  });

  it("starts at the point it is measuring from", () => {
    const placement = scaledPlacement(218 / 150000);
    const ruler = makeRuler(placement, new Vector2(-120000, -40000));

    // The ruler's zero tick, not its bounding box, is what the model position names. The
    // half pixel of slack is the body's own outline, which straddles that edge.
    const zero = placement.modelToView(-120000, -40000);
    expect(Math.abs(ruler.bounds.minX - zero.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(ruler.bounds.minY - zero.y)).toBeLessThanOrEqual(1);
    ruler.dispose();
  });

  it("spans the distance it claims to measure", () => {
    const placement = scaledPlacement(218 / 150000);
    const ruler = makeRuler(placement);

    // Horizontal here, so the drawn width is the projected length of 150 km, give or take
    // the outline — including in the shrunken case, where the body is built at its
    // minimum length and scaled down to what the section allows.
    expect(Math.abs(ruler.bounds.width - 218)).toBeLessThanOrEqual(1);

    const tiny = makeRuler(scaledPlacement(10 / 150000));
    expect(Math.abs(tiny.bounds.width - 10)).toBeLessThanOrEqual(1);

    ruler.dispose();
    tiny.dispose();
  });
});
