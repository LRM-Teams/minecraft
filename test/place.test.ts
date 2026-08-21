import { describe, expect, it } from "vitest";
import {
  OCCUPIED_PLACE_MESSAGE,
  PLAYER_BLOCKING_PLACE_MESSAGE,
  emptyHotbarPlaceMessage,
  isBlockInteractTarget,
  preferBlockInteract,
  tryPlaceBlock,
} from "../src/place";
import { VoxelWorld } from "../src/world";

const labelFor = (type: string): string => type;

describe("preferBlockInteract", () => {
  it("keeps station / lever use only when the hotbar slot is empty", () => {
    expect(preferBlockInteract(0, "crafting_table")).toBe(true);
    expect(preferBlockInteract(0, "lever")).toBe(true);
    expect(preferBlockInteract(1, "crafting_table")).toBe(false);
    expect(preferBlockInteract(3, "lever")).toBe(false);
  });

  it("never treats ordinary terrain as an interact target", () => {
    expect(isBlockInteractTarget("dirt")).toBe(false);
    expect(preferBlockInteract(0, "dirt")).toBe(false);
    expect(preferBlockInteract(5, "stone")).toBe(false);
  });
});

describe("tryPlaceBlock", () => {
  const emptyWorld = (): VoxelWorld =>
    VoxelWorld.fromSnapshot({ seed: 1, size: 8, blocks: [] }, 8);

  const floorWorld = (): VoxelWorld => {
    const world = emptyWorld();
    world.set({ x: 0, y: 0, z: 0 }, "stone");
    return world;
  };

  const hitUp = { position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };

  it("reports empty hotbar instead of failing silently", () => {
    const world = floorWorld();
    const result = tryPlaceBlock(world, "dirt", 0, hitUp, {
      yaw: 0,
      intersectsPlayer: () => false,
      labelFor,
    });
    expect(result).toEqual({ ok: false, message: emptyHotbarPlaceMessage("dirt") });
    expect(world.get(0, 1, 0)).toBeUndefined();
  });

  it("places a normal block against a solid face when the hotbar has stock", () => {
    const world = floorWorld();
    const result = tryPlaceBlock(world, "dirt", 2, hitUp, {
      yaw: 0,
      intersectsPlayer: () => false,
      labelFor,
    });
    expect(result).toEqual({ ok: true, position: { x: 0, y: 1, z: 0 }, type: "dirt" });
    expect(world.get(0, 1, 0)).toBe("dirt");
  });

  it("places against a lever / crafting table face when holding blocks", () => {
    const world = floorWorld();
    world.set({ x: 1, y: 0, z: 0 }, "lever");
    world.set({ x: -1, y: 0, z: 0 }, "crafting_table");

    const againstLever = tryPlaceBlock(
      world,
      "dirt",
      1,
      { position: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
      { yaw: 0, intersectsPlayer: () => false, labelFor },
    );
    expect(againstLever.ok).toBe(true);
    expect(world.get(1, 1, 0)).toBe("dirt");

    const againstTable = tryPlaceBlock(
      world,
      "stone",
      1,
      { position: { x: -1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
      { yaw: 0, intersectsPlayer: () => false, labelFor },
    );
    expect(againstTable.ok).toBe(true);
    expect(world.get(-1, 1, 0)).toBe("stone");
  });

  it("surfaces occupied / self-blocking failures (no silent return)", () => {
    const world = floorWorld();
    world.set({ x: 0, y: 1, z: 0 }, "dirt");
    const occupied = tryPlaceBlock(world, "stone", 1, hitUp, {
      yaw: 0,
      intersectsPlayer: () => false,
      labelFor,
    });
    expect(occupied).toEqual({ ok: false, message: OCCUPIED_PLACE_MESSAGE });

    const blocked = tryPlaceBlock(world, "stone", 1, {
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
    }, {
      yaw: 0,
      intersectsPlayer: (pos) => pos.x === 1 && pos.y === 0 && pos.z === 0,
      labelFor,
    });
    expect(blocked).toEqual({ ok: false, message: PLAYER_BLOCKING_PLACE_MESSAGE });
  });
});
