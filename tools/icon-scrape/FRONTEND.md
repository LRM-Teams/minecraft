# Frontend integration (icons)

## Ship path (LRM-1602)

Production / GitHub Pages must use **distributable only**:

```bash
python3 tools/icon-scrape/gen_distributable.py   # needs Pillow
```

Outputs:

- `assets/icons/cache/distributable/<item_id>.png`
- `assets/icons/atlas.png` + `atlas.json`
- `assets/icons/mapping.json` (`bucket: "distributable"`, `license: "cc0-original-procedural"`)
- `assets/icons/licenses/DISTRIBUTABLE.md` + `ATTRIBUTION.md`

`src/icons.ts` globs **only** `cache/distributable/**` and imports `atlas.png` —
`cache/restricted/` is never in the Vite graph.

## Mapping

```ts
import { iconFor, iconAtlasFrame, iconAtlasUrl, iconLabel } from "./icons";

iconFor("grass");        // → Vite URL under cache/distributable/
iconAtlasFrame("grass"); // → { x, y, w, h, u, v, u2, v2 }
iconAtlasUrl();          // → atlas.png URL
```

## Atlas vs single images

- **HUD / hotbar:** `iconFor(itemId)` (single PNG).
- **Batch / sprites:** `iconAtlasFrame` UV on `atlas.png`.
- Do **not** hotlink wiki CDN. Do **not** import `cache/restricted/`.

## License gate

```ts
if (row.bucket !== "distributable") {
  // Must not ship — restricted is local scrape reference only.
}
```
