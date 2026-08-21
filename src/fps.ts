/**
 * Low-overhead FPS sampling for the HUD (LRM-1614).
 * Count frames in-process; only refresh DOM when the window elapses.
 */

export const FPS_SAMPLE_MS = 500;

export type FpsSample = {
  frames: number;
  windowStart: number;
};

export const createFpsSample = (now: number): FpsSample => ({
  frames: 0,
  windowStart: now,
});

/** Record one rendered frame. Returns a display string when the sample window ends. */
export const tickFps = (
  sample: FpsSample,
  now: number,
  windowMs: number = FPS_SAMPLE_MS,
): string | null => {
  sample.frames += 1;
  const elapsed = now - sample.windowStart;
  if (elapsed < windowMs) return null;
  const fps = Math.round((sample.frames * 1000) / elapsed);
  sample.frames = 0;
  sample.windowStart = now;
  return `${fps} FPS`;
};
