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
