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

  it("builds a deterministic, enterable plains village with anchors for villagers", () => {
    const seed = 2026;
    const one = new VoxelWorld(seed, 48);
    const two = new VoxelWorld(seed, 48);
    expect(one.villages).toEqual(two.villages);
    expect(one.villages).toHaveLength(1);
    const village = one.villages[0];
    expect(village.homes).toHaveLength(4);
    // The anchor is the walkable air cell immediately over the brick plaza.
    expect(one.get(village.plaza.x, village.plaza.y - 1, village.plaza.z)).toBe("bricks");
    village.homes.forEach((home) => {
      expect(one.get(home.entrance.x, home.entrance.y, home.entrance.z)).toBe("oak_door");
      expect(one.get(home.entrance.x, home.entrance.y + 1, home.entrance.z)).toBe("oak_door");
      expect(one.get(home.interior.x, home.interior.y, home.interior.z)).toBeUndefined();
      expect(home.workstation.y).toBe(home.interior.y);
    });
  });

  it("keeps village blocks editable and preserves the edit in a save snapshot", () => {
    const world = new VoxelWorld(2026, 48);
    const village = world.villages[0];
    expect(village).toBeTruthy();
    if (!village) return;
    const plaza = { x: village.plaza.x, y: village.plaza.y - 1, z: village.plaza.z };
    world.remove(plaza);
    const restored = VoxelWorld.fromSnapshot(world.snapshot());
    expect(restored.get(plaza.x, plaza.y, plaza.z)).toBeUndefined();
    expect(restored.villages).toEqual(world.villages);
  });

  it("scatters Phase-3 flora deterministically without new block types", () => {
    // Pale Garden / Sakura use existing blocks (planks = glowing shrooms / petals)
    // as surface flora; the same seed must reproduce the identical layout.
    const seed = 991;
    const one = new VoxelWorld(seed, 40);
    const two = new VoxelWorld(seed, 40);
    expect(one.snapshot().blocks).toEqual(two.snapshot().blocks);
    // Flora (planks on the floor) plus trees (wood) must exist in the world.
    let planks = 0;
    let wood = 0;
    one.blocks.forEach((type) => {
      if (type === "planks") planks += 1;
      if (type === "wood") wood += 1;
    });
    expect(planks).toBeGreaterThan(0);
    expect(wood).toBeGreaterThan(0);
  });

  it("carves deterministic underground caves without touching the surface or villages", () => {
    const seed = 2026;
    const one = new VoxelWorld(seed, 48);
    const two = new VoxelWorld(seed, 48);
    // Determinism: both worlds carve the exact same set of underground cells.
    expect(one.snapshot().blocks).toEqual(two.snapshot().blocks);
    // Carving happened: some deep cells became air well below the surface top.
    let carved = 0;
    for (let x = -20; x <= 20; x += 1) {
      for (let z = -20; z <= 20; z += 1) {
        const top = one.topY(x, z);
        for (let y = 1; y < Math.max(1, top - 3); y += 1) {
          if (!one.get(x, y, z)) carved += 1;
        }
      }
    }
    expect(carved).toBeGreaterThan(0);
    // The village still anchors above solid ground and its plaza block survives.
    const village = one.villages[0];
    if (village) {
      expect(one.isSolid(village.plaza.x, village.plaza.y - 1, village.plaza.z)).toBe(true);
    }
  });

  it("embeds the five mineral ores underground, with rarer ores deeper and scarcer", () => {
    const world = new VoxelWorld(2026, 48);
    const counts: Record<string, number> = { coal_ore: 0, copper_ore: 0, iron_ore: 0, gold_ore: 0, diamond_ore: 0 };
    let surfaceOre = 0;
    world.blocks.forEach((type, key) => {
      if (!(type in counts)) return;
      counts[type] += 1;
      const y = Number(key.split(",")[1]);
      if (y > 9) surfaceOre += 1;
    });
    // All five ores appear.
    Object.values(counts).forEach((count) => expect(count).toBeGreaterThan(0));
    // Scarcer / more valuable ores live only in the deep band, never near surface.
    expect(counts.diamond_ore).toBeLessThan(counts.iron_ore);
    expect(counts.diamond_ore).toBeLessThan(counts.copper_ore);
    expect(counts.gold_ore).toBeLessThan(counts.coal_ore);
    // No ore leaks above the underground band (surface stays untouched).
    expect(surfaceOre).toBe(0);
  });

  it("round-trips mined ores through a snapshot for archive-compatible reloads", () => {
    const world = new VoxelWorld(2026, 48);
    // Find any ore cell and mine it away, then reload from a snapshot.
    const oreCell = [...world.blocks.entries()].find(([, type]) => type === "coal_ore");
    expect(oreCell).toBeTruthy();
    if (!oreCell) return;
    const [position, type] = oreCell;
    const [x, y, z] = position.split(",").map(Number);
    expect(world.get(x, y, z)).toBe(type);
    expect(world.remove({ x, y, z })).toBe(type);
    const restored = VoxelWorld.fromSnapshot(world.snapshot(), world.size);
    expect(restored.get(x, y, z)).toBeUndefined();
    // Every surviving block, ores included, survives the snapshot round-trip.
    expect(restored.snapshot().blocks).toEqual(world.snapshot().blocks);
  });
});
