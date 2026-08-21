import { describe, expect, it } from "vitest";
import {
  applyArmorReduction,
  createArmorState,
  equipArmor,
  formatArmorBar,
  mitigateDamage,
  totalArmorPoints,
  unequipArmor,
} from "../src/armor";
import { emptyGrid, matchRecipe } from "../src/crafting";
import { createInventory } from "../src/inventory";

describe("armor recipes (grid, not hotkeys)", () => {
  it("crafts a leather helmet from five leather", () => {
    const grid = emptyGrid(3);
    grid[0] = "leather";
    grid[1] = "leather";
    grid[2] = "leather";
    grid[3] = "leather";
    grid[5] = "leather";
    expect(matchRecipe(grid)?.result).toEqual({ item: "leather_helmet", count: 1 });
  });

  it("crafts iron chestplate / leggings / boots from iron ingots", () => {
    const chest = emptyGrid(3);
    chest[0] = "iron_ingot";
    chest[2] = "iron_ingot";
    for (let i = 3; i < 9; i += 1) chest[i] = "iron_ingot";
    expect(matchRecipe(chest)?.result.item).toBe("iron_chestplate");

    const legs = emptyGrid(3);
    legs[0] = "iron_ingot";
    legs[1] = "iron_ingot";
    legs[2] = "iron_ingot";
    legs[3] = "iron_ingot";
    legs[5] = "iron_ingot";
    legs[6] = "iron_ingot";
    legs[8] = "iron_ingot";
    expect(matchRecipe(legs)?.result.item).toBe("iron_leggings");

    const boots = emptyGrid(3);
    boots[0] = "iron_ingot";
    boots[2] = "iron_ingot";
    boots[3] = "iron_ingot";
    boots[5] = "iron_ingot";
    expect(matchRecipe(boots)?.result.item).toBe("iron_boots");
  });

  it("rejects raw ore as armor material (needs smelted ingots / leather)", () => {
    const grid = emptyGrid(3);
    grid[0] = "iron_ore";
    grid[1] = "iron_ore";
    grid[2] = "iron_ore";
    grid[3] = "iron_ore";
    grid[5] = "iron_ore";
    expect(matchRecipe(grid)?.result.item).not.toBe("iron_helmet");
  });
});

describe("armor equip and reduction", () => {
  it("equips four slots and sums vanilla leather (7) / iron (15) points", () => {
    const inventory = createInventory({
      leather_helmet: 1,
      leather_chestplate: 1,
      leather_leggings: 1,
      leather_boots: 1,
      iron_helmet: 1,
      iron_chestplate: 1,
      iron_leggings: 1,
      iron_boots: 1,
    });
    const armor = createArmorState();
    expect(equipArmor(armor, inventory, "leather_helmet")).toBe(true);
    expect(equipArmor(armor, inventory, "leather_chestplate")).toBe(true);
    expect(equipArmor(armor, inventory, "leather_leggings")).toBe(true);
    expect(equipArmor(armor, inventory, "leather_boots")).toBe(true);
    expect(totalArmorPoints(armor)).toBe(7);

    expect(equipArmor(armor, inventory, "iron_chestplate")).toBe(true);
    expect(armor.chestplate).toBe("iron_chestplate");
    expect(inventory.leather_chestplate).toBe(1);
    expect(totalArmorPoints(armor)).toBe(10);

    unequipArmor(armor, inventory, "helmet");
    unequipArmor(armor, inventory, "leggings");
    unequipArmor(armor, inventory, "boots");
    expect(equipArmor(armor, inventory, "iron_helmet")).toBe(true);
    expect(equipArmor(armor, inventory, "iron_leggings")).toBe(true);
    expect(equipArmor(armor, inventory, "iron_boots")).toBe(true);
    expect(totalArmorPoints(armor)).toBe(15);
  });

  it("reduces measurable damage with full iron vs bare", () => {
    const bare = createArmorState();
    const iron = createArmorState({
      helmet: "iron_helmet",
      chestplate: "iron_chestplate",
      leggings: "iron_leggings",
      boots: "iron_boots",
    });
    const raw = 8;
    const bareHit = mitigateDamage(bare, raw);
    const ironHit = mitigateDamage(iron, raw);
    expect(bareHit).toBe(8);
    expect(ironHit).toBeLessThan(bareHit);
    expect(ironHit).toBe(applyArmorReduction(raw, 15));
  });

  it("formats a 10-icon armor bar", () => {
    expect([...formatArmorBar(20)].length).toBe(10);
    expect(formatArmorBar(0)).toContain("□");
    expect(formatArmorBar(15)).toContain("■");
  });
});
