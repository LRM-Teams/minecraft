# Icon / texture scrape (LRM-1595) + ship atlas (LRM-1602)

## Wiki scrape (reference only)

Collect reusable block/item icon metadata and local caches from
[中文 Minecraft Wiki](https://zh.minecraft.wiki/), prioritized for current game IDs
in `src/world.ts` / `src/items.ts`.

```bash
python3 tools/icon-scrape/collect.py                 # stdlib only
python3 tools/icon-scrape/collect.py --skip-download
python3 tools/icon-scrape/collect.py --limit 5
```

Wiki downloads land in `cache/restricted/` (`restricted-mojang-via-wiki`) and are
**not** shippable.

## Ship icons (distributable + atlas)

Original CC0 procedural 16×16 icons for **every catalog item_id** (core
`BLOCK_TYPES` plus tools/armor/items), packed into one atlas (requires Pillow):

```bash
python3 tools/icon-scrape/gen_distributable.py
```

Writes:

- `assets/icons/cache/distributable/<id>.png` (full catalog)
- `assets/icons/atlas.png` + `atlas.json` (all frames; `core_ids` = BLOCK_TYPES)
- updates `mapping.json` (`bucket: distributable`, `license: cc0-original-procedural`)
- `assets/icons/licenses/DISTRIBUTABLE.md` + short `ATTRIBUTION.md`

Vite / Pages import **only** distributable + atlas (see `FRONTEND.md`).

## Outputs (`assets/icons/`)

| Path | Purpose |
|---|---|
| `catalog.json` / `catalog.csv` | Structured inventory from wiki scrape |
| `mapping.json` | `itemId → texture / bucket / optional atlas UV` |
| `cache/distributable/` | CC0 original procedural PNGs (ship-ready) |
| `atlas.png` + `atlas.json` | Packed atlas + UV frames (full catalog; `core_ids` listed) |
| `cache/restricted/` | Wiki Mojang-derived — local reference only |
| `cache/unknown/` | Unresolved license stubs |
| `licenses/DISTRIBUTABLE.md` | Per-item ship license table |
| `licenses/ATTRIBUTION.md` | Wiki scrape attribution (reference) |

## License policy

Do **not** copy `restricted/` bytes into `distributable/`. Regenerate originals
with `gen_distributable.py` instead. Never drop vanilla client jar textures into
the tree.

## Frontend notes

See `FRONTEND.md` in this directory.
