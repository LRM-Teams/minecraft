import { BLOCK_TYPES, type BlockType } from "./world";

export type Inventory = Record<BlockType, number>;

export const createInventory = (saved?: Partial<Inventory>): Inventory =>
  Object.fromEntries(BLOCK_TYPES.map((type) => [type, saved?.[type] ?? 0])) as Inventory;

/** The first compact crafting recipe: one collected log turns into four building planks. */
export const craftPlanks = (inventory: Inventory): boolean => {
  if (inventory.wood < 1) return false;
  inventory.wood -= 1;
  inventory.planks += 4;
  return true;
};

/** Four mined stone blocks become four durable building bricks. */
export const craftBricks = (inventory: Inventory): boolean => {
  if (inventory.stone < 4) return false;
  inventory.stone -= 4;
  inventory.bricks += 4;
  return true;
};

/** Four sand blocks become four translucent glass building blocks. */
export const craftGlass = (inventory: Inventory): boolean => {
  if (inventory.sand < 4) return false;
  inventory.sand -= 4;
  inventory.glass += 4;
  return true;
};
