/**
 * Graphics / streaming presets for mid-range browsers (LRM-1613).
 * Default is `balanced`: playable without main-thread freezes from full mesh rebuilds + soft shadows.
 *
 * Override: `?perf=performance|balanced|quality` or localStorage `voxel-atelier-perf`.
 */

export type PerfPresetId = "performance" | "balanced" | "quality";

export type PerfConfig = {
  id: PerfPresetId;
  label: string;
  /** Chunks streamed via `ensureAround`. */
  streamChunkRadius: number;
  /** Chunks meshed around the player (square radius). */
  meshChunkRadius: number;
  /** Max new terrain chunks generated per frame via ensureAround. */
  maxChunkGensPerFrame: number;
  /** Max chunk mesh builds (create InstancedMesh) per animation frame. */
  maxChunkBuildsPerFrame: number;
  /** Directional + terrain shadow maps. */
  shadowsEnabled: boolean;
  shadowMapSize: number;
  /** Soft PCF only when quality; otherwise BasicShadowMap when shadows on. */
  softShadows: boolean;
  /** Terrain InstancedMesh castShadow (leaves/fixtures always off). */
  terrainCastShadow: boolean;
  terrainReceiveShadow: boolean;
  /** Point lights for nearby torches. */
  maxTorchLights: number;
  torchSearchRadius: number;
  /** Throttle torch light position scans. */
  torchSyncEveryMs: number;
  /** devicePixelRatio cap. */
  maxPixelRatio: number;
  /**
   * Single MeshBasicMaterial per bucket (1 draw/mesh) instead of 6-face Lambert.
   * Huge SwiftShader win; torch point lights no longer shade terrain.
   */
  simpleBlockMaterials: boolean;
  /** Cloud billboards + star field (expensive Points + transparent meshes). */
  skyDecor: boolean;
  /** How often to refresh sun/moon/sky uniforms (ms). */
  skySyncEveryMs: number;
};

export const PERF_PRESETS: Record<PerfPresetId, PerfConfig> = {
  performance: {
    id: "performance",
    label: "性能",
    streamChunkRadius: 1,
    meshChunkRadius: 1,
    maxChunkGensPerFrame: 1,
    maxChunkBuildsPerFrame: 1,
    shadowsEnabled: false,
    shadowMapSize: 512,
    softShadows: false,
    terrainCastShadow: false,
    terrainReceiveShadow: false,
    maxTorchLights: 2,
    torchSearchRadius: 14,
    torchSyncEveryMs: 320,
    maxPixelRatio: 1,
    simpleBlockMaterials: true,
    skyDecor: false,
    skySyncEveryMs: 250,
  },
  balanced: {
    id: "balanced",
    label: "均衡",
    streamChunkRadius: 1,
    meshChunkRadius: 1,
    maxChunkGensPerFrame: 1,
    maxChunkBuildsPerFrame: 1,
    shadowsEnabled: false,
    shadowMapSize: 512,
    softShadows: false,
    terrainCastShadow: false,
    terrainReceiveShadow: false,
    maxTorchLights: 2,
    torchSearchRadius: 16,
    torchSyncEveryMs: 280,
    maxPixelRatio: 1,
    simpleBlockMaterials: true,
    skyDecor: false,
    skySyncEveryMs: 200,
  },
  quality: {
    id: "quality",
    label: "画质",
    streamChunkRadius: 3,
    meshChunkRadius: 2,
    maxChunkGensPerFrame: 2,
    maxChunkBuildsPerFrame: 2,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    softShadows: true,
    terrainCastShadow: true,
    terrainReceiveShadow: true,
    maxTorchLights: 14,
    torchSearchRadius: 28,
    torchSyncEveryMs: 100,
    maxPixelRatio: 2,
    simpleBlockMaterials: false,
    skyDecor: true,
    skySyncEveryMs: 33,
  },
};

const STORAGE_KEY = "voxel-atelier-perf";

export const isPerfPresetId = (value: string): value is PerfPresetId =>
  value === "performance" || value === "balanced" || value === "quality";

/** Resolve preset from URL query, then localStorage, else balanced. */
export const resolvePerfPreset = (
  search = typeof location !== "undefined" ? location.search : "",
  storage?: Pick<Storage, "getItem"> | null,
): PerfConfig => {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const fromQuery = params.get("perf") ?? "";
  if (isPerfPresetId(fromQuery)) return PERF_PRESETS[fromQuery];
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    const saved = store?.getItem(STORAGE_KEY) ?? "";
    if (isPerfPresetId(saved)) return PERF_PRESETS[saved];
  } catch {
    /* private mode */
  }
  return PERF_PRESETS.balanced;
};

export const persistPerfPreset = (id: PerfPresetId, storage?: Pick<Storage, "setItem"> | null): void => {
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    store?.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
};

/** Cycle performance → balanced → quality → performance. */
export const nextPerfPreset = (current: PerfPresetId): PerfPresetId => {
  if (current === "performance") return "balanced";
  if (current === "balanced") return "quality";
  return "performance";
};

export const chunkIdOf = (cx: number, cz: number): string => `${cx},${cz}`;

export const parseChunkId = (id: string): { cx: number; cz: number } => {
  const [cx, cz] = id.split(",").map(Number);
  return { cx, cz };
};
