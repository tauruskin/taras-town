# Pushkar Ball, phase 2 (danger) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spikes to get past, checkpoints so failing costs the stretch and not the level, a ball that deflates and re-inflates instead of vanishing, and a flag that ends the level and runs straight into the next one — across three levels.

**Architecture:** Everything new keeps phase 1's shape. Hazards are their own module with a pure hit test and their own drawing, so `main.js` gains a state machine and nothing else. The ball owns failing (`die`, `dying`, `reviving`, `home`) because failing is the ball's business and because that keeps it testable in Node. The results panel's geometry lives in `ui.js` alongside the control buttons, for the same reason theirs does: tests ask for it rather than writing coordinates down.

**Tech Stack:** Vanilla ES modules, HTML5 canvas, no dependencies, no build step. Tests are Node 22 driving headless Chrome over the DevTools Protocol, via `games/pushkar-ball/tests/run.mjs`.

**Spec:** [`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`](../specs/2026-09-08-pushkar-ball-design.md)

---

## Read this before starting

**Read `games/pushkar-ball/README.md` and `games/pushkar-ball/tests/README.md` first.** Both were written at the end of phase 1 and both carry things that will cost you an afternoon if you rediscover them. In particular: how the browser suites find the ball, and why they find it by hue.

**House style.** This repo comments *why*, at length, in full sentences, and the comments outnumber what most codebases carry. The code below is correct but under-commented on purpose — it shows the logic, not the finished density. Add the *why* as you go, especially where a line exists because of a bug.

**Screen coordinates.** y increases downward. Gravity is positive. An upward-facing normal has `ny < 0`.

**Never write a button coordinate into a test.** Ask `js/ui.js`. This now applies to the results panel too.

**Nothing you add may be red.** The browser suites find the ball by hue — "much more red than blue, and barely greener than it is blue" (`IS_BALL` in `tests/browser/_helpers.mjs`). Spikes are steel, checkpoint flags are green, stars are yellow, and every one of those was picked to fail that test. If you add a colour, check it against `IS_BALL` by hand before you use it.

**Anything the ball can stand on owes `dx`, `dy`, `vx`, `vy`.** `player.js` adds `platform.dx` to the ball's position without checking it exists. This already cost one whole debugging session when crates arrived without them: the ball's position went `NaN` the first frame it stood on a crate and the ball vanished with nothing logged anywhere.

### Two deliberate deviations from the spec, and why

**1. Only spikes. Saws and crushers move to phase 3.** The spec's level-data block marks all three "phase 2", but the spec also says levels one to three introduce *spikes*, and saws belong to level four's factory. Building saws and crushers now means building two hazards no level uses — and "do not build ahead" is the spec's own rule. Crushers are the one that most wants deferring anyway: a crusher is a solid moving body that can trap a ball or a crate against the floor, it needs the `2r` gap assertion, and it needs authoring in a level built for it.

**2. No lives, and no level select to fall back to.** The spec was corrected before this plan was written: there are no lives, failing returns the ball to the last checkpoint for ever, and that is the only fail path. Level select is still phase 4, so the results panel's "way out" in this phase is **retry** and **hub**, not a grid button to a screen that does not exist yet.

### What phase 2 does NOT build

Enemies, gems, `effects.js`, saws, crushers, the factory theme, levels four and five, a main menu, level select, pause, saving, and audio of any kind. **The flag is silent** — all audio is phase 4, and this is a known, accepted gap.

---

## File structure

| File | Responsibility | DOM? |
|---|---|---|
| `games/pushkar-ball/js/config.js` | modify: camera bias, checkpoint, deflate, spike, goal and panel numbers, new colours | never |
| `games/pushkar-ball/js/camera.js` | modify: aim below the ball, so it rides clear of the controls | never |
| `games/pushkar-ball/js/hazards.js` | create: spikes — their geometry, their hit test, their drawing | canvas only |
| `games/pushkar-ball/js/levels.js` | modify: checkpoints and spikes in the data and the loader; levels 2 and 3 | never |
| `games/pushkar-ball/js/player.js` | modify: `home`, `die`, `dying`, `reviving`, checkpoint capture, hazard and goal tests | never |
| `games/pushkar-ball/js/ui.js` | modify: the results panel's geometry, hit test and drawing | canvas only |
| `games/pushkar-ball/js/input.js` | modify: a tap that misses every control is remembered, for the panel | yes |
| `games/pushkar-ball/js/main.js` | modify: `startLevel`, the playing/won state machine, drawing the new things | yes |
| `games/pushkar-ball/tools/panels.html` | create: the results panel at three screen sizes, for the eye | — |
| `games/pushkar-ball/tests/offline/camera.mjs` | create: a grounded ball is clear of every control, on every screen | — |
| `games/pushkar-ball/tests/offline/checkpoints.mjs` | create: capture, respawn target, ordering | — |
| `games/pushkar-ball/tests/offline/hazards.mjs` | create: spikes kill, forgivingly, and only when actually touched | — |
| `games/pushkar-ball/tests/offline/progress.mjs` | create: the flag wins, the panel holds, the next level starts | — |
| `games/pushkar-ball/tests/offline/buttons.mjs` | modify: the panel's buttons fit on every screen too | — |
| `games/pushkar-ball/tests/offline/levels.mjs` | modify: checkpoint and hazard clearances, per level | — |
| `games/pushkar-ball/tests/offline/crates.mjs` | modify: `falls` became `deaths` | — |
| `games/pushkar-ball/tests/browser/deflate.mjs` | create: fall in a hole in a real browser, come back | — |
| `sw.js` (repo root) | modify: precache `js/hazards.js` | — |

Also modified at the end: `games/pushkar-ball/README.md`, `games/pushkar-ball/tests/README.md`, `CLAUDE.md`, and the spec's level-data comments.

---

## Task 1: Raise the ball clear of the controls — DONE

> Commits `6ee66ff`, `2b585ab`, `0a9b805` and the camera-suite follow-up. Spec review passed; code quality review passed ("ready to merge").
>
> Three things came out of it that the plan did not anticipate, all recorded in their commits: `Camera.snap()` **and** the constructor both had to be brought into line, because a settled camera rests at `ball.y + BIAS_Y - DEADZONE_Y` and snapping to `ball.y` left every respawn and every level's first frame with a ~20-unit glide against `snap`'s own promise of none; `tests/browser/jump.mjs` carried a pre-existing phase-1 bug where the window was derived from `MAX_SPEED` as though it were a speed limit, which it is not (it clamps only the acceleration the player asks for, and a slope adds to `vx` underneath it) — fixed in `56b1f36`; and the camera suite now also pins the deadzone absorbing a whole jump, with a guard that fails loudly if retuned numbers ever make a jump large enough to escape it.

Phase 1 left the ball riding about 74% of the way down the screen, which puts it inside the band where the on-screen buttons are drawn at the start and end of a level — a thumb sits on top of the hero. That was tolerable while the ground was empty. Phase 2 puts spikes on that ground, so it stops being tolerable.

This task is first because it is small, it is immediately visible, and every screenshot taken by every later task will show it.

**Files:**
- Modify: `games/pushkar-ball/js/config.js`
- Modify: `games/pushkar-ball/js/camera.js`
- Create: `games/pushkar-ball/tests/offline/camera.mjs`

- [x] **Step 1: Write the failing camera test**

Create `games/pushkar-ball/tests/offline/camera.mjs`:

```js
// Where the ball sits on the screen, and whether a thumb is on top of it.
//
// This asks the camera and ui.js and works out the answer, rather than reading
// pixels: camera.js is DOM-free precisely so that questions like this can be
// settled in node in a millisecond. No coordinate is written down here — the
// button positions come from ui.js, exactly as everywhere else.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { Camera } = await import('../../js/camera.js');
const { loadLevel } = await import('../../js/levels.js');
const { Buttons } = await import('../../js/ui.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// The widest phone, an iPhone SE on its side, and a short landscape window.
const SCREENS = [[844, 390], [568, 320], [740, 280]];

const flat = () => loadLevel({
  id: 96, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 400, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [], platforms: [],
});

for (const [w, h] of SCREENS) {
  const scale = h / CONFIG.VIEW_H;
  const viewH = CONFIG.VIEW_H;
  const viewW = w / scale;

  const level = flat();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const camera = new Camera(level);
  const input = { left: false, right: false, takeJump: () => false };

  // Four seconds is far longer than the camera needs to settle; the point is
  // to measure where it ENDS UP, not how it gets there.
  for (let i = 0; i < Math.round(4 / CONFIG.STEP); i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    camera.update(CONFIG.STEP, ball, viewW, viewH);
  }

  const screenY = h / 2 + (ball.y - camera.y) * scale;
  const bottom = screenY + ball.r * scale;

  // The top of the highest thing a thumb covers.
  const tops = ['left', 'right', 'jump'].map((n) => {
    const b = Buttons[n](w, h);
    return b.y - b.r;
  });
  const controlTop = Math.min(...tops);
  const margin = controlTop - bottom;

  console.log(`\n${w}x${h}: a grounded ball sits at y=${screenY.toFixed(0)}, ` +
              `its bottom at ${bottom.toFixed(0)}, controls start at ${controlTop.toFixed(0)}` +
              ` — ${margin.toFixed(0)}px of daylight`);

  if (margin <= 0) {
    fail(`on ${w}x${h} the ball overlaps the controls by ${(-margin).toFixed(0)}px — a thumb sits on the hero`);
  } else if (margin < ball.r * scale * 0.5) {
    // Clear is not enough; it has to be obviously clear. Half a ball of
    // daylight is the least that reads as separate on a phone.
    fail(`on ${w}x${h} the ball clears the controls by only ${margin.toFixed(0)}px, less than half a ball`);
  }

  // And it must not have gone the other way. A ball pinned to the top of the
  // screen cannot see what it is falling towards.
  if (screenY < h * 0.25) fail(`on ${w}x${h} the ball rides at ${screenY.toFixed(0)}, too high to see what is below it`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CAMERA CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [x] **Step 2: Run it and watch it fail**

Run: `node games/pushkar-ball/tests/run.mjs camera`

Expected: FAIL on all three screens — the ball overlaps the controls, or clears them by only a few pixels. On 740×280 phase 1's numbers put the overlap at its worst.

- [x] **Step 3: Add `BIAS_Y` to config.js**

In `games/pushkar-ball/js/config.js`, inside `CAMERA`, after `DEADZONE_Y`:

```js
    // How far BELOW the ball the camera aims, in world units.
    //
    // Without this the camera aims straight at the ball, and because the
    // deadzone stops it as soon as it is within DEADZONE_Y, a ball that
    // settles from above — which is every ball, since gravity brings it down
    // — comes to rest a whole deadzone below the middle of the screen. On a
    // short phone that is inside the band where the buttons are drawn, so a
    // thumb ends up resting on top of the hero.
    //
    // Slightly MORE than DEADZONE_Y, so a grounded ball settles a little
    // above the middle rather than exactly on it. That is worth the small
    // loss of view downwards: tests/offline/camera.mjs measures the daylight
    // between the ball and the controls on the shortest screen, and exactly
    // centred left only a few pixels of it.
    BIAS_Y: 110,
```

- [x] **Step 4: Aim below the ball in camera.js**

In `games/pushkar-ball/js/camera.js`, replace the vertical block of `update`:

```js
    const dy = ball.y - this.y;
    if (Math.abs(dy) > C.DEADZONE_Y) {
      const target = ball.y - Math.sign(dy) * C.DEADZONE_Y;
      this.y += (target - this.y) * (1 - Math.exp(-C.LERP_Y * dt));
    }
```

with:

```js
    // The camera wants to be BIAS_Y below the ball, and the deadzone is slack
    // around that, not around the ball itself. Applying the deadzone to the
    // ball's own y is what left a grounded ball a full deadzone low on screen.
    const want = ball.y + C.BIAS_Y;
    const dy = want - this.y;
    if (Math.abs(dy) > C.DEADZONE_Y) {
      // Chase the edge of the deadzone rather than the target, or the camera
      // lurches the moment the deadzone is crossed.
      const target = want - Math.sign(dy) * C.DEADZONE_Y;
      this.y += (target - this.y) * (1 - Math.exp(-C.LERP_Y * dt));
    }
```

- [x] **Step 5: Run the camera test**

Run: `node games/pushkar-ball/tests/run.mjs camera`

Expected: `offline/camera  ok  ALL CAMERA CHECKS PASSED`, with the printed daylight comfortably positive on all three screens.

If a screen still fails, change `BIAS_Y` in `config.js` — not `camera.js`, and not the test's screen list or its half-a-ball rule. That list and that rule are the requirement.

- [x] **Step 6: Run every offline suite, then look at it**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: seven suites ok — `buttons`, `camera`, `crates`, `feel`, `levels`, `physics`, `precache`.

Then run the browser suites to regenerate screenshots, and **open them**:

```
node games/pushkar-ball/tests/run.mjs browser
```

Look at `tests/screenshots/roll-1-spawn.png` and `small-740x280-2-playing.png`. The ball should be clearly above the buttons with sky or hill behind it, not tinted by a button's white wash. Check that the ground is still visible below the ball — if the horizon has climbed so high that there is no ground on screen, `BIAS_Y` has gone too far.

- [x] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/camera.js games/pushkar-ball/tests/offline/camera.mjs
git commit -m "Raise the ball clear of the on-screen controls

The camera aimed straight at the ball, and the deadzone stopped it as soon as
it was within DEADZONE_Y — so a ball settling from above, which is every ball,
came to rest a whole deadzone below the middle of the screen. On a 740x280
window that is inside the band where the buttons are drawn, and a thumb ended
up resting on top of the hero.

The camera now aims BIAS_Y below the ball with the deadzone as slack around
that target. The new offline suite asks ui.js where the controls are and
measures the daylight between them and a grounded ball, on all three screen
sizes, and insists on at least half a ball of it. It has to be settled before
spikes go on that ground: a hazard under a thumb is not a hazard, it is a
trick."
```

---

## Task 2: Checkpoints — DONE

> Commits `6a72784`, `20ebd25`, `f7cf495`. Spec review passed; code quality review passed on re-review, each fix proven by mutation.
>
> This task also absorbed two pieces the plan had filed under Task 3 — the `DEFLATE` config block and the deflate tick at the top of `Ball.update` — because Task 2's `die()` sets a `dying` timer that nothing decremented until Task 3, so Task 2's own test could never have passed. **Task 3's Steps 3 and 4 are therefore already done.** Task 3 keeps the deflate's *drawing* and its suites.
>
> Three bugs came out of it, two of them mine in the plan text above and both corrected there: respawning at a checkpoint put the ball's centre *on* the ground segment rather than above it, so it fell through and died again for ever; three of the five checks asserted only `ball.x` and so passed on that broken game, with check 5 provably vacuous; and the camera snapped at the moment of death rather than the moment of return, parking over an empty hole and then gliding across the level.


Failing should cost the stretch since the last checkpoint and nothing more. Phase 1 already respawns the ball when it falls out of the world, so this task changes the *target* of that respawn; it does not build a respawn.

**Files:**
- Modify: `games/pushkar-ball/js/config.js`
- Modify: `games/pushkar-ball/js/levels.js`
- Modify: `games/pushkar-ball/js/player.js`
- Modify: `games/pushkar-ball/js/main.js`
- Create: `games/pushkar-ball/tests/offline/checkpoints.mjs`

- [ ] **Step 1: Write the failing checkpoint test**

Create `games/pushkar-ball/tests/offline/checkpoints.mjs`:

```js
// Checkpoints: reaching one, coming back to it, and never coming back to one
// that was never reached.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

/** Flat ground that stops at 1600, so the ball can be driven off the end. */
const world = () => loadLevel({
  id: 95, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [1600, 760]]],
  boxes: [], platforms: [],
  checkpoints: [{ x: 700, y: 760 }, { x: 1200, y: 760 }],
});

// --- 1. the loader expands them, untaken ---------------------------------
{
  const level = world();
  console.log(`\n1. the level has ${level.checkpoints.length} checkpoints`);
  if (level.checkpoints.length !== 2) fail(`expected 2 checkpoints, got ${level.checkpoints.length}`);
  if (level.checkpoints.some((c) => c.taken)) fail('a checkpoint started out already taken');
}

// --- 2. rolling past one takes it ----------------------------------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);

  if (ball.home.x !== level.spawn.x) fail('the ball did not start out homed to the spawn');

  input.right = true;
  run(ball, level, input, 2.0);   // enough to pass 700 but not 1200
  input.right = false;

  console.log(`\n2. after rolling to x=${ball.x.toFixed(0)}: first taken=${level.checkpoints[0].taken},` +
              ` second taken=${level.checkpoints[1].taken}, home x=${ball.home.x.toFixed(0)}`);
  if (!level.checkpoints[0].taken) fail('rolling straight over the first checkpoint did not take it');
  if (ball.home.x !== level.checkpoints[0].x) {
    fail(`home is ${ball.home.x.toFixed(0)}, not the checkpoint at ${level.checkpoints[0].x}`);
  }
}

// --- 3. falling out returns to the checkpoint, not the spawn -------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);

  input.right = true;
  // Driven right until it falls off the end of the ground at 1600, which is
  // past both checkpoints.
  let steps = 0;
  const limit = Math.round(12 / CONFIG.STEP);
  while (ball.deaths === 0 && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;
  if (ball.deaths === 0) { fail('the ball never fell off the end, so nothing was tested'); }

  // Let the deflate finish and the ball settle.
  run(ball, level, input, 2.0);

  console.log(`\n3. fell off the end and came back to x=${ball.x.toFixed(0)}` +
              ` (spawn ${level.spawn.x}, last checkpoint ${level.checkpoints[1].x})`);
  if (Math.abs(ball.x - level.checkpoints[1].x) > 120) {
    fail(`came back to x=${ball.x.toFixed(0)} instead of the last checkpoint at ${level.checkpoints[1].x}`);
  }
  if (Math.abs(ball.x - level.spawn.x) < 120) fail('came back to the spawn, ignoring both checkpoints');
}

// --- 4. an unreached checkpoint is not a home ----------------------------
//
// The ball is dropped past the FIRST checkpoint's x but never touches the
// second, then killed. It must come back to the first.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);
  input.right = true;
  run(ball, level, input, 2.0);
  input.right = false;
  run(ball, level, input, 1.5);

  ball.die(level);
  run(ball, level, input, 2.0);

  console.log(`\n4. killed before the second checkpoint, came back to x=${ball.x.toFixed(0)}`);
  if (Math.abs(ball.x - level.checkpoints[0].x) > 120) {
    fail(`came back to ${ball.x.toFixed(0)} instead of the first checkpoint at ${level.checkpoints[0].x}`);
  }
  if (level.checkpoints[1].taken) fail('a checkpoint the ball never reached was marked taken');
}

// --- 5. a taken checkpoint stays taken -----------------------------------
//
// Rolling back and forth over one must not un-take it, and must not shuffle
// home backwards to an earlier one.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);
  input.right = true;
  run(ball, level, input, 5.0);          // past both
  const homeAfter = ball.home.x;
  input.right = false;
  input.left = true;
  run(ball, level, input, 3.0);          // back over the first one
  input.left = false;

  console.log(`\n5. home was ${homeAfter.toFixed(0)} and after rolling back it is ${ball.home.x.toFixed(0)}`);
  if (ball.home.x !== homeAfter) {
    fail(`rolling back over an earlier checkpoint moved home from ${homeAfter.toFixed(0)} to ${ball.home.x.toFixed(0)}`);
  }
  if (!level.checkpoints.every((c) => c.taken)) fail('rolling back un-took a checkpoint');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKPOINT CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node games/pushkar-ball/tests/run.mjs checkpoints`

Expected: FAIL — `level.checkpoints` is undefined, `ball.home` is undefined, `ball.die` is not a function.

- [ ] **Step 3: Add the checkpoint numbers and colours to config.js**

In `games/pushkar-ball/js/config.js`, after the `CRATE` block:

```js
  // ---------------------------------------------------------------------
  // Checkpoints
  // ---------------------------------------------------------------------
  CHECKPOINT: {
    // How close the ball's centre has to get, in world units. Generous on
    // purpose: a checkpoint that can be rolled straight past at full speed
    // without arming is worse than no checkpoint, because the player believes
    // it armed. At MAX_SPEED the ball covers 3.5px per step, so this is many
    // steps wide and cannot be tunnelled through.
    R: 46,
    POLE_H: 70,          // drawn height
  },
```

And in `COLOURS`, after `FLAG`:

```js
    // Green, not red. The browser suites find the ball by being the only
    // thing on screen of the ball's hue, so a red flag would be picked up as
    // a second ball and every position they measure would be the average of
    // the two.
    CHECK_OFF: '#9AA7B0',
    CHECK_ON: '#41C98A',
```

- [ ] **Step 4: Expand checkpoints in the loader**

In `games/pushkar-ball/js/levels.js`, inside the `Level` constructor, after `this.crates = ...`:

```js
    // Checkpoints are not colliders and never touch the segment world; they
    // are places the ball remembers. `taken` is per-run state and belongs on
    // the loaded level rather than in the data, so that reloading a level
    // resets them all with no bookkeeping anywhere.
    this.checkpoints = (data.checkpoints || []).map((c) => ({ x: c.x, y: c.y, taken: false }));
```

And add a method to `Level`, after `near`:

```js
  /**
   * The checkpoint the ball is standing in, if any — and it is marked taken.
   *
   * Returns the checkpoint so the caller can move its home there. Already
   * taken ones are skipped, which is what stops rolling back over an earlier
   * checkpoint from dragging home backwards down the level.
   */
  takeCheckpoint(ball) {
    const r = CONFIG.CHECKPOINT.R;
    for (const c of this.checkpoints) {
      if (c.taken) continue;
      if ((ball.x - c.x) ** 2 + (ball.y - c.y) ** 2 <= r * r) {
        c.taken = true;
        return c;
      }
    }
    return null;
  }
```

- [ ] **Step 5: Give the ball a home, and a `die` that uses it**

In `games/pushkar-ball/js/player.js`, in the constructor, replace:

```js
    this.falls = 0;         // how many times it has dropped out of the level
```

with:

```js
    // Where a respawn puts the ball: the spawn to begin with, then the last
    // checkpoint reached. Set by whoever constructs the ball, because the ball
    // is handed its position and not the level.
    this.home = { x, y };

    // Every way of failing, counted together. This used to be `falls`, when
    // falling out of the world was the only way to fail; a hazard is not a
    // fall, and two counters for one idea is how they drift apart.
    this.deaths = 0;
```

Replace the whole `respawn` method with:

```js
  /**
   * Send the ball back to its home — the last checkpoint, or the spawn.
   *
   * This is the whole of failing, and it is meant to be: no lives to run out,
   * no screen to dismiss, no wait beyond the deflate. Being handed the level
   * back is the least discouraging thing that can happen to a six-year-old,
   * and it is what the hub's rules ask for.
   *
   * Every piece of carried state has to go, not just position. A leftover
   * upward velocity launches the ball off the respawn point; a leftover jump
   * in `buffer` fires the instant it lands; a leftover `platform` makes it
   * ride a platform elsewhere in the level.
   */
  respawn() {
    this.x = this.home.x;
    this.y = this.home.y;
    this.vx = 0; this.vy = 0;
    this.spin = 0;
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.platform = null;
  }

  /**
   * Fail. The ball deflates where it stands, then re-inflates at home.
   *
   * Ignored while already dying, which matters more than it looks: a ball that
   * dies on a spike is still overlapping that spike, and without this guard it
   * would re-trigger every single step and never finish deflating.
   */
  die() {
    if (this.dying > 0) return;
    this.dying = CONFIG.DEFLATE.TIME;
    this.reviving = 0;
    this.vx = 0; this.vy = 0;
    this.deaths++;
  }
```

Also add to the constructor, next to the other timers:

```js
    this.dying = 0;         // seconds of deflating left
    this.reviving = 0;      // seconds of re-inflating left
```

- [ ] **Step 6: Take checkpoints, and make falling out a death**

In `games/pushkar-ball/js/player.js`, in `update`, replace the fall-out block at the end:

```js
    if (this.y - this.r > level.bounds.h) this.respawn(level);
```

with:

```js
    // --- checkpoints ------------------------------------------------------
    //
    // A checkpoint's `y` is its GROUND anchor — the pole is drawn upward from
    // it — so the respawn point has to be lifted by the ball's own radius plus
    // a little daylight. Taking `reached.y` verbatim puts the ball's centre on
    // the ground segment, where the resolver does not eject it: it falls
    // straight through and dies again, for ever. That was measured at 21
    // deaths in 20 seconds, and it destroys the level with no way out.
    const reached = level.takeCheckpoint(this.x, this.y);
    if (reached) {
      this.home.x = reached.x;
      this.home.y = reached.y - this.r - CONFIG.CHECKPOINT.CLEARANCE;
    }

    // --- fell out of the world -------------------------------------------
    //
    // `bounds.h` is exactly the lowest the camera is ever allowed to show, so
    // a ball below it is off the bottom of the screen and is never coming back
    // under its own power. It fails the same way a spike fails it, through the
    // same `die`, so there is one fail path and not two.
    if (this.y - this.r > level.bounds.h) this.die();
```

- [ ] **Step 7: Update main.js and crates.mjs for the rename**

In `games/pushkar-ball/js/main.js`, in the step loop, replace `ball.falls` with `ball.deaths` in both places:

```js
      const diedBefore = ball.deaths;
      ball.update(CONFIG.STEP, input, level);
      if (ball.deaths !== diedBefore) camera.snap(ball);
```

In `games/pushkar-ball/tests/offline/crates.mjs`, replace every `ball.falls` with `ball.deaths`, and every `crate.falls` stays as it is — a crate's own counter is unrelated. There are five occurrences in checks 6 and 7; the printed messages should read "died" rather than "fell" where they now describe a death.

- [ ] **Step 8: Draw the checkpoints**

In `games/pushkar-ball/js/main.js`, add a draw function after `drawCrates`:

```js
/**
 * The checkpoints: a little flag on a pole, grey until reached and green
 * after.
 *
 * Green rather than red, and that is not a taste call — the browser suites
 * find the ball by being the only thing on screen of its hue, so a red flag
 * would be measured as part of the ball.
 */
function drawCheckpoints() {
  const C = CONFIG.COLOURS;
  const h = CONFIG.CHECKPOINT.POLE_H;
  for (const c of level.checkpoints) {
    ctx.fillStyle = C.WALL_EDGE;
    ctx.fillRect(c.x - 2.5, c.y - h, 5, h);

    ctx.beginPath();
    ctx.moveTo(c.x + 2.5, c.y - h);
    ctx.lineTo(c.x + 38, c.y - h + 13);
    ctx.lineTo(c.x + 2.5, c.y - h + 26);
    ctx.closePath();
    ctx.fillStyle = c.taken ? C.CHECK_ON : C.CHECK_OFF;
    ctx.fill();
  }
}
```

and call it in `draw`, between `drawCrates()` and `drawPlatforms()`:

```js
  drawCheckpoints();
```

> **Correction applied after review.** Two things in this task as first written were wrong, and both are fixed above and below:
>
> - `home.y = reached.y` respawned the ball *inside* the ground, because a checkpoint's `y` is its ground anchor. The respawn point is lifted by the ball's radius plus `CHECKPOINT.CLEARANCE`.
> - Checks 3, 4 and 5 asserted only `ball.x`, and a ball falling through the floor for ever is at the right `x`. Worse, check 5 was provably vacuous: commenting out `if (c.taken) continue;` left all five checks passing. Checks 3 and 4 must also assert the ball is alive and standing (`grounded`, `deaths === 1`, a sane `y`), and check 5's fixture must let the ball survive long enough to actually roll back over an earlier checkpoint.
>
> Capture is a box matching the flag's silhouette (`c.x ± R`, `c.y - POLE_H` to `c.y + R`), not a circle around the ball's centre. A circle of `R` shrinks to nothing as the ball rises, so a jump starting 140px short sailed over the flag without arming it.

- [ ] **Step 9: Run the checkpoint test, then every offline suite**

Run: `node games/pushkar-ball/tests/run.mjs checkpoints`

Expected: `ALL CHECKPOINT CHECKS PASSED`.

Note that check 3 and check 4 both wait two seconds after the death — that is the deflate finishing. `CONFIG.DEFLATE` does not exist yet, so add it now as part of Task 3 if the test errors on it; the deflate timings are Task 3's Step 3 and the two tasks meet here.

Then: `node games/pushkar-ball/tests/run.mjs offline` — eight suites ok.

- [ ] **Step 10: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js games/pushkar-ball/js/player.js games/pushkar-ball/js/main.js games/pushkar-ball/tests/offline/checkpoints.mjs games/pushkar-ball/tests/offline/crates.mjs
git commit -m "Add checkpoints, and make failing return to the last one

Phase 1 already respawned the ball when it fell out of the world, so this
changes the target of a respawn rather than building one. The ball carries a
`home`, which starts at the spawn and moves to each checkpoint it reaches.

An already-taken checkpoint is skipped when looking for one to arm, which is
what stops rolling back over an earlier checkpoint from dragging home
backwards down the level. The capture radius is deliberately generous: a
checkpoint that can be rolled straight past at full speed without arming is
worse than no checkpoint at all, because the player believes it armed.

`ball.falls` became `ball.deaths`. A hazard is not a fall, and two counters
for one idea is how they drift apart.

Checkpoint flags are green. The browser suites find the ball by being the only
thing on screen of its hue, so a red flag would be measured as part of it."
```

---

## Task 3: The deflate, and the re-inflate — DONE

> Commits `b2374d3`, `6026c17`. Spec review passed; code quality review passed on re-review, every fix confirmed by the reviewer's own mutations.
>
> **Steps 3 and 4 were already done in Task 2**, so this task was the drawing and the suites. Three things worth carrying forward: the dim now lives in `ui.js` as a pure `Overlay.dim(ball)` plus a `drawDim`, because it is a screen-space overlay and `ui.js` owns that layer — Task 5's results panel draws into the same layer and should go there too, not into `main.js`. Offline check 4 was asserting a clause that could never fire, because a spawn-homed respawn leaves the ball 140px up and a stale jump decays before it lands; homed at *checkpoint* height the fall is 4px and the phantom jump is real, so the scenario was fixed rather than the clause removed. And the browser suite now asserts the settled ball is within 10% of its starting pixel count — under a mutation that left the hero permanently quarter-size, every other assertion in the suite was happy.


Failing has to be visible and it has to be gentle. The ball squashes flat where it stood, the screen dims for a moment, and it re-inflates at home. No blood, no injury, no death imagery — this is what Red Ball itself did, and it is inside the hub's rules rather than an exception to them.

**Files:**
- Modify: `games/pushkar-ball/js/config.js`
- Modify: `games/pushkar-ball/js/player.js`
- Modify: `games/pushkar-ball/js/main.js`
- Create: `games/pushkar-ball/tests/offline/deflate.mjs`
- Create: `games/pushkar-ball/tests/browser/deflate.mjs`

- [ ] **Step 1: Write the failing deflate test**

Create `games/pushkar-ball/tests/offline/deflate.mjs`:

```js
// Failing, and how long it takes, and what the player can do while it happens.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

const world = () => loadLevel({
  id: 94, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 300, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [], platforms: [],
});

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

// --- 1. dying stops the ball dead and lasts as long as it says -----------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  run(ball, level, input, 1.0);
  const movingAt = ball.x;
  if (Math.abs(ball.vx) < 100) fail('the ball was not actually moving before it was killed');

  ball.die();
  console.log(`\n1. killed at x=${movingAt.toFixed(0)}: dying=${ball.dying.toFixed(3)}s, vx=${ball.vx.toFixed(1)}`);
  if (Math.abs(ball.vx) > 0.001) fail(`dying did not stop the ball: vx=${ball.vx.toFixed(1)}`);
  if (Math.abs(ball.dying - CONFIG.DEFLATE.TIME) > 1e-9) fail(`dying is ${ball.dying}, not DEFLATE.TIME`);

  // Input is ignored while dying. Holding right through a deflate must not
  // slide the corpse along the ground.
  const where = ball.x;
  run(ball, level, input, CONFIG.DEFLATE.TIME * 0.5);
  if (Math.abs(ball.x - where) > 0.001) fail(`the ball moved ${(ball.x - where).toFixed(2)}px while deflating`);
  if (ball.dying <= 0) fail('the deflate finished in half its own duration');
  console.log(`   halfway through: still at x=${ball.x.toFixed(0)}, dying=${ball.dying.toFixed(3)}s`);
}

// --- 2. it comes back at home, inflating ---------------------------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  input.right = true;
  run(ball, level, input, 1.5);
  input.right = false;

  ball.die();
  run(ball, level, input, CONFIG.DEFLATE.TIME + CONFIG.STEP * 2);

  console.log(`\n2. after the deflate: x=${ball.x.toFixed(0)} (home ${ball.home.x}),` +
              ` dying=${ball.dying.toFixed(3)}, reviving=${ball.reviving.toFixed(3)}`);
  if (ball.dying > 0) fail('still dying after DEFLATE.TIME had passed');
  if (Math.abs(ball.x - ball.home.x) > 1) fail(`came back at x=${ball.x.toFixed(0)}, not home at ${ball.home.x}`);
  if (ball.reviving <= 0) fail('the ball came back without re-inflating');

  // And it is playable again once the inflate is over.
  run(ball, level, input, CONFIG.DEFLATE.INFLATE + 1.0);
  if (ball.reviving > 0) fail('still re-inflating long after INFLATE had passed');
  if (!ball.grounded) fail('the ball never settled on the ground after coming back');

  input.right = true;
  run(ball, level, input, 0.5);
  if (Math.abs(ball.vx) < 50) fail(`the ball would not roll after coming back: vx=${ball.vx.toFixed(1)}`);
  else console.log(`   and it rolls again: vx=${ball.vx.toFixed(0)}`);
}

// --- 3. a second death during a deflate is not a second death ------------
//
// The guard that matters. A ball killed by a spike is still sitting on that
// spike, so without it the death re-triggers every step and the deflate never
// finishes.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  ball.die();
  const first = ball.deaths;
  for (let i = 0; i < 10; i++) ball.die();
  console.log(`\n3. ten more die() calls during a deflate: deaths went ${first} -> ${ball.deaths}`);
  if (ball.deaths !== first) fail(`a death during a deflate counted again: ${first} -> ${ball.deaths}`);

  run(ball, level, input, CONFIG.DEFLATE.TIME + 0.5);
  if (ball.dying > 0) fail('the deflate never finished');
}

// --- 4. a jump pressed during the deflate does not fire on arrival -------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  ball.die();

  const n = Math.round(CONFIG.DEFLATE.TIME / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    input.press();                       // hammering jump through the deflate
    ball.update(CONFIG.STEP, input, level);
  }

  let jumped = false;
  for (let i = 0; i < 6; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);   // nothing pressed now
    if (ball.jumped) jumped = true;
  }
  console.log(`\n4. jump hammered through the deflate: buffer on arrival ${ball.buffer.toFixed(3)}`);
  if (jumped) fail('a jump pressed during the deflate fired the moment the ball came back');
  if (ball.buffer > 0) fail(`the jump buffer survived the deflate (${ball.buffer.toFixed(3)}s in it)`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL DEFLATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node games/pushkar-ball/tests/run.mjs offline/deflate`

Expected: FAIL — `CONFIG.DEFLATE` is undefined.

Note the suite filter: there is now a `tests/browser/deflate.mjs` as well, so a bare `deflate` filter matches both. `offline/deflate` matches the offline one alone.

- [ ] **Step 3: Add the deflate timings to config.js**

In `games/pushkar-ball/js/config.js`, after the `CHECKPOINT` block:

```js
  // ---------------------------------------------------------------------
  // Failing
  // ---------------------------------------------------------------------
  // There are no lives. Failing sends the ball back to its last checkpoint,
  // for ever, and this is how long that takes. Short on purpose: this is the
  // moment a six-year-old is already disappointed, and every extra tenth of a
  // second is a punishment on top of the setback. Long enough to read as
  // something that happened, short enough not to be a wait.
  DEFLATE: {
    TIME: 0.42,          // s squashing flat where it stood
    INFLATE: 0.28,       // s swelling back up at home
    DIM: 0.30,           // how dark the screen goes, 0..1
  },
```

And in `COLOURS`:

```js
    DIM: '#0B1E2A',      // what the screen dims towards during a deflate
```

- [ ] **Step 4: Make the ball deflate**

In `games/pushkar-ball/js/player.js`, at the very top of `update`, before anything else:

```js
  update(dt, input, level) {
    const C = CONFIG;
    this.jumped = false;

    // --- deflating --------------------------------------------------------
    //
    // While the ball is deflating it is not simulated at all: no gravity, no
    // input, no resolution. Everything is deliberate. Gravity would drag the
    // squashed ball through the floor it died on; input would let the player
    // steer a corpse; and resolution against a spike it is still overlapping
    // would fight the death every step.
    //
    // The input is still DRAINED, though — `takeJump` is called and its result
    // thrown away — because a press held through the deflate would otherwise
    // sit in the buffer and fire the instant the ball came back, and the level
    // would resume with a jump nobody asked for.
    if (this.dying > 0) {
      input.takeJump();
      this.dying -= dt;
      if (this.dying <= 0) {
        this.dying = 0;
        this.respawn();
        this.reviving = C.DEFLATE.INFLATE;
      }
      return;
    }
    if (this.reviving > 0) this.reviving = Math.max(0, this.reviving - dt);
```

The rest of `update` continues unchanged from `// A platform we are standing on moved this step`.

- [ ] **Step 5: Draw the squash, the swell, and the dim**

In `games/pushkar-ball/js/main.js`, replace `drawBall` with:

```js
/**
 * The ball, turned by its spin, squashed if it is dying and small if it has
 * just come back.
 *
 * The two marks exist only so the turn is visible. A ball drawn as a plain
 * circle slides across the screen and looks wrong without anybody being able
 * to say why — and the roll suite reads exactly these marks moving.
 */
function drawBall() {
  const C = CONFIG.COLOURS;
  const D = CONFIG.DEFLATE;

  // How squashed, and how big. Deflating goes from a round ball to a flat
  // puddle; re-inflating swells from nothing back to round. Both are drawn
  // with a scale on the canvas rather than by changing ball.r, because r is
  // the collision radius and the physics must not care what the drawing does.
  let sx = 1, sy = 1;
  if (ball.dying > 0) {
    const t = 1 - ball.dying / D.TIME;         // 0 at death, 1 at the end
    sy = 1 - 0.82 * t;
    sx = 1 + 0.45 * t;
  } else if (ball.reviving > 0) {
    const t = 1 - ball.reviving / D.INFLATE;   // 0 on arrival, 1 when done
    sy = 0.25 + 0.75 * t;
    sx = 0.25 + 0.75 * t;
  }

  ctx.save();
  // Squash towards the ground it is lying on, not towards its own middle, or
  // a deflating ball sinks into the floor as it flattens.
  ctx.translate(ball.x, ball.y + ball.r * (1 - sy));
  ctx.scale(sx, sy);

  ctx.beginPath();
  ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = C.BALL;
  ctx.fill();

  ctx.save();
  ctx.rotate(ball.spin);
  ctx.fillStyle = C.BALL_MARK;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * ball.r * 0.45, 0, ball.r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // A highlight, which does NOT turn — light comes from the sky, not the ball.
  ctx.beginPath();
  ctx.arc(-ball.r * 0.3, -ball.r * 0.34, ball.r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = C.BALL_LIGHT;
  ctx.fill();

  ctx.restore();
}
```

And in `draw`, after `ctx.restore()` of the world transform and before `Buttons.draw`:

```js
  // The screen dims while the ball is deflating, and lifts again as it swells
  // back. Drawn outside the world transform so it covers everything, and
  // under the buttons so the controls never dim — a control that fades looks
  // broken rather than paused.
  const dim = ball.dying > 0
    ? (1 - ball.dying / CONFIG.DEFLATE.TIME) * CONFIG.DEFLATE.DIM
    : ball.reviving > 0
      ? (ball.reviving / CONFIG.DEFLATE.INFLATE) * CONFIG.DEFLATE.DIM
      : 0;
  if (dim > 0) {
    ctx.globalAlpha = dim;
    ctx.fillStyle = CONFIG.COLOURS.DIM;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalAlpha = 1;
  }
```

- [ ] **Step 6: Run the offline deflate test**

Run: `node games/pushkar-ball/tests/run.mjs offline/deflate`

Expected: `ALL DEFLATE CHECKS PASSED`.

- [ ] **Step 7: Write the browser deflate suite**

Create `games/pushkar-ball/tests/browser/deflate.mjs`. This is the end-to-end version: a real browser, a real hole, and the ball read off the canvas by its own pixels.

```js
// Falling in a hole in a real browser, and coming back from it.
//
// The offline suite proves the arithmetic. This proves the whole thing is
// wired up: that the ball really does leave the screen, really does come back,
// and comes back somewhere sensible — none of which the offline suite can see,
// because it has no screen.
import { connect, boot, ballAt } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'deflate';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');
const { CONFIG } = await import('../../js/config.js');
const { LEVELS } = await import('../../js/levels.js');

const W = 844, H = 390;
const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

await boot(cdp, URL, W, H);
const RIGHT = Buttons.right(W, H);

const start = await ballAt(ev);
if (!start) {
  for (const p of problems) console.log('  ' + p);
  console.log('  FAIL: no ball on the canvas to begin with');
  process.exit(1);
}
console.log(`\n1. ball at ${start.x.toFixed(0)},${start.y.toFixed(0)}`);

// Drive right until the ball vanishes. The level's first gap is where it will
// go; the time allowed comes from the level and MAX_SPEED rather than being
// typed, so a level change reports the new truth.
const g = LEVELS[0].ground;
const gapFrom = g[0][g[0].length - 1][0];
const allowed = ((gapFrom - LEVELS[0].spawn.x) / CONFIG.MAX_SPEED) * 2.5;
console.log(`\n2. driving right; the first gap is at ${gapFrom}, so allowing ${allowed.toFixed(1)}s`);

await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
let goneAt = -1;
const samples = Math.round(allowed * 10);
for (let i = 0; i < samples; i++) {
  await sleep(100);
  if (!(await ballAt(ev))) { goneAt = i; break; }
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

if (goneAt < 0) fail('the ball never fell into the gap, so nothing was tested');
else console.log(`   the ball left the screen after ${(goneAt / 10).toFixed(1)}s`);
await shoot('1-gone');

// It must come back, and quickly. The deflate plus the inflate is the whole
// budget; anything much longer than that is a freeze rather than a setback.
const budget = (CONFIG.DEFLATE.TIME + CONFIG.DEFLATE.INFLATE) * 1000 + 1200;
let back = null;
for (let waited = 0; waited < budget && !back; waited += 100) {
  await sleep(100);
  back = await ballAt(ev);
}

if (!back) fail(`the ball never came back within ${(budget / 1000).toFixed(1)}s of falling`);
else {
  console.log(`\n3. it came back at ${back.x.toFixed(0)},${back.y.toFixed(0)} (it started at ${start.x.toFixed(0)},${start.y.toFixed(0)})`);
  // Level one has no checkpoints before its first gap, so home is still the
  // spawn and the ball must be back roughly where it began.
  if (Math.abs(back.x - start.x) > 120) {
    fail(`it came back at x=${back.x.toFixed(0)}, nowhere near where it started, ${start.x.toFixed(0)}`);
  }
}
await shoot('2-back');

// And it is playable: holding right moves it again.
const before = await ballAt(ev);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
await sleep(900);
const after = await ballAt(ev);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
if (!after) fail('lost the ball again while checking it still rolls');
else if (after.x - before.x < 60) fail(`after coming back the ball only moved ${(after.x - before.x).toFixed(0)}px`);
else console.log(`\n4. and it rolls again: ${(after.x - before.x).toFixed(0)}px right`);

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nDEFLATING AND COMING BACK LOOKS RIGHT');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 8: Run the browser deflate suite, and look at the shots**

Run: `node games/pushkar-ball/tests/run.mjs browser/deflate`

Expected: `DEFLATING AND COMING BACK LOOKS RIGHT`.

Open `tests/screenshots/deflate-1-gone.png`, `deflate-2-back.png` and `deflate-3-settled.png`.

**Correction to what this step originally claimed.** It said the first shot would show "a dimmed screen with no ball". It cannot, and the mistake is instructive: the ball is killed at `y - r > bounds.h`, which is far below the viewport, so at the instant `ballAt` loses sight of it `dying` is still 0 and the dim has not started. That shot shows the gap, undimmed, with no ball — and a screenshot nominated as a proof that cannot show the thing it proves is worse than no screenshot, because it passes a look-at-it check by looking plausible.

So the dim is asserted instead, not eyeballed: `Overlay.dim` is pure and lives in `ui.js`, and `tests/offline/deflate.mjs` walks a whole failure and checks the amount is 0 at rest, peaks at exactly `DEFLATE.DIM` at the respawn, humps once, and returns to 0. The settled shot then answers the question this step was really asking — whether the inflate finishes — alongside a `pixels`-count assertion in the browser suite.

The mid-inflate shot is worth keeping too: it shows the swell actually happening.

- [ ] **Step 9: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/player.js games/pushkar-ball/js/main.js games/pushkar-ball/tests/offline/deflate.mjs games/pushkar-ball/tests/browser/deflate.mjs
git commit -m "Deflate the ball when it fails, and swell it back at the checkpoint

Failing has to be visible and gentle: the ball squashes flat where it stood,
the screen dims for a moment, and it re-inflates at home. No blood, no injury,
no death imagery — what Red Ball itself did, and inside the hub's rules rather
than an exception to them.

While dying the ball is not simulated at all. Gravity would drag the squashed
ball through the floor it died on, input would let the player steer a corpse,
and resolution against a spike it is still overlapping would fight the death
every step. The input is still drained, because a press held through the
deflate would otherwise fire the instant the ball came back.

die() is ignored while already dying, which is the guard that matters: a ball
killed by a spike is still sitting on that spike, and without it the death
re-triggers every step and the deflate never finishes.

The squash is a canvas scale and never touches ball.r. r is the collision
radius, and the physics must not care what the drawing is doing."
```

---

## Task 4: Spikes

The first hazard, and the only one this phase builds. Saws and crushers belong to phase 3, with the levels that use them.

**Files:**
- Modify: `games/pushkar-ball/js/config.js`
- Create: `games/pushkar-ball/js/hazards.js`
- Modify: `games/pushkar-ball/js/levels.js`
- Modify: `games/pushkar-ball/js/player.js`
- Modify: `games/pushkar-ball/js/main.js`
- Modify: `sw.js` (repo root)
- Create: `games/pushkar-ball/tests/offline/hazards.mjs`

- [ ] **Step 1: Write the failing hazards test**

Create `games/pushkar-ball/tests/offline/hazards.mjs`:

```js
// Spikes: they kill when touched, they do not kill when merely near, and they
// are more forgiving than they look.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');
const { spikeBox } = await import('../../js/hazards.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

/** Flat ground with one patch of spikes on it. */
const world = (spikes) => loadLevel({
  id: 93, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [], platforms: [],
  spikes,
});

// --- 1. the loader expands them ------------------------------------------
{
  const level = world([{ x: 800, y: 760, w: 120 }]);
  console.log(`\n1. the level has ${level.spikes.length} spike patch(es)`);
  if (level.spikes.length !== 1) fail(`expected 1 patch, got ${level.spikes.length}`);
}

// --- 2. the hit box is smaller than the drawing --------------------------
//
// Forgiveness, deliberately. A hazard whose hit box matches its picture kills
// on a graze that looked like a miss, and a six-year-old cannot tell the
// difference between that and the game cheating.
{
  const s = { x: 800, y: 760, w: 120 };
  const box = spikeBox(s, CONFIG);
  console.log(`\n2. a ${s.w}px patch drawn ${CONFIG.SPIKE.H}px tall has a hit box ` +
              `${box.w.toFixed(0)}x${box.h.toFixed(0)} at ${box.x.toFixed(0)},${box.y.toFixed(0)}`);
  if (box.w >= s.w) fail(`the hit box is ${box.w} wide, not narrower than the ${s.w} drawn`);
  if (box.h >= CONFIG.SPIKE.H) fail(`the hit box is ${box.h} tall, not shorter than the ${CONFIG.SPIKE.H} drawn`);
  if (box.y + box.h > s.y + 0.001) fail('the hit box hangs below the ground the spikes stand on');
}

// --- 3. rolling into them kills ------------------------------------------
{
  const level = world([{ x: 800, y: 760, w: 160 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  let steps = 0;
  const limit = Math.round(8 / CONFIG.STEP);
  while (ball.deaths === 0 && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;

  console.log(`\n3. rolled into a spike patch and died after ${(steps * CONFIG.STEP).toFixed(2)}s at x=${ball.x.toFixed(0)}`);
  if (ball.deaths !== 1) fail(`rolling into spikes gave ${ball.deaths} deaths, expected 1`);
  if (ball.x < 700) fail(`died at x=${ball.x.toFixed(0)}, well before the spikes at 800 — something else killed it`);
}

// --- 4. rolling past where they are NOT does not kill --------------------
{
  const level = world([{ x: 1500, y: 760, w: 100 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  run(ball, level, input, 1.5);      // nowhere near 1500 yet
  input.right = false;

  console.log(`\n4. rolled to x=${ball.x.toFixed(0)} with spikes at 1500: deaths=${ball.deaths}`);
  if (ball.deaths !== 0) fail('died without reaching the spikes at all');
}

// --- 5. jumping over them survives ---------------------------------------
//
// The whole point of a spike is that it can be got past. If a patch narrower
// than the jump's reach cannot be cleared, the hit box is wrong, not the jump.
{
  const reach = (CONFIG.JUMP_V ** 2) / (2 * CONFIG.GRAVITY);
  const level = world([{ x: 900, y: 760, w: 90 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  // Roll right at speed and jump whenever grounded, which for a 90px patch is
  // more than enough to clear it.
  input.right = true;
  const n = Math.round(6 / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    if (ball.grounded) input.press();
    ball.update(CONFIG.STEP, input, level);
  }
  input.right = false;

  console.log(`\n5. a jump clears ${reach.toFixed(0)}px; bouncing over a 90px patch gave ${ball.deaths} death(s),` +
              ` ending at x=${ball.x.toFixed(0)}`);
  if (ball.deaths > 0) fail(`bouncing over a 90px spike patch still died ${ball.deaths} time(s)`);
  if (ball.x < 990) fail(`never got past the patch: ended at x=${ball.x.toFixed(0)}`);
}

// --- 6. dying on spikes finishes deflating and comes back ---------------
//
// The case the die() guard exists for: the ball dies ON the spikes and is
// still overlapping them the whole time it deflates.
{
  const level = world([{ x: 800, y: 760, w: 160 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  let steps = 0;
  while (ball.deaths === 0 && steps < Math.round(8 / CONFIG.STEP)) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;

  run(ball, level, input, CONFIG.DEFLATE.TIME + CONFIG.DEFLATE.INFLATE + 1.0);
  console.log(`\n6. after dying on the spikes: deaths=${ball.deaths}, x=${ball.x.toFixed(0)}, home=${ball.home.x}`);
  if (ball.deaths !== 1) fail(`the death on the spikes re-triggered: ${ball.deaths} deaths`);
  if (Math.abs(ball.x - ball.home.x) > 60) fail(`did not come back home: x=${ball.x.toFixed(0)}, home=${ball.home.x}`);
  if (ball.dying > 0) fail('still deflating long after it should have finished');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL HAZARD CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node games/pushkar-ball/tests/run.mjs hazards`

Expected: FAIL, module not found for `../../js/hazards.js`.

- [ ] **Step 3: Add the spike numbers and colours to config.js**

In `games/pushkar-ball/js/config.js`, after the `DEFLATE` block:

```js
  // ---------------------------------------------------------------------
  // Spikes
  // ---------------------------------------------------------------------
  SPIKE: {
    H: 26,               // drawn height above the ground they stand on
    TOOTH_W: 20,         // one tooth, so a patch is drawn as w / TOOTH_W teeth
    // How much smaller the hit box is than the picture, in world units, on
    // every side. Forgiveness, deliberately: a hazard whose hit box matches
    // its picture kills on a graze that looked like a miss, and a six-year-old
    // cannot tell that apart from the game cheating. Being killed by
    // something you clearly touched is fair; being killed by something you
    // clearly missed is not, and only one of those two mistakes is worth
    // risking.
    FORGIVE: 5,
  },
```

And in `COLOURS`:

```js
    // Steel, and checked by hand against IS_BALL in the browser helpers: it
    // is bluer than it is red, so it can never be mistaken for the hero.
    SPIKE: '#B9C4CC',
    SPIKE_EDGE: '#7C8B95',
```

- [ ] **Step 4: Write hazards.js**

Create `games/pushkar-ball/js/hazards.js`:

```js
/**
 * hazards.js — the things that send the ball back.
 *
 * Spikes only, for now. Saws and crushers belong to phase 3, with the levels
 * that use them: building a hazard no level contains is building ahead, and a
 * crusher in particular needs a level authored around it, since it is a solid
 * moving body that can trap a ball or a crate against the floor.
 *
 * A hazard is NOT a collider. It never becomes a segment and the ball never
 * bounces off it — the ball rolls into it and fails. That is why this file has
 * no connection to physics.js at all, and why its hit tests are ordinary
 * geometry rather than anything to do with resolution.
 *
 * `spikeBox` and `hitsSpikes` are pure and DOM-free, so node tests the real
 * arithmetic. Only `drawSpikes` touches a context, and it is handed one.
 */

/**
 * The rectangle that actually kills, given a spike patch as authored.
 *
 * Smaller than the picture on every side by SPIKE.FORGIVE. See the note on
 * that number in config.js: being killed by something you clearly touched is
 * fair, being killed by something you clearly missed is not, and only one of
 * those two mistakes is worth risking with a six-year-old.
 *
 * `s.y` is the ground the spikes stand on, and they are drawn upward from it,
 * so the box's top is `s.y - SPIKE.H` and it never hangs below the ground.
 */
export function spikeBox(s, cfg) {
  const f = cfg.SPIKE.FORGIVE;
  return {
    x: s.x + f,
    y: s.y - cfg.SPIKE.H + f,
    w: Math.max(0, s.w - f * 2),
    h: Math.max(0, cfg.SPIKE.H - f),
  };
}

/** Is this circle touching this rectangle? Closest point, then distance. */
function circleHitsBox(cx, cy, r, b) {
  const nx = cx < b.x ? b.x : cx > b.x + b.w ? b.x + b.w : cx;
  const ny = cy < b.y ? b.y : cy > b.y + b.h ? b.y + b.h : cy;
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/** Is the ball in any of these spike patches? */
export function hitsSpikes(ball, spikes, cfg) {
  for (const s of spikes) {
    if (circleHitsBox(ball.x, ball.y, ball.r, spikeBox(s, cfg))) return true;
  }
  return false;
}

/**
 * Draw the patches as rows of teeth.
 *
 * Called inside the world transform, so everything here is in world units.
 * Steel, never red: the browser suites find the ball by being the only thing
 * on screen of its hue.
 */
export function drawSpikes(ctx, spikes, cfg) {
  const C = cfg.COLOURS;
  for (const s of spikes) {
    const n = Math.max(1, Math.round(s.w / cfg.SPIKE.TOOTH_W));
    const tw = s.w / n;

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = s.x + i * tw;
      ctx.moveTo(x, s.y);
      ctx.lineTo(x + tw / 2, s.y - cfg.SPIKE.H);
      ctx.lineTo(x + tw, s.y);
      ctx.closePath();
    }
    ctx.fillStyle = C.SPIKE;
    ctx.fill();
    ctx.strokeStyle = C.SPIKE_EDGE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // A base strip, so a patch reads as one fixture rather than a row of
    // loose triangles balanced on the grass.
    ctx.fillStyle = C.SPIKE_EDGE;
    ctx.fillRect(s.x, s.y - 4, s.w, 5);
  }
}
```

- [ ] **Step 5: Expand spikes in the loader and ask about them**

In `games/pushkar-ball/js/levels.js`, add the import at the top:

```js
import { hitsSpikes } from './hazards.js';
```

In the `Level` constructor, after `this.checkpoints = ...`:

```js
    // Hazards are not colliders and never enter the segment world. The ball
    // does not bounce off a spike; it rolls into one and fails.
    this.spikes = (data.spikes || []).map((s) => ({ x: s.x, y: s.y, w: s.w }));
```

And a method after `takeCheckpoint`:

```js
  /** Is the ball touching anything that should send it back? */
  hitsHazard(ball) {
    return hitsSpikes(ball, this.spikes, CONFIG);
  }
```

- [ ] **Step 6: Let a hazard kill the ball**

In `games/pushkar-ball/js/player.js`, in `update`, immediately before the checkpoint block added in Task 2:

```js
    // --- hazards ----------------------------------------------------------
    //
    // Checked after movement and resolution, so the ball is asked about where
    // it actually ended up rather than where it was heading. Checked before
    // checkpoints, so a checkpoint standing in a patch of spikes cannot be
    // armed by the same step that kills you — which would make failing there
    // permanent.
    if (level.hitsHazard(this)) this.die();
```

- [ ] **Step 7: Draw the spikes**

In `games/pushkar-ball/js/main.js`, add the import:

```js
import { drawSpikes } from './hazards.js';
```

and in `draw`, after `drawCheckpoints()` and before `drawPlatforms()`:

```js
  drawSpikes(ctx, level.spikes, CONFIG);
```

- [ ] **Step 8: Precache hazards.js**

In `sw.js` at the repo root, in the Pushkar Ball block of `PRECACHE`, after `'./games/pushkar-ball/js/camera.js',`:

```js
  './games/pushkar-ball/js/hazards.js',
```

Do **not** bump `CACHE`. Adding a file does not need it — editing `sw.js` at all re-runs `install`, and `addAll` puts the new path into the cache that already exists. A needless bump costs every installed phone a full re-download; this was done once and reverted already.

- [ ] **Step 8b: Make the squash assertable, since it still cannot be seen**

**Correction to my own Step 8b.** It said to add these assertions to "the browser suite you write for spikes". There is no such suite and there cannot be one in this task: level one has no spikes, level three does not exist until Task 6, and no browser suite can reach level three from a cold start. So a spike death still cannot be watched.

What is genuinely available is the arithmetic. The dim is already covered — Task 3 extracted `Overlay.dim` into `ui.js` and `tests/offline/deflate.mjs` asserts its whole curve. The squash is not, because it is computed inline in `main.js`, which no offline suite can import.

So do the same thing for it. Move the squash and swell scale out of `drawBall` into a pure method on the ball:

```js
  /**
   * How the ball should be drawn right now: `sx`/`sy` multipliers, 1 when it
   * is whole. Deflating flattens it, re-inflating swells it back.
   *
   * State, not drawing — which is why it lives here and not in main.js, and
   * why it returns numbers rather than touching a context. It is here at all
   * so that it can be asserted in node: the squash happens off the bottom of
   * the screen when a ball falls out of the world, so until a spike kills one
   * in plain view there is nothing anywhere that can watch it happen.
   */
  squash() {
    const D = CONFIG.DEFLATE;
    if (this.dying > 0) {
      const t = 1 - this.dying / D.TIME;
      return { sx: 1 + D.SPREAD * t, sy: 1 - D.SQUASH * t };
    }
    if (this.reviving > 0) {
      const t = 1 - this.reviving / D.INFLATE;
      const s = D.INFLATE_FROM + (1 - D.INFLATE_FROM) * t;
      return { sx: s, sy: s };
    }
    return { sx: 1, sy: 1 };
  }
```

`drawBall` then reads `const { sx, sy } = ball.squash();` and keeps the translate exactly as it is — the translate is drawing and stays in `main.js`.

Then assert it in `tests/offline/deflate.mjs`, walking one whole failure as the dim check already does:

- `{1, 1}` at rest, before anything happens.
- While dying: `sy` falls monotonically and `sx` rises monotonically, `sy` never reaching 0 or below.
- The flattest frame is **wider than it is tall** (`sx > sy`). That is the squash and nothing else satisfies it.
- While reviving: both scale equally (`sx === sy`, so it comes back round, not oval) and rise monotonically to 1.
- `{1, 1}` again once playable.

Break it afterwards and confirm each clause fails — an inverted phase, a scale that never returns to 1, an oval swell.

**The picture itself is deferred to Task 7**, which already builds `tools/panels.html` for exactly this reason: the results panel cannot be reached in a test either. Task 7 gains a second tool page that draws the ball at several points through a deflate so the shape can be judged by eye. Note there that Task 3 measured the real thing with a throwaway probe and found the ball's bottom edge held to within half a pixel through the whole squash, so the tool page is confirming a known-good shape rather than discovering it.

- [ ] **Step 9: Run the hazards test, then every offline suite**

Run: `node games/pushkar-ball/tests/run.mjs hazards`

Expected: `ALL HAZARD CHECKS PASSED`.

If check 5 fails — bouncing over a 90px patch still dies — the hit box is too tall or too wide, not the jump. Change `SPIKE.FORGIVE` or `SPIKE.H` in `config.js`, not the test.

Then: `node games/pushkar-ball/tests/run.mjs offline` — nine suites ok, including `precache` which now checks `hazards.js` is listed.

- [ ] **Step 10: Commit**

```bash
git add games/pushkar-ball/js/hazards.js games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js games/pushkar-ball/js/player.js games/pushkar-ball/js/main.js games/pushkar-ball/tests/offline/hazards.mjs sw.js
git commit -m "Add spikes, with a hit box smaller than the picture

A hazard is not a collider. It never becomes a segment and the ball never
bounces off it — the ball rolls into one and fails — which is why hazards.js
has no connection to physics.js at all.

The hit box is smaller than the drawing on every side, by SPIKE.FORGIVE. A
hazard whose hit box matches its picture kills on a graze that looked like a
miss, and a six-year-old cannot tell that apart from the game cheating. Being
killed by something you clearly touched is fair; being killed by something you
clearly missed is not; only one of those two mistakes is worth risking.

Hazards are checked after resolution, so the ball is asked about where it
actually ended up, and before checkpoints, so a checkpoint standing in a patch
of spikes cannot be armed by the same step that kills you — which would make
failing there permanent.

Spikes are steel, checked by hand against IS_BALL in the browser helpers.
Saws and crushers stay in phase 3, with the levels that use them: a crusher is
a solid moving body that can trap a ball or a crate against the floor, and it
needs a level authored around it."
```

---

## Task 5: The flag, the results panel, and the next level

The level ends at the flag. The flag animates, a panel says what happened, and then the next level starts on its own. Winning never sends the player back to a menu — a child who has just won should not have to navigate anything to keep playing.

> **Ordering, found while reviewing Task 4.** The goal check must go **before**
> the hazard check in `Ball.update`, not after it. A ball that reaches the flag
> while overlapping a spike would otherwise die instead of winning, and which
> of the two happened would depend on how a level was authored — so this task's
> own `progress.mjs` check 4 ("dying does not un-win") would pass or fail
> intermittently. Putting the goal first, or making `die()` a no-op once `won`
> is latched, settles it. The goal is the reward; it outranks the hazard.
>
> **A freeze to avoid, found while reviewing Task 2.** `ball.dying` is decremented only inside `Ball.update`. The state machine below stops calling `ball.update` once `mode === 'won'`, so a flag touched while the ball is mid-deflate would leave `dying` positive for ever and the ball would never come back. Either keep updating the ball while `dying > 0`, or clear `dying` and `reviving` when the level is won and when `startLevel` runs. The same applies to any pause added later. `respawn()` clears both as of Task 2, so calling it is one safe way.

**Files:**
- Modify: `games/pushkar-ball/js/config.js`
- Modify: `games/pushkar-ball/js/levels.js`
- Modify: `games/pushkar-ball/js/player.js`
- Modify: `games/pushkar-ball/js/input.js`
- Modify: `games/pushkar-ball/js/ui.js`
- Modify: `games/pushkar-ball/js/main.js`
- Create: `games/pushkar-ball/tests/offline/progress.mjs`
- Modify: `games/pushkar-ball/tests/offline/buttons.mjs`

- [ ] **Step 1: Write the failing progress test**

Create `games/pushkar-ball/tests/offline/progress.mjs`:

```js
// Winning: touching the flag, and what happens next.
//
// The state machine lives in main.js, which needs a DOM, so what this suite
// tests is everything underneath it: that the ball notices the flag, that it
// notices it only when it is actually there, and that the level list supports
// advancing. main.js's own wiring is checked by eye and by the browser suites.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { LEVELS, loadLevel, nextLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

const world = () => loadLevel({
  id: 92, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  goal: { x: 900, y: 760 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [], platforms: [],
});

// --- 1. rolling into the flag wins ---------------------------------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  if (ball.won) fail('the ball started out already having won');

  input.right = true;
  let steps = 0;
  while (!ball.won && steps < Math.round(8 / CONFIG.STEP)) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;

  console.log(`\n1. rolled into the flag after ${(steps * CONFIG.STEP).toFixed(2)}s at x=${ball.x.toFixed(0)} (flag at ${level.goal.x})`);
  if (!ball.won) fail('rolled straight over the flag without winning');
  if (Math.abs(ball.x - level.goal.x) > CONFIG.GOAL.R + 40) {
    fail(`won at x=${ball.x.toFixed(0)}, too far from the flag at ${level.goal.x}`);
  }
}

// --- 2. it does not win from across the level ----------------------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 2.0);          // sitting still, far from the flag
  console.log(`\n2. sat at x=${ball.x.toFixed(0)} with the flag at ${level.goal.x}: won=${ball.won}`);
  if (ball.won) fail('won without going anywhere near the flag');
}

// --- 3. a level with no flag can never be won ----------------------------
//
// Every level in LEVELS has one, but a test level might not, and `won` going
// true because `undefined` was near the ball would be a silent disaster.
{
  const level = loadLevel({
    id: 91, theme: 'hills', bounds: { w: 1200, h: 1080 },
    spawn: { x: 200, y: 600 }, ground: [[[40, 760], [1000, 760]]],
    boxes: [], platforms: [],
  });
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  input.right = true;
  run(ball, level, input, 4.0);
  console.log(`\n3. a level with no goal: won=${ball.won}`);
  if (ball.won) fail('won a level that has no flag in it');
}

// --- 4. dying does not un-win, and winning outlives a death -------------
//
// Once the flag is touched the level is over. A stray death in the same step —
// the ball landing on the flag and rolling into something — must not steal it.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  input.right = true;
  let steps = 0;
  while (!ball.won && steps < Math.round(8 / CONFIG.STEP)) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;
  ball.die();
  run(ball, level, input, CONFIG.DEFLATE.TIME + 0.5);
  console.log(`\n4. died right after winning: won=${ball.won}`);
  if (!ball.won) fail('a death after the flag took the win away');
}

// --- 5. the level list knows what comes next -----------------------------
{
  console.log(`\n5. ${LEVELS.length} levels; ids ${LEVELS.map((l) => l.id).join(', ')}`);
  if (LEVELS.length < 2) fail('there is nothing to advance into');

  for (let i = 0; i < LEVELS.length - 1; i++) {
    if (nextLevel(i) !== i + 1) fail(`nextLevel(${i}) is ${nextLevel(i)}, expected ${i + 1}`);
  }
  const last = LEVELS.length - 1;
  if (nextLevel(last) !== null) {
    fail(`nextLevel on the last level is ${nextLevel(last)}, expected null — there is nowhere to go`);
  } else {
    console.log(`   and nextLevel(${last}) is null, because the last level has nowhere to advance to`);
  }

  // Every level must be loadable and give a ball somewhere to stand. A level
  // that throws on load is a level the auto-advance walks straight into.
  for (let i = 0; i < LEVELS.length; i++) {
    const level = loadLevel(LEVELS[i]);
    const ball = new Ball(level.spawn.x, level.spawn.y);
    const input = stub();
    run(ball, level, input, 2.0);
    if (!ball.grounded) fail(`level ${LEVELS[i].id}: a ball dropped at the spawn never settled`);
    if (ball.deaths > 0) fail(`level ${LEVELS[i].id}: a ball dropped at the spawn died ${ball.deaths} time(s) doing nothing`);
    if (ball.won) fail(`level ${LEVELS[i].id}: the spawn is inside the flag`);
  }
  console.log(`   every level loads, and a ball dropped at each spawn settles without dying`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PROGRESS CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node games/pushkar-ball/tests/run.mjs progress`

Expected: FAIL — `nextLevel` is not exported, `CONFIG.GOAL` is undefined, `ball.won` is undefined.

- [ ] **Step 3: Add the goal and panel numbers to config.js**

In `games/pushkar-ball/js/config.js`, after the `SPIKE` block:

```js
  // ---------------------------------------------------------------------
  // The flag, and what happens after it
  // ---------------------------------------------------------------------
  GOAL: {
    // How close the ball's centre gets before the level is won. Generous, for
    // the same reason a checkpoint's radius is: the flag is the reward, and a
    // reward you have to line up precisely is a reward withheld.
    R: 52,
  },

  RESULTS: {
    // Seconds the panel is shown before the next level starts on its own.
    // Long enough to see what happened and to reach a button; short enough
    // that a child who just wants to keep playing is not made to wait.
    HOLD: 3.2,
    PANEL_W: 300,        // the panel, in CSS pixels
    PANEL_H: 168,
    BUTTON_R: 34,        // the retry and hub buttons on it
    GAP: 26,             // between those two buttons
    STAR_R: 22,
  },
```

And in `COLOURS`:

```js
    PANEL: 'rgba(255,255,255,0.94)',
    PANEL_EDGE: '#78868F',
    PANEL_INK: '#33444F',
    STAR_ON: '#FFC93C',
    STAR_OFF: '#D8DEE2',
```

- [ ] **Step 4: Let the ball notice the flag**

In `games/pushkar-ball/js/player.js`, add to the constructor:

```js
    this.won = false;       // touched the flag; the level is over
```

and in `update`, immediately after the hazard check:

```js
    // --- the flag ---------------------------------------------------------
    //
    // Latched, never cleared. Once the flag is touched the level is over, and
    // a stray death in the same step — the ball landing on the flag and
    // rolling into something — must not steal it back.
    //
    // `level.goal` is null on a level that has none, and `won` must stay false
    // for those rather than measuring the distance to `undefined`.
    if (!this.won && level.goal) {
      const g = CONFIG.GOAL.R;
      if ((this.x - level.goal.x) ** 2 + (this.y - level.goal.y) ** 2 <= g * g) this.won = true;
    }
```

- [ ] **Step 5: Export `nextLevel` from levels.js**

At the bottom of `games/pushkar-ball/js/levels.js`, beside `loadLevel`:

```js
/**
 * The index of the level after this one, or null if there is none.
 *
 * Null rather than wrapping round to zero, and rather than clamping to the
 * last one. The caller has to decide what "nowhere to go" means — for the
 * results panel it means showing something celebratory instead of promising a
 * level that does not exist — and a function that quietly returns the same
 * level again would hide that decision rather than force it.
 */
export function nextLevel(index) {
  return index + 1 < LEVELS.length ? index + 1 : null;
}
```

- [ ] **Step 6: Remember taps that miss every control**

In `games/pushkar-ball/js/input.js`, add to the constructor's field list:

```js
    this._tap = null;            // a tap that hit no control, for the panels
```

and change `_down` to:

```js
  _down(e) {
    const name = this._hit(e);
    if (!name) {
      // A tap on nothing is remembered rather than dropped, because the
      // results panel's own buttons are not game controls and are not in
      // ui.js's Buttons. Kept as a position, not as a button name: the panel
      // knows its own geometry and this file should not have to.
      const r = this.canvas.getBoundingClientRect();
      this._tap = { x: e.clientX - r.left, y: e.clientY - r.top };
      return;
    }
    e.preventDefault();
    if (name === 'jump') this._jump = true;
    else this._pointers.set(e.pointerId, name);
  }
```

and add beside `takeJump`:

```js
  /**
   * Where the last tap that missed every control was, consumed.
   *
   * Consumed for the same reason a jump press is: a panel that read a held
   * position would fire its button on every frame the finger was down.
   */
  takeTap() { const t = this._tap; this._tap = null; return t; }
```

- [ ] **Step 7: Add the results panel to ui.js**

In `games/pushkar-ball/js/ui.js`, at the end, after the `Buttons` export:

```js
/**
 * The panel shown when a level is won.
 *
 * Its geometry lives here for exactly the reason the control buttons' does:
 * the tests ask for it, and no test may contain a coordinate. Positions are in
 * CSS pixels from the top-left of the canvas.
 *
 * There are two buttons and no more. A grid button to level select is missing
 * on purpose — level select is phase 4, and a button that goes nowhere is
 * worse than no button. Retry is the curved arrow; the house goes back to the
 * hub. Both are visible the whole time the panel is, because the panel
 * advances to the next level by itself and a child who wants to replay the
 * level he just enjoyed must not be carried onward regardless.
 */
export const Panel = {
  /** The panel itself, centred, and clamped so it always fits. */
  box(w, h) {
    const R = CONFIG.RESULTS;
    const pw = Math.min(R.PANEL_W, w - 24);
    const ph = Math.min(R.PANEL_H, h - 24);
    return { x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph };
  },

  /** Replay this level. Left of centre, low in the panel. */
  retry(w, h) {
    const R = CONFIG.RESULTS;
    const b = Panel.box(w, h);
    return { x: b.x + b.w / 2 - R.BUTTON_R - R.GAP / 2, y: b.y + b.h - R.BUTTON_R - 16, r: R.BUTTON_R };
  },

  /** Back to the hub's tile screen. Right of centre. */
  home(w, h) {
    const R = CONFIG.RESULTS;
    const b = Panel.box(w, h);
    return { x: b.x + b.w / 2 + R.BUTTON_R + R.GAP / 2, y: b.y + b.h - R.BUTTON_R - 16, r: R.BUTTON_R };
  },

  /** Which of the panel's buttons is at this point, or null. */
  at(px, py, w, h) {
    for (const name of ['retry', 'home']) {
      const b = Panel[name](w, h);
      const hit = b.r * CONFIG.UI.HIT;
      if ((px - b.x) ** 2 + (py - b.y) ** 2 <= hit * hit) return name;
    }
    return null;
  },

  /**
   * Draw it.
   *
   * @param stars how many of three are earned. Phase 2 has no gems to collect,
   *              so finishing earns one; the other two arrive with gems in
   *              phase 3 and are drawn empty until then.
   */
  draw(ctx, w, h, { level, stars }) {
    const C = CONFIG.COLOURS;
    const R = CONFIG.RESULTS;
    const b = Panel.box(w, h);

    ctx.fillStyle = C.PANEL;
    roundRect(ctx, b.x, b.y, b.w, b.h, 22);
    ctx.fill();
    ctx.strokeStyle = C.PANEL_EDGE;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Three stars, filled from the left.
    const cy = b.y + 52;
    for (let i = 0; i < 3; i++) {
      const cx = b.x + b.w / 2 + (i - 1) * (R.STAR_R * 2.5);
      star(ctx, cx, cy, R.STAR_R, i < stars ? C.STAR_ON : C.STAR_OFF);
    }

    // The level number, in digits — the one kind of text he reads reliably.
    ctx.fillStyle = C.PANEL_INK;
    ctx.font = `bold ${Math.round(R.STAR_R * 1.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), b.x + b.w / 2, cy + R.STAR_R * 2.2);

    // Retry: a curved arrow. Home: a house. Pictures, never words.
    const r = Panel.retry(w, h);
    circleButton(ctx, r, C);
    ctx.strokeStyle = C.PANEL_INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * 0.5, Math.PI * 0.35, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r.x + r.r * 0.5, r.y - r.r * 0.32);
    ctx.lineTo(r.x + r.r * 0.16, r.y - r.r * 0.2);
    ctx.lineTo(r.x + r.r * 0.52, r.y + r.r * 0.06);
    ctx.closePath();
    ctx.fillStyle = C.PANEL_INK;
    ctx.fill();

    const hm = Panel.home(w, h);
    circleButton(ctx, hm, C);
    ctx.beginPath();
    ctx.moveTo(hm.x - hm.r * 0.55, hm.y);
    ctx.lineTo(hm.x, hm.y - hm.r * 0.5);
    ctx.lineTo(hm.x + hm.r * 0.55, hm.y);
    ctx.lineTo(hm.x + hm.r * 0.34, hm.y);
    ctx.lineTo(hm.x + hm.r * 0.34, hm.y + hm.r * 0.45);
    ctx.lineTo(hm.x - hm.r * 0.34, hm.y + hm.r * 0.45);
    ctx.lineTo(hm.x - hm.r * 0.34, hm.y);
    ctx.closePath();
    ctx.fillStyle = C.PANEL_INK;
    ctx.fill();
  },
};

function circleButton(ctx, b, C) {
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = C.STAR_OFF;
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r, colour) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}
```

- [ ] **Step 8: Add the panel's buttons to the button test**

In `games/pushkar-ball/tests/offline/buttons.mjs`, change the import line to:

```js
const { Buttons, Panel } = await import('../../js/ui.js');
```

and, inside the `for (const [w, h] of SCREENS)` loop, after the existing checks and before the closing `console.log`, add:

```js
  // The results panel's own buttons, held to exactly the same standard. The
  // panel appears on top of the game and advances by itself, so a button of
  // its own that has fallen off the screen is a child carried into the next
  // level with no way to stop it.
  const panel = Panel.box(w, h);
  if (panel.x < 0 || panel.y < 0 || panel.x + panel.w > w || panel.y + panel.h > h) {
    fail(`the results panel (${panel.w.toFixed(0)}x${panel.h.toFixed(0)}) does not fit a ${w}x${h} screen`);
  }
  for (const name of ['retry', 'home']) {
    const b = Panel[name](w, h);
    if (b.x - b.r < 0 || b.y - b.r < 0 || b.x + b.r > w || b.y + b.r > h) {
      fail(`the panel's ${name} button is off a ${w}x${h} screen`);
    }
    if (Panel.at(b.x, b.y, w, h) !== name) fail(`tapping the middle of the panel's ${name} does not hit it`);
    // And it must sit inside the panel it is drawn on.
    if (b.x - b.r < panel.x || b.x + b.r > panel.x + panel.w ||
        b.y - b.r < panel.y || b.y + b.r > panel.y + panel.h) {
      fail(`the panel's ${name} button hangs off the panel itself on ${w}x${h}`);
    }
  }
  const pr = Panel.retry(w, h), ph = Panel.home(w, h);
  if (Math.hypot(pr.x - ph.x, pr.y - ph.y) < pr.r + ph.r) fail(`the panel's two buttons overlap on ${w}x${h}`);
```

- [ ] **Step 9: Wire the state machine into main.js**

In `games/pushkar-ball/js/main.js`, replace the level construction:

```js
const level = loadLevel(LEVELS[0]);
const ball = new Ball(level.spawn.x, level.spawn.y);
const camera = new Camera(level);
const input = new Input(canvas);
```

with:

```js
const input = new Input(canvas);

// Rebuilt on every level, so these cannot be const. `startLevel` is the only
// thing that assigns them.
let levelIndex = 0;
let level, ball, camera;

// 'playing' until the flag, then 'won' while the panel is up. Two values, and
// it should stay that way: a mode is the thing that quietly grows into a
// tangle, and main.js's whole job here is to stay thin.
let mode = 'playing';
let wonFor = 0;              // seconds the panel has been up

function startLevel(i) {
  levelIndex = i;
  level = loadLevel(LEVELS[i]);
  ball = new Ball(level.spawn.x, level.spawn.y);
  camera = new Camera(level);
  // Snapped, not eased: the first frame of a new level should be the new level
  // and not a swoop in from wherever the last one ended.
  camera.snap(ball);
  camera.update(CONFIG.STEP, ball, viewW, viewH);
  mode = 'playing';
  wonFor = 0;
}
startLevel(0);
```

Replace the body of the fixed-step loop:

```js
    accumulator += dt;
    let steps = 0;
    while (accumulator >= CONFIG.STEP && steps < 240) {
      level.update(CONFIG.STEP);

      const diedBefore = ball.deaths;
      ball.update(CONFIG.STEP, input, level);
      if (ball.deaths !== diedBefore) camera.snap(ball);

      camera.update(CONFIG.STEP, ball, viewW, viewH);
      accumulator -= CONFIG.STEP;
      steps++;
    }
```

with:

```js
    accumulator += dt;
    let steps = 0;
    while (accumulator >= CONFIG.STEP && steps < 240) {
      // The level keeps running while the panel is up, so the platforms carry
      // on moving behind it. A world that freezes the instant you win looks
      // like the game crashed at the moment of the reward.
      level.update(CONFIG.STEP);

      if (mode === 'playing') {
        const diedBefore = ball.deaths;
        ball.update(CONFIG.STEP, input, level);
        if (ball.deaths !== diedBefore) camera.snap(ball);
        if (ball.won) mode = 'won';
      } else {
        wonFor += CONFIG.STEP;
      }

      camera.update(CONFIG.STEP, ball, viewW, viewH);
      accumulator -= CONFIG.STEP;
      steps++;
    }

    if (mode === 'won') handlePanel();
```

And add, after the loop function:

```js
/**
 * The results panel: its two buttons, and the fact that it moves on by itself.
 *
 * Auto-advance is the point — a child who has just won should not have to
 * navigate anything to keep playing. The two buttons exist so that he is not
 * *forced* onward: retry replays the level he just enjoyed, and the house goes
 * back to the hub.
 */
function handlePanel() {
  const tap = input.takeTap();
  if (tap) {
    const hit = Panel.at(tap.x, tap.y, cssW, cssH);
    if (hit === 'retry') { startLevel(levelIndex); return; }
    if (hit === 'home') { window.location.href = '../../index.html'; return; }
  }

  if (wonFor < CONFIG.RESULTS.HOLD) return;

  const next = nextLevel(levelIndex);
  // Null means there is nowhere to go, so the last level stays on its panel
  // rather than promising a level that does not exist. Phase 4's level select
  // is where this will lead instead.
  if (next !== null) startLevel(next);
}
```

Update the imports at the top of `main.js`:

```js
import { LEVELS, loadLevel, nextLevel } from './levels.js';
import { Buttons, Panel } from './ui.js';
```

Then in `draw`, replace the `Buttons.draw` line with:

```js
  // The panel goes over the world and under nothing. The controls are hidden
  // while it is up, because rolling the ball around behind a results panel is
  // not a thing that should be possible.
  if (mode === 'won') {
    Panel.draw(ctx, cssW, cssH, { level: LEVELS[levelIndex].id, stars: 1 });
  } else {
    Buttons.draw(ctx, cssW, cssH, input.held());
  }
```

- [ ] **Step 10: Make the flag wave once it is reached**

In `games/pushkar-ball/js/main.js`, replace `drawGoal`'s flag triangle with one that leans when the level is won:

```js
function drawGoal() {
  if (!level.goal) return;
  const C = CONFIG.COLOURS;
  const g = level.goal;
  ctx.fillStyle = C.FLAG_POLE;
  ctx.fillRect(g.x - 3, g.y - 90, 6, 90);

  // Waving, once it has been reached. A flag that does nothing when touched
  // leaves a child unsure whether anything happened at all — and this is the
  // whole of the reward until audio arrives in phase 4.
  const wave = mode === 'won' ? Math.sin(wonFor * 9) * 10 : 0;
  ctx.beginPath();
  ctx.moveTo(g.x + 3, g.y - 90);
  ctx.lineTo(g.x + 52, g.y - 74 + wave);
  ctx.lineTo(g.x + 3, g.y - 58);
  ctx.closePath();
  ctx.fillStyle = C.FLAG;
  ctx.fill();
}
```

- [ ] **Step 11: Run the progress and button tests**

Run: `node games/pushkar-ball/tests/run.mjs progress buttons`

Expected: both ok. `progress` check 5 will fail until Task 6 adds levels 2 and 3 — `LEVELS.length < 2`. That is correct and expected: leave it failing, note it, and let Task 6 turn it green. Everything else in the suite must pass now.

- [ ] **Step 12: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js games/pushkar-ball/js/player.js games/pushkar-ball/js/input.js games/pushkar-ball/js/ui.js games/pushkar-ball/js/main.js games/pushkar-ball/tests/offline/progress.mjs games/pushkar-ball/tests/offline/buttons.mjs
git commit -m "End the level at the flag, and run straight into the next one

Winning never sends the player back to a menu. A child who has just won should
not have to navigate anything to keep playing, and every menu between two
levels is a chance to get lost in one. The panel holds for RESULTS.HOLD and
then the next level starts by itself.

It is not a trap, though: retry and hub are on the panel the whole time it is
up, because a boy who wants to replay the level he just enjoyed must not be
carried onward regardless. There is deliberately no grid button to level
select — that is phase 4, and a button that goes nowhere is worse than none.

nextLevel returns null on the last level rather than wrapping or clamping, so
the caller has to decide what nowhere-to-go means instead of silently
replaying the same level.

`won` is latched and never cleared, so a stray death in the same step cannot
steal the win back. The panel's geometry lives in ui.js beside the control
buttons, and buttons.mjs holds it to the same standard on all three screens:
the panel advances by itself, so a button of its own that has fallen off the
screen is a child carried onward with no way to stop it."
```

---

## Task 6: Levels two and three

Three levels, each harder than the last and none of them hard. Level 1 already exists and is not touched.

**Files:**
- Modify: `games/pushkar-ball/js/levels.js`
- Modify: `games/pushkar-ball/tests/offline/levels.mjs`

- [ ] **Step 1: Extend the level test first**

In `games/pushkar-ball/tests/offline/levels.mjs`, add these checks inside the existing per-level loop. Read the file first to match its local variable names — it already loops over `LEVELS` with a loaded `level` and a `fail` helper.

```js
  // --- checkpoints ------------------------------------------------------
  //
  // A checkpoint must be somewhere a ball can actually be, or arriving at it
  // is a death. Dropped at each one, the ball has to settle without dying.
  for (const [i, c] of level.checkpoints.entries()) {
    if (c.x < 0 || c.x > level.bounds.w || c.y < 0 || c.y > level.bounds.h) {
      fail(`level ${data.id}: checkpoint ${i} at ${c.x},${c.y} is outside the level`);
    }
    const probe = new Ball(c.x, c.y - CONFIG.BALL.R * 2);
    const input = { left: false, right: false, takeJump: () => false };
    const test = loadLevel(data);
    for (let s = 0; s < Math.round(2.5 / CONFIG.STEP); s++) {
      test.update(CONFIG.STEP);
      probe.update(CONFIG.STEP, input, test);
    }
    if (probe.deaths > 0) fail(`level ${data.id}: a ball dropped at checkpoint ${i} died ${probe.deaths} time(s)`);
    if (!probe.grounded) fail(`level ${data.id}: a ball dropped at checkpoint ${i} never settled`);

    // And the point a RESPAWN actually uses, which is lifted off the anchor by
    // the ball's radius plus CHECKPOINT.CLEARANCE. This is the check that
    // would have caught the respawn-inside-the-floor bug: dropping a ball at
    // the anchor itself is not the same question as respawning at one.
    const homeY = c.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE;
    const atHome = new Ball(c.x, homeY);
    const test2 = loadLevel(data);
    for (let s = 0; s < Math.round(2.5 / CONFIG.STEP); s++) {
      test2.update(CONFIG.STEP);
      atHome.update(CONFIG.STEP, input, test2);
    }
    if (atHome.deaths > 0) {
      fail(`level ${data.id}: respawning at checkpoint ${i} died ${atHome.deaths} time(s) — the respawn point is not clear`);
    }
    if (!atHome.grounded) fail(`level ${data.id}: respawning at checkpoint ${i} never settled`);
  }

  // A checkpoint's capture box reaches CHECKPOINT.R *below* its ground anchor
  // as well as POLE_H above it, so a passable route directly underneath a
  // flagged floor would arm that flag from below. That is a gift rather than a
  // trap — home becomes a spot the child has safely stood — but it is
  // surprising, so do not author a lower route under a checkpoint without
  // meaning to.

  // --- hazards ----------------------------------------------------------
  //
  // Nothing may kill you where you arrive. A spike overlapping the spawn or a
  // checkpoint is an unfinishable level, and it is the single easiest level
  // authoring mistake to make.
  const arrivals = [{ x: level.spawn.x, y: level.spawn.y, what: 'the spawn' }]
    .concat(level.checkpoints.map((c, i) => ({ x: c.x, y: c.y, what: `checkpoint ${i}` })));
  for (const a of arrivals) {
    const probe = { x: a.x, y: a.y, r: CONFIG.BALL.R * 2.5 };
    if (level.hitsHazard(probe)) fail(`level ${data.id}: a hazard is on top of ${a.what}`);
  }

  for (const [i, s] of level.spikes.entries()) {
    if (s.x < 0 || s.x + s.w > level.bounds.w) {
      fail(`level ${data.id}: spike patch ${i} runs from ${s.x} to ${s.x + s.w}, outside the level`);
    }

    // A lower bound as well as an upper one, and it is not fussiness. A patch
    // narrower than one tooth draws as a single stretched needle taller than
    // it is wide, and a patch with a negative width draws one tooth backwards
    // while its hit box sits somewhere nothing is drawn at all. Both are
    // authoring mistakes that look like nothing in the data and like a bug in
    // the game.
    if (s.w <= 0) fail(`level ${data.id}: spike patch ${i} has width ${s.w}`);
    else if (s.w < CONFIG.SPIKE.TOOTH_W) {
      fail(`level ${data.id}: spike patch ${i} is ${s.w}px wide, less than one ${CONFIG.SPIKE.TOOTH_W}px tooth — it draws as a single stretched needle`);
    }
    // A patch wider than the jump can clear cannot be got past at all.
    const reach = (CONFIG.JUMP_V ** 2) / (2 * CONFIG.GRAVITY);
    const span = (CONFIG.MAX_SPEED * 2 * CONFIG.JUMP_V) / CONFIG.GRAVITY;
    if (s.w > span * 0.6) {
      fail(`level ${data.id}: spike patch ${i} is ${s.w}px wide; a jump at full speed spans about ${span.toFixed(0)}px, so this cannot be cleared safely (reach ${reach.toFixed(0)}px up)`);
    }
  }

  // --- a long level has checkpoints -------------------------------------
  //
  // Long is measured in the level's own width, not in a number typed here.
  if (level.bounds.w > 3000 && level.checkpoints.length === 0) {
    fail(`level ${data.id} is ${level.bounds.w}px wide with no checkpoints — failing near the end costs the whole level`);
  }
  if (level.checkpoints.length > 3) {
    fail(`level ${data.id} has ${level.checkpoints.length} checkpoints; two or three is the limit, and evenly-spaced ones just bank progress nobody was going to lose`);
  }

  // --- a crate is never under a hazard ----------------------------------
  //
  // A crate that can be shoved into spikes is a crate that can be destroyed,
  // and if it was the way up, the level becomes unfinishable.
  for (const [i, c] of level.crates.entries()) {
    const overlaps = level.spikes.some((s) => c.x < s.x + s.w && c.x + c.w > s.x);
    if (overlaps) fail(`level ${data.id}: crate ${i} shares its stretch of ground with spikes`);
  }
```

Make sure `levels.mjs` imports what these need. At the top of the file it should have:

```js
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { LEVELS, loadLevel } = await import('../../js/levels.js');
```

- [ ] **Step 2: Run it and see level 1 pass alone**

Run: `node games/pushkar-ball/tests/run.mjs levels`

Expected: ok. Level 1 is 4800 wide with no checkpoints, so the long-level check should fail — **it should**, and the fix is level 1 getting checkpoints, which is Step 3. If it does not fail, the check is not reading `level.bounds.w`.

- [ ] **Step 3: Give level 1 checkpoints**

Level 1 is 4800px wide and has none, so failing at the last gap costs the whole level. In `games/pushkar-ball/js/levels.js`, inside level 1's object, after `goal`:

```js
    // Two, both immediately before something that can be failed: the first
    // gap, and the last one that needs the moving platform. Not evenly spaced
    // — a checkpoint in the middle of an easy run banks progress nobody was
    // going to lose.
    checkpoints: [
      { x: 2300, y: 760 },
      { x: 4120, y: 760 },
    ],
```

- [ ] **Step 4: Write level 2**

In `games/pushkar-ball/js/levels.js`, add to the `LEVELS` array after level 1:

```js
  {
    // Level two teaches the crate. Level one has crates and never needs one;
    // here the only way onto the high ledge is to shove a crate under it and
    // jump off the top, so the idea is learned somewhere it can be practised
    // without a hazard anywhere in sight.
    id: 2,
    theme: 'hills',
    bounds: { w: 3600, h: 1080 },
    spawn: { x: 180, y: 560 },
    goal: { x: 3380, y: 620 },

    ground: [
      // A long flat run to get up to speed, then two gaps of increasing size.
      // 200px is comfortable at speed; 260px needs a proper run-up. A jump at
      // full speed spans about 290px, so neither is near the limit.
      [[40, 760], [1200, 760]],
      [[1400, 760], [2000, 760]],
      // A step down and along: the flat where the crate lives, below the ledge.
      [[2260, 800], [2900, 800]],
      // The high ledge, and the goal is on it. Its top is 180px above the flat
      // below, and a jump from that flat reaches 131px — a ball there is at
      // y=780 and peaks at 649, which is not the 600 it needs to land on 620.
      // Standing on a 100px crate it is at 680 and peaks at 549, which is. So
      // the crate is the only way up, with about 50px of margin either way.
      [[2960, 620], [3500, 620]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 3500, y: 0, w: 40, h: 1080 },
      // The ledge's face, as a stone box rather than a bend in the polyline.
      //
      // A ground polyline cannot turn vertical here: winding order gives a
      // vertical segment a sideways normal, `ny` is 0, and levels.mjs rightly
      // insists every ground segment faces up. So the step's face is a box,
      // which is what boxes are for.
      //
      // It also has to exist at all. Without a face the ledge is a floating
      // horizontal line: the crate gets shoved straight underneath it and off
      // the end of the flat, and there is nothing to push it up against.
      { x: 2900, y: 620, w: 60, h: 180 },
      // The crate that matters, on the flat below the ledge, well clear of
      // both gaps so it cannot be shoved into one before it is needed. It can
      // be — crates come back when they fall out — but a child who loses it
      // for ten seconds has learned nothing except that things vanish.
      { x: 2400, y: 700, w: 100, h: 100, movable: true },
    ],

    platforms: [],

    checkpoints: [
      // Before the second, wider gap.
      { x: 1900, y: 760 },
    ],
  },
```

- [ ] **Step 5: Write level 3**

Add after level 2:

```js
  {
    // Level three introduces the spike, and nothing else. Everything under it
    // — rolling, gaps, crates, a moving platform — has already been met.
    //
    // The first patch is somewhere failing costs a few seconds: flat ground,
    // in plain sight, with a checkpoint just before it. That is the rule for
    // introducing anything, and it is the reason this level is longer than it
    // looks: the safe rehearsal has to come before the real ask.
    id: 3,
    theme: 'hills',
    bounds: { w: 4400, h: 1080 },
    spawn: { x: 180, y: 560 },
    // On the ground, like every other goal in the game — level one's sits at
    // its ledge's own height. GOAL.R is forgiving enough either way, but a
    // flag floating 60px in the air is a flag drawn hovering.
    goal: { x: 4200, y: 760 },

    ground: [
      // Flat, with the first spikes on it, in the open.
      [[40, 760], [1500, 760]],
      // A gap, then a stretch with spikes on the far side of it, so the
      // landing has to be aimed.
      [[1700, 760], [2600, 760]],
      // Up a ramp and along, with a patch at the top of the slope where speed
      // is highest — the one place the level asks for restraint.
      [[2600, 760], [2950, 620], [3500, 620]],
      // Down and home.
      [[3500, 620], [3800, 760], [4340, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 4340, y: 0, w: 40, h: 1080 },
    ],

    platforms: [
      // Across the gap, so it can be crossed by waiting as well as by jumping.
      // Two ways past the same obstacle is how a level stops being a wall.
      { x: 1540, y: 800, w: 150, h: 26, axis: 'x', dist: 70, period: 4.5, phase: 0 },
    ],

    spikes: [
      // The rehearsal: narrow, flat, unmissable, right after a checkpoint.
      { x: 900, y: 760, w: 80 },
      // The real ask: after the gap, so the landing matters.
      { x: 2250, y: 760, w: 100 },
      // At the top of the ramp, where the ball is fastest.
      { x: 3200, y: 620, w: 90 },
    ],

    checkpoints: [
      // Immediately before the first spikes, so meeting them costs seconds.
      { x: 780, y: 760 },
      // Before the ramp and its patch at the top.
      { x: 2500, y: 760 },
    ],
  },
```

- [ ] **Step 6: Run the level and progress tests**

Run: `node games/pushkar-ball/tests/run.mjs levels progress`

Expected: both ok. `progress` check 5 now sees three levels, so `nextLevel(0)` is 1, `nextLevel(2)` is null, and every spawn is checked.

If a spike patch trips the width check, narrow it. If a checkpoint probe dies, it is sitting in or above a hazard or over a gap — move it, and note that the test caught exactly the thing it exists for.

- [ ] **Step 7: Run every offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: eleven suites ok — `buttons`, `camera`, `checkpoints`, `crates`, `deflate`, `feel`, `hazards`, `levels`, `physics`, `precache`, `progress`.

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/levels.mjs
git commit -m "Add levels two and three, and checkpoints to level one

Level two teaches the crate: level one has crates and never needs one, so here
the only way onto the high ledge is to shove a crate under it and jump off the
top. No hazard anywhere in it — the idea gets learned somewhere it can be
practised.

Level three introduces the spike and nothing else. Its first patch is on flat
ground, in plain sight, with a checkpoint immediately before it, so meeting a
spike for the first time costs a few seconds. That safe rehearsal before the
real ask is why the level is longer than it looks. Its gap has a moving
platform across it as well as being jumpable, because two ways past the same
obstacle is how a level stops being a wall.

Level one is 4800px wide and had no checkpoints, so failing at the last gap
cost the whole level. It has two now, both immediately before something that
can be failed rather than evenly spaced.

The level suite grew the checks that catch the authoring mistakes: a ball
dropped at every checkpoint has to settle without dying, nothing may kill you
where you arrive, a spike patch may not be wider than a jump can span, a wide
level must have checkpoints and no level may have more than three, and a crate
may never share its stretch of ground with spikes — a crate that can be
destroyed is an unfinishable level when it was the way up."
```

---

## Task 7: Look at it

The step that matters most and the one most likely to be skipped. Phase 1's list of bugs found this way and no other way: hills whose wavelength was four times the width of a phone so both bands drew as flat washes; a ball riding under the buttons; a crate stopping the ball dead in the exact stretch a suite measured friction in.

**Files:**
- Create: `games/pushkar-ball/tools/panels.html`
- Create: `games/pushkar-ball/tools/README.md`

- [ ] **Step 1: Build a page that shows the panel without winning**

The results panel only appears after finishing a level, which no browser suite can do reliably. Rather than add a hook to the game — there is no test-only code in the game, and there is not going to be any — draw it in a tool, the way Taras Town's `tools/map.html` draws the whole town.

Create `games/pushkar-ball/tools/panels.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Pushkar Ball — panels</title>
  <style>
    body { margin: 0; padding: 20px; background: #223; color: #fff;
           font: 14px system-ui, sans-serif; }
    h1 { font-size: 16px; font-weight: 600; }
    .shot { margin: 18px 0; }
    .shot p { margin: 0 0 6px; opacity: 0.75; }
    canvas { background: #7ED957; border: 1px solid #556; display: block; }
  </style>
</head>
<body>
  <h1>The results panel, at every screen size the tests insist on</h1>
  <p>Nothing here is part of the game. It imports <code>ui.js</code> and
     <code>config.js</code> and draws the panel, so it can be judged by eye
     without finishing a level.</p>
  <div id="out"></div>

  <script type="module">
    import { CONFIG } from '../js/config.js';
    import { Panel } from '../js/ui.js';

    // The same three the offline suites use: the widest phone, an iPhone SE on
    // its side, and a short landscape window.
    const SCREENS = [[844, 390], [568, 320], [740, 280]];
    const out = document.getElementById('out');

    for (const [w, h] of SCREENS) {
      const wrap = document.createElement('div');
      wrap.className = 'shot';
      const label = document.createElement('p');
      label.textContent = `${w} x ${h}`;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      wrap.append(label, c);
      out.append(wrap);

      const ctx = c.getContext('2d');
      // A stand-in for the game behind it, so the panel's contrast can be
      // judged against grass and sky rather than against nothing.
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, CONFIG.COLOURS.SKY_TOP);
      sky.addColorStop(1, CONFIG.COLOURS.SKY_LOW);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = CONFIG.COLOURS.GROUND;
      ctx.fillRect(0, h * 0.72, w, h);

      Panel.draw(ctx, w, h, { level: 2, stars: 1 });

      // Ring the hit areas, so a button that is drawn in one place and tapped
      // in another shows up immediately.
      ctx.strokeStyle = 'rgba(255,0,255,0.55)';
      ctx.lineWidth = 1;
      for (const name of ['retry', 'home']) {
        const b = Panel[name](w, h);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * CONFIG.UI.HIT, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Write the tools README**

Create `games/pushkar-ball/tools/README.md`:

```markdown
# Tools

Nothing in here is part of the game. Nothing in here is loaded by the game.
These pages exist so that things can be judged by eye without playing through
to them, which is the alternative to putting test-only hooks in the game — and
there is no test-only code in the game.

Serve the repository root and open them from there, the same as the game:

```
python -m http.server 8778
```

| Page | What it is for |
|---|---|
| `panels.html` | The results panel at 844×390, 568×320 and 740×280, over grass and sky, with its tap areas ringed in magenta. Open it after any change to `Panel` in `js/ui.js`. |
| `deflate.html` | The ball drawn at several points through a deflate and a re-inflate, on a ground line, so the squash can be judged by eye. It exists because a falling death happens off the bottom of the screen and a spike death is not reachable by any browser suite, so this shape is otherwise never seen. Its arithmetic is asserted in `tests/offline/deflate.mjs`; this page is for whether it *looks* like a ball flattening onto a floor. Check the bottom edge stays on the ground line across every frame — Task 3 measured it holding to within half a pixel. |

The magenta rings are the hit radii `ui.js` reports, not the drawn circles. If a
ring is not concentric with the button under it, the panel is drawn in one place
and tapped in another — which fails silently in play, because the tap lands on
whatever is behind.
```

- [ ] **Step 3: Look at the panel**

Serve the repo root and open `http://127.0.0.1:8778/games/pushkar-ball/tools/panels.html`.

Check, at all three sizes: the panel is fully on screen; the three stars are inside it with the first filled; the level digit is legible; retry and home read as a curved arrow and a house and not as smudges; the magenta hit rings are concentric with the buttons; and the panel is legible against both the sky and the grass behind it.

- [ ] **Step 4: Run every suite and look at every screenshot**

```
node games/pushkar-ball/tests/run.mjs
```

Expected: fourteen suites ok — eleven offline, and `deflate`, `jump`, `roll`, `small` in the browser.

Then open every PNG in `games/pushkar-ball/tests/screenshots/` and judge it:

- `roll-1-spawn.png` — the ball clearly above the buttons, not tinted by one.
- `roll-3-stopped.png` — hills read as hills, the ball reads as a ball.
- `jump-2-after-the-run.png` — after a long jumpy run: whatever it shows, the ball should be somewhere sensible and at full size.
- `deflate-1-gone.png` — a dimmed screen with no ball, over the gap.
- `deflate-2-back.png` — the ball back at the start, full size, screen no longer dim.
- `small-568x320-2-playing.png` and `small-740x280-2-playing.png` — all three controls on screen, the ball clear of them.

Specifically look for: a spike patch that reads as spikes and not as grey mush; checkpoint flags distinguishable from the goal flag; and the ball's squash pointing the right way if you catch one mid-deflate.

- [ ] **Step 5: Play it**

Serve the root and play `http://127.0.0.1:8778/games/pushkar-ball/index.html` with a keyboard, and with a thumb if you can.

Walk the whole thing: reach a checkpoint and see it turn green; die on the spikes in level 3 and confirm you come back to the checkpoint and not to the start; shove level 2's crate under the ledge and get up it; reach a flag and let the panel take you into the next level without touching anything; reach a flag and press retry instead; reach the last level's flag and confirm it does not promise a fourth level.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/tools
git commit -m "Add a tool that draws the results panel, so it can be judged by eye

The panel only appears after finishing a level, which no browser suite can do
reliably. The alternative to a hook in the game is a tool outside it — the same
answer Taras Town reached with tools/map.html — because there is no test-only
code in the game and there is not going to be any.

It rings each button's hit radius as ui.js reports it, not the drawn circle. A
ring that is not concentric with the button under it means the panel is drawn
in one place and tapped in another, which fails silently in play: the tap lands
on whatever is behind."
```

---

## Task 8: The documentation, and both suites

**Files:**
- Modify: `games/pushkar-ball/README.md`
- Modify: `games/pushkar-ball/tests/README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`

- [ ] **Step 1: Update the game's README**

In `games/pushkar-ball/README.md`:

- The opening paragraph gains spikes and checkpoints.
- "What is here, and what is not" changes from phase 1 to phase 2: three levels, spikes, checkpoints, the flag that ends a level and runs into the next. Still absent: enemies, gems, saws, crushers, the factory, levels four and five, a menu, level select, pause, saving, audio. Say plainly that **the flag is silent until phase 4**.
- The module table gains `js/hazards.js` (canvas only) and notes that `camera.js`, `levels.js`, `player.js` grew.
- A new **Failing** section: no lives; the deflate; `home` and checkpoints; that the ball is not simulated at all while dying, and why each of gravity, input and resolution had to be excluded; that `die` is ignored while already dying because a ball killed by a spike is still on that spike.
- A new **Hazards** section: a hazard is not a collider and never becomes a segment; the hit box is smaller than the picture and why; spikes are steel because of `IS_BALL`; saws and crushers are phase 3.
- A new **Winning** section: the flag, the panel, auto-advance, the two buttons, `nextLevel` returning null.
- The **Levels are data** block gains `checkpoints` and `spikes`.

- [ ] **Step 2: Update the tests README**

In `games/pushkar-ball/tests/README.md`, add rows for the five new suites — `camera`, `checkpoints`, `deflate` (offline), `hazards`, `progress` — and a row for `browser/deflate`. Add a line to the screenshots paragraph about `tools/panels.html` being where the results panel is judged, and why it exists rather than a hook in the game.

- [ ] **Step 3: Update CLAUDE.md**

In the **The shape of the thing — Pushkar Ball** section, add:

- **There are no lives.** Failing returns the ball to its `home` — the last checkpoint — for ever. That is the only fail path, and both a hazard and falling out of the world go through the same `die`.
- **While the ball is dying it is not simulated at all**, and the input is still drained. Gravity would drag the squashed ball through the floor it died on; a held jump would otherwise fire the instant it came back.
- **`die` is ignored while already dying.** A ball killed by a spike is still sitting on that spike.
- **A hazard is never a collider.** It does not become a segment and the ball does not bounce off it. `hazards.js` has no connection to `physics.js`.
- **A hazard's hit box is smaller than its picture** (`SPIKE.FORGIVE`). Being killed by something you clearly touched is fair; being killed by something you clearly missed is not.
- **Hazards are checked before checkpoints**, so a checkpoint in a patch of spikes cannot be armed by the same step that kills you.
- **Nothing added to the world may be red.** Check any new colour against `IS_BALL` in `tests/browser/_helpers.mjs` by hand. Spikes are steel and checkpoint flags are green for exactly this reason.
- **`won` is latched.** Once the flag is touched the level is over.
- **The results panel's geometry is in `ui.js`**, like every button, and `buttons.mjs` holds it to the same standard on all three screens.
- **`tools/` is where anything is looked at that cannot be reached in a test.** There is no test-only code in the game.

In the **Tests** section, update Pushkar Ball's suite list to name the new offline suites.

- [ ] **Step 4: Sync the spec**

In `docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`:

- In the level-data block, move `saws` and `crushers` from `// phase 2` to `// phase 3`, and add `spikes` as phase 2. Add `checkpoints` with no phase marker, since it is phase 2 and now built.
- In **Phases**, note under phase 2 that only spikes were built, with the reason: levels one to three use no other hazard, and building one no level contains is building ahead.
- Note that levels one to three shipped with level one already carrying moving platforms, so the spec's original "three introduces moving platforms and spikes" became "three introduces spikes" — level one had the platforms from phase 1.

- [ ] **Step 5: Run everything, both games**

```
node games/pushkar-ball/tests/run.mjs
node games/taras-town/tests/run.mjs
```

Expected: all suites pass in both. Taras Town's must be run because `sw.js` changed, and both its `pwa` suites read that file. If its `pwa` suite fails on the precache count, the cause is the new `hazards.js` entry and the fix is in `sw.js`, not the test.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/README.md games/pushkar-ball/tests/README.md CLAUDE.md docs/superpowers/specs
git commit -m "Document phase 2: failing, hazards, and winning

Records the things that will cost an afternoon if rediscovered: that a hazard
is never a collider, that its hit box is smaller than its picture and why,
that the ball is not simulated at all while dying and that each of gravity,
input and resolution had to be excluded for its own reason, that die() is
ignored while already dying because a ball killed by a spike is still on that
spike, and that nothing added to the world may be red.

The spec is corrected where phase 2 diverged from it. Only spikes were built:
levels one to three use no other hazard, and building one no level contains is
building ahead. Saws and crushers move to phase 3 with the factory levels that
use them."
```

---

## Self-review

**Spec coverage for phase 2.** `hazards.js` with spikes (Task 4); checkpoints (Task 2); the deflate and respawn (Task 3); the goal's logic and a results panel (Task 5); advancing from one level into the next, with the results panel keeping a way out and the last level having nowhere to go (Task 5); levels one to three (Task 6, with level one gaining checkpoints); no lives (Task 2's rename and Task 3's single fail path); difficulty rising and never harsh, at most one new idea per level, and the safe rehearsal before the real ask (Task 6's level design and the assertions in Task 6 Step 1); checkpoints two or three at most and placed before hard stretches (Task 6, asserted in `levels.mjs`); the flag silent until phase 4 (stated in Tasks 5 and 8); every position from `ui.js` with no coordinate in a test (Task 5 Step 8); digits and pictures only (Task 5's panel — one digit, two picture buttons, three stars); the 568×320 and 740×280 way out (Task 1's camera suite and Task 5's panel checks in `buttons.mjs`).

**Deliberately deferred, and said so in the plan:** saws, crushers, enemies, gems, `effects.js`, the factory theme, levels four and five, a main menu, level select, pause, saving, and audio.

**Two deviations from the spec, both called out at the top and both to be written back into the spec in Task 8:** only spikes are built, because levels one to three use nothing else; and the results panel's way out is retry and hub rather than a grid button to a level select that does not exist until phase 4.

**Placeholder scan.** Every code step carries the code. Task 8's four documentation steps describe content rather than showing final prose, which is correct for prose that has to match the voice of a file the writer is editing — but each one enumerates exactly which facts must appear, so nothing is left to invention.

**Type consistency.** `ball.home` is `{x, y}` and is read in `respawn` and written in `update`'s checkpoint block. `ball.deaths` replaces `ball.falls` everywhere: `player.js`, `main.js`, `crates.mjs`, `checkpoints.mjs`, `hazards.mjs`, `levels.mjs`. `ball.dying` and `ball.reviving` are seconds, set in `die`/`update` and read in `main.js`'s `drawBall` and dim. `ball.won` is a latched boolean read by `main.js`. `level.checkpoints` is `[{x, y, taken}]`; `level.takeCheckpoint(ball)` returns a checkpoint or null; `level.spikes` is `[{x, y, w}]`; `level.hitsHazard(ball)` takes anything with `x`, `y`, `r` — which is what lets `levels.mjs` pass a fat probe. `spikeBox(s, cfg)` returns `{x, y, w, h}` and is used by `hitsSpikes` and asserted directly in `hazards.mjs`. `nextLevel(index)` returns a number or null, used in `main.js`'s `handlePanel` and asserted in `progress.mjs`. `Panel.box/retry/home(w, h)` return `{x, y, w, h}` and `{x, y, r}`, matching `Buttons`' shape, and `Panel.at(px, py, w, h)` returns `'retry' | 'home' | null`. `Panel.draw(ctx, w, h, {level, stars})` is called from `main.js` and `tools/panels.html` with the same shape. `input.takeTap()` returns `{x, y}` or null.

**One ordering note for the executor.** Task 2's checkpoint suite waits out a deflate, so it needs `CONFIG.DEFLATE`, which Task 3 Step 3 adds. Task 2 Step 9 says so. If you are running tasks strictly in order, add the `DEFLATE` block when Task 2 asks for it rather than treating it as a failure.
