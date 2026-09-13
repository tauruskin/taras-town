# Pushkar Ball — a bounce pad, and level 5 built around it

Follow-up item 4 from `docs/superpowers/specs/2026-09-11-followup-ideas.md`:
deliberate "must jump to proceed" gates. Brainstormed 2026-09-13.

## Why this got bigger than a level-data tweak

Every gap in this game already technically requires a jump, but nothing about
existing geometry reads as a deliberate gate — it reads as terrain. The
follow-up itself floated "a wall too tall to reach without a running jump plus
a boost" as one option. Checked against the real physics: `CONFIG.JUMP_V` is a
fixed impulse (760px/s), independent of how fast the ball is rolling when it
leaves the ground — there is no running-jump-adds-height mechanic anywhere in
this engine, and adding one would touch jump feel everywhere, not just one
level. So "taller wall, normal jump" tops out at the same 131px every jump in
the game already reaches.

Making a wall genuinely require something beyond a normal jump means a new
mechanic. That was discussed directly and chosen deliberately over staying
within existing primitives (walls/gaps arranged more emphatically, without new
code) — the smaller alternative was considered and set aside in favor of a
real new skill.

A new mechanic is a new idea, and every existing level slot already teaches
one, under this game's own "at most one new idea per level" rule (L1
rolling/jumping, L2 enemies, L3 crates, L4 spikes). So this spec also designs
the mechanic's level: **level 5**, which doesn't exist yet.

## Relationship to the already-planned Phase B

`docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md`
already named "launchers" among Phase B's future hazard types (alongside
saws, conveyors, crushers, ice/sticky surfaces — all deferred, "once Phase A
is built and played"), and separately said level 5 keeps a "combine
everything" role tied to a future toy-factory theme. This spec pulls the
launcher idea forward, ahead of the rest of Phase B, to answer item 4 now
rather than wait for the whole toy-factory theme to be designed. Level 5, as
built here, stays `theme: 'hills'` like every other level today — the
toy-factory reskin, and the remaining Phase B hazards (saws, conveyors,
crushers, ice), are still deferred exactly as that spec said. This document
should be read as amending that spec's Phase B list: "launchers" moves from
"not yet designed" to "designed and built, as level 5's bounce pad," and level
5's "combine everything" role is fulfilled functionally now, with its visual
reskin still pending.

## The mechanic: a bounce pad

**Behavior.** A new solid object. The ball rolls or falls onto its top like
any platform; the instant that contact registers, it is launched straight up
at a fixed velocity — no button press, no timing window, nothing to fail at
the moment of contact itself. Horizontal velocity is untouched, and normal
air-steering (`AIR_ACCEL`) still applies during the resulting arc, so aiming
the flight is the only skill involved, not triggering it. It cannot be stood
on: every contact bounces, there is no "resting on the trampoline" state.

**The numbers, checked by simulation, not arithmetic alone.** (This project
already found once this session, on the level-1 lift, that "does the range
overlap" reasoning about jump heights can be flatly wrong once real collision
is simulated — the same care applies here before committing to a spec.) A
scratch scene — flat ground, a stand-in pad, a stone wall — driven with the
real `Ball`/`Level` physics, sweeping both bounce velocity and pad-to-wall
gap, found:

- **Bounce velocity: 1200px/s** (a new `CONFIG.BOUNCE.V`). This clears a
  **200px-tall stone wall** (`CONFIG.BOUNCE.WALL_H` is not itself a config
  value — 200 is simply how tall the gating wall in level 5 is built,
  chosen because it's far beyond any jump this game can otherwise make: the
  tallest existing step anywhere is 120px, and an unaided jump's max reach is
  131px, comfortably short of 200).
- At that bounce velocity, the ball clears the wall for any pad-to-wall gap
  from roughly 50 to 200 world units — a **150-unit-wide window**, not a
  knife's edge. The recommended wall placement is **120 units** past the pad:
  comfortably inside that window, with real margin on both sides.
- This was measured for a ball arriving at the pad near its rolling top
  speed (having had a clear run-up from a stop). The implementation plan
  must re-verify the same clearance from a **standing start** too — the
  case right after respawning at a checkpoint, where the ball has had no
  run-up at all — the same way `tests/offline/finish.mjs` already re-checks
  every level from every checkpoint, not just from spawn. If a standing
  start doesn't clear reliably within the same window, the fix is more
  run-up room before the pad, not a stronger bounce (a stronger bounce
  widens the window in the wrong direction — height, not horizontal
  reach from a slow approach).

**Visual.** A trampoline: a stretched oval or rounded rectangle between two
short posts. It squashes flat on contact and springs back on launch, reusing
the same squash/stretch visual language `Ball.squash()` already uses for the
deflate animation — no new visual idiom introduced, just the existing one
applied to a second object.

**Failure mode.** Missing the pad, or bouncing but falling short of clearing
the wall, costs nothing: no heart, no hazard, no relocation. The ball simply
falls back to the ground in front of the wall (or the pad, if it undershot
even that) and can walk back and try again. This is deliberate: the challenge
here is aiming the arc, not surviving a mistake, matching the "almost no
text, must be learnable by trying it" rule — a first-time failure needs to be
cheap enough that trying again is the obvious next move, not text explaining
what to do differently.

## Level 5

**Curriculum role.** Level 5's one new idea is the bounce pad. Per the
already-settled ruling in `docs/superpowers/specs/2026-09-11-recurring-difficulty-design.md`
(item 1: a previously-taught idea may recur in any later level), level 5 also
serves as the "combine everything" capstone: a gap, a crate, an enemy, and a
spike patch, all reappearing, on top of the one new idea. `theme: 'hills'`,
matching every level so far — no new visual theme yet (see "Relationship to
Phase B" above).

**Shape**, following the same rules every other level in this game already
follows (from `docs/superpowers/specs/2026-08-31-*` and the livelier-level-one
work): the first stretch is unguarded — nothing there can cost more than a
heart, so introducing the pad on open ground, low stakes, before any
checkpoint, costs nothing to get wrong the first time. The required wall gate
comes later, protected by a checkpoint immediately before it, so a miss costs
the stretch since that checkpoint and nothing more. Two checkpoints total,
placed at the same "roughly a third of the level" boundaries the existing
rule already asks for — the second one guards the wall gate specifically.

Exact geometry (checkpoint x-coordinates, where each recurring idea sits,
level length) is implementation-plan detail, the same way the livelier-level-one
spec left its own exact coordinates to its plan — this spec fixes the pad's
own numbers (they came from physics, not level layout) and the curriculum
shape, not the specific x-values.

## Architecture

- **`games/pushkar-ball/js/config.js`**: a new `BOUNCE` block (`V: 1200`,
  plus drawing/animation constants — squash/release timing, post/pad
  dimensions), following the shape of the existing `DEFLATE` and `CHECKPOINT`
  blocks.
- **`games/pushkar-ball/js/levels.js`**: a new per-level array, `pads`
  (parallel to `checkpoints`, `spikes`, `boxes`), each `{x, y, w, h}` like a
  box. `Level` builds a segment for each pad the same way it does for
  `boxes`, so the ball collides with it like any solid — but tags the
  segment's `owner` with the pad object (the same pattern `boxes` already
  use for crates and `platforms` use for movers), which is how `player.js`
  recognizes "this contact is a pad, not ordinary ground."
- **`games/pushkar-ball/js/player.js`**: a new check in `update()`, in the
  same post-resolution block as the crate-push and checkpoint checks —
  after `grounded`/`platform` are computed, if `platform` is a pad, set
  `this.vy = -CONFIG.BOUNCE.V` and clear `this.grounded` immediately. No
  change to `physics.js`: the pad is an ordinary collidable box as far as
  resolution is concerned: only what happens *after* contact is special,
  the same architectural split hazards and checkpoints already use (hit-test
  or contact-check after the physics step, not inside it).
- **A new drawing function** in `main.js` (or its own small file, if it grows
  — matching this project's own rule that `main.js` must not become a second
  dumping ground the way Taras Town's did), following the pattern
  `drawCheckpoints`/`drawSpikes` already set: reads `level.pads`, draws each
  one, animates the squash based on recent contact.

## Testing

- A new offline suite (or an addition to an existing one; the implementation
  plan decides which) proving the bounce arithmetic itself, in the style of
  `checkpoints.mjs`/`health.mjs`: land on a pad, assert `vy` becomes exactly
  `-CONFIG.BOUNCE.V`, assert `grounded` clears, assert horizontal velocity is
  unchanged.
- `tests/offline/finish.mjs` gains a route for level 5 (every level needs
  one, per that file's own rule) and, following level 3's own precedent for
  "cannot be finished without its crate," a case proving level 5's wall gate
  cannot be cleared without the pad: strip the pad from a copy of the level
  data, sweep every takeoff point along the approach, and assert nothing
  clears the wall.
- The same file's existing checkpoint-and-lead sweep (case 2, "and from every
  checkpoint") already re-tries every level from every checkpoint at rest —
  this is what will surface the standing-start clearance question raised
  above, without needing a bespoke check for it.

## Out of scope

- The remaining Phase B hazards — saws, conveyors, crushers, ice/sticky
  surfaces — and the toy-factory visual theme. Still deferred, as
  `2026-09-10-health-enemies-curriculum-design.md` already said.
- Items 3 (done), 5, 6 (done), 7, and 8 (done) from the follow-ups file.
- Any change to jump physics, `CONFIG.JUMP_V`, or `CONFIG.GRAVITY` — the pad
  is a new, separate velocity, not a modification of the jump.
- A second jump, wall-kick, or any other new form of aerial control beyond
  existing air-steering — not asked for, and it would complicate proving the
  wall genuinely requires the pad (a stronger form of aerial control could
  make the "unaided" case ambiguous).
