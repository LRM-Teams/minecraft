# Mobs / Hostile Entities — integration notes

Logic module: `src/entities.ts` (pure TS, no THREE, no `visibleBlocks`).
Tests: `test/entities.test.ts` (7 cases — grounding, no world mutation, chase,
idle, contact damage + cooldown, death + drops, wall avoidance).

Does **not** modify `BLOCK_TYPES`, `WorldSnapshot`, `world.ts`, or `inventory.ts`.
Entity logic never deletes world data and never depends on render culling
(`visibleBlocks` is display-only).

## API

```ts
import { createMob, updateEntities } from "./entities";

// spawn a hostile walker at ground level on column (x, z)
const mobs: Mob[] = [
  createMob(1, 4, 4),
  createMob(2, -5, 3, { hp: 20, aggroRange: 8, speed: 2.6 }),
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
- No mob persistence this pass (save contract untouched); extend later if wanted.
