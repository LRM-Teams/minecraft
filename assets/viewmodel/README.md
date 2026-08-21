# assets/viewmodel — 第一人称手 / 持物 / 挖掘裂纹（LRM-1605）

对标原版 FP 手感的**设计交付**：可接入贴图 + 锚点/姿态/节拍规格。引擎接线由 tess（LRM-1606 已有程序占位）替换为本目录资产。

许可：`cc0-original-procedural`（见 `licenses/LICENSE.md`）。禁止 Mojang / wiki 资源入库。

## 文件

| 路径 | 用途 |
|---|---|
| `hand_skin.png` | 右手皮肤 16×16（手盒材质） |
| `sleeve.png` | 袖子布料 16×16（上臂材质） |
| `destroy_stage_0.png` … `destroy_stage_9.png` | 破坏裂纹 10 档（对标 destroy_stage） |
| `manifest.json` | 相机锚点、持物姿态、动画幅度、裂纹映射 |
| `preview/contact_sheet.png` | 全资产预览（最近邻放大） |
| `preview/pose_sheet.png` | empty / block / tool / sword 姿态示意 |

再生：`python3 tools/viewmodel/gen_viewmodel_assets.py`

## 接入约定（给 tess）

1. **相机右下**：`root` 本地 `(0.28, -0.32, -0.42)`，父节点 = 相机。
2. **手臂**：上臂盒贴 `sleeve.png`；手盒贴 `hand_skin.png`；尺寸见 manifest。
3. **持物锚点**：`held_anchor` 相对 root；热键/装备切换即时换 mesh。
   - 装备工具优先于热键方块（与现 `heldKind` 一致）。
   - 方块：小立方体，可用世界六面贴图。
   - 工具/剑：柄+头（剑刃更长更薄）。
4. **动作**：
   - 空闲轻微 bob。
   - 长按 LMB：挥动循环（`phase_speed≈9`，臂 `rot.x` 峰值 ≈0.85）。
   - 短按：加速补完半周期回 idle。
5. **裂纹**：`progress∈[0,1)` → `floor(p*10)`；`p≥1` → stage 9。叠 1.02 透明立方体于目标方块中心，用对应 `destroy_stage_N.png` 替换程序 `makeCrackTexture`。

细节数值以 `manifest.json` 为准；预览图仅供审阅。
