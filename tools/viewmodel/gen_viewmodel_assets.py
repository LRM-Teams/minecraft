#!/usr/bin/env python3
"""Generate original FP viewmodel + destroy-stage assets (LRM-1605).

CC0 1.0 original pixel art — not Mojang / wiki rips.

Outputs under assets/viewmodel/:
  hand_skin.png, sleeve.png
  destroy_stage_0.png … destroy_stage_9.png
  manifest.json, preview/contact_sheet.png, preview/pose_sheet.png
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "viewmodel"
PREVIEW = OUT / "preview"
CELL = 16
CRACK_STAGES = 10
LICENSE_ID = "cc0-original-procedural"

# Steve-ish palette (original; not Mojang pixels)
SKIN = (212, 165, 116, 255)
SKIN_SHADOW = (168, 118, 78, 255)
SKIN_HIGH = (232, 196, 156, 255)
SLEEVE = (61, 110, 165, 255)
SLEEVE_SHADOW = (40, 78, 125, 255)
SLEEVE_HIGH = (92, 142, 198, 255)
NAIL = (232, 210, 190, 255)


def px(img: Image.Image, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), color)


def fill_rect(
    img: Image.Image,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    color: tuple[int, int, int, int],
) -> None:
    for y in range(y0, y1):
        for x in range(x0, x1):
            px(img, x, y, color)


def make_hand_skin() -> Image.Image:
    """16×16 hand/skin tile for BoxGeometry UV (readable as a right hand)."""
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    fill_rect(img, 0, 0, 16, 16, SKIN)
    # palm crease + knuckles
    for x in range(2, 14):
        px(img, x, 7, SKIN_SHADOW)
        px(img, x, 11, SKIN_SHADOW)
    for kx in (3, 6, 9, 12):
        fill_rect(img, kx, 1, kx + 2, 4, SKIN_HIGH)
        px(img, kx, 4, SKIN_SHADOW)
    # fingernail tips along top edge
    for fx in (3, 6, 9, 12):
        px(img, fx, 0, NAIL)
        px(img, fx + 1, 0, NAIL)
    # side shading
    for y in range(16):
        px(img, 0, y, SKIN_SHADOW)
        px(img, 15, y, SKIN_HIGH)
    return img


def make_sleeve() -> Image.Image:
    """16×16 cloth sleeve tile (blue shirt, pixel weave)."""
    img = Image.new("RGBA", (CELL, CELL), SLEEVE)
    for y in range(CELL):
        for x in range(CELL):
            if (x + y) % 4 == 0:
                px(img, x, y, SLEEVE_SHADOW)
            elif (x * 3 + y) % 5 == 0:
                px(img, x, y, SLEEVE_HIGH)
    # cuff strip
    fill_rect(img, 0, 13, 16, 16, SLEEVE_SHADOW)
    for x in range(0, 16, 2):
        px(img, x, 13, SLEEVE_HIGH)
    return img


def crack_paths(stage: int) -> list[list[tuple[int, int]]]:
    """Deterministic progressive crack polylines (stage 0 sparse → 9 dense)."""
    seeds = [
        [(2, 2), (5, 5), (8, 4), (11, 7)],
        [(13, 1), (11, 4), (9, 8), (12, 11)],
        [(1, 12), (4, 10), (7, 13), (10, 11)],
        [(8, 1), (8, 5), (6, 8), (9, 10), (7, 14)],
        [(3, 6), (6, 7), (9, 6), (12, 9)],
        [(14, 8), (11, 9), (8, 12), (5, 14)],
        [(0, 5), (3, 3), (6, 2), (4, 0)],
        [(15, 14), (12, 12), (10, 14), (7, 15)],
        [(5, 0), (5, 3), (3, 5), (1, 4)],
        [(10, 3), (12, 5), (14, 4), (15, 7)],
    ]
    # unlock more paths as stage rises; also extend existing paths
    n = 2 + stage
    paths: list[list[tuple[int, int]]] = []
    for i in range(min(n, len(seeds))):
        path = seeds[i]
        cut = 3 + min(stage, len(path) - 1)
        paths.append(path[:cut])
    return paths


def make_destroy_stage(stage: int) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    alpha = 90 + stage * 14
    width = 1 if stage < 7 else 2
    for path in crack_paths(stage):
        draw.line(path, fill=(18, 18, 18, min(255, alpha)), width=width)
        # light edge for readability on dark blocks
        offset = [(x + 1, y) for x, y in path]
        draw.line(offset, fill=(255, 255, 255, 35 + stage * 4), width=1)
    if stage >= 5:
        # small chip voids
        chips = [(4, 4), (11, 5), (7, 10), (3, 12), (12, 12)]
        for i, (cx, cy) in enumerate(chips[: 1 + stage - 5]):
            fill_rect(img, cx, cy, cx + 2, cy + 2, (0, 0, 0, 40 + stage * 8))
    if stage >= 8:
        fill_rect(img, 6, 6, 10, 10, (0, 0, 0, 55 + (stage - 8) * 30))
    return img


def nearest_scale(img: Image.Image, scale: int) -> Image.Image:
    return img.resize((img.width * scale, img.height * scale), Image.Resampling.NEAREST)


def contact_sheet(frames: list[tuple[str, Image.Image]], cols: int = 5, scale: int = 4) -> Image.Image:
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * CELL * scale, rows * CELL * scale), (30, 30, 34, 255))
    for i, (_name, frame) in enumerate(frames):
        r, c = divmod(i, cols)
        sheet.paste(nearest_scale(frame, scale), (c * CELL * scale, r * CELL * scale))
    return sheet


def pose_sheet(hand: Image.Image, sleeve: Image.Image) -> Image.Image:
    """Simple labeled pose reference for tess (empty / block / tool / sword)."""
    scale = 8
    W, H = 64 * scale, 48 * scale
    sheet = Image.new("RGBA", (W, H), (24, 26, 30, 255))
    draw = ImageDraw.Draw(sheet)
    labels = ["empty", "block", "tool", "sword"]
    for i, label in enumerate(labels):
        ox = 4 * scale + i * 15 * scale
        oy = 8 * scale
        # arm stub
        sleeve_s = nearest_scale(sleeve, scale // 2)
        hand_s = nearest_scale(hand, scale // 2)
        sheet.paste(sleeve_s, (ox, oy), sleeve_s)
        sheet.paste(hand_s, (ox, oy + 8 * (scale // 2)), hand_s)
        # held glyph
        gx, gy = ox + 6 * (scale // 2), oy + 6 * (scale // 2)
        if label == "block":
            draw.rectangle([gx, gy, gx + 5 * scale, gy + 5 * scale], outline=(180, 180, 180, 255), width=2)
            draw.rectangle(
                [gx + 1, gy + 1, gx + 5 * scale - 1, gy + 5 * scale - 1],
                fill=(110, 160, 90, 200),
            )
        elif label == "tool":
            draw.line([gx + 2, gy + 8 * scale, gx + 2, gy], fill=(107, 74, 42, 255), width=3)
            draw.rectangle([gx - 2, gy, gx + 6, gy + 3 * scale], fill=(154, 160, 166, 255))
        elif label == "sword":
            draw.line([gx + 2, gy + 9 * scale, gx + 2, gy], fill=(107, 74, 42, 255), width=3)
            draw.rectangle([gx, gy, gx + 4, gy + 5 * scale], fill=(192, 200, 208, 255))
        draw.text((ox, oy + 20 * scale), label, fill=(220, 220, 220, 255))
    draw.text((4 * scale, 2 * scale), "FP held poses (LRM-1605)", fill=(200, 200, 210, 255))
    return sheet


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    (OUT / "licenses").mkdir(parents=True, exist_ok=True)

    hand = make_hand_skin()
    sleeve = make_sleeve()
    hand.save(OUT / "hand_skin.png")
    sleeve.save(OUT / "sleeve.png")

    stages: list[Image.Image] = []
    for s in range(CRACK_STAGES):
        frame = make_destroy_stage(s)
        frame.save(OUT / f"destroy_stage_{s}.png")
        stages.append(frame)

    frames = [("hand_skin", hand), ("sleeve", sleeve)] + [
        (f"destroy_stage_{i}", stages[i]) for i in range(CRACK_STAGES)
    ]
    contact_sheet(frames, cols=6, scale=4).save(PREVIEW / "contact_sheet.png")
    pose_sheet(hand, sleeve).save(PREVIEW / "pose_sheet.png")

    (OUT / "licenses" / "LICENSE.md").write_text(
        "# License\n\nAll files under `assets/viewmodel/` are original procedural "
        "pixel art dedicated to the public domain under **CC0 1.0**.\n\n"
        "Do not replace with Mojang / Minecraft wiki rips.\n",
        encoding="utf-8",
    )

    manifest = {
        "version": 1,
        "issue": "LRM-1605",
        "license": LICENSE_ID,
        "cell": CELL,
        "crack_stages": CRACK_STAGES,
        "textures": {
            "hand_skin": "hand_skin.png",
            "sleeve": "sleeve.png",
            "destroy_stages": [f"destroy_stage_{i}.png" for i in range(CRACK_STAGES)],
        },
        "viewmodel": {
            "camera_anchor": {"x": 0.28, "y": -0.32, "z": -0.42},
            "arm_box": {"size": [0.12, 0.28, 0.12], "local": [0, -0.06, 0.02]},
            "hand_box": {"size": [0.11, 0.11, 0.14], "local": [0, -0.24, 0.04]},
            "held_anchor": {"local": [0.02, -0.28, -0.02]},
            "materials": {
                "arm": {"map": "sleeve.png", "fallback_color": "#3d6ea5"},
                "hand": {"map": "hand_skin.png", "fallback_color": "#d4a574"},
            },
        },
        "held_poses": {
            "empty": {"note": "仅手臂+手可见；无 held mesh"},
            "block": {
                "size": 0.22,
                "local": [0.06, 0.02, -0.08],
                "rotation_euler": [0.25, 0.6, 0.1],
                "note": "用世界六面贴图或 blockColor；热键切换即时更新",
            },
            "tool": {
                "local": [0.04, 0.02, -0.06],
                "rotation_euler": [0.9, 0.35, -0.4],
                "note": "镐/斧/铲：木柄+金属头；装备工具优先于热键方块",
            },
            "sword": {
                "local": [0.04, 0.02, -0.06],
                "rotation_euler": [0.9, 0.35, -0.4],
                "note": "剑：更长刃、更窄截面；同 tool 锚点",
            },
        },
        "animation": {
            "idle_bob": {"amp": 0.008, "freq_hz_approx": 0.64},
            "lmb_hold_swing": {
                "phase_speed": 9.0,
                "root_rot": [0.55, 0.15, 0.35],
                "arm_rot_x": 0.85,
                "note": "sin 脉冲循环；与挖掘时长/工具速度由引擎进度驱动，设计侧只定姿态幅度",
            },
            "lmb_tap_release": {"phase_speed": 14.0, "note": "松手后补完半周期再回 idle"},
            "crack_sync": {
                "stages": CRACK_STAGES,
                "map": "progress[0,1) → floor(p*10)；p>=1 → stage 9",
                "overlay": "1.02 立方体叠在目标方块中心；transparent + polygonOffset",
            },
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
