import { describe, expect, it } from "vitest";
import {
  addExperience,
  applyProtectionReduction,
  canTakeOffer,
  createEnchantTable,
  createExperience,
  depositEnchantInput,
  depositLapis,
  efficiencyMultiplier,
  formatEnchantments,
  miningXpFor,
  refreshOffers,
  sharpnessBonus,
  snapshotEnchant,
  createEnchantSaveState,
  takeOffer,
  xpBarCapacity,
} from "../src/enchanting";
import { emptyGrid, matchRecipe } from "../src/crafting";
import { createInventory } from "../src/inventory";

describe("enchanting recipes (grid)", () => {
  it("crafts paper from three sugar cane", () => {
    const grid = emptyGrid(3);
    grid[0] = "sugar_cane";
    grid[1] = "sugar_cane";
    grid[2] = "sugar_cane";
    expect(matchRecipe(grid)?.result).toEqual({ item: "paper", count: 3 });
  });

  it("crafts a book from three paper + leather (shapeless)", () => {
    const grid = emptyGrid(2);
    grid[0] = "paper";
    grid[1] = "paper";
    grid[2] = "paper";
    grid[3] = "leather";
    expect(matchRecipe(grid)?.result).toEqual({ item: "book", count: 1 });
  });

  it("crafts an enchanting table from book, diamonds, and obsidian", () => {
    const grid = emptyGrid(3);
    grid[1] = "book";
    grid[3] = "diamond";
    grid[4] = "obsidian";
    grid[5] = "diamond";
    grid[6] = "obsidian";
    grid[7] = "obsidian";
    grid[8] = "obsidian";
    expect(matchRecipe(grid)?.result).toEqual({ item: "enchanting_table", count: 1 });
  });

  it("crafts a bookshelf from planks and books", () => {
    const grid = emptyGrid(3);
    for (let i = 0; i < 3; i += 1) grid[i] = "planks";
    for (let i = 3; i < 6; i += 1) grid[i] = "book";
    for (let i = 6; i < 9; i += 1) grid[i] = "planks";
    expect(matchRecipe(grid)?.result).toEqual({ item: "bookshelf", count: 1 });
  });
});

describe("experience and effects", () => {
  it("uses vanilla-ish XP bar capacities and levels up", () => {
    expect(xpBarCapacity(0)).toBe(7);
    expect(xpBarCapacity(16)).toBe(42);
    const xp = createExperience();
    expect(addExperience(xp, 7)).toBe(true);
    expect(xp.level).toBe(1);
    expect(xp.xp).toBe(0);
  });

  it("applies sharpness / protection / efficiency bonuses", () => {
    expect(sharpnessBonus([{ id: "sharpness", level: 2 }])).toBe(3);
    expect(applyProtectionReduction(10, [{ id: "protection", level: 4 }])).toBeLessThan(10);
    expect(efficiencyMultiplier([{ id: "efficiency", level: 3 }])).toBe(10);
  });

  it("awards mining XP for ores including lapis", () => {
    expect(miningXpFor("lapis_ore")).toBeGreaterThan(0);
    expect(miningXpFor("diamond_ore")).toBeGreaterThan(miningXpFor("coal_ore"));
  });
});

describe("enchanting table session", () => {
  it("consumes levels + lapis and produces identifiable enchanted gear", () => {
    const inventory = createInventory({
      iron_sword: 1,
      iron_pickaxe: 1,
      iron_helmet: 1,
      lapis_lazuli: 9,
    });
    const experience = createExperience({ level: 10, xp: 0 });
    const gear: ReturnType<typeof takeOffer>[] = [];
    const results: string[] = [];

    for (const item of ["iron_sword", "iron_pickaxe", "iron_helmet"] as const) {
      const table = createEnchantTable(42 + item.length);
      expect(depositEnchantInput(table, inventory, item)).toBe(true);
      expect(depositLapis(table, inventory, 3)).toBe(true);
      const offers = refreshOffers(table, experience, 15);
      expect(offers.length).toBe(3);
      const offer = offers[0]!;
      expect(canTakeOffer(table, experience, offer)).toBe(true);
      const bag: NonNullable<ReturnType<typeof takeOffer>>[] = [];
      const enchanted = takeOffer(table, experience, bag, offer);
      expect(enchanted).toBeDefined();
      expect(enchanted!.enchantments.length).toBeGreaterThan(0);
      results.push(enchanted!.enchantments[0]!.id);
      gear.push(enchanted);
      expect(formatEnchantments(enchanted!.enchantments).length).toBeGreaterThan(0);
    }

    expect(new Set(results).size).toBe(3);
    expect(results).toContain("sharpness");
    expect(results).toContain("efficiency");
    expect(results).toContain("protection");
    expect(inventory.iron_sword).toBe(0);
    expect(inventory.lapis_lazuli).toBeLessThan(9);
  });

  it("round-trips experience and gear through save snapshot", () => {
    const state = createEnchantSaveState({
      experience: { level: 4, xp: 3 },
      gear: [{ uid: "a", item: "iron_sword", enchantments: [{ id: "sharpness", level: 2 }] }],
      equippedToolUid: "a",
      armorEnchants: { helmet: [{ id: "protection", level: 1 }] },
    });
    const snap = snapshotEnchant(state);
    const restored = createEnchantSaveState(snap);
    expect(restored.experience.level).toBe(4);
    expect(restored.gear[0]?.enchantments[0]).toEqual({ id: "sharpness", level: 2 });
    expect(restored.armorEnchants.helmet[0]?.id).toBe("protection");
    expect(restored.equippedToolUid).toBe("a");
  });
});
