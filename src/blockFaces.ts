/**
 * Cube-face semantics for overworld blocks (Three.js BoxGeometry order).
 * Box material slots: +X, -X, +Y, -Y, +Z, -Z → side, side, top, bottom, side, side.
 */
export type BlockFace = "side" | "top" | "bottom";

/** Material index → semantic face for a unit cube. */
export const BOX_FACES: readonly BlockFace[] = [
  "side",
  "side",
  "top",
  "bottom",
  "side",
  "side",
] as const;

/** Cache / asset key for a block face (world mesh only — never HUD icons). */
export const faceTextureKey = (type: string, face: BlockFace): string => `${type}-${face}`;

/**
 * Types whose top/bottom must not look like the side (JE-style).
 * Others still get six materials so each face is an independent 16×16 tile
 * (never a whole item-icon wallpaper).
 */
export const DISTINCT_CAP_TYPES = new Set<string>([
  "grass",
  "wood",
  "crafting_table",
  "bookshelf",
  "furnace",
  "enchanting_table",
  "brewing_stand",
  "bed",
]);

export const faceIsCap = (face: BlockFace): boolean => face === "top" || face === "bottom";
