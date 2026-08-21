import type { BlockPosition, VoxelWorld } from "./world";

const posKey = (p: BlockPosition): string => `${p.x},${p.y},${p.z}`;

export const isOakDoor = (type: string | undefined): type is "oak_door" => type === "oak_door";

/** Find the other half of a 2-tall oak door (lower ↔ upper). */
export const findDoorPair = (world: VoxelWorld, pos: BlockPosition): BlockPosition | undefined => {
  if (world.get(pos.x, pos.y, pos.z) !== "oak_door") return undefined;
  const up = world.get(pos.x, pos.y + 1, pos.z);
  if (up === "oak_door") return { x: pos.x, y: pos.y + 1, z: pos.z };
  const down = world.get(pos.x, pos.y - 1, pos.z);
  if (down === "oak_door") return { x: pos.x, y: pos.y - 1, z: pos.z };
  return undefined;
};

export const isDoorOpen = (world: VoxelWorld, pos: BlockPosition): boolean =>
  world.openDoors.has(posKey(pos));

/**
 * Place a 2-tall oak door: lower at `foot`, upper above.
 * Collision is full-column when closed (open doors are non-solid via `openDoors`).
 */
export const placeDoorPair = (world: VoxelWorld, foot: BlockPosition): boolean => {
  const head: BlockPosition = { x: foot.x, y: foot.y + 1, z: foot.z };
  if (world.get(foot.x, foot.y, foot.z) || world.get(head.x, head.y, head.z)) return false;
  // Floor under the lower half (vanilla).
  if (!world.isSolid(foot.x, foot.y - 1, foot.z)) return false;
  world.set(foot, "oak_door");
  world.set(head, "oak_door");
  if (world.get(foot.x, foot.y, foot.z) !== "oak_door" || world.get(head.x, head.y, head.z) !== "oak_door") {
    world.remove(foot);
    world.remove(head);
    return false;
  }
  // Fresh doors start closed (solid).
  world.openDoors.delete(posKey(foot));
  world.openDoors.delete(posKey(head));
  return true;
};

/** Break both halves; returns one oak_door item (vanilla). */
export const breakDoorAt = (world: VoxelWorld, pos: BlockPosition): "oak_door" | undefined => {
  if (world.get(pos.x, pos.y, pos.z) !== "oak_door") return undefined;
  const pair = findDoorPair(world, pos);
  world.openDoors.delete(posKey(pos));
  world.remove(pos);
  if (pair) {
    world.openDoors.delete(posKey(pair));
    world.remove(pair);
  }
  return "oak_door";
};

/** Toggle open/closed on both halves. Returns new open state, or undefined if not a door. */
export const toggleDoorAt = (world: VoxelWorld, pos: BlockPosition): boolean | undefined => {
  if (world.get(pos.x, pos.y, pos.z) !== "oak_door") return undefined;
  const pair = findDoorPair(world, pos);
  const next = !isDoorOpen(world, pos);
  const apply = (p: BlockPosition): void => {
    if (next) world.openDoors.add(posKey(p));
    else world.openDoors.delete(posKey(p));
  };
  apply(pos);
  if (pair) apply(pair);
  return next;
};
