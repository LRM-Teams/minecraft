/**
 * Vanilla-aligned armor: four equipment slots, leather/iron/diamond material tiers,
 * and Java Edition damage absorption (toughness 0 for leather/iron; diamond uses
 * the same integer formula with toughness folded into the higher point totals).
 */

import type { Inventory } from "./inventory";
import type { ExtraItem, ItemType } from "./items";

export const ARMOR_SLOTS = ["helmet", "chestplate", "leggings", "boots"] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];

export const ARMOR_TIERS = ["leather", "iron", "diamond"] as const;
export type ArmorTier = (typeof ARMOR_TIERS)[number];

export type ArmorPiece = `${ArmorTier}_${ArmorSlot}`;

export const ARMOR_PIECES = ARMOR_TIERS.flatMap((tier) =>
  ARMOR_SLOTS.map((slot) => `${tier}_${slot}` as ArmorPiece),
);

/** Vanilla armor points per piece (Java Edition). Full diamond set = 20. */
export const ARMOR_POINTS: Record<ArmorPiece, number> = {
  leather_helmet: 1,
  leather_chestplate: 3,
  leather_leggings: 2,
  leather_boots: 1,
  iron_helmet: 2,
  iron_chestplate: 6,
  iron_leggings: 5,
  iron_boots: 2,
  diamond_helmet: 3,
  diamond_chestplate: 8,
  diamond_leggings: 6,
  diamond_boots: 3,
};

export type ArmorSave = Partial<Record<ArmorSlot, ArmorPiece | null>>;

export type ArmorState = Record<ArmorSlot, ArmorPiece | null>;

export const createArmorState = (saved?: ArmorSave | null): ArmorState => ({
  helmet: normalizeSlot(saved?.helmet, "helmet"),
  chestplate: normalizeSlot(saved?.chestplate, "chestplate"),
  leggings: normalizeSlot(saved?.leggings, "leggings"),
  boots: normalizeSlot(saved?.boots, "boots"),
});

export const snapshotArmor = (state: ArmorState): ArmorSave => ({
  helmet: state.helmet,
  chestplate: state.chestplate,
  leggings: state.leggings,
  boots: state.boots,
});

export const isArmorPiece = (item: string | undefined | null): item is ArmorPiece =>
  Boolean(item && (ARMOR_PIECES as readonly string[]).includes(item));

export const armorSlotOf = (piece: ArmorPiece): ArmorSlot => {
  if (piece.endsWith("_helmet")) return "helmet";
  if (piece.endsWith("_chestplate")) return "chestplate";
  if (piece.endsWith("_leggings")) return "leggings";
  return "boots";
};

export const totalArmorPoints = (state: ArmorState): number => {
  let total = 0;
  for (const slot of ARMOR_SLOTS) {
    const piece = state[slot];
    if (piece) total += ARMOR_POINTS[piece];
  }
  return total;
};

/**
 * Java Edition armor formula with toughness = 0:
 * damage *= (1 - min(20, max(armor/5, armor - damage/(2+toughness/4))) / 25)
 * Result is floored to a whole hit point for this game's integer health bar.
 */
export const applyArmorReduction = (rawDamage: number, armorPoints: number): number => {
  if (rawDamage <= 0) return 0;
  if (armorPoints <= 0) return Math.max(0, Math.round(rawDamage));
  const armor = Math.max(0, armorPoints);
  const absorbed = Math.min(20, Math.max(armor / 5, armor - rawDamage / 2)) / 25;
  const reduced = rawDamage * (1 - absorbed);
  // Always deal at least 1 HP when the hit was ≥ 1 and armor did not fully negate.
  const rounded = Math.round(reduced);
  if (rawDamage >= 1 && rounded < 1 && absorbed < 1) return 1;
  return Math.max(0, rounded);
};

export const mitigateDamage = (state: ArmorState, rawDamage: number): number =>
  applyArmorReduction(rawDamage, totalArmorPoints(state));

/** Equip from inventory into the matching slot; previous piece returns to the bag. */
export const equipArmor = (state: ArmorState, inventory: Inventory, piece: ArmorPiece): boolean => {
  if ((inventory[piece] ?? 0) <= 0) return false;
  const slot = armorSlotOf(piece);
  const previous = state[slot];
  inventory[piece] -= 1;
  if (previous) inventory[previous] = (inventory[previous] ?? 0) + 1;
  state[slot] = piece;
  return true;
};

/** Unequip a slot back into inventory. */
export const unequipArmor = (state: ArmorState, inventory: Inventory, slot: ArmorSlot): boolean => {
  const piece = state[slot];
  if (!piece) return false;
  inventory[piece] = (inventory[piece] ?? 0) + 1;
  state[slot] = null;
  return true;
};

/** Toggle: equip if bag has it; unequip if already worn. */
export const toggleArmor = (state: ArmorState, inventory: Inventory, piece: ArmorPiece): boolean => {
  const slot = armorSlotOf(piece);
  if (state[slot] === piece) return unequipArmor(state, inventory, slot);
  return equipArmor(state, inventory, piece);
};

export const formatArmorBar = (armorPoints: number): string => {
  const points = clampInt(armorPoints, 0, 20);
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    const chunk = points - i * 2;
    if (chunk >= 2) out += "■";
    else if (chunk === 1) out += "▨";
    else out += "□";
  }
  return out;
};

export const SLOT_LABELS: Record<ArmorSlot, string> = {
  helmet: "头盔",
  chestplate: "胸甲",
  leggings: "护腿",
  boots: "靴子",
};

const normalizeSlot = (value: ArmorPiece | null | undefined, slot: ArmorSlot): ArmorPiece | null => {
  if (!value || !isArmorPiece(value)) return null;
  return armorSlotOf(value) === slot ? value : null;
};

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

/** Type helper for stations UI — armor pieces that exist as ExtraItem. */
export type ArmorExtraItem = Extract<ExtraItem, ArmorPiece>;
