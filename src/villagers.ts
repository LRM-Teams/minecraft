import type { BlockType, VoxelWorld, VillageHome } from "./world";
import type { Inventory } from "./inventory";

/**
 * Friendly villager entities for the village ecology.
 *
 * Pure TypeScript: no THREE, no render state, no I/O. Mirrors the `entities.ts`
 * hostiles track so both can coexist in the same simulation loop. Every function
 * is a pure function of the supplied world / villager / player state, so the
 * whole interaction can be unit tested without a renderer.
 *
 * A villager is bound to one `VillageHome` (from `world.villages`) and to its
 * village plaza. Its state machine cycles between:
 *   - `wander`      : stroll near the plaza (home-returning when it strays far)
 *   - `returnHome`  : walk back toward its home entrance/interior
 *   - `returnWork`  : resume work at its assigned workstation after contact
 *   - `interacting` : player is within reach — they can greet or barter
 * Movement is grounded via `world.topY` (never render culling), and villager
 * AI never deletes world data.
 */

/** What a villager is currently doing. */
export type VillagerState = "wander" | "returnHome" | "returnWork" | "interacting";
export type VillagerProfession = "carpenter" | "mason" | "glazier" | "gardener";
export type TradeOffer = { offer: BlockType; reward: BlockType };

export const PROFESSION_DETAILS: Record<VillagerProfession, { label: string; workstationLabel: string; offers: readonly TradeOffer[] }> = {
  carpenter: { label: "林作师", workstationLabel: "木作台", offers: [{ offer: "wood", reward: "planks" }] },
  mason: { label: "砌石师", workstationLabel: "砌石台", offers: [{ offer: "stone", reward: "bricks" }] },
  glazier: { label: "玻璃师", workstationLabel: "熔砂台", offers: [{ offer: "sand", reward: "glass" }] },
  gardener: { label: "园艺师", workstationLabel: "育苗台", offers: [{ offer: "dirt", reward: "grass" }] },
};

const professionForHome = (home: VillageHome): VillagerProfession => {
  const suffix = home.id.split(":").at(-1);
  if (suffix === "northeast") return "mason";
  if (suffix === "southwest") return "glazier";
  if (suffix === "southeast") return "gardener";
  return "carpenter";
};

export interface Villager {
  readonly id: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  readonly maxHp: number;
  facing: number;
  state: VillagerState;
  /** Horizontal walk speed. */
  readonly speed: number;
  /** Horizontal distance at which the player is close enough to interact. */
  readonly interactRange: number;
  /** How far a villager may roam from its entrance before it turns back. */
  readonly homeRange: number;
  /** Seconds before the villager may be interacted with again after a trade. */
  readonly tradeCooldown: number;
  tradeCooldownRemaining: number;
  /** Timer controlling how often a wandering villager picks a new heading. */
  wanderTimer: number;
  /** The house this villager lives in / returns to. */
  readonly home: VillageHome;
  /** Stable profession derived from the home's deterministic workstation anchor. */
  readonly profession: VillagerProfession;
  /** The home workstation is a simulation anchor, never a render-only coordinate. */
  readonly workstation: { x: number; z: number };
  /** Maximum distance from the workstation while actively working. */
  readonly workRange: number;
  /** Village centre (plaza) used as a wander anchor. */
  readonly plaza: { x: number; z: number };
  dead: boolean;
}

export interface VillagerSpec {
  hp?: number;
  speed?: number;
  interactRange?: number;
  homeRange?: number;
  workRange?: number;
  tradeCooldown?: number;
}

export interface VillagerFrameResult {
  /** Dialogue / interaction messages to surface to the player this frame. */
  messages: string[];
  /** Blocks automatically traded in this frame (given to the player). */
  received: BlockType[];
}

/**
 * Barter table: a villager will accept the given offered block and hand back
 * the reward. Thematic and deterministic (the home crafts one arena into another).
 */
const BARTER: Partial<Record<BlockType, BlockType>> = {
  wood: "planks",   // villager accepts a log and hands back building planks
  stone: "bricks",  // accepts mined stone, returns durable bricks
  sand: "glass",    // accepts sand, returns glass
};

/** Blocks a villager may gift when it is killed. */
const VILLAGER_DROPS: readonly BlockType[] = ["dirt", "stone"];

/** Human-readable greeting shown when the player walks up to a villager. */
export const villagerGreeting = (villager: Villager): string =>
  `${PROFESSION_DETAILS[villager.profession].label}：你好，旅行者！${tradeSummary(villager)}`;

/** The reward a villager will give for the offered block, or undefined. */
export const barterReward = (offer: BlockType, profession?: VillagerProfession): BlockType | undefined =>
  profession ? PROFESSION_DETAILS[profession].offers.find((entry) => entry.offer === offer)?.reward : BARTER[offer];

/** Human-readable, profession-specific trading line for HUD/dialogue surfaces. */
export const tradeSummary = (villager: Villager): string => {
  const detail = PROFESSION_DETAILS[villager.profession];
  const offers = detail.offers.map((entry) => `${entry.offer} → ${entry.reward}`).join("，");
  return `${detail.workstationLabel}交易：${offers}`;
};

/** A block a villager drops when killed. */
export const villagerDrop = (): BlockType =>
  VILLAGER_DROPS[Math.floor(Math.random() * VILLAGER_DROPS.length)];

/** Stand a villager on the ground of a world column. */
function groundY(world: VoxelWorld, x: number, z: number): number {
  return world.topY(Math.round(x), Math.round(z));
}

/** True when the body cell over (nx, nz) is free for a villager to occupy. */
function bodyFree(world: VoxelWorld, nx: number, nz: number, bodyY: number): boolean {
  if (bodyY < 1 || bodyY > 24) return false;
  return !world.isSolid(Math.round(nx), bodyY, Math.round(nz));
}

function isOutOfBounds(world: VoxelWorld, x: number, z: number): boolean {
  return Math.abs(x) >= world.size - 1 || Math.abs(z) >= world.size - 1;
}

export function createVillager(
  id: number,
  x: number,
  z: number,
  home: VillageHome,
  plaza: { x: number; z: number },
  spec: VillagerSpec = {},
): Villager {
  return {
    id,
    x,
    y: -Infinity, // resolved to ground on first update
    z,
    hp: spec.hp ?? 10,
    maxHp: spec.hp ?? 10,
    facing: Math.random() * Math.PI * 2,
    state: "wander",
    speed: spec.speed ?? 1.6,
    interactRange: spec.interactRange ?? 2.2,
    homeRange: spec.homeRange ?? 7,
    workRange: spec.workRange ?? 2.2,
    tradeCooldown: spec.tradeCooldown ?? 1.5,
    tradeCooldownRemaining: 0,
    wanderTimer: 0,
    home,
    profession: professionForHome(home),
    workstation: { x: home.workstation.x, z: home.workstation.z },
    plaza,
    dead: false,
  };
}

/**
 * Spawn one friendly villager per village home. Villagers start at their home
 * entrance, so the whole village is populated without relying on any render
 * helper. Returns an empty array when the world has no village anchors.
 */
export function createVillagersForWorld(world: VoxelWorld): Villager[] {
  const villagers: Villager[] = [];
  let nextId = 1;
  for (const village of world.villages) {
    for (const home of village.homes) {
      villagers.push(createVillager(nextId++, home.entrance.x, home.entrance.z, home, { x: village.plaza.x, z: village.plaza.z }));
    }
  }
  return villagers;
}

/**
 * Advance all living villagers by `delta` seconds. Villagers wander near their
 * plaza, return home when they stray too far, and stop to face the player when
 * the player is within interact range. Frame outputs (messages + traded blocks)
 * are collected so the integration layer can surface them.
 */
export function updateVillagers(
  world: VoxelWorld,
  villagers: Villager[],
  player: { x: number; y: number; z: number },
  delta: number,
): VillagerFrameResult {
  const result: VillagerFrameResult = { messages: [], received: [] };

  for (const villager of villagers) {
    if (villager.dead) continue;

    villager.tradeCooldownRemaining = Math.max(0, villager.tradeCooldownRemaining - delta);

    // Resolve vertical position: body stands in the cell above the column ground.
    const ground = groundY(world, villager.x, villager.z);
    villager.y = ground + 1;
    const bodyY = Math.round(villager.y);

    const dx = player.x - villager.x;
    const dz = player.z - villager.z;
    const distPlayer = Math.hypot(dx, dz);

    // --- state transitions ---
    if (distPlayer <= villager.interactRange) {
      villager.state = "interacting";
    } else {
      const distEntrance = Math.hypot(villager.x - villager.home.entrance.x, villager.z - villager.home.entrance.z);
      const distWorkstation = Math.hypot(villager.x - villager.workstation.x, villager.z - villager.workstation.z);
      if (villager.state === "interacting") {
        villager.state = "returnWork";
      } else if (distEntrance > villager.homeRange) {
        villager.state = "returnHome";
      } else if (distWorkstation > villager.workRange) {
        villager.state = "returnWork";
      } else {
        villager.state = "wander";
      }
    }

    let heading = villager.facing;
    let speed = 0;

    if (villager.state === "returnHome") {
      // Walk back toward the open doorway (reachable, unlike the interior walls).
      heading = Math.atan2(villager.home.entrance.x - villager.x, villager.home.entrance.z - villager.z);
      speed = villager.speed;
    } else if (villager.state === "returnWork") {
      // Workstations are inside the generated homes; approach their open side
      // and stop on the nearest walkable cell instead of trying to pass a wall.
      heading = Math.atan2(villager.workstation.x - villager.x, villager.workstation.z - villager.z);
      speed = villager.speed;
    } else if (villager.state === "wander") {
      // Stroll near the plaza with occasional heading changes.
      villager.wanderTimer -= delta;
      if (villager.wanderTimer <= 0) {
        // Bias the next heading toward the plaza so the villager keeps drifting
        // around the village instead of wandering off.
        const toPlaza = Math.atan2(villager.plaza.x - villager.x, villager.plaza.z - villager.z);
        const jitter = (Math.random() * 2 - 1) * 1.9;
        villager.facing = toPlaza + jitter;
        villager.wanderTimer = 2 + Math.random() * 3;
      }
      heading = villager.facing;
      speed = villager.speed * 0.3;
    } else {
      // interacting: stop and face the player.
      heading = Math.atan2(dx, dz);
      speed = 0;
    }

    if (speed > 0) {
      // Obstacle-aware steering: try the intended heading first, then fan out in
      // both directions so walls are followed around corners instead of pinning.
      let moved = false;
      for (const offset of [0, 0.5, -0.5, 1.0, -1.0]) {
        const tryHeading = heading + offset;
        const nx = villager.x + Math.sin(tryHeading) * speed * delta;
        const nz = villager.z + Math.cos(tryHeading) * speed * delta;
        const nGround = groundY(world, nx, nz);
        const nBodyY = nGround + 1;
        const stepUp = nBodyY - bodyY;
        if (stepUp <= 1 && bodyFree(world, nx, nz, nBodyY) && !isOutOfBounds(world, nx, nz)) {
          villager.x = nx;
          villager.y = nBodyY;
          villager.z = nz;
          villager.facing = tryHeading;
          moved = true;
          break;
        }
      }
      if (!moved) villager.facing = heading;
    } else {
      villager.facing = heading;
    }
  }

  return result;
}

/**
 * Greet a nearby villager. Deterministic, so it can be surfaced as an unlocked
 * dialogue line when the player walks up to a villager.
 */
export function greetNearbyVillagers(
  villagers: Villager[],
  player: { x: number; y: number; z: number },
): string | undefined {
  const nearby = villagers.find((v) => !v.dead && Math.hypot(player.x - v.x, player.z - v.z) <= v.interactRange);
  return nearby ? villagerGreeting(nearby) : undefined;
}

/**
 * A simple barter interaction: the player offers a block from their inventory
 * and the villager hands back its reward. Returns a human-readable result and
 * mutates both the inventory and the villager's trade cooldown. When a player
 * position is supplied, proximity is enforced; otherwise the caller is assumed
 * to have gated the interaction already.
 */
export function tradeWithVillager(
  villager: Villager,
  offer: BlockType,
  inventory: Inventory,
  player?: { x: number; z: number },
): { ok: boolean; message: string; reward?: BlockType } {
  if (player && !nearby(villager, player)) return { ok: false, message: "需要靠近村民才能交易" };
  if (villager.tradeCooldownRemaining > 0) {
    return { ok: false, message: "村民正在忙，稍后再试" };
  }
  const reward = barterReward(offer, villager.profession);
  if (!reward) return { ok: false, message: `村民不感兴趣：${PROFESSION_DETAILS[villager.profession].label}只收 ${tradeSummary(villager).replace(/^.*：/, "")}` };
  if (inventory[offer] < 1) return { ok: false, message: `你还没有 ${offer}` };

  inventory[offer] -= 1;
  inventory[reward] += 1;
  villager.tradeCooldownRemaining = villager.tradeCooldown;
  return { ok: true, message: `交换成功：${PROFESSION_DETAILS[villager.profession].label} ${offer} → ${reward}`, reward };
}

/** True when the player is within a villager's interact range. */
export function nearby(villager: Villager, player: { x: number; z: number }): boolean {
  if (villager.dead) return false;
  return Math.hypot(player.x - villager.x, player.z - villager.z) <= villager.interactRange;
}
