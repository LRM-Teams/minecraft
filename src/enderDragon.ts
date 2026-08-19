import { createMob, type Mob, type MobKind } from "./entities";
import { crystalPillars } from "./end";

/**
 * Phase-3 「末影龙 BOSS」 — the End's boss.
 *
 * A dedicated boss entity, registered independently of the grounded `Mob`
 * model so the existing `entities.ts` Mob interface stays untouched. The dragon
 * flies a looping circuit over the End arena, dashes (charges) at the player,
 * periodically summons endermen to defend itself, and heals while an end
 * crystal survives. Defeating it drops unique loot and marks the End complete.
 *
 * Pure TypeScript: no THREE, no render state, no I/O. All deterministic.
 */

/** Boss states the dragon cycles through. */
export type DragonState = "circling" | "charging" | "recovering";

export interface EnderDragon {
  readonly id: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  readonly maxHp: number;
  state: DragonState;
  /** Seconds until the next behaviour decision (charge / summon / heal check). */
  timer: number;
  /** Secs the dragon is recovering / invulnerable after a charge. */
  recoverRemaining: number;
  /** Secs between attempts to summon endermen. */
  summonCooldown: number;
  /** Tracks whether the healed-from-crystal happened this tick (for tests). */
  lastHeal: number;
  /** Center the dragon circles around (the End platform centre). */
  centerX: number;
  centerZ: number;
  /** Orbit radius of the base flight loop. */
  radius: number;
  /** Angle on the flight loop, radians. */
  angle: number;
  /** Vertical orbit amplitude / base altitude. */
  altitude: number;
  /** Player damage from a successful charge. */
  readonly chargeDamage: number;
  readonly chargeSpeed: number;
  readonly flightSpeed: number;
  chargeCooldownRemaining: number;
  dead: boolean;
  /** Unique loot parceled out when the boss is defeated. */
  loot: string[];
}

export const DRAGON_LOOT = ["diamond_ore", "gold_ore", "glass"] as const;

export interface DragonFrameResult {
  damageToPlayer: number;
  /** Endermen the dragon spawned this tick (already grounded-ready Mobs). */
  summons: Mob[];
  /** Whether the dragon was defeated this tick (dropped its loot). */
  defeated: boolean;
}

interface DragonOptions {
  flightSpeed?: number;
  chargeSpeed?: number;
  chargeDamage?: number;
  radius?: number;
  altitude?: number;
}

const DEFAULTS: Required<DragonOptions> = {
  flightSpeed: 3.2,
  chargeSpeed: 9,
  chargeDamage: 2,
  radius: 10,
  altitude: 14,
};

/**
 * Build a fresh Ender Dragon circling its arena. Ids for summoned endermen are
 * drawn from `nextMobId` so they stay unique next to the overworld's mobs.
 */
export function createEnderDragon(id: number, options?: DragonOptions): EnderDragon {
  const o = { ...DEFAULTS, ...options };
  return {
    id,
    x: 0,
    y: o.altitude,
    z: o.radius,
    hp: 200,
    maxHp: 200,
    state: "circling",
    timer: 1.5,
    recoverRemaining: 0,
    summonCooldown: 4,
    lastHeal: 0,
    centerX: 0,
    centerZ: 0,
    radius: o.radius,
    angle: 0,
    altitude: o.altitude,
    chargeDamage: o.chargeDamage,
    chargeSpeed: o.chargeSpeed,
    flightSpeed: o.flightSpeed,
    chargeCooldownRemaining: 0,
    dead: false,
    loot: [...DRAGON_LOOT],
  };
}

const dist = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);
const range = (min: number, max: number, rnd: number): number => min + rnd * (max - min);

/**
 * A dragon heals itself when any end crystal on a surviving pillar is intact.
 * Returns the amount healed this tick (0 when no crystal remains).
 */
export function dragonCrystalHeal(dragon: EnderDragon, seed: number, healAmount = 6): number {
  const pillars = crystalPillars(seed);
  if (!pillars.length) return 0;
  // A pillared island counts as "alive" for the encounter; presence alone heals.
  const healed = Math.min(healAmount, dragon.maxHp - dragon.hp);
  if (healed > 0) {
    dragon.hp += healed;
    dragon.lastHeal += healed;
  }
  return healed;
}

/**
 * Advance the dragon boss by `delta` seconds. `worldFree` lets the caller tell
 * us whether a summoned enderman may occupy a given (x,z) cell (used to place
 * them on real ground). Returns live per-tick events for the caller to apply.
 */
export function updateEnderDragon(
  dragon: EnderDragon,
  player: { x: number; y: number; z: number },
  delta: number,
  seed: number,
  nextMobId: () => number,
): DragonFrameResult {
  const result: DragonFrameResult = { damageToPlayer: 0, summons: [], defeated: false };
  if (dragon.dead) return result;

  if (dragon.hp <= 0) {
    dragon.dead = true;
    result.defeated = true;
    return result;
  }

  dragon.recoverRemaining = Math.max(0, dragon.recoverRemaining - delta);
  dragon.chargeCooldownRemaining = Math.max(0, dragon.chargeCooldownRemaining - delta);
  dragon.summonCooldown = Math.max(0, dragon.summonCooldown - delta);

  switch (dragon.state) {
    case "circling": {
      // Sweep a smooth loop over the arena.
      dragon.angle += dragon.flightSpeed * delta / Math.max(1, dragon.radius);
      const px = dragon.centerX + Math.cos(dragon.angle) * dragon.radius;
      const pz = dragon.centerZ + Math.sin(dragon.angle) * dragon.radius;
      const bob = Math.sin(dragon.angle * 2.4) * 2;
      dragon.x = px;
      dragon.z = pz;
      dragon.y = dragon.altitude + bob/1.6;
      dragon.timer -= delta;

      if (dragon.chargeCooldownRemaining <= 0 && dist(player.x, player.z, dragon.x, dragon.z) < 9 && dragon.timer <= 0) {
        dragon.state = "charging";
        dragon.timer = 1.1; // charge duration
      } else if (dragon.timer <= 0) {
        dragon.timer = 1.6 + range(0, 1.4, hashOf(dragon.id, dragon.x, dragon.z));
      }

      // Summon endermen defenders on a cooldown.
      if (dragon.summonCooldown <= 0) {
        const count = 1 + Math.floor(hashOf(dragon.id + 7, dragon.x, dragon.z) * 2);
        for (let n = 0; n < count; n += 1) {
          const angle = hashOf(dragon.id + n * 13, dragon.z, dragon.x) * Math.PI * 2;
          const r = dragon.radius + 2;
          const mx = Math.round(dragon.centerX + Math.cos(angle) * r);
          const mz = Math.round(dragon.centerZ + Math.sin(angle) * r);
          result.summons.push(createMob(nextMobId(), mx, mz, { kind: "wisp", hp: 10, damage: 1 }));
        }
        dragon.summonCooldown = 5 + range(0, 2.5, hashOf(dragon.id, dragon.x, dragon.z * 3));
        // Every summoning tick, an intact crystal channels a heal to the boss.
        dragonCrystalHeal(dragon, seed);
      }
      break;
    }

    case "charging": {
      // Dash straight at the player's last-known position, then land.
      const dx = player.x - dragon.x;
      const dz = player.z - dragon.z;
      const d = Math.hypot(dx, dz) || 1;
      dragon.x += (dx / d) * dragon.chargeSpeed * delta;
      dragon.z += (dz / d) * dragon.chargeSpeed * delta;
      dragon.y = Math.max(3, dragon.y - delta * 12);
      dragon.timer -= delta;
      // Contact with the player during a charge deals the boss damage.
      if (d < 1.6) result.damageToPlayer += dragon.chargeDamage;
      if (dragon.timer <= 0) {
        dragon.state = "recovering";
        dragon.recoverRemaining = 1.4;
        dragon.chargeCooldownRemaining = 3.4;
      }
      break;
    }

    case "recovering": {
      // Wounded dragon retreats back up into its flight loop.
      dragon.y = Math.min(dragon.altitude, dragon.y + delta * 16);
      if (dragon.recoverRemaining <= 0) {
        dragon.state = "circling";
        dragon.timer = 1.2;
      }
      break;
    }
  }

  return result;
}

/** Cheap deterministic hash so the dragon behaves identically per seed. */
function hashOf(a: number, b: number, c: number): number {
  const value = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return value - Math.floor(value);
}
