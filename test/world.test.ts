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

  it("does not treat water as solid ground", () => {
    const world = new VoxelWorld(7, 2);
    world.set({ x: 0, y: 12, z: 0 }, "water");
    expect(world.isSolid(0, 12, 0)).toBe(false);
    expect(world.topY(0, 0)).toBeLessThan(12);
  });

  it("omits fully buried blocks from the renderable set", () => {
    const world = new VoxelWorld(7, 2);
    world.blocks.clear();
    world.set({ x: 0, y: 1, z: 0 }, "stone");
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(([x, y, z]) => {
      world.set({ x, y: y + 1, z }, "stone");
    });
    expect(world.visibleBlocks().some(({ position }) => position.x === 0 && position.y === 1 && position.z === 0)).toBe(false);
    world.remove({ x: 1, y: 1, z: 0 });
    expect(world.visibleBlocks().some(({ position }) => position.x === 0 && position.y === 1 && position.z === 0)).toBe(true);
  });

  it("limits renderable blocks to nearby chunks without deleting distant world data", () => {
    const world = new VoxelWorld(7, 40);
    const distant = { x: 32, y: 18, z: 32 };
    world.set(distant, "wood");
    expect(world.get(distant.x, distant.y, distant.z)).toBe("wood");
    expect(world.visibleBlocks(0, 0, 1).some(({ position }) => position.x === distant.x && position.y === distant.y && position.z === distant.z)).toBe(false);
    expect(world.visibleBlocks(32, 32, 1).some(({ position }) => position.x === distant.x && position.y === distant.y && position.z === distant.z)).toBe(true);
  });
});
