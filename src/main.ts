import * as THREE from "three";
import "./style.css";
import { craftPlanks, createInventory, type Inventory } from "./inventory";
import { clearSave, loadSave, saveGame, type PlayerSave } from "./storage";
import { BLOCK_TYPES, type BlockPosition, type BlockType, VoxelWorld } from "./world";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

app.innerHTML = `
  <div id="hud">
    <div id="brand">VOXEL <span>ATELIER</span></div>
    <div id="seed"></div>
    <div id="world-time"></div>
    <div id="crosshair">+</div>
    <div id="hint">点击进入世界 · WASD 移动 · 空格跳跃 · 左键挖掘 · 右键放置</div>
    <div id="status"></div>
    <div id="hotbar"></div>
  </div>
  <div id="start-screen">
    <div class="panel">
      <p class="eyebrow">ORIGINAL VOXEL SANDBOX</p>
      <h1>VOXEL ATELIER</h1>
      <p>探索、采集、建造。一个受经典体素沙盒启发的原创浏览器世界。</p>
      <button id="play">进入世界</button>
      <p class="keys">WASD / 方向键移动　空格跳跃　鼠标视角<br/>左键破坏　右键放置　1–8 / 滚轮切换方块<br/>C：1 原木合成 4 木板</p>
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
const box = new THREE.BoxGeometry(1, 1, 1);
const matrix = new THREE.Matrix4();

class BlockRenderer {
  private meshes = new Map<BlockType, THREE.InstancedMesh>();
  private positions = new Map<BlockType, BlockPosition[]>();

  rebuild(world: VoxelWorld): void {
    this.meshes.forEach((mesh) => scene.remove(mesh));
    this.meshes.clear();
    this.positions.clear();
    BLOCK_TYPES.forEach((type) => this.positions.set(type, []));
    world.blocks.forEach((type, position) => {
      const [x, y, z] = position.split(",").map(Number);
      this.positions.get(type)?.push({ x, y, z });
    });
    BLOCK_TYPES.forEach((type) => {
      const positions = this.positions.get(type) ?? [];
      if (!positions.length) return;
      const material = new THREE.MeshLambertMaterial({
        color: colors[type],
        transparent: type === "leaves" || type === "water",
        opacity: type === "water" ? 0.65 : type === "leaves" ? 0.9 : 1,
      });
      const mesh = new THREE.InstancedMesh(box, material, positions.length);
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
blocks.rebuild(world);

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
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset")!;
let selected = saved?.player.selected ?? 0;
let inventory: Inventory = createInventory(saved?.player.inventory);
let yaw = saved?.player.yaw ?? 0;
let pitch = saved?.player.pitch ?? -0.18;
const initialY = world.topY(0, 0) + 1.72;
camera.position.fromArray(saved?.player.position ?? [0, initialY, 8]);
camera.rotation.set(pitch, yaw, 0);
seedText.textContent = `WORLD SEED · ${world.seed}`;

const renderHotbar = (): void => {
  hotbar.innerHTML = Array.from({ length: 9 }, (_, index) => {
    const type = BLOCK_TYPES[index];
    return `<div class="slot ${index === selected ? "selected" : ""}">${index + 1}${type ? `<span class="swatch ${type}"></span><small>${inventory[type]}</small>` : ""}</div>`;
  }).join("");
  status.textContent = BLOCK_TYPES[selected] ? `${labels[BLOCK_TYPES[selected]]} · ${inventory[BLOCK_TYPES[selected]]}` : "空槽";
};
renderHotbar();

const keys = new Set<string>();
let verticalVelocity = 0;
let grounded = false;
let lastTime = performance.now();
let dirty = false;
const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const center = new THREE.Vector2(0, 0);
let target: { position: BlockPosition; normal: THREE.Vector3 } | undefined;

const playerSave = (): PlayerSave => ({ position: camera.position.toArray() as [number, number, number], yaw, pitch, selected, inventory });
const persist = (): void => { saveGame(world, playerSave()); dirty = false; };
const refreshWorld = (): void => { blocks.rebuild(world); seedText.textContent = `WORLD SEED · ${world.seed}`; dirty = true; };

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

const lockWorld = (): void => { void renderer.domElement.requestPointerLock(); };
playButton.addEventListener("click", lockWorld);
renderer.domElement.addEventListener("mousedown", (event) => {
  if (document.pointerLockElement !== renderer.domElement) { lockWorld(); return; }
  if (event.button === 0) edit(false);
  if (event.button === 2) edit(true);
});
renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("pointerlockchange", () => { startScreen.classList.toggle("hidden", document.pointerLockElement === renderer.domElement); });
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
  camera.position.set(0, world.topY(0, 0) + 1.72, 8);
  verticalVelocity = 0;
  refreshWorld();
  renderHotbar();
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

const frame = (now: number): void => {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (document.pointerLockElement === renderer.domElement) updatePlayer(delta);
  const dayProgress = (now % 150000) / 150000;
  const sunHeight = Math.sin(dayProgress * Math.PI * 2) * 0.5 + 0.5;
  const angle = dayProgress * Math.PI * 2 - Math.PI / 2;
  sun.position.set(Math.cos(angle) * 38, Math.sin(angle) * 34 + 5, 18);
  sun.intensity = 0.15 + sunHeight * 2.65;
  daylight.intensity = 0.25 + sunHeight * 1.95;
  skyColor.setHSL(0.58, 0.45, 0.1 + sunHeight * 0.63);
  scene.background = skyColor;
  fog.color.copy(skyColor);
  cloudGroup.position.x = ((dayProgress * 18) % 8) - 4;
  timeText.textContent = sunHeight > 0.22 ? "☀ 白昼" : "☾ 夜晚";
  findTarget();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
