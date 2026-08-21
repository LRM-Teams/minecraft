import { describe, expect, it } from "vitest";
import {
  PLAYER_EYE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  bodyBlockedAt,
  findStandFloor,
  walkEyeY,
  tryHorizontalMove,
  resolveVertical,
  eyeOnFloor,
} from "../src/playerMove";

/** Column map: y → solid? Missing = air. */
const column = (solids: number[]): ((x: number, y: number, z: number) => boolean) => {
  const set = new Set(solids);
  return (_x, y, _z) => set.has(y);
};

/** Sparse 3D solid map keyed "x,y,z". */
const grid = (cells: Array<[number, number, number]>): ((x: number, y: number, z: number) => boolean) => {
  const set = new Set(cells.map(([x, y, z]) => `${x},${y},${z}`));
  return (x, y, z) => set.has(`${x},${y},${z}`);
};

describe("player AABB dimensions (JE)", () => {
  it("uses vanilla standing size", () => {
    expect(PLAYER_WIDTH).toBeCloseTo(0.6);
    expect(PLAYER_HEIGHT).toBeCloseTo(1.8);
    expect(PLAYER_EYE).toBeCloseTo(1.62);
  });
});

describe("playerMove 2-block clearance", () => {
  it("allows a 2-high tunnel under a higher ceiling (not column topY)", () => {
    // Floor 4, air 5–6, ceiling 7..10 — topY would be 10 and wrongly block.
    const solid = column([0, 1, 2, 3, 4, 7, 8, 9, 10]);
    const eye = 4 + PLAYER_EYE;
    expect(findStandFloor(solid, 0, 0, eye)).toBe(4);
    expect(walkEyeY(solid, 1, 0, eye)).toBe(eye);
    expect(bodyBlockedAt(solid, 0, eye, 0)).toBe(false);
  });

  it("blocks a 1-high crawl space", () => {
    const solid = column([0, 1, 2, 3, 4, 6, 7]);
    const eye = 4 + PLAYER_EYE;
    expect(findStandFloor(solid, 0, 0, eye)).toBeNull();
    expect(walkEyeY(solid, 1, 0, eye)).toBeNull();
    expect(bodyBlockedAt(solid, 0, eye, 0)).toBe(true);
  });

  it("still stands on open surface", () => {
    const solid = column([0, 1, 2, 3, 4]);
    const eye = 4 + PLAYER_EYE;
    expect(findStandFloor(solid, 0, 0, eye)).toBe(4);
    expect(walkEyeY(solid, 1, 0, eye)).toBe(eye);
  });

  it("allows a 3-high passage", () => {
    const solid = column([0, 1, 2, 3, 4, 8, 9]);
    const eye = 4 + PLAYER_EYE;
    expect(findStandFloor(solid, 0, 0, eye)).toBe(4);
    expect(bodyBlockedAt(solid, 0, eye, 0)).toBe(false);
  });
});

describe("horizontal AABB + step-up", () => {
  it("walks into a 2-block tunnel from open ground beside a tall wall", () => {
    // z=0 open surface at y=4; z=1 is tunnel floor 4 with ceiling at 7.
    const solid = grid([
      [0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [0, 4, 0],
      [0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1],
      [0, 7, 1], [0, 8, 1], [0, 9, 1], [0, 10, 1],
    ]);
    const eye = eyeOnFloor(4);
    const moved = tryHorizontalMove(solid, 0, eye, 0, 0, 1);
    expect(moved.z).toBeCloseTo(1);
    expect(moved.eyeY).toBeCloseTo(eye);
  });

  it("refuses a 1-block crawl beside open ground", () => {
    const solid = grid([
      [0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [0, 4, 0],
      [0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1],
      [0, 6, 1], [0, 7, 1],
    ]);
    const eye = eyeOnFloor(4);
    const moved = tryHorizontalMove(solid, 0, eye, 0, 0, 1);
    expect(moved.z).toBeCloseTo(0);
  });

  it("steps up a 1-block ledge", () => {
    const solid = grid([
      [0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [0, 4, 0],
      [0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1],
    ]);
    const eye = eyeOnFloor(4);
    const moved = tryHorizontalMove(solid, 0, eye, 0, 0, 1);
    expect(moved.z).toBeCloseTo(1);
    expect(moved.eyeY).toBeCloseTo(eyeOnFloor(5));
  });

  it("does not step up a 2-block wall", () => {
    const solid = grid([
      [0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [0, 4, 0],
      [0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1], [0, 6, 1],
    ]);
    const eye = eyeOnFloor(4);
    const moved = tryHorizontalMove(solid, 0, eye, 0, 0, 1);
    expect(moved.z).toBeCloseTo(0);
    expect(moved.eyeY).toBeCloseTo(eye);
  });
});

describe("vertical jump / land", () => {
  it("clips ascent when head hits a ceiling", () => {
    // Floor 4, ceiling solid at 7 → headroom 5–6; jump from standing should stop.
    const solid = column([0, 1, 2, 3, 4, 7, 8]);
    const eye = eyeOnFloor(4);
    const hit = resolveVertical(solid, 0, eye, 0, 8, 0.2);
    expect(hit.verticalVelocity).toBe(0);
    expect(bodyBlockedAt(solid, 0, hit.eyeY, 0)).toBe(false);
    expect(hit.eyeY).toBeLessThan(eye + 8 * 0.2);
  });

  it("lands on local floor under a tunnel, not column topY", () => {
    const solid = column([0, 1, 2, 3, 4, 7, 8, 9, 10]);
    const startEye = eyeOnFloor(4) + 0.4;
    const land = resolveVertical(solid, 0, startEye, 0, -5, 0.2);
    expect(land.grounded).toBe(true);
    expect(land.eyeY).toBeCloseTo(eyeOnFloor(4));
  });

  it("falls through open air without snapping to distant topY", () => {
    // Only a high overhang column — player mid-air below it should keep falling.
    const solid = column([10, 11, 12]);
    const eye = 5 + PLAYER_EYE;
    const fall = resolveVertical(solid, 0, eye, 0, -2, 0.1);
    expect(fall.grounded).toBe(false);
    expect(fall.eyeY).toBeCloseTo(eye - 0.2);
  });
});
