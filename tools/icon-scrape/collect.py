#!/usr/bin/env python3
"""Collect Minecraft item/block icons + metadata from zh.minecraft.wiki.

Outputs under assets/icons/:
  catalog.json / catalog.csv  — structured inventory
  mapping.json                — itemId → texture path / URL
  cache/{distributable,restricted,unknown}/ — local downloads by license bucket
  licenses/ATTRIBUTION.md     — source & license notes

Stdlib only. Re-runnable; skips unchanged downloads when etag/size match.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

API = "https://zh.minecraft.wiki/api.php"
UA = "LRM-1595-icon-collector/1.0 (+https://github.com/LRM-Teams/minecraft; educational scrape)"
SOURCE = "https://zh.minecraft.wiki/"
# Wiki-hosted Minecraft inventory / block renders reproduce Mojang IP.
# Safe for local reference; treat as non-redistributable until legal clears.
LICENSE_WIKI_MOJANG = "restricted-mojang-via-wiki"
LICENSE_UNKNOWN = "unknown"

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "assets" / "icons"
SEED_PATH = Path(__file__).resolve().parent / "seed_catalog.json"


def api(params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(
        f"{API}?{query}",
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.load(resp)


def parse_game_ids(repo: Path) -> tuple[list[str], dict[str, str]]:
    """Read BLOCK_TYPES / EXTRA_ITEMS / ITEM_LABELS from TypeScript sources."""
    world = (repo / "src" / "world.ts").read_text(encoding="utf-8")
    items = (repo / "src" / "items.ts").read_text(encoding="utf-8")
    block_m = re.search(r"export const BLOCK_TYPES = \[([^\]]+)\]", world)
    extra_m = re.search(r"export const EXTRA_ITEMS = \[([^\]]+)\]", items, re.S)
    if not block_m or not extra_m:
        raise SystemExit("Failed to parse BLOCK_TYPES / EXTRA_ITEMS from src/")
    ids = re.findall(r'"([a-z0-9_]+)"', block_m.group(1)) + re.findall(
        r'"([a-z0-9_]+)"', extra_m.group(1)
    )
    labels: dict[str, str] = {}
    for m in re.finditer(r"^\s*([a-z0-9_]+):\s*\"([^\"]+)\"", items, re.M):
        labels[m.group(1)] = m.group(2)
    # stable unique
    seen: set[str] = set()
    ordered: list[str] = []
    for i in ids:
        if i not in seen:
            seen.add(i)
            ordered.append(i)
    return ordered, labels


def title_case_id(item_id: str) -> str:
    parts = item_id.split("_")
    # gold_* tools/armor → Golden in Minecraft naming
    if parts and parts[0] == "gold" and len(parts) > 1:
        parts = ["golden", *parts[1:]]
    return " ".join(p.capitalize() for p in parts)


def file_from_en(en_name: str) -> str:
    return en_name.replace(" ", "_") + ".png"


def resolve_file_url(filename: str) -> tuple[str | None, str | None]:
    """Return (url, file_page_title) for File:filename."""
    data = api(
        {
            "action": "query",
            "titles": f"File:{filename}",
            "prop": "imageinfo",
            "iiprop": "url|mime|size|sha1",
        }
    )
    page = next(iter(data["query"]["pages"].values()))
    if "missing" in page or "imageinfo" not in page:
        return None, None
    info = page["imageinfo"][0]
    return info.get("url"), page.get("title")


def resolve_pageimage(wiki_title: str) -> tuple[str | None, str | None]:
    data = api(
        {
            "action": "query",
            "titles": wiki_title,
            "prop": "pageimages|info",
            "piprop": "original|name",
            "inprop": "url",
        }
    )
    page = next(iter(data["query"]["pages"].values()))
    if "missing" in page:
        return None, None
    original = page.get("original") or {}
    return original.get("source"), page.get("fullurl") or page.get("canonicalurl")


def page_url(wiki_title: str) -> str:
    return f"{SOURCE}w/{urllib.parse.quote(wiki_title.replace(' ', '_'))}"


def license_bucket(license_id: str) -> str:
    if license_id == LICENSE_UNKNOWN:
        return "unknown"
    if license_id.startswith("restricted") or license_id == LICENSE_WIKI_MOJANG:
        return "restricted"
    if license_id in {"cc0", "cc-by", "cc-by-sa", "public-domain", "apache-2.0", "mit"}:
        return "distributable"
    return "unknown"


def download(url: str, dest: Path) -> dict[str, Any]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        ctype = resp.headers.get("Content-Type", "")
    dest.write_bytes(data)
    return {
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "content_type": ctype,
    }


def build_entries(
    game_ids: list[str],
    labels: dict[str, str],
    seed: dict[str, Any],
) -> list[dict[str, Any]]:
    overrides: dict[str, Any] = seed.get("items") or {}
    entries: list[dict[str, Any]] = []

    for item_id in game_ids:
        ov = overrides.get(item_id) or {}
        zh = ov.get("zh_name") or labels.get(item_id) or item_id
        en = ov.get("en_name") or title_case_id(item_id)
        cat = ov.get("category") or guess_category(item_id)
        wiki_title = ov.get("wiki_title") or zh
        files = list(ov.get("file_candidates") or [])
        files.append(file_from_en(en))
        # de-dupe preserve order
        seen_f: set[str] = set()
        file_candidates = []
        for f in files:
            if f not in seen_f:
                seen_f.add(f)
                file_candidates.append(f)
        entries.append(
            {
                "item_id": item_id,
                "zh_name": zh,
                "en_name": en,
                "category": cat,
                "wiki_title": wiki_title,
                "file_candidates": file_candidates,
                "in_game": True,
            }
        )

    for extra in seed.get("wiki_core_extra") or []:
        eid = extra["item_id"]
        if any(e["item_id"] == eid for e in entries):
            continue
        en = extra.get("en_name") or title_case_id(eid)
        files = list(extra.get("file_candidates") or [file_from_en(en)])
        entries.append(
            {
                "item_id": eid,
                "zh_name": extra.get("zh_name") or extra.get("wiki_title") or eid,
                "en_name": en,
                "category": extra.get("category") or "block",
                "wiki_title": extra.get("wiki_title") or extra.get("zh_name") or eid,
                "file_candidates": files,
                "in_game": bool(extra.get("in_game", False)),
            }
        )
    return entries


def guess_category(item_id: str) -> str:
    if item_id.endswith(("_pickaxe", "_axe", "_shovel", "_sword", "_hoe")):
        return "tool"
    if item_id.endswith(("_helmet", "_chestplate", "_leggings", "_boots")):
        return "armor"
    if item_id.startswith("potion_") or item_id.endswith("_bottle") or "potion" in item_id:
        return "potion"
    if item_id in {"apple", "bread", "wheat", "raw_beef", "cooked_beef"}:
        return "food"
    if item_id.endswith("_ore"):
        return "ore"
    return "item"


def collect_one(entry: dict[str, Any], sleep_s: float) -> dict[str, Any]:
    item_id = entry["item_id"]
    wiki_title = entry["wiki_title"]
    icon_url: str | None = None
    file_title: str | None = None
    resolve_method = "none"
    wiki_path = page_url(wiki_title)

    # 1) explicit File: candidates
    for cand in entry["file_candidates"]:
        url, ftitle = resolve_file_url(cand)
        time.sleep(sleep_s)
        if url:
            icon_url, file_title, resolve_method = url, ftitle, f"file:{cand}"
            break

    # 2) pageimages free/original
    if not icon_url:
        url, _ = resolve_pageimage(wiki_title)
        time.sleep(sleep_s)
        if url:
            icon_url, resolve_method = url, "pageimages"

    license_id = LICENSE_WIKI_MOJANG if icon_url else LICENSE_UNKNOWN
    note = (
        "Icon hosted on zh.minecraft.wiki; depicts Mojang/Microsoft Minecraft assets. "
        "Local cache for reference only — do not ship as redistributable game content "
        "without separate clearance. Wiki text contributions are typically CC BY-NC-SA; "
        "asset IP remains with Mojang."
        if icon_url
        else "No icon URL resolved; left as unknown."
    )

    return {
        "item_id": item_id,
        "zh_name": entry["zh_name"],
        "en_name": entry["en_name"],
        "category": entry["category"],
        "in_game": entry["in_game"],
        "wiki_title": wiki_title,
        "wiki_path": wiki_path,
        "wiki_file": file_title,
        "icon_url": icon_url,
        "resolve_method": resolve_method,
        "source": SOURCE,
        "license": license_id,
        "distributable": False,
        "license_note": note,
    }


def write_outputs(out_dir: Path, rows: list[dict[str, Any]], downloaded: dict[str, str]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "cache" / "distributable").mkdir(parents=True, exist_ok=True)
    (out_dir / "cache" / "restricted").mkdir(parents=True, exist_ok=True)
    (out_dir / "cache" / "unknown").mkdir(parents=True, exist_ok=True)
    (out_dir / "licenses").mkdir(parents=True, exist_ok=True)
    (out_dir / "meta").mkdir(parents=True, exist_ok=True)

    for row in rows:
        local = downloaded.get(row["item_id"])
        row["local_path"] = local
        row["texture_key"] = f"icons/{row['item_id']}"

    catalog = {
        "schema_version": 1,
        "source_primary": SOURCE,
        "generated_by": "tools/icon-scrape/collect.py",
        "license_policy": {
            "distributable": "Only assets with explicit open licenses (cc0/cc-by/…). Empty until cleared.",
            "restricted": "Wiki Mojang-derived icons — local reference / attributed preview only.",
            "unknown": "Unresolved or unclear license; never promote into distributable.",
        },
        "counts": {
            "total": len(rows),
            "in_game": sum(1 for r in rows if r["in_game"]),
            "with_icon": sum(1 for r in rows if r.get("icon_url")),
            "by_license": {},
        },
        "items": rows,
    }
    by_lic: dict[str, int] = {}
    for r in rows:
        by_lic[r["license"]] = by_lic.get(r["license"], 0) + 1
    catalog["counts"]["by_license"] = by_lic

    (out_dir / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    fields = [
        "item_id",
        "zh_name",
        "en_name",
        "category",
        "in_game",
        "wiki_title",
        "wiki_path",
        "icon_url",
        "local_path",
        "source",
        "license",
        "distributable",
        "resolve_method",
    ]
    with (out_dir / "catalog.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)

    mapping = {
        "schema_version": 1,
        "description": "itemId → texture mapping for HUD / hotbar / inventory.",
        "default_extension": ".png",
        "cache_layout": {
            "distributable": "assets/icons/cache/distributable/<item_id>.<ext>",
            "restricted": "assets/icons/cache/restricted/<item_id>.<ext>",
            "unknown": "assets/icons/cache/unknown/<item_id>.json (stub only)",
        },
        "items": {
            r["item_id"]: {
                "texture": downloaded.get(r["item_id"])
                or (f"cache/{license_bucket(r['license'])}/{r['item_id']}.png" if r.get("icon_url") else None),
                "icon_url": r.get("icon_url"),
                "license": r["license"],
                "bucket": license_bucket(r["license"]),
                "zh_name": r["zh_name"],
                "en_name": r["en_name"],
            }
            for r in rows
        },
    }
    (out_dir / "mapping.json").write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    attr_lines = [
        "# Icon attribution & license",
        "",
        f"Primary source: [{SOURCE}]({SOURCE})",
        "",
        "## Policy",
        "",
        "- **distributable/** — only clear open-license art (none by default in this scrape).",
        "- **restricted/** — zh.minecraft.wiki inventory/block images that depict Mojang assets;",
        "  kept for local reference and attributed previews. Do not treat as shippable Mojang content.",
        "- **unknown/** — unresolved icons (JSON stubs only).",
        "",
        "## Per-item",
        "",
        "| item_id | license | source | wiki |",
        "|---|---|---|---|",
    ]
    for r in rows:
        attr_lines.append(
            f"| `{r['item_id']}` | `{r['license']}` | {r['source']} | [{r['wiki_title']}]({r['wiki_path']}) |"
        )
    (out_dir / "licenses" / "ATTRIBUTION.md").write_text(
        "\n".join(attr_lines) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seed", type=Path, default=SEED_PATH)
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--sleep", type=float, default=0.15, help="Delay between API calls")
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Debug: only first N entries")
    args = parser.parse_args()

    seed = json.loads(args.seed.read_text(encoding="utf-8"))
    game_ids, labels = parse_game_ids(args.repo)
    entries = build_entries(game_ids, labels, seed)
    if args.limit:
        entries = entries[: args.limit]

    print(f"Collecting {len(entries)} entries (in_game={sum(1 for e in entries if e['in_game'])})…")
    rows: list[dict[str, Any]] = []
    for i, entry in enumerate(entries, 1):
        try:
            row = collect_one(entry, args.sleep)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"[{i}/{len(entries)}] ERROR {entry['item_id']}: {exc}", file=sys.stderr)
            row = {
                **{k: entry[k] for k in ("item_id", "zh_name", "en_name", "category", "in_game", "wiki_title")},
                "wiki_path": page_url(entry["wiki_title"]),
                "wiki_file": None,
                "icon_url": None,
                "resolve_method": "error",
                "source": SOURCE,
                "license": LICENSE_UNKNOWN,
                "distributable": False,
                "license_note": f"Resolve error: {exc}",
            }
        status = "OK" if row.get("icon_url") else "MISS"
        print(f"[{i}/{len(entries)}] {status} {row['item_id']} ({row['resolve_method']})")
        rows.append(row)

    downloaded: dict[str, str] = {}
    if not args.skip_download:
        for row in rows:
            url = row.get("icon_url")
            if not url:
                stub = args.out / "cache" / "unknown" / f"{row['item_id']}.json"
                stub.parent.mkdir(parents=True, exist_ok=True)
                stub.write_text(
                    json.dumps(
                        {
                            "item_id": row["item_id"],
                            "license": LICENSE_UNKNOWN,
                            "reason": "no icon_url",
                        },
                        ensure_ascii=False,
                        indent=2,
                    )
                    + "\n",
                    encoding="utf-8",
                )
                continue
            bucket = license_bucket(row["license"])
            # preserve extension from URL path
            path_part = urllib.parse.urlparse(url).path
            ext = Path(path_part).suffix or ".png"
            if ext.lower() not in {".png", ".gif", ".webp", ".jpg", ".jpeg"}:
                ext = ".png"
            rel = f"cache/{bucket}/{row['item_id']}{ext}"
            dest = args.out / rel
            try:
                meta = download(url, dest)
                time.sleep(args.sleep)
                downloaded[row["item_id"]] = rel.replace("\\", "/")
                (args.out / "meta" / f"{row['item_id']}.json").write_text(
                    json.dumps({"item_id": row["item_id"], "url": url, **meta}, indent=2) + "\n",
                    encoding="utf-8",
                )
            except (urllib.error.URLError, TimeoutError) as exc:
                print(f"  download fail {row['item_id']}: {exc}", file=sys.stderr)
                row["license"] = LICENSE_UNKNOWN
                stub = args.out / "cache" / "unknown" / f"{row['item_id']}.json"
                stub.parent.mkdir(parents=True, exist_ok=True)
                stub.write_text(
                    json.dumps({"item_id": row["item_id"], "error": str(exc)}, indent=2) + "\n",
                    encoding="utf-8",
                )

    write_outputs(args.out, rows, downloaded)
    missing = [r["item_id"] for r in rows if not r.get("icon_url")]
    in_game_missing = [r["item_id"] for r in rows if r["in_game"] and not r.get("icon_url")]
    print(
        f"Done. total={len(rows)} with_icon={len(rows)-len(missing)} "
        f"in_game_missing={in_game_missing or '[]'}"
    )
    print(f"Wrote {args.out / 'catalog.json'}, mapping.json, catalog.csv")
    return 1 if in_game_missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
