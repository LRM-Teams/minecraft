import { describe, expect, it } from "vitest";
import {
  clickCraftBag,
  clickCraftCell,
  clickCraftResult,
  craftFromGrid,
  craftMaxFromGrid,
  emptyGrid,
  matchRecipe,
  placeIntoGrid,
  refundCursor,
  refundGrid,
  takeFromGrid,
} from "../src/crafting";
import { createInventory } from "../src/inventory";
import { createFurnaceState, depositFurnace, tickFurnace, withdrawFurnace } from "../src/smelting";
import {
  createStations,
  handleCraftClick,
  openInventoryCraft,
  openTableCraft,
  closeCraft,
} from "../src/stations";

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

  it("leaves leftover stack counts after one craft (vanilla)", () => {
    const inventory = createInventory();
    const grid = emptyGrid(2);
    grid[0] = { item: "wood", count: 3 };
    const result = craftFromGrid(inventory, grid);
    expect(result).toEqual({ item: "planks", count: 4 });
    expect(grid[0]).toEqual({ item: "wood", count: 2 });
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

describe("vanilla mouse craft cursor (JE)", () => {
  it("left-clicks bag → grid → result onto the cursor", () => {
    const inventory = createInventory({ wood: 2 });
    let cursor = clickCraftBag(inventory, null, "wood", "left");
    expect(cursor).toEqual({ item: "wood", count: 2 });
    expect(inventory.wood).toBe(0);

    const grid = emptyGrid(2);
    cursor = clickCraftCell(grid, cursor, 0, "left");
    expect(grid[0]).toEqual({ item: "wood", count: 2 });
    expect(cursor).toBeNull();

    // Pick stack, place one with right-click, return remainder to bag
    cursor = clickCraftCell(grid, null, 0, "left");
    expect(cursor).toEqual({ item: "wood", count: 2 });
    cursor = clickCraftCell(grid, cursor, 0, "right");
    expect(grid[0]).toEqual({ item: "wood", count: 1 });
    expect(cursor).toEqual({ item: "wood", count: 1 });
    cursor = clickCraftBag(inventory, cursor, "wood", "left");
    expect(cursor).toBeNull();
    expect(inventory.wood).toBe(1);

    const taken = clickCraftResult(inventory, grid, null, false);
    expect(taken.crafted).toEqual({ item: "planks", count: 4 });
    expect(taken.cursor).toEqual({ item: "planks", count: 4 });
    expect(grid[0]).toBeNull();
  });

  it("right-clicks bag to pick half and deposits one into a cell", () => {
    const inventory = createInventory({ planks: 8 });
    let cursor = clickCraftBag(inventory, null, "planks", "right");
    expect(cursor).toEqual({ item: "planks", count: 4 });
    expect(inventory.planks).toBe(4);

    const grid = emptyGrid(2);
    cursor = clickCraftCell(grid, cursor, 0, "right");
    expect(grid[0]).toEqual({ item: "planks", count: 1 });
    expect(cursor).toEqual({ item: "planks", count: 3 });
  });

  it("shift-clicks result to craft-max into the bag (2×2 table)", () => {
    const inventory = createInventory();
    const grid = emptyGrid(2);
    grid.fill({ item: "planks", count: 3 });
    const crafted = craftMaxFromGrid(inventory, grid);
    expect(crafted).toEqual({ item: "crafting_table", count: 3 });
    expect(inventory.crafting_table).toBe(3);
    expect(grid.every((cell) => cell === null)).toBe(true);
  });

  it("shift-clicks result via clickCraftResult when cursor empty", () => {
    const inventory = createInventory();
    const grid = emptyGrid(2);
    grid[0] = { item: "wood", count: 5 };
    const { cursor, crafted } = clickCraftResult(inventory, grid, null, true);
    expect(cursor).toBeNull();
    expect(crafted).toEqual({ item: "planks", count: 20 });
    expect(inventory.planks).toBe(20);
    expect(grid[0]).toBeNull();
  });

  it("refunds floating cursor when closing", () => {
    const inventory = createInventory();
    expect(refundCursor(inventory, { item: "stone", count: 7 })).toBeNull();
    expect(inventory.stone).toBe(7);
  });

  it("uses the same cursor path for 3×3 table and 2×2 inventory", () => {
    const stations = createStations();
    const inventory = createInventory({ stone: 8 });
    openTableCraft(stations, inventory);
    expect(stations.craftGrid.length).toBe(9);

    stations.craftCursor = clickCraftBag(inventory, stations.craftCursor, "stone", "left");
    expect(stations.craftCursor).toEqual({ item: "stone", count: 8 });

    for (let i = 0; i < 9; i += 1) {
      if (i === 4) continue;
      stations.craftCursor = clickCraftCell(stations.craftGrid, stations.craftCursor, i, "right");
    }
    expect(stations.craftCursor).toBeNull();
    expect(matchRecipe(stations.craftGrid)?.result.item).toBe("furnace");

    const taken = clickCraftResult(inventory, stations.craftGrid, stations.craftCursor, false);
    stations.craftCursor = taken.cursor;
    expect(taken.crafted?.item).toBe("furnace");
    expect(stations.craftCursor).toEqual({ item: "furnace", count: 1 });

    closeCraft(stations, inventory);
    expect(stations.craftOpen).toBe(false);
    expect(inventory.furnace).toBe(1);
    expect(inventory.stone ?? 0).toBe(0);
  });

  it("2×2 inventory craft mouse path matches table semantics", () => {
    const stations = createStations();
    const inventory = createInventory({ planks: 4 });
    openInventoryCraft(stations, inventory);
    expect(stations.craftGrid.length).toBe(4);

    stations.craftCursor = clickCraftBag(inventory, null, "planks", "left");
    for (let i = 0; i < 4; i += 1) {
      stations.craftCursor = clickCraftCell(stations.craftGrid, stations.craftCursor, i, "right");
    }
    expect(stations.craftCursor).toBeNull();
    expect(matchRecipe(stations.craftGrid)?.result.item).toBe("crafting_table");
    const taken = clickCraftResult(inventory, stations.craftGrid, stations.craftCursor, false);
    stations.craftCursor = taken.cursor;
    expect(stations.craftCursor?.item).toBe("crafting_table");
    expect(typeof handleCraftClick).toBe("function");
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

  it("does not smelt coal_ore or diamond_ore (gemify on mine instead)", () => {
    const inventory = createInventory({ coal_ore: 1, diamond_ore: 1, coal: 1 });
    const furnace = createFurnaceState();
    expect(depositFurnace(furnace, inventory, "coal_ore", "input")).toBe(false);
    expect(depositFurnace(furnace, inventory, "diamond_ore", "input")).toBe(false);
  });

  it("smelts copper ore with coal into copper ingot", () => {
    const inventory = createInventory({ copper_ore: 1, coal: 1 });
    const furnace = createFurnaceState();
    expect(depositFurnace(furnace, inventory, "copper_ore", "input")).toBe(true);
    expect(depositFurnace(furnace, inventory, "coal", "fuel")).toBe(true);
    tickFurnace(furnace, 10);
    expect(furnace.output).toEqual({ item: "copper_ingot", count: 1 });
  });
});
