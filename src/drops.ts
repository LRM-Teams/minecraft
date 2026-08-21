import type { ItemStack, InvSlot } from "./inventory";
import { addToSlots } from "./inventory";
import type { ItemType } from "./items";

/** World item entity (dropped stack). Pure logic — no THREE. */
export type DroppedItem = {
  id: number;
  item: ItemType;
  count: number;
  x: number;
  y: number;
  z: number;
  /** Seconds until the drop can be picked up (vanilla throw delay). */
  pickupDelay: number;
  age: number;
};

export type DroppedItemSave = {
  id: number;
  item: ItemType;
  count: number;
  x: number;
  y: number;
  z: number;
  pickupDelay?: number;
  age?: number;
};

let nextDropId = 1;

export const resetDropIds = (start = 1): void => {
  nextDropId = start;
};

export const createDroppedItem = (
  stack: ItemStack,
  position: { x: number; y: number; z: number },
  options: { pickupDelay?: number; id?: number } = {},
): DroppedItem => {
  const id = options.id ?? nextDropId++;
  if (options.id !== undefined) nextDropId = Math.max(nextDropId, options.id + 1);
  return {
    id,
    item: stack.item,
    count: stack.count,
    x: position.x,
    y: position.y,
    z: position.z,
    pickupDelay: options.pickupDelay ?? 0.4,
    age: 0,
  };
};

/** Gravity + lifetime for dropped items. Removes entities older than 5 minutes. */
export const tickDrops = (
  drops: DroppedItem[],
  dt: number,
  groundY: (x: number, z: number) => number,
): void => {
  for (let i = drops.length - 1; i >= 0; i -= 1) {
    const drop = drops[i]!;
    drop.age += dt;
    drop.pickupDelay = Math.max(0, drop.pickupDelay - dt);
    const floor = groundY(drop.x, drop.z) + 0.25;
    if (drop.y > floor) {
      drop.y = Math.max(floor, drop.y - 8 * dt);
    } else {
      drop.y = floor;
    }
    // Soft bob for readability.
    if (drop.age > 300) {
      drops.splice(i, 1);
    }
  }
};

const horizDist = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
};

/**
 * Auto-pickup within `radius` when delay elapsed. Mutates `slots` and removes
 * collected drops (or shrinks stacks that only partially fit).
 */
export const tryPickupDrops = (
  drops: DroppedItem[],
  slots: InvSlot[],
  player: { x: number; y: number; z: number },
  radius = 1.5,
): ItemStack[] => {
  const collected: ItemStack[] = [];
  for (let i = drops.length - 1; i >= 0; i -= 1) {
    const drop = drops[i]!;
    if (drop.pickupDelay > 0) continue;
    if (Math.abs(drop.y - player.y) > 2.2) continue;
    if (horizDist(drop.x, drop.z, player.x, player.z) > radius) continue;
    const leftover = addToSlots(slots, drop.item, drop.count);
    const taken = drop.count - leftover;
    if (taken <= 0) continue;
    collected.push({ item: drop.item, count: taken });
    if (leftover <= 0) drops.splice(i, 1);
    else drop.count = leftover;
  }
  return collected;
};

export const snapshotDrops = (drops: readonly DroppedItem[]): DroppedItemSave[] =>
  drops.map((drop) => ({
    id: drop.id,
    item: drop.item,
    count: drop.count,
    x: drop.x,
    y: drop.y,
    z: drop.z,
    pickupDelay: drop.pickupDelay,
    age: drop.age,
  }));

export const restoreDrops = (saved?: DroppedItemSave[] | null): DroppedItem[] => {
  if (!Array.isArray(saved)) return [];
  const list: DroppedItem[] = [];
  for (const entry of saved) {
    if (!entry?.item || !(entry.count > 0)) continue;
    list.push(
      createDroppedItem(
        { item: entry.item, count: entry.count },
        { x: entry.x, y: entry.y, z: entry.z },
        { id: entry.id, pickupDelay: entry.pickupDelay ?? 0 },
      ),
    );
    list[list.length - 1]!.age = entry.age ?? 0;
  }
  return list;
};
