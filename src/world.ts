import { describeColumn, biomeAt, type BiomeProfile } from "./biomes";

export const BLOCK_TYPES = ["grass", "dirt", "stone", "wood", "planks", "leaves", "sand", "water", "bricks", "glass", "coal_ore", "copper_ore", "iron_ore", "gold_ore", "diamond_ore", "lapis_ore", "redstone_ore", "obsidian", "crafting_table", "furnace", "enchanting_table", "bookshelf", "brewing_stand", "torch", "wool", "bed", "redstone_dust", "lever", "redstone_torch", "redstone_lamp", "oak_door", "ladder", "chest"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Blocks that do not occlude neighbours or block movement (torch / dust / lever / ladder fixtures). */
export const NON_SOLID_BLOCKS: ReadonlySet<BlockType> = new Set(["water", "torch", "redstone_dust", "lever", "redstone_torch", "ladder"]);
export const CHUNK_SIZE = 16;
/** Soft vertical build limit (inclusive). */
export const MAX_BUILD_Y = 24;
/** Default chunk radius streamed around the player for infinite exploration. */
export const STREAM_CHUNK_RADIUS = 2;

export type BlockPosition = { x: number; y: number; z: number };
/** Stable building anchors for the later villager simulation. */
export type VillageHome = { id: string; entrance: BlockPosition; interior: BlockPosition; workstation: BlockPosition };
export type VillageAnchor = { id: string; center: BlockPosition; plaza: BlockPosition; homes: VillageHome[] };
/** Compact read view used by the HUD; detailed anchors live in `villages`. */
export type VillageInfo = { center: BlockPosition; houses: VillageHome[] };
export type WorldSnapshot = {
  seed: number;
  size: number;
  blocks: [string, BlockType][];
  villages?: VillageAnchor[];
  /** Open oak_door cell keys (`x,y,z`); closed doors omit keys and stay solid. */
  openDoors?: string[];
};
const NEIGHBORS: BlockPosition[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
/** Faster than `split(",").map(Number)` on hot meshing paths. */
const parsePositionKey = (positionKey: string): BlockPosition => {
  const c1 = positionKey.indexOf(",");
  const c2 = positionKey.indexOf(",", c1 + 1);
  return {
    x: Number(positionKey.slice(0, c1)),
    y: Number(positionKey.slice(c1 + 1, c2)),
    z: Number(positionKey.slice(c2 + 1)),
  };
};
const hash = (x: number, z: number, seed: number) => {
  const value = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.12345) * 43758.5453;
  return value - Math.floor(value);
};
const clonePosition = (position: BlockPosition): BlockPosition => ({ ...position });
const cloneVillage = (village: VillageAnchor): VillageAnchor => ({
  ...village,
  center: clonePosition(village.center),
  plaza: clonePosition(village.plaza),
  homes: village.homes.map((home) => ({
    ...home,
    entrance: clonePosition(home.entrance),
    interior: clonePosition(home.interior),
    workstation: clonePosition(home.workstation),
  })),
});

/**
 * Deterministic voxel world with infinite chunk streaming.
 * `size` is the logical / save radius; spawn only eagerly generates a small ring
 * so entering a world does not stall the main thread for seconds.
 */
export class VoxelWorld {
  readonly blocks = new Map<string, BlockType>();
  /** Village metadata is seed-stable and is retained alongside world snapshots. */
  readonly villages: VillageAnchor[] = [];
  /** Open door cells (`x,y,z`) — open oak doors do not block movement. */
  readonly openDoors = new Set<string>();
  readonly size: number;
  readonly seed: number;
  /** Chunks already terrain-generated (player edits never clear this). */
  private readonly generatedChunks = new Set<string>();
  /** Position keys (`x,y,z`) indexed by chunk — speeds per-chunk meshing. */
  private readonly blocksByChunk = new Map<string, Set<string>>();
  /** Torch cell keys — keeps lighting queries O(torches) instead of O(world). */
  private readonly torchKeys = new Set<string>();

  constructor(seed = 72831, size = 48) {
    this.seed = seed;
    this.size = size;
    // Eager spawn ring only (3×3 chunks). Rest streams via ensureAround with a budget.
    this.ensureAround(0, 0, 1);
    this.generateVillage();
  }

  /** All placed torch position keys (`x,y,z`). */
  torchKeySet(): ReadonlySet<string> {
    return this.torchKeys;
  }

  /** First village convenience view for UI callers (undefined when no plains fit). */
  get village(): VillageInfo | undefined {
    const anchor = this.villages[0];
    return anchor ? { center: anchor.center, houses: anchor.homes } : undefined;
  }

  get(x: number, y: number, z: number): BlockType | undefined {
    return this.blocks.get(key(x, y, z));
  }

  isSolid(x: number, y: number, z: number): boolean {
    const block = this.get(x, y, z);
    if (block === undefined) return false;
    if (block === "oak_door" && this.openDoors.has(key(x, y, z))) return false;
    return !NON_SOLID_BLOCKS.has(block);
  }

  set(position: BlockPosition, type: BlockType): void {
    if (position.y < 0 || position.y > MAX_BUILD_Y) return;
    const pk = key(position.x, position.y, position.z);
    const previous = this.blocks.get(pk);
    if (previous === "torch") this.torchKeys.delete(pk);
    this.blocks.set(pk, type);
    if (type === "torch") this.torchKeys.add(pk);
    this.indexBlock(position.x, position.z, pk, true);
  }

  remove(position: BlockPosition): BlockType | undefined {
    const pk = key(position.x, position.y, position.z);
    const block = this.blocks.get(pk);
    if (block) {
      this.blocks.delete(pk);
      if (block === "torch") this.torchKeys.delete(pk);
      this.indexBlock(position.x, position.z, pk, false);
    }
    return block;
  }

  /** Index or un-index a block key under its chunk for O(blocks-in-chunk) meshing. */
  private indexBlock(x: number, z: number, positionKey: string, present: boolean): void {
    const ck = chunkKey(this.chunkAt(x), this.chunkAt(z));
    let set = this.blocksByChunk.get(ck);
    if (present) {
      if (!set) {
        set = new Set();
        this.blocksByChunk.set(ck, set);
      }
      set.add(positionKey);
      return;
    }
    set?.delete(positionKey);
  }

  /** Clear a cell without returning the prior type (village flatten / door clear). */
  private clearAt(x: number, y: number, z: number): void {
    const pk = key(x, y, z);
    const previous = this.blocks.get(pk);
    if (!this.blocks.delete(pk)) return;
    if (previous === "torch") this.torchKeys.delete(pk);
    this.indexBlock(x, z, pk, false);
  }

  topY(x: number, z: number): number {
    for (let y = MAX_BUILD_Y; y >= 0; y -= 1) if (this.isSolid(x, y, z)) return y;
    return -1;
  }

  /** The mathematical chunk containing a world coordinate. */
  chunkAt(value: number): number {
    return Math.floor(value / CHUNK_SIZE);
  }

  /**
   * Stream terrain around a world position. Generates at most `budget` new chunks
   * per call (nearest first) so walking never stalls on a full ring of terrain gen.
   */
  ensureAround(
    worldX: number,
    worldZ: number,
    chunkRadius = STREAM_CHUNK_RADIUS,
    budget = Number.POSITIVE_INFINITY,
  ): boolean {
    const cx = this.chunkAt(worldX);
    const cz = this.chunkAt(worldZ);
    const missing: { dx: number; dz: number; dist: number }[] = [];
    for (let dx = -chunkRadius; dx <= chunkRadius; dx += 1) {
      for (let dz = -chunkRadius; dz <= chunkRadius; dz += 1) {
        if (!this.generatedChunks.has(chunkKey(cx + dx, cz + dz))) {
          missing.push({ dx, dz, dist: dx * dx + dz * dz });
        }
      }
    }
    missing.sort((a, b) => a.dist - b.dist);
    let grew = false;
    let used = 0;
    for (const item of missing) {
      if (used >= budget) break;
      if (this.ensureChunk(cx + item.dx, cz + item.dz)) {
        grew = true;
        used += 1;
      }
    }
    return grew;
  }

  /** Generate every column inside a square radius of the origin (used by constructor / tests). */
  ensureRadius(originX: number, originZ: number, radius: number): boolean {
    const minCx = this.chunkAt(originX - radius);
    const maxCx = this.chunkAt(originX + radius);
    const minCz = this.chunkAt(originZ - radius);
    const maxCz = this.chunkAt(originZ + radius);
    let grew = false;
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cz = minCz; cz <= maxCz; cz += 1) {
        if (this.ensureChunk(cx, cz)) grew = true;
      }
    }
    return grew;
  }

  /**
   * True when a block has at least one non-occluding neighbour face.
   */
  private isExposed(x: number, y: number, z: number, type: BlockType): boolean {
    return NEIGHBORS.some((offset) => {
      const nx = x + offset.x;
      const ny = y + offset.y;
      const nz = z + offset.z;
      const neighbour = this.get(nx, ny, nz);
      if (neighbour === undefined) return true;
      // Open doors / ladders / fixtures expose faces like other non-solids.
      if (!this.isSolid(nx, ny, nz) && type !== neighbour) return true;
      return false;
    });
  }

  /**
   * Exposed blocks inside one chunk only. Uses the per-chunk index so remesh cost
   * stays O(blocks in chunk), not O(chunk volume) or O(whole world).
   */
  visibleBlocksInChunk(cx: number, cz: number): { position: BlockPosition; type: BlockType }[] {
    const visible: { position: BlockPosition; type: BlockType }[] = [];
    const indexed = this.blocksByChunk.get(chunkKey(cx, cz));
    if (!indexed) return visible;
    for (const positionKey of indexed) {
      const type = this.blocks.get(positionKey);
      if (!type) continue;
      const position = parsePositionKey(positionKey);
      if (this.isExposed(position.x, position.y, position.z, type)) {
        visible.push({ position, type });
      }
    }
    return visible;
  }

  /**
   * Produces only exposed blocks in the requested square of chunks. This is the
   * rendering boundary: the world remains persistent, while distant chunks cost no draw calls.
   */
  visibleBlocks(centerX?: number, centerZ?: number, chunkRadius?: number): { position: BlockPosition; type: BlockType }[] {
    if (centerX !== undefined && centerZ !== undefined && chunkRadius !== undefined) {
      const visible: { position: BlockPosition; type: BlockType }[] = [];
      const centerChunkX = this.chunkAt(centerX);
      const centerChunkZ = this.chunkAt(centerZ);
      for (let dx = -chunkRadius; dx <= chunkRadius; dx += 1) {
        for (let dz = -chunkRadius; dz <= chunkRadius; dz += 1) {
          visible.push(...this.visibleBlocksInChunk(centerChunkX + dx, centerChunkZ + dz));
        }
      }
      return visible;
    }
    const visible: { position: BlockPosition; type: BlockType }[] = [];
    this.blocks.forEach((type, positionKey) => {
      const [x, y, z] = positionKey.split(",").map(Number);
      if (this.isExposed(x, y, z, type)) visible.push({ position: { x, y, z }, type });
    });
    return visible;
  }

  snapshot(): WorldSnapshot {
    return {
      seed: this.seed,
      size: this.size,
      blocks: [...this.blocks.entries()],
      villages: this.cloneVillages(),
      openDoors: this.openDoors.size ? [...this.openDoors] : undefined,
    };
  }

  static fromSnapshot(snapshot: WorldSnapshot, size = snapshot.size ?? 30): VoxelWorld {
    const world = new VoxelWorld(snapshot.seed, size);
    world.blocks.clear();
    world.blocksByChunk.clear();
    world.torchKeys.clear();
    world.generatedChunks.clear();
    world.openDoors.clear();
    snapshot.blocks.forEach(([position, type]) => {
      const [x, y, z] = position.split(",").map(Number);
      world.set({ x, y, z }, type);
    });
    // Mark every chunk that has saved blocks as already generated so streaming
    // does not overwrite player edits with fresh terrain.
    snapshot.blocks.forEach(([position]) => {
      const [x, , z] = position.split(",").map(Number);
      world.generatedChunks.add(chunkKey(world.chunkAt(x), world.chunkAt(z)));
    });
    // Also mark the initial radius so holes outside the snapshot still stream later.
    const minCx = world.chunkAt(-size);
    const maxCx = world.chunkAt(size);
    const minCz = world.chunkAt(-size);
    const maxCz = world.chunkAt(size);
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cz = minCz; cz <= maxCz; cz += 1) {
        world.generatedChunks.add(chunkKey(cx, cz));
      }
    }
    world.villages.length = 0;
    if (snapshot.villages) world.villages.push(...snapshot.villages.map((village) => cloneVillage(village)));
    // Older local saves have no village record. Add the deterministic structure
    // after their saved edits, without changing the snapshot schema requirement.
    else world.generateVillage();
    snapshot.openDoors?.forEach((doorKey) => world.openDoors.add(doorKey));
    return world;
  }

  /** Generate one 16×16 terrain chunk if missing. */
  private ensureChunk(cx: number, cz: number): boolean {
    const id = chunkKey(cx, cz);
    if (this.generatedChunks.has(id)) return false;
    this.generatedChunks.add(id);
    const minX = cx * CHUNK_SIZE;
    const minZ = cz * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE - 1;
    const maxZ = minZ + CHUNK_SIZE - 1;
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        this.generateColumn(x, z);
      }
    }
    this.carveCavesInBounds(minX, maxX, minZ, maxZ);
    this.scatterOresInBounds(minX, maxX, minZ, maxZ);
    return true;
  }

  private generateColumn(x: number, z: number): void {
    const profile = biomeAt(x, z, this.seed);
    const height = this.columnHeight(x, z, profile);
    const seaLevel = profile.seaLevel;
    for (let y = 0; y <= height; y += 1) {
      this.set({ x, y, z }, this.fillBlock(profile, y, height));
    }
    if (profile.aquatic) {
      for (let y = height + 1; y <= seaLevel; y += 1) this.set({ x, y, z }, "water");
    }
    const willTree =
      profile.id !== "desert"
      && profile.id !== "ocean"
      && profile.treeThreshold < 1
      && height >= seaLevel + 1
      && hash(x + 99, z - 24, this.seed) > profile.treeThreshold;
    if (willTree) {
      this.addTree(x, height + 1, z);
    } else if (
      profile.flowerBlock
      && profile.flowerChance !== undefined
      && height >= seaLevel + 1
      && hash(x + 5, z - 13, this.seed) > profile.flowerChance
    ) {
      this.set({ x, y: height + 1, z }, profile.flowerBlock);
    }
  }

  /**
   * Carve deterministic underground cavities and connecting tunnels out of the
   * buried stone within the given column bounds.
   * Depth band mirrors a compressed JE cave layer (Y≈1–14 under typical surface).
   */
  private carveCavesInBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const top = this.topY(x, z);
        const maxCaveY = Math.min(14, Math.max(3, top - 2));
        for (let y = 2; y <= maxCaveY; y += 1) {
          const cavity =
            Math.sin((x + this.seed * 0.7) * 0.31) *
            Math.cos((z - this.seed * 0.3) * 0.37) *
            Math.sin((y + this.seed) * 0.5);
          const tunnel =
            Math.abs(Math.sin((x * 0.9 + z * 0.5 + y * 0.7 + this.seed) * 1.35)) < 0.42 &&
            hash(x + y, z + y * 2, this.seed) > 0.42 &&
            y > 3;
          if ((cavity > 0.58 || tunnel) && !this.isSupportColumn(x, y - 1, z)) {
            this.clearAt(x, y, z);
          }
        }
      }
    }
  }

  private isSupportColumn(x: number, y: number, z: number): boolean {
    for (let below = y; below >= 1; below -= 1) {
      if (this.get(x, below, z) === "stone" || this.get(x, below, z) === "dirt") return true;
    }
    return false;
  }

  private touchesAir(x: number, y: number, z: number): boolean {
    for (const n of NEIGHBORS) {
      if (!this.get(x + n.x, y + n.y, z + n.z)) return true;
    }
    return false;
  }

  /**
   * Scatter mineral ores with wiki-readable depth / rarity (compressed to our Y band):
   * coal common mid-high · copper mid · iron mid-deep · gold/redstone deep · diamond deepest.
   * Cave walls get a density boost so caves reliably expose mineable veins.
   * Obsidian is not scattered as an "ore" (portal frames / player-placed only).
   */
  private scatterOresInBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    type OreBand = { type: BlockType; minY: number; maxY: number; base: number; caveBonus: number };
    // Probabilities tuned so coal ≫ copper ≫ iron ≫ gold ≫ diamond across a size=48 world.
    const bands: readonly OreBand[] = [
      { type: "diamond_ore", minY: 1, maxY: 3, base: 0.014, caveBonus: 0.05 },
      { type: "gold_ore", minY: 1, maxY: 5, base: 0.028, caveBonus: 0.06 },
      { type: "redstone_ore", minY: 1, maxY: 5, base: 0.03, caveBonus: 0.05 },
      { type: "lapis_ore", minY: 1, maxY: 7, base: 0.032, caveBonus: 0.055 },
      { type: "iron_ore", minY: 1, maxY: 8, base: 0.07, caveBonus: 0.1 },
      { type: "copper_ore", minY: 2, maxY: 10, base: 0.09, caveBonus: 0.11 },
      { type: "coal_ore", minY: 2, maxY: 12, base: 0.14, caveBonus: 0.14 },
    ];
    const oreAt = (x: number, y: number, z: number): BlockType | undefined => {
      if (this.get(x, y, z) !== "stone") return undefined;
      const cave = this.touchesAir(x, y, z);
      const roll = hash(x + 31, z - 17, this.seed + y * 7);
      for (const band of bands) {
        if (y < band.minY || y > band.maxY) continue;
        const chance = band.base + (cave ? band.caveBonus : 0);
        // Offset hash per ore so rarer ores are not always shadowed by coal.
        const oreRoll = hash(x + band.minY * 13, z - band.maxY * 3, this.seed + y * 7 + band.type.length * 19);
        if (oreRoll < chance && roll < 0.92) return band.type;
      }
      return undefined;
    };
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const top = this.topY(x, z);
        const maxOreY = Math.min(12, Math.max(1, top - 2));
        for (let y = 1; y <= maxOreY; y += 1) {
          const ore = oreAt(x, y, z);
          if (ore) this.set({ x, y, z }, ore);
        }
      }
    }
  }

  /** Generate one small village in a broad, level plains patch for this seed. */
  private generateVillage(): void {
    if (this.size < 20 || this.villages.length) return;
    const site = this.findVillageSite();
    if (!site) return;
    const { x: centerX, z: centerZ, y: groundY } = site;
    const radius = 8;
    // Ensure village footprint chunks exist before flattening.
    this.ensureRadius(centerX, centerZ, radius + 2);
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      for (let z = centerZ - radius; z <= centerZ + radius; z += 1) this.prepareVillageGround(x, z, groundY);
    }

    for (let x = centerX - 2; x <= centerX + 2; x += 1) {
      for (let z = centerZ - 2; z <= centerZ + 2; z += 1) this.set({ x, y: groundY, z }, "bricks");
    }
    for (let offset = -radius; offset <= radius; offset += 1) {
      this.set({ x: centerX + offset, y: groundY, z: centerZ }, "bricks");
      this.set({ x: centerX, y: groundY, z: centerZ + offset }, "bricks");
    }
    const homes = [
      this.buildHome(`${centerX}:${centerZ}:northwest`, centerX - 5, centerZ - 5, groundY, "south"),
      this.buildHome(`${centerX}:${centerZ}:northeast`, centerX + 5, centerZ - 5, groundY, "south"),
      this.buildHome(`${centerX}:${centerZ}:southwest`, centerX - 5, centerZ + 5, groundY, "north"),
      this.buildHome(`${centerX}:${centerZ}:southeast`, centerX + 5, centerZ + 5, groundY, "north"),
    ];
    this.villages.push({
      id: `village-${this.seed}-${centerX}-${centerZ}`,
      center: { x: centerX, y: groundY + 1, z: centerZ },
      plaza: { x: centerX, y: groundY + 1, z: centerZ },
      homes,
    });
  }

  private findVillageSite(): { x: number; y: number; z: number } | undefined {
    const limit = this.size - 9;
    let best: { x: number; y: number; z: number; score: number } | undefined;
    for (let x = -limit; x <= limit; x += 2) {
      for (let z = -limit; z <= limit; z += 2) {
        let low = Infinity;
        let high = -Infinity;
        let plains = true;
        for (const dx of [-5, 0, 5]) for (const dz of [-5, 0, 5]) {
          const column = describeColumn(x + dx, z + dz, this.seed);
          if (column.biome !== "plains") { plains = false; break; }
          low = Math.min(low, column.height);
          high = Math.max(high, column.height);
        }
        if (!plains || high - low > 3) continue;
        const score = x * x + z * z + hash(x + 17, z - 31, this.seed) * 9;
        if (!best || score < best.score) best = { x, y: Math.round((low + high) / 2), z, score };
      }
    }
    return best;
  }

  private prepareVillageGround(x: number, z: number, groundY: number): void {
    for (let y = MAX_BUILD_Y; y > groundY; y -= 1) this.clearAt(x, y, z);
    const top = this.topY(x, z);
    for (let y = Math.max(0, top + 1); y < groundY; y += 1) this.set({ x, y, z }, "dirt");
    this.set({ x, y: groundY, z }, "grass");
  }

  private buildHome(id: string, centerX: number, centerZ: number, groundY: number, entranceSide: "north" | "south"): VillageHome {
    const minX = centerX - 2, maxX = centerX + 2, minZ = centerZ - 2, maxZ = centerZ + 2;
    for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) {
      this.set({ x, y: groundY, z }, "bricks");
      for (let y = groundY + 1; y <= groundY + 4; y += 1) this.clearAt(x, y, z);
    }
    const doorZ = entranceSide === "north" ? minZ : maxZ;
    for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) {
      if (x !== minX && x !== maxX && z !== minZ && z !== maxZ) continue;
      for (let y = groundY + 1; y <= groundY + 3; y += 1) {
        const doorway = x === centerX && z === doorZ && y <= groundY + 2;
        if (!doorway) this.set({ x, y, z }, (x === minX || x === maxX) && y === groundY + 2 ? "glass" : "planks");
      }
    }
    // Vanilla-ish oak door in the doorway (2 tall). Starts closed; players toggle with right-click.
    const doorLower = { x: centerX, y: groundY + 1, z: doorZ };
    const doorUpper = { x: centerX, y: groundY + 2, z: doorZ };
    this.set(doorLower, "oak_door");
    this.set(doorUpper, "oak_door");
    for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) this.set({ x, y: groundY + 4, z }, "wood");
    this.set({ x: centerX - 1, y: groundY + 1, z: centerZ }, "wool");
    this.set({ x: centerX - 1, y: groundY + 1, z: centerZ + (entranceSide === "north" ? 1 : -1) }, "wool");
    return {
      id,
      entrance: { x: centerX, y: groundY + 1, z: doorZ },
      interior: { x: centerX, y: groundY + 1, z: centerZ },
      workstation: { x: centerX + 1, y: groundY + 1, z: centerZ },
    };
  }

  private cloneVillages(): VillageAnchor[] {
    return this.villages.map((village) => cloneVillage(village));
  }

  private columnHeight(x: number, z: number, profile: BiomeProfile): number {
    let height = describeColumn(x, z, this.seed).height;
    height = Math.max(1, height);
    return Math.min(MAX_BUILD_Y, height);
  }

  private fillBlock(profile: BiomeProfile, y: number, height: number): BlockType {
    if (y === height) {
      if (profile.id === "mountains" && height >= profile.baseHeight + 1) return "stone";
      return profile.surface;
    }
    if (y > height - 3) return profile.subsurface;
    return profile.underground;
  }

  private addTree(x: number, y: number, z: number): void {
    for (let trunk = 0; trunk < 4; trunk += 1) this.set({ x, y: y + trunk, z }, "wood");
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dy = 2; dy <= 4; dy += 1) {
          if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 3) <= 4) this.set({ x: x + dx, y: y + dy, z: z + dz }, "leaves");
        }
      }
    }
  }
}
