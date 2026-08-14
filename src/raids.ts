import type { VoxelWorld, VillageAnchor } from "./world";
import { createMob, type Mob } from "./entities";

/**
 * Nighttime raid / pillager wave system.
 *
 * Pure TypeScript: no THREE, no render state, no I/O. A raid is a deterministic
 * scheduling layer that, once triggered at night, spawns hostile `Mob` raiders
 * at the edge of a village over a series of waves. The raiders themselves are
 * ordinary `Mob` entities from the entities track (they chase the player, can be
 * intercepted/killed by villagers, the iron golem guard, or the player, and
 * drop loot through the existing mob-drop path). This module only manages the
 * wave lifecycle: when to spawn, how many, wave progression, and victory when
 * every raider is cleared.
 *
 * It consumes the stable `Mob` interface and `VillageAnchor` (plaza/center) and
 * does not modify the golem guard's target selection or villager profession/trade
 * APIs, so it stays boundary-clean alongside LRM-1550/LRM-1551.
 */

export interface RaidOptions {
  /** Raiders per wave. */
  waveSize?: number;
  /** Total number of waves in a raid. */
  waveCount?: number;
  /** Distance from the village plaza where raiders spawn. */
  spawnRadius?: number;
  /** Game seconds between spawning two raiders within a wave. */
  spawnIntervalSec?: number;
  /** Game seconds a raid waits at night before it begins the next wave. */
  resupplySec?: number;
}

export interface Raid {
  readonly id: number;
  readonly village: VillageAnchor;
  readonly waveCount: number;
  readonly waveSize: number;
  readonly spawnRadius: number;
  readonly spawnIntervalSec: number;
  readonly resupplySec: number;
  /** Current wave index (1-based). */
  wave: number;
  /** How many raiders remain to be spawned in the current wave. */
  raidersToSpawn: number;
  /** Seconds until the next raider spawn (or the next wave). */
  timer: number;
  /** Total raiders spawned by this raid so far (used for unique ids). */
  spawned: number;
  /** Mob ids belonging to this raid that are still alive. */
  raiderIds: number[];
  /** A raid is actively spawning or still has living raiders. */
  active: boolean;
  /** The raid has been cleared (all raiders defeated). */
  defeated: boolean;
}

const DEFAULTS: Required<RaidOptions> = {
  waveSize: 3,
  waveCount: 3,
  spawnRadius: 10,
  spawnIntervalSec: 1.2,
  resupplySec: 6,
};

const PLAN: Array<{ x: number; z: number }> = [
  { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 },
  { x: 0.7, z: 0.7 }, { x: -0.7, z: 0.7 }, { x: 0.7, z: -0.7 }, { x: -0.7, z: -0.7 },
];

/**
 * Create a raid aimed at a village. Raid is not automatically active until it
 * spawns its first raider via `updateRaid`.
 */
export function createRaid(id: number, village: VillageAnchor, opts: RaidOptions = {}): Raid {
  const { waveSize, waveCount, spawnRadius, spawnIntervalSec, resupplySec } = { ...DEFAULTS, ...opts };
  return {
    id,
    village,
    waveCount,
    waveSize,
    spawnRadius,
    spawnIntervalSec,
    resupplySec,
    wave: 1,
    raidersToSpawn: waveSize,
    timer: 0.5,
    spawned: 0,
    raiderIds: [],
    active: true,
    defeated: false,
  };
}

/**
 * Whether a new raid should start right now: it is night, no raid is already
 * active for the same village, and there is a village to attack. Pure and
 * deterministic so the integration layer (the render loop) can call it once.
 */
export function shouldStartRaid(
  villages: VillageAnchor[],
  activeRaids: Raid[],
  isNight: boolean,
): boolean {
  if (!isNight) return false;
  if (!villages.length) return false;
  return !activeRaids.some((raid) => raid.active && !raid.defeated);
}

/**
 * Advance a raid by `delta` game-seconds: spawn raiders for the current wave,
 * prune dead raiders, roll to the next wave, and mark the raid defeated once
 * every wave has been spawned and every raider is dead. Newly spawned raiders
 * are pushed onto `mobs` so the normal simulation loop drives their movement.
 */
export function updateRaid(raid: Raid, world: VoxelWorld, mobs: Mob[], delta: number): void {
  if (!raid.active || raid.defeated) return;

  // Prune raiders that have been defeated by the player / guard / villagers.
  raid.raiderIds = raid.raiderIds.filter((raiderId) => mobs.some((m) => m.id === raiderId && !m.dead));

  const ready = raid.raidersToSpawn > 0 || raid.raiderIds.length > 0;
  if (!ready) {
    // Current wave fully cleared → advance.
    if (raid.wave >= raid.waveCount) {
      raid.defeated = true;
      raid.active = false;
      return;
    }
    raid.wave += 1;
    raid.raidersToSpawn = raid.waveSize;
    raid.timer = raid.resupplySec;
    return;
  }

  // Spawn raiders for the current wave on a cadence.
  raid.timer -= delta;
  if (raid.raidersToSpawn > 0 && raid.timer <= 0) {
    spawnRaider(raid, world, mobs);
    raid.raidersToSpawn -= 1;
    raid.timer = raid.spawnIntervalSec;
  }

  // When a wave is fully spawned and every raider is dead, end the raid.
  if (raid.raidersToSpawn === 0 && raid.raiderIds.length === 0) {
    raid.defeated = true;
    raid.active = false;
  }
}

/** Spawn one raider at the village edge on the next free ring slot. */
function spawnRaider(raid: Raid, world: VoxelWorld, mobs: Mob[]): void {
  const plaza = raid.village.plaza;
  const slot = PLAN[raid.spawned % PLAN.length];
  const x = Math.max(-world.size + 2, Math.min(world.size - 2, plaza.x + Math.round(slot.x * raid.spawnRadius)));
  const z = Math.max(-world.size + 2, Math.min(world.size - 2, plaza.z + Math.round(slot.z * raid.spawnRadius)));
  const mob = createMob(raid.id * 1000 + raid.spawned, x, z, { kind: "raider" });
  mobs.push(mob);
  raid.raiderIds.push(mob.id);
  raid.spawned += 1;
}

/** Human-readable progress line for a raid for the HUD. */
export const raidProgress = (raid: Raid): string =>
  raid.defeated
    ? "袭击已被击退！"
    : `袭击第 ${raid.wave}/${raid.waveCount} 波 · 剩余 ${raid.raiderIds.length}名袭击者`;
