import * as THREE from "three";
import "./style.css";
import { createMob, updateEntities, type Mob, type MobKind } from "./entities";
import { createGuardiansForWorld, updateGuardians, type VillageGuardian } from "./guardians";
import { greetNearbyVillagers, createVillagersForWorld, tradeWithVillager, updateVillagers, villagerDrop, type Villager } from "./villagers";
import { createRaid, updateRaid, shouldStartRaid, raidProgress, type Raid } from "./raids";
import { craftBricks, craftGlass, craftPlanks, createInventory, type Inventory } from "./inventory";
import { breakDuration, isMineable } from "./mining";
import { Soundscape } from "./sound";
import { createWorldSlot, deleteWorldSlot, listWorldSlots, loadActiveWorld, loadWorldSlot, renameWorldSlot, saveWorldSlot, type PlayerSave, type WorldSlot } from "./storage";
import { MultiplayerRoom, newPlayer, normalizeRoomCode, type PlayerState } from "./multiplayer";
import { BLOCK_TYPES, CHUNK_SIZE, type BlockPosition, type BlockType, type WorldSnapshot, VoxelWorld } from "./world";
import { biomeAt, type BiomeVariant } from "./biomes";
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

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

app.innerHTML = `
  <div id="hud">
    <div id="brand">VOXEL <span>ATELIER</span></div>
    <div id="seed"></div>
    <div id="world-time"></div>
    <div id="health"></div>
    <div id="audio-state"></div>
    <div id="network-state"></div>
    <div id="village-state"></div>
    <div id="guardian-state"></div>
    <div id="raid-state"></div>
    <div id="biome-state"></div>
    <div id="dimension-state"></div>
    <div id="crosshair">+</div>
    <div id="hint">点击进入世界 · WASD 移动 · 空格跳跃 · 左键长按挖掘/攻击 · 右键放置 · N 搭建/点燃传送门 · G 图鉴 · P 村庄坐标</div>
    <div id="status"></div>
    <div id="hotbar"></div>
    <aside id="codex" class="hidden">
      <div class="codex-title">方块图鉴 <small>G 关闭</small></div>
      <p>采集基础：草、泥土、石头、原木、树叶、沙子和水。</p>
      <p>建筑方块：木板、石砖、玻璃。</p>
      <div class="recipe"><kbd>C</kbd> 原木 ×1 <span>→</span> 木板 ×4</div>
      <div class="recipe"><kbd>V</kbd> 石头 ×4 <span>→</span> 石砖 ×4</div>
      <div class="recipe"><kbd>F</kbd> 沙子 ×4 <span>→</span> 玻璃 ×4</div>
      <p class="codex-note">数字键 1–0 或滚轮切换方块；玻璃适合采光建筑。</p>
    </aside>
  </div>
  <div id="start-screen">
    <div class="panel">
      <p class="eyebrow">ORIGINAL VOXEL SANDBOX</p>
      <h1>VOXEL ATELIER</h1>
      <p>探索、采集、建造。一个受经典体素沙盒启发的原创浏览器世界。</p>
      <button id="play">进入世界</button>
      <p class="keys">WASD / 方向键移动　空格跳跃　鼠标视角<br/>左键长按破坏 / 瞄准敌对体攻击　右键放置<br/>1–0 / 滚轮切换方块　C 木板 · V 石砖 · F 玻璃 · G 图鉴 · M 音效 · N 下界传送门</p>
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
};
const labels: Record<BlockType, string> = {
  grass: "草方块", dirt: "泥土", stone: "石头", wood: "原木", planks: "木板", leaves: "树叶", sand: "沙子", water: "水", bricks: "石砖", glass: "玻璃", coal_ore: "煤矿石", copper_ore: "铜矿石", iron_ore: "铁矿石", gold_ore: "金矿石", diamond_ore: "钻石矿石",
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
  } else if (type === "coal_ore" || type === "copper_ore" || type === "iron_ore" || type === "gold_ore" || type === "diamond_ore") {
    // Ores: stone host rock with a bright mineral core and scattered flecks.
    paint(new THREE.Color(colors.stone));
    for (let y = 2; y < 16; y += 3) for (let x = 2; x < 16; x += 3) {
      paint(base.clone().multiplyScalar(0.85 + noise(x, y) * 0.3), x, y, 3, 3);
      if (noise(x + 5, y + 5) > 0.55) paint(new THREE.Color(0xffffff).multiplyScalar(0.8 + noise(x, y) * 0.25), x + 1, y, 1, 1);
    }
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

const blockMaterial = (type: BlockType): THREE.Material | THREE.Material[] => {
  // Per-instance colors are only ever written for tintable blocks (grass/leaves/
  // wood/planks) so they can carry a biome wash. Enabling vertexColors on a
  // non-tintable InstancedMesh that never writes instanceColor reads an unbound
  // attribute on some GPUs (ANGLE/ATI/strict GL) and renders every block black —
  // the same trap the nether material hits. So only tintable types opt in.
  const tintable = BIOME_TINTABLE.has(type);
  const material = (face: BlockFace = "side") => new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: blockTexture(type, face),
    transparent: type === "leaves" || type === "water" || type === "glass",
    opacity: type === "water" ? 0.7 : type === "glass" ? 0.4 : 1,
    alphaTest: type === "leaves" ? 0.2 : 0,
    depthWrite: type !== "water" && type !== "glass",
    vertexColors: tintable,
  });
  if (type !== "grass") return material();
  const side = material("side");
  return [side, side, material("top"), material("bottom"), side, side];
};
const box = new THREE.BoxGeometry(1, 1, 1);
const matrix = new THREE.Matrix4();
/** Neutral instance colour (white) — used as the "no wash" tint so tintable meshes always have a valid instanceColor buffer. */
const ONE_WHITE = new THREE.Color(0xffffff);

class BlockRenderer {
  private meshes = new Map<BlockType, THREE.InstancedMesh>();
  private positions = new Map<BlockType, BlockPosition[]>();

  rebuild(world: VoxelWorld, centerX: number, centerZ: number): void {
    this.meshes.forEach((mesh) => {
      scene.remove(mesh);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
    this.meshes.clear();
    this.positions.clear();
    BLOCK_TYPES.forEach((type) => this.positions.set(type, []));
    world.visibleBlocks(centerX, centerZ, 2).forEach(({ type, position }) => {
      this.positions.get(type)?.push(position);
    });
    BLOCK_TYPES.forEach((type) => {
      const positions = this.positions.get(type) ?? [];
      if (!positions.length) return;
      const mesh = new THREE.InstancedMesh(box, blockMaterial(type), positions.length);
      mesh.castShadow = type !== "leaves";
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const tintable = BIOME_TINTABLE.has(type);
      const tintCache = new Map<BiomeVariant, THREE.Color>();
      positions.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        mesh.setMatrixAt(index, matrix);
        if (tintable) {
          // Always write an instance color (default → white, i.e. no wash) so the
          // vertexColors:true material never reads an unbound instanceColor buffer,
          // which renders black on some GPUs.
          const variant = biomeAt(position.x, position.z, world.seed).variant;
          let color = tintCache.get(variant);
          if (!color) {
            color = variant === "default" ? ONE_WHITE : BIOME_TINTS[variant].clone();
            tintCache.set(variant, color);
          }
          mesh.setColorAt(index, color);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (tintable && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.userData.positions = positions;
      this.meshes.set(type, mesh);
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

const loadedSlot = loadActiveWorld();
const saved = loadedSlot?.save;
let activeWorldId = loadedSlot?.id;
let world = saved ? VoxelWorld.fromSnapshot(saved.world) : new VoxelWorld(Math.floor(Math.random() * 999999));
const blocks = new BlockRenderer();

// --- Phase-3 nether dimension state ---
let nether = saved?.player.nether ? NetherWorld.fromSnapshot(saved.player.nether) : new NetherWorld(world.seed);
/** Which dimension the camera currently inhabits. */
let dimension: "overworld" | "nether" = saved?.player.dimension ?? "overworld";
/** Overworld portal anchor (along with a linked nether anchor). */
let portalLinks: PortalLink[] = [];
const netherChunks = new NetherRenderer(); // nether sub-world terrain
const overworldPortal = new NetherRenderer(); // overworld portal frame overlay

const currentTopY = (x: number, z: number): number => dimension === "nether" ? nether.topY(x, z) : world.topY(x, z);
const currentSize = (): number => dimension === "nether" ? nether.size : world.size;
const respawnPoint = (): [number, number, number] => [0, currentTopY(0, 0) + 1.72, dimension === "nether" ? 4 : 8];

const applyDimensionEnvironment = (): void => {
  const inNether = dimension === "nether";
  scene.background = inNether ? new THREE.Color("#3a0f16") : skyColor;
  fog.color.copy(inNether ? new THREE.Color("#2b070c") : skyColor);
  sun.intensity = inNether ? 0.6 : 0.15 + ((performance.now() % 150000) / 150000) * 2.65;
  daylight.color.set(inNether ? "#c96a5a" : "#d8efff");
  daylight.intensity = inNether ? 1.5 : 2.2;
  cloudGroup.visible = !inNether;
};

const syncDimensionState = (): void => {
  const dimensionText = document.querySelector<HTMLDivElement>("#dimension-state")!;
  dimensionText.textContent = dimension === "nether" ? "下界 · NETHER" : "主世界 · OVERWORLD";
  if (dimension === "nether") {
    blocks.hide();
    overworldPortal.hide();
    netherChunks.show();
  } else {
    blocks.show();
    overworldPortal.show();
    netherChunks.hide();
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
  group.scale.setScalar(style.scale);
  const body = new THREE.Mesh(mobBodyGeometry, style.body);
  body.position.y = 0.42;
  body.castShadow = true;
  body.receiveShadow = true;
  const head = new THREE.Mesh(mobHeadGeometry, style.head);
  head.position.y = 1.05;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(body, head);
  [-0.18, 0.18].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), style.eye);
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
const audioText = document.querySelector<HTMLDivElement>("#audio-state")!;
const networkText = document.querySelector<HTMLDivElement>("#network-state")!;
const villageText = document.querySelector<HTMLDivElement>("#village-state")!;
const guardianText = document.querySelector<HTMLDivElement>("#guardian-state")!;
const raidText = document.querySelector<HTMLDivElement>("#raid-state")!;
const biomeText = document.querySelector<HTMLDivElement>("#biome-state")!;
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
const maxPlayerHealth = 10;
let playerHealth = maxPlayerHealth;
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
const syncRenderedChunks = (force = false): void => {
  const chunkX = Math.floor(camera.position.x / CHUNK_SIZE);
  const chunkZ = Math.floor(camera.position.z / CHUNK_SIZE);
  if (!force && chunkX === loadedChunkX && chunkZ === loadedChunkZ) return;
  if (dimension === "nether") {
    netherChunks.rebuild(netherEntriesNear());
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
  status.textContent = BLOCK_TYPES[selected] ? `${labels[BLOCK_TYPES[selected]]} · ${inventory[BLOCK_TYPES[selected]]}` : "空槽";
};
renderHotbar();

const renderHealth = (): void => {
  healthText.textContent = `生命 ${"♥".repeat(playerHealth)}${"♡".repeat(maxPlayerHealth - playerHealth)}`;
};
renderHealth();

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
  // Joining a room always lands in the overworld; the nether derives from the synced seed.
  nether = new NetherWorld(world.seed);
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

const playerSave = (): PlayerSave => ({ position: camera.position.toArray() as [number, number, number], yaw, pitch, selected, inventory, dimension, nether: nether.snapshot() });
const persist = (): void => {
  if (activeWorldId && saveWorldSlot(activeWorldId, world, playerSave())) {
    dirty = false;
    return;
  }
  activeWorldId = createWorldSlot("世界 1", world, playerSave()).id;
  dirty = false;
};
const refreshWorld = (): void => { syncRenderedChunks(true); seedText.textContent = `WORLD SEED · ${world.seed}`; renderVillageState(); dirty = true; };

const findTarget = (): void => {
  raycaster.setFromCamera(center, camera);
  const hit = raycaster.intersectObjects(blocks.objects(), false)[0];
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
  const entities = raycaster.intersectObjects([...mobMeshes.values(), ...villagerMeshes.values()], true);
  const entityHit = entities[0];
  if (!entityHit) return false;
  const blockHit = raycaster.intersectObjects(blocks.objects(), false)[0];
  if (blockHit && blockHit.distance < entityHit.distance) return false;

  const mobId = entityHit.object.userData.mobId as number | undefined;
  const villagerId = entityHit.object.userData.villagerId as number | undefined;

  if (mobId !== undefined) {
    const mob = mobs.find((candidate) => candidate.id === mobId && !candidate.dead);
    if (!mob) return false;
    mob.hp = Math.max(0, mob.hp - 4);
    soundscape.play("hit");
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
  if (!place) {
    const removed = world.remove(target.position);
    if (removed) {
      inventory[removed] += 1;
      soundscape.play("break");
      room?.sendEdit({ action: "remove", position: target.position });
    }
  } else {
    const type = BLOCK_TYPES[selected];
    if (!type || inventory[type] <= 0) return;
    const position = { x: target.position.x + target.normal.x, y: target.position.y + target.normal.y, z: target.position.z + target.normal.z };
    if (!world.get(position.x, position.y, position.z) && !intersectsPlayer(position)) {
      world.set(position, type);
      inventory[type] -= 1;
      soundscape.play("place");
      room?.sendEdit({ action: "place", position, type });
    }
  }
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
  const block = world.get(x, y, z);
  if (!block || !isMineable(block)) { stopMining(); return; }
  if (key !== miningKey) {
    miningKey = key;
    miningProgress = 0;
  }
  miningProgress = Math.min(1, miningProgress + delta / breakDuration(block));
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
  // Restore the per-world nether sub-world + dimension if the slot carries one.
  nether = slot.save.player.nether ? NetherWorld.fromSnapshot(slot.save.player.nether) : new NetherWorld(world.seed);
  portalLinks = [];
  dimension = slot.save.player.dimension ?? "overworld";
  renderRaidState();
  playerHealth = maxPlayerHealth;
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
  if (document.pointerLockElement !== renderer.domElement) { lockWorld(); return; }
  soundscape.unlock();
  if (event.button === 0 && !attackMobAtCrosshair()) mineHeld = true;
  if (event.button === 2) edit(true);
});
renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("mouseup", (event) => { if (event.button === 0) stopMining(); });
document.addEventListener("pointerlockchange", () => {
  startScreen.classList.toggle("hidden", document.pointerLockElement === renderer.domElement);
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
    if (craftGlass(inventory)) {
      finishCraft("glass");
    } else {
      status.textContent = "需要 4 个沙子";
    }
  }
  if (event.code === "KeyG" && !event.repeat) toggleCodex();
  if (event.code === "KeyP" && !event.repeat) {
    const village = world.village;
    status.textContent = village ? `村庄广场坐标：${village.center.x}, ${village.center.z}` : "当前世界没有可用村庄选址";
  }
  if (event.code === "KeyE" && !event.repeat) {
    soundscape.unlock();
    interactVillager();
  }
  if (event.code === "KeyN" && !event.repeat) {
    soundscape.unlock();
    placePortal();
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
  const speed = keys.has("ShiftLeft") ? 8 : 4.4;
  const size = currentSize();
  if (inputX || inputZ) {
    const length = Math.hypot(inputX, inputZ);
    const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
    const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
    const nextX = THREE.MathUtils.clamp(camera.position.x + (forwardX * inputZ + sideX * inputX) / length * speed * delta, -size + 1, size - 1);
    const nextZ = THREE.MathUtils.clamp(camera.position.z + (forwardZ * inputZ + sideZ * inputX) / length * speed * delta, -size + 1, size - 1);
    const nextGround = currentTopY(Math.round(nextX), Math.round(nextZ)) + 1.72;
    if (nextGround <= camera.position.y + 0.85) { camera.position.x = nextX; camera.position.z = nextZ; }
  }
  if (grounded && keys.has("Space")) {
    verticalVelocity = 7.2;
    grounded = false;
    soundscape.play("jump");
  }
  verticalVelocity -= 19 * delta;
  camera.position.y += verticalVelocity * delta;
  const ground = currentTopY(Math.round(camera.position.x), Math.round(camera.position.z)) + 1.72;
  if (camera.position.y <= ground) { camera.position.y = ground; verticalVelocity = 0; grounded = true; }
  if (camera.position.y < -8) camera.position.set(...respawnPoint());
};

const updateMobs = (delta: number): void => {
  const { damageToPlayer, drops } = updateEntities(world, mobs, camera.position, delta);
  if (drops.length) {
    drops.forEach((drop) => { inventory[drop] += 1; });
    renderHotbar();
    dirty = true;
    status.textContent = `获得 ${drops.map((drop) => labels[drop]).join("、")}`;
    soundscape.play("pickup");
  }
  if (damageToPlayer > 0) {
    playerHealth = Math.max(0, playerHealth - damageToPlayer);
    if (playerHealth === 0) {
      playerHealth = maxPlayerHealth;
      camera.position.set(0, world.topY(0, 0) + 1.72, 8);
      verticalVelocity = 0;
      status.textContent = "生命耗尽，已在起点重生";
      soundscape.play("respawn");
    } else {
      status.textContent = `受到 ${damageToPlayer} 点伤害`;
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
  const dayProgressNow = (performance.now() % 150000) / 150000;
  const isNight = Math.sin(dayProgressNow * Math.PI * 2) * 0.5 + 0.5 < 0.22;
  if (isNight && raids.length === 0 && world.villages.length && raidCooldown <= 0) {
    raids.push(createRaid(nextRaidId++, world.villages[0]));
  }

  renderRaidState();
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
      playerHealth = Math.max(0, playerHealth - 1);
      if (playerHealth <= 0) {
        playerHealth = maxPlayerHealth;
        camera.position.set(...respawnPoint());
        verticalVelocity = 0;
        status.textContent = "熔岩灼烧，已于下界重生";
        soundscape.play("respawn");
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
    const from: PortalSide = dimension;
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
      updateMobs(delta);
      updateGuardiansLoop(delta);
      updateVillagersLoop(delta);
      updateRaidsLoop(delta);
      renderBiomeState();
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
    const dayProgress = (now % 150000) / 150000;
    const sunHeight = Math.sin(dayProgress * Math.PI * 2) * 0.5 + 0.5;
    const angle = dayProgress * Math.PI * 2 - Math.PI / 2;
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
    cloudGroup.position.x = ((dayProgress * 18) % 8) - 4;
    timeText.textContent = sunHeight > 0.22 ? "☀ 白昼" : "☾ 星夜";
  }
  findTarget();
  updateMining(delta);
  if (!rendererLost) renderer.render(scene, camera);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
