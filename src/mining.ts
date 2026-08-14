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
};

export const breakDuration = (block: BlockType): number => DURATIONS[block];
export const isMineable = (block: BlockType): boolean => Number.isFinite(breakDuration(block));
