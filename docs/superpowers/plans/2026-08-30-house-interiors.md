# House Interiors and Decorating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player walk into any of the 43 houses and decorate the room inside with furniture bought using coins from jobs.

**Architecture:** A room is not a place on the map — it is a separate space entered by switching a third `mode` value, with its own camera and its own collision. Rooms are a pure function of `building.seed`, so all 43 exist without being stored; only the spots the player fills are saved. Two new focused modules keep this out of `main.js`, which is already a dumping ground.

**Tech Stack:** Vanilla ES modules, canvas 2D, no build step, no dependencies. Tests are plain `.mjs` files run by `node tests/run.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-30-house-interiors-design.md`

---

## Rules that override normal judgement

Read `CLAUDE.md` before starting. The ones this plan touches constantly:

- **Almost no text.** He is six and cannot read fluently. Every control is a
  picture. No labels, no words, anywhere in this feature.
- **Nothing scary.** Bright, friendly, domestic.
- **No binary assets.** Every piece of furniture is drawn by code.
- **Relative paths only.** A leading `/` breaks GitHub Pages.
- **No test-only code in the game.** This is why room layout is a pure
  function returning data — tests ask the generator, in Node.
- **Never run the full test suite while iterating.** Use
  `node tests/run.mjs offline` (a few seconds, no browser) or
  `node tests/run.mjs interiors`. Full runs are for just before a commit that
  finishes a milestone.

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `js/interior.js` | Rooms. Generates room data from a building seed, draws a room, and answers where the player may stand. Nothing about furniture *choice*. |
| `js/furniture.js` | The catalog. What pieces exist, what they cost, how each one is drawn, and the picker overlay for choosing one. |
| `tests/offline/interiors.mjs` | Offline suite for door data, room generation, and drawing. |

> **Every new file in `js/` must also be added to the `PRECACHE` list in
> `sw.js`.** `tests/offline/pwa.mjs` checks that every `js/*.js` file is
> precached and goes red otherwise — the game is installable and has to work
> with no signal, so a module missing from that list is a real bug, not a test
> being fussy. This caught out Task 2 and it applies again to `js/furniture.js`
> in Task 6.

**Modified:**

| File | Change |
|---|---|
| `js/world.js:324-362` | `_buildBuildings()` gains a `door` on each building. |
| `js/missions.js:74-91` | `_findDoorSteps()` reads `b.door` instead of recomputing it. |
| `js/save.js:15-54` | `defaultSave()` gains `rooms` and `unlocked.furniture`. |
| `js/config.js` | An `INTERIOR` block and a `FURNITURE` catalog. |
| `js/main.js` | A third `mode`, two new action kinds, and the inside branch of update/draw. Wiring only — room logic lives in `js/interior.js`. |

## Milestone 1 — doors and rooms (Tasks 1–5)

At the end of Task 5 he can walk into any house and back out. Nothing to decorate yet.

---

### Task 1: Doors become data

Right now the door position is computed inside `js/missions.js` and drawn from separate constants in `js/world.js`. Interiors need it too, and three copies of one number is how they drift apart. Move it onto the building.

**Files:**
- Modify: `js/world.js:324-362`
- Modify: `js/missions.js:74-91`
- Test: `tests/offline/interiors.mjs` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/offline/interiors.mjs`:

```js
// Interiors: doors, room generation, and drawing.
//
// Room layout is a pure function of the building seed, which is what lets this
// suite exist at all — it asks the generator the same questions the game asks
// it, in node, with no browser and no canvas.
const { World } = await import('../../js/world.js');
const { CONFIG } = await import('../../js/config.js');

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const world = new World();

// --- every building must carry its own door --------------------------------
console.log(`\ndoors (${world.buildings.length} buildings)`);

check('every building has a door',
  world.buildings.every((b) => b.door && Number.isFinite(b.door.x) && Number.isFinite(b.door.y)),
  'some building is missing door {x, y}');

check('every door sits on the bottom edge, horizontally centred',
  world.buildings.every((b) => Math.abs(b.door.x - (b.x + b.w / 2)) < 0.01),
  'a door is not centred on its building');

check('every door sits just outside the front wall',
  world.buildings.every((b) => b.door.y > b.y + b.h && b.door.y < b.y + b.h + 64),
  'a door is inside the building or too far from it');

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL INTERIOR CHECKS PASSED');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tests/run.mjs interiors
```

Expected: `FAIL`, and in the dump below it, `every building has a door: some building is missing door {x, y}`.

- [ ] **Step 3: Put the door on the building**

In `js/world.js`, inside `_buildBuildings()`, add `door` to the pushed object. Replace the `this.buildings.push({ ... })` call at line 345 with:

```js
            this.buildings.push({
              x: tx * tile,
              y: ty * tile,
              w: tw * tile,
              h: 3 * tile,
              wall: CONFIG.WALL_PALETTE[slot],
              roof: CONFIG.ROOF_PALETTE[slot],
              // Roughly one in five is a shop, which gets a sign over the door.
              shop: hash(tx + 13, ty + 29) < 0.2,
              // Where the door is, in world pixels. Jobs deliver to it and
              // interiors are entered through it, so it is stored once here
              // rather than recomputed by each of them — two copies of this
              // number is how a delivery ends up at a different door from the
              // one you can walk through.
              door: {
                x: tx * tile + (tw * tile) / 2,
                y: ty * tile + 3 * tile + CONFIG.INTERIOR.DOOR_STEP,
              },
              seed: i,
            });
```

- [ ] **Step 4: Add the constant it needs**

In `js/config.js`, add a new top-level block after the `UI` block:

```js
  // Everything about the insides of houses.
  INTERIOR: {
    DOOR_STEP: 26,     // how far outside the front wall the doorstep sits
  },
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
node tests/run.mjs interiors
```

Expected: `ok    ALL INTERIOR CHECKS PASSED`

- [ ] **Step 6: Make missions read the door instead of recomputing it**

In `js/missions.js`, replace the body of `_findDoorSteps()` (lines 74-91) with:

```js
  _findDoorSteps() {
    const half = CONFIG.PLAYER.HITBOX / 2;
    const out = [];

    for (const b of this.world.buildings) {
      // A small search radius on purpose: if the doorstep isn't nearly where
      // the door is, this isn't a doorstep and we'd rather not use it.
      const spot = this.world.findFreeSpot(b.door.x, b.door.y, half, null, 40);
      if (!spot) continue;
      if (this.world.openness(spot.x, spot.y, half) < MIN_OPENNESS) continue;

      out.push(spot);
    }
    return out;
  }
```

Update the doc comment above it so it says the door comes from the building now:

```js
  /**
   * One doorstep per house, taken from the door the building already carries.
   *
   * Anything that can't be stood on, or is too cramped, is dropped. Add a
   * building to the town and it gets a delivery address for free.
   */
```

- [ ] **Step 7: Prove jobs still work**

```bash
node tests/run.mjs offline
```

Expected: `all 13 suites passed` — in particular `offline/jobs` and `offline/reachability`, which depend on doorsteps. If `offline/jobs` fails, the door moved: `CONFIG.INTERIOR.DOOR_STEP` must be `26` to match the old hardcoded value.

- [ ] **Step 8: Commit**

```bash
git add js/world.js js/missions.js js/config.js tests/offline/interiors.mjs
git commit -m "Give every building its own door

Jobs computed the doorstep in missions.js and the interior work needs the
same point. Two copies of one number is how a delivery ends up at a
different door from the one you can walk through, so it lives on the
building now and missions reads it."
```

---

### Task 2: Rooms generate from the seed

The core of the feature. A pure function, no canvas, so the tests can interrogate it.

**Files:**
- Create: `js/interior.js`
- Modify: `js/config.js`
- Test: `tests/offline/interiors.mjs`

- [ ] **Step 1: Add the room constants**

In `js/config.js`, extend the `INTERIOR` block from Task 1:

```js
  // Everything about the insides of houses.
  INTERIOR: {
    DOOR_STEP: 26,     // how far outside the front wall the doorstep sits

    TILE: 96,          // one floor square inside a house
    ROWS: 4,           // how deep every room is, in floor squares
    WALL: 30,          // the band of wall drawn across the back
    MAT: { w: 84, h: 34 },   // the way out, on the front wall
    SPOT_R: 26,        // a decorating spot's radius

    MIN_SPOTS: 4,
    MAX_SPOTS: 6,

    // Floors, picked per house. Warm and domestic — nothing gloomy.
    FLOORS: ['#C9A227', '#B98A5A', '#9FB07A', '#C08A7A', '#8FA9B8'],
  },
```

- [ ] **Step 2: Write the failing test**

In `tests/offline/interiors.mjs`, add before the final `console.log`:

```js
// --- rooms -----------------------------------------------------------------
const { roomFor } = await import('../../js/interior.js');
const I = CONFIG.INTERIOR;
console.log(`\nrooms (one per building)`);

const rooms = world.buildings.map(roomFor);

check('a room is generated for every building', rooms.length === world.buildings.length);

check('generation is deterministic',
  world.buildings.every((b) => JSON.stringify(roomFor(b)) === JSON.stringify(roomFor(b))),
  'roomFor returned different data for the same building');

check(`every room has ${I.MIN_SPOTS}-${I.MAX_SPOTS} decorating spots`,
  rooms.every((r) => r.spots.length >= I.MIN_SPOTS && r.spots.length <= I.MAX_SPOTS),
  'spot counts: ' + [...new Set(rooms.map((r) => r.spots.length))].join(', '));

check('every spot is inside the walls',
  rooms.every((r) => r.spots.every((s) =>
    s.x - I.SPOT_R >= 0 && s.x + I.SPOT_R <= r.w &&
    s.y - I.SPOT_R >= 0 && s.y + I.SPOT_R <= r.h)),
  'a spot hangs through a wall');

const hits = (s, box) =>
  Math.abs(s.x - (box.x + box.w / 2)) < box.w / 2 + I.SPOT_R &&
  Math.abs(s.y - (box.y + box.h / 2)) < box.h / 2 + I.SPOT_R;

check('no spot overlaps the way out',
  rooms.every((r) => r.spots.every((s) => !hits(s, r.mat))),
  'a spot sits on the mat, so tapping it would fight with leaving');

check('no spot overlaps the fixed furniture',
  rooms.every((r) => r.spots.every((s) => r.fixed.every((f) => !hits(s, f)))),
  'a spot sits on the bed or the rug');

// The save keys furniture by spot INDEX, so the order must never wobble.
check('spots come back in a stable order (front to back, left to right)',
  rooms.every((r) => r.spots.every((s, i) =>
    i === 0 || s.y > r.spots[i - 1].y ||
    (s.y === r.spots[i - 1].y && s.x > r.spots[i - 1].x))),
  'spot order is not sorted — saved furniture would move between loads');

check('every room starts the player on open floor, near the way out',
  rooms.every((r) => r.start.x > 0 && r.start.x < r.w && r.start.y > 0 && r.start.y < r.h),
  'a start point is outside its room');

check('rooms vary between houses',
  new Set(rooms.map((r) => `${r.w}x${r.floor}x${r.spots.length}`)).size > 3,
  'every house generated the same room');
```

- [ ] **Step 3: Run it and watch it fail**

```bash
node tests/run.mjs interiors
```

Expected: `FAIL`, with `Cannot find module` for `js/interior.js`.

- [ ] **Step 4: Write the generator**

Create `js/interior.js`:

```js
/**
 * interior.js — The insides of houses.
 *
 * A room is NOT a place on the map. It is a separate space with its own
 * coordinates, entered by switching mode. That is what stops a child walking
 * out through an interior wall into the middle of a solid block, and it means
 * the town's tile grid never learns that interiors exist.
 *
 * Every room is a pure function of its building's seed, exactly like the town
 * itself: 43 houses have 43 different insides and not one byte is stored for
 * them. Only the furniture he places is ever saved.
 *
 * The file is in two halves and they must stay apart:
 *
 *   roomFor()   plain data, no canvas, no DOM — so the offline tests can ask
 *               it the same questions the game asks it
 *   drawRoom()  everything that touches a canvas
 */

import { CONFIG } from './config.js';
import { hash } from './world.js';

const I = () => CONFIG.INTERIOR;

/** Does a circle at (x, y) touch this box? */
function touches(x, y, r, box) {
  return Math.abs(x - (box.x + box.w / 2)) < box.w / 2 + r &&
         Math.abs(y - (box.y + box.h / 2)) < box.h / 2 + r;
}

/**
 * The room inside a given building, as plain data.
 *
 * Deterministic: same building in, same room out, every load on every phone.
 */
export function roomFor(building) {
  const C = I();
  const s = building.seed;

  // A wider house gets a wider room, so the inside matches what he just
  // walked up to from the street.
  const cols = Math.max(3, Math.round(building.w / CONFIG.TILE));
  const w = cols * C.TILE;
  const h = C.ROWS * C.TILE;

  const floor = C.FLOORS[Math.floor(hash(s + 29, 7) * C.FLOORS.length) % C.FLOORS.length];
  const boards = hash(s + 11, 3) < 0.5;

  // One or two windows on the back wall, showing sky.
  const windowCount = hash(s + 41, 13) < 0.5 ? 1 : 2;
  const windows = [];
  for (let i = 0; i < windowCount; i++) {
    windows.push({ x: (w * (i + 1)) / (windowCount + 1) - 34, w: 68 });
  }

  // The way out, on the front wall, under where the door is outside.
  const mat = { x: w / 2 - C.MAT.w / 2, y: h - C.MAT.h, w: C.MAT.w, h: C.MAT.h };

  // Two pieces that are always there, so a house he has never touched still
  // looks like somebody lives in it rather than like an empty box. They are
  // not removable and they are not solid.
  const bedLeft = hash(s + 57, 19) < 0.5;
  const fixed = [
    { kind: 'bed', x: bedLeft ? 16 : w - 16 - 78, y: C.WALL + 12, w: 78, h: 122 },
    { kind: 'rug', x: w / 2 - 62, y: h / 2 - 30, w: 124, h: 68 },
  ];

  // Decorating spots: every floor square that is clear, then the best few by a
  // deterministic roll, then sorted so the order NEVER wobbles — the save
  // keys furniture by spot index, so a reshuffle would move his chairs.
  const clear = [];
  for (let r = 0; r < C.ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * C.TILE;
      const y = C.WALL + (r + 0.5) * ((h - C.WALL) / C.ROWS);
      if (x - C.SPOT_R < 0 || x + C.SPOT_R > w) continue;
      if (y - C.SPOT_R < 0 || y + C.SPOT_R > h) continue;
      if (touches(x, y, C.SPOT_R, mat)) continue;
      if (fixed.some((f) => touches(x, y, C.SPOT_R, f))) continue;
      clear.push({ x, y, roll: hash(s * 7 + c + 1, r * 5 + 3) });
    }
  }

  clear.sort((a, b) => a.roll - b.roll);
  const want = C.MIN_SPOTS + Math.floor(hash(s + 77, 31) * (C.MAX_SPOTS - C.MIN_SPOTS + 1));
  const spots = clear
    .slice(0, Math.min(want, clear.length))
    .map(({ x, y }) => ({ x, y }))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return {
    seed: s,
    w, h,
    wall: building.wall,
    roof: building.roof,
    floor,
    boards,
    windows,
    mat,
    fixed,
    spots,
    // Standing just inside the door, facing into the room.
    start: { x: w / 2, y: h - C.MAT.h - 34 },
  };
}

/**
 * Keep the player inside the walls.
 *
 * Nothing in a room is solid except the walls themselves — not the bed, not
 * the rug, not a chair he has placed. Getting wedged behind furniture in a
 * room with one way out is the worst thing that could happen in here, and it
 * is worth more than the realism of a solid table.
 */
export function clampToRoom(room, x, y, half) {
  return {
    x: Math.min(Math.max(x, half), room.w - half),
    y: Math.min(Math.max(y, I().WALL + half), room.h - half),
  };
}

/** Is the player standing on the mat, i.e. close enough to leave? */
export function onMat(room, x, y) {
  return touches(x, y, CONFIG.PLAYER.HITBOX / 2, room.mat);
}
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
node tests/run.mjs interiors
```

Expected: `ok    ALL INTERIOR CHECKS PASSED`

If `every room has 4-6 decorating spots` fails with a count below 4, the fixed furniture is eating too much floor: reduce the bed's `h` from `122` to `96`.

- [ ] **Step 6: Commit**

```bash
git add js/interior.js js/config.js tests/offline/interiors.mjs
git commit -m "Generate a room for every house from its seed

43 houses get 43 different insides and nothing is stored for them, the
same way the town itself works. Spots come back sorted because the save
keys furniture by spot index — an unstable order would move his chairs
between loads."
```

---

### Task 3: Draw the room

**Files:**
- Modify: `js/interior.js`
- Test: `tests/offline/interiors.mjs`

- [ ] **Step 1: Write the failing test**

In `tests/offline/interiors.mjs`, add before the final `console.log`:

```js
// --- drawing must not throw, and must never pass NaN to a canvas -----------
const { drawRoom } = await import('../../js/interior.js');
console.log('\ndrawing');

let calls = 0;
const ctx = new Proxy({}, {
  get(_, prop) {
    if (prop === 'canvas') return { width: 800, height: 460 };
    return (...args) => {
      calls++;
      for (const a of args) {
        if (typeof a === 'number' && !Number.isFinite(a)) {
          throw new Error(`Non-finite number passed to ctx.${String(prop)}: ${args}`);
        }
      }
    };
  },
  set() { return true; },
});

let drew = 0;
for (const room of rooms) { drawRoom(ctx, room, {}, 0, () => {}); drew++; }
check(`drew all ${drew} rooms with no NaN (${calls} canvas calls)`, drew === rooms.length);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tests/run.mjs interiors
```

Expected: `FAIL`, `drawRoom is not a function`.

- [ ] **Step 3: Write the drawing half**

Append to `js/interior.js`:

```js
// ---------------------------------------------------------------------------
// Drawing. Everything below here touches a canvas; everything above does not.
// ---------------------------------------------------------------------------

/** A rounded rectangle path. Same helper the HUD uses, kept local. */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw a room, in room coordinates. The caller has already translated so that
 * (0, 0) is the room's top-left corner.
 *
 * @param placed    { [spotIndex]: furnitureId } — what he has put in here
 * @param clock     seconds, for the pulse on the empty spots
 * @param drawPiece how to draw one piece of furniture. Passed in rather than
 *                  imported: furniture.js is the catalog and this file is the
 *                  room, and having them import each other would be a cycle.
 */
export function drawRoom(ctx, room, placed, clock, drawPiece = () => {}) {
  const C = I();

  // Floor.
  ctx.fillStyle = room.floor;
  ctx.fillRect(0, 0, room.w, room.h);

  // Boards or tiles, drawn faintly over it so the floor has a grain and the
  // room does not read as a flat coloured rectangle.
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (room.boards) {
    for (let x = C.TILE; x < room.w; x += C.TILE) {
      ctx.moveTo(x, C.WALL); ctx.lineTo(x, room.h);
    }
  } else {
    for (let x = C.TILE; x < room.w; x += C.TILE) {
      ctx.moveTo(x, C.WALL); ctx.lineTo(x, room.h);
    }
    for (let y = C.WALL + C.TILE; y < room.h; y += C.TILE) {
      ctx.moveTo(0, y); ctx.lineTo(room.w, y);
    }
  }
  ctx.stroke();

  // The back wall, in the same colour as the outside of the house.
  ctx.fillStyle = room.wall;
  ctx.fillRect(0, 0, room.w, C.WALL);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, C.WALL - 4, room.w, 4);

  // Windows, showing sky.
  for (const win of room.windows) {
    ctx.fillStyle = '#BFE3F5';
    roundRectPath(ctx, win.x, 5, win.w, C.WALL - 14, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // The fixed pieces, under everything he places.
  for (const f of room.fixed) {
    if (f.kind === 'rug') {
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      roundRectPath(ctx, f.x, f.y, f.w, f.h, 18);
      ctx.fill();
    } else {
      ctx.fillStyle = '#E8EDF2';                     // mattress
      roundRectPath(ctx, f.x, f.y, f.w, f.h, 8);
      ctx.fill();
      ctx.fillStyle = '#7FB6E0';                     // blanket
      roundRectPath(ctx, f.x, f.y + f.h * 0.42, f.w, f.h * 0.58, 8);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';                     // pillow
      roundRectPath(ctx, f.x + 10, f.y + 9, f.w - 20, 22, 6);
      ctx.fill();
    }
  }

  // The way out. A mat, so it reads as a doorway from the inside.
  ctx.fillStyle = '#8C6A4A';
  roundRectPath(ctx, room.mat.x, room.mat.y, room.mat.w, room.mat.h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRectPath(ctx, room.mat.x + 8, room.mat.y + 7, room.mat.w - 16, room.mat.h - 14, 4);
  ctx.fill();
}

/**
 * The empty decorating spots, pulsing gently.
 *
 * Drawn separately from the room and AFTER the player, so a spot he is
 * standing on is still visible — the thing he is about to tap must never be
 * hidden by his own feet.
 */
export function drawSpots(ctx, room, placed, clock) {
  const C = I();
  const pulse = 0.5 + 0.5 * Math.sin(clock * 2.2);

  room.spots.forEach((spot, i) => {
    if (placed && placed[i]) return;        // filled spots do not glow
    ctx.save();
    ctx.globalAlpha = 0.30 + 0.30 * pulse;
    ctx.fillStyle = '#FFF3B0';
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, C.SPOT_R * (0.86 + 0.14 * pulse), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  });
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
node tests/run.mjs interiors
```

Expected: `ok    ALL INTERIOR CHECKS PASSED`

- [ ] **Step 5: Commit**

```bash
git add js/interior.js tests/offline/interiors.mjs
git commit -m "Draw the inside of a house

Walls in the house's own colour so the inside matches what he walked up
to, a window showing sky, and a mat that reads as the way out. Spots are
drawn after the player on purpose: the thing he is about to tap must not
be hidden by his own feet."
```

---

### Task 4: Walking in and out

**Files:**
- Modify: `js/main.js:81-83` (mode constants), `js/main.js:656-668` (`findAction`), plus update and draw
- Test: manual, then `tests/offline/interiors.mjs`

- [ ] **Step 1: Add the third mode**

In `js/main.js`, at lines 81-83:

```js
const ON_FOOT = 'foot';
const DRIVING = 'drive';
const INSIDE  = 'inside';
let mode = ON_FOOT;

// Which room he is in, and the building it belongs to. Both null outdoors.
let room = null;
let roomBuilding = null;
```

Add the import beside the other module imports at the top of the file:

```js
import { roomFor, drawRoom, drawSpots, clampToRoom, onMat } from './interior.js';
```

- [ ] **Step 2: Teach the action button about doors**

In `js/main.js`, replace `findAction()` (lines 656-668) with:

```js
function findAction() {
  if (mode === DRIVING) return { kind: 'exit' };

  // Inside, the one button is the way out — and only when he is on the mat,
  // so it cannot be pressed by accident from across the room.
  if (mode === INSIDE) {
    return onMat(room, player.x, player.y) ? { kind: 'leave-house' } : null;
  }

  const npc = findNpcWithJob();
  const house = findDoorToEnter();

  // Standing between two things, the nearer one wins — the same rule the car
  // and the neighbour already settle it by.
  const options = [];
  if (npc) options.push({ kind: 'job', npc, d: Math.hypot(npc.x - player.x, npc.y - player.y) });
  if (nearbyCar) options.push({ kind: 'enter', car: nearbyCar, d: Math.hypot(nearbyCar.x - player.x, nearbyCar.y - player.y) });
  if (house) options.push({ kind: 'enter-house', building: house.b, d: house.d });

  if (!options.length) return null;
  options.sort((a, b) => a.d - b.d);
  return options[0];
}

/** The nearest house whose door he is standing on, or null. */
function findDoorToEnter() {
  let best = null;
  let bestDist = CONFIG.INTERIOR.ENTER_RADIUS;

  for (const b of world.buildings) {
    const d = Math.hypot(b.door.x - player.x, b.door.y - player.y);
    if (d < bestDist) { bestDist = d; best = b; }
  }
  return best ? { b: best, d: bestDist } : null;
}
```

- [ ] **Step 3: Add the radius it needs**

In `js/config.js`, add to the `INTERIOR` block:

```js
    ENTER_RADIUS: 46,  // how close to a door he must be to walk in
```

- [ ] **Step 4: Write the going-in and coming-out functions**

In `js/main.js`, add next to `enterCar` / `exitCar` (around line 969):

```js
function enterHouse(building) {
  roomBuilding = building;
  room = roomFor(building);
  player.x = room.start.x;
  player.y = room.start.y;
  player.angle = -Math.PI / 2;      // facing into the room
  player.speed01 = 0;
  mode = INSIDE;
  playAccept();
}

function leaveHouse() {
  const b = roomBuilding;
  // Back onto the doorstep, facing away from the house — the same idea as
  // being put down beside a car rather than inside it.
  player.x = b.door.x;
  player.y = b.door.y;
  player.angle = Math.PI / 2;
  player.speed01 = 0;

  room = null;
  roomBuilding = null;
  mode = ON_FOOT;
  persist();
}
```

- [ ] **Step 5: Handle the two new action kinds**

In `js/main.js`, the action button is dispatched at lines 309-313. Add the two
new kinds to that chain:

```js
  if (input.consumePress('action') && action) {
    if (action.kind === 'exit') exitCar();
    else if (action.kind === 'enter') enterCar(action.car);
    else if (action.kind === 'job') takeJob(action.npc);
    else if (action.kind === 'enter-house') enterHouse(action.building);
    else if (action.kind === 'leave-house') leaveHouse();
  }
```

- [ ] **Step 6: Move him inside**

`player.update()` cannot be used in here. It calls `this.world.moveBox()` and
`this.world.isWaterAt()` with the player's coordinates (`js/player.js:48-70`),
and inside a room those coordinates are **room** coordinates — `(48, 60)` in a
room is somewhere quite different in the town. Calling it would collide him
against whatever happens to be at that spot outdoors, and could declare him to
be swimming in a bedroom.

So movement in here is written out: a straight walk clamped to the walls.

In `js/main.js`, in `update(dt)`, replace the movement block at lines 318-323:

```js
  if (mode === INSIDE) {
    // Written out rather than going through player.update(), which collides
    // against the TOWN — and in here the player's coordinates are the room's,
    // not the town's. Nothing in a room is solid except the walls.
    const stick = input.vector;
    if (stick.mag > 0) {
      const dist = CONFIG.PLAYER.SPEED * stick.mag * dt;
      const next = clampToRoom(
        room,
        player.x + stick.x * dist,
        player.y + stick.y * dist,
        CONFIG.PLAYER.HITBOX / 2,
      );
      player.x = next.x;
      player.y = next.y;

      // Turn to face the joystick by the shortest way round, the same way
      // Player.update does it.
      const want = Math.atan2(stick.y, stick.x);
      let diff = want - player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.angle += diff * Math.min(1, CONFIG.PLAYER.TURN_SPEED * dt);
    }
  } else if (mode === DRIVING) {
    drivenCar.update(dt, input.vector, cars.filter((c) => c !== drivenCar));
  } else {
    player.update(dt, input.vector, blockers());
    separateIfInsideSomebody(dt);
  }
```

- [ ] **Step 7: Draw the room**

In `render()`, add an inside branch as the **first** thing in the function,
before the camera and world drawing begin:

```js
  if (mode === INSIDE) {
    // Drawn centred on screen rather than through the camera. A room is four
    // squares deep and fits on the screen whole — a camera that scrolled it
    // would be motion for nothing, and it would hide the spot he is walking
    // towards.
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const rx = Math.round((w - room.w) / 2);
    const ry = Math.round((h - room.h) / 2);
    const placed = (save.rooms && save.rooms[room.seed]) || {};

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2B2F3A';           // the dark beyond the walls
    ctx.fillRect(0, 0, w, h);

    // Everything from here is in ROOM coordinates, which is also the space
    // player.x/player.y are in while he is inside — so he draws in the right
    // place with no conversion.
    ctx.save();
    ctx.translate(rx, ry);
    drawRoom(ctx, room, placed, clock, drawFurniture);
    player.draw(ctx);
    drawSpots(ctx, room, placed, clock);
    ctx.restore();

    // Controls, in screen coordinates, exactly as outdoors.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawJoystick();
    drawActionButton();
    drawSound(w, h);
    drawMusic(w, h);
    drawCoinCounter(w, h);
    if (pickingSpot !== null) drawPicker(ctx, w, h, save, shake);
    effects.draw(ctx);
    return;
  }
```

`drawFurniture`, `drawPicker` and `pickingSpot` do not exist until Task 8. Until
then, use `drawRoom(ctx, room, placed, clock)` and delete the `drawPicker` line;
Task 8 puts them back.

- [ ] **Step 8: Stop him swimming in a bedroom**

`player.swimming` is left set from whatever was true outdoors, and
`player.draw()` reads it. In `enterHouse()`, after setting the position, add:

```js
  player.swimming = false;
```

- [ ] **Step 9: Look at it**

```bash
node tests/run.mjs offline
```

Expected: `all 14 suites passed`.

Then open the game and walk to a house door. Per `CLAUDE.md`, **this is the step where the real bugs get found** — render and look, do not trust the assertion.

```bash
python -m http.server 8777
```

Open `http://127.0.0.1:8777/index.html`, walk onto a doorstep, press the big button. Check:

- The room appears and he is standing on the mat.
- The joystick moves him and he cannot walk through the walls.
- He is not drawn swimming.
- The big button takes him back out onto the **same** doorstep, facing the street.
- Walking to a *different* house gives a visibly different room.

- [ ] **Step 10: Commit**

```bash
git add js/main.js js/config.js
git commit -m "Walk into a house and back out

A third mode beside on-foot and driving. The room is its own space with
its own coordinates rather than a place on the map, which is what stops a
child walking out through an interior wall into the middle of a block.
The one button he already presses to get into cars now also opens doors."
```

---

### Task 5: Other players while he is inside

**Files:**
- Modify: `js/main.js` (`updateGhosts` ~875, `drawGhosts` ~781)

- [ ] **Step 1: Stop drawing peers who are indoors**

`updateGhosts()` already gates on `mode !== ON_FOOT` (line 875), so pushing apart stops working correctly on its own. `drawGhosts` needs the matching rule. In `js/main.js`, inside the ghost loop around line 781, add at the top of the loop body:

```js
    // Somebody inside a house is not on the street. Drawing them at the last
    // position they sent would leave a friend standing frozen on a doorstep.
    if (g.mode === INSIDE) continue;
```

- [ ] **Step 2: Do not draw any peers while he himself is inside**

The inside branch of the draw function from Task 4 already returns before `drawNameplates(view)` is reached, so nothing further is needed. Confirm by reading the branch — if `drawNameplates` runs before it, move the inside branch above it.

- [ ] **Step 3: Check the net suite still passes**

```bash
node tests/run.mjs net
```

Expected: `ok    ALL NET CHECKS PASSED`. `mode` is sent as a string and a third value is additive; both peers always run the same deployed build.

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "Do not draw friends who have gone indoors

mode is already on the wire, so a peer inside a house reports it. Without
this they stand frozen on a doorstep for as long as they are in there."
```

**Milestone 1 is complete.** Run the whole suite once, including the browser
tests, before moving on:

```bash
node tests/run.mjs
```

---

## Milestone 2 — decorating (Tasks 6–9)

### Task 6: The furniture catalog

**Files:**
- Create: `js/furniture.js`
- Modify: `js/config.js`
- Test: `tests/offline/interiors.mjs`

- [ ] **Step 1: Add the catalog to config**

In `js/config.js`, add a top-level block after `INTERIOR`:

```js
  // What can be put in a room. Bought once, then placed as often as he likes
  // in as many houses as he likes — buying a chair means he owns chairs.
  // Paying per placement would make every tap a small risk, which is the
  // opposite of what decorating should feel like at six.
  //
  // The first two are free so an empty purse can still change something.
  FURNITURE: [
    { id: 'stool',   price: 0 },
    { id: 'chair',   price: 0 },
    { id: 'table',   price: 12 },
    { id: 'lamp',    price: 12 },
    { id: 'plant',   price: 18 },
    { id: 'shelf',   price: 18 },
    { id: 'picture', price: 24 },
    { id: 'chest',   price: 24 },
  ],
```

- [ ] **Step 2: Write the failing test**

In `tests/offline/interiors.mjs`, add before the final `console.log`:

```js
// --- furniture -------------------------------------------------------------
const { FURNITURE, priceOfFurniture, isFurnitureUnlocked, drawFurniture } =
  await import('../../js/furniture.js');
console.log('\nfurniture');

check('the catalog is not empty', FURNITURE.length > 0);

check('every piece has a unique id',
  new Set(FURNITURE.map((f) => f.id)).size === FURNITURE.length,
  'two pieces share an id, so they would share a save slot');

check('at least two pieces are free',
  FURNITURE.filter((f) => priceOfFurniture(f.id) === 0).length >= 2,
  'an empty purse could not decorate anything');

check('a free piece is unlocked with no save at all',
  isFurnitureUnlocked('stool', { coins: 0, unlocked: {} }) === true);

check('a paid piece is locked until it is bought',
  isFurnitureUnlocked('chest', { coins: 0, unlocked: { furniture: [] } }) === false &&
  isFurnitureUnlocked('chest', { coins: 0, unlocked: { furniture: ['chest'] } }) === true);

check('an unknown id is never unlocked',
  isFurnitureUnlocked('nonsense', { coins: 999, unlocked: { furniture: [] } }) === false);

let drewFurniture = 0;
for (const f of FURNITURE) { drawFurniture(ctx, f.id, 40); drewFurniture++; }
check(`drew all ${drewFurniture} pieces with no NaN`, drewFurniture === FURNITURE.length);
```

- [ ] **Step 3: Run it and watch it fail**

```bash
node tests/run.mjs interiors
```

Expected: `FAIL`, `Cannot find module` for `js/furniture.js`.

- [ ] **Step 4: Write the catalog module**

Create `js/furniture.js`:

```js
/**
 * furniture.js — What can go in a room, and how each piece is drawn.
 *
 * Every piece is drawn by code. There are no images in this game and there is
 * not going to be one for a chair.
 *
 * Bought once, placed freely: `save.unlocked.furniture` is a list of ids he
 * owns, and `save.rooms[seed][spotIndex]` is which one he put where.
 */

import { CONFIG } from './config.js';

export const FURNITURE = CONFIG.FURNITURE;

/** What a piece costs. 0 means it was always free. */
export function priceOfFurniture(id) {
  const f = FURNITURE.find((x) => x.id === id);
  return f ? f.price : 0;
}

/** Is this piece free, or already bought? */
export function isFurnitureUnlocked(id, save) {
  const f = FURNITURE.find((x) => x.id === id);
  if (!f) return false;
  if (f.price === 0) return true;
  const list = save.unlocked && save.unlocked.furniture;
  return Array.isArray(list) && list.includes(id);
}

/**
 * Draw one piece around (0, 0), sized to fit a box `size` across.
 *
 * The caller has already translated. Everything is drawn from the middle so a
 * piece looks the same in the picker as it does standing in the room.
 */
export function drawFurniture(ctx, id, size) {
  const u = size / 48;
  ctx.save();

  const wood = '#B98A5A';
  const darkWood = '#8C6A4A';

  if (id === 'stool') {
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, -4 * u, 15 * u, 7 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darkWood;
    ctx.fillRect(-11 * u, -2 * u, 4 * u, 14 * u);
    ctx.fillRect(7 * u, -2 * u, 4 * u, 14 * u);

  } else if (id === 'chair') {
    ctx.fillStyle = '#E07A5F';
    ctx.fillRect(-13 * u, -18 * u, 5 * u, 20 * u);          // back
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15 * u, 7 * u, 0, 0, Math.PI * 2);    // seat
    ctx.fill();
    ctx.fillStyle = darkWood;
    ctx.fillRect(-11 * u, 2 * u, 4 * u, 14 * u);
    ctx.fillRect(7 * u, 2 * u, 4 * u, 14 * u);

  } else if (id === 'table') {
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, -4 * u, 22 * u, 10 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darkWood;
    ctx.fillRect(-2 * u, 2 * u, 4 * u, 16 * u);
    ctx.fillRect(-14 * u, 14 * u, 28 * u, 4 * u);

  } else if (id === 'lamp') {
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.moveTo(-13 * u, -4 * u);
    ctx.lineTo(13 * u, -4 * u);
    ctx.lineTo(8 * u, -20 * u);
    ctx.lineTo(-8 * u, -20 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = darkWood;
    ctx.fillRect(-2 * u, -4 * u, 4 * u, 20 * u);
    ctx.fillRect(-9 * u, 14 * u, 18 * u, 4 * u);

  } else if (id === 'plant') {
    ctx.fillStyle = '#7BB661';
    for (const a of [-0.9, -0.3, 0.3, 0.9]) {
      ctx.beginPath();
      ctx.ellipse(Math.sin(a) * 9 * u, -12 * u - Math.cos(a) * 5 * u,
                  6 * u, 11 * u, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#C08A7A';
    ctx.beginPath();
    ctx.moveTo(-10 * u, 0);
    ctx.lineTo(10 * u, 0);
    ctx.lineTo(7 * u, 16 * u);
    ctx.lineTo(-7 * u, 16 * u);
    ctx.closePath();
    ctx.fill();

  } else if (id === 'shelf') {
    ctx.fillStyle = darkWood;
    ctx.fillRect(-18 * u, -18 * u, 36 * u, 4 * u);
    ctx.fillRect(-18 * u, -2 * u, 36 * u, 4 * u);
    ctx.fillRect(-18 * u, 14 * u, 36 * u, 4 * u);
    const books = ['#E07A5F', '#7BB661', '#6C9BD1', '#FFD166'];
    books.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect((-16 + i * 8) * u, -14 * u, 6 * u, 12 * u);
      ctx.fillRect((-16 + i * 8) * u, 2 * u, 6 * u, 12 * u);
    });

  } else if (id === 'picture') {
    ctx.fillStyle = darkWood;
    ctx.fillRect(-18 * u, -14 * u, 36 * u, 28 * u);
    ctx.fillStyle = '#BFE3F5';
    ctx.fillRect(-14 * u, -10 * u, 28 * u, 20 * u);
    ctx.fillStyle = '#7BB661';
    ctx.beginPath();
    ctx.moveTo(-14 * u, 10 * u);
    ctx.lineTo(-2 * u, -2 * u);
    ctx.lineTo(10 * u, 10 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.arc(8 * u, -5 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();

  } else if (id === 'chest') {
    ctx.fillStyle = wood;
    ctx.fillRect(-18 * u, -6 * u, 36 * u, 22 * u);
    ctx.fillStyle = darkWood;
    ctx.beginPath();
    ctx.moveTo(-18 * u, -6 * u);
    ctx.lineTo(18 * u, -6 * u);
    ctx.lineTo(14 * u, -18 * u);
    ctx.lineTo(-14 * u, -18 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFD166';
    ctx.fillRect(-4 * u, -4 * u, 8 * u, 9 * u);
  }

  ctx.restore();
}
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
node tests/run.mjs interiors
```

Expected: `ok    ALL INTERIOR CHECKS PASSED`

- [ ] **Step 6: Commit**

```bash
git add js/furniture.js js/config.js tests/offline/interiors.mjs
git commit -m "A catalog of furniture, all drawn by code

Bought once and placed freely rather than paid for per placement — buying
a chair means he owns chairs. Paying each time would make every tap a
small risk, which is the opposite of what decorating should feel like at
six. The first two pieces are free so an empty purse can still change
something."
```

---

### Task 7: Save what he places

**Files:**
- Modify: `js/save.js:15-54`
- Test: `tests/offline/interiors.mjs`

- [ ] **Step 1: Write the failing test**

In `tests/offline/interiors.mjs`, add before the final `console.log`:

```js
// --- the save shape --------------------------------------------------------
const { defaultSaveForTests } = await import('../../js/save.js');
console.log('\nsaving');

const fresh = defaultSaveForTests();
check('a new save has an empty set of rooms',
  fresh.rooms && typeof fresh.rooms === 'object' && Object.keys(fresh.rooms).length === 0);
check('a new save has an empty furniture unlock list',
  Array.isArray(fresh.unlocked.furniture) && fresh.unlocked.furniture.length === 0);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tests/run.mjs interiors
```

Expected: `FAIL`, `defaultSaveForTests is not a function`.

- [ ] **Step 3: Add the fields and the export**

In `js/save.js`, inside `defaultSave()`, add after the `boat` field:

```js
    // What he has put in which house.
    //   rooms[buildingSeed][spotIndex] = furniture id
    // Sparse on purpose: a house he has never decorated is not in here at
    // all, so 43 houses cost nothing until he uses them. Keyed by the
    // building's seed, which is its position in generation order — see the
    // warning in js/world.js about never reordering that.
    rooms: {},
```

and extend `unlocked`:

```js
    unlocked: { hat: [], shirt: [], car: [], vehicle: [], furniture: [] },
```

At the bottom of `js/save.js`, add:

```js
/**
 * The default save shape, for the offline tests.
 *
 * Exported rather than duplicated in the test: a test that writes out its own
 * copy of this object passes happily while the real one is wrong.
 */
export function defaultSaveForTests() {
  return defaultSave();
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
node tests/run.mjs interiors
```

Expected: `ok    ALL INTERIOR CHECKS PASSED`

- [ ] **Step 5: Check old saves still load**

```bash
node tests/run.mjs coins-and-shop
```

Expected: `ok    ALL SHOP CHECKS PASSED`. `loadGame()` merges over the defaults, so a save written before this change gains `rooms: {}` and an empty furniture list with no migration.

- [ ] **Step 6: Commit**

```bash
git add js/save.js tests/offline/interiors.mjs
git commit -m "Remember what he put in which house

Sparse: a house he has never decorated is not in the save at all, so 43
houses cost nothing until he uses them. Old saves gain the field on load
through the existing merge, so there is no migration."
```

---

### Task 8: Tapping a spot places a piece

**Files:**
- Modify: `js/furniture.js` (the picker), `js/main.js` (input wiring)

- [ ] **Step 1: Write the picker**

Append to `js/furniture.js`:

```js
// ---------------------------------------------------------------------------
// The picker: a compact overlay for choosing one piece.
//
// Deliberately NOT the full-screen shop. The shop is for changing what he
// wears; this appears where he tapped, shows pictures and prices, and gets out
// of the way. Two different jobs, two different shapes.
// ---------------------------------------------------------------------------

const PICKER = { r: 30, gap: 74, cols: 4, padY: 26 };

/** Where each choice sits, given the screen size. Also used for hit-testing. */
export function pickerButtons(w, h) {
  const rows = Math.ceil(FURNITURE.length / PICKER.cols);
  const gridW = (PICKER.cols - 1) * PICKER.gap;
  const gridH = (rows - 1) * PICKER.gap;
  const x0 = w / 2 - gridW / 2;
  const y0 = h / 2 - gridH / 2 + PICKER.padY;

  const out = FURNITURE.map((f, i) => ({
    id: `furniture:${f.id}`,
    x: x0 + (i % PICKER.cols) * PICKER.gap,
    y: y0 + Math.floor(i / PICKER.cols) * PICKER.gap,
    r: PICKER.r,
  }));

  // Clearing the spot, and closing without choosing.
  out.push({ id: 'furniture:none', x: w / 2 - 46, y: y0 + gridH + 76, r: PICKER.r });
  out.push({ id: 'picker-close',   x: w / 2 + 46, y: y0 + gridH + 76, r: PICKER.r });
  return out;
}

/**
 * @param save   for coins and what has been bought
 * @param shake  { id, amount } — a locked piece being wobbled after a failed
 *               purchase, which is how "not enough coins yet" is said without
 *               any words
 */
export function drawPicker(ctx, w, h, save, shake) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,24,34,0.72)';
  ctx.fillRect(0, 0, w, h);

  for (const b of pickerButtons(w, h)) {
    const wobble = shake && shake.id === b.id
      ? Math.sin(shake.amount * 30) * 6 : 0;
    ctx.save();
    ctx.translate(b.x + wobble, b.y);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();

    if (b.id === 'picker-close') {
      // A tick: done here.
      ctx.strokeStyle = '#3A3A42';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-11, 1); ctx.lineTo(-3, 9); ctx.lineTo(12, -9);
      ctx.stroke();
    } else if (b.id === 'furniture:none') {
      // An empty spot: take whatever is here away.
      ctx.strokeStyle = '#9AA0AC';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const id = b.id.split(':')[1];
      const owned = isFurnitureUnlocked(id, save);
      ctx.globalAlpha = owned ? 1 : 0.45;
      drawFurniture(ctx, id, 40);
      ctx.globalAlpha = 1;

      if (!owned) {
        // A coin and a number. Digits are the one kind of text he reads.
        const price = priceOfFurniture(id);
        ctx.fillStyle = '#FFD166';
        ctx.beginPath();
        ctx.arc(0, b.r - 2, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3A3A42';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(price), 0, b.r - 1);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
```

- [ ] **Step 2: Wire the picker into main.js**

In `js/main.js`, add beside the other module-level state near line 83:

```js
// Which spot he is choosing furniture for, or null when the picker is shut.
let pickingSpot = null;
```

Add the import beside the others:

```js
import { FURNITURE, priceOfFurniture, isFurnitureUnlocked,
         drawFurniture, drawPicker, pickerButtons } from './furniture.js';
```

- [ ] **Step 3: Make the spots tappable**

In `refreshButtons()` (`js/main.js:1069`), add an inside branch before the `menu.open` branch:

```js
  if (mode === INSIDE) {
    // The picker owns the screen while it is open.
    if (pickingSpot !== null) {
      input.setButtons(pickerButtons(w, h));
      return;
    }
    // Otherwise: the spots, plus the controls he always has.
    const rx = (w - room.w) / 2;
    const ry = (h - room.h) / 2;
    const spots = room.spots.map((s, i) => ({
      id: `spot:${i}`,
      x: rx + s.x,
      y: ry + s.y,
      r: CONFIG.INTERIOR.SPOT_R,
    }));
    const action = actionButtonPos();
    input.setButtons([
      ...spots,
      { id: 'action', x: action.x, y: action.y, r: action.r },
      soundButton,
      musicButton,
    ]);
    return;
  }
```

- [ ] **Step 4: Handle the presses**

The input layer has no "give me every press" call. It is
`input.consumePress(id)`, which asks about one id and takes it
(`js/input.js:136`). Ask about each id by name, the way `handleMenuPresses()`
already does at `js/main.js:1117`.

Add to `js/main.js`, next to `handleMenuPresses`:

```js
/**
 * A tap inside a house: a glowing spot, or a choice in the picker.
 *
 * Mirrors handleMenuPresses — while the picker is open it takes every press
 * and nothing else in the room responds, which is the same rule the shop menu
 * follows.
 */
function handleInsidePresses() {
  if (pickingSpot !== null) {
    if (input.consumePress('picker-close')) { pickingSpot = null; return; }
    if (input.consumePress('furniture:none')) { placeFurniture(pickingSpot, null); return; }
    for (const f of FURNITURE) {
      if (input.consumePress(`furniture:${f.id}`)) { chooseFurniture(f.id); return; }
    }
    return;
  }

  for (let i = 0; i < room.spots.length; i++) {
    if (input.consumePress(`spot:${i}`)) { pickingSpot = i; return; }
  }
}

/** Buy it if it isn't owned yet, then put it in the spot he tapped. */
function chooseFurniture(furnitureId) {
  if (!isFurnitureUnlocked(furnitureId, save)) {
    const price = priceOfFurniture(furnitureId);
    if (save.coins < price) {
      // Not enough yet. Say so by wobbling it and making an unhappy noise —
      // never with a message, which he could not read anyway. Same as the shop.
      shake = { id: `furniture:${furnitureId}`, amount: 0.45 };
      playDenied();
      return;
    }
    save.coins -= price;
    save.unlocked.furniture.push(furnitureId);
    playSuccess();
    effects.celebrate(canvas.clientWidth / 2, canvas.clientHeight / 2, 0, 40);
  }
  placeFurniture(pickingSpot, furnitureId);
}

/** Put a piece in a spot, or clear it with null. */
function placeFurniture(spotIndex, furnitureId) {
  if (spotIndex === null) return;
  if (!save.rooms[room.seed]) save.rooms[room.seed] = {};
  const inThisRoom = save.rooms[room.seed];

  if (furnitureId === null) delete inThisRoom[spotIndex];
  else inThisRoom[spotIndex] = furnitureId;

  // A room he has emptied should not keep a slot in the save forever.
  if (Object.keys(inThisRoom).length === 0) delete save.rooms[room.seed];

  pickingSpot = null;
  playPickup();
  persist();
}
```

Call it from `update(dt)`, immediately after the `menu.open` block at
`js/main.js:298-301`, following the same shape — while the picker is open the
town is paused, exactly as it is for the shop:

```js
  if (mode === INSIDE) {
    handleInsidePresses();
    // With the picker up, nothing else in the room responds — not the action
    // button, not the joystick.
    if (pickingSpot !== null) return;
  }
```

- [ ] **Step 5: Draw the placed furniture**

In `js/interior.js`, extend `drawRoom` — add just before the mat is drawn:

```js
  // What he has put here, drawn back to front so a piece nearer the camera
  // overlaps one behind it.
  const order = room.spots
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => placed && placed[i])
    .sort((a, b) => a.s.y - b.s.y);

  for (const { s, i } of order) {
    ctx.save();
    ctx.translate(s.x, s.y);
    // A soft shadow so a piece sits ON the floor rather than floating over it.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    drawPiece(ctx, placed[i], 48);
    ctx.restore();
  }
```

`drawRoom` already takes `drawPiece` as its fifth parameter from Task 2 — the
signature does not change. It is passed in rather than imported because
`js/furniture.js` would otherwise have to import `js/interior.js` back, and a
cycle between the two would be a real bug rather than an inconvenience.

Now pass the real one. In `js/main.js`, the inside branch of `render()` already
calls it; confirm it reads:

```js
    drawRoom(ctx, room, placed, clock, drawFurniture);
```

Update the offline drawing test from Task 3 so it exercises the real path
rather than a stub — replace the `drawRoom` loop with:

```js
// Destructured under different names because the furniture section further
// down imports the same module again — reusing the names there would be a
// redeclaration, and referring to those ones from up here would be a temporal
// dead zone error.
const { drawFurniture: drawPieceForTest, FURNITURE: catalogForTest } =
  await import('../../js/furniture.js');

let drewFilled = 0;
for (const room of rooms) {
  // Once empty, and once with every spot filled — a room full of furniture is
  // a different code path from an empty one, and it is the one he will
  // actually be looking at.
  drawRoom(ctx, room, {}, 0, drawPieceForTest);
  const full = {};
  room.spots.forEach((_, i) => { full[i] = catalogForTest[i % catalogForTest.length].id; });
  drawRoom(ctx, room, full, 0, drawPieceForTest);
  drewFilled++;
}
check(`drew all ${drewFilled} rooms empty and full, with no NaN`, drewFilled === rooms.length);
```

- [ ] **Step 6: Put the picker back into the draw branch**

Task 4 Step 7 had you omit two things that did not exist yet. Restore them in
the inside branch of `render()`:

```js
    drawRoom(ctx, room, placed, clock, drawFurniture);
```

and, immediately before `effects.draw(ctx)`:

```js
    if (pickingSpot !== null) drawPicker(ctx, w, h, save, shake);
```

- [ ] **Step 7: Run the offline suites**

```bash
node tests/run.mjs offline
```

Expected: `all 14 suites passed`.

- [ ] **Step 8: Look at it — this is the step that finds the bugs**

Open the game, walk into a house, tap a glowing spot, buy a chair, place it. Then check the things assertions do not catch:

- Does a placed chair look like it is standing on the floor, or floating?
- Is the picker reachable with a thumb, or is it up in the corner?
- Does tapping a spot he is standing on work, or does his body swallow the tap?
- Does the coin counter go down by the right amount?
- Close and reopen the game: is the chair still there?

- [ ] **Step 9: Commit**

```bash
git add js/furniture.js js/interior.js js/main.js tests/offline/interiors.mjs
git commit -m "Tap a glowing spot to put furniture in a room

Snapping to spots rather than free dragging: it is always tidy, needs no
precision, and works with a thumb on a phone. The picker is its own
compact overlay rather than the full-screen shop — that one is for
changing what he wears, this one appears where he tapped and gets out of
the way."
```

---

### Task 9: Prove it survives a reload, in a real browser

**Files:**
- Create: `tests/browser/interiors.mjs`

- [ ] **Step 1: Read how an existing browser suite is written**

```bash
sed -n '1,60p' tests/browser/multiplayer.mjs
```

Follow its shape exactly — the DevTools-protocol helper functions it imports, how it navigates, and how it reads pixels. Per `CLAUDE.md`, browser suites read pixels off the canvas rather than calling into the game, because **no test-only code goes in the game.**

- [ ] **Step 2: Write the suite**

Create `tests/browser/interiors.mjs`. Replace the `connect`/`evaluate`/`screenshot`
imports on the first line with whatever `tests/browser/multiplayer.mjs` actually
imports — the rest is the suite:

```js
// A chair he put in a house must still be there tomorrow.
//
// This drives the real game in a real browser and reads pixels, because the
// rule is that no test-only code goes in the game. It never asks the game
// where anything is: the town is deterministic, so the same world generation
// runs here in node and the two agree.
import { connect, evaluate, screenshot, tap, hold } from './_browser.mjs';

const { World } = await import('../../js/world.js');
const { CONFIG } = await import('../../js/config.js');

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const url = process.env.TEST_URL;
const page = await connect(process.env.TEST_PORT, url);

// The house we will visit, chosen in node. Deterministic, so the browser has
// the identical one at the identical place.
const world = new World();
const house = world.buildings[0];

// Give him coins rather than making the test play through jobs for them, and
// put him on the doorstep rather than walking him across town — this suite is
// about whether furniture persists, not about pathfinding.
await evaluate(page, `
  localStorage.setItem('tarasTown.save.v1', JSON.stringify({
    version: 1, coins: 200, name: '', muted: true, musicMuted: true,
    hat: 0, shirt: 0, car: 0, vehicle: 0, boat: null,
    lastPos: { x: ${house.door.x}, y: ${house.door.y} },
    rooms: {},
    unlocked: { hat: [], shirt: [], car: [], vehicle: [], furniture: [] },
  }));
`);

/** Start the game and get to the point where he is standing on the doorstep. */
async function startOnDoorstep() {
  await evaluate(page, `location.reload()`);
  await new Promise((r) => setTimeout(r, 1500));
  // Dismiss the opening screen the same way multiplayer.mjs does — copy that
  // helper call here rather than inventing a second way in.
  await tap(page, 'play');
  await new Promise((r) => setTimeout(r, 800));
}

/** The average colour of the middle of the canvas. */
async function middlePixel() {
  return await evaluate(page, `
    (() => {
      const c = document.querySelector('canvas');
      const g = c.getContext('2d');
      const d = g.getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return [d[0], d[1], d[2]].join(',');
    })()
  `);
}

await startOnDoorstep();
const outdoors = await middlePixel();

// --- going in --------------------------------------------------------------
await tap(page, 'action');
await new Promise((r) => setTimeout(r, 600));
await screenshot(page, 'interiors-inside.png');
const indoors = await middlePixel();

check('the screen changes when he walks into a house', indoors !== outdoors,
  `outside and inside both read ${outdoors}`);

// --- putting a chair in ----------------------------------------------------
await tap(page, 'spot:0');
await new Promise((r) => setTimeout(r, 400));
await screenshot(page, 'interiors-picker.png');

await tap(page, 'furniture:chair');       // free, so no coins are needed
await new Promise((r) => setTimeout(r, 600));
await screenshot(page, 'interiors-placed.png');

const placed = await evaluate(page, `
  JSON.parse(localStorage.getItem('tarasTown.save.v1')).rooms['${house.seed}']
    ? JSON.parse(localStorage.getItem('tarasTown.save.v1')).rooms['${house.seed}']['0']
    : null
`);
check('the chair is written to the save', placed === 'chair', `got ${placed}`);

// --- and it is still there after a reload ---------------------------------
await startOnDoorstep();
await tap(page, 'action');
await new Promise((r) => setTimeout(r, 600));
await screenshot(page, 'interiors-after-reload.png');

const stillThere = await evaluate(page, `
  JSON.parse(localStorage.getItem('tarasTown.save.v1')).rooms['${house.seed}']['0']
`);
check('the chair survives closing and reopening the game', stillThere === 'chair',
  `got ${stillThere}`);

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL INTERIOR BROWSER CHECKS PASSED');
process.exit(fail ? 1 : 0);
```

**Two things to fix up when the harness disagrees.** The import line and the
`tap` / `hold` / `screenshot` helper names must match what
`tests/browser/multiplayer.mjs` really uses — copy them, do not guess. And if
there is no `tap(page, id)` helper that presses a button by its id, add one
next to the existing helpers rather than hardcoding screen coordinates here:
a test that writes button positions down goes wrong the moment a button moves,
which is exactly what `tests/offline/menu-buttons.mjs` exists to prevent.

- [ ] **Step 3: Run it**

```bash
node tests/run.mjs interiors
```

Expected: both `offline/interiors` and `browser/interiors` pass.

- [ ] **Step 4: Full run before finishing the milestone**

```bash
node tests/run.mjs
```

Expected: all suites pass. If a two-browser multiplayer suite fails at the end
of the run, re-run it alone before believing it — **but do not assume
flakiness**, because twice now that explanation was wrong and there was a real
bug underneath.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/interiors.mjs
git commit -m "Check a placed chair is still there after a reload

Reads pixels off the canvas rather than asking the game, which is the
rule: no test-only code goes in the game."
```

---

## Finishing

- [ ] Update `README.md` — a section on interiors beside the existing "The town is generated" one, explaining that rooms are generated from the seed and only placed furniture is saved.
- [ ] Update `CLAUDE.md` — add `js/interior.js` and `js/furniture.js` to the file-size guidance, and add a line to "Rules that must not be relaxed" noting that generation order is now load-bearing for saved furniture, not just for the map.
- [ ] Open `tools/map.html` and confirm the town is unchanged — Task 1 touched world generation, and nothing about the map should have moved.
- [ ] Use `superpowers:finishing-a-development-branch` to merge.

## Where this plan departs from the spec

One deliberate change, made while reading the code:

**Furniture pricing does not extend `Menu`.** The spec said to reuse
`Menu.priceOf` / `Menu.isUnlocked` with a `'furniture'` row. In the code those
statics are tied to `rows()`, which drives the full-screen shop's layout and
hit-testing — adding a row that is never drawn as a row would put a lie in the
middle of the menu. `js/furniture.js` gets its own `priceOfFurniture` and
`isFurnitureUnlocked` instead. They are four lines each, they follow the same
shape, and `js/ui.js` (already ~790 lines) does not grow.

## Notes for whoever implements this

**The `seed` risk is real.** `building.seed` is the index assigned in
generation order (`js/world.js:354`). Saved furniture is keyed by it. If
anything ever reorders `_buildBuildings`, every child's furniture moves to a
different house. This is why the finishing checklist adds a warning to
`CLAUDE.md` — do not skip it.

**Resist adding to `main.js`.** It is already ~1300 lines and `CLAUDE.md`
describes it as a dumping ground. Everything this feature does belongs in
`js/interior.js` or `js/furniture.js`; `main.js` should only gain mode wiring
and dispatch. If a task has you writing room logic in `main.js`, move it.

**Nothing inside a room is solid.** Not the bed, not the rug, not a placed
chair. Getting wedged behind furniture in a room with one way out is the worst
outcome available in this feature, and it is worth more than a solid table.
