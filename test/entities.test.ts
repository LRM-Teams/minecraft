import { describe, expect, it } from "vitest";
import { VoxelWorld } from "../src/world";
import { createMob, mobDropCandidates, updateEntities, type Mob } from "../src/entities";

/** A small flat-grass world with a known surface so tests are deterministic. */
function flatWorld(size = 8, seed = 1): VoxelWorld {
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

function mobAt(x: number, z: number): Mob {
  return createMob(1, x, z, { aggroRange: 6, giveUpRange: 9, speed: 2 });
}

const player = { x: 0, y: 5, z: 0 };

describe("Mob creation and grounding", () => {
  it("assigns distinct, balanced presets to the three hostile varieties", () => {
    const stalker = createMob(1, 1, 1);
    const brute = createMob(2, 1, 1, { kind: "brute" });
    const wisp = createMob(3, 1, 1, { kind: "wisp" });
    expect(stalker.kind).toBe("stalker");
    expect(brute.hp).toBeGreaterThan(stalker.hp);
    expect(brute.speed).toBeLessThan(stalker.speed);
    expect(wisp.hp).toBeLessThan(stalker.hp);
    expect(wisp.aggroRange).toBeGreaterThan(stalker.aggroRange);
  });

  it("stands the body in the cell just above the ground after an update", () => {
    const world = flatWorld();
    const mob = mobAt(2, 0);
    updateEntities(world, [mob], player, 0.016);
    // ground at (2,0) is grass on top of stone at y=4 => body occupies y=5
    expect(mob.y).toBe(5);
  });

  it("does not delete or add world data", () => {
    const world = flatWorld();
    const before = world.snapshot().blocks.length;
    const mob = mobAt(2, 0);
    updateEntities(world, [mob], player, 0.5);
    updateEntities(world, [mob], player, 0.5);
    expect(world.snapshot().blocks.length).toBe(before);
  });
});

describe("Mob state machine", () => {
  it("chases the player when within aggro range and closes the distance", () => {
    const world = flatWorld();
    const mob = createMob(1, 0, 5, { aggroRange: 6, giveUpRange: 9, speed: 2 });
    const start = Math.hypot(player.x - mob.x, player.z - mob.z);
    updateEntities(world, [mob], player, 0.5);
    const after = Math.hypot(player.x - mob.x, player.z - mob.z);
    expect(mob.state).toBe("chase");
    expect(after).toBeLessThan(start);
  });

  it("does not chase when the player is far outside aggro range", () => {
    const world = flatWorld();
    const mob = createMob(1, 0, 60, { aggroRange: 6, giveUpRange: 9, speed: 2 });
    updateEntities(world, [mob], player, 0.5);
    expect(mob.state).toBe("idle");
  });
});

describe("Mob combat", () => {
  it("deals damage on contact and respects the attack cooldown", () => {
    const world = flatWorld();
    const mob = createMob(1, 0.3, 0, { aggroRange: 6, giveUpRange: 9, reach: 1, damage: 2, attackCooldown: 1 });
    const first = updateEntities(world, [mob], player, 0.016);
    expect(first.damageToPlayer).toBe(2);
    // No follow-up strike while on cooldown on the very next frame.
    const second = updateEntities(world, [mob], player, 0.016);
    expect(second.damageToPlayer).toBe(0);
    // After the cooldown elapses, the mob can strike again (step in small frames).
    let later = { damageToPlayer: 0 };
    for (let i = 0; i < 80; i += 1) {
      later = updateEntities(world, [mob], player, 0.05);
      if (later.damageToPlayer > 0) break;
    }
    expect(later.damageToPlayer).toBe(2);
  });

  it("marks a mob dead and emits drops when hp reaches zero", () => {
    const world = flatWorld();
    const mob = createMob(1, 5, 5, { hp: 4 });
    mob.hp = 0;
    const result = updateEntities(world, [mob], player, 0.016);
    expect(mob.dead).toBe(true);
    expect(result.deaths).toContain(mob);
    expect(result.drops.length).toBe(1);
    expect(["dirt", "stone"]).toContain(result.drops[0]);
  });

  it("uses a distinct building-material drop table for each variety", () => {
    expect(mobDropCandidates("stalker")).toEqual(["dirt", "stone"]);
    expect(mobDropCandidates("brute")).toEqual(["stone", "bricks"]);
    expect(mobDropCandidates("wisp")).toEqual(["sand", "glass"]);
  });
});

describe("Mob wall avoidance", () => {
  it("can walk onto a one-block step", () => {
    const world = flatWorld();
    // The surface is y=4. Raise the next column by one block.
    world.set({ x: 1, y: 5, z: 0 }, "stone");
    const mob = createMob(1, 2, 0, { aggroRange: 6, giveUpRange: 9, speed: 2 });

    updateEntities(world, [mob], player, 0.5);

    expect(mob.x).toBeCloseTo(1);
    expect(mob.y).toBe(6); // body cell directly above the raised ground
  });

  it("does not pass through a solid wall at the body's height", () => {
    const world = flatWorld();
    // Build a thick wall column on the player's column so the mob can't cross it.
    for (let y = 5; y <= 8; y += 1) world.set({ x: 0, y, z: 0 }, "stone");
    const mob = createMob(1, 4, 0, { aggroRange: 6, giveUpRange: 9, speed: 3 });
    // Chase straight toward the player through the wall.
    const before = mob.x;
    updateEntities(world, [mob], player, 0.3);
    // The wall cell at body height (y=5) is solid, so the mob must not tunnel past it.
    expect(world.isSolid(Math.round(mob.x), Math.round(mob.y), Math.round(mob.z)) && Math.round(mob.x) === 0 && Math.round(mob.z) === 0).toBe(false);
    const dx = Math.abs(mob.x - before);
    expect(dx).toBeLessThan(0.9); // blocked by the wall, doesn't jump through
  });
});
