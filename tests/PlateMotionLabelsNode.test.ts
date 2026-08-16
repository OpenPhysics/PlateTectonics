/**
 * PlateMotionLabelsNode.test.ts
 *
 * The drop zones as targets rather than as decoration.
 *
 * A crust piece can be dragged out of the chooser and released over the section, and which
 * plate it becomes is decided by which zone the release landed in. That makes the zones'
 * geometry a correctness question and not a layout preference: a zone that reached across
 * the boundary, or one that did not cover the plate it stands for, would put crust on the
 * side the user did not point at.
 *
 * Both views have to agree, because the user can drop a piece on either one, and the block
 * projects the same model points through a perspective camera rather than an affine scale.
 */

import { Bounds2, type Vector2 } from "scenerystack/dot";
import { Color } from "scenerystack/scenery";
import { describe, expect, it } from "vitest";
import { CrossSectionScale } from "../src/common/model/CrossSectionScale.js";
import { type BlockBounds, EarthBlockNode } from "../src/common/view/EarthBlockNode.js";
import { blockPlacement, flatPlacement, type SectionPlacement } from "../src/common/view/SectionPlacement.js";
import { PLATE_X_LIMIT_M, SECTION_VIEW_BOUNDS } from "../src/PlateTectonicsConstants.js";
import type { Side } from "../src/plate-motion/model/BoundaryRules.js";
import { dropZoneBounds } from "../src/plate-motion/view/PlateMotionLabelsNode.js";

const viewBounds = new Bounds2(
  SECTION_VIEW_BOUNDS.minX,
  SECTION_VIEW_BOUNDS.minY,
  SECTION_VIEW_BOUNDS.maxX,
  SECTION_VIEW_BOUNDS.maxY,
);

const BOTTOM_M = -300000;
const TOP_M = 16000;

const BLOCK: BlockBounds = {
  minXM: -PLATE_X_LIMIT_M,
  maxXM: PLATE_X_LIMIT_M,
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
      halfWidthM: PLATE_X_LIMIT_M,
      topM: TOP_M,
      bottomM: BOTTOM_M,
      bandBottomM: -20000,
      bandHeightFraction: 0.3,
    }),
  );
}

function block(): SectionPlacement {
  return blockPlacement(new TestBlockNode(), PLATE_X_LIMIT_M, BOTTOM_M);
}

/** The two views a piece can be dropped on, named so a failure says which one broke. */
const PLACEMENTS: readonly [string, () => SectionPlacement][] = [
  ["flat section", flat],
  ["block", block],
];

/** What the drag does with a release: the zone a point is in, or null between them. */
function sideAt(placement: SectionPlacement, point: Vector2): Side | null {
  for (const side of ["left", "right"] as const) {
    if (dropZoneBounds(placement, side).containsPoint(point)) {
      return side;
    }
  }
  return null;
}

describe.each(PLACEMENTS)("drop zones on the %s", (_name, makePlacement) => {
  it("keeps each zone on its own side of the boundary", () => {
    // The two zones must not overlap, or a release in the overlap would land on whichever
    // one happened to be tested first — a coin toss the user cannot see.
    const placement = makePlacement();
    const left = dropZoneBounds(placement, "left");
    const right = dropZoneBounds(placement, "right");

    expect(left.maxX).toBeLessThan(right.minX);
    expect(sideAt(placement, placement.modelToView(0, 0))).toBeNull();
  });

  it("covers the plate it stands for, crust and lithosphere alike", () => {
    // A plate is not its crust, and the zone is the target for placing the whole plate, so
    // it has to reach from above sea level down past the lithosphere the piece will get.
    const placement = makePlacement();
    for (const [side, sign] of [
      ["left", -1],
      ["right", 1],
    ] as const) {
      for (const elevationM of [0, -10000, -40000, -80000]) {
        for (const fraction of [0.1, 0.5, 0.95]) {
          const point = placement.modelToView(sign * fraction * PLATE_X_LIMIT_M, elevationM);
          expect(sideAt(placement, point)).toBe(side);
        }
      }
    }
  });

  it("stays inside the section it is drawn on", () => {
    // A target that ran off the viewport would accept drops on the panels beside it.
    const placement = makePlacement();
    for (const side of ["left", "right"] as const) {
      expect(viewBounds.containsBounds(dropZoneBounds(placement, side))).toBe(true);
    }
  });
});
