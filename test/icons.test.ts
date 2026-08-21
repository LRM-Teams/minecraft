import { describe, expect, it } from "vitest";
import {
  iconFor,
  iconLabel,
  iconMeta,
  isDistributableIcon,
  listMappedItemIds,
} from "../src/icons";
import { BLOCK_TYPES } from "../src/world";
import { DEFAULT_HOTBAR } from "../src/hotbar";

describe("wiki icon mapping", () => {
  it("maps every implemented block type to a resolvable preview texture", () => {
    for (const id of BLOCK_TYPES) {
      const meta = iconMeta(id);
      expect(meta, id).toBeTruthy();
      expect(meta!.bucket, id).not.toBe("unknown");
      expect(meta!.texture, id).toMatch(/^cache\/(restricted|distributable)\//);
      expect(iconFor(id), id).toBeTruthy();
      expect(iconLabel(id, id), id).toBeTruthy();
    }
  });

  it("maps default hotbar slots to restricted wiki-aligned icons", () => {
    for (const id of DEFAULT_HOTBAR) {
      const meta = iconMeta(id);
      expect(meta!.bucket).toBe("restricted");
      expect(meta!.texture).toContain(`cache/restricted/${id}.`);
      expect(iconFor(id)).toMatch(/\/assets\/icons\/cache\/restricted\//);
    }
  });

  it("does not treat restricted icons as distributable ship assets", () => {
    expect(isDistributableIcon("grass")).toBe(false);
    expect(iconFor("grass", { allowRestricted: false })).toBeNull();
    for (const id of BLOCK_TYPES) {
      const meta = iconMeta(id)!;
      if (meta.bucket === "restricted") {
        expect(meta.texture).not.toMatch(/cache\/distributable\//);
      }
    }
  });

  it("covers a broad catalog of game ids", () => {
    expect(listMappedItemIds().length).toBeGreaterThan(40);
  });
});
