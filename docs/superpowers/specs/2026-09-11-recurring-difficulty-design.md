# Pushkar Ball — recurring difficulty in levels three and four

## Why

Feedback after Phase A shipped (`docs/superpowers/specs/2026-09-11-followup-ideas.md`,
item 1): the Sep 2026 curriculum reshuffle teaches each idea once and moves
on — level 2 is enemies, level 3 is crates-only, level 4 is spikes-only, and
nothing from level 2 ever reappears after it. A game that retires an idea the
moment the next level's new idea shows up reads as a checklist, not a
curriculum that's actually building on itself.

This is a small, scoped fix, not a redesign: the original design spec's own
rule already permits it, once read carefully.

## The rule this hangs on

`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`, "Difficulty:
rising, and never harsh," says:

> **Every level introduces at most one new idea**, and introduces it
> somewhere safe... before it is ever asked for somewhere that matters.

This restricts *new* ideas. It has never forbidden a level from also
featuring something already taught — that reading was never written down,
and levels 3 and 4 shipped single-idea-only mostly by omission, not by
design intent. This spec amends that rule with one clarifying sentence (see
"Changes to existing docs" below) so the ambiguity doesn't recur the next
time a level gets built.

## Scope

In scope:

- Level 3 (crates) gains one recurring enemy encounter: a **walker**.
- Level 4 (spikes) gains one recurring enemy encounter: a **roller**.
- One clarifying sentence added to the original design spec's "at most one
  new idea" rule.

Out of scope, deliberately:

- Level 5. It doesn't exist yet, and inventing its "combine everything" role
  is a separate, later design — this spec does not touch it.
- Any change to level 1 or level 2. Item 2 of the follow-up-ideas list
  (level 1 needs more content) is its own future design pass.
- Any change to `finish.mjs`'s route/runner architecture. The generic
  `runner()` already jumps over any alive enemy in a level, regardless of
  which level it's in — adding one more enemy to level 3 or 4 needs no new
  test-driving logic, only re-proving completability the way every level
  content change already does.
- New checkpoints. Neither level gains a third checkpoint; see "Placement
  and checkpoints" below for why none is needed.

## Why a walker for level 3, a roller for level 4

The three enemy types differ in how much attention they demand: a walker is
pure back-and-forth with no projectile and no active physics chase — the
calmest of the three. A roller is the one that asks the player to actively
track and time around something moving under real physics — closer to what
level 2 treated as its "real test" enemy.

Level 3's own job is the crate puzzle (push a crate under a ledge, jump off
it) — that's already a problem-solving demand, so its recurring enemy should
add presence without adding cognitive load: a walker. Level 4 is later and
its own job (spike-timing) is already about precision, so — matching
"difficulty rises" — it can afford the more active roller as its recurring
enemy, provided it never asks for spike-timing and roller-timing at the same
instant (see below).

Neither level gets a second enemy or a second recurring idea. This is
deliberately the "one light touch each" version of the request, not an
escalating one — see the design's own approval note if this changes later.

## Placement and checkpoints

Both recurring enemies go on a flat, already-easy stretch of their level —
clear of every gap, every spike patch (level 4), and the crate puzzle
(level 3) — so nothing ever asks for precise timing on two things at once,
per the existing "no level requires precise timing on more than one thing at
once" rule. Exact coordinates are implementation-plan detail, not pinned
here, the same way the level-2 reshuffle spec named *which* stretch got
*which* enemy without pre-computing pixel positions — that's tuned against
`finish.mjs` during implementation, not guessable in advance.

Neither enemy needs a new checkpoint. The "unguarded first appearance" rule
exists specifically for a level's *own new idea* — a walker or roller here
is not new, the player has already met and can already handle it from level
2, so it doesn't need the same protection a first encounter gets. Both
levels keep their existing two checkpoints, unmoved, unless implementation
finds a specific reason one needs to shift slightly (in which case that's
the same kind of ordinary iteration the level-2 reshuffle plan already
documented and expects).

## Testing

- `tests/offline/levels.mjs`'s existing enemy authoring-safety checks
  (patrol/position stays in bounds, nothing overlaps the spawn or a
  checkpoint) already run against every level with an `enemies` array —
  levels 3 and 4 get this coverage automatically once they have one.
- `tests/offline/finish.mjs` re-proves both levels completable, 30 ways
  each, the same as every level already gets. No route/runner changes are
  needed (see Scope).
- No new test *files* or *mechanisms* are needed — this spec only asks
  existing, already-built machinery to run against two more levels.

## Changes to existing docs

`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`, "Difficulty:
rising, and never harsh" — add one clarifying sentence directly after the
"at most one new idea" bullet:

> This restricts what's *new*, not what's *present* — a level may, and later
> ones generally should, also feature an idea already taught in an earlier
> level, so long as it doesn't ask for precise timing on it at the same
> moment as anything else (see the next rule). The "somewhere safe" clause
> below applies only to an idea's first appearance anywhere in the game, not
> to every level that later reuses it.

## Risks

- **"Clear of everything" placement is easy to state and requires real care
  to get right** in two already-shipped, already-tuned levels — the same
  category of risk the level-2 reshuffle plan already flagged and handled
  (checkpoint-vs-obstacle interactions are the class of bug `finish.mjs` has
  caught here twice already). Budget the same iteration time.
- **This is intentionally the first, smallest step of item 1's broader
  ask.** If "one light touch each" reads as too little once it's live, the
  escalating alternative (a couple of touches each, ideas recombining) is
  still available as a follow-up — this spec doesn't foreclose it, it just
  isn't attempting it yet.
