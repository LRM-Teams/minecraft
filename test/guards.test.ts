import { describe, expect, it } from "vitest";
import { createMob } from "../src/entities";
import { createGuardsForWorld, createIronGuard, updateIronGuards } from "../src/guards";
import { VoxelWorld } from "../src/world";

const villageWorld = (): VoxelWorld => new VoxelWorld(2026, 48);

describe("iron village guards", () => {
  it("spawns one guard at each village plaza", () => {
    const world = villageWorld();
    const guards = createGuardsForWorld(world);
    expect(guards).toHaveLength(world.villages.length);
    expect(guards[0].x).toBe(world.villages[0].plaza.x);
    expect(guards[0].z).toBe(world.villages[0].plaza.z);
  });

  it("chases and damages only a hostile that enters its village warning area", () => {
    const world = villageWorld();
    const guard = createIronGuard(1, world.villages[0], { damage: 3, attackCooldown: 1 });
    const hostile = createMob(1, guard.x + 1, guard.z, { hp: 8, speed: 0 });
    const before = hostile.hp;
    updateIronGuards(world, [guard], [hostile], 0.1);
    expect(guard.state).toBe("chase");
    expect(hostile.hp).toBe(before - 3);
    // A hostile beyond the village alarm radius does not become a target.
    hostile.x = guard.plaza.x + guard.alertRange + 3;
    hostile.z = guard.plaza.z;
    updateIronGuards(world, [guard], [hostile], 1);
    expect(guard.targetId).toBeUndefined();
  });

  it("returns to patrol when its target dies and moves back to the plaza", () => {
    const world = villageWorld();
    const guard = createIronGuard(1, world.villages[0], { returnRange: 2, speed: 3 });
    guard.x += 8;
    const hostile = createMob(1, guard.x + 1, guard.z, { hp: 1 });
    updateIronGuards(world, [guard], [hostile], 0.1);
    expect(hostile.hp).toBe(0);
    hostile.dead = true;
    const start = Math.hypot(guard.x - guard.plaza.x, guard.z - guard.plaza.z);
    updateIronGuards(world, [guard], [hostile], 0.5);
    expect(guard.state).toBe("return");
    expect(Math.hypot(guard.x - guard.plaza.x, guard.z - guard.plaza.z)).toBeLessThan(start);
  });

  it("handles a dead guard without touching mobs or world blocks", () => {
    const world = villageWorld();
    const guard = createIronGuard(1, world.villages[0]);
    const hostile = createMob(1, guard.x + 1, guard.z);
    const blocksBefore = world.snapshot().blocks.length;
    guard.hp = 0;
    updateIronGuards(world, [guard], [hostile], 0.1);
    expect(guard.dead).toBe(true);
    expect(hostile.hp).toBe(hostile.maxHp);
    expect(world.snapshot().blocks.length).toBe(blocksBefore);
  });
});
