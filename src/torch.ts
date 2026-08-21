import type { BlockPosition, BlockType, VoxelWorld } from "./world";

/** Torch emission used by the renderer (warm orange, cave-useful range). */
export const TORCH_LIGHT = {
  color: 0xffb060,
  intensity: 1.35,
  distance: 11,
  decay: 2,
} as const;

export const isTorch = (type: BlockType | undefined): type is "torch" => type === "torch";

/** Collect torch positions near a center (chunk-ish radius in blocks). */
export const torchesNear = (
  world: VoxelWorld,
  center: BlockPosition,
  radius = 24,
): BlockPosition[] => {
  const found: BlockPosition[] = [];
  const r2 = radius * radius;
  world.blocks.forEach((type, key) => {
    if (type !== "torch") return;
    const [x, y, z] = key.split(",").map(Number);
    const dx = x - center.x;
    const dz = z - center.z;
    if (dx * dx + dz * dz > r2) return;
    found.push({ x, y, z });
  });
  // Prefer closest torches when capping lights in the renderer.
  found.sort((a, b) => {
    const da = (a.x - center.x) ** 2 + (a.y - center.y) ** 2 + (a.z - center.z) ** 2;
    const db = (b.x - center.x) ** 2 + (b.y - center.y) ** 2 + (b.z - center.z) ** 2;
    return da - db;
  });
  return found;
};

/** Torch may sit on a solid support below or against a solid wall face. */
export const canPlaceTorchAt = (
  world: VoxelWorld,
  position: BlockPosition,
  against?: BlockPosition,
): boolean => {
  if (world.get(position.x, position.y, position.z)) return false;
  if (world.isSolid(position.x, position.y - 1, position.z)) return true;
  if (
    against &&
    world.isSolid(against.x, against.y, against.z) &&
    (against.x !== position.x || against.z !== position.z || against.y !== position.y)
  ) {
    return true;
  }
  return false;
};
