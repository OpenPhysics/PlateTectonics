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

/**
 * Force garbage collection with multiple passes. When `earlyExitRef` is supplied
 * the loop bails as soon as the object is confirmed collected. The setTimeout(0)
 * yield after a live deref() avoids the WeakRef macrotask-liveness pin.
 */
async function forceGC(earlyExitRef?: WeakRef<object>): Promise<void> {
  for (let i = 0; i < 15; i++) {
    globalThis.gc?.();
    await new Promise<void>((r) => setTimeout(r, 50));
    if (earlyExitRef !== undefined && earlyExitRef.deref() === undefined) {
      return;
    }
    if (earlyExitRef !== undefined) {
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
    await forceGC();
    expect(refs.filter((ref) => ref.deref() !== undefined).length).toBe(0);
  });

  it("repeated create/dispose cycles leave no survivors", async () => {
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < 10; i++) {
      refs.push(createAndDisposeTimeModel());
    }
    await forceGC();
    const survivors = refs.filter((r) => r.deref() !== undefined).length;
    expect(survivors).toBe(0);
  });
});
