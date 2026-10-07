# Sub-project 3: the shell and the aimed popper, levels 12–15 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shell enemy, move the popper onto the state-machine shape and give it an aimed lob, settle the five items carried over from the charger reviews, and append levels 12–15.

**Architecture:** Everything lives where the charger already put it. Enemy makers and state tables go in `js/enemies.js`, wiring fields are read by `Level.update` in `js/levels.js`, senders are in `js/circuits.js`, and numbers and colours are in `js/config.js`. No new files under `js/`. Each mechanic gets an offline suite first; each level gets a `finish.mjs` route and sweep.

**Tech Stack:** Vanilla ES modules with no build step. Node 22 runs the offline suites and headless Chrome runs the browser suites, both through `games/pushkar-ball/tests/run.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md`. Read it, and CLAUDE.md's "The shape of the thing — Pushkar Ball", before Task 1.

---

## Ground rules for every task

- Paths below are relative to `games/pushkar-ball/` unless they start with `docs/`.
- **Narrow suites while iterating:** `node games/pushkar-ball/tests/run.mjs <name>`. Run the full `run.mjs` only in Task 13.
- **Prove each new check can fail.** After a check passes, break the code or data it guards, see it fail, and restore it. Every task's steps say what to break. Any check that compares against a `CONFIG` constant stands behind `if (!Number.isFinite(X)) fail('X is not a number')`.
- **Number provenance.** Every number written into a comment says *printed by <suite>*, *from config.js*, or *simulated (<how>)*. Never write one that is none of the three.
- **Levels are appended** to `LEVELS`, never inserted.
- **No test-only code in `js/`.**
- Commit after each task with a message in the repo's plain-sentence style, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not push.**
- Known and not yours: level 7 has no route in `finish.mjs`, so the full run is one short.

## File map

| File | What changes |
|---|---|
| `js/config.js` | `ENEMY.SHELL`, new `ENEMY.POPPER` keys (`RANGE`, `AIM`, `FLIGHT`, `RELOAD`), `COLOURS.SHELL_*`, `COLOURS.CHARGER_POP`, `SHELL_POP`, `POPPER_ARC` |
| `js/enemies.js` | `blocks` field, popper state machine, `makeShell`, shell drawing, aim-arc drawing, charger↔shell contact, home-clear-of-crates on return |
| `js/circuits.js` | per-presser `touched` (a `Set` of keys) |
| `js/levels.js` | presser/blocker lists read `presses`/`blocks`, presser `key`s, the lob as a presser, multi-overlap `stompEnemy`, `pop` particle shade, `MAKERS.shell`, levels 12–15 |
| `js/main.js` | `drawParticles` reads `p.shade` |
| `tests/offline/enemies.mjs` | the fixed popper is unchanged |
| `tests/offline/poppers.mjs` (new) | the aimed popper |
| `tests/offline/shells.mjs` (new) | the shell |
| `tests/offline/circuits.mjs` | per-presser `touched` |
| `tests/offline/chargers.mjs` | multi-overlap stomp, return waits for crates |
| `tests/offline/levels.mjs` | gate check reads `blocks`, shell ground, popper range vs checkpoints |
| `tests/offline/finish.mjs` | routes for 12–15, `COUNTS_HEARTS`, dead-end checks |
| `tests/browser/shells.mjs` (new) | pictures of shells, the arc and both pop shades |
| READMEs, CLAUDE.md, spec | Task 13 |

Run `ls tests/offline` before Task 1. `run.mjs` discovers suites by file name, so a new file in `tests/offline/` runs with no registration. Confirm that by reading `tests/run.mjs` once.

---

### Task 1: Split `presses` from `blocks`, and make the gate check read `blocks`

**Files:** Modify `js/enemies.js` (in `makeCharger`, next to `presses: true`), `js/levels.js` (the enemy loop in `Level.update`, currently `if (!e.alive || !e.presses) continue;`), and `tests/offline/levels.mjs` (the gate-hazard loop over `data.enemies`).

- [ ] **Step 1: Change the gate check in `tests/offline/levels.mjs` so it asks the loaded enemy.** Replace the whole `for (const e of data.enemies || [])` block inside `for (const g of level.gates)` with the following. It keeps the walker and roller checks as they are, because those never block. Every enemy that blocks is checked by its range, read from the loaded enemy.

```js
    for (const [i, e] of (data.enemies || []).entries()) {
      const live = level.enemies[i];
      if (e.kind === 'walker') {
        const r = CONFIG.ENEMY.WALKER.R;
        const lo = e.x - e.amplitude - r, hi = e.x + e.amplitude + r;
        if (lo < ghi && hi > glo) fail(`level ${data.id}: a walker patrols under the gate at x=${g.x}`);
      } else if (e.kind === 'roller') {
        const r = CONFIG.ENEMY.ROLLER.R;
        if (e.from - r < ghi && e.to + r > glo) fail(`level ${data.id}: a roller patrols under the gate at x=${g.x}`);
      } else if (live.blocks) {
        // Anything that holds a closing gate up would hang it open over its
        // range — asked of the enemy itself, so a new kind cannot be missed.
        if (!(Number.isFinite(e.from) && Number.isFinite(e.to))) {
          fail(`level ${data.id}: enemy ${i} (${e.kind}) blocks gates but has no from/to range`);
        } else if (e.from - live.r < ghi && e.to + live.r > glo) {
          fail(`level ${data.id}: a ${e.kind} ranges under the gate at x=${g.x}`);
        }
      }
    }
```

Also update the comment above that loop. It currently says enemies are never among the blockers; rewrite it to say the blockers are the ball, crates, and any enemy with `blocks`.

- [ ] **Step 2: Run it and watch it fail.** Run `node games/pushkar-ball/tests/run.mjs levels`. Expected: no level fails, because chargers don't have `blocks` yet and are silently skipped. That silence is the vacuous pass this task removes. Add a guard at the end of the loop body: `if (e.kind === 'charger' && !live.blocks) fail(...)`, with the message ``level ${data.id}: charger ${i} has no blocks field``. Run again. Expected: FAIL for levels 10 and 11.

- [ ] **Step 3: Add the field.** In `makeCharger`, replace `presses: true,` with:

```js
    // Two separate questions: does it press buttons (and weigh plates), and
    // does a closing gate refuse to come down on it. A charger does both.
    presses: true,
    blocks: true,
```

In `Level.update`, replace the enemy loop with:

```js
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!e.presses && !e.blocks) continue;
      const box = { ...e.box(), key: e, heavy: e.heavy, resting: e.grounded };
      if (e.presses) pressers.push(box);
      if (e.blocks) blockers.push(box);
    }
```

Also update the comment above it so it describes the two fields. (`key` is used in Task 2; adding it now is harmless.)

- [ ] **Step 4: Run `levels`, `chargers` and `finish`.** Expected: all pass. Now prove the new branch bites. Temporarily move level 11's second gate (`x: 6040`) to `x: 5700`, run `levels`, and expect FAIL "a charger ranges under the gate". Restore it. Remove the temporary charger-only guard from Step 2. The real check is the `live.blocks` branch.

- [ ] **Step 5: Commit.** Message: "Pressing and blocking a gate are two questions an enemy answers".

### Task 2: A sender's `touched` is per presser

**Files:** Modify `js/circuits.js` (`makeSender`'s `touched: false`, `updateSenders`, `resetSenders`), `js/levels.js` (give every presser a `key`), and `tests/offline/circuits.mjs`.

- [ ] **Step 1: Write the failing test.** Append to `tests/offline/circuits.mjs`, before its final summary line. Read the top of the file first and reuse its existing `fail` and its import of `makeSender`/`updateSenders`. If it imports them under other names, use those.

```js
// --- per-presser touch: a second presser's hit is never swallowed -----------
{
  const s = makeSender({ id: 't', kind: 'timer', x: 1000, y: 760, face: 'left', time: 2 }, CONFIG);
  const zone = hitZone(s, CONFIG);
  const box = (key) => ({ key, x: zone.x, y: zone.y, w: zone.w, h: zone.h, heavy: false, resting: true });
  const A = {}, B = {};
  updateSenders([s], CONFIG.STEP, [box(A)], CONFIG);          // A hits: full time
  for (let i = 0; i < 120; i++) updateSenders([s], CONFIG.STEP, [box(A)], CONFIG); // A rests 1 s
  const before = s.left;
  updateSenders([s], CONFIG.STEP, [box(A), box(B)], CONFIG);  // B arrives while A rests
  console.log(`\nper-presser touch: timer at ${before.toFixed(2)}s, then ${s.left.toFixed(2)}s after a second presser's hit`);
  if (!(s.left > before + 0.5)) fail(`a second presser's hit on a timer already touched was swallowed (left ${s.left})`);
  resetSenders([s]);
  if (s.touched.size !== 0) fail('resetSenders left presser keys behind');
}
```

`hitZone` must be exported from `circuits.js`. If it isn't, export it in Step 3; that is the only reason to change its line.

- [ ] **Step 2: Run it.** `node games/pushkar-ball/tests/run.mjs circuits`. Expected: FAIL, "was swallowed" (or a TypeError on `.size`).

- [ ] **Step 3: Implement.** In `makeSender`: `touched: new Set(),   // which pressers (by key) were touching it last step`. In `updateSenders`, replace the button/timer branch's touch logic with:

```js
      const zone = hitZone(s, cfg);
      const now = new Set();
      for (const p of pressers) if (overlaps(p, zone)) now.add(p.key);
      // A HIT is any presser that starts touching, even while another rests
      // there: one presser's touch must not swallow another's hit.
      let hit = false;
      for (const k of now) if (!s.touched.has(k)) hit = true;
      s.touched = now;
```

Keep the `if (hit) {...} else if (timer...)` that follows unchanged. In `resetSenders`: `s.touched = new Set();`. In `Level.update`, give the crate pressers `key: c` (the crate object) and the ball's box `key: b`. Also update the comment at the top of `circuits.js` that defines a PRESSER: it is now `{ key, x, y, w, h, heavy, resting }`, where `key` is anything stable that names who is pressing.

- [ ] **Step 4: Run `circuits buttons switches finish`.** Expected: all pass. Then prove the old behaviour is really gone. Temporarily change `if (!s.touched.has(k)) hit = true;` to `hit = !s.touched.size;`, see the new test fail, and restore it.

- [ ] **Step 5: Commit.** Message: "A presser's touch no longer swallows another's hit".

### Task 3: Pop shades per kind

**Files:** Modify `js/config.js` (`COLOURS`), `js/levels.js` (`stompEnemy`'s particle push, and `breakWood`), `js/main.js` (`drawParticles` and the comment above it), and `js/enemies.js` (a `popShade` field on the charger).

- [ ] **Step 1: Add colours.** In `COLOURS`, after `CHARGER_EDGE`:

```js
    // A popped charger's debris: its own shade, NOT CHARGER_BODY. The browser
    // suite finds a charger by counting CHARGER_BODY pixels, and debris drawn
    // in it would be counted as charger while it flew.
    CHARGER_POP: '#7FA8E0',
    CHARGER_POP_EDGE: '#4F78B0',
```

- [ ] **Step 2: Particles carry a shade.** A particle carries `shade: { fill, edge }` instead of `wood: true`. In `stompEnemy`, build `const shade = e.popShade || { fill: 'ENEMY', edge: 'ENEMY_EDGE' };` and push `shade` on every particle. In `breakWood`, push `shade: { fill: 'CRATE', edge: 'CRATE_LINE' }` and drop `wood: true`. In `makeCharger`, add `popShade: { fill: 'CHARGER_POP', edge: 'CHARGER_POP_EDGE' },`. In `drawParticles`:

```js
    ctx.fillStyle = C[p.shade.fill];
    ...
    ctx.strokeStyle = C[p.shade.edge];
```

Delete the paragraph above `drawParticles` that says "Giving the pop its own shade of blue would settle both…", and replace it with one line saying each kind names its own pop shade.

- [ ] **Step 3: Check that nothing else reads `p.wood`.** Run `grep -rn "\.wood\b" js tests/offline tests/browser`. Expected: no hits. If a suite counted `wood` particles, change it to compare `p.shade.fill === 'CRATE'`.

- [ ] **Step 4: Run `offline`.** Expected: pass. Also run `node games/pushkar-ball/tests/run.mjs chargers` so the browser `chargers.mjs` runs as well. Expected: pass, and its CHARGER_BODY count is unchanged.

- [ ] **Step 5: Commit.** Message: "A popped charger bursts in its own shade".

### Task 4: When enemies overlap under a landing ball, the stomp wins

**Files:** Modify `js/levels.js` (`stompEnemy`) and `tests/offline/chargers.mjs`.

- [ ] **Step 1: Write the failing test.** Append to `tests/offline/chargers.mjs`, using its `room`, `fakeBall` and `run` helpers (read the top of the file).

```js
// --- two enemies under one landing: the stomp wins --------------------------
{
  // A dazed charger (stompable) and a patrolling one (not) both under the
  // ball. Whichever comes first in the list, the ball must stomp, not be hurt.
  for (const order of ['dazedFirst', 'dazedSecond']) {
    const dazed = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 900, to: 1100 }, CONFIG);
    const awake = makeCharger({ kind: 'charger', x: 1010, y: CY, from: 900, to: 1100 }, CONFIG);
    dazed.state = 'dazed';
    const level = room({ enemies: [] });
    level.enemies = order === 'dazedFirst' ? [dazed, awake] : [awake, dazed];
    const body = { x: 1005, y: CY - K.R - 5, r: CONFIG.BALL.R, vy: 300 };
    const stomped = level.stompEnemy(body);
    console.log(`\nstomp over two (${order}): stomped=${stomped}, dazed alive=${dazed.alive}, awake alive=${awake.alive}`);
    if (!stomped) fail(`${order}: a landing over a dazed charger was not a stomp because another enemy overlapped too`);
    if (dazed.alive) fail(`${order}: the dazed charger was not popped`);
    if (!awake.alive) fail(`${order}: an awake charger was popped by a stomp`);
  }
}
```

- [ ] **Step 2: Run** `node games/pushkar-ball/tests/run.mjs chargers` (offline). Expected: FAIL for `dazedSecond`.

- [ ] **Step 3: Implement.** Replace `stompEnemy`'s opening (from `const e = enemyHit(...)` to the `if (body.vy > 0 ...)` test) with code that gathers every overlapped enemy:

```js
  stompEnemy(body) {
    // Every enemy under the ball, not just the first: two can overlap, and the
    // ball aimed at the one it can stomp. If any is stompable, every
    // stompable one pops and nothing hurts; hazardKnockDir is then never
    // asked (player.js asks it only when this returns false).
    const under = this.enemies.filter((e) => e.alive && circleHitsBox(body.x, body.y, body.r, e.box()));
    const targets = under.filter((e) => e.stompable !== false &&
      body.vy > 0 && body.y < e.box().y + CONFIG.ENEMY.STOMP_MARGIN);
    if (!targets.length) return false;
    for (const e of targets) this.pop(e);
    return true;
  }

  /** An enemy popped: gone, and a burst in its own shade at fixed angles. */
  pop(e) {
    e.alive = false;
    // (move the fixed-angle comment and particle loop here, unchanged except for `shade`)
  }
```

Import `circleHitsBox` from `./hazards.js` in `levels.js` if it isn't imported already. Move the existing particle loop and its comment into `pop(e)`.

- [ ] **Step 4: Run `chargers enemies deflate health finish`.** Expected: all pass, including the new test. Prove it bites: temporarily make `stompEnemy` take only `under[0]`, see `dazedSecond` fail, and restore it.

- [ ] **Step 5: Commit.** Message: "Two enemies under a landing ball: the stomp wins".

### Task 5: The popper on the state-machine shape, fixed mode unchanged

**Files:** Modify `js/enemies.js` (`makePopper`) and `tests/offline/enemies.mjs`.

- [ ] **Step 1: Pin today's lob before touching anything.** Append to `tests/offline/enemies.mjs`. This test must pass **before** the change and **after** it.

```js
// --- a fixed popper's lob is exactly what it always was ---------------------
// Level two's popper was tuned against this closed form. The state-machine
// rewrite must not move it by a hair, at any time, for any phase.
{
  const P = CONFIG.ENEMY.POPPER;
  const flight = (2 * P.VY0) / CONFIG.GRAVITY;
  let worst = 0, n = 0;
  for (const phase of [0, 0.7, 2.2]) {
    const e = { kind: 'popper', x: 2350, y: 736, dir: -1, period: 3.0, phase, fixed: true };
    const p = makePopper(e, CONFIG);
    for (let t = 0; t < 12; t += CONFIG.STEP) {
      p.update(CONFIG.STEP, t, null, CONFIG);
      const got = p.activeProjectile(t);
      const since = t - phase, cycle = ((since % 3) + 3) % 3;
      const want = cycle > flight ? null : { x: e.x + e.dir * P.VX * cycle, y: e.y - P.VY0 * cycle + 0.5 * CONFIG.GRAVITY * cycle * cycle };
      if (!!got !== !!want) { fail(`fixed popper, phase ${phase}, t=${t.toFixed(3)}: projectile ${got ? 'present' : 'absent'}, expected ${want ? 'present' : 'absent'}`); break; }
      if (got) { worst = Math.max(worst, Math.hypot(got.x - want.x, got.y - want.y)); n++; }
    }
  }
  console.log(`\nfixed popper: ${n} lob positions compared, worst difference ${worst.toExponential(1)}`);
  if (!(worst < 1e-9)) fail(`a fixed popper's lob moved by ${worst}`);
}
```

Run `node games/pushkar-ball/tests/run.mjs enemies`. Expected: PASS on today's code. Level 2's data has no `fixed` yet; the current maker ignores it.

- [ ] **Step 2: Mark level 2's popper.** In `js/levels.js` (`kind: 'popper', x: 2350`), add `fixed: true` with the comment `// Timed, not aimed: tuned against the closed-form lob before poppers could aim. The aimed popper is sub-project 3's.`

- [ ] **Step 3: Rewrite `makePopper` onto `enterState`/`runStates`.** Fixed mode is one state, `timed`, whose lob is the closed form. Aimed mode comes in Task 6, so for now a popper without `fixed` throws `new Error('an aimed popper is not built yet (Task 6)')`, which keeps an accidental use loud.

```js
const POPPER_FIXED = {
  // A timed popper has one state: its lob is a pure function of level time,
  // asked for directly by activeProjectile(t), exactly as before poppers
  // could aim.
  timed: { update() {} },
};

export function makePopper(e, cfg) {
  const P = cfg.ENEMY.POPPER;
  const period = e.period ?? P.PERIOD;
  const phase = e.phase || 0;
  const dir = e.dir ?? 1;
  const flight = (2 * P.VY0) / cfg.GRAVITY;
  if (!e.fixed) throw new Error('an aimed popper is not built yet (Task 6)');
  const p = {
    kind: 'popper',
    alive: true,
    r: P.R, x: e.x, y: e.y, dir,
    fixed: true,
    presses: false, blocks: false,
    state: 'timed', stateT: 0,
    update(dt, t, level, cfg) { runStates(p, POPPER_FIXED, dt, level, cfg); },
    box() { return { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }; },
    activeProjectile(t) {
      const since = t - phase;
      const cycle = ((since % period) + period) % period;
      if (cycle > flight) return null;
      return { x: p.x + dir * P.VX * cycle, y: p.y - P.VY0 * cycle + 0.5 * cfg.GRAVITY * cycle * cycle, r: P.PROJ_R };
    },
  };
  return p;
}
```

Keep the doc comment above `makePopper`, and add `fixed?` to its `@param`. Existing enemy tests that build a popper without `fixed` (test 2 in `enemies.mjs`) need `fixed: true` added to their data. Add it there, and say so in the commit message.

- [ ] **Step 4: Run `enemies levels finish`.** Expected: all pass, and the fixed-lob test prints a worst difference of 0. Prove the pin bites: temporarily change `P.VX * cycle` to `P.VX * cycle * 1.001` in the maker, see the test fail, and restore it.

- [ ] **Step 5: Commit.** Message: "The popper moves onto the state-machine shape; level two's lob is pinned unchanged".

### Task 6: The aimed popper

**Files:** Modify `js/config.js`, `js/enemies.js`, `js/levels.js` (the lob as a presser) and `tests/offline/levels.mjs` (range vs checkpoints). Create `tests/offline/poppers.mjs`.

- [ ] **Step 1: Config.** In `ENEMY.POPPER`, add:

```js
      // The aimed popper (sub-project 3). Every one a guess awaiting a thumb.
      RANGE: 360,     // px ahead it notices the ball and can reach; a level may set its own `range`
      LEVEL_TOL: 160, // px of height difference it still notices across
      AIM: 1.0,       // s the dotted arc is drawn before it fires — the warning
      FLIGHT: 1.1,    // s a lob takes from the popper to the spot it locked
      RELOAD: 1.2,    // s after a lob ends before it looks again
```

In `COLOURS`: `POPPER_ARC: '#FFFFFF',   // the dotted aim arc; drawn at reduced alpha`.

- [ ] **Step 2: Write the failing suite** `tests/offline/poppers.mjs`:

```js
// The aimed popper, in Node: it wakes on the ball, locks a target, warns for
// AIM seconds, and lobs on a closed-form parabola that reaches the target at
// FLIGHT and ends at the first solid thing. Also: it presses a button and
// breaks planks with that lob.
const { CONFIG } = await import('../../js/config.js');
const { makePopper } = await import('../../js/enemies.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const P = CONFIG.ENEMY.POPPER, DT = CONFIG.STEP, FLOOR = 760;
for (const k of ['RANGE', 'AIM', 'FLIGHT', 'RELOAD', 'LEVEL_TOL']) {
  if (!Number.isFinite(P[k])) fail(`CONFIG.ENEMY.POPPER.${k} is not a number`);
}

function room(extra = {}) {
  return loadLevel({
    id: 91, theme: 'hills', bounds: { w: 3000, h: 1080 }, spawn: { x: 200, y: 600 },
    ground: [[[40, FLOOR], [2960, FLOOR]]],
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 }, ...(extra.boxes || [])],
    platforms: [], ...extra, boxes: undefined,
  });
}
const ballAt = (x) => ({ x, y: FLOOR - CONFIG.BALL.R, r: CONFIG.BALL.R, grounded: true, dying: 0 });
function steps(level, seconds, each = () => {}) {
  for (let i = 0; i < Math.round(seconds / DT); i++) { level.update(DT); if (each(i) === false) break; }
}

// --- 1. asleep until the ball is in front and in range ----------------------
{
  const level = room({ enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }] });
  const p = level.enemies[0];
  level.ball = ballAt(1000 - 200);                 // behind it
  steps(level, 3);
  if (p.state !== 'idle') fail(`a ball behind the popper woke it (state ${p.state})`);
  level.ball = ballAt(1000 + P.RANGE + 100);       // in front, out of range
  steps(level, 3);
  if (p.state !== 'idle') fail(`a ball out of range woke it (state ${p.state})`);
  level.ball = ballAt(1000 + 200);
  steps(level, DT * 2);
  console.log(`\n1. popper wakes on the ball in front within ${P.RANGE}: state ${p.state}`);
  if (p.state !== 'aim') fail(`a ball in front within range did not start the aim (state ${p.state})`);
}

// --- 2. the lob reaches the locked spot at FLIGHT, after AIM of warning -----
{
  const level = room({ enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }] });
  const p = level.enemies[0];
  level.ball = ballAt(1250);
  steps(level, DT);
  const target = { ...p.target };
  level.ball = ballAt(2500);                        // he steps away: the lock holds
  let firedAt = null, at = null;
  steps(level, P.AIM + P.FLIGHT + 0.5, () => {
    if (p.state === 'fire' && firedAt === null) firedAt = level.time;
    if (firedAt !== null && at === null && level.time - firedAt >= P.FLIGHT - DT / 2) at = p.activeProjectile(level.time);
  });
  console.log(`\n2. target ${target.x.toFixed(0)},${target.y.toFixed(0)}; fired after ${(firedAt ?? NaN).toFixed(2)}s; at FLIGHT: ${at ? at.x.toFixed(1) + ',' + at.y.toFixed(1) : 'gone'}`);
  if (Math.abs(target.x - 1250) > 1) fail(`target x ${target.x}, expected where the ball was (1250)`);
  if (!(Math.abs(firedAt - P.AIM) < 2 * DT + 1e-9)) fail(`fired after ${firedAt}s, expected AIM (${P.AIM})`);
  if (at && Math.hypot(at.x - target.x, at.y - target.y) > 6) fail('the lob missed the locked spot at FLIGHT');
}

// --- 3. never behind itself; clamped to range --------------------------------
{
  const level = room({ enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: -1, range: 200 }] });
  const p = level.enemies[0];
  level.ball = ballAt(1000 - 199);
  steps(level, DT);
  if (!(p.target && p.target.x < 1000)) fail('a left-facing popper aimed right');
  if (p.range !== 200) fail(`range from level data not honoured (got ${p.range})`);
  if (p.target && Math.abs(p.target.x - 1000) > 200 + 1e-9) fail('aim went past its range');
}

// --- 4. the lob presses a button and breaks planks ---------------------------
{
  const level = room({
    enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }],
    senders: [{ id: 'b', kind: 'button', x: 1260, y: FLOOR, face: 'left' }],
    gates: [{ x: 2000, y: 560, w: 40, h: 200, needs: ['b'] }],
  });
  level.ball = ballAt(1300);                        // just past the button
  let pressed = false;
  steps(level, P.AIM + P.FLIGHT + 1, () => { if (level.senders[0].pressed) pressed = true; });
  console.log(`\n4a. a lob aimed past a button pressed it: ${pressed}`);
  if (!pressed) fail('a lob aimed past a button did not press it');
}
{
  const level = room({
    enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }],
    breakables: [{ x: 1240, y: 600, w: 30, h: 160 }],
  });
  level.ball = ballAt(1300);
  steps(level, P.AIM + P.FLIGHT + 1);
  console.log(`4b. a lob aimed past planks broke them: ${level.breakables[0].broken}`);
  if (!level.breakables[0].broken) fail('a lob aimed past planks did not break them');
}

// --- 5. the same situation, the same lob --------------------------------------
{
  const trace = () => {
    const level = room({ enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }] });
    level.ball = ballAt(1180);
    const out = [];
    steps(level, 5, () => { const q = level.enemies[0].activeProjectile(level.time); out.push(q ? q.x.toFixed(6) + ',' + q.y.toFixed(6) : '-'); });
    return out.join(';');
  };
  if (trace() !== trace()) fail('two identical runs lobbed differently');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL POPPER CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

If `loadLevel` rejects any key used here (for example `breakables` with no `senders`), read its constructor and adjust the room helper, not the assertions. Fix the helper's `boxes` handling too, so that it really passes the extra boxes through.

- [ ] **Step 3: Run it.** `node games/pushkar-ball/tests/run.mjs poppers`. Expected: FAIL, "an aimed popper is not built yet".

- [ ] **Step 4: Implement the aimed machine** in `js/enemies.js`, beside `POPPER_FIXED`:

```js
/** Is the ball in front of this popper, within its range, near its height? */
function popperSees(p, level, P) {
  const b = level && level.ball;
  if (!b || b.dying) return false;
  const dx = b.x - p.x;
  return Math.sign(dx) === p.dir && Math.abs(dx) <= p.range && Math.abs(b.y - p.y) < P.LEVEL_TOL;
}

/** The lob's position `s` seconds after launch: closed form, from launch point to target in FLIGHT. */
function lobAt(p, s, cfg) {
  const L = p.lob;
  return { x: L.x0 + L.vx * s, y: L.y0 + L.vy * s + 0.5 * cfg.GRAVITY * s * s, r: cfg.ENEMY.POPPER.PROJ_R };
}

const POPPER_AIMED = {
  idle: {
    update(p, dt, level, cfg) { if (popperSees(p, level, cfg.ENEMY.POPPER)) return 'aim'; },
  },
  aim: {
    // The target is locked on the first step of aiming and never moves: the
    // arc he sees is the arc that flies.
    update(p, dt, level, cfg) {
      const P = cfg.ENEMY.POPPER;
      if (!p.target) {
        const b = level.ball;
        const reach = Math.min(Math.abs(b.x - p.x), p.range);
        p.target = { x: p.x + p.dir * reach, y: b.y };
      }
      if (p.stateT >= P.AIM) return 'fire';
    },
  },
  fire: {
    enter(p) { p.lob = null; },
    update(p, dt, level, cfg) {
      const P = cfg.ENEMY.POPPER;
      if (!p.lob) {
        const x0 = p.x, y0 = p.y - p.r, F = P.FLIGHT;
        p.lob = { x0, y0, vx: (p.target.x - x0) / F, vy: (p.target.y - y0 - 0.5 * cfg.GRAVITY * F * F) / F, shot: {} };
      }
      const q = lobAt(p, p.stateT, cfg);
      p.lobNow = q;
      // Ends at the first solid thing it meets, past the target or not. Planks
      // break; anything else just stops it. Nothing here is random, so where a
      // lob ends depends only on where it was aimed.
      const box = { x: q.x - q.r, y: q.y - q.r, w: q.r * 2, h: q.r * 2 };
      const hit = level.near(q.x, q.y, q.r * 2).find((s) => segmentHitsBox(s, box.x, box.y, box.w, box.h));
      if (hit || q.y > level.bounds.h) {
        if (hit && hit.owner && hit.owner.breakable && !hit.owner.broken) level.breakWood(hit.owner);
        return 'reload';
      }
    },
  },
  reload: {
    enter(p) { p.target = null; },
    update(p, dt, level, cfg) {
      // The lob's last position stays a presser for this one step, so a lob
      // ending against a button's post still counts as having touched its cap.
      if (p.stateT > dt * 1.5) p.lobNow = null;
      if (p.stateT >= cfg.ENEMY.POPPER.RELOAD) return 'idle';
    },
  },
};
```

Import `segmentHitsBox` from `./physics.js` (enemies.js already imports `step` from there; extend that import). In `makePopper`, remove the `throw`, and branch: for a fixed popper keep the object from Task 5; otherwise build

```js
  const p = {
    kind: 'popper', alive: true, r: P.R, x: e.x, y: e.y, dir,
    fixed: false,
    // How far ahead it notices and can reach: the level's, else CONFIG's.
    // Ask the loaded popper, never the config (levels.mjs does).
    range: e.range ?? P.RANGE,
    target: null, lob: null, lobNow: null,
    presses: false, blocks: false,
    state: 'idle', stateT: 0,
    update(dt, t, level, cfg) { runStates(p, POPPER_AIMED, dt, level, cfg); },
    box() { return { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }; },
    /** The lob in flight, or null. Ignores `t`: an aimed lob is the machine's, not the clock's. */
    activeProjectile() { return p.state === 'fire' ? p.lobNow : null; },
  };
```

In `Level.update`'s enemy loop (Task 1), add after it:

```js
    // A popper's lob presses a button by hitting it, like any other presser —
    // a fresh key per shot, so every lob is a hit of its own. It is never
    // heavy and never holds a gate up.
    for (const e of this.enemies) {
      if (!e.alive || e.kind !== 'popper' || e.fixed || !e.lobNow) continue;
      const q = e.lobNow;
      pressers.push({ key: e.lob.shot, x: q.x - q.r, y: q.y - q.r, w: q.r * 2, h: q.r * 2, heavy: false, resting: false });
    }
```

Note on ordering: enemies update before the pressers are built, so the lob's position this step is the one the senders see.

- [ ] **Step 5: Draw the arc and the aimed lob.** In `drawEnemies`'s projectile loop, `activeProjectile(time)` already covers both modes. Add, before it, the aim arc:

```js
  for (const e of enemies) {
    if (!e.alive || e.kind !== 'popper' || e.state !== 'aim' || !e.target) continue;
    drawAimArc(ctx, e, cfg);
  }
```

```js
/**
 * The warning: dots along exactly the curve the lob will fly, from the popper
 * to the spot it locked. Drawn for the whole AIM, so nothing a popper throws
 * is ever a surprise.
 */
function drawAimArc(ctx, p, cfg) {
  const P = cfg.ENEMY.POPPER, F = P.FLIGHT;
  const x0 = p.x, y0 = p.y - p.r;
  const vx = (p.target.x - x0) / F, vy = (p.target.y - y0 - 0.5 * cfg.GRAVITY * F * F) / F;
  ctx.save();
  ctx.fillStyle = cfg.COLOURS.POPPER_ARC;
  ctx.globalAlpha = 0.85;
  for (let i = 1; i <= 12; i++) {
    const s = (i / 12) * F;
    ctx.beginPath();
    ctx.arc(x0 + vx * s, y0 + vy * s + 0.5 * cfg.GRAVITY * s * s, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
```

The arc uses the same formula as the lob in `fire`. Pull it into one helper `lobVelocity(p, cfg)` that both call, so they cannot drift apart.

- [ ] **Step 6: The levels.mjs check: no aimed popper's range covers a checkpoint.** Append to `tests/offline/levels.mjs` before the summary:

```js
// --- aimed poppers: no checkpoint within reach -------------------------------
// The roadmap's "range never covers a checkpoint": a ball respawning must
// never be inside what a popper can see and reach.
{
  let n = 0;
  for (const data of LEVELS) {
    const level = loadLevel(data);
    for (const [i, e] of (data.enemies || []).entries()) {
      if (e.kind !== 'popper' || e.fixed) continue;
      n++;
      const range = level.enemies[i].range;
      if (!Number.isFinite(range)) { fail(`level ${data.id}: popper ${i} has no numeric range`); continue; }
      for (const c of data.checkpoints || []) {
        const dx = c.x - e.x;
        if (Math.sign(dx) === (e.dir ?? 1) && Math.abs(dx) <= range + CONFIG.BALL.R) {
          fail(`level ${data.id}: checkpoint at x=${c.x} is within reach of popper ${i} (range ${range})`);
        }
      }
    }
  }
  console.log(`\naimed poppers: ${n} checked for checkpoints out of reach`);
}
```

The check passes vacuously until level 13 exists (`n` = 0). That is expected; Task 9 proves it bites.

- [ ] **Step 7: Run `poppers enemies levels finish`.** Expected: all pass. Prove the button and plank tests bite: temporarily delete the lob-presser loop in `Level.update` and see 4a fail; restore it. Temporarily delete the `breakWood` call in `fire` and see 4b fail; restore it.

- [ ] **Step 8: Commit.** Message: "The aimed popper: it locks where the ball was, warns, and its lob presses buttons and breaks planks".

### Task 7: The shell

**Files:** Modify `js/config.js`, `js/enemies.js`, and `js/levels.js` (`MAKERS`). Create `tests/offline/shells.mjs`.

**A decision this task makes, recorded for the spec's "Where the build departs" section:** when a crate flips a shell, **the shell is kicked out from under the crate**, not the crate off the shell. The shell is not a collider, so a falling crate lands on the floor through it. Moving the shell, through `physics.step` like any patrol, keeps the crate exactly where its own rules put it, and adds no new crate motion that would need its own dead-end check. If the shell's kick is blocked, it stays where it is, flipped, under the crate: it is harmless and not solid, so nothing is trapped. The pass still clears once the crate is pushed off it.

- [ ] **Step 1: Config.** In `ENEMY`, after `CHARGER`:

```js
    // The shell — see enemies.js's makeShell and the spec,
    // docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md.
    // Every one of these is a guess awaiting a thumb.
    SHELL: {
      R: 26,              // half its hit box
      PATROL_SPEED: 80,   // px/s — slower than the charger's 120; it never chases
      FLIPPED: 4.0,       // s on its back: harmless, stompable, counting down
      FLIP_VY: 250,       // px/s a crate must be falling at to flip it, not merely resting
      KICK: 180,          // px/s sideways it is knocked, away from what flipped it
      KICK_TIME: 0.35,    // s that kick lasts
      RETURN: 4.0,        // s before a popped shell may come back
      RETURN_CLEAR: 240,  // px the ball must be from its home for it to come back
      PUFF_TIME: 0.5,     // s of return puff, cosmetic
    },
```

In `COLOURS`, after the charger's:

```js
    // The shell: its own colours, like the charger, because its rules differ
    // and the browser suite counts SHELL_BODY to find it.
    SHELL_BODY: '#2FA37A',
    SHELL_EDGE: '#1C6B4F',
    SHELL_SHINE: '#B8F0D8',
    SHELL_POP: '#8FD9B9',
    SHELL_POP_EDGE: '#4F9F7F',
```

Before committing, check that none of these five values is byte-identical to any other `COLOURS` entry (`STAR_ON` and `FLAG` already are; see the charger spec). Add a check to `tests/offline/levels.mjs`: for every key starting `SHELL_` or `CHARGER_`, `fail` if another key has the same value. Prove it bites by temporarily setting `SHELL_BODY` to `COLOURS.FLAG`'s value.

- [ ] **Step 2: Write the failing suite** `tests/offline/shells.mjs`. Use the same `room`, `ballAt` and `steps` helpers as `poppers.mjs`, copied in, because suites share nothing.

```js
const { CONFIG } = await import('../../js/config.js');
const { makeShell, makeCharger } = await import('../../js/enemies.js');
const { loadLevel } = await import('../../js/levels.js');
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const S = CONFIG.ENEMY.SHELL, DT = CONFIG.STEP, FLOOR = 760, SY = FLOOR - S.R;
for (const k of Object.keys(S)) if (!Number.isFinite(S[k])) fail(`CONFIG.ENEMY.SHELL.${k} is not a number`);
// room(extra), ballAt(x), steps(level, seconds, each) — as in poppers.mjs

// --- 1. it patrols its range, upright, hurting and unstompable ----------------
{
  const level = room({ enemies: [{ kind: 'shell', x: 1000, y: SY, from: 800, to: 1200 }] });
  const s = level.enemies[0];
  let lo = s.x, hi = s.x;
  steps(level, 15, () => { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); });
  console.log(`\n1. shell patrolled ${lo.toFixed(0)}..${hi.toFixed(0)} (range 800..1200), state ${s.state}`);
  if (lo < 800 - 1 || hi > 1200 + 1) fail('a shell left its range');
  if (hi - lo < 300) fail('a shell did not patrol its range');
  if (s.stompable || s.harmless) fail('an upright shell is stompable or harmless');
  const body = { x: s.x, y: s.box().y - 5, r: CONFIG.BALL.R, vy: 300 };
  if (level.stompEnemy(body)) fail('a landing on an upright shell counted as a stomp');
  if (level.hazardKnockDir(body) === null) fail('a landing on an upright shell did not hurt');
  if (!(s.heavy && s.blocks && !s.presses)) fail(`shell wiring fields wrong: heavy ${s.heavy}, blocks ${s.blocks}, presses ${s.presses}`);
}

// --- 2. a falling crate flips it; a resting one does not ----------------------
{
  // A crate dropped from 300 above.
  const level = room({
    enemies: [{ kind: 'shell', x: 1000, y: SY, from: 990, to: 1010 }],
    boxes: [{ x: 970, y: 360, w: 60, h: 60, movable: true }],
  });
  const s = level.enemies[0];
  let flippedAt = null;
  steps(level, 2, () => { if (s.state === 'flipped' && flippedAt === null) flippedAt = level.time; });
  console.log(`\n2a. a dropped crate flipped the shell: ${flippedAt !== null} (state ${s.state}, shell x ${s.x.toFixed(0)}, crate x ${level.crates[0].x.toFixed(0)})`);
  if (flippedAt === null) fail('a crate dropped on a shell did not flip it');
  const c = level.crates[0];
  const overlap = s.x + s.r > c.x && s.x - s.r < c.x + c.w;
  if (overlap) console.log('     (the shell is still under the crate: its kick was blocked — allowed, harmless)');
}
{
  // A crate resting against/over it never flips it: grounded at rest first, then the shell walks under its edge.
  const level = room({
    enemies: [{ kind: 'shell', x: 900, y: SY, from: 850, to: 1150 }],
    boxes: [{ x: 1100, y: FLOOR - 60, w: 60, h: 60, movable: true }],
  });
  const s = level.enemies[0];
  let flipped = false;
  steps(level, 10, () => { if (s.state === 'flipped') flipped = true; });
  if (flipped) fail('a resting crate flipped a shell');
}

// --- 3. a charge flips it and dazes the charger; a patrol turns at it --------
{
  const level = room({
    enemies: [
      { kind: 'charger', x: 600, y: FLOOR - CONFIG.ENEMY.CHARGER.R, from: 500, to: 1400, dir: 1 },
      { kind: 'shell', x: 1000, y: SY, from: 990, to: 1010 },
    ],
  });
  const [c, s] = level.enemies;
  level.ball = ballAt(1100);    // in the charger's sight, beyond the shell
  let sawFlip = false, chargerState = null;
  steps(level, 3, () => { if (s.state === 'flipped' && !sawFlip) { sawFlip = true; chargerState = c.state; } });
  console.log(`\n3. a charge into a shell: flipped ${sawFlip}, charger then ${chargerState}`);
  if (!sawFlip) fail('a charge did not flip the shell');
  if (chargerState !== 'dazed') fail(`the charger was ${chargerState} after flipping a shell, not dazed`);
}

// --- 4. flipped: harmless, stompable, and it rights itself after FLIPPED ------
{
  const level = room({ enemies: [{ kind: 'shell', x: 1000, y: SY, from: 800, to: 1200 }] });
  const s = level.enemies[0];
  s.flip(1, level);
  if (!(s.harmless && s.stompable)) fail('a flipped shell is not harmless and stompable');
  if (!s.heavy) fail('a flipped shell stopped weighing plates');
  let back = null;
  steps(level, S.FLIPPED + 1, () => { if (back === null && s.state === 'patrol') back = level.time; });
  console.log(`\n4. flipped shell righted itself after ${back?.toFixed(2)}s (FLIPPED ${S.FLIPPED}, from config.js)`);
  if (!(Math.abs(back - S.FLIPPED) < 2 * DT + 1e-9)) fail(`righted itself after ${back}, not FLIPPED`);
}

// --- 5. stomped while flipped: popped; returns only when home is clear -------
{
  const level = room({ enemies: [{ kind: 'shell', x: 1000, y: SY, from: 800, to: 1200 }] });
  const s = level.enemies[0];
  s.flip(1, level);
  steps(level, DT);
  const body = { x: s.x, y: s.box().y - 5, r: CONFIG.BALL.R, vy: 300 };
  if (!level.stompEnemy(body)) fail('a flipped shell could not be stomped');
  level.ball = ballAt(1000 + S.RETURN_CLEAR - 50);      // too near home
  steps(level, S.RETURN + 2);
  if (s.alive) fail('a popped shell came back with the ball near its home');
  level.ball = ballAt(2500);
  level.crates.push(...loadLevel({ id: 92, theme: 'hills', bounds: { w: 3000, h: 1080 }, spawn: { x: 0, y: 0 }, ground: [[[0, FLOOR], [3000, FLOOR]]], boxes: [{ x: 980, y: FLOOR - 60, w: 60, h: 60, movable: true }], platforms: [] }).crates);
  steps(level, 1);
  if (s.alive) fail('a popped shell came back inside a crate on its home');
  level.crates.length = 0;
  steps(level, 1);
  if (!s.alive) fail('a popped shell never came back once its home was clear');
}

// --- 6. a shell holds a plate down, upright and flipped -----------------------
{
  const level = room({
    enemies: [{ kind: 'shell', x: 1000, y: SY, from: 995, to: 1005 }],
    senders: [{ id: 'p', kind: 'plate', x: 950, y: FLOOR, w: 110 }],
    gates: [{ x: 2000, y: 560, w: 40, h: 200, needs: ['p'] }],
  });
  steps(level, 1);
  const upright = level.senders[0].pressed;
  level.enemies[0].flip(1, level);
  steps(level, DT * 4);
  const flipped = level.senders[0].pressed;
  console.log(`\n6. plate under a shell: upright ${upright}, flipped ${flipped}`);
  if (!upright || !flipped) fail('a shell on a plate did not hold it down in both states');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL SHELL CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

In test 6, a kick could carry the shell off the plate. If it does, the test should flip with `s.flip(0, level)` (no kick). `flip(dir)` with `dir === 0` means "no kick", and Step 3 implements that.

- [ ] **Step 3: Implement `makeShell`** in `js/enemies.js`, beside the charger:

```js
/** Move a shell one step through the real physics; true if something solid is in front of it. */
function stepShell(s, level, dt, cfg) {
  const contacts = step(s, level, dt, cfg);
  s.grounded = contacts.some((k) => k.ny < -0.5);
  return contacts.some((k) => Math.abs(k.nx) > 0.5 && Math.sign(k.nx) === -s.dir);
}

/** Another alive enemy of `kind` overlapping this one's box, if any. */
function touching(e, level, kind) {
  const a = e.box();
  return (level.enemies || []).find((o) => o !== e && o.alive && o.kind === kind &&
    a.x < o.box().x + o.box().w && a.x + a.w > o.box().x && a.y < o.box().y + o.box().h && a.y + a.h > o.box().y);
}

/** A crate falling onto this shell fast enough to flip it, if any. */
function fallingCrateOn(s, level, S) {
  const a = s.box();
  return (level.crates || []).find((c) => c.vy >= S.FLIP_VY &&
    c.x < a.x + a.w && c.x + c.w > a.x && c.y + c.h > a.y && c.y < a.y + a.h);
}

const SHELL = {
  patrol: {
    update(s, dt, level, cfg) {
      const S = cfg.ENEMY.SHELL;
      const crate = fallingCrateOn(s, level, S);
      if (crate) { s.flip(s.x >= crate.x + crate.w / 2 ? 1 : -1, level); return; }
      if (s.x <= s.from) s.dir = 1;
      if (s.x >= s.to) s.dir = -1;
      s.vx = s.dir * S.PATROL_SPEED;
      // Anything solid in front turns it — a button's post included, which is
      // why a shell never presses buttons — and so does a charger it meets
      // walking. Only a charge flips it.
      const other = touching(s, level, 'charger');
      if (stepShell(s, level, dt, cfg) || (other && Math.sign(other.x - s.x) === s.dir && other.state !== 'charge')) s.dir = -s.dir;
    },
  },
  flipped: {
    update(s, dt, level, cfg) {
      const S = cfg.ENEMY.SHELL;
      s.vx = s.stateT < S.KICK_TIME ? s.kick * S.KICK : 0;
      stepShell(s, level, dt, cfg);
      if (s.stateT >= S.FLIPPED) return 'patrol';
    },
  },
  popped: {
    enter(s) { s.vx = 0; s.vy = 0; },
    update(s, dt, level, cfg) {
      const S = cfg.ENEMY.SHELL;
      if (s.stateT < S.RETURN) return;
      if (!homeClear(s, level, S.RETURN_CLEAR)) return;
      s.x = s.home.x; s.y = s.home.y; s.dir = s.home.dir;
      s.alive = true;
      s.returnT = S.PUFF_TIME;
      return 'patrol';
    },
  },
};

/**
 * May a popped enemy reappear at home? Not with the ball within `clear` on
 * either axis, and not inside a crate sitting there — both would put it on
 * top of something.
 */
function homeClear(e, level, clear) {
  const b = level && level.ball;
  if (b && Math.abs(b.x - e.home.x) < clear && Math.abs(b.y - e.home.y) < clear) return false;
  const h = { x: e.home.x - e.r, y: e.home.y - e.r, w: e.r * 2, h: e.r * 2 };
  return !(level.crates || []).some((c) => c.x < h.x + h.w && c.x + c.w > h.x && c.y < h.y + h.h && c.y + c.h > h.y);
}

/**
 * Shell: armoured, slow, and heavy. Cannot be stomped upright; flipped by a
 * falling crate or a charger's dash, it lies harmless and stompable for
 * FLIPPED seconds, then rights itself. A popped one comes back. See the spec,
 * docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md.
 *
 * @param e   level data: { x, y, from, to, dir?: 1|-1 } — x, y is home
 */
export function makeShell(e, cfg) {
  const S = cfg.ENEMY.SHELL;
  const s = {
    kind: 'shell', alive: true, r: S.R, x: e.x, y: e.y, vx: 0, vy: 0,
    dir: e.dir ?? 1, from: e.from, to: e.to,
    home: { x: e.x, y: e.y, dir: e.dir ?? 1 },
    grounded: false, kick: 0, returnT: 0,
    state: 'patrol', stateT: 0,
    popShade: { fill: 'SHELL_POP', edge: 'SHELL_POP_EDGE' },
    // Weight, not buttons: it holds plates in every state it is there for,
    // and a gate never closes on it; it turns at a button's post.
    presses: false,
    blocks: true,
    heavy: true,
    get stompable() { return s.state === 'flipped'; },
    get harmless() { return s.state === 'flipped'; },

    /** Knocked onto its back. `dir` is which way it is kicked: -1, 1, or 0 for not at all. */
    flip(dir, level) {
      if (!s.alive || s.state === 'flipped') return;
      s.kick = dir;
      enterState(s, SHELL, 'flipped');
    },

    update(dt, t, level, cfg) {
      if (!s.alive && s.state !== 'popped') enterState(s, SHELL, 'popped');
      s.returnT = Math.max(0, s.returnT - dt);
      runStates(s, SHELL, dt, level, cfg);
    },
    box() { return { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 }; },
    activeProjectile() { return null; },
  };
  return s;
}
```

`heavy: true` is fine while popped, because `Level.update` skips enemies that aren't alive.

Add the charger side. In `CHARGER.charge.update`, before `const hit = stepCharger(...)`:

```js
      // A charge into a shell flips it, and stops the charger as stone would.
      const shell = touching(c, level, 'shell');
      if (shell && shell.state === 'patrol' && Math.sign(shell.x - c.x) === c.dir) {
        shell.flip(c.dir, level);
        return 'dazed';
      }
```

In `CHARGER.patrol.update`, after the `if (sees(...)) return 'windup';` line: `const s2 = touching(c, level, 'shell'); if (s2 && Math.sign(s2.x - c.x) === c.dir) c.dir = -c.dir;`. In `CHARGER.popped.update`, replace the ball keep-away line with `if (!homeClear(c, level, c.see)) return;`, keeping its comment, and extend the comment to say crates too. This settles carried-over item 3 for the charger.

In `js/levels.js`: import `makeShell` and add `shell: makeShell` to `MAKERS`.

- [ ] **Step 4: Draw it.** In `drawEnemies`, add `else if (e.kind === 'shell') drawShell(ctx, e, time, cfg);`. `drawShell` draws:
  - upright: a dome (a half-ellipse, `SHELL_BODY` fill, `SHELL_EDGE` stroke) with a jagged lower rim (6 small triangles), a curved `SHELL_SHINE` highlight on the dome, and the shared `drawAngryFace` peering from under the front rim (`x + dir * r * 0.6`);
  - flipped: the same dome upside down, with four short stubby legs drawn as `SHELL_EDGE` lines waving on `Math.sin(time * 12)`, and a countdown of `CHARGER_STAR` stars circling it, whose count is `Math.ceil((FLIPPED - stateT) / FLIPPED * 4)` (the same idea as the dazed charger's stars; read `drawCharger`'s dazed branch and follow its exact shape);
  - a return puff while `returnT > 0`, as the charger's.

  It holds nothing (the hub rule).

- [ ] **Step 5: Run `shells chargers enemies levels finish`.** Expected: all pass. Prove each piece bites:
  - set `FLIP_VY: 1e9` and see 2a fail;
  - delete the charge-side `shell.flip` block and see 3 fail;
  - make `homeClear` skip the crates and see 5's crate assertion fail.

  Restore each.

- [ ] **Step 6: Levels.mjs: unbroken ground under every shell's range.** Generalise the "chargers: ground under the whole range" block so it covers `kind === 'charger' || kind === 'shell'`, reading the radius from `level.enemies[i].r`. Keep the checkpoint-in-sight part for chargers only, because a shell has no sight. The printed line becomes `chargers and shells: N checked…`.

- [ ] **Step 7: Commit.** Message: "The shell: armoured, slow, heavy; flipped by a falling crate or a charge".

### Task 8: Level 12 — Introduction: the shell

**Files:** Modify `js/levels.js` (append to `LEVELS`) and `tests/offline/finish.mjs` (route `12`, add 12 to `COUNTS_HEARTS`, a dead-end check `3o`).

**Intent (from the spec). Positions may move, but the intent may not:**
- **Room A, "its weight is useful".** The ball walks a stone roof over a shell's pen, like level 11's pens. A wide plate at the pen's far end drives the door gate on the roof's far side. The gate is open while the shell is on the plate, so the lesson is "wait for it to walk onto the plate, then go". The ball can never touch the shell in room A.
- **Room B, "drop a crate on it".** A low corridor (headroom under 92, so the ball cannot jump over a 52-tall shell) is the only way on, and a shell patrols in it. Above the corridor's entrance is a shelf with a crate, over a gap in the corridor's roof. Push the crate down the gap when the shell is under it: the shell flips, the ball drops in, stomps it, and goes through the corridor before it returns. A crate that misses lands in the corridor and can be pushed along and out at its open far end.
- One checkpoint before each room, each out of reach of everything.

- [ ] **Step 1: Paper layout.** Append to `LEVELS`, following level 11's header-comment shape (the stage stated first). The starting geometry is below; every number is a starting guess and is replaced by what Steps 3–5 measure.

```js
  {
    // Level twelve. INTRODUCTION: the shell. ... (stage, rooms, and every
    // swept number with its provenance — written in Step 6)
    id: 12, theme: 'hills', bounds: { w: 6400, h: 1080 },
    spawn: { x: 200, y: 700 }, goal: { x: 6250, y: 700 },
    ground: [
      [[40, 760], [1800, 760]],
      // Room A's pen floor, under its walls.
      [[1800, 900], [3000, 900]],
      [[3000, 760], [6360, 760]],
    ],
    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 }, { x: 6360, y: 0, w: 40, h: 1080 },
      // Room A: pen walls; the roof he walks along is the ground at 760, held by these.
      { x: 1800, y: 760, w: 40, h: 140 }, { x: 2960, y: 760, w: 40, h: 140 },
      { x: 1800, y: 740, w: 1200, h: 20 },
      // Room A's door wall over its gate.
      { x: 3200, y: 0, w: 40, h: 560 },
      // Room B: the corridor's roof (3900..5200), with a gap 4000..4080 under
      // the shelf's edge; the shelf; the crate's step up.
      { x: 3900, y: 680, w: 100, h: 20 }, { x: 4080, y: 680, w: 1120, h: 20 },
      { x: 3600, y: 520, w: 480, h: 30 },
      { x: 3520, y: 640, w: 80, h: 120 },
      { x: 3990, y: 600, w: 60, h: 60, movable: true },
    ],
    senders: [{ id: 'p', kind: 'plate', x: 2700, y: 900, w: 220 }],
    gates: [{ x: 3200, y: 560, w: 40, h: 200, needs: ['p'] }],
    bridges: [], platforms: [],
    enemies: [
      { kind: 'shell', x: 2200, y: 900 - CONFIG.ENEMY.SHELL.R, from: 1880, to: 2900, dir: 1 },
      { kind: 'shell', x: 4300, y: 760 - CONFIG.ENEMY.SHELL.R, from: 4060, to: 5000, dir: -1 },
    ],
    checkpoints: [{ x: 1500, y: 760 }, { x: 3400, y: 760 }],
  },
```

Use `tools/` and the screenshot route to *look* at this before routing it (Step 4). The shelf, gap and corridor are the parts most likely to need reshaping. If the room cannot be made to work as drawn, reshape it while keeping the intent above, and record what changed and why.

- [ ] **Step 2: Run `levels`.** Fix every authoring failure (ground under shells, gate checks, wire distances, checkpoint placement) before routing.

- [ ] **Step 3: Write route 12 in `finish.mjs`.** Use level 11's shape: a `stage` chosen from where the ball starts, so the same route serves both checkpoints, and room geometry read from the level (`level.enemies.filter(e => e.kind === 'shell')`, `sender(level, 'p')`, the gate), never copied numbers. The stages are:
  - `toA`: run to the pen roof;
  - `waitA`: stand still until the gate's `openT > 0.9`, then go;
  - `toB`: on to the shelf;
  - `dropB`: push the crate left-to-right over the gap only when room B's shell is under the gap. Predict this from the shell's `x`, `dir` and `PATROL_SPEED`; the route may read state, because it is the test, not the game;
  - `stompB`: drop in and land on the flipped shell;
  - `throughB`: run the corridor to the flag.

  Add 12 to `COUNTS_HEARTS`. Record the margin of room A's door window into a `SPARE12` array, the same way 2c does for level 11: the time used out of the plate window, against a 60% limit. Print it.

- [ ] **Step 4: Run `node games/pushkar-ball/tests/run.mjs finish`.** Iterate on the layout until sections 1 and 2 pass at every lead and delay with no heart lost, and the spare is under 60%. **Then look.** Add level 12 to the browser screenshot route (Task 12 builds the suite; until then use the existing `tests/browser/screens.mjs` pattern) and inspect room A and room B at 568×320 and 740×280.

- [ ] **Step 5: Dead-end check 3o.** Following `3g`/`3k`, try to break room B on purpose: push the crate off the shelf at every 0.25 s of the shell's patrol, and from the corridor push it left and right as far as it goes. Then assert that the level can still be finished (the route from that state reaches the flag) and that the crate never ends flush against the corridor's far opening. Also assert that **room A cannot be finished without the shell on the plate**: freeze the shell's patrol away from the plate (set `from`/`to` in a copy of the data) and expect the route to time out at the door. Prove 3o bites: put a stone box flush at the corridor's exit in a data copy, and expect 3o to fail.

- [ ] **Step 6: Write the header comment.** State the stage and the rooms, and give every swept number with its provenance (*printed by finish.mjs 2d* and so on).

- [ ] **Step 7: Commit.** Message: "Level twelve: the shell, introduced".

### Task 9: Level 13 — Introduction: the aimed popper

**Files:** Modify `js/levels.js` and `tests/offline/finish.mjs` (route `13`, `COUNTS_HEARTS`, `3p`).

**Intent:**
- **Room A, "it aims where you were".** An open floor in front of a popper, with nothing to press or break. Walking in, he sees the arc, steps on, and the lob lands where he was. The route must prove this costs no heart for a ball that keeps moving at the runner's pace.
- **Room B, "make it hit the button".** A button whose cap faces the popper, behind a stone lip, so the ball cannot reach its capped side. Stand just past it, and the lob lands on the cap and opens the gate.
- **Room C, "make it break the planks".** A plank wall the ball cannot reach hard enough (a stone ramp to it is too short to build `BREAKABLE.SPEED`). Stand past it, and the lob breaks it.
- Every checkpoint is out of every popper's reach. The Task 6 levels.mjs check must now count 3 poppers. Prove it bites by moving a checkpoint into room B's popper range and expecting a fail.

- [ ] **Step 1: Paper layout.** Three rooms in a line, each popper facing right (`dir: 1`) from a stone plinth at the room's left, a checkpoint before each plinth (behind the popper, so out of reach by construction), and `range` set per instance so that each room's target spot is reachable but the next room's checkpoint is not. Start with `range: 360`. Write it in level 11's style.

- [ ] **Step 2: Route 13.** Stages per room:
  - **A**: run straight through; dodge is not needed if the runner keeps moving. If the sweep shows hits, add a `keepMoving` rule: never stand still within `range` of an aiming popper.
  - **B and C**: go to the lure spot (read from the room's button or planks position plus `2 * BALL.R`), stand until the popper is in `aim`, then step back out of the arc to a spot read from the level. Wait for the gate's `openT > 0.9` (or `broken`), then continue.

  Add 13 to `COUNTS_HEARTS`.

- [ ] **Step 3: 3p, the rooms need their poppers.** The ball alone cannot press room B's button (drive it at the button from every reachable side, and expect `pressed` never true) or break room C's planks (roll at them at full speed from the furthest run-up, and expect not broken). Prove this bites: lower room C's lip in a data copy, and expect 3p to fail.

- [ ] **Step 4: Sweep, look, and write the header comment** as in Task 8, Steps 4 and 6.

- [ ] **Step 5: Commit.** Message: "Level thirteen: the aimed popper, introduced".

### Task 10: Level 14 — Combination: shell and charger

**Files:** Modify `js/levels.js` and `tests/offline/finish.mjs` (route `14`, `COUNTS_HEARTS`, `3q`, and a spare array `SPARE14`).

**Intent:**
- **Warm-up.** A charger's pen opens onto a floor where a shell patrols, with nothing wired. The lure is the charger's from level 11: stand in its sight beyond the shell, it charges, the shell flips, stomp it.
- **Main room.** A shell patrols over a plate that holds a gate *shut* (`needs: ['!p']`, level 9's inverted input). The charger is penned to the other side, with a sight line into the room. Lure it so the dash flips the shell, then stomp the shell: the plate clears and the gate opens. The window lasts until the popped shell returns, and that return also waits for the ball to be `RETURN_CLEAR` from home. The ball runs *away* from the shell's home to the door, so the door stays open while he heads for it. Print that margin into `SPARE14`, with a 60% limit as before.
- **Make sure the shell cannot be removed any other way**, and that a charger stomped early comes back to try again (it always does; the charger spec).

- [ ] **Step 1: Paper layout, and run `levels`.**
- [ ] **Step 2: Route 14**, staged like level 11's, with stages chosen from the start position.
- [ ] **Step 3: 3q.** The main room cannot be opened by the ball alone (it cannot flip the shell, because no crate is reachable). It is not a dead end: stomp the charger early, wait, and it returns and the lure works again. Prove 3q bites by adding a crate on a ledge above the shell in a data copy and expecting the "ball alone" half to fail.
- [ ] **Step 4: Sweep, look, and write the header comment.**
- [ ] **Step 5: Commit.** Message: "Level fourteen: a charger's dash flips a shell off a plate".

### Task 11: Level 15 — Mastery

**Files:** Modify `js/levels.js` and `tests/offline/finish.mjs` (route `15`, `COUNTS_HEARTS`, `3r`, and dead-end checks for every crate).

**Intent: three rooms, each combining things already taught, ending on a timer.**
1. A popper's lob breaks planks that hold back a crate on a shelf. The freed crate is pushed off onto a shell standing on a plate (inverted, holding the next gate shut). Stomp the shell.
2. A charger penned beside a gate that a shell would otherwise block (the shell's range runs right up to the gate's span edge, but `levels.mjs` forbids it ranging *under* it). Lure the charger into the shell to flip it, stomp it, then pass.
3. A timer button behind a lip, which only a lob can hit. Its gate is far enough that the ball must already be running when the lob lands, so the ball touches the timer's zone while running past. This is the per-presser `touched` fix in use: the ball's touch must not swallow the lob's hit. Room 3's 3r assertion: the run in which the ball is in the zone at the lob's hit still opens the gate.

Every crate gets a dead-end check (3r's sub-parts). The time to spare is printed for room 3's timer (`SPARE15`, 40% minimum, as level 9's 2b).

- [ ] **Step 1: Paper layout, and run `levels`.**
- [ ] **Step 2: Route 15.**
- [ ] **Step 3: 3r.** Room by room: each needs its mechanic (break it in a data copy and expect the route to stall), each crate dead-end check, and the timer hit while touched. Prove each bites once.
- [ ] **Step 4: Sweep, look, and write the header comment.**
- [ ] **Step 5: Commit.** Message: "Level fifteen: mastery".

### Task 12: Browser suite and screenshots

**Files:** Create `tests/browser/shells.mjs`. Modify `tests/browser/_helpers.mjs` only if it needs a colour matcher like the existing `IS_BALL`.

- [ ] **Step 1: Read `tests/browser/chargers.mjs` in full**, including how it drives a level, how it counts `CHARGER_BODY`, and how it guards each picture with the heart-pixel count (`Hearts` geometry from `ui.js`). Copy that shape. Suites share nothing but `_helpers.mjs`.
- [ ] **Step 2: Write the suite.** At 568×320 and 740×280:
  - level 12 room A with the shell on the plate (`SHELL_BODY` count > 0);
  - level 12 room B, the shell flipped under/after the crate;
  - level 13 room B mid-aim (count `POPPER_ARC` dots > 6) and mid-lob;
  - level 14 the charger's dash meeting the shell;
  - a shell's pop and a charger's pop (count `SHELL_POP` and `CHARGER_POP` > 0, and `SHELL_BODY`/`CHARGER_BODY` debris-free: the body count after a pop equals 0 within one frame of the pop for the popped kind).

  Every picture is held to the heart count before and after, so it cannot show the wrong room. Drive with the same stage logic as the `finish.mjs` routes, not hard-coded coordinates. Read positions from the level data at runtime, and button positions from `ui.js`.
- [ ] **Step 3: Run** `node games/pushkar-ball/tests/run.mjs shells`. **Open every screenshot and look.** Check what the spec named: the arc is readable on a phone, the flipped shell reads as flipped, the dome's shine, and both pop shades. Fix what looks wrong, and say in the commit what was seen.
- [ ] **Step 4: Prove the guard bites:** break the level-12 route so the ball dies before room B, and expect the suite to fail on the heart count rather than photograph room A. Restore it.
- [ ] **Step 5: Commit.** Message: "Browser suite for the shell and the aimed popper".

### Task 13: Docs, and the full run

**Files:** Modify `games/pushkar-ball/README.md`, `games/pushkar-ball/tests/README.md`, `CLAUDE.md` (Pushkar Ball section), `docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md`, and the roadmap.

- [ ] **Step 1: README and tests README.** Document the shell, the aimed popper, `presses`/`blocks`, per-presser `touched`, the stomp-wins rule, pop shades, and the new suites, in the existing style.
- [ ] **Step 2: CLAUDE.md, in the Pushkar Ball section only.** Update the wiring bullet: an enemy joins through `presses`, `blocks`, `heavy` and `grounded` now, and the gate check reads `blocks`. Add one bullet: the shell is kicked out from under a crate, not the crate off the shell, and why. Keep it short; the README holds the detail.
- [ ] **Step 3: The spec.** Add "What the build taught" and "Where the build departs from this spec" (at least the shell-kick decision and every layout reshape), and mark the header **built**. In the roadmap, mark sub-project 3 built.
- [ ] **Step 4: Full run.** `node games/pushkar-ball/tests/run.mjs 2>&1 | tail -60`. Expected: everything passes except the known level-7 route (one short). No `sw.js` or hub change was made, so Taras Town's suites are not required. Confirm with `git diff --stat main~13 -- sw.js index.html`, which should show nothing.
- [ ] **Step 5: Commit**, then stop. **Ask the user before pushing.**

---

## Self-review notes

- Spec coverage:
  - shell (Task 7), aimed popper (Tasks 5–6), the five carried items (Tasks 1–4 and Task 7's `homeClear`), levels 12–15 (Tasks 8–11), the browser suite (Task 12), habits (ground rules);
  - spec "popper range never covers a checkpoint": Task 6, Step 6;
  - spec "shell: unbroken ground": Task 7, Step 6.
- One deliberate deviation from the spec, the shell kicked instead of the crate sliding, is recorded at the top of Task 7 and carried into the spec in Task 13.
- Names used across tasks: `blocks`, `presses`, `key`, `popShade`/`shade`, `pop(e)`, `homeClear`, `touching`, `flip(dir, level)`, `lobNow`, `lob.shot`, `range`, `fixed`.
