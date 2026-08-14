export const BLOCK_TYPES = ["grass", "dirt", "stone", "wood", "planks", "leaves", "sand", "water"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const CHUNK_SIZE = 16;

export type BlockPosition = { x: number; y: number; z: number };
export type WorldSnapshot = { seed: number; size: number; blocks: [string, BlockType][] };
const NEIGHBORS: BlockPosition[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const hash = (x: number, z: number, seed: number) => {
  const value = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.12345) * 43758.5453;
  return value - Math.floor(value);
};

/** A deterministic, compact voxel world. Rendering deliberately lives elsewhere. */
export class VoxelWorld {
  readonly blocks = new Map<string, BlockType>();
  readonly size: number;
  readonly seed: number;

  constructor(seed = 72831, size = 48) {
    this.seed = seed;
    this.size = size;
    this.generate();
  }

  get(x: number, y: number, z: number): BlockType | undefined {
    return this.blocks.get(key(x, y, z));
  }

  isSolid(x: number, y: number, z: number): boolean {
    const block = this.get(x, y, z);
    return block !== undefined && block !== "water";
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
        return neighbour === undefined || (neighbour === "water" && type !== "water");
      });
      if (exposed) visible.push({ position: { x, y, z }, type });
    });
    return visible;
  }

  snapshot(): WorldSnapshot {
    return { seed: this.seed, size: this.size, blocks: [...this.blocks.entries()] };
  }

  static fromSnapshot(snapshot: WorldSnapshot, size = snapshot.size ?? 30): VoxelWorld {
    const world = new VoxelWorld(snapshot.seed, size);
    world.blocks.clear();
    snapshot.blocks.forEach(([position, type]) => world.blocks.set(position, type));
    return world;
  }

  private generate(): void {
    for (let x = -this.size; x <= this.size; x += 1) {
      for (let z = -this.size; z <= this.size; z += 1) {
        const rolling = Math.sin((x + this.seed) * 0.19) * 1.5 + Math.cos((z - this.seed) * 0.17) * 1.4;
        const height = Math.max(2, Math.min(9, Math.round(5 + rolling + hash(x, z, this.seed) * 1.5)));
        const seaLevel = 3;
        const sandy = height <= seaLevel + 1 && hash(x + 7, z + 11, this.seed) > 0.4;
        for (let y = 0; y <= height; y += 1) {
          this.set({ x, y, z }, y === height ? (sandy ? "sand" : "grass") : y > height - 3 ? "dirt" : "stone");
        }
        for (let y = height + 1; y <= seaLevel; y += 1) this.set({ x, y, z }, "water");
        if (!sandy && height >= 5 && hash(x + 99, z - 24, this.seed) > 0.992 && Math.abs(x) < this.size - 2 && Math.abs(z) < this.size - 2) {
          this.addTree(x, height + 1, z);
        }
      }
    }
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
