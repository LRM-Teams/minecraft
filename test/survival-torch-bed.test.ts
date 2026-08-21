import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  DAY_LENGTH_MS,
  MORNING_PROGRESS,
  createDayClock,
  dayProgress,
  isNight,
  skipToMorning,
  sunHeightAt,
} from "../src/daycycle";
import {
  breakBedAt,
  facingFromYaw,
  hostileWithinSleepRange,
  placeBedPair,
  trySleepInBed,
} from "../src/bed";
import { canPlaceTorchAt, torchesNear } from "../src/torch";
import { matchRecipe, emptyGrid, craftFromGrid } from "../src/crafting";
import { createInventory } from "../src/inventory";
import { VoxelWorld } from "../src/world";

describe("day cycle", () => {
  it("marks the midnight trough as night and noon as day", () => {
    expect(MORNING_PROGRESS).toBeGreaterThan(0.85);
    expect(MORNING_PROGRESS).toBeLessThan(1);
    expect(isNight(0.75 * DAY_LENGTH_MS)).toBe(true);
    expect(isNight(0.25 * DAY_LENGTH_MS)).toBe(false);
    expect(sunHeightAt(0.25 * DAY_LENGTH_MS)).toBeGreaterThan(0.9);
  });

  it("skips from night to morning past the night threshold", () => {
    const night = 0.75 * DAY_LENGTH_MS;
    expect(isNight(night)).toBe(true);
    const morning = skipToMorning(night);
    expect(isNight(morning)).toBe(false);
    expect(dayProgress(morning)).toBeCloseTo(MORNING_PROGRESS, 3);
  });

  it("advances a wall-clock anchored day clock when setNow jumps", () => {
    vi.stubGlobal("performance", { now: () => 1_000 });
    const clock = createDayClock(0);
    expect(clock.phaseMs()).toBe(0);
    clock.setNow(0.75 * DAY_LENGTH_MS);
    expect(isNight(clock.now())).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("torch & bed crafting", () => {
  it("crafts four torches from coal above a stick", () => {
    const grid = emptyGrid(2);
    grid[0] = "coal";
    grid[2] = "stick";
    expect(matchRecipe(grid)?.result).toEqual({ item: "torch", count: 4 });
  });

  it("crafts four torches from charcoal above a stick", () => {
    const grid = emptyGrid(2);
    grid[0] = "charcoal";
    grid[2] = "stick";
    expect(matchRecipe(grid)?.result).toEqual({ item: "torch", count: 4 });
  });

  it("crafts a bed from three wool over three planks on a 3×3 grid", () => {
    const grid = emptyGrid(3);
    grid[0] = "wool";
    grid[1] = "wool";
    grid[2] = "wool";
    grid[3] = "planks";
    grid[4] = "planks";
    grid[5] = "planks";
    expect(matchRecipe(grid)?.result).toEqual({ item: "bed", count: 1 });
  });

  it("consumes coal+stick from the craft grid when taking torches", () => {
    const inventory = createInventory();
    const grid = emptyGrid(2);
    grid[0] = "coal";
    grid[2] = "stick";
    const result = craftFromGrid(inventory, grid);
    expect(result).toEqual({ item: "torch", count: 4 });
    expect(inventory.torch).toBe(4);
    expect(grid.every((cell) => cell === null)).toBe(true);
  });
});

describe("torch placement & lighting queries", () => {
  it("allows torch on a solid floor or against a solid wall", () => {
    const world = new VoxelWorld(1, 4);
    const y = world.topY(0, 0) + 1;
    // Clear destination cells so biome remaps cannot leave solids in the way.
    world.remove({ x: 0, y, z: 0 });
    world.remove({ x: 2, y, z: 0 });
    expect(canPlaceTorchAt(world, { x: 0, y, z: 0 })).toBe(true);
    world.set({ x: 1, y, z: 0 }, "stone");
    expect(canPlaceTorchAt(world, { x: 2, y, z: 0 }, { x: 1, y, z: 0 })).toBe(true);
  });

  it("lists nearby torches sorted by distance", () => {
    const world = new VoxelWorld(2, 8);
    const y = world.topY(0, 0) + 1;
    world.set({ x: 0, y, z: 0 }, "torch");
    world.set({ x: 4, y, z: 0 }, "torch");
    const near = torchesNear(world, { x: 0, y, z: 0 }, 20);
    expect(near[0]).toEqual({ x: 0, y, z: 0 });
    expect(near.some((p) => p.x === 4)).toBe(true);
  });

  it("treats torch as non-solid so topY ignores it", () => {
    const world = new VoxelWorld(3, 4);
    const ground = world.topY(1, 1);
    world.set({ x: 1, y: ground + 1, z: 1 }, "torch");
    expect(world.isSolid(1, ground + 1, 1)).toBe(false);
    expect(world.topY(1, 1)).toBe(ground);
  });
});

describe("bed placement, sleep, respawn", () => {
  beforeEach(() => {
    vi.stubGlobal("performance", { now: () => 0 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("places a two-block bed along facing and breaks as one item", () => {
    const world = new VoxelWorld(5, 8);
    const y = 6;
    for (let x = -2; x <= 2; x += 1) {
      for (let z = -2; z <= 2; z += 1) {
        world.set({ x, y: y - 1, z }, "dirt");
        for (let yy = y; yy <= y + 2; yy += 1) world.remove({ x, y: yy, z });
      }
    }
    const foot = { x: 0, y, z: 0 };
    expect(placeBedPair(world, foot, 0)).toBe(true); // facing -Z
    const head = { x: foot.x + facingFromYaw(0).x, y, z: foot.z + facingFromYaw(0).z };
    expect(world.get(foot.x, foot.y, foot.z)).toBe("bed");
    expect(world.get(head.x, head.y, head.z)).toBe("bed");
    expect(breakBedAt(world, foot)).toBe("bed");
    expect(world.get(foot.x, foot.y, foot.z)).toBeUndefined();
    expect(world.get(head.x, head.y, head.z)).toBeUndefined();
  });

  it("refuses sleep in daytime and succeeds at night without hostiles", () => {
    const bed = { x: 0, y: 5, z: 0 };
    expect(trySleepInBed({
      worldTimeMs: 0.25 * DAY_LENGTH_MS,
      dimension: "overworld",
      bed,
      monstersNearby: false,
    }).ok).toBe(false);

    const night = trySleepInBed({
      worldTimeMs: 0.75 * DAY_LENGTH_MS,
      dimension: "overworld",
      bed,
      monstersNearby: false,
    });
    expect(night.ok).toBe(true);
    if (night.ok) {
      expect(isNight(night.nextWorldTimeMs)).toBe(false);
      expect(night.spawn[0]).toBeCloseTo(0.5);
    }
  });

  it("blocks sleep when hostiles are within range", () => {
    expect(hostileWithinSleepRange({ x: 0, y: 0, z: 0 }, [{ x: 3, z: 0, dead: false }])).toBe(true);
    expect(hostileWithinSleepRange({ x: 0, y: 0, z: 0 }, [{ x: 3, z: 0, dead: true }])).toBe(false);
    expect(trySleepInBed({
      worldTimeMs: 0.75 * DAY_LENGTH_MS,
      dimension: "overworld",
      bed: { x: 0, y: 1, z: 0 },
      monstersNearby: true,
    })).toEqual({ ok: false, reason: "monsters" });
  });
});

describe("village wool supply", () => {
  it("puts wool inside generated village homes for bed crafting", () => {
    // Search a few seeds until a plains village exists.
    let wool = 0;
    for (let seed = 1; seed < 200 && wool === 0; seed += 1) {
      const world = new VoxelWorld(seed, 30);
      wool = [...world.blocks.values()].filter((type) => type === "wool").length;
    }
    expect(wool).toBeGreaterThan(0);
  });
});
