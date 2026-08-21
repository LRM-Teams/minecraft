import * as THREE from "three";
import type { BlockFace } from "./blockFaces";
import manifestJson from "../assets/blocks/manifest.json";

type FaceFiles = { top: string; bottom: string; side: string };
type Manifest = {
  version: number;
  blocks: Record<string, FaceFiles & { three_box_maps?: BlockFace[] }>;
};

const manifest = manifestJson as Manifest;

/** Vite-resolved URLs for face PNGs under assets/blocks. */
const faceUrlByRel = import.meta.glob("../assets/blocks/*_{top,bottom,side}.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const urlFor = (filename: string): string | null => {
  const key = `../assets/blocks/${filename}`;
  return faceUrlByRel[key] ?? null;
};

const faceTextures = new Map<string, THREE.Texture>();
let loadStarted = false;
let loadDone = false;
const waiters: Array<() => void> = [];

const cacheKey = (blockId: string, face: BlockFace): string => `${blockId}:${face}`;

/** True when manifest lists a block with all three face files resolvable. */
export const hasBlockFaceAssets = (blockId: string): boolean => {
  const entry = manifest.blocks[blockId];
  if (!entry) return false;
  return Boolean(urlFor(entry.top) && urlFor(entry.bottom) && urlFor(entry.side));
};

export const listManifestBlockIds = (): string[] => Object.keys(manifest.blocks);

/**
 * Kick off TextureLoader for all manifest faces. Call once at boot.
 * `onReady` fires when every face has settled (ok or fail).
 */
export const beginBlockFaceAssets = (onReady?: () => void): void => {
  if (onReady) waiters.push(onReady);
  if (loadDone) {
    waiters.splice(0).forEach((fn) => fn());
    return;
  }
  if (loadStarted) return;
  loadStarted = true;
  const loader = new THREE.TextureLoader();
  let pending = 0;
  let settled = 0;
  const doneOne = (): void => {
    settled += 1;
    if (settled >= pending) {
      loadDone = true;
      waiters.splice(0).forEach((fn) => fn());
    }
  };
  for (const [blockId, entry] of Object.entries(manifest.blocks)) {
    for (const face of ["top", "bottom", "side"] as const) {
      const url = urlFor(entry[face]);
      if (!url) continue;
      pending += 1;
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.needsUpdate = true;
          faceTextures.set(cacheKey(blockId, face), tex);
          doneOne();
        },
        undefined,
        () => doneOne(),
      );
    }
  }
  if (pending === 0) {
    loadDone = true;
    waiters.splice(0).forEach((fn) => fn());
  }
};

/** Loaded face map for world meshes — never HUD icons. */
export const blockFaceTexture = (blockId: string, face: BlockFace): THREE.Texture | null =>
  faceTextures.get(cacheKey(blockId, face)) ?? null;
