import type { BlockType } from "./world";

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
};

export const breakDuration = (block: BlockType): number => DURATIONS[block];
export const isMineable = (block: BlockType): boolean => Number.isFinite(breakDuration(block));
