/**
 * QuadRenderer.test.ts
 *
 * The substitute for a depth buffer: that faces come out back to front, that an explicit
 * layer overrides depth where coplanar faces make depth meaningless, that back-facing
 * and off-screen faces are dropped, and that the flat shading points the right way.
 */

import { Bounds2, Vector3 } from "scenerystack/dot";
import { Color } from "scenerystack/scenery";
import { describe, expect, it } from "vitest";
import { lambertFactor, QuadRenderer, shadeToCSS } from "../src/common/view/QuadRenderer.js";
import { SceneCamera } from "../src/common/view/SceneCamera.js";

const viewBounds = new Bounds2(0, 0, 800, 500);

/** A camera 2000 km back, looking straight down −z. */
function camera(): SceneCamera {
  return new SceneCamera({ viewBounds, offset: new Vector3(0, 0, -2000000), tilt: 0 });
}

/** Records the fills the renderer asks for, in the order it asks for them. */
function recordingContext(): { context: CanvasRenderingContext2D; fills: string[] } {
  const fills: string[] = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    stroke: () => undefined,
    fill(): void {
      fills.push(String(this.fillStyle));
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, fills };
}

/** A square of side 200 km facing the camera, at scene depth `z`, wound anticlockwise. */
function facingSquare(z: number): Vector3[] {
  return [
    new Vector3(-100000, -100000, z),
    new Vector3(100000, -100000, z),
    new Vector3(100000, 100000, z),
    new Vector3(-100000, 100000, z),
  ];
}

const RED = new Color(255, 0, 0);
const GREEN = new Color(0, 255, 0);
const BLUE = new Color(0, 0, 255);

describe("QuadRenderer", () => {
  it("paints the furthest face first, whatever order it was given them in", () => {
    const renderer = new QuadRenderer(camera());
    // Added near-first, so a renderer that ignored depth would paint them this way.
    renderer.addFace(facingSquare(0), RED, { shade: false });
    renderer.addFace(facingSquare(-900000), GREEN, { shade: false });

    const { context, fills } = recordingContext();
    renderer.paint(context);

    expect(fills).toEqual([GREEN.toCSS(), RED.toCSS()]);
  });

  it("lets an explicit layer beat depth, for faces depth cannot separate", () => {
    const renderer = new QuadRenderer(camera());
    // Coplanar: every band of the cross-section sits on one sheet at the front of the
    // block, so their centroid depths are identical and only the layer decides.
    renderer.addFace(facingSquare(0), RED, { shade: false, layer: 2 });
    renderer.addFace(facingSquare(0), GREEN, { shade: false, layer: 1 });
    renderer.addFace(facingSquare(0), BLUE, { shade: false, layer: 3 });

    const { context, fills } = recordingContext();
    renderer.paint(context);

    expect(fills).toEqual([GREEN.toCSS(), RED.toCSS(), BLUE.toCSS()]);
  });

  it("keeps a layer's own faces sorted back to front within the layer", () => {
    const renderer = new QuadRenderer(camera());
    renderer.addFace(facingSquare(0), RED, { shade: false, layer: 1 });
    renderer.addFace(facingSquare(-900000), GREEN, { shade: false, layer: 1 });

    const { context, fills } = recordingContext();
    renderer.paint(context);

    expect(fills).toEqual([GREEN.toCSS(), RED.toCSS()]);
  });

  it("culls a face that is being seen from behind, when asked to", () => {
    const renderer = new QuadRenderer(camera());
    const front = facingSquare(0);

    renderer.addFace(front, RED, { cull: true });
    expect(renderer.faceCount).toBe(1);

    // The same square wound the other way is the same square seen from its back.
    renderer.clear();
    renderer.addFace([...front].reverse(), RED, { cull: true });
    expect(renderer.faceCount).toBe(0);

    // Without culling, a flat sheet is drawn from either side — which the cross-section
    // relies on, having no back.
    renderer.clear();
    renderer.addFace([...front].reverse(), RED, {});
    expect(renderer.faceCount).toBe(1);
  });

  it("drops a face with any vertex at or behind the eye", () => {
    const renderer = new QuadRenderer(camera());
    // The eye sits at −offset = (0, 0, 2 000 km); this square is well past it.
    renderer.addFace(facingSquare(3000000), RED, {});
    expect(renderer.faceCount).toBe(0);
  });

  it("drops a degenerate face with fewer than three vertices", () => {
    const renderer = new QuadRenderer(camera());
    renderer.addFace([new Vector3(0, 0, 0), new Vector3(1000, 0, 0)], RED, {});
    expect(renderer.faceCount).toBe(0);
  });

  it("reuses its pool across repaints instead of growing without bound", () => {
    const renderer = new QuadRenderer(camera());
    for (let repaint = 0; repaint < 5; repaint++) {
      renderer.clear();
      renderer.addFace(facingSquare(0), RED, {});
      renderer.addFace(facingSquare(-100000), GREEN, {});
      expect(renderer.faceCount).toBe(2);
    }
  });

  describe("shading", () => {
    it("lights the top of the block most, then the end the light falls on", () => {
      const up = lambertFactor(0, 1, 0);
      const litSide = lambertFactor(-1, 0, 0);
      const front = lambertFactor(0, 0, 1);

      expect(up).toBeGreaterThan(litSide);
      expect(up).toBeGreaterThan(front);
      expect(litSide).toBeGreaterThan(0.62);
      expect(front).toBeGreaterThan(0.62);
    });

    it("leaves everything facing away from the light at the ambient floor", () => {
      // No second light and no bounce, so the shaded end of the block and its underside
      // are equally dark rather than one being darker than the other.
      expect(lambertFactor(1, 0, 0)).toBeCloseTo(0.62, 12);
      expect(lambertFactor(0, -1, 0)).toBeCloseTo(0.62, 12);
      expect(lambertFactor(0, 0, -1)).toBeCloseTo(0.62, 12);
    });

    it("never darkens past the ambient floor or brightens past full", () => {
      for (const normal of [
        [0, 1, 0],
        [0, -1, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
        [-0.35, 0.86, 0.37],
      ] as const) {
        const factor = lambertFactor(normal[0], normal[1], normal[2]);
        expect(factor).toBeGreaterThanOrEqual(0.62);
        expect(factor).toBeLessThanOrEqual(1);
      }
    });

    it("is unaffected by the length of the normal it is handed", () => {
      expect(lambertFactor(0, 5000, 0)).toBeCloseTo(lambertFactor(0, 1, 0), 12);
    });

    it("shades a face by its own normal, so the top of a block is brighter than its side", () => {
      const renderer = new QuadRenderer(camera());

      // A horizontal face, seen from a camera tilted enough to see it.
      const tilted = new QuadRenderer(
        new SceneCamera({ viewBounds, offset: new Vector3(0, -300000, -2000000), tilt: 0.4 }),
      );
      const grey = new Color(200, 200, 200);
      tilted.addFace(
        [
          new Vector3(-100000, 0, 0),
          new Vector3(100000, 0, 0),
          new Vector3(100000, 0, -200000),
          new Vector3(-100000, 0, -200000),
        ],
        grey,
      );
      const topFills = recordingContext();
      tilted.paint(topFills.context);

      renderer.addFace(facingSquare(0), grey);
      const sideFills = recordingContext();
      renderer.paint(sideFills.context);

      expect(topFills.fills[0]).not.toEqual(sideFills.fills[0]);
    });

    it("dims a colour toward black without touching its alpha", () => {
      expect(shadeToCSS(new Color(200, 100, 50), 1)).toBe("rgb(200,100,50)");
      expect(shadeToCSS(new Color(200, 100, 50), 0.5)).toBe("rgb(100,50,25)");
      expect(shadeToCSS(new Color(200, 100, 50, 0.5), 1)).toBe("rgba(200,100,50,0.5)");
    });

    it("clamps rather than wrapping when asked to over-brighten", () => {
      expect(shadeToCSS(new Color(200, 100, 50), 4)).toBe("rgb(255,255,200)");
    });
  });
});
