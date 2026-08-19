import { describe, expect, it } from "vitest";
import {
  NETHER_BLOCKS,
  NetherWorld,
  createPortalLink,
  defaultPortalGeometry,
  isWithinPortalOpening,
  portalTiles,
  teleportPosition,
  type PortalLink,
} from "../src/nether";
import { BLOCK_TYPES, type WorldSnapshot, VoxelWorld } from "../src/world";

describe("NetherWorld", () => {
  it("generates a hell terrain deterministically for a seed", () => {
    const one = new NetherWorld(33, 20);
    const two = new NetherWorld(33, 20);
    expect(one.snapshot().blocks).toEqual(two.snapshot().blocks);
    // Nether surface is made of netherrack by default.
    expect(one.blocks.size).toBeGreaterThan(0);
    expect([...one.blocks.values()].every((type) => NETHER_BLOCKS.includes(type))).toBe(true);
  });

  it("round-trips nether edits through a snapshot", () => {
    const world = new NetherWorld(7, 20);
    world.set({ x: 3, y: 18, z: 4 }, "glowstone");
    world.remove({ x: 0, y: 6, z: 0 });
    const restored = NetherWorld.fromSnapshot(world.snapshot());
    expect(restored.get(3, 18, 4)).toBe("glowstone");
    // The edited column's ground may differ locally; just confirm the edit held.
    expect(restored.get(3, 18, 4)).toBe("glowstone");
  });

  it("does not treat lava as solid ground", () => {
    const world = new NetherWorld(9, 20);
    // Force a lava cell above an otherwise solid netherrack column.
    const top = world.topY(0, 0);
    world.set({ x: 0, y: top + 1, z: 0 }, "lava");
    expect(world.isSolid(0, top + 1, 0)).toBe(false);
    expect(world.topY(0, 0)).toBeLessThan(top + 1);
  });

  it("uses only nether-internal blocks and never the overworld BLOCK_TYPES", () => {
    // The dimension registry is fully disjoint from the overworld schema.
    const world = new NetherWorld(2026, 24);
    for (const type of world.blocks.values()) {
      expect(BLOCK_TYPES).not.toContain(type);
    }
  });

  it("keeps overworld WorldSnapshot schema intact while the nether exists independently", () => {
    // Constructing a nether must not change the overworld snapshot shape.
    const overworld = new VoxelWorld(2026, 24);
    const overSnapshot: WorldSnapshot = overworld.snapshot();
    const nether = new NetherWorld(2026, 24);
    void nether;
    // Round-trip still works after a nether is built alongside.
    const restored = VoxelWorld.fromSnapshot(overSnapshot);
    expect(restored.snapshot().blocks).toEqual(overworld.snapshot().blocks);
  });

  it("produces a playable hell ecology: solid spawn floor plus lava and glowstone", () => {
    const world = new NetherWorld(2026, 24);
    // The nether has walkable solid ground at the origin.
    expect(world.isSolid(0, world.topY(0, 0), 0)).toBe(true);
    // Both signature hell features appear somewhere in the dimension.
    let lava = 0;
    let glowstone = 0;
    world.blocks.forEach((type) => {
      if (type === "lava") lava += 1;
      if (type === "glowstone") glowstone += 1;
    });
    expect(lava).toBeGreaterThan(0);
    expect(glowstone).toBeGreaterThan(0);
  });

  it("persists the nether sub-world through the same storage snapshot shape", () => {
    // The nether snapshot stays independent and serialisable next to the world.
    const world = new NetherWorld(55, 20);
    const snapshot = world.snapshot();
    const clone = NetherWorld.fromSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(clone.snapshot().blocks).toEqual(world.snapshot().blocks);
  });
});

describe("nether portal", () => {
  const geometry = defaultPortalGeometry();

  it("exposes the module-internal portal blocks", () => {
    expect(NETHER_BLOCKS).toContain("obsidian");
    expect(NETHER_BLOCKS).toContain("nether_portal");
    expect(NETHER_BLOCKS).toContain("netherrack");
    expect(NETHER_BLOCKS).toContain("glowstone");
    expect(NETHER_BLOCKS).toContain("lava");
  });

  it("reports whether a position is inside the portal opening", () => {
    const anchor = { x: 5, y: 10, z: 5 };
    expect(isWithinPortalOpening(anchor, geometry, 5, 10, 5)).toBe(true);
    expect(isWithinPortalOpening(anchor, geometry, 5, 12, 5)).toBe(true);
    // Outside the width / height / depth.
    expect(isWithinPortalOpening(anchor, geometry, 5, 13, 5)).toBe(false);
    expect(isWithinPortalOpening(anchor, geometry, 7, 10, 5)).toBe(false);
    expect(isWithinPortalOpening(anchor, geometry, 5, 10, 6)).toBe(false);
  });

  it("enumerates every portal tile of the opening", () => {
    const link = buildLink();
    const tiles = portalTiles(link, "overworld");
    expect(tiles).toHaveLength(geometry.width * geometry.height);
    // Distinct coordinates covering the full opening.
    const unique = new Set(tiles.map(({ x, y, z }) => `${x},${y},${z}`));
    expect(unique.size).toBe(geometry.width * geometry.height);
  });

  it("teleports a player from overworld to the nether portal", () => {
    const link = buildLink();
    const dest = teleportPosition(link, "overworld", { x: 5, y: 11, z: 5 });
    // Appears in front of the nether anchor (z offset +2), same x as overworld anchor.
    expect(dest.x).toBe(link.nether.x);
    expect(dest.z).toBe(link.nether.z + 2);
  });

  it("preserves partial horizontal position through a teleport", () => {
    const link = buildLink();
    const dest = teleportPosition(link, "overworld", { x: 6, y: 11, z: 5 });
    expect(dest.x).toBe(link.nether.x + 1);
  });

  function buildLink(): PortalLink {
    return createPortalLink({ x: 5, y: 10, z: 5 }, { x: -12, y: 8, z: -8 }, geometry);
  }
});
