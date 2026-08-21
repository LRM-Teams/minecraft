#!/usr/bin/env python3
"""Generate original 16×16 *cube-face* textures for world meshes (LRM-1603).

These are tileable world faces, not HUD/item icons and not wiki isometric
block renders. Dedicated to the public domain (CC0 1.0).

Outputs:
  assets/blocks/<blockId>_<face>.png
  assets/blocks/manifest.json
  assets/blocks/preview/contact_sheet.png
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "blocks"
PREVIEW = OUT / "preview"
ICONS = ROOT / "assets" / "icons" / "cache" / "distributable"
CELL = 16
LICENSE_ID = "cc0-original-procedural"

CORE = ("grass", "dirt", "stone", "wood", "planks", "sand", "leaves", "water", "cobblestone", "bricks")
FACES = ("top", "bottom", "side")

# Semantic notes for tess / review — wiki *conventions*, not wiki pixels.
SEMANTICS: dict[str, dict[str, str]] = {
    "grass": {
        "top": "草皮顶面（生物群系可染色）",
        "side": "上缘草皮 + 下缘泥土，不可整面铺草",
        "bottom": "泥土底面（与 dirt 同族，独立文件）",
    },
    "dirt": {
        "top": "泥土顶（略密实）",
        "side": "泥土侧（略松、小石子）",
        "bottom": "泥土底（略深）",
    },
    "stone": {
        "top": "光滑灰岩顶",
        "side": "带竖向裂纹的岩壁",
        "bottom": "略深的岩底",
    },
    "wood": {
        "top": "年轮横切（髓心 + 同心环）",
        "side": "树皮纵纹（四侧共用）",
        "bottom": "年轮横切（略深、独立于顶）",
    },
    "planks": {
        "top": "横向木板顶",
        "side": "横向木板侧（接缝错位）",
        "bottom": "略深木板底",
    },
    "sand": {
        "top": "细沙粒顶",
        "side": "沙壁（略有层理）",
        "bottom": "略深沙底",
    },
    "leaves": {
        "top": "叶片簇 + 透明孔隙（受光）",
        "side": "叶片簇 + 透明孔隙",
        "bottom": "叶片簇（背光、更暗）",
    },
    "water": {
        "top": "静水面涟漪",
        "side": "竖直水体/流纹",
        "bottom": "深水底",
    },
    "cobblestone": {
        "top": "圆石顶（不规则石块 + 暗缝）",
        "side": "圆石侧（另一套石块布局）",
        "bottom": "圆石底",
    },
    "bricks": {
        "top": "砌砖顶（顺砖）",
        "side": "砌砖侧（错缝跑砌）",
        "bottom": "砌砖底（略深砂浆）",
    },
}


def clamp(v: int) -> int:
    return max(0, min(255, v))


def rgb(h: int) -> tuple[int, int, int]:
    return ((h >> 16) & 255, (h >> 8) & 255, h & 255)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        clamp(int(a[0] + (b[0] - a[0]) * t)),
        clamp(int(a[1] + (b[1] - a[1]) * t)),
        clamp(int(a[2] + (b[2] - a[2]) * t)),
    )


def shade(c: tuple[int, int, int], f: float) -> tuple[int, int, int]:
    return (clamp(int(c[0] * f)), clamp(int(c[1] * f)), clamp(int(c[2] * f)))


def hash2(x: int, y: int, seed: int) -> float:
    n = (x * 374761393 + y * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return (n ^ (n >> 16)) / 4294967295.0


def seed_of(*parts: str) -> int:
    raw = hashlib.sha1("|".join(parts).encode()).digest()
    return int.from_bytes(raw[:4], "little")


def new_img(alpha: int = 255) -> Image.Image:
    return Image.new("RGBA", (CELL, CELL), (0, 0, 0, alpha if alpha else 0))


def put(px: Image.Image, x: int, y: int, color: tuple[int, ...]) -> None:
    if 0 <= x < CELL and 0 <= y < CELL:
        if len(color) == 3:
            px.putpixel((x, y), (*color, 255))
        else:
            px.putpixel((x, y), color)


def fill(px: Image.Image, color: tuple[int, ...]) -> None:
    for y in range(CELL):
        for x in range(CELL):
            put(px, x, y, color)


def grass_top() -> Image.Image:
    img = new_img()
    seed = seed_of("grass", "top")
    greens = [(72, 128, 52), (95, 159, 71), (62, 112, 44), (110, 168, 78), (84, 146, 60)]
    for y in range(CELL):
        for x in range(CELL):
            n = hash2(x, y, seed)
            n2 = hash2(x + 3, y + 7, seed)
            c = greens[int(n * len(greens)) % len(greens)]
            if n2 > 0.82:
                c = shade(c, 0.72)
            elif n2 < 0.12:
                c = mix(c, (168, 186, 70), 0.35)
            put(img, x, y, c)
    # short blade ticks — not a centered icon
    for i in range(10):
        x = int(hash2(i, 1, seed) * 16) % 16
        y = int(hash2(i, 2, seed) * 16) % 16
        put(img, x, y, (54, 98, 38))
        if y > 0:
            put(img, x, y - 1, (118, 174, 82))
    return img


def dirt_face(face: str) -> Image.Image:
    img = new_img()
    seed = seed_of("dirt", face)
    browns = [(140, 98, 58), (120, 82, 48), (104, 70, 40), (156, 110, 66), (88, 60, 34)]
    depth = {"top": 1.05, "side": 1.0, "bottom": 0.88}[face]
    for y in range(CELL):
        for x in range(CELL):
            n = hash2(x, y, seed)
            c = shade(browns[int(n * len(browns)) % len(browns)], depth)
            if face == "side" and hash2(x, y + 11, seed) > 0.78:
                c = mix(c, (70, 70, 68), 0.45)  # grit
            if face == "top" and hash2(x + 2, y, seed) > 0.9:
                c = mix(c, (168, 132, 80), 0.4)
            put(img, x, y, c)
    return img


def grass_side() -> Image.Image:
    img = dirt_face("side")
    seed = seed_of("grass", "side")
    greens = [(95, 159, 71), (72, 128, 52), (110, 168, 78), (84, 146, 60)]
    for x in range(CELL):
        hang = 4 + int(hash2(x, 0, seed) * 3)  # 4..6
        for y in range(hang + 1):
            n = hash2(x, y, seed)
            c = greens[int(n * len(greens)) % len(greens)]
            if y == hang and n < 0.35:
                continue  # ragged grass edge, dirt shows through
            put(img, x, y, shade(c, 1.05 - y * 0.04))
        # a few hanging blades
        if hash2(x, 9, seed) > 0.72:
            put(img, x, min(CELL - 1, hang + 1), (62, 112, 44))
    return img


def grass_bottom() -> Image.Image:
    return dirt_face("bottom")


def stone_face(face: str) -> Image.Image:
    img = new_img()
    seed = seed_of("stone", face)
    greys = [(122, 127, 132), (108, 114, 118), (136, 140, 144), (96, 100, 104), (148, 150, 152)]
    depth = {"top": 1.04, "side": 1.0, "bottom": 0.86}[face]
    for y in range(CELL):
        for x in range(CELL):
            n = hash2(x, y, seed)
            put(img, x, y, shade(greys[int(n * len(greys)) % len(greys)], depth))
    # cracks — different orientation per face
    if face == "side":
        cracks = [(3, 0, 4, 15), (11, 1, 10, 15), (7, 5, 13, 8)]
    elif face == "top":
        cracks = [(1, 4, 14, 5), (6, 9, 15, 11), (0, 12, 8, 13)]
    else:
        cracks = [(2, 2, 6, 14), (9, 0, 12, 10)]
    for x0, y0, x1, y1 in cracks:
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(steps + 1):
            t = i / steps
            x = int(x0 + (x1 - x0) * t)
            y = int(y0 + (y1 - y0) * t)
            put(img, x, y, (70, 74, 78))
            if hash2(x, y, seed) > 0.55:
                put(img, x + 1, y, (82, 86, 90))
    return img


def wood_rings(face: str) -> Image.Image:
    img = new_img()
    seed = seed_of("wood", face)
    cx, cy = (7.4, 7.6) if face == "top" else (8.2, 6.8)
    pith = (86, 58, 32)
    light = (186, 142, 86)
    dark = (120, 78, 42)
    depth = 1.0 if face == "top" else 0.78
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy) + hash2(x, y, seed) * 0.45
            if d < 1.6:
                c = pith
            else:
                ring = int(d * 1.35)
                c = dark if ring % 2 else light
                c = mix(c, pith, 0.08)
            put(img, x, y, shade(c, depth + hash2(x + 4, y, seed) * 0.08))
    # outer bark rim so the cut face reads as a log end, not a plank
    bark = (92, 62, 36)
    for i in range(CELL):
        put(img, i, 0, bark)
        put(img, i, 15, bark)
        put(img, 0, i, bark)
        put(img, 15, i, bark)
    return img


def wood_bark() -> Image.Image:
    img = new_img()
    seed = seed_of("wood", "side")
    cols = [(118, 78, 44), (96, 62, 34), (140, 94, 52), (78, 50, 28)]
    for x in range(CELL):
        stripe = cols[x % len(cols)]
        for y in range(CELL):
            n = hash2(x, y, seed)
            c = shade(stripe, 0.88 + n * 0.22)
            if hash2(x + 1, y, seed) > 0.93:
                c = (58, 36, 20)  # vertical split
            put(img, x, y, c)
    # knots
    for kx, ky, r in ((4, 6, 2), (11, 11, 2)):
        for y in range(ky - r, ky + r + 1):
            for x in range(kx - r, kx + r + 1):
                if (x - kx) ** 2 + (y - ky) ** 2 <= r * r:
                    put(img, x, y, (64, 40, 22))
        put(img, kx, ky, (168, 124, 70))
    # horizontal scar
    for x in range(2, 9):
        put(img, x, 3, (56, 36, 20))
    return img


def planks_face(face: str) -> Image.Image:
    img = new_img()
    seed = seed_of("planks", face)
    boards = [(186, 132, 74), (172, 118, 64), (198, 146, 86), (158, 108, 56)]
    groove = (92, 60, 32)
    depth = {"top": 1.04, "side": 1.0, "bottom": 0.86}[face]
    offset = 0 if face != "side" else 2
    for y in range(CELL):
        row = (y + offset) // 4
        base = boards[row % len(boards)]
        for x in range(CELL):
            n = hash2(x, y, seed)
            c = shade(base, depth * (0.92 + n * 0.14))
            if (y + offset) % 4 == 0:
                c = groove
            elif x in (0, 8) and face == "side":
                c = mix(c, groove, 0.35)  # board ends
            elif n > 0.9:
                c = shade(c, 0.78)  # grain tick
            put(img, x, y, c)
    return img


def sand_face(face: str) -> Image.Image:
    img = new_img()
    seed = seed_of("sand", face)
    grains = [(217, 194, 126), (232, 210, 142), (196, 172, 108), (240, 220, 156), (180, 156, 96)]
    depth = {"top": 1.06, "side": 1.0, "bottom": 0.88}[face]
    for y in range(CELL):
        layer = 1.0 - (0.06 if face == "side" and y % 5 == 0 else 0.0)
        for x in range(CELL):
            n = hash2(x, y, seed)
            c = shade(grains[int(n * len(grains)) % len(grains)], depth * layer)
            if hash2(x, y + 3, seed) > 0.94:
                c = (150, 128, 78)
            put(img, x, y, c)
    return img


def leaves_face(face: str) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    seed = seed_of("leaves", face)
    greens = [(63, 127, 67), (48, 108, 52), (86, 150, 82), (40, 92, 44), (110, 168, 96)]
    depth = {"top": 1.08, "side": 1.0, "bottom": 0.78}[face]
    for y in range(0, CELL, 2):
        for x in range(0, CELL, 2):
            n = hash2(x, y, seed)
            if n < 0.18:
                continue  # sky hole
            c = shade(greens[int(n * len(greens)) % len(greens)], depth)
            for dy in range(2):
                for dx in range(2):
                    if hash2(x + dx, y + dy, seed) > 0.12:
                        put(img, x + dx, y + dy, (*c, 255))
    # extra leaf flecks so it does not read as a 2×2 grid
    for i in range(18):
        x = int(hash2(i, 4, seed) * 16) % 16
        y = int(hash2(i, 8, seed) * 16) % 16
        put(img, x, y, (*shade(greens[i % len(greens)], depth), 255))
    return img


def water_face(face: str) -> Image.Image:
    seed = seed_of("water", face)
    if face == "top":
        base, hi, alpha = (48, 122, 186), (120, 196, 230), 210
    elif face == "side":
        base, hi, alpha = (36, 98, 168), (72, 160, 210), 190
    else:
        base, hi, alpha = (22, 64, 120), (40, 100, 160), 230
    img = Image.new("RGBA", (CELL, CELL), (*base, alpha))
    for y in range(CELL):
        for x in range(CELL):
            if face == "top":
                wave = math.sin((x + hash2(x, y, seed) * 2) * 0.9 + y * 0.35)
                t = 0.5 + 0.5 * wave
                c = mix(base, hi, t * 0.65 + hash2(x, y, seed) * 0.15)
            elif face == "side":
                t = 0.35 + 0.65 * abs(math.sin(x * 0.7 + y * 0.45 + hash2(x, 0, seed)))
                c = mix(base, hi, t)
                if y % 4 == (x + int(hash2(x, 1, seed) * 3)) % 4:
                    c = mix(c, hi, 0.55)
            else:
                c = mix(base, hi, hash2(x, y, seed) * 0.35)
            put(img, x, y, (*c, alpha))
    return img


def cobble_face(face: str) -> Image.Image:
    img = new_img()
    seed = seed_of("cobblestone", face)
    grout = shade((58, 60, 62), 0.9 if face != "bottom" else 0.75)
    fill(img, grout)
    # irregular cobbles — different layouts per face, not a single icon
    layouts = {
        "top": [(0, 0, 7, 6), (8, 0, 15, 5), (0, 7, 6, 15), (7, 6, 11, 11), (12, 6, 15, 15), (7, 12, 11, 15)],
        "side": [(0, 0, 5, 7), (6, 0, 15, 4), (6, 5, 10, 11), (11, 5, 15, 15), (0, 8, 5, 15), (6, 12, 10, 15)],
        "bottom": [(0, 0, 8, 8), (9, 0, 15, 7), (0, 9, 4, 15), (5, 8, 12, 15), (13, 8, 15, 15)],
    }
    stones = [(130, 132, 136), (108, 112, 116), (150, 148, 142), (96, 100, 104), (142, 138, 128)]
    for i, (x0, y0, x1, y1) in enumerate(layouts[face]):
        c = stones[i % len(stones)]
        if face == "bottom":
            c = shade(c, 0.82)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                # inset 1px from grout on the inner edge for a rounded-block read
                edge = x in (x0, x1) or y in (y0, y1)
                n = hash2(x, y, seed + i)
                pix = shade(c, 0.7 if edge else 0.92 + n * 0.16)
                put(img, x, y, pix)
    return img


def bricks_face(face: str) -> Image.Image:
    img = new_img()
    seed = seed_of("bricks", face)
    mortar = (168, 156, 140) if face != "bottom" else (130, 120, 108)
    bricks = [(155, 78, 60), (140, 68, 52), (172, 90, 68), (128, 60, 46)]
    depth = {"top": 1.04, "side": 1.0, "bottom": 0.86}[face]
    row_shift = 0 if face != "side" else 4
    for y in range(CELL):
        band = (y // 4)
        for x in range(CELL):
            if y % 4 == 0:
                put(img, x, y, mortar)
                continue
            shifted = (x + (band * row_shift)) % 16
            if shifted % 8 == 0:
                put(img, x, y, mortar)
                continue
            brick_i = (band + (x + row_shift) // 8) % len(bricks)
            n = hash2(x, y, seed)
            put(img, x, y, shade(bricks[brick_i], depth * (0.92 + n * 0.12)))
    return img


RENDERERS: dict[tuple[str, str], callable] = {}


def register() -> None:
    RENDERERS[("grass", "top")] = grass_top
    RENDERERS[("grass", "side")] = grass_side
    RENDERERS[("grass", "bottom")] = grass_bottom
    for face in FACES:
        RENDERERS[("dirt", face)] = lambda f=face: dirt_face(f)
        RENDERERS[("stone", face)] = lambda f=face: stone_face(f)
        RENDERERS[("planks", face)] = lambda f=face: planks_face(f)
        RENDERERS[("sand", face)] = lambda f=face: sand_face(f)
        RENDERERS[("leaves", face)] = lambda f=face: leaves_face(f)
        RENDERERS[("water", face)] = lambda f=face: water_face(f)
        RENDERERS[("cobblestone", face)] = lambda f=face: cobble_face(f)
        RENDERERS[("bricks", face)] = lambda f=face: bricks_face(f)
    RENDERERS[("wood", "top")] = lambda: wood_rings("top")
    RENDERERS[("wood", "bottom")] = lambda: wood_rings("bottom")
    RENDERERS[("wood", "side")] = wood_bark


def filename(block_id: str, face: str) -> str:
    return f"{block_id}_{face}.png"


def pixels(img: Image.Image) -> list[tuple[int, ...]]:
    return list(img.getdata())


def mean_rgb(img: Image.Image) -> tuple[float, float, float]:
    data = [p for p in img.getdata() if p[3] > 16]
    if not data:
        return (0.0, 0.0, 0.0)
    n = len(data)
    return (sum(p[0] for p in data) / n, sum(p[1] for p in data) / n, sum(p[2] for p in data) / n)


def black_ratio(img: Image.Image) -> float:
    data = list(img.getdata())
    dark = sum(1 for p in data if p[0] + p[1] + p[2] < 24 and p[3] > 200)
    return dark / len(data)


def verify(images: dict[tuple[str, str], Image.Image]) -> list[str]:
    errors: list[str] = []
    for block_id in CORE:
        for face in FACES:
            img = images[(block_id, face)]
            if img.size != (CELL, CELL):
                errors.append(f"{block_id}_{face}: size {img.size}")
            if img.mode != "RGBA":
                errors.append(f"{block_id}_{face}: mode {img.mode}")
            if black_ratio(img) > 0.12:
                errors.append(f"{block_id}_{face}: too much black ({black_ratio(img):.2f}) — looks like letterboxed icon")
            # corners must not be a black frame
            corners = [img.getpixel((0, 0)), img.getpixel((15, 0)), img.getpixel((0, 15)), img.getpixel((15, 15))]
            if block_id not in {"leaves", "water"} and any(sum(c[:3]) < 20 for c in corners):
                errors.append(f"{block_id}_{face}: black corner — not a full-bleed face")
        top, side, bottom = images[(block_id, "top")], images[(block_id, "side")], images[(block_id, "bottom")]
        if pixels(top) == pixels(side):
            errors.append(f"{block_id}: top == side (faces must be independently authored)")
        if pixels(bottom) == pixels(side) and block_id in {"grass", "wood", "water"}:
            errors.append(f"{block_id}: bottom == side")
        if block_id == "grass" and pixels(top) == pixels(bottom):
            errors.append("grass: top == bottom")
        if block_id == "wood" and pixels(top) == pixels(bottom):
            errors.append("wood: top == bottom (rings must differ)")
        # must not reuse HUD / item icon bytes
        icon = ICONS / f"{block_id}.png"
        if icon.exists():
            hud = Image.open(icon).convert("RGBA")
            for face in FACES:
                if hud.size == (CELL, CELL) and pixels(images[(block_id, face)]) == list(hud.getdata()):
                    errors.append(f"{block_id}_{face}: identical to HUD icon {icon.name}")
    # grass top should be greener than dirt-like side/bottom
    gt, gs = mean_rgb(images[("grass", "top")]), mean_rgb(images[("grass", "side")])
    if gt[1] <= gs[1]:
        errors.append(f"grass: top not greener than side (top G={gt[1]:.1f} side G={gs[1]:.1f})")
    wt, ws = mean_rgb(images[("wood", "top")]), mean_rgb(images[("wood", "side")])
    if abs(wt[0] - ws[0]) + abs(wt[1] - ws[1]) < 8:
        errors.append("wood: top/side means too similar — rings vs bark should separate")
    return errors


def write_manifest() -> None:
    blocks = {}
    for block_id in CORE:
        blocks[block_id] = {
            "top": filename(block_id, "top"),
            "bottom": filename(block_id, "bottom"),
            "side": filename(block_id, "side"),
            "semantics": SEMANTICS[block_id],
            "three_box_maps": ["side", "side", "top", "bottom", "side", "side"],
        }
    payload = {
        "version": 1,
        "issue": "LRM-1603",
        "size": CELL,
        "license": LICENSE_ID,
        "directory": "assets/blocks",
        "naming": "{blockId}_{face}.png",
        "faces": list(FACES),
        "engine_hint": {
            "box_material_order": ["+x", "-x", "+y", "-y", "+z", "-z"],
            "note": (
                "THREE.BoxGeometry groups are +x -x +y -y +z -z. "
                "World meshes must load these face maps — never iconFor() / wiki isometric / HUD icons. "
                "HUD may keep assets/icons/cache/distributable. "
                "cobblestone is delivered even if BLOCK_TYPES does not yet include it."
            ),
        },
        "blocks": blocks,
    }
    (OUT / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def contact_sheet(images: dict[tuple[str, str], Image.Image]) -> None:
    scale = 12
    label_h = 18
    cell = CELL * scale
    cols = 3
    rows = len(CORE)
    pad = 8
    header = 28
    w = pad + cols * (cell + pad)
    h = header + rows * (label_h + cell + pad) + pad
    sheet = Image.new("RGB", (w, h), (28, 30, 34))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default()
    except OSError:
        font = None
    sheet_faces = ("top", "side", "bottom")
    draw.text((pad, 6), "LRM-1603 original cube faces  16x16 nearest  top | side | bottom", fill=(220, 220, 220), font=font)
    for r, block_id in enumerate(CORE):
        y0 = header + r * (label_h + cell + pad)
        draw.text((pad, y0), block_id, fill=(200, 200, 200), font=font)
        for c, face in enumerate(sheet_faces):
            tile = images[(block_id, face)].resize((cell, cell), Image.Resampling.NEAREST)
            if tile.mode == "RGBA":
                bg = Image.new("RGB", tile.size, (40, 44, 52))
                bg.paste(tile, mask=tile.split()[3])
                tile = bg
            sheet.paste(tile, (pad + c * (cell + pad), y0 + label_h))
    PREVIEW.mkdir(parents=True, exist_ok=True)
    sheet.save(PREVIEW / "contact_sheet.png")


def write_license_table() -> None:
    lines = [
        "# Block face licenses (world meshes)",
        "",
        f"License id: `{LICENSE_ID}`",
        "",
        "Original 16×16 cube-face textures for Voxel Atelier (LRM-Teams).",
        "Not derived from Mojang/Microsoft Minecraft textures or zh.minecraft.wiki",
        "inventory / isometric block renders. Dedicated to the public domain (CC0 1.0).",
        "",
        "CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/",
        "",
        "Generated by `tools/block-faces/gen_block_faces.py`.",
        "",
        "| block_id | top | side | bottom | license |",
        "|---|---|---|---|---|",
    ]
    for block_id in CORE:
        lines.append(
            f"| `{block_id}` | `{filename(block_id, 'top')}` | `{filename(block_id, 'side')}` | `{filename(block_id, 'bottom')}` | `{LICENSE_ID}` |"
        )
    lines.append("")
    lines.append("Do not copy `assets/icons/cache/restricted/` or wiki previews into this folder.")
    lines.append("")
    (OUT / "licenses" / "LICENSE.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    register()
    OUT.mkdir(parents=True, exist_ok=True)
    images: dict[tuple[str, str], Image.Image] = {}
    for block_id in CORE:
        for face in FACES:
            img = RENDERERS[(block_id, face)]()
            images[(block_id, face)] = img
            img.save(OUT / filename(block_id, face), "PNG")
    errors = verify(images)
    if errors:
        raise SystemExit("block-face verification failed:\n- " + "\n- ".join(errors))
    write_manifest()
    write_license_table()
    contact_sheet(images)
    print(f"wrote {len(images)} faces under {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
