# What a walker or a roller costs a late jumper — design decision

Closes follow-up item 7 in `docs/superpowers/specs/2026-09-11-followup-ideas.md`.
This is a decision record, not an implementation: nothing in the mechanic or
the test suite changes.

## The question

Item 7 measured that a single late jump (finish.mjs's lead 0.7) into a walker
or roller can, on some fraction of arrival timings across the enemy's full
cycle, cost 2 or all 3 hearts in one encounter — around 6-11 of 47 sampled
arrivals per walker, and 72 of 229 for level 4's roller. The mechanism: a side
hit knocks the ball away (`CONFIG.HEALTH.KNOCKBACK` / `KNOCKBACK_UP`) for only
`IFRAME` (0.5s) of invincibility, and on some approach angles that isn't
enough clearance before the ball comes back down into the same enemy, so one
bad jump can chain into two or three hits before the ball is clear.

Open question: should an enemy be able to cost a late jumper that much, and
should `finish.mjs`'s ten-delay sample (which only sees a few phases of a
walker's ~4.6s cycle and a small slice of a roller's ~23s patrol) be widened
to catch this reliably?

## Decision: accept as-is, no mechanic change, no test change

**The consequence is already bounded by mechanics this game already has.**
Losing all three hearts sends the ball back to its last checkpoint, or (since
item 8) all the way to the level's own spawn if that was the run's first
checkpoint. That is the same soft-fail the game already uses for a bad fall —
item 7 doesn't introduce a new failure mode, it's the existing one triggered
by a different hazard. Nothing is lost permanently and nothing needs outside
intervention to recover.

**A late jump is bad input against a moving hazard, and some cost for that is
the point of a walker or a roller existing at all.** A mistimed jump costing
more than a graze is consistent with what enemies are for in this curriculum
— they are the first hazard that moves, and a jump timed against something
moving can be wrong in a way a static spike patch can't. 2-3 hearts is the
worst case, not the typical one, and it is bounded: it can never cost more
than a full reset.

**`finish.mjs` isn't silently missing this** — it already proves every level
finishes cleanly at lead 0.7 across its ten sampled delays, at every
checkpoint, for every level. It has never claimed to bound "how many hearts a
worse-than-sampled delay can cost," and widening it to sweep a roller's whole
~23s patrol (or a walker's whole cycle) would only re-confirm a cost that is
already measured, understood by hand, and being accepted here — not catch a
regression the current suite would otherwise miss silently. Given the
decision is to accept the cost, that sweep would be maintenance weight with
no failure mode left for it to catch.

**Scope note:** this decision covers the walkers and roller shipped as of
this doc (level 2's two walkers, level 3's walker, level 2 and level 4's
rollers). A future enemy placement that makes the *typical* case (not just a
sampled worst case) cost a full run would be a new, separate problem — this
decision does not pre-approve that.

## What changes

Nothing in code. `docs/superpowers/specs/2026-09-11-followup-ideas.md` item 7
is marked DONE, pointing here.
