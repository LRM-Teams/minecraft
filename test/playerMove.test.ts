import { describe, expect, it } from "vitest";
import { findStandFloor, walkEyeY, PLAYER_EYE } from "../src/playerMove";

/** Column map: y → solid? Missing = air. */
const column = (solids: number[]): ((x: number, y: number, z: number) => boolean) => {
  const set = new Set(solids);
  return (_x, y, _z) => set.has(y);
};

describe("playerMove 2-block clearance", () => {
  it("allows a 2-high tunnel under a higher ceiling (not column topY)", () => {
    // Floor 4, air 5–6, ceiling 7..10 — topY would be 10 and wrongly block.
    const solid = column([0, 1, 2, 3, 4, 7, 8, 9, 10]);
    const eye = 4 + PLAYER_EYE;
    expect(findStandFloor(solid, 0, 0, eye)).toBe(4);
    expect(walkEyeY(solid, 1, 0, eye)).toBe(eye);
  });

  it("blocks a 1-high crawl space", () => {
    const solid = column([0, 1, 2, 3, 4, 6, 7]);
    const eye = 4 + PLAYER_EYE;
    expect(findStandFloor(solid, 0, 0, eye)).toBeNull();
    expect(walkEyeY(solid, 1, 0, eye)).toBeNull();
  });

  it("still stands on open surface", () => {
    const solid = column([0, 1, 2, 3, 4]);
    const eye = 4 + PLAYER_EYE;
    expect(findStandFloor(solid, 0, 0, eye)).toBe(4);
    expect(walkEyeY(solid, 1, 0, eye)).toBe(eye);
  });
});
