import { describe, expect, it } from "vitest";
import manifest from "../assets/blocks/manifest.json";

const CORE = [
  "grass",
  "dirt",
  "stone",
  "wood",
  "planks",
  "sand",
  "leaves",
  "water",
  "cobblestone",
  "bricks",
] as const;

const FACES = ["top", "bottom", "side"] as const;

const faceUrls = import.meta.glob("../assets/blocks/*_*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const resolveFace = (blockId: string, face: string): string | undefined => {
  const suffix = `/${blockId}_${face}.png`;
  return Object.entries(faceUrls).find(([path]) => path.endsWith(suffix))?.[1];
};

describe("LRM-1603 original cube-face textures", () => {
  it("declares independent top/bottom/side files for every core block", () => {
    expect(manifest.size).toBe(16);
    expect(manifest.license).toBe("cc0-original-procedural");
    expect(manifest.naming).toBe("{blockId}_{face}.png");
    expect(manifest.directory).toBe("assets/blocks");
    for (const id of CORE) {
      const row = manifest.blocks[id];
      expect(row, id).toBeTruthy();
      for (const face of FACES) {
        expect(row[face], `${id}.${face}`).toBe(`${id}_${face}.png`);
        expect(resolveFace(id, face), `${id}_${face}.png`).toBeTruthy();
      }
      const maps = row.three_box_maps;
      expect(maps).toEqual(["side", "side", "top", "bottom", "side", "side"]);
      expect(new Set(maps).size, `${id} must not use one map on all six faces`).toBeGreaterThan(1);
    }
  });

  it("does not point world faces at HUD icons or wiki restricted cache", () => {
    for (const id of CORE) {
      const row = manifest.blocks[id];
      for (const face of FACES) {
        expect(row[face]).toBe(`${id}_${face}.png`);
        expect(row[face]).not.toMatch(/icons\//);
        expect(row[face]).not.toMatch(/restricted/);
        expect(row[face]).not.toMatch(/wiki/i);
      }
    }
    expect(manifest.engine_hint.note).toMatch(/never iconFor/);
  });

  it("does not glob preview sheets as face maps", () => {
    expect(Object.keys(faceUrls).some((path) => path.includes("/preview/"))).toBe(false);
    expect(Object.keys(faceUrls).length).toBe(CORE.length * FACES.length);
  });
});
