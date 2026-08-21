import { describe, expect, it } from "vitest";
import {
  EMPTY_HOTBAR_PLACE_MESSAGE,
  OCCUPIED_PLACE_MESSAGE,
  PLAYER_BLOCKING_PLACE_MESSAGE,
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
  /** Elevated pad above terrain noise so placement cells stay empty. */
  const padWorld = (): { world: VoxelWorld; y: number } => {
    const world = new VoxelWorld(99, 8);
    const y = 12;
    for (let x = -2; x <= 2; x += 1) {
      for (let z = -2; z <= 2; z += 1) {
        world.set({ x, y, z }, "stone");
        world.remove({ x, y: y + 1, z });
      }
    }
    return { world, y };
  };

  it("reports empty hotbar instead of failing silently", () => {
    const { world, y } = padWorld();
    const hitUp = { position: { x: 0, y, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
    const result = tryPlaceBlock(world, "dirt", 0, hitUp, {
      yaw: 0,
      intersectsPlayer: () => false,
      labelFor,
    });
    expect(result).toEqual({ ok: false, message: EMPTY_HOTBAR_PLACE_MESSAGE });
    expect(world.get(0, y + 1, 0)).toBeUndefined();
  });

  it("places a normal block against a solid face when the hotbar has stock", () => {
    const { world, y } = padWorld();
    const hitUp = { position: { x: 0, y, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
    const result = tryPlaceBlock(world, "dirt", 2, hitUp, {
      yaw: 0,
      intersectsPlayer: () => false,
      labelFor,
    });
    expect(result).toEqual({ ok: true, position: { x: 0, y: y + 1, z: 0 }, type: "dirt" });
    expect(world.get(0, y + 1, 0)).toBe("dirt");
  });

  it("places against a lever / crafting table face when holding blocks", () => {
    const { world, y } = padWorld();
    world.set({ x: 1, y, z: 0 }, "lever");
    world.set({ x: -1, y, z: 0 }, "crafting_table");

    const againstLever = tryPlaceBlock(
      world,
      "dirt",
      1,
      { position: { x: 1, y, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
      { yaw: 0, intersectsPlayer: () => false, labelFor },
    );
    expect(againstLever.ok).toBe(true);
    expect(world.get(1, y + 1, 0)).toBe("dirt");

    const againstTable = tryPlaceBlock(
      world,
      "stone",
      1,
      { position: { x: -1, y, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
      { yaw: 0, intersectsPlayer: () => false, labelFor },
    );
    expect(againstTable.ok).toBe(true);
    expect(world.get(-1, y + 1, 0)).toBe("stone");
  });

  it("surfaces occupied / self-blocking failures", () => {
    const { world, y } = padWorld();
    const hitUp = { position: { x: 0, y, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
    world.set({ x: 0, y: y + 1, z: 0 }, "dirt");
    const occupied = tryPlaceBlock(world, "stone", 1, hitUp, {
      yaw: 0,
      intersectsPlayer: () => false,
      labelFor,
    });
    expect(occupied).toEqual({ ok: false, message: OCCUPIED_PLACE_MESSAGE });

    const blocked = tryPlaceBlock(world, "stone", 1, {
      position: { x: 0, y, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
    }, {
      yaw: 0,
      intersectsPlayer: (pos) => pos.x === 1 && pos.y === y && pos.z === 0,
      labelFor,
    });
    expect(blocked).toEqual({ ok: false, message: PLAYER_BLOCKING_PLACE_MESSAGE });
  });
});
