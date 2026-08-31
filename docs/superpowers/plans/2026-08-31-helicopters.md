# Helicopters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four helicopters standing on the map, bought once for 1000 coins, and flown over the town.

**Architecture:** A helicopter is a `CONFIG.VEHICLES` entry with `air: true`, the sibling of `water: true`. Flying is **not a new mode** — it is `mode === DRIVING` with `drivenCar.air`, which means the multiplayer protocol, the minimap and the shop all work unchanged. Height is a drawing offset with a shadow beneath it, never a coordinate. Landing is refused unless the player can also get out.

**Tech Stack:** Vanilla ES modules, canvas 2D, no build step, no dependencies. Tests are plain `.mjs` run by `node tests/run.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-31-helicopters-design.md`
**Branch:** `helicopters` — do not merge to `main` without asking.

---

## Rules that override normal judgement

Read `CLAUDE.md` first. The ones this plan touches constantly:

- **Almost no text.** He cannot read fluently. Every control is a picture. **No letter H on the helipad** — a letter is a picture he would have to be taught.
- **Nothing scary.** A bright, friendly sightseeing helicopter. Never military: no camouflage, no guns, no rotor-blade menace.
- **Relative paths only.** A leading `/` breaks GitHub Pages.
- **No test-only code in the game.**
- **New files in `js/` must join the `PRECACHE` list in `sw.js`**, and so must anything added to `sounds/`.
- **`sounds/` has a 1200KB budget** enforced by `tests/offline/pwa.mjs`, currently at 831KB. Prepare audio **outside the repo** and commit it **once** — git history is permanent.
- **Never run the bare `node tests/run.mjs`** while iterating; it spawns two headless Chromes. Use `node tests/run.mjs offline`.

## Why flying is NOT a new mode

`mode` is on the wire (`js/main.js`, the `net.update` payload). Adding a fourth value would mean peers on an older build could not draw a flying friend, and every `mode === DRIVING` check in the file would need auditing.

Instead: **in a helicopter is in the air.** Getting in takes off; getting out lands. There is no separate take-off button, which is also the right answer for a six-year-old — one button, one meaning.

So "is flying" is `mode === DRIVING && drivenCar.air`, and for a peer it is `g.mode === DRIVING && g.car.air`. Nothing new crosses the wire.

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `js/flight.js` | Everything about being in the air: whether a spot can be landed on, the eased height, and drawing the shadow and the raised body. Pure enough to test in Node. |
| `sounds/heli.m4a` | The rotor loop. Prepared outside the repo, committed once. |

**Modified:**

| File | Change |
|---|---|
| `js/config.js` | The `helicopter` vehicle entry, a `HELI` block, `VIEW_HEIGHT_AIR`. |
| `js/car.js` | `createHelicopters()` beside `createBoats()`; an `air` branch in `_move`; the drawn shape. |
| `js/save.js` | `heli`, beside `boat`. |
| `js/main.js` | Wiring only: buying, entering, the camera, and the two draw calls. |
| `js/ui.js` | The helicopter picture in the shop row. |
| `sw.js` | Precache `js/flight.js` and `sounds/heli.m4a`. |
| `tests/offline/helicopters.mjs` | New suite: the vehicle, the save slot, where the four stand, drawing, flight, and the landing rules. |

---

## Task 1: The vehicle exists and can be bought

Nothing flies yet. At the end of this task a helicopter is in the shop at 1000 coins and buying it sets its own save slot.

**Files:**
- Modify: `js/config.js`, `js/save.js`, `js/main.js`
- Test: `tests/offline/helicopters.mjs` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/offline/helicopters.mjs`:

```js
// Helicopters: the vehicle, where the four of them stand, and — the part that
// matters — that he can never land somewhere he cannot get out of.
const { CONFIG } = await import('../../js/config.js');

let fail = 0;
const check = (l, ok, d) => {
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (!ok && d ? ': ' + d : ''));
};

// --- the vehicle ----------------------------------------------------------
console.log('\nthe vehicle');

const heli = CONFIG.VEHICLES.find((v) => v.id === 'helicopter');
check('there is a helicopter in the vehicle list', !!heli);

if (heli) {
  check('it is marked as an air vehicle', heli.air === true);
  check('it is not also a boat', !heli.water);
  check('it is the most expensive thing in the game',
    CONFIG.VEHICLES.every((v) => v.id === 'helicopter' || v.price < heli.price),
    'something else costs as much or more');
  check('it costs 1000', heli.price === 1000, String(heli.price));

  // It turns on the spot. A bus cannot; a helicopter must, or hovering and
  // looking around is impossible.
  check('it can turn while barely moving', heli.TURN_MIN >= 0.8,
    'TURN_MIN is ' + heli.TURN_MIN);
}

// --- the save slot --------------------------------------------------------
console.log('\nthe save');
const { defaultSaveForTests } = await import('../../js/save.js');
const fresh = defaultSaveForTests();
check('a new save owns no helicopter', fresh.heli === null);
check('and the slot is separate from the car and the boat',
  'heli' in fresh && 'boat' in fresh && 'vehicle' in fresh,
  'buying a helicopter must not turn the car at the kerb into one');

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL HELICOPTER CHECKS PASSED');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tests/run.mjs helicopters
```

Expected: FAIL — `there is a helicopter in the vehicle list`.

- [ ] **Step 3: Add the vehicle**

In `js/config.js`, add to the end of the `VEHICLES` array, **after the ferry** (appending is safe; inserting would renumber every saved choice):

```js
    {
      // The most expensive thing in the game, and the last thing he will own.
      //
      // `air` is the sibling of `water`: it decides what stops the thing.
      // Nothing does, up there. It is quick, and it turns on the spot — a
      // TURN_MIN of nearly 1 means it steers just as well hovering as at
      // speed, which is what makes looking around from up there possible.
      // A bus is the opposite and deliberately so.
      //
      // Friendly and bright. A sightseeing helicopter, never a military one.
      id: 'helicopter', price: 1000, shape: 'helicopter', air: true,
      LENGTH: 76, WIDTH: 34,
      MAX_SPEED: 420, ACCEL: 400, TURN_RATE: 3.4, TURN_MIN: 0.95,
      wheel: 0,
    },
```

`TURN_MIN` is read per-vehicle here but `Car.update` currently takes it from `CONFIG.CAR`. Task 4 makes the car use the vehicle's own value; until then this field is inert and the test above only checks it is present.

- [ ] **Step 4: Add the save slot**

In `js/save.js`, in `defaultSave()`, immediately after the `boat` field:

```js
    // Which helicopter, by the same numbering, or null for "hasn't got one".
    // Its own slot for the same reason the boat has one: buying a helicopter
    // must not turn the car parked at the kerb into one.
    heli: null,
```

And in `loadGame()`, beside the existing `boat` check:

```js
    if (!Number.isInteger(merged.heli) || merged.heli < 0) merged.heli = null;
```

- [ ] **Step 5: Route the purchase to the right slot**

In `js/main.js`, replace `chooseItem` (around line 1086):

```js
function chooseItem(rowId, i) {
  const v = rowId === 'vehicle' ? CONFIG.VEHICLES[i] : null;
  // Three slots, not one. What floats, what flies and what drives are chosen
  // separately, so buying a speedboat does not turn the car at the kerb into
  // one — and neither does buying a helicopter.
  if (v && v.air) save.heli = i;
  else if (v && v.water) save.boat = i;
  else save[rowId] = i;
}
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
node tests/run.mjs helicopters
```

Expected: `ok    ALL HELICOPTER CHECKS PASSED`

- [ ] **Step 7: Check the shop still works everywhere**

```bash
node tests/run.mjs offline
```

Expected: all suites pass, **including `offline/menu-buttons`** — a ninth vehicle tightens the spacing of every row in the shop, colour swatches included. This was simulated during design and every swatch still answers its own tap, but this is the check that proves it for real.

- [ ] **Step 8: Commit**

```bash
git add js/config.js js/save.js js/main.js tests/offline/helicopters.mjs
git commit -m "A helicopter in the shop, at the top of the ladder

1000 coins, above the ferry at 600, and appended to the vehicle list
rather than inserted -- the position in that list is what a save stores,
so inserting would move everybody's choices along by one.

It gets its own save slot beside the boat, for the same reason the boat
has one: buying a helicopter must not turn the car at the kerb into one."
```

---

## Task 2: Four of them standing on the map

**Files:**
- Modify: `js/car.js`, `js/config.js`
- Test: `tests/offline/helicopters.mjs`

- [ ] **Step 1: Add the numbers**

In `js/config.js`, add a top-level block after the `INTERIOR` block:

```js
  // Everything about flying.
  HELI: {
    COUNT: 4,          // how many stand on the map
    SEPARATION: 1500,  // how far apart, so each is a journey not a corner
    PAD_R: 46,         // the painted circle they stand on
    ALTITUDE: 26,      // how far the body is drawn above its shadow
    LIFT_SPEED: 2.2,   // how quickly it rises and settles, per second
  },
```

- [ ] **Step 2: Write the failing test**

Append to `tests/offline/helicopters.mjs`, before the final `console.log`:

```js
// --- where the four of them stand ----------------------------------------
const { World, T } = await import('../../js/world.js');
const { createCars } = await import('../../js/car.js');
console.log('\nwhere they stand');

const world = new World();
const all = createCars(world);
const helis = all.filter((c) => c.air);

check(`there are ${CONFIG.HELI.COUNT} of them`,
  helis.length === CONFIG.HELI.COUNT, String(helis.length));

check('none is standing in the water',
  helis.every((c) => !world.isWaterAt(c.x, c.y)),
  'a helicopter is parked in the river');

check('none is standing inside anything solid',
  helis.every((c) => !world._overlaps(c.x, c.y, c.half, c.half)),
  'a helicopter is inside a building or a tree');

check('they are spread across the town',
  helis.every((a, i) => helis.every((b, j) =>
    i === j || Math.hypot(a.x - b.x, a.y - b.y) >= CONFIG.HELI.SEPARATION * 0.9)),
  'two of them are practically next to each other');

// The whole point of them being visible from the first load is that he can
// walk up and look at one long before he can afford it.
check('every one can be walked up to', helis.every((c) => {
  const half = CONFIG.PLAYER.HITBOX / 2;
  for (let a = 0; a < 24; a++) {
    for (const rad of [60, 80, 100]) {
      if (rad > CONFIG.CAR.ENTER_RADIUS) continue;
      const x = c.x + Math.cos((a / 24) * Math.PI * 2) * rad;
      const y = c.y + Math.sin((a / 24) * Math.PI * 2) * rad;
      if (!world._overlaps(x, y, half, half)) return true;
    }
  }
  return false;
}), 'a helicopter cannot be reached on foot');

check('placement is deterministic',
  JSON.stringify(createCars(new World()).filter((c) => c.air).map((c) => [c.x, c.y])) ===
  JSON.stringify(helis.map((c) => [c.x, c.y])),
  'two runs put the helicopters in different places');
```

- [ ] **Step 3: Run it and watch it fail**

```bash
node tests/run.mjs helicopters
```

Expected: FAIL — `there are 4 of them: 0`.

- [ ] **Step 4: Place them**

In `js/car.js`, add after `createBoats`:

```js
/**
 * Stand the helicopters out on open ground.
 *
 * Like the boats, they are here from the first load whether or not one has
 * been bought — seeing a helicopter on its pad is the reason to start saving
 * the thousand coins. Walking up to one does nothing until it is owned.
 *
 * Far apart on purpose: four of them across a town this size means reaching
 * one is a small journey rather than something you trip over.
 */
export function createHelicopters(world, existing) {
  const spec = CONFIG.VEHICLES.find((v) => v.air);
  if (!spec) return [];

  const need = Math.max(spec.LENGTH, spec.WIDTH) / 2 + CONFIG.HELI.PAD_R * 0.4;
  const spots = world.sweepSpots(
    (kind) => kind === T.GRASS || kind === T.PARK,
    CONFIG.HELI.SEPARATION,
    0.75,      // properly open ground, not a gap between two trees
    need,
    2,
  );

  const out = [];
  for (const spot of spots) {
    if (out.length >= CONFIG.HELI.COUNT) break;

    const c = Math.floor(spot.x / world.tile);
    const r = Math.floor(spot.y / world.tile);
    const colour = Math.floor(hash(c + 31, r + 53) * CONFIG.CAR_BODY_PALETTE.length);

    const heli = new Car(world, spot.x, spot.y, Math.PI / 2, {
      body: CONFIG.CAR_BODY_PALETTE[colour],
      roof: CONFIG.CAR_ROOF_PALETTE[colour],
      type: spec.id,
    });

    if (world._overlaps(heli.x, heli.y, heli.half, heli.half,
                        [...existing, ...out].map((k) => k.boundsBox()))) continue;
    out.push(heli);
  }

  return out;
}
```

- [ ] **Step 5: Call it**

In `js/car.js`, in `createCars`, replace the boats line with:

```js
  // And the boats, moored out on the water.
  for (const boat of createBoats(world, cars)) cars.push(boat);

  // And the helicopters, standing on open ground.
  for (const heli of createHelicopters(world, cars)) cars.push(heli);
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
node tests/run.mjs helicopters
```

Expected: `ok    ALL HELICOPTER CHECKS PASSED`

If `there are 4 of them` reports fewer than four, the openness requirement is too strict for this town — drop `0.75` to `0.6` and re-run, and say so in your report.

- [ ] **Step 7: Check nothing else moved**

```bash
node tests/run.mjs offline
```

Expected: all suites pass. `offline/cars` is the one to watch: it checks every vehicle is parked legally and can be reached, and it now has four more vehicles to check.

- [ ] **Step 8: Commit**

```bash
git add js/car.js js/config.js tests/offline/helicopters.mjs
git commit -m "Stand four helicopters on the map

Here from the first load whether or not one has been bought, exactly
like the boats moored in the river: seeing one on its pad is the reason
to start saving the thousand coins.

Far apart on purpose, so reaching one is a small journey rather than
something you trip over."
```

---

## Task 3: Draw a helicopter, and its pad

**Files:**
- Modify: `js/car.js`, `js/ui.js`
- Test: `tests/offline/helicopters.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/offline/helicopters.mjs`, before the final `console.log`:

```js
// --- drawing --------------------------------------------------------------
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
for (const c of helis) {
  c.draw(ctx);
  c.angle += 1.1;      // rotors and a body at a few different headings
  c.draw(ctx);
  drew++;
}
check(`drew all ${drew} helicopters with no NaN (${calls} canvas calls)`,
  drew === helis.length);

// The shop preview is a different code path from the one in the world.
const { drawVehiclePicture } = await import('../../js/ui.js');
const heliIndex = CONFIG.VEHICLES.findIndex((v) => v.air);
drawVehiclePicture(ctx, heliIndex, 34, 0);
check('the shop can draw a helicopter too', true);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tests/run.mjs helicopters
```

Expected: FAIL — a non-finite number reaching the canvas, or nothing recognisable drawn. `drawVehiclePicture` is already exported from `js/ui.js:383`, so the import itself will resolve.

- [ ] **Step 3: Draw the helicopter body**

In `js/car.js`, find where the vehicle shapes are drawn (`grep -n "shape === " js/car.js`) and add a `helicopter` case alongside the others, following the same style:

```js
    } else if (shape === 'helicopter') {
      // A friendly sightseeing helicopter: a rounded cabin, a boom out the
      // back with a little tail rotor, and skids underneath. Nothing military
      // — no camouflage, no hard edges.
      const L = this.length, W = this.width;

      // Skids, drawn first so the body sits on them.
      ctx.fillStyle = 'rgba(40,44,54,0.85)';
      roundRect(ctx, -L * 0.28, -W * 0.62, L * 0.5, W * 0.10, W * 0.05);
      ctx.fill();
      roundRect(ctx, -L * 0.28, W * 0.52, L * 0.5, W * 0.10, W * 0.05);
      ctx.fill();

      // The tail boom.
      ctx.fillStyle = body;
      roundRect(ctx, -L * 0.52, -W * 0.10, L * 0.42, W * 0.20, W * 0.09);
      ctx.fill();

      // The tail fin, standing up at the end of it.
      ctx.fillStyle = roof;
      roundRect(ctx, -L * 0.52, -W * 0.34, W * 0.16, W * 0.34, W * 0.06);
      ctx.fill();

      // The cabin: fat and round at the front.
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(L * 0.12, 0, L * 0.30, W * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();

      // The window, wrapped round the nose.
      ctx.fillStyle = '#BFE3F5';
      ctx.beginPath();
      ctx.ellipse(L * 0.22, 0, L * 0.17, W * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
```

- [ ] **Step 4: Spin the rotors**

Rotors must turn, or a parked helicopter looks broken. Still in `js/car.js`, at the very end of `draw()` — **after** `ctx.restore()` of the body transform, so the rotor is not squashed by anything — add:

```js
  // The rotors, drawn last and on top of everything.
  //
  // They spin whether or not anybody is flying it: a helicopter with still
  // blades reads as scenery, and these are meant to be noticed from across a
  // park. Blurred into discs rather than drawn as blades, which is both what
  // a real one looks like at speed and much kinder at this size.
  if (this.air) {
    const t = (Date.now() % 100000) / 1000;
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.strokeStyle = 'rgba(40,44,54,0.30)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.length * 0.10, 0, this.length * 0.52, 0, Math.PI * 2);
    ctx.stroke();

    // Two blades, turning, so the disc reads as something moving.
    ctx.strokeStyle = 'rgba(40,44,54,0.55)';
    ctx.lineWidth = 4;
    for (const off of [0, Math.PI / 2]) {
      const a = t * 14 + off;
      ctx.beginPath();
      ctx.moveTo(this.length * 0.10 - Math.cos(a) * this.length * 0.52,
                 -Math.sin(a) * this.length * 0.52);
      ctx.lineTo(this.length * 0.10 + Math.cos(a) * this.length * 0.52,
                 Math.sin(a) * this.length * 0.52);
      ctx.stroke();
    }
    ctx.restore();
  }
```

- [ ] **Step 5: Paint the pad under each one**

The pad belongs with the world's ground, not with the vehicle, so it is drawn once with the scenery. In `js/car.js`, export a helper:

```js
/**
 * The circle painted on the grass where a helicopter stands.
 *
 * Concentric rings and no letter H. A letter is a picture he would have to be
 * taught to read, and this game has gone to some lengths to avoid exactly
 * that — see "almost no text" in CLAUDE.md.
 */
export function drawHelipad(ctx, x, y) {
  const R = CONFIG.HELI.PAD_R;
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, R - 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
```

Call it from `js/main.js` in `render()`, **immediately before** the car loop (`for (const car of cars)`), so pads are under everything:

```js
  // The pads go on the ground, under the helicopters standing on them.
  for (const car of cars) {
    if (!car.air) continue;
    if (car.x < view.x - 120 || car.x > view.x + view.w + 120) continue;
    if (car.y < view.y - 120 || car.y > view.y + view.h + 120) continue;
    drawHelipad(ctx, car.home.x, car.home.y);
  }
```

`car.home` is where it was created (`js/car.js:51`), so the pad stays put when the helicopter is flown away.

Add `drawHelipad` to the `./car.js` import in `js/main.js`.

- [ ] **Step 6: Draw it in the shop**

The shop's picture is `drawVehiclePicture(ctx, index, size, colourIndex)` in
`js/ui.js:383` — a different, much smaller drawing from the one in the world,
so it needs its own case rather than sharing.

In that function, at the end of the roof-panel section (`js/ui.js:465-474`),
the final `else` currently draws a roof panel on everything that is not a bus
or a monster truck. Change that tail to:

```js
  } else if (v.shape === 'helicopter') {
    // A rotor line across the whole thing, which at this size is the one
    // mark that says helicopter rather than car.
    ctx.strokeStyle = roof;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-L * 0.10, -W * 0.95);
    ctx.lineTo(-L * 0.10, W * 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-L * 0.10, 0, W * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    // And the cabin window, so the front is obvious.
    ctx.fillStyle = '#BFE3F5';
    roundRect(ctx, L * 0.10, -W * 0.26, L * 0.22, W * 0.52, 2); ctx.fill();
  } else {
    roundRect(ctx, -L * 0.24, -W / 2 + 2, L * 0.34, W - 4, 2); ctx.fill();
  }
```

The body underneath is drawn by the existing generic `roundRect` at
`js/ui.js:460`, which is the right shape for a helicopter cabin already.

- [ ] **Step 7: Run the tests**

```bash
node tests/run.mjs offline
```

Expected: all suites pass.

- [ ] **Step 8: Look at it — this is the step that finds the bugs**

An assertion cannot tell you whether a shape looks like a helicopter. Render one and look.

Write a throwaway page in the repo that imports `./js/world.js` and `./js/car.js`, draws the four helicopters on their pads at a few headings, and screenshot it headless:

```bash
python -m http.server 8777 &
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --screenshot=heli.png --window-size=1000,400 --virtual-time-budget=3000 \
  "http://127.0.0.1:8777/yourpage.html"
```

**Read the PNG with the Read tool and actually look at it.** Ask: does it read as a helicopter rather than a car with a circle on it? Is the rotor disc visible against grass? Does the pad read as a place something lands? Is it friendly rather than military? Report honestly, and **delete the throwaway page before committing.**

Do **not** run `taskkill /F /IM chrome.exe` — that kills every Chrome on the machine including the user's own browser. Kill only the PID you started.

- [ ] **Step 9: Commit**

```bash
git add js/car.js js/ui.js js/main.js tests/offline/helicopters.mjs
git commit -m "Draw the helicopters and the pads they stand on

Rotors turn whether or not anybody is flying: still blades read as
scenery, and these are meant to be noticed from across a park.

The pad is concentric rings and no letter H, because a letter is a
picture he would have to be taught and this game has gone to some
lengths to avoid exactly that."
```

---

## Task 4: Take off and fly

**Files:**
- Create: `js/flight.js`
- Modify: `js/car.js`, `js/config.js`, `js/main.js`, `sw.js`
- Test: `tests/offline/helicopters.mjs`

- [ ] **Step 1: Add the camera height**

In `js/config.js`, in the `CAMERA` block, after `VIEW_HEIGHT_CAR`:

```js
    // Flying pulls back further still. Most of the point of being up there is
    // seeing where you are going.
    VIEW_HEIGHT_AIR: 560,
```

- [ ] **Step 2: Write the failing test**

Append to `tests/offline/helicopters.mjs`, before the final `console.log`:

```js
// --- flying ---------------------------------------------------------------
const { liftToward } = await import('../../js/flight.js');
console.log('\nflying');

// Nothing up there stops it. Fly a helicopter straight at a building at full
// speed and it should sail over the top.
const flier = helis[0];
const before = { x: flier.x, y: flier.y };
flier.angle = 0;
for (let i = 0; i < 240; i++) {
  flier.update(1 / 60, { x: 1, y: 0, mag: 1 }, all.filter((c) => c !== flier));
}
check('a helicopter is not stopped by the town',
  flier.x - before.x > 400,
  `only travelled ${(flier.x - before.x).toFixed(0)}px in 4 seconds`);

check('and it stays on the map',
  flier.x >= 0 && flier.x <= world.width && flier.y >= 0 && flier.y <= world.height,
  'it flew off the edge of the world');

// Fly it into the far edge and make sure it stops there rather than leaving.
for (let i = 0; i < 3000; i++) {
  flier.update(1 / 60, { x: 1, y: 0, mag: 1 }, []);
}
check('the edge of the map still stops it',
  flier.x <= world.width && flier.x > world.width - 200,
  `ended at x=${flier.x.toFixed(0)} of ${world.width}`);

// A car in the same place is stopped by the same building.
const car = all.find((c) => !c.air && !c.water);
const carStart = { x: car.x, y: car.y };
car.angle = 0;
for (let i = 0; i < 240; i++) {
  car.update(1 / 60, { x: 1, y: 0, mag: 1 }, all.filter((c) => c !== car));
}
check('a car, unlike it, is still stopped by things',
  Math.hypot(car.x - carStart.x, car.y - carStart.y) < 2000,
  'the car went as far as the helicopter, so nothing is being collided with');

// The height easing: up when flying, back down when not.
let lift = 0;
for (let i = 0; i < 120; i++) lift = liftToward(lift, true, 1 / 60);
check('it rises when flown', lift > 0.95, `lift reached only ${lift.toFixed(2)}`);
for (let i = 0; i < 120; i++) lift = liftToward(lift, false, 1 / 60);
check('and settles back down', lift < 0.05, `lift stayed at ${lift.toFixed(2)}`);
```

- [ ] **Step 3: Run it and watch it fail**

```bash
node tests/run.mjs helicopters
```

Expected: FAIL — `Cannot find module` for `js/flight.js`.

- [ ] **Step 4: Create the flight module**

Create `js/flight.js`:

```js
/**
 * flight.js — Being in the air.
 *
 * Flying is deliberately NOT a mode of its own. It is `mode === DRIVING` with
 * an `air` vehicle, which is what lets the whole of the rest of the game carry
 * on unchanged: the wire already says which vehicle somebody is in, so a
 * friend in a helicopter is described correctly with no new message, and every
 * existing `mode === DRIVING` check stays true.
 *
 * Height is a DRAWING offset and never a coordinate. The helicopter's x and y
 * are on the ground the whole time — which is why its shadow needs no working
 * out, and why landing is simply a question about the spot it is already over.
 */

import { CONFIG } from './config.js';

/**
 * Ease the height towards up or down.
 *
 * Returns the new lift, 0 on the ground and 1 at full height. Separate from
 * anything that draws so the tests can run it in Node.
 */
export function liftToward(lift, up, dt) {
  const target = up ? 1 : 0;
  const next = lift + (target - lift) * Math.min(1, CONFIG.HELI.LIFT_SPEED * dt);
  // Settle rather than creep towards it for ever.
  if (Math.abs(target - next) < 0.01) return target;
  return next;
}

/**
 * Can this helicopter be put down where it is hovering?
 *
 * Three questions, and all of them have to be yes. This is the strictest rule
 * in the feature on purpose: a child must always be able to get out of
 * whatever he is in, and three separate bugs of exactly that shape turned up
 * while the insides of houses were built.
 */
export function canLandAt(world, heli, others) {
  // 1. Not on the water. A helicopter bobbing on the river is not a thing
  //    this game is going to try to explain.
  if (world.isWaterAt(heli.x, heli.y)) return false;

  // 2. The helicopter itself has to fit, clear of buildings, trees and
  //    anything else parked there.
  const blockers = others.filter((o) => o !== heli).map((o) => o.boundsBox());
  if (world._overlaps(heli.x, heli.y, heli.half, heli.half, blockers)) return false;

  // 3. And there has to be somewhere for him to step out onto — the same
  //    question a car already asks before it lets anybody out.
  return heli.exitSpot(others) !== null;
}

/**
 * The shadow on the ground, drawn at the vehicle's real position.
 *
 * Drawn down with the other ground-level things rather than with the body,
 * because a shadow painted over a tree the helicopter is flying above looks
 * far worse than no shadow at all.
 */
export function drawFlyingShadow(ctx, heli, lift) {
  if (lift <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = 0.28 * lift;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  // Shrinking as it rises, which is most of what says "this is high up".
  const k = 1 - 0.25 * lift;
  ctx.ellipse(heli.x, heli.y, heli.length * 0.42 * k, heli.width * 0.55 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The helicopter itself, lifted off its own shadow.
 *
 * Drawn AFTER the tree canopies. Everything else in the town is drawn before
 * them so that leaves fall over the top and give the place some depth; a
 * helicopter passing over a wood has to be the one thing that goes above.
 */
export function drawFlyingBody(ctx, heli, lift) {
  const up = CONFIG.HELI.ALTITUDE * lift;
  ctx.save();
  ctx.translate(0, -up);
  heli.draw(ctx);
  ctx.restore();
}
```

- [ ] **Step 5: Let a helicopter through the town**

In `js/car.js`, in `_move`, add the air case at the very top of the method:

```js
  _move(dt, otherCars) {
    const dist = this.speed * dt;
    const dx = Math.cos(this.angle) * dist;
    const dy = Math.sin(this.angle) * dist;

    if (this.air) {
      // Nothing up here to hit. Not the buildings, not the trees, not the
      // river, not the other traffic — the edge of the map is the only thing
      // that stops a helicopter, and it stops it by simply not letting it
      // leave rather than by bumping.
      const h = this.half;
      this.x = Math.min(Math.max(this.x + dx, h), this.world.width - h);
      this.y = Math.min(Math.max(this.y + dy, h), this.world.height - h);
      return;
    }

    const blockers = otherCars.map((c) => c.boundsBox());
    // Wheels are stopped by water; a hull is stopped by land.
    const next = this.world.moveBox(this.x, this.y, this.half, this.half, dx, dy,
                                    blockers, this.water ? 'water' : 'land');

    this.x = next.x;
    this.y = next.y;

    // A soft bump: keep a little of the speed, lose most of it.
    if (next.blocked) this.speed *= CONFIG.CAR.BOUNCE;
  }
```

Also in `js/car.js`, in `_applySpec`, record the flag beside `water`:

```js
    this.air = !!spec.air;
```

And in `Car.update`, let a vehicle bring its own `TURN_MIN` so a helicopter can turn on the spot. Find the `const A = { ...CONFIG.CAR, ... }` object and add:

```js
      TURN_MIN: this.spec.TURN_MIN ?? CONFIG.CAR.TURN_MIN,
```

- [ ] **Step 6: Run the test and watch it pass**

```bash
node tests/run.mjs helicopters
```

Expected: `ok    ALL HELICOPTER CHECKS PASSED`

- [ ] **Step 7: Let him get in**

In `js/main.js`, in `findCarToEnter` (around line 1094), add the gate beside the boat one:

```js
    if (car.water && save.boat === null) continue;
    // Same for the helicopters: they stand there from the first load so there
    // is something to save a thousand coins FOR, but until one is bought they
    // are scenery.
    if (car.air && save.heli === null) continue;
```

And in `enterCar`, make sure the right slot is applied — find `car.setVehicle(car.water ? save.boat : save.vehicle, cars)` and replace with:

```js
  car.setVehicle(car.air ? save.heli : car.water ? save.boat : save.vehicle, cars);
```

- [ ] **Step 8: Pull the camera back, and track the lift**

In `js/main.js`, add beside the other module state:

```js
// How far off the ground the helicopter is drawn, 0 to 1. A drawing value,
// not a position: the vehicle's x and y stay on the ground the whole time.
let lift = 0;
```

Add the import:

```js
import { liftToward, canLandAt, drawFlyingShadow, drawFlyingBody } from './flight.js';
```

Add a helper next to `findCarToEnter`:

```js
/** Is he in the air right now? */
function isFlying() {
  return mode === DRIVING && drivenCar && drivenCar.air;
}
```

In `update(dt)`, after the movement block, add:

```js
  lift = liftToward(lift, isFlying(), dt);
```

And replace the camera height (around line 436):

```js
  const wantHeight = isFlying()
    ? CONFIG.CAMERA.VIEW_HEIGHT_AIR
    : mode === DRIVING
      ? CONFIG.CAMERA.VIEW_HEIGHT_CAR
      : CONFIG.CAMERA.VIEW_HEIGHT;
```

- [ ] **Step 9: Draw it above the trees**

In `js/main.js` in `render()`, in the car loop (around line 505), skip the one being flown:

```js
  for (const car of cars) {
    // The one being flown is drawn later, above the canopies. Down here it
    // would have leaves drawn over the top of it.
    if (car === drivenCar && isFlying()) continue;
    if (car.x < view.x - 90 || car.x > view.x + view.w + 90) continue;
    if (car.y < view.y - 90 || car.y > view.y + view.h + 90) continue;
    car.draw(ctx);
  }

  // Its shadow, though, belongs down here on the ground with everything else.
  if (isFlying()) drawFlyingShadow(ctx, drivenCar, lift);
```

And immediately **after** `world.drawCanopies(ctx, view);`:

```js
  // The helicopter goes over the top of the trees it is flying above.
  if (isFlying()) drawFlyingBody(ctx, drivenCar, lift);
```

- [ ] **Step 10: Precache the new module**

In `sw.js`, add to `PRECACHE` beside the other modules:

```js
  './js/flight.js',
```

- [ ] **Step 11: Run everything**

```bash
node tests/run.mjs offline
```

Expected: all suites pass, including `offline/pwa`, which fails if a `js/*.js` file is missing from the precache list.

- [ ] **Step 12: Look at it**

Serve the game, give yourself the coins and the helicopter by seeding `localStorage`, walk to a pad, take off, and fly over a wood and the river.

```bash
python -m http.server 8777
```

Seed a save before the page's own script runs (an eval after navigation is too late):

```js
localStorage.setItem('tarasTown.save.v1', JSON.stringify({
  version: 1, coins: 2000, name: '', muted: true, musicMuted: true,
  hat: 0, shirt: 0, car: 0, vehicle: 0, boat: null, heli: 8,
  rooms: {}, unlocked: { hat: [], shirt: [], car: [], vehicle: [8], furniture: [] },
}));
```

(`8` is the helicopter's position in `CONFIG.VEHICLES` — check it with
`node -e "import('./js/config.js').then(m=>console.log(m.CONFIG.VEHICLES.findIndex(v=>v.air)))" --input-type=module`.)

Check, and report honestly on each:

- Does it lift off, or snap up?
- Does the shadow read as height, and does it stay on the ground under trees?
- Is the helicopter drawn **over** the trees, not under them?
- Does the camera pull back smoothly?
- Can you fly over the river and the houses?
- Does it turn while hovering?

- [ ] **Step 13: Commit**

```bash
git add js/flight.js js/car.js js/config.js js/main.js sw.js tests/offline/helicopters.mjs
git commit -m "Fly the helicopters

Flying is mode DRIVING with an air vehicle rather than a mode of its
own, which is what lets the rest of the game carry on unchanged -- the
wire already says which vehicle somebody is in, so a friend in a
helicopter needs no new message and every existing DRIVING check stays
true.

Height is a drawing offset and never a coordinate. The vehicle's x and y
stay on the ground the whole time, which is why the shadow needs no
working out and why landing is a question about the spot it is already
over. The body draws above the tree canopies and the shadow below them,
because a shadow painted over a tree it is flying above looks far worse
than none at all."
```

---

## Task 5: Landing, and refusing to land

**Files:**
- Modify: `js/main.js`
- Test: `tests/offline/helicopters.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/offline/helicopters.mjs`, before the final `console.log`:

```js
// --- landing, and refusing to ---------------------------------------------
//
// The strictest rule in this feature. A child must always be able to get out
// of whatever he is in, and three bugs of exactly that shape turned up while
// the insides of houses were built.
const { canLandAt } = await import('../../js/flight.js');
console.log('\nlanding');

const lander = helis[1];
const home = { x: lander.x, y: lander.y };

check('it can land where it started', canLandAt(world, lander, all),
  'a helicopter cannot be put down on its own pad');

// Out over the water.
let water = null;
for (let y = 100; y < world.height - 100 && !water; y += 40) {
  for (let x = 100; x < world.width - 100; x += 40) {
    if (world.isWaterAt(x, y)) { water = { x, y }; break; }
  }
}
lander.x = water.x; lander.y = water.y;
check('it refuses to land on the water', !canLandAt(world, lander, all),
  'it would have set down in the river');

// Inside a building.
const b = world.buildings[0];
lander.x = b.x + b.w / 2; lander.y = b.y + b.h / 2;
check('it refuses to land inside a building', !canLandAt(world, lander, all),
  'it would have set down inside somebody\'s house');

lander.x = home.x; lander.y = home.y;
check('and it can land again once it is back over open ground',
  canLandAt(world, lander, all));

// The whole point: wherever it WILL land, he can get out.
let tried = 0, landable = 0, stranded = 0;
for (let y = 200; y < world.height - 200; y += 260) {
  for (let x = 200; x < world.width - 200; x += 260) {
    lander.x = x; lander.y = y;
    tried++;
    if (!canLandAt(world, lander, all)) continue;
    landable++;
    if (lander.exitSpot(all) === null) stranded++;
  }
}
lander.x = home.x; lander.y = home.y;
check(`nowhere it agrees to land strands him (${landable} of ${tried} spots)`,
  stranded === 0, `${stranded} landing spots have no way out`);
check('and it will land in a decent number of places', landable > tried * 0.15,
  `only ${landable} of ${tried} spots are landable, which would be frustrating`);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node tests/run.mjs helicopters
```

Expected: PASS for the `canLandAt` checks, because Task 4 already wrote that function — this task is about wiring it to the button. If any check fails, `canLandAt` is wrong and must be fixed before going on.

- [ ] **Step 3: Offer landing only when it is possible**

In `js/main.js`, in `findAction()`, replace the driving line:

```js
  if (mode === DRIVING) {
    // In the air the one button is the way down, and it is only offered where
    // he could actually get out afterwards. Somewhere he cannot land, the
    // button shows nothing at all rather than promising something it will
    // then refuse — he can always keep flying, and flying is always safe.
    if (drivenCar.air) {
      return canLandAt(world, drivenCar, cars) ? { kind: 'land' } : null;
    }
    return { kind: 'exit' };
  }
```

- [ ] **Step 4: Act on it**

Still in `js/main.js`, in the action dispatch (`if (input.consumePress('action') && action)`), add the new kind beside the others:

```js
    else if (action.kind === 'land') exitCar();
```

`exitCar` already finds a spot beside the vehicle and refuses politely if there is none, so landing reuses it whole.

- [ ] **Step 5: Give the button a picture**

`drawActionButton` (`js/main.js:1526`) picks a colour and then an icon, and its
final `else` is `drawMissionIcon(ctx, action.npc.mission, 22)` — which assumes
**every** action has an `npc`. A kind without one crashes the render loop, and
that is exactly what happened when the house actions were added. `'land'` must
therefore be named in both chains, not left to fall through.

The colour (line 1535):

```js
  const colour = action.kind === 'exit' || action.kind === 'leave-house' ||
                 action.kind === 'land' ? '#FF9F45'
               : action.kind === 'enter' || action.kind === 'enter-house' ? '#5AC85A'
               : '#4EA8FF';
```

The icon (line 1557):

```js
  if (action.kind === 'exit' || action.kind === 'leave-house' ||
      action.kind === 'land') drawPersonIcon();
  else if (action.kind === 'enter') drawCarIcon(colour);
  else if (action.kind === 'enter-house') drawDoorIcon();
  else drawMissionIcon(ctx, action.npc.mission, 22);
```

The same orange and the same person as getting out of a car, because it means
the same thing to him: get out. A separate landing picture would be a new
symbol to learn for something he already understands.

- [ ] **Step 6: Run everything**

```bash
node tests/run.mjs offline
```

Expected: all suites pass.

- [ ] **Step 7: Look at it**

Fly out over the river and press the button — nothing should happen, and the button should show nothing. Fly back over grass and it should offer to land. Land in a tight gap between two houses and confirm he steps out somewhere sensible rather than inside a wall.

- [ ] **Step 8: Commit**

```bash
git add js/main.js tests/offline/helicopters.mjs
git commit -m "Land the helicopter, and refuse where it would strand him

Landing is offered only where he could also get out afterwards: not on
the water, not where the helicopter itself does not fit, and not where
there is nowhere to step down onto. Where he cannot land the button
shows nothing at all rather than promising something it will then
refuse.

He can therefore always keep flying, and flying is always safe. The
worst thing available is having to move somewhere else first, which is a
thing he can see."
```

---

## Task 6: The rotor sound, and friends in the air

**Files:**
- Create: `sounds/heli.m4a`
- Modify: `js/audio.js`, `js/main.js`, `sw.js`
- Test: `tests/offline/pwa.mjs`

- [ ] **Step 1: Prepare the sound OUTSIDE the repo**

The source is `D:\Taras-Town-Sound-Ref\helicopter_sound.aac` (4.85s). Work in the scratchpad, never in `sounds/` — anything committed there is in git history for ever.

Measure it first, the way the footsteps were measured:

```bash
node <scratchpad>/analyse.mjs "D:/Taras-Town-Sound-Ref/helicopter_sound.aac"
```

A rotor is a continuous loop, so it needs the seam removing. Cut a whole number of rotor beats if you can hear one in the envelope; otherwise crossfade the tail over the head:

```bash
ffmpeg -y -v error -i "D:/Taras-Town-Sound-Ref/helicopter_sound.aac" -filter_complex "
[0:a]atrim=0:S,asetpts=N/SR/TB,afade=t=in:st=0:d=0.25[main];
[0:a]atrim=S:E,asetpts=N/SR/TB,afade=t=out:st=0:d=0.25[tail];
[main][tail]amix=inputs=2:duration=first:normalize=0[out]" -map "[out]" \
  -ac 1 -b:a 64k -c:a aac heli-loop.m4a
```

(`S` = loop length, `E` = `S` + 0.25.) **Verify the seam**: decode it and compare the RMS of the first and last 50ms — they must be close AND non-zero. Zero at both ends means silence, which gives an audible gap every loop; that mistake was made once already with the swimming clip.

Target **under 120KB** — `sounds/` is at 831KB against a 1200KB budget.

- [ ] **Step 2: Copy it in and precache it**

```bash
cp <scratchpad>/heli-loop.m4a "D:/VIBE CODING/Taras-Town/sounds/heli.m4a"
```

In `sw.js`, add to `PRECACHE`:

```js
  './sounds/heli.m4a',
```

- [ ] **Step 3: Run the budget test**

```bash
node tests/run.mjs pwa
```

Expected: pass, with the recordings-fit-the-budget line showing the new total. `tests/offline/pwa.mjs` already requires every `sounds/*.m4a` to be precached and the folder to stay under 1200KB, so no test changes are needed — if it fails, the file is too big or not listed.

- [ ] **Step 4: Play it while flying**

In `js/audio.js`, add to `SOUND_FILES`:

```js
  heli: 'sounds/heli.m4a',
```

And add the rotor, which is different from every other sound here because it runs continuously rather than in bursts:

```js
// ---------------------------------------------------------------------------
// The rotor
//
// Unlike everything else in this file this one runs for as long as he is in
// the air, so it is started and stopped rather than fired. It fades in and out
// rather than snapping, because a loop that begins at full volume sounds like
// a fault.
// ---------------------------------------------------------------------------

let rotorSource = null;
let rotorGain = null;

/** Start the rotor if it is not already going. Safe to call every frame. */
export function startRotor() {
  if (!ctx || muted || rotorSource || !buffers.heli) return;
  try {
    rotorSource = ctx.createBufferSource();
    rotorSource.buffer = buffers.heli;
    rotorSource.loop = true;

    rotorGain = ctx.createGain();
    rotorGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    rotorGain.gain.exponentialRampToValueAtTime(0.30, ctx.currentTime + 0.5);

    rotorSource.connect(rotorGain);
    rotorGain.connect(ctx.destination);
    rotorSource.start();
  } catch (err) {
    rotorSource = null;
    rotorGain = null;
  }
}

/** Stop it, fading down rather than cutting off. Safe to call every frame. */
export function stopRotor() {
  if (!rotorSource) return;
  try {
    const src = rotorSource;
    const g = rotorGain;
    rotorSource = null;
    rotorGain = null;
    if (g && ctx) {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    }
    setTimeout(() => { try { src.stop(); } catch (e) { /* already done */ } }, 600);
  } catch (err) {
    rotorSource = null;
    rotorGain = null;
  }
}
```

In `js/main.js`, import both and call them from `update(dt)` beside the lift easing:

```js
  lift = liftToward(lift, isFlying(), dt);
  if (isFlying()) startRotor(); else stopRotor();
```

- [ ] **Step 5: Raise friends who are flying too**

In `js/main.js`, in `drawGhosts`, a peer in a helicopter is in the air — the wire already says which vehicle they are in, so nothing new is needed to know it. Find where a driving ghost is drawn:

```js
    if (g.mode === DRIVING) {
      g.car.x = g.x; g.car.y = g.y; g.car.angle = g.angle;
      g.car.draw(ctx);
    } else {
```

and replace with:

```js
    if (g.mode === DRIVING) {
      g.car.x = g.x; g.car.y = g.y; g.car.angle = g.angle;
      // A friend in a helicopter is in the air, and the wire already said so
      // by naming the vehicle — no extra message was needed. Their shadow
      // goes on the ground and their body goes up, the same as ours.
      if (g.car.air) {
        drawFlyingShadow(ctx, g.car, 1);
        drawFlyingBody(ctx, g.car, 1);
      } else {
        g.car.draw(ctx);
      }
    } else {
```

A peer's lift is 1 rather than eased: their take-off is not being watched frame by frame, and easing it would need the height on the wire for no gain.

- [ ] **Step 6: Run everything**

```bash
node tests/run.mjs offline
```

Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add sounds/heli.m4a js/audio.js js/main.js sw.js
git commit -m "The rotor, and friends seen flying

The rotor runs for as long as he is up there rather than firing in
bursts like every other sound here, so it is started and stopped and it
fades at both ends -- a loop that begins at full volume sounds like a
fault.

A peer in a helicopter draws raised with a shadow, which needed nothing
new on the wire: it already says which vehicle somebody is in, and that
is enough to know they are in the air."
```

---

## Finishing

- [ ] Run the **whole** suite, browsers included: `node tests/run.mjs`. Expected: all suites pass.
- [ ] Open `tools/map.html` and confirm the town is unchanged — Task 2 added vehicles but touched no generation order.
- [ ] Update `README.md`: a helicopter row in the file table for `js/flight.js`, and a short section on flying beside the vehicles one.
- [ ] Update `CLAUDE.md`: `js/flight.js` in the file list, and a line under "the shape of the thing" saying **flying is `mode === DRIVING` with an `air` vehicle, not a mode of its own** — that is the single fact somebody will otherwise get wrong.
- [ ] Report to the user with the branch still unmerged. **`helicopters` must not go to `main` without them asking**, and they have said they want to try it first.

## Notes for whoever implements this

**Do not make flying a fourth `mode`.** It is tempting and it is wrong: `mode` goes over the wire, so a new value means a peer on any other build cannot draw a flying friend, and every `mode === DRIVING` check in a 1600-line file would need auditing. `mode === DRIVING && drivenCar.air` costs one helper function and breaks nothing.

**Height is never a coordinate.** The helicopter's x and y are on the ground for the whole flight. That is deliberate and it is what makes landing a simple question, the shadow free, and the minimap correct with no work at all.

**`drawActionButton` assumes every action has an `.npc`.** Adding a kind without one crashed the render loop when the house actions went in. Task 5 Step 5 exists because of that; do not skip it.

**Appending to `CONFIG.VEHICLES` is safe; inserting is not.** A save stores the position in that list.
