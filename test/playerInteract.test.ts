import { describe, expect, it } from "vitest";
import {
  emptyHotbarFeedback,
  isInteractableBlock,
  resolveRightClick,
} from "../src/playerInteract";

describe("resolveRightClick", () => {
  it("returns empty when hotbar slot has no blocks (no silent no-op)", () => {
    expect(
      resolveRightClick({ aimedBlock: "stone", holdingBlock: false, sneaking: false }),
    ).toBe("empty");
    expect(emptyHotbarFeedback("草方块")).toContain("草方块");
  });

  it("opens interactables when not sneaking", () => {
    expect(isInteractableBlock("crafting_table")).toBe(true);
    expect(
      resolveRightClick({ aimedBlock: "crafting_table", holdingBlock: true, sneaking: false }),
    ).toBe("interact");
    expect(
      resolveRightClick({ aimedBlock: "furnace", holdingBlock: true, sneaking: false }),
    ).toBe("interact");
  });

  it("force-places on interactables while sneaking (Shift)", () => {
    expect(
      resolveRightClick({ aimedBlock: "crafting_table", holdingBlock: true, sneaking: true }),
    ).toBe("place");
  });

  it("places against ordinary blocks", () => {
    expect(
      resolveRightClick({ aimedBlock: "dirt", holdingBlock: true, sneaking: false }),
    ).toBe("place");
  });
});
