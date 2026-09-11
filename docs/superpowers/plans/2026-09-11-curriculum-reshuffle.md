# Curriculum Reshuffle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place enemies into the game for real — level 2 becomes the first-enemy level, the crate content that used to live at level 2 moves to level 3, and the spike content that used to live at level 3 moves to a new level 4 — so the curriculum still introduces exactly one new idea per level, with enemies now landing earlier per the approved design.

**Architecture:** A level-data reshuffle in `js/levels.js` (one new level authored, two existing levels renumbered with their geometry otherwise unchanged), with `tests/offline/finish.mjs`'s completability proof updated in lockstep — its `ROUTES` are keyed by level id, so renumbering a level without renumbering its route breaks the proof immediately, which is exactly the kind of mistake this suite exists to catch. `finish.mjs`'s generic `runner()` gains one more thing to jump over (an enemy in its way), the same shape it already jumps over spikes, gaps and crates. `tests/offline/levels.mjs` gains two authoring-safety checks for enemies, mirroring the ones it already has for spikes.

**Tech Stack:** Vanilla ES modules, no dependencies. Node's built-in test runner pattern already used throughout `tests/offline/`.

**Scope note:** This is the last piece of Phase A from `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md` — its "Curriculum reshuffle" section. Both prerequisites are already shipped: the health system (`docs/superpowers/plans/2026-09-10-health-system.md`) and the enemy mechanics (`docs/superpowers/plans/2026-09-11-enemies.md`). Phase B (saws, conveyors, crushers, launchers, ice/sticky surfaces, and the toy-factory theme) is explicitly out of scope, per the design spec.

**A note on level content and testing, before you start:** Level 2's exact geometry below is a well-reasoned first draft, not a guarantee — the same way every level in this game has always been. This codebase's own history has already caught one real level-authoring bug this way: the original level 2's second checkpoint was placed on the wrong side of its crate, and `finish.mjs`'s per-checkpoint pass caught it before anyone played it (see `js/levels.js`'s own header comment, and `git log --oneline` for "Fix camera-lag model..." era commits). If `levels.mjs` or `finish.mjs` fails against the level 2 content in Task 1, that is the suite doing its job, not a sign the plan is wrong — read the failure, adjust the specific number it points at (usually a checkpoint position, a patrol range, or a gap), and re-run. This is expected, ordinary iteration for this codebase, not an escalation-worthy surprise.

---

## Before you start

Read these first; every task below assumes you already know them:

- `games/pushkar-ball/js/levels.js` — the current `LEVELS` array (levels 1-3) and the `Level` class, including the `enemies` array and `hazardKnockDir`/`stompEnemy` methods the enemies plan already added.
- `games/pushkar-ball/js/enemies.js` — `makeWalker`, `makeRoller`, `makePopper` and their level-data shapes (`{kind, x, y, amplitude}` for a walker, `{kind, x, y, from, to, dir}` for a roller, `{kind, x, y, dir, period, phase}` for a popper).
- `games/pushkar-ball/tests/offline/finish.mjs` — the completability proof, especially `runner()` (the generic jump-before-obstacle driver) and the `ROUTES` object (keyed by level `id`).
- `games/pushkar-ball/tests/offline/levels.mjs` — the authoring-safety suite, especially checks 4 (platform bounds) and 8 (nothing hazardous on the spawn or a checkpoint) — this task's new enemy checks follow the same shape as these.
- `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md`'s "Curriculum reshuffle" section — the approved design this plan implements.

Run `node games/pushkar-ball/tests/run.mjs offline` once before starting, to confirm the baseline is green.

---

### Task 1: Reshuffle the levels, and prove every one of them completable

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (insert the new level 2; renumber the old level 2 to id 3; renumber the old level 3 to id 4)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (`runner()` jumps over enemies too; `ROUTES` rekeyed; check 3's level lookup updated)
- Modify: `games/pushkar-ball/tests/offline/levels.mjs` (two new authoring-safety checks for enemies)

- [ ] **Step 1: Reshuffle `LEVELS` in `levels.js`**

In `games/pushkar-ball/js/levels.js`, the `LEVELS` array currently holds three levels: id 1 (rolling/hills, unchanged by this plan), id 2 (crates), id 3 (spikes). Replace the ENTIRE array with the following — level 1 is reproduced byte-for-byte from its current content (do not change anything about it), a brand new level 2 is inserted, and the old level-2/level-3 objects are reproduced with only their `id` field and header comment changed:

```js
export const LEVELS = [
  {
    id: 1,
    theme: 'hills',
    bounds: { w: 16800, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 16660, y: 680 },

    ground: [
      // A long flat start — MORE room than the original gave before its first
      // hill, so the roll suite's friction measurement, which happens right
      // after spawn, has at least as much clear road as it always had. Then a
      // hill (up, along, down): rolling and slopes, before anything at all is
      // asked of the player.
      [[40, 760], [1100, 760], [1450, 600], [1800, 600], [2150, 760], [2950, 760]],
      // After a 200px gap: a bowl, a long flat run with nothing in it — pure
      // rolling, the kind of stretch a long level needs and a short one has no
      // room for — then a second, bigger hill and a flat to the second gap.
      [
        [3150, 760], [3500, 760], [3650, 840], [3850, 840], [4000, 760], [4600, 760],
        [6400, 760], [6900, 540], [7500, 540], [8000, 760], [8850, 760],
      ],
      // After the 240px second gap: a second bowl, another long flat, a third
      // and tallest hill, then flat to the final approach. The vertical lift
      // sits somewhere in the long flat between the bowl and the hill —
      // nothing needs it, same as the first level ever had.
      [
        [9090, 760], [10600, 760], [10950, 760], [11100, 840], [11300, 840], [11450, 760], [12200, 760],
        [13800, 760], [14350, 520], [15000, 520], [15550, 760], [16200, 760],
      ],
      // The last ledge. Nothing but the moving platform reaches it.
      [[16560, 680], [16760, 680]],
    ],

    boxes: [
      // Walls at both ends, so the level cannot be left sideways. Not movable,
      // and drawn as stone rather than wood so that "wood means you can push
      // it" stays true everywhere.
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 16760, y: 0, w: 40, h: 1080 },
      // Two wooden crates, and both can be pushed. Jump them, roll over them
      // at speed, or shove them about.
      //
      // Nothing in THIS level needs a crate to be finished — there is no spot
      // here that a jump cannot already reach, and saying otherwise in a
      // comment would be the easiest kind of lie to leave behind. They are
      // here so the mechanic is in a child's hands from the first level and so
      // the game exercises it; the level that is built around a crate belongs
      // with level three, where the geometry is drawn for it.
      // What a crate can do is proved in tests/offline/crates.mjs, on a level
      // built for the purpose, with a ledge the jump provably cannot reach.
      { x: 2450, y: 660, w: 100, h: 100, movable: true },
      { x: 8300, y: 660, w: 110, h: 100, movable: true },
    ],

    platforms: [
      // Across the last gap. Its travel is chosen so its left edge reaches
      // back over the ground at 16200 and its right edge stops short of the
      // ledge at 16560, leaving a small hop — a platform that docks exactly
      // with the scenery just reads as part of it. This is platforms[0]
      // deliberately: tests/offline/finish.mjs's route for this level reads
      // level.movers[0] to find it, and mover order follows platform order.
      { x: 16275, y: 740, w: 170, h: 28, axis: 'x', dist: 85, period: 5.0, phase: 0 },
      // A lift over the long flat between the first bowl and the second hill.
      // Nothing needs it; it is here so vertical movers are exercised by the
      // game and not only by the tests.
      { x: 9700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 },
    ],

    // Two, breaking the level into three pieces of roughly a third each
    // rather than guarding every gap. The first ~8700 units — the first hill,
    // both crates' worth of terrain, the first gap and bowl, the second hill —
    // have no checkpoint at all: none of it is the level's hard part, it is
    // the level's ROLLING, and a checkpoint there would only be banking
    // progress nobody was going to lose. The two below sit right before the
    // two stretches that can actually be failed: the second gap, and the
    // final hill-then-platform approach.
    checkpoints: [
      { x: 8750, y: 760 },
      { x: 13750, y: 760 },
    ],
  },

  {
    // Level two teaches the enemy — reshuffled here Sep 2026 so it lands as
    // early as the second level, per the request that "just jumping over
    // holes" was getting boring. A walker and a popper are met once each on
    // open, unguarded ground (the same "cheap to fail the first time" rule
    // every new hazard in this game gets); a roller is the level's one real
    // test, protected by a checkpoint; the tightest gap and a second walker
    // close it out, protected by a second checkpoint. Crates, which used to
    // be taught here, move to level three; spikes move to level four — see
    // those levels' own header comments.
    id: 2,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12800, y: 760 },

    ground: [
      // Rehearsal, piece one: a walker met on a long, open flat, close enough
      // to spawn that meeting it for the very first time costs almost
      // nothing — the enemy version of level three's first, easy spike patch.
      [[40, 760], [2200, 760]],
      // The 200px gap, already met and practised in level one — nothing new
      // asked at the same time as the walker.
      [[2400, 760], [4800, 760]],
      // Rehearsal, piece two: a popper, met once, still before any
      // checkpoint. The 220px gap after it is a shade wider than the first,
      // the same graduated step every level in this game already uses.
      [[5020, 760], [6700, 760]],
      // The 240px gap, then the level's first real test: a roller, patrolling
      // open ground with room either side of it. Checkpoint one, placed at
      // the end of the flat just before this gap, protects this whole piece —
      // failing the roller costs this piece, not the rehearsal before it.
      [[6940, 760], [9200, 760]],
      // The 260px gap — the tightest in the level, already proven completable
      // at this exact width in the original three levels — then a second,
      // lower-stakes rep of the walker idea and a long flat home. Checkpoint
      // two, placed just before this gap, protects this final piece.
      [[9460, 760], [12960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
    ],

    platforms: [],

    enemies: [
      // Walker one: patrols 700 units either side of x=1200, well clear of
      // both the spawn and the gap that follows.
      { kind: 'walker', x: 1200, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 500 },
      // Popper: lobs back toward an oncoming ball (dir: -1), on the default
      // period. Placed with clearance from both gaps on either side of it.
      { kind: 'popper', x: 3600, y: 760 - CONFIG.ENEMY.POPPER.R, dir: -1 },
      // Roller: the level's real test, patrolling the middle of a flat with
      // several hundred units of clearance from the gaps at either end —
      // there is no version of meeting it that also asks for gap-timing at
      // the same instant.
      { kind: 'roller', x: 8000, y: 760 - CONFIG.ENEMY.ROLLER.R, from: 7200, to: 8800, dir: 1 },
      // Walker two: one more rep of the idea, well clear of the goal and the
      // gap behind it.
      { kind: 'walker', x: 10500, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 400 },
    ],

    // Two, at the two places a real test follows: checkpoint one guards the
    // roller (and the 240px gap right before it); checkpoint two guards the
    // level's tightest gap and the final stretch. The rehearsal before
    // checkpoint one — both enemies met for the first time, and two already-
    // practised gaps — is deliberately unguarded, the same rule every level
    // in this game already follows for a new idea's first, cheap-to-fail
    // appearance.
    checkpoints: [
      { x: 6600, y: 760 },
      { x: 9100, y: 760 },
    ],
  },

  {
    // Level three teaches the crate — reshuffled here Sep 2026 from its
    // original home at level two, so enemies could move up to level two
    // instead. Level one has crates and never needs one; here the only way
    // onto the high ledge is to shove a crate under it and jump off the top,
    // so the idea is learned somewhere it can be practised without a hazard
    // anywhere in sight. Geometry below is unchanged from the original level
    // two — only the id and this comment moved.
    id: 3,
    theme: 'hills',
    bounds: { w: 13600, h: 1080 },
    spawn: { x: 180, y: 560 },
    goal: { x: 13400, y: 620 },

    ground: [
      // A long flat run to get up to speed, then a first 200px gap.
      [[40, 760], [1300, 760]],
      // A long flat, then a 220px gap — a shade wider than the first, so the
      // sequence keeps asking a little more without ever asking two things
      // at once.
      [[1500, 760], [3800, 760]],
      // A long flat, then the 260px gap — the tightest jump in the level.
      [[4020, 760], [6400, 760]],
      // A long flat, then a 240px gap — a little easier than the one just
      // met, a breather before the level's real subject.
      [[6660, 760], [9000, 760]],
      // The step down and along: the flat where the crate lives, below the
      // ledge, and MUCH longer than the original gave — there is room here to
      // experiment with the crate without the flat itself feeling cramped.
      [[9240, 800], [11200, 800]],
      // The high ledge, and the goal is on it. Its top is 180px above the flat
      // below, and a jump from that flat reaches 131px — a ball there is at
      // y=780 and peaks at 649, which is not the 600 it needs to land on 620.
      // Standing on a 100px crate it is at 680 and peaks at 549, which is. So
      // the crate is the only way up, with about 50px of margin either way.
      [[11260, 620], [13560, 620]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 13560, y: 0, w: 40, h: 1080 },
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
      //
      // It runs to the bottom of the level rather than stopping at the flat's
      // 800, because the ground is drawn as a filled band under each line and
      // the two bands here end short of each other otherwise. A face stopping
      // partway left a crevice open below it, and the hills showed through.
      { x: 11200, y: 620, w: 60, h: 460 },
      // The crate that matters, on the flat below the ledge, well clear of
      // the gap behind it so it cannot be shoved off the edge before it is
      // needed. It can be — crates come back when they fall out — but a child
      // who loses it for ten seconds has learned nothing except that things
      // vanish. This is boxes' only movable entry: tests/offline/finish.mjs's
      // route for this level reads level.crates[0] to find it.
      { x: 9700, y: 700, w: 100, h: 100, movable: true },
    ],

    platforms: [],

    // Two, not one per gap. The first sits right before the level's tightest
    // jump — the 260px gap — so failing THAT specific jump costs only that
    // jump, not the two easier gaps rolled through to reach it. The second
    // sits on the crate flat, 100px before the crate itself — the same
    // relative spacing the level always used — so a respawn still lands on
    // the correct side to push it. Placing this one BEHIND the crate instead
    // (which the first draft did, at the crate's own far edge) left a
    // respawned ball on the wrong side to push from, unable to finish;
    // tests/offline/finish.mjs's per-checkpoint pass is what caught it.
    // Working out a crate means backing up and trying again, and the flat
    // ends in a gap on its left — without this flag, every child who backs
    // off the flat while experimenting is sent to redo a gap before he may
    // try the crate again.
    checkpoints: [
      { x: 6260, y: 760 },
      { x: 9600, y: 800 },
    ],
  },

  {
    // Level four teaches the spike — reshuffled here Sep 2026 from its
    // original home at level three, so crates could move down to level three
    // and enemies could move up to level two. Everything under it — rolling,
    // gaps, crates, a moving platform, enemies — has already been met.
    // Geometry below is unchanged from the original level three — only the
    // id and this comment moved.
    id: 4,
    theme: 'hills',
    bounds: { w: 15200, h: 1080 },
    spawn: { x: 180, y: 560 },
    // On the ground, like every other goal in the game — level one's sits at
    // its ledge's own height. GOAL.R is forgiving enough either way, but a
    // flag floating 60px in the air is a flag drawn hovering.
    goal: { x: 15000, y: 760 },

    ground: [
      // A long flat with the first two patches on it, in the open, well
      // before any checkpoint. The first is close enough to spawn that
      // meeting a spike for the very first time costs almost nothing even
      // without a flag to catch it — that is the safe rehearsal the rule
      // asks for. The second is the same idea, met a second time, still on
      // easy ground, before the level asks for anything else at once.
      [[40, 760], [5200, 760]],
      // After a 200px gap — the same size as level one's, already met and
      // already practised there — a long flat with the third patch on it,
      // then up a ramp onto high ground with the fourth. Nothing guards the
      // gap itself: it is not the new idea here, only the spikes are, and
      // only a new idea earns its own checkpoint in this level.
      [[5400, 760], [9800, 760], [10150, 620], [11800, 620]],
      // Down off the high ground and a long flat home.
      [[11800, 620], [12150, 760], [15160, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 15160, y: 0, w: 40, h: 1080 },
    ],

    platforms: [
      // Across the gap, so it can be crossed by waiting as well as by jumping.
      // Two ways past the same obstacle is how a level stops being a wall.
      { x: 5240, y: 800, w: 150, h: 26, axis: 'x', dist: 70, period: 4.5, phase: 0 },
    ],

    spikes: [
      // The rehearsal: narrow, flat, unmissable, close to spawn.
      { x: 700, y: 760, w: 70 },
      // A second, still-easy patch on the same long flat — one more rep of
      // the new idea before the gap and the first checkpointed stretch.
      { x: 3400, y: 760, w: 90 },
      // The first patch that is really asked of the player, well after the
      // gap so the gap and the spikes are never one piece of timing.
      { x: 7200, y: 760, w: 100 },
      // On the high ground, in plain view from the top of the ramp before it
      // has to be jumped.
      { x: 11100, y: 620, w: 90 },
    ],

    // Two, not one per patch. The first two patches sit close to spawn and
    // are cheap to redo from it, which is the whole point of a rehearsal —
    // flagging them would just be banking progress nobody was going to lose.
    // Each checkpoint below sits right before the one real test that follows
    // it, so failing a patch costs that patch and nothing rolled through to
    // reach it.
    checkpoints: [
      { x: 7050, y: 760 },
      { x: 10950, y: 620 },
    ],
  },
];
```

Also update the file's own header comment above `export const LEVELS` — the paragraph beginning "Levels 1-3 below were rewritten in Sep 2026..." — by adding one sentence at its end:

```
// Reshuffled again in Sep 2026, days later: enemies moved to level two, so a
// new level was inserted there and the two levels that followed it (crates,
// spikes) each moved up by one id. Their own geometry did not change — see
// each level's own header comment for what moved and why.
```

- [ ] **Step 2: Run `levels.mjs` and fix anything it finds**

Run: `node games/pushkar-ball/tests/run.mjs offline/levels`

This checks ground winding, bounds, spawn/goal reachability, checkpoint placement, spike widths, and (existing checks, unaffected by this task) crate-vs-spike overlap. It does NOT yet check anything about enemies — that is Step 6 below, added after the level data itself is settled. If it fails on the new level 2 (most likely culprits: a checkpoint not settling cleanly, or geometry numbers that don't quite land — read the failure message, it names the exact level id, checkpoint index, or coordinate at fault), adjust the specific number the failure points at and re-run. This is ordinary iteration, not a sign of a deeper problem — see this plan's header note.

Expected once clean: `ALL LEVEL CHECKS PASSED`.

- [ ] **Step 3: Extend `runner()` in `finish.mjs` to jump over enemies too**

In `games/pushkar-ball/tests/offline/finish.mjs`, find `runner()`:

```js
function runner(level, lead) {
  const lines = level.data.ground || [];
  const edges = [];
  for (const line of lines) {
    const [ex, ey] = line[line.length - 1];
    const continues = lines.some((l) => l !== line && Math.abs(l[0][0] - ex) < 1 && Math.abs(l[0][1] - ey) < 1);
    if (!continues) edges.push(ex);
  }
  return (ball) => {
    const want = { right: true };
    if (!ball.grounded) return want;
    const ahead = (x, d) => x - ball.x > 0 && x - ball.x < d * lead;
    if (edges.some((x) => ahead(x, 20))) want.jump = true;
    if (level.spikes.some((s) => ahead(s.x, 70))) want.jump = true;
    // A crate is jumped onto and rolled off, never pushed along by the runner:
    // pushing is slow and that is not the question here.
    if (level.crates.some((c) => ahead(c.x, 40) && ball.y > c.y)) want.jump = true;
    return want;
  };
}
```

Change the body of the returned function to add one more line, and update the doc comment above `runner` to mention it:

```js
/**
 * Roll right, jumping a little before whatever is ahead.
 *
 * `lead` scales how early it jumps, which is how a run is made sloppy on
 * purpose. The obstacles come from the level: the end of any ground line that
 * no other line carries on from, every spike patch, every crate that is
 * still in the way, and every alive enemy.
 *
 * An enemy is treated exactly like a spike here — jumped over, not avoided by
 * any smarter means. Landing on one from above still defeats it (a bonus, not
 * a problem for this check); an occasional side graze costs a heart, which
 * three hearts of budget easily absorbs across a run. Nothing here tries to
 * dodge a popper's lobbed projectile specifically, for the same reason: it is
 * meant to be a minor tap, not a precision dodge, and the same heart budget
 * covers it.
 */
function runner(level, lead) {
  const lines = level.data.ground || [];
  const edges = [];
  for (const line of lines) {
    const [ex, ey] = line[line.length - 1];
    const continues = lines.some((l) => l !== line && Math.abs(l[0][0] - ex) < 1 && Math.abs(l[0][1] - ey) < 1);
    if (!continues) edges.push(ex);
  }
  return (ball) => {
    const want = { right: true };
    if (!ball.grounded) return want;
    const ahead = (x, d) => x - ball.x > 0 && x - ball.x < d * lead;
    if (edges.some((x) => ahead(x, 20))) want.jump = true;
    if (level.spikes.some((s) => ahead(s.x, 70))) want.jump = true;
    if (level.enemies.some((e) => e.alive && ahead(e.x, 70))) want.jump = true;
    // A crate is jumped onto and rolled off, never pushed along by the runner:
    // pushing is slow and that is not the question here.
    if (level.crates.some((c) => ahead(c.x, 40) && ball.y > c.y)) want.jump = true;
    return want;
  };
}
```

- [ ] **Step 4: Rekey `ROUTES`, and add the new level 2's**

In `games/pushkar-ball/tests/offline/finish.mjs`, find the `ROUTES` object:

```js
const ROUTES = {
  // Level one: run, then stop at the last gap, wait for the platform, ride it
  // across and hop up to the ledge. Nothing but the platform reaches that
  // ledge, so there is no route that does not wait for it.
  1: (level, lead) => {
    ...
  },

  // Level two: run to the flat below the ledge, shove the crate against the
  // ledge's face, back off, hop onto the crate and jump from it to the ledge.
  2: (level, lead) => {
    ...
  },

  // Level three: nothing but running and jumping. The platform across its gap
  // is the second way over, not the only one.
  3: (level, lead) => runner(level, lead),
};
```

Change it to (the level-1 and old-level-2 route BODIES are unchanged — only their KEYS move, and the comments above them are updated to match; a new key 2 is added for the new enemies level):

```js
const ROUTES = {
  // Level one: run, then stop at the last gap, wait for the platform, ride it
  // across and hop up to the ledge. Nothing but the platform reaches that
  // ledge, so there is no route that does not wait for it.
  1: (level, lead) => {
    const run = runner(level, lead);
    const m = level.movers[0];
    const edge = 16200;         // the end of the ground before the last gap
    const ledge = 16560;        // where the ledge begins
    let stage = 'run';
    return (ball) => {
      if (stage === 'run') {
        if (ball.x > edge - 120) stage = 'wait';
        else return run(ball);
      }
      if (stage === 'wait') {
        // Come to a stop short of the edge, then go when the platform is at
        // its nearest and about to head for the ledge.
        if (ball.x > edge - 50) return { left: ball.vx > 0 };
        if (Math.abs(ball.vx) < 30 && m.x < edge + 15 && m.vx < 0) stage = 'board';
        return { right: ball.vx < 0 };
      }
      if (stage === 'board') {
        if (ball.platform === m) stage = 'ride';
        else return { right: ball.x < m.x + 40, jump: ball.grounded && !ball.platform };
      }
      if (stage === 'ride') {
        if (m.x + m.w > ledge - 40 && ball.platform === m) stage = 'leap';
        else {
          const mid = m.x + m.w / 2;
          return { right: ball.x < mid - 20, left: ball.x > mid + 20 };
        }
      }
      return { right: true, jump: !!ball.platform };
    };
  },

  // Level two: nothing but running and jumping — over gaps and every enemy
  // it meets. There is no crate or platform puzzle here; the generic runner
  // is the whole route, the same shape level three (spikes) already used.
  2: (level, lead) => runner(level, lead),

  // Level three: run to the flat below the ledge, shove the crate against the
  // ledge's face, back off, hop onto the crate and jump from it to the ledge.
  // Moved here from level two in the Sep 2026 curriculum reshuffle — the
  // route body is unchanged, only its key moved with the level.
  3: (level, lead) => {
    const run = runner(level, lead);
    const crate = level.crates[0];
    const face = level.walls.find((w) => w.h < level.bounds.h);  // the ledge's stone face
    let stage = 'run', stuck = 0, lastX = crate.x;
    return (ball) => {
      if (stage === 'run') {
        // Onto the lower flat, left of the crate: stop running, start pushing.
        if (ball.grounded && ball.y > face.y + 100 && ball.x > crate.x - 200 && ball.x < crate.x) stage = 'push';
        else return run(ball);
      }
      if (stage === 'push') {
        // Push until the crate is up against the face and stops moving.
        stuck = Math.abs(crate.x - lastX) < 0.01 && crate.x + crate.w > face.x - 5 ? stuck + 1 : 0;
        lastX = crate.x;
        if (stuck > 30) stage = 'back';
        return { right: true };
      }
      if (stage === 'back') {
        if (ball.x < crate.x - 90) stage = 'hop';
        return { left: true };
      }
      if (stage === 'hop') {
        if (ball.grounded && ball.platform === crate) stage = 'up';
        return { right: true, jump: ball.grounded && ball.platform !== crate && ball.x > crate.x - 70 * lead };
      }
      return { right: true, jump: ball.grounded && ball.platform === crate };
    };
  },

  // Level four: nothing but running and jumping. The platform across its gap
  // is the second way over, not the only one. Moved here from level three in
  // the Sep 2026 curriculum reshuffle — unchanged otherwise.
  4: (level, lead) => runner(level, lead),
};
```

- [ ] **Step 5: Update check 3's level lookup**

In `games/pushkar-ball/tests/offline/finish.mjs`, find:

```js
// --- 3. level two cannot be finished without its crate ----------------------
//
// It is the level that teaches the crate, and a ledge a strong jump can reach
// teaches nothing: the child simply never learns there was another way. So
// take the crate away and try everything a ball on the flat below can do —
// jump from every point along it, once or over and over, running right the
// whole time — and the ledge must stay out of reach.
//
// The margin is pinned, not only the verdict. The ledge is at y=620, so a
// ball has to get its centre above 600 to land on it; from the flat at 800 a
// jump brings the centre to about 649. That is 49px short, measured here
// rather than trusted from a comment — and if a change to the jump eats most
// of it, this says so before the level quietly stops needing the crate.
console.log('\n3. level two without its crate');
{
  const data = LEVELS.find((l) => l.id === 2);
  if (!data) fail('there is no level 2');
```

Change the `console.log` and the `LEVELS.find` line (leave everything else in this block exactly as it is — the arithmetic and the rest of the check do not depend on which id this is):

```js
// --- 3. level three cannot be finished without its crate --------------------
//
// It is the level that teaches the crate, and a ledge a strong jump can reach
// teaches nothing: the child simply never learns there was another way. So
// take the crate away and try everything a ball on the flat below can do —
// jump from every point along it, once or over and over, running right the
// whole time — and the ledge must stay out of reach.
//
// The margin is pinned, not only the verdict. The ledge is at y=620, so a
// ball has to get its centre above 600 to land on it; from the flat at 800 a
// jump brings the centre to about 649. That is 49px short, measured here
// rather than trusted from a comment — and if a change to the jump eats most
// of it, this says so before the level quietly stops needing the crate.
//
// Moved here from level two in the Sep 2026 curriculum reshuffle — only the
// id this check looks up changed; the level's own geometry and this
// arithmetic did not.
console.log('\n3. level three without its crate');
{
  const data = LEVELS.find((l) => l.id === 3);
  if (!data) fail('there is no level 3');
```

- [ ] **Step 6: Run `finish.mjs` and fix anything it finds**

Run: `node games/pushkar-ball/tests/run.mjs offline/finish`

This is the real proof: every level driven from its spawn and from every checkpoint, 30 ways each. If level 2 fails, the failure output names exactly which lead/delay combination failed and where the ball ended up — the most likely causes, in rough order of likelihood, are: a checkpoint positioned so a respawn-from-rest cannot clear the gap right after it (the exact class of bug this suite has caught here before — see this plan's header note), a roller patrol range that puts it somewhere the generic runner's 70-unit jump lead cannot clear cleanly, or hearts running out across a full clumsy run (unlikely with three hearts and forgiving invincibility, but possible if two enemies and a spike were all reachable in the same short stretch — this level has none, but if you have changed anything, re-check). Adjust the specific number the failure points at — most often a checkpoint's `x`, a `from`/`to` on the roller, or a gap width — and re-run. Check 3 (level three's crate-necessity proof) should need no changes at all; if it fails, that is a sign something in Step 1 or Step 5 was not applied cleanly, not a new problem with level three's own geometry.

Expected once clean: `EVERY LEVEL CAN BE FINISHED`.

- [ ] **Step 7: Add two enemy authoring-safety checks to `levels.mjs`**

In `games/pushkar-ball/tests/offline/levels.mjs`, the per-level loop already has checks numbered up to 10 (crate-vs-spike overlap). Add two more, right after check 10's closing `}` and before the loop's own closing `}`:

```js

  // --- 11. an enemy's own range never leaves the level bounds -------------
  //
  // A walker or roller authored to patrol past the edge of the level would
  // wander into geometry that does not exist — the same class of mistake
  // check 4 already catches for moving platforms.
  for (const [i, e] of (data.enemies || []).entries()) {
    if (e.kind === 'walker') {
      const lo = e.x - e.amplitude, hi = e.x + e.amplitude;
      if (lo < 0 || hi > authored.bounds.w) {
        fail(`level ${data.id}: walker ${i} patrols ${lo.toFixed(0)}..${hi.toFixed(0)}, outside the level`);
      }
    } else if (e.kind === 'roller') {
      if (e.from < 0 || e.to > authored.bounds.w) {
        fail(`level ${data.id}: roller ${i} patrols ${e.from}..${e.to}, outside the level`);
      }
    } else if (e.kind === 'popper') {
      if (e.x < 0 || e.x > authored.bounds.w) {
        fail(`level ${data.id}: popper ${i} at x=${e.x} is outside the level`);
      }
    }
  }

  // --- 12. nothing may hurt you where you arrive ---------------------------
  //
  // The same rule check 8 already applies to spikes, extended to enemies: an
  // enemy overlapping the spawn or a checkpoint is an unfinishable level.
  {
    const { enemyHit } = await import('../../js/enemies.js');
    for (const a of arrivals) {
      const probe = { x: a.x, y: a.y, r: CONFIG.BALL.R * 2.5 };
      if (enemyHit(probe, authored.enemies)) fail(`level ${data.id}: an enemy is on top of ${a.what}`);
    }
  }
  if (authored.enemies.length) {
    console.log(`   ${authored.enemies.length} enemy/enemies; none patrol outside the level, none overlap the spawn or a checkpoint`);
  }
```

(`arrivals` is already defined earlier in the same per-level loop, by check 8 — reuse it rather than rebuilding it. If dynamic `import()` inside the loop feels out of place next to this file's other top-of-file imports, move `const { enemyHit } = await import('../../js/enemies.js');` to the top of the file alongside the existing `import` lines instead — either is fine, but do not import it twice.)

- [ ] **Step 8: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite passes, including `levels.mjs` and `finish.mjs` with their new checks.

- [ ] **Step 9: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs games/pushkar-ball/tests/offline/levels.mjs
git commit -m "$(cat <<'EOF'
Reshuffle the curriculum: enemies move to level two

Level two is now the first-enemy level (a walker and a popper rehearsed
once each, a roller as the level's real test, a second walker on the way
out). Crates move from level two to level three; spikes move from level
three to level four. Both moved levels keep their geometry unchanged —
only their id and finish.mjs's matching route key moved. The generic
completability runner now jumps over an alive enemy the same way it
already jumps over a spike, and levels.mjs gained two authoring-safety
checks for enemies mirroring the ones it already had for platforms and
spikes.

Closes the Curriculum reshuffle section of
docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md.
Part of docs/superpowers/plans/2026-09-11-curriculum-reshuffle.md, Task 1.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Verify the rest of the suite, look at level two, and deploy

**Files:** none expected — this task runs commands, looks at the result, and fixes anything it finds. If it finds something, note in your report exactly what and how you fixed it; do not silently patch and move on.

- [ ] **Step 1: Run the full local suite, including browser**

Run: `node games/pushkar-ball/tests/run.mjs`

Expected: every suite passes, including the browser suites (`roll`, `jump`, `deflate`, `small`). None of them should be affected by this reshuffle — they all exercise level one, which this plan does not touch — but this is a real check, not a formality: if one of them turns out to reference level content by index or id in a way this plan's changes upset, that is a genuine finding. Investigate the actual cause before changing anything, per `CLAUDE.md`'s "Tests are usually the thing that is wrong" guidance.

- [ ] **Step 2: Look at level two**

Run the browser suites once more with screenshots already produced by Step 1 (`node games/pushkar-ball/tests/run.mjs browser` if you want a fresh set), but also specifically look at level two, since nothing in the existing browser suites drives it — they all target level one. Build a small throwaway script or reuse the pattern from the enemies plan's Task 3 ("look at it" scratch HTML) to render level two: load `LEVELS[1]`, draw it at a few camera positions covering the walker, the popper, the roller, and the goal.

Confirm by eye: the level reads as playable and legible — gaps are visible against the ground, all four enemies are visibly distinct violet shapes with faces, the popper's lobbed projectile is visible when it fires, nothing overlaps in a way that reads as a level-design mistake. Delete any scratch file you create before committing — nothing from this step should be committed; if you found no code issue, there is nothing to commit at all for this step.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Poll the deployed site until it has rebuilt**

Run (repeat every ~15-20s until it succeeds):

```bash
curl -s "https://tauruskin.github.io/taras-town/games/pushkar-ball/js/levels.js?cb=1" | grep -c "teaches the enemy"
```

Expected: `1`, once the deploy has rolled out (it will print `0` beforehand).

- [ ] **Step 5: Run the live browser suites**

Run: `node games/pushkar-ball/tests/run.mjs browser --live`
Expected: every browser suite passes against the deployed site.

- [ ] **Step 6: Report**

Summarize for the user: enemies are now live in level 2 — a walker and a popper met once each, a roller as the level's real test, a second walker on the way to the goal. Crates moved to level 3; spikes moved to level 4. This closes out Phase A of the design spec (health system, enemies, curriculum reshuffle all shipped). Note explicitly what remains out of scope: Phase B (saws, conveyors, crushers, launchers, ice/sticky surfaces, the toy-factory theme for level 5) and the separately-deferred coins/shop/ball-skins idea — neither has a plan written yet.

---

## Plan self-review notes

*(For whoever executes this plan: these are the author's own checks, already done — recorded here so a re-review is not needed unless something changes.)*

- **Spec coverage:** every element of the design spec's "Curriculum reshuffle" table is covered — level 1 unchanged, level 2 now enemies, level 3 now crates (moved from 2), level 4 now spikes (moved from 3), level 5 untouched (still doesn't exist, which is correct — it's Phase B's job). "One new idea per level" holds for the new level 2 (enemies only; no crate, no spike, no platform puzzle). "First appearance of a new hazard is unguarded" holds (both the walker and the popper are met before checkpoint one).
- **Placeholder scan:** no TBD/TODO; every step shows complete code. The one place this plan is honest about being provisional — level 2's exact numbers — is explicitly flagged as such in the header, with a documented, precedented process for what to do if the test suite disagrees, rather than being left vague.
- **Type/name consistency, checked against the already-shipped enemies plan:** `{kind:'walker', x, y, amplitude}`, `{kind:'roller', x, y, from, to, dir}`, `{kind:'popper', x, y, dir}` all match `js/enemies.js`'s `makeWalker`/`makeRoller`/`makePopper` exactly (checked against the current, shipped file, not the plan that built it). `CONFIG.ENEMY.WALKER.R`/`ROLLER.R`/`POPPER.R` are used for each enemy's `y` (so its own radius rests it on the ground at `y: 760 - R`, the identical pattern `tests/offline/enemies.mjs` already uses for its own walker fixtures) — checked against the shipped `config.js`.
- **A risk worth naming for whoever executes this:** Task 1's level 2 geometry is the single biggest source of uncertainty in this plan, exactly as this game's own history already shows for level authoring in general. Budget real time for Steps 2 and 6's iteration loops — they are not a formality, they are how this codebase has always found its real level-design bugs, and finding one here is success, not failure.
