# Pushkar Ball — follow-up ideas (not yet planned)

Captured 2026-09-11, right after Phase A (health system, enemies, the
level-2 curriculum reshuffle) shipped, from feedback on the deployed game.
Items 6–8 were added 2026-09-12 from measurements during the build, not
from feedback. **Unless an item below says otherwise, none of this is
brainstormed or spec'd yet.** Each item below needs its own design pass —
clarifying questions, 2-3 approaches, an approved design — before an
implementation plan gets written, the same process every other piece of
this game has gone through. This file exists only so the ideas aren't
lost before that happens. Nothing here should be implemented from this
file directly.

## 1. Enemies (and difficulty generally) should recur across levels — DONE

See `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md` —
scoped to levels 3 and 4 only (a walker recurs in level 3, a roller in level
4); level 5 and any further escalation stay a later design. Implemented by
`docs/superpowers/plans/2026-09-11-recurring-difficulty.md`.

As it stood after the Sep 2026 curriculum reshuffle, each idea was taught
once and dropped: level 2 was enemies, level 3 crates-only, level 4
spikes-only, and nothing from level 2 ever reappeared after it. Feedback:
later levels should keep bringing back earlier ideas — enemies included —
rather than retiring each one the moment the next level's new idea shows
up. The design pass settled how this sits with the "at most one new idea
per level" rule — recurrence of an already-taught idea was always allowed,
and the original design spec now says so — and left the curriculum table
and level 5's "combine everything" role for a later design.

## 2. Level 1 needs more obstacles — DONE

See `docs/superpowers/specs/2026-09-12-livelier-level-one-design.md`. Every
existing piece of level 1 stays put; a stone block and one small spike patch
(a named preview of level 4's idea) go in the unguarded first third, and a
third gap, a third crate and a two-step stone staircase in the middle third.
Implemented by `docs/superpowers/plans/2026-09-12-livelier-level-one.md`.

As it stood before that design, it read as sparse — two proven gaps and two
crates that nothing in the level actually needed (the crates were there "so
the mechanic is in a child's hands," per the level's own comment, not
because the level asked for them). It needed a design pass on what a
livelier level 1 looks like without breaking its job as the
rolling-and-jumping tutorial — it was still the first thing a player met,
so the existing "nothing here is hard, and difficulty rises one level at
a time" rule applied in full.

## 3. Ground/hill height should come down roughly 20% — DONE

Screenshot feedback showed the live game reading as very flat, with one
small hill and a long flat horizon. Turned out to be a camera framing
question, not a level-data one: measured against real screen sizes,
`CONFIG.CAMERA.GROUND_AT` was already overridden by the button-clearance
floor on every phone size this project checks, and only mattered on
roomy windows — which is where the flatness was actually being seen.
Lowered from 0.73 to 0.60. See
`docs/superpowers/specs/2026-09-13-lower-horizon-design.md` and
`docs/superpowers/plans/2026-09-13-lower-horizon.md`.

## 4. "Must jump to proceed" gates — DONE

No existing jump physics could make a taller wall a real gate — `JUMP_V`
is a fixed impulse, unaffected by how fast the ball is rolling, so every
jump in this game already tops out at the same 131px. Answering this
properly meant a new mechanic: a bounce pad, launching the ball on contact
with no button press needed, and a new level 5 to give it a home under the
game's own one-new-idea-per-level rule. See
`docs/superpowers/specs/2026-09-13-bounce-pad-and-level-five-design.md` and
`docs/superpowers/plans/2026-09-13-bounce-pad-and-level-five.md`.

## 5. A bounce/pop effect when stomping an enemy — DONE

Confirmed the original phase-3 design's particle system
(`js/effects.js`, planned for "particles") was never built — not for
this, not for the deflate animation's own planned "soft puff," which is
still a separate, older, un-fixed gap. This is the game's first particle
effect. A stomp now gives the ball an automatic upward hop
(`CONFIG.ENEMY.STOMP_BOUNCE`) and scatters six small triangles — the same
shape a walker or roller's spiky ring is already drawn with — at fixed,
evenly-spaced angles, fading out after `CONFIG.ENEMY.POP.LIFE` seconds.
See `docs/superpowers/specs/2026-09-13-stomp-pop-design.md` and
`docs/superpowers/plans/2026-09-13-stomp-pop.md`.

## 6. Level 1's lift cannot be boarded — DONE

Found during the livelier-level-one work, Sep 2026, and older than it. The
vertical lift at x=9700, over level 1's flat between the second and third
gaps, never brings its top lower than y=590, and a jump from the flat at
y=760 brings the ball's centre to about 610 and its bottom to about 630. So
the ball's bottom never gets above the lift's top, and near the bottom of
the lift's travel the ball bumps its underside. A sweep of take-off points
and jump times across its whole 4-second cycle found no boarding at all.
Nothing needs the lift, so nothing is broken, but he can see a moving
platform he can never ride.

Kept as scenery, on purpose, after simulation (not just arithmetic) showed
why lowering it doesn't have a good answer: it only becomes reachable once
its low point passes y≈710, and at that depth its underside sweeps down
through a *standing* ball's head (y=720) twice a cycle, visibly jittering a
child who isn't even jumping. Shrinking the platform makes the needed depth
worse, not better. See
`docs/superpowers/specs/2026-09-13-lift-boarding-design.md`.

## 7. What a walker or a roller costs a late jumper — DONE

See `docs/superpowers/specs/2026-09-13-late-jumper-cost-design.md`. Decided:
accept as-is, no mechanic change, no test change. The worst case is bounded
by the same soft-fail (return to last checkpoint, or the level's spawn per
item 8) a bad fall already causes, and `finish.mjs`'s ten-delay sample never
claimed to bound this cost in the first place — widening it to sweep an
enemy's whole cycle would only re-confirm a cost already measured and
accepted, not catch a regression it would otherwise miss.

Measured while planning the livelier-level-one work, Sep 2026, and during the
recurring-difficulty work before it. Over a walker's whole cycle (start
delays 0–4.6s every 0.1s), a late jump — finish.mjs's lead 0.7 — loses two or
all three hearts on about 6–11 of 47 arrivals, for every shipped walker
(level 2's walker one 11, its walker two 8, level 3's walker 6). Over level
4's roller's whole ~23s patrol, lead 0.7 loses the whole run on 72 of 229;
level 2's roller does no better. Losing all three hearts always sends the
ball back to the level's start, and a checkpoint cannot soften that.
finish.mjs's ten start delays sample only a few phases and never see most of
this.

## 8. Losing every heart resets the ball's start but not its checkpoint — DONE

When the ball runs out of hearts it goes back to the level's spawn with
hearts refilled (`player.js`), but its respawn home used to stay at the last
checkpoint it took, so the next fall anywhere put it back at that checkpoint
instead of the spawn. See
`docs/superpowers/specs/2026-09-13-zero-hearts-checkpoint-reset-design.md` —
`respawn()` now resets `home` to spawn and un-takes every checkpoint on a
zero-hearts fail, so the setback holds until a checkpoint is earned again.
Implemented by
`docs/superpowers/plans/2026-09-13-zero-hearts-checkpoint-reset.md`.

## Where this fits

None of the items above conflicts with anything already shipped in Phase A.
All eight items are done.
Item 1 settled the one question that could have reshaped the others — an
idea already taught may recur in any later level — and item 2 added one
named exception to the one-new-idea rule, level 1's spike patch, which is
level 1's alone. Phase B (saws, conveyors, crushers, ice/sticky surfaces, the
toy-factory theme) from
`docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md` is
still separately queued and unrelated to this list.
