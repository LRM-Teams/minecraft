import { describe, expect, it } from "vitest";
import { hasBlockFaceAssets, listManifestBlockIds } from "../src/blockAssets";

describe("LRM-1607 block face assets", () => {
  it("exposes grass/wood/planks from the LRM-1603 manifest", () => {
    const ids = listManifestBlockIds();
    expect(ids).toEqual(expect.arrayContaining(["grass", "wood", "planks", "dirt", "stone"]));
  });

  it("resolves face PNG urls for core overworld blocks", () => {
    expect(hasBlockFaceAssets("grass")).toBe(true);
    expect(hasBlockFaceAssets("wood")).toBe(true);
    expect(hasBlockFaceAssets("crafting_table")).toBe(false);
  });
});
