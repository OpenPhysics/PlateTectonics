/**
 * SectionPlacement.test.ts
 *
 * The contract the labels, the probe and the ruler are written against: that both views
 * of a section agree about what they mean, round-trip a point, and describe a line of
 * constant elevation in the way each of them actually draws it.
 */

import { Bounds2 } from "scenerystack/dot";
import { Color } from "scenerystack/scenery";
import { describe, expect, it } from "vitest";
import { CrossSectionScale } from "../src/common/model/CrossSectionScale.js";
import { type BlockBounds, EarthBlockNode } from "../src/common/view/EarthBlockNode.js";
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

const BLOCK: BlockBounds = {
  minXM: -HALF_WIDTH_M,
  maxXM: HALF_WIDTH_M,
  minYM: BOTTOM_M,
  maxYM: 16000,
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
      topM: 16000,
      bottomM: BOTTOM_M,
      bandBottomM: -20000,
      bandHeightFraction: 0.3,
    }),
  );
}

function block(): SectionPlacement {
  return blockPlacement(new TestBlockNode(), HALF_WIDTH_M, BOTTOM_M);
}

describe("SectionPlacement", () => {
  describe("both implementations", () => {
    const cases: [string, () => SectionPlacement][] = [
      ["flat", flat],
      ["block", block],
    ];

    for (const [name, make] of cases) {
      describe(name, () => {
        it("agrees with the section it was built from about how wide and deep it is", () => {
          const placement = make();
          expect(placement.halfWidthM).toBe(HALF_WIDTH_M);
          expect(placement.bottomM).toBe(BOTTOM_M);
          expect(placement.viewBounds.width).toBeCloseTo(viewBounds.width, 6);
        });

        it("round-trips a model point through the screen and back", () => {
          const placement = make();
          for (const [xM, elevationM] of [
            [0, 0],
            [300000, -100000],
            [-600000, 12000],
          ] as const) {
            const view = placement.modelToView(xM, elevationM);
            const back = placement.viewToModel(view.x, view.y);
            expect(back.x).toBeCloseTo(xM, 1);
            expect(back.y).toBeCloseTo(elevationM, 1);
          }
        });

        it("puts x across the screen and elevation up it", () => {
          const placement = make();
          expect(placement.modelToView(-500000, 0).x).toBeLessThan(placement.modelToView(500000, 0).x);
          expect(placement.modelToView(0, 10000).y).toBeLessThan(placement.modelToView(0, -10000).y);
        });

        it("spans the full width of the section with its contour", () => {
          const contour = make().contour(0);
          expect(contour.length).toBeGreaterThanOrEqual(2);

          const first = contour[0];
          const last = contour[contour.length - 1];
          expect(first?.x).toBeCloseTo(make().modelToView(-HALF_WIDTH_M, 0).x, 3);
          expect(last?.x).toBeCloseTo(make().modelToView(HALF_WIDTH_M, 0).x, 3);
        });
      });
    }
  });

  it("describes sea level as a straight line when flat and as an arc on the block", () => {
    // The whole reason `contour` is part of the interface rather than something callers
    // derive from two calls to modelToView: sea level is a circle, and on the block a
    // chord through it would put the horizon below the middle of the ocean.
    const flatContour = flat().contour(0);
    const flatYs = flatContour.map((point) => point.y);
    expect(Math.max(...flatYs) - Math.min(...flatYs)).toBeLessThan(1e-6);

    const blockContour = block().contour(0);
    const blockYs = blockContour.map((point) => point.y);
    expect(Math.max(...blockYs) - Math.min(...blockYs)).toBeGreaterThan(10);

    // And it bows the right way: the ends of the block curve away from the eye, so they
    // sit lower on the screen than the middle does.
    const middle = blockYs[Math.floor(blockYs.length / 2)] ?? 0;
    expect(blockYs[0]).toBeGreaterThan(middle);
    expect(blockYs[blockYs.length - 1]).toBeGreaterThan(middle);
  });

  it("keeps a stretched block's placement consistent with the block itself", () => {
    // The ruler and the probe read the placement, and the block paints itself; if the two
    // disagreed about the exaggeration, a ruler would measure in the units of a picture
    // that is not on screen.
    const node = new TestBlockNode();
    node.setVerticalExaggeration(4);
    const placement = blockPlacement(node, HALF_WIDTH_M, BOTTOM_M);

    const viaPlacement = placement.modelToView(200000, -50000);
    const viaNode = node.modelToView(200000, -50000, 0);
    expect(viaPlacement.x).toBeCloseTo(viaNode.x, 9);
    expect(viaPlacement.y).toBeCloseTo(viaNode.y, 9);

    const back = placement.viewToModel(viaPlacement.x, viaPlacement.y);
    expect(back.x).toBeCloseTo(200000, 1);
    expect(back.y).toBeCloseTo(-50000, 1);
  });
});
