import { describe, expect, it } from "vitest";
import { matchRecipe, emptyGrid, craftFromGrid } from "../src/crafting";
import { createInventory } from "../src/inventory";
import { VoxelWorld } from "../src/world";
import {
  canPlaceRedstoneDustAt,
  computeRedstoneNetwork,
  createLeverStates,
  isLampLitAt,
  isTorchOnAt,
  redstoneDropCount,
  toggleLeverAt,
  wirePowerAt,
} from "../src/redstone";

describe("redstone crafting", () => {
  it("crafts a redstone torch from dust above a stick", () => {
    const grid = emptyGrid(2);
    grid[0] = "redstone_dust";
    grid[2] = "stick";
    expect(matchRecipe(grid)?.result).toEqual({ item: "redstone_torch", count: 1 });
  });

  it("crafts a lever from stick above stone", () => {
    const grid = emptyGrid(2);
    grid[0] = "stick";
    grid[2] = "stone";
    expect(matchRecipe(grid)?.result).toEqual({ item: "lever", count: 1 });
  });

  it("crafts a redstone lamp from glass + four dust", () => {
    const grid = emptyGrid(3);
    grid[1] = "redstone_dust";
    grid[3] = "redstone_dust";
    grid[4] = "glass";
    grid[5] = "redstone_dust";
    grid[7] = "redstone_dust";
    expect(matchRecipe(grid)?.result).toEqual({ item: "redstone_lamp", count: 1 });
  });

  it("consumes ingredients when taking a lever from the craft grid", () => {
    const inventory = createInventory();
    const grid = emptyGrid(2);
    grid[0] = "stick";
    grid[2] = "stone";
    const result = craftFromGrid(inventory, grid);
    expect(result).toEqual({ item: "lever", count: 1 });
    expect(inventory.lever).toBe(1);
    expect(grid.every((cell) => cell === null)).toBe(true);
  });
});

describe("redstone ore drops", () => {
  it("drops 4–5 dust from redstone ore", () => {
    const count = redstoneDropCount(42, 1, 2, 3);
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(5);
  });
});

describe("redstone power propagation", () => {
  const flatWorld = (): { world: VoxelWorld; y: number } => {
    const world = new VoxelWorld(99, 8);
    world.blocks.clear();
    for (let x = -4; x <= 4; x += 1) {
      for (let z = -4; z <= 4; z += 1) {
        world.set({ x, y: 1, z }, "stone");
      }
    }
    return { world, y: 2 };
  };

  it("allows dust only on solid floors", () => {
    const { world, y } = flatWorld();
    expect(canPlaceRedstoneDustAt(world, { x: 0, y, z: 0 })).toBe(true);
    expect(canPlaceRedstoneDustAt(world, { x: 0, y: y + 2, z: 0 })).toBe(false);
  });

  it("attenuates wire power by 1 per dust step from an ON lever (0–15)", () => {
    const world = new VoxelWorld(99, 24);
    world.blocks.clear();
    const y = 2;
    for (let x = -1; x <= 17; x += 1) {
      world.set({ x, y: 1, z: 0 }, "stone");
    }
    const levers = createLeverStates();
    world.set({ x: 0, y, z: 0 }, "lever");
    for (let i = 1; i <= 16; i += 1) {
      world.set({ x: i, y, z: 0 }, "redstone_dust");
    }
    toggleLeverAt(world, levers, { x: 0, y, z: 0 });
    const { wirePower } = computeRedstoneNetwork(world, levers);
    expect(wirePowerAt(wirePower, { x: 1, y, z: 0 })).toBe(15);
    expect(wirePowerAt(wirePower, { x: 2, y, z: 0 })).toBe(14);
    expect(wirePowerAt(wirePower, { x: 15, y, z: 0 })).toBe(1);
    expect(wirePowerAt(wirePower, { x: 16, y, z: 0 })).toBe(0);
  });

  it("lights a redstone lamp when adjacent dust is powered", () => {
    const { world, y } = flatWorld();
    const levers = createLeverStates();
    world.set({ x: 0, y, z: 0 }, "lever");
    world.set({ x: 1, y, z: 0 }, "redstone_dust");
    world.set({ x: 2, y, z: 0 }, "redstone_lamp");
    toggleLeverAt(world, levers, { x: 0, y, z: 0 });
    const litOn = computeRedstoneNetwork(world, levers);
    expect(isLampLitAt(litOn.lampLit, { x: 2, y, z: 0 })).toBe(true);

    toggleLeverAt(world, levers, { x: 0, y, z: 0 });
    const litOff = computeRedstoneNetwork(world, levers);
    expect(isLampLitAt(litOff.lampLit, { x: 2, y, z: 0 })).toBe(false);
  });

  it("powers dust from a redstone torch and lights an adjacent lamp", () => {
    const { world, y } = flatWorld();
    const levers = createLeverStates();
    world.set({ x: 0, y, z: 0 }, "redstone_torch");
    world.set({ x: 1, y, z: 0 }, "redstone_dust");
    world.set({ x: 2, y, z: 0 }, "redstone_lamp");
    const net = computeRedstoneNetwork(world, levers);
    expect(isTorchOnAt(net.torchOn, { x: 0, y, z: 0 })).toBe(true);
    expect(wirePowerAt(net.wirePower, { x: 1, y, z: 0 })).toBe(15);
    expect(isLampLitAt(net.lampLit, { x: 2, y, z: 0 })).toBe(true);
  });

  it("inverts a redstone torch when its support block is powered", () => {
    const { world, y } = flatWorld();
    const levers = createLeverStates();
    // Lever sits beside the support stone (same Y as the floor), torch on top.
    world.set({ x: 1, y: y - 1, z: 0 }, "lever");
    world.set({ x: 2, y, z: 0 }, "redstone_torch");
    toggleLeverAt(world, levers, { x: 1, y: y - 1, z: 0 });
    const net = computeRedstoneNetwork(world, levers);
    expect(isTorchOnAt(net.torchOn, { x: 2, y, z: 0 })).toBe(false);
  });

  it("keeps a torch ON when nearby dust is only powered by that torch (no self-invert)", () => {
    const { world, y } = flatWorld();
    const levers = createLeverStates();
    world.set({ x: 0, y, z: 0 }, "redstone_torch");
    world.set({ x: 1, y, z: 0 }, "redstone_dust");
    const net = computeRedstoneNetwork(world, levers);
    expect(isTorchOnAt(net.torchOn, { x: 0, y, z: 0 })).toBe(true);
    expect(wirePowerAt(net.wirePower, { x: 1, y, z: 0 })).toBe(15);
  });
});
