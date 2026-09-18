# Charger and enemy state machines (levels 10–11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a charger enemy, written in a small shared state-machine shape, and two new Pushkar Ball levels (10: introduction, 11: combination with wiring).

**Architecture:** `js/enemies.js` gains `enterState`/`runStates` (the shape) and `makeCharger` (the first enemy in it). The charger moves through `physics.step` like the roller, joins `Level.update`'s presser and blocker lists through generic enemy fields (`presses`, `heavy`, `grounded`), and tells `stompEnemy`/`hazardKnockDir` when it is stompable or harmless through two more (`stompable`, `harmless`). Levels 10 and 11 are appended to `LEVELS`, proved by routes in `finish.mjs`.

**Tech Stack:** Vanilla ES modules, no build, no dependencies. Node 22 offline suites; headless Chrome browser suites via `tests/run.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md`. Read it, the roadmap it points to, and `CLAUDE.md`'s "The shape of the thing — Pushkar Ball" before starting.

**Ground rules (from CLAUDE.md, not optional):**
- `config.js`, `physics.js`, `levels.js`, `player.js`, `camera.js`, and `enemies.js`'s update paths never touch the DOM.
- Every tunable number lives in `js/config.js`. Every number there is a guess; the levels' positions are tuned against `finish.mjs`, not by feel.
- No test-only code in the game. Tests read the game's own state in Node, or pixels in the browser.
- Levels are **appended** to `LEVELS`, never inserted.
- No image files. The charger is drawn with shapes.
- Narrow test commands while iterating: `node games/pushkar-ball/tests/run.mjs offline/chargers`, `... offline/levels`, `... offline/finish`. The full `run.mjs` only in Task 10.
- `sw.js` and the hub's `index.html` are not touched by this plan (no new game files are added to `js/`), so Taras Town's suites do not need running.
- Level 7 has no route in `finish.mjs`. That failure is pre-existing and not ours; every other line must pass.

**Commit messages** end with:
```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## File map

| File | What changes |
|---|---|
| `games/pushkar-ball/js/config.js` | `ENEMY.CHARGER` numbers; `COLOURS.CHARGER_DUST`, `COLOURS.CHARGER_STAR` |
| `games/pushkar-ball/js/enemies.js` | `enterState`, `runStates`, `makeCharger`, `drawCharger`; `drawEnemies` dispatches it |
| `games/pushkar-ball/js/levels.js` | `MAKERS.charger`; enemies join pressers/blockers; `stompEnemy` honours `stompable`; `hazardKnockDir` skips `harmless`; levels 10 and 11 appended |
| `games/pushkar-ball/tests/offline/chargers.mjs` | new: the charger's behaviour, in Node |
| `games/pushkar-ball/tests/offline/levels.mjs` | charger range, ground, checkpoint distance and gate checks |
| `games/pushkar-ball/tests/offline/finish.mjs` | `dodge` helper; routes for 10 and 11; `SPARE11`; probes 3l–3n |
| `games/pushkar-ball/tests/browser/chargers.mjs` | new: screenshots of the poses and both levels at 568×320 and 740×280 |
| `games/pushkar-ball/README.md`, `tests/README.md`, `CLAUDE.md`, the spec, the roadmap | documentation |

---

### Task 1: The state-machine shape and a charger that patrols, sees, winds up and charges

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (inside `ENEMY`, after `ROLLER`)
- Modify: `games/pushkar-ball/js/enemies.js`
- Create: `games/pushkar-ball/tests/offline/chargers.mjs`

- [ ] **Step 1: Add the numbers to `config.js`**

Inside `ENEMY: { ... }`, after the `ROLLER: { ... },` block:

```js
    // The charger — see enemies.js's makeCharger and the spec,
    // docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md.
    // Every one of these is a guess awaiting a thumb.
    CHARGER: {
      R: 26,              // half its hit box; drawn a little wider, never taller
      PATROL_SPEED: 120,  // px/s — slow, a third of the ball's top speed
      SEE: 240,           // px ahead it notices the ball, about six ball-widths
      LEVEL_TOL: 60,      // px of height difference still "on its own level"
      WINDUP: 0.8,        // s of crouch and puff before a charge — the warning
      CHARGE_SPEED: 480,  // px/s — faster than the ball's 420, so a jump, not a run
      DAZED: 3.0,         // s it sits stunned after a charge: stompable, harmless
      RETURN: 4.0,        // s a popped charger stays gone at the least
      CRATE_SHOVE: 60,    // px a charge slides a crate it runs into
      PUFF_TIME: 0.4,     // s its return puff is drawn for
    },
```

- [ ] **Step 2: Write the failing test file**

Create `games/pushkar-ball/tests/offline/chargers.mjs`:

```js
// The charger, in Node: every state change and what triggers it, with the
// real Level and the real physics. Like the roller, a charger is not a pure
// function of level time — it reacts to the ball — so what is proved here is
// that the same situation always plays out the same way, step by step.
const { CONFIG } = await import('../../js/config.js');
const { makeCharger } = await import('../../js/enemies.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const K = CONFIG.ENEMY.CHARGER;
const DT = CONFIG.STEP;
const FLOOR = 760;
const CY = FLOOR - K.R;

/** A flat, walled floor from 40 to 2960, plus any boxes and other level data given. */
function room({ boxes = [], ...rest } = {}) {
  return loadLevel({
    id: 90, theme: 'hills', bounds: { w: 3000, h: 1080 },
    spawn: { x: 200, y: 600 },
    ground: [[[40, FLOOR], [2960, FLOOR]]],
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 }, ...boxes],
    platforms: [],
    ...rest,
  });
}

/** A stand-in ball: only what the charger and Level.update read. */
function fakeBall(x, y = FLOOR - CONFIG.BALL.R) {
  return { x, y, r: CONFIG.BALL.R, grounded: true, dying: 0 };
}

/** Step a lone charger (not in the level's own list) for `seconds`, calling `each` after every step. */
function run(level, c, seconds, each = () => {}) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    level.update(DT);
    c.update(DT, level.time, level, CONFIG);
    if (each(c, i) === false) break;
  }
}

// --- 1. it patrols its range and never leaves it -----------------------------
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 800, to: 1200, dir: 1 }, CONFIG);
  let lo = c.x, hi = c.x, other = null;
  run(level, c, 12, () => {
    lo = Math.min(lo, c.x); hi = Math.max(hi, c.x);
    if (c.state !== 'patrol') other = c.state;
  });
  console.log(`\n1. no ball: patrolled ${lo.toFixed(0)}..${hi.toFixed(0)} of 800..1200`);
  if (other) fail(`with no ball anywhere it went into '${other}'`);
  if (lo < 800 - 3 || hi > 1200 + 3) fail(`left its range: ${lo.toFixed(1)}..${hi.toFixed(1)}`);
  if (hi - lo < 350) fail(`only covered ${(hi - lo).toFixed(0)} of its 400-wide range in 12s`);
  if (Math.abs(c.y - CY) > 2) fail(`y is ${c.y.toFixed(1)}, not resting on the floor at ${CY}`);
}

// --- 2. it sees the ball in front, on its level, within SEE — and only then --
{
  const cases = [
    { what: 'in front, near', ball: [1000 + K.SEE - 20], sees: true },
    { what: 'in front, too far', ball: [1000 + K.SEE + 40], sees: false },
    { what: 'behind, near', ball: [1000 - 100], sees: false },
    { what: 'in front, near, but high above', ball: [1100, CY - K.LEVEL_TOL - 60], sees: false },
  ];
  console.log('\n2. what it notices');
  for (const k of cases) {
    const level = room();
    const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: 1 }, CONFIG);
    level.noteBall(fakeBall(...k.ball));
    // Hold the ball level with the charger as it walks: a fresh ball each
    // step at the same offset, so patrol's own motion changes nothing.
    const off = k.ball[0] - c.x;
    let saw = false;
    run(level, c, 0.5, () => {
      level.noteBall(fakeBall(c.x + off, k.ball[1]));
      if (c.state === 'windup') saw = true;
    });
    console.log(`   ${k.what}: ${saw ? 'winds up' : 'ignores it'}`);
    if (saw !== k.sees) fail(`${k.what}: expected ${k.sees ? 'a wind-up' : 'no wind-up'}`);
  }
}

// --- 3. the wind-up lasts exactly WINDUP, standing still, then it charges ----
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  level.noteBall(fakeBall(1150));
  let upAt = null, chargeAt = null, drift = 0, x0 = null;
  run(level, c, 2, (_, i) => {
    if (c.state === 'windup' && upAt === null) { upAt = i; x0 = c.x; }
    if (c.state === 'windup') drift = Math.max(drift, Math.abs(c.x - x0));
    if (c.state === 'charge' && chargeAt === null) chargeAt = i;
  });
  const took = (chargeAt - upAt) * DT;
  console.log(`\n3. wind-up took ${took.toFixed(3)}s (WINDUP ${K.WINDUP}), moved ${drift.toFixed(2)}px`);
  if (upAt === null || chargeAt === null) fail('never wound up and charged');
  else if (Math.abs(took - K.WINDUP) > DT * 1.5) fail(`wind-up took ${took.toFixed(3)}s, not ${K.WINDUP}`);
  if (drift > 1) fail(`it moved ${drift.toFixed(2)}px while winding up — it must stand still`);
}

// --- 4. a charge is CHARGE_SPEED, straight, and does not turn to follow ------
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  level.noteBall(fakeBall(1150));
  let fastest = 0, turned = false;
  run(level, c, 2.5, () => {
    // The ball jumps behind it the moment the charge starts.
    if (c.state === 'charge') {
      level.noteBall(fakeBall(c.x - 100));
      fastest = Math.max(fastest, Math.abs(c.vx));
      if (c.dir !== 1) turned = true;
    }
  });
  console.log(`\n4. charge speed ${fastest.toFixed(0)} (CHARGE_SPEED ${K.CHARGE_SPEED})`);
  if (Math.abs(fastest - K.CHARGE_SPEED) > 1) fail(`charged at ${fastest.toFixed(0)}, not ${K.CHARGE_SPEED}`);
  if (turned) fail('turned round mid-charge to follow the ball');
}

// --- 5. the end of its range ends a charge: dazed, exactly at the bound -----
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1500, dir: 1 }, CONFIG);
  level.noteBall(fakeBall(1150));
  let maxX = 0, dazedAt = null;
  run(level, c, 3, () => {
    maxX = Math.max(maxX, c.x);
    if (c.state === 'dazed' && dazedAt === null) dazedAt = c.x;
  });
  console.log(`\n5. charge ended at x=${dazedAt?.toFixed(1)}, furthest ${maxX.toFixed(1)}, range ends 1500`);
  if (dazedAt === null) fail('a charge reaching the end of the range did not end dazed');
  if (maxX > 1500 + 0.01) fail(`went ${(maxX - 1500).toFixed(2)}px past the end of its range`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHARGER CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Run it to see it fail**

Run: `node games/pushkar-ball/tests/run.mjs offline/chargers`
Expected: FAIL. `makeCharger` is not exported from `enemies.js`.

- [ ] **Step 4: Add the shape and the charger to `enemies.js`**

Update the file's header comment to say "the enemy types" rather than "the three enemy types", and add a sentence: "The charger is written in the small state-machine shape below (`enterState`/`runStates`), which every new enemy uses."

After `makeRoller` and before `enemyHit`, add:

```js
/**
 * The shape every new enemy is written in: a table of named states, each an
 * `update(e, dt, level, cfg)` that returns the next state's name or nothing,
 * and optionally an `enter(e)`. `e.stateT` is seconds in the current state;
 * a timed state reads it itself.
 *
 * A state changes only on a timer or a distance check, never at random —
 * the same situation plays out the same way every time, which is what lets a
 * child learn it and Node test it.
 */
export function enterState(e, states, name) {
  e.state = name;
  e.stateT = 0;
  if (states[name].enter) states[name].enter(e);
}

/** One step of a state machine: age the state, ask it, and change if told to. */
export function runStates(e, states, dt, level, cfg) {
  e.stateT += dt;
  const next = states[e.state].update(e, dt, level, cfg);
  if (next && next !== e.state) enterState(e, states, next);
}

/**
 * Move a charger one step through the real physics, like the roller, and
 * report the contact in front of it, if any — something with a near-vertical
 * normal pointing back at it. Also keeps `grounded`, which the wiring reads.
 */
function stepCharger(c, level, dt, cfg) {
  const contacts = step(c, level, dt, cfg);
  c.grounded = contacts.some((k) => k.ny < -0.5);
  return contacts.find((k) => Math.abs(k.nx) > 0.5 && Math.sign(k.nx) === -c.dir) || null;
}

/** Is the ball on this charger's level, in front of it, and within SEE? */
function sees(c, level, K) {
  const b = level && level.ball;
  if (!b || b.dying) return false;
  const dx = b.x - c.x;
  return Math.sign(dx) === c.dir && Math.abs(dx) < K.SEE && Math.abs(b.y - c.y) < K.LEVEL_TOL;
}

const CHARGER = {
  patrol: {
    update(c, dt, level, cfg) {
      const K = cfg.ENEMY.CHARGER;
      if (c.x <= c.from) c.dir = 1;
      if (c.x >= c.to) c.dir = -1;
      if (sees(c, level, K)) return 'windup';
      c.vx = c.dir * K.PATROL_SPEED;
      // Anything solid in front turns it round — planks included: only a
      // charge breaks wood.
      if (stepCharger(c, level, dt, cfg)) c.dir = -c.dir;
    },
  },
  windup: {
    enter(c) { c.vx = 0; },
    update(c, dt, level, cfg) {
      c.vx = 0;
      stepCharger(c, level, dt, cfg);
      if (c.stateT >= cfg.ENEMY.CHARGER.WINDUP) return 'charge';
    },
  },
  charge: {
    update(c, dt, level, cfg) {
      c.vx = c.dir * cfg.ENEMY.CHARGER.CHARGE_SPEED;
      const hit = stepCharger(c, level, dt, cfg);
      // Never past the end of its range. levels.mjs proves there is ground
      // under all of it, which is what "never charges off a ledge" rests on.
      const end = c.dir > 0 ? c.to : c.from;
      if (c.dir > 0 ? c.x >= end : c.x <= end) {
        c.x = end;
        return 'dazed';
      }
      if (!hit) return;
      const owner = hit.seg.owner;
      if (owner && owner.breakable) {
        level.breakWood(owner);
        return;
      }
      if (owner && owner.movable) {
        c.shoving = owner;
        c.shoveLeft = cfg.ENEMY.CHARGER.CRATE_SHOVE;
      }
      return 'dazed';
    },
  },
  dazed: {
    enter(c) { c.vx = 0; },
    update(c, dt, level, cfg) {
      c.vx = 0;
      stepCharger(c, level, dt, cfg);
      // A crate it ran into slides on a little, at a crate's own push speed,
      // through the crate's own tryPush — which refuses anything that would
      // put it inside something, so a shove can never wedge a crate.
      if (c.shoving) {
        const moved = c.shoving.tryPush(c.dir * cfg.CRATE.PUSH_SPEED * dt, dt, level.solidsFor(c.shoving), cfg);
        c.shoveLeft -= Math.abs(moved);
        if (!moved || c.shoveLeft <= 0) c.shoving = null;
      }
      if (c.stateT >= cfg.ENEMY.CHARGER.DAZED) return 'patrol';
    },
  },
  popped: {
    enter(c) { c.vx = 0; c.vy = 0; c.shoving = null; },
    update(c, dt, level, cfg) {
      const K = cfg.ENEMY.CHARGER;
      if (c.stateT < K.RETURN) return;
      // Never back on top of him: it waits for the ball to be out of sight
      // of home.
      const b = level && level.ball;
      if (b && Math.abs(b.x - c.home.x) < K.SEE && Math.abs(b.y - c.home.y) < K.SEE) return;
      c.x = c.home.x; c.y = c.home.y;
      c.dir = c.home.dir;
      c.alive = true;
      c.returnT = K.PUFF_TIME;
      return 'patrol';
    },
  },
};

/**
 * Charger: patrols, notices the ball in front of it, winds up, charges in a
 * straight line until it meets something, and sits dazed. See the spec,
 * docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md.
 *
 * Moves through the real physics, like the roller, so gates, stone, crates
 * and slopes stop it with no special case. Hurts on any contact except while
 * dazed; can be stomped only while dazed; a popped one comes back.
 *
 * @param e   level data: { x, y, from, to, dir?: 1|-1 } — x, y is home
 */
export function makeCharger(e, cfg) {
  const K = cfg.ENEMY.CHARGER;
  const c = {
    kind: 'charger',
    alive: true,
    r: K.R,
    x: e.x,
    y: e.y,
    vx: 0,
    vy: 0,
    dir: e.dir ?? 1,
    from: e.from,
    to: e.to,
    home: { x: e.x, y: e.y, dir: e.dir ?? 1 },
    grounded: false,
    shoving: null,
    shoveLeft: 0,
    returnT: 0,          // cosmetic: its return puff
    state: 'patrol',
    stateT: 0,

    // What Level.update and the hit rules ask of any enemy that uses the
    // world. The roadmap's "holds a plate while dazed" is `heavy`.
    presses: true,
    get heavy() { return c.state === 'dazed'; },
    get stompable() { return c.state === 'dazed'; },
    get harmless() { return c.state === 'dazed'; },

    update(dt, t, level, cfg) {
      // stompEnemy only ever sets `alive`; the machine notices.
      if (!c.alive && c.state !== 'popped') enterState(c, CHARGER, 'popped');
      c.returnT = Math.max(0, c.returnT - dt);
      runStates(c, CHARGER, dt, level, cfg);
    },

    box() {
      return { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 };
    },

    /** A charger never throws anything. */
    activeProjectile(t) {
      return null;
    },
  };
  return c;
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node games/pushkar-ball/tests/run.mjs offline/chargers`
Expected: `ALL CHARGER CHECKS PASSED`. If check 1 shows the charger sinking or floating, print `c.y` and `c.grounded` for the first 20 steps before changing anything. It starts resting exactly on the floor, the way the roller does in `enemies.mjs` check 4.

- [ ] **Step 6: Run the enemy suites to confirm nothing else moved**

Run: `node games/pushkar-ball/tests/run.mjs offline/enemies`
Expected: passes, unchanged.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/enemies.js games/pushkar-ball/tests/offline/chargers.mjs
git commit -m "Add the enemy state-machine shape and a charger that patrols, sees, winds up and charges"
```
(with the Co-Authored-By line)

---

### Task 2: What a charge meets — stone, planks, a crate — and coming back

**Files:**
- Modify: `games/pushkar-ball/tests/offline/chargers.mjs` (append checks 6–10 before the final summary lines)
- Modify: `games/pushkar-ball/js/enemies.js` only if a check fails for a real reason

- [ ] **Step 1: Append the checks**

Insert before the `console.log(failures ? ...` line:

```js
/** Wind a charger up at a ball placed `ahead` in front of it, and run `seconds`. */
function chargeAt(level, c, ahead, seconds, each) {
  level.noteBall(fakeBall(c.x + c.dir * ahead));
  run(level, c, seconds, (cc, i) => {
    // The ball steps out of the way once the charge is under way.
    if (c.state === 'charge') level.noteBall(fakeBall(c.x - c.dir * 400, CY - 300));
    return each ? each(cc, i) : undefined;
  });
}

// --- 6. stone ends a charge: dazed against it, for DAZED, then patrol ------
{
  const level = room({ boxes: [{ x: 1400, y: 660, w: 60, h: 100 }] });
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  let dazedX = null, dazedFor = 0, after = null;
  chargeAt(level, c, 150, 6, () => {
    if (c.state === 'dazed') { if (dazedX === null) dazedX = c.x; dazedFor += DT; }
    else if (dazedX !== null && after === null) after = c.state;
  });
  console.log(`\n6. stone: dazed at x=${dazedX?.toFixed(1)} (stone face 1400) for ${dazedFor.toFixed(2)}s, then '${after}'`);
  if (dazedX === null) fail('running into stone did not daze it');
  else if (Math.abs(dazedX + K.R - 1400) > 3) fail(`dazed at ${dazedX.toFixed(1)}, not flush against the stone`);
  if (Math.abs(dazedFor - K.DAZED) > DT * 2) fail(`dazed for ${dazedFor.toFixed(2)}s, not ${K.DAZED}`);
  if (after !== 'patrol') fail(`after dazed it went to '${after}', not patrol`);
}

// --- 7. planks: broken, and the charge goes on through --------------------
{
  const level = room({ breakables: [{ x: 1300, y: 560, w: 30, h: 200 }] });
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: 1 }, CONFIG);
  let brokeAt = null, dazedX = null;
  chargeAt(level, c, 150, 4, () => {
    if (level.breakables[0].broken && brokeAt === null) brokeAt = c.x;
    if (c.state === 'dazed' && dazedX === null) dazedX = c.x;
  });
  console.log(`\n7. planks: broken with the charger at x=${brokeAt?.toFixed(0)}; charge ended at x=${dazedX?.toFixed(0)}`);
  if (brokeAt === null) fail('a charge did not break the planks');
  if (dazedX === null || dazedX < 1800 - 1) fail(`the charge stopped at ${dazedX?.toFixed(0)} instead of going on to the end of its range`);
}

// --- 8. a patrol only turns at planks; it never breaks them ---------------
{
  const level = room({ breakables: [{ x: 1300, y: 560, w: 30, h: 200 }] });
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: 1 }, CONFIG);
  let hi = 0;
  run(level, c, 10, () => { hi = Math.max(hi, c.x); });
  console.log(`\n8. a patrol into planks turned at x=${hi.toFixed(0)}; broken=${level.breakables[0].broken}`);
  if (level.breakables[0].broken) fail('a patrol broke the planks');
  if (hi > 1300 - K.R + 2) fail(`patrol got to ${hi.toFixed(0)}, into the planks`);
}

// --- 9. a crate: shoved CRATE_SHOVE on, the charger dazed -------------------
{
  const level = room({ boxes: [{ x: 1300, y: 660, w: 100, h: 100, movable: true }] });
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  const crate = level.crates[0];
  let dazed = false;
  chargeAt(level, c, 150, 3, () => { if (c.state === 'dazed') dazed = true; });
  const moved = crate.x - 1300;
  console.log(`\n9. crate: moved ${moved.toFixed(1)} (CRATE_SHOVE ${K.CRATE_SHOVE}); dazed=${dazed}`);
  if (!dazed) fail('running into a crate did not daze it');
  if (Math.abs(moved - K.CRATE_SHOVE) > 3) fail(`the crate moved ${moved.toFixed(1)}, not ${K.CRATE_SHOVE}`);

  // And a crate with stone just past it moves only as far as the stone.
  const level2 = room({ boxes: [{ x: 1300, y: 660, w: 100, h: 100, movable: true }, { x: 1420, y: 560, w: 40, h: 200 }] });
  const c2 = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  chargeAt(level2, c2, 150, 3);
  const cr2 = level2.crates[0];
  console.log(`   crate with stone 20 past it: right edge at ${(cr2.x + cr2.w).toFixed(1)} (stone at 1420)`);
  if (cr2.x + cr2.w > 1420 + 0.01) fail('a shove put the crate inside the stone');
}

// --- 10. popped: gone for RETURN at least, back home only once the ball is away --
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: -1 }, CONFIG);
  c.alive = false;                        // what stompEnemy does
  level.noteBall(fakeBall(1100));         // standing near home
  let backAt = null;
  run(level, c, K.RETURN + 3, (_, i) => {
    if (i * DT > K.RETURN + 1) level.noteBall(fakeBall(1000 + K.SEE + 50));
    if (c.alive && backAt === null) { backAt = i * DT; return false; }
  });
  console.log(`\n10. popped: back after ${backAt?.toFixed(2)}s (RETURN ${K.RETURN}; the ball left at ${(K.RETURN + 1).toFixed(1)}s)`);
  if (backAt === null) fail('a popped charger never came back');
  else if (backAt < K.RETURN + 1 - DT) fail(`came back at ${backAt.toFixed(2)}s, with the ball still near home`);
  if (c.alive && (Math.abs(c.x - 1000) > 30 || c.dir !== -1)) fail(`came back at x=${c.x.toFixed(0)} facing ${c.dir}, not home facing -1`);
}
```

- [ ] **Step 2: Run them**

Run: `node games/pushkar-ball/tests/run.mjs offline/chargers`
Expected: all ten pass with the Task 1 code. If one fails, instrument first: print `c.state`, `c.x`, `c.vx` and the front contact's `seg.owner` on the failing steps. Two likely real causes:
- Check 7: `breakWood` empties the plank's segments, but `resolve` already took the charger's speed this step. That is fine because `charge.update` sets `vx` again every step. If the charger still stops, the contact came from another segment, so print it.
- Check 9's shove: `crate.update` runs before the enemies in `Level.update` and zeroes `dx`. The shove then happens in the charger's update, which is the same order a ball's push uses, so nothing to fix.

- [ ] **Step 3: Commit**

```bash
git add games/pushkar-ball/tests/offline/chargers.mjs games/pushkar-ball/js/enemies.js
git commit -m "Prove what a charge meets: stone, planks, a crate, and its return"
```

---

### Task 3: The charger in a level — wiring, stomping, harm

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (import line ~22; `MAKERS` ~1668; `Level.update` presser block ~1723; `hazardKnockDir` ~1880; `stompEnemy` ~1905)
- Modify: `games/pushkar-ball/tests/offline/chargers.mjs` (append checks 11–14)

- [ ] **Step 1: Append the failing checks**

Add `const { Ball } = await import('../../js/player.js');` after the other imports at the top of `chargers.mjs`, then insert before the summary:

```js
// --- 11. in a level: a charge into a button's cap presses it ----------------
{
  const level = room({
    senders: [{ id: 'b', kind: 'button', x: 1400, y: FLOOR, face: 'left' }],
    enemies: [{ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }],
  });
  const c = level.enemies[0];
  level.noteBall(fakeBall(1150));
  let dazed = false;
  for (let i = 0; i < Math.round(3 / DT); i++) {
    if (c.state === 'charge') level.noteBall(fakeBall(600, CY - 300));
    level.update(DT);
    if (c.state === 'dazed') dazed = true;
  }
  console.log(`\n11. charge into a button: pressed=${level.senders[0].pressed}, dazed=${dazed}`);
  if (!level.senders[0].pressed) fail('a charge into a button\'s capped side did not press it');
  if (!dazed) fail('a button\'s post did not daze it');
}

// --- 12. a plate: held only while dazed; a gate never closes on it -----------
{
  const level = room({
    boxes: [{ x: 1460, y: 560, w: 40, h: 200 }],
    senders: [{ id: 'p', kind: 'plate', x: 1350, y: FLOOR, w: 110 }],
    enemies: [{ kind: 'charger', x: 1400, y: CY, from: 1100, to: 1434, dir: -1 }],
  });
  const c = level.enemies[0];
  const p = level.senders[0];
  let pressedPatrolling = false;
  for (let i = 0; i < Math.round(3 / DT); i++) {
    level.update(DT);
    if (c.state === 'patrol' && p.pressed) pressedPatrolling = true;
  }
  console.log(`\n12a. patrolling over a plate: ever pressed=${pressedPatrolling}`);
  if (pressedPatrolling) fail('a patrolling charger held a plate — only a dazed one may');

  // Now lure it right, into the stone, onto the plate: once it faces that
  // way with room to wind up, or it would not see the ball at all.
  while (c.dir !== 1 || c.x > 1300) level.update(DT);
  level.noteBall(fakeBall(c.x + 150));
  let heldWhileDazed = true, sawDazed = false;
  for (let i = 0; i < Math.round(3 / DT); i++) {
    if (c.state === 'charge') level.noteBall(fakeBall(600, CY - 300));
    level.update(DT);
    if (c.state === 'dazed' && c.stateT > 0.1) { sawDazed = true; if (!p.pressed) heldWhileDazed = false; }
  }
  console.log(`12b. dazed on the plate: seen=${sawDazed}, held throughout=${heldWhileDazed}, at x=${c.x.toFixed(0)}`);
  if (!sawDazed) fail('the charge did not end dazed on the plate');
  if (!heldWhileDazed) fail('a dazed charger on the plate did not hold it');
}
{
  // A gate whose power goes while the charger is under it holds. The gate
  // is opened by hand first: a charger authored inside a closed gate would
  // be pushed out of it by the physics before anything was tested.
  const level = room({
    senders: [{ id: 't', kind: 'timer', x: 700, y: FLOOR, face: 'right', time: 0.5 }],
    gates: [{ x: 1180, y: 560, w: 40, h: 200, needs: ['t'] }],
    enemies: [{ kind: 'charger', x: 1200, y: CY, from: 1190, to: 1210, dir: 1 }],
  });
  const g0 = level.gates[0];
  g0.openT = 1;
  g0.update(0, true, false);
  level.senders[0].pressed = true; level.senders[0].left = 0.5;
  for (let i = 0; i < Math.round(2 / DT); i++) level.update(DT);
  const g = level.gates[0];
  console.log(`12c. a gate over a charger after its timer ran out: openT=${g.openT.toFixed(2)}`);
  if (g.openT < 0.5) fail('a gate came down on a charger');
}

// --- 13. the real ball: landing on a charger that is not dazed is a hit -----
function dropOn(state) {
  const level = room({ enemies: [{ kind: 'charger', x: 1000, y: CY, from: 990, to: 1010, dir: 1 }] });
  const c = level.enemies[0];
  const ball = new Ball(1000, 500);
  const input = { left: false, right: false, takeJump: () => false };
  for (let i = 0; i < Math.round(2 / DT); i++) {
    if (state === 'dazed' && c.state !== 'dazed' && c.alive) { c.state = 'dazed'; c.stateT = 0; }
    level.update(DT);
    ball.update(DT, input, level);
    if (!c.alive || ball.hits) break;
  }
  return { hits: ball.hits, popped: !c.alive };
}
{
  const walking = dropOn('patrol');
  const dazed = dropOn('dazed');
  console.log(`\n13. landing on it: patrolling -> hits=${walking.hits} popped=${walking.popped}; dazed -> hits=${dazed.hits} popped=${dazed.popped}`);
  if (walking.popped) fail('a patrolling charger was stomped — only a dazed one may be');
  if (walking.hits !== 1) fail('landing on a patrolling charger did not cost a heart');
  if (!dazed.popped) fail('landing on a dazed charger did not pop it');
  if (dazed.hits) fail('landing on a dazed charger cost a heart');
}

// --- 14. touching a dazed charger from the side is harmless -----------------
{
  const level = room({ enemies: [{ kind: 'charger', x: 1000, y: CY, from: 990, to: 1010, dir: 1 }] });
  const c = level.enemies[0];
  const ball = new Ball(800, FLOOR - CONFIG.BALL.R);
  const input = { left: false, right: true, takeJump: () => false };
  for (let i = 0; i < Math.round(1.5 / DT); i++) {
    c.state = 'dazed'; c.stateT = 0;      // held dazed for the test's length
    level.update(DT);
    ball.update(DT, input, level);
  }
  console.log(`\n14. rolled through a dazed charger: hits=${ball.hits}, now at x=${ball.x.toFixed(0)}`);
  if (ball.hits) fail('touching a dazed charger cost a heart');
  if (ball.x < 1100) fail('a dazed charger stopped the ball — it is not a collider');
}
```

Checks 13 and 14 hold the charger dazed by writing `state` directly. That is a test reaching into the game's own state, not test-only code in the game.

- [ ] **Step 2: Run to see them fail**

Run: `node games/pushkar-ball/tests/run.mjs offline/chargers`
Expected: 11 fails first with `MAKERS[e.kind] is not a function`.

- [ ] **Step 3: Wire it into `levels.js`**

Import:
```js
import { makeWalker, makeRoller, makePopper, makeCharger, enemyHit, projectileHit } from './enemies.js';
```

`MAKERS`, and extend the comment above it by one sentence ("The charger moves the same way the roller does."):
```js
    const MAKERS = { walker: makeWalker, roller: makeRoller, popper: makePopper, charger: makeCharger };
```

In `Level.update`, directly after the `if (b) { ... }` block that adds the ball, before `updateSenders(...)`:
```js
    // Enemies that use the world — so far the charger. Each one answers the
    // two questions above for itself: it presses with its own box, it is
    // heavy only when it says so (a charger, only while dazed), and a gate
    // never closes on it. A popped one is not there at all.
    for (const e of this.enemies) {
      if (!e.alive || !e.presses) continue;
      const box = { ...e.box(), heavy: e.heavy, resting: e.grounded };
      pressers.push(box);
      blockers.push(box);
    }
```
Update the long comment above `const pressers` so it no longer says the lists hold only crates and the ball.

In `hazardKnockDir`, replace `const e = enemyHit(body, this.enemies);` with:
```js
    // A dazed charger is harmless to touch — it can be stomped, or rolled
    // straight through.
    const e = enemyHit(body, this.enemies.filter((x) => !x.harmless));
```

In `stompEnemy`, directly after `if (!e) return false;`:
```js
    // A charger can be stomped only while dazed. Any other landing on it is
    // left to hazardKnockDir, which player.js asks next, and costs a heart.
    if (e.stompable === false) return false;
```

- [ ] **Step 4: Run to see them pass**

Run: `node games/pushkar-ball/tests/run.mjs offline/chargers`
Expected: all 14 pass. If 12b fails, print `c.x`, `c.dir` and `c.state` from the lure onwards before changing anything. The lure waits until the charger faces right and is at least 134 short of the stone, so it has room to wind up and charge.

- [ ] **Step 5: Run the whole offline set**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite passes except the pre-existing "level 7 has no route" line in `finish.mjs`.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/chargers.mjs
git commit -m "Let a charger press buttons, hold a plate while dazed, and be stomped only then"
```

---

### Task 4: Drawing the charger

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (`COLOURS`, beside `ENEMY_EYE`)
- Modify: `games/pushkar-ball/js/enemies.js` (`drawEnemies`, new `drawCharger`)

The browser check for this is in Task 8. Here the drawing is written and then looked at.

- [ ] **Step 1: Colours**

In `COLOURS`, after `ENEMY_EYE`:
```js
    // The charger's dust and dazed stars. Neither can read as the ball to
    // IS_BALL in tests/browser/_helpers.mjs: the dust's red is only 41 above
    // its blue (the test needs 60), and the stars' green is far above their
    // blue, not barely above it.
    CHARGER_DUST: '#D9CBB0',
    CHARGER_STAR: '#FFD84A',
```

- [ ] **Step 2: Dispatch in `drawEnemies`**

```js
    if (e.kind === 'popper') drawPopper(ctx, e, cfg);
    else if (e.kind === 'charger') drawCharger(ctx, e, time, cfg);
    else drawSpikyBody(ctx, e, cfg);
```
`drawEnemies` skips `!e.alive`, so a popped charger is not drawn. Its return puff is drawn by `drawCharger` from `returnT` once it is alive again.

- [ ] **Step 3: `drawCharger`**

Add after `drawPopper`:

```js
/**
 * A charger: a low, wide body with two horns pointing the way it faces, a
 * heavy brow and the shared angry face — a different silhouette from the
 * walker's ring of spikes, so the two never read as the same thing.
 *
 * The pose is the warning, and there is no text: a crouch, a pawing foot and
 * dust for the wind-up; a lean and streaks for the charge; a wobble and
 * stars for dazed, the stars going one by one as the daze runs out. Nothing
 * held, nothing thrown.
 */
function drawCharger(ctx, e, time, cfg) {
  const C = cfg.COLOURS, K = cfg.ENEMY.CHARGER;
  const r = e.r, d = e.dir;
  const feet = e.y + r;
  let squash = 1, lean = 0, paw = 0;
  if (e.state === 'windup') { squash = 0.82; paw = Math.sin(e.stateT * 28) * r * 0.25; }
  if (e.state === 'charge') lean = 0.22;
  if (e.state === 'dazed') lean = Math.sin(time * 9) * 0.12;

  // Behind the body: dust while winding up, streaks while charging.
  if (e.state === 'windup') {
    ctx.fillStyle = C.CHARGER_DUST;
    for (let i = 0; i < 3; i++) {
      const grow = (e.stateT * 3 + i / 3) % 1;
      ctx.beginPath();
      ctx.arc(e.x - d * (r * 1.1 + grow * r), feet - r * 0.2 - grow * r * 0.5, r * (0.18 + 0.2 * grow), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (e.state === 'charge') {
    ctx.strokeStyle = C.CHARGER_DUST;
    ctx.lineWidth = 4;
    for (const k of [0.3, 0.8, 1.3]) {
      ctx.beginPath();
      ctx.moveTo(e.x - d * r * 1.4, feet - r * k);
      ctx.lineTo(e.x - d * r * 2.4, feet - r * k);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(e.x, feet);
  ctx.rotate(lean * d);
  ctx.scale(d, squash);           // draw facing right; the scale mirrors it

  // Stubby legs, the front one pawing during the wind-up.
  ctx.fillStyle = C.ENEMY_EDGE;
  ctx.fillRect(-r * 0.8, -r * 0.35, r * 0.4, r * 0.35);
  ctx.fillRect(r * 0.35 + paw, -r * 0.35, r * 0.4, r * 0.35);

  // A low dome of a body, wider than it is tall.
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.35, r * 1.2, r * 1.2, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = C.ENEMY;
  ctx.fill();
  ctx.strokeStyle = C.ENEMY_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Two horns out of the front of the head, pointing forward.
  ctx.fillStyle = C.ENEMY_EDGE;
  for (const up of [0.95, 0.6]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -r * up - r * 0.12);
    ctx.lineTo(r * 1.55, -r * up - r * 0.35);
    ctx.lineTo(r * 0.75, -r * up + r * 0.14);
    ctx.closePath();
    ctx.fill();
  }

  // A heavy brow over the face.
  ctx.fillRect(r * 0.05, -r * 1.12, r * 0.95, r * 0.16);
  ctx.restore();

  // The shared face, drawn unmirrored so it never reads backwards, pushed
  // towards the front.
  drawAngryFace(ctx, e.x + d * r * 0.5, feet - r * 0.8 * squash, r * 0.42, cfg);

  // Dazed: stars round its head, one fewer each third of the daze.
  if (e.state === 'dazed') {
    const left = Math.ceil(3 * (1 - e.stateT / K.DAZED));
    ctx.fillStyle = C.CHARGER_STAR;
    for (let i = 0; i < left; i++) {
      const a = time * 3 + (i / 3) * Math.PI * 2;
      drawStar(ctx, e.x + Math.cos(a) * r * 0.9, feet - r * 1.9 + Math.sin(a) * r * 0.25, r * 0.28);
    }
  }

  // Coming back: a puff that swells and fades.
  if (e.returnT > 0) {
    const f = 1 - e.returnT / K.PUFF_TIME;
    ctx.globalAlpha = 1 - f;
    ctx.fillStyle = C.CHARGER_DUST;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * r * (0.6 + f), e.y + Math.sin(a) * r * (0.6 + f), r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** A five-pointed cartoon star. */
function drawStar(ctx, cx, cy, s) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 === 0 ? s : s * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
```

- [ ] **Step 4: Check nothing offline broke**

Run: `node games/pushkar-ball/tests/run.mjs offline/enemies` and `... offline/chargers`
Expected: both pass. `enemies.js` is imported by Node, and drawing is only defined here, never called.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/enemies.js
git commit -m "Draw the charger: its own silhouette, and a pose for each state"
```

---

### Task 5: The levels suite learns the charger

**Files:**
- Modify: `games/pushkar-ball/tests/offline/levels.mjs` (check 11 near line 282; the gate loop near line 386; a new check before the final summary)

- [ ] **Step 1: Add the branches and the new check**

In check 11's `for (const [i, e] of (data.enemies || []).entries())`, add a branch after the `roller` one:
```js
    } else if (e.kind === 'charger') {
      const r = CONFIG.ENEMY.CHARGER.R;
      if (e.from - r < 0 || e.to + r > authored.bounds.w) {
        fail(`level ${data.id}: charger ${i} ranges ${e.from}..${e.to}, outside the level`);
      }
      if (!(e.from <= e.x && e.x <= e.to)) fail(`level ${data.id}: charger ${i}'s home x=${e.x} is outside its own range`);
```

In the gate loop, after the roller branch:
```js
      } else if (e.kind === 'charger') {
        // A charger is a blocker, so a gate would hang open over it rather
        // than close through it — which looks just as broken.
        const r = CONFIG.ENEMY.CHARGER.R;
        if (e.from - r < ghi && e.to + r > glo) fail(`level ${data.id}: a charger ranges under the gate at x=${g.x}`);
```

Before the final `console.log(failures ? ...`:
```js
// --- chargers: ground under the whole range, and no checkpoint in sight ----
//
// "Never charges off a ledge" rests on this: a charge ends at the end of its
// range, so if every x in the range, plus the body's radius each side, has
// ground under it at the charger's own feet, there is no ledge to go off.
// And the roadmap's "never at a checkpoint": a ball respawning must not be
// in sight of one — SEE past either end of its range.
{
  const R = CONFIG.ENEMY.CHARGER.R, SEE = CONFIG.ENEMY.CHARGER.SEE;
  let n = 0;
  for (const data of LEVELS) {
    const level = loadLevel(data);
    for (const [i, e] of (data.enemies || []).entries()) {
      if (e.kind !== 'charger') continue;
      n++;
      const feet = e.y + R;
      for (let x = e.from - R; x <= e.to + R; x += 5) {
        const held = level.statics.some((s) => s.ny < -0.9 &&
          Math.min(s.ax, s.bx) <= x && Math.max(s.ax, s.bx) >= x &&
          Math.abs(s.ay + (s.by - s.ay) * ((x - s.ax) / ((s.bx - s.ax) || 1)) - feet) < 2);
        if (!held) { fail(`level ${data.id}: charger ${i} has no ground under x=${x} at y=${feet}`); break; }
      }
      for (const c of data.checkpoints || []) {
        if (c.x > e.from - SEE && c.x < e.to + SEE && Math.abs(c.y - feet) < 200) {
          fail(`level ${data.id}: checkpoint at x=${c.x} is within sight of charger ${i} (${e.from}..${e.to}, SEE ${SEE})`);
        }
      }
    }
  }
  console.log(`\nchargers: ${n} checked for ground under their whole range and checkpoints out of sight`);
}
```

- [ ] **Step 2: Run it**

Run: `node games/pushkar-ball/tests/run.mjs offline/levels`
Expected: passes, reporting `0 checked` because no level has a charger yet. To confirm the ground check can fail at all, temporarily put `{ kind: 'charger', x: 2700, y: 734, from: 2500, to: 2900 }` into level 8's `enemies` (its ground has a hole at 2600–2800) and run it: it must fail with "no ground under x=…". Then remove the line. The throwaway edit is not committed.

- [ ] **Step 3: Commit**

```bash
git add games/pushkar-ball/tests/offline/levels.mjs
git commit -m "Teach the levels suite the charger: range, ground, gates, checkpoints"
```

---

### Task 6: Level 10 — Introduction

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (append to `LEVELS`, after level 9's closing `},`)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (a `dodge` helper after `waitForLow`; `ROUTES[10]`; probe 3l)

The numbers below are a starting layout worked out on paper. `finish.mjs` decides whether they stand. If a position moves, keep the constraints in the level's header comment true and write down in the comment what the sweep found, the way levels 6 and 8 do.

- [ ] **Step 1: Write the route first**

In `finish.mjs`, after `waitForLow`:

```js
/**
 * What a child does about a charger, or null if none needs anything.
 *
 * Stand still while one winds up or charges at him, and jump when a charge
 * is `150 * lead` away. Worked on paper and swept in Node: jumping from rest,
 * the ball clears the charger's 52-tall box if the charge is 84 to 248 away,
 * centre to centre, so 105 (lead 0.7) to 195 (lead 1.3) all sit inside it.
 * A dazed one is left to the caller: rolled through or stomped.
 */
function dodge(level, ball, lead) {
  for (const c of level.enemies) {
    if (c.kind !== 'charger' || !c.alive) continue;
    if (Math.abs(c.y - ball.y) > 60) continue;
    const toward = Math.sign(ball.x - c.x) === c.dir;
    const gap = Math.abs(ball.x - c.x);
    if (!toward || gap > 400) continue;
    if (c.state === 'charge' && gap < 150 * lead) return { jump: ball.grounded };
    if (c.state === 'charge' || c.state === 'windup') return {};
    // Patrolling towards him and about to see him: wait for it.
    if (c.state === 'patrol' && gap < 320) return {};
  }
  // Patrolling away from him, ahead: wait for it to turn round rather than
  // catch it up and land on it, which costs a heart. Every level goes right,
  // so "ahead" is to the right.
  for (const c of level.enemies) {
    if (c.kind !== 'charger' || !c.alive || c.state !== 'patrol') continue;
    if (Math.abs(c.y - ball.y) > 60) continue;
    if (c.x > ball.x && c.dir === 1 && c.x - ball.x < 400) return {};
  }
  return null;
}
```

In `ROUTES`, add (after the entry for 9):

```js
  // Level ten: wait for the charger, jump its charge into the stone step,
  // then wait by the planks for the second charge, which breaks them.
  10: (level, lead) => {
    const run = runner(level, lead);
    const c = level.enemies.find((e) => e.kind === 'charger');
    const wood = level.breakables[0];
    let stage = 'in';
    return (ball) => {
      const d = dodge(level, ball, lead);
      if (d) return d;
      if (stage === 'in') {
        if (ball.grounded && ball.x > 1700) stage = 'wait1';
        else return run(ball);
      }
      // Popped (a hop over the step can land on it while dazed) is as good
      // as dazed behind him; with it gone, the ball breaks the planks itself.
      if (stage === 'wait1') {
        if (!c.alive || (c.state === 'dazed' && c.x < ball.x)) stage = 'wait2';
        else return {};
      }
      if (stage === 'wait2') {
        if (wood.broken || !c.alive) stage = 'out';
        else return ball.x < 2150 ? { right: true } : {};
      }
      return run(ball);
    };
  },
```

- [ ] **Step 2: Run to see it fail**

Run: `node games/pushkar-ball/tests/run.mjs offline/finish`
Expected: `level 10` doesn't exist yet, so nothing new runs. It passes as before (level 7 still reports). Moving on to the data is the failing half.

- [ ] **Step 3: Append level 10**

```js
  {
    // Level ten: the charger. Stage: INTRODUCTION — see the roadmap and
    // docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md.
    // The one new idea: this one warns you, then runs at you. Jump the run,
    // and while it sits dazed, it is yours to stomp.
    //
    // A pen, entered over the recurring 60 stone step at 1400, with nothing
    // else in it that can hurt. The charger starts at 2100 facing left and
    // patrols towards a ball waiting inside the step; its first charge runs
    // into the step's stone face and ends dazed at 1486, a stomp away. Its
    // second, once it has turned and come back right, runs into the planks
    // at 2300 — 200 tall, which no jump clears — breaks them, and carries on
    // to the end of its range at 2800. The ball could break them too; nothing
    // depends on who does. Then level six's warm-up shape: a proven 200 gap
    // and the long stone step, to the flag.
    id: 10,
    theme: 'hills',
    bounds: { w: 6000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 5700, y: 760 },

    ground: [
      [[40, 760], [3600, 760]],
      [[3800, 760], [5960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 5960, y: 0, w: 40, h: 1080 },
      // The pen's left end: the recurring low step, and the stone the first
      // charge stops against.
      { x: 1400, y: 700, w: 60, h: 60 },
      // The long stone step of the warm-up.
      { x: 4500, y: 700, w: 200, h: 60 },
    ],

    breakables: [
      { x: 2300, y: 560, w: 30, h: 200 },
    ],

    platforms: [],

    enemies: [
      { kind: 'charger', x: 2100, y: 760 - CONFIG.ENEMY.CHARGER.R, from: 1486, to: 2800, dir: -1 },
    ],

    // Out of the charger's sight: its range ends at 2800 and it sees 240.
    checkpoints: [
      { x: 3300, y: 760 },
    ],
  },
```

- [ ] **Step 4: Run levels and finish**

Run: `node games/pushkar-ball/tests/run.mjs offline/levels`, then `... offline/finish`
Expected: `levels` passes, and `finish` reports `level 10: finished every time without failing`, including from its checkpoint.

If a run fails, print the run's `lead`, `delay`, the charger's `state`/`x` and the ball's `x`/`hits` at each change of the route's `stage`, before touching anything. Likely real causes:
- The ball is caught by a patrol it walks into before `wait1`. Move the wait point (1700) or the charger's home, and write down why.
- The second charge never comes because the charger doesn't turn at the step. Its patrol turns on a wall contact, and the step is only 60 tall against a 52-tall box, so the contact normal can be a corner. Check with a print. If that's what's happening, raise `from` to 1490 so the range end turns it before the stone does.

- [ ] **Step 5: Add probe 3l — stomping it is safe, and it comes back**

After probe 3k in `finish.mjs`:

```js
// --- 3l. level ten: a stomp after the first charge, and the level still goes -
//
// The optional lesson: stomp it while dazed. Then the charger is gone, comes
// back at home once the ball is out of sight, and the level still finishes —
// by the ball breaking the planks itself.
console.log('\n3l. level ten: stomp the dazed charger, and still finish');
{
  const data = LEVELS.find((l) => l.id === 10);
  for (const lead of LEADS) {
    let stomped = false, back = false;
    const route = (level) => {
      const run = runner(level, lead);
      const c = level.enemies[0];
      let stage = 'in';
      return (ball) => {
        if (!c.alive) stomped = true;
        if (stomped && c.alive) back = true;
        const d = dodge(level, ball, lead);
        if (d) return d;
        if (stage === 'in') { if (ball.grounded && ball.x > 1700) stage = 'wait'; else return run(ball); }
        if (stage === 'wait') { if (c.state === 'dazed') stage = 'stomp'; else return {}; }
        // Roll back into it (dazed, it is not solid and does not hurt),
        // settle over it, and jump straight up: the way down is the stomp.
        if (stage === 'stomp') {
          if (!c.alive) { stage = 'out'; return {}; }
          const gap = ball.x - c.x;
          if (gap > 30) return { left: true };
          if (gap < -30) return { right: true };
          return { jump: ball.grounded && Math.abs(ball.vx) < 80 };
        }
        return run(ball);
      };
    };
    const { ball, t } = play(data, route, { seconds: 90 });
    console.log(`   lead ${lead}: stomped=${stomped}, came back=${back}, won=${ball.won} in ${t.toFixed(1)}s, hits=${ball.hits}`);
    if (!stomped) fail(`level ten, lead ${lead}: never stomped the dazed charger`);
    if (!ball.won || ball.deaths) fail(`level ten, lead ${lead}: after a stomp the level was not finished cleanly`);
  }
}
```
`back` is printed and not asserted: whether it comes back before the flag depends on the route's speed, and the return itself is proved in `chargers.mjs` check 10.

- [ ] **Step 6: Run and commit**

Run: `node games/pushkar-ball/tests/run.mjs offline/finish`
Expected: level 10, its checkpoint and 3l all pass.

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs
git commit -m "Add level ten: the charger, introduced in a pen"
```

---

### Task 7: Level 11 — Combination

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (append to `LEVELS`)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (`SPARE11`, `ROUTES[11]`, section 2c, probes 3m and 3n)

Both rooms have the same shape: a pen under a stone roof, a yard beyond it, and a wall with a door. The spec's closing paragraph on level 11 explains why. As for level 10, `finish.mjs` decides the numbers, and the header comment keeps the constraints.

- [ ] **Step 1: The route and the spare-time measure**

Next to `const SPARE9 = [];`:
```js
const SPARE11 = [];
```

In `ROUTES`:
```js
  // Level eleven. Room A: over the pen's roof, down into the yard, and wait —
  // the charger sees him, smashes the planks and hits the button. Room B: the
  // same, except the charge ends dazed on a plate, and the door is open only
  // while it sits there.
  11: (level, lead) => {
    const run = runner(level, lead);
    const [gateA, gateB] = level.gates;
    const p = level.senders.find((s) => s.id === 'p');
    let stage = 'toA', dazedAt = 0, hopped = false;
    return (ball) => {
      if (stage === 'toA') {
        if (ball.grounded && ball.y > 700 && ball.x > 3110) stage = 'lureA';
        else return { right: true };
      }
      if (stage === 'lureA') {
        if (gateA.openT > 0.9) stage = 'mid';
        else return {};
      }
      if (stage === 'mid') {
        if (ball.x > 4300) stage = 'toB';
        else return run(ball);
      }
      if (stage === 'toB') {
        if (ball.grounded && ball.y > 700 && ball.x > 5820) stage = 'lureB';
        else return { right: true };
      }
      // Stand close enough to be seen. The drop off the roof carries the
      // ball on towards the door, out of sight, so come back to 5860-5900.
      if (stage === 'lureB') {
        if (p.pressed) { stage = 'goB'; dazedAt = level.time; }
        else if (ball.x > 5900) return { left: true };
        else return ball.x < 5860 ? { right: true } : {};
      }
      // The same sloppy thumb as level nine's: it hesitates longer the
      // sloppier the lead, and at the sloppiest hops once for nothing.
      if (stage === 'goB') {
        if (level.time - dazedAt < (lead - 0.7) * 1.5) return {};
        if (ball.x > gateB.x + gateB.w + 20) {
          SPARE11.push({ lead, used: level.time - dazedAt, time: CONFIG.ENEMY.CHARGER.DAZED });
          stage = 'end';
        } else {
          const hop = lead > 1.2 && !hopped && ball.grounded;
          if (hop) hopped = true;
          return { right: true, jump: hop };
        }
      }
      return run(ball);
    };
  },
```

After section 2b:
```js
// --- 2c. level eleven's door is never a pixel-perfect run --------------------
console.log('\n2c. level eleven: time to spare while the charger is dazed');
if (!SPARE11.length) fail('no run of level eleven ever got through its second door — nothing was measured');
else {
  const worst = SPARE11.reduce((w, s) => Math.max(w, s.used / s.time), 0);
  const tight = SPARE11.filter((s) => s.used > 0.6 * s.time);
  if (tight.length) fail(`${tight.length} of ${SPARE11.length} runs used more than 60% of the daze (worst ${(worst * 100).toFixed(0)}%)`);
  else console.log(`   ${SPARE11.length} runs; the slowest used ${(worst * 100).toFixed(0)}% of the daze`);
}
```

- [ ] **Step 2: Append level 11**

```js
  {
    // Level eleven: lure the charger. Stage: COMBINATION — the charger and
    // the wiring, both already taught. See the spec,
    // docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md.
    //
    // Both rooms are one shape: the charger lives in a closed pen under a
    // stone roof; the ball goes up a slope, across the roof, and drops into a
    // yard; the yard's far side is a stone wall with the door in it. On the
    // roof (ball at y 540, charger at 734) the ball is not on its level and
    // is not seen; in the yard it is. The ball can never get into a pen, so
    // the charger — the room's tool — can never be stomped out of the way;
    // and a yard cannot be climbed out of (the roof is 200 up, a jump 131),
    // which is safe only because the charger always comes round and sees him.
    //
    // Room A: planks, then button b's post, face left, towards the charger.
    // Stone fills the post up to the roof, and the gap between planks and
    // post is 30 — narrower than the ball — so the ball can reach neither the
    // cap nor the planks: only a charge can. Every x the ball can rest at in
    // the yard (3110-3180) is within SEE (240) of where the planks stop the
    // charger (2974). Its range runs on to 3034, flush with the post, so a
    // charge through the planks ends against it, pressing b, not short.
    //
    // Room B: the charge ends against the pen's end wall, on plate p, and the
    // door is open for as long as it sits there dazed. A ball resting at the
    // door (about 6020) is 286 from the charger's reach (5734), out of its
    // sight, so the child has to stand close to lure it, then run.
    // finish.mjs's 2c measures the time that takes.
    id: 11,
    theme: 'hills',
    bounds: { w: 7000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 6700, y: 760 },

    ground: [
      // Up the slope to room A's roof.
      [[40, 760], [1500, 760], [1800, 560]],
      // Room A's pen floor, its yard, and on to the proven 200 gap.
      [[1840, 760], [3700, 760]],
      // Past the gap, up to room B's roof.
      [[3900, 760], [4400, 760], [4700, 560]],
      // Room B's pen floor, its yard, and on to the flag.
      [[4740, 760], [6960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 6960, y: 0, w: 40, h: 1080 },
      // Room A: the pen's left wall, its roof, and the stone over the
      // button's post up to the roof.
      { x: 1800, y: 600, w: 40, h: 160 },
      { x: 1800, y: 560, w: 1290, h: 40 },
      { x: 3060, y: 600, w: 30, h: 110 },
      // Room A's door wall, above its gate.
      { x: 3200, y: 0, w: 40, h: 560 },
      // Room B: the pen's left wall, its roof, and its end wall.
      { x: 4700, y: 600, w: 40, h: 160 },
      { x: 4700, y: 560, w: 1100, h: 40 },
      { x: 5760, y: 600, w: 40, h: 160 },
      // Room B's door wall, above its gate.
      { x: 6040, y: 0, w: 40, h: 560 },
    ],

    breakables: [
      { x: 3000, y: 600, w: 30, h: 160 },
    ],

    senders: [
      { id: 'b', kind: 'button', x: 3060, y: 760, face: 'left' },
      { id: 'p', kind: 'plate', x: 5650, y: 760, w: 110 },
    ],

    gates: [
      { x: 3200, y: 560, w: 40, h: 200, needs: ['b'] },
      { x: 6040, y: 560, w: 40, h: 200, needs: ['p'] },
    ],

    bridges: [],
    platforms: [],

    enemies: [
      { kind: 'charger', x: 2600, y: 760 - CONFIG.ENEMY.CHARGER.R, from: 1866, to: 3034, dir: 1 },
      { kind: 'charger', x: 5200, y: 760 - CONFIG.ENEMY.CHARGER.R, from: 4766, to: 5734, dir: 1 },
    ],

    checkpoints: [
      { x: 1200, y: 760 },
      { x: 4000, y: 760 },
    ],
  },
```

Two things to check before running:
- The runner's gap edge at x=3700 is what jumps the 200 gap in stage `mid`.
- The `levels` checkpoint rule wants checkpoint 2 (4000) further than 240 from room B's range (4766), and it is (766). Checkpoint 1 is 666 from room A's range.
- Room A's range ends at 3034, under where the planks stand. The ground check passes because the pen floor runs on under the planks and the post to 3700. The gate check passes because the range plus R (3060) stops short of the gate at 3200.

- [ ] **Step 3: Run levels and finish**

Run: `node games/pushkar-ball/tests/run.mjs offline/levels`, then `... offline/finish`
Expected: level 11 passes all 30 ways and from both checkpoints, and 2c reports the worst run at or under 60%.

If 2c is over 60%, the choices in order are:
1. Move room B's door wall and gate further left (now 6040), keeping a ball resting against the gate more than 240 from the charger's reach (5734), so a ball waiting by the door stays out of sight.
2. Raise `DAZED`, which also lengthens level 10's stomp window. Record the measured worst percentage in the level's comment either way.

If room A never opens, print the charger's `x`, `dir`, `state` and `level.ball.x` once a second. The likely cause is the ball resting outside 240 of the charger's reach. Fix the yard, not `SEE`.

- [ ] **Step 4: Probes 3m and 3n — only the charger can do it**

After 3l:

```js
// --- 3m. level eleven, room A: the ball alone cannot open the door ---------
//
// Without the charger, a ball in the yard tries everything a thumb can —
// rolling each way, jumping each way, at every spot across the yard — and
// the button must stay unpressed and the planks whole.
console.log('\n3m. level eleven: room A needs the charger');
{
  const data = { ...LEVELS.find((l) => l.id === 11), enemies: [] };
  let pressed = false, broken = false;
  for (const spot of [3110, 3130, 3150, 3170, 3180]) {
    for (const move of [{ left: true }, { right: true }, { left: true, jump: true }, { right: true, jump: true }]) {
      const route = (level) => (ball) => {
        if (ball.x < spot - 5 && ball.y > 700) return { right: true };
        return { ...move, jump: move.jump && ball.grounded };
      };
      const { level } = play(data, route, { from: { x: 3150, y: 700 }, seconds: 6 });
      if (level.senders[0].pressed) pressed = true;
      if (level.breakables[0].broken) broken = true;
    }
  }
  console.log(`   button ever pressed=${pressed}, planks ever broken=${broken}`);
  if (pressed) fail('level eleven: the ball pressed room A\'s button without the charger');
  if (broken) fail('level eleven: the ball broke room A\'s planks without the charger');
}

// --- 3n. level eleven, room B: a door missed is not a dead end -------------
//
// A ball that waits by the door while the charger is dazed, and so misses
// it, must be able to lure it again: after the door shuts, step back into
// sight, and get through on the second daze.
console.log('\n3n. level eleven: missing room B\'s door is not a dead end');
{
  const data = LEVELS.find((l) => l.id === 11);
  const route = (level) => {
    const p = level.senders.find((s) => s.id === 'p');
    const gate = level.gates[1];
    let stage = 'lure', dazes = 0, was = false;
    return (ball) => {
      if (p.pressed && !was) dazes++;
      was = p.pressed;
      const close = () => (ball.x > 5900 ? { left: true } : ball.x < 5860 ? { right: true } : {});
      if (stage === 'lure') { if (dazes === 1) stage = 'miss'; return close(); }
      if (stage === 'miss') { if (!p.pressed && gate.openT === 0) stage = 'again'; return {}; }
      if (stage === 'again') { if (dazes === 2) stage = 'go'; return close(); }
      return { right: true };
    };
  };
  const { ball, level } = play(data, route, { from: { x: 5860, y: 700 }, seconds: 40 });
  const through = ball.x > level.gates[1].x + level.gates[1].w;
  console.log(`   got through on the second daze: ${through} (ball at x=${ball.x.toFixed(0)})`);
  if (!through) fail('level eleven: after missing room B\'s door once, the ball could not get through');
}
```

- [ ] **Step 5: Run and commit**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every offline suite passes except the pre-existing level 7 line.

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs
git commit -m "Add level eleven: lure the charger into a button, then onto a plate"
```

---

### Task 8: Look at it — the browser suite

**Files:**
- Create: `games/pushkar-ball/tests/browser/chargers.mjs`

- [ ] **Step 1: Write the suite**

```js
// The charger, in the browser: open level ten at both small phone sizes,
// roll up against the pen's stone step (no jump, so it stops there; the
// charger's charge ends in the step's far side), and take a picture every quarter
// second while the charger comes, winds up, charges and sits dazed. The
// assertion is only that the charger is drawn (a count of its exact body
// colour, which nothing else in the game uses) and that the page threw
// nothing. The pictures are the point: look at every one of them.
// Then level eleven's opening, for the level-select tile and the roofs.
import { connect, makeHold } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'chargers';
const PORT = Number(process.argv[4] || 9335);

const { CONFIG } = await import('../../js/config.js');
const { Buttons } = await import('../../js/ui.js');
const { LEVELS } = await import('../../js/levels.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const hex = CONFIG.COLOURS.ENEMY;
const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const enemyPixels = () => ev(`(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - ${R}) < 6 && Math.abs(d[i + 1] - ${G}) < 6 && Math.abs(d[i + 2] - ${B}) < 6) n++;
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
  await shoot(`${W}x${H}-levels`);
  await ev(`document.querySelectorAll('#level-grid .tile')[${index}].click()`);
  await sleep(900);
}

for (const [W, H] of [[568, 320], [740, 280]]) {
  console.log(`\n${W}x${H}, level 10: the charger's poses`);
  await openLevel(W, H, 10);
  // Spawn 200 to the pen's step at 1400; with no jump the ball stops there.
  await hold(Buttons.right(W, H), 3600);
  let seen = 0;
  for (let i = 0; i < 24; i++) {
    const n = await enemyPixels();
    seen = Math.max(seen, n);
    await shoot(`${W}x${H}-10-${String(i).padStart(2, '0')}`);
    await sleep(250);
  }
  console.log(`   most charger-colour pixels in one frame: ${seen}`);
  if (seen < 200) fail(`the charger was never drawn at ${W}x${H} (at most ${seen} pixels of its colour)`);

  console.log(`\n${W}x${H}, level 11: opening`);
  await openLevel(W, H, 11);
  await hold(Buttons.right(W, H), 3000);
  await shoot(`${W}x${H}-11-roof`);
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nCHARGERS DRAWN');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it**

Run: `node games/pushkar-ball/tests/run.mjs browser/chargers`
Expected: `CHARGERS DRAWN`. If the pixel count is 0, check the hold time first. The ball may still be short of the pen, with the charger off screen. Look at `-10-00`.

- [ ] **Step 3: Look at every screenshot**

Open `games/pushkar-ball/tests/screenshots/` and look at every `*-10-*`, `*-11-roof` and `*-levels` image at both sizes. Check each item and write what you see in the task report:
- The charger reads as a different creature from a walker: horns forward, a low body, and it faces the way it moves.
- The wind-up is visibly different from the patrol (crouch plus dust), and the charge from both (lean plus streaks).
- The dazed stars show, and the count goes down.
- No part of the charger is drawn above the corner buttons or under the thumb buttons in a way that hides it.
- Level select shows 11 tiles and nothing falls off a 568×320 or 740×280 screen.
- Level 11's roof and slope read as ground, not as a wall.

Fix anything wrong in `drawCharger` or the level data, re-run, and look again.

- [ ] **Step 4: Commit**

```bash
git add games/pushkar-ball/tests/browser/chargers.mjs games/pushkar-ball/js
git commit -m "Look at the charger: a browser suite that photographs every pose"
```

---

### Task 9: Documentation

**Files:**
- Modify: `games/pushkar-ball/README.md`, `games/pushkar-ball/tests/README.md`, `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md`, `docs/superpowers/specs/2026-09-18-mechanisms-and-enemies-roadmap.md`

- [ ] **Step 1: Game README**

Find the enemies section (`grep -n -i "enem" games/pushkar-ball/README.md`) and add a charger paragraph in the same voice. Cover:
- the five states and what ends each;
- stompable and harmless only while dazed;
- it comes back after being popped;
- it breaks planks, shoves crates, presses buttons, and holds a plate only while dazed;
- `enterState`/`runStates` as the shape every new enemy is written in.

Add levels 10 and 11 wherever the README lists levels.

- [ ] **Step 2: Tests README**

List `offline/chargers.mjs` and `browser/chargers.mjs` with one line each, and add the new `finish.mjs` sections (2c, 3l, 3m, 3n) wherever that file's sections are described.

- [ ] **Step 3: CLAUDE.md**

In "The shape of the thing — Pushkar Ball", in the wiring bullet, replace "future enemies are added in `Level.update` itself, like crates, because they are the level's own" and the sentence after it with:

> enemies are added in `Level.update` itself, because they are the level's own. An enemy joins through three fields: `presses`, `heavy`, `grounded`. The charger presses with its box, blocks a closing gate, and is heavy (holds a plate) only while dazed. Decide those three per enemy kind.

Then add one bullet after it:

> - **Every new enemy is a state machine** (`enterState`/`runStates` in `js/enemies.js`): named states that change only on a timer or a distance check, never at random. The charger is the first. Walker, roller and popper predate it and are deliberately left as they are, because their level placements were tuned against their exact maths. `stompable` and `harmless` are how an enemy tells `stompEnemy` and `hazardKnockDir` when the usual rules don't apply.

- [ ] **Step 4: Spec and roadmap**

In the spec, change the first line under the title to say it was agreed and **built** on the date the build finishes, and add a `## What the build taught` section. Record what the sweeps actually found: the final positions and the reason each one moved, the worst 2c percentage, and anything rendering showed. Don't write this section before those results exist.

In the roadmap's levels table, mark rows 10 and 11 "(built)". In the toolkit table, mark the state machines and the charger built. Update the paragraph near the top that says only sub-project 1 is built.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/README.md games/pushkar-ball/tests/README.md CLAUDE.md docs/superpowers/specs
git commit -m "Document the charger, levels ten and eleven, and what the build taught"
```

---

### Task 10: Full run

- [ ] **Step 1: Run the whole Pushkar Ball suite**

Run: `node games/pushkar-ball/tests/run.mjs 2>&1 | tail -60`
Expected: every suite passes except the pre-existing "level 7 has no route in finish.mjs". `screens.mjs` passes with 11 tiles.

A browser suite failing only at the end of a long run is re-run alone before it's believed. Don't *assume* it was flaky, though (CLAUDE.md).

- [ ] **Step 2: Confirm sw.js and the hub were not touched**

Run: `git diff --stat deb9118 -- sw.js index.html`
Expected: no output. If either was touched, run Taras Town's full suite too: `node games/taras-town/tests/run.mjs`.

- [ ] **Step 3: Report and stop**

Report the results to the user and ask whether to push. Don't push without being told to.
