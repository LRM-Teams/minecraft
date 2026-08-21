import * as THREE from "three";
import "./style.css";
import { createMob, updateEntities, type Mob, type MobKind } from "./entities";
import { createGuardiansForWorld, updateGuardians, type VillageGuardian } from "./guardians";
import { greetNearbyVillagers, createVillagersForWorld, tradeWithVillager, updateVillagers, villagerDrop, type Villager } from "./villagers";
import { createRaid, updateRaid, shouldStartRaid, raidProgress, type Raid } from "./raids";
import {
  isWitherStructure,
  summonWither,
  updateWither,
  witherDropBlocks,
  type WitherBoss,
  type WitherSkull,
} from "./wither";
import { craftBricks, craftPlanks, createInventory, type Inventory } from "./inventory";
import { breakDuration, isMineable } from "./mining";
import { Soundscape } from "./sound";
import { createWorldSlot, deleteWorldSlot, listWorldSlots, loadActiveWorld, loadWorldSlot, renameWorldSlot, saveWorldSlot, type PlayerSave, type WorldSlot } from "./storage";
import { MultiplayerRoom, newPlayer, normalizeRoomCode, type PlayerState } from "./multiplayer";
import { BLOCK_TYPES, CHUNK_SIZE, type BlockPosition, type BlockType, type WorldSnapshot, VoxelWorld } from "./world";
import { biomeAt, type BiomeVariant } from "./biomes";
import { ITEM_LABELS, SWORD_DAMAGE, isPickaxe, isSword, isTool, type ExtraItem } from "./items";
import {
  EXHAUSTION,
  FOOD_DEFS,
  FOOD_IDS,
  MAX_FOOD_LEVEL,
  addExhaustion,
  appleDropFromLeaves,
  canSprint,
  createHungerState,
  eatFood,
  formatHungerBar,
  pickFoodToEat,
  isFoodId,
  snapshotHunger,
  tickHunger,
  wheatDropFromGrass,
  type FoodId,
  type HungerState,
} from "./hunger";
import {
  createArmorState,
  formatArmorBar,
  mitigateDamage,
  armorSlotOf,
  isArmorPiece,
  snapshotArmor,
  totalArmorPoints,
  type ArmorState,
} from "./armor";
import {
  MOB_KILL_XP,
  addExperience,
  countBookshelfPower,
  createEnchantSaveState,
  efficiencyMultiplier,
  findGear,
  formatEnchantments,
  formatXpBar,
  lapisDropCount,
  miningXpFor,
  mitigateWithProtection,
  removeGear,
  sharpnessBonus,
  snapshotEnchant,
  type Enchantment,
  type EnchantedItem,
} from "./enchanting";
import {
  createEffects,
  drinkPotion,
  formatEffectsHud,
  pickPotionToDrink,
  snapshotBrewing,
  tickEffects,
  type ActiveEffect,
} from "./brewing";
import { createDayClock, dayProgress, sunHeightAt, type DayClock } from "./daycycle";
import { breakBedAt, hostileWithinSleepRange, placeBedPair, trySleepInBed } from "./bed";
import { TORCH_LIGHT, canPlaceTorchAt, torchesNear } from "./torch";
import {
  canPlaceRedstoneDeviceAt,
  canPlaceRedstoneDustAt,
  canPlaceRedstoneLampAt,
  clearLeverAt,
  computeRedstoneNetwork,
  createLeverStates,
  isLampLitAt,
  isTorchOnAt,
  redstoneDropCount,
  serializeRedstone,
  toggleLeverAt,
  wirePowerAt,
  type LeverStates,
} from "./redstone";
import {
  activeBrewingStand,
  activeFurnace,
  closeBrew,
  closeCraft,
  closeEnchant,
  closeFurnace,
  createStations,
  handleBrewClick,
  handleCraftClick,
  handleEnchantClick,
  handleFurnaceClick,
  openBrewAt,
  openEnchantAt,
  openFurnaceAt,
  openInventoryCraft,
  openTableCraft,
  renderBrewPanelHtml,
  renderCraftPanelHtml,
  renderEnchantPanelHtml,
  renderFurnacePanelHtml,
  tickAllBrewingStands,
  tickAllFurnaces,
} from "./stations";
import {
  createPortalLink,
  defaultPortalGeometry,
  isWithinPortalOpening,
  NETHER_BLOCKS,
  NetherWorld,
  portalTiles,
  teleportPosition,
  type NetherBlockId,
  type PortalLink,
  type PortalSide,
} from "./nether";
import {
  END_BLOCKS,
  EndWorld,
  endSpawn,
  type EndBlockId,
} from "./end";
import { createEnderDragon, hitEnderDragon, updateEnderDragon } from "./enderDragon";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

app.innerHTML = `
  <div id="hud">
    <div id="brand">VOXEL <span>ATELIER</span></div>
    <div id="seed"></div>
    <div id="world-time"></div>
    <div id="health"></div>
    <div id="hunger"></div>
    <div id="armor"></div>
    <div id="xp"></div>
    <div id="effects"></div>
    <div id="audio-state"></div>
    <div id="network-state"></div>
    <div id="village-state"></div>
    <div id="guardian-state"></div>
    <div id="raid-state"></div>
    <div id="biome-state"></div>
    <div id="dimension-state"></div>
    <div id="wither-state"></div>
    <div id="wither-star"></div>
    <div id="crosshair">+</div>
    <div id="hint">点击进入世界 · WASD 移动 · 空格跳跃 · 左键挖掘/攻击 · 右键放置/开工作台熔炉附魔台酿造台/睡床 · E 合成 · R 工具 · T 进食喝药 · N 传送门 · B 末地 · H 凋灵 · G 图鉴</div>
    <div id="status"></div>
    <div id="hotbar"></div>
    <div id="craft-panel" class="station-panel hidden"></div>
    <div id="furnace-panel" class="station-panel hidden"></div>
    <div id="enchant-panel" class="station-panel hidden"></div>
    <div id="brew-panel" class="station-panel hidden"></div>
    <aside id="codex" class="hidden">
      <div class="codex-title">生存图鉴 <small>G 关闭</small></div>
      <p>对标原版：背包 <kbd>E</kbd> 开 2×2 合成；放置工作台后右键开 3×3；熔炉烧炼矿石/沙子。</p>
      <p>流程：原木→木板→木棍→工作台→熔炉→烧锭→铁/金/钻工具；煤/木炭+木棍→火把；羊毛×3+木板×3→床。</p>
      <div class="recipe"><kbd>C</kbd> 原木 → 木板 ×4（快捷）</div>
      <div class="recipe"><kbd>V</kbd> 石头 ×4 → 石砖 ×4（快捷）</div>
      <div class="recipe"><kbd>F</kbd> 玻璃需熔炉烧沙子（快捷已禁用）</div>
      <div class="recipe">火把：煤/木炭 + 木棍 → ×4（可放置照明）</div>
      <div class="recipe">床：羊毛×3 + 木板×3（工作台）· 夜间右键跳过到早晨并设重生点</div>
      <div class="recipe">饥饿：行动耗尽饱食；树叶掉苹果、草方块掉小麦；小麦×3→面包；生牛肉熔炉→熟牛排；T 进食/喝药</div>
      <div class="recipe">护甲：皮革/铁锭工作台合成头盔·胸甲·护腿·靴子；E 面板装备；减伤对标原版；蛮牛掉皮革</div>
      <div class="recipe">附魔：甘蔗×3→纸；纸×3+皮革→书；书+钻石×2+黑曜石×4→附魔台；书架环绕增强；青金石+经验附魔锋利/保护/效率</div>
      <div class="recipe">酿造：烈焰棒+石头×3→酿造台；玻璃×3→玻璃瓶；甘蔗→糖；烈焰棒→烈焰粉×2；金锭+苹果→闪烁西瓜；水瓶+下界疣→粗制；再加西瓜/糖/蜘蛛眼→治疗/迅捷/剧毒</div>
      <p class="codex-note">数字键切换方块；R 循环手持工具；右键工作台/熔炉/附魔台/酿造台/床/村民交互。幽火掉烈焰棒与下界疣；潜行者掉蜘蛛眼。</p>
    </aside>
  </div>
  <div id="start-screen">
    <div class="panel">
      <p class="eyebrow">ORIGINAL VOXEL SANDBOX</p>
      <h1>VOXEL ATELIER</h1>
      <p>探索、采集、建造。一个受经典体素沙盒启发的原创浏览器世界。</p>
      <button id="play">进入世界</button>
      <p class="keys">WASD / 方向键移动　空格跳跃　鼠标视角<br/>左键长按破坏 / 瞄准敌对体攻击　右键放置或开工作台/熔炉<br/>1–0 / 滚轮切换方块　E 合成　R 切换工具　C 木板 · V 石砖 · G 图鉴 · M 音效 · N 下界 · B 末地 · H 凋灵</p>
      <section id="multiplayer-panel">
        <strong>本地联机房间</strong>
        <p>同一网站打开两个标签页，输入相同房间码即可同步探索与建造。</p>
        <div class="room-fields"><input id="player-name" maxlength="18" placeholder="玩家名" autocomplete="nickname"><input id="room-code" maxlength="24" placeholder="房间码，例如 forest-42" autocomplete="off"></div>
        <button id="join-room" class="room-button">创建 / 加入房间</button>
        <small id="room-status">未加入房间 · 适合双标签页试玩</small>
      </section>
      <section id="world-slots">
        <div class="world-slots-head"><strong>本地世界</strong><button id="new-world" class="world-new">＋ 新建</button></div>
        <div id="world-list"></div>
      </section>
      <button id="reset" class="link">重生成当前世界</button>
    </div>
  </div>`;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#8fc8e8");
const fog = new THREE.Fog("#8fc8e8", 28, 86);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = "YXZ";
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.prepend(renderer.domElement);

// --- WebGL context-loss resilience: recover a black/blank scene after the GPU
// restores its context (driver switch / power events) instead of staying black. ---
let rendererLost = false;
renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  rendererLost = true;
}, false);
renderer.domElement.addEventListener("webglcontextrestored", () => {
  rendererLost = false;
  // Force a full rebuild of the active dimension's renderables so textures and
  // meshes come back after the GPU restores its context.
  loadedChunkX = NaN;
  loadedChunkZ = NaN;
  syncRenderedChunks(true);
  syncDimensionState();
  status.textContent = "图形上下文已恢复";
}, false);

const sun = new THREE.DirectionalLight("#fff2c5", 2.8);
sun.position.set(-20, 32, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
scene.add(sun);
const skyColor = new THREE.Color();
const daylight = new THREE.HemisphereLight("#d8efff", "#4a5e35", 2.2);
scene.add(daylight);
const cloudGroup = new THREE.Group();
const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
const cloudBox = new THREE.BoxGeometry(1, 0.45, 0.8);
[
  [-13, 17, -9, 5], [5, 19, -21, 4], [20, 15, 7, 6], [-23, 18, 16, 3],
].forEach(([x, y, z, length]) => {
  const cloud = new THREE.Group();
  for (let index = 0; index < length; index += 1) {
    const puff = new THREE.Mesh(cloudBox, cloudMaterial);
    puff.position.set(x + index * 0.82, y + (index % 2) * 0.18, z);
    cloud.add(puff);
  }
  cloudGroup.add(cloud);
});
scene.add(cloudGroup);
const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xf7f2d2, transparent: true, opacity: 0 });
const moon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), moonMaterial);
scene.add(moon);

/** Live redstone solve used by the block renderer (updated after edits / load). */
let redstoneNet = {
  wirePower: new Map<string, number>(),
  torchOn: new Map<string, boolean>(),
  lampLit: new Map<string, boolean>(),
};
let leverStates: LeverStates = {};
let refreshRedstone: () => void = () => {
  /* assigned once `world` exists */
};
const starPositions: number[] = [];
for (let index = 0; index < 220; index += 1) {
  const theta = index * 2.3999632297;
  const height = 0.12 + ((index * 37) % 100) / 150;
  const radius = Math.sqrt(1 - height * height) * 72;
  starPositions.push(Math.cos(theta) * radius, height * 72, Math.sin(theta) * radius);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xf1f7ff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
scene.add(new THREE.Points(starGeometry, starMaterial));

const colors: Record<BlockType, number> = {
  grass: 0x5f9f47,
  dirt: 0x8c633f,
  stone: 0x7a8186,
  wood: 0x96633e,
  planks: 0xba844d,
  leaves: 0x3f7f43,
  sand: 0xd9c27e,
  water: 0x3d8ec9,
  bricks: 0x9b5341,
  glass: 0x9edfe5,
  coal_ore: 0x3b3f44,
  copper_ore: 0xd07a3a,
  iron_ore: 0xc9a06a,
  gold_ore: 0xe8c94c,
  diamond_ore: 0x5ad2d0,
  lapis_ore: 0x1f4fd8,
  redstone_ore: 0xb01010,
  obsidian: 0x2b2333,
  crafting_table: 0xb8874c,
  furnace: 0x6a6e72,
  enchanting_table: 0x5a2a6e,
  bookshelf: 0x8b5a2b,
  brewing_stand: 0x6a5a48,
  torch: 0xffc15a,
  wool: 0xf0ebe3,
  bed: 0xc43c3c,
  redstone_dust: 0xc41e1e,
  lever: 0x8a7a5a,
  redstone_torch: 0xff3030,
  redstone_lamp: 0x5a4030,
};
const labels: Record<BlockType, string> = {
  grass: "草方块", dirt: "泥土", stone: "石头", wood: "原木", planks: "木板", leaves: "树叶", sand: "沙子", water: "水", bricks: "石砖", glass: "玻璃", coal_ore: "煤矿石", copper_ore: "铜矿石", iron_ore: "铁矿石", gold_ore: "金矿石", diamond_ore: "钻石矿石", lapis_ore: "青金石矿", redstone_ore: "红石矿", obsidian: "黑曜石", crafting_table: "工作台", furnace: "熔炉", enchanting_table: "附魔台", bookshelf: "书架", brewing_stand: "酿造台", torch: "火把", wool: "羊毛", bed: "床", redstone_dust: "红石粉", lever: "拉杆", redstone_torch: "红石火把", redstone_lamp: "红石灯",
};

/** Original hell palette for the nether dimension's module-internal blocks. */
const netherColors: Record<NetherBlockId, number> = {
  netherrack: 0x6e1d21,
  obsidian: 0x2b2333,
  lava: 0xff5a1f,
  glowstone: 0xffd98a,
  nether_portal: 0x9b2bd8,
};
const netherLabels: Record<NetherBlockId, string> = {
  netherrack: "地狱岩", obsidian: "黑曜石", lava: "熔岩", glowstone: "萤石", nether_portal: "传送门",
};

/** Original void palette for the End dimension's module-internal blocks. */
const endColors: Record<EndBlockId, number> = {
  end_stone: 0xdfe2d5,
  obsidian: 0x2b2333,
  end_rock: 0xb7a88f,
  end_portal: 0x37e0c0,
  end_crystal: 0xff7ad9,
};

/** Block types whose per-instance colors may be recoloured by biome variant. */
const BIOME_TINTABLE: ReadonlySet<BlockType> = new Set<BlockType>(["grass", "leaves", "wood", "planks"] as const);
/** Per-variant colour wash (multiplies the block texture) for the Phase-3 biomes. */
const BIOME_TINTS: Record<Exclude<BiomeVariant, "default">, THREE.Color> = {
  // Pale Garden: cold grey-blue desaturation → eerie, misty wood.
  pale: new THREE.Color(0xb9bfce),
  // Sakura: warm pink wash → cherry-blossom canopies and petal floor.
  sakura: new THREE.Color(0xf0b8c6),
};

type BlockFace = "side" | "top" | "bottom";
const textureCache = new Map<string, THREE.CanvasTexture>();
const colorHex = (color: THREE.Color) => `#${color.getHexString()}`;

/** Build original 16px textures at runtime, keeping the game asset-free and crisp at every scale. */
const blockTexture = (type: BlockType, face: BlockFace = "side"): THREE.CanvasTexture => {
  const cacheKey = `${type}-${face}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas texture context is unavailable");
  const base = new THREE.Color(colors[type]);
  const paint = (color: THREE.Color, x = 0, y = 0, width = 16, height = 16): void => {
    context.fillStyle = colorHex(color);
    context.fillRect(x, y, width, height);
  };
  const noise = (x: number, y: number): number => {
    const seed = type.split("").reduce((total, character) => total + character.charCodeAt(0), 0);
    return Math.abs(Math.sin((x + 1) * 12.91 + (y + 1) * 78.23 + seed * 0.37)) % 1;
  };

  if (type === "leaves") {
    context.clearRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if (noise(x, y) > 0.2) paint(base.clone().multiplyScalar(0.75 + noise(x + 2, y) * 0.45), x, y, 2, 2);
    }
  } else if (type === "grass" && face === "side") {
    const dirt = new THREE.Color(colors.dirt);
    paint(dirt);
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (y < 3 || noise(x, y) > 0.28 + y * 0.08) paint(base.clone().multiplyScalar(0.8 + noise(x, y) * 0.35), x, y, 1, 1);
      }
    }
  } else if (type === "grass" && face === "bottom") {
    paint(new THREE.Color(colors.dirt));
  } else if (type === "coal_ore" || type === "copper_ore" || type === "iron_ore" || type === "gold_ore" || type === "diamond_ore" || type === "lapis_ore" || type === "redstone_ore") {
    // Ores: stone host rock with a bright mineral core and scattered flecks.
    paint(new THREE.Color(colors.stone));
    for (let y = 2; y < 16; y += 3) for (let x = 2; x < 16; x += 3) {
      paint(base.clone().multiplyScalar(0.85 + noise(x, y) * 0.3), x, y, 3, 3);
      if (noise(x + 5, y + 5) > 0.55) paint(new THREE.Color(0xffffff).multiplyScalar(0.8 + noise(x, y) * 0.25), x + 1, y, 1, 1);
    }
  } else if (type === "torch") {
    paint(new THREE.Color(0x5a3a22));
    paint(new THREE.Color(0xffe08a), 5, 0, 6, 7);
    paint(new THREE.Color(0xff7a1a), 6, 1, 4, 4);
  } else if (type === "redstone_torch") {
    paint(new THREE.Color(0x5a3a22));
    paint(new THREE.Color(0xff6060), 5, 0, 6, 7);
    paint(new THREE.Color(0xc01010), 6, 1, 4, 4);
  } else if (type === "redstone_dust") {
    paint(new THREE.Color(0x2a1010));
    paint(base, 2, 6, 12, 4);
    paint(base.clone().multiplyScalar(1.2), 4, 5, 8, 6);
  } else if (type === "lever") {
    paint(new THREE.Color(0x6a6e72));
    paint(new THREE.Color(0x8a7a5a), 6, 2, 4, 10);
    paint(new THREE.Color(0xc9b896), 5, 1, 6, 3);
  } else if (type === "redstone_lamp") {
    paint(new THREE.Color(0x3a3020));
    paint(base, 2, 2, 12, 12);
    paint(new THREE.Color(0xffd070), 5, 5, 6, 6);
  } else if (type === "wool") {
    paint(base);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) {
      paint(base.clone().multiplyScalar(0.88 + noise(x, y) * 0.2), x, y, 4, 4);
    }
  } else if (type === "bed") {
    const wood = new THREE.Color(colors.planks);
    paint(wood);
    paint(base, 0, 0, 16, 9);
    for (let x = 0; x < 16; x += 2) paint(base.clone().multiplyScalar(0.85), x, 2, 1, 5);
  } else {
    paint(base);
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if (type === "planks" && (y % 6 === 0 || x === 0 || x === 8)) paint(base.clone().multiplyScalar(0.55), x, y, type === "planks" ? 2 : 1, type === "planks" ? 1 : 1);
      else if (type === "wood" && (x % 5 === 0 || (face === "top" && noise(x, y) > 0.66))) paint(base.clone().multiplyScalar(0.62), x, y, 1, 2);
      else if (type === "bricks" && (y % 4 === 0 || (x + Math.floor(y / 4) * 4) % 8 === 0)) paint(base.clone().multiplyScalar(0.58), x, y, 2, 1);
      else if (type === "glass" && (x === y || x + y === 14 || noise(x, y) > 0.82)) paint(base.clone().multiplyScalar(1.22), x, y, 1, 1);
      else if (type === "water" && y % 5 === 0) paint(base.clone().multiplyScalar(1.3), x, y, 2, 1);
      else if (type !== "planks" && type !== "wood" && type !== "water" && noise(x, y) > 0.58) paint(base.clone().multiplyScalar(0.72 + noise(x + 4, y) * 0.45), x, y, 2, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  textureCache.set(cacheKey, texture);
  return texture;
};

const box = new THREE.BoxGeometry(1, 1, 1);
const matrix = new THREE.Matrix4();
/** Neutral tint (white) = no biome wash. */
const ONE_WHITE = new THREE.Color(0xffffff);

/**
 * Build a Lambert material for a block. Biome wash is applied via `tint` on
 * `material.color` — never via InstancedMesh `vertexColors` / `instanceColor`.
 *
 * Why: on several real GPUs (ANGLE / strict GL), `vertexColors:true` without a
 * fully-bound instanceColor buffer (or even *with* setColorAt on multi-material
 * grass meshes) still renders the mesh pitch black. The screenshot pattern
 * "sky/UI/glass OK, grass+trees black silhouettes" is that trap. Nether/End
 * already keep vertexColors off; overworld follows the same rule.
 */
const blockMaterial = (type: BlockType, tint: THREE.Color = ONE_WHITE): THREE.Material | THREE.Material[] => {
  const material = (face: BlockFace = "side") => new THREE.MeshLambertMaterial({
    color: tint.clone(),
    map: blockTexture(type, face),
    transparent: type === "leaves" || type === "water" || type === "glass",
    opacity: type === "water" ? 0.7 : type === "glass" ? 0.4 : 1,
    alphaTest: type === "leaves" ? 0.2 : 0,
    depthWrite: type !== "water" && type !== "glass",
    vertexColors: false,
  });
  if (type !== "grass") return material();
  const side = material("side");
  return [side, side, material("top"), material("bottom"), side, side];
};

type BlockMeshBucket = { type: BlockType; tint: THREE.Color; positions: BlockPosition[] };

class BlockRenderer {
  /** Keyed by `type` or `type:variant` so biome wash can use material.color safely. */
  private meshes = new Map<string, THREE.InstancedMesh>();

  rebuild(world: VoxelWorld, centerX: number, centerZ: number): void {
    this.meshes.forEach((mesh) => {
      scene.remove(mesh);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
    this.meshes.clear();

    const buckets = new Map<string, BlockMeshBucket>();
    world.visibleBlocks(centerX, centerZ, 2).forEach(({ type, position }) => {
      let key: string = type;
      let tint = ONE_WHITE;
      if (BIOME_TINTABLE.has(type)) {
        const variant = biomeAt(position.x, position.z, world.seed).variant;
        key = `${type}:${variant}`;
        tint = variant === "default" ? ONE_WHITE : BIOME_TINTS[variant];
      } else if (type === "redstone_lamp") {
        key = isLampLitAt(redstoneNet.lampLit, position) ? "redstone_lamp:lit" : "redstone_lamp:off";
      } else if (type === "redstone_torch") {
        key = isTorchOnAt(redstoneNet.torchOn, position) ? "redstone_torch:on" : "redstone_torch:off";
      } else if (type === "redstone_dust") {
        const p = wirePowerAt(redstoneNet.wirePower, position);
        key = `redstone_dust:${p > 0 ? Math.ceil(p / 5) : 0}`;
      }
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { type, tint, positions: [] };
        buckets.set(key, bucket);
      }
      bucket.positions.push(position);
    });

    buckets.forEach((bucket, key) => {
      const { type, tint, positions } = bucket;
      if (!positions.length) return;
      const mesh = new THREE.InstancedMesh(box, blockMaterial(type, tint), positions.length);
      mesh.castShadow = type !== "leaves" && type !== "torch" && type !== "redstone_dust" && type !== "lever" && type !== "redstone_torch";
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      positions.forEach((position, index) => {
        if (type === "torch" || type === "redstone_torch") {
          matrix.compose(
            new THREE.Vector3(position.x, position.y - 0.12, position.z),
            new THREE.Quaternion(),
            new THREE.Vector3(0.22, 0.72, 0.22),
          );
        } else if (type === "redstone_dust") {
          matrix.compose(
            new THREE.Vector3(position.x, position.y - 0.42, position.z),
            new THREE.Quaternion(),
            new THREE.Vector3(0.92, 0.08, 0.92),
          );
        } else if (type === "lever") {
          matrix.compose(
            new THREE.Vector3(position.x, position.y - 0.15, position.z),
            new THREE.Quaternion(),
            new THREE.Vector3(0.35, 0.7, 0.35),
          );
        } else if (type === "bed") {
          matrix.compose(
            new THREE.Vector3(position.x, position.y - 0.2, position.z),
            new THREE.Quaternion(),
            new THREE.Vector3(1, 0.55, 1),
          );
        } else {
          matrix.makeTranslation(position.x, position.y, position.z);
        }
        mesh.setMatrixAt(index, matrix);
      });
      // Lit lamps / torch on-off / dust power: wash material from bucket key.
      if (type === "redstone_lamp") {
        const lit = key.endsWith(":lit");
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshLambertMaterial) {
            mat.color.setHex(lit ? 0xffe08a : colors.redstone_lamp);
            mat.emissive = new THREE.Color(lit ? 0xffaa44 : 0x000000);
            mat.emissiveIntensity = lit ? 0.65 : 0;
          }
        });
      }
      if (type === "redstone_dust") {
        const band = Number(key.split(":")[1] ?? 0);
        const t = band / 3;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshLambertMaterial) {
            mat.color.setRGB(0.35 + 0.55 * t, 0.05 + 0.05 * t, 0.05);
          }
        });
      }
      if (type === "redstone_torch") {
        const on = key.endsWith(":on");
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshLambertMaterial) {
            mat.color.setHex(on ? 0xff4040 : 0x4a2020);
            mat.emissive = new THREE.Color(on ? 0xff2020 : 0x000000);
            mat.emissiveIntensity = on ? 0.45 : 0;
          }
        });
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.positions = positions;
      mesh.userData.blockType = type;
      this.meshes.set(key, mesh);
      scene.add(mesh);
    });
  }

  objects(): THREE.Object3D[] { return [...this.meshes.values()]; }

  show(): void { this.meshes.forEach((mesh) => { mesh.visible = true; }); }

  hide(): void { this.meshes.forEach((mesh) => { mesh.visible = false; }); }
}

/** A per-material texture helper for the module-internal nether blocks. */
const netherMaterial = (type: NetherBlockId): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({
  color: 0xffffff,
  map: blockTextureNether(type),
  transparent: type === "lava",
  opacity: type === "lava" ? 0.9 : 1,
  // No per-instance colors are ever set on nether meshes: enabling vertexColors
  // on an InstancedMesh without instanceColor renders black on some GPUs.
  vertexColors: false,
});

/** Build a 16px runtime texture for a nether-only block (no overworld shared cache). */
const netherTextureCache = new Map<string, THREE.CanvasTexture>();
const blockTextureNether = (type: NetherBlockId): THREE.CanvasTexture => {
  const cached = netherTextureCache.get(type);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas texture context is unavailable");
  const base = new THREE.Color(netherColors[type]);
  const paint = (color: THREE.Color, x = 0, y = 0, width = 16, height = 16): void => {
    context.fillStyle = colorHex(color);
    context.fillRect(x, y, width, height);
  };
  const noise = (x: number, y: number): number => {
    const seed = type.split("").reduce((total, c) => total + c.charCodeAt(0), 0);
    return Math.abs(Math.sin((x + 1) * 12.91 + (y + 1) * 78.23 + seed * 0.37)) % 1;
  };
  if (type === "lava") {
    paint(new THREE.Color(0xff3d1a));
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if (noise(x, y) > 0.35) paint(base.clone().multiplyScalar(0.8 + noise(x + 3, y) * 0.5), x, y, 2, 2);
    }
  } else if (type === "nether_portal") {
    paint(base);
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if ((x + y) % 4 === 0 || noise(x, y) > 0.72) paint(base.clone().multiplyScalar(1.5), x, y, 2, 2);
    }
  } else if (type === "glowstone") {
    paint(base);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) {
      paint(new THREE.Color(0xffffff), x + 2, y + 2, 2, 2);
      if (noise(x, y) > 0.5) paint(base.clone().multiplyScalar(1.2), x, y, 4, 4);
    }
  } else {
    paint(base);
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if (noise(x, y) > 0.58) paint(base.clone().multiplyScalar(0.66 + noise(x + 4, y) * 0.5), x, y, 2, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  netherTextureCache.set(type, texture);
  return texture;
};

const netherMaterialFor = (type: NetherBlockId): THREE.Material => netherMaterial(type);

/**
 * Renders a set of module-internal nether blocks (the nether sub-world terrain,
 * or an overworld portal overlay). Independent of `BlockRenderer` since these
 * blocks are not part of `BLOCK_TYPES`.
 */
class NetherRenderer {
  private meshes = new Map<NetherBlockId, THREE.InstancedMesh>();
  private positions = new Map<NetherBlockId, BlockPosition[]>();

  rebuild(entries: { position: BlockPosition; type: NetherBlockId }[]): void {
    this.meshes.forEach((mesh) => {
      scene.remove(mesh);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
    this.meshes.clear();
    this.positions.clear();
    NETHER_BLOCKS.forEach((type) => this.positions.set(type, []));
    entries.forEach(({ position, type }) => this.positions.get(type)?.push(position));
    NETHER_BLOCKS.forEach((type) => {
      const positions = this.positions.get(type) ?? [];
      if (!positions.length) return;
      const mesh = new THREE.InstancedMesh(box, netherMaterialFor(type), positions.length);
      mesh.castShadow = type !== "nether_portal" && type !== "lava";
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      positions.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.positions = positions;
      mesh.userData.nether = true;
      this.meshes.set(type, mesh);
      scene.add(mesh);
    });
  }

  show(): void { this.meshes.forEach((mesh) => { mesh.visible = true; }); }
  hide(): void { this.meshes.forEach((mesh) => { mesh.visible = false; }); }
  objects(): THREE.Object3D[] { return [...this.meshes.values()]; }
}

/** A per-material texture helper for the module-internal End blocks. */
const endMaterial = (type: EndBlockId): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({
  color: 0xffffff,
  map: blockTextureEnd(type),
  transparent: type === "end_portal" || type === "end_crystal",
  opacity: type === "end_portal" ? 0.85 : type === "end_crystal" ? 0.92 : 1,
  // End meshes never set per-instance colours, so vertexColors stays off.
  vertexColors: false,
});

/** Build a 16px runtime texture for an End-only block (no overworld shared cache). */
const endTextureCache = new Map<string, THREE.CanvasTexture>();
const blockTextureEnd = (type: EndBlockId): THREE.CanvasTexture => {
  const cached = endTextureCache.get(type);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas texture context is unavailable");
  const base = new THREE.Color(endColors[type]);
  const paint = (color: THREE.Color, x = 0, y = 0, width = 16, height = 16): void => {
    context.fillStyle = colorHex(color);
    context.fillRect(x, y, width, height);
  };
  const noise = (x: number, y: number): number => {
    const seed = type.split("").reduce((total, c) => total + c.charCodeAt(0), 0);
    return Math.abs(Math.sin((x + 1) * 12.91 + (y + 1) * 78.23 + seed * 0.37)) % 1;
  };
  if (type === "end_portal") {
    // Pulsing pale-teal exit gate.
    paint(new THREE.Color(0x9b2bd8));
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if ((x + y) % 4 === 0 || noise(x, y) > 0.7) paint(new THREE.Color(0x37e0c0), x, y, 2, 2);
    }
  } else if (type === "end_crystal") {
    paint(new THREE.Color(0x2a1038));
    for (let y = 1; y < 15; y += 2) for (let x = 1; x < 15; x += 2) {
      if (noise(x, y) > 0.35) paint(base.clone().multiplyScalar(0.85 + noise(x + 2, y) * 0.4), x, y, 2, 2);
    }
    paint(new THREE.Color(0xffffff), 6, 6, 4, 4);
  } else if (type === "obsidian") {
    paint(base);
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if (noise(x, y) > 0.5) paint(base.clone().multiplyScalar(1.18 + noise(x + 4, y) * 0.3), x, y, 2, 2);
    }
  } else {
    paint(base);
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if (noise(x, y) > 0.58) paint(base.clone().multiplyScalar(0.7 + noise(x + 4, y) * 0.5), x, y, 2, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  endTextureCache.set(type, texture);
  return texture;
};

const endMaterialFor = (type: EndBlockId): THREE.Material => endMaterial(type);

/**
 * Renders the End sub-world terrain. Independent of `BlockRenderer` since these
 * blocks are not part of `BLOCK_TYPES`.
 */
class EndRenderer {
  private meshes = new Map<EndBlockId, THREE.InstancedMesh>();
  private positions = new Map<EndBlockId, BlockPosition[]>();

  rebuild(entries: { position: BlockPosition; type: EndBlockId }[]): void {
    this.meshes.forEach((mesh) => {
      scene.remove(mesh);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
    this.meshes.clear();
    this.positions.clear();
    END_BLOCKS.forEach((type) => this.positions.set(type, []));
    entries.forEach(({ position, type }) => this.positions.get(type)?.push(position));
    END_BLOCKS.forEach((type) => {
      const positions = this.positions.get(type) ?? [];
      if (!positions.length) return;
      const mesh = new THREE.InstancedMesh(box, endMaterialFor(type), positions.length);
      mesh.castShadow = type !== "end_portal" && type !== "end_crystal";
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      positions.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.positions = positions;
      mesh.userData.end = true;
      mesh.userData.endBlock = type;
      this.meshes.set(type, mesh);
      scene.add(mesh);
    });
  }

  show(): void { this.meshes.forEach((mesh) => { mesh.visible = true; }); }
  hide(): void { this.meshes.forEach((mesh) => { mesh.visible = false; }); }
  objects(): THREE.Object3D[] { return [...this.meshes.values()]; }
}

const loadedSlot = loadActiveWorld();
const saved = loadedSlot?.save;
let activeWorldId = loadedSlot?.id;
let world = saved ? VoxelWorld.fromSnapshot(saved.world) : new VoxelWorld(Math.floor(Math.random() * 999999));
leverStates = createLeverStates(saved?.player.redstone?.levers);
refreshRedstone = (): void => {
  redstoneNet = computeRedstoneNetwork(world, leverStates);
};
refreshRedstone();
const blocks = new BlockRenderer();

// --- Phase-3 nether dimension state ---
let nether = saved?.player.nether ? NetherWorld.fromSnapshot(saved.player.nether) : new NetherWorld(world.seed);
/** Which dimension the camera currently inhabits. */
let dimension: "overworld" | "nether" | "end" = saved?.player.dimension ?? "overworld";
/** Overworld portal anchor (along with a linked nether anchor). */
let portalLinks: PortalLink[] = [];
const netherChunks = new NetherRenderer(); // nether sub-world terrain
const overworldPortal = new NetherRenderer(); // overworld portal frame overlay

// --- Phase-3 end dimension state ---
let endWorld = saved?.player.end ? EndWorld.fromSnapshot(saved.player.end) : new EndWorld(world.seed);
const endChunks = new EndRenderer(); // end sub-world terrain
let endDragon = createEnderDragon(9001); // boss lives only inside the End
let endDragonGroup: THREE.Group | undefined;
let endCleared = saved?.player.endCleared ?? false;

const currentTopY = (x: number, z: number): number => {
  if (dimension === "nether") return nether.topY(x, z);
  if (dimension === "end") return endWorld.topY(x, z);
  return world.topY(x, z);
};
const currentSize = (): number => dimension === "end" ? endWorld.size : dimension === "nether" ? nether.size : world.size;

/** Bed-bound respawn; falls back to world spawn. */
let bedSpawn: [number, number, number] | undefined = saved?.player.spawnPoint;
const dayClock: DayClock = createDayClock(saved?.player.dayPhaseMs ?? 0);

const respawnPoint = (): [number, number, number] => {
  if (dimension === "end") {
    const s = endSpawn();
    return [s.x, endWorld.topY(s.x, s.z) + 1.72, s.z];
  }
  if (dimension === "overworld" && bedSpawn) return [...bedSpawn];
  return [0, currentTopY(0, 0) + 1.72, dimension === "nether" ? 4 : 8];
};

const MAX_TORCH_LIGHTS = 14;
const torchLights: THREE.PointLight[] = [];
for (let i = 0; i < MAX_TORCH_LIGHTS; i += 1) {
  const light = new THREE.PointLight(TORCH_LIGHT.color, 0, TORCH_LIGHT.distance, TORCH_LIGHT.decay);
  light.visible = false;
  scene.add(light);
  torchLights.push(light);
}

const syncTorchLights = (): void => {
  if (dimension !== "overworld") {
    torchLights.forEach((light) => { light.intensity = 0; light.visible = false; });
    return;
  }
  const center = {
    x: Math.round(camera.position.x),
    y: Math.round(camera.position.y),
    z: Math.round(camera.position.z),
  };
  const lit = torchesNear(world, center, 28).slice(0, MAX_TORCH_LIGHTS);
  torchLights.forEach((light, index) => {
    const torch = lit[index];
    if (!torch) {
      light.intensity = 0;
      light.visible = false;
      return;
    }
    light.position.set(torch.x, torch.y + 0.35, torch.z);
    light.intensity = TORCH_LIGHT.intensity;
    light.distance = TORCH_LIGHT.distance;
    light.decay = TORCH_LIGHT.decay;
    light.visible = true;
  });
};

const applyDimensionEnvironment = (): void => {
  const inNether = dimension === "nether";
  const inEnd = dimension === "end";
  scene.background = inNether ? new THREE.Color("#3a0f16") : inEnd ? new THREE.Color("#0a0a12") : skyColor;
  fog.color.copy(inNether ? new THREE.Color("#2b070c") : inEnd ? new THREE.Color("#05050a") : skyColor);
  const height = sunHeightAt(dayClock.now());
  sun.intensity = inNether ? 0.6 : inEnd ? 0.35 : 0.15 + height * 2.65;
  daylight.color.set(inNether ? "#c96a5a" : inEnd ? "#b9b3d9" : "#d8efff");
  daylight.intensity = inNether ? 1.5 : inEnd ? 1.1 : 0.25 + height * 1.95;
  cloudGroup.visible = !inNether && !inEnd;
  syncTorchLights();
};

const syncDimensionState = (): void => {
  const dimensionText = document.querySelector<HTMLDivElement>("#dimension-state")!;
  dimensionText.textContent = dimension === "nether" ? "下界 · NETHER" : dimension === "end" ? "末地 · THE END" : "主世界 · OVERWORLD";
  if (dimension === "nether") {
    blocks.hide();
    overworldPortal.hide();
    netherChunks.show();
    endChunks.hide();
    if (endDragonGroup) endDragonGroup.visible = false;
  } else if (dimension === "end") {
    blocks.hide();
    overworldPortal.hide();
    netherChunks.hide();
    endChunks.show();
    spawnDragonMesh();
  } else {
    blocks.show();
    overworldPortal.show();
    netherChunks.hide();
    endChunks.hide();
    if (endDragonGroup) endDragonGroup.visible = false;
  }
  applyDimensionEnvironment();
};

const spawnMobs = (): Mob[] => [
  createMob(1, 5, 2, { kind: "stalker" }),
  createMob(2, -6, -5, { kind: "brute" }),
  createMob(3, 8, -6, { kind: "wisp" }),
];
let mobs = spawnMobs();
let villagers: Villager[] = createVillagersForWorld(world);
let guardians: VillageGuardian[] = createGuardiansForWorld(world);
let raids: Raid[] = [];
let nextRaidId = 1;

// --- Phase-3 Wither boss state ---
let withers: WitherBoss[] = [];
let nextWitherId = 1;
/** Nether Stars granted to the bag (additive optional save field). */
let witherStars = saved?.player.witherStars ?? 0;
/** Mob ids (in `mobs`) tagged as Wither skeleton minions → rendered bone-white. */
const witherMinionIds = new Set<number>();
const witherMeshes = new Map<number, THREE.Group>();
const skullMeshes = new Map<number, THREE.Mesh>();
const witherBodyGeometry = new THREE.BoxGeometry(0.9, 1.4, 0.66);
const witherHeadGeometry = new THREE.BoxGeometry(0.62, 0.62, 0.62);
const witherStyle = {
  body: new THREE.MeshLambertMaterial({ color: 0x2b2622 }),
  head: new THREE.MeshLambertMaterial({ color: 0x3a3230 }),
  eye: new THREE.MeshBasicMaterial({ color: 0xc10f0f }),
  glow: new THREE.MeshBasicMaterial({ color: 0x5b1a8a }),
  minionBody: new THREE.MeshLambertMaterial({ color: 0xcfcbd4 }),
  minionHead: new THREE.MeshLambertMaterial({ color: 0xe9e6ec }),
};
const skullStyle = new THREE.MeshLambertMaterial({ color: 0xa03bd8, emissive: 0x3b0f63 });

const renderWitherStar = (): void => {
  witherStarText.textContent = witherStars > 0 ? `★ 下界之星 × ${witherStars}` : "★ 下界之星 · 尚未取得";
};

const renderWitherState = (): void => {
  const boss = withers[0];
  if (!boss || boss.defeated) {
    witherText.textContent = "";
    return;
  }
  const ratio = Math.max(0, Math.min(1, boss.health / boss.maxHealth));
  const pct = Math.round(ratio * 100);
  const phases = boss.phase === "dying" ? "觉醒狂暴" : boss.phase === "combat" ? "激战中" : "召唤中";
  witherText.innerHTML = `<div class="wither-bar"><div class="wither-fill" style="width:${pct}%"></div></div>凋灵 · ${phases} · ${pct}%`;
};

/** Distinct 3-headed Wither mesh (body + three skull heads), floats at boss.y. */
const createWitherMesh = (boss: WitherBoss): THREE.Group => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(witherBodyGeometry, witherStyle.body);
  body.position.y = 0.7;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // Central head above the body.
  const head = new THREE.Mesh(witherHeadGeometry, witherStyle.head);
  head.position.y = 1.9;
  head.castShadow = true;
  addWitherFace(head, 0, 0);
  group.add(head);
  // Two shoulder heads at the sides.
  [-0.85, 0.85].forEach((sideX) => {
    const sideHead = new THREE.Mesh(witherHeadGeometry, witherStyle.head);
    sideHead.position.set(sideX, 1.15, 0);
    sideHead.castShadow = true;
    addWitherFace(sideHead, sideX, 0);
    group.add(sideHead);
  });
  // A jagged core of obsidian shards for silhouette.
  [-0.5, 0.5].forEach((sx) => {
    const shard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.28), witherStyle.body);
    shard.position.set(sx, 0.4, 0.1);
    group.add(shard);
  });
  group.visible = false;
  scene.add(group);
  return group;
};

const addWitherFace = (head: THREE.Mesh, sideX: number, z: number): void => {
  [-0.14, 0.14].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), witherStyle.eye);
    eye.position.set(ex + sideX * 0.02, 0, 0.32 + z);
    head.add(eye);
  });
};

const syncWitherMeshes = (): void => {
  // Remove meshes for defeated/absent bosses.
  witherMeshes.forEach((mesh, id) => {
    if (!withers.some((boss) => boss.id === id && !boss.defeated)) {
      scene.remove(mesh);
      witherMeshes.delete(id);
    }
  });
  withers.forEach((boss) => {
    if (boss.defeated) return;
    let mesh = witherMeshes.get(boss.id);
    if (!mesh) {
      mesh = createWitherMesh(boss);
      witherMeshes.set(boss.id, mesh);
    }
    mesh.position.set(boss.x, boss.y, boss.z);
    mesh.rotation.y = boss.facing;
    mesh.visible = true;
    // Enraged bosses glow a hotter core.
    witherStyle.body.color.set(boss.phase === "dying" ? 0x5b1a1a : 0x2b2622);
  });
  syncSkullMeshes();
};

const syncSkullMeshes = (): void => {
  const live = new Map<number, boolean>();
  withers.forEach((boss) => boss.projectiles.forEach((skull) => live.set(skull.id, true)));
  skullMeshes.forEach((mesh, id) => { if (!live.has(id)) { scene.remove(mesh); skullMeshes.delete(id); } });
  withers.forEach((boss) => boss.projectiles.forEach((skull) => {
    if (skull.spent) return;
    let mesh = skullMeshes.get(skull.id);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skullStyle);
      scene.add(mesh);
      skullMeshes.set(skull.id, mesh);
    }
    mesh.position.set(skull.x, skull.y, skull.z);
    mesh.visible = true;
  }));
};

const clearWitherMeshes = (): void => {
  witherMeshes.forEach((mesh) => scene.remove(mesh));
  witherMeshes.clear();
  skullMeshes.forEach((mesh) => scene.remove(mesh));
  skullMeshes.clear();
};

/** Reset all Wither bosses, their minions and meshes for a new world/room. */
const resetWithers = (): void => {
  clearWitherMeshes();
  witherMinionIds.clear();
  withers = [];
  nextWitherId = 1;
  renderWitherState();
  renderWitherStar();
};

/** Rebuild the minion visual-tag set so summoned skeletons render bone-white. */
const syncWitherMinionTags = (): void => {
  const live = new Set<number>();
  withers.forEach((boss) => boss.minionIds.forEach((id) => live.add(id)));
  witherMinionIds.clear();
  live.forEach((id) => witherMinionIds.add(id));
};
const villagerMeshes = new Map<number, THREE.Group>();
const villagerBodyGeometry = new THREE.BoxGeometry(0.76, 0.8, 0.54);
const villagerHeadGeometry = new THREE.BoxGeometry(0.6, 0.56, 0.58);
const villagerStyle = {
  robe: new THREE.MeshLambertMaterial({ color: 0x6f8f6a }),
  head: new THREE.MeshLambertMaterial({ color: 0xd8a06a }),
  eye: new THREE.MeshBasicMaterial({ color: 0x3a2f24 }),
  hat: new THREE.MeshLambertMaterial({ color: 0x4a3a2a }),
};
const mobMeshes = new Map<number, THREE.Group>();
const mobBodyGeometry = new THREE.BoxGeometry(0.78, 0.82, 0.56);
const mobHeadGeometry = new THREE.BoxGeometry(0.68, 0.62, 0.62);
const mobStyles: Record<MobKind, { body: THREE.MeshLambertMaterial; head: THREE.MeshLambertMaterial; eye: THREE.MeshBasicMaterial; scale: number; bob: number }> = {
  stalker: {
    body: new THREE.MeshLambertMaterial({ color: 0x59645a }),
    head: new THREE.MeshLambertMaterial({ color: 0x7d8a7c }),
    eye: new THREE.MeshBasicMaterial({ color: 0xf3534d }),
    scale: 1,
    bob: 0,
  },
  brute: {
    body: new THREE.MeshLambertMaterial({ color: 0x785543 }),
    head: new THREE.MeshLambertMaterial({ color: 0xa57655 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xffbd5e }),
    scale: 1.28,
    bob: 0,
  },
  wisp: {
    body: new THREE.MeshLambertMaterial({ color: 0x526d9f, transparent: true, opacity: 0.86 }),
    head: new THREE.MeshLambertMaterial({ color: 0x8ba9dc, transparent: true, opacity: 0.9 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x7bfbff }),
    scale: 0.8,
    bob: 0.18,
  },
  raider: {
    body: new THREE.MeshLambertMaterial({ color: 0x5b3a2e }),
    head: new THREE.MeshLambertMaterial({ color: 0x6e4433 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xd8ff4a }),
    scale: 1.05,
    bob: 0,
  },
};
const mobNames: Record<MobKind, string> = { stalker: "巡游者", brute: "巨岩怪", wisp: "夜光灵", raider: "掠夺者" };

const createMobMesh = (mob: Mob): THREE.Group => {
  const group = new THREE.Group();
  const style = mobStyles[mob.kind];
  const isMinion = witherMinionIds.has(mob.id);
  const bodyMaterial = isMinion ? witherStyle.minionBody : style.body;
  const headMaterial = isMinion ? witherStyle.minionHead : style.head;
  const eyeMaterial = isMinion ? witherStyle.eye : style.eye;
  group.scale.setScalar(style.scale);
  const body = new THREE.Mesh(mobBodyGeometry, bodyMaterial);
  body.position.y = 0.42;
  body.castShadow = true;
  body.receiveShadow = true;
  const head = new THREE.Mesh(mobHeadGeometry, headMaterial);
  head.position.y = 1.05;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(body, head);
  [-0.18, 0.18].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), eyeMaterial);
    eye.position.set(x, 1.1, 0.33);
    group.add(eye);
  });
  group.traverse((object) => { object.userData.mobId = mob.id; });
  scene.add(group);
  return group;
};

const syncMobMeshes = (): void => {
  mobs.forEach((mob) => {
    if (mob.dead) {
      const mesh = mobMeshes.get(mob.id);
      if (mesh) scene.remove(mesh);
      mobMeshes.delete(mob.id);
      return;
    }
    let mesh = mobMeshes.get(mob.id);
    if (!mesh) {
      mesh = createMobMesh(mob);
      mobMeshes.set(mob.id, mesh);
    }
    if (Number.isFinite(mob.y)) {
      const hover = mobStyles[mob.kind].bob * (1 + Math.sin(performance.now() / 240 + mob.id)) * 0.5;
      mesh.position.set(mob.x, mob.y + hover, mob.z);
    }
    mesh.rotation.y = mob.facing;
  });
};

const clearMobMeshes = (): void => {
  mobMeshes.forEach((mesh) => scene.remove(mesh));
  mobMeshes.clear();
};

const guardianMeshes = new Map<number, THREE.Group>();
const guardianBodyGeometry = new THREE.BoxGeometry(0.94, 1.08, 0.68);
const guardianHeadGeometry = new THREE.BoxGeometry(0.78, 0.58, 0.72);
const guardianArmGeometry = new THREE.BoxGeometry(0.22, 0.9, 0.25);
const guardianStyle = {
  body: new THREE.MeshLambertMaterial({ color: 0x87958f }),
  head: new THREE.MeshLambertMaterial({ color: 0xa6b2a8 }),
  vine: new THREE.MeshLambertMaterial({ color: 0x526f47 }),
  eye: new THREE.MeshBasicMaterial({ color: 0xf2d75b }),
};

const createGuardianMesh = (guardian: VillageGuardian): THREE.Group => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(guardianBodyGeometry, guardianStyle.body);
  body.position.y = 0.62;
  body.castShadow = true;
  body.receiveShadow = true;
  const head = new THREE.Mesh(guardianHeadGeometry, guardianStyle.head);
  head.position.y = 1.46;
  head.castShadow = true;
  head.receiveShadow = true;
  const vine = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.18, 0.06), guardianStyle.vine);
  vine.position.set(0, 0.78, 0.37);
  group.add(body, head, vine);
  [-0.58, 0.58].forEach((x) => {
    const arm = new THREE.Mesh(guardianArmGeometry, guardianStyle.body);
    arm.position.set(x, 0.58, 0);
    arm.castShadow = true;
    group.add(arm);
  });
  [-0.2, 0.2].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), guardianStyle.eye);
    eye.position.set(x, 1.5, 0.39);
    group.add(eye);
  });
  group.traverse((object) => { object.userData.guardianId = guardian.id; });
  scene.add(group);
  return group;
};

const clearGuardianMeshes = (): void => {
  guardianMeshes.forEach((mesh) => scene.remove(mesh));
  guardianMeshes.clear();
};

/** Rebuild guards from village plazas whenever a world or room snapshot changes. */
const spawnGuardians = (): void => {
  clearGuardianMeshes();
  guardians = createGuardiansForWorld(world);
  renderGuardianState();
};

const syncGuardianMeshes = (): void => {
  guardians.forEach((guardian) => {
    if (guardian.dead) {
      const mesh = guardianMeshes.get(guardian.id);
      if (mesh) scene.remove(mesh);
      guardianMeshes.delete(guardian.id);
      return;
    }
    let mesh = guardianMeshes.get(guardian.id);
    if (!mesh) {
      mesh = createGuardianMesh(guardian);
      guardianMeshes.set(guardian.id, mesh);
    }
    mesh.position.set(guardian.x, guardian.y, guardian.z);
    mesh.rotation.y = guardian.facing;
  });
};

const createVillagerMesh = (villager: Villager): THREE.Group => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(villagerBodyGeometry, villagerStyle.robe);
  body.position.y = 0.44;
  body.castShadow = true;
  body.receiveShadow = true;
  const head = new THREE.Mesh(villagerHeadGeometry, villagerStyle.head);
  head.position.y = 1.1;
  head.castShadow = true;
  head.receiveShadow = true;
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.14, 0.66), villagerStyle.hat);
  hat.position.y = 1.44;
  group.add(body, head, hat);
  [-0.14, 0.14].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), villagerStyle.eye);
    eye.position.set(x, 1.12, 0.32);
    group.add(eye);
  });
  group.traverse((object) => { object.userData.villagerId = villager.id; });
  scene.add(group);
  return group;
};

/** Rebuild the villager population from the current world's village anchors. */
const spawnVillagers = (): void => {
  clearVillagerMeshes();
  villagers = createVillagersForWorld(world);
};

const syncVillagerMeshes = (): void => {
  villagers.forEach((villager) => {
    if (villager.dead) {
      const mesh = villagerMeshes.get(villager.id);
      if (mesh) scene.remove(mesh);
      villagerMeshes.delete(villager.id);
      return;
    }
    let mesh = villagerMeshes.get(villager.id);
    if (!mesh) {
      mesh = createVillagerMesh(villager);
      villagerMeshes.set(villager.id, mesh);
    }
    if (Number.isFinite(villager.y)) mesh.position.set(villager.x, villager.y, villager.z);
    mesh.rotation.y = villager.facing;
  });
};

const clearVillagerMeshes = (): void => {
  villagerMeshes.forEach((mesh) => scene.remove(mesh));
  villagerMeshes.clear();
};

const selection = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012, 1.012, 1.012)),
  new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
);
selection.visible = false;
selection.renderOrder = 10;
scene.add(selection);

const startScreen = document.querySelector<HTMLDivElement>("#start-screen")!;
const hotbar = document.querySelector<HTMLDivElement>("#hotbar")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const seedText = document.querySelector<HTMLDivElement>("#seed")!;
const timeText = document.querySelector<HTMLDivElement>("#world-time")!;
const healthText = document.querySelector<HTMLDivElement>("#health")!;
const hungerText = document.querySelector<HTMLDivElement>("#hunger")!;
const armorText = document.querySelector<HTMLDivElement>("#armor")!;
const xpText = document.querySelector<HTMLDivElement>("#xp")!;
const audioText = document.querySelector<HTMLDivElement>("#audio-state")!;
const networkText = document.querySelector<HTMLDivElement>("#network-state")!;
const villageText = document.querySelector<HTMLDivElement>("#village-state")!;
const guardianText = document.querySelector<HTMLDivElement>("#guardian-state")!;
const raidText = document.querySelector<HTMLDivElement>("#raid-state")!;
const biomeText = document.querySelector<HTMLDivElement>("#biome-state")!;
const witherText = document.querySelector<HTMLDivElement>("#wither-state")!;
const witherStarText = document.querySelector<HTMLDivElement>("#wither-star")!;
const codex = document.querySelector<HTMLElement>("#codex")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;
const worldList = document.querySelector<HTMLDivElement>("#world-list")!;
const newWorldButton = document.querySelector<HTMLButtonElement>("#new-world")!;
const roomCodeInput = document.querySelector<HTMLInputElement>("#room-code")!;
const playerNameInput = document.querySelector<HTMLInputElement>("#player-name")!;
const joinRoomButton = document.querySelector<HTMLButtonElement>("#join-room")!;
const roomStatus = document.querySelector<HTMLElement>("#room-status")!;
let selected = saved?.player.selected ?? 0;
let inventory: Inventory = createInventory(saved?.player.inventory);
const stations = createStations();
const craftPanel = document.querySelector<HTMLDivElement>("#craft-panel")!;
const furnacePanel = document.querySelector<HTMLDivElement>("#furnace-panel")!;
const enchantPanel = document.querySelector<HTMLDivElement>("#enchant-panel")!;
const brewPanel = document.querySelector<HTMLDivElement>("#brew-panel")!;
const effectsText = document.querySelector<HTMLDivElement>("#effects")!;
const maxPlayerHealth = 10;
let playerHealth = maxPlayerHealth;
let hunger: HungerState = createHungerState(saved?.player.hunger);
let armor: ArmorState = createArmorState(saved?.player.armor);
let enchantState = createEnchantSaveState(saved?.player.enchanting);
let potionEffects: ActiveEffect[] = createEffects(saved?.player.brewing);
const poisonAcc = { value: 0 };
const soundscape = new Soundscape();
let yaw = saved?.player.yaw ?? 0;
let pitch = saved?.player.pitch ?? -0.18;
const initialY = world.topY(0, 0) + 1.72;
camera.position.fromArray(saved?.player.position ?? [0, initialY, 8]);
camera.rotation.set(pitch, yaw, 0);
seedText.textContent = `WORLD SEED · ${world.seed}`;
const renderVillageState = (): void => {
  const village = world.village;
  villageText.textContent = village ? `村庄 · ${village.houses.length} 户 · ${village.center.x}, ${village.center.z}` : "村庄 · 此世界暂无平原选址";
};
const renderGuardianState = (): void => {
  const living = guardians.filter((guardian) => !guardian.dead).length;
  guardianText.textContent = living ? `村庄守卫 · ${living} 名巡逻中` : "村庄守卫 · 此世界暂无驻守";
};

const renderRaidState = (): void => {
  const activeRaid = raids.find((raid) => raid.active && !raid.defeated);
  raidText.textContent = activeRaid ? raidProgress(activeRaid) : "";
};

const renderBiomeState = (): void => {
  const profile = biomeAt(Math.floor(camera.position.x), Math.floor(camera.position.z), world.seed);
  biomeText.textContent = `${profile.name} · ${profile.id}`;
};
renderVillageState();
renderGuardianState();
renderBiomeState();
let loadedChunkX = Number.NaN;
let loadedChunkZ = Number.NaN;
/** Nether blocks within the visible chunk radius around the camera. */
const netherEntriesNear = (): { position: BlockPosition; type: NetherBlockId }[] => {
  const entries: { position: BlockPosition; type: NetherBlockId }[] = [];
  const cx = Math.floor(camera.position.x / CHUNK_SIZE);
  const cz = Math.floor(camera.position.z / CHUNK_SIZE);
  nether.blocks.forEach((type, positionKey) => {
    const [x, y, z] = positionKey.split(",").map(Number);
    if (Math.abs(Math.floor(x / CHUNK_SIZE) - cx) > 2 || Math.abs(Math.floor(z / CHUNK_SIZE) - cz) > 2) return;
    entries.push({ position: { x, y, z }, type });
  });
  return entries;
};
/** Portal tiles (obsidian frame + glowing opening) for the overworld portal overlay. */
const portalEntriesNear = (): { position: BlockPosition; type: NetherBlockId }[] => {
  const entries: { position: BlockPosition; type: NetherBlockId }[] = [];
  portalLinks.forEach((link) => {
    const geometry = link.geometry;
    const bx = link.overworld.x;
    const by = link.overworld.y;
    const bz = link.overworld.z;
    // Obsidian frame: two sides + top + bottom around the opening.
    for (let y = by - 1; y <= by + geometry.height; y += 1) {
      entries.push({ position: { x: bx - 1, y, z: bz }, type: "obsidian" });
      entries.push({ position: { x: bx + geometry.width, y, z: bz }, type: "obsidian" });
    }
    for (let x = bx - 1; x <= bx + geometry.width; x += 1) {
      entries.push({ position: { x, y: by - 1, z: bz }, type: "obsidian" });
      entries.push({ position: { x, y: by + geometry.height, z: bz }, type: "obsidian" });
    }
    portalTiles(link, "overworld").forEach((tile) => entries.push({ position: tile, type: "nether_portal" }));
  });
  return entries;
};
/** End blocks within the visible chunk radius around the camera. */
const endEntriesNear = (): { position: BlockPosition; type: EndBlockId }[] => {
  const entries: { position: BlockPosition; type: EndBlockId }[] = [];
  const cx = Math.floor(camera.position.x / CHUNK_SIZE);
  const cz = Math.floor(camera.position.z / CHUNK_SIZE);
  endWorld.blocks.forEach((type, positionKey) => {
    const [x, y, z] = positionKey.split(",").map(Number);
    if (Math.abs(Math.floor(x / CHUNK_SIZE) - cx) > 2 || Math.abs(Math.floor(z / CHUNK_SIZE) - cz) > 2) return;
    entries.push({ position: { x, y, z }, type });
  });
  return entries;
};
const syncRenderedChunks = (force = false): void => {
  const chunkX = Math.floor(camera.position.x / CHUNK_SIZE);
  const chunkZ = Math.floor(camera.position.z / CHUNK_SIZE);
  if (!force && chunkX === loadedChunkX && chunkZ === loadedChunkZ) return;
  if (dimension === "nether") {
    netherChunks.rebuild(netherEntriesNear());
  } else if (dimension === "end") {
    endChunks.rebuild(endEntriesNear());
  } else {
    blocks.rebuild(world, camera.position.x, camera.position.z);
    overworldPortal.rebuild(portalEntriesNear());
  }
  loadedChunkX = chunkX;
  loadedChunkZ = chunkZ;
};
syncRenderedChunks(true);
syncDimensionState();

const renderHotbar = (): void => {
  hotbar.innerHTML = BLOCK_TYPES.map((type, index) => {
    const keyLabel = index === 9 ? "0" : index + 1;
    return `<div class="slot ${index === selected ? "selected" : ""}">${keyLabel}<span class="swatch ${type}"></span><small>${inventory[type]}</small></div>`;
  }).join("");
  const toolLabel = stations.equippedTool ? ` · 工具 ${ITEM_LABELS[stations.equippedTool]}` : "";
  status.textContent = BLOCK_TYPES[selected] ? `${labels[BLOCK_TYPES[selected]]} · ${inventory[BLOCK_TYPES[selected]]}${toolLabel}` : `空槽${toolLabel}`;
};
renderHotbar();

const hudRoot = document.querySelector<HTMLDivElement>("#hud")!;

const anyStationOpen = (): boolean =>
  stations.craftOpen || stations.furnaceOpen || stations.enchantOpen || stations.brewOpen;

/** Keep pause/start overlay from covering station panels (z-index + visibility). */
const syncStartScreenForUi = (): void => {
  const locked = document.pointerLockElement === renderer.domElement;
  startScreen.classList.toggle("hidden", locked || anyStationOpen());
  hudRoot.classList.toggle("station-active", anyStationOpen());
};

const releasePointerForUi = (): void => {
  if (document.pointerLockElement) document.exitPointerLock();
};

/** After closing station UIs, hide the start overlay and re-lock the pointer for play. */
const resumePlayAfterUi = (): void => {
  syncStartScreenForUi();
  if (!anyStationOpen() && document.pointerLockElement !== renderer.domElement) {
    void renderer.domElement.requestPointerLock();
  }
};

const refreshStationsUi = (): void => {
  craftPanel.classList.toggle("hidden", !stations.craftOpen);
  furnacePanel.classList.toggle("hidden", !stations.furnaceOpen);
  enchantPanel.classList.toggle("hidden", !stations.enchantOpen);
  brewPanel.classList.toggle("hidden", !stations.brewOpen);
  if (stations.craftOpen) craftPanel.innerHTML = renderCraftPanelHtml(stations, inventory, armor);
  if (stations.furnaceOpen) {
    const furnace = activeFurnace(stations);
    if (furnace) furnacePanel.innerHTML = renderFurnacePanelHtml(furnace, inventory);
  }
  if (stations.enchantOpen) {
    enchantPanel.innerHTML = renderEnchantPanelHtml(stations, inventory, enchantState.experience, enchantState.gear);
  }
  if (stations.brewOpen) {
    const stand = activeBrewingStand(stations);
    if (stand) brewPanel.innerHTML = renderBrewPanelHtml(stand, inventory);
  }
  syncStartScreenForUi();
};

const equippedEnchantments = () => findGear(enchantState.gear, enchantState.equippedToolUid)?.enchantments ?? [];

const renderHealth = (): void => {
  healthText.textContent = `生命 ${"♥".repeat(playerHealth)}${"♡".repeat(maxPlayerHealth - playerHealth)}`;
};
renderHealth();

const renderHunger = (): void => {
  hungerText.textContent = `饥饿 ${formatHungerBar(hunger.foodLevel)} ${hunger.foodLevel}/${MAX_FOOD_LEVEL}`;
};
renderHunger();

const renderArmor = (): void => {
  const points = totalArmorPoints(armor);
  const prot = Object.values(enchantState.armorEnchants).flat().filter((e) => e.id === "protection");
  const protLabel = prot.length ? ` · ${formatEnchantments(prot)}` : "";
  armorText.textContent = `护甲 ${formatArmorBar(points)} ${points}/20${protLabel}`;
};
renderArmor();

const renderXp = (): void => {
  const xp = enchantState.experience;
  const tool = findGear(enchantState.gear, enchantState.equippedToolUid);
  const toolEnch = tool ? ` · ${formatEnchantments(tool.enchantments)}` : "";
  xpText.textContent = `经验 Lv.${xp.level} ${formatXpBar(xp)}${toolEnch}`;
};
renderXp();

const renderEffects = (): void => {
  const label = formatEffectsHud(potionEffects);
  effectsText.textContent = label ? `效果 ${label}` : "";
};
renderEffects();

/** Mitigate then subtract HP. Returns damage actually dealt (0 if fully blocked). */
const applyIncomingDamage = (rawDamage: number): number => {
  const afterArmor = mitigateDamage(armor, rawDamage);
  const dealt = mitigateWithProtection(enchantState.armorEnchants, afterArmor);
  if (dealt <= 0) return 0;
  playerHealth = Math.max(0, playerHealth - dealt);
  return dealt;
};

const tryDrinkPotion = (): boolean => {
  const potion = pickPotionToDrink(inventory, playerHealth, maxPlayerHealth);
  if (!potion) return false;
  const result = drinkPotion(inventory, potionEffects, potion, playerHealth, maxPlayerHealth);
  if (!result.ok) return false;
  playerHealth = result.health;
  renderHealth();
  renderEffects();
  renderHotbar();
  dirty = true;
  status.textContent = result.message;
  soundscape.play("pickup");
  return true;
};

const tryEatFood = (): boolean => {
  if (tryDrinkPotion()) return true;
  const foodId = pickFoodToEat(inventory);
  if (!foodId) {
    status.textContent = "背包里没有食物或药水";
    return false;
  }
  if (!eatFood(hunger, foodId)) {
    status.textContent = "饱食已满，吃不下了";
    return false;
  }
  inventory[foodId] -= 1;
  renderHunger();
  renderHotbar();
  dirty = true;
  status.textContent = `进食 ${ITEM_LABELS[foodId]} · 饱食 ${hunger.foodLevel}/${MAX_FOOD_LEVEL}`;
  soundscape.play("pickup");
  return true;
};

const renderAudioState = (): void => {
  audioText.textContent = `M 音效：${soundscape.isEnabled ? "开" : "关"}`;
};
renderAudioState();

let codexOpen = false;
const toggleCodex = (): void => {
  codexOpen = !codexOpen;
  codex.classList.toggle("hidden", !codexOpen);
  status.textContent = codexOpen ? "方块图鉴已打开" : "方块图鉴已关闭";
};

const finishCraft = (type: BlockType): void => {
  selected = BLOCK_TYPES.indexOf(type);
  renderHotbar();
  dirty = true;
  persist();
  soundscape.play("craft");
};

const keys = new Set<string>();
let verticalVelocity = 0;
let grounded = false;
let lastTime = performance.now();
let dirty = false;
let room: MultiplayerRoom | undefined;
let awaitingRoomSnapshot = false;
let nextNetworkBroadcast = 0;
const remotePlayers = new Map<string, PlayerState>();
const remotePlayerMeshes = new Map<string, THREE.Group>();
const remotePlayerBody = new THREE.BoxGeometry(0.62, 0.78, 0.42);
const remotePlayerHead = new THREE.BoxGeometry(0.52, 0.5, 0.5);
const remotePlayerMaterial = new THREE.MeshLambertMaterial({ color: 0x5d9cce });
const remotePlayerHeadMaterial = new THREE.MeshLambertMaterial({ color: 0xf0b779 });
const playerSessionKey = "voxel-atelier-player-id";
const savedRoomKey = "voxel-atelier-room";
const updateNetworkStatus = (): void => {
  const count = remotePlayers.size + (room ? 1 : 0);
  networkText.textContent = room ? `联机 ${room.id} · ${count} 人` : "单人世界";
};
const clearRemotePlayers = (): void => {
  remotePlayerMeshes.forEach((mesh) => scene.remove(mesh));
  remotePlayerMeshes.clear();
  remotePlayers.clear();
  updateNetworkStatus();
};
const syncRemotePlayers = (): void => {
  remotePlayers.forEach((player, id) => {
    let mesh = remotePlayerMeshes.get(id);
    if (!mesh) {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(remotePlayerBody, remotePlayerMaterial);
      body.position.y = 0.39;
      const head = new THREE.Mesh(remotePlayerHead, remotePlayerHeadMaterial);
      head.position.y = 1.01;
      mesh.add(body, head);
      remotePlayerMeshes.set(id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(player.position[0], player.position[1] - 1.72, player.position[2]);
    mesh.rotation.y = player.yaw;
  });
  updateNetworkStatus();
};
const localPlayer = (): PlayerState => newPlayer(playerNameInput.value, camera.position.toArray() as [number, number, number], yaw, pitch, sessionStorage.getItem(playerSessionKey) ?? undefined);
const applyRoomSnapshot = (snapshot: WorldSnapshot): void => {
  world = VoxelWorld.fromSnapshot(snapshot);
  clearMobMeshes();
  mobs = spawnMobs();
  spawnVillagers();
  spawnGuardians();
  raids = [];
  raidCooldown = 0;
  resetWithers();
  // Joining a room always lands in the overworld; the nether derives from the synced seed.
  nether = new NetherWorld(world.seed);
  endWorld = new EndWorld(world.seed);
  endDragon = createEnderDragon(9001);
  endCleared = false;
  portalLinks = [];
  dimension = "overworld";
  syncDimensionState();
  renderRaidState();
  syncRenderedChunks(true);
  seedText.textContent = `WORLD SEED · ${world.seed}`;
  renderVillageState();
  dirty = true;
};
const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const center = new THREE.Vector2(0, 0);
let target: { position: BlockPosition; normal: THREE.Vector3 } | undefined;
let mineHeld = false;
let miningKey: string | undefined;
let miningProgress = 0;

const playerSave = (): PlayerSave => ({
  position: camera.position.toArray() as [number, number, number],
  yaw,
  pitch,
  selected,
  inventory,
  dimension,
  nether: nether.snapshot(),
  end: endWorld.snapshot(),
  endCleared,
  witherStars,
  spawnPoint: bedSpawn,
  dayPhaseMs: dayClock.phaseMs(),
  hunger: snapshotHunger(hunger),
  armor: snapshotArmor(armor),
  enchanting: snapshotEnchant(enchantState),
  brewing: snapshotBrewing(potionEffects),
  redstone: serializeRedstone(leverStates),
});
const persist = (): void => {
  if (activeWorldId && saveWorldSlot(activeWorldId, world, playerSave())) {
    dirty = false;
    return;
  }
  activeWorldId = createWorldSlot("世界 1", world, playerSave()).id;
  dirty = false;
};
const refreshWorld = (): void => {
  refreshRedstone();
  syncRenderedChunks(true);
  seedText.textContent = `WORLD SEED · ${world.seed}`;
  renderVillageState();
  dirty = true;
};

const findTarget = (): void => {
  raycaster.setFromCamera(center, camera);
  const objects = dimension === "end" ? endChunks.objects()
    : dimension === "nether" ? netherChunks.objects()
    : blocks.objects();
  const hit = raycaster.intersectObjects(objects, false)[0];
  if (!hit || hit.instanceId === undefined || !hit.face) {
    target = undefined;
    selection.visible = false;
    return;
  }
  const positions = hit.object.userData.positions as BlockPosition[];
  const position = positions[hit.instanceId];
  const normal = hit.face.normal.clone().round();
  target = { position, normal };
  selection.visible = true;
  selection.position.set(position.x, position.y, position.z);
};

/** A mob is hittable only when it is the first object under the crosshair. */
const attackMobAtCrosshair = (): boolean => {
  raycaster.setFromCamera(center, camera);
  const entityRoots = [...mobMeshes.values(), ...villagerMeshes.values()];
  if (dimension === "end" && endDragonGroup && !endDragon.dead) entityRoots.push(endDragonGroup);
  const entities = raycaster.intersectObjects(entityRoots, true);
  const entityHit = entities[0];
  if (!entityHit) return false;
  const blockObjects = dimension === "end" ? endChunks.objects()
    : dimension === "nether" ? netherChunks.objects()
    : blocks.objects();
  const blockHit = raycaster.intersectObjects(blockObjects, false)[0];
  if (blockHit && blockHit.distance < entityHit.distance) return false;

  if (dimension === "end" && endDragonGroup && !endDragon.dead) {
    let cursor: THREE.Object3D | null = entityHit.object;
    while (cursor) {
      if (cursor === endDragonGroup || cursor.userData.dragon) {
        if (!hitEnderDragon(endDragon)) {
          status.textContent = "末影龙正在恢复，稍后再打";
          return true;
        }
        soundscape.play("hit");
        status.textContent = endDragon.hp > 0
          ? `命中末影龙 · ${endDragon.hp}/${endDragon.maxHp}`
          : "末影龙已倒下";
        return true;
      }
      cursor = cursor.parent;
    }
  }

  const mobId = entityHit.object.userData.mobId as number | undefined;
  const villagerId = entityHit.object.userData.villagerId as number | undefined;

  if (mobId !== undefined) {
    const mob = mobs.find((candidate) => candidate.id === mobId && !candidate.dead);
    if (!mob) return false;
    const baseDmg = 4 + (stations.equippedTool ? (SWORD_DAMAGE[stations.equippedTool] ?? 0) : 0);
    const dmg = baseDmg + sharpnessBonus(equippedEnchantments());
    mob.hp = Math.max(0, mob.hp - dmg);
    addExhaustion(hunger, EXHAUSTION.attack);
    renderHunger();
    soundscape.play("hit");
    if (mob.hp <= 0) {
      addExperience(enchantState.experience, MOB_KILL_XP);
      renderXp();
      dirty = true;
    }
    status.textContent = mob.hp > 0 ? `命中${mobNames[mob.kind]} · ${mob.hp}/${mob.maxHp}` : `${mobNames[mob.kind]}已击倒`;
    return true;
  }

  if (villagerId !== undefined) {
    const villager = villagers.find((candidate) => candidate.id === villagerId && !candidate.dead);
    if (!villager) return false;
    villager.hp = Math.max(0, villager.hp - 8);
    soundscape.play("hit");
    if (villager.hp <= 0) {
      // A friendly villager is down: drop a collectible block into the bag.
      villager.dead = true;
      const drop = villagerDrop();
      inventory[drop] += 1;
      renderHotbar();
      dirty = true;
      status.textContent = `村民已倒下，掉落 ${labels[drop]}`;
    } else {
      status.textContent = `村民受伤 · ${villager.hp}/${villager.maxHp}`;
    }
    return true;
  }

  return false;
};

const intersectsPlayer = (position: BlockPosition): boolean => {
  const dx = Math.abs(camera.position.x - position.x);
  const dz = Math.abs(camera.position.z - position.z);
  return dx < 0.45 && dz < 0.45 && position.y >= camera.position.y - 1.8 && position.y <= camera.position.y + 0.1;
};

const edit = (place: boolean): void => {
  if (!target) return;
  if (dimension === "end") {
    // End edits are local to the End sub-world (mine crystals / terrain only).
    if (place) { status.textContent = "末地中无法放置主世界方块"; return; }
    const removed = endWorld.remove(target.position);
    if (removed) {
      soundscape.play("break");
      if (removed === "end_crystal") status.textContent = `摧毁末影水晶 · 剩余 ${endWorld.crystalCount()}`;
      syncRenderedChunks(true);
      dirty = true;
      persist();
    }
    return;
  }
  if (!place) {
    const existing = world.get(target.position.x, target.position.y, target.position.z);
    if (existing === "bed") {
      const removed = breakBedAt(world, target.position);
      if (removed) {
        inventory[removed] += 1;
        soundscape.play("break");
        room?.sendEdit({ action: "remove", position: target.position });
      }
    } else {
      const removed = world.remove(target.position);
      if (removed) {
        const pos = target.position;
        if (removed === "lapis_ore") {
          const count = lapisDropCount(world.seed, pos.x, pos.y, pos.z);
          inventory.lapis_lazuli += count;
          status.textContent = `获得青金石 ×${count}`;
        } else if (removed === "redstone_ore") {
          const count = redstoneDropCount(world.seed, pos.x, pos.y, pos.z);
          inventory.redstone_dust += count;
          status.textContent = `获得红石粉 ×${count}`;
        } else {
          inventory[removed] += 1;
        }
        if (removed === "lever") clearLeverAt(leverStates, pos);
        if (removed === "leaves" && appleDropFromLeaves(world.seed, pos.x, pos.y, pos.z)) {
          inventory.apple += 1;
          status.textContent = "树叶掉落了苹果";
        }
        if (removed === "grass" && wheatDropFromGrass(world.seed, pos.x, pos.y, pos.z)) {
          inventory.wheat += 1;
          status.textContent = "获得小麦";
        }
        if (removed === "grass") {
          const nearWater = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dz]) =>
            world.get(pos.x + dx, pos.y, pos.z + dz) === "water" || world.get(pos.x + dx, pos.y - 1, pos.z + dz) === "water");
          if (nearWater && ((world.seed + pos.x * 13 + pos.z * 29) & 3) === 0) {
            inventory.sugar_cane += 1;
            status.textContent = "获得甘蔗";
          }
        }
        const gained = miningXpFor(removed);
        if (gained > 0) {
          addExperience(enchantState.experience, gained);
          renderXp();
        }
        addExhaustion(hunger, EXHAUSTION.mineBlock);
        renderHunger();
        soundscape.play("break");
        room?.sendEdit({ action: "remove", position: target.position });
      }
    }
  } else {
    const type = BLOCK_TYPES[selected];
    if (!type || inventory[type] <= 0) return;
    const position = { x: target.position.x + target.normal.x, y: target.position.y + target.normal.y, z: target.position.z + target.normal.z };
    if (intersectsPlayer(position)) return;
    if (type === "bed") {
      if (!placeBedPair(world, position, yaw)) {
        status.textContent = "床需要两格空间且下方坚实";
        return;
      }
      inventory.bed -= 1;
      soundscape.play("place");
      room?.sendEdit({ action: "place", position, type });
    } else if (type === "torch") {
      if (!canPlaceTorchAt(world, position, target.position)) {
        status.textContent = "火把需要附着在坚实方块上";
        return;
      }
      world.set(position, "torch");
      inventory.torch -= 1;
      soundscape.play("place");
      room?.sendEdit({ action: "place", position, type });
    } else if (type === "redstone_dust") {
      if (!canPlaceRedstoneDustAt(world, position)) {
        status.textContent = "红石粉需要放在坚实方块上方";
        return;
      }
      world.set(position, "redstone_dust");
      inventory.redstone_dust -= 1;
      soundscape.play("place");
      room?.sendEdit({ action: "place", position, type });
    } else if (type === "lever" || type === "redstone_torch") {
      if (!canPlaceRedstoneDeviceAt(world, position, target.position)) {
        status.textContent = `${labels[type]}需要附着在坚实方块上`;
        return;
      }
      world.set(position, type);
      inventory[type] -= 1;
      soundscape.play("place");
      room?.sendEdit({ action: "place", position, type });
    } else if (type === "redstone_lamp") {
      if (!canPlaceRedstoneLampAt(world, position)) return;
      world.set(position, "redstone_lamp");
      inventory.redstone_lamp -= 1;
      soundscape.play("place");
      room?.sendEdit({ action: "place", position, type });
    } else {
      if (world.get(position.x, position.y, position.z)) return;
      world.set(position, type);
      inventory[type] -= 1;
      soundscape.play("place");
      room?.sendEdit({ action: "place", position, type });
    }
  }
  syncTorchLights();
  refreshWorld();
  renderHotbar();
  persist();
};

const stopMining = (): void => {
  mineHeld = false;
  miningKey = undefined;
  miningProgress = 0;
};

const updateMining = (delta: number): void => {
  if (!mineHeld || !target) { stopMining(); return; }
  const { x, y, z } = target.position;
  const key = `${x},${y},${z}`;
  if (dimension === "end") {
    const block = endWorld.get(x, y, z);
    // Crystals and soft end terrain are diggable; portal/obsidian stay fixed.
    if (!block || block === "end_portal" || block === "obsidian") { stopMining(); return; }
    if (key !== miningKey) {
      miningKey = key;
      miningProgress = 0;
    }
    const duration = block === "end_crystal" ? 0.55 : 0.9;
    miningProgress = Math.min(1, miningProgress + delta / duration);
    status.textContent = `挖掘 ${block} · ${Math.round(miningProgress * 100)}%`;
    if (miningProgress >= 1) {
      edit(false);
      stopMining();
    }
    return;
  }
  const block = world.get(x, y, z);
  if (!block || !isMineable(block)) { stopMining(); return; }
  if (key !== miningKey) {
    miningKey = key;
    miningProgress = 0;
  }
  const mineDuration = breakDuration(block, stations.equippedTool) / (isPickaxe(stations.equippedTool ?? undefined) ? efficiencyMultiplier(equippedEnchantments()) : 1);
  miningProgress = Math.min(1, miningProgress + delta / mineDuration);
  status.textContent = `挖掘 ${labels[block]} · ${Math.round(miningProgress * 100)}%`;
  if (miningProgress >= 1) {
    edit(false);
    stopMining();
  }
};

const escapeText = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

const renderWorldSlots = (): void => {
  const slots = listWorldSlots();
  worldList.innerHTML = slots.map((slot) => {
    const active = slot.id === activeWorldId;
    const updated = new Date(slot.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `<div class="world-entry ${active ? "active" : ""}">
      <button class="world-load" data-action="load" data-id="${slot.id}"><strong>${escapeText(slot.name)}</strong><small>${active ? "当前世界" : `保存于 ${updated}`}</small></button>
      <div class="world-actions"><button data-action="rename" data-id="${slot.id}" title="重命名">改名</button>${slots.length > 1 ? `<button data-action="delete" data-id="${slot.id}" title="删除">删除</button>` : ""}</div>
    </div>`;
  }).join("");
};

const applyWorldSlot = (slot: WorldSlot): void => {
  activeWorldId = slot.id;
  world = VoxelWorld.fromSnapshot(slot.save.world);
  inventory = createInventory(slot.save.player.inventory);
  selected = Math.min(slot.save.player.selected, BLOCK_TYPES.length - 1);
  yaw = slot.save.player.yaw;
  pitch = slot.save.player.pitch;
  camera.position.fromArray(slot.save.player.position);
  camera.rotation.set(pitch, yaw, 0);
  verticalVelocity = 0;
  grounded = false;
  target = undefined;
  selection.visible = false;
  stopMining();
  clearMobMeshes();
  mobs = spawnMobs();
  spawnVillagers();
  spawnGuardians();
  raids = [];
  raidCooldown = 0;
  witherStars = slot.save.player.witherStars ?? 0;
  bedSpawn = slot.save.player.spawnPoint;
  dayClock.setNow(slot.save.player.dayPhaseMs ?? 0);
  resetWithers();
  // Restore the per-world nether + end sub-worlds and dimension if the slot carries one.
  nether = slot.save.player.nether ? NetherWorld.fromSnapshot(slot.save.player.nether) : new NetherWorld(world.seed);
  endWorld = slot.save.player.end ? EndWorld.fromSnapshot(slot.save.player.end) : new EndWorld(world.seed);
  endDragon = createEnderDragon(9001);
  endCleared = slot.save.player.endCleared ?? false;
  if (endCleared) {
    endDragon.hp = 0;
    endDragon.dead = true;
  }
  portalLinks = [];
  dimension = slot.save.player.dimension ?? "overworld";
  renderRaidState();
  playerHealth = maxPlayerHealth;
  hunger = createHungerState(slot.save.player.hunger);
  armor = createArmorState(slot.save.player.armor);
  enchantState = createEnchantSaveState(slot.save.player.enchanting);
  potionEffects = createEffects(slot.save.player.brewing);
  leverStates = createLeverStates(slot.save.player.redstone?.levers);
  refreshRedstone();
  poisonAcc.value = 0;
  const restoredTool = findGear(enchantState.gear, enchantState.equippedToolUid);
  if (restoredTool) stations.equippedTool = restoredTool.item as ExtraItem;
  renderXp();
  renderEffects();
  renderArmor();
  renderHunger();
  renderArmor();
  syncRenderedChunks(true);
  syncDimensionState();
  seedText.textContent = `WORLD SEED · ${world.seed}`;
  renderVillageState();
  renderHotbar();
  renderHealth();
  renderWorldSlots();
  dirty = false;
  status.textContent = `已载入 ${slot.name}`;
};

const freshPlayer = (nextWorld: VoxelWorld): PlayerSave => ({
  position: [0, nextWorld.topY(0, 0) + 1.72, 8],
  yaw: 0,
  pitch: -0.18,
  selected: 0,
  inventory: createInventory(),
  dimension: "overworld",
  nether: new NetherWorld(nextWorld.seed).snapshot(),
  end: new EndWorld(nextWorld.seed).snapshot(),
  endCleared: false,
  witherStars: 0,
  spawnPoint: undefined,
  dayPhaseMs: 0,
});

const createNewWorld = (name: string): void => {
  const nextWorld = new VoxelWorld(Math.floor(Math.random() * 999999));
  const slot = createWorldSlot(name, nextWorld, freshPlayer(nextWorld));
  applyWorldSlot(slot);
};

worldList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  if (button.dataset.action === "load") {
    const slot = loadWorldSlot(id);
    if (slot) applyWorldSlot(slot);
    return;
  }
  if (button.dataset.action === "rename") {
    const existing = listWorldSlots().find((slot) => slot.id === id);
    const name = existing && prompt("给这个世界起个名字", existing.name);
    if (name !== null && name !== undefined && renameWorldSlot(id, name)) renderWorldSlots();
    return;
  }
  if (button.dataset.action === "delete" && confirm("删除这个本地世界？此操作无法撤销。")) {
    const wasActive = activeWorldId === id;
    if (!deleteWorldSlot(id)) return;
    const next = listWorldSlots()[0];
    if (wasActive && next) {
      const slot = loadWorldSlot(next.id);
      if (slot) applyWorldSlot(slot);
    } else {
      renderWorldSlots();
    }
  }
});

newWorldButton.addEventListener("click", () => {
  const suggested = `世界 ${listWorldSlots().length + 1}`;
  const name = prompt("新世界名称", suggested);
  if (name !== null) createNewWorld(name);
});

const joinRoom = (): void => {
  const roomCode = normalizeRoomCode(roomCodeInput.value);
  roomCodeInput.value = roomCode;
  if (roomCode.length < 3) {
    roomStatus.textContent = "房间码至少需要 3 个字母、数字或连字符";
    return;
  }
  room?.dispose();
  clearRemotePlayers();
  awaitingRoomSnapshot = true;
  const player = localPlayer();
  sessionStorage.setItem(playerSessionKey, player.id);
  sessionStorage.setItem(savedRoomKey, roomCode);
  room = new MultiplayerRoom(roomCode, player, {
    onHello: () => {
      room?.sendSnapshot(world.snapshot());
      room?.announcePlayer();
    },
    onLeave: (playerId) => {
      const mesh = remotePlayerMeshes.get(playerId);
      if (mesh) scene.remove(mesh);
      remotePlayerMeshes.delete(playerId);
      remotePlayers.delete(playerId);
      updateNetworkStatus();
    },
    onPlayer: (playerState) => {
      remotePlayers.set(playerState.id, playerState);
      syncRemotePlayers();
    },
    onEdit: (edit) => {
      if (edit.action === "place" && edit.type) world.set(edit.position, edit.type);
      if (edit.action === "remove") world.remove(edit.position);
      refreshWorld();
    },
    onSnapshot: (snapshot) => {
      if (!awaitingRoomSnapshot) return;
      awaitingRoomSnapshot = false;
      applyRoomSnapshot(snapshot);
      roomStatus.textContent = `已加入 ${roomCode} · 已同步世界状态`;
    },
  });
  roomStatus.textContent = `已加入 ${roomCode} · 正在寻找其他玩家`;
  updateNetworkStatus();
};
joinRoomButton.addEventListener("click", joinRoom);
roomCodeInput.value = sessionStorage.getItem(savedRoomKey) ?? "";
playerNameInput.value = sessionStorage.getItem("voxel-atelier-player-name") ?? "探索者";
playerNameInput.addEventListener("change", () => sessionStorage.setItem("voxel-atelier-player-name", playerNameInput.value.trim().slice(0, 18)));

if (!activeWorldId) activeWorldId = createWorldSlot("世界 1", world, playerSave()).id;
renderWorldSlots();

const lockWorld = (): void => { void renderer.domElement.requestPointerLock(); };
playButton.addEventListener("click", lockWorld);
renderer.domElement.addEventListener("mousedown", (event) => {
  if (anyStationOpen()) return;
  if (document.pointerLockElement !== renderer.domElement) { lockWorld(); return; }
  soundscape.unlock();
  if (event.button === 0 && !attackWitherAtCrosshair() && !attackMobAtCrosshair()) mineHeld = true;
  if (event.button === 2) {
    if (dimension === "overworld" && target) {
      const aimed = world.get(target.position.x, target.position.y, target.position.z);
      if (aimed === "crafting_table") {
        openTableCraft(stations, inventory);
        releasePointerForUi();
        refreshStationsUi();
        status.textContent = "工作台已打开";
        return;
      }
      if (aimed === "furnace") {
        const key = `${target.position.x},${target.position.y},${target.position.z}`;
        openFurnaceAt(stations, inventory, key);
        releasePointerForUi();
        refreshStationsUi();
        status.textContent = "熔炉已打开";
        return;
      }
      if (aimed === "enchanting_table") {
        const key = `${target.position.x},${target.position.y},${target.position.z}`;
        const power = countBookshelfPower(
          (x, y, z) => world.get(x, y, z),
          target.position,
        );
        openEnchantAt(stations, inventory, key, world.seed ^ (target.position.x * 31 + target.position.z), power);
        releasePointerForUi();
        refreshStationsUi();
        status.textContent = `附魔台已打开 · 书架能量 ${power}/15`;
        return;
      }
      if (aimed === "brewing_stand") {
        const key = `${target.position.x},${target.position.y},${target.position.z}`;
        openBrewAt(stations, inventory, key);
        releasePointerForUi();
        refreshStationsUi();
        status.textContent = "酿造台已打开";
        return;
      }
      if (aimed === "bed") {
        const result = trySleepInBed({
          worldTimeMs: dayClock.now(),
          dimension,
          bed: target.position,
          monstersNearby: hostileWithinSleepRange(target.position, mobs),
        });
        if (!result.ok) {
          status.textContent =
            result.reason === "daytime" ? "只能在夜间睡觉"
              : result.reason === "monsters" ? "附近有怪物，无法安睡"
                : "只能在主世界的床上睡觉";
          return;
        }
        dayClock.setNow(result.nextWorldTimeMs);
        bedSpawn = result.spawn;
        camera.position.set(...result.spawn);
        verticalVelocity = 0;
        grounded = true;
        playerHealth = maxPlayerHealth;
        soundscape.play("respawn");
        status.textContent = "一觉睡到天亮 · 已设置重生点";
        renderHealth();
        dirty = true;
        persist();
        return;
      }
      if (aimed === "lever") {
        const on = toggleLeverAt(world, leverStates, target.position);
        if (on === undefined) return;
        refreshWorld();
        status.textContent = on ? "拉杆已打开 · 红石供电" : "拉杆已关闭";
        soundscape.play("place");
        persist();
        return;
      }
    }
    const nearVillager = villagers.find((v) =>
      !v.dead && Math.hypot(camera.position.x - v.x, camera.position.z - v.z) <= v.interactRange,
    );
    if (nearVillager) {
      interactVillager();
      return;
    }
    edit(true);
  }
});
renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("mouseup", (event) => { if (event.button === 0) stopMining(); });
document.addEventListener("pointerlockchange", () => {
  // Do not reveal #start-screen while a station UI is open — it sits above #hud
  // in the stacking order and would block mouse crafting / furnace / enchant / brew.
  syncStartScreenForUi();
  if (document.pointerLockElement !== renderer.domElement) stopMining();
});
document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= event.movementX * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -1.45, 1.45);
  camera.rotation.set(pitch, yaw, 0);
});
document.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") event.preventDefault();
  const slot = event.code === "Digit0" ? 9 : event.code.startsWith("Digit") ? Number(event.code.slice(5)) - 1 : -1;
  if (slot >= 0 && slot < BLOCK_TYPES.length) { selected = slot; renderHotbar(); dirty = true; }
  if (event.code === "KeyC" && !event.repeat) {
    soundscape.unlock();
    if (craftPlanks(inventory)) {
      finishCraft("planks");
    } else {
      status.textContent = "需要 1 个原木";
    }
  }
  if (event.code === "KeyV" && !event.repeat) {
    soundscape.unlock();
    if (craftBricks(inventory)) {
      finishCraft("bricks");
    } else {
      status.textContent = "需要 4 个石头";
    }
  }
  if (event.code === "KeyF" && !event.repeat) {
    soundscape.unlock();
    status.textContent = "玻璃请用熔炉烧沙子（原版烧炼，快捷合成已关闭）";
  }
  if (event.code === "KeyG" && !event.repeat) toggleCodex();
  if (event.code === "KeyP" && !event.repeat) {
    const village = world.village;
    status.textContent = village ? `村庄广场坐标：${village.center.x}, ${village.center.z}` : "当前世界没有可用村庄选址";
  }
  if (event.code === "KeyE" && !event.repeat) {
    soundscape.unlock();
    openInventoryCraft(stations, inventory);
    if (stations.craftOpen) {
      releasePointerForUi();
      syncStartScreenForUi();
    } else {
      resumePlayAfterUi();
    }
    refreshStationsUi();
    renderHotbar();
    status.textContent = stations.craftOpen ? "背包合成 2×2" : "合成已关闭";
  }
  if (event.code === "KeyR" && !event.repeat) {
    const tools = (Object.entries(inventory) as [ExtraItem | string, number][])
      .filter(([item, count]) => count > 0 && isTool(item as ExtraItem))
      .map(([item]) => item as ExtraItem);
    if (!tools.length) {
      status.textContent = "还没有工具，先用 E 合成";
    } else {
      const index = stations.equippedTool ? tools.indexOf(stations.equippedTool) : -1;
      stations.equippedTool = tools[(index + 1) % tools.length];
      const match = enchantState.gear.find((g) => g.item === stations.equippedTool);
      enchantState.equippedToolUid = match?.uid ?? null;
      renderHotbar();
      status.textContent = `手持 ${ITEM_LABELS[stations.equippedTool]}`;
    }
  }
  if (event.code === "KeyT" && !event.repeat) {
    soundscape.unlock();
    tryEatFood();
  }
  if (event.code === "Escape" && !event.repeat && anyStationOpen()) {
    closeCraft(stations, inventory);
    closeFurnace(stations);
    closeEnchant(stations, inventory);
    closeBrew(stations, inventory);
    refreshStationsUi();
    renderHotbar();
    resumePlayAfterUi();
    return;
  }
  if (event.code === "KeyN" && !event.repeat) {
    soundscape.unlock();
    placePortal();
  }
  if (event.code === "KeyH" && !event.repeat) {
    soundscape.unlock();
    summonWitherAt();
  }
  if (event.code === "KeyB" && !event.repeat) {
    soundscape.unlock();
    if (dimension === "overworld") {
      enterEnd();
    } else {
      status.textContent = "仅在主世界可开启末地之门";
    }
  }
  if (event.code === "KeyM" && !event.repeat) {
    const enabled = soundscape.toggle();
    if (enabled) soundscape.unlock();
    renderAudioState();
    status.textContent = enabled ? "音效已开启" : "音效已关闭";
  }
});
document.addEventListener("keyup", (event) => keys.delete(event.code));
document.addEventListener("wheel", (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  selected = (selected + (event.deltaY > 0 ? 1 : -1) + BLOCK_TYPES.length) % BLOCK_TYPES.length;
  renderHotbar();
}, { passive: true });
resetButton.addEventListener("click", () => {
  if (!confirm("要生成一个全新的世界吗？当前本地建造会被清除。")) return;
  const nextWorld = new VoxelWorld(Math.floor(Math.random() * 999999));
  if (activeWorldId && saveWorldSlot(activeWorldId, nextWorld, freshPlayer(nextWorld))) {
    const slot = loadWorldSlot(activeWorldId);
    if (slot) applyWorldSlot(slot);
  } else {
    createNewWorld("世界 1");
  }
});
addEventListener("beforeunload", () => { if (dirty) persist(); room?.dispose(); });
addEventListener("online", () => { room?.reconnect(); roomStatus.textContent = room ? `已重连 ${room.id} · 正在恢复状态` : roomStatus.textContent; });
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const updatePlayer = (delta: number): void => {
  const inputX = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const inputZ = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const wantSprint = keys.has("ShiftLeft") && canSprint(hunger);
  const effectTick = tickEffects(potionEffects, playerHealth, delta, poisonAcc);
  if (effectTick.healthDelta !== 0) {
    playerHealth = Math.max(1, Math.min(maxPlayerHealth, playerHealth + effectTick.healthDelta));
    renderHealth();
    if (effectTick.healthDelta < 0) {
      status.textContent = "中毒中…";
      soundscape.play("hurt");
    }
  }
  if (effectTick.changed) renderEffects();
  const speed = (wantSprint ? 8 : 4.4) * effectTick.speedMul;
  const size = currentSize();
  const prevX = camera.position.x;
  const prevZ = camera.position.z;
  if (inputX || inputZ) {
    const length = Math.hypot(inputX, inputZ);
    const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
    const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
    const nextX = THREE.MathUtils.clamp(camera.position.x + (forwardX * inputZ + sideX * inputX) / length * speed * delta, -size + 1, size - 1);
    const nextZ = THREE.MathUtils.clamp(camera.position.z + (forwardZ * inputZ + sideZ * inputX) / length * speed * delta, -size + 1, size - 1);
    const nextGround = currentTopY(Math.round(nextX), Math.round(nextZ)) + 1.72;
    if (nextGround <= camera.position.y + 0.85) { camera.position.x = nextX; camera.position.z = nextZ; }
  }
  const moved = Math.hypot(camera.position.x - prevX, camera.position.z - prevZ);
  if (moved > 0) {
    addExhaustion(hunger, moved * (wantSprint ? EXHAUSTION.sprintPerMeter : EXHAUSTION.walkPerMeter));
  }
  if (grounded && keys.has("Space")) {
    verticalVelocity = 7.2;
    grounded = false;
    addExhaustion(hunger, wantSprint ? EXHAUSTION.sprintJump : EXHAUSTION.jump);
    soundscape.play("jump");
  }
  verticalVelocity -= 19 * delta;
  camera.position.y += verticalVelocity * delta;
  const ground = currentTopY(Math.round(camera.position.x), Math.round(camera.position.z)) + 1.72;
  if (camera.position.y <= ground) { camera.position.y = ground; verticalVelocity = 0; grounded = true; }
  if (camera.position.y < -8) camera.position.set(...respawnPoint());
  const hungerTick = tickHunger(hunger, playerHealth, maxPlayerHealth, delta);
  if (hungerTick.healthDelta !== 0) {
    playerHealth = Math.max(0, Math.min(maxPlayerHealth, playerHealth + hungerTick.healthDelta));
    if (playerHealth === 0) {
      playerHealth = maxPlayerHealth;
      hunger.foodLevel = MAX_FOOD_LEVEL;
      hunger.saturation = MAX_FOOD_LEVEL;
      hunger.exhaustion = 0;
      camera.position.set(...respawnPoint());
      verticalVelocity = 0;
      status.textContent = "饥饿过度，已重生";
      soundscape.play("respawn");
    } else if (hungerTick.healthDelta < 0) {
      status.textContent = "你饿得发抖…";
      soundscape.play("hurt");
    }
    renderHealth();
  }
  if (moved > 0 || hungerTick.changed) renderHunger();
};

const updateMobs = (delta: number): void => {
  const { damageToPlayer, drops } = updateEntities(world, mobs, camera.position, delta);
  if (drops.length) {
    drops.forEach((drop) => { inventory[drop] += 1; });
    renderHotbar();
    dirty = true;
    status.textContent = `获得 ${drops.map((drop) => ITEM_LABELS[drop] ?? labels[drop as BlockType] ?? drop).join("、")}`;
    soundscape.play("pickup");
  }
  if (damageToPlayer > 0) {
    addExhaustion(hunger, EXHAUSTION.damage);
    renderHunger();
    const dealt = applyIncomingDamage(damageToPlayer);
    if (playerHealth === 0) {
      playerHealth = maxPlayerHealth;
      camera.position.set(...respawnPoint());
      verticalVelocity = 0;
      status.textContent = "生命耗尽，已重生";
      soundscape.play("respawn");
    } else if (dealt <= 0) {
      status.textContent = `护甲挡住了 ${damageToPlayer} 点伤害`;
      soundscape.play("hit");
    } else {
      status.textContent = dealt < damageToPlayer
        ? `受到 ${dealt} 点伤害（护甲减免 ${damageToPlayer - dealt}）`
        : `受到 ${dealt} 点伤害`;
      soundscape.play("hurt");
    }
    renderHealth();
  }
  syncMobMeshes();
};

const updateGuardiansLoop = (delta: number): void => {
  updateGuardians(world, guardians, mobs, delta);
  syncGuardianMeshes();
  renderGuardianState();
};

let villagerGreetedId: number | undefined;

const updateVillagersLoop = (delta: number): void => {
  updateVillagers(world, villagers, camera.position, delta);
  // Interaction 1 — proximity greeting (surfaced once per villager approached).
  const near = greetNearbyVillagers(villagers, camera.position);
  const nearId = near ? villagers.find((v) => !v.dead && Math.hypot(camera.position.x - v.x, camera.position.z - v.z) <= v.interactRange)?.id : undefined;
  if (near && nearId !== villagerGreetedId) {
    villagerGreetedId = nearId;
    status.textContent = near;
  } else if (!near) {
    villagerGreetedId = undefined;
  }
  syncVillagerMeshes();
};

/** Interaction 2 — barter the selected hotbar block with a nearby villager. */
const interactVillager = (): void => {
  const type = BLOCK_TYPES[selected];
  if (!type) return;
  const targetVillager = villagers.find((v) =>
    !v.dead && Math.hypot(camera.position.x - v.x, camera.position.z - v.z) <= v.interactRange,
  );
  if (!targetVillager) { status.textContent = "附近没有村民"; return; }
  const result = tradeWithVillager(targetVillager, type, inventory, camera.position);
  status.textContent = result.message;
  if (result.ok) {
    soundscape.play("pickup");
    renderHotbar();
    dirty = true;
  }
};

/** Seconds a freshly-cleared village waits before the next night raid. */
let raidCooldown = 0;

/** Nighttime raid waves assaulting the village, cleared by player/guard/villagers. */
const updateRaidsLoop = (delta: number): void => {
  raidCooldown = Math.max(0, raidCooldown - delta);

  // Advance live raids and detect a fresh clear so we can announce + cool down.
  let newlyCleared = false;
  for (const raid of raids) {
    const wasActive = raid.active && !raid.defeated;
    updateRaid(raid, world, mobs, delta);
    if (wasActive && raid.defeated) newlyCleared = true;
  }
  if (newlyCleared) {
    raidCooldown = 30;
    soundscape.play("pickup");
    status.textContent = "袭击已击退，村庄恢复平静";
  }
  raids = raids.filter((raid) => raid.active && !raid.defeated);

  // Start a fresh raid at night once the field is clear and the cooldown has passed.
  if (sunHeightAt(dayClock.now()) < 0.22 && raids.length === 0 && world.villages.length && raidCooldown <= 0) {
    raids.push(createRaid(nextRaidId++, world.villages[0]));
  }

  renderRaidState();
};

/** True when a completed Wither ritual sits within a few blocks of the player. */
const witherRitualNearby = (): { center: { x: number; y: number; z: number } } | undefined => {
  const px = Math.floor(camera.position.x);
  const py = Math.floor(camera.position.y - 1.72);
  const pz = Math.floor(camera.position.z);
  for (let dx = -3; dx <= 3; dx += 1) {
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dz = -3; dz <= 3; dz += 1) {
        const center = { x: px + dx, y: py + dy, z: pz + dz };
        if (isWitherStructure(world, center)) return { center };
      }
    }
  }
  return undefined;
};

/** Constructible summon: blizzard the ritual blocks and wake the Wither. */
const summonWitherAt = (): void => {
  if (dimension !== "overworld") { status.textContent = "凋灵只能在主世界召唤"; return; }
  const ritual = witherRitualNearby();
  if (!ritual) {
    status.textContent = "未找到凋灵祭坛：请用 5 个沙子摆成 T 形、头顶放 1 个石头（头颅）";
    return;
  }
  const result = summonWither(nextWitherId++, world, ritual.center, {
    hp: 200,
    skullCooldown: 2.0,
    enragedSkullCooldown: 0.85,
    summonCooldown: 6,
  });
  if (!result) { status.textContent = "祭坛结构不完整，无法召唤"; return; }
  withers.push(result.boss);
  syncRenderedChunks(true);
  dirty = true;
  persist();
  status.textContent = "凋灵已苏醒！击溃它夺得下界之星";
  soundscape.play("place");
};

/** The player may hit the Wither boss itself with the crosshair. */
const attackWitherAtCrosshair = (): boolean => {
  const boss = withers.find((candidate) => !candidate.defeated);
  if (!boss) return false;
  raycaster.setFromCamera(center, camera);
  const bossHits = raycaster.intersectObjects([...witherMeshes.values()], true);
  const bossHit = bossHits[0];
  if (!bossHit) return false;
  const blockHit = raycaster.intersectObjects(blocks.objects(), false)[0];
  if (blockHit && blockHit.distance < bossHit.distance) return false;
  boss.health = Math.max(0, boss.health - 6);
  soundscape.play("hit");
  status.textContent = boss.health > 0 ? `命中凋灵 · ${boss.health}/${boss.maxHealth}` : "凋灵已倒下！";
  return true;
};

/** Advance Wither boss(es) and grant loot exactly once on defeat. */
const updateWitherLoop = (delta: number): void => {
  const superseded = withers.filter((boss) => boss.defeated).length;
  let justKilled = false;
  for (const boss of withers) {
    if (boss.defeated) continue;
    const frame = updateWither(world, boss, mobs, camera.position, delta);
    if (frame.damageToPlayer > 0) {
      const dealt = applyIncomingDamage(frame.damageToPlayer);
      if (playerHealth === 0) {
        playerHealth = maxPlayerHealth;
        camera.position.set(...respawnPoint());
        verticalVelocity = 0;
        status.textContent = "被凋灵骷髅击中，生命耗尽，已重生";
      } else if (dealt <= 0) {
        status.textContent = "护甲挡住了凋灵骷髅";
      } else {
        status.textContent = dealt < frame.damageToPlayer
          ? `被凋灵骷髅击中 · ${dealt}（护甲减免）`
          : "被凋灵骷髅击中！";
      }
      soundscape.play(dealt <= 0 ? "hit" : "hurt");
      renderHealth();
    }
    if (frame.killed) justKilled = true;
  }
  // Grant loot once when a boss falls.
  if (justKilled) {
    const drops = witherDropBlocks();
    drops.forEach((drop) => { inventory[drop] += 1; });
    witherStars += 1;
    renderHotbar();
    renderWitherStar();
    soundscape.play("pickup");
    status.textContent = `凋灵已被击败！获得 ${drops.map((d) => labels[d]).join("、")} 与 ★ 下界之星`;
    dirty = true;
    persist();
  }
  if (superseded === 0) syncWitherMeshes();
  renderWitherState();
  syncWitherMinionTags();
  syncMobMeshes();
};

const renderNetherState = (): void => {
  biomeText.textContent = "下界生态 · 地狱岩 / 熔岩 / 萤石";
};

/**
 * Nether-only ecology each frame: lava submersion burns the player and a
 * stepped-into portal returns you to the overworld.
 */
let lavaTimer = 0;
const updateNetherEcology = (delta: number): void => {
  const px = Math.round(camera.position.x);
  const py = Math.round(camera.position.y);
  const pz = Math.round(camera.position.z);
  const inLava = nether.get(px, py, pz) === "lava" || nether.get(px, py - 1, pz) === "lava";
  if (inLava) {
    lavaTimer += delta;
    if (lavaTimer >= 0.4) {
      lavaTimer = 0;
      const dealt = applyIncomingDamage(1);
      if (playerHealth <= 0) {
        playerHealth = maxPlayerHealth;
        camera.position.set(...respawnPoint());
        verticalVelocity = 0;
        status.textContent = "熔岩灼烧，已于下界重生";
        soundscape.play("respawn");
      } else if (dealt <= 0) {
        status.textContent = "护甲挡住了熔岩灼烧";
        soundscape.play("hit");
      } else {
        status.textContent = "熔岩灼烧！";
        soundscape.play("hurt");
      }
      renderHealth();
    }
  } else {
    lavaTimer = 0;
  }
};

/** Build the Ender Dragon's original voxel-style flying body (a three.Group). */
const spawnDragonMesh = (): void => {
  if (endDragonGroup) { endDragonGroup.visible = true; return; }
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1b1b23 });
  const belly = new THREE.MeshLambertMaterial({ color: 0x66d9c8 });
  const horn = new THREE.MeshLambertMaterial({ color: 0xd8d2b8 });
  const eyeGlow = new THREE.MeshBasicMaterial({ color: 0x91fff0 });
  const bodyGeo = new THREE.BoxGeometry(2.2, 1.2, 3.4);
  const body = new THREE.Mesh(bodyGeo, dark);
  const bellyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 2.6), belly);
  bellyMesh.position.set(0, -0.55, 0.3);
  body.add(bellyMesh);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), dark);
  head.position.set(0, 0.25, -1.9);
  body.add(head);
  const leftHorn = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), horn);
  leftHorn.position.set(0.32, 0.6, -1.9);
  const rightHorn = leftHorn.clone();
  rightHorn.position.x = -0.32;
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.1), eyeGlow);
  leftEye.position.set(0.3, 0.35, -2.5);
  const rightEye = leftEye.clone();
  rightEye.position.x = -0.3;
  const wingLeft = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 1.6), dark);
  wingLeft.position.set(2.4, 0.3, 0.2);
  const wingRight = wingLeft.clone();
  wingRight.position.x = -2.4;
  group.add(body, head, leftHorn, rightHorn, leftEye, rightEye, wingLeft, wingRight);
  group.userData.dragon = true;
  scene.add(group);
  endDragonGroup = group;
  endDragonGroup.visible = dimension === "end";
};

/** End-only ecology each frame: the dragon patrols, fights, and a healed exit awaits. */
let nextMobIdEnd = 10000;
const updateEndEcology = (delta: number): void => {
  // Step out of the End by touching the central exit portal — only after the boss falls.
  const onPortal = endWorld.get(Math.round(camera.position.x), Math.round(camera.position.y), Math.round(camera.position.z)) === "end_portal"
      || endWorld.get(Math.round(camera.position.x), Math.round(camera.position.y) - 1, Math.round(camera.position.z)) === "end_portal";
  if (onPortal) {
    if (endCleared || endDragon.dead) {
      exitEnd();
      return;
    }
    status.textContent = "击败末影龙后，中央传送门才会开启返回";
  }
  if (endDragon.dead || endCleared) {
    if (endCleared) { biomeText.textContent = "末影龙已击败 · 返回传送门已点亮"; }
    if (endDragonGroup) endDragonGroup.visible = false;
    return;
  }
  const result = updateEnderDragon(endDragon, camera.position, delta, endWorld.crystalCount(), () => nextMobIdEnd++);
  result.summons.forEach((m) => { if (!mobs.some((exist) => exist.id === m.id)) mobs.push(m); });
  if (result.summons.length) syncMobMeshes();
  if (result.damageToPlayer > 0) {
    const dealt = applyIncomingDamage(result.damageToPlayer);
    if (playerHealth === 0) {
      playerHealth = maxPlayerHealth;
      const s = endSpawn();
      camera.position.set(s.x, endWorld.topY(s.x, s.z) + 1.72, s.z);
      verticalVelocity = 0;
      status.textContent = "生命耗尽，已在末地平台重生";
      soundscape.play("respawn");
    } else if (dealt <= 0) {
      status.textContent = "护甲挡住了末影龙冲撞";
      soundscape.play("hit");
    } else {
      status.textContent = dealt < result.damageToPlayer
        ? `末影龙冲撞 · 受到 ${dealt} 点伤害（护甲减免）`
        : `末影龙冲撞 · 受到 ${dealt} 点伤害`;
      soundscape.play("hurt");
    }
    renderHealth();
  }
  if (result.defeated) {
    endCleared = true;
    const loot = endDragon.loot;
    loot.forEach((drop) => {
      const typed = drop as keyof typeof inventory;
      if (typed in inventory && inventory[typed] !== undefined) inventory[typed] += 1;
    });
    status.textContent = "末影龙已被你击败！中央传送门已开启";
    biomeText.textContent = "末影龙已击败 · 返回传送门已点亮";
    if (endDragonGroup) endDragonGroup.visible = false;
    renderHotbar();
    renderHealth();
    persist();
  }
  if (endDragonGroup) {
    endDragonGroup.position.set(
      Math.round(endDragon.x * 2) / 2,
      Math.round(endDragon.y * 2) / 2,
      Math.round(endDragon.z * 2) / 2,
    );
    const tilt = endDragon.state === "charging" ? 0.5 : Math.sin(endDragon.angle) * 0.25;
    endDragonGroup.rotation.y = Math.atan2(camera.position.x - endDragon.x, camera.position.z - endDragon.z);
    endDragonGroup.rotation.x = tilt;
  }
};

const enterEnd = (): void => {
  dimension = "end";
  if (endCleared) {
    endDragon.hp = 0;
    endDragon.dead = true;
  } else {
    endDragon = createEnderDragon(9001);
  }
  const s = endSpawn();
  const groundY = endWorld.topY(s.x, s.z) + 1.72;
  camera.position.set(s.x, Math.max(groundY, s.y + 0.5), s.z);
  verticalVelocity = 0;
  groundPlayerIfBuried();
  syncRenderedChunks(true);
  syncDimensionState();
  dirty = true;
  persist();
  status.textContent = endCleared
    ? "已进入末地 · 末影龙已被击败，踏上中央传送门可返回"
    : "已进入末地 · 摧毁水晶并击败末影龙以开启返回";
  soundscape.play("place");
};

const exitEnd = (): void => {
  if (dimension !== "end") return;
  dimension = "overworld";
  const groundY = world.topY(0, 0) + 1.72;
  camera.position.set(0, groundY, 8);
  verticalVelocity = 0;
  endDragonGroup?.visible && (endDragonGroup.visible = false);
  syncRenderedChunks(true);
  syncDimensionState();
  dirty = true;
  persist();
  status.textContent = "已返回主世界";
  soundscape.play("place");
};

/** A portal frame + opening built in the overworld, linked to the nether. */
const placePortal = (): void => {
  if (dimension !== "overworld") { status.textContent = "下界中无法再搭建传送门"; return; }
  if (portalLinks.length >= 3) { status.textContent = "主世界传送门已达上限（3）"; return; }
  const geometry = defaultPortalGeometry();
  const anchorX = Math.round(camera.position.x - Math.sin(yaw) * 1.8);
  const anchorZ = Math.round(camera.position.z - Math.cos(yaw) * 1.8);
  const baseY = world.topY(anchorX, anchorZ) + 1;
  const overworldAnchor = { x: anchorX, y: baseY, z: anchorZ };
  const offset = (portalLinks.length + 1) * 7;
  const nAnchorX = 4 + (portalLinks.length % 2 === 0 ? offset : -offset);
  const nAnchorZ = 4 + offset;
  const nAnchorY = nether.topY(nAnchorX, nAnchorZ) + 1;
  const netherAnchor = { x: nAnchorX, y: nAnchorY, z: nAnchorZ };
  portalLinks.push(createPortalLink(overworldAnchor, netherAnchor, geometry));
  syncRenderedChunks(true);
  dirty = true;
  persist();
  status.textContent = "传送门已点燃：下界已开启 · 踏入紫色光门穿梭维度";
  soundscape.play("place");
};

/** When the player stands inside the active dimension's portal opening, cross over. */
const tryEnterPortal = (): boolean => {
  for (const link of portalLinks) {
    const from: PortalSide = dimension === "end" ? "overworld" : dimension;
    const anchor = from === "overworld" ? link.overworld : link.nether;
    if (!isWithinPortalOpening(anchor, link.geometry, Math.round(camera.position.x), Math.round(camera.position.y), Math.round(camera.position.z))) continue;
    const dest = teleportPosition(link, from, camera.position);
    dimension = from === "overworld" ? "nether" : "overworld";
    const groundY = currentTopY(dest.x, dest.z) + 1.72;
    camera.position.set(dest.x, Math.max(groundY, dest.y + 0.5), dest.z);
    verticalVelocity = 0;
    groundPlayerIfBuried();
    syncRenderedChunks(true);
    syncDimensionState();
    dirty = true;
    persist();
    status.textContent = dimension === "nether" ? "已进入下界 · 危险地带，小心熔岩" : "已回到主世界";
    soundscape.play("place");
    return true;
  }
  return false;
};

/** After teleporting, always stand on (not inside) the active dimension's ground. */
const groundPlayerIfBuried = (): void => {
  const ground = currentTopY(Math.round(camera.position.x), Math.round(camera.position.z)) + 1.72;
  if (camera.position.y < ground) camera.position.y = ground;
};

const frame = (now: number): void => {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (document.pointerLockElement === renderer.domElement) {
    updatePlayer(delta);
    if (dimension === "overworld") {
      tryEnterPortal();
      syncWitherMinionTags();
      updateMobs(delta);
      updateGuardiansLoop(delta);
      updateVillagersLoop(delta);
      updateRaidsLoop(delta);
      updateWitherLoop(delta);
      renderBiomeState();
    } else if (dimension === "end") {
      updateEndEcology(delta);
      updateMobs(delta);
      syncMobMeshes();
    } else {
      updateNetherEcology(delta);
      renderNetherState();
    }
    if (room && now >= nextNetworkBroadcast) {
      room.updateLocalPlayer(localPlayer());
      room.announcePlayer();
      nextNetworkBroadcast = now + 100;
    }
  }
  syncRenderedChunks();
  if (dimension === "overworld") {
    const worldNow = dayClock.now();
    const progress = dayProgress(worldNow);
    const sunHeight = sunHeightAt(worldNow);
    const angle = progress * Math.PI * 2 - Math.PI / 2;
    sun.position.set(Math.cos(angle) * 38, Math.sin(angle) * 34 + 5, 18);
    sun.intensity = 0.15 + sunHeight * 2.65;
    daylight.intensity = 0.25 + sunHeight * 1.95;
    const night = 1 - sunHeight;
    moon.position.set(-sun.position.x, -sun.position.y + 12, -sun.position.z);
    moonMaterial.opacity = Math.max(0, (night - 0.25) / 0.75);
    starMaterial.opacity = Math.max(0, (night - 0.32) / 0.68) * 0.92;
    cloudMaterial.opacity = 0.22 + sunHeight * 0.58;
    skyColor.setHSL(0.58, 0.45, 0.1 + sunHeight * 0.63);
    scene.background = skyColor;
    fog.color.copy(skyColor);
    cloudGroup.position.x = ((progress * 18) % 8) - 4;
    timeText.textContent = sunHeight > 0.22 ? "☀ 白昼" : "☾ 星夜";
    syncTorchLights();
  }
  findTarget();
  updateMining(delta);
  if (tickAllFurnaces(stations, delta) && stations.furnaceOpen) refreshStationsUi();
  if (tickAllBrewingStands(stations, delta) && stations.brewOpen) refreshStationsUi();
  if (!rendererLost) renderer.render(scene, camera);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

const applyCraftPanelClick = (event: MouseEvent, button: "left" | "right"): void => {
  const target = event.target as HTMLElement;
  const beforeArmor = { ...armor };
  if (!handleCraftClick(stations, inventory, target, armor, { button, shift: event.shiftKey })) return;
  for (const slot of ["helmet", "chestplate", "leggings", "boots"] as const) {
    if (beforeArmor[slot] && !armor[slot]) enchantState.armorEnchants[slot] = [];
    if (armor[slot] && armor[slot] !== beforeArmor[slot]) {
      // Equipped a plain piece from the bag — clear prior enchant on that slot.
      if (!enchantState.gear.some((g) => g.item === armor[slot])) enchantState.armorEnchants[slot] = [];
    }
  }
  if (target.closest("[data-equip-tool]")) {
    const match = enchantState.gear.find((g) => g.item === stations.equippedTool);
    enchantState.equippedToolUid = match?.uid ?? null;
    renderXp();
  }
  soundscape.play("craft");
  refreshStationsUi();
  renderHotbar();
  renderArmor();
  dirty = true;
  persist();
  if (!anyStationOpen()) resumePlayAfterUi();
};

craftPanel.addEventListener("click", (event) => applyCraftPanelClick(event, "left"));
craftPanel.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  applyCraftPanelClick(event, "right");
});

brewPanel.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!handleBrewClick(stations, inventory, target)) return;
  soundscape.play("craft");
  refreshStationsUi();
  renderHotbar();
  dirty = true;
  persist();
  if (!anyStationOpen()) resumePlayAfterUi();
});

furnacePanel.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!handleFurnaceClick(stations, inventory, target)) return;
  soundscape.play("craft");
  refreshStationsUi();
  renderHotbar();
  dirty = true;
  persist();
  if (!anyStationOpen()) resumePlayAfterUi();
});

enchantPanel.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (!handleEnchantClick(stations, inventory, target, {
    experience: enchantState.experience,
    gear: enchantState.gear,
    onEnchanted: (item) => {
      if (isSword(item.item) || isPickaxe(item.item)) {
        stations.equippedTool = item.item as ExtraItem;
        enchantState.equippedToolUid = item.uid;
      }
      status.textContent = `附魔成功 · ${ITEM_LABELS[item.item]} · ${formatEnchantments(item.enchantments)}`;
      renderXp();
    },
    applyArmorEnchants: (item, enchantments) => {
      if (!isArmorPiece(item)) return;
      const slot = armorSlotOf(item);
      const previous = armor[slot];
      if (previous) {
        inventory[previous] = (inventory[previous] ?? 0) + 1;
        enchantState.armorEnchants[slot] = [];
      }
      // Prefer the just-enchanted gear entry (last matching item).
      const worn = [...enchantState.gear].reverse().find((entry) => entry.item === item);
      if (worn) removeGear(enchantState.gear, worn.uid);
      armor[slot] = item;
      enchantState.armorEnchants[slot] = enchantments.map((entry) => ({ ...entry }));
      renderArmor();
    },
  })) return;
  soundscape.play("craft");
  refreshStationsUi();
  renderHotbar();
  renderArmor();
  renderXp();
  dirty = true;
  persist();
  if (!anyStationOpen()) resumePlayAfterUi();
});

