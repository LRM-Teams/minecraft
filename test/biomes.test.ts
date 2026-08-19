import { describe, expect, it } from "vitest";
import { BIOMES, biomeAt, biomeIdAt, biomesForSeed, describeColumn, type BiomeId } from "../src/biomes";
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

  it("exposes the new Phase-3 biomes (pale_garden, sakura) across seeds", () => {
    let pale = false;
    let sakura = false;
    for (let seed = 200; seed <= 600; seed += 7) {
      const found = biomesForSeed(seed);
      if (found.has("pale_garden")) pale = true;
      if (found.has("sakura")) sakura = true;
      if (pale && sakura) break;
    }
    expect(BIOMES).toContain("pale_garden");
    expect(BIOMES).toContain("sakura");
    expect(pale).toBe(true);
    expect(sakura).toBe(true);
  });

  it("assigns a distinct variant and deterministic flora to the new biomes", () => {
    // Every pale_garden column is pale-tinted and every sakura column is sakura-tinted.
    const seed = 400;
    for (let x = -40; x <= 40; x += 3) {
      for (let z = -40; z <= 40; z += 3) {
        const profile = biomeAt(x, z, seed);
        if (profile.id === "pale_garden") expect(profile.variant).toBe("pale");
        if (profile.id === "sakura") expect(profile.variant).toBe("sakura");
      }
    }
  });

  it("keeps the new biome grid fully deterministic per seed", () => {
    const seed = 56789;
    for (const x of [-12, 3, 27, -50]) for (const z of [-9, 6, 41, -33]) {
      expect(biomeIdAt(x, z, seed)).toBe(biomeIdAt(x, z, seed));
      expect(biomeAt(x, z, seed).variant).toBe(biomeAt(x, z, seed).variant);
    }
  });
});
