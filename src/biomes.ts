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

/** Identifiable biomes. At least 3 are required by the acceptance criteria. */
export const BIOMES = ["plains", "forest", "desert", "mountains", "pale", "cherry"] as const;
export type BiomeId = (typeof BIOMES)[number];

/** Optional render-hint palette for a biome. Kept module-internal so we never
 *  add new `BlockType` enum members (which would break save compatibility):
 *  pale trunks/foliage, cherry blossom petals and the pale garden's glowing
 *  mushrooms are all *tints* over the existing storage blocks, applied only
 *  when rendering — stored blocks stay `wood`/`leaves` in every snapshot. */
export interface BiomePalette {
  /** Foliage tint (hex). Omit to use the global leaf colour. */
  foliage?: number;
  /** Trunk tint (hex) for `wood` placed by this biome's trees. */
  trunk?: number;
  /** Surface tint (hex) — cherry gives its ground a pink petal cast. */
  surfaceTint?: number;
  /** Pale garden's glowing mushrooms (module-internal structure). */
  glowingMushroom?: boolean;
}

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
  /** Palette render hints (all optional, module-internal colour/materials). */
  palette?: BiomePalette;
  /** Tree silhouette this biome spawns (affects `world.addTree`). */
  treeShape?: "oak" | "pale" | "cherry";
}

/** Ordered registry. `index ↔ id` must stay stable for a given seed. */
const PROFILES: Record<BiomeId, BiomeProfile> = {
  plains: {
    id: "plains", name: "平原", baseHeight: 5, amplitude: 1.3, roughness: 0.9,
    surface: "grass", subsurface: "dirt", underground: "stone", seaLevel: 3,
    treeThreshold: 0.965, aquatic: true,
  },
  forest: {
    id: "forest", name: "森林", baseHeight: 6, amplitude: 1.6, roughness: 1.15,
    surface: "grass", subsurface: "dirt", underground: "stone", seaLevel: 3,
    treeThreshold: 0.55, aquatic: true,
  },
  desert: {
    id: "desert", name: "沙漠", baseHeight: 6, amplitude: 1.2, roughness: 0.7,
    surface: "sand", subsurface: "sand", underground: "stone", seaLevel: 1,
    treeThreshold: 1, aquatic: false,
  },
  mountains: {
    id: "mountains", name: "山地", baseHeight: 12, amplitude: 3.2, roughness: 1.8,
    surface: "grass", subsurface: "stone", underground: "stone", seaLevel: 3,
    treeThreshold: 0.985, aquatic: true,
  },
  // Original Phase-3 biome: a gloomy grey-white garden with pale trees and
  // faintly glowing mushrooms. Cool & moist climate niche.
  pale: {
    id: "pale", name: "苍白花园", baseHeight: 5, amplitude: 1.1, roughness: 0.85,
    surface: "grass", subsurface: "dirt", underground: "stone", seaLevel: 3,
    treeThreshold: 0.88, aquatic: true, treeShape: "pale",
    palette: { foliage: 0x9aa7ad, trunk: 0xb3b9bd, surfaceTint: 0x6f7a80, glowingMushroom: true },
  },
  // Original Phase-3 biome: warm pink cherry-blossom groves with petal dust.
  cherry: {
    id: "cherry", name: "樱花", baseHeight: 5.5, amplitude: 1.3, roughness: 0.9,
    surface: "grass", subsurface: "dirt", underground: "stone", seaLevel: 3,
    treeThreshold: 0.78, aquatic: true, treeShape: "cherry",
    palette: { foliage: 0xf29db4, trunk: 0x7a4e43, surfaceTint: 0xe9b8c3 },
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
  if (moisture > 0.74) return "forest";      // wet → lush
  if (heat > 0.62 && moisture > 0.55) return "cherry";  // warm & damp → pink groves
  if (heat > 0.58) return "desert";           // hot & dry → sand
  if (heat < 0.34 && moisture > 0.5) return "pale";     // cool & moist → gloomy garden
  if (heat > 0.26 && moisture < 0.5) return "mountains"; // rugged highlands
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

/**
 * Module-internal palette lookup used by the renderer. Given a biome and a
 * stored block type, returns an optional display-tint colour (hex) that lets
 * pale/cherry biomes reproduce their signature look without introducing new
 * `BlockType` members. Returns `undefined` when the block keeps its stock tone.
 */
export const blockTint = (profile: BiomeProfile, block: string): number | undefined => {
  const palette = profile.palette;
  if (!palette) return undefined;
  if (block === "leaves") return palette.foliage;
  if (block === "wood") return palette.trunk;
  if (block === "grass") return palette.surfaceTint;
  return undefined;
};

/** True when a biome should render the pale garden's glowing mushroom flora. */
export const hasGlowingMushrooms = (profile: BiomeProfile): boolean =>
  profile.palette?.glowingMushroom === true;
