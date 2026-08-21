import mappingJson from "../assets/icons/mapping.json";

export type IconBucket = "distributable" | "restricted" | "unknown";

export type IconRow = {
  texture: string | null;
  icon_url: string | null;
  license: string;
  bucket: IconBucket;
  zh_name: string;
  en_name: string;
};

type MappingFile = {
  schema_version: number;
  items: Record<string, IconRow>;
};

const mapping = mappingJson as MappingFile;

/** Vite-resolved URLs for cached icons (png/webp only; no gif). */
const iconUrlByRel = import.meta.glob("../assets/icons/cache/{distributable,restricted}/*.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const relKey = (texture: string): string =>
  `../assets/icons/${texture.replace(/^\/+/, "")}`;

/**
 * Resolve a HUD/world icon for an item id.
 * - Prefer local cache (distributable or restricted preview).
 * - Never returns unknown-bucket textures.
 * - Restricted assets stay under cache/restricted (not distributable/).
 */
export const iconFor = (
  itemId: string,
  options: { allowRestricted?: boolean } = {},
): string | null => {
  const allowRestricted = options.allowRestricted ?? true;
  const row = mapping.items[itemId];
  if (!row || row.bucket === "unknown") return null;
  if (row.bucket === "restricted" && !allowRestricted) return null;
  if (row.texture) {
    const url = iconUrlByRel[relKey(row.texture)];
    if (url) return url;
  }
  return null;
};

export const iconMeta = (itemId: string): IconRow | null =>
  mapping.items[itemId] ?? null;

/** Wiki-aligned display name (zh preferred). */
export const iconLabel = (itemId: string, fallback: string): string =>
  mapping.items[itemId]?.zh_name ?? fallback;

export const isDistributableIcon = (itemId: string): boolean =>
  mapping.items[itemId]?.bucket === "distributable";

export const listMappedItemIds = (): string[] => Object.keys(mapping.items);
