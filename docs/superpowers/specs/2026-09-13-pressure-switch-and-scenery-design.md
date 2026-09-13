# Pressure switch + gate (level 6) and a richer shared background — DONE

First sub-project out of the Red Ball 4-inspired follow-up list (see the
brainstorming session that produced this doc for the full list and the
decomposition rationale: pressure switches, see-saws, moving carts, buoyancy,
key-lock doors, lasers, gravity-warping, and smarter enemies are each
independent, and each needs its own design pass before implementation — this
covers the first two pieces only.

## Part A — pressure switch + gate, and level 6

### Why a new level, not a retrofit

This project has held to "one new idea per level, difficulty rises one level
at a time" since level 1 (rolling/jumping), level 2 (enemies), level 3
(crates), level 4 (spikes), level 5 (bounce pads). The switch+gate is a new
idea and gets a new level 6, the same way every mechanic so far has, rather
than being folded into an existing level's already-settled geometry and
tests.

### The mechanic

Two new level-data entity kinds, both DOM-free like everything else in
`levels.js`:

**Switch** (`data.switches`): `{ x, y, w }`, authored flush with the ground
the same way a bounce pad is. Not a collider and not a hazard — a zone.
`Level.update()` sets `switch.pressed` to true whenever some crate is
`grounded` and its box overlaps the switch's `[x, x+w]` horizontally. No new
crate fields needed; this reuses `grounded` and the AABB math crates already
expose. Only a crate can press it — not the ball — so a level built around it
is a "push the box and leave it" puzzle, not a "step on it" toggle.

**Gate** (`data.gates`): `{ x, y, w, h, switchId }`. A vertical box, like a
wall, whose *drawn and solid* height retracts upward while its switch is
pressed and extends back down when it isn't. The transition is a bounded
lerp toward the open/closed target over a short fixed duration (not
instant — reads as a mechanism, not a snap) — the same self-driving,
bounded-animation-value idiom `pads[].squashT` already uses. Its segments
are rebuilt every step from its current height exactly the way a crate's
`_reseg()` rebuilds from its current position, and it is added alongside
movers and crates in `Level.near()` (so the ball is blocked or not) and
`Level.solidsFor()` (so a crate can't be pushed through a closed gate
either).

Visually, a gate is a plain stone-coloured wall (same style as level 1's
stone blocks) — it isn't pushable, so it must not read as wood. The switch
plate is a small raised dark stepping-stone shape, distinct from ordinary
ground, so "put something here" is legible without text the same way
wood-vs-stone already is.

### Level 6 content

Themed `hills` (every level is, today — the toy-factory reskin is still a
separately-queued Phase B item and unrelated to this). Shape, following the
"run first, then the puzzle" pattern level 3 (crates) used:

1. A short warm-up stretch of already-taught obstacles (gaps, a step) to
   reach the puzzle.
2. The gate, closed, blocking the path. A crate sits before it, and the
   switch plate is visible before the gate — plate, then gate, in that
   order, so the child sees the mechanism before deciding what to do with
   the crate, never after.
3. Push the crate onto the plate; the gate rises. Walk through *without* the
   crate — it's positioned far enough back that bringing it along isn't
   an option, matching Red Ball 4's own "the box stays behind" shape.
4. Continue to the flag.

One switch/gate pair only, not several — first exposure to a mechanic in
this project has always been singular (level 3's one crate puzzle, level 5's
one gate pad). A harder, multi-switch combination is a later level's job.

### Testing

`finish.mjs` gets a level-6 route: run to the crate, push it onto the plate,
proceed through the gate — the same shape as level 3's push-then-hop route,
run across the file's existing lead/delay sweep. Plus a level-3-style
negative check: with the gate's switch data removed so it never presses (or
the gate authored permanently closed), no route gets past it, proving the
gate is load-bearing rather than decorative — the same shape as level 3's
"cannot be finished without its crate" and level 5's "cannot clear the wall
without its gate pad" checks.

## Part B — a richer shared background

The `theme` field already stored on every level (`'hills'`, currently the
only value) is not yet wired to different drawing — that's reserved for a
future factory reskin. The background is presently one shared look: a sky
gradient plus two parallax hill bands (`CONFIG.PARALLAX`), and one flat-fill
ground colour per polyline. This part makes that one shared look richer,
across all six levels — no per-level art, no theme branching added, nothing
gameplay-relevant changes.

Requested from reference screenshots of Red Ball 4's look. Since this
project's hub-wide rule is **no image files, ever** — everything is drawn
with shapes by code — this is a matter of composition, not a literal art
port:

- **Sky:** a sun disc (a circle plus a soft glow ring) fixed high in the sky,
  and 2-4 soft rounded cloud shapes drifting at their own slow parallax
  factor. Decorative, drawn in `drawParallax`'s screen-space pass before the
  world transform, so — like the existing hills — they cost nothing extra at
  either end of a long level.
- **Hills:** a third, farthest band added behind the current two, using the
  same sine-wave technique `CONFIG.PARALLAX` already drives — one more entry
  in that array with its own colour/factor/span/amp, no new code path.
- **Ground:** currently one flat fill down to the level floor. Add a
  scattering of darker rounded "rock" dots through the dirt body, and a
  couple of thin darker horizontal strata lines, so it reads as a
  cross-section rather than a solid block — and small flower/tuft dots along
  the grass edge. All positioned deterministically from world position (the
  same hashing approach the hills already use for their sine phase), so
  nothing needs to be saved and nothing jitters between frames.
- **Water:** a static decorative band (a blue-green fill plus a couple of
  pale horizontal ripple lines) drawn behind any gap or drop toward the
  bottom of the world — cosmetic only. The ball still falls through a gap
  exactly as it does today; this is not a new hazard, and not the buoyancy/
  floating-crate mechanic from the original list, which is a separate,
  unscoped item.

**Explicitly out of scope:** the wooden catapult/launcher visible in one of
the reference screenshots is a mechanic (closer to the see-saw/lever idea),
not background dressing, and needs its own design pass.

### Testing

Screenshot-based, per this project's own "look at it" practice — rendered
at both 568×320 and 740×280 (the two sizes every full-screen change here
gets checked against) to confirm the added elements don't crowd or
misrender at the smallest and widest phone shapes, and that the parallax
wavelength bug class (bands too wide to read as hills at phone width,
documented in `CLAUDE.md`) doesn't recur for the new hill band. No new
offline-suite assertions are needed — nothing here is state finish.mjs or
the physics suites reason about; it's draw-only.

## Where this fits

This was the first of several independent follow-up mechanics from the Red
Ball 4-inspired list, implemented by
`docs/superpowers/plans/2026-09-13-pressure-switch-and-scenery.md`. The rest
(see-saws/weight puzzles, moving carts, buoyancy/floating crates, timed
triggers, key-lock doors, laser boundaries, gravity-warping, and smarter
enemy variants) remain unscoped and will each get their own brainstorming
pass, in whatever order is chosen next. Gravity-warping is flagged as the
largest lift of the remaining set —
`config.js`/`physics.js`/`levels.js`/`player.js`/`camera.js` are DOM-free
specifically so the offline suite can simulate real arithmetic, and gravity
direction (`ny < 0` is "up") is assumed throughout knockback, camera bias,
and grounded-detection. Explosive/ticking-box enemies are flagged as needing
their own content-boundary conversation before design, since they brush
against this project's "no weapons" rule in a way a plain spike or horn
doesn't.
