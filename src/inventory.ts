import { ITEM_TYPES, type ItemType } from "./items";
import { STARTER_STACKS } from "./hotbar";

export type Inventory = Record<ItemType, number>;

/** Empty bag, or restore a save (partial counts). */
export const createInventory = (saved?: Partial<Inventory>): Inventory =>
  Object.fromEntries(ITEM_TYPES.map((type) => [type, saved?.[type] ?? 0])) as Inventory;

/** New-world starter stacks so right-click place works immediately. */
export const createStarterInventory = (): Inventory => {
  const inventory = createInventory();
  for (const [type, count] of Object.entries(STARTER_STACKS)) {
    inventory[type as ItemType] = count ?? 0;
  }
  return inventory;
};

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
