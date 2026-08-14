import { describe, expect, it } from "vitest";
import { VoxelWorld } from "../src/world";
import { createMob, type Mob } from "../src/entities";
import { createRaid, updateRaid, shouldStartRaid, raidProgress } from "../src/raids";

/** A real deterministic world guaranteed to contain a village for this seed/size. */
const worldWithVillage = (): VoxelWorld => {
  let world: VoxelWorld | undefined;
  for (let seed = 1; seed <= 500 && !world; seed += 1) {
    const candidate = new VoxelWorld(seed, 48);
    if (candidate.villages.length) { world = candidate; break; }
  }
  if (!world) throw new Error("no seed produced a village for the test");
  return world;
};

describe("raids", () => {
  it("creates a raid that targets a village and starts dormant", () => {
    const world = worldWithVillage();
    const raid = createRaid(1, world.villages[0]);
    expect(raid.village.id).toBe(world.villages[0].id);
    expect(raid.wave).toBe(1);
    expect(raid.active).toBe(true);
    expect(raid.defeated).toBe(false);
    expect(raid.raidersToSpawn).toBeGreaterThan(0);
  });

  it("shouldStartRaid only at night, when no active raid is draining the village", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    // Night + a village + nothing active → start.
    expect(shouldStartRaid([village], [], true)).toBe(true);
    // Day → never.
    expect(shouldStartRaid([village], [], false)).toBe(false);
    // No village → never.
    expect(shouldStartRaid([], [], true)).toBe(false);
    // An active undefeated raid → don't stack a second one.
    const active = createRaid(1, village);
    expect(shouldStartRaid([village], [active], true)).toBe(false);
  });

  it("spawns raider Mobs at the village edge with unique ids", () => {
    const world = worldWithVillage();
    const raid = createRaid(1, world.villages[0], { waveSize: 4, waveCount: 1, spawnIntervalSec: 0, resupplySec: 10 });
    const mobs: Mob[] = [createMob(1, 5, 2, { kind: "stalker" })];
    // Run long enough for the whole wave to spawn.
    for (let step = 0; step < 60; step += 1) updateRaid(raid, world, mobs, 0.1);
    const raiderIds = new Set(raid.raiderIds);
    expect(raid.raiderIds.length).toBe(4);
    expect(raiderIds.size).toBe(4); // all distinct
    // Belonging to the raid, distinct from the pre-existing stalker id (1).
    expect(raid.raiderIds).not.toContain(1);
    const raider = mobs.find((m) => m.id === raid.raiderIds[0]);
    expect(raider?.kind).toBe("raider");
  });

  it("marks the raid defeated once all waves are spawned and every raider is down", () => {
    const world = worldWithVillage();
    const raid = createRaid(1, world.villages[0], { waveSize: 2, waveCount: 2, spawnIntervalSec: 0, resupplySec: 0.2 });
    const mobs: Mob[] = [];
    let frames = 0;
    for (let step = 0; step < 4000 && !raid.defeated; step += 1) {
      updateRaid(raid, world, mobs, 0.05);
      // Simulate the player / guard / villagers beating every living raider.
      for (const mob of mobs) if (mob.kind === "raider" && !mob.dead) mob.dead = true;
      frames += 1;
    }
    expect(raid.defeated).toBe(true);
    expect(raid.active).toBe(false);
    expect(frames).toBeLessThan(4000);
    // Every wave was actually spawned (2 waves × 2 raiders plus any overshoot bounded).
    expect(raid.spawned).toBeGreaterThanOrEqual(4);
  });

  it("a defeated raid lets a fresh raid start, and HUD text reflects progress", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const active = createRaid(2, village);
    expect(raidProgress(active)).toContain("第 1/3 波");
    active.defeated = true;
    active.active = false;
    expect(raidProgress(active)).toContain("击退");
    // A defeated raid no longer blocks a new raid.
    expect(shouldStartRaid([village], [active], true)).toBe(true);
  });

  it("never mutates world data while running a raid", () => {
    const world = worldWithVillage();
    const before = world.snapshot().blocks.length;
    const raid = createRaid(3, world.villages[0], { waveSize: 2, waveCount: 1, spawnIntervalSec: 0, resupplySec: 10 });
    const mobs: Mob[] = [];
    for (let step = 0; step < 200; step += 1) updateRaid(raid, world, mobs, 0.05);
    expect(world.snapshot().blocks.length).toBe(before);
  });
});
