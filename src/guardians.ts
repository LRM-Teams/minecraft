import type { Mob } from "./entities";
import type { VoxelWorld, VillageAnchor } from "./world";

export type GuardianState = "patrol" | "chase" | "return" | "dead";

export interface VillageGuardian {
  readonly id: number;
  readonly villageId: string;
  readonly plaza: { x: number; z: number };
  x: number;
  y: number;
  z: number;
  hp: number;
  readonly maxHp: number;
  facing: number;
  state: GuardianState;
  readonly speed: number;
  readonly alertRange: number;
  readonly reach: number;
  readonly damage: number;
  readonly attackCooldown: number;
  cooldownRemaining: number;
  patrolTimer: number;
  dead: boolean;
}

export interface GuardianSpec {
  hp?: number;
  speed?: number;
  alertRange?: number;
  reach?: number;
  damage?: number;
  attackCooldown?: number;
}

const groundY = (world: VoxelWorld, x: number, z: number): number => world.topY(Math.round(x), Math.round(z));
const distance = (from: { x: number; z: number }, to: { x: number; z: number }): number => Math.hypot(to.x - from.x, to.z - from.z);
const outOfBounds = (world: VoxelWorld, x: number, z: number): boolean => Math.abs(x) >= world.size - 1 || Math.abs(z) >= world.size - 1;

export const createGuardian = (id: number, village: VillageAnchor, spec: GuardianSpec = {}): VillageGuardian => ({
  id,
  villageId: village.id,
  plaza: { x: village.plaza.x, z: village.plaza.z },
  x: village.plaza.x,
  y: village.plaza.y,
  z: village.plaza.z,
  hp: spec.hp ?? 36,
  maxHp: spec.hp ?? 36,
  facing: 0,
  state: "patrol",
  speed: spec.speed ?? 2.5,
  alertRange: spec.alertRange ?? 12,
  reach: spec.reach ?? 1.35,
  damage: spec.damage ?? 5,
  attackCooldown: spec.attackCooldown ?? 0.75,
  cooldownRemaining: 0,
  patrolTimer: 0,
  dead: false,
});

/** One original guardian is assigned to every generated village plaza. */
export const createGuardiansForWorld = (world: VoxelWorld): VillageGuardian[] => world.villages.map((village, index) => createGuardian(index + 1, village));

const closestThreat = (guardian: VillageGuardian, mobs: Mob[]): Mob | undefined => mobs
  .filter((mob) => !mob.dead && mob.hp > 0 && distance(guardian.plaza, mob) <= guardian.alertRange)
  .sort((left, right) => distance(guardian, left) - distance(guardian, right))[0];

const moveToward = (world: VoxelWorld, guardian: VillageGuardian, target: { x: number; z: number }, delta: number, speed = guardian.speed): void => {
  const heading = Math.atan2(target.x - guardian.x, target.z - guardian.z);
  guardian.facing = heading;
  const nx = guardian.x + Math.sin(heading) * speed * delta;
  const nz = guardian.z + Math.cos(heading) * speed * delta;
  const nextGround = groundY(world, nx, nz);
  const nextBodyY = nextGround + 1;
  const currentBodyY = Math.round(guardian.y);
  if (!outOfBounds(world, nx, nz) && nextBodyY - currentBodyY <= 1 && !world.isSolid(Math.round(nx), nextBodyY, Math.round(nz))) {
    guardian.x = nx;
    guardian.y = nextBodyY;
    guardian.z = nz;
  }
};

/**
 * Village protection simulation. Guardians only choose hostile Mob instances;
 * villagers and players are intentionally absent from this target selector.
 */
export const updateGuardians = (world: VoxelWorld, guardians: VillageGuardian[], mobs: Mob[], delta: number): void => {
  guardians.forEach((guardian) => {
    if (guardian.dead) return;
    if (guardian.hp <= 0) { guardian.dead = true; guardian.state = "dead"; return; }
    guardian.cooldownRemaining = Math.max(0, guardian.cooldownRemaining - delta);
    guardian.y = groundY(world, guardian.x, guardian.z) + 1;
    const threat = closestThreat(guardian, mobs);
    if (threat) {
      guardian.state = "chase";
      const threatDistance = distance(guardian, threat);
      if (threatDistance > guardian.reach) {
        moveToward(world, guardian, threat, delta);
      } else if (guardian.cooldownRemaining <= 0) {
        threat.hp = Math.max(0, threat.hp - guardian.damage);
        guardian.cooldownRemaining = guardian.attackCooldown;
      }
      return;
    }
    const homeDistance = distance(guardian, guardian.plaza);
    if (homeDistance > 2.5) {
      guardian.state = "return";
      moveToward(world, guardian, guardian.plaza, delta);
      return;
    }
    guardian.state = "patrol";
    guardian.patrolTimer -= delta;
    if (guardian.patrolTimer <= 0) {
      guardian.facing += 0.75;
      guardian.patrolTimer = 1.5;
    }
    const patrolTarget = { x: guardian.plaza.x + Math.sin(guardian.facing) * 1.6, z: guardian.plaza.z + Math.cos(guardian.facing) * 1.6 };
    moveToward(world, guardian, patrolTarget, delta, guardian.speed * 0.35);
  });
};
