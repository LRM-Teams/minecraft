import * as THREE from "three";
import type { ItemType } from "./items";
import { isBlockType, isSword, isTool } from "./items";

/** Destroy-stage count (vanilla-ish 0..9). */
export const CRACK_STAGES = 10;

/** Map continuous mining progress [0,1) → discrete crack stage; 1 → last stage. */
export const crackStageForProgress = (progress: number): number => {
  if (progress <= 0) return -1;
  if (progress >= 1) return CRACK_STAGES - 1;
  return Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES));
};

/** Procedural crack overlay texture for a destroy stage. */
export const makeCrackTexture = (stage: number): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("crack canvas unavailable");
  ctx.clearRect(0, 0, 16, 16);
  if (stage < 0) {
    const empty = new THREE.CanvasTexture(canvas);
    empty.magFilter = THREE.NearestFilter;
    empty.minFilter = THREE.NearestFilter;
    return empty;
  }
  ctx.strokeStyle = `rgba(20,20,20,${0.35 + stage * 0.06})`;
  ctx.lineWidth = 1;
  const cracks = 2 + stage;
  for (let i = 0; i < cracks; i += 1) {
    const seed = (stage + 1) * 17 + i * 31;
    let x = (seed * 3) % 16;
    let y = (seed * 7) % 16;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 4 + stage; step += 1) {
      x = (x + ((seed + step * 5) % 5) - 2 + 16) % 16;
      y = (y + ((seed + step * 9) % 5) - 2 + 16) % 16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (stage >= 6) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(4, 4, 8, 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export type ViewmodelKind = "empty" | "block" | "tool" | "sword" | "item";

export const heldKind = (item: ItemType | null | undefined, equippedTool: ItemType | null | undefined): {
  kind: ViewmodelKind;
  display: ItemType | null;
} => {
  const tool = equippedTool && isTool(equippedTool) ? equippedTool : null;
  if (tool) {
    return { kind: isSword(tool) ? "sword" : "tool", display: tool };
  }
  if (!item) return { kind: "empty", display: null };
  if (isBlockType(item)) return { kind: "block", display: item };
  if (isSword(item)) return { kind: "sword", display: item };
  if (isTool(item)) return { kind: "tool", display: item };
  return { kind: "item", display: item };
};

const skinMat = () => new THREE.MeshLambertMaterial({ color: 0xd4a574 });
const sleeveMat = () => new THREE.MeshLambertMaterial({ color: 0x3d6ea5 });

export type ViewmodelController = {
  root: THREE.Group;
  setHeld: (item: ItemType | null, equippedTool: ItemType | null, blockColor?: number) => void;
  /** `swing` 0..1 mining/attack pulse; `active` when LMB held. */
  tick: (delta: number, active: boolean) => void;
  dispose: () => void;
};

/**
 * First-person right-hand viewmodel parented to the camera.
 * Procedural placeholder until man delivers art (LRM-1605).
 */
export const createViewmodel = (): ViewmodelController => {
  const root = new THREE.Group();
  root.name = "fp-viewmodel";
  root.position.set(0.28, -0.32, -0.42);

  const arm = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), sleeveMat());
  upper.position.set(0, -0.06, 0.02);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.14), skinMat());
  hand.position.set(0, -0.24, 0.04);
  arm.add(upper, hand);
  root.add(arm);

  const heldAnchor = new THREE.Group();
  heldAnchor.position.set(0.02, -0.28, -0.02);
  root.add(heldAnchor);

  let heldMesh: THREE.Object3D | null = null;
  let swingPhase = 0;
  let swinging = false;
  let currentKey = "";

  const clearHeld = (): void => {
    if (!heldMesh) return;
    heldAnchor.remove(heldMesh);
    heldMesh.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    });
    heldMesh = null;
  };

  const setHeld = (item: ItemType | null, equippedTool: ItemType | null, blockColor = 0x888888): void => {
    const { kind, display } = heldKind(item, equippedTool);
    const key = `${kind}:${display ?? "none"}:${blockColor}`;
    if (key === currentKey) return;
    currentKey = key;
    clearHeld();
    if (kind === "empty" || !display) return;

    if (kind === "block") {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshLambertMaterial({ color: blockColor }),
      );
      mesh.position.set(0.06, 0.02, -0.08);
      mesh.rotation.set(0.25, 0.6, 0.1);
      heldMesh = mesh;
      heldAnchor.add(mesh);
      return;
    }

    const isSwordKind = kind === "sword";
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, isSwordKind ? 0.36 : 0.32, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
    );
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(isSwordKind ? 0.06 : 0.16, isSwordKind ? 0.14 : 0.08, isSwordKind ? 0.02 : 0.06),
      new THREE.MeshLambertMaterial({ color: isSwordKind ? 0xc0c8d0 : 0x9aa0a6 }),
    );
    head.position.y = isSwordKind ? 0.22 : 0.18;
    const group = new THREE.Group();
    group.add(shaft, head);
    group.position.set(0.04, 0.02, -0.06);
    group.rotation.set(0.9, 0.35, -0.4);
    heldMesh = group;
    heldAnchor.add(group);
  };

  const tick = (delta: number, active: boolean): void => {
    if (active) {
      swinging = true;
      swingPhase += delta * 9;
    } else if (swinging) {
      swingPhase += delta * 14;
      if (swingPhase > Math.PI) {
        swinging = false;
        swingPhase = 0;
      }
    } else {
      swingPhase = 0;
    }
    const swing = swinging || active ? Math.sin(Math.min(swingPhase, Math.PI)) : 0;
    // Idle bob
    const bob = Math.sin(performance.now() * 0.004) * 0.008;
    root.position.set(0.28, -0.32 + bob, -0.42);
    root.rotation.set(swing * 0.55, -0.08 + swing * 0.15, swing * 0.35);
    arm.rotation.x = swing * 0.85;
  };

  const dispose = (): void => {
    clearHeld();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && mesh !== heldMesh) mesh.geometry.dispose?.();
    });
  };

  return { root, setHeld, tick, dispose };
};

export type CrackOverlay = {
  mesh: THREE.Mesh;
  set: (progress: number, position: { x: number; y: number; z: number } | null) => void;
  dispose: () => void;
};

/** Cube-sized crack overlay aligned to the targeted block. */
export const createCrackOverlay = (): CrackOverlay => {
  const geometry = new THREE.BoxGeometry(1.02, 1.02, 1.02);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 12;
  const stageTextures: THREE.CanvasTexture[] = [];
  for (let s = 0; s < CRACK_STAGES; s += 1) stageTextures.push(makeCrackTexture(s));
  let lastStage = -2;

  const set = (progress: number, position: { x: number; y: number; z: number } | null): void => {
    const stage = crackStageForProgress(progress);
    if (!position || stage < 0) {
      mesh.visible = false;
      lastStage = -2;
      return;
    }
    mesh.visible = true;
    mesh.position.set(position.x, position.y, position.z);
    if (stage !== lastStage) {
      material.map = stageTextures[stage]!;
      material.needsUpdate = true;
      lastStage = stage;
    }
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
    stageTextures.forEach((t) => t.dispose());
  };

  return { mesh, set, dispose };
};
