/**
 * Sneak vs sprint controls (this game: Shift=sprint, Ctrl=sneak).
 * Documented in HUD / codex so players are not surprised by the JE key swap.
 */

/** Walk speed (blocks/sec) before potion multipliers. */
export const WALK_SPEED = 4.4;
/** Sprint speed (blocks/sec). */
export const SPRINT_SPEED = 8;
/** Sneak speed ≈ vanilla 30% of walk. */
export const SNEAK_SPEED = 1.3;

export const isSneakKey = (code: string): boolean =>
  code === "ControlLeft" || code === "ControlRight";

export const isSprintKey = (code: string): boolean =>
  code === "ShiftLeft" || code === "ShiftRight";

/**
 * Resolve locomotion intent. Sneak always wins over sprint (vanilla-ish:
 * you cannot sprint while sneaking).
 */
export const resolveMoveMode = (options: {
  sneakHeld: boolean;
  sprintHeld: boolean;
  canSprint: boolean;
}): "sneak" | "sprint" | "walk" => {
  if (options.sneakHeld) return "sneak";
  if (options.sprintHeld && options.canSprint) return "sprint";
  return "walk";
};

export const speedForMode = (mode: "sneak" | "sprint" | "walk"): number => {
  if (mode === "sneak") return SNEAK_SPEED;
  if (mode === "sprint") return SPRINT_SPEED;
  return WALK_SPEED;
};

/**
 * Edge protection: while sneaking on the ground, refuse a horizontal step that
 * would drop the standing height (camera eye ≈ ground + PLAYER_EYE).
 */
export const wouldFallOffEdge = (options: {
  currentEyeY: number;
  nextEyeY: number;
  /** Tolerance so tiny height noise does not lock the player. */
  dropThreshold?: number;
}): boolean => {
  const drop = options.dropThreshold ?? 0.35;
  return options.nextEyeY < options.currentEyeY - drop;
};
