import { describe, expect, it } from "vitest";
import {
  clipEyeAgainstCeiling,
  findStandFloor,
  footprintSamples,
  PLAYER_EYE,
  PLAYER_HALF_WIDTH,
  walkEyeY,
} from "../src/playerMove";

/** Full-column solid set for a single xz (used when footprint collapses to one cell). */
const column = (solids: number[]): ((x: number, y: number, z: number) => boolean) => {
  const set = new Set(solids);
  return (_x, y, _z) => set.has(y);
};

describe("playerMove 2-block clearance", () => {
  it("allows a 2-high tunnel under a higher ceiling (not column topY)", () => {
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

  it("samples a ~0.6-wide footprint", () => {
    const pts = footprintSamples(0, 0);
    expect(pts).toHaveLength(4);
    expect(pts.every(([x, z]) => Math.abs(x) === PLAYER_HALF_WIDTH && Math.abs(z) === PLAYER_HALF_WIDTH)).toBe(true);
  });

  it("clips rising eye against a ceiling cell", () => {
    const solid = column([6]);
    const rising = clipEyeAgainstCeiling(solid, 0, 0, 5.95, true);
    expect(rising.bumped).toBe(true);
    expect(rising.eyeY).toBeLessThan(5.95);
    expect(clipEyeAgainstCeiling(solid, 0, 0, 4 + PLAYER_EYE, false).bumped).toBe(false);
  });
});
