/** Controllable overworld day/night cycle (vanilla-ish proportions). */

export const DAY_LENGTH_MS = 150_000;
/** Sun height below this counts as night (matches HUD threshold). */
export const NIGHT_SUN_THRESHOLD = 0.22;

export const dayProgress = (worldTimeMs: number): number => {
  const mod = ((worldTimeMs % DAY_LENGTH_MS) + DAY_LENGTH_MS) % DAY_LENGTH_MS;
  return mod / DAY_LENGTH_MS;
};

/** 0 at midnight trough, 1 at noon peak. Derived from `sin(2π · progress)`. */
export const sunHeightAt = (worldTimeMs: number): number =>
  Math.sin(dayProgress(worldTimeMs) * Math.PI * 2) * 0.5 + 0.5;

export const isNight = (worldTimeMs: number): boolean =>
  sunHeightAt(worldTimeMs) <= NIGHT_SUN_THRESHOLD;

/**
 * Progress where dawn crosses `NIGHT_SUN_THRESHOLD` after midnight.
 * sunHeight = 0.22 ⇒ sin(2πp) = -0.56 ⇒ rising limb p ≈ 0.9055.
 */
export const MORNING_PROGRESS =
  (2 * Math.PI + Math.asin(2 * NIGHT_SUN_THRESHOLD - 1)) / (2 * Math.PI);

/** Advance world time to the next dawn (just after night ends). */
export const skipToMorning = (worldTimeMs: number): number => {
  const progress = dayProgress(worldTimeMs);
  const targetMod = MORNING_PROGRESS * DAY_LENGTH_MS;
  const currentMod = progress * DAY_LENGTH_MS;
  let delta = targetMod - currentMod;
  if (delta <= 1) delta += DAY_LENGTH_MS;
  return worldTimeMs + delta;
};

export type DayClock = {
  /** Simulated world time in ms (monotonic within a session). */
  now: () => number;
  /** Persistable phase within one day. */
  phaseMs: () => number;
  /** Jump simulated time (e.g. bed skip). */
  setNow: (worldTimeMs: number) => void;
};

/** Wall-clock anchored day clock so bed skip can jump without freezing realtime. */
export const createDayClock = (initialPhaseMs = 0): DayClock => {
  let epochWall = performance.now();
  let phaseAtEpoch = ((initialPhaseMs % DAY_LENGTH_MS) + DAY_LENGTH_MS) % DAY_LENGTH_MS;
  return {
    now: () => phaseAtEpoch + (performance.now() - epochWall),
    phaseMs: () => {
      const mod = ((phaseAtEpoch + (performance.now() - epochWall)) % DAY_LENGTH_MS + DAY_LENGTH_MS) % DAY_LENGTH_MS;
      return mod;
    },
    setNow: (worldTimeMs: number) => {
      phaseAtEpoch = worldTimeMs;
      epochWall = performance.now();
    },
  };
};
