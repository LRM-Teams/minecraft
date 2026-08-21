/**
 * Pure right-click resolution for overworld block interaction vs placement.
 * Extracted so placement feedback / sneak-place can be unit-tested without DOM.
 */

/** Blocks that open a UI or toggle on right-click (vanilla-style interactables). */
export const INTERACTABLE_BLOCKS = [
  "crafting_table",
  "furnace",
  "enchanting_table",
  "brewing_stand",
  "bed",
  "lever",
] as const;

export type InteractableBlock = (typeof INTERACTABLE_BLOCKS)[number];

export const isInteractableBlock = (block: string | null | undefined): block is InteractableBlock =>
  Boolean(block && (INTERACTABLE_BLOCKS as readonly string[]).includes(block));

export type RightClickAction = "interact" | "place" | "empty";

/**
 * Vanilla-ish rule:
 * - Sneaking (Shift) while holding a block → always try to place (even on chests/tables).
 * - Empty hotbar slot → do not silently no-op; caller shows feedback (`empty`).
 * - Otherwise interactables consume the click; bare blocks get a place attempt.
 */
export const resolveRightClick = (input: {
  aimedBlock: string | null | undefined;
  holdingBlock: boolean;
  sneaking: boolean;
}): RightClickAction => {
  if (!input.holdingBlock) return "empty";
  if (input.sneaking) return "place";
  if (isInteractableBlock(input.aimedBlock)) return "interact";
  return "place";
};

export const emptyHotbarFeedback = (label?: string): string =>
  label
    ? `热键栏「${label}」数量为 0，切换到有方块的槽再右键放置`
    : "当前热键槽为空，切换到有方块的槽再右键放置（Shift+右键可对着工作台等强制放置）";
