# Wiring, Buttons, Timers, Bridges and Levels 8-9 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalise Pushkar Ball's crate-only switch and gate into a small wiring system — plates, latched buttons and timers driving gates and bridges through AND/NOT logic, shown by coloured lamps and wires — and build levels 8 and 9, which teach it.

**Architecture:** A new DOM-free module, `js/circuits.js`, owns sender state (plate / button / timer), the AND/NOT evaluation, and the drawing of senders, lamps, wires and bridges (drawing takes `ctx` as a parameter, exactly as `enemies.js` and `hazards.js` already do). `js/levels.js` keeps the colliders — button posts go into the static segments, gates gain `needs` and a never-close-onto-a-body rule, and a new `makeBridge` adds a one-segment slab — and calls `updateSenders` once per step with a list of *pressers* (crates, plus the ball, which reports itself via `level.noteBall`). Level 6's old `switches`/`switchId` data is converted on load, so it does not change.

**Tech Stack:** Plain ES modules, no build, no dependencies. Tests are plain Node scripts (`node games/pushkar-ball/tests/run.mjs offline`) and headless-Chrome suites driven over the DevTools protocol.

**Spec:** `docs/superpowers/specs/2026-09-18-wiring-buttons-timers-bridges-design.md` (amended 2026-09-18 during planning — the 900 visibility rule, right-facing buttons, level 9 room B's redesign; read its italic notes). Roadmap: `docs/superpowers/specs/2026-09-18-mechanisms-and-enemies-roadmap.md`.

**Before starting, read** `CLAUDE.md` (the Pushkar Ball section, and the hub rules) and `games/pushkar-ball/README.md`. Things from them that bite in this plan:

- `config.js`, `physics.js`, `levels.js`, `player.js`, `camera.js` — and now `circuits.js` — must never touch `document`/`window`.
- Anything the ball can stand on owes `dx`, `dy`, `vx`, `vy` (a bridge, too).
- Levels are **appended** to `LEVELS`, never inserted.
- The ball is the only red thing on screen; the browser suites find it by hue. No new colour may be red.
- No test may contain a button coordinate; no test-only code in the game.
- `sw.js` is shared by both games: after touching it, **both** games' full suites must pass before any push. This plan does not push.

All commands run from the repository root, `d:/VIBE CODING/Taras-Town`.

---

## File map

| File | What changes |
|---|---|
| `games/pushkar-ball/js/config.js` | new `CIRCUIT` and `BRIDGE` blocks; `COLOURS.WIRE`, `COLOURS.LAMP_OFF`, `COLOURS.RING_TRACK` |
| `games/pushkar-ball/js/circuits.js` | **new** — senders, logic, reset, drawing |
| `games/pushkar-ball/js/levels.js` | import from circuits; senders + posts; gate `needs` + hold; `makeBridge`; `noteBall`, `resetSenders`; levels 8 and 9 appended |
| `games/pushkar-ball/js/player.js` | `respawn` resets senders; `update` calls `level.noteBall(this)` |
| `games/pushkar-ball/js/main.js` | draw wires/senders/receivers from circuits; delete `drawSwitches` |
| `games/pushkar-ball/css/style.css` | level grid: 5 columns, so 9 tiles are 2 rows |
| `sw.js` | precache `circuits.js`; bump cache name |
| `games/pushkar-ball/tests/offline/circuits.mjs` | **new** |
| `games/pushkar-ball/tests/offline/levels.mjs` | wiring checks |
| `games/pushkar-ball/tests/offline/finish.mjs` | routes 8 and 9; spare-time check; negative checks |
| `games/pushkar-ball/tests/browser/wiring.mjs` | **new** |
| `games/pushkar-ball/README.md`, `games/pushkar-ball/tests/README.md`, `CLAUDE.md` | docs |

---

### Task 1: Config numbers and colours

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (after the `GATE` block, ~line 235; and inside `COLOURS`, after `SWITCH_PLATE_EDGE`, ~line 696)

- [ ] **Step 1: Add the `CIRCUIT` and `BRIDGE` blocks** directly after the closing `},` of `GATE:`

```js
  // Wiring: buttons, timers, lamps and wires. A plate is SWITCH, above — it
  // keeps its old name because level six has always called it that.
  CIRCUIT: {
    // A button's stone post. 50 tall so it reads as a post and not a kerb,
    // and so a jump (which clears 131) hops it with room to spare.
    POST_W: 30,
    POST_H: 50,
    // How close to the capped side a presser has to come to press it. The
    // presser is stopped by the post itself, so this only has to be more
    // than floating-point dust.
    REACH: 4,
    CAP_R: 11,       // drawn radius of the cap, which is also the sender's lamp
    RING_W: 5,       // drawn width of a timer's ring
    LAMP_R: 8,       // drawn radius of one of a receiver's lamps
    LAMP_GAP: 22,    // between a receiver's lamps, centre to centre
    WIRE_W: 3,
    // A sender and every receiver it drives are at most this far apart
    // horizontally. VIEW_H is 540 on every screen, so a 568x320 phone sees
    // 540 * 568/320 = 958 units across; 900 is what fits both ends of a wire
    // on it at once. levels.mjs enforces it.
    SEE: 900,
    // Seconds of a timer left at which a bridge it drives starts to shake.
    WARN: 1.0,
  },
  BRIDGE: {
    OPEN_TIME: 0.8,  // seconds to slide fully out, or fully back in
    H: 18,           // drawn thickness — only the top is solid
    SHAKE: 2,        // drawn wobble while warning, in units
  },
```

- [ ] **Step 2: Add the colours** directly after `SWITCH_PLATE_EDGE: '#3E474D',`

```js
    // One colour per sender, in the order a level lists them, so a lamp on a
    // door matches the button that lights it. Checked against IS_BALL in
    // tests/browser/_helpers.mjs: the blue, purple and green have r < b, and
    // the yellow's green channel is far too high — none can be taken for the
    // ball. Told apart by lightness as well as hue.
    WIRE: ['#2F80ED', '#F2C94C', '#9B51E0', '#27AE60'],
    LAMP_OFF: '#4A5358',
    RING_TRACK: '#E8EDF0',
```

- [ ] **Step 3: Confirm nothing broke**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite passes (only numbers were added).

- [ ] **Step 4: Commit**

```bash
git add games/pushkar-ball/js/config.js
git commit -m "Add wiring and bridge numbers and colours to Pushkar Ball's config"
```

---

### Task 2: `circuits.js` — senders and logic, tested in isolation

**Files:**
- Create: `games/pushkar-ball/js/circuits.js`
- Create: `games/pushkar-ball/tests/offline/circuits.mjs`

- [ ] **Step 1: Write the failing test** — `games/pushkar-ball/tests/offline/circuits.mjs`

```js
// Wiring: what presses what, and what a door needs.
//
// Part 1 is the logic on its own, with pressers made by hand — no level, no
// ball. Later parts (added in Tasks 3 and 4) drive a real ball on a real
// level.
const { CONFIG } = await import('../../js/config.js');
const C = await import('../../js/circuits.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const STEP = CONFIG.STEP;
const P = CONFIG.CIRCUIT;

const senders = (list) => list.map((d, i) => C.makeSender(d, i, CONFIG));
const tick = (ss, pressers, seconds = STEP) => {
  const n = Math.max(1, Math.round(seconds / STEP));
  for (let i = 0; i < n; i++) C.updateSenders(ss, STEP, pressers, CONFIG);
};
// A presser standing just touching a left-facing post at x=500 on y=760.
const touchLeft = { x: 500 - 40, y: 720, w: 40, h: 40, heavy: false, resting: true };
const away = { x: 100, y: 720, w: 40, h: 40, heavy: false, resting: true };

console.log('\n1. a plate is weighed, never hit');
{
  const ss = senders([{ id: 'p', kind: 'plate', x: 500, y: 760, w: 110 }]);
  tick(ss, [{ x: 520, y: 720, w: 40, h: 40, heavy: false, resting: true }]);
  if (ss[0].pressed) fail('the ball pressed a plate');
  tick(ss, [{ x: 505, y: 660, w: 100, h: 100, heavy: true, resting: false }]);
  if (ss[0].pressed) fail('a crate still falling pressed a plate');
  tick(ss, [{ x: 505, y: 660, w: 100, h: 100, heavy: true, resting: true }]);
  if (!ss[0].pressed) fail('a crate resting on a plate did not press it');
  tick(ss, []);
  if (ss[0].pressed) fail('a plate stayed pressed with nothing on it');
}

console.log('\n2. a button latches');
{
  const ss = senders([{ id: 'b', kind: 'button', x: 500, y: 760, face: 'left' }]);
  tick(ss, [away]);
  if (ss[0].pressed) fail('a button was pressed by something nowhere near it');
  tick(ss, [touchLeft]);
  if (!ss[0].pressed) fail('touching a left button on its left did not press it');
  tick(ss, [away], 5);
  if (!ss[0].pressed) fail('a button let go once nothing touched it');
}

console.log('\n3. only the capped side presses');
{
  const ss = senders([{ id: 'b', kind: 'button', x: 500, y: 760, face: 'right' }]);
  tick(ss, [touchLeft]);
  if (ss[0].pressed) fail('a right-facing button was pressed from its left, plain side');
  tick(ss, [{ x: 500 + P.POST_W, y: 720, w: 40, h: 40, heavy: false, resting: true }]);
  if (!ss[0].pressed) fail('a right-facing button was not pressed from its right');
}

console.log('\n4. a timer runs out after exactly its time, and only a new hit refills it');
{
  const ss = senders([{ id: 't', kind: 'timer', x: 500, y: 760, face: 'left', time: 2 }]);
  tick(ss, [touchLeft]);                       // hit
  // Keep touching: that is NOT a new hit, so the ring drains anyway.
  let steps = 1;
  while (ss[0].pressed && steps < 1000) { tick(ss, [touchLeft]); steps++; }
  const ran = steps * STEP;
  console.log(`   a timer of 2s held against went off after ${ran.toFixed(3)}s`);
  // Two and a half steps of slack: the hit step itself, and floating-point
  // dust in 240 subtractions of 1/120 that can leave one step's sliver.
  if (Math.abs(ran - 2) > STEP * 2.5) fail(`a 2s timer ran for ${ran.toFixed(3)}s while a presser leaned on it`);

  tick(ss, [away]);
  tick(ss, [touchLeft]);                       // a fresh hit
  if (!ss[0].pressed || Math.abs(ss[0].left - 2) > 1e-9) fail('a fresh hit did not start the timer full');
  tick(ss, [away], 1);
  const before = ss[0].left;
  tick(ss, [touchLeft]);                       // another fresh hit while running
  if (ss[0].left <= before) fail(`a fresh hit while running did not refill it (${before.toFixed(2)} -> ${ss[0].left.toFixed(2)})`);
}

console.log('\n5. AND and NOT');
{
  const ss = senders([
    { id: 'a', kind: 'button', x: 500, y: 760, face: 'left' },
    { id: 'b', kind: 'button', x: 900, y: 760, face: 'left' },
  ]);
  if (C.powered(['a', 'b'], ss)) fail('AND powered with nothing pressed');
  ss[0].pressed = true;
  if (C.powered(['a', 'b'], ss)) fail('AND powered with one of two pressed');
  ss[1].pressed = true;
  if (!C.powered(['a', 'b'], ss)) fail('AND not powered with both pressed');
  if (C.powered(['!a'], ss)) fail('NOT powered while its sender is on');
  ss[0].pressed = false;
  if (!C.powered(['!a'], ss)) fail('NOT not powered while its sender is off');
  if (!C.lampLit('!a', ss) || C.lampLit('a', ss)) fail('lampLit disagrees with powered');
  if (C.powered(['nobody'], ss)) fail('a need naming no sender powered its receiver');
  if (C.powered([], ss)) fail('a receiver needing nothing is powered — it should stay shut');
}

console.log('\n6. reset');
{
  const ss = senders([
    { id: 'b', kind: 'button', x: 500, y: 760, face: 'left' },
    { id: 't', kind: 'timer', x: 900, y: 760, face: 'left', time: 3 },
  ]);
  ss[0].pressed = true; ss[1].pressed = true; ss[1].left = 2;
  C.resetSenders(ss);
  if (ss[0].pressed || ss[1].pressed || ss[1].left !== 0) fail('reset left a sender on');
}

console.log('\n7. warning');
{
  const ss = senders([{ id: 't', kind: 'timer', x: 500, y: 760, face: 'left', time: 3 }]);
  ss[0].pressed = true; ss[0].left = 2;
  if (C.warning(['t'], ss, CONFIG)) fail('warned with 2s left');
  ss[0].left = P.WARN - 0.1;
  if (!C.warning(['t'], ss, CONFIG)) fail(`did not warn with ${P.WARN - 0.1}s left`);
  if (C.warning(['!t'], ss, CONFIG)) fail('an inverted input warned — it is about to turn ON, not off');
}

console.log('\n8. colours come from the list, in order');
{
  const ss = senders([
    { id: 'a', kind: 'button', x: 500, y: 760 },
    { id: 'b', kind: 'plate', x: 900, y: 760, w: 110 },
  ]);
  if (ss[0].colour !== CONFIG.COLOURS.WIRE[0] || ss[1].colour !== CONFIG.COLOURS.WIRE[1]) fail('sender colours are not the WIRE list in order');
  if (ss[0].face !== 'left') fail('a button with no face did not default to left');
  let threw = false;
  try { senders([{ id: 'x', kind: 'lever', x: 0, y: 0 }]); } catch (_) { threw = true; }
  if (!threw) fail('an unknown sender kind was accepted silently');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nWIRING WORKS');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node games/pushkar-ball/tests/run.mjs circuits`
Expected: FAIL — cannot find module `circuits.js`.

- [ ] **Step 3: Write `games/pushkar-ball/js/circuits.js`** (logic only; drawing comes in Task 5)

```js
/**
 * circuits.js — what drives what.
 *
 * A SENDER is something the world presses: a plate (held down only while
 * something heavy rests on it — level six's switch), a button (pressed by
 * anything that hits its capped side, and stays pressed), or a timer (a
 * button that lets go again after `time` seconds). A RECEIVER — a gate or a
 * bridge, both built in levels.js because they are colliders — lists what it
 * `needs`: every id listed must be on, and an id written `!id` must be off.
 * That is the whole language, AND and NOT; see the spec for why nothing more.
 *
 * Something that presses is a PRESSER: a box `{ x, y, w, h, heavy, resting }`.
 * Every presser can hit a button; a plate wants one that is heavy and resting.
 * The level builds the list each step — its crates, and the ball, which
 * reports itself through `level.noteBall` — and later enemies join the same
 * list without anything here changing.
 *
 * Never touches the DOM. The drawing functions at the bottom take a canvas
 * context as a parameter, the way enemies.js and hazards.js already do, so
 * importing this file into Node is safe.
 */

const KINDS = ['plate', 'button', 'timer'];

/**
 * Move `value` toward `target` at `rate` (a fraction of the value's full
 * range per second) over `dt`, clamping so it never overshoots and holding
 * exactly AT `target` once reached — a two-way ternary
 * (`target > value ? increase : decrease`) oscillates forever the instant
 * `value` hits `target` exactly, since `target > target` is false and falls
 * into the decrease branch. Shared by a gate's and a bridge's `openT`, a
 * beam, and every sender's cosmetic `animT`, which hit exactly this bug once
 * already before being unified. Moved here from levels.js so that both
 * files can use one copy.
 */
export function rampToward(value, target, dt, rate) {
  const step = dt * rate;
  if (target > value) return Math.min(target, value + step);
  if (target < value) return Math.max(target, value - step);
  return value;
}

/**
 * A sender, from its level data. `index` is its place in the level's list,
 * and picks its colour, so a level's first sender is always the first
 * colour. An unknown kind throws: a sender that silently did nothing would
 * be a door a child can never open, with nothing anywhere saying why.
 */
export function makeSender(d, index, cfg) {
  if (!KINDS.includes(d.kind)) throw new Error(`sender '${d.id}' has unknown kind '${d.kind}'`);
  const W = cfg.COLOURS.WIRE;
  return {
    id: d.id,
    kind: d.kind,
    x: d.x,
    y: d.y,                         // ground anchor, like a checkpoint's
    w: d.kind === 'plate' ? d.w : cfg.CIRCUIT.POST_W,
    face: d.face || 'left',
    time: d.time || 0,
    colour: W[index % W.length],
    pressed: false,
    left: 0,                        // timer only: seconds of power left
    touched: false,                 // was anything touching it last step
    animT: 0,                       // cosmetic: how far the drawn press has eased
  };
}

/** A button's or timer's solid stone post, as a box. Plates have none. */
export function postBox(s, cfg) {
  const P = cfg.CIRCUIT;
  return { x: s.x, y: s.y - P.POST_H, w: P.POST_W, h: P.POST_H };
}

/** The thin strip beside the capped side that a presser has to reach. */
export function hitZone(s, cfg) {
  const P = cfg.CIRCUIT;
  const x = s.face === 'right' ? s.x + P.POST_W : s.x - P.REACH;
  return { x, y: s.y - P.POST_H, w: P.REACH, h: P.POST_H };
}

/** Where the cap — which is also the sender's lamp — is drawn. */
export function capCentre(s, cfg) {
  const P = cfg.CIRCUIT;
  return { x: s.face === 'right' ? s.x + P.POST_W : s.x, y: s.y - P.POST_H / 2 };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * One step of every sender.
 *
 * A plate is recomputed from scratch each step: pressed exactly while a
 * heavy, resting presser overlaps it horizontally — the same test level six's
 * switch has always used, so it behaves exactly as it did.
 *
 * A button or a timer is pressed by a HIT: the step on which something
 * starts touching its capped side. Not by touching — a ball resting against
 * a timer would otherwise hold it full for ever and a timed door would never
 * shut.
 */
export function updateSenders(senders, dt, pressers, cfg) {
  for (const s of senders) {
    if (s.kind === 'plate') {
      s.pressed = pressers.some((p) => p.heavy && p.resting && p.x < s.x + s.w && p.x + p.w > s.x);
    } else {
      const zone = hitZone(s, cfg);
      const touching = pressers.some((p) => overlaps(p, zone));
      const hit = touching && !s.touched;
      s.touched = touching;
      if (hit) {
        s.pressed = true;
        if (s.kind === 'timer') s.left = s.time;
      } else if (s.kind === 'timer' && s.pressed) {
        s.left = Math.max(0, s.left - dt);
        if (s.left === 0) s.pressed = false;
      }
    }
    s.animT = rampToward(s.animT, s.pressed ? 1 : 0, dt, 1 / cfg.SWITCH.PRESS_TIME);
  }
}

/** Put every button and timer back as the level declared it. Plates need nothing: they are recomputed every step. */
export function resetSenders(senders) {
  for (const s of senders) {
    if (s.kind === 'plate') continue;
    s.pressed = false;
    s.left = 0;
    s.touched = false;
  }
}

/** `'a'` → `{ id: 'a', invert: false }`; `'!a'` → `{ id: 'a', invert: true }`. */
export function parseNeed(n) {
  return n.startsWith('!') ? { id: n.slice(1), invert: true } : { id: n, invert: false };
}

/**
 * Is this one lamp on a receiver lit? An ordinary lamp while its sender is on;
 * an inverted one (drawn as a ring) while its sender is off. A need naming no
 * sender counts its sender as off, so level six with its switch removed has a
 * gate that simply never opens — which is what finish.mjs's check 3c relies on.
 */
export function lampLit(need, senders) {
  const { id, invert } = parseNeed(need);
  const s = senders.find((x) => x.id === id);
  const on = !!(s && s.pressed);
  return invert ? !on : on;
}

/** Every lamp lit. A receiver that needs nothing stays shut. */
export function powered(needs, senders) {
  return needs.length > 0 && needs.every((n) => lampLit(n, senders));
}

/**
 * Is a timer this receiver needs ON about to run out? Only ordinary inputs
 * count: an inverted one running out turns the receiver's lamp on, not off.
 */
export function warning(needs, senders, cfg) {
  return needs.some((n) => {
    const { id, invert } = parseNeed(n);
    if (invert) return false;
    const s = senders.find((x) => x.id === id);
    return !!(s && s.kind === 'timer' && s.pressed && s.left < cfg.CIRCUIT.WARN);
  });
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node games/pushkar-ball/tests/run.mjs circuits`
Expected: `WIRING WORKS`.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/js/circuits.js games/pushkar-ball/tests/offline/circuits.mjs
git commit -m "Add circuits.js: plates, buttons, timers and AND/NOT needs"
```

---

### Task 3: Wire senders into the level and the ball; gates that need, and hold

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` — imports (top), `rampToward` (delete, ~lines 953-969), `makeGate` (~971-1017), `Level` constructor (~1300-1360), `Level.update` (~1416-1430), `solidsFor`/`near` unchanged here
- Modify: `games/pushkar-ball/js/player.js` — `respawn` (~line 82) and end of `update` (~line 442)
- Test: `games/pushkar-ball/tests/offline/circuits.mjs` (append parts 9-13)

- [ ] **Step 1: Append the failing integration tests** to `circuits.mjs`, *before* its final two lines (`console.log(failures ? ...` and `process.exit`)

```js
// --- Part 2: a real ball on a real level ----------------------------------
const { Ball } = await import('../../js/player.js');
const { loadLevel, LEVELS } = await import('../../js/levels.js');
const GROUND = 760;
const stage = (extra) => loadLevel({
  id: 96, theme: 'hills',
  bounds: { w: 3000, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, GROUND], [2960, GROUND]]],
  boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 }],
  platforms: [],
  ...extra,
});
const drive = (ball, level, want, seconds) => {
  const input = { left: !!want.left, right: !!want.right, takeJump: () => false };
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    level.update(STEP);
    ball.update(STEP, input, level);
  }
};

console.log('\n9. the ball rolls into a button, and the gate it drives opens');
{
  const level = stage({
    senders: [{ id: 'a', kind: 'button', x: 800, y: GROUND, face: 'left' }],
    gates: [{ x: 1200, y: GROUND - 200, w: 40, h: 200, needs: ['a'] }],
  });
  const ball = new Ball(400, GROUND - 20);
  drive(ball, level, { right: true }, 3);
  const s = level.senders[0];
  console.log(`   pressed=${s.pressed}, ball stopped at x=${ball.x.toFixed(1)}, gate openT=${level.gates[0].openT.toFixed(2)}`);
  if (!s.pressed) fail('rolling into a left button did not press it');
  if (ball.x > 800 - ball.r + 1) fail(`the ball went through the post — it is at ${ball.x.toFixed(1)}`);
  if (level.gates[0].openT !== 1) fail('the gate did not open fully');
}

console.log('\n10. a crate pushed into a button presses it');
{
  const level = stage({
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 },
            { x: 500, y: GROUND - 100, w: 100, h: 100, movable: true }],
    senders: [{ id: 'a', kind: 'button', x: 800, y: GROUND, face: 'left' }],
  });
  const ball = new Ball(420, GROUND - 20);
  drive(ball, level, { right: true }, 4);
  const crate = level.crates[0];
  console.log(`   crate stopped at x=${crate.x.toFixed(1)} (post at 800), pressed=${level.senders[0].pressed}`);
  if (crate.x + crate.w > 800 + 0.5) fail('the crate was pushed into the post');
  if (!level.senders[0].pressed) fail('the crate against the button did not press it');
}

console.log('\n11. a respawn puts buttons back');
{
  const level = stage({ senders: [{ id: 'a', kind: 'button', x: 800, y: GROUND, face: 'left' }] });
  const ball = new Ball(400, GROUND - 20);
  drive(ball, level, { right: true }, 3);
  if (!level.senders[0].pressed) fail('setup: the button was never pressed');
  ball.respawn(level);
  if (level.senders[0].pressed) fail('a respawn left a button pressed');
}

console.log('\n12. a closing gate does not come down on the ball');
{
  const level = stage({
    senders: [{ id: 't', kind: 'timer', x: 800, y: GROUND, face: 'left', time: 1.5 }],
    gates: [{ x: 1200, y: GROUND - 200, w: 40, h: 200, needs: ['t'] }],
  });
  const gate = level.gates[0];
  const ball = new Ball(400, GROUND - 20);
  // Pressed about 1s in, so at 2s the timer still has ~0.5s and the gate is
  // fully open when the ball is put under it.
  drive(ball, level, { right: true }, 2);
  if (!level.senders[0].pressed || gate.openT !== 1) fail(`setup: timer pressed=${level.senders[0].pressed}, gate openT=${gate.openT}`);
  ball.x = 1220; ball.y = GROUND - 20; ball.vx = 0; ball.vy = 0;   // stand under the gate
  drive(ball, level, {}, 2);                        // the timer runs out meanwhile
  console.log(`   ball under the gate after the timer ran out: openT=${gate.openT.toFixed(2)}, ball y=${ball.y.toFixed(1)}`);
  if (gate.openT < 0.99) fail(`the gate came down on the ball (openT ${gate.openT.toFixed(2)})`);
  ball.x = 1500;
  drive(ball, level, {}, CONFIG.GATE.OPEN_TIME + 0.2);
  if (gate.openT !== 0) fail(`once the ball moved away the gate did not finish closing (openT ${gate.openT})`);
}

console.log('\n13. level six still loads its old switch as a plate');
{
  const level = loadLevel(LEVELS.find((l) => l.id === 6));
  const s = level.senders;
  if (s.length !== 1 || s[0].kind !== 'plate' || s[0].id !== 'gate1') fail(`level 6's senders are ${JSON.stringify(s.map((x) => [x.id, x.kind]))}`);
  if (level.switches[0] !== s[0]) fail('level.switches is not the plate sender itself');
  if (JSON.stringify(level.gates[0].needs) !== '["gate1"]') fail(`level 6's gate needs ${JSON.stringify(level.gates[0].needs)}`);
}
```

- [ ] **Step 2: Run to see it fail**

Run: `node games/pushkar-ball/tests/run.mjs circuits`
Expected: FAIL at part 9 (`level.senders` is undefined / TypeError).

- [ ] **Step 3: In `levels.js`, import from circuits and delete the local `rampToward`**

Add below the existing imports at the top of `games/pushkar-ball/js/levels.js`:

```js
// The wiring: senders and the needs logic. circuits.js imports nothing, so
// this adds no cycle and nothing that touches the DOM.
import { makeSender, postBox, updateSenders, resetSenders as clearSenders, powered, warning, rampToward } from './circuits.js';
```

Delete the whole `function rampToward(...) { ... }` in `levels.js` together with its doc comment (it now lives, with the same comment, in `circuits.js`). Every existing call keeps working through the import.

- [ ] **Step 4: Give gates `needs` and the hold rule** — replace `makeGate` in `levels.js` with:

```js
/**
 * A gate: a solid box like a wall, except its position slides straight up
 * to clear a passage while it is powered, and back down when it isn't.
 * `g.y`/`g.h` are the CLOSED position and height — the same "y is the top,
 * h reaches down to the ground" convention a plain stone wall already uses —
 * and `gate.y` is where it is RIGHT NOW, sliding from `g.y` (closed) up to
 * `g.y - g.h` (fully open, its old footprint entirely clear).
 *
 * `g.needs` is what powers it — see circuits.js. A closing gate never comes
 * down onto anything: while `blocked`, it holds where it is and finishes
 * closing once the way is clear. A timer can run out with the ball halfway
 * through, and a door that lands on him is not a door he trusts again.
 *
 * Owes the same four carrier fields a crate or a moving platform does: its
 * top is something the ball could be standing on while it swings, and a
 * rider with no dx/dy/vx/vy to add is exactly the NaN bug CLAUDE.md already
 * warns about.
 */
function makeGate(g) {
  const gate = {
    ...g,
    kind: 'gate',
    x: g.x, y: g.y,
    openT: 0,          // 0 closed, 1 fully open
    dx: 0, dy: 0,
    vx: 0, vy: 0,
    segments: [],

    update(dt, isPowered, blocked) {
      const wasY = gate.y;
      const target = isPowered ? 1 : (blocked ? gate.openT : 0);
      gate.openT = rampToward(gate.openT, target, dt, 1 / CONFIG.GATE.OPEN_TIME);
      const ny = g.y - g.h * gate.openT;
      gate.dy = ny - wasY;
      gate.vy = dt > 0 ? gate.dy / dt : 0;
      gate.y = ny;
      gate.segments = boxSegments(gate.x, gate.y, g.w, g.h);
      // So a contact can be traced back to the gate that made it, the same
      // mechanism movers and crates already use.
      for (const s of gate.segments) s.owner = gate;
    },

    /**
     * Is this presser box standing in the gate's CLOSED footprint? Inset by
     * 2 units either side, so a ball or crate merely resting against the
     * gate's face — flush, give or take floating-point dust — is not "under"
     * it and cannot hold a half-open gate open by leaning.
     */
    isUnder(p) {
      return p.x < g.x + g.w - 2 && p.x + p.w > g.x + 2 && p.y < g.y + g.h && p.y + p.h > g.y;
    },

    overlaps(x, y, r) {
      return x + r > gate.x && x - r < gate.x + g.w && y + r > gate.y && y - r < gate.y + g.h;
    },
  };
  gate.update(0, false, false);
  // update(0, ...) reports a delta from the gate's declared position to its
  // position at t=0, which is not movement anybody rode.
  gate.dy = 0; gate.vy = 0;
  return gate;
}
```

- [ ] **Step 5: Build senders and posts in the `Level` constructor**

In the constructor, directly **after** the line `for (const b of this.walls) segs.push(...boxSegments(b.x, b.y, b.w, b.h));`, add:

```js
    // Senders. Level six's old `switches` are plates by another name and are
    // read as exactly that, first, so its data never has to change. A
    // button's or timer's post is stone and never moves, so it is baked into
    // the static segments like any wall — which is also what stops a crate
    // being pushed through one. Posts are deliberately NOT in `this.walls`:
    // finish.mjs's generic runner hops every low wall it sees, and a button
    // is something a route has to press, not hop.
    const senderData = [
      ...(data.switches || []).map((s) => ({ ...s, kind: 'plate' })),
      ...(data.senders || []),
    ];
    this.senders = senderData.map((d, i) => makeSender(d, i, CONFIG));
    for (const s of this.senders) {
      if (s.kind === 'plate') continue;
      const p = postBox(s, CONFIG);
      segs.push(...boxSegments(p.x, p.y, p.w, p.h));
    }
    // Kept under its old name for the plates alone — the same objects, not
    // copies — because level six's tests and route have always asked for it.
    this.switches = this.senders.filter((s) => s.kind === 'plate');
    // The ball tells the level where it is each step (see noteBall), so the
    // wiring can count it as a presser. Null until the first step.
    this.ball = null;
```

Then **delete** the old block that built switches (the comment beginning `// A switch is not a collider either` and the line `this.switches = (data.switches || []).map(...)`), and **replace** the gates line with:

```js
    // Gates ARE colliders, but dynamic ones — they move, so like crates and
    // movers they must stay OUT of the static grid built below. An old
    // `switchId` becomes `needs: [switchId]`.
    this.gates = (data.gates || []).map((g) => makeGate({ ...g, needs: g.needs || (g.switchId ? [g.switchId] : []) }));
```

- [ ] **Step 6: Replace the switch/gate block in `Level.update`**

Replace the whole block from the comment `// A switch is pressed by any crate resting on it` through the end of `for (const g of this.gates) { ... }` with:

```js
    // Wiring. Every presser is a box. Crates are this step's — they were
    // updated above — and the ball is last step's, the same one-step lag a
    // rider on a platform already lives with. A deflating ball presses
    // nothing: it is not really there.
    const pressers = this.crates.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, heavy: true, resting: c.grounded }));
    const b = this.ball;
    if (b && !b.dying) pressers.push({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2, heavy: false, resting: b.grounded });
    updateSenders(this.senders, dt, pressers, CONFIG);
    for (const g of this.gates) g.update(dt, powered(g.needs, this.senders), pressers.some((p) => g.isUnder(p)));
```

- [ ] **Step 7: Add `noteBall` and `resetSenders` to `Level`** — directly before `solidsFor(crate) {`:

```js
  /**
   * The ball saying where it is. Called by player.js once per step, after it
   * has moved, the same way it already asks `takeCheckpoint` — so the wiring
   * can count the ball as a presser on the next `update`, with no caller
   * anywhere having to pass the ball in.
   */
  noteBall(ball) {
    this.ball = ball;
  }

  /** Every button and timer back as the level declared it. Called on every respawn. */
  resetSenders() {
    clearSenders(this.senders);
  }
```

- [ ] **Step 8: Call both from `player.js`**

In `respawn(level)`, directly after `this.iframe = 0;` add:

```js
    // A fall or a run-out puts every button and timer back as the level
    // declared it, so a room is never left half-solved in a state nobody
    // chose. levels.mjs makes sure no checkpoint sits between a button and
    // the door it opens, which is what makes this safe.
    if (level) level.resetSenders();
```

In `update`, directly after the checkpoints block (after the closing `}` of `if (reached) { ... }`) add:

```js
    // --- tell the wiring where we are --------------------------------------
    level.noteBall(this);
```

- [ ] **Step 9: Run the new tests and the old switch tests**

Run: `node games/pushkar-ball/tests/run.mjs circuits` then `node games/pushkar-ball/tests/run.mjs switches`
Expected: both pass. If `switches` fails, the conversion changed level 6's behaviour — fix the conversion, never the switches test.

- [ ] **Step 10: Run all offline suites**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all pass (`finish` included — level 6 must still finish, and its check 3c must still find the gate shut with `switches: []`).

- [ ] **Step 11: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/js/player.js games/pushkar-ball/tests/offline/circuits.mjs
git commit -m "Drive gates from senders: buttons and timers with posts, needs, and a gate that never closes on the ball"
```

---

### Task 4: Bridges

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` — new `makeBridge` after `makeGate`; constructor; `update`; `solidsFor`; `near`
- Test: `games/pushkar-ball/tests/offline/circuits.mjs` (append parts 14-16)

- [ ] **Step 1: Append failing bridge tests** (again before the final two lines)

```js
console.log('\n14. a bridge carries the ball across a gap at full speed');
{
  const level = stage({
    ground: [[[40, GROUND], [1000, GROUND]], [[1420, GROUND], [2960, GROUND]]],
    senders: [{ id: 'b', kind: 'button', x: 300, y: GROUND, face: 'right' }],
    bridges: [{ x: 1000, y: GROUND, w: 420, dir: 1, needs: ['b'] }],
  });
  level.senders[0].pressed = true;
  drive(new Ball(600, GROUND - 20), level, {}, CONFIG.BRIDGE.OPEN_TIME + 0.1);
  const br = level.bridges[0];
  if (br.openT !== 1) fail(`the bridge is not fully out (openT ${br.openT})`);
  if (br.segments.length !== 1 || br.segments[0].ny >= 0) fail('a bridge must be exactly one segment, solid side up');
  const ball = new Ball(600, GROUND - 20);
  let lowest = 0, minVx = Infinity;
  const input = { left: false, right: true, takeJump: () => false };
  for (let i = 0; i < Math.round(3 / STEP); i++) {
    level.update(STEP);
    ball.update(STEP, input, level);
    if (ball.x > 950 && ball.x < 1470) { lowest = Math.max(lowest, ball.y); minVx = Math.min(minVx, ball.vx); }
    if (![ball.x, ball.y, ball.vx, ball.vy].every(Number.isFinite)) { fail('the ball went NaN on the bridge'); break; }
  }
  console.log(`   crossing: lowest y=${lowest.toFixed(1)}, slowest vx=${minVx.toFixed(0)}, ended at x=${ball.x.toFixed(0)}`);
  if (ball.x < 1500) fail('the ball did not get across the bridge');
  if (lowest > GROUND - 20 + 2) fail(`the ball dipped to y=${lowest.toFixed(1)} crossing — a bump at a joint`);
  if (minVx < CONFIG.MAX_SPEED * 0.9) fail(`the ball slowed to ${minVx.toFixed(0)} crossing — it caught on a joint`);
}

console.log('\n15. an unpowered bridge withdraws from under the ball, and warns first');
{
  const level = stage({
    ground: [[[40, GROUND], [1000, GROUND]], [[1420, GROUND], [2960, GROUND]]],
    senders: [{ id: 't', kind: 'timer', x: 300, y: GROUND, face: 'right', time: 1.5 }],
    bridges: [{ x: 1000, y: GROUND, w: 420, dir: 1, needs: ['t'] }],
  });
  const t = level.senders[0];
  // Get the bridge fully out first, with time to spare, before the ball is
  // put on it — at t=0 there is no bridge to stand on.
  t.pressed = true; t.left = 10;
  for (let i = 0; i < Math.round(1 / STEP); i++) level.update(STEP);
  t.left = 1.5;
  const ball = new Ball(1300, GROUND - 20);
  let warned = false;
  const input = { left: false, right: false, takeJump: () => false };
  for (let i = 0; i < Math.round(1.4 / STEP); i++) {
    level.update(STEP);
    ball.update(STEP, input, level);
    if (level.bridges[0].warn) warned = true;
  }
  if (!warned) fail('the bridge never warned in its last second');
  if (ball.y > GROUND - 20 + 1) fail('the ball fell before the timer ran out');
  drive(ball, level, {}, 1.5);
  console.log(`   after the timer: ball y=${ball.y.toFixed(0)}, deaths=${ball.deaths}`);
  if (ball.y < GROUND + 50 && !ball.deaths) fail('the bridge did not withdraw from under the ball');
}

console.log('\n16. a crate on a withdrawing bridge falls and comes back');
{
  const level = stage({
    ground: [[[40, GROUND], [1000, GROUND]], [[1420, GROUND], [2960, GROUND]]],
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 },
            { x: 1020, y: 200, w: 100, h: 100, movable: true }],
    senders: [{ id: 'b', kind: 'button', x: 300, y: GROUND, face: 'right' }],
    bridges: [{ x: 1000, y: GROUND, w: 420, dir: 1, needs: ['b'] }],
  });
  level.senders[0].pressed = true;
  for (let i = 0; i < Math.round(2 / STEP); i++) level.update(STEP);
  const crate = level.crates[0];
  if (!crate.grounded || Math.abs(crate.y - (GROUND - 100)) > 1) fail(`setup: the crate is not resting on the bridge (y=${crate.y.toFixed(1)})`);
  level.senders[0].pressed = false;
  for (let i = 0; i < Math.round(3 / STEP); i++) level.update(STEP);
  console.log(`   crate falls=${crate.falls}, x=${crate.x}`);
  if (crate.falls < 1) fail('a crate on a withdrawn bridge did not fall and return');
  if (crate.x !== 1020) fail(`the returned crate is at x=${crate.x}, not where the level put it`);
}
```

- [ ] **Step 2: Run to see them fail**

Run: `node games/pushkar-ball/tests/run.mjs circuits`
Expected: FAIL at part 14 (`level.bridges` undefined).

- [ ] **Step 3: Add `makeBridge`** in `levels.js`, directly after `makeGate`. Add `segment` to the existing `physics.js` import at the top of `levels.js` if it is not already imported.

```js
/**
 * A bridge: a stone slab that slides out of the ground's edge across a gap
 * while powered, and back in when not. `x, y` is the edge it slides from,
 * `dir` which way (1 right, -1 left), `w` how far.
 *
 * Only its TOP is solid — one segment, authored left to right like ground so
 * its solid side is up, and colinear with the ground it slides from, so
 * rolling on is exactly as smooth as rolling along. A box would put a
 * vertical face at the joint for the ball to catch on.
 *
 * It does not carry what stands on it: the slab slides out from under, it
 * does not drag the ball along, so `dx`/`vx` stay 0. It still owes all four
 * carrier fields, because the ball records it as its platform, and
 * player.js adds `platform.dx` without asking — the crate NaN bug in
 * CLAUDE.md.
 *
 * `warn` is set by Level.update when a timer it needs is about to run out;
 * only drawing reads it.
 */
function makeBridge(d) {
  const dir = d.dir || 1;
  const br = {
    kind: 'bridge',
    x: d.x, y: d.y, w: d.w, dir,
    needs: d.needs || [],
    openT: 0,
    warn: false,
    dx: 0, dy: 0, vx: 0, vy: 0,
    segments: [],

    /** The slab's current reach, as [left, right]. */
    span() {
      const ext = d.w * br.openT;
      return dir > 0 ? [d.x, d.x + ext] : [d.x - ext, d.x];
    },

    update(dt, isPowered) {
      br.openT = rampToward(br.openT, isPowered ? 1 : 0, dt, 1 / CONFIG.BRIDGE.OPEN_TIME);
      const [lo, hi] = br.span();
      br.segments = hi - lo > 1 ? [segment(lo, d.y, hi, d.y)] : [];
      for (const s of br.segments) s.owner = br;
    },

    overlaps(x, y, r) {
      const [lo, hi] = br.span();
      return hi - lo > 1 && x + r > lo && x - r < hi && y + r > d.y - 1 && y - r < d.y + 1;
    },
  };
  br.update(0, false);
  return br;
}
```

- [ ] **Step 4: Construct, update, and collide bridges**

In the constructor, directly after the gates line:

```js
    // Bridges are colliders that change length, so like gates they stay OUT
    // of the static grid.
    this.bridges = (data.bridges || []).map(makeBridge);
```

In `update`, directly after the gates line added in Task 3:

```js
    for (const br of this.bridges) {
      br.update(dt, powered(br.needs, this.senders));
      br.warn = warning(br.needs, this.senders, CONFIG);
    }
```

In `solidsFor`, after `for (const g of this.gates) out.push(...g.segments);` add:

```js
    for (const br of this.bridges) out.push(...br.segments);
```

In `near`, after the gates line add:

```js
    for (const br of this.bridges) if (br.overlaps(x, y, r)) out.push(...br.segments);
```

- [ ] **Step 5: Run to see them pass**

Run: `node games/pushkar-ball/tests/run.mjs circuits`
Expected: `WIRING WORKS`. If part 14 reports a dip or slow-down at the joint, **instrument before changing anything** — print the ball's contacts (`c.seg.owner`, `c.nx`, `c.ny`) for the steps with `ball.x` between 990 and 1010 — then fix the joint in `makeBridge`, never loosen the test.

- [ ] **Step 6: Run all offline suites**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/circuits.mjs
git commit -m "Add bridges: a one-segment slab that slides out while powered"
```

---

### Task 5: Drawing, the level grid, and the service worker

**Files:**
- Modify: `games/pushkar-ball/js/circuits.js` (append drawing)
- Modify: `games/pushkar-ball/js/main.js` (import; `draw()`; delete `drawSwitches`)
- Modify: `games/pushkar-ball/css/style.css` (`#level-grid`)
- Modify: `sw.js` (PRECACHE, CACHE)

- [ ] **Step 1: Append the drawing to `circuits.js`**

```js
// --- Drawing -----------------------------------------------------------------
//
// Everything below takes the canvas context as a parameter and is only ever
// called by main.js. Nothing above calls it, so importing this file into
// Node never touches a canvas.
//
// The one rule a child reads: LIGHT EVERY LAMP ON THE DOOR. A lit lamp is its
// sender's colour, exactly; an unlit one is dark grey with a faint wash of
// that colour, so which button it belongs to is still readable, but it never
// matches the lit colour — tests/browser/wiring.mjs counts exact lit pixels.

function receiversOf(level) {
  return [...level.gates, ...(level.bridges || [])];
}

/** Where lamp `i` of a gate or bridge is drawn. A gate's ride up with it. */
export function receiverLampAt(r, i, cfg) {
  const P = cfg.CIRCUIT;
  if (r.kind === 'bridge') return { x: r.x - r.dir * 16, y: r.y - 22 - i * P.LAMP_GAP };
  return { x: r.x + r.w / 2, y: r.y + r.h - 20 - i * P.LAMP_GAP };
}

function senderLampAt(s, cfg) {
  if (s.kind === 'plate') return { x: s.x + s.w / 2, y: s.y - cfg.SWITCH.H / 2 };
  return capCentre(s, cfg);
}

function lamp(ctx, x, y, r, colour, lit, ring, cfg) {
  const C = cfg.COLOURS;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (ring) {
    ctx.lineWidth = r * 0.55;
    ctx.strokeStyle = lit ? colour : C.LAMP_OFF;
    ctx.stroke();
    if (!lit) { ctx.globalAlpha = 0.4; ctx.strokeStyle = colour; ctx.stroke(); ctx.globalAlpha = 1; }
  } else {
    ctx.fillStyle = lit ? colour : C.LAMP_OFF;
    ctx.fill();
    if (!lit) { ctx.globalAlpha = 0.4; ctx.fillStyle = colour; ctx.fill(); ctx.globalAlpha = 1; }
  }
}

/**
 * Every wire, straight from a sender's lamp to the receiver lamp it lights,
 * full colour while the sender is on and faint while it is off. Call it
 * BEFORE the ground is drawn, so a wire reads as buried where it passes under
 * the ground.
 */
export function drawWires(ctx, level, cfg) {
  ctx.lineWidth = cfg.CIRCUIT.WIRE_W;
  for (const r of receiversOf(level)) {
    r.needs.forEach((need, i) => {
      const s = level.senders.find((x) => x.id === parseNeed(need).id);
      if (!s) return;
      const a = senderLampAt(s, cfg), b = receiverLampAt(r, i, cfg);
      ctx.globalAlpha = s.pressed ? 1 : 0.3;
      ctx.strokeStyle = s.colour;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

/**
 * Plates, posts and caps. A plate is level six's slab with a small lamp let
 * into it. A button is a stone post with its cap — which is its lamp — on one
 * side, sinking into the post while pressed; a timer adds a ring round the
 * cap that empties as its time runs down.
 */
export function drawSenders(ctx, level, cfg) {
  const C = cfg.COLOURS, P = cfg.CIRCUIT, S = cfg.SWITCH;
  for (const s of level.senders) {
    if (s.kind === 'plate') {
      const dip = S.PRESS_DEPTH * s.animT;
      ctx.fillStyle = C.SWITCH_PLATE_EDGE;
      ctx.fillRect(s.x, s.y - S.H, s.w, S.H);
      ctx.fillStyle = C.SWITCH_PLATE;
      ctx.fillRect(s.x, s.y - S.H + dip, s.w, S.H - dip);
      lamp(ctx, s.x + s.w / 2, s.y - S.H / 2 + dip / 2, 4, s.colour, s.pressed, false, cfg);
      continue;
    }
    const p = postBox(s, cfg);
    ctx.fillStyle = C.WALL;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = C.WALL_EDGE;
    ctx.fillRect(p.x, p.y, p.w, 6);
    const c = capCentre(s, cfg);
    const into = (s.face === 'right' ? -1 : 1) * S.PRESS_DEPTH * s.animT;
    if (s.kind === 'timer') {
      const R = P.CAP_R + P.RING_W;
      ctx.lineWidth = P.RING_W;
      ctx.strokeStyle = C.RING_TRACK;
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.stroke();
      if (s.pressed && s.time > 0) {
        ctx.strokeStyle = s.colour;
        ctx.beginPath();
        ctx.arc(c.x, c.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (s.left / s.time));
        ctx.stroke();
      }
    }
    lamp(ctx, c.x + into, c.y, P.CAP_R, s.colour, s.pressed, false, cfg);
  }
}

/**
 * Bridges, and every receiver's lamps. A gate's body is drawn by main.js with
 * the other stone; its lamps go on top of it here. A bridge's lamps sit on a
 * thin signal pole at its root, and the slab shakes while `warn` is set.
 */
export function drawReceivers(ctx, level, time, cfg) {
  const C = cfg.COLOURS, P = cfg.CIRCUIT, B = cfg.BRIDGE;
  for (const br of level.bridges || []) {
    const [lo, hi] = br.span();
    const shake = br.warn ? Math.sin(time * 50) * B.SHAKE : 0;
    if (hi - lo > 1) {
      ctx.fillStyle = C.WALL;
      ctx.fillRect(lo, br.y + shake, hi - lo, B.H);
      ctx.fillStyle = C.WALL_EDGE;
      ctx.fillRect(lo, br.y + shake, hi - lo, 5);
    }
    const top = receiverLampAt(br, br.needs.length - 1, cfg).y - P.LAMP_R - 4;
    ctx.fillStyle = C.WALL_EDGE;
    ctx.fillRect(br.x - br.dir * 16 - 2, top, 4, br.y - top);
  }
  for (const r of receiversOf(level)) {
    r.needs.forEach((need, i) => {
      const s = level.senders.find((x) => x.id === parseNeed(need).id);
      const at = receiverLampAt(r, i, cfg);
      lamp(ctx, at.x, at.y, P.LAMP_R, s ? s.colour : C.LAMP_OFF, lampLit(need, level.senders), parseNeed(need).invert, cfg);
    });
  }
}
```

- [ ] **Step 2: Use it from `main.js`**

Add to the imports at the top: `import { drawWires, drawSenders, drawReceivers } from './circuits.js';`

In `draw()`, change the world-drawing sequence to:

```js
  drawWires(ctx, level, CONFIG);
  drawGround();
  drawWater();
  drawWalls();
  drawCrates();
  drawBreakables();
  drawCheckpoints();
  drawSenders(ctx, level, CONFIG);
  drawSpikes(ctx, level.spikes, CONFIG);
  drawEnemies(ctx, level.enemies, level.time, CONFIG);
  drawParticles();
  drawPlatforms();
  drawPads();
  drawGates();
  drawReceivers(ctx, level, level.time, CONFIG);
  drawBeams();
  drawGoal();
  drawBall();
```

Delete the function `drawSwitches` and its doc comment from `main.js` (its drawing now lives in `drawSenders`).

- [ ] **Step 3: Five tiles to a row in level select** — in `games/pushkar-ball/css/style.css` replace the `#level-grid` comment and rule with:

```css
/* Level select. Five tiles to a row, sized against the screen HEIGHT for the
   same reason the opening panel is: at 740x280 two rows of 26vh tiles and a
   gap are 154px, which clears the hub button above them. Five, not four,
   since level nine: three rows would not fit a 280px screen, and five 26vh
   tiles are 398px wide there, well inside 740. Ten levels still fit in two
   rows; an eleventh needs this rethought. */
#level-grid {
  --tile: clamp(52px, 26vh, 110px);
  display: grid;
  grid-template-columns: repeat(5, var(--tile));
  gap: clamp(8px, 3vh, 18px);
}
```

- [ ] **Step 4: Precache the new module** — in `sw.js`, add `'./games/pushkar-ball/js/circuits.js',` directly after `'./games/pushkar-ball/js/enemies.js',`, and change `const CACHE = 'pushkar-games-v2';` to `const CACHE = 'pushkar-games-v3';` so installed copies fetch the new list. Then check no test pins the old name:

Run: `grep -rn "pushkar-games-v" games/*/tests sw.js`
Expected: only the `sw.js` line. If a test pins `v2`, update it to `v3`.

- [ ] **Step 5: Run the offline suites of BOTH games** (sw.js is shared)

Run: `node games/pushkar-ball/tests/run.mjs offline` then `node games/taras-town/tests/run.mjs offline`
Expected: all pass, including Pushkar Ball's `precache` and Taras Town's `pwa`.

- [ ] **Step 6: Look at level six** — start a server from the repo root (`python -m http.server 8778`), open `http://127.0.0.1:8778/games/pushkar-ball/index.html`, play level 6 to its plate, push the crate on. Expected: the plate shows a small lamp; the gate shows one lamp that lights in the plate's colour as the gate rises; a wire joins them. (Level 6 needs level 5 finished — in DevTools console run `localStorage.setItem('pushkar-ball-save', JSON.stringify({unlocked: 7, finished: []}))` and reload.)

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/circuits.js games/pushkar-ball/js/main.js games/pushkar-ball/css/style.css sw.js
git commit -m "Draw lamps, wires, buttons, timers and bridges; precache circuits.js"
```

---

### Task 6: Level-authoring checks for wiring

**Files:**
- Modify: `games/pushkar-ball/tests/offline/levels.mjs` (a new section before the final `console.log`)

- [ ] **Step 1: Add the section**

Add `const { parseNeed } = await import('../../js/circuits.js');` next to the file's other imports (and import `CONFIG` and `loadLevel` the same way if the file does not already), then insert before the final `console.log(failures ? ...)`:

```js
// --- wiring ------------------------------------------------------------------
//
// Every need names a real sender; a sender and each receiver it drives are
// close enough to be on one phone screen together (CIRCUIT.SEE); and no
// checkpoint sits between them — a respawn resets buttons, so a checkpoint
// there would leave a player past the button and facing a shut door.
console.log('\nwiring');
for (const data of LEVELS) {
  const level = loadLevel(data);
  const ids = level.senders.map((s) => s.id);
  if (new Set(ids).size !== ids.length) fail(`level ${data.id}: two senders share an id (${ids.join(', ')})`);
  for (const s of level.senders) {
    if (s.kind === 'timer' && !(s.time > 0)) fail(`level ${data.id}: timer '${s.id}' has time ${s.time}`);
    if (s.kind !== 'plate' && s.face !== 'left' && s.face !== 'right') fail(`level ${data.id}: button '${s.id}' faces '${s.face}'`);
  }
  for (const r of [...level.gates, ...level.bridges]) {
    if (!r.needs.length) fail(`level ${data.id}: a ${r.kind} at x=${r.x} needs nothing, so it can never open`);
    for (const n of r.needs) {
      const s = level.senders.find((x) => x.id === parseNeed(n).id);
      if (!s) { fail(`level ${data.id}: a ${r.kind} at x=${r.x} needs '${n}', and there is no such sender`); continue; }
      const apart = Math.abs(s.x - r.x);
      if (apart > CONFIG.CIRCUIT.SEE) fail(`level ${data.id}: '${s.id}' is ${apart} from the ${r.kind} it drives; ${CONFIG.CIRCUIT.SEE} is the most one phone screen shows`);
      const lo = Math.min(s.x, r.x), hi = Math.max(s.x, r.x);
      for (const c of level.checkpoints) {
        if (c.x > lo && c.x < hi) fail(`level ${data.id}: checkpoint at x=${c.x} sits between '${s.id}' and the ${r.kind} it drives`);
      }
    }
  }
}
```

- [ ] **Step 2: Run it**

Run: `node games/pushkar-ball/tests/run.mjs levels`
Expected: passes (level 6 is the only wired level so far).

- [ ] **Step 3: Prove it bites** — temporarily change level 6's checkpoint `x: 8150` to `x: 9750` in `levels.js`, rerun `run.mjs levels`, expect a "sits between" failure, then **revert** the change.

- [ ] **Step 4: Commit**

```bash
git add games/pushkar-ball/tests/offline/levels.mjs
git commit -m "Check every level's wiring: real senders, one screen apart, no checkpoint between"
```

---

### Task 7: Level 8 — Buttons

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (append to `LEVELS`, after level 7's closing `},`)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (route 8; checks 3e, 3f, 3g)

- [ ] **Step 1: Write the route first** — in `finish.mjs`, add this helper just above `const ROUTES = {`:

```js
/** A level's sender by id. */
const sender = (level, id) => level.senders.find((s) => s.id === id);
```

and add this entry to `ROUTES` after level 7's:

```js
  // Level eight: buttons. Each stage is one thing a thumb does. The stage it
  // starts in comes from where the ball starts, so the same route serves the
  // spawn and both checkpoints.
  8: (level, lead) => {
    const run = runner(level, lead);
    const a = sender(level, 'a'), b = sender(level, 'b'), c = sender(level, 'c'), d = sender(level, 'd');
    const crate = level.crates[0];
    const shelf = level.walls.find((w) => w.x === 11000 && w.y === 590);
    const bridge = level.bridges[0];
    const W = CONFIG.CIRCUIT.POST_W;
    let stage = null, stuck = 0, lastX = crate.x;
    return (ball) => {
      if (!stage) stage = ball.x < a.x ? 'a' : ball.x < b.x - 300 ? 'run' : ball.x < c.x - 300 ? 'run2' : 'c';
      // Room A: roll into the button, then hop its post.
      if (stage === 'a') { if (a.pressed) stage = 'hopA'; else return { right: true }; }
      if (stage === 'hopA') {
        if (ball.x > a.x + W + 30) stage = 'run';
        return { right: true, jump: ball.grounded };
      }
      // The warm-up belongs to the generic runner.
      if (stage === 'run') { if (ball.x > b.x - 300) stage = 'overB'; else return run(ball); }
      // Room B: hop the post's plain side, then come back into its cap.
      if (stage === 'overB') {
        if (ball.x > b.x + W + 100) stage = 'backB';
        return { right: true, jump: ball.grounded && b.x - ball.x > 0 && b.x - ball.x < 120 * lead };
      }
      if (stage === 'backB') { if (b.pressed) stage = 'cross'; else return { left: true }; }
      if (stage === 'cross') { if (ball.x > bridge.x + bridge.w + 60) stage = 'run2'; else return { right: true }; }
      if (stage === 'run2') { if (ball.x > c.x - 300) stage = 'c'; else return run(ball); }
      // Room C: the floor button, the crate to the shelf, up, the shelf button.
      if (stage === 'c') { if (c.pressed) stage = 'hopC'; else return { right: true }; }
      if (stage === 'hopC') {
        if (ball.grounded && ball.x > c.x + W + 30) stage = 'push';
        return { right: true, jump: ball.grounded && ball.x < c.x + W + 30 };
      }
      if (stage === 'push') {
        stuck = Math.abs(crate.x - lastX) < 0.01 && crate.x + crate.w > shelf.x - 5 ? stuck + 1 : 0;
        lastX = crate.x;
        if (stuck > 30) stage = 'back';
        return { right: true };
      }
      if (stage === 'back') { if (ball.x < crate.x - 160) stage = 'hop'; return { left: true }; }
      if (stage === 'hop') {
        if (ball.grounded && ball.platform === crate) stage = 'up';
        else return { right: true, jump: ball.grounded && ball.platform !== crate && ball.x > crate.x - 50 * lead };
      }
      if (stage === 'up') {
        if (ball.grounded && ball.y < shelf.y) stage = 'd';
        else return { right: true, jump: ball.grounded && ball.platform === crate };
      }
      if (stage === 'd') { if (d.pressed) stage = 'hopD'; else return { right: true }; }
      if (stage === 'hopD') {
        if (ball.x > d.x + W + 30) stage = 'end';
        return { right: true, jump: ball.grounded };
      }
      return run(ball);
    };
  },
```

- [ ] **Step 2: Run finish before the level exists**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: still passes — a route with no level is never used. This confirms the helper and the route parse and nothing else broke.

- [ ] **Step 3: Append level 8** to `LEVELS` in `levels.js`

```js
  {
    // Level eight: buttons. Stage: INTRODUCTION — see the roadmap,
    // docs/superpowers/specs/2026-09-18-mechanisms-and-enemies-roadmap.md,
    // and the spec, docs/superpowers/specs/2026-09-18-wiring-buttons-timers-bridges-design.md.
    // The one new idea: hitting a button changes the world, and it stays
    // changed. Read by its lamps: light every lamp on the door.
    //
    // Room A comes FIRST, before any warm-up: it cannot be failed, so the
    // level may as well open with its new idea. Then level six's warm-up
    // shape (a proven 200 gap, the recurring stone step, a walker), then:
    //   B — a 420 gap (the widest proven jumpable is 260) and a bridge; its
    //       button faces RIGHT, so it is hopped on the way in and has to be
    //       come back to. The wire shows where.
    //   C — a gate with two lamps on a stone shelf. The shelf's top (590) is
    //       39 above a jump from the floor (a ball's bottom reaches 629) and
    //       61 below one from a crate's top (529). The gate is 240 tall: from
    //       the shelf a jump's bottom reaches 459, which would clear a 200 one.
    //       Room C's floor button's post top (710) would put a jump at 579,
    //       above the shelf — but the post is 570 from it and a jump carries
    //       at most 290, so it cannot be used as a step there.
    id: 8,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12760, y: 760 },

    ground: [
      [[40, 760], [2600, 760]],
      // Past the proven 200 gap: the step, the walker, room B's button.
      [[2800, 760], [8600, 760]],
      // Past room B's 420 gap: room C and the flag.
      [[9020, 760], [12960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
      // The recurring low stone step, 60 tall.
      { x: 3600, y: 700, w: 200, h: 60 },
      // Room C's shelf, standing on the floor like level three's ledge.
      { x: 11000, y: 590, w: 700, h: 170 },
      // Room C's crate. Pushed right, it stops against the shelf's face at
      // x=10900 and is the step up. Far enough from the floor button (post
      // at 10400) that hopping the post never lands on it.
      { x: 10850, y: 660, w: 100, h: 100, movable: true },
    ],

    senders: [
      { id: 'a', kind: 'button', x: 1400, y: 760, face: 'left' },
      { id: 'b', kind: 'button', x: 8000, y: 760, face: 'right' },
      { id: 'c', kind: 'button', x: 10400, y: 760, face: 'left' },
      { id: 'd', kind: 'button', x: 11150, y: 590, face: 'left' },
    ],

    gates: [
      { x: 1800, y: 560, w: 40, h: 200, needs: ['a'] },
      { x: 11300, y: 350, w: 40, h: 240, needs: ['c', 'd'] },
    ],

    bridges: [
      { x: 8600, y: 760, w: 420, dir: 1, needs: ['b'] },
    ],

    platforms: [],

    enemies: [
      // Level six's walker, 800 further on because room A sits in front of
      // the warm-up here. A walker's margin is fussy (see level six's own
      // comment) and the arrival time has changed, so this x is only a
      // starting point: finish.mjs's sweep decides it.
      { kind: 'walker', x: 5200, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    // Before room B, and between room B's bridge and room C. Neither may sit
    // between a button and what it opens — levels.mjs checks.
    checkpoints: [
      { x: 7600, y: 760 },
      { x: 9800, y: 760 },
    ],
  },
```

- [ ] **Step 4: Run levels and finish**

Run: `node games/pushkar-ball/tests/run.mjs levels` → expected pass.
Run: `node games/pushkar-ball/tests/run.mjs finish` → expected: level 8 finished all 30 ways and from both checkpoints.

If level 8 fails:
- **Print first.** Add a temporary `console.log` of `stage`, `ball.x`, `ball.y`, `ball.grounded`, `level.time` inside route 8 on the failing lead/delay, and read where it stopped.
- **Deaths near x 4920-5480 (the walker):** sweep the walker's `x` in 25-unit steps from 4900 to 5600 over the full lead × delay matrix, pick the middle of the passing region, and write what you found into the walker's comment, the way level six's walker comment does.
- **Stuck in a room:** the geometry numbers in the header comment are the contract. Fix the route's trigger distances first; change geometry only if the arithmetic in the header comment is wrong, and then fix the comment too.

- [ ] **Step 5: Add the negative checks** to `finish.mjs`, after check 3d:

```js
// --- 3e. level eight: each room needs its button ----------------------------
console.log('\n3e. level eight without its buttons');
{
  const data = LEVELS.find((l) => l.id === 8);
  const gateA = data.gates[0];
  // Room A without its button: hopping and running for all they are worth,
  // nothing gets past the gate.
  {
    const bare = { ...data, senders: data.senders.filter((s) => s.id !== 'a') };
    const { ball } = play(bare, () => (b) => ({ right: true, jump: b.grounded }), { seconds: 8 });
    if (ball.x > gateA.x) fail(`level 8 room A was passed without its button (ball at x=${ball.x.toFixed(0)})`);
    else console.log(`   room A without its button: stopped at x=${ball.x.toFixed(0)}, gate at ${gateA.x}`);
  }
  // Room B without its button: no single jump from anywhere clears the gap.
  {
    const bare = { ...data, senders: data.senders.filter((s) => s.id !== 'b') };
    const br = data.bridges[0];
    let cleared = 0, tries = 0, reached = 0;
    for (let jumpAt = br.x - 300; jumpAt <= br.x - 5; jumpAt += 5) {
      tries++;
      let done = false;
      const { ball } = play(bare, () => (b) => {
        reached = Math.max(reached, b.x);
        const jump = !done && b.grounded && b.x >= jumpAt;
        if (jump) done = true;
        return { right: true, jump };
      }, { from: { x: br.x - 500, y: 740 }, seconds: 4 });
      if (ball.deaths === 0 && ball.x > br.x + br.w + 20) cleared++;
    }
    if (cleared) fail(`level 8's gap was crossed without its bridge ${cleared} time(s) of ${tries}`);
    else if (reached < br.x) fail(`no attempt reached level 8's gap edge (furthest ${reached.toFixed(0)}) — this proves nothing`);
    else console.log(`   room B without its button: ${tries} jumps, none crossed the ${br.w} gap`);
  }
}

// --- 3f. level eight: the shelf needs the crate ------------------------------
console.log('\n3f. level eight without its crate');
{
  const data = LEVELS.find((l) => l.id === 8);
  const shelf = data.boxes.find((b) => b.x === 11000 && b.y === 590);
  const bare = { ...data, boxes: data.boxes.filter((b) => !b.movable) };
  let onShelf = 0, tries = 0, best = Infinity;
  for (let jumpAt = shelf.x - 400; jumpAt <= shelf.x - 5; jumpAt += 5) {
    for (const spam of [false, true]) {
      tries++;
      let pressed = false, up = false;
      play(bare, () => (b) => {
        if (b.x > shelf.x - 60) best = Math.min(best, b.y + CONFIG.BALL.R);
        if (b.grounded && b.y < shelf.y) up = true;
        const jump = b.x >= jumpAt && (spam || !pressed);
        if (jump) pressed = true;
        return { right: true, jump };
      }, { from: { x: shelf.x - 500, y: 740 }, seconds: 4 });
      if (up) onShelf++;
    }
  }
  if (onShelf) fail(`level 8's shelf was reached without the crate ${onShelf} time(s) of ${tries}`);
  // `best` is the highest (smallest y) a ball's BOTTOM got beside the shelf;
  // the header comment's arithmetic says about 629, 39 below the top at 590.
  else if (best - shelf.y < 30) fail(`without the crate a ball's bottom got to y=${best.toFixed(0)}, within 30 of the shelf top ${shelf.y} — too close to be sure it needs the crate`);
  else console.log(`   ${tries} tries, none reached the shelf; the highest a ball's bottom got beside it was y=${best.toFixed(0)} (shelf top ${shelf.y})`);
}
```

- [ ] **Step 6: Run finish**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: `EVERY LEVEL CAN BE FINISHED`, with 3e and 3f printing their evidence lines.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs
git commit -m "Add level 8: buttons, a bridge, and a two-lamp door on a shelf"
```

---

### Task 8: Level 9 — Timers, and a reversal

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (append level 9)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (route 9; `SPARE9`; checks 3g-3i)

- [ ] **Step 1: Add the route and the spare-time record** — above `const ROUTES = {` add:

```js
// Every prepared run through level nine's timed room records how much of the
// timer it used. Checked after section 2: every run, from every lead, delay
// and checkpoint, must leave at least 40% of the time unused — the proof
// that room is not a pixel-perfect run.
const SPARE9 = [];
```

and add to `ROUTES`, after 8:

```js
  // Level nine: timers. Room B is the one to read: the bridge's button on the
  // floating ledge first, then the timer — which faces right, so it is
  // hopped and come back to — then run. The timer is pressed last, which is
  // the whole lesson.
  9: (level, lead) => {
    const run = runner(level, lead);
    const t1 = sender(level, 't1'), b = sender(level, 'b'), t2 = sender(level, 't2'), p = sender(level, 'p');
    const ledge = level.walls.find((w) => w.x === 7400 && w.y === 670);
    const gateB = level.gates.find((g) => g.needs.includes('t2'));
    const crate = level.crates[0];
    const W = CONFIG.CIRCUIT.POST_W;
    let stage = null, pressedAt = 0;
    return (ball) => {
      if (!stage) stage = ball.x < t1.x ? 'a' : ball.x < ledge.x - 400 ? 'run' : ball.x < gateB.x ? 'ledge' : 'run3';
      // Room A: a timer in the path; the gate is well inside its time.
      if (stage === 'a') { if (t1.pressed) stage = 'hopA'; else return { right: true }; }
      if (stage === 'hopA') {
        if (ball.x > t1.x + W + 30) stage = 'run';
        return { right: true, jump: ball.grounded };
      }
      if (stage === 'run') { if (ball.x > ledge.x - 400) stage = 'ledge'; else return run(ball); }
      // Room B, first the bridge: up onto the floating ledge. Jumped from far
      // enough out that the ball is above the ledge's lip when it gets there.
      // A ball that misses rolls on underneath; it goes back and tries again.
      if (stage === 'ledge') {
        if (ball.grounded && ball.y < ledge.y) stage = 'b';
        else if (ball.grounded && ball.x > ledge.x + ledge.w) stage = 'retry';
        else return { right: true, jump: ball.grounded && ball.y > ledge.y && ledge.x - ball.x > 0 && ledge.x - ball.x < 165 * lead };
      }
      if (stage === 'retry') { if (ball.x < ledge.x - 400) stage = 'ledge'; return { left: true }; }
      if (stage === 'b') { if (b.pressed) stage = 'hopB'; else return { right: true }; }
      if (stage === 'hopB') {
        if (ball.grounded && ball.y > ledge.y && ball.x > ledge.x + ledge.w) stage = 'overT2';
        return { right: true, jump: ball.grounded && ball.y < ledge.y };
      }
      // Then the timer: hop its plain side, come back into its cap, run.
      if (stage === 'overT2') {
        if (ball.x > t2.x + W + 100) stage = 'backT2';
        return { right: true, jump: ball.grounded && t2.x - ball.x > 0 && t2.x - ball.x < 120 * lead };
      }
      if (stage === 'backT2') {
        if (t2.pressed) { stage = 'go'; pressedAt = level.time; }
        else return { left: true };
      }
      if (stage === 'go') {
        if (ball.x > gateB.x + gateB.w + 20) {
          SPARE9.push({ lead, used: level.time - pressedAt, time: t2.time });
          stage = 'run3';
        } else return { right: true };
      }
      // Room C: push the crate off the plate, into the trench.
      if (stage === 'run3') { if (ball.x > p.x - 300) stage = 'push'; else return run(ball); }
      if (stage === 'push') { if (crate.y > 700) stage = 'end'; else return { right: true }; }
      return run(ball);
    };
  },
```

- [ ] **Step 2: Append level 9** to `LEVELS`

```js
  {
    // Level nine: timers, and a reversal. Stage: REINFORCEMENT, then
    // REVERSAL — see the roadmap and the wiring spec named in level eight.
    //
    // Room A first again, as in level eight: a timer in the path, its gate
    // 400 on, 3.5s to get there — about three times what it takes.
    // Then level eight's warm-up exactly (same gap, step, walker), then:
    //   B — set up the room first. A timed gate beyond a 420 gap. The gap's
    //       bridge is driven by an ordinary button on a floating stone ledge
    //       (top 670, bottom 700: a rolling ball's top, 720, passes under
    //       it, and a jump's bottom, 629, rises 41 above it). The timer faces
    //       right, as level eight's room B button did. Pressed first, its
    //       4.5s run out while the bridge is fetched; pressed last, the run
    //       to the gate uses well under 60% of it — finish.mjs's SPARE9
    //       holds every run to that.
    //   C — level six reversed. A crate already on a plate holds the gate
    //       SHUT (its lamp is a ring: needs '!p'). Pushed right, off the
    //       plate, the crate drops into a trench exactly its depth and
    //       becomes floor. The trench (100 deep) is shallower than a jump
    //       (131), so a ball that falls in first always gets out, with the
    //       crate still there to push.
    id: 9,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12760, y: 760 },

    ground: [
      [[40, 760], [2600, 760]],
      [[2800, 760], [8300, 760]],
      // Past room B's 420 gap, up to room C's trench.
      [[8720, 760], [10130, 760]],
      // Past the trench (10130-10240).
      [[10240, 760], [12960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
      { x: 3600, y: 700, w: 200, h: 60 },
      // Room B's floating ledge.
      { x: 7400, y: 670, w: 300, h: 30 },
      // Room C's trench: stone either side under the ground, so nothing in
      // the trench can roll out underneath the ground's one-sided surface,
      // and a stone floor 100 down.
      { x: 10030, y: 760, w: 100, h: 320 },
      { x: 10130, y: 860, w: 110, h: 220 },
      { x: 10240, y: 760, w: 100, h: 320 },
      // Room C's crate, resting on the plate from the start.
      { x: 10005, y: 660, w: 100, h: 100, movable: true },
    ],

    senders: [
      { id: 't1', kind: 'timer', x: 1400, y: 760, face: 'left', time: 3.5 },
      { id: 'b', kind: 'button', x: 7660, y: 670, face: 'left' },
      { id: 't2', kind: 'timer', x: 8000, y: 760, face: 'right', time: 4.5 },
      { id: 'p', kind: 'plate', x: 10000, y: 760, w: 110 },
    ],

    gates: [
      { x: 1800, y: 560, w: 40, h: 200, needs: ['t1'] },
      { x: 8850, y: 560, w: 40, h: 200, needs: ['t2'] },
      { x: 10500, y: 560, w: 40, h: 200, needs: ['!p'] },
    ],

    bridges: [
      { x: 8300, y: 760, w: 420, dir: 1, needs: ['b'] },
    ],

    platforms: [],

    enemies: [
      // Level eight's walker, at level eight's final x: room A and the
      // warm-up are the same shape, so the walker is met at the same time.
      // finish.mjs re-proves it here anyway.
      { kind: 'walker', x: 5200, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    checkpoints: [
      { x: 7000, y: 760 },
      { x: 9600, y: 760 },
    ],
  },
```

If Task 7 moved level 8's walker, use the same x here.

- [ ] **Step 3: Check the spare time** — in `finish.mjs`, directly before the `// --- 3. level three cannot be finished without its crate` section, add:

```js
// --- 2b. level nine's timed room is never a pixel-perfect run ---------------
console.log('\n2b. level nine: time to spare at the timed gate');
if (!SPARE9.length) fail('no run of level nine ever reached its timed gate — nothing was measured');
else {
  const worst = SPARE9.reduce((w, s) => Math.max(w, s.used / s.time), 0);
  const tight = SPARE9.filter((s) => s.used > 0.6 * s.time);
  if (tight.length) fail(`${tight.length} of ${SPARE9.length} runs used more than 60% of level nine's timer (worst ${(worst * 100).toFixed(0)}%)`);
  else console.log(`   ${SPARE9.length} runs; the slowest used ${(worst * 100).toFixed(0)}% of the timer`);
}
```

- [ ] **Step 4: Run levels and finish**

Run: `node games/pushkar-ball/tests/run.mjs levels` → expected pass.
Run: `node games/pushkar-ball/tests/run.mjs finish` → expected level 9 finished 30 ways and from both checkpoints, and 2b under 60%.

If 2b fails, **do not** lower the bar: raise `t2`'s `time` and re-run 3h (next step) to be sure the timer-first run still fails. If the `ledge` stage never lands, print `ball.x, ball.y` at every jump press and adjust `165 * lead` — the header comment's arithmetic says the takeoff window is roughly `ledge.x - 231` to `ledge.x - 59`.

- [ ] **Step 5: Add the negative checks** after 3f:

```js
// --- 3g. level nine: room A needs its timer --------------------------------
console.log('\n3g. level nine without its first timer');
{
  const data = LEVELS.find((l) => l.id === 9);
  const bare = { ...data, senders: data.senders.filter((s) => s.id !== 't1') };
  const { ball } = play(bare, () => (b) => ({ right: true, jump: b.grounded }), { seconds: 8 });
  if (ball.x > data.gates[0].x) fail(`level 9 room A was passed without its timer (x=${ball.x.toFixed(0)})`);
  else console.log(`   stopped at x=${ball.x.toFixed(0)}`);
}

// --- 3h. level nine: pressing the timer first does not get through ---------
//
// From checkpoint one: hop the timer's plain side, come back into its cap —
// pressed FIRST — then jump back over it without touching it, roll under the
// ledge and turn round, up onto the ledge for the bridge, and back to the
// gate. Must arrive to a shut gate. It must also really have pressed both,
// or it proves nothing.
console.log('\n3h. level nine, timer pressed first');
{
  const data = LEVELS.find((l) => l.id === 9);
  const cp = data.checkpoints[0];
  const W = CONFIG.CIRCUIT.POST_W;
  let hits = 0, bPressed = false, wasOn = false;
  const { ball, level } = play(data, (lv) => {
    const t2 = sender(lv, 't2'), b = sender(lv, 'b');
    const ledge = lv.walls.find((w) => w.x === 7400 && w.y === 670);
    let stage = 'over';
    return (bl) => {
      if (t2.pressed && !wasOn) hits++;
      wasOn = t2.pressed;
      if (b.pressed) bPressed = true;
      if (stage === 'over') {
        if (bl.x > t2.x + W + 100) stage = 'back';
        return { right: true, jump: bl.grounded && t2.x - bl.x > 0 && t2.x - bl.x < 120 };
      }
      if (stage === 'back') { if (t2.pressed) stage = 'away'; else return { left: true }; }
      if (stage === 'away') {
        if (bl.x < ledge.x - 300) stage = 'ledge';
        return { left: true, jump: bl.grounded && bl.x - (t2.x + W) > 0 && bl.x - (t2.x + W) < 120 };
      }
      if (stage === 'ledge') {
        if (bl.grounded && bl.y < ledge.y) stage = 'b';
        else return { right: true, jump: bl.grounded && bl.y > ledge.y && ledge.x - bl.x > 0 && ledge.x - bl.x < 165 };
      }
      if (stage === 'b') { if (b.pressed) stage = 'hop'; else return { right: true }; }
      if (stage === 'hop') {
        if (bl.grounded && bl.y > ledge.y && bl.x > ledge.x + ledge.w) stage = 'overAgain';
        return { right: true, jump: bl.grounded && bl.y < ledge.y };
      }
      // Over the timer's plain side, never back into its cap, and on to the gate.
      return { right: true, jump: bl.grounded && t2.x - bl.x > 0 && t2.x - bl.x < 120 };
    };
  }, { from: { x: cp.x, y: cp.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE }, seconds: 25 });
  const gateB = level.gates.find((g) => g.needs.includes('t2'));
  console.log(`   timer pressed ${hits} time(s), bridge button ${bPressed ? 'pressed' : 'NOT pressed'}, ball ended at x=${ball.x.toFixed(0)} (gate at ${gateB.x})`);
  if (hits !== 1) fail(`the timer-first run pressed the timer ${hits} times — it must be exactly once to prove anything`);
  if (!bPressed) fail('the timer-first run never pressed the bridge button — it proves nothing');
  if (ball.x > gateB.x + gateB.w) fail('pressing the timer first still got through level nine\'s timed gate');
}

// --- 3i. level nine: the crate left on the plate keeps the door shut -------
console.log('\n3i. level nine, crate left on the plate');
{
  const data = LEVELS.find((l) => l.id === 9);
  const gateC = data.gates.find((g) => g.needs.includes('!p'));
  const { ball, level } = play(data, () => () => ({ right: true }), { from: { x: gateC.x - 150, y: 740 }, seconds: 6 });
  const g = level.gates.find((x) => x.needs.includes('!p'));
  console.log(`   gate openT=${g.openT.toFixed(2)}, ball at x=${ball.x.toFixed(0)}`);
  if (g.openT > 0.1) fail(`with the crate on the plate, level nine's last gate opened (openT ${g.openT.toFixed(2)})`);
  if (ball.x > gateC.x) fail('with the crate on the plate, the ball got past level nine\'s last gate');
}
```

- [ ] **Step 6: Run finish**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: `EVERY LEVEL CAN BE FINISHED`, with 2b, 3g, 3h and 3i printing their evidence. If 3h reports `hits !== 1`, the harness is wrong, not the level: print `stage` and `bl.x` whenever `hits` changes, and fix the route so it jumps the post going left.

- [ ] **Step 7: Run every offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs
git commit -m "Add level 9: timers pressed last, and a plate that holds a door shut"
```

---

### Task 9: Browser suite, and looking at it

**Files:**
- Create: `games/pushkar-ball/tests/browser/wiring.mjs`

- [ ] **Step 1: Write the suite**

```js
// Wiring, in the browser: roll into level eight's first button, and level
// nine's first timer, and count the lit-lamp colour on the canvas before and
// after. A COUNT of an exact colour, so it needs no coordinate anywhere —
// the same way the ball is found by its hue. The colour is the first sender's,
// read from config.js; unlit lamps and faint wires are deliberately never
// that exact colour (see circuits.js's drawing notes).
import { connect, makeHold } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'wiring';
const PORT = Number(process.argv[4] || 9335);

const { CONFIG } = await import('../../js/config.js');
const { Buttons } = await import('../../js/ui.js');
const { LEVELS } = await import('../../js/levels.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const hex = CONFIG.COLOURS.WIRE[0];
const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lit = () => ev(`(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - ${R}) < 12 && Math.abs(d[i + 1] - ${G}) < 12 && Math.abs(d[i + 2] - ${B}) < 12) n++;
  }
  return n;
})()`);

async function openLevel(W, H, id) {
  const index = LEVELS.findIndex((l) => l.id === id);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL });
  await sleep(1600);
  await ev(`localStorage.setItem('pushkar-ball-save', JSON.stringify({ unlocked: ${LEVELS.length}, finished: [] }))`);
  await send('Page.navigate', { url: URL });
  await sleep(1600);
  await ev("document.getElementById('start-button').click()");
  await sleep(400);
  await ev(`document.querySelectorAll('#level-grid .tile')[${index}].click()`);
  await sleep(900);
}

for (const [W, H] of [[568, 320], [740, 280]]) {
  console.log(`\n${W}x${H}, level 8: a button`);
  await openLevel(W, H, 8);
  const before = await lit();
  await shoot(`${W}x${H}-8-before`);
  await hold(Buttons.right(W, H), 4000);
  await sleep(300);
  const after = await lit();
  await shoot(`${W}x${H}-8-pressed`);
  console.log(`   lit pixels: ${before} before, ${after} after rolling into the button`);
  if (before > 40) fail(`${before} lit-colour pixels before anything was pressed — something unlit is drawn in the lit colour`);
  if (after < 300) fail(`only ${after} lit-colour pixels after rolling into the button — its lamp, wire and door lamp did not light`);

  console.log(`\n${W}x${H}, level 9: a timer`);
  await openLevel(W, H, 9);
  await hold(Buttons.right(W, H), 4000);
  await sleep(300);
  const running = await lit();
  await shoot(`${W}x${H}-9-running`);
  const t1 = LEVELS.find((l) => l.id === 9).senders.find((s) => s.id === 't1');
  await sleep((t1.time + 1) * 1000);
  const done = await lit();
  await shoot(`${W}x${H}-9-ran-out`);
  console.log(`   lit pixels: ${running} while running, ${done} after it ran out`);
  if (running < 300) fail(`only ${running} lit-colour pixels with the timer running`);
  if (done > 40) fail(`${done} lit-colour pixels after the timer ran out — it did not let go`);
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nWIRING LIGHTS UP');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it**

Run: `node games/pushkar-ball/tests/run.mjs wiring`
Expected: `WIRING LIGHTS UP`. **Open the four screenshots** in `games/pushkar-ball/tests/screenshots/` and look: the cap, the ring, the door lamp and the wire must be clear at both sizes. If the suite fails, suspect the harness first (see `tests/README.md`): print the count at each step, and check the screenshot shows the level you meant.

- [ ] **Step 3: Run the small-screen suite** (9 tiles now)

Run: `node games/pushkar-ball/tests/run.mjs small`
Expected: passes with `level select: 9 tiles, all on screen` at both sizes. Open `568x320-2-levels.png` and `740x280-2-levels.png` and look at them.

- [ ] **Step 4: Look at every room** — the suites only reach room A. Serve the repo (`python -m http.server 8778`), open the game in Chrome, DevTools device mode at 568×320 and then 740×280, unlock everything (`localStorage.setItem('pushkar-ball-save', JSON.stringify({unlocked: 9, finished: []}))`, reload), and play levels 8 and 9 through. At every room check: the lamps and rings are readable; you can tell which button lights which lamp; a right-facing cap is visible after hopping its post; the timer ring visibly drains; the bridge shakes before a timer lets it go (room B of level 9 has no timer bridge — skip that one); the gate never comes down on the ball; the camera shows each button and its door together when standing at the button. **Write down anything that reads badly and fix it before the next task** — this step is where most of this project's bugs have been found.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/tests/browser/wiring.mjs
git commit -m "Test in the browser that buttons and timers light their lamps"
```

---

### Task 10: Docs

**Files:**
- Modify: `games/pushkar-ball/README.md`, `games/pushkar-ball/tests/README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-09-18-wiring-buttons-timers-bridges-design.md`

- [ ] **Step 1: `games/pushkar-ball/README.md`**
  - "**Seven levels**" → "**Nine levels**".
  - Add a row to the modules table, after `levels.js`: `| \`js/circuits.js\` | wiring: plates, buttons, timers, the AND/NOT needs, and the drawing of lamps, wires and bridges | canvas only, handed in |`
  - In the "Levels are data" code block, add after `breakables`:

    ```js
      senders:   [ { id, kind: 'plate', x, y, w },            // held by a crate
                   { id, kind: 'button', x, y, face },         // latched; face 'left' | 'right'
                   { id, kind: 'timer', x, y, face, time } ],  // lets go after `time` s
      gates:     [ { x, y, w, h, needs: ['a', '!b'] } ],        // all lamps lit → open
      bridges:   [ { x, y, w, dir, needs } ],                   // slides out across a gap
    ```
  - Add a section after "Crates", titled `## Wiring`, of about three paragraphs: the three sender kinds and the one sentence a child learns (*heavy things hold plates down; anything that hits a button presses it*); *light every lamp on the door*, rings for inverted inputs; the rules that keep it fair — a hit is the moment of touching, a respawn resets buttons and timers, no checkpoint between a sender and its receiver, a sender within `CIRCUIT.SEE` of its receiver, a gate never closes onto anything, a bridge's top is its only solid part and it still owes `dx`/`dy`/`vx`/`vy`. Point to the spec for the rest.

- [ ] **Step 2: `games/pushkar-ball/tests/README.md`** — add `circuits` (offline) and `wiring` (browser) to its list of suites, in the same form as the existing entries, and one line for each on what it proves.

- [ ] **Step 3: `CLAUDE.md`** — in "The shape of the thing — Pushkar Ball", add after the crate bullet:

```markdown
- **Wiring lives in `js/circuits.js`**: senders (plate, button, timer) and
  the AND/NOT `needs` of gates and bridges. A button is pressed by a *hit* —
  the moment of touching — not by touching, or a ball parked against a timer
  holds its door open for ever. A respawn resets buttons and timers, which is
  only safe because `levels.mjs` forbids a checkpoint between a sender and
  what it drives. Anything that can press something joins the *presser* list
  in `Level.update`; the ball joins it through `level.noteBall`, and future
  enemies join it the same way.
```

- [ ] **Step 4: Mark the spec done** — change its title line to `# Wiring: buttons, timers, bridges, and levels 8-9 — DONE` and add under it: `Implemented by docs/superpowers/plans/2026-09-18-wiring-buttons-timers-bridges.md.` If Task 7, 8 or 9 changed any number the spec quotes (a walker's x, a timer's time), correct the spec to match.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/README.md games/pushkar-ball/tests/README.md CLAUDE.md docs/superpowers/specs/2026-09-18-wiring-buttons-timers-bridges-design.md
git commit -m "Document the wiring, and levels 8 and 9"
```

---

### Task 11: Full verification (sw.js was touched)

- [ ] **Step 1: Pushkar Ball, everything**

Run: `node games/pushkar-ball/tests/run.mjs 2>&1 | tail -40`
Expected: every suite passes.

- [ ] **Step 2: Taras Town, everything** (it shares `sw.js`)

Run: `node games/taras-town/tests/run.mjs 2>&1 | tail -40`
Expected: every suite passes. A multiplayer suite that fails at the end of a long run: re-run it alone before believing it, but do not assume it is flaky.

- [ ] **Step 3: Report** — do not push. Report to the user: what was built, the evidence lines from `finish` (2b's worst percentage, 3e-3i), any number that moved during tuning and why, and anything from Task 9 step 4 that still reads badly.
