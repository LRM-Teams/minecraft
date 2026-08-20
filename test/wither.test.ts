import { describe, expect, it } from "vitest";
import { VoxelWorld } from "../src/world";
import {
  isWitherStructure,
  placeWitherRitual,
  summonWither,
  updateWither,
  witherDropBlocks,
  isEnraged,
  WITHER_LOOT_BLOCKS,
  type WitherBoss,
  type WitherOptions,
} from "../src/wither";
import { createMob } from "../src/entities";

/** A small flat-grass world with a known surface so tests are deterministic. */
function flatWorld(size = 10, seed = 1): VoxelWorld {
  const world = new VoxelWorld(seed, size);
  world.blocks.clear();
  for (let x = -size; x <= size; x += 1) {
    for (let z = -size; z <= size; z += 1) {
      world.set({ x, y: 3, z }, "stone");
      world.set({ x, y: 4, z }, "grass");
    }
  }
  return world;
}

const CENTER = { x: 0, y: 4, z: 0 };
const player = { x: 0, y: 5, z: 0 };

/** Small, fast Wither options so tests converge quickly. */
function quickOpts(overrides: WitherOptions = {}): WitherOptions {
  return { aggroRange: 20, speed: 3, skullCooldown: 0.3, summonCooldown: 0.4, hp: 30, ...overrides };
}

describe("Wither constructible summon", () => {
  it("detects the ritual only when every soul-sand block and skull head is placed", () => {
    const world = flatWorld();
    expect(isWitherStructure(world, CENTER)).toBe(false);
    placeWitherRitual(world, CENTER);
    expect(isWitherStructure(world, CENTER)).toBe(true);
    // Breaking any sand leaves the shape incomplete.
    world.remove({ x: 1, y: 4, z: 0 });
    expect(isWitherStructure(world, CENTER)).toBe(false);
  });

  it("consumes the ritual blocks when the Wither is summoned", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    const before = world.snapshot().blocks.length;
    const result = summonWither(1, world, CENTER, quickOpts());
    expect(result).toBeDefined();
    // 5 soul-sand + 1 skull head were consumed.
    expect(world.snapshot().blocks.length).toBe(before - 6);
    expect(result!.consumed).toHaveLength(6);
  });

  it("refuses to summon when the ritual is incomplete", () => {
    const world = flatWorld();
    expect(summonWither(1, world, CENTER, quickOpts())).toBeUndefined();
    expect(world.snapshot().blocks.length).toBe(flatWorld().snapshot().blocks.length);
  });

  it("keeps the overworld save schema unchanged (no new block ids)", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    for (const block of world.blocks.values()) {
      expect(["sand", "stone", "grass", "dirt", "water"]).toContain(block);
    }
  });
});

describe("Wither state machine", () => {
  it("wakes from dormant spawn-in grace into combat", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    const { boss } = summonWither(1, world, CENTER, quickOpts())!;
    expect(boss.phase).toBe("dormant");
    const result = updateWither(world, boss, [], player, 1.2);
    expect(boss.phase).toBe("combat");
    expect(result.killed).toBe(false);
  });

  it("hovers above the terrain rather than standing on it", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    const { boss } = summonWither(1, world, CENTER, quickOpts({ hoverHeight: 3 }))!;
    const startY = boss.y;
    for (let i = 0; i < 80; i += 1) updateWither(world, boss, [], player, 0.05);
    // Consuming the ritual drops the origin column to stone at y=3, so the
    // hover target is 3 + 3 = 6.
    expect(boss.y).toBeCloseTo(6, 1);
    expect(boss.y).toBeGreaterThan(startY);
  });

  it("fires skull projectiles on a cadence while in combat", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    const { boss } = summonWither(1, world, CENTER, quickOpts({ skullCooldown: 0.5 }))!;
    updateWither(world, boss, [], player, 1.2); // wake
    // Stand far enough away that the homing skull stays in flight.
    const farPlayer = { x: 0, y: 8, z: 14 };
    let fired = 0;
    for (let i = 0; i < 30; i += 1) {
      const frame = updateWither(world, boss, [], farPlayer, 0.05);
      fired += frame.skullsFired;
    }
    expect(fired).toBeGreaterThan(0);
    expect(boss.projectiles.length).toBeGreaterThan(0);
  });

  it("summons skeleton minions into the shared mob list", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    const { boss } = summonWither(1, world, CENTER, quickOpts({ summonCooldown: 0.3, maxMinions: 2 }))!;
    const mobs: import("../src/entities").Mob[] = [];
    updateWither(world, boss, mobs, player, 1.2); // wake
    for (let i = 0; i < 30; i += 1) updateWither(world, boss, mobs, player, 0.05);
    expect(boss.minionIds.length).toBeGreaterThan(0);
    expect(mobs.length).toBe(boss.minionIds.length);
  });

  it("enters the enraged dying phase below the hp threshold", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    const { boss } = summonWither(1, world, CENTER, quickOpts({ hp: 100, enrageThreshold: 0.5 }))!;
    updateWither(world, boss, [], player, 1.2); // wake into combat
    boss.health = 40; // 40% < 50% threshold
    const frame = updateWither(world, boss, [], player, 0.016);
    expect(boss.phase).toBe("dying");
    expect(frame.killed).toBe(false);
  });

  it("grants the kill signal and stops on defeat", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    const { boss } = summonWither(1, world, CENTER, quickOpts({ hp: 10 }))!;
    updateWither(world, boss, [], player, 1.2); // wake
    boss.health = 0;
    const frame = updateWither(world, boss, [], player, 0.016);
    expect(frame.killed).toBe(true);
    expect(boss.defeated).toBe(true);
    expect(boss.phase).toBe("defeated");
    // Later frames are inert.
    expect(updateWither(world, boss, [], player, 0.5).killed).toBe(false);
  });
});

describe("Wither loot", () => {
  it("drops a unique loot table with original blocks plus the Nether Star", () => {
    const drops = witherDropBlocks();
    expect(drops).toEqual(WITHER_LOOT_BLOCKS);
    expect(drops.length).toBeGreaterThan(0);
  });

  it("isEnraged mirrors the dying phase", () => {
    const world = flatWorld();
    placeWitherRitual(world, CENTER);
    const { boss } = summonWither(1, world, CENTER, quickOpts({ hp: 10, enrageThreshold: 0.5 }))!;
    updateWither(world, boss, [], player, 1.2);
    boss.health = 4;
    // Force through dormant grace so the phase transition can apply.
    boss.phase = "combat";
    updateWither(world, boss, [], player, 0.016);
    expect(boss.phase).toBe("dying");
    expect(isEnraged(boss)).toBe(true);
  });
});
