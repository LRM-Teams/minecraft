#!/usr/bin/env python3
"""Generate original distributable 16×16 icons + atlas for ship/Pages (LRM-1602).

Procedural Voxel Atelier pixel icons (CC0) — not Mojang/wiki inventory art.
Restricted wiki caches stay under cache/restricted/ for local reference only
and must never enter the Vite/Pages graph.

Outputs:
  assets/icons/cache/distributable/<id>.png
  assets/icons/atlas.png
  assets/icons/atlas.json
  assets/icons/mapping.json   (all catalog ids → distributable)
  assets/icons/licenses/DISTRIBUTABLE.md
  assets/icons/licenses/ATTRIBUTION.md
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "icons"
LICENSE_ID = "cc0-original-procedural"
LICENSE_NOTE = (
    "Original 16×16 procedural pixel icons generated for Voxel Atelier "
    "(LRM-Teams). Not derived from Mojang/Microsoft Minecraft textures or "
    "zh.minecraft.wiki inventory renders. Dedicated to the public domain (CC0 1.0)."
)

COLORS: dict[str, int] = {
    "grass": 0x5F9F47,
    "dirt": 0x8C633F,
    "stone": 0x7A8186,
    "wood": 0x96633E,
    "planks": 0xBA844D,
    "leaves": 0x3F7F43,
    "sand": 0xD9C27E,
    "water": 0x3D8EC9,
    "bricks": 0x9B5341,
    "glass": 0x9EDFE5,
    "coal_ore": 0x3B3F44,
    "copper_ore": 0xD07A3A,
    "iron_ore": 0xC9A06A,
    "gold_ore": 0xE8C94C,
    "diamond_ore": 0x5AD2D0,
    "lapis_ore": 0x1F4FD8,
    "redstone_ore": 0xB01010,
    "obsidian": 0x2B2333,
    "crafting_table": 0xB8874C,
    "furnace": 0x6A6E72,
    "enchanting_table": 0x5A2A6E,
    "bookshelf": 0x8B5A2B,
    "brewing_stand": 0x6A5A48,
    "torch": 0xFFC15A,
    "wool": 0xF0EBE3,
    "bed": 0xC43C3C,
    "oak_door": 0x8B5A2B,
    "ladder": 0x9A6A3A,
    "redstone_dust": 0xC41E1E,
    "lever": 0x8A7A5A,
    "redstone_torch": 0xFF3030,
    "redstone_lamp": 0x5A4030,
    "cobblestone": 0x6E7378,
    "gravel": 0x8A867C,
    "clay": 0x9AA0A8,
    "ice": 0xA8D8F0,
    "snow_block": 0xF0F5FA,
    "bedrock": 0x282828,
    "lava": 0xFF5A1F,
    "netherrack": 0x6E1D21,
    "glowstone": 0xFFD98A,
    "nether_portal": 0x9B2BD8,
    "end_stone": 0xDFE2D5,
    "chest": 0x96642D,
}

TIER: dict[str, tuple[int, int, int]] = {
    "wooden": (140, 100, 55),
    "stone": (120, 125, 130),
    "iron": (200, 200, 210),
    "gold": (240, 200, 60),
    "diamond": (90, 220, 220),
    "leather": (130, 85, 45),
}

CELL = 16


def rgb(hex_color: int) -> tuple[int, int, int]:
    return ((hex_color >> 16) & 0xFF, (hex_color >> 8) & 0xFF, hex_color & 0xFF)


def mul_hex(hex_color: int, factor: float) -> tuple[int, int, int]:
    r, g, b = rgb(hex_color)
    return (
        max(0, min(255, int(r * factor))),
        max(0, min(255, int(g * factor))),
        max(0, min(255, int(b * factor))),
    )


def mul_rgb(c: tuple[int, int, int], factor: float) -> tuple[int, int, int]:
    return tuple(max(0, min(255, int(ch * factor))) for ch in c)  # type: ignore[return-value]


def noise(item_id: str, x: int, y: int) -> float:
    seed = sum(ord(c) for c in item_id)
    return abs(math.sin((x + 1) * 12.91 + (y + 1) * 78.23 + seed * 0.37)) % 1.0


def paint(px: Image.Image, color: tuple[int, ...], x: int, y: int, w: int = 1, h: int = 1) -> None:
    draw = ImageDraw.Draw(px)
    draw.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


def render_block(item_id: str, base_hex: int) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    base = base_hex
    n = lambda x, y: noise(item_id, x, y)

    if item_id == "leaves":
        for y in range(0, 16, 2):
            for x in range(0, 16, 2):
                if n(x, y) > 0.2:
                    paint(img, mul_hex(base, 0.75 + n(x + 2, y) * 0.45), x, y, 2, 2)
    elif item_id == "grass":
        paint(img, rgb(COLORS["dirt"]), 0, 0, 16, 16)
        for y in range(0, 6):
            for x in range(0, 16):
                if y < 3 or n(x, y) > 0.28 + y * 0.08:
                    paint(img, mul_hex(base, 0.8 + n(x, y) * 0.35), x, y, 1, 1)
    elif item_id.endswith("_ore"):
        paint(img, rgb(COLORS["stone"]), 0, 0, 16, 16)
        for y in range(2, 16, 3):
            for x in range(2, 16, 3):
                paint(img, mul_hex(base, 0.85 + n(x, y) * 0.3), x, y, 3, 3)
                if n(x + 5, y + 5) > 0.55:
                    paint(img, mul_hex(0xFFFFFF, 0.8 + n(x, y) * 0.25), x + 1, y, 1, 1)
    elif item_id == "torch":
        paint(img, rgb(0x5A3A22), 0, 0, 16, 16)
        paint(img, rgb(0xFFE08A), 5, 0, 6, 7)
        paint(img, rgb(0xFF7A1A), 6, 1, 4, 4)
    elif item_id == "redstone_torch":
        paint(img, rgb(0x5A3A22), 0, 0, 16, 16)
        paint(img, rgb(0xFF6060), 5, 0, 6, 7)
        paint(img, rgb(0xC01010), 6, 1, 4, 4)
    elif item_id == "redstone_dust":
        paint(img, rgb(0x2A1010), 0, 0, 16, 16)
        paint(img, rgb(base), 2, 6, 12, 4)
        paint(img, mul_hex(base, 1.2), 4, 5, 8, 6)
    elif item_id == "lever":
        paint(img, rgb(0x6A6E72), 0, 0, 16, 16)
        paint(img, rgb(0x8A7A5A), 6, 2, 4, 10)
        paint(img, rgb(0xC9B896), 5, 1, 6, 3)
    elif item_id == "redstone_lamp":
        paint(img, rgb(0x3A3020), 0, 0, 16, 16)
        paint(img, rgb(base), 2, 2, 12, 12)
        paint(img, rgb(0xFFD070), 5, 5, 6, 6)
    elif item_id == "wool":
        paint(img, rgb(base), 0, 0, 16, 16)
        for y in range(0, 16, 4):
            for x in range(0, 16, 4):
                paint(img, mul_hex(base, 0.88 + n(x, y) * 0.2), x, y, 4, 4)
    elif item_id == "bed":
        paint(img, rgb(COLORS["planks"]), 0, 0, 16, 16)
        paint(img, rgb(base), 0, 0, 16, 9)
        for x in range(0, 16, 2):
            paint(img, mul_hex(base, 0.85), x, 2, 1, 5)
    elif item_id == "oak_door":
        paint(img, rgb(base), 0, 0, 16, 16)
        paint(img, mul_hex(base, 0.7), 0, 0, 16, 1)
        paint(img, mul_hex(base, 0.7), 0, 15, 16, 1)
        paint(img, mul_hex(base, 0.7), 0, 0, 1, 16)
        paint(img, mul_hex(base, 0.7), 15, 0, 1, 16)
        paint(img, rgb(0x3A3020), 11, 7, 2, 2)
    elif item_id == "ladder":
        img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        paint(img, rgb(base), 2, 0, 2, 16)
        paint(img, rgb(base), 12, 0, 2, 16)
        for y in range(2, 16, 4):
            paint(img, mul_hex(base, 1.1), 2, y, 12, 2)
    elif item_id == "glass":
        img = Image.new("RGBA", (CELL, CELL), (*mul_hex(base, 0.55), 160))
        for y in range(16):
            for x in range(16):
                if x == y or x + y == 14 or n(x, y) > 0.82:
                    paint(img, (*mul_hex(base, 1.22), 220), x, y, 1, 1)
    elif item_id == "water":
        img = Image.new("RGBA", (CELL, CELL), (*rgb(base), 200))
        for y in range(0, 16, 5):
            for x in range(0, 16, 2):
                paint(img, (*mul_hex(base, 1.3), 230), x, y, 2, 1)
    elif item_id == "crafting_table":
        paint(img, rgb(base), 0, 0, 16, 16)
        paint(img, mul_hex(base, 0.7), 2, 2, 12, 12)
        paint(img, mul_hex(COLORS["planks"], 0.9), 4, 4, 8, 8)
        paint(img, rgb(0x5A3A22), 7, 5, 2, 6)
        paint(img, rgb(0x5A3A22), 5, 7, 6, 2)
    elif item_id == "furnace":
        paint(img, rgb(base), 0, 0, 16, 16)
        paint(img, mul_hex(base, 0.55), 3, 3, 10, 10)
        paint(img, rgb(0xFF7A1A), 5, 8, 6, 4)
        paint(img, rgb(0xFFE08A), 6, 9, 4, 2)
    elif item_id == "enchanting_table":
        paint(img, rgb(base), 0, 0, 16, 16)
        paint(img, rgb(0x2B2333), 0, 12, 16, 4)
        paint(img, rgb(0xC9A06A), 3, 2, 10, 8)
        paint(img, rgb(0xE8E0FF), 6, 4, 4, 4)
    elif item_id == "bookshelf":
        paint(img, rgb(COLORS["planks"]), 0, 0, 16, 16)
        for row in range(0, 16, 4):
            paint(img, rgb(base), 1, row + 1, 14, 2)
            paint(img, rgb(0xC43C3C if row % 8 == 0 else 0x1F4FD8), 2, row + 1, 3, 2)
    elif item_id == "brewing_stand":
        paint(img, rgb(0x3A3020), 0, 0, 16, 16)
        paint(img, rgb(base), 7, 2, 2, 10)
        paint(img, rgb(0x9EDFE5), 3, 10, 4, 4)
        paint(img, rgb(0xFF6060), 9, 10, 4, 4)
        paint(img, rgb(0x5AD2D0), 6, 4, 4, 3)
    elif item_id == "chest":
        paint(img, rgb(base), 0, 0, 16, 16)
        paint(img, mul_hex(base, 0.7), 2, 2, 12, 10)
        paint(img, rgb(0xE8C94C), 7, 6, 2, 3)
    elif item_id == "lava":
        img = Image.new("RGBA", (CELL, CELL), (*rgb(base), 255))
        for y in range(0, 16, 3):
            for x in range(0, 16, 2):
                paint(img, mul_hex(0xFFE08A, 0.8 + n(x, y) * 0.4), x, y, 2, 2)
    else:
        paint(img, rgb(base), 0, 0, 16, 16)
        for y in range(0, 16, 2):
            for x in range(0, 16, 2):
                if item_id == "planks" and (y % 6 == 0 or x in (0, 8)):
                    paint(img, mul_hex(base, 0.55), x, y, 2, 1)
                elif item_id == "wood" and (x % 5 == 0 or n(x, y) > 0.66):
                    paint(img, mul_hex(base, 0.62), x, y, 1, 2)
                elif item_id == "bricks" and (y % 4 == 0 or (x + (y // 4) * 4) % 8 == 0):
                    paint(img, mul_hex(base, 0.58), x, y, 2, 1)
                elif item_id not in {"planks", "wood", "water"} and n(x, y) > 0.58:
                    paint(img, mul_hex(base, 0.72 + n(x + 4, y) * 0.45), x, y, 2, 2)
    return img


def render_tool(item_id: str) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tier = "wooden"
    for key in TIER:
        if item_id.startswith(key):
            tier = key
            break
    head = TIER[tier]
    haft = (110, 75, 40)
    d.line([(4, 12), (11, 5)], fill=(*haft, 255), width=2)
    if "pickaxe" in item_id:
        d.polygon([(6, 3), (13, 3), (13, 6), (10, 6), (10, 5), (6, 5)], fill=(*head, 255))
    elif "axe" in item_id:
        d.polygon([(8, 2), (14, 5), (14, 9), (8, 7)], fill=(*head, 255))
    elif "shovel" in item_id:
        d.ellipse([9, 2, 14, 8], fill=(*head, 255))
    elif "hoe" in item_id:
        d.line([(8, 4), (13, 4)], fill=(*head, 255), width=2)
        d.line([(13, 4), (13, 7)], fill=(*head, 255), width=2)
    elif "sword" in item_id:
        d.polygon([(10, 1), (12, 3), (7, 12), (5, 10)], fill=(*head, 255))
        d.rectangle([4, 11, 8, 13], fill=(*haft, 255))
    else:
        d.rectangle([5, 5, 11, 11], fill=(*head, 255))
    return img


def render_armor(item_id: str) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = TIER["leather"] if item_id.startswith("leather") else TIER["iron"]
    if "helmet" in item_id:
        d.rectangle([3, 3, 12, 8], fill=(*color, 255))
        d.rectangle([5, 6, 10, 9], fill=(*mul_rgb(color, 0.7), 255))
    elif "chestplate" in item_id:
        d.rectangle([3, 3, 12, 13], fill=(*color, 255))
        d.rectangle([6, 5, 9, 11], fill=(*mul_rgb(color, 0.65), 255))
    elif "leggings" in item_id:
        d.rectangle([4, 3, 7, 13], fill=(*color, 255))
        d.rectangle([9, 3, 12, 13], fill=(*color, 255))
        d.rectangle([4, 3, 12, 6], fill=(*mul_rgb(color, 0.85), 255))
    else:
        d.rectangle([3, 8, 7, 13], fill=(*color, 255))
        d.rectangle([9, 8, 13, 13], fill=(*color, 255))
    return img


def render_food(item_id: str) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if item_id == "apple":
        d.ellipse([3, 4, 12, 13], fill=(200, 40, 40, 255))
        d.rectangle([7, 2, 8, 5], fill=(80, 140, 50, 255))
    elif item_id == "bread":
        d.ellipse([2, 5, 13, 12], fill=(190, 140, 70, 255))
    elif "beef" in item_id:
        c = (160, 70, 50, 255) if "raw" in item_id else (120, 60, 40, 255)
        d.ellipse([3, 4, 12, 12], fill=c)
    elif item_id == "wheat":
        d.line([(8, 2), (8, 13)], fill=(200, 180, 60, 255), width=2)
        for y in (3, 6, 9):
            d.line([(5, y), (11, y + 1)], fill=(220, 200, 80, 255), width=1)
    else:
        d.ellipse([4, 3, 11, 13], fill=(160, 80, 180, 255))
    return img


def render_potion(item_id: str) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tint = {
        "water_bottle": (90, 160, 220),
        "awkward_potion": (140, 100, 180),
        "potion_healing": (220, 60, 80),
        "potion_swiftness": (60, 180, 220),
        "potion_poison": (80, 180, 60),
        "glass_bottle": (180, 200, 210),
    }.get(item_id, (120, 100, 180))
    d.polygon([(5, 3), (10, 3), (12, 6), (12, 13), (3, 13), (3, 6)], outline=(200, 200, 210, 255))
    d.rectangle([4, 7, 11, 12], fill=(*tint, 220))
    d.rectangle([6, 1, 9, 3], fill=(180, 180, 190, 255))
    return img


def render_item(item_id: str) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if item_id == "stick":
        d.line([(5, 12), (11, 3)], fill=(130, 90, 45, 255), width=2)
    elif item_id in ("coal", "charcoal"):
        d.ellipse([3, 3, 12, 12], fill=(40, 40, 45, 255))
    elif item_id in ("iron_ingot", "gold_ingot", "copper_ingot", "diamond", "lapis_lazuli"):
        c = {
            "iron_ingot": (200, 200, 210),
            "gold_ingot": (240, 200, 60),
            "copper_ingot": (200, 110, 60),
            "diamond": (90, 220, 220),
            "lapis_lazuli": (40, 80, 200),
        }[item_id]
        d.polygon([(3, 8), (8, 3), (13, 8), (8, 13)], fill=(*c, 255))
    elif item_id in ("blaze_rod", "blaze_powder"):
        d.line([(4, 12), (12, 3)], fill=(255, 170, 40, 255), width=2)
        d.ellipse([10, 1, 14, 5], fill=(255, 220, 80, 255))
    elif item_id in ("ender_pearl",):
        d.ellipse([3, 3, 12, 12], fill=(40, 120, 90, 255))
        d.ellipse([6, 6, 9, 9], fill=(180, 255, 200, 255))
    elif item_id == "book" or item_id == "paper":
        d.rectangle([3, 3, 12, 13], fill=(90, 50, 30, 255))
        d.rectangle([4, 4, 11, 12], fill=(230, 220, 190, 255))
    elif item_id in ("bucket",) or item_id.endswith("_bucket"):
        d.polygon([(4, 5), (12, 5), (11, 13), (5, 13)], fill=(160, 160, 170, 255))
    elif item_id in ("leather", "sugar", "sugar_cane", "nether_wart", "spider_eye", "glistering_melon"):
        seed = sum(ord(c) for c in item_id) % 180
        c = (80 + seed // 2, 100 + (seed % 70), 140 + (seed % 50))
        d.ellipse([3, 3, 12, 12], fill=(*c, 255))
    else:
        seed = sum(ord(c) for c in item_id) % 180
        c = (90 + seed // 3, 110 + (seed % 60), 130 + (seed % 40))
        d.ellipse([4, 4, 11, 11], fill=(*c, 255))
    return img


def render_icon(item_id: str, category: str) -> Image.Image:
    if item_id in COLORS:
        return render_block(item_id, COLORS[item_id])
    if category == "tool" or any(t in item_id for t in ("pickaxe", "axe", "shovel", "hoe", "sword")):
        return render_tool(item_id)
    if category == "armor" or any(t in item_id for t in ("helmet", "chestplate", "leggings", "boots")):
        return render_armor(item_id)
    if category == "food":
        return render_food(item_id)
    if category == "potion" or "potion" in item_id or item_id == "glass_bottle" or item_id == "water_bottle":
        return render_potion(item_id)
    if category in ("block", "ore", "utility"):
        return render_block(item_id, COLORS.get(item_id, 0x8A8A8A))
    return render_item(item_id)


def parse_block_types() -> list[str]:
    world = (ROOT / "src" / "world.ts").read_text(encoding="utf-8")
    m = re.search(r"export const BLOCK_TYPES = \[([^\]]+)\]", world)
    if not m:
        raise SystemExit("Failed to parse BLOCK_TYPES")
    ids = re.findall(r'"([a-z0-9_]+)"', m.group(1))
    missing = [i for i in ids if i not in COLORS]
    if missing:
        raise SystemExit(f"COLORS missing entries for: {missing}")
    return ids


def load_catalog_rows() -> list[dict]:
    catalog = json.loads((OUT / "catalog.json").read_text(encoding="utf-8"))
    return list(catalog["items"])


def pack_atlas(paths: dict[str, Path]) -> dict:
    ids = sorted(paths.keys())
    n = len(ids)
    cols = max(1, math.ceil(math.sqrt(n)))
    rows = math.ceil(n / cols)
    atlas = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    frames: dict[str, dict] = {}
    for i, item_id in enumerate(ids):
        col, row = i % cols, i // cols
        x, y = col * CELL, row * CELL
        tile = Image.open(paths[item_id]).convert("RGBA")
        atlas.paste(tile, (x, y))
        frames[item_id] = {
            "x": x,
            "y": y,
            "w": CELL,
            "h": CELL,
            "u": x / (cols * CELL),
            "v": y / (rows * CELL),
            "u2": (x + CELL) / (cols * CELL),
            "v2": (y + CELL) / (rows * CELL),
        }
    atlas.save(OUT / "atlas.png")
    meta = {
        "schema_version": 1,
        "generated_by": "tools/icon-scrape/gen_distributable.py",
        "license": LICENSE_ID,
        "cell": CELL,
        "columns": cols,
        "rows": rows,
        "width": cols * CELL,
        "height": rows * CELL,
        "texture": "atlas.png",
        "frames": frames,
    }
    (OUT / "atlas.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return meta


def update_mapping(rows: list[dict], core_ids: list[str], atlas_meta: dict) -> None:
    mapping_path = OUT / "mapping.json"
    mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
    items = mapping.setdefault("items", {})
    by_id = {row["item_id"]: row for row in rows}
    EXTRA_NAMES = {
        "oak_door": ("木门", "Oak Door"),
        "ladder": ("梯子", "Ladder"),
    }
    for item_id in sorted(set(by_id) | set(core_ids) | set(atlas_meta["frames"])):
        if item_id not in atlas_meta["frames"]:
            continue
        row = by_id.get(item_id, {})
        prev = items.get(item_id, {})
        zh_fallback, en_fallback = EXTRA_NAMES.get(item_id, (item_id, item_id))
        items[item_id] = {
            "texture": f"cache/distributable/{item_id}.png",
            "icon_url": None,
            "license": LICENSE_ID,
            "bucket": "distributable",
            "distributable": True,
            "zh_name": prev.get("zh_name") or row.get("zh_name") or zh_fallback,
            "en_name": prev.get("en_name") or row.get("en_name") or en_fallback,
            "atlas": {
                "texture": "atlas.png",
                **atlas_meta["frames"][item_id],
            },
        }
    mapping["schema_version"] = 2
    mapping["ship_bucket"] = "distributable"
    mapping["description"] = (
        "itemId → distributable texture + atlas UV. Pages/ship builds use "
        "bucket=distributable only (cc0-original-procedural)."
    )
    mapping["atlas"] = {
        "texture": "atlas.png",
        "meta": "atlas.json",
        "license": LICENSE_ID,
        "core_ids": core_ids,
    }
    mapping["cache_layout"] = {
        "distributable": "assets/icons/cache/distributable/<item_id>.png",
        "restricted": "assets/icons/cache/restricted/<item_id>.<ext> (reference only; not shipped)",
        "unknown": "assets/icons/cache/unknown/<item_id>.json",
    }
    mapping_path.write_text(json.dumps(mapping, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_license_docs(item_ids: list[str]) -> None:
    lines = [
        "# Distributable icon licenses (ship)",
        "",
        f"License id: `{LICENSE_ID}`",
        "",
        LICENSE_NOTE,
        "",
        "CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/",
        "",
        "Generated by `tools/icon-scrape/gen_distributable.py`.",
        "Atlas: `assets/icons/atlas.png` + `assets/icons/atlas.json`.",
        "",
        "| item_id | path | license |",
        "|---|---|---|",
    ]
    for item_id in sorted(item_ids):
        lines.append(f"| `{item_id}` | `cache/distributable/{item_id}.png` | `{LICENSE_ID}` |")
    lines += [
        "",
        "Wiki-restricted previews remain under `cache/restricted/` for local "
        "reference only and must not be imported by production/Pages builds.",
        "",
    ]
    (OUT / "licenses" / "DISTRIBUTABLE.md").write_text("\n".join(lines), encoding="utf-8")
    (OUT / "licenses" / "ATTRIBUTION.md").write_text(
        "\n".join(
            [
                "# Icon attribution",
                "",
                "## Ship / Pages (canonical)",
                "",
                f"- License: CC0 1.0 (`{LICENSE_ID}`)",
                "- See `DISTRIBUTABLE.md` for the full per-item table",
                "- Atlas: `assets/icons/atlas.png`",
                "",
                "## Restricted (local reference only)",
                "",
                "- Wiki Mojang-derived scrapes under `cache/restricted/`",
                "- Not imported by Vite; do not promote into `distributable/`",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    core_ids = parse_block_types()
    rows = load_catalog_rows()
    if args.check_only:
        print(f"core_ids={len(core_ids)} catalog={len(rows)}")
        return

    dist = OUT / "cache" / "distributable"
    dist.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for row in rows:
        item_id = row["item_id"]
        category = row.get("category") or "item"
        img = render_icon(item_id, category)
        dest = dist / f"{item_id}.png"
        img.save(dest)
        paths[item_id] = dest

    # Ensure every BLOCK_TYPES id exists even if catalog skipped one.
    for item_id in core_ids:
        if item_id not in paths:
            img = render_icon(item_id, "block")
            dest = dist / f"{item_id}.png"
            img.save(dest)
            paths[item_id] = dest

    atlas_meta = pack_atlas(paths)
    update_mapping(rows, core_ids, atlas_meta)
    write_license_docs(list(paths))
    print(
        f"Done. distributable={len(paths)} atlas={atlas_meta['width']}x{atlas_meta['height']} "
        f"cols={atlas_meta['columns']} core={len(core_ids)}"
    )


if __name__ == "__main__":
    main()
