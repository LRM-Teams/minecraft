import type { Inventory } from "./inventory";
import type { ItemType } from "./items";

export type SmeltRecipe = {
  id: string;
  input: ItemType;
  output: ItemType;
  /** Seconds to finish one item (vanilla ores ≈ 10s). */
  duration: number;
};

export type FuelEntry = { item: ItemType; burnSeconds: number };

export const SMELT_RECIPES: readonly SmeltRecipe[] = [
  { id: "iron", input: "iron_ore", output: "iron_ingot", duration: 10 },
  { id: "gold", input: "gold_ore", output: "gold_ingot", duration: 10 },
  { id: "copper", input: "copper_ore", output: "copper_ingot", duration: 10 },
  // Coal / diamond drop as items when mined (vanilla); not furnace inputs.
  { id: "glass", input: "sand", output: "glass", duration: 10 },
  { id: "charcoal", input: "wood", output: "charcoal", duration: 10 },
  { id: "cooked_beef", input: "raw_beef", output: "cooked_beef", duration: 10 },
];

export const FUELS: readonly FuelEntry[] = [
  { item: "coal", burnSeconds: 80 },
  { item: "charcoal", burnSeconds: 80 },
  { item: "wood", burnSeconds: 15 },
  { item: "planks", burnSeconds: 15 },
  { item: "stick", burnSeconds: 5 },
];

export type FurnaceStack = { item: ItemType; count: number };

export type FurnaceState = {
  input: FurnaceStack | null;
  fuel: FurnaceStack | null;
  output: FurnaceStack | null;
  burnRemaining: number;
  /** Max burn time of the fuel unit currently on fire (for UI bar). */
  burnTotal: number;
  cookProgress: number;
  cookDuration: number;
};

export const createFurnaceState = (): FurnaceState => ({
  input: null,
  fuel: null,
  output: null,
  burnRemaining: 0,
  burnTotal: 0,
  cookProgress: 0,
  cookDuration: 0,
});

export const findSmelt = (input: ItemType | null | undefined): SmeltRecipe | undefined =>
  input ? SMELT_RECIPES.find((recipe) => recipe.input === input) : undefined;

export const findFuel = (item: ItemType | null | undefined): FuelEntry | undefined =>
  item ? FUELS.find((entry) => entry.item === item) : undefined;

const canOutput = (state: FurnaceState, item: ItemType): boolean => {
  if (!state.output) return true;
  return state.output.item === item && state.output.count < 64;
};

const takeOne = (stack: FurnaceStack | null): FurnaceStack | null => {
  if (!stack) return null;
  if (stack.count <= 1) return null;
  return { item: stack.item, count: stack.count - 1 };
};

/** Advance furnace cooking; returns true when any field changed. */
export const tickFurnace = (state: FurnaceState, delta: number): boolean => {
  let changed = false;
  let remaining = delta;

  while (remaining > 1e-6) {
    const recipe = findSmelt(state.input?.item);
    if (!recipe || !state.input || !canOutput(state, recipe.output)) {
      if (state.cookProgress !== 0) {
        state.cookProgress = Math.max(0, state.cookProgress - remaining);
        changed = true;
      }
      state.cookDuration = 0;
      break;
    }

    if (state.burnRemaining <= 0) {
      const fuel = findFuel(state.fuel?.item);
      if (!fuel || !state.fuel) {
        if (state.cookProgress > 0) {
          state.cookProgress = Math.max(0, state.cookProgress - remaining);
          changed = true;
        }
        break;
      }
      state.fuel = takeOne(state.fuel);
      state.burnRemaining = fuel.burnSeconds;
      state.burnTotal = fuel.burnSeconds;
      changed = true;
    }

    state.cookDuration = recipe.duration;
    const step = Math.min(remaining, state.burnRemaining, recipe.duration - state.cookProgress);
    if (step <= 0) break;
    state.cookProgress += step;
    state.burnRemaining -= step;
    remaining -= step;
    changed = true;

    if (state.cookProgress + 1e-9 >= recipe.duration) {
      state.input = takeOne(state.input);
      if (state.output?.item === recipe.output) state.output.count += 1;
      else state.output = { item: recipe.output, count: 1 };
      state.cookProgress = 0;
      changed = true;
    }
  }

  // Fuel keeps burning even with nothing to cook (vanilla).
  if (remaining > 1e-6 && state.burnRemaining > 0 && !findSmelt(state.input?.item)) {
    const step = Math.min(remaining, state.burnRemaining);
    state.burnRemaining -= step;
    changed = true;
  }

  return changed;
};

export const depositFurnace = (
  state: FurnaceState,
  inventory: Inventory,
  item: ItemType,
  slot: "input" | "fuel",
): boolean => {
  if ((inventory[item] ?? 0) <= 0) return false;
  if (slot === "input") {
    if (!findSmelt(item)) return false;
    if (state.input && state.input.item !== item) return false;
    inventory[item] -= 1;
    state.input = { item, count: (state.input?.count ?? 0) + 1 };
    return true;
  }
  if (!findFuel(item)) return false;
  if (state.fuel && state.fuel.item !== item) return false;
  inventory[item] -= 1;
  state.fuel = { item, count: (state.fuel?.count ?? 0) + 1 };
  return true;
};

export const withdrawFurnace = (
  state: FurnaceState,
  inventory: Inventory,
  slot: "input" | "fuel" | "output",
): boolean => {
  if (slot === "output") {
    if (!state.output) return false;
    inventory[state.output.item] = (inventory[state.output.item] ?? 0) + state.output.count;
    state.output = null;
    return true;
  }
  const stack = slot === "input" ? state.input : state.fuel;
  if (!stack) return false;
  inventory[stack.item] = (inventory[stack.item] ?? 0) + stack.count;
  if (slot === "input") state.input = null;
  else state.fuel = null;
  return true;
};
