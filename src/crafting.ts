import type { Inventory } from "./inventory";
import type { ExtraItem, ItemType } from "./items";
import { isExtraItem } from "./items";

export type CraftCell = ItemType | null;
export type CraftResult = { item: ItemType; count: number };

export type Recipe = {
  id: string;
  /** Pattern width (1–3). Height is pattern.length / width. */
  width: number;
  pattern: readonly CraftCell[];
  result: CraftResult;
  /** When true, only ingredient counts matter (order/shape ignored). */
  shapeless?: boolean;
};

const cell = (value: CraftCell): CraftCell => value;

/** Vanilla armor shapes for leather / iron (and any future material). */
const armorSet = (tier: "leather" | "iron", material: ItemType): Recipe[] => {
  const helmet = `${tier}_helmet` as ExtraItem;
  const chest = `${tier}_chestplate` as ExtraItem;
  const legs = `${tier}_leggings` as ExtraItem;
  const boots = `${tier}_boots` as ExtraItem;
  const M = material;
  return [
    {
      id: helmet,
      width: 3,
      pattern: [M, M, M, M, null, M],
      result: { item: helmet, count: 1 },
    },
    {
      id: chest,
      width: 3,
      pattern: [M, null, M, M, M, M, M, M, M],
      result: { item: chest, count: 1 },
    },
    {
      id: legs,
      width: 3,
      pattern: [M, M, M, M, null, M, M, null, M],
      result: { item: legs, count: 1 },
    },
    {
      id: boots,
      width: 3,
      pattern: [M, null, M, M, null, M],
      result: { item: boots, count: 1 },
    },
  ];
};

const toolSet = (tier: "wooden" | "stone" | "iron" | "gold" | "diamond", material: ItemType): Recipe[] => {
  const pick = `${tier}_pickaxe` as ExtraItem;
  const axe = `${tier}_axe` as ExtraItem;
  const shovel = `${tier}_shovel` as ExtraItem;
  const sword = `${tier}_sword` as ExtraItem;
  const hoe = `${tier}_hoe` as ExtraItem;
  const M = material;
  const S = "stick" as const;
  return [
    {
      id: pick,
      width: 3,
      pattern: [M, M, M, null, S, null, null, S, null],
      result: { item: pick, count: 1 },
    },
    {
      id: axe,
      width: 3,
      // Left-facing axe (Minecraft also accepts the mirror — we register both).
      pattern: [M, M, null, M, S, null, null, S, null],
      result: { item: axe, count: 1 },
    },
    {
      id: `${axe}_mirror`,
      width: 3,
      pattern: [null, M, M, null, S, M, null, S, null],
      result: { item: axe, count: 1 },
    },
    {
      id: shovel,
      width: 3,
      pattern: [null, M, null, null, S, null, null, S, null],
      result: { item: shovel, count: 1 },
    },
    {
      id: sword,
      width: 3,
      pattern: [null, M, null, null, M, null, null, S, null],
      result: { item: sword, count: 1 },
    },
    {
      id: hoe,
      width: 3,
      pattern: [M, M, null, null, S, null, null, S, null],
      result: { item: hoe, count: 1 },
    },
    {
      id: `${hoe}_mirror`,
      width: 3,
      pattern: [null, M, M, null, S, null, null, S, null],
      result: { item: hoe, count: 1 },
    },
  ];
};

/**
 * Vanilla-aligned shaped/shapeless recipes.
 * Metal tools use smelted ingots (not raw ore). Glass is furnace-only (not listed here).
 */
export const RECIPES: readonly Recipe[] = [
  {
    id: "planks",
    width: 1,
    pattern: [cell("wood")],
    result: { item: "planks", count: 4 },
    shapeless: true,
  },
  {
    id: "sticks",
    width: 1,
    pattern: [cell("planks"), cell("planks")],
    result: { item: "stick", count: 4 },
  },
  {
    id: "crafting_table",
    width: 2,
    pattern: [cell("planks"), cell("planks"), cell("planks"), cell("planks")],
    result: { item: "crafting_table", count: 1 },
  },
  {
    id: "furnace",
    width: 3,
    pattern: [
      cell("stone"), cell("stone"), cell("stone"),
      cell("stone"), null, cell("stone"),
      cell("stone"), cell("stone"), cell("stone"),
    ],
    result: { item: "furnace", count: 1 },
  },
  {
    id: "bricks",
    width: 2,
    pattern: [cell("stone"), cell("stone"), cell("stone"), cell("stone")],
    result: { item: "bricks", count: 4 },
  },
  // Vanilla: coal/charcoal above stick → 4 torches (2×1 shaped; works in 2×2 bag).
  {
    id: "torch_coal",
    width: 1,
    pattern: [cell("coal"), cell("stick")],
    result: { item: "torch", count: 4 },
  },
  {
    id: "torch_charcoal",
    width: 1,
    pattern: [cell("charcoal"), cell("stick")],
    result: { item: "torch", count: 4 },
  },
  // Vanilla bed: 3 wool over 3 planks (crafting table).
  {
    id: "bed",
    width: 3,
    pattern: [
      cell("wool"), cell("wool"), cell("wool"),
      cell("planks"), cell("planks"), cell("planks"),
    ],
    result: { item: "bed", count: 1 },
  },
  // Vanilla bread: three wheat in a row (crafting table).
  {
    id: "bread",
    width: 3,
    pattern: [cell("wheat"), cell("wheat"), cell("wheat")],
    result: { item: "bread", count: 1 },
  },
  ...toolSet("wooden", "planks"),
  ...toolSet("stone", "stone"),
  ...toolSet("iron", "iron_ingot"),
  ...toolSet("gold", "gold_ingot"),
  ...toolSet("diamond", "diamond"),
  ...armorSet("leather", "leather"),
  ...armorSet("iron", "iron_ingot"),
];

export const ALL_RECIPES: readonly Recipe[] = RECIPES;

const ACTIVE_RECIPES: readonly Recipe[] = RECIPES;

const gridSize = (grid: readonly CraftCell[]): number => {
  const n = grid.length;
  if (n === 4) return 2;
  if (n === 9) return 3;
  throw new Error(`unsupported craft grid size ${n}`);
};

const countItems = (grid: readonly CraftCell[]): Map<ItemType, number> => {
  const counts = new Map<ItemType, number>();
  for (const item of grid) {
    if (!item) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
};

const recipeCounts = (recipe: Recipe): Map<ItemType, number> => {
  const counts = new Map<ItemType, number>();
  for (const item of recipe.pattern) {
    if (!item) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
};

const shapelessMatch = (grid: readonly CraftCell[], recipe: Recipe): boolean => {
  const have = countItems(grid);
  const need = recipeCounts(recipe);
  if (have.size !== need.size) return false;
  for (const [item, amount] of need) {
    if ((have.get(item) ?? 0) !== amount) return false;
  }
  for (const [item] of have) {
    if (!need.has(item)) return false;
  }
  return true;
};

const shapedMatchAt = (
  grid: readonly CraftCell[],
  size: number,
  recipe: Recipe,
  originX: number,
  originY: number,
): boolean => {
  const height = recipe.pattern.length / recipe.width;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inPattern = x >= originX && x < originX + recipe.width && y >= originY && y < originY + height;
      const gridItem = grid[y * size + x] ?? null;
      if (!inPattern) {
        if (gridItem !== null) return false;
        continue;
      }
      const patternItem = recipe.pattern[(y - originY) * recipe.width + (x - originX)] ?? null;
      if (patternItem !== gridItem) return false;
    }
  }
  return true;
};

const shapedMatch = (grid: readonly CraftCell[], recipe: Recipe): boolean => {
  const size = gridSize(grid);
  if (recipe.width > size) return false;
  const height = recipe.pattern.length / recipe.width;
  if (height > size) return false;
  for (let oy = 0; oy <= size - height; oy += 1) {
    for (let ox = 0; ox <= size - recipe.width; ox += 1) {
      if (shapedMatchAt(grid, size, recipe, ox, oy)) return true;
    }
  }
  return false;
};

export const matchRecipe = (grid: readonly CraftCell[]): Recipe | undefined => {
  for (const recipe of ACTIVE_RECIPES) {
    if (recipe.shapeless) {
      if (shapelessMatch(grid, recipe)) return recipe;
      continue;
    }
    if (shapedMatch(grid, recipe)) return recipe;
  }
  return undefined;
};

export const listRecipes = (): readonly Recipe[] => ACTIVE_RECIPES;

export const emptyGrid = (size: 2 | 3): CraftCell[] => Array.from({ length: size * size }, () => null);

export const consumeGrid = (inventory: Inventory, grid: readonly CraftCell[]): boolean => {
  const need = countItems(grid);
  for (const [item, amount] of need) {
    if ((inventory[item] ?? 0) < amount) return false;
  }
  for (const [item, amount] of need) {
    inventory[item] -= amount;
  }
  return true;
};

export const craftFromGrid = (
  inventory: Inventory,
  grid: CraftCell[],
): CraftResult | undefined => {
  const recipe = matchRecipe(grid);
  if (!recipe) return undefined;
  // Ingredients already sit in the grid (moved out of the bag via placeIntoGrid).
  for (let i = 0; i < grid.length; i += 1) grid[i] = null;
  inventory[recipe.result.item] = (inventory[recipe.result.item] ?? 0) + recipe.result.count;
  return recipe.result;
};

export const placeIntoGrid = (
  inventory: Inventory,
  grid: CraftCell[],
  item: ItemType,
): boolean => {
  if ((inventory[item] ?? 0) <= 0) return false;
  const slot = grid.findIndex((entry) => entry === null);
  if (slot < 0) return false;
  inventory[item] -= 1;
  grid[slot] = item;
  return true;
};

export const takeFromGrid = (inventory: Inventory, grid: CraftCell[], index: number): boolean => {
  const item = grid[index];
  if (!item) return false;
  grid[index] = null;
  inventory[item] = (inventory[item] ?? 0) + 1;
  return true;
};

export const refundGrid = (inventory: Inventory, grid: CraftCell[]): void => {
  for (let i = 0; i < grid.length; i += 1) {
    const item = grid[i];
    if (!item) continue;
    inventory[item] = (inventory[item] ?? 0) + 1;
    grid[i] = null;
  }
};

export const ownedItems = (inventory: Inventory): ItemType[] => {
  const items: ItemType[] = [];
  for (const [key, count] of Object.entries(inventory) as [ItemType, number][]) {
    if (count > 0) items.push(key);
  }
  return items;
};

export const recipeNeedsTable = (recipe: Recipe): boolean => {
  if (recipe.shapeless) {
    const cells = recipe.pattern.filter(Boolean).length;
    return cells > 4;
  }
  const height = recipe.pattern.length / recipe.width;
  return recipe.width > 2 || height > 2;
};

const NON_TOOL_EXTRAS = new Set([
  "stick",
  "coal",
  "charcoal",
  "iron_ingot",
  "gold_ingot",
  "copper_ingot",
  "diamond",
  "wheat",
  "apple",
  "bread",
  "raw_beef",
  "cooked_beef",
  "leather",
  "leather_helmet",
  "leather_chestplate",
  "leather_leggings",
  "leather_boots",
  "iron_helmet",
  "iron_chestplate",
  "iron_leggings",
  "iron_boots",
]);

export const isToolItem = (item: ItemType): boolean =>
  isExtraItem(item) && !NON_TOOL_EXTRAS.has(item);
