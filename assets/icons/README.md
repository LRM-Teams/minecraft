# assets/icons

## Ship / Pages (canonical)

```bash
python3 tools/icon-scrape/gen_distributable.py
```

```
cache/distributable/   # CC0 original procedural 16×16 PNGs
atlas.png / atlas.json # packed atlas + UV frames
mapping.json           # itemId → distributable texture + atlas UV
licenses/DISTRIBUTABLE.md
licenses/ATTRIBUTION.md
```

## Reference-only (not shipped)

```
cache/restricted/      # wiki Mojang-derived — local scrape only
cache/unknown/         # unresolved license stubs
```

From `tools/icon-scrape/collect.py`. Vite never imports these paths.
Do not copy restricted bytes into `distributable/` — regenerate with
`gen_distributable.py`.
