import type { BlockType } from "./world";
import { isAxe, isPickaxe, isShovel, type ExtraItem, TOOL_SPEED } from "./items";

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
const AXE_BLOCKS = new Set<BlockType>(["wood", "planks", "crafting_table", "bookshelf", "leaves", "bed"]);
const SHOVEL_BLOCKS = new Set<BlockType>(["grass", "dirt", "sand"]);

export const breakDuration = (block: BlockType, tool?: ExtraItem | null): number => {
  const base = DURATIONS[block];
  if (!Number.isFinite(base)) return base;
  if (!tool) return base;
  const speed = TOOL_SPEED[tool] ?? 1;
  const suited =
    (isPickaxe(tool) && PICKAXE_BLOCKS.has(block)) ||
    (isAxe(tool) && AXE_BLOCKS.has(block)) ||
    (isShovel(tool) && SHOVEL_BLOCKS.has(block));
  return suited ? base / speed : base;
};

export const isMineable = (block: BlockType): boolean => Number.isFinite(DURATIONS[block]);
