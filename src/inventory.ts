import { ITEM_TYPES, type ItemType } from "./items";

export type Inventory = Record<ItemType, number>;

export const createInventory = (saved?: Partial<Inventory>): Inventory =>
  Object.fromEntries(ITEM_TYPES.map((type) => [type, saved?.[type] ?? 0])) as Inventory;

/** Quick-craft: log → planks (same as shapeless recipe). */
export const craftPlanks = (inventory: Inventory): boolean => {
  if (inventory.wood < 1) return false;
  inventory.wood -= 1;
  inventory.planks += 4;
  return true;
};

/** Quick-craft: 4 stone → 4 stone bricks. */
export const craftBricks = (inventory: Inventory): boolean => {
  if (inventory.stone < 4) return false;
  inventory.stone -= 4;
  inventory.bricks += 4;
  return true;
};

/**
 * Glass is vanilla furnace-only. Hotkey kept as a hint stub so old keybinds
 * do not silently invent glass without smelting.
 */
export const craftGlass = (_inventory: Inventory): boolean => false;
