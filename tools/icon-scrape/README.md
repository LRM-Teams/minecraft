# Icon / texture scrape (LRM-1595)

Collect reusable block/item icon metadata and local caches from
[中文 Minecraft Wiki](https://zh.minecraft.wiki/), prioritized for current game IDs
in `src/world.ts` / `src/items.ts`, plus a small set of wiki-common core blocks.

## Requirements

- Python 3.10+ (stdlib only — no pip packages)

## Run

From the repo root:

```bash
python3 tools/icon-scrape/collect.py
```

Useful flags:

```bash
python3 tools/icon-scrape/collect.py --skip-download   # catalog/URLs only
python3 tools/icon-scrape/collect.py --sleep 0.25      # gentler API pacing
python3 tools/icon-scrape/collect.py --limit 5         # debug subset
```

## Outputs (`assets/icons/`)

| Path | Purpose |
|---|---|
| `catalog.json` / `catalog.csv` | Structured inventory: id, zh/en names, category, wiki path, icon URL, source, license |
| `mapping.json` | `itemId → texture` for frontend wiring |
| `cache/distributable/` | **Only** clearly open-licensed art (empty by default) |
| `cache/restricted/` | Wiki Mojang-derived icons — local reference / attributed preview |
| `cache/unknown/` | Unresolved or unclear license (JSON stubs) |
| `licenses/ATTRIBUTION.md` | Per-item source + license table |
| `meta/<id>.json` | Download sha256 / size |

## License policy

Wiki inventory/block images **depict Mojang/Microsoft Minecraft assets**. This
pipeline records `license=restricted-mojang-via-wiki` and stores them under
`cache/restricted/`. Do **not** promote them into `distributable/` or ship them
as redistributable game content without separate clearance.

Unresolved icons use `license=unknown` and stay isolated under `cache/unknown/`.

Never drop unexplained vanilla client jar textures into the tree.

## Seed overrides

Edit `seed_catalog.json` to fix wiki titles / `File:` candidates when MediaWiki
naming differs from game IDs (e.g. `gold_*` → `Golden_*`, `cooked_beef` → `Steak`).

## Frontend notes

See `FRONTEND.md` in this directory.
