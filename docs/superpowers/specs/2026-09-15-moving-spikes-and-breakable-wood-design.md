# Moving spikes and breakable wood (levels 2, 3, 4) — DONE

> **Shipped Sep 15 2026**, implemented by
> `docs/superpowers/plans/2026-09-15-moving-spikes-and-breakable-wood.md`.
> What changed from this spec on the way:
>
> - Simulation before planning put level 4's tall patch on a 20px stone slab
>   over a 60px tunnel, rather than at `RISE_H` on the ground — the tunnel
>   needs a roof.
> - "Spikes stop crates" was dropped: the planks and the slab's face stop the
>   crate before it can reach any spike.
> - Level 4's tunnel route gets the usual 30-way matrix as route 4; the crate
>   route instead runs 9 ways (lead × an early, on-time or late second press)
>   and may take no hit.
> - Cycles are 6s (`CYCLE_SLOW`, level 2) and 3.5s (`CYCLE_FAST`, level 3).
> - Review lowered level 4's teeth from 100 to 80, so the jump off the flush
>   crate — the only way over once the crate is flush — forgives a late press.
> - Review tightened the finish routes' "low enough" threshold (`LOW_OK`)
>   from 90 to 75, after 90 let a sloppy jump meet a patch still sinking.
> - Review added `BREAKABLE.KNOCK` (60), so leaning on planks does not keep
>   rattling them.

First sub-project of "make Pushkar Ball interesting" (Sep 2026). The user's
judgement after playing levels 1–7: the game reads as made for a 4-year-old —
no interesting logical mechanisms, no coin challenges, no other challenges.
That is several projects, decomposed as:

1. **Moving spikes + breakable wood** — this spec.
2. Coins and stars — collectibles in every level, some behind puzzles; stars
   for all coins, no hearts lost, fast finish. Not yet brainstormed.
3. Multi-step logic puzzles combining existing mechanics, plus keys/locks and
   timed switches. Not yet brainstormed.
4. A difficulty pass over levels 1–7. Not yet brainstormed.

Each gets its own spec → plan → implementation.

## 1. Rising spikes (levels 2 and 3)

A spike patch may carry an optional rise cycle. Its height oscillates between
`SPIKE.H` (26 — today's jumpable patch) and a new `SPIKE.RISE_H` (~180, well
past the 131px an unaided jump reaches). At the top of the cycle no jump
clears it and the player must wait; at the bottom it is crossed with an
ordinary jump.

- **Driven by a sine of level time**, exactly like `makeMover`: deterministic,
  identical on every attempt, and a test can ask the height at time *t*
  without running the game. Height = `H + (RISE_H - H) · (1 + sin a) / 2`,
  with `a = (t / period + phase) · 2π`. The sine dwells at both ends, which
  gives a readable "it's up — it's down" rhythm.
- **One value drives both the picture and the hit box.** `spikeBox` and
  `drawSpikes` in `hazards.js` read a per-patch `s.h`, defaulting to
  `SPIKE.H` when absent. Every existing static patch (levels 1, 4, 5) is
  therefore unchanged. The teeth are drawn `s.h` tall, so the spikes visibly
  grow as they rise — the user's ask — and cannot drift from what they hit.
- **Level data:** `{ x, y, w, rise: { period, phase } }`. Two named periods in
  config: `SPIKE.CYCLE_SLOW` (level 2) and `SPIKE.CYCLE_FAST` (level 3). Exact
  seconds are tuned against `finish.mjs`, not guessed into place.
- **`hazards.js` stays DOM-free in its logic**, and `levels.js` stays DOM-free
  entirely, so the offline suites test the real arithmetic.
- **Placement:** one new patch in level 2 (slow), one in level 3 (fast; the
  level currently has none). Positions are worked out on paper against each
  level's existing geometry during planning, clear of checkpoints, gaps and
  other timing so there is never two things to time at once.

## 2. Level 4: an impassable patch with two ways past

Level 4 keeps its original teaching patch exactly as it is. Further along it
gains a **second** patch authored at `RISE_H` with no cycle: waiting never
helps. The lesson is different from levels 2/3 — sometimes you have to make a
way, not time one. There are two ways, and either one finishes the level.

**Spikes stop crates.** Today spikes are not solid and a crate would slide
over them, making the crate a bridge and the puzzle nothing. A crate is
stopped at the edge of any patch taller than `SPIKE.H` (tall patches only, so
no existing level changes). The ball is still never stopped by spikes — it is
hit by them.

### Bypass A — crate boost

A pushable crate (as in levels 3 and 6) sits before the patch. Push it flush
against the spikes, climb on, jump from its top over them.

The arithmetic is tight and must be proven by simulation, not trusted: from a
100px crate a jump's underside peaks near 231px, leaving ~50px over a 180px
patch, and the ball starts with little speed on a 100px crate top. So the
patch is narrow (~100–120px) and `RISE_H` may drop to ~160 if the simulation
says so. `RISE_H` must stay above an unaided jump's reach with real margin;
that bound is asserted in a test.

### Bypass B — breakable wood

The tall patch sits on a low stone mound with a tunnel through it. The
tunnel's mouth is boarded with planks. Break them and roll underneath the
spikes.

- **Breaks on a fast hit only**: ball speed into the planks above
  `BREAKABLE.SPEED` (~300px/s; the ball's max is 420). A long flat run-up
  precedes it. A slow bump makes the boards wobble and show a crack, so the
  player learns "harder" with no text. Breaking on any touch would make it a
  door, not a challenge.
- **Engine:** a box whose segments exist until it breaks, then never again —
  the same shape as a gate rebuilding its segments each tick. Everything solid
  is still a line segment. Breaking costs no heart.
- **Picture:** a row of vertical boards with dark gaps, clearly unlike a
  crate's solid box, in the wood palette. Breaking plays the enemy-defeat pop
  (flying triangles), tinted wood.
- **Persistence:** broken stays broken for the rest of that play of the
  level, including across a respawn. Re-breaking after every fall would
  punish failure.
- **Level data:** `breakables: [{ x, y, w, h }]`.

### The wood rule changes

The user's rule was "wood means you can push it; stone means you cannot. No
exceptions, ever." Agreed Sep 15 2026, it becomes **"wood gives way; stone
never does"**: a crate gives way by sliding, planks by breaking. CLAUDE.md
and `games/pushkar-ball/README.md` are updated with this spec's
implementation, not before.

## Testing

- **`spikes` (offline, new or extending `hazards`):** height at chosen times
  matches the formula; static patches report `SPIKE.H`; the hit box follows
  the height; an unaided jump provably cannot clear `RISE_H`; a crate stops
  at a tall patch and not at a short one; every value stays finite.
- **`breakables` (offline, new):** a slow roll does not break it; a fast roll
  does; after breaking, the ball passes; broken stays broken after a respawn.
- **`finish`:** level 2 and 3's runner routes learn to wait for a low window.
  Level 4 gets two routes — crate boost and tunnel — each finishing across
  the usual 30-way matrix, plus negative cases: no crate and no break cannot
  cross; a slow approach to the planks does not break them.
- **Look at it** at 568×320 and 740×280: the rising teeth, the crack, the
  break, the tunnel exit.

## Out of scope

Coins, stars, keys, timed switches, the difficulty pass — see the list at the
top. No change to levels 1, 5, 6, 7.
