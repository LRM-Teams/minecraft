import { describe, expect, it } from "vitest";
import { crystalPillars, END_BLOCKS, END_ISLANDS, EndWorld, endSpawn } from "../src/end";

describe("EndWorld", () => {
  it("generates deterministically for a seed", () => {
    const one = new EndWorld(2026, 48);
    const two = new EndWorld(2026, 48);
    expect(one.snapshot().blocks).toEqual(two.snapshot().blocks);
  });

  it("uses only End-internal blocks and none of the overworld BLOCK_TYPES", () => {
    const world = new EndWorld(2026, 48);
    world.blocks.forEach((type) => {
      expect(END_BLOCKS).toContain(type);
    });
    // The module keeps overworld BLOCK_TYPES untouched.
    expect(END_BLOCKS.some((b) => (["grass", "dirt", "stone", "wood", "planks", "leaves", "sand", "water", "bricks", "glass"] as const).includes(b as never))).toBe(false);
  });

  it("lays down the central obsidian platform and an exit portal", () => {
    const world = new EndWorld(2026, 48);
    expect(world.get(0, 0, 0)).toBe("obsidian");
    expect(world.get(2, 0, 2)).toBe("obsidian");
    // The exit portal ring ring sits just above the platform centre.
    expect(world.get(0, 1, 0)).toBe("end_portal");
  });

  it("scatters a stable set of floating islands with endstone and pillars", () => {
    const world = new EndWorld(2026, 48);
    let endstone = 0;
    let obsidian = 0;
    world.blocks.forEach((type) => {
      if (type === "end_stone") endstone += 1;
      if (type === "obsidian") obsidian += 1;
    });
    expect(endstone).toBeGreaterThan(0);
    expect(obsidian).toBeGreaterThan(42); // platform plus some pillars
    expect(END_ISLANDS).toBeGreaterThanOrEqual(4);
  });

  it("round-trips through a snapshot and spawns the player off the platform", () => {
    const world = new EndWorld(2026, 48);
    const restored = EndWorld.fromSnapshot(world.snapshot());
    expect(restored.snapshot().blocks).toEqual(world.snapshot().blocks);
    const spawn = endSpawn();
    // Spawn is a walkable air cell just above solid ground at the platform edge.
    expect(world.isSolid(spawn.x, spawn.y - 1, spawn.z)).toBe(true);
  });

  it("reports deterministic crystal pillar positions for boss healing", () => {
    const a = crystalPillars(2026);
    const b = crystalPillars(2026);
    expect(a).toEqual(b);
    a.forEach((p) => {
      // Pillars orbit away from the central platform (not sitting at the origin).
      expect(Math.abs(p.x) > 5 || Math.abs(p.z) > 5).toBe(true);
    });
  });
});
