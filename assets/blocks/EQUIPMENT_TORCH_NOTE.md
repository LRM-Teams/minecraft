# LRM-1612 · 装备 / 火把 / 锭物品外观说明

服务 LRM-1610 闭环。世界矿石走本目录六面；HUD/热键物品走 `assets/icons/cache/distributable/`（`gen_distributable.py`，CC0）。

## 世界面（已交付）

| blockId | 说明 |
|---|---|
| coal_ore / copper_ore / iron_ore / gold_ore / diamond_ore / lapis_ore / redstone_ore | 石基质 + 独立 fleck；top/side/bottom 布局不同 |
| obsidian | 深紫黑曜石；侧面竖向层理 |

命名：`{blockId}_{top\|bottom\|side}.png`。再生：`python3 tools/block-faces/gen_ore_faces.py`

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
