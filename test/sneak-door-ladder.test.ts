import { describe, expect, it } from "vitest";
import {
  breakDoorAt,
  findDoorPair,
  isDoorOpen,
  placeDoorPair,
  toggleDoorAt,
} from "../src/doors";
import { canPlaceLadderAt, isClimbingLadder } from "../src/ladder";
import {
  resolveMoveMode,
  speedForMode,
  SNEAK_SPEED,
  SPRINT_SPEED,
  WALK_SPEED,
  wouldFallOffEdge,
} from "../src/sneak";
import { matchRecipe, emptyGrid } from "../src/crafting";
import { tryPlaceBlock } from "../src/place";
import { VoxelWorld } from "../src/world";

describe("sneak vs sprint", () => {
  it("lets sneak win over sprint so the two never stack", () => {
    expect(resolveMoveMode({ sneakHeld: true, sprintHeld: true, canSprint: true })).toBe("sneak");
    expect(resolveMoveMode({ sneakHeld: false, sprintHeld: true, canSprint: true })).toBe("sprint");
    expect(resolveMoveMode({ sneakHeld: false, sprintHeld: true, canSprint: false })).toBe("walk");
    expect(speedForMode("sneak")).toBe(SNEAK_SPEED);
    expect(speedForMode("sprint")).toBe(SPRINT_SPEED);
    expect(speedForMode("walk")).toBe(WALK_SPEED);
    expect(SNEAK_SPEED).toBeLessThan(WALK_SPEED);
  });

  it("blocks edge steps that would drop the eye height while sneaking", () => {
    expect(wouldFallOffEdge({ currentEyeY: 10.72, nextEyeY: 8.72 })).toBe(true);
    expect(wouldFallOffEdge({ currentEyeY: 10.72, nextEyeY: 10.72 })).toBe(false);
    expect(wouldFallOffEdge({ currentEyeY: 10.72, nextEyeY: 10.5 })).toBe(false);
  });
});

describe("oak door craft / place / toggle collision", () => {
  it("crafts three oak doors from six planks on a 3×3 table grid", () => {
    const grid = emptyGrid(3);
    grid[0] = "planks";
    grid[1] = "planks";
    grid[3] = "planks";
    grid[4] = "planks";
    grid[6] = "planks";
    grid[7] = "planks";
    expect(matchRecipe(grid)?.result).toEqual({ item: "oak_door", count: 3 });
  });

  it("places a 2-tall door, blocks when closed, and opens with toggle", () => {
    const world = new VoxelWorld(1, 4);
    const y = world.topY(0, 0) + 1;
    world.remove({ x: 0, y, z: 0 });
    world.remove({ x: 0, y: y + 1, z: 0 });
    expect(placeDoorPair(world, { x: 0, y, z: 0 })).toBe(true);
    expect(world.get(0, y, 0)).toBe("oak_door");
    expect(world.get(0, y + 1, 0)).toBe("oak_door");
    expect(findDoorPair(world, { x: 0, y, z: 0 })).toEqual({ x: 0, y: y + 1, z: 0 });
    expect(world.isSolid(0, y, 0)).toBe(true);
    expect(isDoorOpen(world, { x: 0, y, z: 0 })).toBe(false);

    expect(toggleDoorAt(world, { x: 0, y, z: 0 })).toBe(true);
    expect(isDoorOpen(world, { x: 0, y, z: 0 })).toBe(true);
    expect(isDoorOpen(world, { x: 0, y: y + 1, z: 0 })).toBe(true);
    expect(world.isSolid(0, y, 0)).toBe(false);
    expect(world.isSolid(0, y + 1, 0)).toBe(false);

    expect(toggleDoorAt(world, { x: 0, y: y + 1, z: 0 })).toBe(false);
    expect(world.isSolid(0, y, 0)).toBe(true);

    expect(breakDoorAt(world, { x: 0, y, z: 0 })).toBe("oak_door");
    expect(world.get(0, y, 0)).toBeUndefined();
    expect(world.get(0, y + 1, 0)).toBeUndefined();
  });

  it("persists open door state in world snapshots", () => {
    const world = new VoxelWorld(1, 4);
    const y = world.topY(1, 1) + 1;
    world.remove({ x: 1, y, z: 1 });
    world.remove({ x: 1, y: y + 1, z: 1 });
    placeDoorPair(world, { x: 1, y, z: 1 });
    toggleDoorAt(world, { x: 1, y, z: 1 });
    const restored = VoxelWorld.fromSnapshot(world.snapshot());
    expect(restored.isSolid(1, y, 1)).toBe(false);
    expect(isDoorOpen(restored, { x: 1, y, z: 1 })).toBe(true);
  });

  it("places village oak doors in generated homes", () => {
    let world: VoxelWorld | undefined;
    for (let seed = 1; seed <= 500 && !world; seed += 1) {
      const candidate = new VoxelWorld(seed, 48);
      if (candidate.villages.length) world = candidate;
    }
    expect(world).toBeTruthy();
    const entrance = world!.villages[0]!.homes[0]!.entrance;
    expect(world!.get(entrance.x, entrance.y, entrance.z)).toBe("oak_door");
    expect(world!.get(entrance.x, entrance.y + 1, entrance.z)).toBe("oak_door");
  });
});

describe("ladder craft / place / climb", () => {
  it("crafts three ladders from the vanilla H stick pattern", () => {
    const grid = emptyGrid(3);
    grid[0] = "stick";
    grid[2] = "stick";
    grid[3] = "stick";
    grid[4] = "stick";
    grid[5] = "stick";
    grid[6] = "stick";
    grid[8] = "stick";
    expect(matchRecipe(grid)?.result).toEqual({ item: "ladder", count: 3 });
  });

  it("requires a solid wall and stays non-solid for climbing", () => {
    const world = new VoxelWorld(1, 4);
    const y = 20;
    for (let dy = 18; dy <= 22; dy += 1) {
      for (let dx = -2; dx <= 3; dx += 1) {
        for (let dz = -2; dz <= 2; dz += 1) {
          world.remove({ x: dx, y: dy, z: dz });
        }
      }
    }
    world.set({ x: 1, y, z: 0 }, "stone");
    expect(canPlaceLadderAt(world, { x: 2, y, z: 0 }, { x: 1, y, z: 0 })).toBe(true);
    // Far from the stone pillar — no solid wall to attach to.
    expect(canPlaceLadderAt(world, { x: 0, y, z: 2 })).toBe(false);

    const result = tryPlaceBlock(world, "ladder", 1, {
      position: { x: 1, y, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
    }, {
      yaw: 0,
      intersectsPlayer: () => false,
      labelFor: () => "梯子",
    });
    expect(result.ok).toBe(true);
    expect(world.get(2, y, 0)).toBe("ladder");
    expect(world.isSolid(2, y, 0)).toBe(false);
    expect(isClimbingLadder(world, 2.1, y + 1.72, 0.1)).toBe(true);
  });
});
