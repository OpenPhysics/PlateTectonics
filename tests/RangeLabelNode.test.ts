/**
 * RangeLabelNode.test.ts
 *
 * The contract a range label is written against: that it names the same *extent* in both
 * views of a section, that a range running off the viewport is pulled back inside it
 * rather than being drawn where nobody can read it, and that a range too short to hold its
 * name says so instead of overlapping itself.
 *
 * These are the two properties the Crust and Plate Motion screens rely on. The first is
 * why the thickness slider is legible on the block as well as on the flat section; the
 * second is why the whole-Earth zoom can label a core whose base is off the bottom of the
 * picture.
 */

import { Bounds2, Vector2 } from "scenerystack/dot";
import { Color } from "scenerystack/scenery";
import { describe, expect, it } from "vitest";
import { CrossSectionScale } from "../src/common/model/CrossSectionScale.js";
import { type BlockBounds, EarthBlockNode } from "../src/common/view/EarthBlockNode.js";
import { rangeLabelLayout } from "../src/common/view/RangeLabelNode.js";
import { blockPlacement, flatPlacement, type SectionPlacement } from "../src/common/view/SectionPlacement.js";
import { SECTION_VIEW_BOUNDS } from "../src/PlateTectonicsConstants.js";

const viewBounds = new Bounds2(
  SECTION_VIEW_BOUNDS.minX,
  SECTION_VIEW_BOUNDS.minY,
  SECTION_VIEW_BOUNDS.maxX,
  SECTION_VIEW_BOUNDS.maxY,
);

const HALF_WIDTH_M = 700000;
const BOTTOM_M = -300000;
const TOP_M = 16000;

const BLOCK: BlockBounds = {
  minXM: -HALF_WIDTH_M,
  maxXM: HALF_WIDTH_M,
  minYM: BOTTOM_M,
  maxYM: TOP_M,
  minZM: -700000,
  maxZM: 0,
};

class TestBlockNode extends EarthBlockNode {
  public constructor() {
    super(viewBounds);
  }

  protected blockBounds(): BlockBounds {
    return BLOCK;
  }

  protected terrainElevationM(): number {
    return -4000;
  }

  protected materialColorAt(): Color | null {
    return new Color(120, 120, 120);
  }

  protected get showWater(): boolean {
    return true;
  }
}

function flat(): SectionPlacement {
  return flatPlacement(
    new CrossSectionScale({
      bounds: viewBounds,
      halfWidthM: HALF_WIDTH_M,
      topM: TOP_M,
      bottomM: BOTTOM_M,
      bandBottomM: -20000,
      bandHeightFraction: 0.3,
    }),
  );
}

function block(): SectionPlacement {
  return blockPlacement(new TestBlockNode(), HALF_WIDTH_M, BOTTOM_M);
}

/** A label height typical of the 11–12 pt fonts the two screens use. */
const LABEL_HEIGHT = 14;

describe("range label layout", () => {
  it("puts its two ends exactly where the placement puts those model points", () => {
    // The bar is a measurement, so its ends have to be the projections of the two model
    // points and not an approximation of them — otherwise it names an extent the picture
    // does not have.
    for (const placement of [flat(), block()]) {
      const topM = new Vector2(-100000, -10000);
      const bottomM = new Vector2(-100000, -110000);
      const layout = rangeLabelLayout(placement, topM, bottomM, viewBounds, LABEL_HEIGHT);

      expect(layout.top.x).toBeCloseTo(placement.modelToView(topM.x, topM.y).x, 9);
      expect(layout.top.y).toBeCloseTo(placement.modelToView(topM.x, topM.y).y, 9);
      expect(layout.bottom.x).toBeCloseTo(placement.modelToView(bottomM.x, bottomM.y).x, 9);
      expect(layout.bottom.y).toBeCloseTo(placement.modelToView(bottomM.x, bottomM.y).y, 9);
    }
  });

  it("names the same fraction of the range in both views", () => {
    // Both views must agree about *which rock* the label is naming. They will not agree
    // about pixels — one is a two-band linear map and the other a perspective projection —
    // so the invariant is the label's position along its own range, which is what a reader
    // sees.
    const topM = new Vector2(0, -20000);
    const bottomM = new Vector2(0, -220000);

    const fractionAlong = (placement: SectionPlacement): number => {
      const layout = rangeLabelLayout(placement, topM, bottomM, viewBounds, LABEL_HEIGHT);
      return (layout.labelCenter.y - layout.top.y) / (layout.bottom.y - layout.top.y);
    };

    expect(fractionAlong(flat())).toBeCloseTo(0.5, 6);
    expect(fractionAlong(block())).toBeCloseTo(0.5, 6);
  });

  it("pulls the label back inside the viewport when the range runs off the bottom", () => {
    // A shell whose top is on screen and whose base is not — the whole-Earth zoom's outer
    // core, and every shell on the block at a high vertical exaggeration. Centred between
    // the two projected points, the name would be drawn below the picture.
    //
    // The block placement, because it is the one that can actually put a point off the
    // bottom: the flat view's scale clamps, so its deepest point lands exactly on the edge.
    const placement = block();
    const topM = new Vector2(0, -50000);
    const bottomM = new Vector2(0, -900000);

    const layout = rangeLabelLayout(placement, topM, bottomM, viewBounds, LABEL_HEIGHT);

    expect(layout.bottom.y).toBeGreaterThan(viewBounds.maxY);
    expect(layout.labelCenter.y).toBeGreaterThan(viewBounds.minY);
    expect(layout.labelCenter.y).toBeLessThan(viewBounds.maxY);

    // And it sits above where an unclamped label would have gone.
    const unclamped = (layout.top.y + layout.bottom.y) / 2;
    expect(layout.labelCenter.y).toBeLessThan(unclamped);
  });

  it("keeps the label between the two ends when the whole range is on screen", () => {
    const placement = flat();
    const layout = rangeLabelLayout(placement, new Vector2(0, 0), new Vector2(0, -150000), viewBounds, LABEL_HEIGHT);

    expect(layout.labelCenter.y).toBeGreaterThan(layout.top.y);
    expect(layout.labelCenter.y).toBeLessThan(layout.bottom.y);
    expect(layout.collapsed).toBe(false);
  });

  it("collapses when the range is too short to hold its name", () => {
    // A 2 km sliver on a section 300 km deep. Rather than drawing the name across its own
    // bar, the label moves out to the side on a leader line — which is what lets the
    // thinnest layer on either screen still be named.
    const placement = flat();
    const layout = rangeLabelLayout(placement, new Vector2(0, -4000), new Vector2(0, -6000), viewBounds, LABEL_HEIGHT);

    expect(layout.bottom.y - layout.top.y).toBeLessThan(LABEL_HEIGHT);
    expect(layout.collapsed).toBe(true);
  });

  it("does not collapse a range that is exactly tall enough", () => {
    // The boundary case is worth pinning: a label that flickered between the two styles as
    // a slider moved would be worse than one that always collapsed.
    const placement = flat();
    const scale = flat();
    const topM = 0;

    // Find the model depth that projects to a comfortable multiple of the label height.
    const topY = scale.modelToView(0, topM).y;
    let bottomM = topM;
    while (scale.modelToView(0, bottomM).y - topY < LABEL_HEIGHT * 3) {
      bottomM -= 500;
    }

    const layout = rangeLabelLayout(placement, new Vector2(0, topM), new Vector2(0, bottomM), viewBounds, LABEL_HEIGHT);
    expect(layout.collapsed).toBe(false);
  });
});
