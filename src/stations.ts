import {
  asStack,
  clickCraftBag,
  clickCraftCell,
  clickCraftResult,
  emptyGrid,
  listRecipes,
  matchRecipe,
  ownedItems,
  recipeNeedsTable,
  refundCursor,
  refundGrid,
  type CraftCell,
  type CraftCursor,
  type CraftPointerButton,
} from "./crafting";
import type { Inventory } from "./inventory";
import { ITEM_LABELS, isArmor, isTool, type ExtraItem, type ItemType } from "./items";
import {
  createFurnaceState,
  depositFurnace,
  tickFurnace,
  withdrawFurnace,
  type FurnaceState,
} from "./smelting";
import {
  ARMOR_SLOTS,
  SLOT_LABELS,
  isArmorPiece,
  toggleArmor,
  totalArmorPoints,
  type ArmorPiece,
  type ArmorState,
} from "./armor";
import {
  ENCHANT_LABELS,
  canTakeOffer,
  createEnchantTable,
  depositEnchantInput,
  depositLapis,
  formatEnchantments,
  isEnchantable,
  refreshOffers,
  takeOffer,
  withdrawEnchantInput,
  withdrawLapis,
  type EnchantOffer,
  type EnchantTableState,
  type EnchantedItem,
  type Enchantment,
  type ExperienceState,
} from "./enchanting";
import {
  BOTTLE_LABELS,
  BREW_BOTTLE_ITEMS,
  BREW_INGREDIENT_ITEMS,
  INGREDIENT_LABELS,
  canStartBrew,
  createBrewingStand,
  depositBottle,
  depositFuel,
  depositIngredient,
  fillWaterBottle,
  tickBrewingStand,
  withdrawBottle,
  withdrawIngredient,
  type BrewBottle,
  type BrewIngredient,
  type BrewingStandState,
} from "./brewing";

export type CraftMode = "inventory" | "table";

export type StationController = {
  craftOpen: boolean;
  craftMode: CraftMode;
  craftGrid: CraftCell[];
  /** Floating stack under the mouse while crafting (vanilla JE cursor). */
  craftCursor: CraftCursor;
  furnaceOpen: boolean;
  furnaceKey: string | null;
  furnaces: Map<string, FurnaceState>;
  equippedTool: ExtraItem | null;
  enchantOpen: boolean;
  enchantKey: string | null;
  enchantTable: EnchantTableState;
  bookshelfPower: number;
  brewOpen: boolean;
  brewKey: string | null;
  brewingStands: Map<string, BrewingStandState>;
};

export const createStations = (): StationController => ({
  craftOpen: false,
  craftMode: "inventory",
  craftGrid: emptyGrid(2),
  craftCursor: null,
  furnaceOpen: false,
  furnaceKey: null,
  furnaces: new Map(),
  equippedTool: null,
  enchantOpen: false,
  enchantKey: null,
  enchantTable: createEnchantTable(1),
  bookshelfPower: 0,
  brewOpen: false,
  brewKey: null,
  brewingStands: new Map(),
});

export const openInventoryCraft = (stations: StationController, inventory: Inventory): void => {
  if (stations.craftOpen) {
    closeCraft(stations, inventory);
    return;
  }
  closeFurnace(stations);
  closeEnchant(stations, inventory);
  closeBrew(stations, inventory);
  stations.craftMode = "inventory";
  stations.craftGrid = emptyGrid(2);
  stations.craftCursor = null;
  stations.craftOpen = true;
};

export const openTableCraft = (stations: StationController, inventory: Inventory): void => {
  closeFurnace(stations);
  closeEnchant(stations, inventory);
  closeBrew(stations, inventory);
  if (stations.craftOpen) {
    refundGrid(inventory, stations.craftGrid);
    stations.craftCursor = refundCursor(inventory, stations.craftCursor);
  }
  stations.craftMode = "table";
  stations.craftGrid = emptyGrid(3);
  stations.craftCursor = null;
  stations.craftOpen = true;
};

export const closeCraft = (stations: StationController, inventory: Inventory): void => {
  if (!stations.craftOpen) return;
  refundGrid(inventory, stations.craftGrid);
  stations.craftCursor = refundCursor(inventory, stations.craftCursor);
  stations.craftOpen = false;
};

export const openFurnaceAt = (stations: StationController, inventory: Inventory, key: string): void => {
  closeCraft(stations, inventory);
  closeEnchant(stations, inventory);
  closeBrew(stations, inventory);
  if (!stations.furnaces.has(key)) stations.furnaces.set(key, createFurnaceState());
  stations.furnaceKey = key;
  stations.furnaceOpen = true;
};

export const closeFurnace = (stations: StationController): void => {
  stations.furnaceOpen = false;
  stations.furnaceKey = null;
};

export const openEnchantAt = (
  stations: StationController,
  inventory: Inventory,
  key: string,
  seed: number,
  bookshelfPower: number,
): void => {
  closeCraft(stations, inventory);
  closeFurnace(stations);
  closeBrew(stations, inventory);
  if (stations.enchantOpen && stations.enchantKey !== key) {
    closeEnchant(stations, inventory);
  }
  stations.enchantKey = key;
  stations.enchantTable.seed = seed;
  stations.bookshelfPower = bookshelfPower;
  stations.enchantOpen = true;
};

export const closeEnchant = (stations: StationController, inventory: Inventory): void => {
  if (!stations.enchantOpen) return;
  withdrawEnchantInput(stations.enchantTable, inventory);
  if (stations.enchantTable.lapis > 0) {
    inventory.lapis_lazuli = (inventory.lapis_lazuli ?? 0) + stations.enchantTable.lapis;
    stations.enchantTable.lapis = 0;
  }
  stations.enchantTable.offers = [];
  stations.enchantOpen = false;
  stations.enchantKey = null;
};

export const openBrewAt = (stations: StationController, inventory: Inventory, key: string): void => {
  closeCraft(stations, inventory);
  closeFurnace(stations);
  closeEnchant(stations, inventory);
  if (stations.brewOpen && stations.brewKey !== key) {
    closeBrew(stations, inventory);
  }
  if (!stations.brewingStands.has(key)) stations.brewingStands.set(key, createBrewingStand());
  stations.brewKey = key;
  stations.brewOpen = true;
};

export const closeBrew = (stations: StationController, inventory: Inventory): void => {
  if (!stations.brewOpen) return;
  void inventory;
  stations.brewOpen = false;
  stations.brewKey = null;
};

export const activeFurnace = (stations: StationController): FurnaceState | undefined =>
  stations.furnaceKey ? stations.furnaces.get(stations.furnaceKey) : undefined;

export const activeBrewingStand = (stations: StationController): BrewingStandState | undefined =>
  stations.brewKey ? stations.brewingStands.get(stations.brewKey) : undefined;

export const tickAllFurnaces = (stations: StationController, delta: number): boolean => {
  let changed = false;
  stations.furnaces.forEach((state) => {
    if (tickFurnace(state, delta)) changed = true;
  });
  return changed;
};

export const tickAllBrewingStands = (stations: StationController, delta: number): boolean => {
  let changed = false;
  stations.brewingStands.forEach((state) => {
    if (tickBrewingStand(state, delta)) changed = true;
  });
  return changed;
};

export const renderCraftPanelHtml = (
  stations: StationController,
  inventory: Inventory,
  armor: ArmorState,
): string => {
  const size = stations.craftMode === "table" ? 3 : 2;
  const title = stations.craftMode === "table" ? "工作台 3×3" : "背包合成 2×2";
  const recipe = matchRecipe(stations.craftGrid);
  const resultLabel = recipe ? `${ITEM_LABELS[recipe.result.item]} ×${recipe.result.count}` : "—";
  const cursor = stations.craftCursor;
  const cursorLabel = cursor
    ? `光标 ${ITEM_LABELS[cursor.item]} ×${cursor.count}`
    : "光标 空 · 左键取放 · 右键半组/放1 · Shift+左键产物连做";
  const cells = stations.craftGrid.map((cell, index) => {
    const stack = asStack(cell);
    const label = stack
      ? `${ITEM_LABELS[stack.item]}${stack.count > 1 ? ` ×${stack.count}` : ""}`
      : "";
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

  const worn = ARMOR_SLOTS.map((slot) => {
    const piece = armor[slot];
    const label = piece ? ITEM_LABELS[piece] : "空";
    return `<button type="button" class="station-bag ${piece ? "equipped" : ""}" data-unequip-armor="${slot}">${SLOT_LABELS[slot]} · ${label}</button>`;
  }).join("");
  const bagArmor = [
    ...ownedItems(inventory).filter(isArmor),
    ...ARMOR_SLOTS.map((slot) => armor[slot]).filter((piece): piece is ArmorPiece => Boolean(piece)),
  ];
  const uniqueArmor = [...new Set(bagArmor)];
  const armorBtns = uniqueArmor.map((item) => {
    const equipped = ARMOR_SLOTS.some((slot) => armor[slot] === item);
    return `<button type="button" class="station-bag ${equipped ? "equipped" : ""}" data-equip-armor="${item}">${ITEM_LABELS[item]} ${equipped ? "✓" : ""}</button>`;
  }).join("") || "<p class='station-empty'>尚未合成护甲</p>";

  return `
    <div class="station-head"><strong>${title}</strong><span class="craft-cursor">${cursorLabel}</span><button type="button" data-craft-close>关闭 Esc</button></div>
    <div class="station-body armor-layout">
      <div class="craft-grid size-${size}">${cells}</div>
      <button type="button" class="craft-result" data-craft-take title="左键取到光标 · Shift+左键连做到背包">${resultLabel}</button>
      <div class="station-col"><h4>背包</h4><div class="station-bag-list">${bag}</div></div>
      <div class="station-col"><h4>手持工具</h4><div class="station-bag-list">${tools}</div></div>
      <div class="station-col"><h4>护甲 ${totalArmorPoints(armor)}/20</h4><div class="station-bag-list">${worn}${armorBtns}</div></div>
      <div class="station-col recipe-book"><h4>配方</h4>${book}</div>
    </div>
  `;
};

export const renderFurnacePanelHtml = (state: FurnaceState, inventory: Inventory): string => {
  const cookPct = state.cookDuration > 0 ? Math.round((state.cookProgress / state.cookDuration) * 100) : 0;
  const burnPct = state.burnTotal > 0 ? Math.round((state.burnRemaining / state.burnTotal) * 100) : 0;
  const bagSmelt = ownedItems(inventory)
    .filter((item) => ["iron_ore", "gold_ore", "copper_ore", "coal_ore", "diamond_ore", "sand", "wood", "raw_beef"].includes(item))
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

export const renderEnchantPanelHtml = (
  stations: StationController,
  inventory: Inventory,
  experience: ExperienceState,
  gear: EnchantedItem[],
): string => {
  const table = stations.enchantTable;
  refreshOffers(table, experience, stations.bookshelfPower);
  const inputLabel = table.input ? ITEM_LABELS[table.input] : "放入可附魔物品";
  const offers = table.offers.map((offer) => {
    const affordable = canTakeOffer(table, experience, offer);
    const label = `${ENCHANT_LABELS[offer.enchantment.id]} ${offer.enchantment.level} · ${offer.levelCost}级 · 青金石×${offer.lapisCost}`;
    return `<button type="button" class="station-bag enchant-offer ${affordable ? "" : "locked"}" data-enchant-offer="${offer.slot}" ${affordable ? "" : "disabled"}>${label}</button>`;
  }).join("") || "<p class='station-empty'>放入剑/镐/护甲后刷新选项</p>";
  const bagItems = ownedItems(inventory)
    .filter(isEnchantable)
    .map((item) => `<button type="button" class="station-bag" data-enchant-item="${item}">${ITEM_LABELS[item]} <small>${inventory[item]}</small></button>`)
    .join("") || "<p class='station-empty'>无可附魔物品</p>";
  const lapisBtn = (inventory.lapis_lazuli ?? 0) > 0
    ? `<button type="button" class="station-bag" data-enchant-lapis>放入青金石 <small>${inventory.lapis_lazuli}</small></button>`
    : "<p class='station-empty'>无青金石</p>";
  const gearList = gear.map((entry) =>
    `<div class="recipe-line"><span>${ITEM_LABELS[entry.item]}</span><small>${formatEnchantments(entry.enchantments)}</small></div>`,
  ).join("") || "<p class='station-empty'>尚无已附魔装备</p>";

  return `
    <div class="station-head"><strong>附魔台 · 书架 ${stations.bookshelfPower}/15 · 等级 ${experience.level}</strong><button type="button" data-enchant-close>关闭 Esc</button></div>
    <div class="furnace-body enchant-body">
      <div class="furnace-slots">
        <button type="button" class="station-cell" data-enchant-slot="input">${inputLabel}</button>
        <button type="button" class="station-cell" data-enchant-slot="lapis">青金石 ×${table.lapis}</button>
        <div class="station-col"><h4>附魔选项</h4><div class="station-bag-list">${offers}</div></div>
      </div>
      <div class="station-col"><h4>可附魔</h4><div class="station-bag-list">${bagItems}</div></div>
      <div class="station-col"><h4>青金石</h4><div class="station-bag-list">${lapisBtn}</div></div>
      <div class="station-col recipe-book"><h4>已附魔存档</h4>${gearList}</div>
    </div>
  `;
};

export type CraftClickOptions = {
  button?: CraftPointerButton;
  shift?: boolean;
};

export const handleCraftClick = (
  stations: StationController,
  inventory: Inventory,
  target: HTMLElement,
  armor?: ArmorState,
  options: CraftClickOptions = {},
): boolean => {
  const button: CraftPointerButton = options.button ?? "left";
  const shift = Boolean(options.shift);
  if (target.closest("[data-craft-close]")) {
    closeCraft(stations, inventory);
    return true;
  }
  const cell = target.closest<HTMLElement>("[data-craft-cell]");
  if (cell?.dataset.craftCell !== undefined) {
    stations.craftCursor = clickCraftCell(
      stations.craftGrid,
      stations.craftCursor,
      Number(cell.dataset.craftCell),
      button,
    );
    return true;
  }
  const itemBtn = target.closest<HTMLElement>("[data-craft-item]");
  if (itemBtn?.dataset.craftItem) {
    stations.craftCursor = clickCraftBag(
      inventory,
      stations.craftCursor,
      itemBtn.dataset.craftItem as ItemType,
      button,
    );
    return true;
  }
  if (target.closest("[data-craft-take]")) {
    const { cursor, crafted } = clickCraftResult(
      inventory,
      stations.craftGrid,
      stations.craftCursor,
      shift,
    );
    stations.craftCursor = cursor;
    if (crafted && isTool(crafted.item) && !stations.equippedTool) {
      stations.equippedTool = crafted.item as ExtraItem;
    }
    return true;
  }
  const equip = target.closest<HTMLElement>("[data-equip-tool]");
  if (equip?.dataset.equipTool) {
    const tool = equip.dataset.equipTool as ExtraItem;
    stations.equippedTool = stations.equippedTool === tool ? null : tool;
    return true;
  }
  if (armor) {
    const unequip = target.closest<HTMLElement>("[data-unequip-armor]");
    if (unequip?.dataset.unequipArmor) {
      const slot = unequip.dataset.unequipArmor as keyof ArmorState;
      if (armor[slot]) {
        inventory[armor[slot]!] = (inventory[armor[slot]!] ?? 0) + 1;
        armor[slot] = null;
      }
      return true;
    }
    const wear = target.closest<HTMLElement>("[data-equip-armor]");
    if (wear?.dataset.equipArmor) {
      const piece = wear.dataset.equipArmor;
      if (isArmorPiece(piece)) {
        toggleArmor(armor, inventory, piece);
        return true;
      }
    }
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

export type EnchantClickContext = {
  experience: ExperienceState;
  gear: EnchantedItem[];
  onEnchanted?: (item: EnchantedItem, offer: EnchantOffer) => void;
  /** Apply armor enchantments when an enchanted armor piece is produced. */
  applyArmorEnchants?: (item: ItemType, enchantments: Enchantment[]) => void;
};

export const handleEnchantClick = (
  stations: StationController,
  inventory: Inventory,
  target: HTMLElement,
  ctx: EnchantClickContext,
): boolean => {
  if (!stations.enchantOpen) return false;
  if (target.closest("[data-enchant-close]")) {
    closeEnchant(stations, inventory);
    return true;
  }
  const itemBtn = target.closest<HTMLElement>("[data-enchant-item]");
  if (itemBtn?.dataset.enchantItem) {
    depositEnchantInput(stations.enchantTable, inventory, itemBtn.dataset.enchantItem as ItemType);
    refreshOffers(stations.enchantTable, ctx.experience, stations.bookshelfPower);
    return true;
  }
  if (target.closest("[data-enchant-lapis]")) {
    depositLapis(stations.enchantTable, inventory, 1);
    return true;
  }
  const slot = target.closest<HTMLElement>("[data-enchant-slot]");
  if (slot?.dataset.enchantSlot === "input") {
    withdrawEnchantInput(stations.enchantTable, inventory);
    return true;
  }
  if (slot?.dataset.enchantSlot === "lapis") {
    withdrawLapis(stations.enchantTable, inventory, 1);
    return true;
  }
  const offerBtn = target.closest<HTMLElement>("[data-enchant-offer]");
  if (offerBtn?.dataset.enchantOffer !== undefined) {
    const slotIndex = Number(offerBtn.dataset.enchantOffer);
    const offer = stations.enchantTable.offers.find((entry) => entry.slot === slotIndex);
    if (!offer) return true;
    const result = takeOffer(stations.enchantTable, ctx.experience, ctx.gear, offer);
    if (result) {
      ctx.onEnchanted?.(result, offer);
      if (isArmor(result.item)) ctx.applyArmorEnchants?.(result.item, result.enchantments);
    }
    return true;
  }
  return false;
};

export const renderBrewPanelHtml = (stand: BrewingStandState, inventory: Inventory): string => {
  const brewPct = stand.brewDuration > 0 ? Math.round((stand.brewProgress / stand.brewDuration) * 100) : 0;
  const bottleBtns = stand.bottles
    .map((bottle, index) => {
      const label = bottle ? BOTTLE_LABELS[bottle] : `瓶槽 ${index + 1}`;
      return `<button type="button" class="station-cell" data-brew-slot="${index}">${label}</button>`;
    })
    .join("");
  const bagBottles = ownedItems(inventory)
    .filter((item) => BREW_BOTTLE_ITEMS.includes(item as BrewBottle))
    .map((item) => `<button type="button" class="station-bag" data-brew-bottle="${item}">${ITEM_LABELS[item]} <small>${inventory[item]}</small></button>`)
    .join("") || "<p class='station-empty'>无瓶子/药水</p>";
  const bagIng = ownedItems(inventory)
    .filter((item) => BREW_INGREDIENT_ITEMS.includes(item as BrewIngredient))
    .map((item) => `<button type="button" class="station-bag" data-brew-ingredient="${item}">${ITEM_LABELS[item]} <small>${inventory[item]}</small></button>`)
    .join("") || "<p class='station-empty'>无酿造材料</p>";
  const fuelBtn = (inventory.blaze_powder ?? 0) > 0
    ? `<button type="button" class="station-bag" data-brew-fuel>放入烈焰粉 <small>${inventory.blaze_powder}</small></button>`
    : "<p class='station-empty'>无烈焰粉</p>";
  const fillBtn = (inventory.glass_bottle ?? 0) > 0
    ? `<button type="button" class="station-bag" data-brew-fill>灌装水瓶 <small>${inventory.glass_bottle}</small></button>`
    : "<p class='station-empty'>无空瓶</p>";
  const ready = canStartBrew(stand) ? "酿造中…" : "等待材料/燃料";

  return `
    <div class="station-head"><strong>酿造台 · 燃料 ${stand.fuel} · ${ready}</strong><button type="button" data-brew-close>关闭 Esc</button></div>
    <div class="furnace-body brew-body">
      <div class="furnace-slots">
        <button type="button" class="station-cell" data-brew-ingredient-slot>${stand.ingredient ? INGREDIENT_LABELS[stand.ingredient] : "材料"}</button>
        <div class="furnace-bars"><div class="furnace-bar brew"><span style="width:${brewPct}%"></span></div></div>
        <div class="brew-bottles">${bottleBtns}</div>
        <button type="button" class="station-cell">烈焰粉燃料 ×${stand.fuel}</button>
      </div>
      <div class="station-col"><h4>瓶子</h4><div class="station-bag-list">${bagBottles}</div></div>
      <div class="station-col"><h4>材料 / 燃料</h4><div class="station-bag-list">${bagIng}${fuelBtn}${fillBtn}</div></div>
    </div>
  `;
};

export const handleBrewClick = (
  stations: StationController,
  inventory: Inventory,
  target: HTMLElement,
): boolean => {
  const stand = activeBrewingStand(stations);
  if (!stand || !stations.brewOpen) return false;
  if (target.closest("[data-brew-close]")) {
    closeBrew(stations, inventory);
    return true;
  }
  if (target.closest("[data-brew-fill]")) {
    fillWaterBottle(inventory);
    return true;
  }
  if (target.closest("[data-brew-fuel]")) {
    depositFuel(stand, inventory, 1);
    return true;
  }
  const bottleBtn = target.closest<HTMLElement>("[data-brew-bottle]");
  if (bottleBtn?.dataset.brewBottle) {
    const item = bottleBtn.dataset.brewBottle as BrewBottle;
    const emptySlot = stand.bottles.findIndex((entry) => entry === null);
    const slot = (emptySlot >= 0 ? emptySlot : 0) as 0 | 1 | 2;
    depositBottle(stand, inventory, item, slot);
    return true;
  }
  const ingBtn = target.closest<HTMLElement>("[data-brew-ingredient]");
  if (ingBtn?.dataset.brewIngredient) {
    depositIngredient(stand, inventory, ingBtn.dataset.brewIngredient as BrewIngredient);
    return true;
  }
  if (target.closest("[data-brew-ingredient-slot]")) {
    withdrawIngredient(stand, inventory);
    return true;
  }
  const slotBtn = target.closest<HTMLElement>("[data-brew-slot]");
  if (slotBtn?.dataset.brewSlot !== undefined) {
    withdrawBottle(stand, inventory, Number(slotBtn.dataset.brewSlot) as 0 | 1 | 2);
    return true;
  }
  return false;
};
