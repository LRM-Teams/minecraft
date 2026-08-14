import { describe, expect, it } from "vitest";
import { craftPlanks, createInventory } from "../src/inventory";

describe("crafting", () => {
  it("turns one collected log into four planks", () => {
    const inventory = createInventory({ wood: 1 });
    expect(craftPlanks(inventory)).toBe(true);
    expect(inventory.wood).toBe(0);
    expect(inventory.planks).toBe(4);
  });

  it("does not craft without a log", () => {
    expect(craftPlanks(createInventory())).toBe(false);
  });
});
