# Pushkar Ball — zero-hearts fail resets checkpoint credit too

Follow-up item 8 from `docs/superpowers/specs/2026-09-11-followup-ideas.md`,
brainstormed and approved 2026-09-13.

## The gap

`Ball.respawn()` (`games/pushkar-ball/js/player.js`) already sends the ball to
`this.spawn` — the level's own start — rather than `this.home` when hearts
have run out, and refills hearts. But it never touches `this.home` itself, or
any checkpoint's `taken` flag on the level. So one step after a zero-hearts
respawn, the very next ordinary fall (one heart lost, not a run-out) looks at
`home`, finds it unchanged from before the run-out, and sends the ball back
to the last checkpoint it had already reached — skipping back past ground the
zero-hearts fail had just sent it to redo.

The 2026-09-10 health/enemies spec calls a zero-hearts fail "deliberately the
harsher of the two setbacks in the game." As shipped, that harshness lasts
exactly one respawn: a single subsequent mistake quietly restores the
progress the harsher setback was supposed to take away.

## The decision

A zero-hearts fail resets checkpoint credit for the level, not just the
ball's immediate position. It becomes a genuine do-over: spawn, full hearts,
and every checkpoint on the level un-taken, so `home` returns to spawn until
the ball earns its way back to a checkpoint by reaching it again.

The alternative — leave checkpoints marked taken, only move `home` to spawn
for this one respawn — was considered and rejected. It does not just fall
short of "harsher," it actively breaks the ordinary single-fall behaviour for
the rest of that life: `Level.takeCheckpoint()` skips any checkpoint already
marked `taken` (that's what stops walking backward from dragging `home` to an
earlier checkpoint), so if the checkpoints stay taken while `home` resets to
spawn, nothing can ever re-arm `home` again — every fall for the remainder of
the level would send the ball all the way back to spawn, not just the first
one after the run-out. Un-taking checkpoints alongside the `home` reset is
what keeps the ordinary "fall → last checkpoint" rule intact once the ball
starts making progress again.

## The fix

In `Ball.respawn()`, when `this.zeroHearts` is true (already the branch that
picks `spawn` over `home`):

1. Set `this.home = { x: this.spawn.x, y: this.spawn.y }`.
2. Un-take every checkpoint on the level: `level.checkpoints.forEach(c => c.taken = false)`.

Part 2 requires `respawn()` to receive the `level`. Its only call site is in
`Ball.update(dt, input, level)`, which already has `level` in scope, so the
call becomes `this.respawn(level)` and nothing else in the call chain needs
to change.

No other state needs resetting here — `respawn()` already clears velocity,
spin, buffered jump, and carried platform on every call; those are orthogonal
to checkpoint credit.

## Testing

Add a case to `games/pushkar-ball/tests/offline/checkpoints.mjs`:

- Build a ball on a level with at least one checkpoint.
- Drive it to take the first checkpoint (as existing cases already do).
- Run its hearts to zero (three hits, or a fall while at one heart) and let
  it deflate and respawn.
- Assert: the ball is at the level's spawn; `ball.home.x === level.spawn.x`;
  `level.checkpoints[0].taken === false`.
- Then drive the ball back over the first checkpoint and assert `home` moves
  to it again and hearts refill — confirming the checkpoint is genuinely
  live again, not just cosmetically reset.

## Docs

- Update the 2026-09-10 spec's "What happens at zero hearts" section to state
  that checkpoint credit is cleared along with hearts and position, so the
  spec and the code agree on what "harsher" means.
- Mark item 8 done in `2026-09-11-followup-ideas.md`, pointing at this spec.

## Out of scope

- Item 7 (what an enemy's cycle costs a late jumper) and item 3 (ground/hill
  height) are separate follow-ups and untouched by this change.
- No change to `takeCheckpoint()`'s existing backward-rolling behaviour
  (skipping already-taken checkpoints) — that rule is preserved; it's simply
  given a clean slate to apply from after a zero-hearts fail.
