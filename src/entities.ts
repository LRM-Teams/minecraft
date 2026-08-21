import type { BlockType, VoxelWorld } from "./world";
import type { ItemType } from "./items";

/**
 * Hostile voxel entities (walking "mob"). Pure logic — no THREE import, no
 * dependency on rendering helpers like `visibleBlocks` (that is render-culling
 * only and must never be used to drive simulation). Designed to plug into the
 * game loop beside `updatePlayer`, mirroring the decoupled world/inventory
 * pattern already used in this project.
 */

export type MobState = "idle" | "chase";
export type MobKind = "stalker" | "brute" | "wisp" | "raider";

export interface Mob {
  readonly id: number;
  readonly kind: MobKind;
  x: number;
  y: number;
  z: number;
  hp: number;
  readonly maxHp: number;
  /** Horizontal heading in radians (0 = +Z, increasing clockwise from above). */
  facing: number;
  state: MobState;
  readonly speed: number;
  /** Horizontal distance (world units) at which the mob starts chasing. */
  readonly aggroRange: number;
  /** Horizontal distance at which the mob loses interest and returns to idle. */
  readonly giveUpRange: number;
  /** Horizontal distance under which the mob can strike the player. */
  readonly reach: number;
  /** Damage dealt to the player on a successful strike. */
  readonly damage: number;
  /** Seconds a mob must wait between strikes. */
  readonly attackCooldown: number;
  cooldownRemaining: number;
  /** Idle wander heading timer (seconds). */
  wanderTimer: number;
  dead: boolean;
}

export interface MobSpec {
  kind?: MobKind;
  hp?: number;
  speed?: number;
  aggroRange?: number;
  giveUpRange?: number;
  reach?: number;
  damage?: number;
  attackCooldown?: number;
}

export interface EntityFrameResult {
  /** Combined damage dealt to the player this frame. */
  damageToPlayer: number;
  /** Mobs that died this frame (mostly informative; never mutate them after). */
  deaths: Mob[];
  /** Blocks dropped by mobs that died this frame. */
  drops: ItemType[];
}

type MobStats = Required<Omit<MobSpec, "kind">>;

const KIND_DEFAULTS: Record<MobKind, MobStats> = {
  // Balanced, basic close-range enemy.
  stalker: { hp: 12, speed: 2.2, aggroRange: 6, giveUpRange: 9, reach: 0.85, damage: 1, attackCooldown: 1.2 },
  // Slow and tough, with a heavier contact strike.
  brute: { hp: 22, speed: 1.45, aggroRange: 5.5, giveUpRange: 8, reach: 1.05, damage: 2, attackCooldown: 1.55 },
  // Fragile, fast scout that notices the player farther away.
  wisp: { hp: 8, speed: 3.05, aggroRange: 8, giveUpRange: 11, reach: 0.7, damage: 1, attackCooldown: 1.0 },
  // Nighttime raid attacker that rushes the village; moderate and relentless.
  raider: { hp: 14, speed: 2.6, aggroRange: 9, giveUpRange: 14, reach: 0.8, damage: 1.5, attackCooldown: 1.1 },
};

const DROPS: Record<MobKind, readonly ItemType[]> = {
  stalker: ["dirt", "stone"],
  brute: ["raw_beef", "stone"],
  wisp: ["sand", "glass"],
  raider: ["stone", "planks"],
};

/** Possible single-block rewards for the given original enemy variety. */
export const mobDropCandidates = (kind: MobKind): readonly ItemType[] => DROPS[kind];

/** Stand a mob on the ground of a world column: body occupies the cell just above the top solid block. */
function groundY(world: VoxelWorld, x: number, z: number): number {
  return world.topY(Math.round(x), Math.round(z));
}

/** True when the cell at a body height over (nx, nz) is free for a body to occupy (not a wall in the way). */
function bodyFree(world: VoxelWorld, nx: number, nz: number, bodyY: number): boolean {
  if (bodyY < 1 || bodyY > 24) return false;
  return !world.isSolid(Math.round(nx), bodyY, Math.round(nz));
}

export function createMob(id: number, x: number, z: number, spec: MobSpec = {}): Mob {
  const kind = spec.kind ?? "stalker";
  const s = { ...KIND_DEFAULTS[kind], ...spec };
  return {
    id,
    kind,
    x,
    y: -Infinity, // resolved to ground on first update
    z,
    hp: s.hp,
    maxHp: s.hp,
    facing: Math.random() * Math.PI * 2,
    state: "idle",
    speed: s.speed,
    aggroRange: s.aggroRange,
    giveUpRange: s.giveUpRange,
    reach: s.reach,
    damage: s.damage,
    attackCooldown: s.attackCooldown,
    cooldownRemaining: 0,
    wanderTimer: 0,
    dead: false,
  };
}

/**
 * Advance all living mobs by `delta` seconds. Mobs follow the terrain height
 * (grounded via `topY`) and use a simple idle/chase state machine. They never
 * rely on render culling helpers, and never delete world data.
 */
export function updateEntities(
  world: VoxelWorld,
  mobs: Mob[],
  player: { x: number; y: number; z: number },
  delta: number,
): EntityFrameResult {
  const result: EntityFrameResult = { damageToPlayer: 0, deaths: [], drops: [] };

  for (const mob of mobs) {
    if (mob.dead) continue;
    if (mob.hp <= 0) {
      mob.dead = true;
      result.deaths.push(mob);
      const drops = mobDropCandidates(mob.kind);
      result.drops.push(drops[Math.floor(Math.random() * drops.length)]);
      continue;
    }

    // Resolve vertical position: body stands in the cell above the column ground.
    const ground = groundY(world, mob.x, mob.z);
    mob.y = ground + 1;
    const bodyY = Math.round(mob.y); // the cell the mob's body occupies

    const dx = player.x - mob.x;
    const dz = player.z - mob.z;
    const dist = Math.hypot(dx, dz);

    // --- state transitions (hostile: approach the player) ---
    if (dist <= mob.aggroRange) mob.state = "chase";
    else if (dist > mob.giveUpRange) mob.state = "idle";

    let heading = mob.facing;
    let speed = 0;

    if (mob.state === "chase") {
      heading = Math.atan2(dx, dz);
      speed = mob.speed;
    } else if (mob.state === "idle") {
      // Occasional random wander heading.
      mob.wanderTimer -= delta;
      if (mob.wanderTimer <= 0) {
        mob.facing = Math.random() * Math.PI * 2;
        mob.wanderTimer = 1.5 + Math.random() * 2.5;
      }
      heading = mob.facing;
      speed = mob.speed * 0.35;
    }

    if (speed > 0) {
      const nx = mob.x + Math.sin(heading) * speed * delta;
      const nz = mob.z + Math.cos(heading) * speed * delta;
      // Anti-tunneling: only step where the mob's own body cell is not a wall,
      // and the target column's ground is not more than one block above current
      // (walk around tall walls instead of climbing them).
      const nGround = groundY(world, nx, nz);
      const nBodyY = nGround + 1;
      const stepUp = nBodyY - bodyY;
      if (stepUp <= 1 && bodyFree(world, nx, nz, nBodyY) && !isOutOfBounds(world, nx, nz)) {
        mob.x = nx;
        mob.y = nBodyY;
        mob.z = nz;
        mob.facing = heading;
      } else {
        // Blocked: pick a perpendicular sidestep so the mob doesn't pin on a wall.
        const perp = heading + Math.PI / 2;
        const sx = mob.x + Math.sin(perp) * speed * delta;
        const sz = mob.z + Math.cos(perp) * speed * delta;
        const sGround = groundY(world, sx, sz);
        const sBodyY = sGround + 1;
        if (sBodyY - bodyY <= 1 && bodyFree(world, sx, sz, sBodyY) && !isOutOfBounds(world, sx, sz)) {
          mob.x = sx;
          mob.y = sBodyY;
          mob.z = sz;
          mob.facing = perp;
        }
      }
    }

    // --- contact strike ---
    mob.cooldownRemaining = Math.max(0, mob.cooldownRemaining - delta);
    const afterDist = Math.hypot(player.x - mob.x, player.z - mob.z);
    if (mob.state === "chase" && afterDist <= mob.reach && mob.cooldownRemaining <= 0) {
      result.damageToPlayer += mob.damage;
      mob.cooldownRemaining = mob.attackCooldown;
    }
  }

  return result;
}

function isOutOfBounds(world: VoxelWorld, x: number, z: number): boolean {
  return Math.abs(x) >= world.size - 1 || Math.abs(z) >= world.size - 1;
}
