import { describe, expect, it } from "vitest";
import { biomeIdAt, biomesForSeed, BIOMES } from "../src/biomes";
import { DEFAULT_HOTBAR, HOTBAR_SIZE, HOTBAR_TAG, STARTER_STACKS } from "../src/hotbar";
import { createInventory, createStarterInventory } from "../src/inventory";
import { VoxelWorld, STREAM_CHUNK_RADIUS } from "../src/world";

describe("LRM-1594 rewrite: open world + place + UI", () => {
  it("registers plains, desert, and ocean biomes", () => {
    expect(BIOMES).toContain("plains");
    expect(BIOMES).toContain("desert");
    expect(BIOMES).toContain("ocean");
  });

  it("exposes plains/desert/ocean across seeds for open-world exploration", () => {
    let plains = false;
    let desert = false;
    let ocean = false;
    for (let seed = 1; seed <= 800; seed += 9) {
      const found = biomesForSeed(seed, 96);
      if (found.has("plains")) plains = true;
      if (found.has("desert")) desert = true;
      if (found.has("ocean")) ocean = true;
      if (plains && desert && ocean) break;
    }
    expect(plains && desert && ocean).toBe(true);
  });

  it("streams chunks beyond the initial radius (infinite exploration)", () => {
    const world = new VoxelWorld(42, 16);
    const farX = 80;
    const farZ = -64;
    expect(world.get(farX, 1, farZ)).toBeUndefined();
    const grew = world.ensureAround(farX, farZ, STREAM_CHUNK_RADIUS);
    expect(grew).toBe(true);
    // Terrain should exist under the stream center after generation.
    expect(world.topY(farX, farZ)).toBeGreaterThanOrEqual(0);
    // Placement must not be clipped by the legacy size bound.
    world.set({ x: farX, y: 18, z: farZ }, "planks");
    expect(world.get(farX, 18, farZ)).toBe("planks");
  });

  it("keeps biome ids stable for a fixed seed at streamed coordinates", () => {
    const seed = 777;
    expect(biomeIdAt(120, -90, seed)).toBe(biomeIdAt(120, -90, seed));
  });

  it("ships a 9-slot hotbar with wiki-tagged swatches and starter stacks", () => {
    expect(DEFAULT_HOTBAR).toHaveLength(HOTBAR_SIZE);
    DEFAULT_HOTBAR.forEach((type) => {
      expect(HOTBAR_TAG[type]).toBeTruthy();
      expect(STARTER_STACKS[type] ?? 0).toBeGreaterThan(0);
    });
    const fresh = createStarterInventory();
    expect(fresh.grass).toBeGreaterThan(0);
    expect(fresh.torch).toBeGreaterThan(0);
    // Empty bags stay empty; saves restore exact counts.
    expect(createInventory().grass).toBe(0);
    const restored = createInventory({ grass: 0, stone: 3 });
    expect(restored.grass).toBe(0);
    expect(restored.stone).toBe(3);
  });
});
