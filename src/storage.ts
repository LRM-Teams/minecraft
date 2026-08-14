import { VoxelWorld, type WorldSnapshot } from "./world";

const SAVE_KEY = "voxel-atelier-save-v1";

export type PlayerSave = { position: [number, number, number]; yaw: number; pitch: number; selected: number };
type SaveFile = { world: WorldSnapshot; player: PlayerSave };

export const loadSave = (): SaveFile | undefined => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveFile) : undefined;
  } catch {
    return undefined;
  }
};

export const saveGame = (world: VoxelWorld, player: PlayerSave): void => {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ world: world.snapshot(), player } satisfies SaveFile));
};

export const clearSave = (): void => localStorage.removeItem(SAVE_KEY);
