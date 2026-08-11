/**
 * Fleet-standard memory-leak regression suite (SceneryStackTemplate / QubitSketch pattern).
 *
 * Creates a disposable model object inside a function boundary, disposes it, forces
 * garbage collection via global.gc (--expose-gc in vitest.config.ts), then asserts via
 * WeakRef that the object was collected. V8 requires a function boundary (not merely
 * a block scope) so local strong references die when the helper returns.
 */

import { describe, expect, it } from "vitest";
import { PlateReconstruction } from "../src/common/PlateReconstruction.js";
import { TimeModel } from "../src/common/TimeModel.js";
import { CrustModel } from "../src/crust/model/CrustModel.js";
import { PlateMotionModel } from "../src/plate-motion/model/PlateMotionModel.js";

/**
 * Force garbage collection with multiple passes. When `earlyExitRefs` is supplied
 * the loop bails as soon as every referenced object is confirmed collected. The
 * setTimeout(0) yield after a live deref() avoids the WeakRef macrotask-liveness pin.
 * Without early-exit refs the loop always runs all passes, which on a slow `gc()`
 * can exceed the Vitest testTimeout — always pass refs when you have them.
 */
async function forceGC(earlyExitRefs?: WeakRef<object> | readonly WeakRef<object>[]): Promise<void> {
  const refs = earlyExitRefs === undefined ? [] : Array.isArray(earlyExitRefs) ? earlyExitRefs : [earlyExitRefs];
  for (let i = 0; i < 15; i++) {
    globalThis.gc?.();
    await new Promise<void>((r) => setTimeout(r, 50));
    if (refs.length > 0 && refs.every((ref) => ref.deref() === undefined)) {
      return;
    }
    if (refs.length > 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
}

function createAndDisposeTimeModel(): WeakRef<object> {
  const model = new TimeModel();
  const ref = new WeakRef<object>(model);
  model.dispose();
  return ref;
}

/**
 * One reconstruction holds a matrix per plate; scrubbing geological time creates and
 * discards them, so a leak here would grow with every drag of the time slider.
 */
function createAndDropReconstruction(): WeakRef<object> {
  const reconstruction = new PlateReconstruction();
  reconstruction.setTime(-25);
  reconstruction.transform(-71.5, -21.5, 0);
  return new WeakRef<object>(reconstruction);
}

/**
 * A screen model is created afresh every time its screen is first shown, and holds
 * DerivedProperties that link to its own Properties. Those links are exactly the kind
 * of cycle that keeps a discarded model alive, so each screen model gets an entry here.
 */
function createAndDisposeCrustModel(): WeakRef<object> {
  const model = new CrustModel();
  const ref = new WeakRef<object>(model);
  model.step(1 / 60);
  model.reset();
  model.dispose();
  return ref;
}

function createAndDisposePlateMotionModel(): WeakRef<object> {
  const model = new PlateMotionModel();
  const ref = new WeakRef<object>(model);
  model.setPlate("left", "continental");
  model.setPlate("right", "oldOceanic");
  model.motionTypeProperty.value = "convergent";
  model.step(1 / 60);
  model.reset();
  model.dispose();
  return ref;
}

describe("Memory leak regression", () => {
  it("global.gc is available (--expose-gc)", () => {
    expect(globalThis.gc).toBeDefined();
  });

  it("sanity: plain object is collected", async () => {
    const ref = (() => new WeakRef({ hello: "world" }))();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("TimeModel is collected after dispose", async () => {
    const ref = createAndDisposeTimeModel();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("double dispose() does not throw", () => {
    const model = new TimeModel();
    model.dispose();
    expect(() => model.dispose()).not.toThrow();
  });

  it("PlateReconstruction is collected once dropped", async () => {
    const ref = createAndDropReconstruction();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("repeated reconstructions leave no survivors", async () => {
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < 10; i++) {
      refs.push(createAndDropReconstruction());
    }
    await forceGC(refs);
    expect(refs.filter((ref) => ref.deref() !== undefined).length).toBe(0);
  });

  it("CrustModel is collected once disposed", async () => {
    const ref = createAndDisposeCrustModel();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("repeated CrustModel cycles leave no survivors", async () => {
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < 10; i++) {
      refs.push(createAndDisposeCrustModel());
    }
    await forceGC(refs);
    expect(refs.filter((ref) => ref.deref() !== undefined).length).toBe(0);
  });

  it("PlateMotionModel is collected once disposed", async () => {
    const ref = createAndDisposePlateMotionModel();
    await forceGC(ref);
    expect(ref.deref()).toBeUndefined();
  });

  it("repeated PlateMotionModel cycles leave no survivors", async () => {
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < 10; i++) {
      refs.push(createAndDisposePlateMotionModel());
    }
    await forceGC(refs);
    expect(refs.filter((ref) => ref.deref() !== undefined).length).toBe(0);
  });

  it("repeated create/dispose cycles leave no survivors", async () => {
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < 10; i++) {
      refs.push(createAndDisposeTimeModel());
    }
    await forceGC(refs);
    const survivors = refs.filter((r) => r.deref() !== undefined).length;
    expect(survivors).toBe(0);
  });
});
