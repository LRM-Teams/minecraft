/**
 * Vanilla-aligned enchanting: XP levels, lapis costs, table offers,
 * and identifiable effects (sharpness / protection / efficiency).
 */

import type { ArmorSlot } from "./armor";
import type { Inventory } from "./inventory";
import { isArmor, isPickaxe, isSword, isTool, type ItemType } from "./items";

export const ENCHANT_IDS = ["sharpness", "protection", "efficiency"] as const;
export type EnchantId = (typeof ENCHANT_IDS)[number];

export type Enchantment = { id: EnchantId; level: number };

export type EnchantedItem = {
  uid: string;
  item: ItemType;
  enchantments: Enchantment[];
};

export type ExperienceState = {
  level: number;
  xp: number;
};

export type ExperienceSave = {
  level?: number;
  xp?: number;
};

export type EnchantSave = {
  experience?: ExperienceSave;
  gear?: EnchantedItem[];
  equippedToolUid?: string | null;
  armorEnchants?: Partial<Record<ArmorSlot, Enchantment[]>>;
};

export type EnchantOffer = {
  slot: 0 | 1 | 2;
  levelCost: number;
  lapisCost: number;
  enchantment: Enchantment;
  enchantments: Enchantment[];
};

export type EnchantTableState = {
  input: ItemType | null;
  lapis: number;
  offers: EnchantOffer[];
  seed: number;
};

export type EnchantSaveState = {
  experience: ExperienceState;
  gear: EnchantedItem[];
  equippedToolUid: string | null;
  armorEnchants: Record<ArmorSlot, Enchantment[]>;
};

export const ENCHANT_LABELS: Record<EnchantId, string> = {
  sharpness: "锋利",
  protection: "保护",
  efficiency: "效率",
};

export const ENCHANT_MAX_LEVEL: Record<EnchantId, number> = {
  sharpness: 5,
  protection: 4,
  efficiency: 5,
};

export const MOB_KILL_XP = 5;

const emptyArmorEnchants = (): Record<ArmorSlot, Enchantment[]> => ({
  helmet: [],
  chestplate: [],
  leggings: [],
  boots: [],
});

const makeUid = (): string =>
  `ench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Vanilla XP bar capacity to advance from `level` → `level + 1`. */
export const xpBarCapacity = (level: number): number => {
  const L = Math.max(0, Math.floor(level));
  if (L >= 30) return 9 * L - 158;
  if (L >= 16) return 5 * L - 38;
  return 2 * L + 7;
};

export const createExperience = (saved?: ExperienceSave | null): ExperienceState => {
  const level = Math.max(0, Math.floor(saved?.level ?? 0));
  const cap = xpBarCapacity(level);
  return { level, xp: clampInt(saved?.xp ?? 0, 0, cap) };
};

export const snapshotExperience = (state: ExperienceState): ExperienceSave => ({
  level: state.level,
  xp: state.xp,
});

export const addExperience = (state: ExperienceState, amount: number): boolean => {
  if (amount <= 0) return false;
  let remaining = amount;
  let changed = false;
  while (remaining > 0) {
    const cap = xpBarCapacity(state.level);
    const room = cap - state.xp;
    if (remaining < room) {
      state.xp += remaining;
      return true;
    }
    remaining -= room;
    state.xp = 0;
    state.level += 1;
    changed = true;
  }
  return changed;
};

/** Spend whole levels at the enchanting table. */
export const spendLevels = (state: ExperienceState, levels: number): boolean => {
  const need = Math.max(0, Math.floor(levels));
  if (state.level < need) return false;
  state.level -= need;
  state.xp = 0;
  return true;
};

export const formatXpBar = (state: ExperienceState): string => {
  const cap = Math.max(1, xpBarCapacity(state.level));
  const filled = Math.round((state.xp / cap) * 10);
  let out = "";
  for (let i = 0; i < 10; i += 1) out += i < filled ? "■" : "□";
  return out;
};

export const formatEnchantments = (list: readonly Enchantment[]): string => {
  if (!list.length) return "";
  return list.map((entry) => `${ENCHANT_LABELS[entry.id]} ${toRoman(entry.level)}`).join(" · ");
};

export const isEnchantable = (item: ItemType | null | undefined): boolean => {
  if (!item) return false;
  return isSword(item) || isPickaxe(item) || isArmor(item);
};

export const compatibleEnchantments = (item: ItemType): EnchantId[] => {
  if (isSword(item)) return ["sharpness"];
  if (isPickaxe(item)) return ["efficiency"];
  if (isArmor(item)) return ["protection"];
  return [];
};

/** Java-ish sharpness: +1.25 damage per level (rounded). */
export const sharpnessBonus = (enchantments: readonly Enchantment[]): number => {
  const level = levelOf(enchantments, "sharpness");
  if (level <= 0) return 0;
  return Math.round(1.25 * level);
};

/**
 * Protection EPF-style reduction after armor points.
 * Each protection level contributes 1 EPF; capped at 20 → up to 80% reduction.
 */
export const applyProtectionReduction = (
  damage: number,
  enchantments: readonly Enchantment[],
): number => {
  if (damage <= 0) return 0;
  const epf = Math.min(20, levelOf(enchantments, "protection"));
  if (epf <= 0) return Math.max(0, Math.round(damage));
  const reduced = damage * (1 - epf / 25);
  const rounded = Math.round(reduced);
  if (damage >= 1 && rounded < 1) return 1;
  return Math.max(0, rounded);
};

/** Efficiency: mining speed multiplier ≈ 1 + level². */
export const efficiencyMultiplier = (enchantments: readonly Enchantment[]): number => {
  const level = levelOf(enchantments, "efficiency");
  if (level <= 0) return 1;
  return 1 + level * level;
};

export const createEnchantTable = (seed = 1): EnchantTableState => ({
  input: null,
  lapis: 0,
  offers: [],
  seed,
});

export const depositEnchantInput = (
  table: EnchantTableState,
  inventory: Inventory,
  item: ItemType,
): boolean => {
  if (!isEnchantable(item)) return false;
  if ((inventory[item] ?? 0) <= 0) return false;
  if (table.input) inventory[table.input] = (inventory[table.input] ?? 0) + 1;
  inventory[item] -= 1;
  table.input = item;
  table.offers = [];
  return true;
};

export const withdrawEnchantInput = (table: EnchantTableState, inventory: Inventory): boolean => {
  if (!table.input) return false;
  inventory[table.input] = (inventory[table.input] ?? 0) + 1;
  table.input = null;
  table.offers = [];
  return true;
};

export const depositLapis = (table: EnchantTableState, inventory: Inventory, amount = 1): boolean => {
  const take = Math.max(1, Math.floor(amount));
  if ((inventory.lapis_lazuli ?? 0) < take) return false;
  inventory.lapis_lazuli -= take;
  table.lapis += take;
  return true;
};

export const withdrawLapis = (table: EnchantTableState, inventory: Inventory, amount = 1): boolean => {
  const take = Math.min(table.lapis, Math.max(1, Math.floor(amount)));
  if (take <= 0) return false;
  table.lapis -= take;
  inventory.lapis_lazuli = (inventory.lapis_lazuli ?? 0) + take;
  return true;
};

/**
 * Bookshelf power 0–15. Higher power unlocks stronger rolled levels.
 */
export const refreshOffers = (
  table: EnchantTableState,
  experience: ExperienceState,
  bookshelfPower: number,
): EnchantOffer[] => {
  if (!table.input) {
    table.offers = [];
    return table.offers;
  }
  const power = clampInt(bookshelfPower, 0, 15);
  const ids = compatibleEnchantments(table.input);
  if (!ids.length) {
    table.offers = [];
    return table.offers;
  }
  const offers: EnchantOffer[] = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const levelCost = (slot + 1) as 1 | 2 | 3;
    const enchantId = ids[hashPick(table.seed, table.input, slot, power) % ids.length]!;
    const maxLv = ENCHANT_MAX_LEVEL[enchantId];
    const rolled = clampInt(
      1 + Math.floor(((levelCost * 2 + power) * (1 + hashUnit(table.seed, slot))) / 8),
      1,
      maxLv,
    );
    const enchantment: Enchantment = { id: enchantId, level: rolled };
    offers.push({
      slot: slot as 0 | 1 | 2,
      levelCost,
      lapisCost: levelCost,
      enchantment,
      enchantments: [enchantment],
    });
  }
  // Keep costly offers visible even when the player cannot yet afford them.
  void experience;
  table.offers = offers;
  return table.offers;
};

export const canTakeOffer = (
  table: EnchantTableState,
  experience: ExperienceState,
  offer: EnchantOffer,
): boolean => {
  if (!table.input) return false;
  if (table.lapis < offer.lapisCost) return false;
  if (experience.level < offer.levelCost) return false;
  return true;
};

export const takeOffer = (
  table: EnchantTableState,
  experience: ExperienceState,
  gear: EnchantedItem[],
  offer: EnchantOffer,
): EnchantedItem | undefined => {
  if (!canTakeOffer(table, experience, offer) || !table.input) return undefined;
  if (!spendLevels(experience, offer.levelCost)) return undefined;
  table.lapis -= offer.lapisCost;
  const result: EnchantedItem = {
    uid: makeUid(),
    item: table.input,
    enchantments: offer.enchantments.map((entry) => ({ ...entry })),
  };
  table.input = null;
  table.offers = [];
  table.seed = (table.seed * 1103515245 + 12345) >>> 0;
  gear.push(result);
  return result;
};

export const createEnchantSaveState = (saved?: EnchantSave | null): EnchantSaveState => ({
  experience: createExperience(saved?.experience),
  gear: normalizeGear(saved?.gear),
  equippedToolUid: saved?.equippedToolUid ?? null,
  armorEnchants: {
    helmet: normalizeEnchantList(saved?.armorEnchants?.helmet),
    chestplate: normalizeEnchantList(saved?.armorEnchants?.chestplate),
    leggings: normalizeEnchantList(saved?.armorEnchants?.leggings),
    boots: normalizeEnchantList(saved?.armorEnchants?.boots),
  },
});

export const snapshotEnchant = (state: EnchantSaveState): EnchantSave => ({
  experience: snapshotExperience(state.experience),
  gear: state.gear.map((entry) => ({
    uid: entry.uid,
    item: entry.item,
    enchantments: entry.enchantments.map((enchantment) => ({ ...enchantment })),
  })),
  equippedToolUid: state.equippedToolUid,
  armorEnchants: {
    helmet: [...state.armorEnchants.helmet],
    chestplate: [...state.armorEnchants.chestplate],
    leggings: [...state.armorEnchants.leggings],
    boots: [...state.armorEnchants.boots],
  },
});

export const findGear = (
  gear: readonly EnchantedItem[],
  uid: string | null | undefined,
): EnchantedItem | undefined => (uid ? gear.find((entry) => entry.uid === uid) : undefined);

export const removeGear = (gear: EnchantedItem[], uid: string): EnchantedItem | undefined => {
  const index = gear.findIndex((entry) => entry.uid === uid);
  if (index < 0) return undefined;
  return gear.splice(index, 1)[0];
};

export const allArmorEnchantments = (
  armorEnchants: Record<ArmorSlot, Enchantment[]>,
): Enchantment[] => [
  ...armorEnchants.helmet,
  ...armorEnchants.chestplate,
  ...armorEnchants.leggings,
  ...armorEnchants.boots,
];

export const totalProtectionLevel = (armorEnchants: Record<ArmorSlot, Enchantment[]>): number =>
  allArmorEnchantments(armorEnchants).reduce(
    (sum, entry) => sum + (entry.id === "protection" ? entry.level : 0),
    0,
  );

export const mitigateWithProtection = (
  armorEnchants: Record<ArmorSlot, Enchantment[]>,
  damageAfterArmor: number,
): number =>
  applyProtectionReduction(damageAfterArmor, [
    { id: "protection", level: totalProtectionLevel(armorEnchants) },
  ]);

/** XP awarded for mining certain blocks (vanilla-ish). */
export const miningXpFor = (block: string): number => {
  switch (block) {
    case "coal_ore":
    case "copper_ore":
    case "iron_ore":
      return 1;
    case "gold_ore":
      return 2;
    case "lapis_ore":
    case "redstone_ore":
      return 3;
    case "diamond_ore":
      return 5;
    default:
      return 0;
  }
};

/** Count bookshelves in a vanilla-ish ring around an enchanting table (max 15). */
export const countBookshelfPower = (
  getBlock: (x: number, y: number, z: number) => string | undefined,
  table: { x: number; y: number; z: number },
): number => {
  let power = 0;
  for (let dy = 0; dy <= 1; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        if (Math.abs(dx) !== 2 && Math.abs(dz) !== 2) continue;
        const gapX = table.x + Math.sign(dx);
        const gapZ = table.z + Math.sign(dz);
        const gap = getBlock(
          Math.abs(dx) === 2 ? gapX : table.x + dx,
          table.y + dy,
          Math.abs(dz) === 2 ? gapZ : table.z + dz,
        );
        if (gap !== undefined && gap !== "air") continue;
        if (getBlock(table.x + dx, table.y + dy, table.z + dz) === "bookshelf") {
          power += 1;
          if (power >= 15) return 15;
        }
      }
    }
  }
  return power;
};

export const lapisDropCount = (seed: number, x: number, y: number, z: number): number => {
  // Vanilla lapis ore: 4–9 without fortune.
  const unit = hashUnit(seed ^ (x * 374761 + y * 668265 + z * 127412), 0);
  return 4 + Math.floor(unit * 6);
};

export const isEnchantableToolOrArmor = (item: ItemType): boolean =>
  isEnchantable(item) && (isTool(item) || isArmor(item));

void emptyArmorEnchants;

const levelOf = (list: readonly Enchantment[], id: EnchantId): number => {
  let best = 0;
  for (const entry of list) {
    if (entry.id === id && entry.level > best) best = entry.level;
  }
  return best;
};

const normalizeGear = (gear: EnchantedItem[] | undefined): EnchantedItem[] => {
  if (!Array.isArray(gear)) return [];
  return gear
    .filter((entry) => entry && typeof entry.uid === "string" && entry.item && Array.isArray(entry.enchantments))
    .map((entry) => ({
      uid: entry.uid,
      item: entry.item,
      enchantments: normalizeEnchantList(entry.enchantments),
    }));
};

const normalizeEnchantList = (list: Enchantment[] | undefined): Enchantment[] => {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && (ENCHANT_IDS as readonly string[]).includes(entry.id))
    .map((entry) => ({
      id: entry.id as EnchantId,
      level: clampInt(entry.level, 1, ENCHANT_MAX_LEVEL[entry.id as EnchantId] ?? 1),
    }));
};

const toRoman = (level: number): string => {
  const numerals = ["", "I", "II", "III", "IV", "V"];
  return numerals[clampInt(level, 0, 5)] ?? String(level);
};

const hashPick = (seed: number, item: ItemType, slot: number, power: number): number => {
  let h = (seed ^ slot * 0x9e3779b9 ^ power * 0x85ebca6b) >>> 0;
  for (let i = 0; i < item.length; i += 1) h = (h * 31 + item.charCodeAt(i)) >>> 0;
  return h >>> 0;
};

const hashUnit = (seed: number, salt: number): number => {
  let h = (seed ^ (salt * 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
};

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));
