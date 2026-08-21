import { ITEM_TYPES, type ItemType } from "./items";
import { HOTBAR_SIZE, STARTER_STACKS, DEFAULT_HOTBAR } from "./hotbar";

export type Inventory = Record<ItemType, number>;

/** One stack in a player inventory cell (vanilla JE max 64). */
export type ItemStack = { item: ItemType; count: number };
export type InvSlot = ItemStack | null;

/** Vanilla survival bag: 27 storage + 9 hotbar = 36. */
export const MAIN_INV_SIZE = 27;
export const PLAYER_INV_SIZE = MAIN_INV_SIZE + HOTBAR_SIZE;
export const HOTBAR_START = MAIN_INV_SIZE;
export const STACK_MAX = 64;

const ITEM_SET = new Set<string>(ITEM_TYPES);

export const isItemType = (value: string): value is ItemType => ITEM_SET.has(value);

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

export const emptyPlayerSlots = (): InvSlot[] =>
  Array.from({ length: PLAYER_INV_SIZE }, () => null);

/** Pack a count-map into slots (hotbar first for starter placeables, then main). */
export const packSlotsFromCounts = (counts: Partial<Inventory>): InvSlot[] => {
  const slots = emptyPlayerSlots();
  const remaining: Partial<Record<ItemType, number>> = { ...counts };

  // Prefer DEFAULT_HOTBAR bindings into hotbar slots when those items exist.
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    const type = DEFAULT_HOTBAR[i];
    const have = remaining[type] ?? 0;
    if (have <= 0) continue;
    const take = Math.min(STACK_MAX, have);
    slots[HOTBAR_START + i] = { item: type, count: take };
    remaining[type] = have - take;
  }

  let cursor = 0;
  for (const type of ITEM_TYPES) {
    let left = remaining[type] ?? 0;
    while (left > 0 && cursor < MAIN_INV_SIZE) {
      const take = Math.min(STACK_MAX, left);
      slots[cursor] = { item: type, count: take };
      left -= take;
      cursor += 1;
    }
    // Overflow into any still-empty hotbar cells.
    while (left > 0) {
      const empty = slots.findIndex((slot, index) => index >= HOTBAR_START && !slot);
      if (empty < 0) break;
      const take = Math.min(STACK_MAX, left);
      slots[empty] = { item: type, count: take };
      left -= take;
    }
  }
  return slots;
};

export const createStarterSlots = (): InvSlot[] => packSlotsFromCounts(STARTER_STACKS);

export const countsFromSlots = (slots: readonly InvSlot[]): Inventory => {
  const inventory = createInventory();
  for (const slot of slots) {
    if (!slot) continue;
    inventory[slot.item] = (inventory[slot.item] ?? 0) + slot.count;
  }
  return inventory;
};

export const countOf = (slots: readonly InvSlot[], item: ItemType): number => {
  let total = 0;
  for (const slot of slots) {
    if (slot?.item === item) total += slot.count;
  }
  return total;
};

/** Insert as many as possible; returns leftover count that did not fit. */
export const addToSlots = (slots: InvSlot[], item: ItemType, count: number): number => {
  if (count <= 0) return 0;
  let left = count;
  // Merge into existing stacks first.
  for (let i = 0; i < slots.length && left > 0; i += 1) {
    const slot = slots[i];
    if (!slot || slot.item !== item || slot.count >= STACK_MAX) continue;
    const space = STACK_MAX - slot.count;
    const moved = Math.min(space, left);
    slots[i] = { item, count: slot.count + moved };
    left -= moved;
  }
  // Then empty cells (hotbar last — fill main storage first like vanilla pickup).
  const order = [
    ...Array.from({ length: MAIN_INV_SIZE }, (_, i) => i),
    ...Array.from({ length: HOTBAR_SIZE }, (_, i) => HOTBAR_START + i),
  ];
  for (const i of order) {
    if (left <= 0) break;
    if (slots[i]) continue;
    const take = Math.min(STACK_MAX, left);
    slots[i] = { item, count: take };
    left -= take;
  }
  return left;
};

/** Remove up to `count` of `item` from slots. Returns false if not enough. */
export const removeFromSlots = (slots: InvSlot[], item: ItemType, count: number): boolean => {
  if (count <= 0) return true;
  if (countOf(slots, item) < count) return false;
  let left = count;
  // Prefer removing from main storage end, then hotbar (vanilla-ish).
  for (let i = slots.length - 1; i >= 0 && left > 0; i -= 1) {
    const slot = slots[i];
    if (!slot || slot.item !== item) continue;
    if (slot.count <= left) {
      left -= slot.count;
      slots[i] = null;
    } else {
      slots[i] = { item, count: slot.count - left };
      left = 0;
    }
  }
  return true;
};

export const setItemCount = (slots: InvSlot[], item: ItemType, target: number): void => {
  const want = Math.max(0, Math.floor(target));
  const have = countOf(slots, item);
  if (want > have) addToSlots(slots, item, want - have);
  else if (want < have) removeFromSlots(slots, item, have - want);
};

/**
 * Count-map view backed by slot storage. Mutations via `inv[type] = n` /
 * `inv[type] += 1` stay in sync with slots so craft/furnace code keeps working.
 */
export const linkInventory = (slots: InvSlot[]): Inventory => {
  const handler: ProxyHandler<Inventory> = {
    get(_target, prop) {
      if (prop === Symbol.toStringTag) return "Object";
      if (typeof prop === "string" && isItemType(prop)) return countOf(slots, prop);
      return undefined;
    },
    set(_target, prop, value) {
      if (typeof prop === "string" && isItemType(prop)) {
        setItemCount(slots, prop, Number(value) || 0);
        return true;
      }
      return false;
    },
    ownKeys() {
      return [...ITEM_TYPES];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === "string" && isItemType(prop)) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: countOf(slots, prop),
        };
      }
      return undefined;
    },
    has(_target, prop) {
      return typeof prop === "string" && isItemType(prop);
    },
  };
  return new Proxy({} as Inventory, handler);
};

/** Restore slots from save: prefer explicit slots, else pack legacy count map. */
export const restorePlayerSlots = (
  savedSlots?: Array<ItemStack | null> | null,
  savedInventory?: Partial<Inventory> | null,
): InvSlot[] => {
  if (Array.isArray(savedSlots) && savedSlots.length > 0) {
    const slots = emptyPlayerSlots();
    for (let i = 0; i < Math.min(PLAYER_INV_SIZE, savedSlots.length); i += 1) {
      const entry = savedSlots[i];
      if (!entry || typeof entry !== "object") {
        slots[i] = null;
        continue;
      }
      const item = (entry as ItemStack).item;
      const count = Number((entry as ItemStack).count) || 0;
      if (!isItemType(item) || count <= 0) {
        slots[i] = null;
        continue;
      }
      slots[i] = { item, count: Math.min(STACK_MAX, count) };
    }
    return slots;
  }
  if (savedInventory) return packSlotsFromCounts(savedInventory);
  return createStarterSlots();
};

export const snapshotSlots = (slots: readonly InvSlot[]): Array<ItemStack | null> =>
  slots.map((slot) => (slot ? { item: slot.item, count: slot.count } : null));

export const hotbarSlotIndex = (selected: number): number =>
  HOTBAR_START + ((selected % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;

export const heldStack = (slots: readonly InvSlot[], selected: number): InvSlot =>
  slots[hotbarSlotIndex(selected)] ?? null;

/**
 * Vanilla-ish inventory slot click with a floating cursor stack.
 * Left: pick all / place all / swap / merge. Right: pick half / place one.
 */
export const clickInvSlot = (
  slots: InvSlot[],
  cursor: ItemStack | null,
  index: number,
  button: "left" | "right",
): ItemStack | null => {
  if (index < 0 || index >= slots.length) return cursor;
  const stack = slots[index];

  if (button === "left") {
    if (!cursor) {
      if (!stack) return null;
      slots[index] = null;
      return { item: stack.item, count: stack.count };
    }
    if (!stack) {
      slots[index] = { item: cursor.item, count: cursor.count };
      return null;
    }
    if (stack.item === cursor.item) {
      const space = STACK_MAX - stack.count;
      if (space <= 0) return cursor;
      const moved = Math.min(space, cursor.count);
      slots[index] = { item: stack.item, count: stack.count + moved };
      return cursor.count === moved ? null : { item: cursor.item, count: cursor.count - moved };
    }
    slots[index] = { item: cursor.item, count: cursor.count };
    return { item: stack.item, count: stack.count };
  }

  // Right click
  if (!cursor) {
    if (!stack) return null;
    const take = Math.ceil(stack.count / 2);
    const left = stack.count - take;
    slots[index] = left > 0 ? { item: stack.item, count: left } : null;
    return { item: stack.item, count: take };
  }
  if (!stack) {
    slots[index] = { item: cursor.item, count: 1 };
    return cursor.count <= 1 ? null : { item: cursor.item, count: cursor.count - 1 };
  }
  if (stack.item === cursor.item && stack.count < STACK_MAX) {
    slots[index] = { item: stack.item, count: stack.count + 1 };
    return cursor.count <= 1 ? null : { item: cursor.item, count: cursor.count - 1 };
  }
  return cursor;
};

/** Drop 1 (or whole stack) from the selected hotbar slot. Returns the dropped stack or null. */
export const takeHotbarDrop = (
  slots: InvSlot[],
  selected: number,
  wholeStack: boolean,
): ItemStack | null => {
  const index = hotbarSlotIndex(selected);
  const stack = slots[index];
  if (!stack) return null;
  if (wholeStack || stack.count <= 1) {
    slots[index] = null;
    return { item: stack.item, count: stack.count };
  }
  slots[index] = { item: stack.item, count: stack.count - 1 };
  return { item: stack.item, count: 1 };
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
