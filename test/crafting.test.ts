import { describe, expect, it } from "vitest";
import {
  craftFromGrid,
  emptyGrid,
  matchRecipe,
  placeIntoGrid,
  refundGrid,
  takeFromGrid,
} from "../src/crafting";
import { createInventory } from "../src/inventory";
import { createFurnaceState, depositFurnace, tickFurnace, withdrawFurnace } from "../src/smelting";

describe("vanilla crafting recipes", () => {
  it("turns one log into four planks (shapeless)", () => {
    const grid = emptyGrid(2);
    grid[0] = "wood";
    expect(matchRecipe(grid)?.result).toEqual({ item: "planks", count: 4 });
  });

  it("crafts sticks from two vertical planks", () => {
    const grid = emptyGrid(2);
    grid[0] = "planks";
    grid[2] = "planks";
    expect(matchRecipe(grid)?.result).toEqual({ item: "stick", count: 4 });
  });

  it("crafts a crafting table from a 2x2 of planks", () => {
    const grid = emptyGrid(2);
    grid.fill("planks");
    expect(matchRecipe(grid)?.result.item).toBe("crafting_table");
  });

  it("crafts a furnace from eight stone in a ring", () => {
    const grid = emptyGrid(3);
    for (let i = 0; i < 9; i += 1) if (i !== 4) grid[i] = "stone";
    expect(matchRecipe(grid)?.result.item).toBe("furnace");
  });

  it("requires smelted iron ingots for an iron pickaxe (not raw ore)", () => {
    const oreGrid = emptyGrid(3);
    oreGrid[0] = "iron_ore";
    oreGrid[1] = "iron_ore";
    oreGrid[2] = "iron_ore";
    oreGrid[4] = "stick";
    oreGrid[7] = "stick";
    expect(matchRecipe(oreGrid)?.result.item).not.toBe("iron_pickaxe");

    const grid = emptyGrid(3);
    grid[0] = "iron_ingot";
    grid[1] = "iron_ingot";
    grid[2] = "iron_ingot";
    grid[4] = "stick";
    grid[7] = "stick";
    expect(matchRecipe(grid)?.result.item).toBe("iron_pickaxe");
  });

  it("crafts diamond tools from gems", () => {
    const grid = emptyGrid(3);
    grid[1] = "diamond";
    grid[4] = "diamond";
    grid[7] = "stick";
    expect(matchRecipe(grid)?.result.item).toBe("diamond_sword");
  });

  it("crafts from inventory and clears the grid", () => {
    const inventory = createInventory({ planks: 4 });
    const grid = emptyGrid(2);
    for (let i = 0; i < 4; i += 1) expect(placeIntoGrid(inventory, grid, "planks")).toBe(true);
    const result = craftFromGrid(inventory, grid);
    expect(result).toEqual({ item: "crafting_table", count: 1 });
    expect(inventory.crafting_table).toBe(1);
    expect(grid.every((cell) => cell === null)).toBe(true);
  });

  it("refunds the grid when closing without crafting", () => {
    const inventory = createInventory({ wood: 1 });
    const grid = emptyGrid(2);
    placeIntoGrid(inventory, grid, "wood");
    refundGrid(inventory, grid);
    expect(inventory.wood).toBe(1);
  });

  it("returns a single cell to the bag", () => {
    const inventory = createInventory({ stone: 1 });
    const grid = emptyGrid(2);
    placeIntoGrid(inventory, grid, "stone");
    expect(takeFromGrid(inventory, grid, 0)).toBe(true);
    expect(inventory.stone).toBe(1);
  });
});

describe("vanilla furnace smelting", () => {
  it("smelts iron ore into an iron ingot with coal fuel", () => {
    const inventory = createInventory({ iron_ore: 1, coal: 1 });
    const furnace = createFurnaceState();
    expect(depositFurnace(furnace, inventory, "iron_ore", "input")).toBe(true);
    expect(depositFurnace(furnace, inventory, "coal", "fuel")).toBe(true);
    expect(inventory.iron_ore).toBe(0);
    expect(inventory.coal).toBe(0);

    tickFurnace(furnace, 10);
    expect(furnace.output).toEqual({ item: "iron_ingot", count: 1 });
    expect(furnace.input).toBeNull();
    expect(withdrawFurnace(furnace, inventory, "output")).toBe(true);
    expect(inventory.iron_ingot).toBe(1);
  });

  it("smelts sand into glass (not craft-grid)", () => {
    const inventory = createInventory({ sand: 1, charcoal: 1 });
    const furnace = createFurnaceState();
    depositFurnace(furnace, inventory, "sand", "input");
    depositFurnace(furnace, inventory, "charcoal", "fuel");
    tickFurnace(furnace, 10);
    expect(furnace.output?.item).toBe("glass");
  });

});
