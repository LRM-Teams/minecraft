# assets/blocks — 世界网格六面贴图（LRM-1603）

世界立方体用这里的 **面贴图**。热键栏 HUD 继续走 `assets/icons/`（`iconFor()`），**不得**再把 wiki 等距/物品预览铺满六面。

## 命名与目录

```
assets/blocks/<blockId>_<face>.png
```

- `blockId`：与引擎 id 对齐（`grass` / `wood` / `planks` …）。圆石按 wiki 语义交付为 `cobblestone`（即使 `BLOCK_TYPES` 尚未收录）。
- `face`：`top` | `bottom` | `side`
- 尺寸：16×16 RGBA，像素最近邻放大
- 许可：`cc0-original-procedural`（见 `licenses/LICENSE.md`）
- 清单：`manifest.json`（tess 接线只读此文件即可）

四侧共用 `side`。原木默认轴为 Y：`+X/-X/+Z/-Z` → `wood_side`；`+Y` → `wood_top`；`-Y` → `wood_bottom`。需要横放原木时再扩 `side_ns` / `side_ew`，本卡不预置重复文件。

`THREE.BoxGeometry` 材质槽顺序：`+x, -x, +y, -y, +z, -z` → `[side, side, top, bottom, side, side]`。

## 六面惯例（对标 wiki 语义，不用 wiki 像素）

| blockId | top | side | bottom |
|---|---|---|---|
| grass | 草皮 | 上缘草 + 下缘泥土 | 泥土 |
| wood | 年轮 | 树皮纵纹 | 年轮（独立、略深） |
| dirt / stone / sand | 同类材质顶 | 同类侧（独立噪声） | 同类底（略深） |
| planks / bricks | 板/砖顶 | 板/砖侧（接缝错位） | 略深底 |
| leaves | 叶簇+孔隙 | 叶簇+孔隙 | 背光叶簇 |
| water | 静水面 | 竖直流纹 | 深水 |
| cobblestone | 不规则圆石 | 另一套石块布局 | 圆石底 |

禁止：把 `iconFor()`、`assets/icons/cache/restricted/`、wiki 物品图当世界面。

再生：`python3 tools/block-faces/gen_block_faces.py`  
预览：`preview/contact_sheet.png`（16× 最近邻）。
