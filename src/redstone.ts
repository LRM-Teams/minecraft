import type { BlockPosition, BlockType, VoxelWorld } from "./world";

/** Vanilla wire power range. */
export const REDSTONE_MAX_POWER = 15;

export type LeverStates = Record<string, boolean>;
export type RedstoneSave = { levers?: LeverStates };

const posKey = (p: BlockPosition): string => `${p.x},${p.y},${p.z}`;
const parseKey = (key: string): BlockPosition => {
  const [x, y, z] = key.split(",").map(Number);
  return { x, y, z };
};

const HORIZONTAL: ReadonlyArray<BlockPosition> = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

const CARDINAL6: ReadonlyArray<BlockPosition> = [
  ...HORIZONTAL,
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
];

export const isRedstoneDust = (type: BlockType | undefined): type is "redstone_dust" =>
  type === "redstone_dust";

export const isLever = (type: BlockType | undefined): type is "lever" => type === "lever";

export const isRedstoneTorch = (type: BlockType | undefined): type is "redstone_torch" =>
  type === "redstone_torch";

export const isRedstoneLamp = (type: BlockType | undefined): type is "redstone_lamp" =>
  type === "redstone_lamp";

export const createLeverStates = (saved?: LeverStates): LeverStates => ({ ...(saved ?? {}) });

export const isLeverOn = (levers: LeverStates, pos: BlockPosition): boolean =>
  Boolean(levers[posKey(pos)]);

/** Flip a placed lever; returns the new ON state (false if cell is not a lever). */
export const toggleLeverAt = (
  world: VoxelWorld,
  levers: LeverStates,
  pos: BlockPosition,
): boolean | undefined => {
  if (world.get(pos.x, pos.y, pos.z) !== "lever") return undefined;
  const key = posKey(pos);
  const next = !levers[key];
  if (next) levers[key] = true;
  else delete levers[key];
  return next;
};

/** Dust needs a solid floor (vanilla floor wire). */
export const canPlaceRedstoneDustAt = (world: VoxelWorld, position: BlockPosition): boolean => {
  if (world.get(position.x, position.y, position.z)) return false;
  return world.isSolid(position.x, position.y - 1, position.z);
};

/** Lever / redstone torch attach like a normal torch (floor or wall). */
export const canPlaceRedstoneDeviceAt = (
  world: VoxelWorld,
  position: BlockPosition,
  against?: BlockPosition,
): boolean => {
  if (world.get(position.x, position.y, position.z)) return false;
  if (world.isSolid(position.x, position.y - 1, position.z)) return true;
  if (
    against &&
    world.isSolid(against.x, against.y, against.z) &&
    (against.x !== position.x || against.y !== position.y || against.z !== position.z)
  ) {
    return true;
  }
  return false;
};

export const canPlaceRedstoneLampAt = (world: VoxelWorld, position: BlockPosition): boolean =>
  !world.get(position.x, position.y, position.z);

/** Vanilla-ish redstone ore drop count (4–5). */
export const redstoneDropCount = (seed: number, x: number, y: number, z: number): number => {
  const unit = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 0.13)) % 1;
  return 4 + Math.floor(unit * 2);
};

/**
 * Whether a solid support cell is considered powered for torch inversion.
 * Powered when an adjacent ON lever faces it, or adjacent dust carries power > 0.
 */
export const isBlockPowered = (
  world: VoxelWorld,
  levers: LeverStates,
  wirePower: Map<string, number>,
  support: BlockPosition,
): boolean => {
  for (const offset of CARDINAL6) {
    const n = { x: support.x + offset.x, y: support.y + offset.y, z: support.z + offset.z };
    const type = world.get(n.x, n.y, n.z);
    if (type === "lever" && isLeverOn(levers, n)) return true;
    if (type === "redstone_dust" && (wirePower.get(posKey(n)) ?? 0) > 0) return true;
  }
  return false;
};

/** Floor-mounted torch support = block directly below. */
export const torchSupportOf = (pos: BlockPosition): BlockPosition => ({
  x: pos.x,
  y: pos.y - 1,
  z: pos.z,
});

/**
 * Propagate wire power 0–15 with −1 attenuation per dust step (vanilla-style).
 * Sources: ON levers and non-inverted redstone torches inject 15 into adjacent dust.
 * Iterates until torch inversion + wire power stabilize.
 */
export const computeRedstoneNetwork = (
  world: VoxelWorld,
  levers: LeverStates,
): {
  wirePower: Map<string, number>;
  torchOn: Map<string, boolean>;
  lampLit: Map<string, boolean>;
} => {
  const dustKeys: string[] = [];
  const torchKeys: string[] = [];
  const lampKeys: string[] = [];
  world.blocks.forEach((type, key) => {
    if (type === "redstone_dust") dustKeys.push(key);
    else if (type === "redstone_torch") torchKeys.push(key);
    else if (type === "redstone_lamp") lampKeys.push(key);
  });

  const torchOn = new Map<string, boolean>();
  torchKeys.forEach((key) => torchOn.set(key, true));

  let wirePower = new Map<string, number>();

  const injectAndPropagate = (activeTorches: Map<string, boolean>): Map<string, number> => {
    const power = new Map<string, number>();
    dustKeys.forEach((key) => power.set(key, 0));

    const strengthen = (key: string, value: number): void => {
      if (!power.has(key)) return;
      const prev = power.get(key) ?? 0;
      if (value > prev) power.set(key, Math.min(REDSTONE_MAX_POWER, value));
    };

    const seedDustNear = (pos: BlockPosition, strength: number): void => {
      for (const offset of HORIZONTAL) {
        const n = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
        const key = posKey(n);
        if (world.get(n.x, n.y, n.z) === "redstone_dust") strengthen(key, strength);
      }
      // Same-cell dust is impossible; also soft-power dust sitting on the source's support
      // is handled when lever/torch sit beside the wire on the same floor.
      const above = { x: pos.x, y: pos.y + 1, z: pos.z };
      if (world.get(above.x, above.y, above.z) === "redstone_dust") {
        strengthen(posKey(above), strength);
      }
    };

    world.blocks.forEach((type, key) => {
      if (type === "lever" && levers[key]) seedDustNear(parseKey(key), REDSTONE_MAX_POWER);
      if (type === "redstone_torch" && activeTorches.get(key)) {
        seedDustNear(parseKey(key), REDSTONE_MAX_POWER);
      }
    });

    // Multi-source BFS: push high power outward with −1 per hop.
    const queue: string[] = [];
    power.forEach((value, key) => {
      if (value > 0) queue.push(key);
    });
    while (queue.length) {
      const key = queue.shift()!;
      const current = power.get(key) ?? 0;
      if (current <= 1) continue;
      const pos = parseKey(key);
      for (const offset of HORIZONTAL) {
        const n = { x: pos.x + offset.x, y: pos.y, z: pos.z + offset.z };
        const nKey = posKey(n);
        if (world.get(n.x, n.y, n.z) !== "redstone_dust") continue;
        const next = current - 1;
        if (next > (power.get(nKey) ?? 0)) {
          power.set(nKey, next);
          queue.push(nKey);
        }
      }
    }
    return power;
  };

  for (let iter = 0; iter < 32; iter += 1) {
    wirePower = injectAndPropagate(torchOn);
    let changed = false;
    for (const key of torchKeys) {
      const pos = parseKey(key);
      const support = torchSupportOf(pos);
      const inverted = world.isSolid(support.x, support.y, support.z)
        && isBlockPowered(world, levers, wirePower, support);
      const nextOn = !inverted;
      if (torchOn.get(key) !== nextOn) {
        torchOn.set(key, nextOn);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const lampLit = new Map<string, boolean>();
  for (const key of lampKeys) {
    const pos = parseKey(key);
    let lit = false;
    for (const offset of CARDINAL6) {
      const n = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
      const type = world.get(n.x, n.y, n.z);
      if (type === "redstone_dust" && (wirePower.get(posKey(n)) ?? 0) > 0) {
        lit = true;
        break;
      }
      if (type === "lever" && isLeverOn(levers, n)) {
        lit = true;
        break;
      }
      if (type === "redstone_torch" && torchOn.get(posKey(n))) {
        lit = true;
        break;
      }
    }
    lampLit.set(key, lit);
  }

  return { wirePower, torchOn, lampLit };
};

export const wirePowerAt = (
  wirePower: Map<string, number>,
  pos: BlockPosition,
): number => wirePower.get(posKey(pos)) ?? 0;

export const isLampLitAt = (
  lampLit: Map<string, boolean>,
  pos: BlockPosition,
): boolean => Boolean(lampLit.get(posKey(pos)));

export const isTorchOnAt = (
  torchOn: Map<string, boolean>,
  pos: BlockPosition,
): boolean => torchOn.get(posKey(pos)) !== false;

/** Clear lever state when the lever block is removed. */
export const clearLeverAt = (levers: LeverStates, pos: BlockPosition): void => {
  delete levers[posKey(pos)];
};

export const serializeRedstone = (levers: LeverStates): RedstoneSave => {
  const entries = Object.entries(levers).filter(([, on]) => on);
  return entries.length ? { levers: Object.fromEntries(entries) } : {};
};
