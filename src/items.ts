import { BLOCK_TYPES, type BlockType } from "./world";

/** Non-placeable / component items (Minecraft survival bag). */
export const EXTRA_ITEMS = [
  "stick",
  "coal",
  "charcoal",
  "iron_ingot",
  "gold_ingot",
  "copper_ingot",
  "diamond",
  "wooden_pickaxe",
  "stone_pickaxe",
  "iron_pickaxe",
  "gold_pickaxe",
  "diamond_pickaxe",
  "wooden_axe",
  "stone_axe",
  "iron_axe",
  "gold_axe",
  "diamond_axe",
  "wooden_shovel",
  "stone_shovel",
  "iron_shovel",
  "gold_shovel",
  "diamond_shovel",
  "wooden_sword",
  "stone_sword",
  "iron_sword",
  "gold_sword",
  "diamond_sword",
  "wooden_hoe",
  "stone_hoe",
  "iron_hoe",
  "gold_hoe",
  "diamond_hoe",
] as const;

export type ExtraItem = (typeof EXTRA_ITEMS)[number];
export type ItemType = BlockType | ExtraItem;

export const ITEM_TYPES = [...BLOCK_TYPES, ...EXTRA_ITEMS] as const;

export const isBlockType = (item: ItemType): item is BlockType =>
  (BLOCK_TYPES as readonly string[]).includes(item);

export const isExtraItem = (item: ItemType): item is ExtraItem =>
  (EXTRA_ITEMS as readonly string[]).includes(item);

export const isPickaxe = (item: ItemType | undefined): boolean =>
  Boolean(item && item.endsWith("_pickaxe"));

export const isAxe = (item: ItemType | undefined): boolean =>
  Boolean(item && /_axe$/.test(item) && !item.endsWith("_pickaxe"));

export const isShovel = (item: ItemType | undefined): boolean =>
  Boolean(item && item.endsWith("_shovel"));

export const isSword = (item: ItemType | undefined): boolean =>
  Boolean(item && item.endsWith("_sword"));

export const isHoe = (item: ItemType | undefined): boolean =>
  Boolean(item && item.endsWith("_hoe"));

export const isTool = (item: ItemType | undefined): boolean =>
  isPickaxe(item) || isAxe(item) || isShovel(item) || isSword(item) || isHoe(item);

/** Minecraft-ish mining speed multipliers by tool tier (hand = 1). */
export const TOOL_SPEED: Partial<Record<ExtraItem, number>> = {
  wooden_pickaxe: 2,
  stone_pickaxe: 4,
  iron_pickaxe: 6,
  gold_pickaxe: 12,
  diamond_pickaxe: 8,
  wooden_axe: 2,
  stone_axe: 4,
  iron_axe: 6,
  gold_axe: 12,
  diamond_axe: 8,
  wooden_shovel: 2,
  stone_shovel: 4,
  iron_shovel: 6,
  gold_shovel: 12,
  diamond_shovel: 8,
};

/** Sword melee damage bonus on top of the base punch. */
export const SWORD_DAMAGE: Partial<Record<ExtraItem, number>> = {
  wooden_sword: 4,
  stone_sword: 5,
  iron_sword: 6,
  gold_sword: 4,
  diamond_sword: 7,
};

export const ITEM_LABELS: Record<ItemType, string> = {
  grass: "草方块",
  dirt: "泥土",
  stone: "石头",
  wood: "原木",
  planks: "木板",
  leaves: "树叶",
  sand: "沙子",
  water: "水",
  bricks: "石砖",
  glass: "玻璃",
  coal_ore: "煤矿石",
  copper_ore: "铜矿石",
  iron_ore: "铁矿石",
  gold_ore: "金矿石",
  diamond_ore: "钻石矿石",
  crafting_table: "工作台",
  furnace: "熔炉",
  torch: "火把",
  wool: "羊毛",
  bed: "床",
  stick: "木棍",
  coal: "煤炭",
  charcoal: "木炭",
  iron_ingot: "铁锭",
  gold_ingot: "金锭",
  copper_ingot: "铜锭",
  diamond: "钻石",
  wooden_pickaxe: "木镐",
  stone_pickaxe: "石镐",
  iron_pickaxe: "铁镐",
  gold_pickaxe: "金镐",
  diamond_pickaxe: "钻石镐",
  wooden_axe: "木斧",
  stone_axe: "石斧",
  iron_axe: "铁斧",
  gold_axe: "金斧",
  diamond_axe: "钻石斧",
  wooden_shovel: "木铲",
  stone_shovel: "石铲",
  iron_shovel: "铁铲",
  gold_shovel: "金铲",
  diamond_shovel: "钻石铲",
  wooden_sword: "木剑",
  stone_sword: "石剑",
  iron_sword: "铁剑",
  gold_sword: "金剑",
  diamond_sword: "钻石剑",
  wooden_hoe: "木锄",
  stone_hoe: "石锄",
  iron_hoe: "铁锄",
  gold_hoe: "金锄",
  diamond_hoe: "钻石锄",
};
