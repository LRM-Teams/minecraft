import { describeColumn, biomeAt, type BiomeProfile } from "./biomes";

export const BLOCK_TYPES = ["grass", "dirt", "stone", "wood", "planks", "leaves", "sand", "water", "bricks", "glass", "coal_ore", "copper_ore", "iron_ore", "gold_ore", "diamond_ore", "crafting_table", "furnace", "torch", "wool", "bed"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Blocks that do not occlude neighbours or block movement (torch is a thin fixture). */
export const NON_SOLID_BLOCKS: ReadonlySet<BlockType> = new Set(["water", "torch"]);
export const CHUNK_SIZE = 16;

export type BlockPosition = { x: number; y: number; z: number };
/** Stable building anchors for the later villager simulation. */
export type VillageHome = { id: string; entrance: BlockPosition; interior: BlockPosition; workstation: BlockPosition };
export type VillageAnchor = { id: string; center: BlockPosition; plaza: BlockPosition; homes: VillageHome[] };
/** Compact read view used by the HUD; detailed anchors live in `villages`. */
export type VillageInfo = { center: BlockPosition; houses: VillageHome[] };
export type WorldSnapshot = { seed: number; size: number; blocks: [string, BlockType][]; villages?: VillageAnchor[] };
const NEIGHBORS: BlockPosition[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
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

/** A deterministic, compact voxel world. Rendering deliberately lives elsewhere. */
export class VoxelWorld {
  readonly blocks = new Map<string, BlockType>();
  /** Village metadata is seed-stable and is retained alongside world snapshots. */
  readonly villages: VillageAnchor[] = [];
  readonly size: number;
  readonly seed: number;

  constructor(seed = 72831, size = 48) {
    this.seed = seed;
    this.size = size;
    this.generate();
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
    return block !== undefined && !NON_SOLID_BLOCKS.has(block);
  }

  set(position: BlockPosition, type: BlockType): void {
    if (position.y < 0 || position.y > 24 || Math.abs(position.x) > this.size || Math.abs(position.z) > this.size) return;
    this.blocks.set(key(position.x, position.y, position.z), type);
  }

  remove(position: BlockPosition): BlockType | undefined {
    const block = this.get(position.x, position.y, position.z);
    if (block) this.blocks.delete(key(position.x, position.y, position.z));
    return block;
  }

  topY(x: number, z: number): number {
    for (let y = 24; y >= 0; y -= 1) if (this.isSolid(x, y, z)) return y;
    return -1;
  }

  /** The mathematical chunk containing a world coordinate. */
  chunkAt(value: number): number {
    return Math.floor(value / CHUNK_SIZE);
  }

  /**
   * Produces only exposed blocks in the requested square of chunks. This is the
   * rendering boundary: the world remains persistent, while distant chunks cost no draw calls.
   */
  visibleBlocks(centerX?: number, centerZ?: number, chunkRadius?: number): { position: BlockPosition; type: BlockType }[] {
    const visible: { position: BlockPosition; type: BlockType }[] = [];
    const centerChunkX = centerX === undefined ? undefined : this.chunkAt(centerX);
    const centerChunkZ = centerZ === undefined ? undefined : this.chunkAt(centerZ);
    this.blocks.forEach((type, positionKey) => {
      const [x, y, z] = positionKey.split(",").map(Number);
      if (
        centerChunkX !== undefined && centerChunkZ !== undefined && chunkRadius !== undefined
        && (Math.abs(this.chunkAt(x) - centerChunkX) > chunkRadius || Math.abs(this.chunkAt(z) - centerChunkZ) > chunkRadius)
      ) return;
      const exposed = NEIGHBORS.some((offset) => {
        const neighbour = this.get(x + offset.x, y + offset.y, z + offset.z);
        if (neighbour === undefined) return true;
        if (NON_SOLID_BLOCKS.has(neighbour) && type !== neighbour) return true;
        return false;
      });
      if (exposed) visible.push({ position: { x, y, z }, type });
    });
    return visible;
  }

  snapshot(): WorldSnapshot {
    return { seed: this.seed, size: this.size, blocks: [...this.blocks.entries()], villages: this.cloneVillages() };
  }

  static fromSnapshot(snapshot: WorldSnapshot, size = snapshot.size ?? 30): VoxelWorld {
    const world = new VoxelWorld(snapshot.seed, size);
    world.blocks.clear();
    snapshot.blocks.forEach(([position, type]) => world.blocks.set(position, type));
    world.villages.length = 0;
    if (snapshot.villages) world.villages.push(...snapshot.villages.map((village) => cloneVillage(village)));
    // Older local saves have no village record. Add the deterministic structure
    // after their saved edits, without changing the snapshot schema requirement.
    else world.generateVillage();
    return world;
  }

  private generate(): void {
    for (let x = -this.size; x <= this.size; x += 1) {
      for (let z = -this.size; z <= this.size; z += 1) {
        const profile = biomeAt(x, z, this.seed);
        const height = this.columnHeight(x, z, profile);
        const seaLevel = profile.seaLevel;
        for (let y = 0; y <= height; y += 1) {
          this.set({ x, y, z }, this.fillBlock(profile, y, height));
        }
        if (profile.aquatic) {
          for (let y = height + 1; y <= seaLevel; y += 1) this.set({ x, y, z }, "water");
        }
        const edges = Math.abs(x) < this.size - 2 && Math.abs(z) < this.size - 2;
        const willTree =
          profile.id !== "desert"
          && profile.treeThreshold < 1
          && height >= seaLevel + 1
          && hash(x + 99, z - 24, this.seed) > profile.treeThreshold
          && edges;
        if (willTree) {
          this.addTree(x, height + 1, z);
        } else if (
          profile.flowerBlock
          && profile.flowerChance !== undefined
          && height >= seaLevel + 1
          && hash(x + 5, z - 13, this.seed) > profile.flowerChance
          && edges
        ) {
          this.set({ x, y: height + 1, z }, profile.flowerBlock);
        }
      }
    }
    this.generateVillage();
    this.carveCaves();
    this.scatterOres();
  }

  /**
   * Carve deterministic underground cavities and connecting tunnels out of the
   * buried stone. Uses a seed-stable 3D-style noise and only touches blocks deep
   * below the surface, so the above-ground terrain, biomes and villages are
   * never disturbed and every seed reproduces the same cave network.
   */
  private carveCaves(): void {
    for (let x = -this.size; x <= this.size; x += 1) {
      for (let z = -this.size; z <= this.size; z += 1) {
        // Surface terrain sits roughly within y ∈ [0, 12]; caves open below it.
        for (let y = 2; y <= 9; y += 1) {
          // Wide, winding voids from a low-frequency field.
          const cavity =
            Math.sin((x + this.seed * 0.7) * 0.31) *
            Math.cos((z - this.seed * 0.3) * 0.37) *
            Math.sin((y + this.seed) * 0.5);
          // Intermittent short tunnels that thread between chambers.
          const tunnel =
            Math.abs(Math.sin((x * 0.9 + z * 0.5 + y * 0.7 + this.seed) * 1.35)) < 0.42 &&
            hash(x + y, z + y * 2, this.seed) > 0.42 &&
            y > 3;
          if ((cavity > 0.62 || tunnel) && !this.isSupportColumn(x, y - 1, z)) {
            this.blocks.delete(key(x, y, z));
          }
        }
      }
    }
  }

  /**
   * True when the block below a potential cave cell is still solid stone, so
   * caverns never open a hole straight down to bedrock/void beneath a player.
   */
  private isSupportColumn(x: number, y: number, z: number): boolean {
    for (let below = y; below >= 1; below -= 1) {
      if (this.get(x, below, z) === "stone" || this.get(x, below, z) === "dirt") return true;
    }
    return false;
  }

  /**
   * Scatter the Phase-3 mineral ores through the buried stone, pushing the rare
   * ones deeper. All ores are original-colour blocks embedded at deterministic
   * positions that any mifted touch can collect through the standard drop chain.
   */
  private scatterOres(): void {
    const oreAt = (x: number, y: number, z: number): BlockType | undefined => {
      if (this.get(x, y, z) !== "stone") return undefined;
      const depth = y; // y=0 is bedrock; smaller y is deeper underground
      const roll = hash(x + 31, z - 17, this.seed + y * 7);
      // diamond only in the lowest band, tiny chance
      if (depth <= 2 && roll < 0.012) return "diamond_ore";
      if (depth <= 4 && roll < 0.05) return "gold_ore";
      if (depth <= 6 && roll < 0.11) return "iron_ore";
      if (depth <= 8 && roll < 0.18) return "copper_ore";
      if (roll < 0.26) return "coal_ore";
      return undefined;
    };
    for (let x = -this.size; x <= this.size; x += 1) {
      for (let z = -this.size; z <= this.size; z += 1) {
        for (let y = 1; y <= 8; y += 1) {
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
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      for (let z = centerZ - radius; z <= centerZ + radius; z += 1) this.prepareVillageGround(x, z, groundY);
    }

    // A brick plaza plus cross roads creates an immediately recognisable layout.
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

  /** Locate a mostly plains, gently rolling site deterministically from seed. */
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
        // A seed-dependent tiebreak prevents every world placing its village at 0,0.
        const score = x * x + z * z + hash(x + 17, z - 31, this.seed) * 9;
        if (!best || score < best.score) best = { x, y: Math.round((low + high) / 2), z, score };
      }
    }
    return best;
  }

  /** Flatten only the generated footprint; the blocks remain normally editable. */
  private prepareVillageGround(x: number, z: number, groundY: number): void {
    for (let y = 24; y > groundY; y -= 1) this.blocks.delete(key(x, y, z));
    const top = this.topY(x, z);
    for (let y = Math.max(0, top + 1); y < groundY; y += 1) this.set({ x, y, z }, "dirt");
    this.set({ x, y: groundY, z }, "grass");
  }

  private buildHome(id: string, centerX: number, centerZ: number, groundY: number, entranceSide: "north" | "south"): VillageHome {
    const minX = centerX - 2, maxX = centerX + 2, minZ = centerZ - 2, maxZ = centerZ + 2;
    for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) {
      this.set({ x, y: groundY, z }, "bricks");
      for (let y = groundY + 1; y <= groundY + 4; y += 1) this.blocks.delete(key(x, y, z));
    }
    const doorZ = entranceSide === "north" ? minZ : maxZ;
    for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) {
      if (x !== minX && x !== maxX && z !== minZ && z !== maxZ) continue;
      for (let y = groundY + 1; y <= groundY + 3; y += 1) {
        const doorway = x === centerX && z === doorZ && y <= groundY + 2;
        if (!doorway) this.set({ x, y, z }, (x === minX || x === maxX) && y === groundY + 2 ? "glass" : "planks");
      }
    }
    for (let x = minX; x <= maxX; x += 1) for (let z = minZ; z <= maxZ; z += 1) this.set({ x, y: groundY + 4, z }, "wood");
    // Wool rugs / bedding stock — sheep AI is later Phase work; villages supply wool for beds.
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

  /** Deterministic terrain height for a column in the given biome. */
  private columnHeight(x: number, z: number, profile: BiomeProfile): number {
    let height = describeColumn(x, z, this.seed).height;
    // Rocky highlands: anything above the biome's base is exposed stone.
    height = Math.max(1, height);
    return Math.min(24, height);
  }

  /** Surface / subsurface / underground block distribution for a column. */
  private fillBlock(profile: BiomeProfile, y: number, height: number): BlockType {
    if (y === height) {
      // Mountain peaks above the tree line are bare rock.
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
