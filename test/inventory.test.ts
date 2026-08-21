import { describe, expect, it } from "vitest";
import {
  addToSlots,
  clickInvSlot,
  countsFromSlots,
  createInventory,
  createStarterSlots,
  craftBricks,
  craftGlass,
  craftPlanks,
  HOTBAR_START,
  linkInventory,
  PLAYER_INV_SIZE,
  restorePlayerSlots,
  snapshotSlots,
  takeHotbarDrop,
} from "../src/inventory";
import {
  createDroppedItem,
  restoreDrops,
  snapshotDrops,
  tickDrops,
  tryPickupDrops,
} from "../src/drops";

describe("crafting shortcuts", () => {
  it("turns one collected log into four planks", () => {
    const inventory = createInventory({ wood: 1 });
    expect(craftPlanks(inventory)).toBe(true);
    expect(inventory.wood).toBe(0);
    expect(inventory.planks).toBe(4);
  });

  it("does not craft without a log", () => {
    expect(craftPlanks(createInventory())).toBe(false);
  });

  it("turns four stone into four bricks", () => {
    const inventory = createInventory({ stone: 4 });
    expect(craftBricks(inventory)).toBe(true);
    expect(inventory.stone).toBe(0);
    expect(inventory.bricks).toBe(4);
  });

  it("refuses glass hotkey — glass is furnace-only", () => {
    const inventory = createInventory({ sand: 4 });
    expect(craftGlass(inventory)).toBe(false);
    expect(inventory.sand).toBe(4);
    expect(inventory.glass).toBe(0);
  });

  it("does not consume materials for unavailable brick recipes", () => {
    const inventory = createInventory({ stone: 3 });
    expect(craftBricks(inventory)).toBe(false);
    expect(inventory.stone).toBe(3);
  });

  it("accepts collected mineral ores into the shared drop inventory", () => {
    const inventory = createInventory({ coal_ore: 4, diamond_ore: 1 });
    expect(inventory.coal_ore).toBe(4);
    expect(inventory.diamond_ore).toBe(1);
    expect(inventory.iron_ore).toBe(0);
    expect(createInventory().coal_ore).toBe(0);
    expect(createInventory().iron_ingot).toBe(0);
  });
});

describe("player inventory slots", () => {
  it("creates 36 starter slots with hotbar placeables", () => {
    const slots = createStarterSlots();
    expect(slots).toHaveLength(PLAYER_INV_SIZE);
    expect(slots[HOTBAR_START]?.item).toBe("grass");
    expect((slots[HOTBAR_START]?.count ?? 0) > 0).toBe(true);
  });

  it("links count-map mutations back into slots", () => {
    const slots = createStarterSlots();
    const inventory = linkInventory(slots);
    const before = inventory.dirt;
    inventory.dirt += 3;
    expect(inventory.dirt).toBe(before + 3);
    expect(countsFromSlots(slots).dirt).toBe(before + 3);
  });

  it("supports drag-style left-click swap between slots", () => {
    const slots = restorePlayerSlots(undefined, { stone: 8, dirt: 4 });
    const a = slots.findIndex((slot) => slot?.item === "stone");
    const b = slots.findIndex((slot) => slot?.item === "dirt");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    let cursor = clickInvSlot(slots, null, a, "left");
    expect(cursor).toEqual({ item: "stone", count: 8 });
    cursor = clickInvSlot(slots, cursor, b, "left");
    expect(cursor).toEqual({ item: "dirt", count: 4 });
    cursor = clickInvSlot(slots, cursor, a, "left");
    expect(cursor).toBeNull();
    expect(slots[a]?.item).toBe("dirt");
    expect(slots[b]?.item).toBe("stone");
  });

  it("Q-style hotbar drop removes one item", () => {
    const slots = createStarterSlots();
    const item = slots[HOTBAR_START]!.item;
    const before = slots[HOTBAR_START]!.count;
    const dropped = takeHotbarDrop(slots, 0, false);
    expect(dropped).toEqual({ item, count: 1 });
    expect(slots[HOTBAR_START]?.count ?? 0).toBe(before - 1);
  });

  it("round-trips slot snapshots for saves", () => {
    const slots = createStarterSlots();
    slots[3] = { item: "diamond", count: 2 };
    const restored = restorePlayerSlots(snapshotSlots(slots), undefined);
    expect(restored[3]).toEqual({ item: "diamond", count: 2 });
    expect(restored[HOTBAR_START]?.item).toBe(slots[HOTBAR_START]?.item);
  });
});

describe("world drops", () => {
  it("spawns, settles, and auto-picks into empty slots", () => {
    const slots = restorePlayerSlots([], {});
    const drops = [
      createDroppedItem({ item: "iron_ingot", count: 3 }, { x: 0, y: 5, z: 0 }, { pickupDelay: 0 }),
    ];
    tickDrops(drops, 1, () => 2);
    expect(drops[0]!.y).toBeCloseTo(2.25, 5);
    const picked = tryPickupDrops(drops, slots, { x: 0, y: 3, z: 0 }, 2);
    expect(picked).toEqual([{ item: "iron_ingot", count: 3 }]);
    expect(drops).toHaveLength(0);
    expect(addToSlots(slots, "iron_ingot", 0)).toBe(0);
    expect(countsFromSlots(slots).iron_ingot).toBe(3);
  });

  it("persists drop entities across save restore", () => {
    const drops = [
      createDroppedItem({ item: "apple", count: 1 }, { x: 1, y: 2, z: 3 }, { id: 42, pickupDelay: 0.2 }),
    ];
    const restored = restoreDrops(snapshotDrops(drops));
    expect(restored[0]?.item).toBe("apple");
    expect(restored[0]?.id).toBe(42);
    expect(restored[0]?.x).toBe(1);
  });
});
