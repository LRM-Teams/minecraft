import type { BlockType } from "./world";
import { isAxe, isPickaxe, isShovel, type ExtraItem, type ItemType, TOOL_SPEED } from "./items";

const DURATIONS: Record<BlockType, number> = {
  grass: 0.3,
  dirt: 0.28,
  stone: 0.9,
  wood: 0.72,
  planks: 0.58,
  leaves: 0.16,
  sand: 0.24,
  water: Number.POSITIVE_INFINITY,
  bricks: 0.95,
  glass: 0.22,
  coal_ore: 1.1,
  copper_ore: 1.3,
  iron_ore: 1.5,
  gold_ore: 1.8,
  diamond_ore: 2.2,
  lapis_ore: 1.6,
  redstone_ore: 1.55,
  obsidian: 8,
  crafting_table: 0.65,
  furnace: 0.95,
  chest: 0.7,
  enchanting_table: 1.2,
  bookshelf: 0.55,
  brewing_stand: 0.7,
  torch: 0.05,
  wool: 0.35,
  bed: 0.4,
  redstone_dust: 0.05,
  lever: 0.15,
  redstone_torch: 0.05,
  redstone_lamp: 0.45,
  oak_door: 0.5,
  ladder: 0.2,
};

const PICKAXE_BLOCKS = new Set<BlockType>([
  "stone",
  "bricks",
  "coal_ore",
  "copper_ore",
  "iron_ore",
  "gold_ore",
  "diamond_ore",
  "lapis_ore",
  "redstone_ore",
  "obsidian",
  "furnace",
  "enchanting_table",
  "brewing_stand",
  "redstone_lamp",
]);
const AXE_BLOCKS = new Set<BlockType>(["wood", "planks", "crafting_table", "chest", "bookshelf", "leaves", "bed", "oak_door", "ladder"]);
const SHOVEL_BLOCKS = new Set<BlockType>(["grass", "dirt", "sand"]);

/**
 * Vanilla JE pickaxe harvest levels (gold = wood for harvest, diamond = 3).
 * Wood/Gold 0 · Stone 1 · Iron 2 · Diamond 3.
 */
export type HarvestLevel = 0 | 1 | 2 | 3;

/** Minimum pickaxe harvest level required to obtain a drop (wiki-aligned). */
export const REQUIRED_HARVEST: Partial<Record<BlockType, HarvestLevel>> = {
  coal_ore: 0,
  copper_ore: 1,
  iron_ore: 1,
  lapis_ore: 1,
  gold_ore: 2,
  diamond_ore: 2,
  redstone_ore: 2,
  /** Obsidian requires diamond (or netherite) pickaxe. */
  obsidian: 3,
};

/** -1 = bare hand / non-pickaxe (cannot meet any REQUIRED_HARVEST). */
export const pickaxeHarvestLevel = (tool?: ExtraItem | null): number => {
  if (!tool || !isPickaxe(tool)) return -1;
  if (tool.startsWith("diamond_")) return 3;
  if (tool.startsWith("iron_")) return 2;
  if (tool.startsWith("stone_")) return 1;
  // wooden / gold
  return 0;
};

export const canHarvestDrop = (block: BlockType, tool?: ExtraItem | null): boolean => {
  const need = REQUIRED_HARVEST[block];
  if (need === undefined) return true;
  return pickaxeHarvestLevel(tool) >= need;
};

/** Alias used by main / tests. */
export const canHarvestBlock = canHarvestDrop;

/**
 * Vanilla-style ore drops: coal/diamond gemify on break; metals stay as ore for the furnace.
 * Lapis / redstone counts are handled by callers (variable drops).
 */
export const miningDropItem = (block: BlockType): ItemType | null => {
  switch (block) {
    case "coal_ore":
      return "coal";
    case "diamond_ore":
      return "diamond";
    case "lapis_ore":
    case "redstone_ore":
      return null;
    default:
      return block;
  }
};

export const breakDuration = (block: BlockType, tool?: ExtraItem | null): number => {
  const base = DURATIONS[block];
  if (!Number.isFinite(base)) return base;
  // Wrong-tier pick / bare hand on harvest-gated blocks: still breakable but slow, no drop.
  if (REQUIRED_HARVEST[block] !== undefined && !canHarvestDrop(block, tool)) {
    return base * (block === "obsidian" ? 4 : 2.5);
  }
  if (!tool) return base;
  const speed = TOOL_SPEED[tool] ?? 1;
  const suited =
    (isPickaxe(tool) && PICKAXE_BLOCKS.has(block)) ||
    (isAxe(tool) && AXE_BLOCKS.has(block)) ||
    (isShovel(tool) && SHOVEL_BLOCKS.has(block));
  return suited ? base / speed : base;
};

export const isMineable = (block: BlockType): boolean => Number.isFinite(DURATIONS[block]);
