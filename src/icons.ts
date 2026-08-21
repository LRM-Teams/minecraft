import mappingJson from "../assets/icons/mapping.json";
import atlasMetaJson from "../assets/icons/atlas.json";
import atlasUrl from "../assets/icons/atlas.png?url";

export type IconBucket = "distributable" | "restricted" | "unknown";

export type AtlasFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  u: number;
  v: number;
  u2: number;
  v2: number;
  texture?: string;
};

export type IconRow = {
  texture: string | null;
  icon_url: string | null;
  license: string;
  bucket: IconBucket;
  zh_name: string;
  en_name: string;
  atlas?: AtlasFrame;
};

type MappingFile = {
  schema_version: number;
  ship_bucket?: IconBucket;
  atlas?: { texture: string; meta: string; license: string; core_ids: string[] };
  items: Record<string, IconRow>;
};

type AtlasFile = {
  schema_version: number;
  cell: number;
  width: number;
  height: number;
  texture: string;
  frames: Record<string, AtlasFrame>;
};

const mapping = mappingJson as MappingFile;
const atlasMeta = atlasMetaJson as AtlasFile;

/** Vite-resolved URLs — distributable only (Pages must never pull restricted). */
const iconUrlByRel = import.meta.glob("../assets/icons/cache/distributable/*.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const relKey = (texture: string): string =>
  `../assets/icons/${texture.replace(/^\/+/, "")}`;

/**
 * Resolve a HUD/world icon for an item id.
 * Production default: distributable only (`allowRestricted` defaults false).
 */
export const iconFor = (
  itemId: string,
  options: { allowRestricted?: boolean } = {},
): string | null => {
  const allowRestricted = options.allowRestricted ?? false;
  const row = mapping.items[itemId];
  if (!row || row.bucket === "unknown") return null;
  if (row.bucket === "restricted") return null; // never in Vite graph
  if (!allowRestricted && row.bucket !== "distributable") return null;
  if (row.texture) {
    const url = iconUrlByRel[relKey(row.texture)];
    if (url) return url;
  }
  return null;
};

/** Stable ship atlas URL (all catalog frames packed). */
export const iconAtlasUrl = (): string => atlasUrl;

export const iconAtlasFrame = (itemId: string): AtlasFrame | null =>
  atlasMeta.frames[itemId] ?? mapping.items[itemId]?.atlas ?? null;

export const iconMeta = (itemId: string): IconRow | null =>
  mapping.items[itemId] ?? null;

/** Wiki-aligned display name (zh preferred) — labels only. */
export const iconLabel = (itemId: string, fallback: string): string =>
  mapping.items[itemId]?.zh_name ?? fallback;

export const isDistributableIcon = (itemId: string): boolean =>
  mapping.items[itemId]?.bucket === "distributable";

export const listMappedItemIds = (): string[] => Object.keys(mapping.items);

export const listShipCoreIds = (): string[] =>
  mapping.atlas?.core_ids ?? Object.keys(atlasMeta.frames);

export const shipUsesDistributableOnly = (): boolean =>
  Object.values(mapping.items).every(
    (row) => row.bucket === "distributable" && row.license === "cc0-original-procedural",
  );
