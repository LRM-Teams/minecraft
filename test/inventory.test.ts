import { describe, expect, it } from "vitest";
import { craftBricks, craftGlass, craftPlanks, createInventory } from "../src/inventory";

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
