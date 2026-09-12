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
  level one's own idea — hops, steps, gaps, crates — except for a single
  walker, as a first look at the enemies level two teaches properly.
- **The preview is one walker**, not a spike patch and not both. It is the
  calmest of the three enemies, and level two keeps real new content to teach:
  the roller, the popper, and enemies as a checkpointed test.
- **Density: fill most flats.** Most of the long empty flats get something to
  do. The first flat after spawn and the last flat before the final platform
  stay clear.
- **Approach: keep the skeleton and add to it.** Every existing piece of level
  one stays exactly where it is. Re-laying the level from scratch and
  shortening it instead of filling it were both considered and rejected: the
  first moves geometry four browser suites and `finish.mjs` rely on, the second
  goes against the deliberate decision that a round should be 60–100 seconds
  long and adds nothing to do.

## The principle the placement follows

The first ~8,700 units of level one have no checkpoint. Falling there sends the
ball back to spawn, up to 8,000 units behind. So:

- **The unguarded first third gets only pieces that cannot be failed by a
  fall** — a stone block, the walker. The worst either can do is cost one heart.
- **The one new gap goes after checkpoint one**, where missing it costs a short
  trip back to 8750.
- **Crates stay away from gaps.** A crate pushed into one returns to where the
  level put it, but that is still confusing to watch.
- **Steps are stone boxes, not ground.** A vertical riser in a ground polyline
  has its solid side facing sideways and fails the `levels` suite, which
  requires every polyline segment's normal to point up. Stone also reads
  correctly: "stone means you cannot push it".
- **No step is more than 60 units above what the ball stands on.** A jump lifts
  the ball's centre 131 units (`JUMP_V` 760, `GRAVITY` 2200), so every step
  leaves more than twice the height needed.
- **Nothing is placed so two things need timing at once** (the original spec's
  second difficulty rule). The walker's patrol stays well clear of the stone
  block, the bowl and the foot of hill two.

## What goes where

Existing pieces in plain text, new ones in bold. Coordinates for new pieces
are targets; the implementation plan settles them and `finish.mjs` proves them.

| Stretch | Now | Added |
|---|---|---|
| **First third — spawn to checkpoint one (8750), unguarded** | | |
| 40–1100, the flat after spawn | empty; the `roll` suite measures friction here | nothing — stays clear |
| hill one, flat, crate at 2450, gap 2950–3150, bowl | as is | nothing |
| 4000–6400 flat | empty | **a low stone block, about 60 tall and 200 wide, around 4250 — hop up, roll across, drop off. Then the walker, pacing around 5400, amplitude about 250** |
| hill two, flat, crate at 8300 | as is | nothing |
| **Middle third — checkpoint one to checkpoint two (13750)** | | |
| gap 8850–9090, flat with the lift at 9700 | as is | **one extra gap, 200 wide (a width already proven), around 10150–10350, before the second bowl** |
| 11450–13800 flat | empty | **a crate around 11800; a two-step stone staircase, each step 60 or less, around 12500–12900, up and back down** |
| **Last third — checkpoint two to the goal** | | |
| hill three, flat 15550–16200, platform, last ledge | as is | nothing — the last flat is the breather before the platform |

The new gap splits the second-to-last ground polyline in two. Both halves are
still authored left to right.

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
With a walker in it, level one introduces two: rolling and jumping, and a first
enemy. This is a **named, narrow exception**, not a reading of the rule:

- It is **level one's walker alone**. It is not a precedent. A future level that
  wants to preview a later idea needs its own named decision.
- It holds because level two still has its own new idea to teach — the roller,
  the popper, and enemies asked for behind a checkpoint.
- It keeps the rule's "somewhere safe" clause: this becomes the walker's first
  appearance anywhere in the game, and it sits where failing costs a heart,
  never a checkpoint's progress.

The content boundaries are unchanged. The walker is the same walker level two
already ships; Pushkar Ball's named exception for menacing shapes already
covers it, and nothing wields anything.

## Changes to existing docs

- **`2026-09-08-pushkar-ball-design.md`**, under "at most one new idea": one
  added sentence recording level one's walker as the named exception, pointing
  here.
- **`2026-09-10-health-enemies-curriculum-design.md`**, the curriculum table:
  level one stays "rolling & jumping", with a note under the table that it
  also previews one walker, pointing here.
- **`levels.js`, level two's header comment**: it says a walker is met there on
  open ground as a first meeting. It becomes a second meeting.
- **`levels.js`, level one's comments**: the header of the ground and boxes
  sections describe the new pieces. The crate comment's claim that nothing in
  the level needs a crate stays true, and must still be true after this change.
- **`2026-09-11-followup-ideas.md`**: item 2 marked spec'd, pointing here. Its
  stale "Where this fits" section, which still treats item 1 as open, is
  brought up to date in the same edit.

## What changes in code

Level data and comments only: level one's entry in
`games/pushkar-ball/js/levels.js` gains the stone boxes, the extra gap, the
crate and the walker. No change to `config.js`, `main.js`, `enemies.js`,
`physics.js`, `player.js` or any other game file. No new mechanic.

## Testing

- **`tests/offline/finish.mjs`**: level one's route learns the new pieces. It
  must still finish 30 ways and from both checkpoints, and the 16200
  hardcoded edge stays valid.
- **`tests/offline/levels.mjs`**: must still pass. The steps are boxes, so
  there is no new winding to check; the split polyline's two halves are
  checked like any other.
- **Hearts check** (the scratch tool in the recurring-difficulty plan's
  appendix, never committed): no route may lose more than one heart to the
  walker. Levels three and four showed placements can be narrow — the walker
  there fails again at ±50 units — so the plan looks for a placement that also
  holds at ±100 units, and reports the range it actually holds over if it
  cannot find one.
- **Browser suites** (`roll`, `jump`, `deflate`, `small`): all four drive level
  one, but only its first flat and first gap, which do not move. They must
  pass unchanged. If one breaks, that is a finding to investigate before
  anything is changed, not an allowance to loosen.
- **Look at it**: screenshots of every new piece at 1280×720 and 568×320, using
  the throwaway `_look` recipe from the recurring-difficulty plan's Task 4,
  deleted before anything is committed. The walker and every step must sit on
  what supports them, and at 568×320 nothing new may hide under a thumb button.

## Out of scope

- Levels two, three and four's geometry.
- Any new obstacle type, mechanic or config number.
- Follow-up items 3–5 (hill height, jump-only gates, a stomp bounce), each its
  own design pass.
- The roller trade-off from the recurring-difficulty work (a roller can cost a
  late-jumping player all three hearts). Level one gets a walker, not a
  roller, so that question does not reach it.
