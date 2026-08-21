import { describe, expect, it } from "vitest";
import { breakDuration, isMineable } from "../src/mining";

describe("mining", () => {
  it("keeps hard blocks slower than soil", () => {
    expect(breakDuration("stone")).toBeGreaterThan(breakDuration("dirt"));
  });

  it("does not allow collecting environmental water as a normal block", () => {
    expect(isMineable("water")).toBe(false);
  });

  it("makes every mineral ore mineable and harder to break than plain stone", () => {
    const ores = ["coal_ore", "copper_ore", "iron_ore", "gold_ore", "diamond_ore"] as const;
    const stoneTime = breakDuration("stone");
    ores.forEach((ore) => {
      expect(isMineable(ore)).toBe(true);
      expect(breakDuration(ore)).toBeGreaterThanOrEqual(stoneTime);
    });
    // Rarer ores are progressively slower to extract.
    expect(breakDuration("diamond_ore")).toBeGreaterThan(breakDuration("gold_ore"));
    expect(breakDuration("gold_ore")).toBeGreaterThan(breakDuration("iron_ore"));
    expect(breakDuration("iron_ore")).toBeGreaterThan(breakDuration("coal_ore"));
  });

  it("speeds stone mining when a suited pickaxe is held", () => {
    expect(breakDuration("stone", "iron_pickaxe")).toBeLessThan(breakDuration("stone"));
    expect(breakDuration("dirt", "iron_pickaxe")).toBe(breakDuration("dirt"));
  });
});
