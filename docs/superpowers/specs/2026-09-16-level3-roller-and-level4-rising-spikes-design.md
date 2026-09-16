# Level 3 gets a roller, and level 4's spikes start rising

The user asked (Sep 16 2026) for two small difficulty additions to Pushkar
Ball: more enemies in level 3, and moving spikes in level 4. Both reuse
mechanics the game already has — no new enemy type, no new spike behaviour —
they only place existing ones differently.

## 1. Level 3: a roller joins its one walker

Level 3 currently borrows back a single walker from level 2, deliberately the
calmest of the three enemy types, because the level's own job (the crate
puzzle) is already enough to think about — see the comment above its
`enemies` list in `js/levels.js`.

This adds a roller too — level 2's real test, and the one level 4's own
comments call "the most active of the three enemies... the one that has to be
tracked and timed." It goes on the same flat the walker already patrols
(x=1500–3800, between the 220px and 260px gaps), spaced well clear of the
walker's own patrol (2395–2955), the same way level 4 keeps its roller 400–500
units clear of the nearest spike patch so a player is never asked to time two
things at once. Both enemies sit before checkpoint 1 (x=6260), so a costly run
against either only sets back that one stretch, and checkpoint 1 refills
hearts before anything harder.

The roller's exact patrol bounds (`from`, `to`, `dir`, start `x`) are worked
out during implementation by sweeping `finish.mjs`'s lead/start-delay matrix
against candidate placements, the same way level 3's walker and level 4's
roller were tuned — not guessed into place. The target, matching this
codebase's existing bar: no placement that loses all three hearts in a clean
run at the routes' default lead, and any hit-losing placement found by the
matrix should be rare and only at the sloppiest tested lead (0.7), consistent
with what level 3's walker and level 4's roller already tolerate.

No other change to level 3's geometry, checkpoints, or its existing walker.

## 2. Level 4: four of its five spike patches rise

Level 4 today teaches static spikes: the first four patches (x=700, 3400,
7200, 11100) are plain rehearsal-then-real-test patches at `SPIKE.H`; the
fifth, on the slab over the tunnel (x=13400), is a special "impassable, must
find another way" patch that never comes down — the subject of
`docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md`.

**The tunnel patch (x=13400) is unchanged.** Giving it a rise cycle on top of
"you cannot wait this one out, you must make a way" would blur two different
lessons into one obstacle, and the bypass mechanics (crate boost, breakable
planks) were tuned assuming it holds a fixed 180px height.

**The other four gain a rise cycle**, using the two named cycles the game
already has, ramped to match the level's own "rehearsal near spawn, real test
later" structure:

- x=700 and x=3400 (near spawn, before any checkpoint): `SPIKE.CYCLE_SLOW`
  (6s — the same cycle level 2 uses).
- x=7200 and x=11100 (after checkpoint 1, the level's real tests):
  `SPIKE.CYCLE_FAST` (3.5s — the same cycle level 3 uses).

No new config values. `config.js`'s comments on `CYCLE_SLOW`/`CYCLE_FAST`
(currently "level 2" / "level 3") get updated to note level 4 now uses both
too. Phase for each patch is worked out during implementation so patches
never rise in lockstep with each other by accident (a player should read each
as its own timing, not a repeating pattern across all four) — swept the same
way position and phase already are elsewhere in this game, not guessed.

### `finish.mjs` follows

`ROUTES[4]` (the tunnel route) and `crateRoute4` (the crate-bypass route,
which starts from checkpoint 2 — after the x=11100 patch) both currently drive
with the plain `runner`, which jumps any spike patch it sees but has no
concept of waiting. They switch to build on `waitForLow`, the same helper
levels 2 and 3's routes already use — it already generically finds "the
nearest rising patch ahead" from `level.spikes.filter(s => s.rise)`, so no new
waiting logic is needed, only wiring the existing helper into level 4's two
routes. Both routes get re-verified across the existing lead/delay matrix
(`LEADS` × `LATES` for the crate route; the standard lead sweep for the tunnel
route) to confirm they still finish cleanly with four more patches to time.

## Testing

- **`offline/enemies.mjs`** (or wherever level 3's enemy checks live today):
  extend for the new roller — alive on load, patrols within its bounds, not
  overlapping the existing walker's patrol or the level's spike patch, found
  by `enemyHit` like any other enemy.
- **`offline/finish.mjs`**: level 3's existing per-checkpoint and hit-cost
  sweep gets the roller added to what it must survive. Level 4's section
  (currently "3d. level four, both ways past its tall patch") gets its tunnel
  and crate routes re-run across the same matrices with the four new risers
  live, confirming both still finish cleanly; a new or extended check confirms
  the tunnel patch itself (x=13400) still reports a constant `SPIKE.H`/`RISE_H`
  behaviour unaffected by this change (no `rise` field, still impassable
  without a bypass).
- **`offline/spikes.mjs`** or `hazards.mjs` (wherever rise-height math is
  tested today): extend to cover level 4's four new risers' heights at chosen
  times, same shape as the existing level 2/3 checks.
- **Look at it** at 568×320 and 740×280: level 3's roller reads clearly next
  to the walker; level 4's four rising patches are visually distinct from the
  static tunnel patch (same picture, since one value drives both, but confirm
  nothing looks broken with four risers on screen at once during a full
  playthrough).

## Out of scope

The tunnel patch's own behaviour, bypass mechanics, or geometry. Any other
level. New enemy or spike types. Coins, stars, and the other deferred
sub-projects listed in the moving-spikes spec.
