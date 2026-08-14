import { describe, expect, it } from "vitest";
import { createMob } from "../src/entities";
import { createGuardiansForWorld, updateGuardians } from "../src/guardians";
import { VoxelWorld } from "../src/world";

const guardedWorld = (): VoxelWorld => {
  const world = new VoxelWorld(4, 14);
  world.blocks.clear();
  for (let x = -14; x <= 14; x += 1) for (let z = -14; z <= 14; z += 1) world.set({ x, y: 4, z }, "grass");
  world.villages.length = 0;
  world.villages.push({
    id: "test-village",
    center: { x: 0, y: 5, z: 0 }, plaza: { x: 0, y: 5, z: 0 }, homes: [],
  });
  return world;
};

describe("village guardians", () => {
  it("spawns one guardian at each village plaza and patrols without a threat", () => {
    const world = guardedWorld();
    const [guardian] = createGuardiansForWorld(world);
    updateGuardians(world, [guardian], [], 0.2);
    expect(Math.hypot(guardian.x, guardian.z)).toBeGreaterThan(0);
    expect(Math.hypot(guardian.x, guardian.z)).toBeLessThan(2.5);
    expect(guardian.state).toBe("patrol");
  });

  it("intercepts hostile mobs but never includes non-mob entities in targeting", () => {
    const world = guardedWorld();
    const [guardian] = createGuardiansForWorld(world);
    const hostile = createMob(99, 1, 0, { hp: 8, speed: 0 });
    updateGuardians(world, [guardian], [hostile], 0.1);
    expect(guardian.state).toBe("chase");
    expect(hostile.hp).toBeLessThan(8);
    expect(guardian.hp).toBe(guardian.maxHp);
  });

  it("returns to its plaza after a target disappears and handles death safely", () => {
    const world = guardedWorld();
    const [guardian] = createGuardiansForWorld(world);
    guardian.x = 6;
    guardian.z = 0;
    updateGuardians(world, [guardian], [], 1);
    expect(guardian.state).toBe("return");
    expect(guardian.x).toBeLessThan(6);
    guardian.hp = 0;
    updateGuardians(world, [guardian], [], 0.1);
    expect(guardian.dead).toBe(true);
    expect(guardian.state).toBe("dead");
  });
});
