# Balance Beam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a balance-beam puzzle mechanic to Pushkar Ball — a plank that pivots on a fulcrum, resting tilted (one end down on an entry ledge, the other dangling out of reach over a gap) until a crate is pushed past the fulcrum, whose weight levels it so the ball can cross — plus a new level 7 built around it.

**Architecture:** The beam is a new kind of dynamic collider, like a gate or a crate: it is not part of the static grid, and its segment is rebuilt every step from its current state (here, an angle, rather than a position). Level.update computes each beam's target angle from the crates currently resting on it (never the ball itself — the same rule the pressure switch already follows) and eases the actual angle toward that target, the same bounded-lerp idiom `rampToward` already gives the gate's height.

**Important deviation from the approved spec:** The spec (`docs/superpowers/specs/2026-09-13-balance-beam-design.md`, Section 3) called for a new "per-rider delta function" carrier contract, reasoning that a rotating carrier moves different points by different amounts and so cannot share one flat `dx`/`dy` the way a gate or mover does. Working through the physics in detail during planning found that contract is not actually needed:

- A **crate** resting on the beam needs no carrying code at all. `supportUnder` already recomputes a crate's resting height fresh every step from whatever segment is currently under it — that is simply how a crate already rides a slope, and a beam is a slope that happens to change angle slowly over time. Working this through further also found that `Level.update` does not even need to know *which specific segment* a crate is resting on: a plain geometric check — is this crate grounded, and is its centre currently between the beam's own two endpoints — is enough to decide whether it weighs the beam down, with no change to `physics.js` or to `makeCrate` at all. A segment-ownership check was the first design (and would have needed `supportUnder` to report which segment it found), but it has a real failure mode this simpler check does not: right as a crate is pushed far enough to matter, its footprint can start to overlap the real ground beyond the beam too, and whichever of the two segments happens to be checked first "wins" a tie — which could silently stop counting the crate's weight at exactly the moment the puzzle is being solved. A horizontal-range check has no such tie to lose.
- The **ball** needs no carrying code either. Physics.js's `resolve()` already pushes the ball out whenever a segment's surface moves *up into* it — which is exactly what happens on the side of the beam that is rising as it levels — and that is the side the ball is actually riding while it pushes the crate across (the ball follows behind the crate, on the entry half, which rises as the beam levels). The far/descending side only matters for a moment right after the crate has already crossed, and the beam only moves a tiny amount per frame (bounded by `SWING_TIME`), so any lag there is sub-pixel and self-corrects within a frame or two via ordinary gravity, imperceptible in play.

So the beam still exposes the same four carrier fields (`dx`, `dy`, `vx`, `vy`) every carrier does — `player.js` reads `this.platform.dx`/`.dy` unconditionally the instant the ball is standing on anything, and an object with no such fields would turn the ball's position to `NaN` the first frame it stood on one, exactly the bug class `CLAUDE.md` warns about. But for the beam they are **permanently zero**, not a translation — a deliberate, documented difference from every other carrier, not an oversight. This removes an entire, error-prone piece of trigonometry from the implementation with no loss of correctness, at the cost of the spec's Section 3 no longer describing what got built. If the "look at it" pass in Task 5 finds the ball's ride feels wrong in a way this reasoning missed, that is the moment to revisit it — not before.

**A second thing found only by tracing the physics by hand, with no way to run it before implementation:** a beam resting at too shallow an angle can act as a launch ramp — the ball could roll up the unlevelled beam under its own sustained acceleration and simply fly across the gap, never needing the crate at all. Two things have to both hold for the numbers below to close that off:

1. The beam must still count as *ground* the ball can stand on and accelerate along at all, which needs its slope's normal to satisfy `ny < CONFIG.GROUND_NY` (i.e. **less steep than about 53°** — see `physics.js`'s `segment()` and `GROUND_NY: -0.6` in `config.js`), or a crate could never be pushed onto it and rest there in the first place either.
2. Gravity's pull along that same slope must exceed `CONFIG.ACCEL` (i.e. **steeper than about 47°**), or the ball can out-accelerate gravity and climb it anyway.

That leaves a narrow window, roughly 47°–53°, and Task 3 picks a value inside it (50°) with the reasoning shown in that task. **This is exactly the kind of number this project has always tuned by running `finish.mjs` and adjusting, not by trusting arithmetic alone** — level two's and level three's own walker placements went through the same process, by their own comments. Task 4's negative check is what actually proves this, and if it does not pass on the first try, steepen `minAngle` (toward 53°) or shorten `halfLength` and re-run it, rather than assuming the number above is exactly right.

**Tech Stack:** Vanilla JS (ES modules), no build step. Tests run under plain node via `games/pushkar-ball/tests/run.mjs offline` (add `browser` or no filter to include the browser suites).

**Spec:** `docs/superpowers/specs/2026-09-13-balance-beam-design.md`

---

### Task 1: The beam — engine wiring and a test suite

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (new `BEAM` block)
- Modify: `games/pushkar-ball/js/levels.js` (new `beams` data, `makeBeam`, wiring into `update`/`solidsFor`/`near`)
- Test: `games/pushkar-ball/tests/offline/beams.mjs` (new file)

- [ ] **Step 1: Add the `BEAM` config block**

In `games/pushkar-ball/js/config.js`, find the `GATE` block:

```javascript
  GATE: {
    // Seconds for a full swing, either direction, closed to open or back.
    // A gate slides its own height straight up — the "portcullis into a
    // slot above" reading, not a wall that simply vanishes, since this game
    // has no precedent for solid geometry disappearing outright and that
    // would read as a glitch rather than a mechanism.
    OPEN_TIME: 0.6,
  },
```

Add immediately after it:

```javascript
  BEAM: {
    // Seconds for a full swing between a beam's minAngle and maxAngle, in
    // either direction. Reuses the gate's own "OPEN_TIME"-style single
    // duration, the same bounded, non-instant lerp idiom.
    SWING_TIME: 1.0,
    // Radians of TARGET angle added per world-unit a resting crate's centre
    // sits past the fulcrum (positive = toward the far/exit end; negative
    // offsets, a crate still on the near/entry side, are clamped away by
    // the target's own minAngle floor and so contribute nothing). Only a
    // crate weighs a beam down, never the ball itself — the same rule the
    // pressure switch already follows, so the puzzle is always about where
    // the crate ends up, not about standing somewhere. See
    // docs/superpowers/specs/2026-09-13-balance-beam-design.md.
    ANGLE_PER_OFFSET: 0.0145,
  },
```

- [ ] **Step 2: Add the beam's colours**

In `games/pushkar-ball/js/config.js`, find:

```javascript
    SWITCH_PLATE: '#5E6B73',
    SWITCH_PLATE_EDGE: '#3E474D',
```

Add immediately after it:

```javascript
    // A stone-family grey, distinct from CRATE's wood — the beam itself
    // cannot be pushed, only ridden or weighed down by a crate, so it must
    // never read as pushable the way the gate already doesn't.
    BEAM: '#8D99A6',
    BEAM_PIVOT: '#6B7680',
```

- [ ] **Step 3: Add `makeBeam`**

In `games/pushkar-ball/js/levels.js`, find `makeGate` (it ends with its closing `}` right before the `/**\n * A wooden crate...` comment). Immediately after `makeGate`'s closing `}`, insert:

```javascript

/**
 * A balance beam: a plank that pivots about a fixed fulcrum, tilting toward
 * whichever end carries more weight. Only a crate weighs it down — never the
 * ball — the same rule the pressure switch already follows, so the puzzle is
 * always about where the crate ends up, not about standing somewhere.
 *
 * Unlike a gate or a mover, which only ever translate, a beam ROTATES: its
 * two endpoints are recomputed from its current angle every step, the same
 * way a gate rebuilds its box from its current height. Nothing riding it
 * needs any special carrying code for that: a crate's resting height is
 * already recalculated fresh every step from whatever segment is under it —
 * `Level.update` (see levels.js) decides which crates weigh a beam down with
 * a plain horizontal check, nothing here or in `makeCrate` — so it simply
 * rides the beam's changing surface at its own fixed x, the same way it
 * already rides any other changing floor. The ball needs none either —
 * standing on a surface that is rising into it is already handled by
 * ordinary contact resolution in physics.js, the same as standing at the
 * foot of a slope that is itself slowly rising. See this plan's own
 * "Important deviation from the approved spec" note for the full reasoning,
 * including why it still carries the same four carrier fields every other
 * carrier does (`dx`/`dy`/`vx`/`vy`, all permanently zero here rather than a
 * translation) — `player.js` reads `platform.dx`/`.dy` unconditionally the
 * moment the ball is standing on anything, and their absence is the exact
 * NaN bug CLAUDE.md already warns about.
 */
function makeBeam(b) {
  const beam = {
    ...b,               // x, y (fulcrum), halfLength, minAngle, maxAngle
    angle: b.minAngle,
    ax: 0, ay: 0, bx: 0, by: 0,
    dx: 0, dy: 0, vx: 0, vy: 0,
    segments: [],

    _reseg() {
      const dirX = Math.cos(beam.angle), dirY = Math.sin(beam.angle);
      beam.ax = b.x - b.halfLength * dirX;
      beam.ay = b.y - b.halfLength * dirY;
      beam.bx = b.x + b.halfLength * dirX;
      beam.by = b.y + b.halfLength * dirY;
      beam.segments = [segment(beam.ax, beam.ay, beam.bx, beam.by)];
      for (const s of beam.segments) s.owner = beam;
    },

    /**
     * Ease the angle toward wherever this step's torque points it, and
     * rebuild the segment from the result. `torque` is the sum, over every
     * crate currently resting on this beam, of how far past the fulcrum
     * (world x, positive toward the far/exit end) its centre sits — see
     * `Level.update`, the only caller and the only place that knows which
     * crates are resting on which beam.
     */
    update(dt, torque) {
      const raw = b.minAngle + torque * CONFIG.BEAM.ANGLE_PER_OFFSET;
      const target = Math.min(b.maxAngle, Math.max(b.minAngle, raw));
      beam.angle = rampToward(beam.angle, target, dt, 1 / CONFIG.BEAM.SWING_TIME);
      beam._reseg();
    },

    overlaps(x, y, r) {
      const minX = Math.min(beam.ax, beam.bx) - r, maxX = Math.max(beam.ax, beam.bx) + r;
      const minY = Math.min(beam.ay, beam.by) - r, maxY = Math.max(beam.ay, beam.by) + r;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    },
  };
  beam._reseg();
  return beam;
}
```

`makeCrate` itself needs no changes at all — `Level.update` (Step 4 below) decides whether a crate weighs a beam down purely from the crate's own `x`/`w`/`grounded`, which already exist.

- [ ] **Step 4: Wire beams into the `Level` class**

In `games/pushkar-ball/js/levels.js`, find:

```javascript
    // Gates ARE colliders, but dynamic ones — they move, so like crates and
    // movers they must stay OUT of the static grid built below.
    this.gates = (data.gates || []).map(makeGate);
```

Add immediately after it:

```javascript

    // Beams ARE colliders too, and dynamic for the same reason gates are —
    // they move (rotate, in this case), so they must stay OUT of the static
    // grid built below.
    this.beams = (data.beams || []).map(makeBeam);
```

Then find `update(dt)`:

```javascript
  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
    for (const e of this.enemies) e.update(dt, this.time, this, CONFIG);
```

Add the beam step right after the crates line, before enemies:

```javascript
  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
    // A beam's torque comes only from crates resting on it — never the
    // ball — and crates are updated (this step's `grounded`/`x`, not last
    // step's) on the line just above. "Resting on it" is a plain horizontal
    // check — the crate is grounded and its centre sits between the beam's
    // own two current endpoints — rather than asking what specific segment
    // held it up: a crate pushed far enough to matter can start to overlap
    // the real ground beyond the beam too, and a segment-ownership check
    // would risk losing its weight to a tie at exactly the moment the
    // puzzle is being solved. See this plan's own "Important deviation"
    // note.
    for (const beam of this.beams) {
      const lo = Math.min(beam.ax, beam.bx), hi = Math.max(beam.ax, beam.bx);
      let torque = 0;
      for (const c of this.crates) {
        if (!c.grounded) continue;
        const cx = c.x + c.w / 2;
        if (cx < lo || cx > hi) continue;
        torque += cx - beam.x;
      }
      beam.update(dt, torque);
    }
    for (const e of this.enemies) e.update(dt, this.time, this, CONFIG);
```

Then find `solidsFor(crate)`:

```javascript
  solidsFor(crate) {
    const out = [...this.statics];
    for (const m of this.movers) out.push(...m.segments);
    for (const g of this.gates) out.push(...g.segments);
    for (const c of this.crates) if (c !== crate) out.push(...c.segments);
    return out;
  }
```

Add beams:

```javascript
  solidsFor(crate) {
    const out = [...this.statics];
    for (const m of this.movers) out.push(...m.segments);
    for (const g of this.gates) out.push(...g.segments);
    for (const beam of this.beams) out.push(...beam.segments);
    for (const c of this.crates) if (c !== crate) out.push(...c.segments);
    return out;
  }
```

Then find `near(x, y, r)`:

```javascript
  near(x, y, r) {
    const out = [...this.grid.near(x, y, r)];
    for (const m of this.movers) if (m.overlaps(x, y, r)) out.push(...m.segments);
    for (const g of this.gates) if (g.overlaps(x, y, r)) out.push(...g.segments);
    for (const c of this.crates) if (c.overlaps(x, y, r)) out.push(...c.segments);
    return out;
  }
```

Add beams the same way:

```javascript
  near(x, y, r) {
    const out = [...this.grid.near(x, y, r)];
    for (const m of this.movers) if (m.overlaps(x, y, r)) out.push(...m.segments);
    for (const g of this.gates) if (g.overlaps(x, y, r)) out.push(...g.segments);
    for (const beam of this.beams) if (beam.overlaps(x, y, r)) out.push(...beam.segments);
    for (const c of this.crates) if (c.overlaps(x, y, r)) out.push(...c.segments);
    return out;
  }
```

- [ ] **Step 5: Write the failing test suite**

Create `games/pushkar-ball/tests/offline/beams.mjs`:

```javascript
// A balance beam: a plank pivoting on a fulcrum, tilting toward whichever end
// a crate weighs down. This suite is about the MECHANISM in isolation — a
// small, hand-picked geometry, not level seven's own numbers — the same way
// switches.mjs tests the switch/gate mechanism on a stub level rather than on
// level six itself.
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
    if (ball) ball.update(CONFIG.STEP, input, level);
  }
};

// Fulcrum at (1000, 700), half-length 150, minAngle -30°: the entry (a) end
// sits at (1000 - 150*cos(30°), 700 + 150*sin(30°)) = (870, 775), and the
// far (b) end at (1130, 625) — both computed here with the same formula
// `makeBeam` uses, not retyped as separately-guessed literals, so this suite
// is checking the FORMULA against itself rather than against a number that
// could quietly drift from it.
const FX = 1000, FY = 700, HALF = 150, MIN_A = -Math.PI / 6, MAX_A = 0;
const cosMin = Math.cos(MIN_A), sinMin = Math.sin(MIN_A);
const AX = FX - HALF * cosMin, AY = FY - HALF * sinMin;
const BX = FX + HALF * cosMin, BY = FY + HALF * sinMin;

const world = (extra) => loadLevel({
  id: 98, theme: 'hills',
  bounds: { w: 2000, h: 1080 },
  spawn: { x: 200, y: 700 },
  ground: [
    [[40, AY], [Math.round(AX), AY]],
    [[Math.round(BX), BY], [1960, BY]],
  ],
  boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
  ],
  platforms: [],
  beams: [{ x: FX, y: FY, halfLength: HALF, minAngle: MIN_A, maxAngle: MAX_A }],
  ...extra,
});

// --- 1. the loader builds a beam, starting at minAngle, endpoints match ----
{
  const level = world();
  const beam = level.beams[0];
  console.log(`\n1. ${level.beams.length} beam(s), angle=${beam.angle.toFixed(3)}`);
  if (level.beams.length !== 1) fail(`expected 1 beam, got ${level.beams.length}`);
  if (Math.abs(beam.angle - MIN_A) > 1e-9) fail(`a fresh beam's angle is ${beam.angle}, expected minAngle ${MIN_A}`);
  if (Math.abs(beam.ax - AX) > 0.01 || Math.abs(beam.ay - AY) > 0.01) {
    fail(`beam's near end is at (${beam.ax.toFixed(1)},${beam.ay.toFixed(1)}), expected (${AX.toFixed(1)},${AY.toFixed(1)})`);
  }
  if (Math.abs(beam.bx - BX) > 0.01 || Math.abs(beam.by - BY) > 0.01) {
    fail(`beam's far end is at (${beam.bx.toFixed(1)},${beam.by.toFixed(1)}), expected (${BX.toFixed(1)},${BY.toFixed(1)})`);
  }
}

// --- 2. a crate resting past the fulcrum levels the beam -------------------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
    // Centre at FX + 80 = 1080, comfortably past the fulcrum and still well
    // inside the beam's own far half (which reaches to BX ≈ 1130 at rest).
    { x: 1030, y: 550, w: 100, h: 100, movable: true },
  ] });
  // Let it fall and settle onto the (still tilted) beam.
  run(null, level, stub(), 2);
  const crate = level.crates[0], beam = level.beams[0];
  console.log(`\n2. crate settled at y=${crate.y.toFixed(0)}, grounded=${crate.grounded}`);
  if (!crate.grounded) fail('2: the crate never settled, so nothing below was tested');
  // Give it several full SWING_TIMEs to reach (or get very close to) maxAngle.
  run(null, level, stub(), CONFIG.BEAM.SWING_TIME * 4);
  console.log(`   after settling: beam angle=${beam.angle.toFixed(3)} (maxAngle=${MAX_A})`);
  if (Math.abs(beam.angle - MAX_A) > 0.01) fail(`beam angle is ${beam.angle.toFixed(3)}, expected to have eased to maxAngle ${MAX_A}`);
}

// --- 3. a crate before the fulcrum leaves the beam at minAngle -------------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
    // Centre at FX - 80 = 920: on the near/entry side of the fulcrum.
    { x: 870, y: 550, w: 100, h: 100, movable: true },
  ] });
  run(null, level, stub(), 2 + CONFIG.BEAM.SWING_TIME * 4);
  const beam = level.beams[0];
  console.log(`\n3. crate on the entry side the whole time: beam angle=${beam.angle.toFixed(3)} (minAngle=${MIN_A})`);
  if (Math.abs(beam.angle - MIN_A) > 0.01) fail(`beam angle is ${beam.angle.toFixed(3)}, expected to have stayed at minAngle ${MIN_A}`);
}

// --- 4. taking the crate away lets the beam ease back to minAngle ----------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
    { x: 1030, y: 550, w: 100, h: 100, movable: true },
  ] });
  run(null, level, stub(), 2 + CONFIG.BEAM.SWING_TIME * 4);
  const beam = level.beams[0];
  if (Math.abs(beam.angle - MAX_A) > 0.01) fail(`4: setup failed to level the beam first (angle=${beam.angle.toFixed(3)}) — nothing below was tested`);
  // Shove the crate off the beam entirely, by hand — this suite has no
  // interest in HOW a crate gets moved, only in what the beam does once it's
  // gone, the same shape switches.mjs's own case 5 already uses.
  level.crates[0].x = 100;
  level.crates[0]._reseg();
  run(null, level, stub(), CONFIG.BEAM.SWING_TIME * 4);
  console.log(`\n4. crate removed: beam angle=${beam.angle.toFixed(3)} (minAngle=${MIN_A})`);
  if (Math.abs(beam.angle - MIN_A) > 0.01) fail(`beam angle is ${beam.angle.toFixed(3)}, expected to have eased back to minAngle ${MIN_A}`);
}

// --- 5. a beam owes the four carrier fields, like every other carrier ------
//
// Permanently zero here rather than a translation — see this plan's own
// "Important deviation from the approved spec" note for why — but they must
// still exist and stay numeric, or player.js's `platform.dx` line turns the
// ball's position to NaN the first frame it stands on one, the exact bug
// CLAUDE.md already warns about.
{
  const level = world();
  const beam = level.beams[0];
  for (const f of ['dx', 'dy', 'vx', 'vy']) {
    if (typeof beam[f] !== 'number') fail(`a fresh beam has no numeric '${f}'`);
    if (beam[f] !== 0) fail(`a fresh beam's '${f}' is ${beam[f]}, expected permanently 0`);
  }
  run(null, level, stub(), 3);
  for (const f of ['dx', 'dy', 'vx', 'vy']) {
    if (beam[f] !== 0) fail(`after the beam moved, '${f}' is ${beam[f]}, expected still permanently 0`);
  }
  console.log(`\n5. beam carrier fields stay 0 throughout: dx=${beam.dx}, dy=${beam.dy}, vx=${beam.vx}, vy=${beam.vy}`);
}

// --- 6. a ball riding the entry half is carried up as the beam levels ------
//
// This is the concrete check behind this plan's claim that ordinary contact
// resolution — no explicit carrying code — is enough for the ball: drop a
// ball onto the beam's entry half, then let a crate on the far half level it
// out from underneath, and confirm the ball is smoothly lifted with the
// rising surface rather than left behind or falling through.
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
    { x: 1030, y: 550, w: 100, h: 100, movable: true },
  ] });
  // Drop the ball first, near the beam's own entry end, and let it settle
  // before the crate starts levelling anything.
  const ball = new Ball(920, 500);
  run(ball, level, stub(), 1.5);
  if (!ball.grounded) fail('6: the ball never settled on the beam, so nothing below was tested');
  const yBefore = ball.y;
  run(ball, level, stub(), CONFIG.BEAM.SWING_TIME * 4);
  console.log(`\n6. ball y before levelling=${yBefore.toFixed(1)}, after=${ball.y.toFixed(1)}, deaths=${ball.deaths}`);
  if (ball.deaths > 0) fail(`the ball died while the beam levelled under it (${ball.deaths} time(s)) — it was not carried, it fell through`);
  if (ball.y >= yBefore - 1) fail(`the ball's y barely changed (${yBefore.toFixed(1)} -> ${ball.y.toFixed(1)}) while the beam levelled beneath it — it was not carried upward with the rising surface`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BEAM CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `node games/pushkar-ball/tests/run.mjs beams`

Expected: a crash or FAIL — `CONFIG.BEAM`, `data.beams` and `makeBeam` don't exist yet, so this should error out rather than print a clean failure.

- [ ] **Step 7: Run it again and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs beams`
Expected: `ALL BEAM CHECKS PASSED`

If test 6 fails specifically (the ball falls through or is not carried), do not add carrying code as a first response — re-read this plan's architecture note and check instead whether `CONFIG.BEAM.SWING_TIME` is fast enough that the beam is moving more than the ball's own radius in a single step; slowing it down (a larger `SWING_TIME`) is the fix that reasoning predicts, not a new carrier mechanism.

- [ ] **Step 8: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass, with the new `beams` suite added to the existing count.

- [ ] **Step 9: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/beams.mjs
git commit -m "$(cat <<'EOF'
Add the balance beam

A plank pivoting on a fulcrum, tilting toward whichever end a resting
crate weighs down - never the ball itself, the same rule the pressure
switch already follows. Rotation needs no new carrier contract: a
crate's resting height is already recomputed fresh every step from
whatever segment is under it (a plain horizontal range check is
enough to know which crates weigh a beam down, so
Level.update can total up torque), and the ball is already carried
upward by ordinary contact resolution wherever a surface rises into
it. Both carry the same four carrier fields every dynamic collider
does, permanently zero on the beam rather than a translation.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Draw the beam

**Files:**
- Modify: `games/pushkar-ball/js/main.js` (new `drawBeams`, wired into `draw()`)

- [ ] **Step 1: Write `drawBeams`**

In `games/pushkar-ball/js/main.js`, find `drawGates` (it ends with a closing `}` right before the `/**\n * The moving platforms...` comment). Immediately after `drawGates`'s closing `}`, insert:

```javascript

/**
 * The balance beam: a plank rotated to its current angle around its own
 * fulcrum, plus a small stone wedge underneath as the pivot. Stone-family
 * grey, like a gate — the beam itself cannot be pushed, only ridden or
 * weighed down by a crate — never wood, which in this game always means
 * "you can push this".
 */
function drawBeams() {
  const C = CONFIG.COLOURS;
  for (const b of level.beams) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = C.BEAM;
    ctx.fillRect(-b.halfLength, -10, b.halfLength * 2, 20);
    ctx.restore();

    ctx.fillStyle = C.BEAM_PIVOT;
    ctx.beginPath();
    ctx.moveTo(b.x - 16, b.y + 18);
    ctx.lineTo(b.x + 16, b.y + 18);
    ctx.lineTo(b.x, b.y - 2);
    ctx.closePath();
    ctx.fill();
  }
}
```

- [ ] **Step 2: Wire it into `draw()`**

In `games/pushkar-ball/js/main.js`, find:

```javascript
  drawPlatforms();
  drawPads();
  drawGates();
  drawGoal();
  drawBall();
```

Change it to:

```javascript
  drawPlatforms();
  drawPads();
  drawGates();
  drawBeams();
  drawGoal();
  drawBall();
```

- [ ] **Step 3: Confirm nothing crashes with no beams on any current level**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites still pass. None of levels 1–6 have a `beams` array yet, and it defaults to `[]`, so the new draw loop does nothing for them — this step confirms that's actually true.

- [ ] **Step 4: Commit**

```bash
git add games/pushkar-ball/js/main.js
git commit -m "$(cat <<'EOF'
Draw the balance beam

A plank rotated to its current angle around its own fulcrum, plus a
stone wedge as the pivot - stone-family grey like a gate, since the
beam itself cannot be pushed and must never read as wood.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Level 7

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (new level object in the `LEVELS` array)

This task is level DATA only — no engine code changes. Every mechanic used here (gap, crate, walker, the new beam) already exists; this task only arranges them.

- [ ] **Step 1: Work out level 7's beam geometry on paper first**

This is arithmetic, not code, and it is worth getting right before touching `levels.js`, because the numbers below have to satisfy the constraint this plan's header explains: a beam has to be shallow enough to still count as ground (`ny < CONFIG.GROUND_NY`, roughly under 53°) but steep enough that gravity beats `CONFIG.ACCEL` along it (roughly over 47°), or an unlevelled beam becomes a ramp the ball can simply climb without ever needing the crate.

Chosen: `minAngle = -50°` (`-Math.PI * 50 / 180` ≈ -0.8727 rad), `maxAngle = 0` (level), `halfLength = 170`.

With the fulcrum at `(fx, fy)`:
- Entry (near) end at rest: `ax = fx - 170·cos(50°) ≈ fx - 109`, `ay = fy - 170·sin(-50°) ≈ fy + 130`.
- Far (exit) end at rest: `bx = fx + 170·cos(50°) ≈ fx + 109`, `by = fy + 170·sin(-50°) ≈ fy - 130`.
- At `maxAngle = 0`, both ends are at `(fx ∓ 170, fy)` — fully level.

Pick `fx = 8610`, `fy = 630`. Then at rest: entry end ≈ `(8501, 760)` — flush with an entry ledge at `y = 760` ending at `x = 8500` — and far end ≈ `(8719, 500)`, dangling well above and short of an exit ledge at `y = 630` starting at `x = 8700`. At `maxAngle = 0`: both ends at `(8440, 630)` and `(8780, 630)` — the far end now flush with the exit ledge.

This gives a gap from `x = 8500` to `x = 8700` (200px — one of this project's own already-proven gap widths) bridged entirely by the beam, with the beam's own ends slightly overlapping each ledge throughout the swing (never a visible sliver of daylight between beam and ledge).

- [ ] **Step 2: Add level 7**

In `games/pushkar-ball/js/levels.js`, find the end of level 6's object and the array's closing bracket:

```javascript
    checkpoints: [
      { x: 8150, y: 760 },
    ],
  },
];
```

Insert a new level object between level 6's closing `},` and the array's closing `];`:

```javascript
    checkpoints: [
      { x: 8150, y: 760 },
    ],
  },

  {
    // Level seven: the balance beam is the one new idea — push a crate past
    // its fulcrum to level it, then walk across. It rests tilted, one end
    // down on the entry ledge and the other dangling above the exit ledge,
    // until the crate's weight brings the far end down to meet it. A gap,
    // and a recurring walker, warm the level up first; neither is new. See
    // docs/superpowers/specs/2026-09-13-balance-beam-design.md and this
    // plan's own header for how minAngle/halfLength were chosen — steep
    // enough that the ball cannot simply climb the unlevelled beam like a
    // ramp, shallow enough that it still counts as ground a crate can rest
    // on and the ball can walk when it counts.
    id: 7,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12760, y: 630 },

    ground: [
      // Warm-up: a proven 200px gap, well before any checkpoint.
      [[40, 760], [2200, 760]],
      // A long flat carrying the recurring walker, ending at the entry
      // ledge — the checkpoint sits just before the crate.
      [[2400, 760], [8500, 760]],
      // The 200px gap the beam bridges: x=8500 to x=8700. No ground line
      // here at all — between the two ledges, the beam is the only thing
      // to stand on.
      [[8700, 630], [12960, 630]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
      // The crate that matters, well clear of the gap so it cannot be
      // shoved in before it is needed.
      { x: 8300, y: 660, w: 100, h: 100, movable: true },
    ],

    beams: [
      { x: 8610, y: 630, halfLength: 170, minAngle: -Math.PI * 50 / 180, maxAngle: 0 },
    ],

    platforms: [],

    enemies: [
      // A recurring walker, at the exact x/amplitude level six's own walker
      // already proved (see its comment there) — placed on a comparable
      // long flat with at least as much clearance either side, as a
      // starting point. Re-verified for THIS level's own geometry in Task
      // 4, not assumed to carry over unchecked.
      { kind: 'walker', x: 4400, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    // One. Everything before it (the first gap, the walker) is
    // already-practised ground — none of it is this level's hard part, so a
    // checkpoint there would only bank progress nobody was going to lose.
    // Everything after the beam, once it's level, is flat with nothing left
    // to fail — a second checkpoint there would guard nothing.
    checkpoints: [
      { x: 8150, y: 760 },
    ],
  },
];
```

- [ ] **Step 3: Confirm the level loads and the offline suite still passes**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: `offline/levels` still passes (an overlapping ground segment, a checkpoint off the ground, a segment whose normal doesn't point up, and so on). If it fails, read the specific failure message — a likely cause is the checkpoint or spawn landing somewhere unsettled; adjust the checkpoint's `y` or the ground/box numbers above, not the test.

`offline/finish` is EXPECTED to fail at this point, with a message that level 7 has no route — that's Task 4's job, not this one. Every other suite should still pass.

- [ ] **Step 4: Commit**

```bash
git add games/pushkar-ball/js/levels.js
git commit -m "$(cat <<'EOF'
Add level seven: the balance beam, and everything taught before it

The beam's one new idea, taught by a puzzle where the ball has to
push a crate past the fulcrum before the far end comes down to meet
the exit ledge. A gap and a walker both recur from earlier levels
rather than being re-taught. finish.mjs's route and the
cannot-be-crossed-without-the-crate check are Task 4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Prove level seven can be finished, and only with the beam levelled

**Files:**
- Modify: `games/pushkar-ball/tests/offline/finish.mjs`

- [ ] **Step 1: Add level 7's route**

In `games/pushkar-ball/tests/offline/finish.mjs`, find the `ROUTES` object and add a new entry for id `7`, right after level 6's (before the object's closing `};`):

```javascript
  // Level seven: run to the crate, push it past the beam's own fulcrum and
  // onto the far half — the same "push until it stops mattering" shape
  // level three's and level six's own crate routes use, except there is no
  // hard stop here to detect: instead, push for a fixed distance well past
  // the fulcrum (comfortably enough to fully level the beam per
  // CONFIG.BEAM.ANGLE_PER_OFFSET — see this plan's own worked numbers), then
  // just keep holding right across it.
  7: (level, lead) => {
    const run = runner(level, lead);
    const crate = level.crates[0];
    const beam = level.beams[0];
    // Centre 70px past the fulcrum is comfortably inside the beam's own far
    // half (which reaches to about +109 from the fulcrum at rest) and,
    // at ANGLE_PER_OFFSET, comfortably enough to fully level it.
    const target = beam.x + 70;
    let stage = 'run';
    return (ball) => {
      if (stage === 'run') {
        if (ball.grounded && ball.y > 700 && ball.x > crate.x - 200 && ball.x < crate.x) stage = 'push';
        else return run(ball);
      }
      if (stage === 'push') {
        if (crate.x + crate.w / 2 >= target) stage = 'through';
        return { right: true };
      }
      // Through: nothing left for the generic runner's own checks to react
      // to on this stretch, so just hold right — the beam finishes
      // levelling on its own as the ball crosses.
      return { right: true };
    };
  },
```

- [ ] **Step 2: Run the finish suite and confirm level 7 is finished cleanly**

Run: `node games/pushkar-ball/tests/run.mjs finish`

Expected: level 7 appears in case 1's per-level report and case 2's per-checkpoint report, finished cleanly at every lead/delay combination.

If it fails with the ball falling into the gap or stalling on a beam that never quite levels, read the specific failure. Two likely causes, and what to check for each:
- The crate never reaches the `target` offset (stuck against something, or the push stage's condition is never satisfied) — print `crate.x` at a few points and compare against level 7's actual geometry from Task 3.
- The beam levels but the ball still cannot get across — this may mean `CONFIG.BEAM.SWING_TIME` or `ANGLE_PER_OFFSET` need adjusting (a larger `ANGLE_PER_OFFSET`, so a more modest push levels it further), or that `minAngle`/`halfLength` need revisiting. Prefer adjusting `CONFIG.BEAM` or level 7's own numbers over changing the route's `target` far beyond the reasoning above — a route that pushes the crate past the beam's own far endpoint (`beam.bx` at whatever its current angle is) risks the crate no longer counting toward its weight at all (see `Level.update`'s horizontal-range check in Task 1), which stops the beam levelling any further.

- [ ] **Step 3: Add the "cannot cross without the crate" case**

This is the check this plan's own header explains is load-bearing, not optional — it is what actually proves the beam's rest angle is steep enough that the ball cannot simply climb it as a ramp. Find the end of case 3c (level six without its switch) and, after its closing `}`, before case 4 ("exhausting hearts mid-level"), add:

```javascript
// --- 3d. level seven cannot cross the gap without a crate on the beam ------
//
// Remove the crate entirely, so the beam has nothing to level it and stays
// at its rest angle (minAngle) throughout. If ANY attempt gets across, the
// unlevelled beam is acting as a ramp rather than an obstacle, and
// minAngle/halfLength (see this plan's header, and Task 3 Step 1's worked
// numbers) need to be steepened or re-derived — not this check loosened.
console.log('\n3d. level seven without a crate on the beam');
{
  const data = LEVELS.find((l) => l.id === 7);
  if (!data) fail('there is no level 7');
  else {
    const bare = { ...data, boxes: data.boxes.filter((b) => !b.movable) };
    const beamX = data.beams[0].x;
    let cleared = 0, tries = 0;
    for (let from = beamX - 900; from <= beamX - 100; from += 20) {
      tries++;
      const { ball } = play({ ...bare, spawn: { x: from, y: 600 } }, () => (b) => ({ right: true }), { seconds: 10 });
      if (ball.x > beamX + 300) cleared++;
    }
    if (cleared) fail(`level 7 was crossed ${cleared} time(s) of ${tries} without a crate levelling the beam — the unlevelled beam is acting as a ramp; steepen minAngle or shorten halfLength (see this plan's header) and re-check`);
    else console.log(`   ${tries} tries without a crate on it, none got past the beam at x=${beamX}`);
  }
}
```

- [ ] **Step 4: Run the finish suite again and confirm all three level-7 cases pass**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: cases 1 and 2 still report level 7 finished cleanly; the new case 3d reports 0 clears without a crate on the beam.

If case 3d fails (some attempt gets across), this is the scenario this plan's header specifically warned could happen — go back to Task 3 Step 1's arithmetic, steepen `minAngle` (move it closer to, but still under, 53°) or shorten `halfLength`, update level 7's `beams` entry and re-derive the ledge positions the same way, then re-run both this case and Step 2's positive route before moving on.

- [ ] **Step 5: Run the full suite, offline and browser**

Run: `node games/pushkar-ball/tests/run.mjs`
Expected: all suites pass — this needs a local Chrome install and starts its own server, per the file's own header comment.

- [ ] **Step 6: Look at level 7**

Per this game's own "Look at it" rule, render level 7 and actually look at it before considering it done.

There is no in-game level select. In `games/pushkar-ball/js/main.js`, find:

```javascript
flow.start(0);
```

Change the `0` to `6` (level 7 is `LEVELS[6]`, the seventh entry):

```javascript
flow.start(6);
```

Start the local server (`node games/pushkar-ball/tests/run.mjs` starts one and leaves it running while its suites execute) and open `http://127.0.0.1:8778/games/pushkar-ball/index.html` in a real browser, at both 568×320 and 740×280. Roll through the level and confirm by eye:

- The beam reads as a distinct mechanism (stone-grey, not wood) with a visible pivot, not as ordinary scenery.
- At rest, the entry end sits flush with its ledge and the far end is visibly out of reach, above and short of the exit ledge — not touching it, not obviously reachable by jumping.
- Pushing the crate past the fulcrum visibly, smoothly tilts the beam level over about a second, not an instant snap.
- The ball pushing the crate is visibly carried UP as the beam levels beneath it, rather than left behind or clipping through.
- Once level, walking across reads as clear and solid, with no visible gap or overlap between the beam and either ledge.
- The recurring walker (reused from level six) still reads correctly and doesn't visibly overlap the gap, the crate, or the beam.

Then revert the change:

```javascript
flow.start(0);
```

Confirm the revert with `git diff games/pushkar-ball/js/main.js` — it must show no changes before continuing. Do not commit `flow.start(6)`.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/tests/offline/finish.mjs
git commit -m "$(cat <<'EOF'
Prove level seven can be finished, and only with the beam levelled

A route (push the crate past the fulcrum, then hold right across the
now-level beam), plus a check that an unlevelled beam - crate removed
entirely - cannot be crossed at all, which is what actually proves
its rest angle is steep enough that it isn't a free ramp.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Mark the spec done

**Files:**
- Modify: `docs/superpowers/specs/2026-09-13-balance-beam-design.md`

- [ ] **Step 1: Mark the spec's status**

In `docs/superpowers/specs/2026-09-13-balance-beam-design.md`, find the first line:

```markdown
# Balance beam (level 7)
```

Change it to:

```markdown
# Balance beam (level 7) — DONE
```

Then find the "Where this fits" section's opening sentence:

```markdown
This is the second of several independent follow-up mechanics from the Red
Ball 4-inspired list. The rest — moving carts, buoyancy/floating crates,
timed triggers, key-lock doors, laser boundaries, gravity-warping, and
smarter enemy variants — remain unscoped and will each get their own
brainstorming pass.
```

Change it to:

```markdown
This was the second of several independent follow-up mechanics from the Red
Ball 4-inspired list, implemented by
`docs/superpowers/plans/2026-09-13-balance-beam.md` — which also found, while
working through the physics by hand during planning, that the spec's own
Section 3 ("New carrier contract, for rotation") was not actually needed; see
that plan's header for the reasoning. The rest — moving carts, buoyancy/
floating crates, timed triggers, key-lock doors, laser boundaries,
gravity-warping, and smarter enemy variants — remain unscoped and will each
get their own brainstorming pass.
```

- [ ] **Step 2: Run the full offline suite one more time**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass (docs-only change in this step, but confirms nothing was accidentally left in a code file — e.g. the `flow.start(6)` debugging change from Task 4, Step 6).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-13-balance-beam-design.md
git commit -m "$(cat <<'EOF'
Mark the balance beam spec done

Implemented and looked at at 568x320 and 740x280, with a note
pointing at the implementation plan's own correction to the spec's
carrier-contract section.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
