import { biomeIdAt } from "./biomes";
import type { BlockPosition, BlockType } from "./world";

/**
 * Stable, world-space reference for an inhabitable building.  Villagers can
 * use these anchors without needing to inspect or understand its voxel shape.
 */
export interface VillageHouseAnchor {
  id: string;
  /** Block position of the bottom half of the door. */
  door: BlockPosition;
  /** Walkable block immediately outside the door. */
  entrance: BlockPosition;
  /** A walkable position inside the house. */
  interior: BlockPosition;
}

export interface VillageLayout {
  center: BlockPosition;
  plaza: readonly BlockPosition[];
  roads: readonly BlockPosition[];
  houses: readonly VillageHouseAnchor[];
}

type VoxelWriter = {
  set(position: BlockPosition, type: BlockType): void;
  remove(position: BlockPosition): BlockType | undefined;
};

const key = (x: number, z: number) => `${x},${z}`;
const hash = (x: number, z: number, seed: number): number => {
  const value = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.12345) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * Find a reproducible, mostly-plains site close enough to the initial spawn to
 * be discovered. The fallback still produces a settlement on unusual seeds.
 */
function villageSite(seed: number, size: number): { x: number; z: number } | undefined {
  const margin = 13;
  if (size < margin * 2) return undefined;
  let best: { x: number; z: number; score: number } | undefined;
  for (let x = -size + margin; x <= size - margin; x += 4) {
    for (let z = -size + margin; z <= size - margin; z += 4) {
      let plains = 0;
      for (let dx = -8; dx <= 8; dx += 4) for (let dz = -8; dz <= 8; dz += 4) {
        if (biomeIdAt(x + dx, z + dz, seed) === "plains") plains += 1;
      }
      // Plains coverage dominates; the hash prevents every seed using one spot.
      const score = plains * 100 - Math.abs(x) - Math.abs(z) + hash(x, z, seed) * 5;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  return best && { x: best.x, z: best.z };
}

/**
 * Adds a compact four-house settlement after terrain generation. Roads and
 * plaza are at ground level, so all homes remain accessible and editable with
 * the same normal world `set`/`remove` operations as player blocks.
 */
export function addVillage(
  world: VoxelWriter,
  seed: number,
  size: number,
  terrainHeightAt: (x: number, z: number) => number,
): VillageLayout | undefined {
  const site = villageSite(seed, size);
  if (!site) return undefined;

  const heights: number[] = [];
  for (let x = site.x - 11; x <= site.x + 11; x += 1) {
    for (let z = site.z - 11; z <= site.z + 11; z += 1) heights.push(terrainHeightAt(x, z));
  }
  const baseY = Math.max(2, Math.min(18, Math.round(heights.reduce((sum, height) => sum + height, 0) / heights.length)));
  const roadKeys = new Set<string>();
  const plazaKeys = new Set<string>();

  // Level the whole settlement footprint, removing trees and water above the
  // resulting ground. Existing terrain below it stays untouched.
  for (let x = site.x - 11; x <= site.x + 11; x += 1) {
    for (let z = site.z - 11; z <= site.z + 11; z += 1) {
      const terrainY = terrainHeightAt(x, z);
      for (let y = baseY + 1; y <= 24; y += 1) world.remove({ x, y, z });
      for (let y = terrainY + 1; y < baseY; y += 1) world.set({ x, y, z }, "dirt");
      world.set({ x, y: baseY, z }, "grass");
    }
  }

  for (let offset = -11; offset <= 11; offset += 1) {
    roadKeys.add(key(site.x + offset, site.z));
    roadKeys.add(key(site.x, site.z + offset));
  }
  // Four short spurs make each front door lead back to the central road grid.
  for (const x of [site.x - 7, site.x + 7]) {
    for (let z = site.z - 5; z <= site.z; z += 1) roadKeys.add(key(x, z));
    for (let z = site.z; z <= site.z + 5; z += 1) roadKeys.add(key(x, z));
  }
  for (let x = site.x - 3; x <= site.x + 3; x += 1) for (let z = site.z - 3; z <= site.z + 3; z += 1) {
    plazaKeys.add(key(x, z));
  }
  roadKeys.forEach((position) => {
    const [x, z] = position.split(",").map(Number);
    world.set({ x, y: baseY, z }, "dirt");
  });
  plazaKeys.forEach((position) => {
    const [x, z] = position.split(",").map(Number);
    world.set({ x, y: baseY, z }, "bricks");
  });

  const houses: VillageHouseAnchor[] = [];
  const createHouse = (id: string, x: number, z: number, doorDx: number, doorDz: number): void => {
    for (let dx = -2; dx <= 2; dx += 1) for (let dz = -2; dz <= 2; dz += 1) {
      world.set({ x: x + dx, y: baseY + 1, z: z + dz }, "planks");
    }
    for (let y = baseY + 2; y <= baseY + 4; y += 1) {
      for (let dx = -2; dx <= 2; dx += 1) for (let dz = -2; dz <= 2; dz += 1) {
        if (Math.abs(dx) !== 2 && Math.abs(dz) !== 2) continue;
        world.set({ x: x + dx, y, z: z + dz }, "planks");
      }
    }
    const door = { x: x + doorDx * 2, y: baseY + 2, z: z + doorDz * 2 };
    world.set(door, "door");
    world.set({ ...door, y: door.y + 1 }, "door");
    // Side windows make the exterior visibly distinct without obstructing entry.
    const windowX = doorDx === 0 ? x + 2 : x;
    const windowZ = doorDz === 0 ? z + 2 : z;
    world.set({ x: windowX, y: baseY + 3, z: windowZ }, "glass");
    for (let dx = -3; dx <= 3; dx += 1) for (let dz = -3; dz <= 3; dz += 1) {
      world.set({ x: x + dx, y: baseY + 5, z: z + dz }, "bricks");
    }
    houses.push({
      id,
      door,
      entrance: { x: door.x + doorDx, y: baseY + 1, z: door.z + doorDz },
      interior: { x, y: baseY + 2, z },
    });
  };

  createHouse("north-west", site.x - 7, site.z - 7, 0, 1);
  createHouse("north-east", site.x + 7, site.z - 7, 0, 1);
  createHouse("south-west", site.x - 7, site.z + 7, 0, -1);
  createHouse("south-east", site.x + 7, site.z + 7, 0, -1);

  return {
    center: { x: site.x, y: baseY + 1, z: site.z },
    plaza: [...plazaKeys].map((position) => {
      const [x, z] = position.split(",").map(Number);
      return { x, y: baseY, z };
    }),
    roads: [...roadKeys].filter((position) => !plazaKeys.has(position)).map((position) => {
      const [x, z] = position.split(",").map(Number);
      return { x, y: baseY, z };
    }),
    houses,
  };
}
