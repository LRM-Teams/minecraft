/**
 * LRM-1613 graphics budget for Pages / mid-range machines.
 * Tuned so walking does not force soft-shadow + full mesh dispose every step.
 */
export const PERF = {
  /** Cap devicePixelRatio (retina 2–3× was blowing fill-rate). */
  maxPixelRatio: 1.5,
  /** Soft PCF shadows are a major main-thread / GPU hitch — off by default. */
  shadowMap: false,
  sunCastShadow: false,
  /** Concurrent torch point lights (was 14). */
  maxTorchLights: 6,
  /** Throttle torch light position scans. */
  torchSyncEveryMs: 120,
  /** World gen radius in chunks around the player (was 3). */
  streamChunkRadius: 2,
  /** Drawn chunk radius passed to `visibleBlocks` / rebuild (was 2). */
  visibleChunkRadius: 2,
} as const;
