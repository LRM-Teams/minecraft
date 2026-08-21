import { describe, expect, it } from "vitest";
import { CRACK_STAGES, crackStageForProgress, heldKind } from "../src/viewmodel";

describe("LRM-1606 viewmodel helpers", () => {
  it("maps mining progress to discrete crack stages", () => {
    expect(crackStageForProgress(0)).toBe(-1);
    expect(crackStageForProgress(0.01)).toBe(0);
    expect(crackStageForProgress(0.5)).toBe(Math.floor(0.5 * CRACK_STAGES));
    expect(crackStageForProgress(0.99)).toBe(CRACK_STAGES - 1);
    expect(crackStageForProgress(1)).toBe(CRACK_STAGES - 1);
  });

  it("prefers equipped tool over hotbar block for held display kind", () => {
    expect(heldKind("dirt", "iron_pickaxe")).toEqual({ kind: "tool", display: "iron_pickaxe" });
    expect(heldKind("dirt", null)).toEqual({ kind: "block", display: "dirt" });
    expect(heldKind("diamond_sword", null)).toEqual({ kind: "sword", display: "diamond_sword" });
    expect(heldKind(null, null)).toEqual({ kind: "empty", display: null });
  });
});
