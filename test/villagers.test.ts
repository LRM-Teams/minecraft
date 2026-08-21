import { describe, expect, it } from "vitest";
import { VoxelWorld } from "../src/world";
import { createInventory, type Inventory } from "../src/inventory";
import {
  createVillager,
  createVillagersForWorld,
  updateVillagers,
  tradeWithVillager,
  greetNearbyVillagers,
  villagerDrop,
  barterReward,
  PROFESSION_DETAILS,
  tradeSummary,
  type Villager,
} from "../src/villagers";

/** A real deterministic world that is guaranteed to contain a village for this seed/size. */
const worldWithVillage = (): VoxelWorld => {
  let world: VoxelWorld | undefined;
  for (let seed = 1; seed <= 500 && !world; seed += 1) {
    const candidate = new VoxelWorld(seed, 48);
    if (candidate.villages.length) {
      // Eager-fill the logical size so pathing tests have solid ground outside the spawn ring.
      candidate.ensureRadius(0, 0, candidate.size);
      world = candidate;
      break;
    }
  }
  if (!world) throw new Error("no seed produced a village for the test");
  return world;
};

describe("villagers", () => {
  it("spawns one villager per village home, placed at the home entrance", () => {
    const world = worldWithVillage();
    const villagers = createVillagersForWorld(world);
    const totalHomes = world.villages.reduce((sum, v) => sum + v.homes.length, 0);
    expect(villagers.length).toBe(totalHomes);
    expect(totalHomes).toBeGreaterThanOrEqual(3);
    villagers.forEach((v, index) => {
      const home = world.villages[0].homes[index];
      expect(Math.round(v.x)).toBe(home.entrance.x);
      expect(Math.round(v.z)).toBe(home.entrance.z);
      expect(v.state).toBe("wander");
      expect(v.dead).toBe(false);
      expect(PROFESSION_DETAILS[v.profession].offers.length).toBeGreaterThan(0);
    });
  });

  it("spawns no villagers and does not crash for a world without a village", () => {
    const world = new VoxelWorld(72831, 16); // too small for a village site
    expect(world.villages.length).toBe(0);
    expect(createVillagersForWorld(world)).toEqual([]);
  });

  it("keeps wandering villagers near their plaza instead of flying off", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const villager = createVillager(1, village.plaza.x, village.plaza.z, village.homes[0], { x: village.plaza.x, z: village.plaza.z });
    const player = { x: 9999, y: 10, z: 9999 }; // far away, no interaction
    // Simulate a long walk; the villager must stay within the village footprint.
    for (let step = 0; step < 600; step += 1) updateVillagers(world, [villager], player, 0.05);
    const distPlaza = Math.hypot(villager.x - village.plaza.x, villager.z - village.plaza.z);
    expect(distPlaza).toBeLessThan(40);
    expect(villager.dead).toBe(false);
  });

  it("returns toward its home entrance when the player is far and it strays from home", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const home = village.homes[0];
    // Place the villager a good distance across the village, inside world bounds.
    const farX = Math.max(-world.size + 3, Math.min(world.size - 3, village.plaza.x + 18));
    const farZ = Math.max(-world.size + 3, Math.min(world.size - 3, village.plaza.z - 16));
    const villager = createVillager(1, farX, farZ, home, { x: village.plaza.x, z: village.plaza.z });
    const player = { x: 9999, y: 10, z: 9999 };
    const distToEntrance = (v: Villager): number =>
      Math.hypot(v.x - home.entrance.x, v.z - home.entrance.z);
    const start = distToEntrance(villager);
    let sawReturn = false;
    let minAfter = start;
    for (let step = 0; step < 1000; step += 1) {
      updateVillagers(world, [villager], player, 0.1);
      if (villager.state === "returnHome") sawReturn = true;
      minAfter = Math.min(minAfter, distToEntrance(villager));
    }
    expect(sawReturn).toBe(true);
    // The villager should have made clear progress back toward its doorway.
    expect(minAfter).toBeLessThan(start - 4);
  });

  it("switches to interacting state and faces the player when the player is near", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const villager = createVillager(1, village.plaza.x, village.plaza.z, village.homes[0], { x: village.plaza.x, z: village.plaza.z });
    const player = { x: villager.x + 0.5, y: 5, z: villager.z };
    updateVillagers(world, [villager], player, 0.1);
    expect(villager.state).toBe("interacting");
    // It should be facing the player.
    const expected = Math.atan2(player.x - villager.x, player.z - villager.z);
    expect(Math.abs(villager.facing - expected) % (Math.PI * 2)).toBeLessThan(0.02);
  });

  it("returns to its deterministic workstation after the player leaves", () => {
    const world = worldWithVillage();
    const home = world.villages[0].homes[0];
    const villager = createVillager(1, home.entrance.x, home.entrance.z, home, { x: home.entrance.x, z: home.entrance.z });
    updateVillagers(world, [villager], { x: villager.x + 0.3, y: 5, z: villager.z }, 0.1);
    expect(villager.state).toBe("interacting");
    updateVillagers(world, [villager], { x: 9999, y: 5, z: 9999 }, 0.4);
    expect(villager.state).toBe("returnWork");
    expect(Math.hypot(villager.x - home.workstation.x, villager.z - home.workstation.z)).toBeLessThan(3);
  });

  it("greets the player only when it is within interact range", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const villager = createVillager(1, village.plaza.x, village.plaza.z, village.homes[0], { x: village.plaza.x, z: village.plaza.z });
    expect(greetNearbyVillagers([villager], { x: villager.x + 100, y: 5, z: villager.z })).toBeUndefined();
    expect(greetNearbyVillagers([villager], { x: villager.x + 0.3, y: 5, z: villager.z })).toBeDefined();
  });

  it("barters wood for planks into the player inventory", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const villager = createVillager(1, village.plaza.x, village.plaza.z, village.homes[0], { x: village.plaza.x, z: village.plaza.z });
    const inventory: Inventory = createInventory({ wood: 3, planks: 0 });
    const result = tradeWithVillager(villager, "wood", inventory);
    expect(result.ok).toBe(true);
    expect(result.reward).toBe("planks");
    expect(result.message).toContain("交换成功");
    expect(inventory.wood).toBe(2);
    expect(inventory.planks).toBe(1);
  });

  it("uses profession offers and exposes them in a clear trade line", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const mason = createVillager(2, village.plaza.x, village.plaza.z, village.homes[1], { x: village.plaza.x, z: village.plaza.z });
    const inventory: Inventory = createInventory({ stone: 2, wood: 2 });
    expect(mason.profession).toBe("mason");
    expect(tradeSummary(mason)).toContain("stone → bricks");
    expect(tradeWithVillager(mason, "stone", inventory).reward).toBe("bricks");
    expect(tradeWithVillager(mason, "wood", inventory).ok).toBe(false);
  });

  it("rejects a trade when the player lacks the offered block", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const villager = createVillager(1, village.plaza.x, village.plaza.z, village.homes[0], { x: village.plaza.x, z: village.plaza.z });
    const empty: Inventory = createInventory();
    const result = tradeWithVillager(villager, "wood", empty);
    expect(result.ok).toBe(false);
    expect(empty.wood).toBe(0);
  });

  it("rejects an offer the villager has no interest in", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const villager = createVillager(1, village.plaza.x, village.plaza.z, village.homes[0], { x: village.plaza.x, z: village.plaza.z });
    const inventory: Inventory = createInventory({ glass: 5 });
    expect(barterReward("glass")).toBeUndefined();
    const result = tradeWithVillager(villager, "glass", inventory);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("不感兴趣");
    expect(inventory.glass).toBe(5);
  });

  it("enforces a cooldown between trades", () => {
    const world = worldWithVillage();
    const village = world.villages[0];
    const villager = createVillager(1, village.plaza.x, village.plaza.z, village.homes[0], { x: village.plaza.x, z: village.plaza.z });
    const inventory: Inventory = createInventory({ wood: 10 });
    expect(tradeWithVillager(villager, "wood", inventory).ok).toBe(true);
    const second = tradeWithVillager(villager, "wood", inventory);
    expect(second.ok).toBe(false);
    expect(second.message).toContain("正在忙");
    expect(inventory.wood).toBe(9);
  });

  it("drops a valid, collectible block that can enter the inventory", () => {
    const type = villagerDrop();
    expect(["dirt", "stone"]).toContain(type);
    const inventory = createInventory();
    inventory[type] += 1;
    expect(inventory[type]).toBe(1);
  });

  it("coexists with hostile mobs on the same world without touching world data", () => {
    const world = worldWithVillage();
    const snapshotBefore = world.snapshot().blocks.length;
    const villagers = createVillagersForWorld(world);
    const player = { x: world.villages[0].plaza.x, y: 5, z: world.villages[0].plaza.z };
    for (let step = 0; step < 200; step += 1) updateVillagers(world, villagers, player, 0.05);
    // Villager updates never add/remove world blocks.
    expect(world.snapshot().blocks.length).toBe(snapshotBefore);
  });
});
