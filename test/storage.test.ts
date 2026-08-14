import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInventory } from "../src/inventory";
import { clearSave, createWorldSlot, deleteWorldSlot, listWorldSlots, loadActiveWorld, loadWorldSlot, normaliseWorldName, renameWorldSlot, saveWorldSlot } from "../src/storage";
import { VoxelWorld } from "../src/world";

const player = () => ({ position: [0, 6, 8] as [number, number, number], yaw: 0, pitch: 0, selected: 0, inventory: createInventory() });

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("world slots", () => {
  it("creates, selects and persists independent worlds", () => {
    const firstWorld = new VoxelWorld(11, 2);
    const first = createWorldSlot(" 山间基地 ", firstWorld, player());
    const secondWorld = new VoxelWorld(22, 2);
    const second = createWorldSlot("沙漠玻璃屋", secondWorld, player());

    expect(listWorldSlots().map((slot) => slot.name)).toContain("山间基地");
    expect(loadActiveWorld()?.id).toBe(second.id);
    expect(loadWorldSlot(first.id)?.save.world.seed).toBe(11);

    firstWorld.set({ x: 0, y: 12, z: 0 }, "bricks");
    expect(saveWorldSlot(first.id, firstWorld, player())).toBe(true);
    expect(loadWorldSlot(first.id)?.save.world.blocks.some(([key, type]) => key === "0,12,0" && type === "bricks")).toBe(true);
  });

  it("renames safely and deletes only the requested slot", () => {
    const first = createWorldSlot("一", new VoxelWorld(1, 2), player());
    const second = createWorldSlot("二", new VoxelWorld(2, 2), player());
    expect(renameWorldSlot(first.id, "  长   名称  ")).toBe(true);
    expect(listWorldSlots().find((slot) => slot.id === first.id)?.name).toBe("长 名称");
    expect(deleteWorldSlot(second.id)).toBe(true);
    expect(listWorldSlots().map((slot) => slot.id)).toEqual([first.id]);
    expect(loadActiveWorld()?.id).toBe(first.id);
  });

  it("migrates the pre-slot save without losing its world data", () => {
    const legacyWorld = new VoxelWorld(71, 2);
    localStorage.setItem("voxel-atelier-save-v1", JSON.stringify({ world: legacyWorld.snapshot(), player: player() }));
    const migrated = loadActiveWorld();
    expect(migrated?.name).toBe("原有世界");
    expect(migrated?.save.world.seed).toBe(71);
    expect(localStorage.getItem("voxel-atelier-save-v1")).toBeNull();
  });

  it("normalises blank and overly long names", () => {
    expect(normaliseWorldName("   ")).toBe("未命名世界");
    expect(normaliseWorldName("x".repeat(40))).toHaveLength(32);
  });

  it("can clear every local slot", () => {
    createWorldSlot("临时", new VoxelWorld(1, 2), player());
    clearSave();
    expect(listWorldSlots()).toEqual([]);
  });
});
