import { describe, expect, it } from "vitest";
import { breakDuration, isMineable } from "../src/mining";

describe("mining", () => {
  it("keeps hard blocks slower than soil", () => {
    expect(breakDuration("stone")).toBeGreaterThan(breakDuration("dirt"));
  });

  it("does not allow collecting environmental water as a normal block", () => {
    expect(isMineable("water")).toBe(false);
  });
});
