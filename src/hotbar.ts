import { BLOCK_TYPES, type BlockType } from "./world";

/** Vanilla-style 9-slot hotbar (digits 1–9). */
export const HOTBAR_SIZE = 9;

/**
 * Default placeable bindings for the rewrite hotbar.
 * Curated for wiki-recognisable colour / silhouette variety (草/土/石/木…).
 */
export const DEFAULT_HOTBAR: readonly BlockType[] = [
  "grass",
  "dirt",
  "stone",
  "wood",
  "planks",
  "sand",
  "bricks",
  "glass",
  "torch",
] as const;

/** Starter stack sizes so right-click place works immediately on a new world. */
export const STARTER_STACKS: Partial<Record<BlockType, number>> = {
  grass: 64,
  dirt: 64,
  stone: 64,
  wood: 32,
  planks: 32,
  sand: 64,
  bricks: 32,
  glass: 16,
  torch: 16,
  wool: 16,
  bed: 1,
};

/** Short Chinese tags for hotbar readability (wiki-aligned names, abbreviated). */
export const HOTBAR_TAG: Partial<Record<BlockType, string>> = {
  grass: "草",
  dirt: "土",
  stone: "石",
  wood: "木",
  planks: "板",
  leaves: "叶",
  sand: "沙",
  water: "水",
  bricks: "砖",
  glass: "玻",
  coal_ore: "煤",
  copper_ore: "铜",
  iron_ore: "铁",
  gold_ore: "金",
  diamond_ore: "钻",
  lapis_ore: "青",
  redstone_ore: "红",
  obsidian: "曜",
  crafting_table: "台",
  furnace: "炉",
  chest: "箱",
  enchanting_table: "附",
  bookshelf: "书",
  brewing_stand: "酿",
  torch: "炬",
  wool: "毛",
  bed: "床",
  oak_door: "门",
  ladder: "梯",
  redstone_dust: "粉",
  lever: "杆",
  redstone_torch: "红炬",
  redstone_lamp: "灯",
};

export const clampHotbarIndex = (index: number): number =>
  ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;

export const hotbarTypeAt = (slots: readonly BlockType[], index: number): BlockType =>
  slots[clampHotbarIndex(index)] ?? DEFAULT_HOTBAR[0];

export const isKnownBlockType = (value: string): value is BlockType =>
  (BLOCK_TYPES as readonly string[]).includes(value);
