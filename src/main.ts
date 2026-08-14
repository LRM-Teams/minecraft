import * as THREE from "three";
import "./style.css";
import { createMob, updateEntities, type Mob } from "./entities";
import { craftPlanks, createInventory, type Inventory } from "./inventory";
import { breakDuration, isMineable } from "./mining";
import { clearSave, loadSave, saveGame, type PlayerSave } from "./storage";
import { BLOCK_TYPES, CHUNK_SIZE, type BlockPosition, type BlockType, VoxelWorld } from "./world";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

app.innerHTML = `
  <div id="hud">
    <div id="brand">VOXEL <span>ATELIER</span></div>
    <div id="seed"></div>
    <div id="world-time"></div>
    <div id="health"></div>
    <div id="crosshair">+</div>
    <div id="hint">点击进入世界 · WASD 移动 · 空格跳跃 · 左键长按挖掘/攻击 · 右键放置</div>
    <div id="status"></div>
    <div id="hotbar"></div>
  </div>
  <div id="start-screen">
    <div class="panel">
      <p class="eyebrow">ORIGINAL VOXEL SANDBOX</p>
      <h1>VOXEL ATELIER</h1>
      <p>探索、采集、建造。一个受经典体素沙盒启发的原创浏览器世界。</p>
      <button id="play">进入世界</button>
      <p class="keys">WASD / 方向键移动　空格跳跃　鼠标视角<br/>左键长按破坏 / 瞄准敌对体攻击　右键放置<br/>1–8 / 滚轮切换方块　C：1 原木合成 4 木板</p>
      <button id="reset" class="link">生成新世界</button>
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
};
const labels: Record<BlockType, string> = {
  grass: "草方块", dirt: "泥土", stone: "石头", wood: "原木", planks: "木板", leaves: "树叶", sand: "沙子", water: "水",
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
  } else {
    paint(base);
    for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
      if (type === "planks" && (y % 6 === 0 || x === 0 || x === 8)) paint(base.clone().multiplyScalar(0.55), x, y, type === "planks" ? 2 : 1, type === "planks" ? 1 : 1);
      else if (type === "wood" && (x % 5 === 0 || (face === "top" && noise(x, y) > 0.66))) paint(base.clone().multiplyScalar(0.62), x, y, 1, 2);
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
  const material = (face: BlockFace = "side") => new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: blockTexture(type, face),
    transparent: type === "leaves" || type === "water",
    opacity: type === "water" ? 0.7 : 1,
    alphaTest: type === "leaves" ? 0.2 : 0,
    depthWrite: type !== "water",
  });
  if (type !== "grass") return material();
  const side = material("side");
  return [side, side, material("top"), material("bottom"), side, side];
};
const box = new THREE.BoxGeometry(1, 1, 1);
const matrix = new THREE.Matrix4();

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
      positions.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.positions = positions;
      this.meshes.set(type, mesh);
      scene.add(mesh);
    });
  }

  objects(): THREE.Object3D[] { return [...this.meshes.values()]; }
}

const saved = loadSave();
let world = saved ? VoxelWorld.fromSnapshot(saved.world) : new VoxelWorld(Math.floor(Math.random() * 999999));
const blocks = new BlockRenderer();

const spawnMobs = (): Mob[] => [
  createMob(1, 5, 2, { hp: 12, speed: 2.05, aggroRange: 6.5 }),
  createMob(2, -6, -5, { hp: 12, speed: 2.2, aggroRange: 7 }),
  createMob(3, 8, -6, { hp: 16, speed: 1.9, aggroRange: 7.5 }),
];
let mobs = spawnMobs();
const mobMeshes = new Map<number, THREE.Group>();
const mobBodyGeometry = new THREE.BoxGeometry(0.78, 0.82, 0.56);
const mobHeadGeometry = new THREE.BoxGeometry(0.68, 0.62, 0.62);
const mobBodyMaterial = new THREE.MeshLambertMaterial({ color: 0x59645a });
const mobHeadMaterial = new THREE.MeshLambertMaterial({ color: 0x7d8a7c });
const mobEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf3534d });

const createMobMesh = (mob: Mob): THREE.Group => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(mobBodyGeometry, mobBodyMaterial);
  body.position.y = 0.42;
  body.castShadow = true;
  body.receiveShadow = true;
  const head = new THREE.Mesh(mobHeadGeometry, mobHeadMaterial);
  head.position.y = 1.05;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(body, head);
  [-0.18, 0.18].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), mobEyeMaterial);
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
    if (Number.isFinite(mob.y)) mesh.position.set(mob.x, mob.y, mob.z);
    mesh.rotation.y = mob.facing;
  });
};

const clearMobMeshes = (): void => {
  mobMeshes.forEach((mesh) => scene.remove(mesh));
  mobMeshes.clear();
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
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;
let selected = saved?.player.selected ?? 0;
let inventory: Inventory = createInventory(saved?.player.inventory);
const maxPlayerHealth = 10;
let playerHealth = maxPlayerHealth;
let yaw = saved?.player.yaw ?? 0;
let pitch = saved?.player.pitch ?? -0.18;
const initialY = world.topY(0, 0) + 1.72;
camera.position.fromArray(saved?.player.position ?? [0, initialY, 8]);
camera.rotation.set(pitch, yaw, 0);
seedText.textContent = `WORLD SEED · ${world.seed}`;
let loadedChunkX = Number.NaN;
let loadedChunkZ = Number.NaN;
const syncRenderedChunks = (force = false): void => {
  const chunkX = Math.floor(camera.position.x / CHUNK_SIZE);
  const chunkZ = Math.floor(camera.position.z / CHUNK_SIZE);
  if (!force && chunkX === loadedChunkX && chunkZ === loadedChunkZ) return;
  blocks.rebuild(world, camera.position.x, camera.position.z);
  loadedChunkX = chunkX;
  loadedChunkZ = chunkZ;
};
syncRenderedChunks(true);

const renderHotbar = (): void => {
  hotbar.innerHTML = Array.from({ length: 9 }, (_, index) => {
    const type = BLOCK_TYPES[index];
    return `<div class="slot ${index === selected ? "selected" : ""}">${index + 1}${type ? `<span class="swatch ${type}"></span><small>${inventory[type]}</small>` : ""}</div>`;
  }).join("");
  status.textContent = BLOCK_TYPES[selected] ? `${labels[BLOCK_TYPES[selected]]} · ${inventory[BLOCK_TYPES[selected]]}` : "空槽";
};
renderHotbar();

const renderHealth = (): void => {
  healthText.textContent = `生命 ${"♥".repeat(playerHealth)}${"♡".repeat(maxPlayerHealth - playerHealth)}`;
};
renderHealth();

const keys = new Set<string>();
let verticalVelocity = 0;
let grounded = false;
let lastTime = performance.now();
let dirty = false;
const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const center = new THREE.Vector2(0, 0);
let target: { position: BlockPosition; normal: THREE.Vector3 } | undefined;
let mineHeld = false;
let miningKey: string | undefined;
let miningProgress = 0;

const playerSave = (): PlayerSave => ({ position: camera.position.toArray() as [number, number, number], yaw, pitch, selected, inventory });
const persist = (): void => { saveGame(world, playerSave()); dirty = false; };
const refreshWorld = (): void => { syncRenderedChunks(true); seedText.textContent = `WORLD SEED · ${world.seed}`; dirty = true; };

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
  const mobHit = raycaster.intersectObjects([...mobMeshes.values()], true)[0];
  if (!mobHit) return false;
  const blockHit = raycaster.intersectObjects(blocks.objects(), false)[0];
  if (blockHit && blockHit.distance < mobHit.distance) return false;
  const mobId = mobHit.object.userData.mobId as number | undefined;
  const mob = mobs.find((candidate) => candidate.id === mobId && !candidate.dead);
  if (!mob) return false;
  mob.hp = Math.max(0, mob.hp - 4);
  status.textContent = mob.hp > 0 ? `命中敌对体 · ${mob.hp}/${mob.maxHp}` : "敌对体已击倒";
  return true;
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
    if (removed) inventory[removed] += 1;
  } else {
    const type = BLOCK_TYPES[selected];
    if (!type || inventory[type] <= 0) return;
    const position = { x: target.position.x + target.normal.x, y: target.position.y + target.normal.y, z: target.position.z + target.normal.z };
    if (!world.get(position.x, position.y, position.z) && !intersectsPlayer(position)) {
      world.set(position, type);
      inventory[type] -= 1;
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

const lockWorld = (): void => { void renderer.domElement.requestPointerLock(); };
playButton.addEventListener("click", lockWorld);
renderer.domElement.addEventListener("mousedown", (event) => {
  if (document.pointerLockElement !== renderer.domElement) { lockWorld(); return; }
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
  const number = Number(event.key);
  if (number >= 1 && number <= BLOCK_TYPES.length) { selected = number - 1; renderHotbar(); dirty = true; }
  if (event.code === "KeyC" && !event.repeat) {
    if (craftPlanks(inventory)) {
      selected = BLOCK_TYPES.indexOf("planks");
      renderHotbar();
      dirty = true;
      persist();
    }
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
  clearSave();
  world = new VoxelWorld(Math.floor(Math.random() * 999999));
  inventory = createInventory();
  clearMobMeshes();
  mobs = spawnMobs();
  playerHealth = maxPlayerHealth;
  camera.position.set(0, world.topY(0, 0) + 1.72, 8);
  verticalVelocity = 0;
  refreshWorld();
  renderHotbar();
  renderHealth();
});
addEventListener("beforeunload", () => { if (dirty) persist(); });
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const updatePlayer = (delta: number): void => {
  const inputX = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const inputZ = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const speed = keys.has("ShiftLeft") ? 8 : 4.4;
  if (inputX || inputZ) {
    const length = Math.hypot(inputX, inputZ);
    const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
    const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
    const nextX = THREE.MathUtils.clamp(camera.position.x + (forwardX * inputZ + sideX * inputX) / length * speed * delta, -world.size + 1, world.size - 1);
    const nextZ = THREE.MathUtils.clamp(camera.position.z + (forwardZ * inputZ + sideZ * inputX) / length * speed * delta, -world.size + 1, world.size - 1);
    const nextGround = world.topY(Math.round(nextX), Math.round(nextZ)) + 1.72;
    if (nextGround <= camera.position.y + 0.85) { camera.position.x = nextX; camera.position.z = nextZ; }
  }
  if (grounded && keys.has("Space")) { verticalVelocity = 7.2; grounded = false; }
  verticalVelocity -= 19 * delta;
  camera.position.y += verticalVelocity * delta;
  const ground = world.topY(Math.round(camera.position.x), Math.round(camera.position.z)) + 1.72;
  if (camera.position.y <= ground) { camera.position.y = ground; verticalVelocity = 0; grounded = true; }
  if (camera.position.y < -8) camera.position.set(0, world.topY(0, 0) + 1.72, 8);
};

const updateMobs = (delta: number): void => {
  const { damageToPlayer, drops } = updateEntities(world, mobs, camera.position, delta);
  if (drops.length) {
    drops.forEach((drop) => { inventory[drop] += 1; });
    renderHotbar();
    dirty = true;
    status.textContent = `获得 ${drops.map((drop) => labels[drop]).join("、")}`;
  }
  if (damageToPlayer > 0) {
    playerHealth = Math.max(0, playerHealth - damageToPlayer);
    if (playerHealth === 0) {
      playerHealth = maxPlayerHealth;
      camera.position.set(0, world.topY(0, 0) + 1.72, 8);
      verticalVelocity = 0;
      status.textContent = "生命耗尽，已在起点重生";
    } else {
      status.textContent = `受到 ${damageToPlayer} 点伤害`;
    }
    renderHealth();
  }
  syncMobMeshes();
};

const frame = (now: number): void => {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (document.pointerLockElement === renderer.domElement) {
    updatePlayer(delta);
    updateMobs(delta);
  }
  syncRenderedChunks();
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
  findTarget();
  updateMining(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
