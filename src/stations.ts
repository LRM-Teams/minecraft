import {
  craftFromGrid,
  emptyGrid,
  listRecipes,
  matchRecipe,
  ownedItems,
  placeIntoGrid,
  recipeNeedsTable,
  refundGrid,
  takeFromGrid,
  type CraftCell,
} from "./crafting";
import type { Inventory } from "./inventory";
import { ITEM_LABELS, isTool, type ExtraItem, type ItemType } from "./items";
import {
  createFurnaceState,
  depositFurnace,
  tickFurnace,
  withdrawFurnace,
  type FurnaceState,
} from "./smelting";

export type CraftMode = "inventory" | "table";

export type StationController = {
  craftOpen: boolean;
  craftMode: CraftMode;
  craftGrid: CraftCell[];
  furnaceOpen: boolean;
  furnaceKey: string | null;
  furnaces: Map<string, FurnaceState>;
  equippedTool: ExtraItem | null;
};

export const createStations = (): StationController => ({
  craftOpen: false,
  craftMode: "inventory",
  craftGrid: emptyGrid(2),
  furnaceOpen: false,
  furnaceKey: null,
  furnaces: new Map(),
  equippedTool: null,
});

export const openInventoryCraft = (stations: StationController, inventory: Inventory): void => {
  if (stations.craftOpen) {
    closeCraft(stations, inventory);
    return;
  }
  closeFurnace(stations);
  stations.craftMode = "inventory";
  stations.craftGrid = emptyGrid(2);
  stations.craftOpen = true;
};

export const openTableCraft = (stations: StationController, inventory: Inventory): void => {
  closeFurnace(stations);
  if (stations.craftOpen) refundGrid(inventory, stations.craftGrid);
  stations.craftMode = "table";
  stations.craftGrid = emptyGrid(3);
  stations.craftOpen = true;
};

export const closeCraft = (stations: StationController, inventory: Inventory): void => {
  if (!stations.craftOpen) return;
  refundGrid(inventory, stations.craftGrid);
  stations.craftOpen = false;
};

export const openFurnaceAt = (stations: StationController, inventory: Inventory, key: string): void => {
  closeCraft(stations, inventory);
  if (!stations.furnaces.has(key)) stations.furnaces.set(key, createFurnaceState());
  stations.furnaceKey = key;
  stations.furnaceOpen = true;
};

export const closeFurnace = (stations: StationController): void => {
  stations.furnaceOpen = false;
  stations.furnaceKey = null;
};

export const activeFurnace = (stations: StationController): FurnaceState | undefined =>
  stations.furnaceKey ? stations.furnaces.get(stations.furnaceKey) : undefined;

export const tickAllFurnaces = (stations: StationController, delta: number): boolean => {
  let changed = false;
  stations.furnaces.forEach((state) => {
    if (tickFurnace(state, delta)) changed = true;
  });
  return changed;
};

export const renderCraftPanelHtml = (stations: StationController, inventory: Inventory): string => {
  const size = stations.craftMode === "table" ? 3 : 2;
  const title = stations.craftMode === "table" ? "工作台 3×3" : "背包合成 2×2";
  const recipe = matchRecipe(stations.craftGrid);
  const resultLabel = recipe ? `${ITEM_LABELS[recipe.result.item]} ×${recipe.result.count}` : "—";
  const cells = stations.craftGrid.map((item, index) => {
    const label = item ? ITEM_LABELS[item] : "";
    return `<button type="button" class="station-cell" data-craft-cell="${index}">${label}</button>`;
  }).join("");
  const bag = ownedItems(inventory).map((item) =>
    `<button type="button" class="station-bag" data-craft-item="${item}">${ITEM_LABELS[item]} <small>${inventory[item]}</small></button>`,
  ).join("") || "<p class='station-empty'>背包为空</p>";
  const book = listRecipes()
    .filter((entry) => !entry.id.endsWith("_mirror"))
    .map((entry) => {
      const need = recipeNeedsTable(entry) ? "工作台" : "2×2";
      return `<div class="recipe-line"><span>${ITEM_LABELS[entry.result.item]} ×${entry.result.count}</span><small>${need}</small></div>`;
    })
    .join("");
  const tools = ownedItems(inventory).filter(isTool).map((item) =>
    `<button type="button" class="station-bag ${stations.equippedTool === item ? "equipped" : ""}" data-equip-tool="${item}">${ITEM_LABELS[item]} ${stations.equippedTool === item ? "✓" : ""}</button>`,
  ).join("") || "<p class='station-empty'>尚未合成工具</p>";

  return `
    <div class="station-head"><strong>${title}</strong><button type="button" data-craft-close>关闭 Esc</button></div>
    <div class="station-body">
      <div class="craft-grid size-${size}">${cells}</div>
      <button type="button" class="craft-result" data-craft-take>${resultLabel}</button>
      <div class="station-col"><h4>背包</h4><div class="station-bag-list">${bag}</div></div>
      <div class="station-col"><h4>手持工具</h4><div class="station-bag-list">${tools}</div></div>
      <div class="station-col recipe-book"><h4>配方</h4>${book}</div>
    </div>
  `;
};

export const renderFurnacePanelHtml = (state: FurnaceState, inventory: Inventory): string => {
  const cookPct = state.cookDuration > 0 ? Math.round((state.cookProgress / state.cookDuration) * 100) : 0;
  const burnPct = state.burnTotal > 0 ? Math.round((state.burnRemaining / state.burnTotal) * 100) : 0;
  const bagSmelt = ownedItems(inventory)
    .filter((item) => ["iron_ore", "gold_ore", "copper_ore", "coal_ore", "diamond_ore", "sand", "wood"].includes(item))
    .map((item) => `<button type="button" class="station-bag" data-furnace-input="${item}">${ITEM_LABELS[item]} <small>${inventory[item]}</small></button>`)
    .join("") || "<p class='station-empty'>无可烧炼物</p>";
  const bagFuel = ownedItems(inventory)
    .filter((item) => ["coal", "charcoal", "coal_ore", "wood", "planks", "stick"].includes(item))
    .map((item) => `<button type="button" class="station-bag" data-furnace-fuel="${item}">${ITEM_LABELS[item]} <small>${inventory[item]}</small></button>`)
    .join("") || "<p class='station-empty'>无燃料</p>";

  return `
    <div class="station-head"><strong>熔炉</strong><button type="button" data-furnace-close>关闭 Esc</button></div>
    <div class="furnace-body">
      <div class="furnace-slots">
        <button type="button" class="station-cell" data-furnace-slot="input">${state.input ? `${ITEM_LABELS[state.input.item]} ×${state.input.count}` : "原料"}</button>
        <div class="furnace-bars">
          <div class="furnace-bar"><span style="width:${cookPct}%"></span></div>
          <div class="furnace-bar fuel"><span style="width:${burnPct}%"></span></div>
        </div>
        <button type="button" class="station-cell" data-furnace-slot="fuel">${state.fuel ? `${ITEM_LABELS[state.fuel.item]} ×${state.fuel.count}` : "燃料"}</button>
        <button type="button" class="station-cell result" data-furnace-slot="output">${state.output ? `${ITEM_LABELS[state.output.item]} ×${state.output.count}` : "产物"}</button>
      </div>
      <div class="station-col"><h4>放入原料</h4><div class="station-bag-list">${bagSmelt}</div></div>
      <div class="station-col"><h4>放入燃料</h4><div class="station-bag-list">${bagFuel}</div></div>
    </div>
  `;
};

export const handleCraftClick = (
  stations: StationController,
  inventory: Inventory,
  target: HTMLElement,
): boolean => {
  if (target.closest("[data-craft-close]")) {
    closeCraft(stations, inventory);
    return true;
  }
  const cell = target.closest<HTMLElement>("[data-craft-cell]");
  if (cell?.dataset.craftCell !== undefined) {
    takeFromGrid(inventory, stations.craftGrid, Number(cell.dataset.craftCell));
    return true;
  }
  const itemBtn = target.closest<HTMLElement>("[data-craft-item]");
  if (itemBtn?.dataset.craftItem) {
    placeIntoGrid(inventory, stations.craftGrid, itemBtn.dataset.craftItem as ItemType);
    return true;
  }
  if (target.closest("[data-craft-take]")) {
    const result = craftFromGrid(inventory, stations.craftGrid);
    if (result && isTool(result.item) && !stations.equippedTool) {
      stations.equippedTool = result.item as ExtraItem;
    }
    return true;
  }
  const equip = target.closest<HTMLElement>("[data-equip-tool]");
  if (equip?.dataset.equipTool) {
    const tool = equip.dataset.equipTool as ExtraItem;
    stations.equippedTool = stations.equippedTool === tool ? null : tool;
    return true;
  }
  return false;
};

export const handleFurnaceClick = (
  stations: StationController,
  inventory: Inventory,
  target: HTMLElement,
): boolean => {
  const state = activeFurnace(stations);
  if (!state) return false;
  if (target.closest("[data-furnace-close]")) {
    closeFurnace(stations);
    return true;
  }
  const input = target.closest<HTMLElement>("[data-furnace-input]");
  if (input?.dataset.furnaceInput) {
    depositFurnace(state, inventory, input.dataset.furnaceInput as ItemType, "input");
    return true;
  }
  const fuel = target.closest<HTMLElement>("[data-furnace-fuel]");
  if (fuel?.dataset.furnaceFuel) {
    depositFurnace(state, inventory, fuel.dataset.furnaceFuel as ItemType, "fuel");
    return true;
  }
  const slot = target.closest<HTMLElement>("[data-furnace-slot]");
  if (slot?.dataset.furnaceSlot === "output" || slot?.dataset.furnaceSlot === "input" || slot?.dataset.furnaceSlot === "fuel") {
    withdrawFurnace(state, inventory, slot.dataset.furnaceSlot);
    return true;
  }
  return false;
};
