#!/usr/bin/env python3
"""Generate original ore/obsidian cube faces + equipment/torch design note (LRM-1612).

World faces only under assets/blocks/ — never wiki isometric icons.
Merges into existing manifest.json (keeps LRM-1603 core ten).
CC0 1.0.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "blocks"
PREVIEW = OUT / "preview"
CELL = 16
LICENSE_ID = "cc0-original-procedural"
FACES = ("top", "bottom", "side")

# Stone-hosted ores + solid obsidian.
ORES = (
    "coal_ore",
    "copper_ore",
    "iron_ore",
    "gold_ore",
    "diamond_ore",
    "lapis_ore",
    "redstone_ore",
    "obsidian",
)

# Specular mineral flecks (RGB) on stone matrix — distinct per ore.
FLECKS: dict[str, list[tuple[int, int, int]]] = {
    "coal_ore": [(28, 28, 30), (48, 48, 52), (18, 18, 20)],
    "copper_ore": [(200, 110, 55), (160, 80, 40), (220, 140, 70)],
    "iron_ore": [(190, 160, 130), (150, 120, 95), (210, 180, 150)],
    "gold_ore": [(230, 190, 60), (200, 150, 40), (250, 220, 100)],
    "diamond_ore": [(80, 210, 210), (50, 170, 190), (140, 240, 235)],
    "lapis_ore": [(30, 70, 180), (20, 50, 140), (60, 100, 210)],
    "redstone_ore": [(180, 20, 20), (140, 10, 10), (220, 40, 40)],
}

SEMANTICS: dict[str, dict[str, str]] = {
    "coal_ore": {
        "top": "石基质 + 黑色煤块斑点",
        "side": "石壁 + 另一套煤斑布局",
        "bottom": "略深石底 + 煤斑",
    },
    "copper_ore": {
        "top": "石基质 + 橙铜斑",
        "side": "石壁 + 铜斑",
        "bottom": "略深 + 铜斑",
    },
    "iron_ore": {
        "top": "石基质 + 米褐铁矿斑",
        "side": "石壁 + 铁矿斑",
        "bottom": "略深 + 铁矿斑",
    },
    "gold_ore": {
        "top": "石基质 + 金斑",
        "side": "石壁 + 金斑",
        "bottom": "略深 + 金斑",
    },
    "diamond_ore": {
        "top": "石基质 + 青色钻石结晶",
        "side": "石壁 + 钻石结晶",
        "bottom": "略深 + 钻石结晶",
    },
    "lapis_ore": {
        "top": "石基质 + 深蓝青金斑",
        "side": "石壁 + 青金斑",
        "bottom": "略深 + 青金斑",
    },
    "redstone_ore": {
        "top": "石基质 + 红石粉粒",
        "side": "石壁 + 红石粉粒",
        "bottom": "略深 + 红石粉粒",
    },
    "obsidian": {
        "top": "深紫黑曜石（略有光泽条纹）",
        "side": "竖向深色层理",
        "bottom": "更深底面",
    },
}


def clamp(v: int) -> int:
    return max(0, min(255, v))


def shade(c: tuple[int, int, int], f: float) -> tuple[int, int, int]:
    return (clamp(int(c[0] * f)), clamp(int(c[1] * f)), clamp(int(c[2] * f)))


def hash2(x: int, y: int, seed: int) -> float:
    n = (x * 374761393 + y * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return (n ^ (n >> 16)) / 4294967295.0


def seed_of(*parts: str) -> int:
    raw = hashlib.sha1("|".join(parts).encode()).digest()
    return int.from_bytes(raw[:4], "little")


def filename(block_id: str, face: str) -> str:
    return f"{block_id}_{face}.png"


def stone_matrix(face: str, seed: int) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 255))
    greys = [(122, 127, 132), (108, 114, 118), (136, 140, 144), (96, 100, 104), (148, 150, 152)]
    depth = {"top": 1.04, "side": 1.0, "bottom": 0.86}[face]
    for y in range(CELL):
        for x in range(CELL):
            n = hash2(x, y, seed)
            c = shade(greys[int(n * len(greys)) % len(greys)], depth)
            img.putpixel((x, y), (*c, 255))
    return img


def scatter_flecks(img: Image.Image, block_id: str, face: str) -> None:
    seed = seed_of(block_id, face, "fleck")
    colors = FLECKS[block_id]
    # density varies slightly by face so top≠side≠bottom
    count = {"top": 14, "side": 16, "bottom": 12}[face]
    for i in range(count):
        x = int(hash2(i, 1, seed) * CELL) % CELL
        y = int(hash2(i, 2, seed) * CELL) % CELL
        c = colors[i % len(colors)]
        size = 1 + (1 if hash2(i, 3, seed) > 0.55 else 0)
        for dy in range(size):
            for dx in range(size):
                px, py = x + dx, y + dy
                if 0 <= px < CELL and 0 <= py < CELL:
                    img.putpixel((px, py), (*c, 255))
                    if hash2(px, py, seed) > 0.7 and px + 1 < CELL:
                        img.putpixel((px + 1, py), (*shade(c, 0.75), 255))


def ore_face(block_id: str, face: str) -> Image.Image:
    seed = seed_of(block_id, face)
    img = stone_matrix(face, seed)
    scatter_flecks(img, block_id, face)
    return img


def obsidian_face(face: str) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 255))
    seed = seed_of("obsidian", face)
    base = [(32, 18, 42), (22, 12, 30), (40, 24, 52), (18, 10, 26)]
    depth = {"top": 1.08, "side": 1.0, "bottom": 0.82}[face]
    for y in range(CELL):
        for x in range(CELL):
            n = hash2(x, y, seed)
            c = shade(base[int(n * len(base)) % len(base)], depth)
            if face == "side" and x % 4 == 0:
                c = shade(c, 0.7)
            elif face == "top" and hash2(x, y + 3, seed) > 0.88:
                c = mix(c, (90, 70, 120), 0.35)  # sheen
            img.putpixel((x, y), (*c, 255))
    return img


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        clamp(int(a[0] + (b[0] - a[0]) * t)),
        clamp(int(a[1] + (b[1] - a[1]) * t)),
        clamp(int(a[2] + (b[2] - a[2]) * t)),
    )


def render(block_id: str, face: str) -> Image.Image:
    if block_id == "obsidian":
        return obsidian_face(face)
    return ore_face(block_id, face)


def merge_manifest(images: dict[tuple[str, str], Image.Image]) -> None:
    path = OUT / "manifest.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    blocks = data.setdefault("blocks", {})
    for block_id in ORES:
        blocks[block_id] = {
            "top": filename(block_id, "top"),
            "bottom": filename(block_id, "bottom"),
            "side": filename(block_id, "side"),
            "semantics": SEMANTICS[block_id],
            "three_box_maps": ["side", "side", "top", "bottom", "side", "side"],
        }
    data["size"] = CELL
    data["issues"] = sorted(set(data.get("issues", []) + ["LRM-1603", "LRM-1612"]))
    if "issue" in data and data["issue"] == "LRM-1603":
        data["issue"] = "LRM-1603+1612"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def ore_contact_sheet(images: dict[tuple[str, str], Image.Image]) -> None:
    scale = 8
    label_h = 14
    cell = CELL * scale
    cols = 3
    rows = len(ORES)
    pad = 6
    header = 24
    w = pad + cols * (cell + pad)
    h = header + rows * (label_h + cell + pad) + pad
    sheet = Image.new("RGB", (w, h), (28, 30, 34))
    draw = ImageDraw.Draw(sheet)
    draw.text((pad, 4), "LRM-1612 ore/obsidian faces  top|side|bottom", fill=(220, 220, 220))
    for r, block_id in enumerate(ORES):
        y0 = header + r * (label_h + cell + pad)
        draw.text((pad, y0), block_id, fill=(200, 200, 200))
        for c, face in enumerate(("top", "side", "bottom")):
            tile = images[(block_id, face)].resize((cell, cell), Image.Resampling.NEAREST)
            bg = Image.new("RGB", tile.size, (40, 44, 52))
            bg.paste(tile, mask=tile.split()[3])
            sheet.paste(bg, (pad + c * (cell + pad), y0 + label_h))
    PREVIEW.mkdir(parents=True, exist_ok=True)
    sheet.save(PREVIEW / "ore_contact_sheet.png")


def write_equipment_note() -> None:
    note = OUT / "EQUIPMENT_TORCH_NOTE.md"
    note.write_text(
        """# LRM-1612 · 装备 / 火把 / 锭物品外观说明

服务 LRM-1610 闭环。世界矿石走本目录六面；HUD/热键物品走 `assets/icons/cache/distributable/`（`gen_distributable.py`，CC0）。

## 世界面（已交付）

| blockId | 说明 |
|---|---|
| coal_ore / copper_ore / iron_ore / gold_ore / diamond_ore / lapis_ore / redstone_ore | 石基质 + 独立 fleck；top/side/bottom 布局不同 |
| obsidian | 深紫黑曜石；侧面竖向层理 |

命名：`{blockId}_{top\\|bottom\\|side}.png`。再生：`python3 tools/block-faces/gen_ore_faces.py`

## HUD 物品（distributable）

请 tess/1610 使用已有或再跑 `python3 tools/icon-scrape/gen_distributable.py` 刷新：

- 燃料/材料：`coal` `charcoal` `stick` `iron_ingot` `copper_ingot` `gold_ingot` `diamond`
- 照明：`torch` `redstone_torch`
- 护甲：`leather_*` / `iron_*` helmet·chestplate·leggings·boots
- 矿块 HUD 可继续用 `*_ore` 物品图标；**世界网格必须用本目录六面**

## 持物 / 装备规格（给 viewmodel）

| 种类 | 建议 |
|---|---|
| 火把 | 右手斜持；木柄向下、焰头朝上偏相机外；空闲微 bob；放置时用方块 mesh 而非整块等距图 |
| 锭/煤/钻石 | 小扁平物品贴手心内侧，或沿用 HUD 图标 billboard（短时） |
| 护甲 | 穿戴改玩家层，不占热键持物；热键拿盔甲片时按物品图标显示 |

许可：全部 `cc0-original-procedural`。禁止 wiki 等距图当世界面。
""",
        encoding="utf-8",
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    images: dict[tuple[str, str], Image.Image] = {}
    for block_id in ORES:
        for face in FACES:
            img = render(block_id, face)
            images[(block_id, face)] = img
            img.save(OUT / filename(block_id, face), "PNG")
    merge_manifest(images)
    ore_contact_sheet(images)
    write_equipment_note()
    # append license rows
    lic = OUT / "licenses" / "LICENSE.md"
    extra = ["", "## LRM-1612 ores / obsidian", ""]
    for block_id in ORES:
        extra.append(
            f"| `{block_id}` | `{filename(block_id, 'top')}` | `{filename(block_id, 'side')}` | `{filename(block_id, 'bottom')}` | `{LICENSE_ID}` |"
        )
    extra.append("")
    if lic.exists():
        text = lic.read_text(encoding="utf-8")
        if "LRM-1612" not in text:
            lic.write_text(text.rstrip() + "\n" + "\n".join(extra), encoding="utf-8")
    print(f"wrote {len(images)} ore/obsidian faces")


if __name__ == "__main__":
    main()
