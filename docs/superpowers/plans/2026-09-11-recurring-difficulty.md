# Recurring Difficulty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the curriculum retiring each idea the moment the next level starts. Level 3 (crates) gets one recurring walker and level 4 (spikes) gets one recurring roller, both met on flat, already-easy ground. The original design spec's "at most one new idea" rule gains the clarifying sentence that says this was always allowed.

**Architecture:** A level-data change only. Each of `LEVELS[2]` (id 3) and `LEVELS[3]` (id 4) in `games/pushkar-ball/js/levels.js` gains an `enemies` array with one entry, and its header comment is updated so it stops claiming the level is unchanged. No engine, runner, route or test-mechanism change. `tests/offline/levels.mjs` checks 11–12 and `tests/offline/finish.mjs` already run against any level that has an `enemies` array. Docs follow: the design-spec sentence, plus three stale "level two's crate" references left behind by the last reshuffle.

**Tech Stack:** Vanilla ES modules, no dependencies. The existing dependency-free test harness in `games/pushkar-ball/tests/`.

**Spec:** `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md`.

**A note on the numbers, before you start.** Unlike the last two level plans, the enemy positions below were **already tuned and verified while this plan was written**, not left as a first draft:

- The real `levels.mjs` and `finish.mjs` were run with exactly these enemies injected. Output: `ALL LEVEL CHECKS PASSED` and `EVERY LEVEL CAN BE FINISHED`.
- A hearts check (see the Appendix) found that neither level ever drops below 2 of 3 hearts across finish.mjs's matrix.
- The same result holds for every neighbouring value in a 3×3 grid around each one, so the shipped values sit in the middle of a passing region and not on its edge. That is the standard a review had to impose by hand on level 2's walker two (commits `1521e24`, `8dbf855`).

So if a suite fails after you apply a step, **first diff your edit against the plan's code block**: a typo in a number is far more likely than a wrong number. Only if the edit matches exactly should you treat it as a real finding. In that case, investigate it the way this codebase always has (read the failure, instrument, then adjust) and report it. Do not quietly patch it.

**Why these particular values**, which the review may ask about (this is the history the level comments below summarise):

- **The walker is the fussy one to place**, as level 2 already found. On level 3's first long flat, most positions tried cost some lead-0.7 runs all three hearts. x=2675 with amplitude 280 is the centre of the one region where every neighbour ±25 in x and ±20 in amplitude also passes with a minimum of 2 hearts. A slower walker (the optional `speed` field) was tried at 0.8, 1.0 and 1.2 rad/s and was worse at every speed, just as walker two found.
- **The roller's direction matters more than its position.** Heading left (toward the arriving ball), it passes for any start from 8400 to 8800 and any patrol from 7700–9500 to 7900–9300. Heading right from the same spots cost whole runs.
- **The roller, over a whole patrol.** *(Added after Task 2's review.)* finish.mjs's start delays only span 4.5s, about a fifth of the roller's ~23s patrol, so they only see what a quick arrival meets. Swept over the whole patrol, lead 0.7 loses 72 of 229 runs when it catches the roller from behind or at its turn, while leads of 0.85 and up never lose one. The rate is the same before checkpoint one (72–73 of 229), so it is a property of the roller and not of this spot. Level 2's shipped roller does no better. The roller's comment says all this.
- **Finer sampling.** With the start delay sampled every 0.1s instead of finish.mjs's 0.5s, and five leads instead of three:
  - the roller passes 230 of 230, within finish.mjs's own 4.5s window;
  - the walker passes 227 of 230, and the 3 failures are all at lead 0.7;
  - level 2 as shipped passes only 222 of 230 on that same finer sampling.

  So the walker is no weaker than what already ships.

---

## Before you start

Read these first. Every task below assumes you know them:

- `CLAUDE.md` at the repo root, especially the "Rules for the whole hub" and "The shape of the thing — Pushkar Ball" sections.
- `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md`, the approved design this plan implements.
- `games/pushkar-ball/js/levels.js`: the `LEVELS` array, especially level 2's `enemies` array (the data shape and comment style to match) and the current level 3 and level 4 objects.
- `games/pushkar-ball/js/enemies.js`: the `makeWalker` (`{kind, x, y, amplitude, speed?}`) and `makeRoller` (`{kind, x, y, from, to, dir?}`) data shapes.
- `games/pushkar-ball/tests/offline/finish.mjs` and `games/pushkar-ball/tests/offline/levels.mjs`. You will run them, not change them, apart from two stale strings in Task 3.

Run `node games/pushkar-ball/tests/run.mjs offline` once from the repo root before starting, to confirm the baseline is green (14 suites).

---

### Task 1: Level 3 gets a recurring walker

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (level 3's header comment; a new `enemies` array in level 3)

- [ ] **Step 1: Update level 3's header comment**

In `games/pushkar-ball/js/levels.js`, find level 3's header comment. It is the object with `id: 3`:

```js
  {
    // Level three teaches the crate — reshuffled here Sep 2026 from its
    // original home at level two, so enemies could move up to level two
    // instead. Level one has crates and never needs one; here the only way
    // onto the high ledge is to shove a crate under it and jump off the top,
    // so the idea is learned somewhere it can be practised without a hazard
    // anywhere in sight. Geometry below is unchanged from the original level
    // two — only the id and this comment moved.
    id: 3,
```

Replace it with the following. The last sentence stopped being true the moment this level gained an enemy, and "without a hazard anywhere in sight" becomes "anywhere near it", because a walker is now in the level, just far from the crate:

```js
  {
    // Level three teaches the crate — reshuffled here Sep 2026 from its
    // original home at level two, so enemies could move up to level two
    // instead. Level one has crates and never needs one; here the only way
    // onto the high ledge is to shove a crate under it and jump off the top,
    // so the idea is learned somewhere it can be practised with no hazard
    // anywhere near it. Its ground, boxes and checkpoints are unchanged from
    // the original level two.
    //
    // It also brings back one thing already taught: a walker, from level
    // two, on the long flat between the first two gaps — see `enemies`
    // below. Not a new idea, so it gets no checkpoint and no rehearsal of its
    // own; it is here so that what level two taught does not simply stop
    // the moment level two ends.
    id: 3,
```

- [ ] **Step 2: Add level 3's `enemies` array**

Still in level 3, find:

```js
      { x: 9700, y: 700, w: 100, h: 100, movable: true },
    ],

    platforms: [],

    // Two, not one per gap. The first sits right before the level's tightest
```

Insert an `enemies` array between `platforms: [],` and the checkpoints comment, so the block becomes:

```js
      { x: 9700, y: 700, w: 100, h: 100, movable: true },
    ],

    platforms: [],

    enemies: [
      // A recurring walker, from level two — the calmest of the three
      // enemies, because this level's own job, the crate, is already a
      // puzzle, and the enemy that comes back here should add company, not
      // thinking. It paces 2395..2955 on the flat between the 200px and
      // 220px gaps, 895 and 845 units clear of them and nowhere near the
      // crate flat, so it is never asked for at the same moment as anything
      // else.
      //
      // Before the first checkpoint on purpose. Whatever it costs is given
      // back at checkpoint one, which refills hearts before the level's
      // tightest gap; and the rare sloppy run that loses all three hearts to
      // it goes back only ~2700 units, over one easy gap, to the spawn.
      //
      // x=2675 and amplitude 280 were found by sweeping, not guessed — as
      // level two's walker two also found, a walker's margin is fussy.
      // Against finish.mjs's 3-lead-by-10-delay matrix, most positions tried
      // on this flat cost some run at lead 0.7 all three hearts; this one
      // never drops below 2 of 3, and neither does any neighbour 25 units
      // either side or 20 of amplitude either side, so it is the middle of a
      // passing region rather than its edge. The region is narrow, though:
      // 50 units either side, at 2625 or 2725, some lead-0.7 runs lose all
      // three hearts again, so do not nudge this without re-checking. A
      // slower walker (the optional `speed`) was tried and was worse at
      // every speed, as it was for walker two. Sampling the start delay every
      // 0.1s and five leads rather than three (230 runs in all) still finds 3
      // that lose all three hearts here, every one at lead 0.7 — fewer than
      // level two as shipped on the same sampling (8 in 230, likewise all at
      // lead 0.7, six of them to its walker one alone).
      { kind: 'walker', x: 2675, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    // Two, not one per gap. The first sits right before the level's tightest
```

Do not change anything else in level 3: not its ground, boxes, crate, checkpoints or goal.

- [ ] **Step 3: Run the authoring-safety suite**

Run from the repo root: `node games/pushkar-ball/tests/run.mjs offline/levels`

Expected: passes. Level 3's block now includes the line `1 enemy/enemies; none patrol outside the level, none overlap the spawn or a checkpoint`, and the suite ends `ALL LEVEL CHECKS PASSED`.

- [ ] **Step 4: Run the completability proof**

Run: `node games/pushkar-ball/tests/run.mjs offline/finish`

Expected: `level 3: finished every time without failing` in section 1, `level 3: finished from each of its 2 checkpoints` in section 2, check 3 ("level three without its crate") unchanged at about 52px short, and the suite ends `EVERY LEVEL CAN BE FINISHED`.

- [ ] **Step 5: Check hearts and the neighbourhood**

finish.mjs counts deaths, not hearts. That gap is exactly how walker two's thin margin shipped past it (commit `1521e24`). Run the hearts check from the Appendix. A copy already exists at `C:\Users\OLEKSA~1\AppData\Local\Temp\claude\d--VIBE-CODING-Taras-Town\b29b2184-b8e5-415f-80ce-97b1852f8007\scratchpad\hearts-check.mjs`. If it is missing, write the Appendix's code there first. It is a scratch tool and **must not be committed or copied into the repo**.

Run from the repo root:

```bash
node "C:/Users/OLEKSA~1/AppData/Local/Temp/claude/d--VIBE-CODING-Taras-Town/b29b2184-b8e5-415f-80ce-97b1852f8007/scratchpad/hearts-check.mjs" 3
```

Expected output, exactly as measured while this plan was written:

```
level 3, walker as authored: 2   (want: 2 — no failures, never below 2 of 3 hearts)

neighbourhood (rows x, columns amplitude):
         260   280   300
2650     2     2     2
2675     2     2     2
2700     2     2     2
```

Every cell must be `2`. A cell reading `1` or `X<n>` means the level no longer matches what was verified, so go back to the note at the top of this plan. Paste the actual output into your report.

- [ ] **Step 6: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all 14 suites pass.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/levels.js
git commit -m "$(cat <<'EOF'
Bring a walker back in level 3

Level 3 (crates) now meets one enemy already taught in level 2: a walker
pacing 2395..2955 on the long flat between the first two gaps, well clear
of both and of the crate puzzle, before the first checkpoint so whatever
it costs is refilled there. Not a new idea, so no checkpoint or rehearsal
of its own.

x=2675 / amplitude 280 is the middle of a region where finish.mjs's
3-lead-by-10-delay matrix never drops below 2 of 3 hearts, for every
neighbour +-25 in x and +-20 in amplitude as well. Level geometry is
unchanged; only the enemies array and the header comment were added.

Part of docs/superpowers/plans/2026-09-11-recurring-difficulty.md, Task 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Level 4 gets a recurring roller

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (level 4's header comment; a new `enemies` array in level 4)

- [ ] **Step 1: Update level 4's header comment**

In `games/pushkar-ball/js/levels.js`, find level 4's header comment. It is the object with `id: 4`:

```js
  {
    // Level four teaches the spike — reshuffled here Sep 2026 from its
    // original home at level three, so crates could move down to level three
    // and enemies could move up to level two. Everything under it — rolling,
    // gaps, crates, a moving platform, enemies — has already been met.
    // Geometry below is unchanged from the original level three — only the
    // id and this comment moved.
    id: 4,
```

Replace it with:

```js
  {
    // Level four teaches the spike — reshuffled here Sep 2026 from its
    // original home at level three, so crates could move down to level three
    // and enemies could move up to level two. Everything under it — rolling,
    // gaps, crates, a moving platform, enemies — has already been met. Its
    // ground, platform, spikes and checkpoints are unchanged from the
    // original level three.
    //
    // It also brings back one thing already taught: a roller, from level
    // two, on the flat between checkpoint one's spike patch and the ramp —
    // see `enemies` below. Not a new idea, so it gets no checkpoint of its
    // own, for the same reason the gap below gets none.
    id: 4,
```

- [ ] **Step 2: Add level 4's `enemies` array**

Still in level 4, find the end of its `spikes` array and the checkpoints comment that follows it:

```js
      // On the high ground, in plain view from the top of the ramp before it
      // has to be jumped.
      { x: 11100, y: 620, w: 90 },
    ],

    // Two, not one per patch. The first two patches sit close to spawn and
```

Insert an `enemies` array between them, so the block becomes:

```js
      // On the high ground, in plain view from the top of the ramp before it
      // has to be jumped.
      { x: 11100, y: 620, w: 90 },
    ],

    enemies: [
      // A recurring roller, from level two, where it was that level's real
      // test. It is the most active of the three enemies — the one that has
      // to be tracked and timed — and this is the later level, so it can
      // afford it. It patrols 7800..9400: 500 units past the end of the
      // spike patch at 7200, which checkpoint one guards, and 400 short of
      // the ramp, so a ball never has spike-timing and roller-timing in the
      // same moment. Checkpoint one refills hearts just before that patch,
      // so the patch and the roller share one fresh budget of three, and
      // checkpoint two refills them again on the high ground before anything
      // else is asked. Running out between the two sends the ball back to the
      // spawn, roughly 8,000 units behind, not to checkpoint one.
      //
      // Starting in the middle and heading left, as level two's roller does.
      // What matters is which way it is heading when the ball reaches it:
      // met head-on, a late jump costs one heart; caught from behind or at
      // its turn, a late jump can cost all three. finish.mjs's start delays
      // span 4.5s, about a fifth of this roller's ~23s patrol, so they only
      // see what a quick arrival meets — heading left from here, that is
      // head-on: every lead-0.7 run takes exactly one heart and every run at
      // lead 1 or 1.3 takes none (heading right, the same matrix lost all ten
      // of its lead-0.7 runs from the spawn). That holds for starts 200 units
      // either side of 8600 and for patrols 100 units wider or narrower at
      // each end; narrower still, at 7950..9250, a lead-0.7 run is lost
      // again. Swept over a whole patrol instead (start delays 0-23s every
      // 0.1s, five leads), leads of 0.85 and up still never lose a run or a
      // second heart, but lead 0.7 loses 72 of 229 — a slow arrival that
      // also jumps late can lose the run here. That is the roller, not this
      // spot: the same sweep on the flat before checkpoint one lost 72-73 of
      // 229 as well, and that flat is kept for the first two spikes a child
      // ever meets. Level two's roller does no better on the same sweep.
      { kind: 'roller', x: 8600, y: 760 - CONFIG.ENEMY.ROLLER.R, from: 7800, to: 9400, dir: -1 },
    ],

    // Two, not one per patch. The first two patches sit close to spawn and
```

Do not change anything else in level 4: not its ground, platform, spikes, checkpoints or goal.

- [ ] **Step 3: Run the authoring-safety suite**

Run: `node games/pushkar-ball/tests/run.mjs offline/levels`

Expected: level 4's block now ends with `1 enemy/enemies; none patrol outside the level, none overlap the spawn or a checkpoint`, and the suite ends `ALL LEVEL CHECKS PASSED`.

- [ ] **Step 4: Run the completability proof**

Run: `node games/pushkar-ball/tests/run.mjs offline/finish`

Expected: `level 4: finished every time without failing` in section 1, `level 4: finished from each of its 2 checkpoints` in section 2, and the suite ends `EVERY LEVEL CAN BE FINISHED`. Level 3's results from Task 1 must be unchanged.

- [ ] **Step 5: Check hearts and the neighbourhood**

Run from the repo root:

```bash
node "C:/Users/OLEKSA~1/AppData/Local/Temp/claude/d--VIBE-CODING-Taras-Town/b29b2184-b8e5-415f-80ce-97b1852f8007/scratchpad/hearts-check.mjs" 4
```

Expected output, as measured while this plan was written:

```
level 4, roller as authored: 2   (want: 2 — no failures, never below 2 of 3 hearts)

neighbourhood (rows: patrol range widened/narrowed; columns: start x):
                 8400  8600  8800
7900..9300       2     2     2
7800..9400       2     2     2
7700..9500       2     2     2
```

Every cell must be `2`. Paste the actual output into your report. The same "not committed" rule applies to the script.

- [ ] **Step 6: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all 14 suites pass.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/levels.js
git commit -m "$(cat <<'EOF'
Bring a roller back in level 4

Level 4 (spikes) now meets one enemy already taught in level 2: a roller
patrolling 7800..9400, between checkpoint one's spike patch and the ramp,
500 units clear of the patch and 400 of the ramp, so spike-timing and
roller-timing never land in the same moment. Checkpoints refill hearts on
either side of it.

Heading left from x=8600 it takes exactly one heart on each of
finish.mjs's lead-0.7 runs and none at lead 1 or 1.3, never leaving a run
below 2 of 3 - for starts 8400 and 8800 and patrols 100 units wider or
narrower too. Heading right from the same place cost whole runs. Level geometry is unchanged; only the enemies array and
the header comment were added.

Part of docs/superpowers/plans/2026-09-11-recurring-difficulty.md, Task 2.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The design-spec clarification, and stale references

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-pushkar-ball-design.md` (one clarifying paragraph under the "at most one new idea" bullet)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (two stale "level two" references, a header comment and a failure message; and three route comments)
- Modify: `games/pushkar-ball/js/levels.js` (one stale "level three's … spike patch" in level two's comments)
- Modify: `games/pushkar-ball/tests/README.md` (the `finish` row's stale "level two" references; the `levels` row's missing enemy checks)
- Modify: `docs/superpowers/specs/2026-09-11-followup-ideas.md` (item 1's status)

The finish.mjs and README fixes are **pre-existing staleness**. The Sep 2026 reshuffle moved the crate level from id 2 to id 3 and missed these strings. They belong here because this plan adds content to level 3 and relies on those suites to prove it, so leaving them saying "level two" would be misleading. Change only the strings shown. Do not change any logic.

- [ ] **Step 1: Add the clarification to the original design spec**

In `docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`, find, under "Difficulty: rising, and never harsh":

```markdown
- **Every level introduces at most one new idea**, and introduces it somewhere
  safe — where failing costs a few seconds, not a checkpoint's progress — before
  it is ever asked for somewhere that matters.
- **No level requires precise timing on more than one thing at once.** A moving
```

Change it to add an indented paragraph belonging to the first bullet:

```markdown
- **Every level introduces at most one new idea**, and introduces it somewhere
  safe — where failing costs a few seconds, not a checkpoint's progress — before
  it is ever asked for somewhere that matters.

  This restricts what's *new*, not what's *present* — a level may, and later
  ones generally should, also feature an idea already taught in an earlier
  level, so long as it doesn't ask for precise timing on it at the same moment
  as anything else (see the next rule). The "somewhere safe" clause above
  applies only to an idea's first appearance anywhere in the game, not to every
  level that later reuses it. *(Clarified Sep 2026 — see
  `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md`.)*
- **No level requires precise timing on more than one thing at once.** A moving
```

This is the recurring-difficulty spec's sentence word for word except for one word. The spec's text says "The 'somewhere safe' clause **below**", but the spec also places the sentence *after* the bullet, where that clause is *above* it. "above" is what makes it true in the position the spec chose. The trailing italic pointer is added so a reader of the original spec can find why the sentence exists.

- [ ] **Step 2: Fix finish.mjs's header comment**

In `games/pushkar-ball/tests/offline/finish.mjs`, find in the header comment:

```js
// Most of the driving is one generic runner that reads the level's own data:
// roll right, and jump a little before any gap edge, spike patch or crate
// ahead. Only the two things a runner cannot do by rolling right get a script
// of their own — riding level one's platform to its last ledge, and working
// level two's crate — and those scripts are the proof that those levels can be
// done. If you move the geometry they are written against, move them too; if
// a new level has no route, this suite says so rather than passing.
```

Replace with:

```js
// Most of the driving is one generic runner that reads the level's own data:
// roll right, and jump a little before any gap edge, spike patch, crate or
// enemy ahead. Only the two things a runner cannot do by rolling right get a
// script of their own — riding level one's platform to its last ledge, and
// working level three's crate — and those scripts are the proof that those
// levels can be done. If you move the geometry they are written against, move
// them too; if a new level has no route, this suite says so rather than
// passing.
```

- [ ] **Step 3: Fix finish.mjs check 3's failure message**

Still in `finish.mjs`, in check 3 ("level three without its crate"), find:

```js
    if (won) fail(`level 2 was finished without its crate ${won} time(s) of ${tries} — the ledge no longer needs it`);
```

Replace with:

```js
    if (won) fail(`level 3 was finished without its crate ${won} time(s) of ${tries} — the ledge no longer needs it`);
```

- [ ] **Step 3b: Fix the remaining stale route and level comments**

Found by Task 2's review, and the same kind of leftover. In `games/pushkar-ball/tests/offline/finish.mjs`, level two's route comment:

```js
  // Level two: nothing but running and jumping — over gaps and every enemy
  // it meets. There is no crate or platform puzzle here; the generic runner
  // is the whole route, the same shape level three (spikes) already used.
```

becomes:

```js
  // Level two: nothing but running and jumping — over gaps and every enemy
  // it meets. There is no crate or platform puzzle here; the generic runner
  // is the whole route, the same shape level four (spikes) uses.
```

Level three's route comment:

```js
  // Level three: run to the flat below the ledge, shove the crate against the
  // ledge's face, back off, hop onto the crate and jump from it to the ledge.
  // Moved here from level two in the Sep 2026 curriculum reshuffle — the
  // route body is unchanged, only its key moved with the level.
```

becomes:

```js
  // Level three: run to the flat below the ledge, jumping its walker on the
  // way, shove the crate against the ledge's face, back off, hop onto the
  // crate and jump from it to the ledge. Moved here from level two in the
  // Sep 2026 curriculum reshuffle — the route body is unchanged, only its key
  // moved with the level; the walker needs nothing of its own, since the
  // runner jumps any enemy ahead.
```

Level four's route comment:

```js
  // Level four: nothing but running and jumping. The platform across its gap
  // is the second way over, not the only one. Moved here from level three in
  // the Sep 2026 curriculum reshuffle — unchanged otherwise.
```

becomes:

```js
  // Level four: nothing but running and jumping — over its gap, its spikes
  // and its one roller. The platform across its gap is the second way over,
  // not the only one. Moved here from level three in the Sep 2026 curriculum
  // reshuffle — unchanged otherwise.
```

And in `games/pushkar-ball/js/levels.js`, level two's first ground comment ends:

```js
      // nothing — the enemy version of level three's first, easy spike patch.
```

which becomes:

```js
      // nothing — the enemy version of level four's first, easy spike patch.
```

- [ ] **Step 4: Fix the tests README rows**

In `games/pushkar-ball/tests/README.md`, find the `levels` row:

```markdown
| `levels` | For every level: ids unique, spawn in free space, all geometry inside `bounds`, and **every ground polyline's normals point up** — the one authoring mistake that is easy to make and invisible until you fall through the floor. Also: a ball dropped at, and respawned at, every checkpoint settles on that checkpoint's own floor; nothing kills you where you arrive; every spike patch is at least one tooth wide and no wider than half what a perfect jump clears; a level over 3000px has checkpoints and none has more than three; no crate shares ground with spikes. |
```

Replace with (one clause appended at the end):

```markdown
| `levels` | For every level: ids unique, spawn in free space, all geometry inside `bounds`, and **every ground polyline's normals point up** — the one authoring mistake that is easy to make and invisible until you fall through the floor. Also: a ball dropped at, and respawned at, every checkpoint settles on that checkpoint's own floor; nothing kills you where you arrive; every spike patch is at least one tooth wide and no wider than half what a perfect jump clears; a level over 3000px has checkpoints and none has more than three; no crate shares ground with spikes; no enemy patrols outside the level or sits on the spawn or a checkpoint. |
```

Then find the `finish` row:

```markdown
| `finish` | **Every level can be finished**, shown by finishing it: a small route per level (a generic runner plus scripts for level one's platform and level two's crate) drives the real ball from the spawn to the flag 30 ways — starting late and jumping early and late — and from every checkpoint, never failing once. Level two without its crate cannot reach its ledge, with the margin pinned. A level with no route fails. |
```

Replace with:

```markdown
| `finish` | **Every level can be finished**, shown by finishing it: a small route per level (a generic runner, which jumps gaps, spikes, crates and enemies, plus scripts for level one's platform and level three's crate) drives the real ball from the spawn to the flag 30 ways — starting late and jumping early and late — and from every checkpoint, never failing once. Level three without its crate cannot reach its ledge, with the margin pinned. A level with no route fails. It counts deaths, not hearts: a level whose enemies leave a clean run on its last heart still passes here, so check hearts separately when placing an enemy. |
```

The last sentence records the gap commit `1521e24` had to close by hand, so the next person placing an enemy knows to look.

- [ ] **Step 5: Mark follow-up item 1 as done**

In `docs/superpowers/specs/2026-09-11-followup-ideas.md`, find:

```markdown
## 1. Enemies (and difficulty generally) should recur across levels — SPEC'D

See `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md` —
scoped to levels 3 and 4 only (a walker recurs in level 3, a roller in level
4); level 5 and any further escalation stay a later design.
```

Replace with:

```markdown
## 1. Enemies (and difficulty generally) should recur across levels — DONE

See `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md` —
scoped to levels 3 and 4 only (a walker recurs in level 3, a roller in level
4); level 5 and any further escalation stay a later design. Implemented by
`docs/superpowers/plans/2026-09-11-recurring-difficulty.md`.
```

Leave items 2–5 exactly as they are. They are not brainstormed, and nothing in this plan touches them.

- [ ] **Step 6: Run the offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all 14 suites pass. Only comments and a failure string changed in test code, so any failure here means something other than a string was changed.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-08-pushkar-ball-design.md games/pushkar-ball/tests/offline/finish.mjs games/pushkar-ball/js/levels.js games/pushkar-ball/tests/README.md docs/superpowers/specs/2026-09-11-followup-ideas.md
git commit -m "$(cat <<'EOF'
Clarify the one-new-idea rule, and fix stale level-two references

The original design spec's "at most one new idea per level" rule gains
the sentence the recurring-difficulty spec asked for: it restricts what
is new, not what is present, and its "somewhere safe" clause applies to
an idea's first appearance only.

finish.mjs's header comment, its check-3 failure message and the tests
README still called the crate level "level two" after the Sep 2026
reshuffle moved it to level three, and two comments still called the
spike level "level three"; fixed. The level three and four route
comments now mention the enemy the runner jumps. The README's levels row now
mentions the enemy checks it already runs, and its finish row says that
suite counts deaths rather than hearts - the gap commit 1521e24 had to
close by hand. Follow-up item 1 is marked done.

Part of docs/superpowers/plans/2026-09-11-recurring-difficulty.md, Task 3.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verify everything, look at both levels, and deploy

**Files:** none expected. This task runs commands, looks at the result, and fixes anything it finds. If it does find something, report exactly what and how you fixed it. Do not silently patch and move on.

- [ ] **Step 1: Run the full local suite, including the browser**

Run from the repo root: `node games/pushkar-ball/tests/run.mjs`

Expected: every suite passes, including the browser suites (`roll`, `jump`, `deflate`, `small`). They all drive level one, which this plan does not touch, so none should be affected. It is still a real check and not a formality. If one fails, investigate the actual cause before changing anything, per `CLAUDE.md`'s "Tests are usually the thing that is wrong" and "suspect the test first is a starting point, not a verdict". Nothing in this plan touches `sw.js` or the hub's `index.html`, so Taras Town's suites are not required.

- [ ] **Step 2: Look at levels 3 and 4**

No browser suite reaches level 3 or 4 (the game always starts at level 1 and has no level select), so look at them directly. The recipe below was tried while this plan was written and produces a correct frame from the real renderer. It uses two **throwaway files that must be deleted before this task ends**. There must be no test-only code in the game (`CLAUDE.md`), so these live only on disk, briefly, and are never committed.

From `games/pushkar-ball/`:

```bash
sed -e 's#src="js/main.js"#src="js/_look_main.js"#' \
    -e 's#<div id="start-screen">#<div id="start-screen" style="display:none">#' \
    index.html > _look.html
sed -e 's#^flow.start(0);#const q = new URLSearchParams(location.search);\nflow.start(Math.max(0, LEVELS.findIndex((l) => l.id === Number(q.get("level")))));\nif (q.has("x")) { flow.ball.x = Number(q.get("x")); flow.ball.y = Number(q.get("y") || 600); camera.snap(flow.ball); }#' \
    -e 's#^let playing = false;#let playing = true;#' \
    js/main.js > js/_look_main.js
grep -n 'const q\|let playing = true' js/_look_main.js   # both must print; if not, main.js changed and the sed needs updating
```

Serve the repo root on a port the test harness does not use, then take screenshots with headless Chrome. Run the server in the background, from the repo root:

```bash
python -m http.server 8779
```

Then, with `S` set to the scratchpad directory:

```bash
S="C:/Users/OLEKSA~1/AppData/Local/Temp/claude/d--VIBE-CODING-Taras-Town/b29b2184-b8e5-415f-80ce-97b1852f8007/scratchpad"
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
shot() {  # shot <name> <width> <height> <level> <x>
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=$2,$3 \
    --virtual-time-budget=6000 --user-data-dir="$S/chrome-look" \
    --screenshot="$S/look-$1.png" \
    "http://127.0.0.1:8779/games/pushkar-ball/_look.html?level=$4&x=$5&y=730"
}
shot l3-walker       1280 720 3 2200   # ball just left of the walker's patrol
shot l3-walker-small  568 320 3 2200   # the same on an iPhone SE
shot l4-roller       1280 720 4 7400   # ball just past the spike patch, roller coming
shot l4-roller-ramp  1280 720 4 9500   # the roller's right end and the ramp beyond
shot l4-roller-small  568 320 4 7400
```

`y=730` puts the ball just above the ground (the ground is at 760 on both stretches), so the camera settles on the real horizon. The simulation runs with no input, so the ball sits still and the enemies move.

Open every `look-*.png` with the Read tool and **confirm by eye**, describing what you see in your report:

- The walker and the roller are each visible as the violet spiky shape with a face, standing on the ground: not floating above it, not sunk into it.
- They read as distinct from the steel spike patches.
- Nothing overlaps in a way that looks like an authoring mistake.
- On the 568×320 shots, the enemy is visible above the thumb buttons, not hidden under one.

If an enemy is not in frame in a shot (it moves, so this can happen), take another shot with a different `x` rather than concluding anything.

Then clean up. All three commands matter:

```bash
rm -f _look.html js/_look_main.js          # from games/pushkar-ball/
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8779 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"
git status --short                          # must print nothing at all
```

If `git status --short` prints anything, stop and resolve it before pushing.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Poll the deployed site until it has rebuilt**

Repeat every ~15–20s until it prints `1`. It prints `0` until the deploy rolls out, usually about a minute:

```bash
curl -s "https://tauruskin.github.io/taras-town/games/pushkar-ball/js/levels.js?cb=$RANDOM" | grep -c "A recurring roller"
```

- [ ] **Step 5: Run the live browser suites**

Run: `node games/pushkar-ball/tests/run.mjs browser --live`
Expected: every browser suite passes against the deployed site.

- [ ] **Step 6: Report**

Tell the user:

- Level 3 now brings back a walker on its first long flat, and level 4 brings back a roller between its checkpointed spike patch and the ramp.
- The original design spec now says in writing that recurrence was always allowed.
- Include the verification numbers: both levels finish 30 ways and from every checkpoint, and neither drops below 2 of 3 hearts anywhere in a neighbourhood around the chosen values.
- Mention the stale level-number references fixed on the way.
- Flag the roller finding from Task 2's review as a possible follow-up. It is not a regression, since level 2's shipped roller behaves the same. Swept over a roller's whole ~23s patrol, a late-jumping ball that catches it from behind or at its turn can lose all three hearts, and running out of hearts sends it back to the spawn. finish.mjs's 4.5s of start delays never sees that part of a roller's patrol. Two things are worth a design conversation: whether a roller should be that punishing, and whether finish.mjs should sweep a roller's full lap.
- Note what remains: follow-up items 2–5 are still unbrainstormed and were deliberately not started.
- Flag one thing noticed and left alone: `games/pushkar-ball/README.md`'s "What is here" section still describes phase 1 (it says hazards, enemies, checkpoints and lives are "deliberately absent"). It is long out of date, and the user may want it rewritten as its own small task.

---

## Appendix: `hearts-check.mjs` (scratch tool, never committed)

Lives at `C:\Users\OLEKSA~1\AppData\Local\Temp\claude\d--VIBE-CODING-Taras-Town\b29b2184-b8e5-415f-80ce-97b1852f8007\scratchpad\hearts-check.mjs`. It is reproduced here so the plan stands alone if that copy is gone. Run from the repo root with the level id as its argument. Its runner and level-3 route are copies of finish.mjs's, unchanged. If finish.mjs's runner ever changes, this copy is stale.

```js
// hearts-check.mjs — NOT part of the repo. Run from the repo root:
//
//   node <this file> 3        level 3's walker
//   node <this file> 4        level 4's roller
//
// finish.mjs proves a level is finished without a death, but it does not look
// at hearts, and it only samples ten starting delays. This does two things
// finish.mjs does not, the same two a code review had to do by hand for level
// 2's walker two (commit 1521e24):
//
//   1. Runs finish.mjs's exact matrix (3 leads x 10 delays from the spawn,
//      3 leads from every checkpoint) and reports the FEWEST HEARTS the ball
//      ever had, not just whether it died.
//   2. Re-runs that matrix with the level's one enemy nudged around its
//      authored values, so the value shipped is shown to sit inside a passing
//      region and not on the edge of one.
//
// A cell prints as the fewest hearts seen (e.g. "2"), or "X<n>" if n runs of
// the matrix failed finish.mjs's own standard.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const imp = (f) => import(pathToFileURL(resolve('games/pushkar-ball/js', f)).href);
const { CONFIG } = await imp('config.js');
const { Ball } = await imp('player.js');
const { LEVELS, loadLevel } = await imp('levels.js');

// --- a copy of finish.mjs's runner and its level-3 route, unchanged --------
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
    if (level.crates.some((c) => ahead(c.x, 40) && ball.y > c.y)) want.jump = true;
    return want;
  };
}
const ROUTES = {
  3: (level, lead) => {
    const run = runner(level, lead);
    const crate = level.crates[0];
    const face = level.walls.find((w) => w.h < level.bounds.h);
    let stage = 'run', stuck = 0, lastX = crate.x;
    return (ball) => {
      if (stage === 'run') {
        if (ball.grounded && ball.y > face.y + 100 && ball.x > crate.x - 200 && ball.x < crate.x) stage = 'push';
        else return run(ball);
      }
      if (stage === 'push') {
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
  4: (level, lead) => runner(level, lead),
};

function play(data, route, { delay = 0, from = null, seconds = 60 } = {}) {
  const level = loadLevel(data);
  const at = from || level.spawn;
  const ball = new Ball(at.x, at.y);
  let press = false;
  const input = { left: false, right: false, takeJump() { const j = press; press = false; return j; } };
  const drive = route(level);
  const n = Math.round(seconds / CONFIG.STEP);
  let minHearts = ball.hearts;
  for (let i = 0; i < n && !ball.won; i++) {
    const t = i * CONFIG.STEP;
    const want = t < delay ? {} : drive(ball, t);
    input.left = !!want.left; input.right = !!want.right;
    if (want.jump) press = true;
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    minHearts = Math.min(minHearts, ball.hearts);
  }
  return { ball, level, minHearts };
}

const LEADS = [0.7, 1, 1.3];
const DELAYS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
function matrix(data) {
  const route = ROUTES[data.id];
  let bad = 0, minH = CONFIG.HEALTH.HEARTS;
  for (const lead of LEADS) for (const delay of DELAYS) {
    const r = play(data, (lv) => route(lv, lead), { delay });
    const atFlag = Math.hypot(r.ball.x - r.level.goal.x, r.ball.y - r.level.goal.y) <= CONFIG.GOAL.R;
    if (!r.ball.won || !atFlag || r.ball.deaths > 0) bad++;
    minH = Math.min(minH, r.minHearts);
  }
  for (const c of data.checkpoints) {
    const from = { x: c.x, y: c.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE };
    for (const lead of LEADS) {
      const r = play(data, (lv) => route(lv, lead), { from });
      if (!r.ball.won || r.ball.deaths > 0) bad++;
      minH = Math.min(minH, r.minHearts);
    }
  }
  return bad ? 'X' + bad : String(minH);
}

const id = Number(process.argv[2]);
const data = LEVELS.find((l) => l.id === id);
if (!data) { console.log(`no level ${id}`); process.exit(2); }
if (!data.enemies || data.enemies.length !== 1) {
  console.log(`level ${id} has ${data.enemies?.length || 0} enemies; this script expects exactly one — apply the level edit first`);
  process.exit(2);
}
const e = data.enemies[0];
const variant = (patch) => ({ ...data, enemies: [{ ...e, ...patch }] });

console.log(`level ${id}, ${e.kind} as authored: ${matrix(data)}   (want: 2 — no failures, never below 2 of 3 hearts)`);
if (e.kind === 'walker') {
  const As = [-20, 0, 20].map((d) => e.amplitude + d);
  console.log(`\nneighbourhood (rows x, columns amplitude):\n         ` + As.map((a) => String(a).padEnd(5)).join(' '));
  for (const x of [-25, 0, 25].map((d) => e.x + d)) {
    console.log(String(x).padEnd(8) + ' ' + As.map((a) => matrix(variant({ x, amplitude: a })).padEnd(5)).join(' '));
  }
} else if (e.kind === 'roller') {
  console.log('\nneighbourhood (rows: patrol range widened/narrowed; columns: start x):');
  const Xs = [-200, 0, 200].map((d) => e.x + d);
  console.log('                 ' + Xs.map((x) => String(x).padEnd(5)).join(' '));
  for (const d of [-100, 0, 100]) {
    const from = e.from - d, to = e.to + d;
    console.log(`${from}..${to}`.padEnd(17) + Xs.map((x) => matrix(variant({ from, to, x })).padEnd(5)).join(' '));
  }
}
```

---

## Plan self-review notes

*(For whoever executes this plan: these are the author's own checks, already done. They are recorded here so a re-review is not needed unless something changes.)*

**Spec coverage:**

| Spec element | Where it is covered |
|---|---|
| Level 3 walker | Task 1 |
| Level 4 roller | Task 2 |
| One clarifying sentence in the original spec | Task 3, Step 1 |
| Placement on a flat, already-easy stretch clear of gaps, spikes and the crate puzzle | Walker 850–900 units from both gaps and far from the crate flat. Roller 500 units from the spike patch and 400 from the ramp. |
| No new checkpoints, existing ones unmoved | No task touches `checkpoints` |
| No route or runner changes | finish.mjs changes are two strings only |
| No new test files or mechanisms | `hearts-check.mjs` is a scratch tool, explicitly never committed, doing by script what the walker-two review did by hand |
| Out of scope: levels 1, 2 and 5, and follow-up items 2–5 | Untouched. Item 1's status line is the only follow-ups edit. |

**Placeholder scan:** no TBD or TODO, and every code step shows the full code.

**Consistency, checked against the shipped code:**

- `{kind:'walker', x, y, amplitude}` and `{kind:'roller', x, y, from, to, dir}` match `js/enemies.js`.
- `CONFIG.ENEMY.WALKER.R` (22) and `CONFIG.ENEMY.ROLLER.R` (20) rest each enemy on ground at 760, the same pattern level 2 uses.
- The poll string "A recurring roller" appears only in Task 2's comment, so it proves the final content is deployed.

**Deviations from the spec, both deliberate:**

- Task 3's sentence says "above" where the spec's text says "below", for the reason given in that step.
- Task 3 also fixes three pre-existing stale references and two README rows. They were found while planning, and they describe the exact suites this plan relies on.
