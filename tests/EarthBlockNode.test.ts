/**
 * EarthBlockNode.test.ts
 *
 * The block's two public promises to everything drawn on top of it: that a model point
 * lands where the picture puts it, and that a screen point comes back as the model point
 * under it. The labels and the draggable tools are Scenery nodes positioned by exactly
 * these two calls, so if they disagree the annotations drift off the features they name.
 */

import { Bounds2, Vector2 } from "scenerystack/dot";
import { Color } from "scenerystack/scenery";
import { describe, expect, it } from "vitest";
import { type BlockBounds, EarthBlockNode } from "../src/common/view/EarthBlockNode.js";
import { SECTION_VIEW_BOUNDS } from "../src/PlateTectonicsConstants.js";

const viewBounds = new Bounds2(
  SECTION_VIEW_BOUNDS.minX,
  SECTION_VIEW_BOUNDS.minY,
  SECTION_VIEW_BOUNDS.maxX,
  SECTION_VIEW_BOUNDS.maxY,
);

/** The Plate Motion block: ±700 km across, 300 km deep, 1000 km front to back. */
const BLOCK: BlockBounds = {
  minXM: -700000,
  maxXM: 700000,
  minYM: -300000,
  maxYM: 15000,
  minZM: -1000000,
  maxZM: 0,
};

/** A block with a single ridge down the middle, enough to exercise the terrain. */
class TestBlockNode extends EarthBlockNode {
  public constructor() {
    super(viewBounds);
  }

  protected blockBounds(): BlockBounds {
    return BLOCK;
  }

  protected terrainElevationM(xM: number): number {
    return -4000 + 8000 * Math.exp(-((xM / 200000) ** 2));
  }

  protected materialColorAt(): Color | null {
    return new Color(100, 100, 100);
  }

  protected get showWater(): boolean {
    return true;
  }
}

describe("EarthBlockNode", () => {
  it("projects the centre of the front face to the middle of the viewport", () => {
    const node = new TestBlockNode();
    const centre = node.modelToView(0, 0, 0);

    // Horizontally centred exactly; vertically only near the middle, because the camera
    // frames the whole block and the block is not symmetric about sea level.
    expect(centre.x).toBeCloseTo(viewBounds.centerX, 6);
    expect(Math.abs(centre.y - viewBounds.centerY)).toBeLessThan(viewBounds.height / 2);
  });

  it("keeps the whole block inside the viewport", () => {
    const node = new TestBlockNode();

    for (const xM of [BLOCK.minXM, 0, BLOCK.maxXM]) {
      for (const yM of [BLOCK.minYM, BLOCK.maxYM]) {
        for (const zM of [BLOCK.minZM, BLOCK.maxZM]) {
          const point = node.modelToView(xM, yM, zM);
          expect(point.x).toBeGreaterThanOrEqual(viewBounds.minX);
          expect(point.x).toBeLessThanOrEqual(viewBounds.maxX);
          expect(point.y).toBeGreaterThanOrEqual(viewBounds.minY);
          expect(point.y).toBeLessThanOrEqual(viewBounds.maxY);
        }
      }
    }
  });

  it("puts x across the screen and elevation up it", () => {
    const node = new TestBlockNode();
    expect(node.modelToView(-400000, 0, 0).x).toBeLessThan(node.modelToView(400000, 0, 0).x);
    expect(node.modelToView(0, 10000, 0).y).toBeLessThan(node.modelToView(0, -10000, 0).y);
  });

  it("round-trips a front-face point through the screen and back", () => {
    const node = new TestBlockNode();

    for (const [xM, elevationM] of [
      [0, 0],
      [350000, -50000],
      [-650000, 12000],
      [700000, -300000],
    ] as const) {
      const viewPoint = node.modelToView(xM, elevationM, 0);
      const back = node.viewToFrontFace(viewPoint);

      expect(back).not.toBeNull();
      expect(back?.x).toBeCloseTo(xM, 2);
      expect(back?.y).toBeCloseTo(elevationM, 2);
    }
  });

  it("round-trips just as exactly once the section is exaggerated", () => {
    // The inverse has to undo the stretch as well as the curvature, or a probe dropped
    // on the section reads the depth it would have had at true scale.
    const node = new TestBlockNode();
    node.setVerticalExaggeration(4);

    for (const [xM, elevationM] of [
      [0, -20000],
      [420000, 8000],
      [-300000, -120000],
    ] as const) {
      const back = node.viewToFrontFace(node.modelToView(xM, elevationM, 0));
      expect(back?.x).toBeCloseTo(xM, 2);
      expect(back?.y).toBeCloseTo(elevationM, 2);
    }
  });

  it("stretches elevations and leaves distances across the block alone", () => {
    const trueScale = new TestBlockNode();
    const stretched = new TestBlockNode();
    stretched.setVerticalExaggeration(4);

    // Same block, so both are framed to fill the same viewport; what changes is how much
    // of the picture's height one kilometre of depth is worth.
    const trueHeight = trueScale.modelToView(0, -100000, 0).y - trueScale.modelToView(0, 0, 0).y;
    const stretchedHeight = stretched.modelToView(0, -100000, 0).y - stretched.modelToView(0, 0, 0).y;
    expect(Math.abs(stretchedHeight)).toBeGreaterThan(Math.abs(trueHeight));
  });

  it("reframes when the exaggeration changes rather than letting the block overflow", () => {
    const node = new TestBlockNode();
    node.setVerticalExaggeration(6);

    for (const yM of [BLOCK.minYM, BLOCK.maxYM]) {
      const point = node.modelToView(0, yM, 0);
      expect(point.y).toBeGreaterThanOrEqual(viewBounds.minY);
      expect(point.y).toBeLessThanOrEqual(viewBounds.maxY);
    }
  });

  it("inverts against the whole plane, not just the part of it the block covers", () => {
    const node = new TestBlockNode();

    // The front face is a plane, and every ray the camera casts forward meets it
    // somewhere. A screen point well outside the block therefore comes back as a real
    // model point beyond the block's ends rather than as a miss — callers that need the
    // result confined to the block, such as a dragged tool, clamp it themselves.
    const wayAbove = node.viewToFrontFace(new Vector2(viewBounds.centerX, viewBounds.minY - 100000));
    expect(wayAbove).not.toBeNull();
    expect(wayAbove?.y).toBeGreaterThan(BLOCK.maxYM);

    const wayLeft = node.viewToFrontFace(new Vector2(viewBounds.minX - 4000, viewBounds.centerY));
    expect(wayLeft?.x).toBeLessThan(BLOCK.minXM);
  });

  it("shows the top of the block, so the back of the terrain rides above the front", () => {
    const node = new TestBlockNode();
    const front = node.modelToView(0, 4000, BLOCK.maxZM);
    const back = node.modelToView(0, 4000, BLOCK.minZM);
    expect(back.y).toBeLessThan(front.y);
  });

  it("bends the block, so the ends of the front face sit below its middle", () => {
    const node = new TestBlockNode();
    const middle = node.modelToView(0, 0, 0);
    const leftEnd = node.modelToView(BLOCK.minXM, 0, 0);
    const rightEnd = node.modelToView(BLOCK.maxXM, 0, 0);

    // Sea level is a circle, not a line: 700 km along the surface drops ~38 km below the
    // plane through the middle of the block, which is more than the crust is thick.
    expect(leftEnd.y).toBeGreaterThan(middle.y);
    expect(rightEnd.y).toBeGreaterThan(middle.y);
    expect(leftEnd.y).toBeCloseTo(rightEnd.y, 6);
  });
});
