# Lower The Horizon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lower Pushkar Ball's horizon on roomy screens by changing `CONFIG.CAMERA.GROUND_AT` from `0.73` to `0.60`, updating the one test threshold that deliberately moves past, and correcting the one README line that cites the old fraction.

**Architecture:** A single config-value change in `games/pushkar-ball/js/config.js`. No new code, no new mechanic — `Camera.biasFor` already derives everything from `CONFIG.CAMERA.GROUND_AT`, so changing the constant is the entire behavioral change. The only other edits are: raising `tests/offline/camera.mjs`'s land-percentage ceiling from 35 to 42 (the new target's honoured-case value is exactly 40%, a deliberate move past the old ceiling — not a bug in the test), and updating one descriptive fraction in `games/pushkar-ball/README.md`.

**Tech Stack:** Vanilla JS (ES modules), no build step. Tests run under plain node via `games/pushkar-ball/tests/run.mjs offline` (or `run.mjs camera` for just this suite).

**Spec:** `docs/superpowers/specs/2026-09-13-lower-horizon-design.md`

---

### Task 1: Lower `GROUND_AT` and update its one affected test

**Files:**
- Modify: `games/pushkar-ball/js/config.js:81` (the `GROUND_AT` value)
- Modify: `games/pushkar-ball/tests/offline/camera.mjs:112-114` (the land-percentage ceiling)

- [ ] **Step 1: Confirm the test currently passes, before any change**

Run: `node games/pushkar-ball/tests/run.mjs camera`
Expected: `ALL CAMERA CHECKS PASSED` (or however it reports success — read the
suite's final `console.log` if unsure; it uses the same
`failures ? ... : 'ALL ... PASSED'` pattern as the other suites in this
project).

- [ ] **Step 2: Change `GROUND_AT`**

In `games/pushkar-ball/js/config.js`, find this line (around line 81, inside
the `CAMERA` block, right after its long explanatory comment about the
0.73 target and the `GROUND_CLEAR` tradeoff):

```javascript
    GROUND_AT: 0.73,
```

Change it to:

```javascript
    GROUND_AT: 0.60,
```

Leave the surrounding comment block (the one explaining why this is a
target rather than a promise, and the `BIAS_Y` history) exactly as it is —
it describes the mechanism, not the specific number, and stays accurate.

- [ ] **Step 3: Run the camera suite and confirm it now fails, for the expected reason**

Run: `node games/pushkar-ball/tests/run.mjs camera`

Expected: FAIL, with a message naming a screen 700px or taller and a land
percentage around 40 exceeding a ceiling of 35 — something like:

```
FAIL: on 1440x900 the land still fills 40% of the screen — a tall window should not read as half sky, half field
```

If it fails with a DIFFERENT message (for example, a mismatch on one of the
small-screen assertions), stop: that would mean the button-clearance
override case moved when this plan's own measurements say it shouldn't have
on 568x320 or 740x280, and needs investigating before continuing — don't
paper over it by adjusting an unrelated number.

- [ ] **Step 4: Raise the land-percentage ceiling, with the reasoning written down**

In `games/pushkar-ball/tests/offline/camera.mjs`, find this block (around
line 111):

```javascript
  // The whole point of the exercise: a big screen must not look half-and-half.
  if (h >= 700 && land > 35) {
    fail(`on ${w}x${h} the land still fills ${land.toFixed(0)}% of the screen — a tall window should not read as half sky, half field`);
  }
```

Replace it with:

```javascript
  // The whole point of the exercise: a big screen must not look half-and-half.
  // The ceiling here is 42, not the 50 that would actually be half-and-half:
  // GROUND_AT's honoured-case land share is exactly 1 - GROUND_AT (40% at
  // today's 0.60), so 42 leaves a couple of points of slack for that exact
  // value while staying meaningfully below the 50% this check exists to
  // catch. If GROUND_AT changes again, recompute 1 - GROUND_AT and move this
  // number to stay just above it — don't leave it trailing the old target.
  if (h >= 700 && land > 42) {
    fail(`on ${w}x${h} the land still fills ${land.toFixed(0)}% of the screen — a tall window should not read as half sky, half field`);
  }
```

- [ ] **Step 5: Run the camera suite again and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs camera`
Expected: `ALL CAMERA CHECKS PASSED` (or whatever passing message the suite
prints — the same one seen in Step 1).

- [ ] **Step 6: Run the full offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass — this project's convention is 14 suites as of
this plan, but read the actual count the run prints rather than assuming
14 stayed exact.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/tests/offline/camera.mjs
git commit -m "$(cat <<'EOF'
Lower the horizon on roomy screens

GROUND_AT 0.73 -> 0.60. Measured first: the two smallest screens this
project checks against (568x320, 740x280) are already capped by
GROUND_CLEAR today and are untouched by this change - only phones and
windows roomy enough for the target to matter are affected, which is
where "reads as flat" feedback was most plausible. camera.mjs's
half-and-half ceiling moves from 35 to 42 to admit the new target's
exact 40% land share, still well clear of the 50% it guards against.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Update the README's stale fraction

**Files:**
- Modify: `games/pushkar-ball/README.md:263`

- [ ] **Step 1: Update the fraction**

In `games/pushkar-ball/README.md`, find this sentence (around line 262-264,
in the paragraph describing `Camera.biasFor`):

```markdown
`GROUND_AT` is a target honoured where there is room and given up where there
is not: about a quarter of the screen is land on a monitor, closer to a half on
the shortest phone, and `tests/offline/camera.mjs` asserts both halves of that
rule rather than one number that could only be right on one screen.
```

Replace it with:

```markdown
`GROUND_AT` is a target honoured where there is room and given up where there
is not: about two fifths of the screen is land on a monitor, closer to a half
on the shortest phone, and `tests/offline/camera.mjs` asserts both halves of
that rule rather than one number that could only be right on one screen.
```

(Only "about a quarter" becomes "about two fifths" — everything else in the
sentence, including the shortest-phone clause, stays exactly as written: it
was already correct and this plan doesn't change that case.)

- [ ] **Step 2: Confirm no other line in the README cites the old fraction or value**

Run: `grep -n "0.73\|quarter" games/pushkar-ball/README.md`
Expected: no output (or only unrelated matches — read anything that comes
back before assuming it's unrelated).

- [ ] **Step 3: Commit**

```bash
git add games/pushkar-ball/README.md
git commit -m "$(cat <<'EOF'
Update README's land-share fraction for the new horizon target

GROUND_AT's honoured-case land share is 40% (two fifths) now, not the
old 27% ("about a quarter") the doc still described.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Full verification and live check

**Files:** none (verification only)

- [ ] **Step 1: Run the full offline suite one more time**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass.

- [ ] **Step 2: Run the full suite including the browser suites, against the local copy**

Run: `node games/pushkar-ball/tests/run.mjs`
Expected: all suites pass, including the four browser suites
(`deflate`, `jump`, `roll`, `small`) — this confirms the lower horizon
doesn't visually break anything those suites check (e.g. `small` covers
tiny screens, which this plan's own measurements say are unaffected, so
this is the check that actually proves that claim rather than just
asserting it).

- [ ] **Step 3: No commit needed for this task**

This task is verification only — Tasks 1 and 2 already committed
everything that changed.
