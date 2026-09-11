# Pushkar Ball — follow-up ideas (not yet planned)

Captured 2026-09-11, right after Phase A (health system, enemies, the
level-2 curriculum reshuffle) shipped, from feedback on the deployed game.
**None of this is brainstormed or spec'd yet.** Each item below needs its
own design pass — clarifying questions, 2-3 approaches, an approved design —
before an implementation plan gets written, the same process every other
piece of this game has gone through. This file exists only so the ideas
aren't lost before that happens. Nothing here should be implemented from
this file directly.

## 1. Enemies (and difficulty generally) should recur across levels

The Sep 2026 curriculum reshuffle teaches each idea once and moves on:
level 2 is enemies, level 3 is crates-only, level 4 is spikes-only, and
nothing from level 2 ever reappears after it. Feedback: later levels should
keep bringing back earlier ideas — enemies included — rather than retiring
each one the moment the next level's new idea shows up. Needs a design pass
on how this interacts with the existing "at most one new idea per level"
rule (`CLAUDE.md` and the original design spec) — recurrence of an
already-taught idea is presumably fine under that rule since it isn't a NEW
idea, but the curriculum table and level 5's "combine everything" role
likely need rethinking together with this.

## 2. Level 1 needs more obstacles

Read as sparse right now — two proven gaps and two crates that nothing in
the level actually needs (the crates are there "so the mechanic is in a
child's hands," per the level's own comment, not because the level asks for
them). Needs a design pass on what a livelier level 1 looks like without
breaking its job as the rolling-and-jumping tutorial — it's still the first
thing a player meets, so the existing "nothing here is hard, and difficulty
rises one level at a time" rule still applies in full.

## 3. Ground/hill height should come down roughly 20%

Screenshot feedback showed the live game reading as very flat, with one
small hill and a long flat horizon. Before implementing, this needs one
clarifying question the request doesn't yet answer: does "20% less high"
mean the height of hill ELEVATION CHANGES specifically (the 600-vs-760-style
numbers already in the ground data), or how much of the vertical screen the
ground fill occupies (which is a camera/`CONFIG.CAMERA.GROUND_AT` question,
not a level-data question)? Those are different systems and the fix differs
depending on which one the complaint is actually about.

## 4. "Must jump to proceed" gates

Currently every gap can, in principle, be walked around or is simply the
only way forward incidentally (the ball can't cross a gap without jumping,
but nothing in the level design deliberately calls attention to "this is a
jump-only gate," the way level 1's final platform-only ledge already sort of
does). Feedback wants more deliberate moments where progress explicitly
requires a jump — needs a design pass on what distinguishes this from "a gap
is already jump-only" and what new geometry shape (a wall too tall to reach
without a running jump plus a boost? a ledge with no ramp?) would express it
clearly to a 12-year-old without needing text to explain it.

## 5. A bounce/pop effect when stomping an enemy

Today `Level.stompEnemy()` (`games/pushkar-ball/js/levels.js`) just sets the
enemy's `alive` to `false` with no additional feedback — the enemy vanishes
on the next frame's `drawEnemies` pass with nothing marking the moment.
Feedback wants a small bounce, likely both a visual pop/particle-style
effect and a physical upward bump to the ball's `vy` (similar in spirit to
`CONFIG.HEALTH.KNOCKBACK_UP` for a hit, but a reward this time rather than a
setback) so a stomp reads as satisfying, not just silent removal. Worth
checking against the original phase-3 design language ("pops into a few
triangles when bounced on") for whether a particle-style pop was already
half-designed and just never built.

## Where this fits

None of the five above conflicts with anything already shipped in Phase A.
Item 1 has the widest blast radius — it touches the curriculum table and
possibly level 5's role — so it's worth resolving first if these are
tackled in order, since it may change what "more obstacles in level 1" or
"enemies recurring" concretely means for the levels that follow. Phase B
(saws, conveyors, crushers, launchers, ice/sticky surfaces, the toy-factory
theme) from `docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md`
is still separately queued and unrelated to this list.
