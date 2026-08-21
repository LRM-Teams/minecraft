import { describe, expect, it } from "vitest";
import {
  iconAtlasFrame,
  iconAtlasUrl,
  iconFor,
  iconLabel,
  iconMeta,
  isDistributableIcon,
  listMappedItemIds,
  listShipCoreIds,
  shipUsesDistributableOnly,
} from "../src/icons";
import { BLOCK_TYPES } from "../src/world";
import { DEFAULT_HOTBAR } from "../src/hotbar";
import iconsSource from "../src/icons.ts?raw";

describe("distributable icon mapping + atlas", () => {
  it("maps every implemented block type to a ship-ready distributable texture", () => {
    for (const id of BLOCK_TYPES) {
      const meta = iconMeta(id);
      expect(meta, id).toBeTruthy();
      expect(meta!.bucket, id).toBe("distributable");
      expect(meta!.license, id).toBe("cc0-original-procedural");
      expect(meta!.texture, id).toBe(`cache/distributable/${id}.png`);
      expect(iconFor(id), id).toBeTruthy();
      expect(iconFor(id)!, id).toMatch(/\/assets\/icons\/cache\/distributable\//);
      expect(iconLabel(id, id), id).toBeTruthy();
      expect(isDistributableIcon(id), id).toBe(true);
      const frame = iconAtlasFrame(id);
      expect(frame, id).toBeTruthy();
      expect(frame!.w).toBe(16);
      expect(frame!.h).toBe(16);
    }
  });

  it("maps default hotbar slots to distributable icons (no restricted)", () => {
    for (const id of DEFAULT_HOTBAR) {
      const meta = iconMeta(id);
      expect(meta!.bucket).toBe("distributable");
      expect(meta!.texture).toContain(`cache/distributable/${id}.`);
      expect(iconFor(id)).toMatch(/\/assets\/icons\/cache\/distributable\//);
    }
  });

  it("ships the full catalog on distributable + atlas", () => {
    expect(listMappedItemIds().length).toBeGreaterThan(40);
    expect(shipUsesDistributableOnly()).toBe(true);
    expect(iconAtlasUrl()).toMatch(/atlas\.png/);
    expect(listShipCoreIds().length).toBe(BLOCK_TYPES.length);
    for (const id of BLOCK_TYPES) {
      expect(listShipCoreIds()).toContain(id);
    }
  });

  it("does not resolve restricted paths from the ship mapping", () => {
    for (const id of listMappedItemIds()) {
      const meta = iconMeta(id)!;
      expect(meta.bucket).toBe("distributable");
      expect(meta.texture).not.toMatch(/cache\/restricted\//);
      expect(meta.icon_url).toBeNull();
    }
  });

  it("src/icons.ts only globs the distributable cache", () => {
    expect(iconsSource).toContain("cache/distributable");
    expect(iconsSource).not.toMatch(/cache\/\{distributable,restricted\}/);
    expect(iconsSource).not.toMatch(/cache\/restricted\/\*/);
  });
});

describe("Pages dist must not embed restricted icons", () => {
  it("built assets omit restricted cache paths when dist/ exists", async () => {
    const { existsSync, readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dist = join(process.cwd(), "dist");
    if (!existsSync(dist)) return;
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) out.push(...walk(p));
        else out.push(p);
      }
      return out;
    };
    const files = walk(dist);
    expect(files.some((f) => f.includes("cache/restricted") || f.includes("cache\\restricted"))).toBe(false);
    for (const f of files.filter((p) => /\.(js|css|html|map)$/.test(p))) {
      const text = readFileSync(f, "utf8");
      expect(text.includes("cache/restricted"), f).toBe(false);
      expect(text.includes("restricted-mojang"), f).toBe(false);
    }
  });
});
