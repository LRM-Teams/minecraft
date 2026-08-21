import type { BlockPosition, VoxelWorld } from "./world";
import { isNight, skipToMorning } from "./daycycle";

/** Cardinal facing from player yaw (matches camera forward: -sin/cos). */
export const facingFromYaw = (yaw: number): BlockPosition => {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (Math.abs(fx) >= Math.abs(fz)) return { x: fx >= 0 ? 1 : -1, y: 0, z: 0 };
  return { x: 0, y: 0, z: fz >= 0 ? 1 : -1 };
};

const neighbors4 = (pos: BlockPosition): BlockPosition[] => [
  { x: pos.x + 1, y: pos.y, z: pos.z },
  { x: pos.x - 1, y: pos.y, z: pos.z },
  { x: pos.x, y: pos.y, z: pos.z + 1 },
  { x: pos.x, y: pos.y, z: pos.z - 1 },
];

/** Find the paired bed cell, if any (beds are 2 blocks long). */
export const findBedPair = (world: VoxelWorld, pos: BlockPosition): BlockPosition | undefined => {
  if (world.get(pos.x, pos.y, pos.z) !== "bed") return undefined;
  return neighbors4(pos).find((n) => world.get(n.x, n.y, n.z) === "bed");
};

const hasSolidFloor = (world: VoxelWorld, pos: BlockPosition): boolean =>
  world.isSolid(pos.x, pos.y - 1, pos.z);

/**
 * Place a two-block bed: foot at `foot`, head in facing direction.
 * Returns false if either cell is occupied or lacks a solid floor.
 */
export const placeBedPair = (
  world: VoxelWorld,
  foot: BlockPosition,
  yaw: number,
): boolean => {
  const facing = facingFromYaw(yaw);
  const head: BlockPosition = { x: foot.x + facing.x, y: foot.y, z: foot.z + facing.z };
  if (world.get(foot.x, foot.y, foot.z) || world.get(head.x, head.y, head.z)) return false;
  if (!hasSolidFloor(world, foot) || !hasSolidFloor(world, head)) return false;
  world.set(foot, "bed");
  world.set(head, "bed");
  if (world.get(foot.x, foot.y, foot.z) !== "bed" || world.get(head.x, head.y, head.z) !== "bed") {
    world.remove(foot);
    world.remove(head);
    return false;
  }
  return true;
};

/**
 * Break a bed pair. Removes both cells when paired; always returns a single
 * `bed` item for the inventory (vanilla: one bed item).
 */
export const breakBedAt = (world: VoxelWorld, pos: BlockPosition): "bed" | undefined => {
  if (world.get(pos.x, pos.y, pos.z) !== "bed") return undefined;
  const pair = findBedPair(world, pos);
  world.remove(pos);
  if (pair) world.remove(pair);
  return "bed";
};

export type SleepFailure = "daytime" | "monsters" | "wrong_dimension";

export type SleepOk = {
  ok: true;
  nextWorldTimeMs: number;
  spawn: [number, number, number];
};

export type SleepResult = SleepOk | { ok: false; reason: SleepFailure };

/** Vanilla-ish sleep gate: night only, no hostiles in range, overworld. */
export const trySleepInBed = (options: {
  worldTimeMs: number;
  dimension: "overworld" | "nether" | "end";
  bed: BlockPosition;
  monstersNearby: boolean;
}): SleepResult => {
  if (options.dimension !== "overworld") return { ok: false, reason: "wrong_dimension" };
  if (!isNight(options.worldTimeMs)) return { ok: false, reason: "daytime" };
  if (options.monstersNearby) return { ok: false, reason: "monsters" };
  const spawnY = options.bed.y + 1;
  return {
    ok: true,
    nextWorldTimeMs: skipToMorning(options.worldTimeMs),
    spawn: [options.bed.x + 0.5, spawnY + 0.72, options.bed.z + 0.5],
  };
};

/** Horizontal distance check used before allowing sleep (vanilla ~8 blocks). */
export const hostileWithinSleepRange = (
  bed: BlockPosition,
  hostiles: readonly { x: number; z: number; dead?: boolean }[],
  range = 8,
): boolean =>
  hostiles.some((mob) => {
    if (mob.dead) return false;
    return Math.hypot(mob.x - bed.x, mob.z - bed.z) <= range;
  });
