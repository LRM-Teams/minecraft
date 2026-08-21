import type { BlockPosition, VoxelWorld } from "./world";

export const isLadder = (type: string | undefined): type is "ladder" => type === "ladder";

const HORIZONTAL: ReadonlyArray<BlockPosition> = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/** Ladder must attach to a solid wall face (vanilla); floor-only is not enough. */
export const canPlaceLadderAt = (
  world: VoxelWorld,
  position: BlockPosition,
  against?: BlockPosition,
): boolean => {
  if (world.get(position.x, position.y, position.z)) return false;
  if (
    against &&
    (against.x !== position.x || against.z !== position.z) &&
    against.y === position.y &&
    world.isSolid(against.x, against.y, against.z)
  ) {
    return true;
  }
  return HORIZONTAL.some((d) => world.isSolid(position.x + d.x, position.y + d.y, position.z + d.z));
};

/**
 * Player can climb when standing in / against a ladder column at body height.
 * Checks the player's rounded column and the four horizontal neighbours.
 */
export const isClimbingLadder = (
  world: VoxelWorld,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
): boolean => {
  const x = Math.round(eyeX);
  const z = Math.round(eyeZ);
  // Feet ≈ eye − PLAYER_EYE; sample mid-body and feet cells.
  const ys = [Math.floor(eyeY - 0.5), Math.floor(eyeY - 1.4)];
  for (const y of ys) {
    if (world.get(x, y, z) === "ladder") return true;
    for (const d of HORIZONTAL) {
      if (world.get(x + d.x, y, z + d.z) === "ladder") return true;
    }
  }
  return false;
};

/** Vertical climb speed while on a ladder (blocks/sec). */
export const LADDER_CLIMB_SPEED = 4.2;
