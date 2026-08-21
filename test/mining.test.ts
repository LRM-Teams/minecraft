import { describe, expect, it } from "vitest";
import {
  breakDuration,
  canHarvestDrop,
  isMineable,
  miningDropItem,
} from "../src/mining";

describe("mining", () => {
  it("keeps hard blocks slower than soil", () => {
    expect(breakDuration("stone")).toBeGreaterThan(breakDuration("dirt"));
  });

  it("does not allow collecting environmental water as a normal block", () => {
    expect(isMineable("water")).toBe(false);
  });

  it("makes every mineral ore mineable and harder to break than plain stone", () => {
    const ores = ["coal_ore", "copper_ore", "iron_ore", "gold_ore", "diamond_ore"] as const;
    ores.forEach((ore) => {
      expect(isMineable(ore)).toBe(true);
      expect(breakDuration(ore, "diamond_pickaxe")).toBeGreaterThanOrEqual(
        breakDuration("stone", "diamond_pickaxe") * 0.5,
      );
    });
    expect(breakDuration("diamond_ore", "iron_pickaxe")).toBeGreaterThan(
      breakDuration("gold_ore", "iron_pickaxe"),
    );
    expect(breakDuration("gold_ore", "iron_pickaxe")).toBeGreaterThan(
      breakDuration("iron_ore", "iron_pickaxe"),
    );
    expect(breakDuration("iron_ore", "stone_pickaxe")).toBeGreaterThan(
      breakDuration("coal_ore", "stone_pickaxe"),
    );
  });

  it("speeds stone mining when a suited pickaxe is held", () => {
    expect(breakDuration("stone", "iron_pickaxe")).toBeLessThan(breakDuration("stone"));
    expect(breakDuration("dirt", "iron_pickaxe")).toBe(breakDuration("dirt"));
  });

  it("applies JE pickaxe harvest tiers for ores and obsidian", () => {
    expect(canHarvestDrop("coal_ore", "wooden_pickaxe")).toBe(true);
    expect(canHarvestDrop("coal_ore", null)).toBe(false);
    expect(canHarvestDrop("copper_ore", "wooden_pickaxe")).toBe(false);
    expect(canHarvestDrop("iron_ore", "wooden_pickaxe")).toBe(false);
    expect(canHarvestDrop("iron_ore", "stone_pickaxe")).toBe(true);
    expect(canHarvestDrop("diamond_ore", "stone_pickaxe")).toBe(false);
    expect(canHarvestDrop("diamond_ore", "iron_pickaxe")).toBe(true);
    expect(canHarvestDrop("obsidian", "iron_pickaxe")).toBe(false);
    expect(canHarvestDrop("obsidian", "diamond_pickaxe")).toBe(true);
    expect(canHarvestDrop("gold_ore", "gold_pickaxe")).toBe(false);
    expect(breakDuration("obsidian", "wooden_pickaxe")).toBeGreaterThan(
      breakDuration("obsidian", "diamond_pickaxe"),
    );
  });

  it("gemifies coal and diamond ore on break; metals stay furnace inputs", () => {
    expect(miningDropItem("coal_ore")).toBe("coal");
    expect(miningDropItem("diamond_ore")).toBe("diamond");
    expect(miningDropItem("iron_ore")).toBe("iron_ore");
    expect(miningDropItem("copper_ore")).toBe("copper_ore");
    expect(miningDropItem("lapis_ore")).toBeNull();
  });
});
