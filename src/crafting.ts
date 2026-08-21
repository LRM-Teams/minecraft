import type { Inventory } from "./inventory";
import type { ExtraItem, ItemType } from "./items";
import { isExtraItem } from "./items";

/** Stack on the mouse cursor while a crafting UI is open (vanilla JE). */
export type CraftCursor = { item: ItemType; count: number } | null;
/** Grid cell: legacy bare item id (count 1) or an explicit stack. */
export type CraftStack = { item: ItemType; count: number };
export type CraftCell = ItemType | CraftStack | null;
export type CraftResult = { item: ItemType; count: number };
export type CraftPointerButton = "left" | "right";

const STACK_MAX = 64;

export const asStack = (cell: CraftCell): CraftStack | null => {
  if (!cell) return null;
  if (typeof cell === "string") return { item: cell, count: 1 };
  return { item: cell.item, count: cell.count };
};

export const cellItem = (cell: CraftCell): ItemType | null => asStack(cell)?.item ?? null;

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
  // Vanilla oak door: 6 planks in two columns → 3 doors.
  {
    id: "oak_door",
    width: 2,
    pattern: [
      cell("planks"), cell("planks"),
      cell("planks"), cell("planks"),
      cell("planks"), cell("planks"),
    ],
    result: { item: "oak_door", count: 3 },
  },
  // Vanilla ladder: sticks in H shape → 3 ladders.
  {
    id: "ladder",
    width: 3,
    pattern: [
      cell("stick"), cell(null), cell("stick"),
      cell("stick"), cell("stick"), cell("stick"),
      cell("stick"), cell(null), cell("stick"),
    ],
    result: { item: "ladder", count: 3 },
  },
  // Vanilla paper: three sugar cane in a row.
  {
    id: "paper",
    width: 3,
    pattern: [cell("sugar_cane"), cell("sugar_cane"), cell("sugar_cane")],
    result: { item: "paper", count: 3 },
  },
  // Vanilla book: three paper + one leather (shapeless).
  {
    id: "book",
    width: 2,
    pattern: [cell("paper"), cell("paper"), cell("paper"), cell("leather")],
    result: { item: "book", count: 1 },
    shapeless: true,
  },
  // Vanilla enchanting table: book / diamond+obsidian+diamond / 3 obsidian.
  {
    id: "enchanting_table",
    width: 3,
    pattern: [
      cell(null), cell("book"), cell(null),
      cell("diamond"), cell("obsidian"), cell("diamond"),
      cell("obsidian"), cell("obsidian"), cell("obsidian"),
    ],
    result: { item: "enchanting_table", count: 1 },
  },
  // Vanilla bookshelf: 3 books over/mid 6 planks.
  {
    id: "bookshelf",
    width: 3,
    pattern: [
      cell("planks"), cell("planks"), cell("planks"),
      cell("book"), cell("book"), cell("book"),
      cell("planks"), cell("planks"), cell("planks"),
    ],
    result: { item: "bookshelf", count: 1 },
  },
  // Vanilla brewing stand: blaze rod over 3 cobble/stone.
  {
    id: "brewing_stand",
    width: 3,
    pattern: [
      cell(null), cell("blaze_rod"), cell(null),
      cell(null), cell(null), cell(null),
      cell("stone"), cell("stone"), cell("stone"),
    ],
    result: { item: "brewing_stand", count: 1 },
  },
  // Vanilla glass bottle: 3 glass in a V.
  {
    id: "glass_bottle",
    width: 3,
    pattern: [
      cell("glass"), cell(null), cell("glass"),
      cell(null), cell("glass"), cell(null),
    ],
    result: { item: "glass_bottle", count: 3 },
  },
  // Vanilla redstone torch: dust above stick.
  {
    id: "redstone_torch",
    width: 1,
    pattern: [cell("redstone_dust"), cell("stick")],
    result: { item: "redstone_torch", count: 1 },
  },
  // Vanilla lever: stick above cobble/stone.
  {
    id: "lever",
    width: 1,
    pattern: [cell("stick"), cell("stone")],
    result: { item: "lever", count: 1 },
  },
  // Vanilla redstone lamp uses glowstone; glass stands in as the luminous core
  // until nether glowstone can enter the overworld bag.
  {
    id: "redstone_lamp",
    width: 3,
    pattern: [
      cell(null), cell("redstone_dust"), cell(null),
      cell("redstone_dust"), cell("glass"), cell("redstone_dust"),
      cell(null), cell("redstone_dust"), cell(null),
    ],
    result: { item: "redstone_lamp", count: 1 },
  },
  // Vanilla sugar: one sugar cane (shapeless).
  {
    id: "sugar",
    width: 1,
    pattern: [cell("sugar_cane")],
    result: { item: "sugar", count: 1 },
    shapeless: true,
  },
  // Vanilla blaze powder: one blaze rod → 2 powder.
  {
    id: "blaze_powder",
    width: 1,
    pattern: [cell("blaze_rod")],
    result: { item: "blaze_powder", count: 2 },
    shapeless: true,
  },
  // Vanilla-ish glistering melon: gold + fruit (apple stands in for melon).
  {
    id: "glistering_melon",
    width: 2,
    pattern: [cell("gold_ingot"), cell("apple")],
    result: { item: "glistering_melon", count: 1 },
    shapeless: true,
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
  for (const cell of grid) {
    const item = cellItem(cell);
    if (!item) continue;
    // Shapeless / occupancy counts slots (vanilla), not stack size inside a slot.
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
};

const recipeCounts = (recipe: Recipe): Map<ItemType, number> => {
  const counts = new Map<ItemType, number>();
  for (const cell of recipe.pattern) {
    const item = cellItem(cell);
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
      const gridItem = cellItem(grid[y * size + x] ?? null);
      if (!inPattern) {
        if (gridItem !== null) return false;
        continue;
      }
      const patternItem = cellItem(recipe.pattern[(y - originY) * recipe.width + (x - originX)] ?? null);
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

/** Consume one craft: each occupied cell loses 1; leftover stacks stay (vanilla JE). */
const consumeOneCraft = (grid: CraftCell[]): Recipe | undefined => {
  const recipe = matchRecipe(grid);
  if (!recipe) return undefined;
  for (let i = 0; i < grid.length; i += 1) {
    const stack = asStack(grid[i]);
    if (!stack) continue;
    if (stack.count <= 1) grid[i] = null;
    else grid[i] = { item: stack.item, count: stack.count - 1 };
  }
  return recipe;
};

export const craftFromGrid = (
  inventory: Inventory,
  grid: CraftCell[],
): CraftResult | undefined => {
  const recipe = consumeOneCraft(grid);
  if (!recipe) return undefined;
  inventory[recipe.result.item] = (inventory[recipe.result.item] ?? 0) + recipe.result.count;
  return recipe.result;
};

/**
 * Shift-click result: craft as many as the grid allows (up to one output stack),
 * depositing straight into the bag (vanilla JE).
 */
export const craftMaxFromGrid = (
  inventory: Inventory,
  grid: CraftCell[],
): CraftResult | undefined => {
  const first = matchRecipe(grid);
  if (!first) return undefined;
  let total = 0;
  while (total + first.result.count <= STACK_MAX) {
    const recipe = matchRecipe(grid);
    if (!recipe || recipe.id !== first.id) break;
    if (!consumeOneCraft(grid)) break;
    total += first.result.count;
  }
  if (total <= 0) return undefined;
  inventory[first.result.item] = (inventory[first.result.item] ?? 0) + total;
  return { item: first.result.item, count: total };
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
  grid[slot] = { item, count: 1 };
  return true;
};

export const takeFromGrid = (inventory: Inventory, grid: CraftCell[], index: number): boolean => {
  const stack = asStack(grid[index]);
  if (!stack) return false;
  grid[index] = null;
  inventory[stack.item] = (inventory[stack.item] ?? 0) + stack.count;
  return true;
};

export const refundGrid = (inventory: Inventory, grid: CraftCell[]): void => {
  for (let i = 0; i < grid.length; i += 1) {
    const stack = asStack(grid[i]);
    if (!stack) continue;
    inventory[stack.item] = (inventory[stack.item] ?? 0) + stack.count;
    grid[i] = null;
  }
};

export const refundCursor = (inventory: Inventory, cursor: CraftCursor): CraftCursor => {
  if (!cursor) return null;
  inventory[cursor.item] = (inventory[cursor.item] ?? 0) + cursor.count;
  return null;
};

/**
 * Vanilla-ish bag click against a count-map inventory (not slotted).
 * Left: pick all / deposit all / swap. Right: pick half / deposit one.
 */
export const clickCraftBag = (
  inventory: Inventory,
  cursor: CraftCursor,
  item: ItemType,
  button: CraftPointerButton,
): CraftCursor => {
  const bagCount = inventory[item] ?? 0;
  if (!cursor) {
    if (bagCount <= 0) return null;
    if (button === "right") {
      const take = Math.ceil(bagCount / 2);
      inventory[item] -= take;
      return { item, count: take };
    }
    inventory[item] = 0;
    return { item, count: bagCount };
  }
  if (cursor.item === item) {
    if (button === "right") {
      inventory[item] = bagCount + 1;
      return cursor.count <= 1 ? null : { item: cursor.item, count: cursor.count - 1 };
    }
    inventory[item] = bagCount + cursor.count;
    return null;
  }
  // Different item: swap (left or right).
  inventory[cursor.item] = (inventory[cursor.item] ?? 0) + cursor.count;
  if (bagCount <= 0) return null;
  inventory[item] = 0;
  return { item, count: bagCount };
};

/** Vanilla craft-grid slot click with a cursor stack. */
export const clickCraftCell = (
  grid: CraftCell[],
  cursor: CraftCursor,
  index: number,
  button: CraftPointerButton,
): CraftCursor => {
  if (index < 0 || index >= grid.length) return cursor;
  const stack = asStack(grid[index]);

  if (button === "left") {
    if (!cursor) {
      if (!stack) return null;
      grid[index] = null;
      return { item: stack.item, count: stack.count };
    }
    if (!stack) {
      grid[index] = { item: cursor.item, count: cursor.count };
      return null;
    }
    if (stack.item === cursor.item) {
      const space = STACK_MAX - stack.count;
      if (space <= 0) return cursor;
      const moved = Math.min(space, cursor.count);
      grid[index] = { item: stack.item, count: stack.count + moved };
      return cursor.count === moved ? null : { item: cursor.item, count: cursor.count - moved };
    }
    grid[index] = { item: cursor.item, count: cursor.count };
    return { item: stack.item, count: stack.count };
  }

  // Right click
  if (!cursor) {
    if (!stack) return null;
    const take = Math.ceil(stack.count / 2);
    const left = stack.count - take;
    grid[index] = left > 0 ? { item: stack.item, count: left } : null;
    return { item: stack.item, count: take };
  }
  if (!stack) {
    grid[index] = { item: cursor.item, count: 1 };
    return cursor.count <= 1 ? null : { item: cursor.item, count: cursor.count - 1 };
  }
  if (stack.item === cursor.item && stack.count < STACK_MAX) {
    grid[index] = { item: stack.item, count: stack.count + 1 };
    return cursor.count <= 1 ? null : { item: cursor.item, count: cursor.count - 1 };
  }
  return cursor;
};

/**
 * Take crafting output onto the cursor (or shift → bag via craftMaxFromGrid).
 * Cursor must be empty or already holding the same result item with room.
 */
export const clickCraftResult = (
  inventory: Inventory,
  grid: CraftCell[],
  cursor: CraftCursor,
  shift: boolean,
): { cursor: CraftCursor; crafted: CraftResult | undefined } => {
  const recipe = matchRecipe(grid);
  if (!recipe) return { cursor, crafted: undefined };

  if (shift) {
    if (cursor) return { cursor, crafted: undefined };
    return { cursor, crafted: craftMaxFromGrid(inventory, grid) };
  }

  if (cursor && cursor.item !== recipe.result.item) return { cursor, crafted: undefined };
  if (cursor && cursor.count + recipe.result.count > STACK_MAX) return { cursor, crafted: undefined };

  if (!consumeOneCraft(grid)) return { cursor, crafted: undefined };
  const nextCount = (cursor?.count ?? 0) + recipe.result.count;
  return {
    cursor: { item: recipe.result.item, count: nextCount },
    crafted: recipe.result,
  };
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
  "lapis_lazuli",
  "sugar_cane",
  "paper",
  "book",
  "blaze_rod",
  "blaze_powder",
  "nether_wart",
  "sugar",
  "spider_eye",
  "glistering_melon",
  "glass_bottle",
  "water_bottle",
  "awkward_potion",
  "potion_healing",
  "potion_swiftness",
  "potion_poison",
]);

export const isToolItem = (item: ItemType): boolean =>
  isExtraItem(item) && !NON_TOOL_EXTRAS.has(item);
