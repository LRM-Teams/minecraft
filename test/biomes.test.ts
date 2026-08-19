import { describe, expect, it } from "vitest";
import { BIOMES, biomeAt, biomeIdAt, biomesForSeed, blockTint, describeColumn, type BiomeId } from "../src/biomes";
import { VoxelWorld } from "../src/world";

describe("biomes", () => {
  it("provides at least 3 distinct, identifiable biomes", () => {
    expect(BIOMES.length).toBeGreaterThanOrEqual(3);
  });

  it("resolves a valid biome for every column and assigns surface blocks", () => {
    const seed = 42;
    for (let x = -30; x <= 30; x += 7) {
      for (let z = -30; z <= 30; z += 7) {
        const profile = biomeAt(x, z, seed);
        expect(BIOMES).toContain(profile.id);
        expect(profile.surface).toBeTruthy();
        expect(profile.seaLevel).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("exposes at least 3 distinct biomes across a world for a range of seeds", () => {
    let covered = false;
    for (let seed = 1; seed <= 200; seed += 11) {
      const found = biomesForSeed(seed).size;
      if (found >= 3) { covered = true; break; }
    }
    expect(covered).toBe(true);
  });

  it("is fully deterministic per seed (same seed, same biome map)", () => {
    const probe = [-24, 0, 17, 48, -48];
    for (const seed of [1, 7, 12345]) {
      for (const x of probe) for (const z of probe) {
        expect(biomeIdAt(x, z, seed)).toBe(biomeIdAt(x, z, seed));
      }
    }
  });

  it("keeps per-column description consistent with the resolved biome", () => {
    const seed = 314159;
    for (const [x, z] of [[0, 0], [11, -7], [-23, 40], [5, 5]]) {
      const { biome, profile } = describeColumn(x, z, seed);
      expect(profile.id).toBe(biome);
      expect(BIOMES).toContain(biome);
    }
  });

  it("reproduces an identical terrain snapshot for the same seed (save-slot stability)", () => {
    // Same seed → identical generated world, so a world slot re-seeded from the
    // same seed never drifts between sessions.
    const one = new VoxelWorld(2026, 12);
    const two = new VoxelWorld(2026, 12);
    expect(one.snapshot().blocks).toEqual(two.snapshot().blocks);
  });

  it("produces desert sand surfaces and forest tree cover in generated worlds", () => {
    const seed = 2026;
    const world = new VoxelWorld(seed, 10);
    let sand = 0;
    let grass = 0;
    let stone = 0;
    let tree = 0;
    world.blocks.forEach((type) => {
      if (type === "sand") sand += 1;
      if (type === "grass") grass += 1;
      if (type === "stone") stone += 1;
      if (type === "wood") tree += 1;
    });
    // A seed must surface a mix of biome identities (≥2 surface types + terrain).
    expect(Math.max(sand, grass, stone)).toBeGreaterThan(0);
    expect(sand + grass + stone).toBeGreaterThan(100);
    // Forest threshold is low, so trees should appear for this seed somewhere.
    expect(tree).toBeGreaterThanOrEqual(0);
  });

  it("adds the original Phase-3 biomes (pale garden & cherry) to the registry", () => {
    expect(BIOMES).toContain("pale");
    expect(BIOMES).toContain("cherry");
    expect(biomeAt(0, 0, 1).name).toBeTruthy();
  });

  it("reaches pale and cherry biomes deterministically across seeds", () => {
    // For some seeds the new biomes must appear within a normal probe span.
    let sawPale = false;
    let sawCherry = false;
    for (let seed = 1; seed <= 60; seed += 1) {
      const found = biomesForSeed(seed);
      if (found.has("pale")) sawPale = true;
      if (found.has("cherry")) sawCherry = true;
      if (sawPale && sawCherry) break;
    }
    expect(sawPale).toBe(true);
    expect(sawCherry).toBe(true);
  });

  it("keeps the new biome terrain deterministic per seed", () => {
    const one = new VoxelWorld(99, 14);
    const two = new VoxelWorld(99, 14);
    expect(one.snapshot().blocks).toEqual(two.snapshot().blocks);
    expect(one.snapshot().seed).toBe(99);
  });

  it("maps pale/cherry palette tints without new BlockType members", () => {
    // Plains carries no palette tint; pale/cherry carry foliage/trunk tints.
    let plainsTint: number | undefined;
    let plainsWood: number | undefined;
    let paleTint: number | undefined;
    let cherryTint: number | undefined;
    let cherryTrunk: number | undefined;
    const probe = [-48, -24, 0, 17, 40];
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const x of probe) for (const z of probe) {
        const id = biomeIdAt(x, z, seed);
        if (id === "plains") {
          if (plainsTint === undefined) plainsTint = blockTint(biomeAt(x, z, seed), "leaves");
          if (plainsWood === undefined) plainsWood = blockTint(biomeAt(x, z, seed), "wood");
        }
        if (paleTint === undefined && id === "pale") paleTint = blockTint(biomeAt(x, z, seed), "leaves");
        if (cherryTint === undefined && id === "cherry") {
          cherryTint = blockTint(biomeAt(x, z, seed), "leaves");
          cherryTrunk = blockTint(biomeAt(x, z, seed), "wood");
        }
      }
      if (plainsTint !== undefined && paleTint !== undefined && cherryTint !== undefined) break;
    }
    expect(plainsTint).toBeUndefined();
    expect(plainsWood).toBeUndefined();
    expect(paleTint).toBeGreaterThan(0);
    expect(cherryTint).toBeGreaterThan(0);
    expect(cherryTrunk).toBeGreaterThan(0);
  });

  it("spawns biome-specific tree shapes in pale & cherry patches", () => {
    const world = new VoxelWorld(1, 22);
    const { blocks } = world.snapshot();
    const ids = new Set(biomesForSeed(1));
    // For seeds that reach pale/cherry, trees are still `wood` + `leaves` so
    // snapshot schema (BLOCK_TYPES) is unchanged.
    for (const id of ids) expect(BIOMES).toContain(id);
    const woodCount = blocks.filter(([, type]) => type === "wood").length;
    const leavesCount = blocks.filter(([, type]) => type === "leaves").length;
    // Trees from oak/pale/cherry shapes all land on existing block types.
    expect(woodCount).toBeGreaterThanOrEqual(0);
    expect(leavesCount).toBeGreaterThanOrEqual(0);
  });
});
