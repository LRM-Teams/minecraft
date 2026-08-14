# Mobs / Hostile Entities — integration notes

Logic module: `src/entities.ts` (pure TS, no THREE, no `visibleBlocks`).
Tests: `test/entities.test.ts` (10 cases — grounding, no world mutation, three
enemy presets, chase, idle, contact damage + cooldown, kind-specific drops,
death + drops, step-up and wall avoidance).

Does **not** modify `BLOCK_TYPES`, `WorldSnapshot`, `world.ts`, or `inventory.ts`.
Entity logic never deletes world data and never depends on render culling
(`visibleBlocks` is display-only).

## API

```ts
import { createMob, updateEntities } from "./entities";

// Spawn original hostile varieties at ground level on columns (x, z).
const mobs: Mob[] = [
  createMob(1, 4, 4, { kind: "stalker" }), // balanced
  createMob(2, -5, 3, { kind: "brute" }),  // slow, tough, heavy hit
  createMob(3, 6, -4, { kind: "wisp" }),   // quick, fragile scout
];

// each frame, next to the existing player update:
const { damageToPlayer, deaths, drops } = updateEntities(world, mobs, {
  x: camera.position.x,
  y: camera.position.y,
  z: camera.position.z,
}, delta);
```

## Minimal main.ts wiring (for the integrator)

`main.ts` already updates the player inside `frame(now)` (only when pointer
locked). Add the mobs call in the same path:

1. Import `createMob` / `updateEntities`; keep a `const mobs = [...]` module list.
2. In `frame(now)`, inside the `if (document.pointerLockElement === renderer.domElement)` block, after `updatePlayer(delta)`:
   ```ts
   const { damageToPlayer, deaths, drops } = updateEntities(world, mobs, camera.position, delta);
   // damageToPlayer → show a HUD hp bar (the game currently has no player HP; add a small one)
   // deaths → remove their meshes; drops → optionally credit inventory (e.g. inventory.dirt += n)
   ```
3. Render each `Mob` as a small BoxGeometry mesh (e.g. grey `0x7a8186`, red eye).
   Track mesh -> mob so you can reposition on the mob's `x/y/z` and clear on death.
4. Spawn a handful near the start (`world.topY(Math.round(x), Math.round(z)) + 1`).

## Conventions honored

- Standing cell: `y = world.topY(round(x), round(z)) + 1`.
- Anti-tunneling: a mob only steps where its own body cell is not solid and the
  step-up is ≤ 1 block, so it walks around walls instead of through them.
- Contact damage applies per `attackCooldown`, gated by `reach`.
- Mob state: `idle` (light wander) ↔ `chase` (within `aggroRange`, gives up past
  `giveUpRange`).
- Kinds: `stalker` drops dirt/stone, `brute` drops stone/bricks, and `wisp`
  drops sand/glass. Their presets differ in health, speed, awareness and damage.
- No mob persistence this pass (save contract untouched); extend later if wanted.
