import { describe, expect, it } from "vitest";
import {
  iconFor,
  iconLabel,
  iconMeta,
  isDistributableIcon,
  listMappedItemIds,
} from "../src/icons";

describe("wiki icon mapping", () => {
  it("maps core hotbar blocks to restricted preview textures", () => {
    for (const id of ["grass", "dirt", "stone", "wood", "planks", "sand", "bricks", "glass", "torch"]) {
      const meta = iconMeta(id);
      expect(meta).toBeTruthy();
      expect(meta!.bucket).toBe("restricted");
      expect(meta!.texture).toContain(`cache/restricted/${id}.`);
      expect(iconFor(id)).toMatch(/\/assets\/icons\/cache\/restricted\//);
      expect(iconLabel(id, id)).toBeTruthy();
    }
  });

  it("does not treat restricted icons as distributable ship assets", () => {
    expect(isDistributableIcon("grass")).toBe(false);
    expect(iconFor("grass", { allowRestricted: false })).toBeNull();
  });

  it("covers a broad catalog of game ids", () => {
    expect(listMappedItemIds().length).toBeGreaterThan(40);
  });
});
