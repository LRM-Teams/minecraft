/**
 * Vanilla-aligned brewing: stand slots, blaze-powder fuel, bottle chain,
 * and measurable potion effects (healing / swiftness / poison).
 */

import type { Inventory } from "./inventory";
import type { ExtraItem, ItemType } from "./items";

/** Brew duration in seconds (vanilla ≈ 20s). */
export const BREW_DURATION_SEC = 20;
/** One blaze powder fuels this many brew operations (vanilla). */
export const BREWS_PER_POWDER = 20;

export const POTION_EFFECT_IDS = ["healing", "swiftness", "poison"] as const;
export type PotionEffectId = (typeof POTION_EFFECT_IDS)[number];

export type DrinkablePotion =
  | "potion_healing"
  | "potion_swiftness"
  | "potion_poison";

export type BrewBottle =
  | "glass_bottle"
  | "water_bottle"
  | "awkward_potion"
  | DrinkablePotion;

export type BrewIngredient =
  | "nether_wart"
  | "glistering_melon"
  | "sugar"
  | "spider_eye";

export type ActiveEffect = {
  id: PotionEffectId;
  /** Remaining duration in seconds (0 for instant effects after apply). */
  remaining: number;
  amplifier: number;
};

export type BrewingStandState = {
  bottles: [BrewBottle | null, BrewBottle | null, BrewBottle | null];
  ingredient: BrewIngredient | null;
  fuel: number;
  brewProgress: number;
  brewDuration: number;
};

export type BrewingSave = {
  effects?: ActiveEffect[];
};

export type PotionDef = {
  id: DrinkablePotion;
  effect: PotionEffectId;
  /** Instant heal amount (hearts/HP points on our 10-HP scale). */
  heal?: number;
  /** Duration seconds for lasting effects. */
  duration?: number;
  amplifier: number;
  /** Movement speed multiplier while active (swiftness). */
  speedMul?: number;
  /** Poison tick interval seconds. */
  poisonInterval?: number;
};

export const POTION_DEFS: Record<DrinkablePotion, PotionDef> = {
  potion_healing: {
    id: "potion_healing",
    effect: "healing",
    heal: 4,
    amplifier: 0,
  },
  potion_swiftness: {
    id: "potion_swiftness",
    effect: "swiftness",
    duration: 180,
    amplifier: 0,
    speedMul: 1.2,
  },
  potion_poison: {
    id: "potion_poison",
    effect: "poison",
    duration: 45,
    amplifier: 0,
    poisonInterval: 1.25,
  },
};

export const EFFECT_LABELS: Record<PotionEffectId, string> = {
  healing: "瞬间治疗",
  swiftness: "迅捷",
  poison: "中毒",
};

export const BOTTLE_LABELS: Record<BrewBottle, string> = {
  glass_bottle: "玻璃瓶",
  water_bottle: "水瓶",
  awkward_potion: "粗制药水",
  potion_healing: "治疗药水",
  potion_swiftness: "迅捷药水",
  potion_poison: "剧毒药水",
};

export const INGREDIENT_LABELS: Record<BrewIngredient, string> = {
  nether_wart: "下界疣",
  glistering_melon: "闪烁的西瓜",
  sugar: "糖",
  spider_eye: "蜘蛛眼",
};

/** Vanilla brewing transformations: ingredient + input bottle → output. */
export const BREW_RECIPES: readonly {
  ingredient: BrewIngredient;
  from: BrewBottle;
  to: BrewBottle;
}[] = [
  { ingredient: "nether_wart", from: "water_bottle", to: "awkward_potion" },
  { ingredient: "glistering_melon", from: "awkward_potion", to: "potion_healing" },
  { ingredient: "sugar", from: "awkward_potion", to: "potion_swiftness" },
  { ingredient: "spider_eye", from: "awkward_potion", to: "potion_poison" },
];

export const isBrewBottle = (item: string): item is BrewBottle =>
  Object.prototype.hasOwnProperty.call(BOTTLE_LABELS, item);

export const isBrewIngredient = (item: string): item is BrewIngredient =>
  Object.prototype.hasOwnProperty.call(INGREDIENT_LABELS, item);

export const isDrinkablePotion = (item: string): item is DrinkablePotion =>
  Object.prototype.hasOwnProperty.call(POTION_DEFS, item);

export const createBrewingStand = (): BrewingStandState => ({
  bottles: [null, null, null],
  ingredient: null,
  fuel: 0,
  brewProgress: 0,
  brewDuration: BREW_DURATION_SEC,
});

export const createEffects = (saved?: BrewingSave | null): ActiveEffect[] => {
  if (!Array.isArray(saved?.effects)) return [];
  return saved.effects
    .filter((entry) => entry && (POTION_EFFECT_IDS as readonly string[]).includes(entry.id))
    .map((entry) => ({
      id: entry.id as PotionEffectId,
      remaining: Math.max(0, entry.remaining ?? 0),
      amplifier: Math.max(0, Math.floor(entry.amplifier ?? 0)),
    }));
};

export const snapshotBrewing = (effects: readonly ActiveEffect[]): BrewingSave => ({
  effects: effects
    .filter((entry) => entry.remaining > 0 || entry.id === "healing")
    .filter((entry) => entry.id !== "healing")
    .map((entry) => ({ ...entry })),
});

export const brewResultFor = (
  ingredient: BrewIngredient,
  bottle: BrewBottle,
): BrewBottle | undefined =>
  BREW_RECIPES.find((recipe) => recipe.ingredient === ingredient && recipe.from === bottle)?.to;

export const canStartBrew = (stand: BrewingStandState): boolean => {
  if (!stand.ingredient) return false;
  if (stand.fuel <= 0) return false;
  return stand.bottles.some((bottle) => bottle !== null && brewResultFor(stand.ingredient!, bottle));
};

export const depositBottle = (
  stand: BrewingStandState,
  inventory: Inventory,
  item: BrewBottle,
  slot: 0 | 1 | 2,
): boolean => {
  if ((inventory[item] ?? 0) <= 0) return false;
  const existing = stand.bottles[slot];
  if (existing) inventory[existing] = (inventory[existing] ?? 0) + 1;
  inventory[item] -= 1;
  stand.bottles[slot] = item;
  stand.brewProgress = 0;
  return true;
};

export const withdrawBottle = (
  stand: BrewingStandState,
  inventory: Inventory,
  slot: 0 | 1 | 2,
): boolean => {
  const bottle = stand.bottles[slot];
  if (!bottle) return false;
  inventory[bottle] = (inventory[bottle] ?? 0) + 1;
  stand.bottles[slot] = null;
  stand.brewProgress = 0;
  return true;
};

export const depositIngredient = (
  stand: BrewingStandState,
  inventory: Inventory,
  item: BrewIngredient,
): boolean => {
  if ((inventory[item] ?? 0) <= 0) return false;
  if (stand.ingredient) inventory[stand.ingredient] = (inventory[stand.ingredient] ?? 0) + 1;
  inventory[item] -= 1;
  stand.ingredient = item;
  stand.brewProgress = 0;
  return true;
};

export const withdrawIngredient = (stand: BrewingStandState, inventory: Inventory): boolean => {
  if (!stand.ingredient) return false;
  inventory[stand.ingredient] = (inventory[stand.ingredient] ?? 0) + 1;
  stand.ingredient = null;
  stand.brewProgress = 0;
  return true;
};

export const depositFuel = (stand: BrewingStandState, inventory: Inventory, amount = 1): boolean => {
  const take = Math.max(1, Math.floor(amount));
  if ((inventory.blaze_powder ?? 0) < take) return false;
  inventory.blaze_powder -= take;
  stand.fuel += take * BREWS_PER_POWDER;
  return true;
};

export const fillWaterBottle = (inventory: Inventory): boolean => {
  if ((inventory.glass_bottle ?? 0) < 1) return false;
  inventory.glass_bottle -= 1;
  inventory.water_bottle = (inventory.water_bottle ?? 0) + 1;
  return true;
};

/**
 * Advance brewing. Returns true when stand contents or progress changed.
 */
export const tickBrewingStand = (stand: BrewingStandState, delta: number): boolean => {
  if (!canStartBrew(stand)) {
    if (stand.brewProgress !== 0) {
      stand.brewProgress = 0;
      return true;
    }
    return false;
  }
  stand.brewProgress += delta;
  if (stand.brewProgress < stand.brewDuration) return true;

  const ingredient = stand.ingredient!;
  let transformed = 0;
  for (let i = 0; i < 3; i += 1) {
    const bottle = stand.bottles[i];
    if (!bottle) continue;
    const next = brewResultFor(ingredient, bottle);
    if (!next) continue;
    stand.bottles[i] = next;
    transformed += 1;
  }
  stand.brewProgress = 0;
  if (transformed > 0) {
    stand.fuel = Math.max(0, stand.fuel - 1);
    stand.ingredient = null;
  }
  return true;
};

export const refundBrewingStand = (stand: BrewingStandState, inventory: Inventory): void => {
  for (let i = 0; i < 3; i += 1) withdrawBottle(stand, inventory, i as 0 | 1 | 2);
  withdrawIngredient(stand, inventory);
  if (stand.fuel > 0) {
    const powders = Math.floor(stand.fuel / BREWS_PER_POWDER);
    const rem = stand.fuel % BREWS_PER_POWDER;
    if (powders > 0) inventory.blaze_powder = (inventory.blaze_powder ?? 0) + powders;
    // Leftover partial fuel units are discarded on close (vanilla keeps stand-local).
    void rem;
    stand.fuel = 0;
  }
};

export const drinkPotion = (
  inventory: Inventory,
  effects: ActiveEffect[],
  potion: DrinkablePotion,
  health: number,
  maxHealth: number,
): { ok: boolean; health: number; message: string } => {
  if ((inventory[potion] ?? 0) <= 0) return { ok: false, health, message: "没有该药水" };
  const def = POTION_DEFS[potion];
  inventory[potion] -= 1;
  inventory.glass_bottle = (inventory.glass_bottle ?? 0) + 1;

  let nextHealth = health;
  if (def.heal) {
    nextHealth = Math.min(maxHealth, health + def.heal);
  }
  if (def.duration && def.duration > 0) {
    const existing = effects.find((entry) => entry.id === def.effect);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, def.duration);
      existing.amplifier = Math.max(existing.amplifier, def.amplifier);
    } else {
      effects.push({ id: def.effect, remaining: def.duration, amplifier: def.amplifier });
    }
  }
  return {
    ok: true,
    health: nextHealth,
    message: `饮用 ${BOTTLE_LABELS[potion]}`,
  };
};

export const pickPotionToDrink = (inventory: Inventory, health: number, maxHealth: number): DrinkablePotion | null => {
  const order: DrinkablePotion[] =
    health < maxHealth
      ? ["potion_healing", "potion_swiftness", "potion_poison"]
      : ["potion_swiftness", "potion_healing", "potion_poison"];
  for (const id of order) {
    if ((inventory[id] ?? 0) > 0) return id;
  }
  return null;
};

export type EffectTickResult = {
  healthDelta: number;
  changed: boolean;
  speedMul: number;
};

/**
 * Tick lasting effects. Poison deals periodic damage (stops at 1 HP like Normal difficulty).
 */
export const tickEffects = (
  effects: ActiveEffect[],
  health: number,
  delta: number,
  poisonAcc: { value: number },
): EffectTickResult => {
  let healthDelta = 0;
  let changed = false;
  let speedMul = 1;

  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const entry = effects[i]!;
    if (entry.id === "swiftness") {
      speedMul = Math.max(speedMul, POTION_DEFS.potion_swiftness.speedMul ?? 1.2);
    }
    if (entry.id === "poison") {
      poisonAcc.value += delta;
      const interval = POTION_DEFS.potion_poison.poisonInterval ?? 1.25;
      while (poisonAcc.value >= interval) {
        poisonAcc.value -= interval;
        if (health + healthDelta > 1) {
          healthDelta -= 1;
          changed = true;
        }
      }
    }
    entry.remaining -= delta;
    if (entry.remaining <= 0) {
      effects.splice(i, 1);
      changed = true;
      if (entry.id === "poison") poisonAcc.value = 0;
    } else {
      changed = true;
    }
  }

  return { healthDelta, changed, speedMul };
};

export const formatEffectsHud = (effects: readonly ActiveEffect[]): string => {
  if (!effects.length) return "";
  return effects
    .map((entry) => `${EFFECT_LABELS[entry.id]} ${Math.ceil(entry.remaining)}s`)
    .join(" · ");
};

export const isBrewFuelItem = (item: ItemType): item is ExtraItem => item === "blaze_powder";

export const BREW_INGREDIENT_ITEMS = Object.keys(INGREDIENT_LABELS) as BrewIngredient[];
export const BREW_BOTTLE_ITEMS = Object.keys(BOTTLE_LABELS) as BrewBottle[];
