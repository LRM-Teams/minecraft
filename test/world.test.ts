import { describe, expect, it } from "vitest";
import { VoxelWorld } from "../src/world";

describe("VoxelWorld", () => {
  it("generates deterministically for a seed", () => {
    const one = new VoxelWorld(12, 4);
    const two = new VoxelWorld(12, 4);
    expect(one.snapshot().blocks).toEqual(two.snapshot().blocks);
  });

  it("round-trips player edits through a snapshot", () => {
    const world = new VoxelWorld(7, 4);
    world.set({ x: 0, y: 15, z: 0 }, "wood");
    world.remove({ x: 0, y: 0, z: 0 });
    const restored = VoxelWorld.fromSnapshot(world.snapshot(), 4);
    expect(restored.get(0, 15, 0)).toBe("wood");
    expect(restored.get(0, 0, 0)).toBeUndefined();
  });
});
