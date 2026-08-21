/** Eye height above the stand-block Y (legacy spawn/ground constant in main). */
export const PLAYER_EYE = 1.72;

/** Vanilla-ish standing height (feet → head top). */
export const PLAYER_HEIGHT = 1.8;

/** Half-width of the player AABB (~0.6 wide). */
export const PLAYER_HALF_WIDTH = 0.3;

/** Body needs two free cells above the stand block. */
export const HEADROOM_BLOCKS = 2;

export type SolidFn = (x: number, y: number, z: number) => boolean;

export const eyeOnFloor = (floorY: number): number => floorY + PLAYER_EYE;

/** Four corner samples of the horizontal AABB. */
export const footprintSamples = (x: number, z: number): Array<[number, number]> => {
  const h = PLAYER_HALF_WIDTH;
  return [
    [x - h, z - h],
    [x + h, z - h],
    [x - h, z + h],
    [x + h, z + h],
  ];
};

const columnClearAbove = (solid: SolidFn, ix: number, iz: number, floor: number): boolean => {
  for (let dy = 1; dy <= HEADROOM_BLOCKS; dy += 1) {
    if (solid(ix, floor + dy, iz)) return false;
  }
  return true;
};

/**
 * Stand floor near `preferEyeY`: every footprint corner has solid underfoot and
 * `HEADROOM_BLOCKS` of non-solid above (so 2-block tunnels work; column `topY` does not).
 */
export const findStandFloor = (
  solid: SolidFn,
  x: number,
  z: number,
  preferEyeY: number,
): number | null => {
  const preferFloor = Math.round(preferEyeY - PLAYER_EYE);
  const candidates = [preferFloor, preferFloor - 1, preferFloor - 2, preferFloor + 1];
  for (const floor of candidates) {
    if (floor < -1) continue;
    let ok = true;
    for (const [sx, sz] of footprintSamples(x, z)) {
      const ix = Math.round(sx);
      const iz = Math.round(sz);
      if (!solid(ix, floor, iz) || !columnClearAbove(solid, ix, iz, floor)) {
        ok = false;
        break;
      }
    }
    if (ok) return floor;
  }
  return null;
};

/**
 * If the AABB is walkable at this eye height, return the grounded eye Y.
 * Blocks climbs taller than `maxStep` (legacy ~0.85 auto-step).
 */
export const walkEyeY = (
  solid: SolidFn,
  x: number,
  z: number,
  eyeY: number,
  maxStep = 0.85,
): number | null => {
  const floor = findStandFloor(solid, x, z, eyeY);
  if (floor === null) return null;
  const nextEye = eyeOnFloor(floor);
  if (nextEye > eyeY + maxStep) return null;
  return nextEye;
};

/** World Y of the top of the player's head at the given eye height. */
export const headTopY = (eyeY: number): number => eyeY - PLAYER_EYE + PLAYER_HEIGHT;

/**
 * When rising into a solid ceiling, return a clipped eye Y and signal a bump.
 * Falling / grounded paths leave `eyeY` unchanged.
 */
export const clipEyeAgainstCeiling = (
  solid: SolidFn,
  x: number,
  z: number,
  eyeY: number,
  rising: boolean,
): { eyeY: number; bumped: boolean } => {
  if (!rising) return { eyeY, bumped: false };
  const top = headTopY(eyeY);
  const hy = Math.floor(top + 1e-4);
  for (const [sx, sz] of footprintSamples(x, z)) {
    if (solid(Math.round(sx), hy, Math.round(sz))) {
      const clipped = hy - (PLAYER_HEIGHT - PLAYER_EYE) - 1e-3;
      return { eyeY: Math.min(eyeY, clipped), bumped: true };
    }
  }
  return { eyeY, bumped: false };
};
