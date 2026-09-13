# Pressure Switch And Scenery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pressure-switch/gate puzzle mechanic to Pushkar Ball plus a new level 6 built around it (Part A), and give every level a richer, still fully code-drawn background — sun, clouds, a third hill band, a textured ground, and a decorative water band in gaps (Part B).

**Architecture:** The switch is a non-colliding zone, checked each step against every crate's `grounded` box, the same way a checkpoint or spike is checked against the ball's position. The gate is a new kind of dynamic solid: structurally a box like a wall, but its position slides upward over time toward "open" or back down toward "closed," rebuilding its segments every step exactly the way a crate or moving platform already does — no change to `physics.js`, which only ever resolves against whatever segments it's handed. Level 6 is pure data in `levels.js`, using only mechanics that already exist plus the new switch/gate pair. The scenery work touches only `main.js`'s drawing functions and `config.js`'s data — nothing in `physics.js`, `player.js`, or any offline-tested simulation file changes, so none of it can affect `finish.mjs` or any other physics suite.

**Tech Stack:** Vanilla JS (ES modules), no build step. Tests run under plain node via `games/pushkar-ball/tests/run.mjs offline` (add `browser` or no filter to include the browser suites).

**Spec:** `docs/superpowers/specs/2026-09-13-pressure-switch-and-scenery-design.md`

---

### Task 1: The switch and gate — config, engine plumbing, and a test suite

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (new `SWITCH` and `GATE` blocks)
- Modify: `games/pushkar-ball/js/levels.js` (new `switches`/`gates` data, `makeGate`, wiring into `update`/`near`/`solidsFor`)
- Test: `games/pushkar-ball/tests/offline/switches.mjs` (new file)

- [ ] **Step 1: Write the failing test suite**

Create `games/pushkar-ball/tests/offline/switches.mjs`:

```javascript
// A pressure switch and its gate: only a crate presses the switch, and the
// gate slides open while it's pressed and closes again once it isn't. This
// is the whole mechanic — the gate has no other way to open, and nothing
// about it is a resting place for the ball itself.
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
 * Flat ground with one switch/gate pair on it. The gate's `y` is its CLOSED
 * top — the same "y is the top, h reaches down to the ground" convention
 * level four's stone wall already uses — so `{ y: GROUND_Y - h, h }` sits
 * flush with the floor, fully blocking it.
 */
const world = (extra) => loadLevel({
  id: 97, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, GROUND_Y], [2360, GROUND_Y]]],
  boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2360, y: 0, w: 40, h: 1080 },
  ],
  platforms: [],
  switches: [{ id: 'g1', x: 900, y: GROUND_Y, w: 110 }],
  gates: [{ x: 1010, y: GROUND_Y - 200, w: 40, h: 200, switchId: 'g1' }],
  ...extra,
});

// --- 1. the loader builds a switch and a gate, gate starts closed --------
{
  const level = world();
  console.log(`\n1. ${level.switches.length} switch(es), ${level.gates.length} gate(s)`);
  if (level.switches.length !== 1) fail(`expected 1 switch, got ${level.switches.length}`);
  if (level.gates.length !== 1) fail(`expected 1 gate, got ${level.gates.length}`);
  if (level.switches[0].pressed) fail('a switch reads as pressed before anything is on it');
  if (level.gates[0].openT !== 0) fail(`a gate starts with openT=${level.gates[0].openT}, expected 0 (closed)`);
}

// --- 2. a closed gate blocks the ball --------------------------------------
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const input = stub();
  input.right = true;
  run(ball, level, input, 8);
  console.log(`\n2. rolled at a closed gate for 8s: stopped at x=${ball.x.toFixed(0)}`);
  if (ball.x > 1010) fail(`the ball is at x=${ball.x.toFixed(0)}, past the closed gate at x=1010`);
}

// --- 3. a crate on the switch presses it, and the gate opens --------------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2360, y: 0, w: 40, h: 1080 },
    { x: 850, y: GROUND_Y - 100, w: 100, h: 100, movable: true },
  ] });
  // Drop the crate straight onto the plate rather than pushing it — this
  // suite is about the switch and gate, not about crate-pushing, which
  // already has its own coverage.
  run(new Ball(-1000, -1000), level, stub(), 1.5);   // let the crate settle
  const sw = level.switches[0], gate = level.gates[0];
  console.log(`\n3. crate settled and grounded=${level.crates[0].grounded}; switch pressed=${sw.pressed}`);
  if (!level.crates[0].grounded) fail('3: the crate never settled, so nothing below was tested');
  if (!sw.pressed) fail('the switch never reads as pressed with a crate resting on it');
  // Give the gate its full CONFIG.GATE.OPEN_TIME to swing all the way open.
  for (let i = 0; i < Math.round((CONFIG.GATE.OPEN_TIME + 0.2) / CONFIG.STEP); i++) level.update(CONFIG.STEP);
  console.log(`   after ${(CONFIG.GATE.OPEN_TIME + 0.2).toFixed(2)}s: openT=${gate.openT.toFixed(2)}`);
  if (gate.openT !== 1) fail(`gate openT is ${gate.openT}, expected exactly 1 (fully open)`);
  // Fully open means the gate has slid its own height clear of the ground —
  // its current bottom (gate.y + gate.h) must be at or above the ground it
  // used to block, or a "fully open" gate would still catch a rolling ball.
  if (gate.y + gate.h > GROUND_Y - 1) fail(`gate's bottom is at y=${(gate.y + gate.h).toFixed(0)}, still at or below the ground it should have cleared`);
}

// --- 4. an open gate lets the ball through ---------------------------------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2360, y: 0, w: 40, h: 1080 },
    { x: 850, y: GROUND_Y - 100, w: 100, h: 100, movable: true },
  ] });
  run(new Ball(-1000, -1000), level, stub(), 1.5 + CONFIG.GATE.OPEN_TIME + 0.2);
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const input = stub();
  input.right = true;
  run(ball, level, input, 8);
  console.log(`\n4. rolled at the open gate for 8s: reached x=${ball.x.toFixed(0)}`);
  if (ball.x < 1200) fail(`the ball only reached x=${ball.x.toFixed(0)}, the open gate still stopped it`);
}

// --- 5. remove the crate: the switch un-presses and the gate re-closes ----
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2360, y: 0, w: 40, h: 1080 },
    { x: 850, y: GROUND_Y - 100, w: 100, h: 100, movable: true },
  ] });
  run(new Ball(-1000, -1000), level, stub(), 1.5 + CONFIG.GATE.OPEN_TIME + 0.2);
  // Shove the crate off the plate to the left by hand — this suite has no
  // interest in HOW a crate gets moved, only in what the switch does once
  // it's gone.
  level.crates[0].x = 200;
  level.crates[0]._reseg();
  for (let i = 0; i < Math.round((CONFIG.GATE.OPEN_TIME + 0.2) / CONFIG.STEP); i++) level.update(CONFIG.STEP);
  console.log(`\n5. crate moved off the plate: switch pressed=${level.switches[0].pressed}, gate openT=${level.gates[0].openT.toFixed(2)}`);
  if (level.switches[0].pressed) fail('the switch still reads as pressed with the crate gone');
  if (level.gates[0].openT !== 0) fail(`gate openT is ${level.gates[0].openT}, expected exactly 0 (closed again)`);
}

// --- 6. a gate owes the four carrier fields, like every other carrier -----
//
// CLAUDE.md's own rule: anything the ball can stand on is a carrier and
// owes dx, dy, vx, vy, or player.js's `platform.dx` line turns the ball's
// position into NaN the first frame it stands on one mid-swing. A gate's
// TOP is exactly such a surface while it's animating.
{
  const level = world();
  const gate = level.gates[0];
  for (const f of ['dx', 'dy', 'vx', 'vy']) {
    if (typeof gate[f] !== 'number') fail(`a fresh gate has no numeric '${f}' — a rider standing on it mid-swing would go NaN`);
  }
  console.log(`\n6. gate carrier fields: dx=${gate.dx}, dy=${gate.dy}, vx=${gate.vx}, vy=${gate.vy}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL SWITCH/GATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs switches`

Expected: a crash or FAIL — `CONFIG.GATE`, `data.switches` and `data.gates` don't exist yet, so this should error out (e.g. `TypeError: Cannot read properties of undefined (reading 'OPEN_TIME')`) rather than print a clean failure. That confirms the suite is exercising code that doesn't exist yet.

- [ ] **Step 3: Add the `SWITCH` and `GATE` config blocks**

In `games/pushkar-ball/js/config.js`, find the end of the `BOUNCE` block (it closes with `PAD_RY: 9,            // drawn pad ellipse's vertical radius\n  },` just before the `// Failing` section comment), and insert this new block immediately after it:

```javascript
  // ---------------------------------------------------------------------
  // The pressure switch and its gate
  // ---------------------------------------------------------------------
  // A weight-triggered puzzle: push a crate onto the plate to hold a gate
  // open, then walk through — the crate stays behind, since nothing in this
  // game lets the ball pull one back. Only a crate presses a switch, never
  // the ball itself, so the puzzle is always about planning where the
  // weight ends up, not about standing somewhere. See
  // docs/superpowers/specs/2026-09-13-pressure-switch-and-scenery-design.md.
  SWITCH: {
    H: 14,          // drawn plate thickness above its ground anchor
    PRESS_DEPTH: 6, // how far the plate sinks, drawn, while pressed
    // How quickly the drawn dip animates. Purely visual — pressed/unpressed
    // itself is instantaneous the moment a crate's box overlaps the plate;
    // this only softens how sinking and rising are DRAWN.
    PRESS_TIME: 0.15,
  },
  GATE: {
    // Seconds for a full swing, either direction, closed to open or back.
    // A gate slides its own height straight up — the "portcullis into a
    // slot above" reading, not a wall that simply vanishes, since this game
    // has no precedent for solid geometry disappearing outright and that
    // would read as a glitch rather than a mechanism.
    OPEN_TIME: 0.6,
  },
```

- [ ] **Step 4: Add `makeGate`, and `switches`/`gates` to the `Level` class**

In `games/pushkar-ball/js/levels.js`, find `makeMover` (it ends with the closing `}\n\nfunction makeCrate` — the blank line and comment above `makeCrate` mark the boundary). Immediately after `makeMover`'s closing `}` and before the `/**\n * A wooden crate...` comment, insert:

```javascript

/**
 * A gate: a solid box like a wall, except its position slides straight up
 * to clear a passage while its switch is pressed, and back down when it
 * isn't. `g.y`/`g.h` are the CLOSED position and height — the same
 * "y is the top, h reaches down to the ground" convention a plain stone
 * wall already uses — and `gate.y` is where it is RIGHT NOW, sliding from
 * `g.y` (closed) up to `g.y - g.h` (fully open, its old footprint entirely
 * clear).
 *
 * Owes the same four carrier fields a crate or a moving platform does: its
 * top is something the ball could be standing on while it swings, and a
 * rider with no dx/dy/vx/vy to add is exactly the NaN bug CLAUDE.md already
 * warns about.
 */
function makeGate(g) {
  const gate = {
    ...g,
    x: g.x, y: g.y,
    openT: 0,          // 0 closed, 1 fully open
    dx: 0, dy: 0,
    vx: 0, vy: 0,
    segments: [],

    update(dt, pressed) {
      const wasY = gate.y;
      const target = pressed ? 1 : 0;
      const rate = dt / CONFIG.GATE.OPEN_TIME;
      gate.openT = target > gate.openT
        ? Math.min(1, gate.openT + rate)
        : Math.max(0, gate.openT - rate);
      const ny = g.y - g.h * gate.openT;
      gate.dy = ny - wasY;
      gate.vy = dt > 0 ? gate.dy / dt : 0;
      gate.y = ny;
      gate.segments = boxSegments(gate.x, gate.y, g.w, g.h);
      // So a contact can be traced back to the gate that made it, the same
      // mechanism movers and crates already use.
      for (const s of gate.segments) s.owner = gate;
    },

    overlaps(x, y, r) {
      return x + r > gate.x && x - r < gate.x + g.w && y + r > gate.y && y - r < gate.y + g.h;
    },
  };
  gate.update(0, false);
  // update(0, false) reports a delta from the gate's declared position to
  // its position at t=0, which is not movement anybody rode.
  gate.dy = 0; gate.vy = 0;
  return gate;
}
```

Now find this block inside the `Level` constructor (right after the checkpoints and before the enemies comment):

```javascript
    // Hazards are not colliders and never enter the segment world. The ball
    // does not bounce off a spike; it rolls into one and fails.
    this.spikes = (data.spikes || []).map((s) => ({ x: s.x, y: s.y, w: s.w }));
```

Immediately after it, insert:

```javascript

    // A switch is not a collider either, and never enters the segment world
    // — the ball and any crate roll over its ground exactly as if it wasn't
    // there. It only ever reports whether some crate is currently resting
    // on it; `Level.update` is what turns that into a gate opening.
    this.switches = (data.switches || []).map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, pressed: false, animT: 0 }));

    // Gates ARE colliders, but dynamic ones — they move, so like crates and
    // movers they must stay OUT of the static grid built below.
    this.gates = (data.gates || []).map(makeGate);
```

Then find `update(dt)`:

```javascript
  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
    for (const e of this.enemies) e.update(dt, this.time, this, CONFIG);
    for (const p of this.pads) p.squashT = Math.max(0, p.squashT - dt);
```

Add the switch/gate step right after the pads line:

```javascript
  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
    for (const e of this.enemies) e.update(dt, this.time, this, CONFIG);
    for (const p of this.pads) p.squashT = Math.max(0, p.squashT - dt);
    // A switch is pressed by any crate resting on it — never the ball
    // itself. Crates are updated above this line, so `grounded` is already
    // this step's answer, not last step's. `animT` is purely cosmetic — how
    // far `drawSwitches`' own dip has eased towards pressed or not — and
    // advanced here the same way a pad's `squashT` already is, so main.js
    // only ever reads it.
    for (const sw of this.switches) {
      sw.pressed = this.crates.some((c) => c.grounded && c.x < sw.x + sw.w && c.x + c.w > sw.x);
      const target = sw.pressed ? 1 : 0;
      const rate = dt / CONFIG.SWITCH.PRESS_TIME;
      sw.animT = target > sw.animT ? Math.min(1, sw.animT + rate) : Math.max(0, sw.animT - rate);
    }
    for (const g of this.gates) {
      const sw = this.switches.find((s) => s.id === g.switchId);
      g.update(dt, !!(sw && sw.pressed));
    }
```

Then find `solidsFor(crate)`:

```javascript
  solidsFor(crate) {
    const out = [...this.statics];
    for (const m of this.movers) out.push(...m.segments);
    for (const c of this.crates) if (c !== crate) out.push(...c.segments);
    return out;
  }
```

Add gates so a crate can't be shoved through a closed one:

```javascript
  solidsFor(crate) {
    const out = [...this.statics];
    for (const m of this.movers) out.push(...m.segments);
    for (const g of this.gates) out.push(...g.segments);
    for (const c of this.crates) if (c !== crate) out.push(...c.segments);
    return out;
  }
```

Then find `near(x, y, r)`:

```javascript
  near(x, y, r) {
    const out = [...this.grid.near(x, y, r)];
    for (const m of this.movers) if (m.overlaps(x, y, r)) out.push(...m.segments);
    for (const c of this.crates) if (c.overlaps(x, y, r)) out.push(...c.segments);
    return out;
  }
```

Add gates the same way:

```javascript
  near(x, y, r) {
    const out = [...this.grid.near(x, y, r)];
    for (const m of this.movers) if (m.overlaps(x, y, r)) out.push(...m.segments);
    for (const g of this.gates) if (g.overlaps(x, y, r)) out.push(...g.segments);
    for (const c of this.crates) if (c.overlaps(x, y, r)) out.push(...c.segments);
    return out;
  }
```

- [ ] **Step 5: Run the suite and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs switches`
Expected: `ALL SWITCH/GATE CHECKS PASSED`

- [ ] **Step 6: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass, with the new `switches` suite added to the existing count — read the actual count the run prints.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/switches.mjs
git commit -m "$(cat <<'EOF'
Add the pressure switch and its gate

A switch is a non-colliding zone, pressed by any crate whose box
overlaps it while grounded - never the ball itself, so the puzzle is
always about where the weight ends up. A gate is a new dynamic solid:
its position slides its own height straight up while pressed, closed
again while not, rebuilding its segments every step the way a crate
or moving platform already does. No change to physics.js - it only
ever resolves against whatever segments it's handed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Draw the switch and the gate

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (three new colours)
- Modify: `games/pushkar-ball/js/main.js` (new `drawSwitches`/`drawGates`, wired into `draw()`)

- [ ] **Step 1: Add the colours**

In `games/pushkar-ball/js/config.js`, find:

```javascript
    BOUNCE_PAD: '#FF9F1C',
    BOUNCE_POST: '#9E9E9E',
```

Add immediately after it:

```javascript
    // The switch plate: dark and raised, unlike ordinary ground, so "put
    // something here" is legible without a word — the same way wood-vs-
    // stone already is. The gate is drawn in the same stone family a wall
    // already uses (WALL/WALL_EDGE), on purpose: it isn't pushable, so it
    // must never read as wood.
    SWITCH_PLATE: '#5E6B73',
    SWITCH_PLATE_EDGE: '#3E474D',
```

- [ ] **Step 2: Write `drawSwitches` and `drawGates`**

In `games/pushkar-ball/js/main.js`, find `drawCheckpoints` (it ends with a closing `}` right before the `/**\n * The moving platforms...` comment). Immediately after `drawCheckpoints`'s closing `}`, insert:

```javascript

/**
 * The pressure switch: a small raised plate, dark and unlike ordinary
 * ground, that sinks a little while pressed and rises back when it isn't.
 * `sw.animT` is `Level.update`'s own eased value; this only ever reads it.
 */
function drawSwitches() {
  const C = CONFIG.COLOURS;
  const S = CONFIG.SWITCH;
  for (const sw of level.switches) {
    const dip = S.PRESS_DEPTH * sw.animT;
    const topY = sw.y - S.H + dip;

    ctx.fillStyle = C.SWITCH_PLATE_EDGE;
    ctx.fillRect(sw.x, sw.y - S.H, sw.w, S.H);
    ctx.fillStyle = C.SWITCH_PLATE;
    ctx.fillRect(sw.x, topY, sw.w, S.H - dip);
  }
}

/**
 * The gate: a plain stone box, drawn at wherever its own animation has it
 * right now — `g.x`/`g.y`, never the closed position it was declared at.
 * Deliberately the same visual language `drawWalls` already uses (a flat
 * fill plus a lighter top edge), since a gate is exactly a wall except that
 * it moves.
 */
function drawGates() {
  const C = CONFIG.COLOURS;
  for (const g of level.gates) {
    ctx.fillStyle = C.WALL;
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = C.WALL_EDGE;
    ctx.fillRect(g.x, g.y, g.w, 6);
  }
}
```

- [ ] **Step 3: Wire both into `draw()`**

In `games/pushkar-ball/js/main.js`, find:

```javascript
  drawGround();
  drawWalls();
  drawCrates();
  drawCheckpoints();
  drawSpikes(ctx, level.spikes, CONFIG);
  drawEnemies(ctx, level.enemies, level.time, CONFIG);
  drawParticles();
  drawPlatforms();
  drawPads();
  drawGoal();
  drawBall();
```

Change it to:

```javascript
  drawGround();
  drawWalls();
  drawCrates();
  drawCheckpoints();
  drawSwitches();
  drawSpikes(ctx, level.spikes, CONFIG);
  drawEnemies(ctx, level.enemies, level.time, CONFIG);
  drawParticles();
  drawPlatforms();
  drawPads();
  drawGates();
  drawGoal();
  drawBall();
```

(`drawSwitches` sits with the other ground-level decorations; `drawGates` sits with the other dynamic solids, right before the goal and ball so it never draws under them.)

- [ ] **Step 4: Confirm nothing crashes with no switches/gates on any current level**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites still pass. None of levels 1-5 have `switches`/`gates` arrays yet, and both default to `[]`, so the new draw loops do nothing for them — this step confirms that's actually true.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/main.js
git commit -m "$(cat <<'EOF'
Draw the pressure switch and its gate

The plate sinks a little while pressed and rises back when it isn't,
reusing the pad's own squashT-style eased-value idiom, driven from
draw() since it's cosmetic only. The gate is drawn exactly like a
wall (WALL/WALL_EDGE) at its current, animated position - it isn't
pushable and must never read as wood.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Level 6

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (new level object in the `LEVELS` array)

This task is level DATA only — no engine code changes. Every mechanic used here (gap, low stone step, a recurring walker, a crate, the new switch/gate) already exists; this task only arranges them.

- [ ] **Step 1: Add level 6**

In `games/pushkar-ball/js/levels.js`, find the end of level 5's object and the array's closing bracket:

```javascript
    checkpoints: [
      { x: 6850, y: 760 },
      { x: 10850, y: 760 },
    ],
  },
];
```

Insert a new level object between level 5's closing `},` and the array's closing `];`:

```javascript
    checkpoints: [
      { x: 6850, y: 760 },
      { x: 10850, y: 760 },
    ],
  },

  {
    // Level six: the pressure switch and its gate are the one new idea —
    // push a crate onto the plate to hold the gate open, then walk through
    // without it, since nothing here lets the ball pull a crate back. A
    // 200px gap, a recurring low stone step and a recurring walker warm the
    // level up first; none of that is new. See
    // docs/superpowers/specs/2026-09-13-pressure-switch-and-scenery-design.md.
    id: 6,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12760, y: 760 },

    ground: [
      // Warm-up: a proven 200px gap, well before any checkpoint.
      [[40, 760], [2200, 760]],
      // A long flat carrying the recurring stone step and the recurring
      // walker, well apart from each other and from the puzzle ahead.
      [[2400, 760], [7900, 760]],
      // The puzzle stretch, protected by the checkpoint just before it: the
      // crate, the switch plate, and the closed gate.
      [[7900, 760], [11200, 760]],
      // Past the gate, flat to the goal — nothing hard left to guard.
      [[11200, 760], [12960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
      // The recurring low stone step from level one, 60 tall — a jump
      // clears it with more than twice the height needed.
      { x: 3200, y: 700, w: 200, h: 60 },
      // The crate that matters. Pushed right, it comes to rest against the
      // CLOSED gate's own face — the gate does double duty as both the
      // obstacle and the thing that stops the crate exactly on the plate,
      // the same way level three's ledge face stops its crate.
      { x: 8300, y: 660, w: 100, h: 100, movable: true },
    ],

    // The plate's right edge (9700 + 110 = 9810) sits flush against the
    // gate's left face, so a crate pushed all the way right comes to rest
    // with its footprint over the plate — there is nowhere else for it to
    // stop.
    switches: [
      { id: 'gate1', x: 9700, y: 760, w: 110 },
    ],

    // Closed: 200 tall, far beyond any unaided jump's 131px reach — the
    // same wall height level five's own gate already proved needs a real
    // mechanic, not a jump, to clear.
    gates: [
      { x: 9810, y: 560, w: 40, h: 200, switchId: 'gate1' },
    ],

    platforms: [],

    enemies: [
      // A recurring walker, well clear of the step (1300 units) and of the
      // puzzle stretch (3400 units) — never met at the same moment as
      // anything else.
      { kind: 'walker', x: 4500, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    // One. Everything before it (the first gap, the step, the walker) is
    // already-practised ground — none of it is this level's hard part, so a
    // checkpoint there would only bank progress nobody was going to lose.
    // Everything after the gate, once it's open, is flat with nothing left
    // to fail — a second checkpoint there would guard nothing.
    checkpoints: [
      { x: 8150, y: 760 },
    ],
  },
];
```

- [ ] **Step 2: Confirm the level loads and the offline suite still passes**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: `offline/levels` still passes (it checks structural properties of every level in `LEVELS` — an overlapping ground segment, a checkpoint off the ground, a segment whose normal doesn't point up — before anything else does). If it fails, read the specific failure message.

`offline/finish` is EXPECTED to fail at this point, with a message that level 6 has no route — that's Task 4's job, not this one. Every other suite should still pass.

- [ ] **Step 3: Commit**

```bash
git add games/pushkar-ball/js/levels.js
git commit -m "$(cat <<'EOF'
Add level six: the pressure switch, and everything taught before it

The switch's one new idea, taught by a puzzle where the closed gate
does double duty as the thing that stops the pushed crate exactly on
the plate. A gap, a stone step and a walker all recur from earlier
levels rather than being re-taught. finish.mjs's route and
switch-necessity check are Task 4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Prove level six can be finished, and only with the switch

**Files:**
- Modify: `games/pushkar-ball/tests/offline/finish.mjs`

- [ ] **Step 1: Read the current routes table**

Before editing, re-read `games/pushkar-ball/tests/offline/finish.mjs`'s `ROUTES` object, in particular level 3's route (the crate-push-then-hop pattern: run, push until the crate stops moving against something solid, then act). Level 6's route needs the same "push until it stops" shape, but simpler — there is no hopping onto the crate afterward, since the crate is left behind and the route just keeps running once the gate has had time to open.

- [ ] **Step 2: Add level 6's route**

In `games/pushkar-ball/tests/offline/finish.mjs`, find the `ROUTES` object and add a new entry for id `6`, right after level 5's:

```javascript
  // Level six: run to the crate, push it onto the plate — it comes to rest
  // against the closed gate's own face, the same way level three's crate
  // comes to rest against its ledge face — then just keep holding right.
  // The gate takes CONFIG.GATE.OPEN_TIME to swing open once pressed; the
  // runner has no reason to stop and wait, since by the time the ball
  // finishes crossing the now-empty flat between the crate and the gate,
  // the gate has had time to open.
  6: (level, lead) => {
    const run = runner(level, lead);
    const crate = level.crates[0];
    const sw = level.switches[0];
    let stage = 'run', stuck = 0, lastX = crate.x;
    return (ball) => {
      if (stage === 'run') {
        if (ball.grounded && ball.y > 700 && ball.x > crate.x - 200 && ball.x < crate.x) stage = 'push';
        else return run(ball);
      }
      if (stage === 'push') {
        stuck = Math.abs(crate.x - lastX) < 0.01 && crate.x + crate.w > sw.x + sw.w - 5 ? stuck + 1 : 0;
        lastX = crate.x;
        if (stuck > 30) stage = 'through';
        return { right: true };
      }
      // Through: nothing left for the generic runner's own checks (edges,
      // spikes, crates, steps) to react to on this stretch, so just hold
      // right — the gate opens on its own.
      return { right: true };
    };
  },
```

- [ ] **Step 3: Run the finish suite and confirm level 6 is finished cleanly**

Run: `node games/pushkar-ball/tests/run.mjs finish`

Expected: level 6 appears in case 1's per-level report ("finished every time without failing") and in case 2's per-checkpoint report. If any run fails, read the specific `lead`/`delay` combination it names. A likely cause is the route's `stage === 'push'` condition never being satisfied if the crate or switch geometry has shifted from Task 3's exact numbers — if so, adjust level 6's `boxes`/`switches`/`gates` x-coordinates in `games/pushkar-ball/js/levels.js` (not the route here), then re-run.

- [ ] **Step 4: Add the "cannot be finished without the switch" case**

This is level 3's and level 5's own "cannot be finished without X" case, adapted: remove level 6's switch (so its gate can never be pressed and stays permanently closed) and confirm nothing gets past the gate.

Find the end of case 3b in `finish.mjs` (level five without its gate pad, ending around the line `else console.log(...)`) and, after that case's closing `}`, before case 4 ("exhausting hearts mid-level"), add:

```javascript
// --- 3c. level six cannot open its gate without the switch -----------------
//
// Remove the switch entirely, so `g.switchId` matches nothing and the gate
// finds no switch to read `pressed` from — the same "unfound reference
// behaves as false" `Level.update`'s own `sw && sw.pressed` already falls
// back to — and confirm the gate simply never opens.
console.log('\n3c. level six without its switch');
{
  const data = LEVELS.find((l) => l.id === 6);
  if (!data) fail('there is no level 6');
  else {
    const bare = { ...data, switches: [] };
    const gateX = data.gates[0].x;
    let cleared = 0, tries = 0;
    for (let from = gateX - 700; from <= gateX - 100; from += 20) {
      tries++;
      const { ball } = play({ ...bare, spawn: { x: from, y: 600 } }, () => (b) => ({ right: true }), { seconds: 8 });
      if (ball.x > gateX + 100) cleared++;
    }
    if (cleared) fail(`level 6 was cleared past the gate ${cleared} time(s) of ${tries} without its switch — the gate no longer needs it`);
    else console.log(`   ${tries} tries without it, none got past the gate at x=${gateX}`);
  }
}
```

- [ ] **Step 5: Run the finish suite again and confirm both new cases pass**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: case 1 and 2 still report level 6 finished cleanly; the new case 3c reports 0 clears without the switch.

- [ ] **Step 6: Run the full suite, offline and browser**

Run: `node games/pushkar-ball/tests/run.mjs`
Expected: all suites pass — this needs a local Chrome install and starts its own server, per the file's own header comment.

- [ ] **Step 7: Look at level 6**

Per this game's own "Look at it" rule, render level 6 and actually look at it before considering it done.

There is no in-game level select (`ui.js` notes "level select is phase 4"), so temporarily jump straight to level 6. In `games/pushkar-ball/js/main.js`, find:

```javascript
flow.start(0);
```

Change the `0` to `5` (level 6 is `LEVELS[5]`, the sixth entry):

```javascript
flow.start(5);
```

Start the local server (`node games/pushkar-ball/tests/run.mjs` starts one and leaves it running while its suites execute) and open `http://127.0.0.1:8778/games/pushkar-ball/index.html` in a real browser. Roll through the level and confirm by eye:

- The switch plate reads as "put something here," not as ordinary ground or a crate.
- The closed gate reads as stone, not wood — and as a deliberate obstacle worth noticing.
- Pushing the crate onto the plate visibly sinks it a little, and the gate visibly slides upward and out of the way — not an instant snap, not a vanish.
- Walking through the now-open gate feels clear; nothing about the animation leaves a lingering sliver of the gate in the ball's way.

Then revert the change:

```javascript
flow.start(0);
```

Confirm the revert with `git diff games/pushkar-ball/js/main.js` — it must show no changes before continuing. Do not commit `flow.start(5)`.

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/tests/offline/finish.mjs
git commit -m "$(cat <<'EOF'
Prove level six can be finished, and only with its switch

A route (push the crate onto the plate against the closed gate's own
face, then hold right through the gate's opening), plus level
three/five's own "cannot be finished without X" pattern adapted for
the switch: remove it and confirm nothing gets past the gate.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: A third, farthest hill band

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (one new `PARALLAX` entry, one new colour)

This is Part B's first task. Nothing here touches `physics.js`, `player.js`, or any offline-tested simulation file — `drawParallax` in `main.js` already loops over `CONFIG.PARALLAX` generically, so a richer background is entirely config data from here through Task 8.

- [ ] **Step 1: Add the colour**

In `games/pushkar-ball/js/config.js`, find:

```javascript
    HILL_FAR: '#8ED6A0',
    HILL_NEAR: '#63BE7B',
```

Change it to:

```javascript
    // A third, farthest band behind the existing two, for more depth. Pale
    // and desaturated relative to HILL_FAR/HILL_NEAR, the way real distant
    // hills read hazier — and, checked against IS_BALL in
    // tests/browser/_helpers.mjs the same way every colour here is: r-b is
    // small and negative, nowhere near being mistaken for the ball.
    HILL_FARTHEST: '#CFE8DA',
    HILL_FAR: '#8ED6A0',
    HILL_NEAR: '#63BE7B',
```

- [ ] **Step 2: Add the band, farthest first**

In `games/pushkar-ball/js/config.js`, find:

```javascript
  PARALLAX: [
    { colour: 'HILL_FAR', factor: 0.25, top: 0.62, amp: 40, span: 140 },
    { colour: 'HILL_NEAR', factor: 0.45, top: 0.74, amp: 30, span: 95 },
  ],
```

Change it to:

```javascript
  PARALLAX: [
    // Farthest first: `drawParallax` draws in array order, so this must
    // come before HILL_FAR or it would paint over it instead of sitting
    // behind it. Slower (a smaller factor) and higher (a smaller top) than
    // HILL_FAR, for the usual parallax reason things farther away move less
    // and sit higher in the frame.
    { colour: 'HILL_FARTHEST', factor: 0.12, top: 0.52, amp: 55, span: 200 },
    { colour: 'HILL_FAR', factor: 0.25, top: 0.62, amp: 40, span: 140 },
    { colour: 'HILL_NEAR', factor: 0.45, top: 0.74, amp: 30, span: 95 },
  ],
```

- [ ] **Step 3: Confirm nothing crashes**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass — `drawParallax` is draw-only and touches no simulation state, so no offline suite exercises it at all; this only confirms the config file itself still parses and loads cleanly.

- [ ] **Step 4: Commit**

```bash
git add games/pushkar-ball/js/config.js
git commit -m "$(cat <<'EOF'
Add a third, farthest hill band

drawParallax already loops over CONFIG.PARALLAX generically, so this
is config data only: one more band, slower and higher than the
existing two, drawn first so it sits behind them.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: A sun and drifting clouds

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (new `SUN` and `CLOUDS` blocks, two new colours)
- Modify: `games/pushkar-ball/js/main.js` (new `drawSun`/`drawClouds`, wired into `draw()`)

- [ ] **Step 1: Add the config**

In `games/pushkar-ball/js/config.js`, find the `PARALLAX` block from Task 5 (it now ends with `{ colour: 'HILL_NEAR', ... },\n  ],`). Immediately after it, insert:

```javascript

  // ---------------------------------------------------------------------
  // Sun and clouds
  // ---------------------------------------------------------------------
  // Both drawn in screen space, before the hills, so they sit farthest back
  // of anything. The sun barely moves — X/Y are fixed fractions of the
  // screen — since a real sun this far away wouldn't visibly shift as the
  // level scrolls. Clouds do drift, using the same wrap-around trick the
  // hills use for an endless band, but discrete shapes instead of a
  // continuous sine, since a cloud is a puff, not a wave.
  SUN: {
    X: 0.78, Y: 0.20,   // screen fractions
    R: 46,
    GLOW: 2.2,          // glow radius as a multiple of R
  },
  CLOUDS: {
    COUNT: 4,
    FACTOR: 0.08,       // parallax factor, slower than any hill band
    TOP: 0.14,          // screen fraction
    STAGGER: 34,        // every other cloud sits this much lower
    SIZE: 46,
  },
```

- [ ] **Step 2: Add the colours**

In `games/pushkar-ball/js/config.js`, find:

```javascript
    HILL_FARTHEST: '#CFE8DA',
```

Add immediately after it:

```javascript
    // Both a warm yellow, the same family FLAG and the results panel's star
    // already use — checked the same way against IS_BALL: r-b clears 60,
    // but green sits far enough above blue that the second clause fails, so
    // neither is ever picked up as the ball.
    SUN: '#FFE066',
    SUN_GLOW: 'rgba(255, 224, 128, 0.30)',
    CLOUD: 'rgba(255, 255, 255, 0.85)',
```

- [ ] **Step 3: Write `drawSun` and `drawClouds`**

In `games/pushkar-ball/js/main.js`, find `drawParallax` (it ends with a closing `}` right before the `/**\n * The ground...` comment). Immediately before `drawParallax`, insert:

```javascript
/**
 * The sun: a disc plus a soft glow, fixed at its own screen fraction. It
 * does not scroll with the level at all — a sun this far away wouldn't
 * visibly move as the camera pans a few thousand units.
 */
function drawSun() {
  const C = CONFIG.COLOURS;
  const S = CONFIG.SUN;
  const cx = cssW * S.X, cy = cssH * S.Y;

  const glow = ctx.createRadialGradient(cx, cy, S.R * 0.5, cx, cy, S.R * S.GLOW);
  glow.addColorStop(0, C.SUN_GLOW);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, S.R * S.GLOW, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = C.SUN;
  ctx.beginPath();
  ctx.arc(cx, cy, S.R, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A handful of drifting clouds, wrapped around so the band is endless — the
 * same reason the hills wrap, but as discrete puffs on a repeating spacing
 * rather than a continuous sine, since a cloud has a shape a sine doesn't.
 */
function drawClouds() {
  const C = CONFIG.COLOURS;
  const CL = CONFIG.CLOUDS;
  const spacing = cssW / CL.COUNT + CL.SIZE * 2;
  const total = spacing * CL.COUNT;
  const shift = camera.x * CL.FACTOR * scale;
  ctx.fillStyle = C.CLOUD;
  for (let i = 0; i < CL.COUNT; i++) {
    const raw = i * spacing - shift;
    const x = ((raw % total) + total) % total - CL.SIZE;
    const y = cssH * CL.TOP + (i % 2) * CL.STAGGER;
    drawCloudPuff(x, y, CL.SIZE);
  }
}

/** One cloud: three overlapping circles, wide and flat rather than round. */
function drawCloudPuff(x, y, size) {
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.6, size * 0.32, 0, 0, Math.PI * 2);
  ctx.ellipse(x - size * 0.4, y + size * 0.08, size * 0.4, size * 0.24, 0, 0, Math.PI * 2);
  ctx.ellipse(x + size * 0.45, y + size * 0.05, size * 0.42, size * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
}

```

- [ ] **Step 4: Wire both into `draw()`, before the hills**

In `games/pushkar-ball/js/main.js`, find:

```javascript
  const sky = ctx.createLinearGradient(0, 0, 0, cssH);
  sky.addColorStop(0, C.SKY_TOP);
  sky.addColorStop(1, C.SKY_LOW);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssW, cssH);

  drawParallax();
```

Change it to:

```javascript
  const sky = ctx.createLinearGradient(0, 0, 0, cssH);
  sky.addColorStop(0, C.SKY_TOP);
  sky.addColorStop(1, C.SKY_LOW);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssW, cssH);

  drawSun();
  drawClouds();
  drawParallax();
```

- [ ] **Step 5: Confirm nothing crashes**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass — this is draw-only code with no effect on simulation state.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/main.js
git commit -m "$(cat <<'EOF'
Add a sun and drifting clouds

The sun is fixed at its own screen fraction and doesn't scroll - a
sun this far away wouldn't visibly move as the camera pans. Clouds
wrap around on a repeating spacing, the same endless-band idea the
hills already use, but as discrete puffs since a cloud has a shape a
sine doesn't.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Ground texture — rock speckle, strata, and flowers

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (new `GROUND_TEXTURE` block, three new colours)
- Modify: `games/pushkar-ball/js/main.js` (extend `drawGround`, add a small deterministic hash helper)

- [ ] **Step 1: Add the config**

In `games/pushkar-ball/js/config.js`, find the `CLOUDS` block from Task 6 (it ends with `SIZE: 46,\n  },`). Immediately after it, insert:

```javascript

  // ---------------------------------------------------------------------
  // Ground texture
  // ---------------------------------------------------------------------
  // Everything below is positioned deterministically from world X through
  // `groundHash` in main.js — the same reasoning the hills' own sine phase
  // already follows: nothing here is saved, and nothing jitters between
  // frames, because the same X always hashes to the same texture.
  GROUND_TEXTURE: {
    STRATA_DEPTHS: [50, 110],      // px below the surface, each one line
    ROCK_SPACING: 90,              // px between rock candidates
    ROCK_MIN_DEPTH: 20,
    ROCK_MAX_DEPTH: 140,
    ROCK_R: 10,
    FLOWER_SPACING: 70,            // px between flower candidates
    FLOWER_CHANCE: 0.35,           // fraction of candidates that get one
    FLOWER_R: 3,
  },
```

- [ ] **Step 2: Add the colours**

In `games/pushkar-ball/js/config.js`, find:

```javascript
    GROUND: '#7ED957',
    GROUND_EDGE: '#4E9E38',
```

Add immediately after it:

```javascript
    // Both small r-b, well clear of IS_BALL regardless of green — dark
    // enough to read as buried dirt and rock rather than anything else
    // drawn here.
    GROUND_STRATA: '#4A3222',
    GROUND_ROCK: '#8B7D6B',
    // Two flowers plus plain white. FLOWER_C's r-b clears 60 on its own,
    // but the same second-clause check every warm colour here gets (green
    // sits far enough above blue) keeps it clear of IS_BALL, the same
    // reasoning FLAG and SUN already rely on.
    FLOWER_A: '#FFFFFF',
    FLOWER_B: '#FFD3E0',
    FLOWER_C: '#FFF3B0',
```

- [ ] **Step 3: Add a deterministic hash helper**

In `games/pushkar-ball/js/main.js`, find `drawGround` (it starts with `function drawGround() {`). Immediately before it, insert:

```javascript
/**
 * A plain, stateless pseudo-random value in [0, 1) for a number — the
 * classic sine-based GLSL hash. Used to scatter ground texture from world
 * position alone, so the same X always draws the same rock or flower and
 * nothing has to be saved or recomputed between frames.
 */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** The ground polyline's own y at a given x, by linear interpolation. */
function yOnLine(line, x) {
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, y0] = line[i], [x1, y1] = line[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return line[line.length - 1][1];
}

```

- [ ] **Step 4: Extend `drawGround`**

In `games/pushkar-ball/js/main.js`, find the whole `drawGround` function:

```javascript
function drawGround() {
  const C = CONFIG.COLOURS;
  for (const line of level.data.ground || []) {
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
    ctx.lineTo(line[line.length - 1][0], level.bounds.h);
    ctx.lineTo(line[0][0], level.bounds.h);
    ctx.closePath();
    ctx.fillStyle = C.GROUND;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
    ctx.strokeStyle = C.GROUND_EDGE;
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}
```

Replace it with:

```javascript
function drawGround() {
  const C = CONFIG.COLOURS;
  const T = CONFIG.GROUND_TEXTURE;
  for (const line of level.data.ground || []) {
    const fillPath = () => {
      ctx.beginPath();
      ctx.moveTo(line[0][0], line[0][1]);
      for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
      ctx.lineTo(line[line.length - 1][0], level.bounds.h);
      ctx.lineTo(line[0][0], level.bounds.h);
      ctx.closePath();
    };

    fillPath();
    ctx.fillStyle = C.GROUND;
    ctx.fill();

    // Rock speckle and strata lines, clipped to the same filled shape so
    // neither ever draws outside the dirt body regardless of slope.
    ctx.save();
    fillPath();
    ctx.clip();

    ctx.strokeStyle = C.GROUND_STRATA;
    ctx.lineWidth = 3;
    for (const depth of T.STRATA_DEPTHS) {
      ctx.beginPath();
      ctx.moveTo(line[0][0], line[0][1] + depth);
      for (const [x, y] of line.slice(1)) ctx.lineTo(x, y + depth);
      ctx.stroke();
    }

    ctx.fillStyle = C.GROUND_ROCK;
    const x0 = line[0][0], x1 = line[line.length - 1][0];
    for (let x = x0; x < x1; x += T.ROCK_SPACING) {
      const h1 = hash(x), h2 = hash(x + 0.37);
      const surface = yOnLine(line, x);
      const y = surface + T.ROCK_MIN_DEPTH + h2 * (T.ROCK_MAX_DEPTH - T.ROCK_MIN_DEPTH);
      ctx.beginPath();
      ctx.ellipse(x + h1 * T.ROCK_SPACING * 0.6, y, T.ROCK_R * (0.6 + h1 * 0.4), T.ROCK_R * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Flowers sit ON TOP of the grass edge, drawn after the clip is lifted
    // so they aren't cut off at the ground's own top boundary.
    const flowerColours = [C.FLOWER_A, C.FLOWER_B, C.FLOWER_C];
    for (let x = x0; x < x1; x += T.FLOWER_SPACING) {
      const h = hash(x + 100);
      if (h > T.FLOWER_CHANCE) continue;
      const y = yOnLine(line, x);
      ctx.fillStyle = flowerColours[Math.floor(h / T.FLOWER_CHANCE * flowerColours.length) % flowerColours.length];
      ctx.beginPath();
      ctx.arc(x, y - 4, T.FLOWER_R, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
    ctx.strokeStyle = C.GROUND_EDGE;
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}
```

- [ ] **Step 5: Confirm nothing crashes**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass — this is draw-only code with no effect on simulation state.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/main.js
git commit -m "$(cat <<'EOF'
Texture the ground: rock speckle, strata lines, and flowers

Everything positioned deterministically from world X through a small
stateless hash, the same reasoning the hills' own sine phase already
follows - nothing saved, nothing jittering between frames. Rocks and
strata are clipped to the ground's own filled shape so neither draws
outside the dirt body on a slope.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: A decorative water band in gaps

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (new `WATER` block, two new colours)
- Modify: `games/pushkar-ball/js/main.js` (new `drawWater`, wired into `draw()`)

- [ ] **Step 1: Add the config**

In `games/pushkar-ball/js/config.js`, find the `GROUND_TEXTURE` block from Task 7 (it ends with `FLOWER_R: 3,\n  },`). Immediately after it, insert:

```javascript

  // ---------------------------------------------------------------------
  // Water (decorative only)
  // ---------------------------------------------------------------------
  // A cosmetic band drawn wherever two ground polylines leave a gap between
  // them — not a hazard and not the buoyancy/floating-crate mechanic from
  // the original Red Ball 4-inspired list, which is a separate, unscoped
  // item. The ball still simply falls through a gap exactly as it always
  // has; this only gives the gap something to fall PAST, the way the
  // reference screenshots showed water below a cliff edge.
  WATER: {
    DEPTH_BELOW: 30,        // px below the lower of the two cliff edges
    RIPPLE_OFFSETS: [40, 90],
  },
```

- [ ] **Step 2: Add the colours**

In `games/pushkar-ball/js/config.js`, find:

```javascript
    FLOWER_C: '#FFF3B0',
```

Add immediately after it:

```javascript
    // Both blue-dominant — r-b is strongly negative for each, nowhere near
    // IS_BALL regardless of green.
    WATER: '#2E9CCA',
    WATER_RIPPLE: '#BFE9F5',
```

- [ ] **Step 3: Write `drawWater`**

In `games/pushkar-ball/js/main.js`, find `drawGround` (the function extended in Task 7). Immediately after its closing `}`, insert:

```javascript

/**
 * A cosmetic water band under every gap between two ground polylines —
 * computed straight from `level.data.ground`, the same "an edge with
 * nothing continuing from it" idea tests/offline/finish.mjs's own `runner`
 * already uses to find where a jump is needed, just applied to drawing
 * instead of driving. Purely decorative: the ball still just falls through
 * a gap, exactly as it always has.
 */
function drawWater() {
  const C = CONFIG.COLOURS;
  const W = CONFIG.WATER;
  const lines = level.data.ground || [];
  for (let i = 0; i < lines.length - 1; i++) {
    const endA = lines[i][lines[i].length - 1];
    const startB = lines[i + 1][0];
    const gapW = startB[0] - endA[0];
    if (gapW < 20) continue;   // touching, not a real gap

    const top = Math.max(endA[1], startB[1]) + W.DEPTH_BELOW;
    ctx.fillStyle = C.WATER;
    ctx.fillRect(endA[0], top, gapW, level.bounds.h - top);

    ctx.strokeStyle = C.WATER_RIPPLE;
    ctx.lineWidth = 2;
    for (const dy of W.RIPPLE_OFFSETS) {
      ctx.beginPath();
      ctx.moveTo(endA[0], top + dy);
      ctx.lineTo(startB[0], top + dy);
      ctx.stroke();
    }
  }
}
```

- [ ] **Step 4: Wire it into `draw()`**

In `games/pushkar-ball/js/main.js`, find:

```javascript
  drawGround();
  drawWalls();
```

Change it to:

```javascript
  drawGround();
  drawWater();
  drawWalls();
```

- [ ] **Step 5: Confirm nothing crashes**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass — draw-only, no effect on simulation state.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/main.js
git commit -m "$(cat <<'EOF'
Add a decorative water band under every gap

Computed straight from the ground data's own polyline edges - the
same "an edge nothing continues from" idea finish.mjs's runner
already uses to find where a jump is needed, applied to drawing
instead. Purely cosmetic: the ball still just falls through a gap.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Look at all six levels, and document both pieces

**Files:**
- Modify: `docs/superpowers/specs/2026-09-13-pressure-switch-and-scenery-design.md`

- [ ] **Step 1: Look at the new background on every level, at both required sizes**

Per this game's own "Look at it" rule and its "must check 568×320 and 740×280" rule for anything full-screen, this step is required, not optional — most of this game's real bugs were found by rendering and looking, and the hill-parallax bug class (a band too wide to read as a hill at phone width) has happened before.

Start the local server (`node games/pushkar-ball/tests/run.mjs` starts one and leaves it running while its suites execute) and open `http://127.0.0.1:8778/games/pushkar-ball/index.html` in a real browser, resized to each of 568×320 and 740×280 in turn (or use your browser's device toolbar to set the exact viewport). For at least levels 1, 3, and 6 (the tutorial, the crate level, and the new switch level), confirm by eye:

- The sun and clouds are visible and don't crowd or overlap the heart/button HUD at either size.
- The third hill band reads as a hill, not a flat wash, at both sizes — if it doesn't, the span in `CONFIG.PARALLAX`'s `HILL_FARTHEST` entry needs adjusting the same way `HILL_FAR`/`HILL_NEAR`'s already were (see the comment on `PARALLAX` in `config.js` for the wavelength math).
- The ground's rock speckle and strata read as texture, not clutter, and don't obscure any obstacle (a crate, a spike patch, a step) that sits directly on top of the ground.
- Flowers don't visibly collide with or overlap a checkpoint flag, a switch plate, or any other ground-level decoration.
- The water band under a gap looks like it belongs below the cliff edges on either side, at both screen sizes, and doesn't extend past the level's own bounds.

If anything needs a numeric adjustment, change the relevant `CONFIG` value (never a coordinate typed into `main.js` directly) and re-check.

- [ ] **Step 2: Mark the spec's status**

In `docs/superpowers/specs/2026-09-13-pressure-switch-and-scenery-design.md`, find the first line:

```markdown
# Pressure switch + gate (level 6) and a richer shared background
```

Change it to:

```markdown
# Pressure switch + gate (level 6) and a richer shared background — DONE
```

Then find the "Where this fits" section's opening sentence:

```markdown
This is the first of several independent follow-up mechanics from the Red
Ball 4-inspired list. The rest (see-saws/weight puzzles, moving carts,
buoyancy/floating crates, timed triggers, key-lock doors, laser boundaries,
gravity-warping, and smarter enemy variants) remain unscoped and will each
get their own brainstorming pass, in whatever order is chosen when this one
ships.
```

Change it to:

```markdown
This was the first of several independent follow-up mechanics from the Red
Ball 4-inspired list, implemented by
`docs/superpowers/plans/2026-09-13-pressure-switch-and-scenery.md`. The rest
(see-saws/weight puzzles, moving carts, buoyancy/floating crates, timed
triggers, key-lock doors, laser boundaries, gravity-warping, and smarter
enemy variants) remain unscoped and will each get their own brainstorming
pass, in whatever order is chosen next.
```

- [ ] **Step 3: Run the full offline suite one more time**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass (docs-only change in this step, but confirms nothing was accidentally left in a code file — e.g. the `flow.start(5)` debugging change from Task 4, Step 7).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-13-pressure-switch-and-scenery-design.md
git commit -m "$(cat <<'EOF'
Mark the pressure switch and scenery spec done

Both pieces are implemented and looked at on every level at 568x320
and 740x280. The rest of the Red Ball 4-inspired mechanic list stays
unscoped, one brainstorming pass at a time.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
