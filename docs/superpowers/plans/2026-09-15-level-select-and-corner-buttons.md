# Level Select and Corner Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A level-select main screen with unlock-as-you-go progress saved on the device, and two one-tap buttons during play — restart the level, and go to level select.

**Architecture:** Progress lives in a new DOM-free `js/save.js` that is handed its storage. The two in-play buttons are canvas buttons whose positions live in `ui.js` beside the existing controls; `input.js` turns a press on one into a consumed action, and `flow.js` acts on `restart` and hands `levels` back. Level select is an HTML screen like the existing opening screen, built by `main.js` from `LEVELS` and the saved progress. The results panel's house becomes a grid to level select.

**Tech Stack:** Vanilla ES modules, no build. Offline suites: `node games/pushkar-ball/tests/run.mjs <name>`. Browser suites drive headless Chrome over CDP.

**Spec:** `docs/superpowers/specs/2026-09-15-level-select-and-corner-buttons-design.md`

**Known, not this plan's:** `finish` fails with exactly one line, "level 7 has no route in finish.mjs". Any other failure is real.

**`sw.js` changes in Task 4, so Task 6 runs BOTH games' full suites before anything is pushed.**

## Files

- Create `games/pushkar-ball/js/save.js` — load, sanitise, save and advance progress.
- Create `games/pushkar-ball/tests/offline/save.mjs`.
- Create `games/pushkar-ball/tests/browser/screens.mjs`.
- Modify `games/pushkar-ball/js/config.js` — corner button size and spacing.
- Modify `games/pushkar-ball/js/ui.js` — `Buttons.restart`, `Buttons.levels`, their drawing; `Panel.home` → `Panel.levels` drawn as a grid; shared icon helpers.
- Modify `games/pushkar-ball/js/input.js` — `takeAction()`.
- Modify `games/pushkar-ball/js/flow.js` — `act()`, `onWin`, panel `levels`.
- Modify `games/pushkar-ball/js/main.js` — screens, tiles, progress, actions.
- Modify `games/pushkar-ball/index.html`, `games/pushkar-ball/css/style.css` — `#levels-screen`.
- Modify `sw.js` — precache `save.js`, cache `pushkar-games-v3`.
- Modify tests `offline/buttons.mjs`, `offline/progress.mjs`, `browser/_helpers.mjs`, `browser/small.mjs`.
- Docs: `games/pushkar-ball/README.md`, `games/pushkar-ball/tests/README.md`, the spec.

---

### Task 1: `save.js`

**Files:**
- Create: `games/pushkar-ball/js/save.js`
- Create: `games/pushkar-ball/tests/offline/save.mjs`
- Modify: `sw.js` (precache list, ~line 105) — the `precache` suite requires every game file to be listed the moment it exists

- [ ] **Step 1: Write the failing suite**

Create `games/pushkar-ball/tests/offline/save.mjs`:

```js
// Saved progress: which levels are open and which are finished. Every read and
// write can fail — private mode, blocked storage, a value someone typed into
// DevTools — and every failure has to give a playable game with no memory,
// never an error. So the storage is handed in, and this suite hands in ones
// that work, ones that throw, and ones full of rubbish.
const { SAVE_KEY, freshProgress, loadProgress, saveProgress, markWon } = await import('../../js/save.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const LEVELS = [{ id: 1 }, { id: 2 }, { id: 3 }];
const memory = (init) => {
  const m = new Map(init ? [[SAVE_KEY, init]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

// --- 1. nothing saved, or no storage at all, is level one only -------------
{
  console.log('\n1. defaults');
  const fresh = freshProgress();
  if (!same(fresh, { unlocked: 1, finished: [] })) fail(`fresh progress is ${JSON.stringify(fresh)}`);
  if (!same(loadProgress(memory(), LEVELS), fresh)) fail('empty storage did not give fresh progress');
  let threw = false, got;
  try { got = loadProgress(throwing, LEVELS); } catch (_) { threw = true; }
  if (threw || !same(got, fresh)) fail('a storage that throws did not give fresh progress quietly');
  try { got = loadProgress(null, LEVELS); } catch (_) { threw = true; }
  if (threw || !same(got, fresh)) fail('no storage at all did not give fresh progress quietly');
  let saved;
  try { saved = saveProgress(throwing, fresh); } catch (_) { threw = true; }
  if (threw || saved !== false) fail('saving to a storage that throws did not return false quietly');
}

// --- 2. rubbish is cleaned, not trusted -------------------------------------
{
  console.log('\n2. sanitising');
  const cases = [
    ['not json', '{oops', { unlocked: 1, finished: [] }],
    ['a number', '7', { unlocked: 1, finished: [] }],
    ['unlocked too high', JSON.stringify({ unlocked: 99, finished: [] }), { unlocked: 3, finished: [] }],
    ['unlocked zero', JSON.stringify({ unlocked: 0, finished: [] }), { unlocked: 1, finished: [] }],
    ['unlocked not a whole number', JSON.stringify({ unlocked: 2.5, finished: [] }), { unlocked: 1, finished: [] }],
    ['unknown and repeated ids', JSON.stringify({ unlocked: 2, finished: [1, 1, 9, 'x'] }), { unlocked: 2, finished: [1] }],
    ['finished not a list', JSON.stringify({ unlocked: 2, finished: 'all' }), { unlocked: 2, finished: [] }],
  ];
  for (const [what, raw, want] of cases) {
    const got = loadProgress(memory(raw), LEVELS);
    if (!same(got, want)) fail(`${what}: loaded ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
  console.log(`   ${cases.length} kinds of rubbish`);
}

// --- 3. winning opens the next level, and never closes anything ------------
{
  console.log('\n3. markWon');
  let p = markWon(freshProgress(), 0, LEVELS);
  if (!same(p, { unlocked: 2, finished: [1] })) fail(`winning level 1 gave ${JSON.stringify(p)}`);
  p = markWon(p, 0, LEVELS);
  if (!same(p, { unlocked: 2, finished: [1] })) fail(`winning level 1 twice gave ${JSON.stringify(p)}`);
  p = markWon({ unlocked: 3, finished: [1, 2] }, 0, LEVELS);
  if (p.unlocked !== 3) fail(`replaying level 1 lowered unlocked to ${p.unlocked}`);
  p = markWon({ unlocked: 3, finished: [1, 2] }, 2, LEVELS);
  if (!same(p, { unlocked: 3, finished: [1, 2, 3] })) fail(`winning the last level gave ${JSON.stringify(p)}`);
  const before = { unlocked: 1, finished: [] };
  markWon(before, 0, LEVELS);
  if (!same(before, { unlocked: 1, finished: [] })) fail('markWon changed the progress it was given');
}

// --- 4. a save comes back as it went in -------------------------------------
{
  console.log('\n4. round trip');
  const store = memory();
  const p = { unlocked: 3, finished: [1, 3] };
  if (saveProgress(store, p) !== true) fail('saving to working storage did not return true');
  if (!same(loadProgress(store, LEVELS), p)) fail(`saved ${JSON.stringify(p)}, loaded ${JSON.stringify(loadProgress(store, LEVELS))}`);
  console.log(`   stored under ${SAVE_KEY}: ${store.m.get(SAVE_KEY)}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL SAVE CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs save`
Expected: FAIL — cannot find `js/save.js`.

- [ ] **Step 3: Write `save.js`**

Create `games/pushkar-ball/js/save.js`:

```js
/**
 * save.js — which levels are open and which are finished, and nothing else.
 *
 * The storage is handed in rather than reached for, so this file never touches
 * `localStorage` at import time and Node can test every failure: main.js passes
 * the real one, the suite passes fakes. Every read and write is in try/catch
 * and gives the defaults on any failure — a private-mode browser gets a
 * playable game with no memory, never an error. That is a hub rule.
 *
 * `unlocked` counts levels from the start that may be played, so 1 means only
 * the first. `finished` holds level ids, not indexes, so a level moved in the
 * list keeps its star.
 */
export const SAVE_KEY = 'pushkar-ball-save';

export function freshProgress() {
  return { unlocked: 1, finished: [] };
}

/** Progress from `storage`, cleaned against `levels`. Never throws. */
export function loadProgress(storage, levels) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return freshProgress();
    return clean(JSON.parse(raw), levels);
  } catch (_) {
    return freshProgress();
  }
}

/** Write `progress`. True if it was stored, false if storage refused. */
export function saveProgress(storage, progress) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(progress));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Progress after winning the level at `index`: that level finished, and the
 * next one open. A new object — the one given is left alone. Never lowers
 * `unlocked`, so replaying level one does not lock level five again, and never
 * raises it past the last level.
 */
export function markWon(progress, index, levels) {
  const id = levels[index].id;
  return {
    unlocked: Math.min(levels.length, Math.max(progress.unlocked, index + 2)),
    finished: progress.finished.includes(id) ? [...progress.finished] : [...progress.finished, id],
  };
}

/**
 * Whatever was stored, made safe. A value typed in by hand or left by an older
 * version must not open a level that does not exist or crash the tiles.
 */
function clean(data, levels) {
  const n = levels.length;
  const unlocked = Number.isInteger(data?.unlocked) ? Math.min(n, Math.max(1, data.unlocked)) : 1;
  const ids = new Set(levels.map((l) => l.id));
  const finished = Array.isArray(data?.finished) ? [...new Set(data.finished.filter((id) => ids.has(id)))] : [];
  return { unlocked, finished };
}
```

- [ ] **Step 4: List it in the service worker**

In `sw.js`, after `'./games/pushkar-ball/js/flow.js',` add `'./games/pushkar-ball/js/save.js',`. Change `const CACHE = 'pushkar-games-v2';` to `const CACHE = 'pushkar-games-v3';`. Read the comment above `CACHE` first and follow any instruction it gives about bumping.

- [ ] **Step 5: Run the suites**

Run: `node games/pushkar-ball/tests/run.mjs save` — expected `ok ALL SAVE CHECKS PASSED`.
Run: `node games/pushkar-ball/tests/run.mjs precache` — expected ok.
Run: `node games/taras-town/tests/run.mjs pwa` — expected ok (it checks every listed file exists).

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/save.js games/pushkar-ball/tests/offline/save.mjs sw.js
git commit -m "Add saved progress for Pushkar Ball

Which levels are open and finished, under one key, with the storage
handed in so every failure can be tested. Precached, cache bumped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The corner buttons, and the panel's grid, in `ui.js`

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (`UI` block, ~line 586)
- Modify: `games/pushkar-ball/js/ui.js`
- Modify: `games/pushkar-ball/tests/offline/buttons.mjs`

- [ ] **Step 1: Add the failing checks to `buttons.mjs`**

In `buttons.mjs`, change every `Panel.home` to `Panel.levels` and every `'home'` in its panel lists to `'levels'` (the loop `for (const name of ['retry', 'home'])`, the pair `[['retry', pr], ['home', ph]]`, and the pinned block's `home`). Rename the local `ph`/`home` variables to `pl`/`levels` so the messages read truly.

Then, inside the `for (const [w, h] of SCREENS)` loop, directly after the hearts block, add:

```js
  // The two corner buttons: restart and level select, top-right, the corner
  // the hearts leave free. One tap each, so a thumb meant for one must never
  // land on the other, on a control, or on a heart — measured by hit radius,
  // the circle a tap actually counts inside, not the one that is drawn.
  const corners = { restart: Buttons.restart(w, h), levels: Buttons.levels(w, h) };
  for (const [name, b] of Object.entries(corners)) {
    if (b.x - b.r < 0 || b.y - b.r < 0 || b.x + b.r > w || b.y + b.r > h) {
      fail(`the ${name} corner button (${b.x.toFixed(0)},${b.y.toFixed(0)} r${b.r}) is off a ${w}x${h} screen`);
    }
    if (Buttons.at(b.x, b.y, w, h) !== name) fail(`tapping the middle of the ${name} corner button does not hit it`);
    const reach = b.r * CONFIG.UI.HIT;
    for (const [cname, c] of Object.entries(all)) {
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d < reach + c.r * CONFIG.UI.HIT) fail(`the ${name} corner button's hit circle overlaps the ${cname} control's on ${w}x${h}`);
    }
    for (let i = 0; i < CONFIG.HEALTH.HEARTS; i++) {
      const p = Hearts.at(i, w, h);
      if (Math.hypot(b.x - p.x, b.y - p.y) < reach + CONFIG.HEARTS_UI.R) fail(`the ${name} corner button reaches heart ${i} on ${w}x${h}`);
    }
    if (b.y + reach > Buttons.topEdge(w, h)) fail(`the ${name} corner button reaches into the control band on ${w}x${h}`);
  }
  {
    const a = corners.restart, b = corners.levels;
    if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * CONFIG.UI.HIT) fail(`the two corner buttons' hit circles overlap on ${w}x${h}`);
  }
  console.log(`   restart ${corners.restart.x.toFixed(0)},${corners.restart.y.toFixed(0)}  levels ${corners.levels.x.toFixed(0)},${corners.levels.y.toFixed(0)}`);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs buttons`
Expected: FAIL — `Buttons.restart is not a function` (or `Panel.levels`).

- [ ] **Step 3: Config**

In `config.js`'s `UI` block, after `HIT: 1.3, ...` and its comment, add:

```js
    // The two corner buttons during play — restart and level select, top-right.
    // Smaller than the controls: they are pressed rarely and on purpose, and a
    // thumb resting near the top of the screen should find the world, not them.
    // GAP must keep their HIT circles apart: 2 * R * (HIT - 1) is 13.2 here, so
    // 18 leaves daylight. tests/offline/buttons.mjs checks it on every screen.
    CORNER_R: 22,
    CORNER_EDGE: 14,    // from the top and right edges of the screen
    CORNER_GAP: 18,     // between the two buttons' drawn edges
```

- [ ] **Step 4: `ui.js` — positions, hit test, drawing**

Replace `const NAMES = ['left', 'right', 'jump'];` and its comment with:

```js
// The order the hit test walks. Only matters if two buttons overlap, which the
// button suite forbids on every screen size, so it is really just a list.
// CONTROLS are the thumb band at the bottom; CORNERS are the two one-tap
// buttons top-right. Kept apart because `topEdge` is about the thumb band only.
const NAMES = ['left', 'right', 'jump'];
const CORNERS = ['restart', 'levels'];
```

In `Buttons`, after `jump(w, h) { ... },` add:

```js
  /** Top-right, in the corner: go to level select. */
  levels(w, h) {
    const u = CONFIG.UI;
    return { x: w - u.CORNER_EDGE - u.CORNER_R, y: u.CORNER_EDGE + u.CORNER_R, r: u.CORNER_R };
  },

  /** Top-right, just inboard of `levels`: restart this level. */
  restart(w, h) {
    const u = CONFIG.UI;
    const l = Buttons.levels(w, h);
    return { x: l.x - u.CORNER_R * 2 - u.CORNER_GAP, y: l.y, r: u.CORNER_R };
  },
```

In `Buttons.at`, change `for (const name of NAMES) {` to `for (const name of [...NAMES, ...CORNERS]) {`. Leave `topEdge` iterating `NAMES` only.

At the end of `Buttons.draw`, after the controls' loop, add:

```js
    // The corner buttons, same disc, with pictures: a curved arrow to restart,
    // a grid of squares for the levels.
    for (const name of CORNERS) {
      const b = Buttons[name](w, h);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = C.BUTTON;
      ctx.fill();
      if (name === 'restart') retryArrow(ctx, b, C.BUTTON_MARK);
      else gridIcon(ctx, b, C.BUTTON_MARK);
    }
```

In `Panel`:
- Update its doc comment: the second button is now the grid to level select (the house lives on level select), and the "missing on purpose" paragraph goes.
- Rename `home(w, h)` to `levels(w, h)`, doc comment `/** To level select. Right of centre, level with retry. */`.
- `const PANEL_NAMES = ['retry', 'home'];` becomes `['retry', 'levels']`.
- In `Panel.draw`, replace the retry-arrow drawing with `retryArrow(ctx, r, C.PANEL_INK);` after `circleButton(ctx, r, C);`, and replace the whole house block (from `// The house:` to the door's `fillRect`) with:

```js
    // Level select: a grid of four squares, the same picture as the corner
    // button during play. The house is on level select itself now.
    const lv = Panel.levels(w, h);
    circleButton(ctx, lv, C);
    gridIcon(ctx, lv, C.PANEL_INK);
```

After `circleButton`, add the two shared pictures:

```js
/**
 * A curved arrow: an arc with a head on its end. Shared by the panel's retry
 * and the restart corner button, so the two can never come to look different.
 * Proportional to the disc, line width included.
 */
function retryArrow(ctx, b, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, b.r * 0.12);
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * 0.5, Math.PI * 0.35, Math.PI * 1.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x + b.r * 0.5, b.y - b.r * 0.32);
  ctx.lineTo(b.x + b.r * 0.16, b.y - b.r * 0.2);
  ctx.lineTo(b.x + b.r * 0.52, b.y + b.r * 0.06);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}

/** Four squares in a two-by-two grid: "all the levels". */
function gridIcon(ctx, b, colour) {
  const s = b.r * 0.3, g = b.r * 0.14;
  ctx.fillStyle = colour;
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      ctx.fillRect(b.x + (dx < 0 ? -s - g / 2 : g / 2), b.y + (dy < 0 ? -s - g / 2 : g / 2), s, s);
    }
  }
}
```

- [ ] **Step 5: Keep the rest of the game compiling**

`flow.js` still returns `'home'` from `Panel.at` — that no longer happens. Change `if (hit === 'home') return 'home';` to `if (hit === 'levels') return 'levels';` and `'home'` in its doc comment to `'levels'` (Task 3 finishes flow.js). In `main.js`, change `=== 'home'` in the loop's tap handling to `=== 'levels'` and leave its body as it is for now (Task 4 replaces it). In `progress.mjs` check 6, change `Panel.home(W, H)` to `Panel.levels(W, H)`, `'home'` to `'levels'`, and the two messages to say "grid" instead of "house"/"home".

- [ ] **Step 6: Run the suites**

Run: `node games/pushkar-ball/tests/run.mjs buttons` — expected ok, printing corner positions for all four screens.
Run: `node games/pushkar-ball/tests/run.mjs progress` — expected ok.
Run: `node --check games/pushkar-ball/js/ui.js` and `main.js` — silent.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/ui.js games/pushkar-ball/js/flow.js games/pushkar-ball/js/main.js games/pushkar-ball/tests/offline/buttons.mjs games/pushkar-ball/tests/offline/progress.mjs
git commit -m "Add restart and level-select corner buttons, and a grid on the panel

Two one-tap buttons top-right, clear of the hearts and the controls by
hit radius on every screen. The results panel's house becomes a grid to
level select; the arrow and the grid are shared pictures.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Actions in `input.js` and `flow.js`

**Files:**
- Modify: `games/pushkar-ball/js/input.js`
- Modify: `games/pushkar-ball/js/flow.js`
- Modify: `games/pushkar-ball/tests/offline/progress.mjs` (check 6)

- [ ] **Step 1: Add the failing checks**

In `progress.mjs` check 6:

Change `const flow = new Flow(input, { levels, onStart: (f) => starts.push(f.levelIndex) });` to:

```js
  // onWin and onStart write to the same list, so the ORDER is checked: a level
  // must be saved as won before the next one begins, or a child who leaves on
  // the very next frame finds the next level still locked.
  const events = [];
  const flow = new Flow(input, {
    levels,
    onStart: (f) => { starts.push(f.levelIndex); events.push(`start ${f.levelIndex}`); },
    onWin: (f) => events.push(`win ${f.levelIndex}`),
  });
```

After the auto-advance checks (after `if (!input.controls) fail('the controls stayed off on the new level');`) add:

```js
  if (events.join() !== 'start 0,win 0,start 0,win 0,start 1') {
    fail(`onWin/onStart ran in the order ${events.join(', ')}; a win must be reported before the next level starts`);
  }
```

After the existing `if (starts.join() !== '0,0,1,0') ...` line, and before the closing `}` of check 6, add:

```js
  // The corner buttons during play. A press on one is an ACTION, read once —
  // never a held control and never a tap for a panel.
  {
    flow.start(0);
    const holdR = down(Buttons.right(W, H));
    for (let i = 0; i < 60; i++) flow.step(CONFIG.STEP);
    up(holdR);
    const lvl = flow.level, bl = flow.ball;
    if (!(bl.x > 200)) fail('the ball did not move before restart, so the restart check proves nothing');

    tapAt(Buttons.restart(W, H));
    if (input.right || input.takeJump()) fail('a press on the restart corner button was taken as a control');
    const a = input.takeAction();
    if (a !== 'restart') fail(`a press on the restart corner button gave the action ${a}`);
    if (input.takeAction() !== null) fail('the restart action was not consumed when read');
    const ar = flow.act(a);
    console.log(`   restart corner button: ${ar}; ball at ${flow.ball.x},${flow.ball.y}`);
    if (ar !== 'restart') fail(`flow.act('restart') returned ${ar}`);
    if (flow.level === lvl || flow.ball === bl || flow.ball.x !== 200 || flow.levelIndex !== 0) fail('restart did not rebuild the same level with the ball at the spawn');

    tapAt(Buttons.levels(W, H));
    const l = input.takeAction();
    const lr = flow.act(l);
    if (l !== 'levels' || lr !== 'levels') fail(`the levels corner button gave ${l} and flow.act returned ${lr}`);
    if (flow.mode !== 'playing' || flow.levelIndex !== 0) fail('flow.act(\'levels\') changed the level or the mode instead of handing it back');

    tapAt(Buttons.restart(W, H));
    input.setControls(false);
    if (input.takeAction() !== null) fail('an action pressed just before the controls switched off survived the switch');

    tapAt(Buttons.restart(W, H));
    if (input.takeAction() !== null) fail('with the controls off, a press on a corner button still became an action');
    input.takeTap();
    input.setControls(true);

    flow.mode = 'won';
    if (flow.act('restart') !== null) fail('an action while the results panel is up did something');
    flow.start(0);
  }
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs progress`
Expected: FAIL — `input.takeAction is not a function`, or the event order.

- [ ] **Step 3: `input.js`**

In the constructor, after `this._tap = null;` and its comment, add:

```js
    // A press on one of the corner buttons — 'restart' or 'levels' — waiting
    // to be read once. An action and not a held button: holding a thumb on
    // restart must restart the level once, not every frame.
    this._action = null;
```

In `_down`, replace

```js
    e.preventDefault();
    if (name === 'jump') this._jump = true;
    else this._pointers.set(e.pointerId, name);
```

with

```js
    e.preventDefault();
    if (name === 'jump') this._jump = true;
    else if (name === 'restart' || name === 'levels') this._action = name;
    else this._pointers.set(e.pointerId, name);
```

In `setControls`, after `this._tap = null;` add `this._action = null;`, and add to its comment that a corner-button press in flight is dropped too.

After `takeTap()`, add:

```js
  /** The corner button pressed since this was last asked — 'restart', 'levels' or null — consumed. */
  takeAction() { const a = this._action; this._action = null; return a; }
```

- [ ] **Step 4: `flow.js`**

Change the constructor signature to `constructor(input, { levels = LEVELS, onStart = () => {}, onWin = () => {} } = {})`, store `this.onWin = onWin;`, and add to its doc comment:

```js
   * @param onWin   called with this flow on the step the flag is touched,
   *                before anything moves on — where main.js saves progress, so
   *                the next level is already open if the player leaves at once.
```

In `step`, change

```js
      if (this.ball.won) {
        this.mode = 'won';
```

to

```js
      if (this.ball.won) {
        this.mode = 'won';
        this.onWin(this);
```

After `tap(...)`, add:

```js
  /**
   * A corner button pressed during play: 'restart' starts this level again
   * and is returned; 'levels' is returned for main.js to act on, because
   * showing another screen needs a DOM. Anything while the panel is up, or any
   * other name, does nothing and returns null.
   */
  act(name) {
    if (this.mode !== 'playing') return null;
    if (name === 'restart') { this.start(this.levelIndex); return 'restart'; }
    if (name === 'levels') return 'levels';
    return null;
  }
```

Update `tap`'s doc comment: it returns 'retry' or 'levels', and 'levels' is handed back for the same reason going to another screen needs a browser. Update the file header's list ("the hub button" → "the level-select button"). Update the comment in `step` that says "retry and the hub are both still on it — and phase 4's level select is where this will lead instead" to say retry and the grid to level select are on it.

- [ ] **Step 5: Run the suites**

Run: `node games/pushkar-ball/tests/run.mjs progress` — expected ok, with the "restart corner button" line printed.
Run: `node games/pushkar-ball/tests/run.mjs offline` — expected all ok except the known level-7 `finish` line.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/input.js games/pushkar-ball/js/flow.js games/pushkar-ball/tests/offline/progress.mjs
git commit -m "Turn corner-button presses into actions the flow acts on

A press on restart or levels is read once. The flow restarts the level
itself and hands 'levels' back, and reports a win before moving on so
progress can be saved first.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The level-select screen

**Files:**
- Modify: `games/pushkar-ball/index.html`
- Modify: `games/pushkar-ball/css/style.css`
- Modify: `games/pushkar-ball/js/main.js`

No offline suite can see the DOM; Task 5's browser suites are this task's tests.

- [ ] **Step 1: The HTML**

In `index.html`, after `#start-screen`'s closing `</div>` add:

```html
  <!--
    Level select: the game's main screen. One tile per level, built by main.js
    from the level list and the saved progress, so a level added later appears
    here without touching this file. The only text is each level's number.
  -->
  <div id="levels-screen" class="hidden">
    <button id="levels-hub-button" class="hub-link" aria-label="All games">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M6 24 L24 8 L42 24 L36 24 L36 40 L12 40 L12 24 Z"/>
      </svg>
    </button>
    <div id="level-grid"></div>
  </div>
```

Update the opening screen's comment: its Play button now leads to level select.

- [ ] **Step 2: The CSS**

In `style.css`, change the `#start-screen` and `#start-screen.hidden` rules to cover both screens:

```css
#start-screen, #levels-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(#4FC3F7, #B3E5FC);
}
#start-screen.hidden, #levels-screen.hidden { display: none; }
```

After the `.hub-link svg` rule add:

```css
/* Level select. Four tiles to a row, sized against the screen HEIGHT for the
   same reason the opening panel is: at 740x280 two rows of 26vh tiles and a
   gap are 154px, which clears the hub button above them. */
#level-grid {
  --tile: clamp(52px, 26vh, 110px);
  display: grid;
  grid-template-columns: repeat(4, var(--tile));
  gap: clamp(8px, 3vh, 18px);
}
.tile {
  position: relative;
  width: var(--tile);
  aspect-ratio: 1;
  border-radius: 18%;
  background: #fff;
  box-shadow: 0 5px 0 rgba(0, 0, 0, .2);
  font: inherit;
  font-weight: 800;
  font-size: calc(var(--tile) * .42);
  color: #33444F;
}
.tile:active { transform: translateY(3px); box-shadow: 0 2px 0 rgba(0, 0, 0, .2); }
/* The next level to play stands out; finished ones carry a star; locked ones
   are faded, show a padlock, and do not press in. No red anywhere: the ball is
   the only red thing in this game. */
.tile.next { background: #FFC93C; }
.tile.locked { background: rgba(255, 255, 255, .45); cursor: default; }
.tile.locked:active { transform: none; box-shadow: 0 5px 0 rgba(0, 0, 0, .2); }
.tile svg.lock { width: 46%; height: 46%; fill: #78868F; }
.tile svg.star { position: absolute; top: 6%; right: 6%; width: 30%; height: 30%; fill: #FFC93C; }
.tile.next svg.star { fill: #fff; }
```

- [ ] **Step 3: `main.js`**

Add to the imports:

```js
import { loadProgress, saveProgress, markWon } from './save.js';
```

Replace

```js
const flow = new Flow(input, { levels: LEVELS, onStart: levelBegan });
flow.start(0);
```

with

```js
// Progress, from the device's own storage. Reaching `localStorage` can itself
// throw in a locked-down browser, so even getting hold of it is guarded; a
// null store simply means a game with no memory, which save.js handles.
const store = (() => { try { return window.localStorage; } catch (_) { return null; } })();
let progress = loadProgress(store, LEVELS);

const flow = new Flow(input, {
  levels: LEVELS,
  onStart: levelBegan,
  onWin: (f) => {
    progress = markWon(progress, f.levelIndex, LEVELS);
    saveProgress(store, progress);
  },
});
// Level one is loaded behind the screens so the canvas always has a world to
// draw; nothing is simulated until a tile is chosen.
flow.start(0);
```

Replace the whole `start-button` click listener and `let playing = false;` with:

```js
let playing = false;
const startScreen = document.getElementById('start-screen');
const levelsScreen = document.getElementById('levels-screen');
const grid = document.getElementById('level-grid');

const STAR = '<svg class="star" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 L30 18 L45 19 L33 29 L37 44 L24 36 L11 44 L15 29 L3 19 L18 18 Z"/></svg>';
const LOCK = '<svg class="lock" viewBox="0 0 48 48" aria-hidden="true"><path d="M14 22 V16 a10 10 0 0 1 20 0 V22 H38 V44 H10 V22 Z M19 22 H29 V16 a5 5 0 0 0 -10 0 Z"/></svg>';

/**
 * Show level select, with the tiles rebuilt from the progress as it is now.
 * Play stops and every press in flight is dropped, so a thumb that was on the
 * right arrow does not come back holding it.
 */
function showLevels() {
  playing = false;
  input.setControls(false);
  grid.replaceChildren(...LEVELS.map((data, i) => {
    const b = document.createElement('button');
    const open = i < progress.unlocked;
    const done = progress.finished.includes(data.id);
    b.className = 'tile' + (open ? '' : ' locked') + (open && !done ? ' next' : '');
    b.dataset.index = String(i);
    if (open) {
      b.setAttribute('aria-label', `Level ${data.id}`);
      b.textContent = String(data.id);
      if (done) b.insertAdjacentHTML('beforeend', STAR);
      b.addEventListener('click', () => play(i));
    } else {
      b.setAttribute('aria-label', 'Locked');
      b.disabled = true;
      b.innerHTML = LOCK;
    }
    return b;
  }));
  levelsScreen.classList.remove('hidden');
}

/** Start the level at `i` and hide level select. */
function play(i) {
  levelsScreen.classList.add('hidden');
  flow.start(i);
  accumulator = 0;
  playing = true;
}

document.getElementById('start-button').addEventListener('click', () => {
  startScreen.classList.add('hidden');
  showLevels();
  // Fullscreen is a bonus, never a requirement: a browser that refuses must
  // still give a playable game.
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) {}
});
```

Replace the `hub-button` listener with one that serves both house buttons:

```js
// Relative, with no leading slash, because GitHub Pages serves this from a
// sub-folder and a leading slash silently looks at the top of the whole site.
for (const id of ['hub-button', 'levels-hub-button']) {
  document.getElementById(id).addEventListener('click', () => {
    window.location.href = '../../index.html';
  });
}
```

`accumulator` is declared with `let last = 0, accumulator = 0;` below these functions; `play` only runs on a click, after the whole module has run, so the reference is safe — but move `let last = 0, accumulator = 0;` above `showLevels` so the file reads top to bottom.

In the loop, replace

```js
    const tap = input.takeTap();
    if (tap && flow.tap(tap.x, tap.y, cssW, cssH) === 'levels') {
      ...
    }
```

with

```js
    const tap = input.takeTap();
    const action = input.takeAction();
    if ((tap && flow.tap(tap.x, tap.y, cssW, cssH) === 'levels') ||
        (action && flow.act(action) === 'levels')) {
      showLevels();
    }
```

and update the comment above it: taps go to the results panel, actions come from the corner buttons during play, and either can ask for level select.

- [ ] **Step 4: Check it loads**

Run: `node --check games/pushkar-ball/js/main.js` — silent.
Run: `node games/pushkar-ball/tests/run.mjs offline` — all ok except the known level-7 `finish` line.
Run: `node games/pushkar-ball/tests/run.mjs precache` — ok.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/index.html games/pushkar-ball/css/style.css games/pushkar-ball/js/main.js
git commit -m "Add level select as Pushkar Ball's main screen

Play opens a grid of tiles built from the level list and saved progress:
finished levels carry a star, the next is highlighted, the rest are
locked. A win is saved before moving on. The corner buttons and the
panel's grid both lead here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Browser suites

**Files:**
- Modify: `games/pushkar-ball/tests/browser/_helpers.mjs` (`boot`)
- Modify: `games/pushkar-ball/tests/browser/small.mjs`
- Create: `games/pushkar-ball/tests/browser/screens.mjs`

- [ ] **Step 1: `boot` goes through level select**

In `_helpers.mjs`, change the end of `boot` from

```js
  await ev("document.getElementById('start-button').click()");
  await sleep(500);
```

to

```js
  // Play opens level select; storage was just cleared, so only level one is
  // open, and its tile is the first.
  await ev("document.getElementById('start-button').click()");
  await sleep(300);
  await ev("document.querySelector('#level-grid .tile').click()");
  await sleep(500);
```

and update the doc comment to "start level one".

- [ ] **Step 2: `small.mjs` checks level select and the corner buttons**

After `await shoot(\`${W}x${H}-1-start\`);` add:

```js
  // Level select: the way back to the hub, and every tile, on screen.
  await ev("document.getElementById('start-button').click()");
  await sleep(400);
  const sel = await ev(`(() => {
    const on = (r) => r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    const hub = document.getElementById('levels-hub-button').getBoundingClientRect();
    const tiles = [...document.querySelectorAll('#level-grid .tile')].map((t) => t.getBoundingClientRect());
    const overlaps = tiles.some((r) => r.x < hub.right && r.right > hub.x && r.y < hub.bottom && r.bottom > hub.y);
    return { hub: on(hub), tiles: tiles.length, off: tiles.filter((r) => !on(r)).length, overlaps };
  })()`);
  if (!sel.hub) fail(`level select's hub button is off a ${W}x${H} screen`);
  if (sel.tiles === 0) fail(`level select shows no tiles on ${W}x${H}`);
  if (sel.off) fail(`${sel.off} of ${sel.tiles} level tiles are off a ${W}x${H} screen`);
  if (sel.overlaps) fail(`a level tile overlaps the hub button on ${W}x${H}`);
  console.log(`   level select: ${sel.tiles} tiles, all on screen`);
  await shoot(`${W}x${H}-2-levels`);
```

Change the in-play loop `for (const name of ['left', 'right', 'jump'])` to `for (const name of ['left', 'right', 'jump', 'restart', 'levels'])`, the log to "all five buttons on screen", and the playing screenshot's name to `${W}x${H}-3-playing`.

- [ ] **Step 3: `screens.mjs`**

Create `games/pushkar-ball/tests/browser/screens.mjs`:

```js
// The screens, walked the way a player walks them: opening, level select, a
// level, back to level select by the corner button, and restart. Every button
// position comes from ui.js or from the page itself — never written here.
import { connect, ballAt, makeHold } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'screens';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');
const { LEVELS } = await import('../../js/levels.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const W = 844, H = 390;
const shown = (id) => ev(`!document.getElementById('${id}').classList.contains('hidden')`);
const tiles = () => ev(`[...document.querySelectorAll('#level-grid .tile')].map((t) => ({
  disabled: t.disabled, text: t.textContent.trim(), star: !!t.querySelector('svg.star'),
  lock: !!t.querySelector('svg.lock'), next: t.classList.contains('next') }))`);
const tap = (b) => hold(b, 60);

async function open() {
  await send('Page.navigate', { url: URL });
  await sleep(1600);
}

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage' });
await open();

// --- 1. opening screen, then level select ---------------------------------
console.log('\n1. opening -> level select');
if (!await shown('start-screen')) fail('the opening screen is not shown first');
if (await shown('levels-screen')) fail('level select is shown before Play');
await ev("document.getElementById('start-button').click()");
await sleep(400);
if (!await shown('levels-screen')) fail('Play did not open level select');
let t = await tiles();
console.log(`   ${t.length} tiles: ${t.map((x) => x.lock ? 'locked' : x.text + (x.next ? '(next)' : '')).join(' ')}`);
if (t.length !== LEVELS.length) fail(`${t.length} tiles for ${LEVELS.length} levels`);
if (t[0].disabled || t[0].text !== String(LEVELS[0].id) || !t[0].next) fail('with nothing saved, level one is not the open, highlighted tile');
if (t.slice(1).some((x) => !x.disabled || !x.lock)) fail('with nothing saved, a tile other than level one is not locked');
await shoot('1-levels-fresh');

// --- 2. a locked tile does nothing ----------------------------------------
console.log('\n2. a locked tile');
await ev("document.querySelectorAll('#level-grid .tile')[1].click()");
await sleep(300);
if (!await shown('levels-screen')) fail('tapping a locked tile left level select');

// --- 3. level one, then restart --------------------------------------------
console.log('\n3. play, then restart');
await ev("document.querySelector('#level-grid .tile').click()");
await sleep(900);
if (await shown('levels-screen')) fail('tapping level one did not hide level select');
const atStart = await ballAt(ev);
await hold(Buttons.right(W, H), 900);
await sleep(200);
const rolled = await ballAt(ev);
await tap(Buttons.restart(W, H));
await sleep(500);
const back = await ballAt(ev);
console.log(`   ball at start ${atStart?.x.toFixed(0)}, after rolling ${rolled?.x.toFixed(0)}, after restart ${back?.x.toFixed(0)}`);
if (!atStart || !rolled || !back) fail('the ball was not visible at some point');
else {
  // The camera follows the ball, so screen x alone cannot say where it is in
  // the level; a restart snaps the camera back to the spawn, which puts the
  // ball where it was at the very start.
  if (Math.abs(rolled.x - atStart.x) < 5 && Math.abs(rolled.y - atStart.y) < 5) fail('holding right did not move the ball, so the restart check proves nothing');
  if (Math.hypot(back.x - atStart.x, back.y - atStart.y) > 12) fail(`after restart the ball is at ${back.x.toFixed(0)},${back.y.toFixed(0)}, not where it began at ${atStart.x.toFixed(0)},${atStart.y.toFixed(0)}`);
}
await shoot('2-playing');

// --- 4. the corner button goes to level select ----------------------------
console.log('\n4. corner button to level select');
await tap(Buttons.levels(W, H));
await sleep(400);
if (!await shown('levels-screen')) fail('the levels corner button did not open level select');
await shoot('3-levels-again');

// --- 5. saved progress opens the next level --------------------------------
console.log('\n5. saved progress');
await ev(`localStorage.setItem('pushkar-ball-save', JSON.stringify({ unlocked: 2, finished: [${LEVELS[0].id}] }))`);
await open();
await ev("document.getElementById('start-button').click()");
await sleep(400);
t = await tiles();
console.log(`   ${t.map((x) => x.lock ? 'locked' : x.text + (x.star ? '*' : '') + (x.next ? '(next)' : '')).join(' ')}`);
if (!t[0].star || t[0].next) fail('a finished level one does not carry a star');
if (t[1].disabled || !t[1].next) fail('with level one finished, level two is not the open, highlighted tile');
if (t.length > 2 && !t[2].disabled) fail('level three opened without level two being finished');
await shoot('4-levels-progress');

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nSCREENS WORK');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 4: Run the browser suites**

Run: `node games/pushkar-ball/tests/run.mjs browser` (long timeout).
Expected: `deflate`, `jump`, `roll`, `small`, `screens` all ok. If `roll`, `jump` or `deflate` now fail, check the new `boot` first — per CLAUDE.md, suspect the harness before the game. Look at `games/pushkar-ball/tests/screenshots/screens-*.png` and `small-*-2-levels.png` with the Read tool before reporting.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/tests/browser/_helpers.mjs games/pushkar-ball/tests/browser/small.mjs games/pushkar-ball/tests/browser/screens.mjs
git commit -m "Test level select and the corner buttons in the browser

boot now goes through level select. small checks the tiles and both
corner buttons fit 568x320 and 740x280; screens walks opening, level
select, restart, back to level select, and saved progress.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Look at it, docs, and both games' full suites

**Files:**
- Modify: `games/pushkar-ball/README.md`
- Modify: `games/pushkar-ball/tests/README.md`
- Modify: `docs/superpowers/specs/2026-09-15-level-select-and-corner-buttons-design.md`

- [ ] **Step 1: Look at it**

Read the screenshots from Task 5 at 568×320 and 740×280 (`small-568x320-2-levels.png`, `small-740x280-2-levels.png`, `small-*-3-playing.png`, `screens-*.png`). Judge: the tiles read as levels at a glance; the padlock and star are recognisable; the highlighted next tile stands out; the house does not crowd the tiles; the two corner buttons are recognisable (arrow, grid) and do not cover anything the player needs; nothing red but the ball. Fix only clear problems, in the owning file, each as its own commit with the reason.

- [ ] **Step 2: Game README**

In `games/pushkar-ball/README.md`:
- Replace the "What is here, and what is not" section's first three paragraphs with a short, true description of the game as it is now: seven levels, played from a level-select screen, levels open as earlier ones are finished, progress saved on the device (with private mode giving a fresh game, never an error). Keep the paragraph about failing being harmless, updated to hearts and checkpoints. Remove "a menu, a level-select screen, saved progress" from the "Deliberately absent" list; sound stays absent.
- In the Controls table add a row: `| Top right, two small round buttons | restart the level (curved arrow), level select (grid) |`, and a sentence after the table: the results panel has a curved arrow to play the level again and a grid to level select; level select has the house back to the hub.
- In "The modules" list, add `save.js` with one line: which levels are open and finished, in `localStorage` under `pushkar-ball-save`, storage handed in, every failure gives a fresh game.

- [ ] **Step 3: Tests README**

In the offline table add a `save` row summarising `offline/save.mjs`'s four checks. Update the `buttons` row (the two corner buttons, and the panel's grid instead of the house) and the `progress` row (corner actions, `onWin` before the next level starts) from the actual suites. In the browser table add a `screens` row from the actual suite, and update `small` (level select and the corner buttons).

- [ ] **Step 4: Mark the spec done**

Change the spec's first line to `# Level select, and restart / levels buttons during play — DONE` and add a two-line note under it naming this plan and anything that changed on the way (from the git log).

- [ ] **Step 5: Both games' full suites**

`sw.js` changed in Task 1, so both, fully:

Run: `node games/pushkar-ball/tests/run.mjs` — expected all suites ok except the known level-7 `finish` line.
Run: `node games/taras-town/tests/run.mjs` — expected all ok. Its two-browser multiplayer suites are slow and load-sensitive; if one fails at the end of the run, re-run it alone before believing it — and do not assume flakiness either (CLAUDE.md).

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/README.md games/pushkar-ball/tests/README.md docs/superpowers/specs/2026-09-15-level-select-and-corner-buttons-design.md
git commit -m "Document level select, saved progress and the corner buttons

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
