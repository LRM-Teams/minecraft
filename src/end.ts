/**
 * Phase-3 「末地维度」: floating-island end world + procedural endstone.
 *
 * Like the nether (LRM-1566), the End is an *independent sub-world* with its
 * own block registry. Its blocks (`end_stone`, `obsidian`, `end_rock`, the exit
 * `end_portal` tile, and heal `end_crystal`s) live in module-internal data
 * (`END_BLOCKS`) and are NEVER added to the overworld `BLOCK_TYPES` /
 * `WorldSnapshot` schema. That keeps existing save slots, `VoxelWorld`
 * signatures and block IDs untouched while giving the dimension an original
 * void palette.
 *
 * Pure TypeScript: no THREE, no render state, no I/O. Every function is a pure
 * function of the seed / snapshot so the same seed always reproduces an
 * identical End, and the exit portal is plain data.
 */

/** Module-internal End block registry (not part of overworld `BLOCK_TYPES`). */
export const END_BLOCKS = ["end_stone", "obsidian", "end_rock", "end_portal", "end_crystal"] as const;
export type EndBlockId = (typeof END_BLOCKS)[number];

export type EndPosition = { x: number; y: number; z: number };
/** A compact, snapshot-serialisable End sub-world block map. */
export type EndSnapshot = { seed: number; size: number; blocks: [string, EndBlockId][] };

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
const hash = (x: number, z: number, seed: number): number => {
  const value = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.6543) * 43758.5453;
  return value - Math.floor(value);
};

/** Number of floating islands laid out around the central obsidian platform. */
export const END_ISLANDS = 6;
/** Size (radius, in blocks) of the central exit/island platform. */
export const END_CENTER_RADIUS = 4;

/**
 * Independent End dimension. Unlike the overworld `VoxelWorld` it has no
 * villages and no `WorldSnapshot` — it is a fully separate terrain layer whose
 * blocks are End-only. Deterministic per seed.
 */
export class EndWorld {
  readonly blocks = new Map<string, EndBlockId>();
  readonly size: number;
  readonly seed: number;

  constructor(seed = 72831, size = 48) {
    this.seed = seed;
    this.size = size;
    this.generate();
  }

  get(x: number, y: number, z: number): EndBlockId | undefined {
    return this.blocks.get(key(x, y, z));
  }

  isSolid(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== undefined;
  }

  set(position: EndPosition, type: EndBlockId): void {
    if (position.y < 0 || position.y > 40 || Math.abs(position.x) > this.size || Math.abs(position.z) > this.size) return;
    this.blocks.set(key(position.x, position.y, position.z), type);
  }

  remove(position: EndPosition): EndBlockId | undefined {
    const block = this.get(position.x, position.y, position.z);
    if (block) this.blocks.delete(key(position.x, position.y, position.z));
    return block;
  }

  /** Highest solid block above an End column (the ground you can stand on). */
  topY(x: number, z: number): number {
    for (let y = 40; y >= 0; y -= 1) if (this.isSolid(x, y, z)) return y;
    return -1;
  }

  /** How many heal crystals still sit on their pillars (boss heal gate). */
  crystalCount(): number {
    let count = 0;
    this.blocks.forEach((type) => { if (type === "end_crystal") count += 1; });
    return count;
  }

  snapshot(): EndSnapshot {
    return { seed: this.seed, size: this.size, blocks: [...this.blocks.entries()] };
  }

  static fromSnapshot(snapshot: EndSnapshot): EndWorld {
    const world = new EndWorld(snapshot.seed, snapshot.size);
    world.blocks.clear();
    snapshot.blocks.forEach(([position, type]) => {
      // Tolerate older End snapshots that predate end_crystal.
      if ((END_BLOCKS as readonly string[]).includes(type)) world.blocks.set(position, type as EndBlockId);
    });
    return world;
  }

  /**
   * Deterministic End terrain: a central obsidian platform surrounded by a set
   * of floating endstone islands. End crystals sit on top of obsidian pillars.
   * No overworld biomes are involved — this is the dimension's own palette.
   */
  private generate(): void {
    // Central obsidian platform — the safe spawn and exit point.
    for (let x = -END_CENTER_RADIUS; x <= END_CENTER_RADIUS; x += 1) {
      for (let z = -END_CENTER_RADIUS; z <= END_CENTER_RADIUS; z += 1) {
        if (Math.abs(x) + Math.abs(z) > END_CENTER_RADIUS + 1) continue;
        this.set({ x, y: 0, z }, "obsidian");
      }
    }
    // Exit portal ring of bright tiles at the platform centre.
    for (let x = -1; x <= 1; x += 1) for (let z = -1; z <= 1; z += 1) {
      this.set({ x, y: 1, z }, "end_portal");
    }

    // Floating endstone islands orbiting the platform at varied heights.
    const ring = 16 + Math.floor(hash(7, 13, this.seed) * 5);
    for (let i = 0; i < END_ISLANDS; i += 1) {
      const angle = (i / END_ISLANDS) * Math.PI * 2 + hash(i + 1, 29, this.seed) * 0.9;
      const cx = Math.round(Math.cos(angle) * ring);
      const cz = Math.round(Math.sin(angle) * ring);
      const baseY = 6 + Math.floor(hash(i + 40, 3, this.seed) * 6);
      const radius = 3 + Math.floor(hash(i + 11, 77, this.seed) * 3);
      for (let dy = 0; dy < 3; dy += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          for (let z = -radius; z <= radius; z += 1) {
            const dist = Math.hypot(x, z);
            if (dist > radius - dy * 0.6) continue;
            this.set({ x: cx + x, y: baseY + dy, z: cz + z }, dy < 1 ? "end_rock" : "end_stone");
          }
        }
      }
      // Each island may carry an obsidian pillar topped with an end crystal.
      if (hash(i + 3, 91, this.seed) > 0.35) {
        const pillarBase = baseY + 3;
        for (let p = 0; p < 2; p += 1) this.set({ x: cx, y: pillarBase + p, z: cz }, "obsidian");
        this.set({ x: cx, y: pillarBase + 2, z: cz }, "end_crystal");
      }
    }
  }
}

/** Build-height positions of the end-crystal tops around the platform. */
export function crystalPillars(seed: number): EndPosition[] {
  const ring = 16 + Math.floor(hash(7, 13, seed) * 5);
  const pillars: EndPosition[] = [];
  for (let i = 0; i < END_ISLANDS; i += 1) {
    const angle = (i / END_ISLANDS) * Math.PI * 2 + hash(i + 1, 29, seed) * 0.9;
    const cx = Math.round(Math.cos(angle) * ring);
    const cz = Math.round(Math.sin(angle) * ring);
    const baseY = 6 + Math.floor(hash(i + 40, 3, seed) * 6) + 3 + 2;
    if (hash(i + 3, 91, seed) > 0.35) pillars.push({ x: cx, y: baseY, z: cz });
  }
  return pillars;
}

/** Where a player lands when entering the End: safe on the obsidian platform edge. */
export const endSpawn = (): EndPosition => ({ x: END_CENTER_RADIUS, y: 1, z: 0 });
