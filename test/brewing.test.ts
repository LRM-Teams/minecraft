import { describe, expect, it } from "vitest";
import { createInventory } from "../src/inventory";
import { emptyGrid, matchRecipe } from "../src/crafting";
import {
  BREW_DURATION_SEC,
  BREWS_PER_POWDER,
  canStartBrew,
  createBrewingStand,
  createEffects,
  depositBottle,
  depositFuel,
  depositIngredient,
  drinkPotion,
  fillWaterBottle,
  pickPotionToDrink,
  snapshotBrewing,
  tickBrewingStand,
  tickEffects,
} from "../src/brewing";
import {
  createStations,
  openBrewAt,
  renderBrewPanelHtml,
  tickAllBrewingStands,
} from "../src/stations";

describe("brewing recipes (grid)", () => {
  it("crafts a brewing stand from blaze rod over three stone", () => {
    const grid = emptyGrid(3);
    grid[1] = "blaze_rod";
    grid[6] = "stone";
    grid[7] = "stone";
    grid[8] = "stone";
    expect(matchRecipe(grid)?.result).toEqual({ item: "brewing_stand", count: 1 });
  });

  it("crafts three glass bottles from a V of glass", () => {
    const grid = emptyGrid(3);
    grid[0] = "glass";
    grid[2] = "glass";
    grid[4] = "glass";
    expect(matchRecipe(grid)?.result).toEqual({ item: "glass_bottle", count: 3 });
  });

  it("crafts sugar, blaze powder, and glistering melon from materials", () => {
    const sugar = emptyGrid(2);
    sugar[0] = "sugar_cane";
    expect(matchRecipe(sugar)?.result).toEqual({ item: "sugar", count: 1 });

    const powder = emptyGrid(2);
    powder[0] = "blaze_rod";
    expect(matchRecipe(powder)?.result).toEqual({ item: "blaze_powder", count: 2 });

    const melon = emptyGrid(2);
    melon[0] = "gold_ingot";
    melon[1] = "apple";
    expect(matchRecipe(melon)?.result).toEqual({ item: "glistering_melon", count: 1 });
  });
});

describe("brewing stand chain", () => {
  it("fuels with blaze powder and brews water → awkward → healing", () => {
    const inventory = createInventory({
      glass_bottle: 1,
      blaze_powder: 1,
      nether_wart: 1,
      glistering_melon: 1,
    });
    const stand = createBrewingStand();
    expect(fillWaterBottle(inventory)).toBe(true);
    expect(inventory.water_bottle).toBe(1);
    expect(depositFuel(stand, inventory, 1)).toBe(true);
    expect(stand.fuel).toBe(BREWS_PER_POWDER);
    expect(depositBottle(stand, inventory, "water_bottle", 0)).toBe(true);
    expect(depositIngredient(stand, inventory, "nether_wart")).toBe(true);
    expect(canStartBrew(stand)).toBe(true);

    expect(tickBrewingStand(stand, BREW_DURATION_SEC)).toBe(true);
    expect(stand.bottles[0]).toBe("awkward_potion");
    expect(stand.ingredient).toBeNull();
    expect(stand.fuel).toBe(BREWS_PER_POWDER - 1);

    expect(depositIngredient(stand, inventory, "glistering_melon")).toBe(true);
    expect(tickBrewingStand(stand, BREW_DURATION_SEC)).toBe(true);
    expect(stand.bottles[0]).toBe("potion_healing");
  });

  it("brews swiftness and poison from awkward base (all matching bottles per brew)", () => {
    const inventory = createInventory({
      awkward_potion: 2,
      sugar: 1,
      spider_eye: 1,
      blaze_powder: 1,
    });
    const stand = createBrewingStand();
    depositFuel(stand, inventory, 1);
    depositBottle(stand, inventory, "awkward_potion", 0);
    depositBottle(stand, inventory, "awkward_potion", 1);
    depositIngredient(stand, inventory, "sugar");
    tickBrewingStand(stand, BREW_DURATION_SEC);
    // Vanilla-style: one ingredient brew converts every compatible bottle slot.
    expect(stand.bottles[0]).toBe("potion_swiftness");
    expect(stand.bottles[1]).toBe("potion_swiftness");

    // Brew poison on a fresh awkward bottle in an empty slot.
    inventory.awkward_potion = (inventory.awkward_potion ?? 0) + 1;
    depositBottle(stand, inventory, "awkward_potion", 2);
    depositIngredient(stand, inventory, "spider_eye");
    tickBrewingStand(stand, BREW_DURATION_SEC);
    expect(stand.bottles[2]).toBe("potion_poison");
  });
});

describe("potion drinking and measurable effects", () => {
  it("healing potion restores health and returns a glass bottle", () => {
    const inventory = createInventory({ potion_healing: 1 });
    const effects = createEffects();
    const result = drinkPotion(inventory, effects, "potion_healing", 4, 10);
    expect(result.ok).toBe(true);
    expect(result.health).toBe(8);
    expect(inventory.potion_healing).toBe(0);
    expect(inventory.glass_bottle).toBe(1);
  });

  it("swiftness raises move speed while active", () => {
    const inventory = createInventory({ potion_swiftness: 1 });
    const effects = createEffects();
    expect(drinkPotion(inventory, effects, "potion_swiftness", 10, 10).ok).toBe(true);
    const poisonAcc = { value: 0 };
    const tick = tickEffects(effects, 10, 1, poisonAcc);
    expect(tick.speedMul).toBeCloseTo(1.2);
    expect(effects.some((entry) => entry.id === "swiftness")).toBe(true);
  });

  it("poison deals periodic damage but stops at 1 HP", () => {
    const inventory = createInventory({ potion_poison: 1 });
    const effects = createEffects();
    drinkPotion(inventory, effects, "potion_poison", 5, 10);
    const poisonAcc = { value: 0 };
    let health = 5;
    for (let i = 0; i < 20; i += 1) {
      const tick = tickEffects(effects, health, 1.25, poisonAcc);
      health = Math.max(1, health + tick.healthDelta);
    }
    expect(health).toBe(1);
  });

  it("pickPotionToDrink prefers healing when damaged", () => {
    const inventory = createInventory({
      potion_healing: 1,
      potion_swiftness: 1,
      potion_poison: 1,
    });
    expect(pickPotionToDrink(inventory, 5, 10)).toBe("potion_healing");
    expect(pickPotionToDrink(inventory, 10, 10)).toBe("potion_swiftness");
  });

  it("persists lasting effects through brewing save snapshots", () => {
    const effects = createEffects({
      effects: [{ id: "swiftness", remaining: 12, amplifier: 0 }],
    });
    const snap = snapshotBrewing(effects);
    const restored = createEffects(snap);
    expect(restored).toEqual([{ id: "swiftness", remaining: 12, amplifier: 0 }]);
  });
});

describe("brewing station wiring", () => {
  it("opens a stand, fills/fuels/loads slots, and completes a brew on tick", () => {
    const inventory = createInventory({
      glass_bottle: 1,
      blaze_powder: 1,
      nether_wart: 1,
    });
    const stations = createStations();
    openBrewAt(stations, inventory, "1,2,3");
    expect(stations.brewOpen).toBe(true);
    const stand = stations.brewingStands.get("1,2,3")!;
    expect(renderBrewPanelHtml(stand, inventory)).toContain("酿造台");

    expect(fillWaterBottle(inventory)).toBe(true);
    expect(depositFuel(stand, inventory, 1)).toBe(true);
    expect(depositBottle(stand, inventory, "water_bottle", 0)).toBe(true);
    expect(depositIngredient(stand, inventory, "nether_wart")).toBe(true);

    expect(tickAllBrewingStands(stations, BREW_DURATION_SEC)).toBe(true);
    expect(stand.bottles[0]).toBe("awkward_potion");
  });
});
