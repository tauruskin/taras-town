# Moving Spikes and Breakable Wood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spike patches that rise and fall on levels 2 (slow) and 3 (quick), and on level 4 a patch no jump clears, passable either by a crate jump or by smashing through a plank wall into a tunnel beneath it.

**Architecture:** A spike patch gains a per-patch height `s.h`, driven for a rising patch by a sine of level time (the `makeMover` pattern), and read by both the hit box and the drawing. A breakable is a box collider owned by a new `makeBreakable` object whose segments exist until the ball hits it side-on above a speed threshold; player.js detects that hit from the pre-resolution velocity, and `Level.breakWood` removes the segments and spawns the existing pop particles.

**Tech Stack:** Vanilla ES modules, no build step. Offline tests are plain Node scripts run by `node games/pushkar-ball/tests/run.mjs <name>`.

**Spec:** `docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md`

---

## Deviations from the spec, found by simulation before this plan was written

Every number below was run in Node against the real `Ball` and `Level` (scratch scripts, not committed) before being written here.

1. **Level 4's tall patch is not a ground patch at `RISE_H`.** The tunnel needs a roof, so the patch stands on a 20px stone slab (top y=680) over a 60px tunnel, and is **100px tall** (top y=580). Against that: an unaided jump at every take-off point 5..300px before it cleared it **0 of 60** times; a crate jump cleared it whenever the ball hopped onto the crate from within 70px of it and jumped straight off again. Patch width 40–100px made no difference; 100 is used.
2. **"Spikes stop crates" is dropped.** The crate is stopped by the planks and the slab's face before it can reach any spike, so the rule would have no case to act on.
3. **Cycle speeds:** `CYCLE_FAST` 3.5s, `CYCLE_SLOW` 6s. A route that waits until the patch will stay under 90px for the next 0.2–1.0s crossed cleanly at 3, 3.5, 4 and 5s (every lead × ten start delays). 7s lost one run of 30, so 6 is used for slow; **5 is the proven fallback** if level 2 does not finish cleanly at 6.
4. **The break speed is not a skill test.** From rest the ball reaches 300px/s in about 28px of rolling. It separates "rolled into it" from "nudged it", which is what a wobble-then-smash lesson needs, and nothing more.
5. **Review changed three numbers after this plan:** level 4's teeth are 80 tall, not 100; `LOW_OK` in `finish.mjs` is 75, not 90; and `BREAKABLE.KNOCK` (60) was added so leaning on planks does not rattle them. See `git log` for the commits and their reasons.

## Files

- Modify `games/pushkar-ball/js/config.js` — `SPIKE.RISE_H/CYCLE_SLOW/CYCLE_FAST`, new `BREAKABLE` block, CRATE colour comment reworded.
- Modify `games/pushkar-ball/js/hazards.js` — `spikeHeight`, per-patch height in `spikeBox` and `drawSpikes`.
- Modify `games/pushkar-ball/js/levels.js` — spike loader and update, `makeBreakable`, Level wiring, `breakWood`, level data for 2, 3, 4.
- Modify `games/pushkar-ball/js/player.js` — break detection.
- Modify `games/pushkar-ball/js/main.js` — `drawBreakables`, wood particles, beam comment.
- Create `games/pushkar-ball/tests/offline/risers.mjs`, `games/pushkar-ball/tests/offline/breakables.mjs`.
- Modify `games/pushkar-ball/tests/offline/finish.mjs` — `waitForLow`, routes 2/3/4, `crateRoute4`, section 3d.
- Docs: `CLAUDE.md`, `games/pushkar-ball/README.md`, `games/pushkar-ball/tests/README.md`, the spec.

No new module files, so `sw.js` and its precache list do not change.

---

### Task 1: Rising spikes — the mechanism

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (the `SPIKE` block, ~line 291)
- Modify: `games/pushkar-ball/js/hazards.js`
- Modify: `games/pushkar-ball/js/levels.js` (import line 21; `Level` constructor ~line 1205; `Level.update` ~line 1241)
- Create: `games/pushkar-ball/tests/offline/risers.mjs`

- [ ] **Step 1: Write the failing suite**

Create `games/pushkar-ball/tests/offline/risers.mjs`:

```js
// Rising spikes: a patch whose height follows a sine of level time, from
// SPIKE.H (jumpable) to SPIKE.RISE_H (no jump clears it). The hit box and the
// picture both read the same `s.h`. A patch with no `rise` keeps whatever
// height it was authored with, SPIKE.H by default — see hazards.mjs.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');
const { spikeBox, spikeHeight } = await import('../../js/hazards.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const S = CONFIG.SPIKE;

// Walled at both ends for the reason hazards.mjs gives: without them a ball
// rolling for seconds falls off the world and the fall is what gets measured.
const world = (spikes) => loadLevel({
  id: 94, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 300, y: 700 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2000, y: 0, w: 40, h: 1080 }],
  platforms: [],
  spikes,
});

// --- 1. a patch without `rise` keeps its authored height -------------------
{
  console.log('\n1. static patches');
  if (spikeHeight({ x: 0, y: 0, w: 60 }, 5, CONFIG) !== S.H) fail(`a plain patch is ${spikeHeight({ x: 0, y: 0, w: 60 }, 5, CONFIG)} tall, not SPIKE.H ${S.H}`);
  if (spikeHeight({ x: 0, y: 0, w: 60, h: 100 }, 5, CONFIG) !== 100) fail('a patch authored 100 tall does not report 100');
  const level = world([{ x: 800, y: 760, w: 60 }, { x: 1200, y: 760, w: 60, h: 100 }]);
  if (level.spikes[0].h !== S.H) fail(`loaded plain patch h=${level.spikes[0].h}`);
  if (level.spikes[1].h !== 100) fail(`loaded tall patch h=${level.spikes[1].h}`);
  const box = spikeBox(level.spikes[1], CONFIG);
  if (box.h !== 100 || box.y !== 660) fail(`a 100-tall patch's box is ${box.h} tall at y=${box.y}, expected 100 at 660`);
}

// --- 2. the cycle's shape ---------------------------------------------------
//
// Period 4, phase 0: a quarter in, the sine is at its top; three quarters in,
// its bottom; at zero, halfway. Exact to float noise, because it is a formula.
{
  const s = { x: 0, y: 760, w: 60, rise: { period: 4, phase: 0 } };
  const mid = (S.H + S.RISE_H) / 2;
  const at = (t) => spikeHeight(s, t, CONFIG);
  console.log(`\n2. period 4: t=0 ${at(0).toFixed(2)}, t=1 ${at(1).toFixed(2)}, t=3 ${at(3).toFixed(2)}`);
  if (Math.abs(at(0) - mid) > 1e-9) fail(`t=0 is ${at(0)}, expected the midpoint ${mid}`);
  if (Math.abs(at(1) - S.RISE_H) > 1e-9) fail(`t=1 is ${at(1)}, expected RISE_H ${S.RISE_H}`);
  if (Math.abs(at(3) - S.H) > 1e-9) fail(`t=3 is ${at(3)}, expected H ${S.H}`);
  if (Math.abs(at(5) - at(1)) > 1e-9) fail('the cycle does not repeat after one period');
}

// --- 3. the level drives it, and the hit box follows ----------------------
{
  const level = world([{ x: 1500, y: 760, w: 60, rise: { period: 4, phase: 0 } }]);
  for (let i = 0; i < 120; i++) level.update(CONFIG.STEP);
  const s = level.spikes[0];
  const want = spikeHeight(s, level.time, CONFIG);
  const box = spikeBox(s, CONFIG);
  console.log(`\n3. after ${level.time.toFixed(3)}s the patch is ${s.h.toFixed(2)} tall; box ${box.h.toFixed(2)} at y=${box.y.toFixed(2)}`);
  if (Math.abs(s.h - want) > 1e-9) fail(`Level.update left h=${s.h}, the formula says ${want}`);
  if (box.h !== s.h || box.y !== s.y - s.h) fail('the hit box does not follow the patch height');
}

// --- 4. RISE_H is out of an unaided jump's reach ---------------------------
//
// On paper first: at the top of a jump the ball's underside is `reach` above
// the ground, and forgiveness lets it sink FORGIVE into the teeth. Then for
// real: a patch held at RISE_H, jumped at every take-off point, is never
// crossed without a hit.
{
  const reach = CONFIG.JUMP_V ** 2 / (2 * CONFIG.GRAVITY);
  const margin = S.RISE_H - S.FORGIVE - reach;
  console.log(`\n4. RISE_H ${S.RISE_H}: a jump's underside peaks ${reach.toFixed(0)}px up, ${margin.toFixed(0)}px short of the teeth`);
  if (margin < 30) fail(`RISE_H leaves only ${margin.toFixed(0)}px between a jump and the teeth; 30 is the least`);

  const X = 1200, W = 60;
  let cleared = 0, tries = 0;
  for (let from = X - 300; from <= X - 5; from += 5) {
    tries++;
    const level = world([{ x: X, y: 760, w: W, h: S.RISE_H }]);
    const ball = new Ball(300, 740);
    let press = false, done = false;
    const input = { left: false, right: true, takeJump() { const j = press; press = false; return j; } };
    for (let i = 0; i < 4 / CONFIG.STEP; i++) {
      if (!done && ball.grounded && ball.x >= from) { press = true; done = true; }
      level.update(CONFIG.STEP);
      ball.update(CONFIG.STEP, input, level);
    }
    if (ball.x > X + W + 20 && ball.hits === 0) cleared++;
  }
  console.log(`   ${tries} take-off points, ${cleared} crossed it`);
  if (cleared) fail(`a patch at RISE_H was jumped cleanly ${cleared} time(s) of ${tries}`);
}

// --- 5. nothing goes NaN ------------------------------------------------------
{
  const level = world([{ x: 900, y: 760, w: 60, rise: { period: 3.5, phase: 0.25 } }]);
  const ball = new Ball(300, 740);
  const input = { left: false, right: true, takeJump: () => ball.grounded };
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 8 / CONFIG.STEP; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    lo = Math.min(lo, level.spikes[0].h); hi = Math.max(hi, level.spikes[0].h);
  }
  console.log(`\n5. eight seconds against a rising patch: ball ${ball.x.toFixed(0)},${ball.y.toFixed(0)}; height ranged ${lo.toFixed(1)}..${hi.toFixed(1)}`);
  if (![ball.x, ball.y, ball.vx, ball.vy, lo, hi].every(Number.isFinite)) fail('a value went non-finite');
  if (lo < S.H - 1e-9 || hi > S.RISE_H + 1e-9) fail(`height left ${S.H}..${S.RISE_H}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL RISER CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs risers`
Expected: FAIL — `spikeHeight` is not exported from hazards.js.

- [ ] **Step 3: Add the config**

In `games/pushkar-ball/js/config.js`, inside `SPIKE`, after `FORGIVE: 5,` add:

```js

    // A rising patch — levels 2 and 3 — climbs from H to this and back on a
    // sine of level time. Tall enough that no unaided jump clears it: a jump's
    // underside peaks 131px up, so this leaves 44px after FORGIVE, and
    // tests/offline/risers.mjs holds it to at least 30. See
    // docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md.
    RISE_H: 180,
    // Seconds for one whole rise and fall. A route that waits for the patch to
    // stay under 90px for its crossing finished cleanly at 3-5s; 7s lost a run.
    // If level 2 stops finishing cleanly, 5 is the proven slow value.
    CYCLE_SLOW: 6,       // level 2
    CYCLE_FAST: 3.5,     // level 3
```

- [ ] **Step 4: Per-patch height in hazards.js**

Replace `spikeBox`'s body:

```js
export function spikeBox(s, cfg) {
  const h = s.h ?? cfg.SPIKE.H;
  return {
    x: s.x,
    y: s.y - h,
    w: s.w,
    h,
  };
}
```

Add after `spikeBox`:

```js
/**
 * How tall a patch is at level time `t`.
 *
 * A patch with no `rise` is whatever height it was authored — SPIKE.H unless
 * it says otherwise, as level 4's patch on the slab does. A rising one follows
 * a sine of level time from SPIKE.H to SPIKE.RISE_H, for the reason moving
 * platforms do: the level looks the same on every attempt, so the rhythm can
 * be learned, and a test can ask the height at `t` without running anything.
 * The sine dwells at both ends, which is what makes "up" and "down" readable.
 */
export function spikeHeight(s, t, cfg) {
  if (!s.rise) return s.h ?? cfg.SPIKE.H;
  const a = (t / s.rise.period + (s.rise.phase || 0)) * Math.PI * 2;
  return cfg.SPIKE.H + (cfg.SPIKE.RISE_H - cfg.SPIKE.H) * (1 + Math.sin(a)) / 2;
}
```

In `drawSpikes`, as the first line inside `for (const s of spikes) {` add `const h = s.h ?? cfg.SPIKE.H;` and change `ctx.lineTo(x + tw / 2, s.y - cfg.SPIKE.H);` to `ctx.lineTo(x + tw / 2, s.y - h);`. The teeth then grow with the patch, from the same number the hit box uses.

- [ ] **Step 5: Load and drive it in levels.js**

Change line 21 to:

```js
import { hitsSpikes, spikeHit, spikeHeight } from './hazards.js';
```

Replace `this.spikes = (data.spikes || []).map((s) => ({ x: s.x, y: s.y, w: s.w }));` with:

```js
    // `h` is how tall the patch is RIGHT NOW. A rising patch's `h` is rewritten
    // every step in `update`; everything else — the hit box, the drawing —
    // only reads it, so the two can never disagree.
    this.spikes = (data.spikes || []).map((s) => {
      const p = { x: s.x, y: s.y, w: s.w, h: s.h ?? CONFIG.SPIKE.H, rise: s.rise || null };
      p.h = spikeHeight(p, 0, CONFIG);
      return p;
    });
```

In `update(dt)`, directly after `this.time += dt;` add:

```js
    // Before anything hit-tests this step, so a ball is asked about the teeth
    // as they are now, not as they were a step ago.
    for (const s of this.spikes) if (s.rise) s.h = spikeHeight(s, this.time, CONFIG);
```

- [ ] **Step 6: Run the suite and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs risers`
Expected: `ok    ALL RISER CHECKS PASSED`

- [ ] **Step 7: Run all offline suites**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite ok. No level uses `rise` or `h` yet, so `hazards`, `levels` and `finish` must be unchanged.

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/hazards.js games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/risers.mjs
git commit -m "Add rising spike patches

A patch may carry a rise cycle, a sine of level time from SPIKE.H to
SPIKE.RISE_H. The hit box and the drawn teeth both read the patch's own
height, so a rising patch grows as it rises. No level uses it yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Breakable wood — the mechanism

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (after the `CRATE` block, ~line 110)
- Modify: `games/pushkar-ball/js/levels.js` (`makeBreakable` after `makeGate` ~line 917; `Level` constructor, `update`, `solidsFor`, `near`; new `breakWood`)
- Modify: `games/pushkar-ball/js/player.js` (~line 272 and after the pad block ~line 306)
- Create: `games/pushkar-ball/tests/offline/breakables.mjs`

- [ ] **Step 1: Write the failing suite**

Create `games/pushkar-ball/tests/offline/breakables.mjs`:

```js
// Breakable wood: a plank wall that stops everything until the ball rolls into
// it hard, then is gone for the rest of that play of the level. A slower knock
// only rattles and cracks it. See
// docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const PLANKS = { x: 1000, y: 660, w: 30, h: 100 };
const world = (extraBoxes = []) => loadLevel({
  id: 95, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 700 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2000, y: 0, w: 40, h: 1080 }, ...extraBoxes],
  platforms: [],
  breakables: [PLANKS],
});

const hold = (right) => ({ left: false, right, takeJump: () => false });
const run = (ball, level, input, seconds, each) => {
  for (let i = 0; i < seconds / CONFIG.STEP; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    if (each) each();
  }
};

// --- 1. the loader builds it ----------------------------------------------
{
  const level = world();
  const b = level.breakables[0];
  console.log(`\n1. ${level.breakables.length} breakable(s), broken=${b.broken}, ${b.segments.length} segments`);
  if (level.breakables.length !== 1) fail('expected one breakable');
  if (b.broken) fail('a fresh one is already broken');
  if (b.segments.length !== 4) fail(`expected a box's 4 segments, got ${b.segments.length}`);
  if (!b.segments.every((s) => s.owner === b)) fail('its segments do not lead back to it');
  // The carrier contract CLAUDE.md warns about: anything the ball can stand on
  // owes dx, dy, vx, vy, or the ball's position goes NaN the first frame.
  if (![b.dx, b.dy, b.vx, b.vy].every((v) => v === 0)) fail('it does not carry dx/dy/vx/vy');
}

// --- 2. a slow knock rattles it and does not break it -----------------------
//
// 15px from the face at rest, then held right: contact comes at about 220px/s,
// under BREAKABLE.SPEED, and the ball keeps leaning on it for two seconds.
{
  const level = world();
  const b = level.breakables[0];
  const ball = new Ball(PLANKS.x - CONFIG.BALL.R - 15, 740);
  run(ball, level, hold(false), 0.5);
  let wobbled = false;
  run(ball, level, hold(true), 2, () => { if (b.wobbleT > 0) wobbled = true; });
  console.log(`\n2. a slow knock: broken=${b.broken}, cracked=${b.cracked}, wobbled=${wobbled}, ball at x=${ball.x.toFixed(1)}`);
  if (b.broken) fail('a slow knock broke it');
  if (!b.cracked || !wobbled) fail('a slow knock did not rattle it');
  if (ball.x > PLANKS.x) fail('the ball got through unbroken planks');
}

// --- 3. a fast roll breaks it, and the ball keeps going -----------------------
{
  const level = world();
  const b = level.breakables[0];
  const ball = new Ball(400, 740);
  run(ball, level, hold(false), 0.3);
  let pieces = 0;
  run(ball, level, hold(true), 2, () => { if (b.broken && !pieces) pieces = level.particles.length; });
  console.log(`\n3. a fast roll: broken=${b.broken}, ${pieces} pieces, ball at x=${ball.x.toFixed(0)}, hits=${ball.hits}`);
  if (!b.broken) fail('rolling into it at full speed did not break it');
  if (!pieces) fail('breaking it threw no pieces');
  if (b.segments.length) fail('a broken one still has segments');
  if (ball.x < PLANKS.x + PLANKS.w + 100) fail(`the ball stopped at x=${ball.x.toFixed(0)} instead of going through`);
  if (ball.hits) fail('breaking it cost a heart');

  // --- 4. and it stays broken after a respawn ---------------------------------
  for (let h = 0; h < CONFIG.HEALTH.HEARTS; h++) {
    ball.hit(1);
    run(ball, level, hold(false), CONFIG.HEALTH.IFRAME + 0.05);
  }
  run(ball, level, hold(false), 3);
  const near = level.near(PLANKS.x + 15, 710, 60);
  console.log(`\n4. after running out of hearts: deaths=${ball.deaths}, ball at x=${ball.x.toFixed(0)}, broken=${b.broken}`);
  if (ball.deaths !== 1) fail(`expected one death, got ${ball.deaths} — nothing below was tested`);
  if (!b.broken) fail('a respawn put the planks back');
  if (near.some((s) => s.owner === b)) fail('a broken one still offers the ball segments');
}

// --- 5. a crate is stopped by it and does not break it ------------------------
{
  const level = world([{ x: 800, y: 660, w: 100, h: 100, movable: true }]);
  const b = level.breakables[0], crate = level.crates[0];
  const ball = new Ball(700, 740);
  run(ball, level, hold(true), 4);
  console.log(`\n5. a crate shoved into it: crate at x=${crate.x.toFixed(1)}, broken=${b.broken}`);
  if (b.broken) fail('a pushed crate broke it');
  if (crate.x + crate.w > PLANKS.x + 0.5) fail(`the crate went into the planks, to x=${crate.x.toFixed(1)}`);
  if (crate.x < PLANKS.x - crate.w - 5) fail('the crate never reached the planks, so nothing was tested');
}

// --- 6. standing on top of it is safe ----------------------------------------
{
  const level = world();
  const ball = new Ball(PLANKS.x + 15, 600);
  run(ball, level, hold(false), 1);
  console.log(`\n6. dropped on top: at ${ball.x.toFixed(1)},${ball.y.toFixed(1)}, grounded=${ball.grounded}`);
  if (![ball.x, ball.y, ball.vx, ball.vy].every(Number.isFinite)) fail('standing on it made the ball non-finite');
  if (level.breakables[0].broken) fail('landing on top broke it');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BREAKABLE CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs breakables`
Expected: FAIL — `level.breakables` is undefined.

- [ ] **Step 3: Add the config**

In `config.js`, after the `CRATE` block's closing `},` add:

```js

  // ---------------------------------------------------------------------
  // Breakable wood
  // ---------------------------------------------------------------------
  // A plank wall. Wood gives way and stone never does: a crate gives way by
  // sliding, planks by breaking. It stops everything — ball, crate, roller —
  // until the ball rolls into it hard, and then it is gone for the rest of that
  // play of the level, respawns included. See
  // docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md.
  BREAKABLE: {
    // How fast the ball must be heading into it, in px/s. Not a skill test —
    // from rest the ball passes this in about 28px — but it separates rolling
    // into the planks from leaning on them, which is what lets a slow knock
    // rattle them and teach "harder" without a word.
    SPEED: 300,
    WOBBLE_TIME: 0.3,    // s a slower knock rattles it for
    WOBBLE_PX: 3,        // how far the rattle moves the drawing, never the collider
    BOARD_W: 10,         // one board, so a wall is drawn as w / BOARD_W boards
  },
```

- [ ] **Step 4: `makeBreakable` in levels.js**

After `makeGate`'s closing `}` add:

```js
/**
 * A plank wall: a solid box until it is broken, then nothing at all.
 *
 * `segments` is emptied rather than the object removed, so the level's own
 * list, and anything a test holds, keeps pointing at the same thing. It owes
 * dx/dy/vx/vy because the ball can land on top of it, and player.js adds a
 * carrier's `dx` without asking — the crate NaN bug in CLAUDE.md.
 *
 * `cracked` is permanent once knocked and only ever drawn; `wobbleT` counts
 * down in `Level.update` the way a pad's `squashT` does.
 */
function makeBreakable(d) {
  const b = {
    x: d.x, y: d.y, w: d.w, h: d.h,
    breakable: true,
    broken: false,
    cracked: false,
    wobbleT: 0,
    dx: 0, dy: 0, vx: 0, vy: 0,
    segments: boxSegments(d.x, d.y, d.w, d.h),

    bump() {
      b.cracked = true;
      b.wobbleT = CONFIG.BREAKABLE.WOBBLE_TIME;
    },

    overlaps(x, y, r) {
      return !b.broken && x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h;
    },
  };
  for (const s of b.segments) s.owner = b;
  return b;
}
```

- [ ] **Step 5: Wire it into `Level`**

In the constructor, after `this.gates = (data.gates || []).map(makeGate);` add:

```js

    // Breakables ARE colliders, and dynamic in the one way that matters —
    // they stop existing — so like gates they stay OUT of the static grid.
    this.breakables = (data.breakables || []).map(makeBreakable);
```

In `update(dt)`, after `for (const p of this.pads) p.squashT = Math.max(0, p.squashT - dt);` add:

```js
    for (const b of this.breakables) b.wobbleT = Math.max(0, b.wobbleT - dt);
```

In `solidsFor(crate)`, after the gates line add:

```js
    for (const b of this.breakables) out.push(...b.segments);
```

In `near(x, y, r)`, after the gates line add:

```js
    for (const b of this.breakables) if (b.overlaps(x, y, r)) out.push(...b.segments);
```

After `stompEnemy`'s closing `}` (inside the class) add:

```js

  /**
   * Break a plank wall: its segments go, for good, and it throws the same pop
   * a stomped enemy does, in wood. player.js decides WHEN; this is only what
   * breaking is. The pieces are at fixed angles for the reason stompEnemy's
   * are: the level looks the same every time.
   */
  breakWood(b) {
    b.broken = true;
    b.segments = [];
    const P = CONFIG.ENEMY.POP;
    for (let i = 0; i < P.COUNT; i++) {
      const a = (i / P.COUNT) * Math.PI * 2;
      this.particles.push({
        x: b.x + b.w / 2, y: b.y + b.h / 2,
        vx: Math.cos(a) * P.SPEED,
        vy: Math.sin(a) * P.SPEED,
        angle: a,
        life: P.LIFE,
        wood: true,
      });
    }
  }
```

- [ ] **Step 6: Detect the hit in player.js**

Change `const contacts = step(this, level, dt, C);` (~line 272) to:

```js
    // Read before resolution, which takes speed away on contact — see "break
    // wood" below, which needs to know how hard the ball was going.
    const vxIn = this.vx;
    const contacts = step(this, level, dt, C);
```

After the bounce pad block's closing `}` and before `this.spin += ...` add:

```js

    // --- break wood -------------------------------------------------------
    //
    // A plank wall gives way to a ball hitting it side-on, heading into it,
    // at BREAKABLE.SPEED or more. The speed is handed back afterwards, so the
    // ball smashes through instead of stopping dead in the doorway it just
    // made. Anything slower only rattles it. A ball that is not moving at all
    // is not knocking, so it does not rattle it for ever by resting against it.
    for (const c of contacts) {
      const wood = c.seg.owner;
      if (!wood || !wood.breakable || wood.broken) continue;
      if (Math.abs(c.nx) < C.CRATE.PUSH_NX || Math.abs(vxIn) < 1) continue;
      if (Math.sign(c.nx) === Math.sign(vxIn)) continue;
      if (Math.abs(vxIn) >= C.BREAKABLE.SPEED) {
        level.breakWood(wood);
        this.vx = vxIn;
      } else {
        wood.bump();
      }
      break;
    }
```

- [ ] **Step 7: Run the suite and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs breakables`
Expected: `ok    ALL BREAKABLE CHECKS PASSED`

If check 2 reports the planks broken, print `vxIn` at the contact before touching anything: the approach distance, not the threshold, is the first suspect.

- [ ] **Step 8: Run all offline suites**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite ok.

- [ ] **Step 9: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js games/pushkar-ball/js/player.js games/pushkar-ball/tests/offline/breakables.mjs
git commit -m "Add breakable plank walls

A box collider that stops ball, crate and roller until the ball rolls into
it side-on at BREAKABLE.SPEED, then loses its segments for the rest of the
level and throws the stomp pop. A slower knock rattles and cracks it.
Broken stays broken across a respawn. No level uses it yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Draw the planks, and reword the wood rule in code

**Files:**
- Modify: `games/pushkar-ball/js/main.js` (`draw()` ~line 222; after `drawCrates` ~line 529; `drawBeams` comment ~line 596; `drawParticles` ~line 681)
- Modify: `games/pushkar-ball/js/config.js` (COLOURS comment above `CRATE`, ~line 619)

- [ ] **Step 1: Add `drawBreakables`**

After `drawCrates`' closing `}` add:

```js

/**
 * Plank walls: a row of upright boards with daylight between them, in the
 * crate's own wood — so it reads as wood, and so as something that gives way —
 * but never a solid box, so it is never mistaken for a crate. A knock rattles
 * the drawing (never the collider) and leaves a crack for good. A broken one
 * is simply not drawn; its pieces are `level.particles`.
 */
function drawBreakables() {
  const C = CONFIG.COLOURS;
  const B = CONFIG.BREAKABLE;
  for (const b of level.breakables) {
    if (b.broken) continue;
    const x0 = b.x + (b.wobbleT > 0 ? Math.sin(b.wobbleT * 60) * B.WOBBLE_PX : 0);
    const n = Math.max(1, Math.round(b.w / B.BOARD_W));
    const bw = b.w / n;
    ctx.fillStyle = C.CRATE;
    for (let i = 0; i < n; i++) ctx.fillRect(x0 + i * bw + 1, b.y, bw - 2, b.h);
    ctx.strokeStyle = C.CRATE_LINE;
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) ctx.strokeRect(x0 + i * bw + 1, b.y + 1, bw - 2, b.h - 2);
    if (b.cracked) {
      ctx.beginPath();
      ctx.moveTo(x0 + b.w * 0.2, b.y + b.h * 0.15);
      ctx.lineTo(x0 + b.w * 0.6, b.y + b.h * 0.4);
      ctx.lineTo(x0 + b.w * 0.3, b.y + b.h * 0.6);
      ctx.lineTo(x0 + b.w * 0.8, b.y + b.h * 0.85);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}
```

In `draw()`, after `drawCrates();` add `drawBreakables();`.

- [ ] **Step 2: Wood pieces**

In `drawParticles`, replace

```js
    ctx.fillStyle = C.ENEMY;
    ctx.fill();
    ctx.strokeStyle = C.ENEMY_EDGE;
```

with

```js
    ctx.fillStyle = p.wood ? C.CRATE : C.ENEMY;
    ctx.fill();
    ctx.strokeStyle = p.wood ? C.CRATE_LINE : C.ENEMY_EDGE;
```

and add to that function's doc comment: `Pieces of broken planks carry \`wood\` and are drawn in the crate's colours instead.`

- [ ] **Step 3: Reword the rule where the code states it**

In `config.js`, replace the COLOURS comment above `CRATE: '#C98A4B',`:

```js
    // Wood means "you can push this". The level's boundary walls are boxes
    // too, and they used to be drawn in exactly this wood, which made the rule
    // a lie the moment crates became pushable — so the walls have their own
    // stone colours below and nothing wooden is ever fixed in place.
```

with:

```js
    // Wood gives way; stone never does. A crate gives way by sliding and a
    // plank wall by breaking, and both are drawn in this wood. The level's
    // boundary walls are boxes too, and they used to be drawn in exactly this
    // wood, which made the rule a lie the moment crates became pushable — so
    // the walls have their own stone colours below.
```

In `main.js`'s `drawBeams` comment, replace `never wood, which in this game always means\n * "you can push this".` with `never wood, which in this game always means\n * something that gives way.`

- [ ] **Step 4: Run all offline suites**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite ok (`precache` included: no new files).

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/js/main.js games/pushkar-ball/js/config.js
git commit -m "Draw plank walls and their broken pieces

Upright boards in the crate's wood, rattling and cracking when knocked,
breaking into wood-coloured pop pieces. The wood rule is reworded where
the code states it: wood gives way, stone never does.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Rising patches on levels 2 and 3

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (level 2 data ~line 207; level 3 data ~line 349)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs`

- [ ] **Step 1: Teach the finish suite to wait**

In `finish.mjs`, after line 31 add:

```js
const { spikeHeight } = await import('../../js/hazards.js');
```

After `runner`'s closing `}` add:

```js

/**
 * The runner, except that it waits for a rising patch to be down.
 *
 * Within 260px of a rising patch, and not yet committed to it, it looks ahead
 * with the same formula the level uses: if the patch will stay under LOW_OK for
 * the whole crossing — 0.2 to 1.0s from now — it runs; otherwise it backs off
 * to 200px and holds still. 90 is what a jumping ball clears, not what the
 * teeth are; a stricter 60 never found a window at 3-4s cycles.
 */
const LOW_OK = 90;
function waitForLow(level, lead) {
  const run = runner(level, lead);
  const risers = level.spikes.filter((s) => s.rise);
  return (ball) => {
    const s = risers.find((r) => r.x + r.w > ball.x - 20 && r.x - ball.x < 260);
    if (!s || !ball.grounded || ball.x > s.x - 60) return run(ball);
    for (let k = 0.2; k <= 1.0; k += 0.05) {
      if (spikeHeight(s, level.time + k, CONFIG) > LOW_OK) {
        if (ball.x > s.x - 200) return { left: true };
        return { left: ball.vx > 30, right: ball.vx < -30 };
      }
    }
    return run(ball);
  };
}
```

Change route 2 to:

```js
  // Level two: running and jumping over gaps and every enemy, and waiting for
  // its one rising patch to be down.
  2: (level, lead) => waitForLow(level, lead),
```

In route 3, change `const run = runner(level, lead);` to `const run = waitForLow(level, lead);`, and add to its comment: `It waits for the level's rising patch the same way level two does.`

- [ ] **Step 2: Run finish and confirm nothing changed**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: ok. No level has a rising patch yet, so `waitForLow` is the runner.

- [ ] **Step 3: Add level 2's patch**

In level 2's data, after `platforms: [],` add:

```js

    // One rising patch, slow — the first spikes in the level, and a new idea,
    // so it sits on open ground before any checkpoint, where meeting it wrong
    // costs little. On the flat after the popper and the 220px gap: 680 past
    // the landing edge, 840 before checkpoint one, and 1180 before the roller's
    // patrol begins, so its timing is never asked at the same moment as
    // anything else's. Too tall to jump at its top; wait for it to sink.
    spikes: [
      { x: 5700, y: 760, w: 60, rise: { period: CONFIG.SPIKE.CYCLE_SLOW, phase: 0 } },
    ],
```

- [ ] **Step 4: Add level 3's patch**

In level 3's data, after `platforms: [],` add:

```js

    // One rising patch, quick — the same idea level two taught slowly, now
    // with a shorter window. After checkpoint one, so a mistimed wait costs
    // this stretch and not the gaps before it: 1140 past the 240px gap's
    // landing edge and 1140 before the next gap, far from the walker and the
    // crate flat.
    spikes: [
      { x: 7800, y: 760, w: 60, rise: { period: CONFIG.SPIKE.CYCLE_FAST, phase: 0 } },
    ],
```

- [ ] **Step 5: Run levels and finish**

Run: `node games/pushkar-ball/tests/run.mjs levels`
Expected: ok.

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: ok, with levels 2 and 3 "finished every time without failing".

If level 2 fails at `CYCLE_SLOW: 6`, set it to 5 (proven in simulation) and update its config comment to say why, rather than re-tuning the route. If level 3 fails, print `level.time`, the patch's `h`, and the ball's `x`/`vx` at the first hit before changing any number — per CLAUDE.md, suspect the route before the level.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs games/pushkar-ball/js/config.js
git commit -m "Put rising spikes on levels two and three

Level two meets one slow patch on open ground; level three a quick one
after its first checkpoint. The finish suite's routes wait for a patch to
be down, using the level's own formula to look ahead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Level 4 — the tall patch, the crate and the tunnel

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (level 4 data ~line 460)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs`

- [ ] **Step 1: Add the geometry to level 4**

Level 4's last flat runs from 12150 to 15160 at y=760, with the goal at 15000. In level 4's `boxes`, after the second boundary wall add:

```js
      // The slab: a stone roof over a 60px tunnel, carrying the tall patch.
      // Its top is at 680 and the teeth reach 580. An unaided jump's underside
      // peaks at 629 — 49px short — and a jump off a crate peaks at 529, 51px
      // clear. Both were simulated at every take-off point before this was
      // written; see this level's route in tests/offline/finish.mjs, section 3d.
      { x: 13400, y: 680, w: 100, h: 20 },
      // The crate for the first way past, 800 short of the planks, on open
      // flat so it can be shoved all the way without meeting anything. The
      // planks and the slab's face stop it; it is 100 tall and the tunnel is
      // 60, so it can never be pushed in.
      { x: 12500, y: 660, w: 100, h: 100, movable: true },
```

In level 4's `spikes`, after the patch at 11100 add:

```js
      // The patch that does not come down. It stands on the slab over the
      // tunnel and no jump from the ground clears it. Two ways past: shove the
      // crate against the planks and jump from it, or roll into the planks
      // hard enough to break them and go underneath.
      { x: 13400, y: 680, w: 100, h: 100 },
```

After level 4's `spikes` array add:

```js

    // The tunnel's door: planks filling the gap under the slab's left edge,
    // 60 tall from the slab's underside to the ground.
    breakables: [
      { x: 13400, y: 700, w: 30, h: 60 },
    ],
```

Add to level 4's header comment: `Past checkpoint two, on the long flat home, it asks something new: a patch no jump clears, on a slab over a boarded-up tunnel — a way must be MADE, with the crate or by smashing the planks.`

- [ ] **Step 2: Run levels and finish, and confirm level 4 now fails**

Run: `node games/pushkar-ball/tests/run.mjs levels`
Expected: ok.

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: FAIL on level 4 — the runner jumps at the tall patch and never gets past.

- [ ] **Step 3: Level 4's routes**

Replace route 4 with:

```js
  // Level four: the runner, until the planks under its tall patch. From 500
  // short of them to just past the tunnel it only holds right, so it arrives
  // at full speed, breaks them and rolls underneath. Section 3d proves the
  // crate way too, and that there is no third.
  4: (level, lead) => {
    const run = runner(level, lead);
    const wood = level.breakables[0];
    return (ball) => {
      if (ball.x > wood.x - 500 && ball.x < wood.x + 150) return { right: true };
      return run(ball);
    };
  },
```

After the `ROUTES` object's closing `};` add:

```js

// Level four's other way: shove the crate against the planks, back off at
// least 160, hop onto the crate from within 50 * lead of it and jump off the
// instant it lands. Simulated from rest: hopping from within 30-70px of the
// crate cleared the patch every time; from 90px or more it hit the teeth.
function crateRoute4(level, lead) {
  const run = runner(level, lead);
  const crate = level.crates[0];
  const wood = level.breakables[0];
  let stage = 'run', stuck = 0, lastX = crate.x;
  return (ball) => {
    if (stage === 'run') {
      if (ball.grounded && ball.x > crate.x - 200 && ball.x < crate.x) stage = 'push';
      else return run(ball);
    }
    if (stage === 'push') {
      stuck = Math.abs(crate.x - lastX) < 0.01 && crate.x + crate.w > wood.x - 5 ? stuck + 1 : 0;
      lastX = crate.x;
      if (stuck > 30) stage = 'back';
      return { right: true };
    }
    if (stage === 'back') {
      if (ball.x < crate.x - 160) stage = 'hop';
      return { left: true };
    }
    if (stage === 'hop') {
      if (ball.grounded && ball.platform === crate) stage = 'over';
      return { right: true, jump: ball.grounded && ball.platform !== crate && ball.x > crate.x - 50 * lead };
    }
    return { right: true, jump: ball.grounded && ball.platform === crate };
  };
}
```

- [ ] **Step 4: Section 3d**

After section 3c's closing `}` add:

```js

// --- 3d. level four: both ways past its tall patch, and no third -----------
//
// The route above goes through the tunnel, so it must have broken the planks.
// The crate route, from checkpoint two, must finish without breaking them. With
// the crate gone and the planks made unbreakable, no jump from anywhere gets
// past. And a slow roll into the real planks leaves them standing.
console.log('\n3d. level four, both ways past its tall patch');
{
  const data = LEVELS.find((l) => l.id === 4);
  const plank = data.breakables?.[0];
  const tall = plank && data.spikes.find((s) => s.x === plank.x);
  if (!plank || !tall) fail('level 4 has no planks under a tall patch — has the geometry moved?');
  else {
    const past = plank.x + tall.w + 20;

    const tunnel = play(data, (lv) => ROUTES[4](lv, 1));
    if (!tunnel.ball.won) fail('level 4\'s tunnel route did not finish');
    else if (!tunnel.level.breakables[0].broken) fail('level 4 was finished without breaking the planks — the tunnel is not what finished it');
    else console.log('   the tunnel route broke the planks on its way to the flag');

    const cp = data.checkpoints[1];
    const from = { x: cp.x, y: cp.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE };
    const bad = [];
    for (const lead of LEADS) {
      const { ball, level } = play(data, (lv) => crateRoute4(lv, lead), { from });
      const broken = level.breakables[0].broken;
      if (!ball.won || ball.deaths > 0 || broken) {
        bad.push(`lead ${lead}: won=${ball.won} deaths=${ball.deaths} broken=${broken} at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
      }
    }
    if (bad.length) fail(`level 4's crate route did not finish cleanly: ${bad.join('; ')}`);
    else console.log(`   the crate route finished at every lead without breaking the planks`);

    const bare = {
      ...data,
      boxes: data.boxes.filter((b) => !b.movable).concat([{ x: plank.x, y: plank.y, w: plank.w, h: plank.h }]),
      breakables: [],
    };
    let cleared = 0, tries = 0;
    for (let jumpAt = plank.x - 300; jumpAt <= plank.x - 5; jumpAt += 5) {
      tries++;
      let done = false;
      const { ball } = play(bare, () => (b) => {
        const jump = !done && b.grounded && b.x >= jumpAt;
        if (jump) done = true;
        return { right: true, jump };
      }, { from: { x: plank.x - 700, y: 740 }, seconds: 5 });
      if (ball.x > past && ball.hits === 0) cleared++;
    }
    if (cleared) fail(`without the crate or the tunnel, level 4's tall patch was crossed ${cleared} time(s) of ${tries}`);
    else console.log(`   ${tries} jumps with no crate and no tunnel, none got past`);

    const slow = play(data, () => () => ({ right: true }), { from: { x: plank.x - CONFIG.BALL.R - 15, y: 740 }, seconds: 3 });
    if (slow.level.breakables[0].broken) fail('a slow roll into level 4\'s planks broke them');
    else console.log('   a slow roll into the planks left them standing');
  }
}
```

- [ ] **Step 5: Run finish and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: `ok    EVERY LEVEL CAN BE FINISHED`, including level 4 from spawn 30 ways and from both checkpoints, and all four 3d lines.

If the crate route fails, print `stage`, `ball.x - crate.x` and `ball.vx` on the step `hop` begins. The simulated band is a hop from 30-70px; a lead-scaled `50 * lead` is 35-65px, so a failure there means the back-off, not the hop, has changed.

- [ ] **Step 6: Run all offline suites**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite ok.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs
git commit -m "Give level four a patch no jump clears, with two ways past

On the flat home: a tall patch on a stone slab over a tunnel boarded with
planks. Shove the crate against the planks and jump off it, or roll into
the planks hard and go underneath. finish proves both ways, and that with
no crate and unbreakable planks nothing gets past.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Look at it, and the docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `games/pushkar-ball/README.md` (Crates section ~line 164; level data sketch ~line 232)
- Modify: `games/pushkar-ball/tests/README.md` (offline table ~line 46)
- Modify: `docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md`

- [ ] **Step 1: Look at it**

Temporarily change `flow.start(0)` (or wherever `main.js` starts the first level — `Grep` for `start(`) to start level index 1, open the game at 568×320 and 740×280 and look at: level 2's patch rising tall and sinking; then index 2 for level 3's quicker patch; then index 3 and play to the flat home for the slab, the planks, a slow knock's rattle and crack, a fast roll's break and pieces, the ball through the tunnel, and the crate jump. Check the teeth at full height are fully on screen above the ball at 740×280. **Revert the start index** and confirm with `git diff games/pushkar-ball/js/main.js` that nothing is left.

Anything that looks wrong is fixed in the task that owns it, with its own commit, before continuing.

- [ ] **Step 2: CLAUDE.md**

Replace the Pushkar Ball bullet that begins `**Wood means you can push it; stone means you cannot.**` (its whole paragraph) with:

```markdown
- **Wood gives way; stone never does.** No exceptions — it is the only way a
  child learns the rule, because there is no text and there is not going to be
  any. A crate gives way by sliding, a plank wall by breaking when the ball
  rolls into it hard. Changed from "wood means you can push it" on Sep 15 2026,
  at the user's request, when plank walls arrived. The boundary walls are
  `boxes` in the data exactly like a crate and were once drawn in the same
  wood; that made the picture lie the moment crates started moving.
- **A rising spike patch is a sine of level time, like a platform.** `s.h` is
  its height now, rewritten in `Level.update`; the hit box and the teeth both
  read it. Levels that wait for one to sink need a route that looks ahead with
  `spikeHeight` — see `waitForLow` in `tests/offline/finish.mjs`.
```

- [ ] **Step 3: The game README**

In `games/pushkar-ball/README.md`, replace the Crates section's first paragraph (from `**If it is wood, you can push it.` to `shoving at something that will never give.`) with:

```markdown
**Wood gives way; stone never does.** That rule holds everywhere with no
exceptions, which is the only way a child is going to learn it — there is no
text to explain it and there is not going to be any. A crate gives way by
sliding. A plank wall — upright boards with daylight between them — gives way
by breaking, when the ball rolls into it at `BREAKABLE.SPEED`; a slower knock
rattles and cracks it, and once broken it stays broken for the rest of the
level. The level's boundary walls are boxes in the data exactly like a crate
is, and they used to be drawn in the same wood; they are stone now, because
the day crates started moving, that shared colour became a picture telling a
child to keep shoving at something that will never give.
```

In the level data sketch, after the `platforms:` line add:

```js
  spikes:    [ { x, y, w },                        // SPIKE.H tall
               { x, y, w, h },                     // authored height
               { x, y, w, rise: { period, phase } } ], // rises to SPIKE.RISE_H and back
  breakables:[ { x, y, w, h } ],                   // a plank wall
```

- [ ] **Step 4: The tests README**

In the offline table, after the `crates` row add:

```markdown
| `risers` | A patch with no `rise` keeps its authored height. A rising patch is exactly the midpoint, `RISE_H` and `H` at 0, a quarter and three quarters of its period, and repeats. `Level.update` drives it and the hit box follows. `RISE_H` is at least 30px past an unaided jump on paper, and a patch held there is never jumped cleanly from any take-off point. Eight seconds against one leaves every value finite. |
| `breakables` | A plank wall loads as a 4-segment box carrying `dx/dy/vx/vy`. A slow knock rattles and cracks it without breaking it; a fast roll breaks it, throws pieces, costs no heart and carries the ball through. It stays broken after running out of hearts, and offers no segments. A pushed crate is stopped by it and does not break it. Standing on it stays finite. |
```

In the `finish` row, change `plus scripts for level one's platform and level three's crate)` to `plus scripts for level one's platform, level three's crate and level four's tunnel, and a wait for rising patches on levels two and three)`, and after `Level three without its crate cannot reach its ledge, with the margin pinned.` add ` Level four is finished both ways past its tall patch — through the planks, and by the crate without breaking them — and with no crate and unbreakable planks, no jump gets past.`

- [ ] **Step 5: Mark the spec done**

In the spec, change the first line to `# Moving spikes and breakable wood (levels 2, 3, 4) — DONE`, and add directly under it:

```markdown

Implemented by `docs/superpowers/plans/2026-09-15-moving-spikes-and-breakable-wood.md`.
Simulation before planning changed three things, all recorded in that plan's
header: level 4's patch is 100px tall on a stone slab rather than `RISE_H` on
the ground (the tunnel needs a roof); "spikes stop crates" was dropped (the
planks and slab stop the crate first); and the cycles are 6s and 3.5s.
```

- [ ] **Step 6: Run the whole suite**

Run: `node games/pushkar-ball/tests/run.mjs`
Expected: `all N suites passed`, browser suites included. Nothing here touches `sw.js` or the hub's `index.html`, so Taras Town's suite is not required.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md games/pushkar-ball/README.md games/pushkar-ball/tests/README.md docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md
git commit -m "Document rising spikes, plank walls and the new wood rule

Wood gives way, stone never does. Test tables gain risers and breakables,
finish records level four's two ways past, and the spec is marked done
with the three things simulation changed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
