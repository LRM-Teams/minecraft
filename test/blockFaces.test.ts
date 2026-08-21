import { describe, expect, it } from "vitest";
import { BOX_FACES, DISTINCT_CAP_TYPES, faceIsCap, faceTextureKey } from "../src/blockFaces";

describe("block face materials (LRM-1604)", () => {
  it("maps BoxGeometry slots to top/bottom/side (six faces)", () => {
    expect(BOX_FACES).toHaveLength(6);
    expect(BOX_FACES[2]).toBe("top");
    expect(BOX_FACES[3]).toBe("bottom");
    expect(BOX_FACES.filter((f) => f === "side")).toHaveLength(4);
  });

  it("uses distinct cache keys per face so icon wallpaper cannot share one map", () => {
    expect(faceTextureKey("wood", "top")).toBe("wood-top");
    expect(faceTextureKey("wood", "side")).toBe("wood-side");
    expect(faceTextureKey("wood", "top")).not.toBe(faceTextureKey("wood", "side"));
  });

  it("marks JE-style caps (grass / log / stations) as distinct top-bottom", () => {
    expect(DISTINCT_CAP_TYPES.has("grass")).toBe(true);
    expect(DISTINCT_CAP_TYPES.has("wood")).toBe(true);
    expect(DISTINCT_CAP_TYPES.has("crafting_table")).toBe(true);
    expect(faceIsCap("top")).toBe(true);
    expect(faceIsCap("side")).toBe(false);
  });
});
