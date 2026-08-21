# Frontend integration (icons)

## Mapping

Load `assets/icons/mapping.json`:

```ts
type IconMap = Record<string, {
  texture: string | null;   // repo-relative, e.g. cache/restricted/grass.png
  icon_url: string | null;  // wiki CDN URL (attribution still required)
  license: string;
  bucket: "distributable" | "restricted" | "unknown";
  zh_name: string;
  en_name: string;
}>;
```

Resolve HUD / hotbar / inventory slots with `itemId → texture`:

```ts
import mapping from "../../assets/icons/mapping.json";

export function iconFor(itemId: string): string | null {
  const row = (mapping.items as IconMap)[itemId];
  if (!row || row.bucket === "unknown") return null;
  // Prefer local cache in Vite:
  return row.texture ? new URL(`../../assets/icons/${row.texture}`, import.meta.url).href : row.icon_url;
}
```

## Atlas vs single images

- **Phase 1 (this Issue):** single PNGs under `cache/restricted/` — simplest for Vite `import.meta.url` or static copy into `public/icons/`.
- **Phase 2:** pack a texture atlas (e.g. 16×16 cells) from `distributable/` only once legal clears; keep `mapping.json` pointing at atlas UV, not raw wiki URLs.
- Do **not** hotlink wiki CDN in production builds long-term (fragile + unclear redistribution). Local restricted cache is for prototyping “recognizable items”.

## Naming

Game IDs stay snake_case (`diamond_pickaxe`). Files are `cache/<bucket>/<item_id>.<ext>`.
`texture_key` in the catalog is `icons/<item_id>` for future atlas keys.

## License gate in UI code

```ts
if (row.bucket !== "distributable") {
  // OK for internal preview builds; gate public ships behind legal review.
}
```
