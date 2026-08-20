import { VoxelWorld, type WorldSnapshot } from "./world";
import type { NetherSnapshot } from "./nether";
import type { Inventory } from "./inventory";

const LEGACY_SAVE_KEY = "voxel-atelier-save-v1";
const SLOT_SAVE_KEY = "voxel-atelier-worlds-v1";

/**
 * Optional nether state rides along on the overworld player save. All fields
 * here are optional and additive so existing saves keep loading unchanged.
 */
export type PlayerSave = {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  selected: number;
  inventory?: Partial<Inventory>;
  dimension?: "overworld" | "nether";
  nether?: NetherSnapshot;
  /** Wither bosses defeated → Nether Stars earned (additive optional field). */
  witherStars?: number;
};
export type SaveFile = { world: WorldSnapshot; player: PlayerSave };
export type WorldSlot = { id: string; name: string; updatedAt: number; save: SaveFile };
export type WorldSlotSummary = Pick<WorldSlot, "id" | "name" | "updatedAt">;
type SlotIndex = { activeId?: string; slots: WorldSlot[] };

const emptyIndex = (): SlotIndex => ({ slots: [] });
const storage = (): Storage => localStorage;
export const normaliseWorldName = (name: string): string => name.trim().replace(/\s+/g, " ").slice(0, 32) || "未命名世界";

const readIndex = (): SlotIndex => {
  try {
    const raw = storage().getItem(SLOT_SAVE_KEY);
    if (!raw) return emptyIndex();
    const parsed = JSON.parse(raw) as Partial<SlotIndex>;
    if (!Array.isArray(parsed.slots)) return emptyIndex();
    return { activeId: parsed.activeId, slots: parsed.slots.filter((slot): slot is WorldSlot => Boolean(slot?.id && slot?.save?.world && slot?.save?.player)) };
  } catch {
    return emptyIndex();
  }
};

const writeIndex = (index: SlotIndex): void => storage().setItem(SLOT_SAVE_KEY, JSON.stringify(index));

/** Import the pre-slots save exactly once, retaining all constructed blocks and inventory. */
const migrateLegacy = (index: SlotIndex): SlotIndex => {
  if (index.slots.length) return index;
  try {
    const raw = storage().getItem(LEGACY_SAVE_KEY);
    if (!raw) return index;
    const save = JSON.parse(raw) as SaveFile;
    if (!save?.world || !save?.player) return index;
    const slot: WorldSlot = { id: "legacy-world", name: "原有世界", updatedAt: Date.now(), save };
    const migrated: SlotIndex = { activeId: slot.id, slots: [slot] };
    writeIndex(migrated);
    storage().removeItem(LEGACY_SAVE_KEY);
    return migrated;
  } catch {
    return index;
  }
};

const currentIndex = (): SlotIndex => migrateLegacy(readIndex());
const makeId = (): string => `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const listWorldSlots = (): WorldSlotSummary[] => currentIndex().slots
  .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
  .sort((a, b) => b.updatedAt - a.updatedAt);

export const loadActiveWorld = (): WorldSlot | undefined => {
  const index = currentIndex();
  const active = index.slots.find((slot) => slot.id === index.activeId) ?? index.slots[0];
  if (active && active.id !== index.activeId) writeIndex({ ...index, activeId: active.id });
  return active;
};

export const loadWorldSlot = (id: string): WorldSlot | undefined => {
  const index = currentIndex();
  const slot = index.slots.find((candidate) => candidate.id === id);
  if (!slot) return undefined;
  writeIndex({ ...index, activeId: id });
  return slot;
};

export const createWorldSlot = (name: string, world: VoxelWorld, player: PlayerSave): WorldSlot => {
  const index = currentIndex();
  const slot: WorldSlot = {
    id: makeId(),
    name: normaliseWorldName(name),
    updatedAt: Date.now(),
    save: { world: world.snapshot(), player },
  };
  writeIndex({ activeId: slot.id, slots: [slot, ...index.slots] });
  return slot;
};

export const saveWorldSlot = (id: string, world: VoxelWorld, player: PlayerSave): boolean => {
  const index = currentIndex();
  const slot = index.slots.find((candidate) => candidate.id === id);
  if (!slot) return false;
  slot.save = { world: world.snapshot(), player };
  slot.updatedAt = Date.now();
  writeIndex({ ...index, activeId: id });
  return true;
};

export const renameWorldSlot = (id: string, name: string): boolean => {
  const index = currentIndex();
  const slot = index.slots.find((candidate) => candidate.id === id);
  if (!slot) return false;
  slot.name = normaliseWorldName(name);
  slot.updatedAt = Date.now();
  writeIndex(index);
  return true;
};

export const deleteWorldSlot = (id: string): boolean => {
  const index = currentIndex();
  if (!index.slots.some((slot) => slot.id === id)) return false;
  const slots = index.slots.filter((slot) => slot.id !== id);
  writeIndex({ activeId: index.activeId === id ? slots[0]?.id : index.activeId, slots });
  return true;
};

// Compatibility facade for the original single-save callers.
export const loadSave = (): SaveFile | undefined => loadActiveWorld()?.save;
export const saveGame = (world: VoxelWorld, player: PlayerSave): void => {
  const active = loadActiveWorld();
  if (active) saveWorldSlot(active.id, world, player);
  else createWorldSlot("世界 1", world, player);
};
export const clearSave = (): void => {
  storage().removeItem(LEGACY_SAVE_KEY);
  storage().removeItem(SLOT_SAVE_KEY);
};
