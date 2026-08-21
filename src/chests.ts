import {
  clickInvSlot,
  MAIN_INV_SIZE,
  STACK_MAX,
  isItemType,
  type InvSlot,
  type ItemStack,
} from "./inventory";
import type { ItemType } from "./items";

/** Vanilla single chest: 27 slots (3×9). */
export const CHEST_SIZE = MAIN_INV_SIZE;

export type ChestSlots = InvSlot[];
export type ChestSave = Record<string, Array<ItemStack | null>>;

export const chestKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export const emptyChestSlots = (): ChestSlots =>
  Array.from({ length: CHEST_SIZE }, () => null);

export const ensureChest = (chests: Map<string, ChestSlots>, key: string): ChestSlots => {
  let slots = chests.get(key);
  if (!slots) {
    slots = emptyChestSlots();
    chests.set(key, slots);
  }
  return slots;
};

export const snapshotChests = (chests: Map<string, ChestSlots>): ChestSave => {
  const out: ChestSave = {};
  for (const [key, slots] of chests) {
    const hasAny = slots.some((slot) => slot !== null);
    if (!hasAny) continue;
    out[key] = slots.map((slot) => (slot ? { item: slot.item, count: slot.count } : null));
  }
  return out;
};

export const restoreChests = (saved?: ChestSave | null): Map<string, ChestSlots> => {
  const map = new Map<string, ChestSlots>();
  if (!saved || typeof saved !== "object") return map;
  for (const [key, raw] of Object.entries(saved)) {
    if (!Array.isArray(raw)) continue;
    const slots = emptyChestSlots();
    for (let i = 0; i < Math.min(CHEST_SIZE, raw.length); i += 1) {
      const entry = raw[i];
      if (!entry || typeof entry !== "object") continue;
      const item = (entry as ItemStack).item;
      const count = Number((entry as ItemStack).count) || 0;
      if (!isItemType(item) || count <= 0) continue;
      slots[i] = { item, count: Math.min(STACK_MAX, count) };
    }
    map.set(key, slots);
  }
  return map;
};

/**
 * Drain chest contents into droppable stacks (chest body separate).
 * Clears the map entry.
 */
export const drainChestContents = (
  chests: Map<string, ChestSlots>,
  key: string,
): Array<{ item: ItemType; count: number }> => {
  const slots = chests.get(key);
  chests.delete(key);
  if (!slots) return [];
  const drops: Array<{ item: ItemType; count: number }> = [];
  for (const slot of slots) {
    if (slot) drops.push({ item: slot.item, count: slot.count });
  }
  return drops;
};
