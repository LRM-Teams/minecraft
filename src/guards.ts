import type { Mob } from "./entities";
import type { VillageAnchor, VoxelWorld } from "./world";

/**
 * Village iron guards. This module deliberately knows only about hostile Mobs:
 * villagers and players are never candidates for targeting or damage.
 */
export type GuardState = "patrol" | "chase" | "return";

export interface IronGuard {
  readonly id: number;
  readonly villageId: string;
  readonly plaza: { x: number; z: number };
  x: number;
  y: number;
  z: number;
  hp: number;
  readonly maxHp: number;
  facing: number;
  state: GuardState;
  readonly speed: number;
  readonly patrolRadius: number;
  readonly alertRange: number;
  readonly returnRange: number;
  readonly reach: number;
  readonly damage: number;
  readonly attackCooldown: number;
  cooldownRemaining: number;
  wanderTimer: number;
  targetId?: number;
  dead: boolean;
}

export interface IronGuardSpec {
  hp?: number;
  speed?: number;
  patrolRadius?: number;
  alertRange?: number;
  returnRange?: number;
  reach?: number;
  damage?: number;
  attackCooldown?: number;
}

export interface GuardFrameResult {
  /** Hostile targets killed by a guard strike this frame. */
  defeated: Mob[];
}

function groundY(world: VoxelWorld, x: number, z: number): number {
  return world.topY(Math.round(x), Math.round(z));
}

function bodyFree(world: VoxelWorld, x: number, z: number, bodyY: number): boolean {
  return bodyY >= 1 && bodyY <= 24 && !world.isSolid(Math.round(x), bodyY, Math.round(z));
}

function inBounds(world: VoxelWorld, x: number, z: number): boolean {
  return Math.abs(x) < world.size - 1 && Math.abs(z) < world.size - 1;
}

export function createIronGuard(id: number, village: VillageAnchor, spec: IronGuardSpec = {}): IronGuard {
  const plaza = { x: village.plaza.x, z: village.plaza.z };
  const hp = spec.hp ?? 42;
  return {
    id,
    villageId: village.id,
    plaza,
    x: plaza.x,
    y: -Infinity,
    z: plaza.z,
    hp,
    maxHp: hp,
    facing: 0,
    state: "patrol",
    speed: spec.speed ?? 2.35,
    patrolRadius: spec.patrolRadius ?? 8,
    alertRange: spec.alertRange ?? 14,
    returnRange: spec.returnRange ?? 10,
    reach: spec.reach ?? 1.25,
    damage: spec.damage ?? 5,
    attackCooldown: spec.attackCooldown ?? 0.85,
    cooldownRemaining: 0,
    wanderTimer: 0,
    dead: false,
  };
}

/** Spawn one original iron guard at every village plaza. */
export function createGuardsForWorld(world: VoxelWorld): IronGuard[] {
  return world.villages.map((village, index) => createIronGuard(index + 1, village));
}

function nearestThreat(guard: IronGuard, mobs: Mob[]): Mob | undefined {
  let closest: Mob | undefined;
  let closestDistance = Infinity;
  for (const mob of mobs) {
    if (mob.dead || mob.hp <= 0) continue;
    // The warning area is anchored to the village, not wherever a pursuing
    // guard happened to wander. This keeps chases inside village protection.
    const villageDistance = Math.hypot(mob.x - guard.plaza.x, mob.z - guard.plaza.z);
    if (villageDistance > guard.alertRange) continue;
    const distance = Math.hypot(mob.x - guard.x, mob.z - guard.z);
    if (distance < closestDistance) { closest = mob; closestDistance = distance; }
  }
  return closest;
}

function tryMove(world: VoxelWorld, guard: IronGuard, heading: number, speed: number, delta: number): boolean {
  const currentBodyY = Math.round(guard.y);
  for (const offset of [0, 0.45, -0.45, 0.9, -0.9]) {
    const direction = heading + offset;
    const x = guard.x + Math.sin(direction) * speed * delta;
    const z = guard.z + Math.cos(direction) * speed * delta;
    const y = groundY(world, x, z) + 1;
    if (y - currentBodyY <= 1 && bodyFree(world, x, z, y) && inBounds(world, x, z)) {
      guard.x = x;
      guard.y = y;
      guard.z = z;
      guard.facing = direction;
      return true;
    }
  }
  guard.facing = heading;
  return false;
}

/**
 * Advance guards. They patrol around a plaza, chase only hostile Mobs inside
 * that village's warning radius, and return home as soon as no target remains.
 */
export function updateIronGuards(world: VoxelWorld, guards: IronGuard[], mobs: Mob[], delta: number): GuardFrameResult {
  const result: GuardFrameResult = { defeated: [] };
  for (const guard of guards) {
    if (guard.dead) continue;
    if (guard.hp <= 0) { guard.dead = true; guard.targetId = undefined; continue; }

    guard.y = groundY(world, guard.x, guard.z) + 1;
    guard.cooldownRemaining = Math.max(0, guard.cooldownRemaining - delta);
    const threat = nearestThreat(guard, mobs);
    const plazaDistance = Math.hypot(guard.x - guard.plaza.x, guard.z - guard.plaza.z);

    let heading = guard.facing;
    let speed = 0;
    if (threat) {
      guard.state = "chase";
      guard.targetId = threat.id;
      heading = Math.atan2(threat.x - guard.x, threat.z - guard.z);
      const distance = Math.hypot(threat.x - guard.x, threat.z - guard.z);
      if (distance > guard.reach) speed = guard.speed;
      if (distance <= guard.reach && guard.cooldownRemaining <= 0) {
        threat.hp = Math.max(0, threat.hp - guard.damage);
        guard.cooldownRemaining = guard.attackCooldown;
        if (threat.hp <= 0) result.defeated.push(threat);
      }
    } else if (plazaDistance > guard.returnRange) {
      guard.state = "return";
      guard.targetId = undefined;
      heading = Math.atan2(guard.plaza.x - guard.x, guard.plaza.z - guard.z);
      speed = guard.speed;
    } else {
      guard.state = "patrol";
      guard.targetId = undefined;
      guard.wanderTimer -= delta;
      if (guard.wanderTimer <= 0) {
        const toPlaza = Math.atan2(guard.plaza.x - guard.x, guard.plaza.z - guard.z);
        const bias = plazaDistance > guard.patrolRadius ? 0 : (Math.random() * 2 - 1) * 1.35;
        guard.facing = toPlaza + bias;
        guard.wanderTimer = 1.4 + Math.random() * 2.2;
      }
      heading = guard.facing;
      speed = guard.speed * (plazaDistance > guard.patrolRadius ? 0.8 : 0.32);
    }
    if (speed > 0) tryMove(world, guard, heading, speed, delta);
    else guard.facing = heading;
  }
  return result;
}
