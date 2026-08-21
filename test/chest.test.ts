import { describe, expect, it } from "vitest";
import { matchRecipe, emptyGrid } from "../src/crafting";
import {
  CHEST_SIZE,
  drainChestContents,
  emptyChestSlots,
  ensureChest,
  restoreChests,
  snapshotChests,
} from "../src/chests";
import { clickInvSlot, emptyPlayerSlots, linkInventory } from "../src/inventory";
import { createStations, openChestAt, handleChestClick } from "../src/stations";

describe("LRM-1601 chest", () => {
  it("crafts from 8 planks on a 3×3 table", () => {
    const grid = emptyGrid(3);
    const pattern = [
      "planks", "planks", "planks",
      "planks", null, "planks",
      "planks", "planks", "planks",
    ] as const;
    pattern.forEach((item, i) => {
      grid[i] = item ? { item, count: 1 } : null;
    });
    const recipe = matchRecipe(grid);
    expect(recipe?.id).toBe("chest");
    expect(recipe?.result).toEqual({ item: "chest", count: 1 });
  });

  it("round-trips chest contents through save", () => {
    const map = new Map();
    const slots = ensureChest(map, "1,2,3");
    slots[0] = { item: "dirt", count: 12 };
    slots[5] = { item: "coal", count: 3 };
    const saved = snapshotChests(map);
    const restored = restoreChests(saved);
    expect(restored.get("1,2,3")?.[0]).toEqual({ item: "dirt", count: 12 });
    expect(restored.get("1,2,3")?.[5]).toEqual({ item: "coal", count: 3 });
    expect(restored.get("1,2,3")).toHaveLength(CHEST_SIZE);
  });

  it("moves items between chest and player bag via cursor clicks", () => {
    const stations = createStations();
    const playerSlots = emptyPlayerSlots();
    playerSlots[0] = { item: "stone", count: 8 };
    const inventory = linkInventory(playerSlots);
    openChestAt(stations, inventory, "0,1,0");
    stations.craftCursor = clickInvSlot(playerSlots, null, 0, "left");
    expect(stations.craftCursor).toEqual({ item: "stone", count: 8 });
    const chest = ensureChest(stations.chests, "0,1,0");
    stations.craftCursor = clickInvSlot(chest, stations.craftCursor, 0, "left");
    expect(chest[0]).toEqual({ item: "stone", count: 8 });
    expect(stations.craftCursor).toBeNull();
    const chestBtn = {
      closest: (sel: string) => (sel.includes("chest-slot")
        ? { dataset: { chestSlot: "0" } }
        : null),
    } as unknown as HTMLElement;
    expect(handleChestClick(stations, inventory, playerSlots, chestBtn, "left")).toBe(true);
  });

  it("drains contents on break", () => {
    const map = new Map();
    const slots = emptyChestSlots();
    slots[1] = { item: "iron_ingot", count: 4 };
    map.set("4,5,6", slots);
    const drops = drainChestContents(map, "4,5,6");
    expect(drops).toEqual([{ item: "iron_ingot", count: 4 }]);
    expect(map.has("4,5,6")).toBe(false);
  });

  it("mines faster with an axe (wiki wood-family)", async () => {
    const { breakDuration } = await import("../src/mining");
    const bare = breakDuration("chest", null);
    const axe = breakDuration("chest", "wooden_axe");
    expect(axe).toBeLessThan(bare);
  });
});
