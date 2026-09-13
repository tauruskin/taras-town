# Bounce Pad And Level Five Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounce-pad mechanic to Pushkar Ball (a trampoline that launches the ball on contact, no button press needed) and a new level 5 built around it — introducing the pad on open ground, then requiring it to clear a stone wall no ordinary jump can reach, while recombining every idea taught in levels 1-4.

**Architecture:** The pad is a new kind of solid object, structurally a box like a crate or wall, added to `Level` alongside them and tagged with an `owner` the same way movers already are. `player.js` gains one small post-resolution check — after `grounded`/`platform` are computed, same place the crate-push and checkpoint checks already live — that recognizes a pad contact and overrides the landing into a launch. No change to `physics.js`: resolution treats the pad as an ordinary box; only what happens *after* contact is special. Level 5 is pure data in `levels.js`, using only mechanics that already exist plus the new pad.

**Tech Stack:** Vanilla JS (ES modules), no build step. Tests run under plain node via `games/pushkar-ball/tests/run.mjs offline` (add `browser` or no filter to include the four browser suites).

**Spec:** `docs/superpowers/specs/2026-09-13-bounce-pad-and-level-five-design.md`

---

### Task 1: The bounce pad — config, engine plumbing, and its own test suite

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (new `BOUNCE` block)
- Modify: `games/pushkar-ball/js/levels.js` (new `pads` data + segment wiring)
- Modify: `games/pushkar-ball/js/player.js` (the bounce-on-contact check)
- Test: `games/pushkar-ball/tests/offline/pads.mjs` (new file)

- [ ] **Step 1: Write the failing test suite**

Create `games/pushkar-ball/tests/offline/pads.mjs`:

```javascript
// Bounce pads: landing on one launches the ball immediately, with no button
// press and no resting state. Every top contact bounces; nothing stands on
// a trampoline.
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

const GROUND_Y = 760;

/**
 * Flat ground with one pad on it, flush with the ground — `y` is the same
 * ground-anchor convention checkpoints and spikes already use, so a pad
 * placed at `{x, y: GROUND_Y, w}` sits exactly on a floor at GROUND_Y with
 * no step to climb.
 */
const world = (extra) => loadLevel({
  id: 98, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, GROUND_Y], [2000, GROUND_Y]]],
  boxes: [], platforms: [],
  pads: [{ x: 700, y: GROUND_Y, w: CONFIG.BOUNCE.W }],
  ...extra,
});

// --- 1. the loader builds a pad -------------------------------------------
{
  const level = world();
  console.log(`\n1. the level has ${level.pads.length} pad(s)`);
  if (level.pads.length !== 1) fail(`expected 1 pad, got ${level.pads.length}`);
  if (!level.pads[0].bounce) fail('a pad was built without its own bounce marker');
}

// --- 2. landing on top launches the ball, instantly, touching only vy ----
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);   // settle on the ground
  input.right = true;
  // By x=700 the ball has long since reached MAX_SPEED (420) from a standing
  // start 500 units back — v²/(2*ACCEL) = 420²/3200 = 55px of runway is all
  // it needs — so vx should already be flat against the cap and untouched
  // by the bounce, not still accelerating.
  let bounced = false, vxPrev = 0;
  for (let i = 0; i < Math.round(3.0 / CONFIG.STEP) && !bounced; i++) {
    level.update(CONFIG.STEP);
    vxPrev = ball.vx;
    ball.update(CONFIG.STEP, input, level);
    if (ball.vy <= -CONFIG.BOUNCE.V + 1) bounced = true;
  }
  if (!bounced) fail('2: the ball never bounced, so nothing below was tested');
  else {
    console.log(`\n2. bounced: vy=${ball.vy.toFixed(0)}, grounded=${ball.grounded}, ` +
                `platform=${!!ball.platform}, vx before/after=${vxPrev.toFixed(0)}/${ball.vx.toFixed(0)}`);
    if (Math.abs(ball.vy - (-CONFIG.BOUNCE.V)) > 1) fail(`vy is ${ball.vy.toFixed(1)}, expected exactly ${-CONFIG.BOUNCE.V}`);
    if (ball.grounded) fail('the ball reads as grounded the instant it bounced');
    if (ball.platform) fail('the ball is still carrying a platform reference right after bouncing');
    if (Math.abs(ball.vx - vxPrev) > 2) fail(`horizontal speed changed from ${vxPrev.toFixed(0)} to ${ball.vx.toFixed(0)} — a bounce must only touch vy`);
  }
}

// --- 3. it never becomes a resting place -----------------------------------
//
// Dropped straight down onto it, with no horizontal input to carry it away,
// the ball must keep bouncing rather than settle — "stand on a trampoline
// safely" is not how one behaves and would be a strange thing to teach.
{
  const level = world();
  const input = stub();
  const padMidX = level.pads[0].x + level.pads[0].w / 2;
  const ball = new Ball(padMidX, 300);
  let everGroundedOnPad = false;
  for (let i = 0; i < Math.round(6.0 / CONFIG.STEP); i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    if (ball.grounded && Math.abs(ball.x - padMidX) < level.pads[0].w) everGroundedOnPad = true;
  }
  console.log(`\n3. dropped straight onto the pad for 6s: ever came to rest on it = ${everGroundedOnPad}`);
  if (everGroundedOnPad) fail('the ball came to rest on top of the pad instead of bouncing again');
}

// --- 4. a stray coyote window cannot weaken the bounce ----------------------
//
// player.js resets coyote to 0 on a bounce for exactly this reason: without
// it, a jump pressed a step later could still fire (coyote was set to
// CONFIG.COYOTE the very frame the bounce happened, before being cleared)
// and overwrite the bounce's vy with the far weaker JUMP_V.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);
  input.right = true;
  let bounced = false;
  for (let i = 0; i < Math.round(3.0 / CONFIG.STEP) && !bounced; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    if (ball.vy <= -CONFIG.BOUNCE.V + 1) bounced = true;
  }
  if (!bounced) fail('4: the ball never bounced, so nothing was tested');
  else {
    console.log(`\n4. coyote right after the bounce: ${ball.coyote}`);
    if (ball.coyote !== 0) fail(`coyote is ${ball.coyote} right after a bounce, expected exactly 0`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BOUNCE PAD CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs pads`

Expected: a crash or FAIL — `CONFIG.BOUNCE` and `level.pads` don't exist yet,
so this should error out (e.g. `TypeError: Cannot read properties of
undefined (reading 'W')`) rather than print a clean failure. That's fine:
it proves the suite is exercising code that doesn't exist yet, which is
the point of this step.

- [ ] **Step 3: Add the `BOUNCE` config block**

In `games/pushkar-ball/js/config.js`, find the end of the `CHECKPOINT` block
(it closes with `FLAG_DROP: 26,\n  },` around line 150-151), and insert this
new block immediately after it, before the `// Failing` section comment:

```javascript
  // ---------------------------------------------------------------------
  // The bounce pad
  // ---------------------------------------------------------------------
  // A trampoline: landing on its top launches the ball straight up, no
  // button press needed and no timing window to miss. It cannot be stood
  // on — every contact bounces. V is chosen so it clears a wall no ordinary
  // jump can: JUMP_V's own 760 only ever reaches 131px, but V here reaches
  // roughly V² / (2·GRAVITY) ≈ 327px on its own — and that arithmetic was
  // checked by actually simulating a ball bouncing off a stand-in pad at a
  // stone wall, not trusted alone. See
  // docs/superpowers/specs/2026-09-13-bounce-pad-and-level-five-design.md.
  BOUNCE: {
    V: 1200,        // px/s upward impulse on contact
    W: 100,         // width, world units — a crate's own footprint
    // How far the pad's solid box extends DOWN from its ground anchor,
    // matching the moving platforms' own thickness. It is embedded in the
    // ground it sits on and only its top, flush with that ground, is ever
    // reachable — which is what lets a level place one directly in a
    // rolling path with no step to climb first.
    H: 28,
    POST_H: 20,           // drawn support posts, above the ground
    SQUASH: 0.5,          // fraction of drawn height it flattens to on contact
    // How long the whole squash-and-spring-back animation takes, drawn as a
    // straight-line ease from flattened back to full height. One number
    // rather than a separate squash/release pair: unlike the ball's own
    // deflate (which holds flat before swelling back), a trampoline starts
    // easing out immediately, so there is no separate "stay flat" phase to
    // give its own duration.
    SQUASH_TIME: 0.14,
  },
```

- [ ] **Step 4: Add `pads` to the `Level` class**

In `games/pushkar-ball/js/levels.js`, find this block inside the `Level`
constructor (around line 793-795):

```javascript
    this.walls = (data.boxes || []).filter((b) => !b.movable);
    this.crates = (data.boxes || []).filter((b) => b.movable).map(makeCrate);
    for (const b of this.walls) segs.push(...boxSegments(b.x, b.y, b.w, b.h));
```

Immediately after it (still before the `// Checkpoints are not colliders...`
comment that follows), insert:

```javascript

    // Bounce pads sit flush with the ground they stand on — `y` is the same
    // ground-anchor convention checkpoints and spikes already use — and the
    // pad's own solid box extends DOWN from it, into the ground, not up.
    // Rolling onto one is exactly as smooth as rolling onto ordinary ground:
    // no step, no jump needed to reach it. Only the top is ever reachable;
    // the rest is buried under the ground it sits on. Tagged with the pad
    // itself as `owner`, the same mechanism movers and crates already use,
    // which is how player.js tells "this contact is a pad" from an
    // ordinary wall.
    this.pads = (data.pads || []).map((p) => ({ x: p.x, y: p.y, w: p.w, bounce: true, squashT: 0 }));
    for (const p of this.pads) {
      const padSegs = boxSegments(p.x, p.y, p.w, CONFIG.BOUNCE.H);
      for (const s of padSegs) s.owner = p;
      segs.push(...padSegs);
    }
```

Then find `update(dt)` a little further down (around line 819-824):

```javascript
  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
    for (const e of this.enemies) e.update(dt, this.time, this, CONFIG);
  }
```

Add one line so a pad's squash animation counts down on its own:

```javascript
  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
    for (const e of this.enemies) e.update(dt, this.time, this, CONFIG);
    for (const p of this.pads) p.squashT = Math.max(0, p.squashT - dt);
  }
```

- [ ] **Step 5: Add the bounce-on-contact check in `player.js`**

In `games/pushkar-ball/js/player.js`, find this block (around line 284-286):

```javascript
    this.grounded = grounded;
    this.platform = platform;
    this.coyote = grounded ? C.COYOTE : Math.max(0, this.coyote - dt);
```

Immediately after it, before the `--- shove a crate ---` section that
follows, insert:

```javascript

    // --- bounce pad ---------------------------------------------------------
    //
    // Landing on a pad launches immediately, with no jump button needed and
    // no rest in between. It must not leave `grounded`, `coyote` or
    // `platform` as if this were an ordinary landing:
    //   - a lingering coyote window would let a jump pressed a moment later
    //     fire (using the coyote time this same landing just granted) and
    //     overwrite this velocity with the far weaker JUMP_V;
    //   - a lingering `platform` would make next call's "carry the
    //     platform's motion" line, right at the top of this function, add
    //     `undefined` to the ball's position — a pad has no dx/dy/vx/vy,
    //     the same class of bug crates hit before they got those fields.
    if (platform && platform.bounce) {
      this.vy = -C.BOUNCE.V;
      this.grounded = false;
      this.coyote = 0;
      this.platform = null;
      platform.squashT = C.BOUNCE.SQUASH_TIME;
    }
```

- [ ] **Step 6: Run the suite and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs pads`
Expected: `ALL BOUNCE PAD CHECKS PASSED`

- [ ] **Step 7: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass (15, with the new `pads` suite added to the
existing 14 — but read the actual count the run prints).

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js games/pushkar-ball/js/player.js games/pushkar-ball/tests/offline/pads.mjs
git commit -m "$(cat <<'EOF'
Add the bounce pad: a trampoline that launches on contact

A new solid, structurally a box like a crate or wall, tagged with
itself as segment owner the same way movers already are. Landing on
top launches the ball at CONFIG.BOUNCE.V (1200px/s, clearing roughly
327px on its own - real clearance against a wall was checked by
simulation, not arithmetic, and is what level 5 will use). Bouncing
clears platform, grounded and coyote together: a pad has none of the
dx/dy/vx/vy fields a real carrier owes, and a lingering coyote window
could let a jump fired a moment later overwrite the bounce with the
far weaker JUMP_V.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Draw the pad

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (two new colours)
- Modify: `games/pushkar-ball/js/main.js` (new `drawPads` function, wired into `draw()`)

- [ ] **Step 1: Add the two colours**

In `games/pushkar-ball/js/config.js`, find (around line 420-421):

```javascript
    PLATFORM: '#B0BEC5',
    PLATFORM_EDGE: '#78909C',
```

Add immediately after it:

```javascript
    // Bright and unlike anything else drawn, on purpose: the pad is a new
    // idea and should not be mistaken for a stone step or a crate at a
    // glance. The posts stay stone-grey — matching this game's existing
    // colour language that grey means fixed and immovable — since the pad
    // as a whole cannot be pushed or climbed, only bounced off.
    BOUNCE_PAD: '#FF9F1C',
    BOUNCE_POST: '#9E9E9E',
```

- [ ] **Step 2: Write `drawPads`**

In `games/pushkar-ball/js/main.js`, find `drawPlatforms` (around line
386-394):

```javascript
function drawPlatforms() {
  const C = CONFIG.COLOURS;
  for (const m of level.movers) {
    ctx.fillStyle = C.PLATFORM;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = C.PLATFORM_EDGE;
    ctx.fillRect(m.x, m.y + m.h - 6, m.w, 6);
  }
}
```

Immediately after it, add:

```javascript

/**
 * The bounce pad: two posts holding up a springy surface that squashes flat
 * the instant it is touched and eases back out, reusing the same
 * squash/stretch language `Ball.squash()` already gives the ball itself for
 * its own deflate animation — a second object speaking a visual language
 * the game already has, not a new one.
 *
 * `p.squashT` counts down in `Level.update`, set by player.js the instant a
 * bounce happens; this function only ever reads it.
 */
function drawPads() {
  const C = CONFIG.COLOURS, B = CONFIG.BOUNCE;
  for (const p of level.pads) {
    const t = p.squashT > 0 ? p.squashT / B.SQUASH_TIME : 0;
    const lift = B.POST_H * (1 - t * B.SQUASH);
    const topY = p.y - lift;

    ctx.strokeStyle = C.BOUNCE_POST;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x + 10, p.y);
    ctx.lineTo(p.x + 10, topY);
    ctx.moveTo(p.x + p.w - 10, p.y);
    ctx.lineTo(p.x + p.w - 10, topY);
    ctx.stroke();

    ctx.fillStyle = C.BOUNCE_PAD;
    ctx.beginPath();
    ctx.ellipse(p.x + p.w / 2, topY, p.w / 2, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

- [ ] **Step 3: Wire it into `draw()`**

In `games/pushkar-ball/js/main.js`, find (around line 217-224):

```javascript
  drawGround();
  drawWalls();
  drawCrates();
  drawCheckpoints();
  drawSpikes(ctx, level.spikes, CONFIG);
  drawEnemies(ctx, level.enemies, level.time, CONFIG);
  drawPlatforms();
  drawGoal();
  drawBall();
```

Add `drawPads();` right after `drawPlatforms();`:

```javascript
  drawGround();
  drawWalls();
  drawCrates();
  drawCheckpoints();
  drawSpikes(ctx, level.spikes, CONFIG);
  drawEnemies(ctx, level.enemies, level.time, CONFIG);
  drawPlatforms();
  drawPads();
  drawGoal();
  drawBall();
```

- [ ] **Step 4: Confirm nothing crashes with no pads on any current level**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites still pass. None of levels 1-4 have a `pads` array
yet, and `level.pads` defaults to `[]` (from `data.pads || []` in Task 1),
so `drawPads`'s loop simply does nothing for them — this step only confirms
that's actually true rather than assuming it.

- [ ] **Step 5: Look at it**

This game's own rule (`CLAUDE.md`, Pushkar Ball's "Look at it" note) is that
most of its real bugs were found by rendering and looking, not by an
assertion — a colour that couldn't be tapped, hills that read as flat
washes. A pad has no test that can see whether it looks like a trampoline.

Task 3 adds level 5, which will have real pads to look at; defer a visual
check to the end of that task rather than building a throwaway fixture now
for a pad with nowhere real to stand yet. Note that here so it isn't
forgotten: Task 3, Step 6 below is where this actually gets looked at.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/main.js
git commit -m "$(cat <<'EOF'
Draw the bounce pad

Two posts holding a springy surface that squashes on contact and
eases back out, reusing Ball.squash()'s own visual language rather
than inventing a new one. Bright orange on grey posts - grey because
this game's colours already mean "fixed" there, since the pad can't
be pushed or climbed, only bounced off.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Level 5

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (new level object in the `LEVELS` array)

This task is level DATA only — no engine code changes. Every mechanic used
here (gap, crate, walker, roller, spike patch, the new pad) already exists;
this task only arranges them.

- [ ] **Step 1: Add level 5**

In `games/pushkar-ball/js/levels.js`, find the end of level 4's object and
the array's closing bracket (around line 562-567):

```javascript
    checkpoints: [
      { x: 7050, y: 760 },
      { x: 10950, y: 620 },
    ],
  },
];
```

Insert a new level object between level 4's closing `},` and the array's
closing `];`:

```javascript
    checkpoints: [
      { x: 7050, y: 760 },
      { x: 10950, y: 620 },
    ],
  },

  {
    // Level five: the pad is the one new idea, taught first on open, level
    // ground, then required to clear a wall no ordinary jump can reach.
    // Everything else here already exists — a gap, a crate, a spike patch,
    // a walker, a roller — recombined rather than re-taught, per the
    // recurring-difficulty ruling that an idea already taught may recur in
    // any later level. See
    // docs/superpowers/specs/2026-09-13-bounce-pad-and-level-five-design.md.
    id: 5,
    theme: 'hills',
    bounds: { w: 12800, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12100, y: 760 },

    ground: [
      // The rehearsal: a long flat, well before any checkpoint, with the
      // pad sitting directly in the rolling line. There is nothing after it
      // to clear yet — just open flat ground — so the first bounce is free
      // to feel out, with nothing to fail at.
      [[40, 760], [2500, 760]],
      // A 200px gap — the same size level one's first one already proved —
      // then a long flat carrying the recurring crate, a spike patch, and a
      // walker, all well-practised ideas rather than anything new.
      [[2700, 760], [7000, 760]],
      // The real test: a roller, protected by checkpoint one just before
      // it. Then a second 200px gap.
      [[7000, 760], [9500, 760]],
      // Home to checkpoint two, then straight on to the gate: no third gap
      // here, on purpose — this whole stretch is one continuous flat, so
      // there is nothing to fall into between the checkpoint and the pad.
      // 120 units sit between the pad's right edge (11140 + 100) and the
      // wall (11360) — inside the 50-200 unit window the pad's bounce
      // velocity clears, see the design spec — then flat again to the goal.
      [[9700, 760], [12760, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12760, y: 0, w: 40, h: 1080 },
      // The recurring crate, exactly as pushable as level three's.
      { x: 4200, y: 660, w: 100, h: 100, movable: true },
      // The wall: 200 tall, far beyond any unaided jump's 131px reach, and
      // the only thing in this level the pad is actually required for.
      { x: 11360, y: 560, w: 40, h: 200 },
    ],

    pads: [
      // The rehearsal, on open ground with nothing to clear.
      { x: 1500, y: 760, w: CONFIG.BOUNCE.W },
      // The gate. Its right edge sits 120 units short of the wall at
      // 11360 — comfortably inside the checked 50-200 unit clearance
      // window, with margin either side.
      { x: 11140, y: 760, w: CONFIG.BOUNCE.W },
    ],

    spikes: [
      // One recurring patch, on the long flat with the crate and the
      // walker — well-practised, not this level's point.
      { x: 5600, y: 760, w: 90 },
    ],

    enemies: [
      // A walker, recurring, on the same flat as the crate and the spikes.
      { kind: 'walker', x: 6200, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 300 },
      // The roller, level five's one real test, protected by checkpoint
      // one just before it — the same role it plays in level four.
      { kind: 'roller', x: 8200, y: 760 - CONFIG.ENEMY.ROLLER.R, from: 7300, to: 9300, dir: -1 },
    ],

    // Two, at the same "roughly a third of the level" boundaries every
    // other level uses them at. The first guards the roller, the real test
    // in the level's middle third; the second guards the wall gate — 400
    // units of runway before the pad at 11140, comfortably more than the
    // ~55 units a standing start needs to reach full speed, so a checkpoint
    // respawn is never short of room to build up speed again before the
    // pad.
    checkpoints: [
      { x: 6850, y: 760 },
      { x: 10850, y: 760 },
    ],
  },
];
```

- [ ] **Step 2: Confirm the level loads and the offline suite still passes**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: `offline/levels` still passes (it checks structural properties of
every level in `LEVELS`, so this is what catches an authoring mistake —
overlapping ground segments, a checkpoint off the ground, a segment whose
normal doesn't point up — before anything else does). If it fails, read
the specific failure message; it will name the exact problem.

`offline/finish` is EXPECTED to fail at this point, with a message that
level 5 has no route — that's Task 4's job, not this one. Every other
suite should still pass.

- [ ] **Step 3: Commit**

```bash
git add games/pushkar-ball/js/levels.js
git commit -m "$(cat <<'EOF'
Add level five: the bounce pad, and everything taught before it

The pad's one new idea, rehearsed on open ground with nothing to
clear, then required to reach a 200px wall no ordinary jump can. A
gap, a crate, a spike patch, a walker and a roller all recur from
earlier levels rather than being re-taught, per the recurring-
difficulty ruling. finish.mjs's route and pad-necessity check are
Task 4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Prove level five can be finished, and only with the pad

**Files:**
- Modify: `games/pushkar-ball/tests/offline/finish.mjs`

- [ ] **Step 1: Read the current routes table and runner**

Before editing, read `games/pushkar-ball/tests/offline/finish.mjs` in full
(it's a few hundred lines) so the route you write for level 5 fits the
file's existing conventions — in particular the generic `runner(level,
lead)` function (jumps before any gap edge, spike patch, crate, or low
stone step in the way) and how level 3's route only diverges from the
generic runner for the parts a runner cannot do by rolling right (working
the crate). Level 5's route needs the same kind of exception for the pad:
`runner` alone would roll the ball straight over both pads (they are flush
with the ground, so nothing about them looks like an edge, a spike, a
crate, or a step to the runner's own checks) and would then simply crash
into the 200px wall it cannot jump over.

- [ ] **Step 2: Add level 5's route**

In `games/pushkar-ball/tests/offline/finish.mjs`, find the `ROUTES` object
(a route per level id, keyed by level id — level 1's is the most complex
example, handling its platform-riding finish). Add a new entry for id `5`:

```javascript
  // Level five: the generic runner handles everything except the wall gate,
  // since nothing about a pad flush with the ground looks like an edge, a
  // spike, a crate, or a step to it — it just runs the ball straight over
  // both pads and into the wall. So the route is the generic runner right
  // up to the wall, then a deliberate approach: keep rolling into the
  // second pad, which launches automatically (no jump needed, matching how
  // a real player would discover it), and steer straight through the
  // resulting arc.
  5: (level, lead) => {
    const run = runner(level, lead);
    const wallX = 11360;
    return (ball) => {
      if (ball.x < wallX - 400) return run(ball);
      // Past this point, just keep holding right: the pad does the rest,
      // and there is nothing here for the runner's own checks (edges,
      // spikes, crates, steps) to react to.
      return { right: true };
    };
  },
```

- [ ] **Step 3: Run the finish suite and confirm level 5 is finished cleanly**

Run: `node games/pushkar-ball/tests/run.mjs finish`

Expected: level 5 appears in case 1's per-level report ("finished every
time without failing") and in case 2's per-checkpoint report. If any run
fails, read the specific `lead`/`delay` combination it names — a common
cause is the wall or the second pad's position needing to shift slightly
from the exact numbers in Task 3, since finish.mjs is the first thing that
actually drives a realistic approach speed and timing across many starting
conditions rather than the single case eyeballed while writing the level.
If it does need adjusting, change level 5's `boxes`/`pads` x-coordinates in
`games/pushkar-ball/js/levels.js` (not the route here) and re-run — the
route should not need to change to accommodate a geometry fix, only the
level data should.

- [ ] **Step 4: Add the "cannot be finished without the pad" case**

This is level 3's own "cannot be finished without its crate" case, adapted:
remove the second pad (the one that clears the wall) from a copy of level
5's data and confirm nothing gets past the wall.

Find the end of case 3 in `finish.mjs` (level three without its crate,
ending around the line `if (best < 620) fail(...)`) and, after that case's
closing `}`, before case 4 ("exhausting hearts mid-level"), add:

```javascript
// --- 3b. level five cannot clear the wall without the second pad -----------
//
// The first pad (the rehearsal, on open ground) stays — removing it would
// also remove the one place this checks that a ball can even reach the
// wall's approach normally. Only the gate pad, at 11140, is taken away.
console.log('\n3b. level five without its gate pad');
{
  const data = LEVELS.find((l) => l.id === 5);
  if (!data) fail('there is no level 5');
  else {
    const gatePad = data.pads.find((p) => p.x === 11140);
    if (!gatePad) fail('level 5 has no pad at x=11140 to remove — has the geometry moved?');
    else {
      const bare = { ...data, pads: data.pads.filter((p) => p !== gatePad) };
      const wallX = 11360;
      let cleared = 0, tries = 0;
      for (let from = wallX - 700; from <= wallX - 100; from += 20) {
        tries++;
        const { ball } = play({ ...bare, spawn: { x: from, y: 600 } }, () => (b) => ({ right: true }), { seconds: 6 });
        if (ball.x > wallX + 60) cleared++;
      }
      if (cleared) fail(`level 5 was cleared past the wall without its gate pad ${cleared} time(s) of ${tries} — the wall no longer needs it`);
      else console.log(`   ${tries} tries without it, none got past the wall at x=${wallX}`);
    }
  }
}
```

- [ ] **Step 5: Run the finish suite again and confirm both new cases pass**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: case 1 and 2 still report level 5 finished cleanly; the new case
3b reports 0 clears without the gate pad.

- [ ] **Step 6: Run the full suite, offline and browser**

Run: `node games/pushkar-ball/tests/run.mjs`
Expected: all suites pass — this needs a local Chrome install and starts
its own server, per the file's own header comment.

- [ ] **Step 7: Look at level 5**

Per this game's own "Look at it" rule, render level 5 and actually look at
it before considering this done — most of this game's real bugs were found
this way, not by an assertion, and a pad has no test that can see whether
it looks like a trampoline.

There is no in-game level select yet (`ui.js` notes "level select is phase
4"), so temporarily jump straight to level 5. In
`games/pushkar-ball/js/main.js`, find:

```javascript
flow.start(0);
```

Change the `0` to `4` (level 5 is `LEVELS[4]`, the fifth entry):

```javascript
flow.start(4);
```

Start the local server (`node games/pushkar-ball/tests/run.mjs` starts one
and leaves it running while its suites execute — or run any command from
this file's own header comment that starts the server without immediately
tearing it down) and open `http://127.0.0.1:8778/games/pushkar-ball/index.html`
in a real browser. Roll through the level and confirm by eye:

- The rehearsal pad (no wall after it) launches the ball with an obvious,
  satisfying pop, and looks like a trampoline — not a crate, not a rock.
- The recurring crate, spike patch, walker, and roller all look and behave
  as they do in their original levels (nothing about recombining them
  introduced a visual glitch).
- The gate pad and the wall read as a deliberate obstacle — the wall looks
  like something worth noticing, not scenery, and the gap between pad and
  wall looks like a jump a player would recognize, not a wall they'd
  expect to just walk through.

Then revert the change:

```javascript
flow.start(0);
```

Confirm the revert with `git diff games/pushkar-ball/js/main.js` — it must
show no changes before continuing. Do not commit `flow.start(4)`.

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/tests/offline/finish.mjs
git commit -m "$(cat <<'EOF'
Prove level five can be finished, and only with its gate pad

A route for level five (the generic runner up to the wall, then hold
right through the pad's automatic launch), plus level three's own
"cannot be finished without X" pattern adapted for the gate pad:
remove it and confirm nothing clears the wall.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Docs

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-followup-ideas.md`
- Modify: `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md`

- [ ] **Step 1: Mark item 4 done**

In `docs/superpowers/specs/2026-09-11-followup-ideas.md`, find the heading:

```markdown
## 4. "Must jump to proceed" gates
```

Change it to:

```markdown
## 4. "Must jump to proceed" gates — DONE
```

Then find the paragraph under that heading (the one ending "...jump-only
gate, plus a text-free obstacle shape") and replace the whole paragraph
with:

```markdown
No existing jump physics could make a taller wall a real gate — `JUMP_V`
is a fixed impulse, unaffected by how fast the ball is rolling, so every
jump in this game already tops out at the same 131px. Answering this
properly meant a new mechanic: a bounce pad, launching the ball on contact
with no button press needed, and a new level 5 to give it a home under the
game's own one-new-idea-per-level rule. See
`docs/superpowers/specs/2026-09-13-bounce-pad-and-level-five-design.md` and
`docs/superpowers/plans/2026-09-13-bounce-pad-and-level-five.md`.
```

Then find the "Where this fits" rollup sentence near the end of the file
and update it to include item 4 among the done items — read the sentence
as it currently stands (it was last edited to read "Items 1, 2, 6 and 8 are
done; items 3, 4, 5 and 7 are each still their own design pass.") and
change it to:

```markdown
Items 1, 2, 4, 6 and 8 are done; items 3, 5 and 7 are each still their own
design pass.
```

- [ ] **Step 2: Amend the Phase B note in the 09-10 spec**

In `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md`,
find the sentence in the "Out of scope" section that lists Phase B's
hazards:

```markdown
- Saws, conveyors, crushers, launchers, ice/sticky surfaces — Phase B, once
  Phase A is built and played.
```

Change it to:

```markdown
- Saws, conveyors, crushers, ice/sticky surfaces — Phase B, once Phase A is
  built and played. Launchers were pulled forward and built ahead of the
  rest of Phase B, as a bounce pad, in
  docs/superpowers/specs/2026-09-13-bounce-pad-and-level-five-design.md —
  level 5 stays `theme: 'hills'` for now; the toy-factory reskin is still
  Phase B's job.
```

Also find the sentence about level 5's role, later in the same file:

```markdown
- The toy-factory theme's specific hazards. Level 5 keeps its "combine
  everything" role but gets only a light pass here; its factory-specific
  content is Phase B's job.
```

Change it to:

```markdown
- The toy-factory theme's specific hazards and reskin. Level 5's "combine
  everything" role is now built — see
  docs/superpowers/specs/2026-09-13-bounce-pad-and-level-five-design.md —
  with its factory-specific visual theme still Phase B's job.
```

- [ ] **Step 3: Run the full offline suite one more time**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass (docs-only changes, but confirms nothing in this
task's own edits was accidentally made to a code file).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-11-followup-ideas.md docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md
git commit -m "$(cat <<'EOF'
Document the bounce pad and level five in both specs

Marks follow-up item 4 done, and amends the 09-10 spec's Phase B list:
launchers were pulled forward and built now, as a bounce pad; level
5's "combine everything" role is built, with its toy-factory reskin
still pending.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
