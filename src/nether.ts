/**
 * Phase-3 「下界维度」: portal entrance + hell ecosystem.
 *
 * The nether is an *independent sub-world* with its own block registry. All of
 * its blocks (`netherrack`, `obsidian`, `lava`, `glowstone`, the portal tile)
 * live in module-internal data (`NETHER_BLOCKS`) and are NEVER added to the
 * overworld `BLOCK_TYPES` / `WorldSnapshot` schema. That keeps existing save
 * slots, `VoxelWorld` signatures and block IDs untouched while still giving the
 * dimension an original hell palette and ecology.
 *
 * Pure TypeScript: no THREE, no render state, no I/O. Every function is a pure
 * function of the seed / snapshot so the same seed always reproduces an
 * identical nether, and portal links are plain data.
 */

/** Module-internal nether block registry (not part of overworld `BLOCK_TYPES`). */
export const NETHER_BLOCKS = ["netherrack", "obsidian", "lava", "glowstone", "nether_portal"] as const;
export type NetherBlockId = (typeof NETHER_BLOCKS)[number];

export type NetherPosition = { x: number; y: number; z: number };
/** A nether sub-world retains a compact, snapshot-serialisable block map. */
export type NetherSnapshot = { seed: number; size: number; blocks: [string, NetherBlockId][] };

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
const hash = (x: number, z: number, seed: number): number => {
  const value = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.4321) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * Independent hell dimension. Unlike the overworld `VoxelWorld` it has no
 * villages and no `WorldSnapshot` — it is a fully separate terrain layer whose
 * blocks are nether-only. Deterministic per seed.
 */
export class NetherWorld {
  readonly blocks = new Map<string, NetherBlockId>();
  readonly size: number;
  readonly seed: number;

  constructor(seed = 72831, size = 40) {
    this.seed = seed;
    this.size = size;
    this.generate();
  }

  get(x: number, y: number, z: number): NetherBlockId | undefined {
    return this.blocks.get(key(x, y, z));
  }

  isSolid(x: number, y: number, z: number): boolean {
    const block = this.get(x, y, z);
    return block !== undefined && block !== "lava";
  }

  set(position: NetherPosition, type: NetherBlockId): void {
    if (position.y < 0 || position.y > 26 || Math.abs(position.x) > this.size || Math.abs(position.z) > this.size) return;
    this.blocks.set(key(position.x, position.y, position.z), type);
  }

  remove(position: NetherPosition): NetherBlockId | undefined {
    const block = this.get(position.x, position.y, position.z);
    if (block) this.blocks.delete(key(position.x, position.y, position.z));
    return block;
  }

  /** Highest solid block above a nether column (the ground you can stand on). */
  topY(x: number, z: number): number {
    for (let y = 26; y >= 0; y -= 1) if (this.isSolid(x, y, z)) return y;
    return -1;
  }

  snapshot(): NetherSnapshot {
    return { seed: this.seed, size: this.size, blocks: [...this.blocks.entries()] };
  }

  static fromSnapshot(snapshot: NetherSnapshot): NetherWorld {
    const world = new NetherWorld(snapshot.seed, snapshot.size);
    world.blocks.clear();
    snapshot.blocks.forEach(([position, type]) => world.blocks.set(position, type));
    return world;
  }

  /**
   * Deterministic hell terrain: a rolling netherrack ground with lava lakes in
   * the low pockets and clusters of glowing crystal (glowstone) on the ridges.
   * No overworld biomes are involved — this is the dimension's own palette.
   */
  private generate(): void {
    for (let x = -this.size; x <= this.size; x += 1) {
      for (let z = -this.size; z <= this.size; z += 1) {
        const base =
          Math.sin((x + this.seed) * 0.22) * 2.2 +
          Math.cos((z - this.seed) * 0.2) * 1.9 +
          Math.sin((x + z) * 0.09) * 1.2;
        const ground = Math.max(3, Math.min(20, Math.round(10 + base)));
        for (let y = 0; y <= ground; y += 1) this.set({ x, y, z }, "netherrack");
        // Sinister red lava pools fill the lowest ravines.
        if (ground <= 6 && Math.abs(hash(x, z, this.seed) - 0.5) < 0.16) {
          for (let y = ground + 1; y <= 8; y += 1) this.set({ x, y, z }, "lava");
        }
        // Glowstone crystal veins poke out of the tall ridges.
        const edges = Math.abs(x) < this.size - 2 && Math.abs(z) < this.size - 2;
        if (edges && ground >= 15 && hash(x * 3 + 7, z * 2 - 11, this.seed) > 0.86) {
          this.set({ x, y: ground + 1, z }, "glowstone");
          if (hash(x + 1, z, this.seed) > 0.5) this.set({ x, y: ground + 2, z }, "glowstone");
        }
      }
    }
  }
}

/** Opening width (portal tiles wide) and height (portal tiles tall) of a portal. */
export type PortalGeometry = { width: number; height: number };
/** Default compact nether portal: a 2×3 glowing opening inside an obsidian frame. */
export const defaultPortalGeometry = (): PortalGeometry => ({ width: 2, height: 3 });

/** Directions in which a portal can teleport the player. */
export type PortalSide = "overworld" | "nether";

/** A single linked portal pair connecting the two dimensions. */
export interface PortalLink {
  /** Overworld anchor: world-position of the bottom-left portal tile of the opening. */
  overworld: NetherPosition;
  /** Nether anchor: nether-position of the bottom-left portal tile of the linked opening. */
  nether: NetherPosition;
  geometry: PortalGeometry;
}

/** Build a portal link connecting an overworld anchor to a nether anchor. */
export const createPortalLink = (
  overworld: NetherPosition,
  nether: NetherPosition,
  geometry: PortalGeometry = defaultPortalGeometry(),
): PortalLink => ({ overworld, nether, geometry });

/**
 * True when a horizontal position falls inside the `width × height` opening of
 * the portal anchored at `bottomLeft` (used to detect stepping into a portal).
 */
export const isWithinPortalOpening = (
  bottomLeft: NetherPosition,
  geometry: PortalGeometry,
  x: number,
  y: number,
  z: number,
): boolean => {
  const horizontalOk =
    x >= bottomLeft.x && x < bottomLeft.x + geometry.width
    && z >= bottomLeft.z && z < bottomLeft.z + 1;
  const verticalOk = y >= bottomLeft.y && y <= bottomLeft.y + geometry.height - 1;
  return horizontalOk && verticalOk;
};

/** Positions (one block each) that make up the portal opening so a renderer can fill them. */
export function portalTiles(link: PortalLink, side: PortalSide): NetherPosition[] {
  const base = side === "overworld" ? link.overworld : link.nether;
  const tiles: NetherPosition[] = [];
  for (let x = 0; x < link.geometry.width; x += 1) {
    for (let y = 0; y < link.geometry.height; y += 1) {
      tiles.push({ x: base.x + x, y: base.y + y, z: base.z });
    }
  }
  return tiles;
}

/**
 * Compute where a player standing at `pos` should appear after crossing a
 * portal. The horizontal offset inside the opening is preserved; the player
 * lands on solid ground just in front of the far side's opening, facing back.
 */
export function teleportPosition(
  link: PortalLink,
  from: PortalSide,
  pos: { x: number; y: number; z: number },
): NetherPosition {
  const target = from === "overworld" ? link.nether : link.overworld;
  const deltaX = pos.x - (from === "overworld" ? link.overworld.x : link.nether.x);
  const deltaZ = pos.z - (from === "overworld" ? link.overworld.z : link.nether.z);
  // Stay within the horizontal opening, then step one tile out in front of it.
  const x = Math.round(target.x + Math.max(0, Math.min(link.geometry.width - 1, deltaX)));
  const frontOffset = 2; // landing cell just in front of the portal plane
  const z = target.z + frontOffset;
  return { x, y: Math.round(pos.y), z };
}
