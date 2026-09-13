# Pushkar Ball — make level 1's lift boardable

Follow-up item 6 from `docs/superpowers/specs/2026-09-11-followup-ideas.md`,
brainstormed and approved 2026-09-13.

## The problem

Level 1's vertical lift (`games/pushkar-ball/js/levels.js`, `platforms[1]`,
`{ x: 9700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 }`)
sits over the flat between the second and third gaps. Its top surface
oscillates between y=350 and y=590 (`y - dist` to `y + dist`). Nothing in the
level needs it — it exists to exercise a vertical mover in play, per its own
comment — but a player can see it and has no way to ever stand on it.

The arithmetic: `CONFIG.JUMP_V = 760`, `CONFIG.GRAVITY = 2200`, so a jump's
peak height is `760² / (2·2200) ≈ 131px` (the same figure the level's stone
block comment already cites). On the flat (ground y=760, `CONFIG.BALL.R =
20`), the ball's centre rests at 740 and its bottom at 760; at the top of a
jump those become 609 and 629. The lift's lowest reach, 590, is 39px short
(numerically smaller — higher up on screen) of the highest point the ball's
bottom can ever get to. No jump, timed any way, closes that gap, which
matches the follow-up's own sweep finding zero successful boardings across
the lift's whole 4-second cycle.

## The decision

Lower the lift's oscillation range so its lowest point genuinely intrudes
into the band a jump can reach, rather than leaving it as unreachable
scenery. The alternative — documenting it as intentionally unreachable — was
considered and rejected: there's no player-facing reason for a moving
platform he can watch but never touch, and the fix is small.

## The fix

Change `platforms[1]`'s anchor from `y: 470` to `y: 530`, keeping `dist: 120`
unchanged. New range: **410–650** (was 350–590). Everything else about the
lift (`x: 9700`, `w: 150`, `h: 28`, `period: 4.0`, `phase: 0.25`) stays as
authored.

This puts the lift's lowest reach (650) 21px past the ball's maximum reach
(629) — comfortably inside the reachable band (629–760), not right at its
edge. At the same time, the lift's lowest *underside* (650 + 28 = 678) still
clears a ball simply walking underneath it at full height (bottom of the
ball's standing hitbox at 720, i.e. resting-centre 740 minus `BALL.R` 20)
by 42px, so a child who isn't jumping never gets bonked by it.

Because the platform's position is a sine of level time, it moves slowest —
lingers longest — near the extremes of its swing, which is exactly where the
new reachable window sits. That gives a real slice of each 4-second cycle
where boarding is possible, not a single instant, without needing to touch
`dist` or `period`.

There is ample room to set up the attempt: the flat the lift sits on runs
from x=9090 to x=10150 (1060px), with checkpoint one at x=8750 just before
it.

## Validation before finalizing the numbers

`y: 530` is this spec's proposed number, arrived at from the arithmetic
above, but the arithmetic alone doesn't prove a real jump, timed against the
lift's real motion, actually connects — that requires simulating an
approach and a jump, the same gap the follow-up's original investigation
found by simulation rather than by eye.

The implementation plan includes a scratch verification step, in the style
of the livelier-level-one plan's Appendix: a throwaway script that drives
the ball to the lift and attempts a jump at a sweep of start delays across
one full 4-second period (e.g. every 0.1s, as other sweeps in this project
use), and reports how many of those attempts result in `ball.platform`
becoming the lift. If `y: 530` gives too few successes to be practically
findable by a child (not zero — a nonzero-but-vanishingly-rare window would
still fail the spirit of "he can catch it"), the plan adjusts the anchor
using the same script rather than guessing again. The script is deleted
after use, matching this project's rule against test-only code living in
the game.

## Permanent regression test

Once the sweep confirms a real window of success, add a committed case to
`games/pushkar-ball/tests/offline/finish.mjs`, which already models boarding
a moving platform (its `board`/`stage` state machine for `platforms[0]`, the
platform over the last gap). The new case drives the ball to the lift and
tries a jump at a sweep of start delays across one full period, exactly like
the scratch script, and asserts **at least one** of those attempts results in
`ball.platform` becoming the lift at some point during the run. This pins
the fix as a real regression guard: if a future edit raises the lift back out
of reach, this test fails loudly instead of the game silently regressing to
today's unreachable scenery.

This does not assert every start delay succeeds — the lift is still not
something the level requires, and a narrow-but-real window is an acceptable,
even appropriate, level of challenge for something optional. It only asserts
that reaching it is *possible*.

## Docs

- Update `platforms[1]`'s own comment in `levels.js` (currently "It cannot be
  boarded from the ground; see follow-up item 6...") to describe the new
  range and that it can now be boarded, dropping the reference to the
  now-resolved follow-up item.
- Mark item 6 done in `2026-09-11-followup-ideas.md`, pointing at this spec,
  and fix the "Where this fits" rollup sentence at the end of that file to
  include item 6 among the done items (the same class of leftover
  contradiction caught and fixed for item 8 in
  `2026-09-13-zero-hearts-checkpoint-reset-design.md`'s implementation).

## Out of scope

- No change to `platforms[0]` (the last-gap platform) or any other level's
  movers.
- No change to jump physics, `CONFIG.JUMP_V`, or `CONFIG.GRAVITY` — the fix
  is entirely in this one level's data.
- Items 3, 4, 5, and 7 from the follow-ups file are untouched.
