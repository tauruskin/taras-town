# Pushkar Ball — a livelier level one

## Why

Feedback after Phase A shipped (`docs/superpowers/specs/2026-09-11-followup-ideas.md`,
item 2): level one reads as sparse. It is 16,800 units long and only four
things in it ask anything of the player — two gaps, a moving platform to the
last ledge, and the jump onto that ledge. Two crates and a lift are present but
nothing in the level needs them. The rest is hills, bowls and long empty flats.

Level one is still the first thing anyone meets, so "nothing here is hard, and
difficulty rises one level at a time" applies in full. This is a density fix,
not a harder level.

## Decisions

Settled during brainstorming, 2026-09-12:

- **Vocabulary: rolling and jumping, plus one preview.** Everything added is
  level one's own idea — hops, steps, gaps, crates — except for a single small
  spike patch, as a first look at what level four teaches properly.
- **The preview is one spike patch.** A walker was chosen first and dropped
  during planning, when measurement showed it could not keep this spec's own
  promise — see "Why not a walker" below.
- **Density: fill most flats.** Most of the long empty flats get something to
  do. The first flat after spawn and the last flat before the final platform
  stay clear.
- **Approach: keep the skeleton and add to it.** Every existing piece of level
  one stays exactly where it is. Re-laying the level from scratch and
  shortening it instead of filling it were both considered and rejected: the
  first moves geometry four browser suites and `finish.mjs` rely on, the second
  goes against the deliberate decision that a round should be 60–100 seconds
  long and adds nothing to do.

## Why not a walker

The first version of this spec previewed a walker and said the worst it could
do was cost one heart. Measured while planning, over a walker's whole cycle
(start delays 0–4.6s every 0.1s, five leads), a late jumper at lead 0.7 loses
two or all three hearts on 7 of 47 arrivals at x=5400 with the amplitudes that
suit that flat (250 or 300; 11 or more of 47 at 200 or below). That is not a
property of this level: the shipped
walkers do the same (level two's walker one loses two or three on 11 of 47,
level three's walker on 6). A walker is a sine of level time, so moving it
only changes which of `finish.mjs`'s ten start delays happen to land on a bad
phase — the matrix passing at some x and failing 100 units away is sampling
luck, not a safe region.

Losing all three hearts always sends the ball back to the level's spawn, and a
checkpoint cannot soften that. On hill one's plateau, near the spawn, it was
much worse — 16 to 26 of 47 — because the ball arrives off a slope.

A 70-wide spike patch at the same spot cost **no heart at all**, at every lead
and every start delay. It does not move, so every run meets it the same way.

## The principle the placement follows

The first ~8,700 units of level one have no checkpoint, and falling there, or
running out of hearts, sends the ball back to spawn. So:

- **The unguarded first third gets only pieces that cannot be failed by a
  fall** — a stone block and the spike patch. The spike patch may cost a heart
  per touch but never a fall, and the runner in `finish.mjs` never loses one to
  it.
- **The one new gap goes after checkpoint one**, where a miss costs a heart
  and a short trip back to 8750. As anywhere, a third heart lost since that
  flag goes back to the start: every fall spends a heart, and a checkpoint
  refills them only the first time it is taken.
- **Crates stay away from gaps and from the spike patch.** A crate pushed into
  a gap returns to where the level put it, but that is still confusing to
  watch; and `levels.mjs` forbids a crate overlapping a spike patch where the
  level puts it. The third crate can be shoved back into the second bowl,
  where it rests on a slope; that is not a trap, since the ball can still
  jump past it.
- **Steps are stone boxes, not ground.** A vertical riser in a ground polyline
  has its solid side facing sideways and fails the `levels` suite, which
  requires every polyline segment's normal to point up. Level three's ledge
  face is built the same way for the same reason. Stone also reads correctly:
  "stone means you cannot push it".
- **No step is more than 60 units above what the ball stands on.** A jump lifts
  the ball's centre 131 units (`JUMP_V` 760, `GRAVITY` 2200), so every step
  leaves more than twice the height needed.
- **Nothing is placed so two things need timing at once** (the original spec's
  second difficulty rule). The spike patch sits 950 units past the stone block
  and 930 short of the foot of hill two.

## What goes where

Existing pieces in plain text, new ones in bold. Every new coordinate below was
tried while this spec was revised: the offline suites pass with them and the
hearts check in the plan finds no heart lost anywhere in the level.

| Stretch | Now | Added |
|---|---|---|
| **First third — spawn to checkpoint one (8750), unguarded** | | |
| 40–1100, the flat after spawn | empty; the `roll` suite measures friction here | nothing — stays clear |
| hill one, flat, crate at 2450, gap 2950–3150, bowl | as is | nothing |
| 4000–6400 flat | empty | **a stone block, 200 wide and 60 tall, at 4250–4450 — hop up, roll across, drop off. Then a spike patch, 70 wide, at 5400–5470** |
| hill two, flat, crate at 8300 | as is | nothing |
| **Middle third — checkpoint one to checkpoint two (13750)** | | |
| gap 8850–9090, flat with the lift at 9700 | as is | **one extra gap, 200 wide (a width already proven), at 10150–10350, before the second bowl** |
| 11450–13800 flat | empty | **a crate, 100 by 100, at 11800; a two-step stone staircase at 12500–12900: a 400-wide step 60 tall, with a 200-wide step 60 taller on its middle** |
| **Last third — checkpoint two to the goal** | | |
| hill three, flat 15550–16200, platform, last ledge | as is | nothing — the last flat is the breather before the platform |

The new gap splits the third ground polyline in two. Both halves are still
authored left to right.

### What must not move

These are pinned by tests or by earlier decisions and stay exactly as they are:

- The flat after spawn, clear of everything (`roll` measures friction on it;
  `jump` reads its end from `LEVELS[0].ground[0]`).
- The first gap, 2950–3150 (`deflate` reads it from the data; `finish.mjs`'s
  hearts-to-zero check plays up to checkpoint one across it).
- The ground edge at 16200 before the last gap, which `finish.mjs` hardcodes.
- Both checkpoints, 8750 and 13750, and both platforms. `platforms[0]` stays
  the last-gap platform, since `finish.mjs` reads `level.movers[0]`.
- `bounds`, `spawn` and `goal`.

## The preview, as a rule

The original design spec (`2026-09-08-pushkar-ball-design.md`, "Difficulty:
rising, and never harsh") says every level introduces at most one new idea.
With a spike patch in it, level one introduces two: rolling and jumping, and a
first spike. This is a **named, narrow exception**, not a reading of the rule:

- It is **level one's one spike patch alone**. It is not a precedent. A future
  level that wants to preview a later idea needs its own named decision.
- It holds because level four still teaches spikes properly: wider patches, a
  patch that only a checkpoint protects, and one on high ground met from the
  top of a ramp. Level one's is a single narrow patch on open, flat ground.
  Level four's first two patches become a second and third meeting rather
  than a first.
- It keeps the rule's "somewhere safe" clause: this becomes the spike's first
  appearance anywhere in the game, on flat open ground, where it costs at most
  a heart and never a fall.

The content boundaries are unchanged. It is the same steel patch level four
already ships.

## Changes to existing code comments and docs

- **`2026-09-08-pushkar-ball-design.md`**, under "at most one new idea": one
  added sentence recording level one's spike patch as the named exception,
  pointing here.
- **`2026-09-10-health-enemies-curriculum-design.md`**, the curriculum table:
  level one stays "rolling & jumping", with a note under the table that it
  also previews one spike patch, pointing here.
- **`levels.js`, level four's comments**: its header says everything under it
  has already been met, and its ground comment calls the patch near spawn the
  first time a spike is ever met. Both change to say a spike has been glimpsed
  once, in level one, and that level four is where they are taught.
- **`levels.js`, level one's comments**: the ground, boxes, spikes and
  checkpoint comments describe the new pieces. Two existing comments that
  already put the lift in the wrong place (it is between the second gap and
  the second bowl, not "between the first bowl and the second hill") are
  corrected on the way. The crate comment's claim that nothing in the level
  needs a crate stays true, and must still be true after this change.
- **`finish.mjs`'s comments**: the runner's list of what it jumps gains stone
  steps; section 4's note that level one "has no spikes" is corrected.
- **`tests/README.md`**, the `finish` row: the runner's list of what it jumps
  gains stone steps.
- **`2026-09-11-followup-ideas.md`**: item 2 marked spec'd, pointing here. Its
  stale "Where this fits" section, which still treats item 1 as open, is
  brought up to date in the same edit.

## What changes in code

- **`games/pushkar-ball/js/levels.js`**, level one's entry: the stone boxes,
  the extra gap, the crate and the spike patch. Data and comments only.
- **`games/pushkar-ball/tests/offline/finish.mjs`**, the generic `runner`: one
  added rule — jump before the face of any low stone box that is taller than
  the ball's footing — the same shape as its existing crate rule. Without it
  the runner rolls into the stone block and stops for good at x=4230. Its
  `ROUTES[1]` and every other route are unchanged, and levels two to four
  finish exactly as before, to the tenth of a second.

No change to `config.js`, `main.js`, `enemies.js`, `physics.js`, `player.js`
or any other game file. No new mechanic.

## Testing

- **`tests/offline/finish.mjs`**: level one must still finish 30 ways and from
  both checkpoints. The 16200 hardcoded edge stays valid. Measured while this
  spec was revised: it does, slowest in 48.0s (46.5s before).
- **`tests/offline/levels.mjs`**: must still pass. Level one's block gains the
  line `1 spike patch(es), widest 70px`.
- **Hearts check** (a scratch tool in the plan's appendix, never committed):
  no run of `finish.mjs`'s matrix may lose a heart anywhere in level one, nor
  any of 235 finer runs (five leads, start delays every 0.1s) from the spawn
  to checkpoint one, nor the same with the spike patch 100 units either side
  or widened to 90. Measured while this spec was revised: none do.
- **Browser suites** (`roll`, `jump`, `deflate`, `small`): all four drive level
  one, but only its first flat and first gap, which do not move. They must
  pass unchanged. If one breaks, that is a finding to investigate before
  anything is changed, not an allowance to loosen.
- **Look at it**: screenshots of every new piece at 1280×720 and 568×320, using
  the throwaway `_look` recipe from the recurring-difficulty plan's Task 4,
  deleted before anything is committed. Every step must sit on the ground,
  the spike patch must read as distinct from the stone, and at 568×320 nothing
  new may hide under a thumb button.

## Out of scope

- Levels two, three and four's geometry.
- Any new obstacle type, mechanic or config number.
- Follow-up items 3–5 (hill height, jump-only gates, a stomp bounce), each its
  own design pass.
- What a walker costs a late jumper, in every level that has one. "Why not a
  walker" above is a measurement worth a design conversation alongside the
  roller trade-off from the recurring-difficulty work, not something this spec
  changes.
