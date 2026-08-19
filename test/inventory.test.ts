import { describe, expect, it } from "vitest";
import { craftBricks, craftGlass, craftPlanks, createInventory } from "../src/inventory";

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

  it("turns four stone into four bricks", () => {
    const inventory = createInventory({ stone: 4 });
    expect(craftBricks(inventory)).toBe(true);
    expect(inventory.stone).toBe(0);
    expect(inventory.bricks).toBe(4);
  });

  it("turns four sand into four glass blocks", () => {
    const inventory = createInventory({ sand: 4 });
    expect(craftGlass(inventory)).toBe(true);
    expect(inventory.sand).toBe(0);
    expect(inventory.glass).toBe(4);
  });

  it("does not consume materials for unavailable building recipes", () => {
    const inventory = createInventory({ stone: 3, sand: 3 });
    expect(craftBricks(inventory)).toBe(false);
    expect(craftGlass(inventory)).toBe(false);
    expect(inventory.stone).toBe(3);
    expect(inventory.sand).toBe(3);
  });

  it("accepts collected mineral ores into the shared drop inventory", () => {
    const inventory = createInventory({ coal_ore: 4, diamond_ore: 1 });
    expect(inventory.coal_ore).toBe(4);
    expect(inventory.diamond_ore).toBe(1);
    expect(inventory.iron_ore).toBe(0);
    // A freshly built inventory defaults every ore slot to zero.
    expect(createInventory().coal_ore).toBe(0);
  });
});
