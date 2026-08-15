/**
 * SceneCamera.test.ts
 *
 * The perspective projection and its inverse: that depth foreshortens, that the tilt
 * lifts the far side of the block, that a screen point and a scene point agree in both
 * directions, and that the framing solver actually fits the block it is given.
 */

import { Bounds2, Vector2, Vector3 } from "scenerystack/dot";
import { describe, expect, it } from "vitest";
import { DEFAULT_TILT_DEGREES, SceneCamera } from "../src/common/view/SceneCamera.js";
import { SECTION_VIEW_BOUNDS } from "../src/PlateTectonicsConstants.js";

const viewBounds = new Bounds2(
  SECTION_VIEW_BOUNDS.minX,
  SECTION_VIEW_BOUNDS.minY,
  SECTION_VIEW_BOUNDS.maxX,
  SECTION_VIEW_BOUNDS.maxY,
);

/** A camera looking straight down −z from 1000 km away, no tilt: the simple case. */
function straightOn(): SceneCamera {
  return new SceneCamera({ viewBounds, offset: new Vector3(0, 0, -1000000), tilt: 0 });
}

/** A block ±700 km across, 300 km deep, 1000 km front to back — the Plate Motion one. */
function blockSamples(): Vector3[] {
  const points: Vector3[] = [];
  for (const x of [-700000, 0, 700000]) {
    for (const y of [-300000, 15000]) {
      for (const z of [-1000000, 0]) {
        points.push(new Vector3(x, y, z));
      }
    }
  }
  return points;
}

describe("SceneCamera", () => {
  it("puts a point on the axis at the centre of the viewport", () => {
    const projected = straightOn().project(Vector3.ZERO);
    expect(projected.visible).toBe(true);
    expect(projected.x).toBeCloseTo(viewBounds.centerX, 6);
    expect(projected.y).toBeCloseTo(viewBounds.centerY, 6);
    expect(projected.depth).toBeCloseTo(1000000, 6);
  });

  it("foreshortens with depth", () => {
    const camera = straightOn();
    const near = camera.project(new Vector3(100000, 0, 0));
    const far = camera.project(new Vector3(100000, 0, -500000));

    expect(near.x - viewBounds.centerX).toBeGreaterThan(far.x - viewBounds.centerX);
    expect(far.depth).toBeGreaterThan(near.depth);
  });

  it("puts scene y up the screen, where view y is down", () => {
    const camera = straightOn();
    expect(camera.project(new Vector3(0, 100000, 0)).y).toBeLessThan(viewBounds.centerY);
    expect(camera.project(new Vector3(0, -100000, 0)).y).toBeGreaterThan(viewBounds.centerY);
  });

  it("culls points at or behind the eye", () => {
    // The eye sits at −offset, so this camera's eye is the scene origin.
    const camera = new SceneCamera({ viewBounds, offset: Vector3.ZERO, tilt: 0 });
    expect(camera.project(new Vector3(0, 0, 500000)).visible).toBe(false);
    expect(camera.project(new Vector3(0, 0, -500000)).visible).toBe(true);
  });

  it("lifts the far side of the block up the screen when tilted", () => {
    const tilt = (DEFAULT_TILT_DEGREES * Math.PI) / 180;
    const points = blockSamples();
    const tilted = SceneCamera.framing(points, { viewBounds, tilt });
    const flat = SceneCamera.framing(points, { viewBounds, tilt: 0 });

    // Two points at the same elevation on the top face, one at the front of the block
    // and one a long way back. Smaller view y is higher on the screen.
    const front = new Vector3(0, 15000, 0);
    const back = new Vector3(0, 15000, -1000000);

    // Tilted, the back of the top face rides above the front — which is what makes the
    // top face visible at all, and so what makes the block read as solid.
    expect(tilted.project(back).y).toBeLessThan(tilted.project(front).y);

    // Without the tilt it goes the other way. The block is centred, so its top face sits
    // above the eye's axis, and the far edge of a surface above the eye falls back
    // *toward* the vanishing point — the top face is hidden behind its own front edge.
    // Reversing that is the entire job of the tilt.
    expect(flat.project(back).y).toBeGreaterThan(flat.project(front).y);
  });

  it("round-trips a screen point back onto the plane it came from", () => {
    const camera = SceneCamera.framing(blockSamples(), { viewBounds });

    for (const point of [new Vector3(0, 0, 0), new Vector3(400000, -80000, 0), new Vector3(-650000, 15000, 0)]) {
      const projected = camera.project(point);
      expect(projected.visible).toBe(true);

      const back = camera.intersectPlaneZ(new Vector2(projected.x, projected.y), 0);
      expect(back).not.toBeNull();
      expect(back?.distance(point)).toBeLessThan(1);
    }
  });

  it("returns a ray whose origin is the eye and which projects back to its screen point", () => {
    const camera = SceneCamera.framing(blockSamples(), { viewBounds });
    const screenPoint = new Vector2(viewBounds.minX + 120, viewBounds.minY + 80);
    const ray = camera.rayFromView(screenPoint);

    expect(ray.origin.distance(camera.offset.negated())).toBeLessThan(1e-6);

    const along = ray.origin.plus(ray.direction.timesScalar(2000000));
    const projected = camera.project(along);
    expect(projected.x).toBeCloseTo(screenPoint.x, 4);
    expect(projected.y).toBeCloseTo(screenPoint.y, 4);
  });

  it("misses a plane that lies behind the eye", () => {
    const camera = SceneCamera.framing(blockSamples(), { viewBounds });
    const behind = camera.offset.negated().z + 1000;
    expect(camera.intersectPlaneZ(new Vector2(viewBounds.centerX, viewBounds.centerY), behind)).toBeNull();
  });

  describe("framing", () => {
    it("fits every sample point inside the viewport", () => {
      const points = blockSamples();
      const camera = SceneCamera.framing(points, { viewBounds });

      for (const point of points) {
        const projected = camera.project(point);
        expect(projected.visible).toBe(true);
        expect(projected.x).toBeGreaterThanOrEqual(viewBounds.minX);
        expect(projected.x).toBeLessThanOrEqual(viewBounds.maxX);
        expect(projected.y).toBeGreaterThanOrEqual(viewBounds.minY);
        expect(projected.y).toBeLessThanOrEqual(viewBounds.maxY);
      }
    });

    it("fills the viewport rather than leaving the block a speck in the middle", () => {
      const points = blockSamples();
      const camera = SceneCamera.framing(points, { viewBounds });

      const projected = points.map((p) => camera.project(p));
      const width = Math.max(...projected.map((p) => p.x)) - Math.min(...projected.map((p) => p.x));
      const height = Math.max(...projected.map((p) => p.y)) - Math.min(...projected.map((p) => p.y));

      // One axis has to be close to filling; which one depends on the block's aspect.
      expect(Math.max(width / viewBounds.width, height / viewBounds.height)).toBeGreaterThan(0.8);
    });

    it("centres the block vertically", () => {
      const points = blockSamples();
      const camera = SceneCamera.framing(points, { viewBounds });
      const projected = points.map((p) => camera.project(p));

      const middle = (Math.max(...projected.map((p) => p.y)) + Math.min(...projected.map((p) => p.y))) / 2;
      expect(Math.abs(middle - viewBounds.centerY)).toBeLessThan(viewBounds.height * 0.05);
    });

    it("backs off further for a bigger block", () => {
      const near = SceneCamera.framing(blockSamples(), { viewBounds });
      const far = SceneCamera.framing(
        blockSamples().map((p) => p.timesScalar(3)),
        { viewBounds },
      );
      expect(-far.offset.z).toBeGreaterThan(-near.offset.z);
    });

    it("survives being handed nothing to frame", () => {
      const camera = SceneCamera.framing([], { viewBounds });
      expect(Number.isFinite(camera.offset.z)).toBe(true);
    });
  });
});
