import { describe, expect, it } from "vitest";
import { createInventory } from "../src/inventory";
import {
  EXHAUSTION,
  MAX_FOOD_LEVEL,
  addExhaustion,
  appleDropFromLeaves,
  canSprint,
  createHungerState,
  eatFood,
  formatHungerBar,
  pickFoodToEat,
  tickHunger,
  wheatDropFromGrass,
} from "../src/hunger";
import { matchRecipe, emptyGrid } from "../src/crafting";
import { findSmelt } from "../src/smelting";

describe("hunger mechanics", () => {
  it("starts full and drains saturation before foodLevel via exhaustion packs of 4", () => {
    const hunger = createHungerState();
    expect(hunger.foodLevel).toBe(MAX_FOOD_LEVEL);
    expect(hunger.saturation).toBe(MAX_FOOD_LEVEL);
    addExhaustion(hunger, 4);
    expect(hunger.saturation).toBe(MAX_FOOD_LEVEL - 1);
    expect(hunger.foodLevel).toBe(MAX_FOOD_LEVEL);
    hunger.saturation = 0;
    addExhaustion(hunger, 4);
    expect(hunger.foodLevel).toBe(MAX_FOOD_LEVEL - 1);
  });

  it("blocks sprint at 6 food or below (vanilla)", () => {
    const hunger = createHungerState({ foodLevel: 7, saturation: 0 });
    expect(canSprint(hunger)).toBe(true);
    hunger.foodLevel = 6;
    expect(canSprint(hunger)).toBe(false);
  });

  it("eats bread with vanilla nutrition/saturation and refuses when full", () => {
    const hunger = createHungerState({ foodLevel: 10, saturation: 0 });
    expect(eatFood(hunger, "bread")).toBe(true);
    expect(hunger.foodLevel).toBe(15);
    expect(hunger.saturation).toBeCloseTo(6, 5);
    const full = createHungerState();
    expect(eatFood(full, "apple")).toBe(false);
  });

  it("picks the highest-value owned food first", () => {
    const inventory = createInventory({ apple: 2, bread: 1, raw_beef: 3 });
    expect(pickFoodToEat(inventory)).toBe("bread");
    inventory.cooked_beef = 1;
    expect(pickFoodToEat(inventory)).toBe("cooked_beef");
  });

  it("regenerates health when foodLevel ≥ 18 and starves at 0 down to 1 HP", () => {
    const fed = createHungerState({ foodLevel: 20, saturation: 0 });
    const regen = tickHunger(fed, 8, 10, 4);
    expect(regen.healthDelta).toBe(1);

    const starved = createHungerState({ foodLevel: 0, saturation: 0, exhaustion: 0 });
    const hurt = tickHunger(starved, 5, 10, 4);
    expect(hurt.healthDelta).toBe(-1);
    const floor = tickHunger(starved, 1, 10, 40);
    expect(floor.healthDelta).toBe(0);
  });

  it("formats a 10-icon hunger bar", () => {
    expect([...formatHungerBar(20)].length).toBe(10);
    expect(formatHungerBar(0)).toContain("🦴");
  });
});

describe("food acquisition", () => {
  it("crafts bread from three wheat", () => {
    const grid = emptyGrid(3);
    grid[0] = "wheat";
    grid[1] = "wheat";
    grid[2] = "wheat";
    expect(matchRecipe(grid)?.result).toEqual({ item: "bread", count: 1 });
  });

  it("smelts raw beef into cooked beef", () => {
    expect(findSmelt("raw_beef")?.output).toBe("cooked_beef");
  });

  it("drops apple/wheat deterministically from leaves/grass", () => {
    let apples = 0;
    let wheat = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (appleDropFromLeaves(42, i, 10, i * 3)) apples += 1;
      if (wheatDropFromGrass(42, i, 4, i * 5)) wheat += 1;
    }
    expect(apples).toBeGreaterThan(0);
    expect(apples).toBeLessThan(40);
    expect(wheat).toBeGreaterThan(100);
    expect(wheat).toBeLessThan(400);
  });

  it("walk exhaustion accumulates from movement costs", () => {
    const hunger = createHungerState({ foodLevel: 20, saturation: 0, exhaustion: 0 });
    addExhaustion(hunger, 100 * EXHAUSTION.walkPerMeter);
    expect(hunger.exhaustion).toBeCloseTo(1, 5);
  });
});
