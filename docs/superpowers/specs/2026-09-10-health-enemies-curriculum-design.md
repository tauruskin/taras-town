# Pushkar Ball — health, enemies, and the level-2 reshuffle

## Why

Phase 2 shipped three levels of rolling, jumping, gaps, crates and spikes, with
no lives and no combat — every fail is instantly undone at the last checkpoint,
by design (see the original spec's "Failing, and why nothing here is scary").
That design was built for a 6-year-old.

Pushkar Ball's actual target audience for this game is 12. At that age, a game
where nothing can really go wrong reads as boring rather than safe — "just
jumping over holes" was the complaint that started this spec. This document is
the correction: real stakes (a health system, enemies that hit back), without
picking up anything the hub-wide rules were actually protecting against.

**This spec is Phase A of a larger idea.** The full request also included four
new obstacle types — saws/conveyors, crushers/timing gates, launchers, and
ice/sticky surfaces — and a "boss round" idea using full physics-body enemies.
Both are deliberately out of scope here; see Scope below. Phase A is the
foundation (health, enemies, curriculum) that those additions will sit on top
of, agreed and built first so it can be played before the rest of the scope is
locked in.

## Scope

In scope:

- A three-heart health system replacing "any hazard touch = instant respawn at
  a checkpoint" for spikes, enemies, and falling out of the level.
- Three enemy types (roller, walker, popper), reused from the original
  phase-3 design, with a sharper-but-still-unarmed look.
- Reshuffling which level teaches which idea, so enemies are level 2's new
  thing instead of crates.
- Updating both the completability proof (`finish.mjs`) and the relevant
  browser suites for the new hit model.
- Two `CLAUDE.md` edits and one amendment to the original design spec (see
  "Changes to existing docs").

Out of scope, for a later spec:

- Saws, conveyors, crushers, launchers, ice/sticky surfaces — Phase B, once
  Phase A is built and played.
- "Boss round" enemies built as full physics bodies rather than time-based
  patrol — noted as a future idea during design, not committed to here.
- The coins/shop/ball-skins/double-jump idea — separately deferred by the user
  ("later") before this spec was started, and double jump specifically
  conflicts with the completability-proof architecture (built assuming
  single-jump physics everywhere), which is its own design conversation.
- The toy-factory theme's specific hazards. Level 5 keeps its "combine
  everything" role but gets only a light pass here; its factory-specific
  content is Phase B's job.
- Everything in `docs/superpowers/specs/2026-09-11-followup-ideas.md`
  (enemies/difficulty recurring past level 2, more content in level 1, hill
  height, deliberate jump-gates, a stomp bounce effect) — feedback captured
  after Phase A shipped, not yet brainstormed.

## Content boundaries: what loosens, what doesn't

The hub-wide "nothing scary" rule in `CLAUDE.md` was written for a 6-year-old
and says so. For Pushkar Ball specifically, the target age is 12, and the user
has asked for real stakes — sharper hit feedback, knockback, enemies that look
like they mean it. That is a narrow, named exception, not a loosening of the
hub rule itself: Taras Town and any future game keep the 6-year-old rule
exactly as written.

What actually changes, for Pushkar Ball only:

- Enemies may look more menacing — spikes, horns, jagged silhouettes, angry or
  narrowed eyes, bared teeth. Shape and expression only.
- **"No weapons" does not loosen.** No enemy holds or wields anything. The
  popper's lobbed projectile stays a soft round ball, not a shaped one (no
  arrows, no spikes thrown as objects).
- No blood, no injury, no death imagery, no sound of pain. A hit is a flash and
  a knockback, not a wound. A zero-heart fail is still the same deflate-and-pop
  animation the game already has, not something harsher.

This is the one rule change `CLAUDE.md` needs (see "Changes to existing docs")
— everything else below is new content, not a rule change.

## Health system

Three hearts, shown as small drawn icons in the HUD — no digits, consistent
with "almost no text." A full heart, an empty heart, nothing else to read.

### What costs a heart

Touching a spike, touching an enemy (other than stomping one from above — see
Enemies), or falling out of the level bounds. Each costs exactly one heart,
never more than one per incident: after a hit, the ball gets roughly half a
second of invincibility (flicker/flash) during which further contact is
ignored. Without this, rolling across a spike patch instead of jumping it
could drain all three hearts in under a second from one mistake, which is not
what "three hearts" is supposed to mean.

### What happens on a hit, while hearts remain

- **Spike or enemy contact:** lose a heart, flash, get knocked back a short
  distance. The ball stays in the level and stays under player control — no
  teleport, no respawn animation. This is the behavioural change from today:
  a hazard touch is now a setback measured in a few pixels and a heart, not an
  automatic trip back to the checkpoint.
- **Falling out of the level:** this one is physically different — the ball
  has left the play space, so there is no "recover in place." It costs a heart
  the same as any other hit, and the ball reappears at the last checkpoint
  reached (or the spawn, if none), exactly where a fall sends it today. The
  difference introduced here is only that it now also costs a heart.

### What happens at zero hearts

A full deflate — the same squash-and-puff the game already has for every fail
today — and the ball returns to the **level's start**, not the last
checkpoint. Hearts refill to three. This is deliberately the harsher of the
two setbacks in the game, and it is what makes checkpoints and hearts each do
a distinct job instead of one making the other redundant.

### Checkpoints' new job

Checkpoints keep their existing role of being the physical respawn point after
a fall. They gain a second job: **passing a checkpoint refills hearts to
three.** A checkpoint does not change where a zero-heart fail sends the ball —
that is always the level start — it only means a player who has taken damage
early and reaches a checkpoint gets a clean slate for the stretch ahead, so
the back half of a long level isn't quietly harder because of a mistake made
in the first third.

Checkpoint count and placement follow the existing rule from the original
spec unchanged: two per level, placed at roughly the boundaries between large
pieces of the level, never one per individual obstacle.

### Reconciling with "no lives"

The original spec's "Failing, and why nothing here is scary" section argues
against any lives system, on the grounds that a number a 6-year-old can't read
would be used to threaten him, and that checkpoints already make failure cost
something. Hearts are, functionally, a lives system — the difference, and the
reason it's right for this audience where it was wrong before, is that (a)
they are three drawn icons, never a digit, so "almost no text" still holds,
and (b) running out doesn't end a run or gate progress the way the rejected
five-lives draft did — it costs a level restart, the same category of setback
the game already has, just a bigger one. See "Changes to existing docs" for
the exact amendment this requires to the original spec.

## Enemies

Three types, carried over from the original phase-3 design, each a square
with a face — the sharper look from "Content boundaries" above applies to all
three, meaning spikes/horns/jagged edges and a more pointed expression, never
a held object:

- **Roller** — a spiky ball that rolls along the ground under real gravity and
  ground collision (the same physics the player ball uses), driven by a
  scripted horizontal push rather than player input. It behaves like a hazard
  that happens to move, the way a ball naturally would on the level's own
  slopes.
- **Walker** — paces a fixed range back and forth, its position a pure
  function of level time (the same sine-of-level-time trick the game already
  uses for moving platforms): `x = patrolCenter + amplitude * sin(t * speed)`.
  Deterministic and offline-testable — a test can assert exactly where a
  walker is at time *t* with no browser, the same guarantee the game already
  makes for platforms.
- **Popper** — stationary, lobs a soft round ball on a timer. The projectile's
  position is a closed-form parabola computed from its launch time, for the
  same reason: no physics simulation needed to know where it is at time *t*.

None of the three chase off-screen or swarm, unchanged from the original
design. **Jumping on top of an enemy still defeats it** — it pops into a few
triangles, the same "bounced on" mechanic the original spec already named —
and that remains the one form of contact that doesn't cost a heart. Any other
contact (walking into one, being hit by a popper's lob, a roller reaching the
ball) is a heart-costing hit as described above.

## Curriculum reshuffle

The original spec's rule — every level introduces exactly one new idea, in a
safe place, before it's ever asked for somewhere that matters — stays. Adding
enemies to level 2 without moving anything else would break it, since level 2
currently teaches crate-pushing. Levels reorder instead:

| Level | Was teaching | Now teaches |
|---|---|---|
| 1 | rolling & jumping | unchanged |
| 2 | crates | **enemies** (new) |
| 3 | spikes | **crates** (moved from 2) |
| 4 | *(unbuilt)* | **spikes** (moved from 3) |
| 5 | *(unbuilt, "combine everything")* | unchanged in role; toy-factory-specific content (saws, conveyors) deferred to Phase B |

Levels 2 and 3's existing geometry (ground, boxes, platforms) carries over
largely as-is between their old and new roles — level 3's current layout
becomes level 4's spike content, level 2's current crate layout becomes level
3's crate content — with checkpoints repositioned per level to keep the
"roughly thirds, before the hard stretch" rule, and level 2 rebuilt from
scratch around its new enemy content. The exact geometry (where each enemy
sits, exact checkpoint coordinates) is implementation-plan detail, not spec'd
to the line here — same as phase 2's original levels weren't laid out
coordinate-by-coordinate in that spec either.

Level 2's first enemy encounter, like any level's first appearance of a new
hazard under the existing rule, is unguarded on purpose — it's meant to be
cheap to fail once.

## Testing

Two existing suites make assumptions this spec breaks, and need real rework
rather than number tweaks — this is implementation-plan work, listed here so
it isn't lost:

- **`tests/offline/finish.mjs`** (the completability proof) currently proves
  every level can be finished by auto-jumping near hazards and assumes a
  hazard touch always sends the ball to a checkpoint. It needs new logic for
  "the ball can take a bounded number of hits and keep going," a check that
  zero hearts correctly returns to the level start, and — for the enemy
  levels — either an auto-avoid or auto-stomp strategy so the generic runner
  can still prove completability with enemies in the level.
- **`tests/browser/deflate.mjs`** currently asserts that a spike/hazard touch
  produces an immediate deflate-and-respawn. That assertion is now only true
  at zero hearts; a non-fatal hit needs its own check (heart count decrements,
  a flash/knockback happens, the ball stays in place and stays controllable).

New offline coverage needed: hit → heart decrement → i-frame window → second
hit within the window doesn't double-decrement; zero hearts → level start,
hearts refill to three; checkpoint passed → hearts refill to three; each
enemy type's position is a pure function of time and matches a hand-computed
value at a few sample times, the same style as the existing platform tests.

## Changes to existing docs

1. **`CLAUDE.md`**, "Nothing scary" — add a narrow, named Pushkar-Ball-only
   exception: enemies may look more menacing (spikes, horns, angry
   expressions) than the base rule's "bright and friendly throughout" implies,
   because this game's actual audience is 12, not 6. State explicitly that
   "no weapons" does not loosen, and that this exception does not extend to
   Taras Town or any future game — the same pattern already used for the
   hub-tile-label exception in that file.
2. **`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`**, "Failing,
   and why nothing here is scary" — add a note that "There are no lives" is
   superseded for the shipped game by this spec's three-heart system, and
   link to the "Reconciling with 'no lives'" section above for why the
   original reasoning doesn't hold at this audience's age, so a future reader
   doesn't find two documents disagreeing with no explanation.

## Risks

- **Reworking two test suites' core assumptions is real work**, not a
  find-and-replace — `finish.mjs` in particular is the game's proof that every
  level is beatable, and a health system changes what "beatable" even means
  (bounded hits allowed, not zero). Get this wrong and the suite could pass
  while silently proving nothing, the exact failure mode CLAUDE.md already
  warns about ("a suite which swallows errors will send you into the game
  instead").
- **The roller enemy uses the real physics engine**, unlike the other two —
  it's the one enemy whose position at time *t* is not a closed-form formula,
  so it can't get the same "assert its exact position" test the walker and
  popper get. It needs a different kind of proof (e.g., it never leaves its
  intended patrol area, never falls through the ground) rather than an exact
  position check.
- **Moving crates to level 3 and spikes to level 4 means two levels get
  substantially rebuilt**, not just relabelled — level 2's existing geometry
  doesn't automatically fit "first enemy encounter," since a crate-pushing
  layout and an enemy-dodging layout ask for different ground shapes. This is
  closer to two new levels than two renames.
- **Hearts are visually small and drawn, not textual** — at 568×320 they need
  to stay legible and not collide with the existing HUD/buttons, the same
  "must work on the smallest screen" rule the rest of the game already
  follows.
