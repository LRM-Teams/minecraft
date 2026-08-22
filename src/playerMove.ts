/**
 * Vanilla-aligned player collision (JE standing):
 * width 0.6, height 1.8, eye height 1.62.
 *
 * World convention (unchanged): stand-block integer Y is the feet reference;
 * eye = floorY + PLAYER_EYE. Body occupies air cells floor+1 .. floor+2 for a
 * 2-block tunnel. Never use column `topY` alone — that treats ceilings as floor.
 */

/** JE standing eye height above feet / stand-block Y. */
export const PLAYER_EYE = 1.62;
/** JE player hitbox width. */
export const PLAYER_WIDTH = 0.6;
/** JE player hitbox height. */
export const PLAYER_HEIGHT = 1.8;
/** Half-width for footprint sampling. */
export const PLAYER_HALF_WIDTH = PLAYER_WIDTH / 2;
/** Body needs this many free cells above the stand block (2-high door/cave). */
export const HEADROOM_BLOCKS = 2;
/** Auto step-up height in blocks (full slab / 1-block step). */
export const MAX_STEP_BLOCKS = 1;

export type SolidFn = (x: number, y: number, z: number) => boolean;

export const feetYFromEye = (eyeY: number): number => eyeY - PLAYER_EYE;
export const headYFromEye = (eyeY: number): number => feetYFromEye(eyeY) + PLAYER_HEIGHT;
export const eyeOnFloor = (floorY: number): number => floorY + PLAYER_EYE;

/** Integer columns overlapped by the 0.6-wide AABB (JE floor-based block query). */
export const footprintColumns = (x: number, z: number): Array<[number, number]> => {
  const eps = 1e-4;
  const minX = x - PLAYER_HALF_WIDTH + eps;
  const maxX = x + PLAYER_HALF_WIDTH - eps;
  const minZ = z - PLAYER_HALF_WIDTH + eps;
  const maxZ = z + PLAYER_HALF_WIDTH - eps;
  const out: Array<[number, number]> = [];
  for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx += 1) {
    for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz += 1) {
      out.push([bx, bz]);
    }
  }
  return out;
};

/** Body Y cells above the stand reference, covering JE 1.8 height (2 cells). */
export const bodyYRange = (eyeY: number): { yMin: number; yMax: number } => {
  const feet = feetYFromEye(eyeY);
  const head = headYFromEye(eyeY);
  const yMin = Math.floor(feet + 1e-4) + 1;
  // Geometric head cell, padded to HEADROOM_BLOCKS so feet-at-solidY matches
  // a 2-high door (pure floor(head) alone only spans one air cell).
  const yMax = Math.max(Math.floor(head - 1e-4), yMin + HEADROOM_BLOCKS - 1);
  return { yMin, yMax };
};

/** True if any solid intersects the player AABB at (x, eyeY, z). */
export const bodyBlockedAt = (
  solid: SolidFn,
  x: number,
  eyeY: number,
  z: number,
): boolean => {
  const { yMin, yMax } = bodyYRange(eyeY);
  if (yMax < yMin) return false;
  for (const [bx, bz] of footprintColumns(x, z)) {
    for (let by = yMin; by <= yMax; by += 1) {
      if (solid(bx, by, bz)) return true;
    }
  }
  return false;
};

/** At least one footprint column has a solid stand block at `floor`. */
export const hasFootSupport = (
  solid: SolidFn,
  x: number,
  z: number,
  floor: number,
): boolean => footprintColumns(x, z).some(([bx, bz]) => solid(bx, floor, bz));

/**
 * Stand floor near `preferEyeY`: support underfoot + `HEADROOM_BLOCKS` clear
 * body cells (AABB). Searches same level, step-down, then 1-block step-up.
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
    if (!hasFootSupport(solid, x, z, floor)) continue;
    const eye = eyeOnFloor(floor);
    if (bodyBlockedAt(solid, x, eye, z)) continue;
    // Explicit 2-block headroom (matches JE door / 2-high cave).
    let clear = true;
    for (const [bx, bz] of footprintColumns(x, z)) {
      for (let dy = 1; dy <= HEADROOM_BLOCKS; dy += 1) {
        if (solid(bx, floor + dy, bz)) {
          clear = false;
          break;
        }
      }
      if (!clear) break;
    }
    if (clear) return floor;
  }
  return null;
};

/**
 * If walkable at this eye height, return grounded eye Y.
 * Blocks climbs taller than `maxStep` (default 1 block).
 */
export const walkEyeY = (
  solid: SolidFn,
  x: number,
  z: number,
  eyeY: number,
  maxStep = MAX_STEP_BLOCKS,
): number | null => {
  const floor = findStandFloor(solid, x, z, eyeY);
  if (floor === null) return null;
  const nextEye = eyeOnFloor(floor);
  if (nextEye > eyeY + maxStep + 1e-6) return null;
  return nextEye;
};

/**
 * Try horizontal displacement with AABB body checks and 1-block step-up.
 * Axis-separated so wall slides still work.
 */
export const tryHorizontalMove = (
  solid: SolidFn,
  x: number,
  eyeY: number,
  z: number,
  dx: number,
  dz: number,
  maxStep = MAX_STEP_BLOCKS,
): { x: number; eyeY: number; z: number } => {
  let nx = x;
  let ny = eyeY;
  let nz = z;

  const tryAxis = (axis: "x" | "z", delta: number): void => {
    if (delta === 0) return;
    const tx = axis === "x" ? nx + delta : nx;
    const tz = axis === "z" ? nz + delta : nz;
    if (!bodyBlockedAt(solid, tx, ny, tz)) {
      const stand = findStandFloor(solid, tx, tz, ny);
      // Allow air-walk while airborne; on ground prefer a stand floor within step.
      if (stand === null) {
        // Still allow if body is clear (jumping through open space / falling).
        nx = tx;
        nz = tz;
        return;
      }
      const standEye = eyeOnFloor(stand);
      if (standEye <= ny + maxStep + 1e-6) {
        nx = tx;
        nz = tz;
        // Step-up only when climbing; do not pull down mid-jump.
        if (standEye > ny + 1e-4 && standEye - ny <= maxStep + 1e-6) {
          ny = standEye;
        }
      }
      return;
    }
    // Blocked at current height — try step-up then move.
    for (let step = 1; step <= maxStep; step += 1) {
      const steppedEye = ny + step;
      if (bodyBlockedAt(solid, nx, steppedEye, nz)) continue;
      if (bodyBlockedAt(solid, tx, steppedEye, tz)) continue;
      const stand = findStandFloor(solid, tx, tz, steppedEye);
      if (stand === null) continue;
      const standEye = eyeOnFloor(stand);
      if (Math.abs(standEye - steppedEye) > 0.05 && standEye > steppedEye) continue;
      nx = tx;
      nz = tz;
      ny = standEye;
      return;
    }
  };

  tryAxis("x", dx);
  tryAxis("z", dz);
  return { x: nx, eyeY: ny, z: nz };
};

/**
 * Apply vertical velocity: ceiling clips ascent; landing uses underfoot support
 * (never column topY).
 */
export const resolveVertical = (
  solid: SolidFn,
  x: number,
  eyeY: number,
  z: number,
  verticalVelocity: number,
  delta: number,
): { eyeY: number; verticalVelocity: number; grounded: boolean } => {
  let nextEye = eyeY + verticalVelocity * delta;
  let vy = verticalVelocity;
  let grounded = false;

  if (vy > 0) {
    // Rising — truncate so head does not enter solids.
    if (bodyBlockedAt(solid, x, nextEye, z)) {
      // Binary search largest clear eye between eyeY and nextEye.
      let lo = eyeY;
      let hi = nextEye;
      for (let i = 0; i < 12; i += 1) {
        const mid = (lo + hi) / 2;
        if (bodyBlockedAt(solid, x, mid, z)) hi = mid;
        else lo = mid;
      }
      nextEye = lo;
      vy = 0;
    }
  }

  const stand = findStandFloor(solid, x, z, nextEye);
  if (stand !== null) {
    const groundEye = eyeOnFloor(stand);
    if (nextEye <= groundEye + 1e-4) {
      nextEye = groundEye;
      vy = 0;
      grounded = true;
    }
  } else if (vy <= 0) {
    // Falling with no nearby stand: scan down a few blocks for a real floor
    // under the footprint (still not column topY).
    const prefer = Math.round(nextEye - PLAYER_EYE);
    for (let floor = prefer; floor >= prefer - 4; floor -= 1) {
      if (floor < -1) break;
      if (!hasFootSupport(solid, x, z, floor)) continue;
      const probeEye = eyeOnFloor(floor);
      if (bodyBlockedAt(solid, x, probeEye, z)) continue;
      let clear = true;
      for (const [bx, bz] of footprintColumns(x, z)) {
        for (let dy = 1; dy <= HEADROOM_BLOCKS; dy += 1) {
          if (solid(bx, floor + dy, bz)) {
            clear = false;
            break;
          }
        }
        if (!clear) break;
      }
      if (!clear) continue;
      if (nextEye <= probeEye + 1e-4) {
        nextEye = probeEye;
        vy = 0;
        grounded = true;
      }
      break;
    }
  }

  return { eyeY: nextEye, verticalVelocity: vy, grounded };
};
