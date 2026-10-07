# Level 3 Roller and Level 4 Rising Spikes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Level 3 gets a roller enemy alongside its existing walker; level 4's four open-ground spike patches (all but the tunnel patch) start rising on a sine, ramped from `SPIKE.CYCLE_SLOW` near spawn to `SPIKE.CYCLE_FAST` later.

**Architecture:** Both changes are level *data* in `games/pushkar-ball/js/levels.js` — no new mechanics. Level 4 additionally needs `tests/offline/finish.mjs`'s two level-4 routes switched from the plain `runner` to the existing `waitForLow` helper (already used by levels 2 and 3), since a route that doesn't know how to wait for a rising patch will walk straight into one. No new offline suite files: `tests/offline/finish.mjs`'s existing generic checks (every level finished 30 ways, and from every checkpoint) already cover a level's enemies and risers once the level data and route exist; `tests/offline/enemies.mjs` and `tests/offline/risers.mjs` are mechanism-only (no level lookups), so they need no changes.

**Tech Stack:** Vanilla ES modules, no build. Offline suites: `node games/pushkar-ball/tests/run.mjs <name>`.

**Spec:** `docs/superpowers/specs/2026-09-16-level3-roller-and-level4-rising-spikes-design.md`

**`sw.js` is untouched by this plan** — no new files, nothing added or removed from the precache list — so only Pushkar Ball's own full suite needs to pass before pushing; Taras Town's is unaffected.

## Files

- Modify `games/pushkar-ball/js/levels.js` — level 3's `enemies` array and header comment; level 4's `spikes` array and header comment.
- Modify `games/pushkar-ball/js/config.js` — `SPIKE.RISE_H`/`CYCLE_SLOW`/`CYCLE_FAST` comments, to note level 4 now uses both cycles too.
- Modify `games/pushkar-ball/tests/offline/finish.mjs` — level 4's `ROUTES[4]` and `crateRoute4` switch from `runner` to `waitForLow`.
- Modify `games/pushkar-ball/tests/README.md` — the `finish` row's mention of which levels use `waitForLow`.
- Modify `docs/superpowers/specs/2026-09-16-level3-roller-and-level4-rising-spikes-design.md` — mark DONE with a deviation note.

---

### Task 1: Level 3 gets a roller

**Files:**
- Modify: `games/pushkar-ball/js/levels.js` (level 3's `enemies` array, ~line 429, and its header comment, ~line 355-359)

- [ ] **Step 1: Read the current level 3 block**

Open `games/pushkar-ball/js/levels.js` and find the level object with `id: 3`. Confirm its `enemies` array currently reads exactly:

```js
    enemies: [
      // A recurring walker, from level two, the calmest of the three
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
```

If it doesn't match exactly (whitespace aside), stop and report NEEDS_CONTEXT — the file has moved on since this plan was written and the surrounding line numbers below can't be trusted.

- [ ] **Step 2: Add the roller**

The flat this walker patrols runs x=1500 to x=3800 (a 220px gap follows at 3800; the walker's own patrol occupies 2395–2955). Add a roller after the walker's patrol, on the same flat, well clear of both the walker and the gap. Replace the closing `],` of the `enemies` array with:

```js
      // A roller too, on the same flat, level 2's real test rather than its
      // calm one — level four's own comment calls it "the most active of the
      // three enemies... the one that has to be tracked and timed." It
      // patrols 3150..3650, clear of the walker's 2395..2955 patrol by 195
      // units and of the 220px gap at 3800 by 150, so a ball is never asked
      // to time the walker, the roller and a gap at once. Also before
      // checkpoint one, for the same reason the walker is: whatever it
      // costs is given back before the level's tightest gap.
      //
      // Starting at the patrol's middle, heading left (dir: -1) — level 2's
      // and level 4's rollers both start this way. x/from/to/dir are a
      // starting hypothesis, not yet proven against finish.mjs; Step 4 below
      // sweeps it and this comment must be updated with what the sweep
      // actually finds, the way every other enemy placement comment in this
      // file already is.
      { kind: 'roller', x: 3400, y: 760 - CONFIG.ENEMY.ROLLER.R, from: 3150, to: 3650, dir: -1 },
    ],
```

- [ ] **Step 3: Update the level's header comment**

The comment block above `id: 3` currently ends (around line 355-359):

```js
    // It also brings back one thing already taught: a walker, from level
    // two, on the long flat between the first two gaps — see `enemies`
    // below. Not a new idea, so it gets no checkpoint and no rehearsal of its
    // own; it is here so that what level two taught does not simply stop
    // the moment level two ends.
```

Change it to also mention the roller:

```js
    // It also brings back what level two already taught: a walker, on the
    // long flat between the first two gaps, and — added Sep 16 2026 — a
    // roller, further along the same flat. Neither is a new idea, so
    // neither gets a checkpoint or a rehearsal of its own; they are here so
    // that what level two taught does not simply stop the moment level two
    // ends.
```

- [ ] **Step 4: Run the finish suite and tune the placement**

Run: `node games/pushkar-ball/tests/run.mjs finish`

This runs, among other checks, "every level finished 30 ways" (3 jump leads × 10 start delays) and "from every checkpoint" (3 leads) for every level with a route — level 3 already has one (`ROUTES[3]` wraps the generic runner, which already jumps any enemy it sees ahead of the ball, the same way it already jumps the existing walker). No `finish.mjs` code change is needed for this — only tuning the roller's placement until level 3 passes.

**Expected before tuning:** possibly some `level 3 was not finished cleanly N time(s) of 30` or `level 3: a ball respawned at checkpoint 0 ... did not finish cleanly` failures, if the initial guess above sends the ball into the roller at some lead/delay combination. All other levels and all other `finish` checks must stay passing throughout — if a level other than 3 starts failing, the roller's `to` bound may be exceeding the flat's own edges; re-check Step 2's numbers against the ground segment `[[1500, 760], [3800, 760]]` before touching anything else.

**If level 3 fails:** the fastest lever is `dir` (try `1` instead of `-1` — level 2's roller comment explains why the starting direction changes which lead/delay combinations meet it head-on versus from behind, and that determines whether a late jump costs one heart or several). If flipping `dir` doesn't clear every combination, try shifting the whole patrol 100-200 units in one direction (keeping the same 500-unit width, and keeping both margins above 100 units from the walker and the gap), or narrowing/widening the patrol width itself. Re-run after each change. This is exactly the kind of tuning level 2's and level 3's own enemy comments describe doing — by trying values against `finish.mjs`, not by guessing once and accepting it.

Once it passes cleanly, update Step 2's comment to say what was actually found — the final `x`/`from`/`to`/`dir`, and, if they changed from the starting hypothesis, one sentence on why (mirroring how level 2's and level 3's existing enemy comments explain their own final values).

- [ ] **Step 5: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite ok except the known, out-of-scope `offline/finish` line `level 7 has no route in finish.mjs` — nothing else should fail. If anything else fails, investigate before continuing; do not proceed to Step 6 with an unexplained failure.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/levels.js
git commit -m "$(cat <<'EOF'
Add a roller to level 3, alongside its walker

Level 2's real test, not just its calm one, patrolling the same flat
the walker already uses, well clear of both the walker and the gap
that follows. Tuned against finish.mjs's 30-way and per-checkpoint
sweeps.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Level 4's four open-ground spike patches start rising

**Files:**
- Modify: `games/pushkar-ball/js/config.js` (`SPIKE` block, ~line 315-359)
- Modify: `games/pushkar-ball/js/levels.js` (level 4's `spikes` array, ~line 550-567, and its header comment, ~line 480-496)
- Modify: `games/pushkar-ball/tests/offline/finish.mjs` (`ROUTES[4]` at ~line 238, and `crateRoute4` at ~line 299)

- [ ] **Step 1: Update `config.js`'s comments**

Find, in `games/pushkar-ball/js/config.js`, the `SPIKE` block's `RISE_H`/`CYCLE_SLOW`/`CYCLE_FAST` comment and values:

```js
    // A rising patch — levels 2 and 3 — climbs from H to this and back on a
    // sine of level time. Tall enough that no unaided jump clears it: a jump's
    // underside peaks 131px up, so this leaves 44px after FORGIVE, and
    // tests/offline/risers.mjs holds it to at least 30. See
    // docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md.
    RISE_H: 180,
    // Seconds for one whole rise and fall. A route that waits for the patch to
    // stay under a threshold for its crossing finished cleanly at 3-5s
    // (simulated at 90px; the suite now uses a stricter 75); 7s lost a run.
    // If level 2 stops finishing cleanly, 5 is the proven slow value.
    CYCLE_SLOW: 6,       // level 2
    CYCLE_FAST: 3.5,     // level 3
```

Replace with:

```js
    // A rising patch — levels 2, 3, and (added Sep 16 2026) four of level
    // 4's five patches — climbs from H to this and back on a sine of level
    // time. Tall enough that no unaided jump clears it: a jump's underside
    // peaks 131px up, so this leaves 44px after FORGIVE, and
    // tests/offline/risers.mjs holds it to at least 30. See
    // docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md
    // and docs/superpowers/specs/2026-09-16-level3-roller-and-level4-rising-spikes-design.md.
    // Level 4's fifth patch, over its tunnel, is deliberately excluded: it is
    // authored at RISE_H with no `rise` at all, because that patch's own
    // lesson is "waiting never helps, you must find another way," and giving
    // it a cycle would blur that lesson with this one.
    RISE_H: 180,
    // Seconds for one whole rise and fall. A route that waits for the patch to
    // stay under a threshold for its crossing finished cleanly at 3-5s
    // (simulated at 90px; the suite now uses a stricter 75); 7s lost a run.
    // If level 2 stops finishing cleanly, 5 is the proven slow value.
    CYCLE_SLOW: 6,       // level 2; level 4's two patches near its spawn
    CYCLE_FAST: 3.5,     // level 3; level 4's two later patches
```

- [ ] **Step 2: Read the current level 4 spikes block**

Open `games/pushkar-ball/js/levels.js`, find the level object with `id: 4`, and confirm its `spikes` array currently reads exactly:

```js
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
      // The patch that does not come down. It stands on the slab over the
      // tunnel and no jump from the ground clears it. Two ways past: shove the
      // crate against the planks and jump from it, or roll into the planks
      // hard enough to break them and go underneath.
      { x: 13400, y: 680, w: 100, h: 80 },
    ],
```

If it doesn't match exactly, stop and report NEEDS_CONTEXT.

- [ ] **Step 3: Give the first four patches a rise cycle**

Replace the block with:

```js
    spikes: [
      // The rehearsal: narrow, flat, unmissable, close to spawn. Rising,
      // added Sep 16 2026 — CYCLE_SLOW, the same cycle level 2 uses, so the
      // very first patch a player meets in this level is also the gentlest
      // introduction to "spikes can move" this game has. Phase 0: no other
      // rising patch is ever on screen with it, so there is nothing for a
      // shared phase to desynchronise from.
      { x: 700, y: 760, w: 70, rise: { period: CONFIG.SPIKE.CYCLE_SLOW, phase: 0 } },
      // A second, still-easy patch on the same long flat — one more rep of
      // the idea before the gap and the first checkpointed stretch. Also
      // CYCLE_SLOW: still rehearsal, not yet the level's real test.
      { x: 3400, y: 760, w: 90, rise: { period: CONFIG.SPIKE.CYCLE_SLOW, phase: 0 } },
      // The first patch that is really asked of the player, well after the
      // gap so the gap and the spikes are never one piece of timing.
      // CYCLE_FAST from here on — the same cycle level 3 uses — since this
      // is where the level stops rehearsing and starts testing.
      { x: 7200, y: 760, w: 100, rise: { period: CONFIG.SPIKE.CYCLE_FAST, phase: 0 } },
      // On the high ground, in plain view from the top of the ramp before it
      // has to be jumped.
      { x: 11100, y: 620, w: 90, rise: { period: CONFIG.SPIKE.CYCLE_FAST, phase: 0 } },
      // The patch that does not come down. It stands on the slab over the
      // tunnel and no jump from the ground clears it. Two ways past: shove the
      // crate against the planks and jump from it, or roll into the planks
      // hard enough to break them and go underneath. Deliberately left
      // static — see config.js's SPIKE.RISE_H comment for why.
      { x: 13400, y: 680, w: 100, h: 80 },
    ],
```

- [ ] **Step 4: Update the level's header comment**

The comment block above `id: 4` currently reads (around line 480-496):

```js
    // Level four teaches the spike — reshuffled here Sep 2026 from its
    // original home at level three, so crates could move down to level three
    // and enemies could move up to level two. Everything under it — rolling,
    // gaps, crates, a moving platform, enemies — has already been met, and
    // so has one narrow spike patch, glimpsed once on open ground in level
    // one; this is where spikes are taught. Its ground, platform, spikes and
    // checkpoints are unchanged from the original level three.
    //
    // It also brings back one thing already taught: a roller, from level
    // two, on the flat between checkpoint one's spike patch and the ramp —
    // see `enemies` below. Not a new idea, so it gets no checkpoint of its
    // own, for the same reason the gap below gets none.
    //
    // Past checkpoint two, on the long flat home, it asks something new: a
    // patch no jump clears, on a slab over a boarded-up tunnel — a way must be
    // MADE, with the crate or by smashing the planks.
```

Add a fourth paragraph after it:

```js
    //
    // Added Sep 16 2026: the four open-ground patches now rise, ramped from
    // CYCLE_SLOW near spawn to CYCLE_FAST by the time checkpoint one's own
    // patch is reached — jumping a spike was this level's original lesson;
    // timing one is now layered on top of it. The tunnel patch is
    // deliberately excluded — see its own comment in `spikes` below.
```

- [ ] **Step 5: `finish.mjs` — level 4's routes learn to wait**

Open `games/pushkar-ball/tests/offline/finish.mjs`. Find `ROUTES[4]`:

```js
  4: (level, lead) => {
    const run = runner(level, lead);
    const wood = level.breakables[0];
    return (ball) => {
      if (ball.x > wood.x - 500 && ball.x < wood.x + 150) return { right: true };
      return run(ball);
    };
  },
```

Change `const run = runner(level, lead);` to `const run = waitForLow(level, lead);` — everything else in this route is unchanged (`waitForLow` already falls back to the plain runner's own jump logic when there is no rising patch nearby, so the "ram through the planks without jumping" override right above it still works exactly as before).

Then find `crateRoute4`:

```js
function crateRoute4(level, lead, late) {
  const run = runner(level, lead);
  const crate = level.crates[0];
  const wood = level.breakables[0];
```

Change `const run = runner(level, lead);` to `const run = waitForLow(level, lead);`. This route starts from checkpoint 2 (x=10950), which is before the x=11100 rising patch, and its `'run'` stage carries the ball all the way to the crate at x=12500 — so it now needs to know how to wait, the same way `ROUTES[4]` does.

- [ ] **Step 6: Run `finish` and confirm it still passes**

Run: `node games/pushkar-ball/tests/run.mjs finish`

This must still show, among its output: level 4 finished cleanly all 30 ways and from every checkpoint (checks 1 and 2), and section "3d. level four, both ways past its tall patch" still passing — the tunnel route breaking the planks, the crate route finishing all 9 lead/late combinations without breaking them, no way past without either, and a slow roll leaving the planks standing.

**If it fails:** the phases chosen in Step 3 (all `phase: 0`) are a hypothesis, not proven. `waitForLow` backs the ball off up to 260px before a patch and waits, so a failure here most likely means a route arrived while a patch was rising and had no room to back off into (for example, too close to the ramp's edge, or too close to another obstacle) — not that the cycle itself is wrong. Read the specific failure message (`finish.mjs` reports the lead/delay or lead/late combination and where the ball ended up) and check the failing patch's position against what's immediately behind it (the 200px gap before x=700, the ramp before x=11100). If a patch simply has no clear ground behind it for the runner to back off into, that patch's position — not its cycle or phase — needs to move; this would be a change to Step 3 worth documenting in that step's comment, mirroring how this file already documents every value it settled on.

- [ ] **Step 7: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: every suite ok except the known `level 7 has no route in finish.mjs` line. Confirm `offline/risers` and `offline/levels` are still passing unchanged — both are generic/mechanism-only and should need no edits for this task, but this confirms it.

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs
git commit -m "$(cat <<'EOF'
Make level 4's four open-ground spike patches rise

Ramped from CYCLE_SLOW near spawn to CYCLE_FAST by checkpoint one's
patch. The tunnel patch stays static on purpose — its own lesson is
that waiting never helps. finish.mjs's two level-4 routes switch from
the plain runner to waitForLow, the same helper levels 2 and 3 use.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Look at it, docs, and the full suite

**Files:**
- Modify: `games/pushkar-ball/tests/README.md` (the `finish` row)
- Modify: `docs/superpowers/specs/2026-09-16-level3-roller-and-level4-rising-spikes-design.md`

- [ ] **Step 1: Look at it**

There's no existing per-level screenshot suite for Pushkar Ball, but level select (built in an earlier plan) makes any level reachable by seeding `localStorage` before load, the same way `tests/browser/screens.mjs` already does. Write a throwaway script (do not commit it) at, for example, `games/pushkar-ball/tests/browser/_look416.mjs`, reusing `connect`/`hold`/`shoot` from `_helpers.mjs`:

```js
import { connect, makeHold } from './_helpers.mjs';

const URL = process.argv[2];
const PORT = Number(process.argv[3] || 9339);
const cdp = await connect(PORT, 'look416');
const { send, ev, sleep, shoot } = cdp;
const hold = makeHold(cdp);

const W = 844, H = 390;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage' });
await send('Page.navigate', { url: URL });
await sleep(1000);
await ev(`localStorage.setItem('pushkar-ball-save', JSON.stringify({ unlocked: 4, finished: [1, 2, 3] }))`);
await send('Page.navigate', { url: URL });
await sleep(1600);
await ev("document.getElementById('start-button').click()");
await sleep(400);

// Level 3, run a few seconds to let its roller and walker move into frame.
await ev("document.querySelectorAll('#level-grid .tile')[2].click()");
await sleep(2500);
await shoot('look416-level3');

await ev("document.getElementById('start-button') ? null : null"); // no-op guard
await send('Page.navigate', { url: URL });
await sleep(1600);
await ev("document.getElementById('start-button').click()");
await sleep(400);
// Level 4, a few seconds in, then again later once a patch or two has risen.
await ev("document.querySelectorAll('#level-grid .tile')[3].click()");
await sleep(1500);
await shoot('look416-level4-early');
await sleep(4000);
await shoot('look416-level4-later');

process.exit(0);
```

Run it the way any browser suite is run — check `games/pushkar-ball/tests/run.mjs` or an existing browser suite invocation (e.g. `roll.mjs`) for the exact server-start-then-connect sequence this repo uses, and reuse it rather than inventing a new one. Then read the four screenshots (`look416-level3.png`, `look416-level4-early.png`, `look416-level4-later.png`, and a second `level4-later` shot if useful) with the Read tool.

Judge: level 3's roller and walker are both visible and readable as two different things (not visually identical); level 4's rising patches read as taller/shorter between the "early" and "later" shots — if both screenshots happened to land at the same point in a cycle, re-run with a different sleep duration rather than concluding nothing moved. Fix only clear problems (e.g. a patch's `w` too narrow to read as spikes at this zoom, two enemies overlapping) in the file that owns them, each its own commit with the reason. If nothing needs fixing, say so.

Delete the throwaway script before finishing this task — it must not be committed (`games/pushkar-ball/tests/browser/_look416.mjs` should not appear in `git status`).

- [ ] **Step 2: Update the tests README**

In `games/pushkar-ball/tests/README.md`, find the `finish` row in the offline table. It currently reads (in relevant part):

> `finish` | **Every level can be finished**, shown by finishing it: a small route per level (a generic runner — which jumps gaps, spikes, crates, stone steps and enemies — plus scripts for level one's platform and level three's crate, and `waitForLow` for levels two and three, which looks ahead with `spikeHeight` and only crosses a rising patch that will stay under 75px) drives the real ball from the spawn to the flag 30 ways...

Change `waitForLow` for levels two and three, which looks ahead with `spikeHeight`" to `waitForLow` for levels two, three and four, which looks ahead with `spikeHeight`" — the rest of that sentence and the row is unchanged.

- [ ] **Step 3: Mark the spec done**

In `docs/superpowers/specs/2026-09-16-level3-roller-and-level4-rising-spikes-design.md`, change the first line from:

```
# Level 3 gets a roller, and level 4's spikes start rising
```

to:

```
# Level 3 gets a roller, and level 4's spikes start rising — DONE
```

Add a short note under it naming this plan
(`docs/superpowers/plans/2026-09-16-level3-roller-and-level4-rising-spikes.md`)
and what changed on the way:

- The final roller placement found by sweeping (from Task 1's Step 4).
- Level 4's four risers all share `phase: 0` rather than being staggered,
  because they sit thousands of units apart and are never on screen
  together, so a shared phase creates no readability problem to avoid.
- The spec's Testing section expected `offline/enemies.mjs` and
  `offline/risers.mjs`/`hazards.mjs` to need extending. Both turned out to be
  mechanism-only suites with no level lookups — they test a walker/roller/
  riser's own formula against synthetic fixtures, not against `LEVELS` — so
  neither needed a change; `finish.mjs`'s existing generic checks (every
  level finished 30 ways, and from every checkpoint) already exercised the
  new roller and the new risers once the level data and, for level 4, the
  route existed.

- [ ] **Step 4: Run the full offline and browser suites**

Run: `node games/pushkar-ball/tests/run.mjs`
Expected: every suite ok except the known `level 7 has no route in finish.mjs` line.

`sw.js` was not touched by this plan, so there is no need to run Taras Town's suite.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/tests/README.md docs/superpowers/specs/2026-09-16-level3-roller-and-level4-rising-spikes-design.md
git commit -m "$(cat <<'EOF'
Document level 3's roller and level 4's rising spikes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

If Step 1 found and fixed any visual problems, those are their own earlier commits, made before this one.
