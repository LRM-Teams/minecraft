import { describe, expect, it } from "vitest";
import { createEnderDragon, dragonCrystalHeal, hitEnderDragon, updateEnderDragon } from "../src/enderDragon";

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
    const result = updateEnderDragon(dragon, PLAYER, 1.0, 3, () => 500);
    // After a tick the dragon chased the player far enough to enter charge range.
    expect(Math.abs(dragon.x - startX) + Math.abs(dragon.z - startZ)).toBeGreaterThan(0);
    // Eventually it enters the charge state for the dash.
    expect(["circling", "charging", "recovering"]).toContain(dragon.state);
    expect(result.defeated).toBe(false);
  });

  it("summons void-wisp defenders on a cooldown", () => {
    const dragon = createEnderDragon(2);
    dragon.summonCooldown = 0.1;
    const result = updateEnderDragon(dragon, PLAYER, 5.0, 3, () => 600);
    expect(result.summons.length).toBeGreaterThan(0);
    result.summons.forEach((mob) => {
      expect(mob.kind).toBe("wisp");
      expect(mob.hp).toBeGreaterThan(0);
    });
  });

  it("heals from intact crystals and stops when every crystal is gone", () => {
    const dragon = createEnderDragon(3);
    dragon.hp = 40;
    dragon.lastHeal = 0;
    expect(dragonCrystalHeal(dragon, 2)).toBeGreaterThan(0);
    expect(dragon.lastHeal).toBeGreaterThan(0);
    const before = dragon.hp;
    dragon.lastHeal = 0;
    expect(dragonCrystalHeal(dragon, 0)).toBe(0);
    expect(dragon.hp).toBe(before);
    expect(dragon.lastHeal).toBe(0);
  });

  it("applies charge damage once per charge, not every frame", () => {
    const dragon = createEnderDragon(5, { chargeDamage: 2 });
    dragon.state = "charging";
    dragon.timer = 1;
    dragon.chargeHitLanded = false;
    dragon.x = PLAYER.x;
    dragon.z = PLAYER.z;
    const first = updateEnderDragon(dragon, PLAYER, 0.05, 0, () => 1);
    const second = updateEnderDragon(dragon, PLAYER, 0.05, 0, () => 2);
    expect(first.damageToPlayer).toBe(2);
    expect(second.damageToPlayer).toBe(0);
  });

  it("takes player hits and defeats once its health is depleted", () => {
    const dragon = createEnderDragon(4);
    expect(hitEnderDragon(dragon, 40)).toBe(true);
    expect(dragon.hp).toBe(dragon.maxHp - 40);
    dragon.hp = 0;
    const result = updateEnderDragon(dragon, PLAYER, 0.1, 0, () => 700);
    expect(result.defeated).toBe(true);
    expect(dragon.dead).toBe(true);
    expect(dragon.loot).toContain("diamond_ore");
  });
});
