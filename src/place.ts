import { placeBedPair } from "./bed";
import {
  canPlaceRedstoneDeviceAt,
  canPlaceRedstoneDustAt,
  canPlaceRedstoneLampAt,
} from "./redstone";
import { canPlaceTorchAt } from "./torch";
import type { BlockPosition, BlockType, VoxelWorld } from "./world";

/** Right-click targets that open UI / toggle when the hotbar slot is empty. */
export const BLOCK_INTERACT_TYPES = [
  "crafting_table",
  "furnace",
  "enchanting_table",
  "brewing_stand",
  "bed",
  "lever",
] as const;

export type BlockInteractType = (typeof BLOCK_INTERACT_TYPES)[number];

export const OCCUPIED_PLACE_MESSAGE = "此处无法放置";
export const PLAYER_BLOCKING_PLACE_MESSAGE = "不能把方块放在自己身上";

export const emptyHotbarPlaceMessage = (label?: string): string =>
  `无法放置：${label ?? "快捷栏"}数量不足（挖掘或合成获取）`;

export const isBlockInteractTarget = (
  type: BlockType | undefined,
): type is BlockInteractType =>
  Boolean(type && (BLOCK_INTERACT_TYPES as readonly string[]).includes(type));

/**
 * Empty hotbar (count ≤ 0) keeps station / lever / bed use.
 * Holding a placeable block prefers placing against that face instead.
 * Station UIs may still open while holding (handled by the caller).
 */
export const preferBlockInteract = (
  heldCount: number,
  aimed: BlockType | undefined,
): boolean => heldCount <= 0 && isBlockInteractTarget(aimed);

export type PlaceHit = {
  position: BlockPosition;
  normal: BlockPosition;
};

export type PlaceOk = {
  ok: true;
  position: BlockPosition;
  type: BlockType;
};

export type PlaceFail = {
  ok: false;
  message: string;
};

export type PlaceResult = PlaceOk | PlaceFail;

export type PlaceOptions = {
  yaw: number;
  intersectsPlayer: (position: BlockPosition) => boolean;
  labelFor: (type: BlockType) => string;
};

/**
 * Attempt to place the selected block against a hit face.
 * Mutates `world` on success (including bed pairs). Does not touch inventory.
 */
export const tryPlaceBlock = (
  world: VoxelWorld,
  type: BlockType | undefined,
  heldCount: number,
  hit: PlaceHit | undefined,
  options: PlaceOptions,
): PlaceResult => {
  if (!type || heldCount <= 0) {
    return {
      ok: false,
      message: emptyHotbarPlaceMessage(type ? options.labelFor(type) : undefined),
    };
  }
  if (!hit) {
    return { ok: false, message: "没有可附着的表面" };
  }

  const position: BlockPosition = {
    x: hit.position.x + hit.normal.x,
    y: hit.position.y + hit.normal.y,
    z: hit.position.z + hit.normal.z,
  };

  if (options.intersectsPlayer(position)) {
    return { ok: false, message: PLAYER_BLOCKING_PLACE_MESSAGE };
  }

  if (type === "bed") {
    if (!placeBedPair(world, position, options.yaw)) {
      return { ok: false, message: "床需要两格空间且下方坚实" };
    }
    return { ok: true, position, type };
  }

  if (type === "torch") {
    if (!canPlaceTorchAt(world, position, hit.position)) {
      return { ok: false, message: "火把需要附着在坚实方块上" };
    }
    world.set(position, "torch");
    return { ok: true, position, type };
  }

  if (type === "redstone_dust") {
    if (!canPlaceRedstoneDustAt(world, position)) {
      return { ok: false, message: "红石粉需要放在坚实方块上方" };
    }
    world.set(position, "redstone_dust");
    return { ok: true, position, type };
  }

  if (type === "lever" || type === "redstone_torch") {
    if (!canPlaceRedstoneDeviceAt(world, position, hit.position)) {
      return { ok: false, message: `${options.labelFor(type)}需要附着在坚实方块上` };
    }
    world.set(position, type);
    return { ok: true, position, type };
  }

  if (type === "redstone_lamp") {
    if (!canPlaceRedstoneLampAt(world, position)) {
      return { ok: false, message: OCCUPIED_PLACE_MESSAGE };
    }
    world.set(position, "redstone_lamp");
    return { ok: true, position, type };
  }

  if (world.get(position.x, position.y, position.z)) {
    return { ok: false, message: OCCUPIED_PLACE_MESSAGE };
  }
  world.set(position, type);
  return { ok: true, position, type };
};
