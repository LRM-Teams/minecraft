/**
 * Vanilla-aligned hunger: foodLevel (0–20) + saturation + exhaustion.
 * Exhaustion ≥ 4 drains saturation, then foodLevel.
 * foodLevel ≥ 18 regenerates health; foodLevel === 0 deals starve damage (Normal: stops at 1 HP).
 */

import type { Inventory } from "./inventory";
import type { ExtraItem } from "./items";

export const MAX_FOOD_LEVEL = 20;
/** Vanilla: sprint disabled at 6 food or below. */
export const SPRINT_MIN_FOOD = 6;
/** Vanilla: natural regeneration requires at least 18 food (9 shanks). */
export const REGEN_MIN_FOOD = 18;

export type HungerSave = {
  foodLevel?: number;
  saturation?: number;
  exhaustion?: number;
};

export type HungerState = {
  foodLevel: number;
  saturation: number;
  exhaustion: number;
  regenTimer: number;
  starveTimer: number;
};

/** Exhaustion costs mirrored from Java Edition (property names match main.ts). */
export const EXHAUSTION = {
  walkPerMeter: 0.01,
  sprintPerMeter: 0.1,
  jump: 0.05,
  sprintJump: 0.2,
  attack: 0.1,
  damage: 0.1,
  mineBlock: 0.005,
  regen: 6,
} as const;

export type FoodId = "apple" | "bread" | "raw_beef" | "cooked_beef";

export type FoodDef = {
  id: FoodId;
  nutrition: number;
  saturationModifier: number;
};

export const FOOD_DEFS: Record<FoodId, FoodDef> = {
  cooked_beef: { id: "cooked_beef", nutrition: 8, saturationModifier: 0.8 },
  bread: { id: "bread", nutrition: 5, saturationModifier: 0.6 },
  apple: { id: "apple", nutrition: 4, saturationModifier: 0.3 },
  raw_beef: { id: "raw_beef", nutrition: 3, saturationModifier: 0.3 },
};

export const FOOD_IDS = Object.keys(FOOD_DEFS) as FoodId[];

export const isFoodId = (item: string): item is FoodId =>
  Object.prototype.hasOwnProperty.call(FOOD_DEFS, item);

export const createHungerState = (saved?: HungerSave | null): HungerState => {
  const foodLevel = clampInt(saved?.foodLevel ?? MAX_FOOD_LEVEL, 0, MAX_FOOD_LEVEL);
  const saturation = clamp(saved?.saturation ?? foodLevel, 0, Math.max(foodLevel, 0));
  return {
    foodLevel,
    saturation,
    exhaustion: clamp(saved?.exhaustion ?? 0, 0, 40),
    regenTimer: 0,
    starveTimer: 0,
  };
};

export const snapshotHunger = (state: HungerState): HungerSave => ({
  foodLevel: state.foodLevel,
  saturation: state.saturation,
  exhaustion: state.exhaustion,
});

export const addExhaustion = (state: HungerState, amount: number): void => {
  if (amount <= 0) return;
  state.exhaustion += amount;
  drainExhaustion(state);
};

export const drainExhaustion = (state: HungerState): void => {
  while (state.exhaustion >= 4) {
    state.exhaustion -= 4;
    if (state.saturation > 0) {
      state.saturation = Math.max(0, state.saturation - 1);
    } else if (state.foodLevel > 0) {
      state.foodLevel -= 1;
    }
  }
};

export const canSprint = (state: HungerState): boolean => state.foodLevel > SPRINT_MIN_FOOD;

export const canEat = (state: HungerState): boolean => state.foodLevel < MAX_FOOD_LEVEL;

export const eatFood = (state: HungerState, foodId: FoodId): boolean => {
  if (!canEat(state)) return false;
  const def = FOOD_DEFS[foodId];
  state.foodLevel = Math.min(MAX_FOOD_LEVEL, state.foodLevel + def.nutrition);
  const gained = def.nutrition * def.saturationModifier * 2;
  state.saturation = Math.min(state.foodLevel, state.saturation + gained);
  return true;
};

export const pickFoodToEat = (inventory: Inventory): FoodId | null => {
  const order: FoodId[] = ["cooked_beef", "bread", "apple", "raw_beef"];
  for (const id of order) {
    if ((inventory[id as ExtraItem] ?? 0) > 0) return id;
  }
  return null;
};

export type HungerTickResult = {
  healthDelta: number;
  changed: boolean;
};

export const tickHunger = (
  state: HungerState,
  health: number,
  maxHealth: number,
  dtSec: number,
): HungerTickResult => {
  let healthDelta = 0;
  let changed = false;
  drainExhaustion(state);

  if (state.foodLevel >= REGEN_MIN_FOOD && health < maxHealth && health > 0) {
    state.regenTimer += dtSec;
    const interval = state.foodLevel >= MAX_FOOD_LEVEL && state.saturation > 0 ? 0.5 : 4;
    while (state.regenTimer >= interval && health + healthDelta < maxHealth) {
      state.regenTimer -= interval;
      healthDelta += 1;
      addExhaustion(state, EXHAUSTION.regen);
      changed = true;
    }
  } else {
    state.regenTimer = 0;
  }

  if (state.foodLevel <= 0 && health > 1) {
    state.starveTimer += dtSec;
    while (state.starveTimer >= 4 && health + healthDelta > 1) {
      state.starveTimer -= 4;
      healthDelta -= 1;
      changed = true;
    }
  } else {
    state.starveTimer = 0;
  }

  return { healthDelta, changed };
};

export const formatHungerBar = (foodLevel: number): string => {
  const level = clampInt(foodLevel, 0, MAX_FOOD_LEVEL);
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    const shank = level - i * 2;
    if (shank >= 2) out += "🍖";
    else if (shank === 1) out += "🍗";
    else out += "🦴";
  }
  return out;
};

export const appleDropFromLeaves = (seed: number, x: number, y: number, z: number): boolean =>
  hashChance(seed, x, y, z, 7919) < 0.005;

export const wheatDropFromGrass = (seed: number, x: number, y: number, z: number): boolean =>
  hashChance(seed, x, y, z, 9973) < 0.125;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

const hashChance = (seed: number, x: number, y: number, z: number, salt: number): number => {
  let h = (seed | 0) ^ (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
};
