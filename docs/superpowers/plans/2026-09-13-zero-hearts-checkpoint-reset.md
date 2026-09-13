# Zero-Hearts Checkpoint Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a zero-hearts fail sends the ball back to the level's start, also clear its checkpoint credit — reset `home` to spawn and un-take every checkpoint — so the very next ordinary fall doesn't skip back past the ground the harsher setback was meant to make the ball redo.

**Architecture:** One change, in `Ball.respawn()` (`games/pushkar-ball/js/player.js`): when `this.zeroHearts` is true, also set `this.home` to `this.spawn` and un-take every checkpoint on the `level` passed in. `respawn()` currently takes no arguments; it gains a `level` parameter, and its one call site (inside `Ball.update`, which already has `level` in scope) passes it through.

**Tech Stack:** Vanilla JS (ES modules), no build step. Tests are the project's own node-based offline harness (`games/pushkar-ball/tests/run.mjs offline`), no browser needed for this change.

**Spec:** `docs/superpowers/specs/2026-09-13-zero-hearts-checkpoint-reset-design.md`

---

### Task 1: Reset `home` and un-take checkpoints on a zero-hearts respawn

**Files:**
- Modify: `games/pushkar-ball/js/player.js:70-96` (the `respawn()` method and its call site at line 213)
- Test: `games/pushkar-ball/tests/offline/health.mjs:76-100` (existing case 4 — extend it)

Case 4 in `health.mjs` already builds the exact scenario needed: a ball that
takes a checkpoint, then loses all three hearts, and asserts it lands back at
spawn with hearts refilled. This task extends that same case with the two
missing assertions (home reset, checkpoint un-taken) rather than duplicating
the fixture elsewhere.

- [ ] **Step 1: Extend the existing test with the two missing assertions, which will fail against today's code**

In `games/pushkar-ball/tests/offline/health.mjs`, case 4 currently ends like
this (do not change anything above the line `if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(...)`):

```javascript
  console.log(`\n4. after ${CONFIG.HEALTH.HEARTS} hits: hearts=${ball.hearts}, deaths=${ball.deaths}, ` +
              `x=${ball.x.toFixed(0)} (spawn ${spawn.x}, checkpoint home ${home.x})`);
  if (ball.deaths !== 1) fail(`exhausting hearts should relocate exactly once; deaths=${ball.deaths}`);
  if (Math.abs(ball.x - spawn.x) > 5) fail(`came back at x=${ball.x.toFixed(0)}, not the level's start at ${spawn.x}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`hearts did not refill on arrival: ${ball.hearts}`);
}
```

Replace that final block with:

```javascript
  console.log(`\n4. after ${CONFIG.HEALTH.HEARTS} hits: hearts=${ball.hearts}, deaths=${ball.deaths}, ` +
              `x=${ball.x.toFixed(0)} (spawn ${spawn.x}, checkpoint home ${home.x}), ` +
              `ball.home.x=${ball.home.x.toFixed(0)}, checkpoint taken=${level.checkpoints[0].taken}`);
  if (ball.deaths !== 1) fail(`exhausting hearts should relocate exactly once; deaths=${ball.deaths}`);
  if (Math.abs(ball.x - spawn.x) > 5) fail(`came back at x=${ball.x.toFixed(0)}, not the level's start at ${spawn.x}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`hearts did not refill on arrival: ${ball.hearts}`);

  // A zero-hearts fail is a full do-over, not just of this one respawn: the
  // ball's checkpoint credit must reset too, or the very next ordinary fall
  // would skip back past the ground this fail just sent it to redo.
  if (Math.abs(ball.home.x - spawn.x) > 5) {
    fail(`home is still ${ball.home.x.toFixed(0)}, not reset to spawn at ${spawn.x} — the next ` +
         `ordinary fall would skip back to the checkpoint instead of redoing this ground`);
  }
  if (level.checkpoints[0].taken) {
    fail('the checkpoint stayed taken through a zero-hearts reset, so it can never re-arm home again');
  }
}
```

- [ ] **Step 2: Run the offline suite and confirm the new assertions fail**

Run: `node games/pushkar-ball/tests/run.mjs health`
Expected: FAIL, with messages naming both new checks — `home is still ...` and
`the checkpoint stayed taken ...`. If it does not fail, stop and re-check the
edit landed in the right place before continuing.

- [ ] **Step 3: Implement the fix in `respawn()`**

In `games/pushkar-ball/js/player.js`, the current method (around line 79):

```javascript
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
```

Replace it with:

```javascript
  respawn(level) {
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
      // A zero-hearts fail is a full do-over of the level, not just of this
      // one respawn: without this, `home` would still point at the last
      // checkpoint taken before the run-out, and the very next ordinary fall
      // would skip back past the ground this fail just sent the ball to redo.
      this.home.x = this.spawn.x;
      this.home.y = this.spawn.y;
      // And the checkpoints themselves must un-arm, or nothing can ever move
      // `home` off spawn again: `takeCheckpoint` skips any checkpoint already
      // marked `taken`, so a taken checkpoint plus a spawn-reset `home` would
      // send every subsequent fall for the rest of the level all the way back
      // to spawn, not just this one.
      for (const c of level.checkpoints) c.taken = false;
    }
  }
```

Also update the method's doc comment immediately above it (currently):

```javascript
  /**
   * Send the ball back to its home — the checkpoint, or, once hearts have run
   * out, the level's own start — and refill hearts if that is why it is here.
   *
   * Every piece of carried state has to go, not just position. A leftover
   * upward velocity launches the ball off the respawn point; a leftover jump
   * in `buffer` fires the instant it lands; a leftover `platform` makes it
   * ride a platform elsewhere in the level.
   */
```

to:

```javascript
  /**
   * Send the ball back to its home — the checkpoint, or, once hearts have run
   * out, the level's own start — and refill hearts if that is why it is here.
   *
   * Every piece of carried state has to go, not just position. A leftover
   * upward velocity launches the ball off the respawn point; a leftover jump
   * in `buffer` fires the instant it lands; a leftover `platform` makes it
   * ride a platform elsewhere in the level.
   *
   * Needs `level` only for the zero-hearts branch, to un-arm its checkpoints
   * alongside resetting `home` — see the comment inside.
   */
```

Then update the one call site, in `update()` (around line 213), from:

```javascript
        this.respawn();
```

to:

```javascript
        this.respawn(level);
```

- [ ] **Step 4: Run the offline suite again and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs health`
Expected: `ALL ... PASSED` with no failures.

- [ ] **Step 5: Run the full offline suite to check nothing else broke**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass, including `checkpoints`.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/player.js games/pushkar-ball/tests/offline/health.mjs
git commit -m "$(cat <<'EOF'
Reset checkpoint credit on a zero-hearts respawn

Home stayed at the last checkpoint taken before hearts ran out, so the
next ordinary fall skipped back past ground a zero-hearts fail had just
sent the ball to redo. respawn() now resets home to spawn and un-takes
every checkpoint in that branch, so the "deliberately harsher" setback
in the 2026-09-10 spec actually holds past one respawn.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Prove a checkpoint can be earned again after the reset

**Files:**
- Test: `games/pushkar-ball/tests/offline/checkpoints.mjs` (new case appended after case 7, before the final `console.log(failures ...)` block)

Task 1 proves the reset happens. This task proves the reset checkpoint is
genuinely live again — not just cosmetically marked `taken: false` while
something else still blocks it from re-arming `home`.

- [ ] **Step 1: Add the new case**

In `games/pushkar-ball/tests/offline/checkpoints.mjs`, insert this new block
immediately after case 7 and before the final lines
(`console.log(failures ? ... ); process.exit(...)`):

```javascript
// --- 8. after a zero-hearts reset, a checkpoint can be earned again -------
//
// Task 1 (see health.mjs case 4) proves home resets to spawn and the
// checkpoint's `taken` flag clears. This proves that clearing actually
// matters: the ball can roll back over the same checkpoint and have it
// re-arm home and refill hearts, exactly as if this were a fresh attempt.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);

  input.right = true;
  run(ball, level, input, 2.0);   // past the first checkpoint at x=700
  input.right = false;
  if (!level.checkpoints[0].taken) fail('8: the checkpoint was never reached, so this proves nothing');
  if (ball.home.x !== level.checkpoints[0].x) fail('8: home did not move to the first checkpoint');

  for (let i = 0; i < CONFIG.HEALTH.HEARTS; i++) {
    ball.hit(1);
    run(ball, level, stub(), CONFIG.HEALTH.IFRAME + 0.05);
  }
  console.log(`\n8. after running hearts to zero: x=${ball.x.toFixed(0)} (spawn ${level.spawn.x}), ` +
              `home.x=${ball.home.x.toFixed(0)}, checkpoint taken=${level.checkpoints[0].taken}`);
  if (Math.abs(ball.home.x - level.spawn.x) > 5) fail('8: home did not reset to spawn on the zero-hearts fail');
  if (level.checkpoints[0].taken) fail('8: the checkpoint stayed taken through the reset');

  // Roll back over the same checkpoint and confirm it is genuinely live.
  input.right = true;
  run(ball, level, input, 2.0);
  input.right = false;

  console.log(`   rolled back over it: home.x=${ball.home.x.toFixed(0)}, taken=${level.checkpoints[0].taken}, ` +
              `hearts=${ball.hearts}`);
  if (!level.checkpoints[0].taken) fail('8: rolling over the checkpoint after the reset did not re-arm it');
  if (ball.home.x !== level.checkpoints[0].x) fail('8: home did not move back to the checkpoint after the reset');
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail('8: hearts did not refill on re-reaching the checkpoint');
}
```

- [ ] **Step 2: Run it and confirm it passes**

Run: `node games/pushkar-ball/tests/run.mjs checkpoints`
Expected: `ALL CHECKPOINT CHECKS PASSED`. This should pass on the first run
since Task 1 already implemented the fix this case exercises — the point of
this task is the added coverage, not a new code change.

- [ ] **Step 3: Run the full offline suite once more**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add games/pushkar-ball/tests/offline/checkpoints.mjs
git commit -m "$(cat <<'EOF'
Test that a checkpoint re-arms after a zero-hearts reset

health.mjs proves the reset happens; this proves it is not cosmetic —
the un-taken checkpoint can be earned again and re-arm home.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update docs to match the shipped behaviour

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md:108-114`
- Modify: `docs/superpowers/specs/2026-09-11-followup-ideas.md` (item 8 section)

- [ ] **Step 1: Add a line to the 2026-09-10 spec's "What happens at zero hearts" section**

In `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md`,
find this paragraph (around line 108):

```markdown
### What happens at zero hearts

A full deflate — the same squash-and-puff the game already has for every fail
today — and the ball returns to the **level's start**, not the last
checkpoint. Hearts refill to three. This is deliberately the harsher of the
two setbacks in the game, and it is what makes checkpoints and hearts each do
a distinct job instead of one making the other redundant.
```

Replace it with:

```markdown
### What happens at zero hearts

A full deflate — the same squash-and-puff the game already has for every fail
today — and the ball returns to the **level's start**, not the last
checkpoint. Hearts refill to three. This is deliberately the harsher of the
two setbacks in the game, and it is what makes checkpoints and hearts each do
a distinct job instead of one making the other redundant.

The harshness holds past that one respawn: every checkpoint already taken on
the level un-arms at the same moment, so the ball's next ordinary fall can no
longer fall back on checkpoint credit it earned before the run-out — it has
to earn a checkpoint again to get anything better than the level's start. See
`docs/superpowers/specs/2026-09-13-zero-hearts-checkpoint-reset-design.md`.
```

- [ ] **Step 2: Mark item 8 done in the follow-ups file**

In `docs/superpowers/specs/2026-09-11-followup-ideas.md`, find the heading
(around line 108 of that file):

```markdown
## 8. Losing every heart resets the ball's start but not its checkpoint
```

Change it to:

```markdown
## 8. Losing every heart resets the ball's start but not its checkpoint — DONE
```

Then find the paragraph directly under that heading, which currently ends:

```markdown
Needs a decision: keep it and write it down
(and test it), or reset home to the spawn too.
```

Replace the whole paragraph with:

```markdown
When the ball runs out of hearts it goes back to the level's spawn with
hearts refilled (`player.js`), but its respawn home used to stay at the last
checkpoint it took, so the next fall anywhere put it back at that checkpoint
instead of the spawn. See
`docs/superpowers/specs/2026-09-13-zero-hearts-checkpoint-reset-design.md` —
`respawn()` now resets `home` to spawn and un-takes every checkpoint on a
zero-hearts fail, so the setback holds until a checkpoint is earned again.
Implemented by
`docs/superpowers/plans/2026-09-13-zero-hearts-checkpoint-reset.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md docs/superpowers/specs/2026-09-11-followup-ideas.md
git commit -m "$(cat <<'EOF'
Document the zero-hearts checkpoint reset in both specs

Marks follow-up item 8 done and records in the 09-10 spec that the
harsher zero-hearts setback now holds past a single respawn.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
