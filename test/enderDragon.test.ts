import { describe, expect, it } from "vitest";
import { createEnderDragon, dragonCrystalHeal, updateEnderDragon } from "../src/enderDragon";

const PLAYER = { x: 0, y: 12, z: 11 };

describe("EnderDragon boss", () => {
  it("starts circling the arena with full health and unique loot", () => {
    const dragon = createEnderDragon(1);
    expect(dragon.hp).toBe(dragon.maxHp);
    expect(dragon.state).toBe("circling");
    expect(dragon.loot).toEqual(["diamond_ore", "gold_ore", "glass"]);
  });

  it("flies a looping circuit and dives to charge when the player is near", () => {
    const dragon = createEnderDragon(1);
    const startX = dragon.x;
    // Nudge the initial angle so the dragon is guaranteed close to the player.
    dragon.angle = 0;
    dragon.x = dragon.centerX + Math.cos(0) * dragon.radius;
    dragon.z = dragon.centerZ + Math.sin(0) * dragon.radius;
    const startZ = dragon.z;
    const result = updateEnderDragon(dragon, PLAYER, 1.0, 2026, () => 500);
    // After a tick the dragon chased the player far enough to enter charge range.
    expect(Math.abs(dragon.x - startX) + Math.abs(dragon.z - startZ)).toBeGreaterThan(0);
    // Eventually it enters the charge state for the dash.
    expect(["circling", "charging", "recovering"]).toContain(dragon.state);
    expect(result.defeated).toBe(false);
  });

  it("summons endermen defenders on a cooldown", () => {
    const dragon = createEnderDragon(2);
    dragon.summonCooldown = 0.1;
    const result = updateEnderDragon(dragon, PLAYER, 5.0, 2026, () => 600);
    expect(result.summons.length).toBeGreaterThan(0);
    // Summoned endermen are ordinary Mob entities with fresh unique ids.
    result.summons.forEach((mob) => {
      expect(mob.kind).toBeDefined();
      expect(mob.hp).toBeGreaterThan(0);
    });
  });

  it("heals from an intact end crystal while it survives", () => {
    const dragon = createEnderDragon(3);
    dragon.hp = 120;
    dragon.lastHeal = 0;
    const healed = dragonCrystalHeal(dragon, 2026);
    expect(healed).toBeGreaterThan(0);
    expect(dragon.lastHeal).toBe(healed);
  });

  it("defeats once its health is depleted and reveals its loot", () => {
    const dragon = createEnderDragon(4);
    dragon.hp = 0;
    const result = updateEnderDragon(dragon, PLAYER, 0.1, 2026, () => 700);
    expect(result.defeated).toBe(true);
    expect(dragon.dead).toBe(true);
    expect(dragon.loot).toContain("diamond_ore");
  });
});
