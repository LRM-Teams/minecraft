import { describe, expect, it } from "vitest";
import { hasBlockFaceAssets, listManifestBlockIds } from "../src/blockAssets";

/** LRM-1612 ore/obsidian six-faces consumed by LRM-1610 world meshes via blockAssets. */
const ORE_FACE_IDS = [
  "coal_ore",
  "copper_ore",
  "iron_ore",
  "gold_ore",
  "diamond_ore",
  "lapis_ore",
  "redstone_ore",
  "obsidian",
] as const;

describe("LRM-1607/1610 block face assets", () => {
  it("exposes grass/wood/planks from the LRM-1603 manifest", () => {
    const ids = listManifestBlockIds();
    expect(ids).toEqual(expect.arrayContaining(["grass", "wood", "planks", "dirt", "stone"]));
  });

  it("resolves face PNG urls for core overworld blocks", () => {
    expect(hasBlockFaceAssets("grass")).toBe(true);
    expect(hasBlockFaceAssets("wood")).toBe(true);
    expect(hasBlockFaceAssets("crafting_table")).toBe(false);
  });

  it("resolves LRM-1612 ore/obsidian six-faces for world meshes (not HUD icons)", () => {
    const ids = listManifestBlockIds();
    for (const id of ORE_FACE_IDS) {
      expect(ids, id).toContain(id);
      expect(hasBlockFaceAssets(id), id).toBe(true);
    }
  });
});
