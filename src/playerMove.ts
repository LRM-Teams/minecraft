/** Eye height above the stand-block Y (matches main.ts spawn/ground). */
export const PLAYER_EYE = 1.72;

/** Vanilla-ish body needs two free cells above the stand block. */
export const HEADROOM_BLOCKS = 2;

export type SolidFn = (x: number, y: number, z: number) => boolean;

export const eyeOnFloor = (floorY: number): number => floorY + PLAYER_EYE;

/**
 * Stand floor near `preferEyeY`: solid underfoot, `HEADROOM_BLOCKS` non-solid above.
 * Searches same level, step-down, then 1-block step-up so tunnels under terrain work
 * (column `topY` alone would treat the ceiling as the floor).
 */
export const findStandFloor = (
  solid: SolidFn,
  x: number,
  z: number,
  preferEyeY: number,
): number | null => {
  const ix = Math.round(x);
  const iz = Math.round(z);
  const preferFloor = Math.round(preferEyeY - PLAYER_EYE);
  const candidates = [preferFloor, preferFloor - 1, preferFloor - 2, preferFloor + 1];
  for (const floor of candidates) {
    if (floor < -1) continue;
    if (!solid(ix, floor, iz)) continue;
    let clear = true;
    for (let dy = 1; dy <= HEADROOM_BLOCKS; dy += 1) {
      if (solid(ix, floor + dy, iz)) {
        clear = false;
        break;
      }
    }
    if (clear) return floor;
  }
  return null;
};

/**
 * If the column is walkable at this eye height, return the grounded eye Y.
 * Blocks climbs taller than `maxStep` (legacy 0.85).
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
