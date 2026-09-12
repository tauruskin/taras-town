# Livelier Level One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill most of level one's long empty flats without making it harder. A stone block and one small spike patch go in the unguarded first third, and a third gap, a third crate and a two-step stone staircase go in the middle third. Every existing piece stays exactly where it is.

**Architecture:** Mostly a level-data change to `LEVELS[0]` (id 1) in `games/pushkar-ball/js/levels.js`, plus comment updates. There is one test-harness change: `tests/offline/finish.mjs`'s generic `runner` learns to jump a low stone box, the same shape as its existing crate rule. Without it, the runner rolls into the stone block and stops for good. There are no game-engine, config or route changes. Docs follow: a named exception to the one-new-idea rule, a curriculum-table note, and the follow-ups doc.

**Tech Stack:** Vanilla ES modules, no dependencies. The existing dependency-free test harness in `games/pushkar-ball/tests/`.

**Spec:** `docs/superpowers/specs/2026-09-12-livelier-level-one-design.md`.

**A note on the numbers, before you start.** Every coordinate below was **tried and verified while this plan was written**, at each of the in-between states the tasks pass through, not only at the end:

- **After Task 1** (block and runner rule): `finish.mjs` passes, and level one's slowest run is 47.0s.
- **After Task 2** (plus the spike patch): `finish.mjs` passes, still at 47.0s. The hearts check finds no heart lost anywhere.
- **After Task 3** (everything): all 14 offline suites pass, and level one's slowest run is 48.0s. It was 46.5s before this plan. Levels two to four finish in exactly the same times as before, to the tenth of a second.
- **Without the runner rule**, all 30 of level one's runs stop dead at x=4230 against the stone block. Every checkpoint start stops at x=12480 against the staircase.

So if a suite fails after you apply a step, **first diff your edit against the plan's code block**: a typo in a number is far more likely than a wrong number. Only if the edit matches exactly should you treat it as a real finding. In that case, investigate it the way this codebase always has (read the failure, instrument, then adjust) and report it. Do not quietly patch it.

**Why a spike patch and not a walker.** The spec's "Why not a walker" has the full story. Over a walker's whole cycle, a late jumper loses two or three hearts on about 7 of 47 arrivals, and every shipped walker does the same. A 70-wide spike patch cost no heart at any lead or start delay. **Do not swap a walker back in** without reopening that design question with the user.

---

## Before you start

Read these first. Every task below assumes you know them:

- `CLAUDE.md` at the repo root, especially "Rules for the whole hub" and "The shape of the thing — Pushkar Ball". In particular: wood means you can push it, stone means you cannot; level one's first flat stays clear; tests never contain a coordinate that the game already knows.
- `docs/superpowers/specs/2026-09-12-livelier-level-one-design.md`, the approved design this plan implements.
- `games/pushkar-ball/js/levels.js`: level one (`id: 1`), and level three's `boxes`. Level three's ledge face is the existing stone box this plan's steps are modelled on, and its comment explains why a step is a box and not a bend in the ground.
- `games/pushkar-ball/tests/offline/finish.mjs`: the `runner` function and `ROUTES[1]`.

Run `node games/pushkar-ball/tests/run.mjs offline` once from the repo root before starting, to confirm the baseline is green (14 suites).

The suite wrapper only prints one summary line per suite. To see a suite's own lines, which several steps below quote, run the file directly from its folder, e.g. `cd games/pushkar-ball/tests/offline && node finish.mjs`.

---

### Task 1: finish.mjs's runner learns stone steps, and level one gets its stone block

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (one new stone box in level one's `boxes`)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (one new rule in `runner`, and two comments)
- Modify: `games/pushkar-ball/tests/README.md` (the `finish` row)

The block goes in first, so the suite fails for the right reason before the runner is taught anything.

- [ ] **Step 1: Add the stone block to level one**

In `games/pushkar-ball/js/levels.js`, in level one's `boxes`, find:

```js
      { x: 2450, y: 660, w: 100, h: 100, movable: true },
      { x: 8300, y: 660, w: 110, h: 100, movable: true },
    ],
```

Replace it with:

```js
      { x: 2450, y: 660, w: 100, h: 100, movable: true },
      { x: 8300, y: 660, w: 110, h: 100, movable: true },
      // A low stone block on the long flat after the first bowl: hop up, roll
      // across, drop off. Stone, not wood, so it cannot be pushed, which keeps
      // "wood means you can push it" true. A step is a box rather than a bend
      // in the ground for the reason level three's ledge face gives: a
      // vertical ground segment faces sideways, and levels.mjs rightly
      // insists every ground segment faces up. 60 tall, so a jump, which
      // lifts the ball 131, clears it with more than twice the height needed.
      { x: 4250, y: 700, w: 200, h: 60 },
    ],
```

- [ ] **Step 2: Run the completability proof and watch it fail**

Run from the repo root: `node games/pushkar-ball/tests/run.mjs offline/finish`

Expected: FAIL. Level one is not finished cleanly **30 times of 30**, and every listed run ends `won=false deaths=0 at 4230,740`. The ball has rolled into the block's face and cannot get past it. Levels two to four still pass. If it fails anywhere else, stop and check your edit against Step 1.

- [ ] **Step 3: Teach the runner to jump a low stone box**

In `games/pushkar-ball/tests/offline/finish.mjs`, inside `function runner(level, lead)`, find:

```js
    // A crate is jumped onto and rolled off, never pushed along by the runner:
    // pushing is slow and that is not the question here.
    if (level.crates.some((c) => ahead(c.x, 40) && ball.y > c.y)) want.jump = true;
    return want;
```

Replace it with:

```js
    // A crate is jumped onto and rolled off, never pushed along by the runner:
    // pushing is slow and that is not the question here.
    if (level.crates.some((c) => ahead(c.x, 40) && ball.y > c.y)) want.jump = true;
    // A low stone box, a step like level one's block and staircase, is met
    // the same way, since it cannot be pushed at all. Full-height boxes are
    // the level's end walls and are never ahead of anything. Level three's
    // ledge face is a low stone box too, but its route stops using the runner
    // well before the ball gets near it.
    if (level.walls.some((w) => w.h < level.bounds.h && ahead(w.x, 40) && ball.y > w.y)) want.jump = true;
    return want;
```

`level.walls` is every non-movable box (see `this.walls` in `levels.js`'s loader). `ball.y > w.y` means the ball's centre is below the box's top, so there is something to get up onto. A ball already on top of a step is not made to jump off it.

- [ ] **Step 4: Update the two comments that list what the runner jumps**

Still in `finish.mjs`, in the header comment near the top, find:

```js
// Most of the driving is one generic runner that reads the level's own data:
// roll right, and jump a little before any gap edge, spike patch, crate or
// enemy ahead. Only the two things a runner cannot do by rolling right get a
```

Replace it with:

```js
// Most of the driving is one generic runner that reads the level's own data:
// roll right, and jump a little before any gap edge, spike patch, crate,
// stone step or enemy ahead. Only the two things a runner cannot do by
// rolling right get a
```

The next line, `// script of their own — riding level one's platform to its last ledge, and`, is unchanged and continues the sentence.

Then in the doc comment above `function runner`, find:

```js
 * purpose. The obstacles come from the level: the end of any ground line that
 * no other line carries on from, every spike patch, every crate that is
 * still in the way, and every alive enemy.
```

Replace it with:

```js
 * purpose. The obstacles come from the level: the end of any ground line that
 * no other line carries on from, every spike patch, every crate or low stone
 * step that is still in the way, and every alive enemy.
```

- [ ] **Step 5: Update the tests README's `finish` row**

In `games/pushkar-ball/tests/README.md`, in the `finish` row of the offline table, find the text `(a generic runner — which jumps gaps, spikes, crates and enemies — plus scripts` and replace it with `(a generic runner — which jumps gaps, spikes, crates, stone steps and enemies — plus scripts`. Change nothing else in the row.

- [ ] **Step 6: Run the completability proof and watch it pass**

From `games/pushkar-ball/tests/offline/`, run: `node finish.mjs`

Expected: section 1 prints `level 1: finished every time without failing, slowest in 47.0s`, and levels two to four print exactly these, unchanged from before this plan:

```
   level 2: finished every time without failing, slowest in 32.6s
   level 3: finished every time without failing, slowest in 39.9s
   level 4: finished every time without failing, slowest in 36.2s
```

Section 2 prints `level 1: finished from each of its 2 checkpoints`, section 3 is unchanged at `52px short of 600`, and the suite ends `EVERY LEVEL CAN BE FINISHED`. If any of levels two to four has a different time, the new rule has changed a route it should not have, so stop and report it.

- [ ] **Step 7: Run the full offline suite**

From the repo root: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all 14 suites pass.

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs games/pushkar-ball/tests/README.md
git commit -m "$(cat <<'EOF'
Give level one a stone block, and teach finish.mjs to hop steps

A low stone block (200 wide, 60 tall) on the long flat after level one's
first bowl. Stone because it cannot be pushed; a box because a vertical
ground segment faces sideways and levels.mjs requires every ground
segment to face up, the same reason level three's ledge face is a box.

finish.mjs's generic runner rolled into it and stopped at x=4230 on all
30 runs. It now jumps before any low stone box ahead, the same shape as
its crate rule. Levels two to four finish in exactly the same times as
before; level one's slowest run goes from 46.5s to 47.0s.

Part of docs/superpowers/plans/2026-09-12-livelier-level-one.md, Task 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Level one's spike patch, and the comments it makes stale

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (level one: a new `spikes` array, its second ground comment, its checkpoints comment; level four: its header and its first ground comment)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (section 4's comment)

- [ ] **Step 1: Add level one's `spikes` array**

In `games/pushkar-ball/js/levels.js`, in level one, find the end of its `platforms` array and the checkpoints comment that follows it:

```js
      { x: 9700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 },
    ],

    // Two, breaking the level into three pieces of roughly a third each
```

Insert a `spikes` array between them, so the block becomes:

```js
      { x: 9700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 },
    ],

    spikes: [
      // The game's first spike patch, and level one's one preview of a later
      // level's idea. It is a named exception to "at most one new idea per
      // level", recorded in
      // docs/superpowers/specs/2026-09-12-livelier-level-one-design.md, and
      // it is not a precedent. Level four is where spikes are taught; this is
      // one narrow patch, level four's own rehearsal width, on open flat
      // ground 950 units past the stone block and 930 short of hill two, so it
      // is never met at the same moment as anything else. It can cost a
      // heart, never a fall. finish.mjs's runner jumps it without losing a
      // heart at every lead and start delay it tries, and so does a finer
      // sweep (five leads, a start every 0.1s) with the patch moved 100 units
      // either way or widened to 90.
      { x: 5400, y: 760, w: 70 },
    ],

    // Two, breaking the level into three pieces of roughly a third each
```

- [ ] **Step 2: Update level one's second ground comment**

Still in level one, in `ground`, find:

```js
      // After a 200px gap: a bowl, a long flat run with nothing in it — pure
      // rolling, the kind of stretch a long level needs and a short one has no
      // room for — then a second, bigger hill and a flat to the second gap.
```

Replace it with:

```js
      // After a 200px gap: a bowl, then a long flat with two small things on
      // it, well apart: a stone block to hop onto and off (see `boxes`) and
      // the game's first spike patch (see `spikes`). Then a second, bigger
      // hill and a flat to the second gap.
```

Do not change the polyline under it.

- [ ] **Step 3: Update level one's checkpoints comment**

Still in level one, find:

```js
    // Two, breaking the level into three pieces of roughly a third each
    // rather than guarding every gap. The first ~8700 units — the first hill,
    // both crates' worth of terrain, the first gap and bowl, the second hill —
    // have no checkpoint at all: none of it is the level's hard part, it is
    // the level's ROLLING, and a checkpoint there would only be banking
    // progress nobody was going to lose. The two below sit right before the
    // two stretches that can actually be failed: the second gap, and the
    // final hill-then-platform approach.
```

Replace it with:

```js
    // Two, breaking the level into three pieces of roughly a third each
    // rather than guarding every gap. The first ~8700 units — the first hill,
    // the first two crates' worth of terrain, the first gap and bowl, the
    // stone block, the spike patch, the second hill — have no checkpoint at
    // all: none of it is the level's hard part, it is the level's ROLLING,
    // and a checkpoint there would only be banking progress nobody was going
    // to lose. That is also why nothing on that stretch can be failed by a
    // fall except the first gap, which the level has always had. The two
    // below sit right before the two stretches that can actually be failed:
    // the second and third gaps, and the final hill-then-platform approach.
```

"The second and third gaps" is only true once Task 3 adds the third gap. That is deliberate, so this comment is written once. Task 3 checks it.

- [ ] **Step 4: Update level four's header comment**

Find level four's header comment (the object with `id: 4`):

```js
    // Level four teaches the spike — reshuffled here Sep 2026 from its
    // original home at level three, so crates could move down to level three
    // and enemies could move up to level two. Everything under it — rolling,
    // gaps, crates, a moving platform, enemies — has already been met. Its
    // ground, platform, spikes and checkpoints are unchanged from the
    // original level three.
```

Replace it with:

```js
    // Level four teaches the spike — reshuffled here Sep 2026 from its
    // original home at level three, so crates could move down to level three
    // and enemies could move up to level two. Everything under it — rolling,
    // gaps, crates, a moving platform, enemies — has already been met, and
    // so has one narrow spike patch, glimpsed once on open ground in level
    // one; this is where spikes are taught. Its ground, platform, spikes and
    // checkpoints are unchanged from the original level three.
```

Leave the paragraph after it, about the recurring roller, unchanged.

- [ ] **Step 5: Update level four's first ground comment**

Still in level four, in `ground`, find:

```js
      // A long flat with the first two patches on it, in the open, well
      // before any checkpoint. The first is close enough to spawn that
      // meeting a spike for the very first time costs almost nothing even
      // without a flag to catch it — that is the safe rehearsal the rule
      // asks for. The second is the same idea, met a second time, still on
      // easy ground, before the level asks for anything else at once.
```

Replace it with:

```js
      // A long flat with the first two patches on it, in the open, well
      // before any checkpoint. The first is close enough to spawn that
      // meeting a spike here costs almost nothing even without a flag to
      // catch it: the safe rehearsal the rule asks for, and a reminder of the
      // one patch level one showed. The second is the same idea, met again,
      // still on easy ground, before the level asks for anything else at
      // once.
```

- [ ] **Step 6: Update finish.mjs section 4's comment**

In `games/pushkar-ball/tests/offline/finish.mjs`, find:

```js
// of hearts. This proves the OTHER path is real too: play level one for real
// up to its first checkpoint, take three hits by hand (level one has no
// spikes and no enemies to supply them for real), and confirm the ball comes
```

Replace it with:

```js
// of hearts. This proves the OTHER path is real too: play level one for real
// up to its first checkpoint, take three hits by hand (level one has no
// enemies, and the runner clears its one spike patch without a touch, so
// nothing there supplies them for real), and confirm the ball comes
```

Change nothing else in section 4.

- [ ] **Step 7: Run the authoring-safety suite**

From `games/pushkar-ball/tests/offline/`: `node levels.mjs`

Expected: level one's block now includes the line `1 spike patch(es), widest 70px; a perfect jump clears 236px`, and the suite ends `ALL LEVEL CHECKS PASSED`.

- [ ] **Step 8: Run the completability proof**

From `games/pushkar-ball/tests/offline/`: `node finish.mjs`

Expected: `level 1: finished every time without failing, slowest in 47.0s`, `level 1: finished from each of its 2 checkpoints`, section 4 prints `after 3 hits past checkpoint 0: hearts=3, x=200 (level start 200)`, and the suite ends `EVERY LEVEL CAN BE FINISHED`.

- [ ] **Step 9: Run the hearts check**

finish.mjs counts deaths, not hearts, so a spike patch that took a heart on every run would still pass it. The hearts check in the Appendix is a scratch tool and **must not be committed or copied into the repo**. A copy exists at `C:\Users\OLEKSA~1\AppData\Local\Temp\claude\d--VIBE-CODING-Taras-Town\219f7342-f4a9-4b85-bbad-8819ef5fd6a3\scratchpad\level1-hearts.mjs`. If it is missing, or you are in a different session, write the Appendix's code into your own scratchpad first.

Run from the repo root (adjust the path if you wrote your own copy):

```bash
node "C:/Users/OLEKSA~1/AppData/Local/Temp/claude/d--VIBE-CODING-Taras-Town/219f7342-f4a9-4b85-bbad-8819ef5fd6a3/scratchpad/level1-hearts.mjs"
```

Expected output, exactly as measured while this plan was written:

```
1. finish.mjs's matrix: 0 run(s) not finished cleanly; fewest hearts ever held: 3 of 3   (want: 0 and 3)
2. spawn to checkpoint one, 5 leads x 47 delays: 0 of 235 runs lost a heart   (want: 0 of 235)
3. the spike patch nudged (runs that lost a heart, of 235):
   x=5300 w=70: 0 of 235
   x=5300 w=90: 0 of 235
   x=5400 w=70: 0 of 235
   x=5400 w=90: 0 of 235
   x=5500 w=70: 0 of 235
   x=5500 w=90: 0 of 235
```

Every count must be 0, and the fewest hearts must be 3. Paste the actual output into your report.

- [ ] **Step 10: Run the full offline suite**

From the repo root: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all 14 suites pass.

- [ ] **Step 11: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs
git commit -m "$(cat <<'EOF'
Give level one the game's first spike patch

One 70-wide patch on open flat ground at 5400, 950 units past the new
stone block and 930 short of hill two: level one's one preview of a
later level's idea, a named exception to the one-new-idea rule. Level
four is still where spikes are taught, and its comments now say a patch
was glimpsed once before it.

finish.mjs's runner never loses a heart to it, at any lead or start
delay, nor on a finer sweep with the patch moved 100 units either way or
widened to 90. A walker was tried here first and dropped: over a whole
cycle, a late jumper loses two or three hearts on about 7 of 47 arrivals.

Part of docs/superpowers/plans/2026-09-12-livelier-level-one.md, Task 2.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The middle third — a third gap, a third crate and a stone staircase

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (level one: its third ground polyline splits in two; three new boxes; the crates comment; the lift comment)

- [ ] **Step 1: Split the third ground polyline to make the gap**

In level one's `ground`, find:

```js
      // After the 240px second gap: a second bowl, another long flat, a third
      // and tallest hill, then flat to the final approach. The vertical lift
      // sits somewhere in the long flat between the bowl and the hill —
      // nothing needs it, same as the first level ever had.
      [
        [9090, 760], [10600, 760], [10950, 760], [11100, 840], [11300, 840], [11450, 760], [12200, 760],
        [13800, 760], [14350, 520], [15000, 520], [15550, 760], [16200, 760],
      ],
```

Replace it with:

```js
      // After the 240px second gap: a flat with the vertical lift over it
      // (nothing needs the lift, same as the first level ever had), then a
      // third gap. It is 200px, the width the first one already proved, and
      // it comes after checkpoint one, so missing it costs a short trip back
      // to that flag rather than the whole level.
      [[9090, 760], [10150, 760]],
      // Then a second bowl, another long flat with a crate and a two-step
      // stone staircase on it (see `boxes`), a third and tallest hill, and
      // flat to the final approach.
      [
        [10350, 760], [10600, 760], [10950, 760], [11100, 840], [11300, 840], [11450, 760], [12200, 760],
        [13800, 760], [14350, 520], [15000, 520], [15550, 760], [16200, 760],
      ],
```

The old comment put the lift "between the bowl and the hill". It never was: the lift is at 9700, before the second bowl. Both halves are authored left to right, and the second still ends at 16200, which `finish.mjs`'s level-one route hardcodes.

- [ ] **Step 2: Add the crate and the staircase, and update the crates comment**

Still in level one's `boxes`, find:

```js
      // Two wooden crates, and both can be pushed. Jump them, roll over them
      // at speed, or shove them about.
```

Replace it with:

```js
      // Three wooden crates, and all can be pushed. Jump them, roll over them
      // at speed, or shove them about.
```

Leave the paragraph after it ("Nothing in THIS level needs a crate…") exactly as it is. It is still true: nothing added by this plan needs a crate either.

Then find the stone block added in Task 1, and the end of the array:

```js
      { x: 4250, y: 700, w: 200, h: 60 },
    ],
```

Replace it with:

```js
      { x: 4250, y: 700, w: 200, h: 60 },
      // The third crate, on the long flat after the second bowl, 600 clear of
      // the staircase ahead and well clear of the third gap behind.
      { x: 11800, y: 660, w: 100, h: 100, movable: true },
      // A two-step stone staircase: a wide step 60 tall, and a narrower one
      // 60 taller standing on its middle. Up, up, and back down. No step is
      // more than 60 above what the ball stands on, the same as the block.
      { x: 12500, y: 700, w: 400, h: 60 },
      { x: 12600, y: 640, w: 200, h: 60 },
    ],
```

- [ ] **Step 3: Correct the lift's comment**

Still in level one, in `platforms`, find:

```js
      // A lift over the long flat between the first bowl and the second hill.
      // Nothing needs it; it is here so vertical movers are exercised by the
      // game and not only by the tests.
```

Replace it with:

```js
      // A lift over the flat between the second gap and the third. Nothing
      // needs it; it is here so vertical movers are exercised by the game
      // and not only by the tests.
```

Do not change the platform's numbers.

- [ ] **Step 4: Check every level-one comment against the data**

Read level one's object top to bottom once. Every comment must now match its data. In particular, the checkpoints comment from Task 2 Step 3 says "the second and third gaps", which is now true. The file-top note's "The gap widths reused here (200, 220, 240, 260)" is still true: the new gap is 200. Fix anything else you find stale and report it.

- [ ] **Step 5: Run the authoring-safety suite**

From `games/pushkar-ball/tests/offline/`: `node levels.mjs`
Expected: `ALL LEVEL CHECKS PASSED`.

- [ ] **Step 6: Run the completability proof**

From `games/pushkar-ball/tests/offline/`: `node finish.mjs`

Expected: `level 1: finished every time without failing, slowest in 48.0s`, `level 1: finished from each of its 2 checkpoints`, levels two to four unchanged (32.6s, 39.9s, 36.2s), and `EVERY LEVEL CAN BE FINISHED`.

- [ ] **Step 7: Run the hearts check**

Run the same command as Task 2 Step 9. Expected: identical output, every count 0 and fewest hearts 3. The middle third's pieces now sit on the checkpoint runs in section 1, and none of them may cost a heart either. Paste the output into your report.

- [ ] **Step 8: Run the full offline suite**

From the repo root: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all 14 suites pass.

- [ ] **Step 9: Commit**

```bash
git add games/pushkar-ball/js/levels.js
git commit -m "$(cat <<'EOF'
Fill level one's middle third: a gap, a crate and a stone staircase

After checkpoint one: a third gap (200px, a proven width) at 10150-10350,
so missing it costs a short trip back to that flag; a third crate at
11800; and a two-step stone staircase at 12500-12900, each step 60 above
the one before. All existing geometry, both checkpoints and the 16200
edge finish.mjs hardcodes are unchanged.

Level one's slowest finish.mjs run is 48.0s (46.5s before this plan),
and no run loses a heart. Also corrects the lift's comment, which put it
between the wrong bowl and hill.

Part of docs/superpowers/plans/2026-09-12-livelier-level-one.md, Task 3.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The named exception, the curriculum note, and the follow-ups doc

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-pushkar-ball-design.md` (one paragraph under the "at most one new idea" bullet)
- Modify: `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md` (one note under the curriculum table)
- Modify: `docs/superpowers/specs/2026-09-11-followup-ideas.md` (item 2's status, and "Where this fits")

- [ ] **Step 1: Record the exception in the original design spec**

In `docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`, under "Difficulty: rising, and never harsh", find the end of the "at most one new idea" bullet:

```markdown
  level that later reuses it. *(Clarified Sep 2026 — see
  `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md`.)*
- **No level requires precise timing on more than one thing at once.** A moving
```

Insert one paragraph, indented to stay inside the bullet, so it becomes:

```markdown
  level that later reuses it. *(Clarified Sep 2026 — see
  `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md`.)*

  One named exception, and only one: level one also shows a single narrow
  spike patch on open ground, a first look at what level four teaches. It is
  level one's alone and not a precedent — a future level that wants to
  preview a later idea needs its own named decision. *(Added Sep 2026 — see
  `docs/superpowers/specs/2026-09-12-livelier-level-one-design.md`.)*
- **No level requires precise timing on more than one thing at once.** A moving
```

- [ ] **Step 2: Add the note under the curriculum table**

In `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md`, find:

```markdown
| 5 | *(unbuilt, "combine everything")* | unchanged in role; toy-factory-specific content (saws, conveyors) deferred to Phase B |

Levels 2 and 3's existing geometry (ground, boxes, platforms) carries over
```

Insert a note between the table and that paragraph:

```markdown
| 5 | *(unbuilt, "combine everything")* | unchanged in role; toy-factory-specific content (saws, conveyors) deferred to Phase B |

*(Sep 2026: level 1 also shows one narrow spike patch on open ground, a named
exception to the one-new-idea rule — see
`docs/superpowers/specs/2026-09-12-livelier-level-one-design.md`. Level 4 is
still where spikes are taught.)*

Levels 2 and 3's existing geometry (ground, boxes, platforms) carries over
```

- [ ] **Step 3: Mark follow-up item 2 done**

In `docs/superpowers/specs/2026-09-11-followup-ideas.md`, find:

```markdown
## 2. Level 1 needs more obstacles

Read as sparse right now — two proven gaps and two crates that nothing in
```

Replace it with:

```markdown
## 2. Level 1 needs more obstacles — DONE

See `docs/superpowers/specs/2026-09-12-livelier-level-one-design.md`. Every
existing piece of level 1 stays put; a stone block and one small spike patch
(a named preview of level 4's idea) go in the unguarded first third, and a
third gap, a third crate and a two-step stone staircase in the middle third.
Implemented by `docs/superpowers/plans/2026-09-12-livelier-level-one.md`.

As it stood before that design, it read as sparse — two proven gaps and two crates that nothing in
```

Then re-wrap that last paragraph (the one beginning "As it stood before that design") to the file's usual width of about 76 characters. Do not change its words beyond the new opening.

- [ ] **Step 4: Bring "Where this fits" up to date**

Still in that file, find:

```markdown
None of the five above conflicts with anything already shipped in Phase A.
Item 1 has the widest blast radius — it touches the curriculum table and
possibly level 5's role — so it's worth resolving first if these are
tackled in order, since it may change what "more obstacles in level 1" or
"enemies recurring" concretely means for the levels that follow. Phase B
```

Replace it with:

```markdown
None of the five above conflicts with anything already shipped in Phase A.
Items 1 and 2 are done; items 3–5 are each still their own design pass.
Item 1 settled the one question that could have reshaped the others — an
idea already taught may recur in any later level — and item 2 added one
named exception to the one-new-idea rule, level 1's spike patch, which is
level 1's alone. Phase B
```

The rest of the paragraph (`(saws, conveyors, crushers, …) … is still separately queued and unrelated to this list.`) is unchanged.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-08-pushkar-ball-design.md docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md docs/superpowers/specs/2026-09-11-followup-ideas.md
git commit -m "$(cat <<'EOF'
Record level one's spike patch as a named exception

The original design spec's one-new-idea rule and the curriculum table
now both say level one shows one narrow spike patch, that it is level
one's alone, and that level four is still where spikes are taught.
Follow-up item 2 is marked done, and "Where this fits" no longer treats
item 1 as open.

Part of docs/superpowers/plans/2026-09-12-livelier-level-one.md, Task 4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Verify everything and look at it

**Files:** none expected. This task runs commands and looks at the result. If it finds something, report exactly what and how you fixed it. Do not silently patch it and move on.

- [ ] **Step 1: Run the full local suite, including the browser**

From the repo root: `node games/pushkar-ball/tests/run.mjs`

Expected: all 18 suites pass, including the browser suites (`roll`, `jump`, `deflate`, `small`). All four drive level one, and **this plan does touch level one**, so this is a real check. They only use its first flat and first gap, which did not move, so they should pass unchanged. If one fails, investigate the actual cause before changing anything, per `CLAUDE.md`'s "Tests are usually the thing that is wrong" and "suspect the test first is a starting point, not a verdict". Never loosen an allowance to make one pass. Nothing in this plan touches `sw.js` or the hub's `index.html`, so Taras Town's suites are not required.

- [ ] **Step 2: Look at the new pieces**

Use the throwaway `_look` recipe. It was used successfully on 2026-09-12 and makes two files that **must be deleted before this task ends**. From `games/pushkar-ball/`:

```bash
sed -e 's#src="js/main.js"#src="js/_look_main.js"#' \
    -e 's#<div id="start-screen">#<div id="start-screen" style="display:none">#' \
    index.html > _look.html
sed -e 's#^flow.start(0);#const q = new URLSearchParams(location.search);\nflow.start(Math.max(0, LEVELS.findIndex((l) => l.id === Number(q.get("level")))));\nif (q.has("x")) { flow.ball.x = Number(q.get("x")); flow.ball.y = Number(q.get("y") || 600); camera.snap(flow.ball); }#' \
    -e 's#^let playing = false;#let playing = true;#' \
    js/main.js > js/_look_main.js
grep -n 'const q\|let playing = true' js/_look_main.js   # both must print; if not, main.js changed and the sed needs updating
```

Serve the repo root in the background, from the repo root: `python -m http.server 8779`

Then, with `S` set to **your own session's scratchpad directory**:

```bash
S="<your scratchpad directory>"
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
shot() {  # shot <name> <width> <height> <x>
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=$2,$3 \
    --virtual-time-budget=6000 --user-data-dir="$S/chrome-look" \
    --screenshot="$S/look-$1.png" \
    "http://127.0.0.1:8779/games/pushkar-ball/_look.html?level=1&x=$4&y=730"
}
shot l1-block        1280 720 4050    # the stone block just ahead
shot l1-spike        1280 720 5150    # the spike patch just ahead
shot l1-spike-small   568 320 5250
shot l1-gap          1280 720 9950    # the third gap just ahead
shot l1-stairs       1280 720 12250   # the crate behind, the staircase ahead
shot l1-stairs-small  568 320 12400
```

Open every `look-*.png` with the Read tool and **confirm by eye**, describing what you see in your report:

- The block and both staircase steps are drawn as stone (the boundary walls' colour), not wood, and sit on the ground: not floating, not sunk in, and with no gap or crevice under them.
- The staircase reads as two steps: the upper one standing on the middle of the lower one.
- The spike patch is the steel patch level four uses, sits on the ground, and reads as distinct from the stone.
- The third gap is visible as a gap, with the lift above the flat before it.
- On the 568×320 shots, nothing new is hidden under a thumb button.

The ball is placed with no input and sits still, so every shot shows the scene at rest. If something expected is out of frame, take another shot with a different `x` rather than concluding anything. Headless Chrome occasionally renders a 568×320 shot shifted up by about 17px with a green band along the bottom. It was seen once in four identical runs on 2026-09-12. If you see it, retake the shot before treating it as a finding.

Then clean up. All three commands matter:

```bash
rm -f _look.html js/_look_main.js          # from games/pushkar-ball/
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8779 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"
git status --short                          # must print nothing at all
```

If `git status --short` prints anything, stop and resolve it.

- [ ] **Step 3: Stop and report. Do not push.**

Pushing deploys to the live site, and that is the user's call. Report:

- what was added, where, and the verification numbers (finish.mjs times, and the hearts check output from Tasks 2 and 3);
- what the screenshots show;
- anything found and fixed on the way;
- that nothing is pushed.

If the user then says to push, it is `git push origin main`. Then repeat this until it prints `1`, every ~15–20s (usually about a minute):

```bash
curl -s "https://tauruskin.github.io/taras-town/games/pushkar-ball/js/levels.js?cb=$RANDOM" | grep -c "The game's first spike patch"
```

Then run `node games/pushkar-ball/tests/run.mjs browser --live`. Every browser suite must pass against the deployed site.

---

## Appendix: `level1-hearts.mjs` (scratch tool, never committed)

A copy lives at `C:\Users\OLEKSA~1\AppData\Local\Temp\claude\d--VIBE-CODING-Taras-Town\219f7342-f4a9-4b85-bbad-8819ef5fd6a3\scratchpad\level1-hearts.mjs`. It is reproduced here so the plan stands alone if that copy is gone. Run it from the repo root with no arguments. Unlike the previous plan's hearts check, it does not paste a copy of finish.mjs's runner. It lifts `runner` and `ROUTES` out of finish.mjs's own source text each time, so it cannot go stale when the runner changes, which matters here because Task 1 changes it. It needs `level.spikes[0]`, so it only runs from Task 2 onwards.

```js
// level1-hearts.mjs — NOT part of the repo. Run from the repo root:
//
//   node <this file>
//
// finish.mjs proves level one is finished without a death, but it counts
// deaths, not hearts. This answers the question the livelier-level-one spec
// asks of it: does anything added to level one ever cost a heart?
//
//   1. finish.mjs's own matrix (3 leads x 10 delays from the spawn, 3 leads
//      from each checkpoint), reporting the FEWEST hearts the ball ever had.
//   2. A finer sweep: 5 leads x 47 start delays (0-4.6s every 0.1s), from the
//      spawn to checkpoint one — the unguarded third, where the spike patch is.
//   3. The spike patch nudged 100 units either side and widened to 90, with
//      the same finer sweep, so the value shipped is shown not to sit on the
//      edge of a passing region.
//
// The runner and routes are lifted out of finish.mjs's own source text each
// time this runs, so they cannot drift from the suite the way a pasted copy
// would.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const imp = (f) => import(pathToFileURL(resolve('games/pushkar-ball/js', f)).href);
const { CONFIG } = await imp('config.js');
const { Ball } = await imp('player.js');
const { LEVELS, loadLevel } = await imp('levels.js');

const src = readFileSync('games/pushkar-ball/tests/offline/finish.mjs', 'utf8');
const from = src.indexOf('function runner(');
const to = src.indexOf('// A spread wide enough');
if (from < 0 || to < 0) { console.log('finish.mjs has changed shape; update the two markers above'); process.exit(2); }
const { runner, ROUTES } = new Function('CONFIG', src.slice(from, to) + '\nreturn { runner, ROUTES };')(CONFIG);

function play(data, drive, { delay = 0, start = null, seconds = 60, stop = () => false } = {}) {
  const level = loadLevel(data);
  const at = start || level.spawn;
  const ball = new Ball(at.x, at.y);
  let press = false;
  const input = { left: false, right: false, takeJump() { const j = press; press = false; return j; } };
  const go = drive(level);
  let minHearts = ball.hearts;
  for (let i = 0; i < seconds / CONFIG.STEP && !ball.won && !stop(level, ball); i++) {
    const t = i * CONFIG.STEP;
    const want = t < delay ? {} : go(ball, t);
    input.left = !!want.left; input.right = !!want.right;
    if (want.jump) press = true;
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    minHearts = Math.min(minHearts, ball.hearts);
  }
  return { ball, level, minHearts };
}

const data = LEVELS.find((l) => l.id === 1);

// 1. finish.mjs's matrix
{
  let bad = 0, minH = CONFIG.HEALTH.HEARTS;
  for (const lead of [0.7, 1, 1.3]) for (const delay of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]) {
    const r = play(data, (lv) => ROUTES[1](lv, lead), { delay });
    if (!r.ball.won || r.ball.deaths > 0) bad++;
    minH = Math.min(minH, r.minHearts);
  }
  for (const c of data.checkpoints) {
    const start = { x: c.x, y: c.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE };
    for (const lead of [0.7, 1, 1.3]) {
      const r = play(data, (lv) => ROUTES[1](lv, lead), { start });
      if (!r.ball.won || r.ball.deaths > 0) bad++;
      minH = Math.min(minH, r.minHearts);
    }
  }
  console.log(`1. finish.mjs's matrix: ${bad} run(s) not finished cleanly; fewest hearts ever held: ${minH} of ${CONFIG.HEALTH.HEARTS}   (want: 0 and 3)`);
}

// 2 and 3. the finer sweep to checkpoint one
function fine(d) {
  let lost = 0, runs = 0;
  for (const lead of [0.7, 0.85, 1, 1.15, 1.3]) for (let k = 0; k <= 46; k++) {
    const r = play(d, (lv) => runner(lv, lead), { delay: k / 10, stop: (lv) => lv.checkpoints[0].taken });
    runs++;
    if (r.ball.deaths > 0 || r.minHearts < CONFIG.HEALTH.HEARTS || !r.level.checkpoints[0].taken) lost++;
  }
  return `${lost} of ${runs}`;
}
const s = data.spikes[0];
console.log(`2. spawn to checkpoint one, 5 leads x 47 delays: ${fine(data)} runs lost a heart   (want: 0 of 235)`);
console.log('3. the spike patch nudged (runs that lost a heart, of 235):');
for (const dx of [-100, 0, 100]) for (const w of [s.w, 90]) {
  const d = { ...data, spikes: [{ ...s, x: s.x + dx, w }] };
  console.log(`   x=${s.x + dx} w=${w}: ${fine(d)}`);
}
```

---

## Plan self-review notes

*(For whoever executes this plan: these are the author's own checks, already done. They are recorded here so a re-review is not needed unless something changes.)*

**Spec coverage:**

| Spec element | Where it is covered |
|---|---|
| Stone block at 4250–4450, 60 tall | Task 1 Step 1 |
| Spike patch, 70 wide, at 5400 | Task 2 Step 1 |
| Third gap at 10150–10350 after checkpoint one | Task 3 Step 1 |
| Crate at 11800; staircase at 12500–12900, steps of 60 | Task 3 Step 2 |
| First flat, first gap, 16200 edge, checkpoints, platforms, bounds, spawn and goal unmoved | No step touches them; Task 3 Step 1 keeps 16200 as the polyline's end |
| Runner learns stone steps; levels two to four unchanged | Task 1 Steps 3 and 6 |
| Named exception in the 09-08 spec, note under the curriculum table | Task 4 Steps 1–2 |
| Level four's comments; level one's comments, lift comment corrected | Task 2 Steps 2–5; Task 3 Steps 1–4 |
| finish.mjs's comments and tests README row | Task 1 Steps 4–5; Task 2 Step 6 |
| Follow-ups doc: item 2 and "Where this fits" | Task 4 Steps 3–4 |
| Hearts check, including ±100 and width 90 | Task 2 Step 9, Task 3 Step 7, Appendix |
| Browser suites pass unchanged; screenshots at both sizes | Task 5 Steps 1–2 |

**Placeholder scan:** no TBD or TODO, and every code step shows the full code. `S` in Task 5 is deliberately the executor's own scratchpad, since screenshots belong to whoever takes them.

**Consistency, checked against the shipped code:**

- Boxes are `{x, y, w, h, movable?}`, and non-movable ones load into `level.walls` and draw as stone (`levels.js` loader, `this.walls`).
- Spikes are `{x, y, w}`, matching level four's.
- A box at `y: 700, h: 60` sits on ground at 760, and `y: 640, h: 60` sits on it. A crate at `y: 660, h: 100` sits on 760, the same as the existing two.
- `levels.mjs` check 10 (a crate never shares ground with spikes) compares x-ranges only; the nearest crate to the patch is at 8300.
- The poll string "The game's first spike patch" appears only in Task 2's comment.

**Noticed and left alone:** `finish.mjs` section 2 prints `level N: finished from each of its K checkpoints` even when it has just printed a FAIL for one of them. Its success line is unconditional. That is misleading, but it predates this plan and is out of scope.
