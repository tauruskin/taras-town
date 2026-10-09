# Animals, a Best Friend, and «Місто пригод» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Taras Town's visible name to «Місто пригод», and add five kinds of animal he can pat, one of which at a time becomes a best friend that follows him, waits when he leaves, and (if a bird) flies beside the helicopter.

**Architecture:** Animal *spots* are generated deterministically as the last step of `World` (`world.animalSpots`), so every phone agrees and nothing about the map is sent. A new DOM-free module `js/animals.js` holds the state machine (`Animals`, `Animal`) and the shape-drawing (`drawAnimal`, `trail`). `main.js` only wires it in: update, the `pat` action, the hand icon, two draw calls, one net field. Multiplayer sends one integer, `friend`.

**Tech Stack:** Vanilla ES modules, Canvas 2D, Web Audio (synthesised), Node offline suites, headless-Chrome browser suites via CDP. No build step, no dependencies.

**Spec:** `docs/superpowers/specs/2026-10-09-animals-and-rename-design.md`

**Before starting:** read the repo-root `CLAUDE.md` (hub rules, Taras Town rules). All game paths below are relative to `games/taras-town/` unless they start with the repo root. Run commands from the repo root.

---

## File map

| File | Change |
|---|---|
| `index.html` (repo root) | tile label + aria-label |
| `games/taras-town/index.html` | `<title>`, `<h1>` |
| `games/taras-town/js/config.js` | new `ANIMALS` block |
| `games/taras-town/js/world.js` | `_findAnimalSpots()`, called last in constructor |
| `games/taras-town/js/animals.js` | **new** — state machine, drawing, ghost trail |
| `games/taras-town/js/audio.js` | `playWoof/Meow/Quack/Tweet/Cluck` |
| `games/taras-town/js/main.js` | wiring only |
| `games/taras-town/js/net.js` | `friend` in roster copy |
| `games/taras-town/tests/offline/animals.mjs` | **new** |
| `games/taras-town/tests/offline/net.mjs` | extend exact field list |
| `games/taras-town/tests/browser/pat.mjs` | **new** |
| `CLAUDE.md`, `games/taras-town/README.md` | docs |
| `sw.js` (repo root) | add `js/animals.js` to `PRECACHE` (Task 4 Step 3) |

---

### Task 1: Rename the visible name

**Files:**
- Modify: `index.html:52-58`
- Modify: `games/taras-town/index.html:5,54`

- [ ] **Step 1: Edit the hub tile**

In `index.html` change
```html
      <a class="tile" href="games/taras-town/index.html" aria-label="Play Taras Town">
```
to
```html
      <a class="tile" href="games/taras-town/index.html" aria-label="Місто пригод">
```
and `<span class="name">Taras Town</span>` to `<span class="name">Місто пригод</span>`. Leave the `href` alone.

- [ ] **Step 2: Edit the game page**

In `games/taras-town/index.html`: `<title>Taras Town</title>` → `<title>Місто пригод</title>`, and `<h1>Taras Town</h1>` → `<h1>Місто пригод</h1>`. Confirm the file has `<meta charset="utf-8">` (it must, or the Cyrillic garbles); add it as the first child of `<head>` if missing.

Also check `manifest.json` (repo root) for `"name"` / `"short_name"`: if either is "Taras Town", it is the hub's, so leave it unless it is clearly the town's own name — and note what you found in the commit message.

- [ ] **Step 3: Check nothing tests the old text**

Run: `grep -rn "Taras Town" games/taras-town/tests/*.mjs games/taras-town/tests/offline games/taras-town/tests/browser games/pushkar-ball/tests --include=*.mjs`
Expected: no match that compares against page text (comments are fine). If a test asserts the heading text, update it to «Місто пригод».

- [ ] **Step 4: Look at it**

Serve the repo root (`node games/taras-town/tests/run.mjs menu` starts a server and is a cheap browser suite) and open `http://127.0.0.1:8777/index.html` and the game's start screen at 568×320. The name must fit under the tile without wrapping into the next tile and fit in the start panel. If the tile label wraps, reduce nothing else — shorten nothing — and instead check `css/hub.css` `.name` has `white-space: nowrap`; add it if not.

- [ ] **Step 5: Commit**

```bash
git add index.html games/taras-town/index.html css/hub.css
git commit -m "Taras Town is called Місто пригод on screen; folder, URL and saves unchanged"
```
(Add the Co-Authored-By trailer from the session's attribution instructions to every commit in this plan.)

---

### Task 2: Config and animal spots in the world

**Files:**
- Modify: `games/taras-town/js/config.js` (add block after `NEIGHBOURS`, ~line 50)
- Modify: `games/taras-town/js/world.js:151-156` (constructor tail) and add a method after `_findParking` (~line 1077)
- Create: `games/taras-town/tests/offline/animals.mjs`

- [ ] **Step 1: Write the failing test**

Create `games/taras-town/tests/offline/animals.mjs`:

```js
// Animals: where they live, and the one best friend.
//
// The thing that would ruin this feature is an animal that changes HIS town:
// a neighbour moved, a parked car moved, or worst of all a house's seed
// moved, which carries his furniture off to a different house. So section 1
// pins everything that existed before animals, byte for byte.
import { World, T } from '../../js/world.js';
import { CONFIG } from '../../js/config.js';

const world = new World();
const A = CONFIG.ANIMALS;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- 1. nothing that was there before has moved ---------------------------
console.log('');
console.log('1. the town is unchanged');
// Captured on 2026-10-09 from the town as it was before animals, with this
// exact expression. If a deliberate change to the town moves any of these,
// recapture it — but only after checking building seeds did not move.
const fingerprint = (() => {
  const s = JSON.stringify([
    world.neighbourSpots, world.parking,
    world.buildings.map((b) => [b.seed, b.door && b.door.x, b.door && b.door.y]),
    world.spawn, world.trees.length, world.props.length, world.canopies.length,
  ]);
  let h = 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
})();
check('neighbours, parking, houses and scenery are where they were',
      fingerprint === -308509121, String(fingerprint));

// --- 2. where the animals live ---------------------------------------------
console.log('');
console.log('2. animal spots');
const spots = world.animalSpots;
check('there are animal spots', Array.isArray(spots) && spots.length > 0, String(spots && spots.length));

const again = new World().animalSpots;
check('the same on every build of the town', JSON.stringify(again) === JSON.stringify(spots));

check('each id is its index', spots.every((s, i) => s.id === i));

for (const kind of Object.keys(A.COUNT)) {
  const n = spots.filter((s) => s.kind === kind).length;
  check(kind + ': the configured number', n === A.COUNT[kind], n + ' of ' + A.COUNT[kind]);
}

check('none in the water', spots.every((s) => !world.isWaterAt(s.x, s.y)));
check('none inside anything solid',
      spots.every((s) => !world._overlaps(s.x, s.y, A.HALF, A.HALF)));

const pond = world.props.find((p) => p.kind === 'pond');
const nearWater = (x, y) => {
  const r = world.tile * 2;
  for (let dy = -r; dy <= r; dy += world.tile / 2) {
    for (let dx = -r; dx <= r; dx += world.tile / 2) {
      if (world.isWaterAt(x + dx, y + dy)) return true;
    }
  }
  return x > pond.x - r && x < pond.x + pond.w + r && y > pond.y - r && y < pond.y + pond.h + r;
};
check('every duck is within two tiles of water',
      spots.filter((s) => s.kind === 'duck').every((s) => nearWater(s.x, s.y)));

check('no two animals on top of each other',
      spots.every((a, i) => spots.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) >= A.GAP)));
check('none standing on a neighbour',
      spots.every((s) => world.neighbourSpots.every((n) => Math.hypot(n.x - s.x, n.y - s.y) >= 60)));
check('none standing on a parking space',
      spots.every((s) => world.parking.every((p) => Math.abs(p.x - s.x) >= 56 || Math.abs(p.y - s.y) >= 56)));

console.log('');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node games/taras-town/tests/run.mjs animals`
Expected: section 1 `ok`, then FAIL at "there are animal spots" (or a TypeError on `CONFIG.ANIMALS`).

If section 1 already FAILs before any change, stop: the town has changed since this plan was written. Recapture the fingerprint with the same expression on a clean checkout and note it in the commit.

- [ ] **Step 3: Add the config block**

In `games/taras-town/js/config.js`, after the closing `},` of `NEIGHBOURS`:

```js
  // The animals he can pat. Every one of these is a guess awaiting a thumb.
  //
  // Few on purpose: the town is a 96x72 map and he should MEET an animal now
  // and then, not wade through them.
  ANIMALS: {
    COUNT: { dog: 5, cat: 4, duck: 5, bird: 6, hen: 4 },
    HALF: 12,             // half the box an animal needs to stand in
    GAP: 140,             // how far apart any two animals live
    PAT_RADIUS: 56,       // how close he must be for the hand to appear
    WANDER: 10,           // how far an idle animal potters from its spot
    HAPPY_TIME: 1.0,      // seconds of hearts and hopping after a pat
    FOLLOW_GAP: 40,       // how far behind him a friend walks
    SPEED: 200,           // a friend's pace; a bit quicker than his 175
    CATCHUP: 400,         // further behind than this and it is put nearer...
    CATCHUP_TO: 260,      // ...this far behind, so it can never be stranded
    RETURN_RADIUS: 60,    // come back this close to a waiting friend and it follows again
    WAIT_TIME: 30,        // seconds a friend waits before wandering home
    HOME_SPEED: 90,       // an unhurried walk home
    HOME_SNAP: 900,       // further from home than this, and unseen, it is simply home
    UNSEEN: 520,          // this far from him counts as off screen
    FLY_SIDE: 34,         // where a bird flies, beside the helicopter
    COLORS: {
      dog:  { body: '#D9A066', ear: '#8B5A2B' },
      cat:  { body: '#9AA3AD', ear: '#6F7882' },
      duck: { body: '#FFFFFF', ear: '#2E9E5B', beak: '#FFB238' },
      bird: { body: '#4FA3FF', ear: '#FFE36B', beak: '#FFB238' },
      hen:  { body: '#C8642E', ear: '#E53935', beak: '#FFB238' },
    },
  },
```

- [ ] **Step 4: Generate the spots**

In `games/taras-town/js/world.js`, at the very end of the constructor, after `this._mainland = this._findMainland();`:

```js

    // Where the animals live. LAST, and it must stay last: every spot before
    // it — neighbours, parking, and above all the order houses are made in,
    // which is what his furniture is saved under — has to be untouched by
    // their arrival. Appending is safe; anything earlier is not.
    this.animalSpots = this._findAnimalSpots();
```

Add this method directly after `_findParking()`:

```js
  /**
   * Homes for the animals: ducks by water, birds by park trees, dogs on park
   * and pavement, cats and hens in back gardens.
   *
   * Each kind takes evenly spaced picks from its own sweep, so they spread
   * across the whole town instead of bunching at the top-left where a sweep
   * starts. Deterministic like everything else here, so every phone agrees
   * which dog is number 7 — that number is all that goes over the wire.
   */
  _findAnimalSpots() {
    const A = CONFIG.ANIMALS;
    const tile = this.tile;
    const pond = this.props.find((p) => p.kind === 'pond');

    const nearWater = (x, y) => {
      const r = tile * 2;
      for (let dy = -r; dy <= r; dy += tile / 2) {
        for (let dx = -r; dx <= r; dx += tile / 2) {
          if (this.isWaterAt(x + dx, y + dy)) return true;
        }
      }
      return !!pond && x > pond.x - r && x < pond.x + pond.w + r &&
             y > pond.y - r && y < pond.y + pond.h + r;
    };
    const nearTree = (x, y) => this.trees.some((t) => Math.hypot(t.x - x, t.y - y) < 90);

    // Never on a neighbour (a pat would steal the job button), never on a
    // parking space (a car would be parked on it), never on the spawn.
    const free = (s) =>
      !this.isWaterAt(s.x, s.y) &&
      Math.hypot(s.x - this.spawn.x, s.y - this.spawn.y) > 120 &&
      this.neighbourSpots.every((n) => Math.hypot(n.x - s.x, n.y - s.y) >= 60) &&
      this.parking.every((p) => Math.abs(p.x - s.x) >= 56 || Math.abs(p.y - s.y) >= 56);

    const sweep = (match, extra) =>
      this.sweepSpots(match, A.GAP, 0.3, A.HALF, 1)
        .filter(free)
        .filter((s) => extra(s.x, s.y));

    const kinds = [
      ['duck', sweep((k) => k !== T.ROAD && k !== T.WATER, nearWater)],
      ['bird', sweep((k) => k === T.PARK, nearTree)],
      ['dog',  sweep((k) => k === T.SIDEWALK || k === T.PARK, () => true)],
      ['cat',  sweep((k) => k === T.GRASS, () => true)],
      ['hen',  sweep((k) => k === T.GRASS, () => true)],
    ];

    const out = [];
    const clear = (s) => out.every((o) => Math.hypot(o.x - s.x, o.y - s.y) >= A.GAP);

    for (const [kind, cands] of kinds) {
      const want = A.COUNT[kind];
      let got = 0;
      // Evenly spaced through the candidates; when a pick is taken (a cat
      // where a hen wanted to be), walk on to the next free one.
      for (let i = 0; i < want; i++) {
        const start = Math.floor(((i + 0.5) * cands.length) / want);
        for (let k = 0; k < cands.length; k++) {
          const s = cands[(start + k) % cands.length];
          if (!clear(s)) continue;
          out.push({ id: out.length, kind, x: s.x, y: s.y });
          got++;
          break;
        }
      }
      if (got < want) console.warn('[world] only ' + got + ' of ' + want + ' ' + kind + ' spots');
    }
    return out;
  }
```

- [ ] **Step 5: Run the test**

Run: `node games/taras-town/tests/run.mjs animals`
Expected: all `ok`. If a kind is short (the warning prints and its COUNT check fails), lower that kind's `COUNT` in config rather than loosening `GAP` — and say so in the commit.

- [ ] **Step 6: Run the rest of the offline suite**

Run: `node games/taras-town/tests/run.mjs offline`
Expected: all pass (world generation is otherwise unchanged).

- [ ] **Step 7: Look at it**

Open `games/taras-town/tools/map.html` through the test server. It does not draw animals yet; just confirm the town looks identical to before.

- [ ] **Step 8: Commit**

```bash
git add games/taras-town/js/config.js games/taras-town/js/world.js games/taras-town/tests/offline/animals.mjs
git commit -m "Animal homes are generated last in the town, leaving every house seed where it was"
```

---

### Task 3: The best-friend state machine

**Files:**
- Create: `games/taras-town/js/animals.js`
- Modify: `games/taras-town/tests/offline/animals.mjs` (append sections before the final `process.exit`)

`who`, the input to `Animals.update`, is always:
`{ mode: 'foot' | 'drive' | 'inside', x, y, flying: boolean, lift: 0..1 }` — `x, y` are the town position of whatever carries him (meaningless when `inside`).

- [ ] **Step 1: Write the failing tests**

In `tests/offline/animals.mjs`, add to the imports at the top:

```js
import { Animals } from '../../js/animals.js';
```

and insert before the final `console.log(''); process.exit(...)`:

```js
// --- 3. the best friend ------------------------------------------------------
console.log('');
console.log('3. one best friend');

const step = (animals, who, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) animals.update(1 / 60, who);
};
const first = (kind) => {
  const s = spots.find((p) => p.kind === kind);
  return s;
};
const foot = (x, y) => ({ mode: 'foot', x, y, flying: false, lift: 0 });

{
  const zoo = new Animals(world);
  const dog = zoo.list[first('dog').id];
  const cat = zoo.list[first('cat').id];

  check('nobody is a friend to begin with', zoo.friend === null && zoo.friendId() === -1);
  check('every animal starts idle at home',
        zoo.list.every((a) => a.state === 'idle' && a.x === a.homeX && a.y === a.homeY));

  check('patting says which kind it was', zoo.pat(dog) === 'dog');
  check('a pat makes it happy', dog.state === 'happy');
  check('and makes it the friend', zoo.friend === dog && zoo.friendId() === dog.id);

  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);
  check('happiness turns into following', dog.state === 'following', dog.state);

  // Walk off; the dog keeps up.
  let px = dog.x, py = dog.y;
  for (let i = 0; i < 120; i++) { px += 150 / 60; zoo.update(1 / 60, foot(px, py)); }
  const gap = Math.hypot(dog.x - px, dog.y - py);
  check('a friend keeps up behind him', gap <= A.FOLLOW_GAP + 10, gap.toFixed(1) + 'px');

  // Pat a second animal: only one friend, and the first goes home.
  zoo.pat(cat);
  check('patting another swaps the friend', zoo.friend === cat);
  check('the old friend heads home', dog.state === 'home', dog.state);
  check('exactly one animal is following or happy',
        zoo.list.filter((a) => ['happy', 'following', 'waiting', 'flying'].includes(a.state)).length === 1);

  // The old friend gets home and settles.
  step(zoo, foot(cat.x, cat.y), 60);
  check('the old friend gets home and goes back to idle', dog.state === 'idle', dog.state);

  // Re-patting the friend keeps it.
  step(zoo, foot(cat.x, cat.y), A.HAPPY_TIME + 0.05);
  zoo.pat(cat);
  check('re-patting the friend keeps it the friend', zoo.friend === cat && cat.state === 'happy');
  step(zoo, foot(cat.x, cat.y), A.HAPPY_TIME + 0.05);
  check('and it goes back to following', cat.state === 'following', cat.state);
}

// --- 4. waiting, and going home ---------------------------------------------
console.log('');
console.log('4. waiting');
{
  const zoo = new Animals(world);
  const dog = zoo.list[first('dog').id];
  zoo.pat(dog);
  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);

  step(zoo, { mode: 'drive', x: dog.x + 30, y: dog.y, flying: false, lift: 0 }, 0.1);
  check('getting into a car leaves the friend waiting', dog.state === 'waiting', dog.state);
  check('a waiting friend is not sent to other players', zoo.friendId() === -1);

  const waitX = dog.x, waitY = dog.y;
  step(zoo, { mode: 'inside', x: 9999, y: 9999, flying: false, lift: 0 }, 5);
  check('it stays put while he is away', dog.x === waitX && dog.y === waitY);

  step(zoo, foot(waitX + 20, waitY), 0.1);
  check('coming back to it gets it following again', dog.state === 'following', dog.state);

  step(zoo, { mode: 'inside', x: 0, y: 0, flying: false, lift: 0 }, 0.1);
  check('going indoors leaves it waiting too', dog.state === 'waiting', dog.state);
  zoo.pat(dog);
  check('a waiting friend can be patted again', dog.state === 'happy' && zoo.friend === dog);
  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);

  step(zoo, { mode: 'inside', x: 0, y: 0, flying: false, lift: 0 }, A.WAIT_TIME + 0.5);
  check('after WAIT_TIME it gives up and heads home', dog.state === 'home' || dog.state === 'idle', dog.state);
  check('and is nobody\'s friend any more', zoo.friend === null);
  step(zoo, { mode: 'inside', x: 0, y: 0, flying: false, lift: 0 }, 60);
  check('it gets home', dog.state === 'idle' &&
        Math.hypot(dog.x - dog.homeX, dog.y - dog.homeY) <= A.WANDER + 1, dog.state);
}

// --- 5. water ------------------------------------------------------------------
console.log('');
console.log('5. water');
{
  // A dry tile right beside water, and the water tile next to it.
  const bank = (() => {
    for (let r = 2; r < world.rows - 2; r++) {
      for (let c = 2; c < world.cols - 2; c++) {
        if (world.grid[r][c] === T.WATER && world.grid[r][c - 1] !== T.WATER &&
            world.grid[r][c - 2] !== T.WATER && world.grid[r][c + 3] === T.WATER) {
          return { land: (c - 1.5) * world.tile, water: (c + 2.5) * world.tile, y: (r + 0.5) * world.tile };
        }
      }
    }
    return null;
  })();
  check('found a river bank to test on', !!bank);

  for (const [kind, swims] of [['cat', false], ['hen', false], ['dog', true], ['duck', true]]) {
    const zoo = new Animals(world);
    const a = zoo.list[first(kind).id];
    a.x = bank.land - 60; a.y = bank.y;
    zoo.pat(a);
    step(zoo, foot(a.x, a.y), A.HAPPY_TIME + 0.05);
    step(zoo, foot(bank.water, bank.y), 3);
    const wet = world.isWaterAt(a.x, a.y);
    check(kind + (swims ? ' swims after him' : ' waits at the water\'s edge'),
          swims ? (a.state === 'following' && wet) : (a.state === 'waiting' && !wet),
          a.state + (wet ? ', in water' : ', on land'));
  }
}

// --- 6. a bird and the helicopter --------------------------------------------
console.log('');
console.log('6. flying');
{
  const zoo = new Animals(world);
  const bird = zoo.list[first('bird').id];
  const dog = zoo.list[first('dog').id];
  zoo.pat(bird);
  step(zoo, foot(bird.x, bird.y), A.HAPPY_TIME + 0.05);

  const hx = bird.x + 30, hy = bird.y;
  step(zoo, { mode: 'drive', x: hx, y: hy, flying: true, lift: 0.4 }, 0.1);
  check('a bird takes off with him', bird.state === 'flying', bird.state);
  step(zoo, { mode: 'drive', x: hx + 300, y: hy, flying: true, lift: 1 }, 2);
  check('and flies at the helicopter\'s height', bird.lift === 1, String(bird.lift));
  check('beside it', Math.hypot(bird.x - (hx + 300), bird.y - hy) < A.FLY_SIDE * 2,
        Math.hypot(bird.x - (hx + 300), bird.y - hy).toFixed(1) + 'px');
  check('a flying friend is still sent to other players', zoo.friendId() === bird.id);

  step(zoo, foot(hx + 330, hy), 0.1);
  check('landing turns it back to following', bird.state === 'following', bird.state);
  step(zoo, foot(hx + 330, hy), 2);
  check('and it settles back down to the ground', bird.lift === 0, String(bird.lift));

  // A dog does not fly.
  zoo.pat(dog);
  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);
  step(zoo, { mode: 'drive', x: dog.x, y: dog.y, flying: true, lift: 0.5 }, 0.1);
  check('a dog waits when he takes off', dog.state === 'waiting', dog.state);
}

// --- 7. never stranded ---------------------------------------------------------
console.log('');
console.log('7. catching up');
{
  const zoo = new Animals(world);
  const dog = zoo.list[first('dog').id];
  zoo.pat(dog);
  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);
  step(zoo, foot(dog.x + 2000, dog.y), 1 / 60);
  const d = Math.hypot(dog.x - (dog.homeX + 2000), dog.y - dog.homeY);
  check('a friend left far behind is brought within reach at once', d <= A.CATCHUP, d.toFixed(0) + 'px');
}
```

- [ ] **Step 2: Run to see it fail**

Run: `node games/taras-town/tests/run.mjs animals`
Expected: FAIL — `Cannot find module .../js/animals.js`.

- [ ] **Step 3: Write `js/animals.js` (logic half)**

Create `games/taras-town/js/animals.js`:

```js
/**
 * animals.js — The dogs, cats, ducks, birds and hens he can pat.
 *
 * Where they live is the WORLD's business (`world.animalSpots`), so every
 * phone agrees. This file is what they do: a small state machine per animal,
 * and how each kind is drawn. It never touches the DOM, so the offline suite
 * can run the real thing.
 *
 * One best friend at a time. Patting an animal makes it the friend; patting
 * another sends the old one home. A friend he leaves behind — in a car, in a
 * house, across water a cat will not swim — sits and waits, then gives up and
 * wanders home. A bird friend flies beside the helicopter instead.
 *
 * States change only on a timer, a distance or a pat. Never at random.
 *
 * Nothing here is solid and nothing is blocked by walls. Cover is never
 * solid in this town, and an animal that could wedge him, or be wedged
 * itself, is worse than one that trots through a hedge.
 */

import { CONFIG } from './config.js';

const LAND_ONLY = new Set(['cat', 'hen']);

export class Animal {
  constructor(spot) {
    this.id = spot.id;
    this.kind = spot.kind;
    this.homeX = spot.x;
    this.homeY = spot.y;
    this.x = spot.x;
    this.y = spot.y;
    this.state = 'idle';
    this.t = 0;          // seconds in this state
    this.facing = 1;     // 1 right, -1 left
    this.lift = 0;       // 0..1, only ever above 0 for a bird
    this.moving = false;
  }

  enter(state) {
    this.state = state;
    this.t = 0;
  }
}

export class Animals {
  constructor(world) {
    this.world = world;
    this.list = world.animalSpots.map((s) => new Animal(s));
    this.friend = null;
    this.clock = 0;
  }

  /** The nearest animal he could pat from (x, y), with its distance, or null. */
  nearest(x, y, reach = CONFIG.ANIMALS.PAT_RADIUS) {
    let best = null;
    let bestD = reach;
    for (const a of this.list) {
      if (a.state === 'flying') continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best ? { animal: best, d: bestD } : null;
  }

  /** Pat it. It becomes the friend. Returns its kind, for the sound. */
  pat(a) {
    if (this.friend && this.friend !== a) this.friend.enter('home');
    this.friend = a;
    a.enter('happy');
    return a.kind;
  }

  /**
   * Which animal other players should see trailing him: its id, or -1.
   * A waiting friend is not with him, so it is not sent.
   */
  friendId() {
    const f = this.friend;
    return f && f.state !== 'waiting' ? f.id : -1;
  }

  update(dt, who) {
    const A = CONFIG.ANIMALS;
    this.clock += dt;

    for (const a of this.list) {
      a.t += dt;
      a.moving = false;
      if (a.state !== 'flying') a.lift = Math.max(0, a.lift - dt * CONFIG.HELI.LIFT_SPEED);

      if (a.state === 'idle') this._idle(a);
      else if (a.state === 'happy') { if (a.t >= A.HAPPY_TIME) a.enter('following'); }
      else if (a.state === 'following') this._follow(a, dt, who);
      else if (a.state === 'waiting') this._wait(a, who);
      else if (a.state === 'flying') this._fly(a, dt, who);
      else if (a.state === 'home') this._goHome(a, dt, who);
    }
  }

  _idle(a) {
    const A = CONFIG.ANIMALS;
    // Eased in over the first second, so arriving home does not jump.
    const k = Math.min(1, a.t) * A.WANDER;
    const p = this.clock * 0.7 + a.id * 1.3;
    a.x = a.homeX + Math.sin(p) * k;
    a.y = a.homeY + Math.sin(this.clock * 0.45 + a.id * 2.1) * k * 0.6;
    a.facing = Math.cos(p) >= 0 ? 1 : -1;
    a.moving = true;
  }

  _follow(a, dt, who) {
    const A = CONFIG.ANIMALS;
    const birdInTheAir = a.kind === 'bird' && who.mode === 'drive' && who.flying;
    if (who.mode === 'inside' || (who.mode === 'drive' && !birdInTheAir)) { a.enter('waiting'); return; }
    if (birdInTheAir) { a.enter('flying'); return; }

    let dx = who.x - a.x;
    let dy = who.y - a.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) return;

    if (d > A.CATCHUP) {
      const nx = who.x - (dx / d) * A.CATCHUP_TO;
      const ny = who.y - (dy / d) * A.CATCHUP_TO;
      if (LAND_ONLY.has(a.kind) && this.world.isWaterAt(nx, ny)) { a.enter('waiting'); return; }
      a.x = nx; a.y = ny;
      dx = who.x - a.x; dy = who.y - a.y; d = Math.hypot(dx, dy);
    }

    if (d > A.FOLLOW_GAP) {
      const s = Math.min(d - A.FOLLOW_GAP, A.SPEED * dt);
      const nx = a.x + (dx / d) * s;
      const ny = a.y + (dy / d) * s;
      if (LAND_ONLY.has(a.kind) && this.world.isWaterAt(nx, ny)) { a.enter('waiting'); return; }
      a.x = nx; a.y = ny;
      a.moving = true;
      if (Math.abs(dx) > 1) a.facing = dx > 0 ? 1 : -1;
    }
  }

  _wait(a, who) {
    const A = CONFIG.ANIMALS;
    if (who.mode === 'foot' && Math.hypot(who.x - a.x, who.y - a.y) < A.RETURN_RADIUS) {
      a.enter('following');
      return;
    }
    if (a.t >= A.WAIT_TIME) {
      a.enter('home');
      if (this.friend === a) this.friend = null;
    }
  }

  _fly(a, dt, who) {
    const A = CONFIG.ANIMALS;
    if (!(who.mode === 'drive' && who.flying)) { a.enter('following'); return; }
    const tx = who.x + A.FLY_SIDE;
    const ty = who.y + A.FLY_SIDE * 0.4;
    const k = Math.min(1, 8 * dt);
    if (Math.abs(tx - a.x) > 1) a.facing = tx > a.x ? 1 : -1;
    a.x += (tx - a.x) * k;
    a.y += (ty - a.y) * k;
    a.lift = who.lift;
    a.moving = true;
  }

  _goHome(a, dt, who) {
    const A = CONFIG.ANIMALS;
    let dx = a.homeX - a.x;
    let dy = a.homeY - a.y;
    let d = Math.hypot(dx, dy);

    const unseen = who.mode === 'inside' || Math.hypot(who.x - a.x, who.y - a.y) > A.UNSEEN;
    if (d > A.HOME_SNAP && unseen) d = 0;

    if (d < 2) {
      a.x = a.homeX; a.y = a.homeY;
      a.enter('idle');
      return;
    }
    const s = Math.min(d, A.HOME_SPEED * dt);
    a.x += (dx / d) * s;
    a.y += (dy / d) * s;
    a.moving = true;
    if (Math.abs(dx) > 1) a.facing = dx > 0 ? 1 : -1;
  }
}
```

Note: the "home" branch after `WAIT_TIME` in section 4 runs while he is `inside`, so `unseen` is true and a far dog snaps home — that is intended.

- [ ] **Step 4: Run the tests**

Run: `node games/taras-town/tests/run.mjs animals`
Expected: all `ok`. If "a friend keeps up behind him" fails, instrument (print `dog.state`, gap per 10 frames) before touching numbers — `SPEED` must exceed the walker's 150 px/s.

- [ ] **Step 5: Commit**

```bash
git add games/taras-town/js/animals.js games/taras-town/tests/offline/animals.mjs
git commit -m "Animals: one best friend that follows, waits, goes home, and flies with a bird"
```

---

### Task 4: Drawing the animals

**Files:**
- Modify: `games/taras-town/js/animals.js` (append)

- [ ] **Step 1: Add the drawing code**

Append to `js/animals.js`:

```js
// ---------------------------------------------------------------------------
// Drawing. Side-on and chunky, so a dog reads as a dog at phone size — from
// directly above, every animal is the same brown blob. All shapes; no images.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

/**
 * One animal, standing with its feet at (x, y).
 *
 * @param o.time    seconds, for wagging and walking
 * @param o.seed    per-animal offset, so two dogs do not wag in step
 * @param o.facing  1 right, -1 left
 * @param o.pose    'stand' | 'walk' | 'sit' | 'happy'
 * @param o.swim    only the top half shows, with a ripple
 * @param o.lift    0..1 height, for a bird in the air
 * @param o.only    'shadow' | 'body' to draw half of it
 */
export function drawAnimal(ctx, kind, x, y, o = {}) {
  const C = CONFIG.ANIMALS.COLORS[kind];
  const time = (o.time || 0) + (o.seed || 0) * 0.37;
  const facing = o.facing || 1;
  const lift = o.lift || 0;
  const pose = o.pose || 'stand';

  if (o.only !== 'body') {
    const s = 1 - lift * 0.35;
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 13 * s, 5 * s, 0, 0, TAU);
    ctx.fill();
  }
  if (o.only === 'shadow') return;

  let by = y - lift * CONFIG.HELI.ALTITUDE;
  if (pose === 'happy') by -= Math.abs(Math.sin(time * 12)) * 7;

  ctx.save();
  ctx.translate(x, by);
  if (o.swim) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 2, 15 + Math.sin(time * 4) * 2, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-40, -50, 80, 52);
    ctx.clip();
  }
  ctx.scale(facing, 1);
  SHAPES[kind](ctx, C, time, pose, lift > 0.05);
  ctx.restore();

  if (pose === 'happy') drawHearts(ctx, x, by - 26, time);
}

function eye(ctx, x, y) {
  ctx.fillStyle = '#2B2B2B';
  ctx.beginPath(); ctx.arc(x, y, 1.9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(x + 0.6, y - 0.7, 0.7, 0, TAU); ctx.fill();
}

function legs(ctx, colour, time, pose, xs) {
  if (pose === 'sit') return;
  const swing = pose === 'walk' || pose === 'happy' ? Math.sin(time * 14) * 2.5 : 0;
  ctx.fillStyle = colour;
  xs.forEach((lx, i) => ctx.fillRect(lx + (i % 2 ? -swing : swing) - 1.5, 2, 3, 6));
}

function beak(ctx, colour, x, y, len) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y - 2); ctx.lineTo(x + len, y); ctx.lineTo(x, y + 2);
  ctx.closePath(); ctx.fill();
}

const SHAPES = {
  dog(ctx, C, t, pose) {
    const sit = pose === 'sit';
    legs(ctx, C.body, t, pose, [-7, -3, 4, 8]);
    ctx.fillStyle = C.body;
    ctx.beginPath();
    ctx.ellipse(sit ? -2 : 0, sit ? -1 : -2, 11, sit ? 8 : 7, sit ? -0.5 : 0, 0, TAU);
    ctx.fill();
    const wag = Math.sin(t * (sit || pose === 'happy' ? 18 : 7)) * 0.6;
    ctx.strokeStyle = C.body; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(-10 - Math.cos(wag + 0.8) * 8, -4 - Math.sin(wag + 0.8) * 8);
    ctx.stroke();
    const hy = sit ? -12 : -9;
    ctx.beginPath(); ctx.arc(10, hy, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ear;
    ctx.beginPath(); ctx.ellipse(7, hy - 2, 2.6, 5, 0.3, 0, TAU); ctx.fill();
    eye(ctx, 12, hy - 1);
    ctx.fillStyle = '#3B2A20';
    ctx.beginPath(); ctx.arc(16.5, hy + 1, 1.8, 0, TAU); ctx.fill();
  },

  cat(ctx, C, t, pose) {
    const sit = pose === 'sit';
    legs(ctx, C.body, t, pose, [-7, -3, 4, 8]);
    ctx.fillStyle = C.body;
    ctx.beginPath();
    ctx.ellipse(sit ? -2 : 0, sit ? -2 : -2, 10, sit ? 8 : 6, sit ? -0.5 : 0, 0, TAU);
    ctx.fill();
    const curl = Math.sin(t * (sit ? 3 : 5)) * 3;
    ctx.strokeStyle = C.body; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.quadraticCurveTo(-17, -6, -14 + curl, -16);
    ctx.stroke();
    const hy = sit ? -13 : -9;
    ctx.beginPath(); ctx.arc(10, hy, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ear;
    for (const ex of [6.5, 12.5]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.5, hy - 4); ctx.lineTo(ex, hy - 10); ctx.lineTo(ex + 2.5, hy - 4);
      ctx.closePath(); ctx.fill();
    }
    eye(ctx, 12, hy - 1);
    ctx.fillStyle = '#FF8FA3';
    ctx.beginPath(); ctx.arc(15.5, hy + 1.5, 1.3, 0, TAU); ctx.fill();
  },

  duck(ctx, C, t, pose) {
    legs(ctx, C.beak, t, pose, [-3, 3]);
    ctx.fillStyle = C.body;
    ctx.beginPath(); ctx.ellipse(0, -2, 11, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, -4); ctx.lineTo(-15, -9); ctx.lineTo(-8, -7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.ear;
    ctx.beginPath(); ctx.arc(8, -11, 5.5, 0, TAU); ctx.fill();
    beak(ctx, C.beak, 12.5, -10, 6);
    eye(ctx, 9.5, -12.5);
  },

  bird(ctx, C, t, pose, flying) {
    if (!flying) legs(ctx, C.beak, t, pose, [-1.5, 2]);
    ctx.fillStyle = C.body;
    ctx.beginPath(); ctx.ellipse(0, -3, 7, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ear;
    ctx.beginPath(); ctx.ellipse(1.5, -1, 4.5, 3.5, 0, 0, TAU); ctx.fill();
    const flap = flying || pose === 'happy' ? Math.sin(t * 22) * 0.9 : 0.2;
    ctx.fillStyle = C.body;
    ctx.save();
    ctx.translate(-1, -6);
    ctx.rotate(-0.6 - flap);
    ctx.beginPath(); ctx.ellipse(-4, 0, 6, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();
    beak(ctx, C.beak, 6.5, -5, 4);
    eye(ctx, 3.5, -6);
  },

  hen(ctx, C, t, pose) {
    legs(ctx, C.beak, t, pose, [-3, 3]);
    ctx.fillStyle = C.body;
    ctx.beginPath(); ctx.ellipse(0, -4, 10, 9, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -13, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ear;
    ctx.beginPath(); ctx.arc(6, -19, 2.2, 0, TAU); ctx.arc(9, -19, 2.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(11.5, -9.5, 1.6, 0, TAU); ctx.fill();
    const flap = pose === 'happy' ? Math.sin(t * 20) * 0.5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.save(); ctx.translate(-1, -4); ctx.rotate(flap);
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, 0, TAU); ctx.fill();
    ctx.restore();
    beak(ctx, C.beak, 12, -13, 4);
    eye(ctx, 9, -14.5);
  },
};

function drawHearts(ctx, x, y, time) {
  ctx.save();
  ctx.fillStyle = '#FF5C8A';
  for (let i = 0; i < 2; i++) {
    const p = (time * 1.2 + i * 0.5) % 1;
    const hx = x + (i ? 7 : -7);
    const hy = y - p * 14;
    const s = 4;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.moveTo(hx, hy + s);
    ctx.arc(hx - s / 2, hy, s / 2, Math.PI * 0.75, Math.PI * 1.9);
    ctx.arc(hx + s / 2, hy, s / 2, Math.PI * 1.1, Math.PI * 0.25);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** The pose a live animal is in right now. */
function poseOf(a) {
  if (a.state === 'happy') return 'happy';
  if (a.state === 'waiting') return 'sit';
  return a.moving ? 'walk' : 'stand';
}

/**
 * A friend trailing somebody else's character, on THIS phone. Same follow
 * as the real thing, none of its rules: it is only ever drawn.
 */
export function trail(pet, x, y, dt) {
  const A = CONFIG.ANIMALS;
  const dx = x - pet.x;
  const dy = y - pet.y;
  const d = Math.hypot(dx, dy);
  pet.moving = false;
  if (d < 1e-6) return;
  if (d > A.CATCHUP) {
    pet.x = x - (dx / d) * A.FOLLOW_GAP;
    pet.y = y - (dy / d) * A.FOLLOW_GAP;
    return;
  }
  if (d > A.FOLLOW_GAP + 2) {
    const s = Math.min(d - A.FOLLOW_GAP, A.SPEED * dt);
    pet.x += (dx / d) * s;
    pet.y += (dy / d) * s;
    pet.moving = true;
    if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
  }
}
```

And add these two methods inside `class Animals` (after `update`):

```js
  _visible(a, view, pad = 60) {
    return a.x > view.x - pad && a.x < view.x + view.w + pad &&
           a.y > view.y - pad && a.y < view.y + view.h + pad;
  }

  /** Everything on the ground, plus the shadows of anything in the air. */
  drawGround(ctx, view) {
    for (const a of this.list) {
      if (!this._visible(a, view)) continue;
      const up = a.lift > 0.05;
      drawAnimal(ctx, a.kind, a.x, a.y, {
        time: this.clock, seed: a.id, facing: a.facing, pose: poseOf(a),
        swim: !up && a.kind !== 'bird' && this.world.isWaterAt(a.x, a.y),
        lift: a.lift, only: up ? 'shadow' : undefined,
      });
    }
  }

  /** Birds in the air, drawn after the treetops they fly over. */
  drawAir(ctx, view) {
    for (const a of this.list) {
      if (a.lift <= 0.05 || !this._visible(a, view)) continue;
      drawAnimal(ctx, a.kind, a.x, a.y, {
        time: this.clock, seed: a.id, facing: a.facing, pose: 'walk', lift: a.lift, only: 'body',
      });
    }
  }
```

- [ ] **Step 2: Offline suites still pass and nothing touches the DOM**

Run: `node games/taras-town/tests/run.mjs offline`
Expected: all pass. (`animals.mjs` imports the file, so a DOM reference at import time would throw here.)

- [ ] **Step 3: Precache the new file**

`sw.js` (repo root) lists every game file in `PRECACHE`. Add, directly after `'./games/taras-town/js/npc.js',`:
```js
  './games/taras-town/js/animals.js',
```
Do **not** bump `CACHE` — the file's own comment explains that editing the file already re-runs `install`, and a needless bump was once made and reverted. The file exists now, so `addAll` will not 404.

Run: `node games/taras-town/tests/run.mjs pwa` then `node games/pushkar-ball/tests/run.mjs precache`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add games/taras-town/js/animals.js sw.js
git commit -m "Animals are drawn: side-on shapes, sitting, swimming, hearts and a flying bird"
```

(The look-at-it check for these shapes happens in Task 8, once they are on screen.)

---

### Task 5: Animal sounds

**Files:**
- Modify: `games/taras-town/js/audio.js` (after `playDenied`, ~line 403)

- [ ] **Step 1: Add the sounds**

```js
/**
 * A note that slides from one pitch to another — the bones of every animal
 * noise below. Same envelope as note(), for the same reason: no clicks.
 */
function slide(f0, f1, start, dur, gain = 0.14, type = 'triangle') {
  if (!ctx || muted) return;
  try {
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch (err) {
    // Never let a sound take the game down.
  }
}

/** Two friendly woofs. */
export function playWoof() {
  slide(320, 180, 0, 0.13, 0.16, 'square');
  slide(340, 190, 0.18, 0.13, 0.14, 'square');
}

/** A rising-then-falling meow. */
export function playMeow() {
  slide(520, 820, 0, 0.18, 0.12, 'triangle');
  slide(820, 480, 0.17, 0.25, 0.12, 'triangle');
}

/** Quack quack. */
export function playQuack() {
  slide(600, 420, 0, 0.11, 0.12, 'sawtooth');
  slide(600, 420, 0.15, 0.11, 0.10, 'sawtooth');
}

/** A little tweet-tweet. */
export function playTweet() {
  slide(2400, 3400, 0, 0.07, 0.08, 'sine');
  slide(2600, 3600, 0.11, 0.07, 0.08, 'sine');
}

/** A cluck-cluck. */
export function playCluck() {
  slide(700, 380, 0, 0.06, 0.12, 'square');
  slide(720, 400, 0.12, 0.06, 0.11, 'square');
  slide(900, 500, 0.24, 0.10, 0.10, 'square');
}
```

- [ ] **Step 2: Offline suite**

Run: `node games/taras-town/tests/run.mjs offline` — Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add games/taras-town/js/audio.js
git commit -m "Synthesised woof, meow, quack, tweet and cluck — no new audio files"
```

---

### Task 6: Wire animals into the game

**Files:**
- Modify: `games/taras-town/js/main.js` — imports (~line 17-39), set-up (~line 61), `update` (~line 341 and ~line 412), `render` (~lines 550 and 562), `findAction` (~line 820), `drawActionButton` (~lines 1604 and 1631), new `patAnimal` + `drawHandIcon` functions.

Use `Grep` for each anchor below and `Read` with offset/limit; do not read the whole file.

- [ ] **Step 1: Imports and set-up**

Add after `import { createNpcs } from './npc.js';`:
```js
import { Animals, drawAnimal, trail } from './animals.js';
```
Extend the audio import to include `playWoof, playMeow, playQuack, playTweet, playCluck`.

After `const npcs = createNpcs(world);`:
```js
const animals = new Animals(world);
```

- [ ] **Step 2: Offer a pat**

In `findAction()`, after `const house = findDoorToEnter();`:
```js
  const pet = animals.nearest(player.x, player.y);
```
and after the `if (house) options.push(...)` line:
```js
  if (pet) options.push({ kind: 'pat', animal: pet.animal, d: pet.d });
```

- [ ] **Step 3: Handle the press**

In `update()`, after `else if (action.kind === 'leave-house') leaveHouse();`:
```js
    else if (action.kind === 'pat') patAnimal(action.animal);
```
Add near `enterHouse`:
```js
const PAT_SOUNDS = { dog: playWoof, cat: playMeow, duck: playQuack, bird: playTweet, hen: playCluck };

/** A pat: it hops, hearts come out, and it becomes his best friend. */
function patAnimal(a) {
  PAT_SOUNDS[animals.pat(a)]();
}
```

- [ ] **Step 4: Update the animals every frame**

In `update()`, directly after `const who = mode === DRIVING ? drivenCar : player;`:
```js
  animals.update(dt, {
    mode: mode === INSIDE ? 'inside' : mode === DRIVING ? 'drive' : 'foot',
    x: who.x,
    y: who.y,
    flying: !!isFlying(),
    lift,
  });
```
(`lift` has already been eased a few lines above; keep this below that line.)

- [ ] **Step 5: Draw them**

In `render()`, after `for (const npc of visibleNpcs) npc.draw(ctx, clock);`:
```js
  animals.drawGround(ctx, view);
```
After `if (isFlying()) drawFlyingBody(ctx, drivenCar, lift);`:
```js
  animals.drawAir(ctx, view);
```

- [ ] **Step 6: The hand on the button**

In `drawActionButton()`, change the colour expression's last line from
```js
               : '#4EA8FF';
```
to
```js
               : action.kind === 'pat' ? '#FF7AA8'
               : '#4EA8FF';
```
and before the final `else drawMissionIcon(...)`:
```js
  else if (action.kind === 'pat') drawHandIcon();
```
Add after `drawCarIcon`:
```js
/** An open hand, for patting. */
function drawHandIcon() {
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(-11, -4, 22, 18, 7);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    roundRectPath(-11 + i * 6, -17 + (i === 0 || i === 3 ? 3 : 0), 5, 16, 2.5);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(-11, 4);
  ctx.rotate(-0.7);
  roundRectPath(-3, -10, 5.5, 13, 2.7);
  ctx.fill();
  ctx.restore();
}
```

- [ ] **Step 7: Run the cheap suites**

Run: `node games/taras-town/tests/run.mjs offline` then `node games/taras-town/tests/run.mjs jobs`
Expected: pass. `jobs` is the one most likely to notice the action button now preferring an animal over a neighbour; if it fails, find out which animal is near which neighbour (Task 2 already keeps them ≥60px apart; `PAT_RADIUS` 56 vs job radius may still overlap) before changing anything, and prefer raising the 60px gap in `_findAnimalSpots` — that is appended generation, so it is safe.

- [ ] **Step 8: Commit**

```bash
git add games/taras-town/js/main.js
git commit -m "Pat an animal with the action button; it becomes his best friend"
```

---

### Task 7: Multiplayer — one integer on the wire

**Files:**
- Modify: `games/taras-town/js/net.js:340-342` (`_broadcastRoster`)
- Modify: `games/taras-town/js/main.js` — state sent (~line 420), `updateGhosts`, `drawGhosts`
- Modify: `games/taras-town/tests/offline/net.mjs:163-183`

- [ ] **Step 1: Update the failing test first**

In `tests/offline/net.mjs`, add `friend: 3` to the `host.others.set('g1', {...})` object and `friend: -1` to the `host.update(0.05, {...})` payload. Change the exact list and its comment:

```js
// `friend` was added deliberately (Oct 2026): which animal is following him,
// as an index into the town every phone already generates. A number, never
// text — the host forces it to an integer.
check('only position, appearance, a name and a friend are sent',
      [...fields].sort().join(',') === 'angle,car,friend,hat,id,mode,name,shirt,vehicle,x,y',
      [...fields].sort().join(','));
```
Then add, right after it:
```js
const bad = new Net('testroom');
bad.peer = { id: 'h2' }; bad.status = 'host'; bad.isHost = true;
const sent2 = [];
bad.guests.set('g', { open: true, send: (m) => sent2.push(m) });
bad.others.set('g', { x: 1, y: 1, angle: 0, mode: 'foot', hat: 0, shirt: 0, car: 0, vehicle: 0, name: 'A', friend: 'hello', seen: 0 });
for (let i = 0; i < 20; i++) bad.update(0.05, { x: 0, y: 0, angle: 0, mode: 'foot', hat: 0, shirt: 0, car: 0, vehicle: 0, name: 'B', friend: -1 });
check('a friend that is not a whole number goes out as -1',
      sent2.length > 0 && sent2.every((m) => m.p.every((p) => Number.isInteger(p.friend))));
```

Run: `node games/taras-town/tests/run.mjs net` — Expected: FAIL on the field list (no `friend` from the roster copy).

- [ ] **Step 2: The host copies it, as an integer**

In `net.js` `_broadcastRoster`, change
```js
        name: p.name,
```
to
```js
        name: p.name,
        friend: Number.isInteger(p.friend) ? p.friend : -1,
```

Run: `node games/taras-town/tests/run.mjs net` — Expected: pass. (The host's own `_me` carries `friend` from main.js; the test sends `-1`.)

- [ ] **Step 3: Send it, and draw other children's friends**

In `main.js`, in the `net.update(dt, {...})` object, after `name: save.name || '',`:
```js
      friend: animals.friendId(),
```

In `updateGhosts`, after `g.car.setVehicleVisual(p.vehicle || 0);`:
```js
    // Their best friend, if any: an index into the animals every phone
    // already generates, so nothing but the number crossed the wire.
    const f = Number.isInteger(p.friend) ? world.animalSpots[p.friend] : null;
    if (!f) g.pet = null;
    else if (!g.pet || g.pet.id !== f.id) {
      g.pet = { id: f.id, kind: f.kind, x: g.x, y: g.y, facing: 1, moving: false };
    }
    if (g.pet && g.mode === ON_FOOT) trail(g.pet, g.x, g.y, dt);
```

In `drawGhosts`, inside `if (g.car.air) { ... }` after `drawFlyingBody(ctx, g.car, 1);`:
```js
        if (g.pet && g.pet.kind === 'bird') {
          drawAnimal(ctx, 'bird', g.x + CONFIG.ANIMALS.FLY_SIDE, g.y + CONFIG.ANIMALS.FLY_SIDE * 0.4,
                     { time: clock, seed: g.pet.id, lift: 1, pose: 'walk' });
        }
```
and in the on-foot `else` branch, after `g.player.draw(ctx);`:
```js
      if (g.pet) {
        drawAnimal(ctx, g.pet.kind, g.pet.x, g.pet.y, {
          time: clock, seed: g.pet.id, facing: g.pet.facing,
          pose: g.pet.moving ? 'walk' : 'stand',
          swim: g.pet.kind !== 'bird' && world.isWaterAt(g.pet.x, g.pet.y),
        });
      }
```

- [ ] **Step 4: Run**

Run: `node games/taras-town/tests/run.mjs offline` then `node games/taras-town/tests/run.mjs multiplayer`
Expected: pass. Multiplayer suites are slow and load-sensitive: if one fails, re-run it alone before believing it, but do not assume flakiness.

- [ ] **Step 5: Commit**

```bash
git add games/taras-town/js/net.js games/taras-town/js/main.js games/taras-town/tests/offline/net.mjs
git commit -m "Other players see your best friend trailing you; one integer crosses the wire"
```

---

### Task 8: Browser suite — walk to a dog, pat it, it follows

**Files:**
- Create: `games/taras-town/tests/browser/pat.mjs`

- [ ] **Step 1: Write the suite**

```js
// Walk to a dog, pat it, walk away, and see that it came too.
//
// Where the dog lives is asked of the real generation code in node, the same
// way every other suite finds things. Whether it followed is read off the
// canvas: pixels of the dog's colour near the player, who is in the middle
// of the screen. No test-only code ships in the game for this.
import { writeFileSync } from 'node:fs';
import { makeWalker, town, makeRouter } from './_helpers.mjs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/games/taras-town/index.html';
const TAG = process.argv[3] || 'pat';
const W = 844, H = 390;

const { Menu } = await import('../../js/ui.js');
const { CONFIG } = await import('../../js/config.js');
const ACTION = Menu.actionPos(W, H);

const world = await town();
const dogs = world.animalSpots.filter((s) => s.kind === 'dog');
const dog = dogs.sort((a, b) =>
  Math.hypot(a.x - world.spawn.x, a.y - world.spawn.y) -
  Math.hypot(b.x - world.spawn.x, b.y - world.spawn.y))[0];

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('LOG: ' + m.params.entry.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
const shoot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(TAG + '-' + n + '.png', Buffer.from(s.result.data, 'base64')); };

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage' });
await send('Page.navigate', { url: URL }); await sleep(2400);
await ev("document.getElementById('start-button').click()");
await sleep(1400);

const { walkTo, pos } = makeWalker({ send, ev, sleep });
const route = makeRouter(world);

/** How many pixels in a box round the middle of the screen are dog-coloured. */
const hex = CONFIG.ANIMALS.COLORS.dog.body;
const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dogPixelsNearMiddle = () => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const box = 160 * dpr;
  const d = g.getImageData(Math.round(c.width / 2 - box / 2), Math.round(c.height / 2 - box / 2), box, box).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - ${R}) < 14 && Math.abs(d[i + 1] - ${G}) < 14 && Math.abs(d[i + 2] - ${B}) < 14) n++;
  }
  return n;
})()`);
const buttonColour = async () => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const d = g.getImageData(Math.round(${ACTION.x} * dpr), Math.round(${ACTION.y - ACTION.r * 0.74} * dpr), 1, 1).data;
  return [d[0], d[1], d[2]];
})()`);
const tapAction = async () => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ACTION.x, y: ACTION.y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
};

console.log('');
console.log('1. walk to the nearest dog');
for (const wp of route(world.spawn, dog) || [dog]) await walkTo(wp.x, wp.y, 40);
const arrived = await walkTo(dog.x, dog.y, CONFIG.ANIMALS.PAT_RADIUS - 16);
check('got to the dog', arrived.arrived, JSON.stringify(arrived.pos));
await shoot('1-by-the-dog');

console.log('');
console.log('2. the button offers a pat');
const [r, g, b] = await buttonColour();
check('the action button is pink', Math.abs(r - 255) < 24 && Math.abs(g - 122) < 24 && Math.abs(b - 168) < 24, [r, g, b].join(','));

console.log('');
console.log('3. pat it and walk away');
await tapAction();
await sleep(CONFIG.ANIMALS.HAPPY_TIME * 1000 + 200);
const here = await pos();
// Away from the dog's home, along a route, so it has to follow to be seen.
const away = { x: here.x + (here.x > world.width / 2 ? -320 : 320), y: here.y };
for (const wp of route(here, away) || [away]) await walkTo(wp.x, wp.y, 40);
await sleep(800);
const n = await dogPixelsNearMiddle();
check('the dog is still beside him', n > 20, n + ' dog-coloured pixels');
await shoot('2-followed');

for (const [w, h] of [[568, 320], [740, 280]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  await shoot('3-' + w + 'x' + h);
}

if (problems.length) { check('no errors in the page', false, problems.join(' | ')); }
console.log('');
process.exit(fail ? 1 : 0);
```

Before running, open `tests/browser/jobs.mjs` and copy its exact navigation URL default and start sequence if they differ from the above — `run.mjs` passes the real URL as `argv[2]`, so the default only matters when run by hand.

- [ ] **Step 2: Run it**

Run: `node games/taras-town/tests/run.mjs pat`
Expected: all `ok`. If "got to the dog" fails, check the route first (a dog on an island the walker cannot route to is a test-side choice: pick the nearest dog in `world._mainland` instead). If "the dog is still beside him" fails, look at `pat-2-followed.png` before changing anything — suspect the pixel box and tolerance, then the arithmetic.

- [ ] **Step 3: Look at it**

Open every `games/taras-town/tests/screenshots/pat-*.png`. Check by eye:
- the dog reads as a dog, the right way up, facing where it walks;
- the hand on the pink button reads as a hand;
- at 568×320 and 740×280 nothing new covers a button and the animal is not hidden under the HUD.

Also try the same walk by hand for a cat at the river, a duck, and a bird with a helicopter, using a browser on the local server, and look. Note anything ugly; fix shapes in `animals.js` only.

- [ ] **Step 4: Commit**

```bash
git add games/taras-town/tests/browser/pat.mjs
git commit -m "Browser suite: walk to a dog, pat it, and it follows"
```

---

### Task 9: Docs, then both full suites

**Files:**
- Modify: `CLAUDE.md` (repo root)
- Modify: `games/taras-town/README.md`

- [ ] **Step 1: CLAUDE.md**

In the hub rule beginning "**Nothing leaves the phone** except, in a shared game, position and a name.", change that first sentence to:

```
- **Nothing leaves the phone** except, in a shared game, position, a name, and
  which animal is following him — `friend`, an index into the animals every
  phone already generates, forced to an integer by the host.
```

Under "The shape of the thing — Taras Town", add:

```
- **Animals live at `world.animalSpots`, generated LAST in the World
  constructor.** Last is load-bearing: anything inserted before it can move a
  neighbour, a parking space or a house's `seed`. Their behaviour is
  `js/animals.js` — one best friend at a time, a state machine that changes
  only on a timer, a distance or a pat. Animals are never solid and never
  blocked; a friend left far behind is moved nearer rather than stranded.
```

- [ ] **Step 2: README**

Add an "Animals" section to `games/taras-town/README.md` summarising: the five kinds and where they live, pat → best friend, waiting/home, the bird and the helicopter, the `friend` wire field, the offline suite `animals.mjs` and browser suite `pat.mjs`. Also update any place that names the game on screen to «Місто пригод» (keep the folder name in paths).

- [ ] **Step 3: Both games' full suites (required: `index.html` at the hub changed)**

Run: `node games/taras-town/tests/run.mjs 2>&1 | tail -40`
Run: `node games/pushkar-ball/tests/run.mjs 2>&1 | tail -40`
Expected: every suite passes. A multiplayer failure gets re-run alone before it is believed.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md games/taras-town/README.md
git commit -m "Docs: animals, the friend field on the wire, and the town's new name"
```

Do not push without the user's go-ahead.

---

## Self-review notes

- Spec §1 rename → Task 1. §3 placement → Task 2. §4 state machine incl. re-pat, swim, wait, fly, catch-up, home-snap → Task 3. §5 pat action, icon, sounds → Tasks 5–6. §6 drawing/layers → Tasks 4, 6. §7 multiplayer + CLAUDE.md → Tasks 7, 9. §9 tests → Tasks 2, 3, 7, 8.
- Names used across tasks: `Animals`, `Animal`, `nearest`, `pat`, `friendId`, `update(dt, who)`, `drawGround`, `drawAir`, `drawAnimal`, `trail`, `CONFIG.ANIMALS.*` — consistent.
- Known judgement calls left to the implementer, each with a stated rule: COUNT may drop if a kind cannot be placed (Task 2 Step 5); the 60px neighbour gap may rise if `jobs` regresses (Task 6 Step 7); `sw.js` is edited (Task 4 Step 3), which with Task 1 makes both games' full suites mandatory before push (Task 9).
