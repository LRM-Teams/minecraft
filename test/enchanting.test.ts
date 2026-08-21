import { describe, expect, it } from "vitest";
import { createInventory } from "../src/inventory";
import { emptyGrid, matchRecipe } from "../src/crafting";
import {
  MOB_KILL_XP,
  addExperience,
  applyProtectionReduction,
  canTakeOffer,
  countBookshelfPower,
  createEnchantSaveState,
  createEnchantTable,
  createExperience,
  depositEnchantInput,
  depositLapis,
  efficiencyMultiplier,
  formatEnchantments,
  isEnchantable,
  lapisDropCount,
  miningXpFor,
  mitigateWithProtection,
  refreshOffers,
  sharpnessBonus,
  snapshotEnchant,
  spendLevels,
  takeOffer,
  xpBarCapacity,
} from "../src/enchanting";

describe("enchanting recipes (grid)", () => {
  it("crafts paper from three sugar cane", () => {
    const grid = emptyGrid(3);
    grid[0] = "sugar_cane";
    grid[1] = "sugar_cane";
    grid[2] = "sugar_cane";
    expect(matchRecipe(grid)?.result).toEqual({ item: "paper", count: 3 });
  });

  it("crafts a book from paper + leather (shapeless)", () => {
    const grid = emptyGrid(2);
    grid[0] = "paper";
    grid[1] = "paper";
    grid[2] = "paper";
    grid[3] = "leather";
    expect(matchRecipe(grid)?.result).toEqual({ item: "book", count: 1 });
  });

  it("crafts an enchanting table from book, diamonds and obsidian", () => {
    const grid = emptyGrid(3);
    grid[1] = "book";
    grid[3] = "diamond";
    grid[4] = "obsidian";
    grid[5] = "diamond";
    grid[6] = "obsidian";
    grid[7] = "obsidian";
    grid[8] = "obsidian";
    expect(matchRecipe(grid)?.result.item).toBe("enchanting_table");
  });

  it("crafts a bookshelf from planks and books", () => {
    const grid = emptyGrid(3);
    for (let i = 0; i < 3; i += 1) grid[i] = "planks";
    for (let i = 3; i < 6; i += 1) grid[i] = "book";
    for (let i = 6; i < 9; i += 1) grid[i] = "planks";
    expect(matchRecipe(grid)?.result).toEqual({ item: "bookshelf", count: 1 });
  });
});

describe("experience", () => {
  it("uses vanilla-ish bar capacities and levels up", () => {
    expect(xpBarCapacity(0)).toBe(7);
    expect(xpBarCapacity(16)).toBe(42);
    const xp = createExperience();
    expect(addExperience(xp, 7)).toBe(true);
    expect(xp.level).toBe(1);
    expect(xp.xp).toBe(0);
  });

  it("spends whole levels for the table", () => {
    const xp = createExperience({ level: 5, xp: 3 });
    expect(spendLevels(xp, 3)).toBe(true);
    expect(xp.level).toBe(2);
    expect(xp.xp).toBe(0);
    expect(spendLevels(xp, 5)).toBe(false);
  });
});

describe("enchant table offers", () => {
  it("only accepts swords, pickaxes, and armor", () => {
    expect(isEnchantable("iron_sword")).toBe(true);
    expect(isEnchantable("diamond_pickaxe")).toBe(true);
    expect(isEnchantable("iron_chestplate")).toBe(true);
    expect(isEnchantable("stick")).toBe(false);
  });

  it("consumes lapis + levels and produces identifiable gear", () => {
    const inventory = createInventory({
      iron_sword: 1,
      lapis_lazuli: 5,
    });
    const table = createEnchantTable(42);
    const xp = createExperience({ level: 10, xp: 0 });
    const gear: NonNullable<ReturnType<typeof takeOffer>>[] = [];
    expect(depositEnchantInput(table, inventory, "iron_sword")).toBe(true);
    expect(inventory.iron_sword).toBe(0);
    expect(depositLapis(table, inventory, 3)).toBe(true);
    const offers = refreshOffers(table, xp, 15);
    expect(offers).toHaveLength(3);
    expect(offers[0]?.enchantment.id).toBe("sharpness");
    expect(canTakeOffer(table, xp, offers[1]!)).toBe(true);
    const result = takeOffer(table, xp, gear, offers[1]!);
    expect(result).toBeDefined();
    expect(result!.item).toBe("iron_sword");
    expect(result!.enchantments[0]?.id).toBe("sharpness");
    expect(result!.enchantments[0]?.level).toBeGreaterThanOrEqual(1);
    expect(xp.level).toBe(10 - offers[1]!.levelCost);
    expect(table.lapis).toBe(3 - offers[1]!.lapisCost);
    expect(gear).toHaveLength(1);
    expect(formatEnchantments(result!.enchantments)).toContain("锋利");
  });

  it("applies sharpness / efficiency / protection across sword, pickaxe, and armor", () => {
    const inventory = createInventory({
      iron_sword: 1,
      iron_pickaxe: 1,
      iron_helmet: 1,
      lapis_lazuli: 9,
    });
    const experience = createExperience({ level: 10, xp: 0 });
    const ids: string[] = [];
    for (const item of ["iron_sword", "iron_pickaxe", "iron_helmet"] as const) {
      const table = createEnchantTable(42 + item.length);
      expect(depositEnchantInput(table, inventory, item)).toBe(true);
      expect(depositLapis(table, inventory, 3)).toBe(true);
      const offers = refreshOffers(table, experience, 15);
      const bag: NonNullable<ReturnType<typeof takeOffer>>[] = [];
      const enchanted = takeOffer(table, experience, bag, offers[0]!);
      expect(enchanted).toBeDefined();
      ids.push(enchanted!.enchantments[0]!.id);
    }
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain("sharpness");
    expect(ids).toContain("efficiency");
    expect(ids).toContain("protection");
  });

  it("persists experience and gear through save snapshots", () => {
    const state = createEnchantSaveState({
      experience: { level: 4, xp: 2 },
      gear: [{ uid: "a", item: "iron_pickaxe", enchantments: [{ id: "efficiency", level: 3 }] }],
      equippedToolUid: "a",
      armorEnchants: { chestplate: [{ id: "protection", level: 2 }] },
    });
    const snap = snapshotEnchant(state);
    const restored = createEnchantSaveState(snap);
    expect(restored.experience.level).toBe(4);
    expect(restored.gear[0]?.enchantments[0]).toEqual({ id: "efficiency", level: 3 });
    expect(restored.armorEnchants.chestplate[0]?.level).toBe(2);
  });
});

describe("enchantment effects", () => {
  it("sharpness increases damage, efficiency speeds mining, protection mitigates", () => {
    expect(sharpnessBonus([{ id: "sharpness", level: 2 }])).toBe(3);
    expect(efficiencyMultiplier([{ id: "efficiency", level: 2 }])).toBe(5);
    expect(applyProtectionReduction(10, [{ id: "protection", level: 5 }])).toBeLessThan(10);
    expect(
      mitigateWithProtection(
        { helmet: [], chestplate: [{ id: "protection", level: 4 }], leggings: [], boots: [] },
        10,
      ),
    ).toBeLessThan(10);
  });

  it("awards mining/combat XP and drops lapis in vanilla range", () => {
    expect(miningXpFor("diamond_ore")).toBe(5);
    expect(miningXpFor("lapis_ore")).toBe(3);
    expect(MOB_KILL_XP).toBe(5);
    const drops = lapisDropCount(1, 2, 3, 4);
    expect(drops).toBeGreaterThanOrEqual(4);
    expect(drops).toBeLessThanOrEqual(9);
  });

  it("counts surrounding bookshelves up to 15", () => {
    const blocks = new Map<string, string>();
    const put = (x: number, y: number, z: number, type: string) => blocks.set(`${x},${y},${z}`, type);
    // Place bookshelves on the vanilla ring with air gaps toward the table.
    for (const [dx, dz] of [
      [-2, -1], [-2, 0], [-2, 1],
      [2, -1], [2, 0], [2, 1],
      [-1, -2], [0, -2], [1, -2],
      [-1, 2], [0, 2], [1, 2],
    ]) {
      put(dx, 0, dz, "bookshelf");
    }
    const get = (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`);
    expect(countBookshelfPower(get, { x: 0, y: 0, z: 0 })).toBe(12);
  });
});
