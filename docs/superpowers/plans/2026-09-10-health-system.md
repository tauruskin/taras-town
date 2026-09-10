# Health System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pushkar Ball's "any hazard touch is an instant relocate" fail model with a three-heart health system — a spike, an enemy (once they exist), or a fall each cost one heart with a moment of invincibility after; only running out sends the ball all the way back to the level's start, with hearts refilled on arrival; checkpoints gain a second job of refilling hearts when passed.

**Architecture:** Almost everything lives in `js/player.js`, on the `Ball` class, which already owns `die()`/`respawn()`/`squash()` for the existing fail model — this plan replaces those methods rather than adding a parallel system. `js/hazards.js` gains a way to report *which* spike was hit (for knockback direction) alongside its existing yes/no test. `js/levels.js` and `js/ui.js` each gain one small addition (a knockback-direction query, and the hearts HUD). No new files except two test suites and this plan's own doc; `js/config.js` gains the tunable numbers, as it does for everything else in this game.

**Tech Stack:** Vanilla ES modules, no dependencies, matching the rest of the repo. Node's built-in test runner pattern already used throughout `tests/offline/`.

**Scope note:** This is Phase A of `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md` — the health system only. Enemies and the level-2 curriculum reshuffle (crates moving to level 3, spikes to a new level 4) are deliberately **out of scope** here and will be their own plan once this one is built and played, per that spec's own phasing.

---

## Before you start

Read these first; every task below assumes you already know them:

- `games/pushkar-ball/js/player.js` — the `Ball` class this plan rewrites most of.
- `games/pushkar-ball/js/config.js` — every tunable number in the game; this is the only place new numbers go.
- `games/pushkar-ball/js/hazards.js` — spike geometry; small addition here.
- `games/pushkar-ball/js/levels.js` — the `Level` class; small addition here.
- `games/pushkar-ball/js/ui.js` — the screen-space layer (buttons, results panel); the hearts HUD goes here, following `Panel`'s existing pattern exactly.
- `games/pushkar-ball/tests/offline/hazards.mjs`, `checkpoints.mjs`, `deflate.mjs`, `buttons.mjs` — existing suites this plan edits or extends.
- `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md` — the approved design this plan implements.

Run `node games/pushkar-ball/tests/run.mjs offline` once before starting, to confirm the baseline is green.

---

### Task 1: Health config, and the hearts/hit/die/respawn rewrite

**Files:**
- Modify: `games/pushkar-ball/js/config.js:189-190` (insert a new `HEALTH` block)
- Modify: `games/pushkar-ball/js/player.js:15-107` (constructor fields, `respawn()`, `die()`; new `hit()`, `_loseHeart()`, `_relocate()`)
- Modify: `games/pushkar-ball/js/player.js:154-164` (i-frame decrement in `update()`)
- Create: `games/pushkar-ball/tests/offline/health.mjs`

- [ ] **Step 1: Write the first three health checks (they will fail — nothing exists yet)**

Create `games/pushkar-ball/tests/offline/health.mjs`:

```js
// The health system: hearts, invincibility after a hit, and what happens
// when they run out. hazards.mjs proves a spike touch correctly calls into
// this; this suite proves the hearts arithmetic itself by calling `hit()`
// and `die()` directly, so nothing here depends on rolling into anything or
// on knockback physics settling anywhere in particular.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({ left: false, right: false, takeJump: () => false });

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

const world = (checkpoints) => loadLevel({
  id: 96, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [], platforms: [],
  checkpoints: checkpoints || [],
});

// --- 1. a fresh ball starts at full hearts, no invincibility -------------
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  console.log(`\n1. a fresh ball has ${ball.hearts} heart(s), iframe=${ball.iframe}, hits=${ball.hits}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`starts with ${ball.hearts} hearts, expected ${CONFIG.HEALTH.HEARTS}`);
  if (ball.iframe !== 0) fail(`starts with ${ball.iframe}s of invincibility, expected 0`);
  if (ball.hits !== 0) fail(`starts with ${ball.hits} hits, expected 0`);
}

// --- 2. a hit with hearts to spare knocks back and stays in play ---------
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  ball.hit(1);
  console.log(`\n2. hit once: hearts=${ball.hearts}, hits=${ball.hits}, vx=${ball.vx}, vy=${ball.vy}, deaths=${ball.deaths}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 1) fail(`hearts went to ${ball.hearts}, expected ${CONFIG.HEALTH.HEARTS - 1}`);
  if (ball.hits !== 1) fail(`hits is ${ball.hits}, expected 1`);
  if (ball.deaths !== 0) fail('a hit with hearts to spare must not relocate the ball');
  if (ball.dying !== 0) fail('a hit with hearts to spare must not start a deflate');
  if (ball.vx !== CONFIG.HEALTH.KNOCKBACK) fail(`vx is ${ball.vx}, expected exactly ${CONFIG.HEALTH.KNOCKBACK} (knockDir was 1)`);
  if (ball.vy !== -CONFIG.HEALTH.KNOCKBACK_UP) fail(`vy is ${ball.vy}, expected exactly ${-CONFIG.HEALTH.KNOCKBACK_UP}`);
  if (ball.iframe !== CONFIG.HEALTH.IFRAME) fail(`iframe is ${ball.iframe}, expected ${CONFIG.HEALTH.IFRAME}`);
}

// --- 3. invincibility blocks a second hit, and it expires -----------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  ball.hit(1);
  ball.hit(1);   // same instant: must be ignored
  console.log(`\n3. hit twice with no time between: hearts=${ball.hearts}, hits=${ball.hits}`);
  if (ball.hits !== 1) fail(`a second hit inside the invincibility window counted anyway: hits=${ball.hits}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 1) fail(`hearts changed on the blocked hit: ${ball.hearts}`);

  run(ball, level, input, CONFIG.HEALTH.IFRAME + 0.05);
  if (ball.iframe !== 0) fail(`invincibility did not run out: iframe=${ball.iframe}`);
  ball.hit(1);
  console.log(`   after it wore off: hearts=${ball.hearts}, hits=${ball.hits}`);
  if (ball.hits !== 2) fail(`a hit after invincibility wore off did not count: hits=${ball.hits}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 2) fail(`hearts is ${ball.hearts}, expected ${CONFIG.HEALTH.HEARTS - 2}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL HEALTH CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

Run: `node games/pushkar-ball/tests/run.mjs offline/health`
Expected: a thrown error — `CONFIG.HEALTH` is undefined (`ball.hearts`/`ball.hit` do not exist yet).

- [ ] **Step 3: Add the `HEALTH` config block**

In `games/pushkar-ball/js/config.js`, between the end of the `DEFLATE` block and the start of the `SPIKE` block (i.e. immediately after the line `INFLATE_FROM: 0.25,` and its closing `},`), insert:

```js
  // ---------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------
  // Three hearts, replacing "any hazard touch is instant" for spikes and
  // falling out of the level (and, once they exist, enemies) — added Sep
  // 2026 once this game's audience became 12, not 6. See
  // docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md.
  HEALTH: {
    HEARTS: 3,
    // Seconds of invincibility after a hit. Without it, rolling across a
    // spike patch at speed — many steps of contact in a row — could drain
    // every heart from a single mistake before the ball is even clear of it.
    IFRAME: 0.5,
    // A non-fatal hit's knockback, in px/s: away from whatever was touched,
    // horizontally, plus a small upward bump so it reads as a hop rather
    // than a shove — a purely horizontal knock is easy to miss at a glance.
    KNOCKBACK: 260,
    KNOCKBACK_UP: 200,
  },

```

- [ ] **Step 4: Add the constructor fields**

In `games/pushkar-ball/js/player.js`, the constructor currently has:

```js
    // Where a respawn puts the ball: the spawn to begin with, then the last
    // checkpoint reached. Set by whoever constructs the ball, because the ball
    // is handed its position and not the level.
    this.home = { x, y };

    // Every way of failing, counted together. This used to be `falls`, when
    // falling out of the world was the only way to fail; a hazard is not a
    // fall, and two counters for one idea is how they drift apart.
    this.deaths = 0;
  }
```

Replace it with:

```js
    // Where a respawn puts the ball: the spawn to begin with, then the last
    // checkpoint reached. Set by whoever constructs the ball, because the ball
    // is handed its position and not the level.
    this.home = { x, y };
    // The level's actual start, fixed for the ball's whole life — unlike
    // `home`, this never moves to a checkpoint. It exists so that running out
    // of hearts can send the ball all the way back, distinctly from the
    // ordinary "back to the last checkpoint" a single fall still causes.
    this.spawn = { x, y };

    // Every way of failing that actually RELOCATES the ball, counted
    // together — a fall, or running out of hearts. This used to be `falls`,
    // when falling out of the world was the only way to fail; a hazard used
    // to relocate the ball too, and now it usually does not, which is what
    // `hits` below is for.
    this.deaths = 0;

    // Hearts, and every way they are spent. `hits` counts every one, whether
    // or not it emptied the last heart; `deaths` above counts only the
    // relocations. A fresh level, or a relocation once hearts hit zero,
    // refills `hearts` to CONFIG.HEALTH.HEARTS — see `respawn()`.
    this.hearts = CONFIG.HEALTH.HEARTS;
    this.hits = 0;
    this.iframe = 0;          // seconds of invincibility left after a hit
    // Set the instant hearts reach zero, and read (then cleared) by
    // `respawn()` to decide whether to come back at the checkpoint or at the
    // level's own start.
    this.zeroHearts = false;
  }
```

- [ ] **Step 5: Rewrite `respawn()`, and replace `die()` with `die()` / `hit()` / the shared helpers**

Replace the whole of the existing `respawn()` and `die()` methods (from the `/**\n   * Send the ball back to its home...` doc comment through the closing `}` of `die()`) with:

```js
  /**
   * Send the ball back to its home — the checkpoint, or, once hearts have run
   * out, the level's own start — and refill hearts if that is why it is here.
   *
   * Every piece of carried state has to go, not just position. A leftover
   * upward velocity launches the ball off the respawn point; a leftover jump
   * in `buffer` fires the instant it lands; a leftover `platform` makes it
   * ride a platform elsewhere in the level.
   */
  respawn() {
    const target = this.zeroHearts ? this.spawn : this.home;
    this.x = target.x;
    this.y = target.y;
    this.vx = 0; this.vy = 0;
    this.spin = 0;
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.platform = null;
    this.dying = 0;
    this.reviving = 0;
    this.iframe = 0;
    if (this.zeroHearts) {
      this.hearts = CONFIG.HEALTH.HEARTS;
      this.zeroHearts = false;
    }
  }

  /**
   * Lose a heart, if the ball is not currently invincible, already relocating,
   * or has already won. Returns whether a heart was actually lost.
   *
   * The shared gate under `hit()` and `die()`: without it, a ball still
   * overlapping whatever hit it last — a spike it is deflating on top of, the
   * bottom of the world it fell through — would keep losing hearts every
   * single step.
   */
  _loseHeart() {
    if (this.won) return false;
    if (this.dying > 0) return false;
    if (this.iframe > 0) return false;
    this.hearts--;
    this.hits++;
    this.iframe = CONFIG.HEALTH.IFRAME;
    return true;
  }

  /** Begin the squash-and-respawn sequence. `toSpawn` sends it to the level's own start instead of the last checkpoint, and is what a zero-heart fail asks for. */
  _relocate(toSpawn) {
    this.dying = CONFIG.DEFLATE.TIME;
    this.reviving = 0;
    this.vx = 0; this.vy = 0;
    this.zeroHearts = toSpawn;
    this.deaths++;
  }

  /**
   * The ball has left the play space — fallen out of the level — and must
   * physically relocate. Costs a heart like anything else, but unlike `hit`
   * there is no "recover in place" available: the ball is gone from the
   * world, so it always relocates, whether or not that heart was its last.
   */
  die() {
    if (!this._loseHeart()) return;
    this._relocate(this.hearts <= 0);
  }

  /**
   * Touched a spike (and, once they exist, an enemy) while still inside the
   * level. With hearts left, this is a flash and a knockback and the ball
   * stays in play under control; at zero hearts it is the same full
   * relocation a fall causes, back to the level's start rather than a
   * checkpoint.
   *
   * @param knockDir -1 or 1: which way to push the ball, away from whatever
   *                  it touched.
   */
  hit(knockDir) {
    if (!this._loseHeart()) return;
    if (this.hearts <= 0) this._relocate(true);
    else {
      this.vx = knockDir * CONFIG.HEALTH.KNOCKBACK;
      this.vy = -CONFIG.HEALTH.KNOCKBACK_UP;
    }
  }
```

- [ ] **Step 6: Decrement invincibility in `update()`**

In `games/pushkar-ball/js/player.js`, find:

```js
    if (this.reviving > 0) this.reviving = Math.max(0, this.reviving - dt);
```

Replace with:

```js
    if (this.reviving > 0) this.reviving = Math.max(0, this.reviving - dt);
    if (this.iframe > 0) this.iframe = Math.max(0, this.iframe - dt);
```

- [ ] **Step 7: Run the first three checks and confirm they pass**

Run: `node games/pushkar-ball/tests/run.mjs offline/health`
Expected: `ALL HEALTH CHECKS PASSED` (exit 0).

- [ ] **Step 8: Add the zero-hearts, re-trigger-guard, and fall-parity checks**

Append to `games/pushkar-ball/tests/offline/health.mjs`, before the final `console.log(failures ? ...)` line:

```js
// --- 4. the third hit exhausts hearts and sends the ball to the level's
// START, not the last checkpoint — and refills on arrival ----------------
{
  const level = world([{ x: 900, y: 760 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  input.right = true;
  run(ball, level, input, 2.0);          // past the checkpoint
  input.right = false;
  if (!level.checkpoints[0].taken) fail('the checkpoint was never reached, so this proves nothing');
  const home = { ...ball.home };
  const spawn = { ...ball.spawn };
  if (home.x === spawn.x) fail('home and spawn are the same point, so this cannot tell them apart');

  for (let i = 0; i < CONFIG.HEALTH.HEARTS; i++) {
    ball.hit(1);
    run(ball, level, stub(), CONFIG.HEALTH.IFRAME + 0.05);
  }
  console.log(`\n4. after ${CONFIG.HEALTH.HEARTS} hits: hearts=${ball.hearts}, deaths=${ball.deaths}, ` +
              `x=${ball.x.toFixed(0)} (spawn ${spawn.x}, checkpoint home ${home.x})`);
  if (ball.deaths !== 1) fail(`exhausting hearts should relocate exactly once; deaths=${ball.deaths}`);
  if (Math.abs(ball.x - spawn.x) > 5) fail(`came back at x=${ball.x.toFixed(0)}, not the level's start at ${spawn.x}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`hearts did not refill on arrival: ${ball.hearts}`);
}

// --- 5. a hit while already relocating does not count a second time -----
//
// The same guard `die()` has always needed, carried over: a ball mid-deflate
// is still overlapping whatever hit it last, and without this the relocate
// would re-trigger every step and never finish.
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  ball.hearts = 1;
  ball.hit(1);
  const deathsAfterFirst = ball.deaths;
  for (let i = 0; i < 10; i++) ball.hit(1);
  console.log(`\n5. ten more hits during a relocate: deaths went ${deathsAfterFirst} -> ${ball.deaths}`);
  if (ball.deaths !== deathsAfterFirst) fail(`a hit during a relocate counted again: ${deathsAfterFirst} -> ${ball.deaths}`);
}

// --- 6. falling behaves the same way: costs a heart, and only exhausting
// them sends the ball to the start rather than the last checkpoint -------
{
  const level = world([{ x: 900, y: 760 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  input.right = true;
  run(ball, level, input, 2.0);
  input.right = false;
  const home = { ...ball.home };

  ball.die();
  run(ball, level, input, CONFIG.DEFLATE.TIME + CONFIG.DEFLATE.INFLATE + 0.5);
  console.log(`\n6. one fall: hearts=${ball.hearts}, deaths=${ball.deaths}, x=${ball.x.toFixed(0)} (checkpoint ${home.x})`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 1) fail(`a fall did not cost a heart: ${ball.hearts}`);
  if (ball.deaths !== 1) fail(`a fall with hearts to spare should still relocate once; deaths=${ball.deaths}`);
  if (Math.abs(ball.x - home.x) > 5) fail(`a fall with hearts to spare went to x=${ball.x.toFixed(0)}, not the checkpoint at ${home.x}`);
}
```

- [ ] **Step 9: Run the whole suite and confirm all six checks pass**

Run: `node games/pushkar-ball/tests/run.mjs offline/health`
Expected: `ALL HEALTH CHECKS PASSED` (exit 0).

- [ ] **Step 10: Run the full offline suite to check nothing else broke**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite passes. (`hazards.mjs` is expected to still be green here too — its check 3 still calls the old `die()`-based scenario, which Task 2 rewrites; a hazard touch under the new `hit()` no longer sets `ball.deaths`, but check 3's own assertion was `ball.deaths !== 1` as a FAIL condition — read it carefully: if it is failing at this step, that is Task 2's job to fix next, not a sign this task is wrong. If it fails, leave it and proceed to Task 2, which addresses it directly.)

- [ ] **Step 11: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/player.js games/pushkar-ball/tests/offline/health.mjs
git commit -m "$(cat <<'EOF'
Add the hearts/hit/die core of the health system

Three hearts, invincibility after a hit, and a zero-hearts fail that sends
the ball to the level's own start with hearts refilled rather than to the
last checkpoint. die() and respawn() are rewritten rather than duplicated
for this; hit() is the new non-fatal path a hazard touch will call into.

Part of docs/superpowers/plans/2026-09-10-health-system.md, Task 1.
EOF
)"
```

---

### Task 2: Wire spikes into hearts, and rework `hazards.mjs`

**Files:**
- Modify: `games/pushkar-ball/js/hazards.js:41-74` (add `spikeHit`; keep `hitsSpikes` as a thin wrapper)
- Modify: `games/pushkar-ball/js/levels.js:15-21` (import), `:587-599` (add `hazardKnockDir` beside `hitsHazard`)
- Modify: `games/pushkar-ball/js/player.js:285-292` (the hazards section of `update()`)
- Modify: `games/pushkar-ball/tests/offline/hazards.mjs` (rewrite check 3, remove check 6, add one line each to checks 4 and 5)

- [ ] **Step 1: Add `spikeHit`, and make `hitsSpikes` call it**

In `games/pushkar-ball/js/hazards.js`, replace:

```js
export function hitsSpikes(body, spikes, cfg) {
  const r = Math.max(0, body.r - cfg.SPIKE.FORGIVE);
  for (const s of spikes) {
    if (circleHitsBox(body.x, body.y, r, spikeBox(s, cfg))) return true;
  }
  return false;
}
```

with:

```js
/**
 * Which spike patch this body is touching, or null. The same forgiveness as
 * `hitsSpikes` below — see the comment on `FORGIVE` in config.js — but
 * returning the patch itself rather than a boolean, so a caller can work out
 * which way to knock the ball back.
 */
export function spikeHit(body, spikes, cfg) {
  const r = Math.max(0, body.r - cfg.SPIKE.FORGIVE);
  for (const s of spikes) {
    if (circleHitsBox(body.x, body.y, r, spikeBox(s, cfg))) return s;
  }
  return null;
}

export function hitsSpikes(body, spikes, cfg) {
  return !!spikeHit(body, spikes, cfg);
}
```

- [ ] **Step 2: Add `Level.hazardKnockDir`**

In `games/pushkar-ball/js/levels.js`, the import line currently reads:

```js
import { hitsSpikes } from './hazards.js';
```

Change it to:

```js
import { hitsSpikes, spikeHit } from './hazards.js';
```

Then, immediately after the existing `hitsHazard(body)` method on `Level` (the one ending `return hitsSpikes(body, this.spikes, CONFIG); }`), add:

```js

  /**
   * If this body is touching a hazard, which way to knock it — away from
   * whatever it touched, as -1 or 1, never 0. Null if nothing was touched.
   *
   * One question for the whole level, the same shape as `hitsHazard`, so
   * that when enemies arrive the caller in player.js does not have to learn
   * a second hazard type.
   */
  hazardKnockDir(body) {
    const s = spikeHit(body, this.spikes, CONFIG);
    if (!s) return null;
    const mid = s.x + s.w / 2;
    return body.x >= mid ? 1 : -1;
  }
```

- [ ] **Step 3: Call it from `player.js`**

In `games/pushkar-ball/js/player.js`, find the hazards section of `update()`:

```js
    if (level.hitsHazard(this)) this.die();
```

Replace with:

```js
    const knock = level.hazardKnockDir(this);
    if (knock !== null) this.hit(knock);
```

(Leave the comment block above this line as it is — it is still accurate: hazards are still checked after movement and before checkpoints, for the same reasons it already gives.)

- [ ] **Step 4: Rewrite `hazards.mjs` check 3**

In `games/pushkar-ball/tests/offline/hazards.mjs`, replace the entire `--- 3. rolling into them kills` block with:

```js
// --- 3. one touch costs exactly one heart, and knocks back --------------
//
// Rewritten Sep 2026 for the health system: a hazard touch is no longer an
// instant relocate (see player.js's `hit`) — it costs a heart and knocks the
// ball back, and it takes losing all three hearts before anything relocates
// at all. The old version of this check drove the ball into the patch and
// waited for `deaths` to become 1, which would now depend on how many times
// the knockback lets it drift back in before invincibility runs out — timing
// this suite has no business depending on. So: stop at the first HIT
// instead, which happens on a known step regardless of what comes after it.
{
  const patch = { x: 800, y: 760, w: 160 };
  const level = world([patch]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  let steps = 0;
  const limit = Math.round(4 / CONFIG.STEP);
  while (ball.hits === 0 && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;

  console.log(`\n3. touched the patch after ${(steps * CONFIG.STEP).toFixed(2)}s at x=${ball.x.toFixed(2)};` +
              ` hearts ${CONFIG.HEALTH.HEARTS} -> ${ball.hearts}, vx=${ball.vx.toFixed(0)}, vy=${ball.vy.toFixed(0)}`);
  if (ball.hits !== 1) fail(`never touched the patch at all within ${(limit * CONFIG.STEP).toFixed(1)}s`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 1) {
    fail(`one touch left ${ball.hearts} hearts, expected ${CONFIG.HEALTH.HEARTS - 1}`);
  }
  if (ball.deaths !== 0) fail(`one touch with hearts to spare should not relocate the ball; deaths=${ball.deaths}`);
  // Knocked BACK, not forward: the ball approached from the left, so it must
  // be pushed further left (and a little up), away from the patch it hit.
  if (ball.vx !== -CONFIG.HEALTH.KNOCKBACK) fail(`vx after the hit is ${ball.vx}, expected exactly ${-CONFIG.HEALTH.KNOCKBACK}`);
  if (ball.vy !== -CONFIG.HEALTH.KNOCKBACK_UP) fail(`vy after the hit is ${ball.vy}, expected exactly ${-CONFIG.HEALTH.KNOCKBACK_UP}`);
}
```

- [ ] **Step 5: Add one assertion each to checks 4 and 5**

In check 4 (`rolling past where they are NOT does not kill`), find:

```js
  if (ball.deaths !== 0) fail('died without reaching the spikes at all');
```

and add directly beneath it:

```js
  if (ball.hits !== 0) fail('took a hit without reaching the spikes at all');
```

In check 5 (`jumping over them survives`), find:

```js
  if (ball.deaths > 0) fail(`jumping over a 90px spike patch still died ${ball.deaths} time(s)`);
```

and add directly beneath it:

```js
  if (ball.hits > 0) fail(`jumping over a 90px spike patch still took ${ball.hits} hit(s)`);
```

- [ ] **Step 6: Remove check 6**

Delete the entire `--- 6. dying on spikes finishes deflating and comes back ---------------` block from `hazards.mjs` — from its comment header through the closing `}` before the final `console.log(failures ? ...)` line. Its purpose (proving a relocate-in-progress cannot re-trigger while the ball still overlaps whatever caused it) is now proven directly and more robustly in `health.mjs` check 5, by calling `hit()` repeatedly with no physics or knockback timing involved. Leave a one-line comment in its place:

```js
// Check 6 used to live here ("dying on spikes finishes deflating and comes
// back"). Its guard is now proven directly in health.mjs check 5, without
// depending on knockback physics happening to drift the ball back into the
// patch a specific number of times — see that file for why.
```

- [ ] **Step 7: Run the affected suites**

Run: `node games/pushkar-ball/tests/run.mjs offline/hazards`
Expected: `ALL HAZARD CHECKS PASSED`.

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite passes, including `levels.mjs` (its own hazard checks call `hitsHazard`, which is unchanged in behavior).

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/js/hazards.js games/pushkar-ball/js/levels.js games/pushkar-ball/js/player.js games/pushkar-ball/tests/offline/hazards.mjs
git commit -m "$(cat <<'EOF'
Wire spike contact into the health system

A spike touch now calls Ball.hit() with a knockback direction derived from
which side of the patch the ball is on, instead of an instant die(). Rewrote
hazards.mjs's check 3 to prove a single touch costs one heart and knocks
back rather than relocating; its old check 6 is superseded by a more direct
proof in health.mjs.

Part of docs/superpowers/plans/2026-09-10-health-system.md, Task 2.
EOF
)"
```

---

### Task 3: Checkpoints refill hearts

**Files:**
- Modify: `games/pushkar-ball/js/player.js:294-311` (the checkpoints section of `update()`)
- Modify: `games/pushkar-ball/tests/offline/checkpoints.mjs` (append check 7)

- [ ] **Step 1: Write the failing check**

Append to `games/pushkar-ball/tests/offline/checkpoints.mjs`, before the final `console.log(failures ? ...)` line:

```js
// --- 7. reaching a checkpoint refills hearts -----------------------------
//
// Added Sep 2026 with the health system: a checkpoint's job used to be only
// "where a fall sends the ball back to." It is now also "a clean slate" —
// damage taken on the way to it should not make the stretch AFTER it harder
// than the level intended.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);

  ball.hit(1);
  const heartsAfterHit = ball.hearts;
  if (heartsAfterHit >= CONFIG.HEALTH.HEARTS) fail('the hit did not actually cost a heart, so this proves nothing');

  input.right = true;
  run(ball, level, input, 2.0);   // past the first checkpoint at x=700
  input.right = false;

  console.log(`\n7. after a hit (hearts=${heartsAfterHit}) and reaching a checkpoint: hearts=${ball.hearts}`);
  if (!level.checkpoints[0].taken) fail('the checkpoint was never reached, so this proves nothing');
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`hearts did not refill at the checkpoint: ${ball.hearts}`);
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs offline/checkpoints`
Expected: FAIL — "hearts did not refill at the checkpoint" (still at 2, not 3).

- [ ] **Step 3: Refill hearts when a checkpoint is taken**

In `games/pushkar-ball/js/player.js`, find:

```js
    const reached = level.takeCheckpoint(this.x, this.y);
    if (reached) {
      this.home.x = reached.x;
      this.home.y = reached.y - this.r - C.CHECKPOINT.CLEARANCE;
    }
```

Replace with:

```js
    const reached = level.takeCheckpoint(this.x, this.y);
    if (reached) {
      this.home.x = reached.x;
      this.home.y = reached.y - this.r - C.CHECKPOINT.CLEARANCE;
      // A checkpoint is a clean slate as well as a place to come back to:
      // damage taken on the way here should not make the stretch ahead
      // harder than the level intended.
      this.hearts = C.HEALTH.HEARTS;
    }
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs offline/checkpoints`
Expected: `ALL CHECKPOINT CHECKS PASSED`.

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite passes.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/js/player.js games/pushkar-ball/tests/offline/checkpoints.mjs
git commit -m "$(cat <<'EOF'
Refill hearts at a checkpoint

Checkpoints keep their existing job of being the respawn point after a fall
and gain a second one: passing one now also tops hearts back up to full, so
damage taken early in a level doesn't quietly make its back half harder.

Part of docs/superpowers/plans/2026-09-10-health-system.md, Task 3.
EOF
)"
```

---

### Task 4: The hearts HUD

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (add `HEARTS_UI` after the `UI` block)
- Modify: `games/pushkar-ball/js/ui.js` (add `Hearts`, a `heart()` drawing helper, and `Overlay.flash`)
- Modify: `games/pushkar-ball/js/main.js` (draw the hearts; apply the flash to the ball)
- Modify: `games/pushkar-ball/tests/offline/buttons.mjs` (hearts stay on screen and clear of the controls)
- Create: no new files

- [ ] **Step 1: Write the failing geometry check**

In `games/pushkar-ball/tests/offline/buttons.mjs`, add this import alongside the existing one:

```js
const { Buttons, Panel } = await import('../../js/ui.js');
```

becomes:

```js
const { Buttons, Panel, Hearts } = await import('../../js/ui.js');
```

Then, inside the `for (const [w, h] of SCREENS) {` loop, immediately after the existing move/jump button on-screen checks (right after the `for (const [name, b] of Object.entries(all)) { ... }` block closes), add:

```js
  // The hearts HUD, top-left, one per CONFIG.HEALTH.HEARTS. On screen, and
  // clear of the control band below — Buttons.topEdge is exactly what the
  // camera already keeps the ball clear of, so the hearts hold to the same
  // line rather than a second number that could drift from it.
  for (let i = 0; i < CONFIG.HEALTH.HEARTS; i++) {
    const p = Hearts.at(i, w, h);
    if (p.x - CONFIG.HEARTS_UI.R < 0 || p.x + CONFIG.HEARTS_UI.R > w || p.y - CONFIG.HEARTS_UI.R < 0) {
      fail(`heart ${i} (${p.x.toFixed(0)},${p.y.toFixed(0)}) is off a ${w}x${h} screen`);
    }
    if (p.y + CONFIG.HEARTS_UI.R > Buttons.topEdge(w, h)) {
      fail(`heart ${i} at y=${p.y.toFixed(0)} reaches into the control band, which starts at ${Buttons.topEdge(w, h).toFixed(0)} on ${w}x${h}`);
    }
  }
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs offline/buttons`
Expected: a thrown error — `Hearts` is undefined.

- [ ] **Step 3: Add `HEARTS_UI` to config**

In `games/pushkar-ball/js/config.js`, immediately after the closing `},` of the `UI` block (the one with `BUTTON_R`, `JUMP_R`, `EDGE`, `GAP`, `HIT`), add:

```js

  // ---------------------------------------------------------------------
  // The hearts HUD
  // ---------------------------------------------------------------------
  // Top-left, out of the way of every thumb control, which all live along
  // the bottom. Reuses the results panel's star colours rather than
  // inventing a red or pink — the ball is the only red thing anywhere on
  // purpose (see COLOURS.BALL below), and a heart drawn in that family would
  // be picked up as a second ball by every browser suite that finds the ball
  // by its hue.
  HEARTS_UI: {
    R: 14,
    GAP: 10,      // between heart centres
    EDGE: 20,     // from the left edge of the screen
    TOP: 20,      // from the top of the screen
  },
```

- [ ] **Step 4: Add `Hearts` and the heart-drawing helper to `ui.js`**

In `games/pushkar-ball/js/ui.js`, add after the closing of the `Overlay` object (i.e. after its final `};`) and before the `Panel` object begins:

```js

/**
 * Hearts — the health HUD, top-left. Its geometry lives here for the same
 * reason every other on-screen position does: tests ask for it, and no test
 * may ever contain a coordinate.
 */
export const Hearts = {
  /** Where the i'th heart (0-indexed, filled from the left) sits. */
  at(i, w, h) {
    const H = CONFIG.HEARTS_UI;
    return { x: H.EDGE + H.R + i * (H.R * 2 + H.GAP), y: H.TOP + H.R };
  },

  /** Draw all of CONFIG.HEALTH.HEARTS, filled from the left up to `hearts`. */
  draw(ctx, w, h, hearts) {
    const C = CONFIG.COLOURS;
    for (let i = 0; i < CONFIG.HEALTH.HEARTS; i++) {
      const p = Hearts.at(i, w, h);
      heart(ctx, p.x, p.y, CONFIG.HEARTS_UI.R, i < hearts ? C.STAR_ON : C.STAR_OFF);
    }
  },
};

/** A simple heart: two lobes and a point, filled as one shape. */
function heart(ctx, cx, cy, r, colour) {
  ctx.beginPath();
  ctx.arc(cx - r * 0.5, cy - r * 0.3, r * 0.5, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.5, cy - r * 0.3, r * 0.5, 0, Math.PI * 2);
  ctx.moveTo(cx - r, cy - r * 0.1);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx + r, cy - r * 0.1);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs offline/buttons`
Expected: `ALL BUTTON CHECKS PASSED`.

- [ ] **Step 6: Add `Overlay.flash`, for the invincibility flicker**

Still in `games/pushkar-ball/js/ui.js`, inside the `Overlay` object, immediately after the `dim(ball) { ... }` method (before `drawDim`), add:

```js

  /**
   * How visible the ball should be while invincible after a hit, 0..1. 1
   * whenever nothing is happening.
   *
   * A step function rather than a fade: at CONFIG.HEALTH.IFRAME's half a
   * second, a fade barely reads at all, where an on/off flicker is what
   * tells a player "you cannot be hit again yet" in every game that has
   * i-frames.
   */
  flash(ball) {
    if (ball.iframe <= 0) return 1;
    const HZ = 8; // full flickers per second
    return Math.floor(ball.iframe * HZ * 2) % 2 === 0 ? 0.35 : 1;
  },
```

- [ ] **Step 7: Draw the hearts and apply the flash, in `main.js`**

In `games/pushkar-ball/js/main.js`, the import line currently reads:

```js
import { Buttons, Overlay, Panel } from './ui.js';
```

Change it to:

```js
import { Buttons, Overlay, Panel, Hearts } from './ui.js';
```

In `drawBall()`, find:

```js
  ctx.save();
  // Squash towards the ground it is lying on, not towards its own middle.
```

and change it to:

```js
  ctx.save();
  ctx.globalAlpha = Overlay.flash(ball);
  // Squash towards the ground it is lying on, not towards its own middle.
```

In `draw()`, find the line that draws the buttons or the results panel:

```js
  if (flow.mode === 'won') {
    Panel.draw(ctx, cssW, cssH, { level: level.data.id, stars: flow.stars });
  } else {
    Buttons.draw(ctx, cssW, cssH, input.held());
  }
```

Change it to also draw the hearts whenever the panel is not up (the hearts are part of play, not part of the results screen):

```js
  if (flow.mode === 'won') {
    Panel.draw(ctx, cssW, cssH, { level: level.data.id, stars: flow.stars });
  } else {
    Hearts.draw(ctx, cssW, cssH, ball.hearts);
    Buttons.draw(ctx, cssW, cssH, input.held());
  }
```

- [ ] **Step 8: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite passes.

- [ ] **Step 9: Look at it**

Run the existing browser suites once (they will produce screenshots that now include the hearts):

Run: `node games/pushkar-ball/tests/run.mjs browser`

Open a couple of the PNGs under `games/pushkar-ball/tests/screenshots/` and confirm by eye: three gold hearts, top-left, clear of everything else, and that a screenshot taken during a spike-touch flicker (if any land on one) does not show the ball fully invisible (0.35 alpha, not 0).

- [ ] **Step 10: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/ui.js games/pushkar-ball/js/main.js games/pushkar-ball/tests/offline/buttons.mjs
git commit -m "$(cat <<'EOF'
Draw the hearts HUD, and flicker the ball while invincible

Three heart icons, top-left, filled from the left and drawn in the results
panel's star colours rather than a new red-adjacent one — the ball is the
only red thing on screen on purpose, and the browser suites find it by hue.
Overlay.flash gives the same half-second invincibility window a visible
on/off flicker, the same arithmetic-not-drawing split Overlay.dim already
uses so it can be asserted in Node.

Part of docs/superpowers/plans/2026-09-10-health-system.md, Task 4.
EOF
)"
```

---

### Task 5: Verify the rest of the suite, and prove the zero-hearts path end to end

**Files:**
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (one additive check)
- No other files should need changes in this task — its job is to confirm that, and fix anything it finds.

- [ ] **Step 1: Run the full offline and browser suites**

Run: `node games/pushkar-ball/tests/run.mjs`

Expected: every suite passes, including `checkpoints.mjs`, `deflate.mjs` (offline), `levels.mjs`, `finish.mjs`, and `browser/deflate.mjs` — none of these were touched by Tasks 1-4, and none of their scenarios ever exhaust all three hearts (each drives at most one fall or is otherwise unrelated to hazards), so their existing assertions should hold unchanged under the new model. If anything here fails, read the failure closely before changing the test: it likely means an assumption in this plan about "a single hit behaves identically to the old instant-die model" was wrong somewhere, which is a real finding, not a flaky suite — see CLAUDE.md's "Tests are usually the thing that is wrong" section for how to tell the difference, and fix the actual cause rather than loosening the assertion.

- [ ] **Step 2: Add a zero-hearts-to-start proof, using a real level and the real route**

This is the one piece of coverage the design spec calls for that nothing above provides: proof that the zero-hearts path works inside an actual played level, not just via direct method calls on a bare `Ball`. Append to `games/pushkar-ball/tests/offline/finish.mjs`, before the final `console.log(failures ? ...)` line:

```js
// --- 4. exhausting hearts mid-level sends the ball back to its start ------
//
// Everything above proves a level can be finished without ever taking a hit.
// This proves the OTHER path is real too: play level one for real up to its
// first checkpoint, take three hits by hand (there are no enemies yet to
// supply them for real, and level one has no spikes before its checkpoint —
// see levels.js's own note on why), and confirm the ball comes back at the
// level's spawn with hearts refilled, not at the checkpoint it had already
// reached.
console.log('\n4. exhausting hearts mid-level');
{
  const data = LEVELS[0];
  const level = loadLevel(data);
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const input = { left: false, right: true, takeJump: () => false };
  const n = Math.round(30 / CONFIG.STEP);
  let i = 0;
  for (; i < n && !level.checkpoints[0].taken; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
  if (!level.checkpoints[0].taken) fail('level one: never reached its first checkpoint, so nothing was tested');
  else {
    const spawn = { ...ball.spawn };
    for (let h = 0; h < CONFIG.HEALTH.HEARTS; h++) {
      ball.hit(1);
      for (let s = 0; s < Math.round((CONFIG.HEALTH.IFRAME + 0.05) / CONFIG.STEP); s++) {
        level.update(CONFIG.STEP);
        ball.update(CONFIG.STEP, { left: false, right: false, takeJump: () => false }, level);
      }
    }
    console.log(`   after 3 hits past checkpoint 0: hearts=${ball.hearts}, x=${ball.x.toFixed(0)} (level start ${spawn.x})`);
    if (Math.abs(ball.x - spawn.x) > 5) fail(`came back at x=${ball.x.toFixed(0)}, not level one's own start at ${spawn.x}`);
    if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`hearts did not refill: ${ball.hearts}`);
  }
}
```

- [ ] **Step 3: Run it and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs offline/finish`
Expected: `EVERY LEVEL CAN BE FINISHED` — the new section 4 prints its own result above that line.

- [ ] **Step 4: Run the full suite once more**

Run: `node games/pushkar-ball/tests/run.mjs`
Expected: every suite passes.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/tests/offline/finish.mjs
git commit -m "$(cat <<'EOF'
Prove the zero-hearts path inside a real, played level

Everything else in finish.mjs proves a level can be finished without taking
a hit; this proves the other half of the health system is really wired up
end to end — exhausting hearts mid-level sends the ball back to the level's
own start with hearts refilled, not to the checkpoint it had already passed.

Part of docs/superpowers/plans/2026-09-10-health-system.md, Task 5.
EOF
)"
```

---

### Task 6: Update `CLAUDE.md` and the original design spec

**Files:**
- Modify: `CLAUDE.md` (the "Nothing scary" rule, hub-wide section)
- Modify: `docs/superpowers/specs/2026-09-08-pushkar-ball-design.md` ("Failing, and why nothing here is scary")

This task has no tests — it is documentation, matching the design spec's own "Changes to existing docs" section.

- [ ] **Step 1: Add the Pushkar-Ball-only exception to "Nothing scary"**

In `CLAUDE.md`, find the "Nothing scary" bullet in the "Rules for the whole hub" section:

```
- **Nothing scary.** No blood, no violence, no weapons, no fighting, no
  stealing, no realistic police or crime, no death imagery. Where a game can be
  failed at all, failing is harmless and instantly undone — in Pushkar Ball the
  ball simply deflates and reappears. Bright and friendly throughout. (This rule
  is about cruelty and fear, not about difficulty: a spike that pops a ball is
  inside it. An earlier wording forbade spikes outright, which was never the
  intent.)
```

Add a new paragraph directly after it, still inside the same bullet:

```

  **Pushkar Ball gets one narrow, named exception, added Sep 2026.** Its actual
  audience is 12, not 6 — unlike every other game here — and its enemies may
  look more menacing than "bright and friendly" implies: spikes, horns, jagged
  silhouettes, angry or narrowed eyes, bared teeth. Shape and expression only.
  **"No weapons" does not loosen for this exception.** No enemy holds or
  wields anything, in Pushkar Ball or anywhere else. This exception is
  Pushkar Ball's alone — Taras Town and any future game keep the 6-year-old
  reading of this rule exactly as written above, and a future game wanting the
  same latitude needs its own named exception, not an assumption that this one
  extends to it. See
  `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md`,
  "Content boundaries: what loosens, what doesn't."
```

- [ ] **Step 2: Supersede "There are no lives" in the original design spec**

In `docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`, find the paragraph beginning `**There are no lives.**` in the "Failing, and why nothing here is scary" section. Immediately after the paragraph that ends `...belong in the star rating, which rewards doing well rather than punishing doing badly.`, add:

```

**Superseded Sep 2026.** The three paragraphs above explain why phase 2
shipped with no lives at all, and the reasoning was sound for the audience
this game had then. Pushkar Ball's actual audience turned out to be 12, not
6, and at that age a game where nothing can really go wrong reads as boring
rather than safe. The shipped game now has a three-heart health system —
still drawn, never a digit, so "almost no text" still holds — where running
out sends the ball back to the level's own start with hearts refilled,
rather than ending a run or gating progress the way the rejected five-lives
draft above did. See
`docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md` for
the full reasoning and the design as built.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md "docs/superpowers/specs/2026-09-08-pushkar-ball-design.md"
git commit -m "$(cat <<'EOF'
Document the health system's two rule changes

CLAUDE.md's hub-wide "nothing scary" rule gets a narrow, named exception for
Pushkar Ball's older audience (no weapons still holds); the original design
spec's "there are no lives" section gets a note that it is superseded by the
shipped three-heart system, so a future reader does not find two documents
disagreeing with no explanation.

Part of docs/superpowers/plans/2026-09-10-health-system.md, Task 6.
EOF
)"
```

---

### Task 7: Full suite, deploy, and verify live

**Files:** none — this task runs commands and confirms behavior, it does not edit code.

- [ ] **Step 1: Run the full local suite**

Run: `node games/pushkar-ball/tests/run.mjs`
Expected: `all NN suites passed`.

`sw.js` and the root `index.html` are untouched by this plan, so Taras Town's suite does not need to run — per `CLAUDE.md`'s rule, that only applies to changes touching those two files.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Poll the deployed site until it has rebuilt**

Run (repeat every ~20s until it succeeds, GitHub Pages can take a few minutes):

```bash
curl -s https://tauruskin.github.io/taras-town/games/pushkar-ball/js/config.js | grep -c "HEALTH:"
```

Expected: `1`, once the deploy has rolled out (it will print `0` beforehand).

- [ ] **Step 4: Run the live browser suites**

Run: `node games/pushkar-ball/tests/run.mjs browser --live`
Expected: every browser suite passes against the deployed site.

- [ ] **Step 5: Report**

Summarize for the user: the health system is live, the hearts HUD is visible top-left, a spike touch now knocks back instead of an instant respawn, and exhausting all three hearts sends the ball to the level's own start with hearts refilled. Note explicitly that enemies and the level-2 curriculum reshuffle are a separate, upcoming plan (Phase B is the further-out obstacle types; the enemies/curriculum piece is the very next plan after this one, per the design spec's phasing) — not yet built, so level 2 still teaches crates today.

---

## Plan self-review notes

*(For whoever executes this plan: these are the author's own checks, already done — recorded here so a re-review is not needed unless something changes.)*

- **Spec coverage:** every element of the "Health system" section of `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md` has a task above — hearts count and drawing (Task 4), i-frames (Task 1), spike-touch knockback (Task 2), fall behavior (Task 1), zero-hearts-to-start with refill (Task 1, proven end-to-end in Task 5), checkpoints refilling hearts (Task 3), and the two documentation changes (Task 6). Enemies and the curriculum reshuffle are out of scope by design — see the header.
- **Placeholder scan:** no TBD/TODO; every step shows complete code, not a description of code.
- **Type/name consistency, checked across tasks:** `ball.hearts`, `ball.hits`, `ball.iframe`, `ball.spawn`, `ball.zeroHearts`, `ball.hit(knockDir)`, `ball.die()`, `Level.hazardKnockDir(body)`, `hazards.js`'s `spikeHit`, `CONFIG.HEALTH.{HEARTS,IFRAME,KNOCKBACK,KNOCKBACK_UP}`, `CONFIG.HEARTS_UI.{R,GAP,EDGE,TOP}`, and `ui.js`'s `Hearts.{at,draw}` / `Overlay.flash` are each introduced once (Task 1, 2, or 4) and used with the identical name and signature in every later task that reads them.
- **A risk worth naming for whoever executes this:** Task 5's verification step assumes several existing suites (`checkpoints.mjs`, offline `deflate.mjs`, `finish.mjs`, browser `deflate.mjs`) need zero code changes, based on the reasoning that none of their scenarios ever exhaust all three hearts. That reasoning was checked carefully against each suite's actual code while writing this plan, but it is a prediction, not something already run against the finished code — treat Task 5 Step 1 as a real check, not a formality, and if it turns up a surprise, fix the actual cause (see CLAUDE.md's "Tests are usually the thing that is wrong") rather than patching around it.
