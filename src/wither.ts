import type { BlockPosition, BlockType, VoxelWorld } from "./world";
import { createMob, type Mob } from "./entities";

/**
 * Phase-3 「凋灵 Wither」· optional high-difficulty mid-boss of the world.
 *
 * Pure TypeScript: no THREE, no render state, no I/O. Mirrors the
 * boundary-clean pattern of `nether.ts` / `raids.ts` / `guardians.ts`: the boss,
 * its constructible summoning ritual, its flying skull projectiles and its
 * summoned skeletons are plain data driven by the same `Mob` / `VoxelWorld`
 * contracts used elsewhere, so the render loop just calls `updateWither` once
 * per frame and renders the returned projectiles / hp for the HUD.
 *
 * Original mechanics
 * ------------------
 * - **Constructible summon** (soul-sand + skull head): the ritual shape
 *   consumes only existing overworld `BLOCK_TYPES` (sand = soul-sand proxy,
 *   stone = skull head), so `BLOCK_TYPES` / `WorldSnapshot` stay unchanged and
 *   existing saves load identically.
 * - **Flying boss**: the Wither hovers above the terrain, drifts toward the
 *   player, and stops at a hover range to fight.
 * - **Skull barrages**: it fires wither-skull projectiles that home on the
 *   player; two stages (combat / enraged-dying) with different cadences.
 * - **Skeleton summons**: on a cadence it spawns tough skeleton minions
 *   (ordinary `Mob` entities, so the existing chase/guard/AI pipelines act on
 *   them) which chase and melee the player.
 * - **Loot**: on defeat it drops blocks into the bag plus a unique 下界之星
 *   (Nether Star) counted on an *additive optional* `PlayerSave` field — never a
 *   new block id.
 */

/** The boss's lifecycle stages. */
export type WitherPhase = "dormant" | "combat" | "dying" | "defeated";

export interface WitherOptions {
  /** Max health of the boss. */
  hp?: number;
  /** Horizontal distance at which the boss notices / approaches the player. */
  aggroRange?: number;
  /** Height in world units the boss hovers above the terrain. */
  hoverHeight?: number;
  /** Horizontal speed at which the boss drifts toward the player. */
  speed?: number;
  /** Game seconds between two skull projectiles in combat. */
  skullCooldown?: number;
  /** Game seconds between two skull projectiles while enraged (dying). */
  enragedSkullCooldown?: number;
  /** Game seconds between summoning a fresh skeleton. */
  summonCooldown?: number;
  /** Fraction of max hp below which the boss enrages. */
  enrageThreshold?: number;
  /** Number of simultaneous skeleton minions the boss keeps alive. */
  maxMinions?: number;
}

export interface WitherBoss {
  readonly id: number;
  x: number;
  /** Feet height; resolved each frame to hover the given distance above terrain. */
  y: number;
  z: number;
  health: number;
  readonly maxHealth: number;
  phase: WitherPhase;
  /** Horizontal heading in radians (0 = +Z, as in the rest of the mob code). */
  facing: number;
  readonly aggroRange: number;
  readonly hoverHeight: number;
  readonly speed: number;
  readonly skullCooldown: number;
  readonly enragedSkullCooldown: number;
  readonly summonCooldown: number;
  readonly enrageThreshold: number;
  readonly maxMinions: number;
  /** Seconds until the next skull fires. */
  skullTimer: number;
  /** Seconds until the next skeleton summon. */
  summonTimer: number;
  /** In-flight wither skull projectiles. */
  projectiles: WitherSkull[];
  /** Mob ids of the currently-living skeleton minions it has summoned. */
  minionIds: number[];
  /** Total skeletons it has summoned (unique minion id seed). */
  spawnedMinions: number;
  /** Has the boss been defeated (loot already granted once). */
  defeated: boolean;
}

/** A homing wither-skull projectile fired by the boss. */
export interface WitherSkull {
  readonly id: number;
  x: number;
  y: number;
  z: number;
  /** Full speed (world units / s) toward the player. */
  readonly speed: number;
  /** Damage dealt if it strikes the player. */
  readonly damage: number;
  /** Seconds until the skull fizzles out if it never lands. */
  readonly lifetime: number;
  age: number;
  /** Has this skull already dealt its damage (one-shot). */
  spent: boolean;
}

/** The handful of original blocks dropped into the bag when the Wither falls. */
export const WITHER_LOOT_BLOCKS: readonly BlockType[] = ["diamond_ore", "gold_ore"] as const;

/** Relative positions (from the base middle) that must be sand (soul-sand). */
const SAND_OFFSETS: readonly BlockPosition[] = [
  { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
  { x: -1, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
];
/** The central skull-head (stone) block sits on the middle of the T. */
const HEAD_OFFSET: BlockPosition = { x: 0, y: 2, z: 0 };

/**
 * Shape of the constructible summon: the iconic Wither "T" — a row of three
 * soul-sand (sand) blocks topped by two shoulder sand blocks and a central
 * skull-head (stone) block. `center` is the base middle block.
 *
 * Layout seen from the front (x grows across, y grows up):
 * ```
 *        [stone]
 *   [sand]      [sand]
 *   [sand][sand][sand]
 * ```
 */
export function isWitherStructure(world: VoxelWorld, center: BlockPosition): boolean {
  if (world.get(center.x, center.y, center.z) !== "sand") return false;
  if (world.get(center.x + HEAD_OFFSET.x, center.y + HEAD_OFFSET.y, center.z + HEAD_OFFSET.z) !== "stone") return false;
  return SAND_OFFSETS.every(({ x, y, z }) => world.get(center.x + x, center.y + y, center.z + z) === "sand");
}

/**
 * Place the ritual described by `isWitherStructure` — used by tests / callers
 * that want to assemble the summon shape deterministically.
 */
export function placeWitherRitual(world: VoxelWorld, center: BlockPosition): void {
  for (const { x, y, z } of SAND_OFFSETS) world.set({ x: center.x + x, y: center.y + y, z: center.z + z }, "sand");
  world.set({ x: center.x + HEAD_OFFSET.x, y: center.y + HEAD_OFFSET.y, z: center.z + HEAD_OFFSET.z }, "stone");
}

const DEFAULTS: Required<WitherOptions> = {
  hp: 160,
  aggroRange: 16,
  hoverHeight: 3.5,
  speed: 2.4,
  skullCooldown: 2.2,
  enragedSkullCooldown: 0.9,
  summonCooldown: 7,
  enrageThreshold: 0.25,
  maxMinions: 3,
};

export interface WitherSummonResult {
  boss: WitherBoss;
  /** Blocks consumed by the ritual so a renderer can refresh them. */
  consumed: BlockPosition[];
}

/**
 * Consume a valid ritual and summon a Wither over its socket. Returns
 * `undefined` when `center` does not match the ritual (blocks left untouched).
 */
export function summonWither(
  id: number,
  world: VoxelWorld,
  center: BlockPosition,
  opts: WitherOptions = {},
): WitherSummonResult | undefined {
  if (!isWitherStructure(world, center)) return undefined;
  const consumed: BlockPosition[] = [
    ...SAND_OFFSETS.map(({ x, y, z }) => ({ x: center.x + x, y: center.y + y, z: center.z + z } as BlockPosition)),
    { x: center.x + HEAD_OFFSET.x, y: center.y + HEAD_OFFSET.y, z: center.z + HEAD_OFFSET.z } as BlockPosition,
  ];
  for (const position of consumed) world.remove(position);

  const o = { ...DEFAULTS, ...opts };
  const boss: WitherBoss = {
    id,
    x: center.x,
    y: center.y + 0.5,
    z: center.z,
    health: o.hp,
    maxHealth: o.hp,
    phase: "dormant",
    facing: Math.PI,
    aggroRange: o.aggroRange,
    hoverHeight: o.hoverHeight,
    speed: o.speed,
    skullCooldown: o.skullCooldown,
    enragedSkullCooldown: o.enragedSkullCooldown,
    summonCooldown: o.summonCooldown,
    enrageThreshold: o.enrageThreshold,
    maxMinions: o.maxMinions,
    skullTimer: 1.2,
    summonTimer: 1.0,
    projectiles: [],
    minionIds: [],
    spawnedMinions: 0,
    defeated: false,
  };
  return { boss, consumed };
}

/** True once the boss drops to or below its enrage threshold. */
export function isEnraged(boss: WitherBoss): boolean {
  return boss.phase === "dying";
}

export interface WitherFrameResult {
  /** Damage dealt to the player this frame (from skull impacts). */
  damageToPlayer: number;
  /** How many in-flight skulls were fired this frame (for feedback). */
  skullsFired: number;
  /** Skulls that expired this frame without striking (informative). */
  fizzled: number;
  /** Has the boss just died this frame. */
  killed: boolean;
}

const SKULL_SPEED = 9;
const SKULL_DAMAGE = 2;
const SKULL_LIFETIME = 6;

/**
 * Advance the Wither boss by `delta` seconds: resolve its hovering position,
 * drift toward the player within aggro range, fire skull barrages on a cadence
 * (faster when enraged), summon skeleton minions on a cadence, and resolve
 * skull flight/impacts. Newly summoned skeletons are pushed onto `mobs` so the
 * ordinary simulation loop drives their movement. Returns player damage + a
 * kill signal so the render layer can grant loot exactly once.
 */
export function updateWither(
  world: VoxelWorld,
  boss: WitherBoss,
  mobs: Mob[],
  player: { x: number; y: number; z: number },
  delta: number,
): WitherFrameResult {
  const result: WitherFrameResult = { damageToPlayer: 0, skullsFired: 0, fizzled: 0, killed: false };
  if (boss.defeated) return result;

  // Death check first so loot is granted the same frame health reaches zero.
  if (boss.health <= 0) {
    boss.phase = "defeated";
    boss.defeated = true;
    result.killed = true;
    return result;
  }

  if (boss.phase === "combat" && boss.health / boss.maxHealth <= boss.enrageThreshold) {
    boss.phase = "dying";
  }

  // Hover above the terrain column.
  const groundTop = world.topY(Math.round(boss.x), Math.round(boss.z));
  const targetY = (groundTop < 0 ? 0 : groundTop) + boss.hoverHeight;
  boss.y += (targetY - boss.y) * Math.min(1, delta * 3);

  // Short dormant spawn-in grace before the boss wakes and fights.
  if (boss.phase === "dormant") {
    boss.skullTimer -= delta;
    if (boss.skullTimer <= 0) {
      boss.skullTimer = 0.6;
      boss.phase = "combat";
    }
    return result;
  }

  const active = boss.phase === "combat" || boss.phase === "dying";

  // Drift horizontally toward the player while in range.
  const dx = player.x - boss.x;
  const dz = player.z - boss.z;
  const dist = Math.hypot(dx, dz);
  if (active && dist <= boss.aggroRange) {
    boss.facing = Math.atan2(dx, dz);
    if (dist > 2.4) {
      const step = Math.min(boss.speed * delta, dist - 2.4);
      boss.x += (dx / Math.max(dist, 0.001)) * step;
      boss.z += (dz / Math.max(dist, 0.001)) * step;
    }
  }

  // Skull barrage.
  boss.skullTimer -= delta;
  if (active && boss.skullTimer <= 0) {
    fireSkull(boss);
    boss.skullTimer = boss.phase === "dying" ? boss.enragedSkullCooldown : boss.skullCooldown;
    result.skullsFired += 1;
  }

  // Skeleton summons: keep a small living contingent active.
  boss.minionIds = boss.minionIds.filter((id) => mobs.some((m) => m.id === id && !m.dead));
  boss.summonTimer -= delta;
  if (active && boss.summonTimer <= 0 && boss.minionIds.length < boss.maxMinions) {
    const minion = createMob(boss.id * 1000 + 100 + boss.spawnedMinions, boss.x, boss.z, { kind: "brute" });
    mobs.push(minion);
    boss.minionIds.push(minion.id);
    boss.spawnedMinions += 1;
    boss.summonTimer = boss.summonCooldown;
  }

  // Resolve in-flight skulls: home on the player, strike on contact.
  for (const skull of boss.projectiles) {
    if (skull.spent) continue;
    skull.age += delta;
    const sx = player.x - skull.x;
    const sy = player.y + 1.2 - skull.y;
    const sz = player.z - skull.z;
    const skullDist = Math.hypot(sx, sy, sz);
    if (skullDist <= 1.1) {
      skull.spent = true;
      result.damageToPlayer += skull.damage;
      continue;
    }
    if (skull.age >= skull.lifetime) {
      skull.spent = true;
      result.fizzled += 1;
      continue;
    }
    const step = skull.speed * delta;
    skull.x += (sx / skullDist) * step;
    skull.y += (sy / skullDist) * step;
    skull.z += (sz / skullDist) * step;
  }
  boss.projectiles = boss.projectiles.filter((skull) => !skull.spent);

  return result;
}

/** Launch one skull at the player from near the boss's head. */
function fireSkull(boss: WitherBoss): void {
  const skullId = boss.id * 10000 + boss.projectiles.length + boss.spawnedMinions;
  boss.projectiles.push({
    id: skullId,
    x: boss.x,
    y: boss.y + 1.2,
    z: boss.z,
    speed: SKULL_SPEED,
    damage: SKULL_DAMAGE,
    lifetime: SKULL_LIFETIME,
    age: 0,
    spent: false,
  });
}

/** Loot granted when the Wither falls. Blocks go into the bag. */
export const witherDropBlocks = (): readonly BlockType[] => WITHER_LOOT_BLOCKS;
