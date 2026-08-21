import type { BlockType } from "./world";

/**
 * Deterministic biome system for the voxel world.
 *
 * Pure TypeScript: no THREE, no render state, no I/O. Every function is a pure
 * function of (x, z, seed), so the same world seed always reproduces the exact
 * same biome layout and terrain. The world generator (`VoxelWorld.generate`)
 * consumes these per-column profiles to lay grass/sand/stone, water and trees.
 *
 * Biomes are placed on a low-frequency grid (cells of `BIOME_CELL` blocks) so
 * neighbouring regions blend through bilinear interpolation of their terrain
 * parameters — no hard cliff at biome borders. Block *choice* within a column
 * is derived from per-column hashes that are also seeded by `seed`, keeping the
 * whole world reproducible.
 */

export const BIOME_CELL = 24;

/** Identifiable biomes. Plains / desert / ocean are required by the rewrite AC. */
export const BIOMES = ["plains", "forest", "desert", "ocean", "mountains", "pale_garden", "sakura"] as const;
export type BiomeId = (typeof BIOMES)[number];

/**
 * Renderer tint key. New biomes must not add new `BlockType` values (that would
 * break save-slot compatibility), so visual differentiation is signalled here
 * and consumed by the renderer as a per-instance color wash. `default` means the
 * stock block colors are used unchanged.
 */
export type BiomeVariant = "default" | "pale" | "sakura";

/** Rules used to shape a column of terrain in a given biome. */
export interface BiomeProfile {
  id: BiomeId;
  name: string;
  /** Terrain height baseline (before per-column variation). */
  baseHeight: number;
  /** Vertical amplitude of the rolling terrain. */
  amplitude: number;
  /** How fast the terrain undulates across X/Z (higher = rockier). */
  roughness: number;
  /** Block placed on the exposed surface. */
  surface: BlockType;
  /** Block just under the surface (subsurface / dry sand dune core). */
  subsurface: BlockType;
  /** Deep underground fill. */
  underground: BlockType;
  /** Sea level used by this biome (water fills below it where no land). */
  seaLevel: number;
  /** Above this per-column tree-hash value a tree is spawned. */
  treeThreshold: number;
  /** Whether the biome floods low areas with water. */
  aquatic: boolean;
  /** Renderer tint key (default = stock block colors). */
  variant: BiomeVariant;
  /** Existing block scattered on the surface as flora (e.g. glowing shrooms/petals). */
  flowerBlock?: BlockType;
  /** 0..1 — a per-column hash above this places a `flowerBlock` on the surface. */
  flowerChance?: number;
}

/** Ordered registry. `index ↔ id` must stay stable for a given seed. */
const PROFILES: Record<BiomeId, BiomeProfile> = {
  plains: {
    id: "plains", name: "平原", baseHeight: 5, amplitude: 1.3, roughness: 0.9,
    surface: "grass", subsurface: "dirt", underground: "stone", seaLevel: 3,
    treeThreshold: 0.965, aquatic: true, variant: "default",
  },
  forest: {
    id: "forest", name: "森林", baseHeight: 6, amplitude: 1.6, roughness: 1.15,
    surface: "grass", subsurface: "dirt", underground: "stone", seaLevel: 3,
    treeThreshold: 0.55, aquatic: true, variant: "default",
  },
  desert: {
    id: "desert", name: "沙漠", baseHeight: 6, amplitude: 1.2, roughness: 0.7,
    surface: "sand", subsurface: "sand", underground: "stone", seaLevel: 1,
    treeThreshold: 1, aquatic: false, variant: "default",
  },
  // 海洋 Ocean: deep flooded basins with sand floors — distinct from shallow plains ponds.
  ocean: {
    id: "ocean", name: "海洋", baseHeight: 1, amplitude: 0.5, roughness: 0.45,
    surface: "sand", subsurface: "sand", underground: "stone", seaLevel: 7,
    treeThreshold: 1, aquatic: true, variant: "default",
  },
  mountains: {
    id: "mountains", name: "山地", baseHeight: 12, amplitude: 3.2, roughness: 1.8,
    surface: "grass", subsurface: "stone", underground: "stone", seaLevel: 3,
    treeThreshold: 0.985, aquatic: true, variant: "default",
  },
  // 苍白花园 Pale Garden: cool, damp and eerie — pale/grey-washed trees, dark
  // grass and glowing mushrooms scattered on the surface.
  pale_garden: {
    id: "pale_garden", name: "苍白花园", baseHeight: 6, amplitude: 1.4, roughness: 1.1,
    surface: "grass", subsurface: "dirt", underground: "stone", seaLevel: 3,
    treeThreshold: 0.6, aquatic: true, variant: "pale", flowerBlock: "planks", flowerChance: 0.55,
  },
  // 樱花 Sakura: mild-damp cherry blossom woodlands — pink-tinted trees and a
  // pink petal detritus on the forest floor.
  sakura: {
    id: "sakura", name: "樱花林", baseHeight: 6, amplitude: 1.5, roughness: 1.05,
    surface: "grass", subsurface: "dirt", underground: "stone", seaLevel: 3,
    treeThreshold: 0.58, aquatic: true, variant: "sakura", flowerBlock: "planks", flowerChance: 0.5,
  },
};

const BIOME_IDS: BiomeId[] = BIOMES.slice();

/** Deterministic 0..1 hash of integer coordinates. */
const hash = (a: number, b: number, c = 0): number => {
  const value = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + (a * b * 0.3182)) * 43758.5453;
  return value - Math.floor(value);
};

/** Smooth 0..1 step used to blend between neighbouring biome cells. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Which biome owns a given cell in the coarse biome grid. */
const biomeForCell = (cx: number, cz: number, seed: number): BiomeId => {
  // Two correlated noises place each cell in a 2D climate patch, guaranteeing
  // several distinct, bordered regions per world while staying reproducible.
  const heat = hash(cx, cz, seed * 101 + 7);
  const moisture = hash(cx * 2 + 13, cz * 3 - 5, seed * 33 + 1);
  if (moisture > 0.78) return "ocean";        // deepest wet → open ocean
  if (moisture > 0.62) return "forest";       // wet → lush forest
  if (moisture > 0.48) {
    // Damp but not flooded: cool → pale/eerie garden, mild → cherry blossom.
    return heat < 0.3 ? "pale_garden" : "sakura";
  }
  if (heat > 0.62 && moisture < 0.4) return "desert"; // hot & dry → sand
  if (heat > 0.32 && moisture < 0.38) return "mountains"; // dry highlands
  return "plains";
};

/** Blend helper for two 4-tuples of neighbouring cell biomes. */
interface Neighbourhood {
  tl: BiomeId; tr: BiomeId; bl: BiomeId; br: BiomeId;
}

const neighbourhood = (cx: number, cz: number, seed: number): Neighbourhood => ({
  tl: biomeForCell(cx, cz, seed),
  tr: biomeForCell(cx + 1, cz, seed),
  bl: biomeForCell(cx, cz + 1, seed),
  br: biomeForCell(cx + 1, cz + 1, seed),
});

/**
 * Resolve the effective biome for a world column. The returned profile is the
 * dominant of the up-to-four surrounding biome cells (no terrain discontinuity).
 */
export function biomeAt(x: number, z: number, seed: number): BiomeProfile {
  const cx = Math.floor(x / BIOME_CELL);
  const cz = Math.floor(z / BIOME_CELL);
  const fx = smooth((x - cx * BIOME_CELL) / BIOME_CELL);
  const fz = smooth((z - cz * BIOME_CELL) / BIOME_CELL);
  const cells = Object.values(neighbourhood(cx, cz, seed));
  // Weight each candidate by its distance, then pick the nearest biome id.
  const candidates: { id: BiomeId; d: number }[] = [
    { id: cells[0], d: (1 - fx) * (1 - fz) },
    { id: cells[1], d: fx * (1 - fz) },
    { id: cells[2], d: (1 - fx) * fz },
    { id: cells[3], d: fx * fz },
  ];
  // Tie-break deterministically toward the lowest index.
  candidates.sort((a, b) => b.d - a.d || BIOME_IDS.indexOf(a.id) - BIOME_IDS.indexOf(b.id));
  return PROFILES[candidates[0].id];
}

export function biomeIdAt(x: number, z: number, seed: number): BiomeId {
  return biomeAt(x, z, seed).id;
}

/** Renderer tint key for a column (shorthand for `biomeAt(x,z,seed).variant`). */
export function biomeVariantAt(x: number, z: number, seed: number): BiomeVariant {
  return biomeAt(x, z, seed).variant;
}

/** Ordered list of every distinct biome id reachable for a seed (diagnostics). */
export function biomesForSeed(seed: number, span = BIOME_CELL * 6): Set<BiomeId> {
  const found = new Set<BiomeId>();
  for (let x = -span; x <= span; x += BIOME_CELL / 2) {
    for (let z = -span; z <= span; z += BIOME_CELL / 2) found.add(biomeIdAt(x, z, seed));
  }
  return found;
}

/** Regenerate a deterministic world id for a seed from the biome perspective. */
export const describeColumn = (
  x: number, z: number, seed: number,
): { biome: BiomeId; profile: BiomeProfile; treeChance: number; height: number } => {
  const profile = biomeAt(x, z, seed);
  const rolling =
    Math.sin((x + seed) * 0.19 * profile.roughness) * profile.amplitude +
    Math.cos((z - seed) * 0.17 * profile.roughness) * profile.amplitude * 0.9;
  const height = Math.round(profile.baseHeight + rolling);
  const treeChance = hash(x * 3 + seed, z * 5 - seed * 2);
  return { biome: profile.id, profile, treeChance, height };
};
