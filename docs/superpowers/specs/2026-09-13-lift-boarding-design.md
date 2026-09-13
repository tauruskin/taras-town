# Pushkar Ball — level 1's lift stays unreachable, on purpose

Follow-up item 6 from `docs/superpowers/specs/2026-09-11-followup-ideas.md`.
Brainstormed 2026-09-13; the first design this file recorded that day turned
out to be wrong once actually simulated, and is superseded by the finding
below.

## The problem

Level 1's vertical lift (`games/pushkar-ball/js/levels.js`, `platforms[1]`,
`{ x: 9700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 }`)
sits over the flat between the second and third gaps. Its top surface
oscillates between y=350 and y=590. Nothing in the level needs it — it exists
to exercise a vertical mover in play, per its own comment — but a player can
see it and has no way to ever stand on it.

## What was tried, and why it doesn't work

The first pass at this spec reasoned from arithmetic alone: a jump's peak
height is `760²/(2·2200) ≈ 131px` (`CONFIG.JUMP_V`, `CONFIG.GRAVITY`), so on
the flat (ground y=760, `CONFIG.BALL.R = 20`) the ball's bottom reaches as
high as y=629 at the top of a jump. Since the lift's lowest reach (590) is
39px short of that, the reasoning went, lowering the lift's low point past
629 should make it catchable — and a modest shift (to y=530, low point 650)
looked like it gave a comfortable 21px of margin.

That arithmetic answers the wrong question. Actually simulating an approach
and jump (a scratch script driving the real `Ball` and `Level` against a
patched copy of the lift, sweeping start delays across the platform's whole
4-second period, the same method the original follow-up's own investigation
used) showed **zero boardings** at that setting, and in fact at every low
point up to 705. A ball rising from the ground into the lift's *underside*
is simply blocked there — it cannot pass through to end up "above" the
platform, so no amount of clever timing lets a jump starting from the ground
catch it that way. Landing only ever happened once the low point was pushed
to **y≈710 or deeper** — verified by a binary search between 705 (never
boards) and 710 (boards from most tested delays).

That depth creates a new, worse problem. A ball just *standing* under the
lift, never jumping, has its head at y=720 (resting-centre 740 minus
`BALL.R` 20). At a low point of 710, the lift's underside (710+28=738)
sweeps down through the standing ball's head twice a cycle. Traced
frame-by-frame, the ball gets shoved down 15–18px and snapped back by the
ground's own resolution almost immediately, repeating for roughly 0.3–0.4s —
a visible flicker, not a clean landing. Shrinking the platform's height (to
recover the standing-clearance margin) makes the reachability threshold
*worse*, not better (a 10px-tall platform needs a low point past 725, an
even deeper intrusion), so that isn't a way out either.

The conclusion, checked rather than assumed: for this lift's actual physics
(this jump height, this platform thickness, over flat open ground with no
ledge to jump from), **no low point is simultaneously jump-reachable and
safe from disturbing a ball standing beneath it.** It is not a tuning
problem to solve with a different number; the two requirements are in
direct conflict.

## The decision

Leave the lift's numbers exactly as authored, and document — in the game's
own code, not only here — that it is deliberately unreachable background
motion: a moving platform exercised by play (and by the offline suite, which
already asserts the game's vertical-mover math generally) without needing to
be a mechanic in its own right. This was the alternative the first pass at
this spec considered and rejected on the grounds that "there's no
player-facing reason for a moving platform he can watch but never touch" —
that reasoning wasn't wrong, but it's now outweighed by the concrete finding
above: the only way to make it touchable makes it worse (a standing ball
gets visibly jittered) rather than better.

## The fix

None, to the level data or the engine. `platforms[1]` in
`games/pushkar-ball/js/levels.js` keeps `y: 470`, `dist: 120`, and every
other field unchanged.

## Docs

- Rewrite `platforms[1]`'s own comment in `levels.js` to say plainly that it
  is deliberately unreachable — a background element, not a mechanic — and
  why (the standing-ball jitter finding above), replacing the old comment's
  forward reference to follow-up item 6 as still-open.
- Mark item 6 done in `2026-09-11-followup-ideas.md`, replacing its body with
  the outcome (kept as scenery, with the reason) and pointing at this spec.
- Fix the "Where this fits" rollup sentence at the end of that file to
  include item 6 among the done items — the same class of leftover
  contradiction caught and fixed for item 8 in
  `2026-09-13-zero-hearts-checkpoint-reset-design.md`'s implementation.

No test changes: nothing about the game's behavior changes, so there is
nothing new to pin. The scratch scripts used to reach this conclusion are
not part of the repo and are not referenced by path, per this project's rule
against test-only code and session-specific scratch paths living in specs.

## Out of scope

- No change to `platforms[0]` (the last-gap platform) or any other level's
  movers.
- No change to jump physics, `CONFIG.JUMP_V`, `CONFIG.GRAVITY`, or
  `CONFIG.BALL.R`.
- Items 3, 4, 5, and 7 from the follow-ups file are untouched.
