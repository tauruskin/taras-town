# Balance beam (level 7)

Second sub-project out of the Red Ball 4-inspired follow-up list started by
`docs/superpowers/specs/2026-09-13-pressure-switch-and-scenery-design.md`
(pressure switch + gate, level 6). The remaining list — see-saws/weight
puzzles (this one), moving carts, buoyancy/floating crates, timed triggers,
key-lock doors, laser boundaries, gravity-warping, and smarter enemy variants
— are each independent and each gets its own design pass. This covers the
see-saw/weight-puzzle piece only.

## Why a new level, not a retrofit

Same reasoning as level 6's: this project has held to "one new idea per
level, difficulty rises one level at a time" since level 1. The beam is a new
idea and gets a new level 7, rather than being folded into any existing
level's already-settled geometry and tests. Levels 2–6 are unchanged by this
project. A later level (8, 9, …) is free to bring the beam back as a
recurring, already-taught obstacle — the same way level 6 brought back a
walker from level 3 — but that is a future level's decision, not this one's.

## The mechanic

**Beam** (`data.beams`): `{ x, y, halfLength, restBias, minAngle, maxAngle }`.
`(x, y)` is the fixed fulcrum point; `halfLength` is how far the beam extends
each way from it. The beam is authored off-centre in effect: `restBias` is a
constant "phantom weight" folded into the torque total below, chosen so that
with nothing resting on the beam it settles at `minAngle` — the long arm
down, resting on the entry ledge, the short arm up past the exit ledge, out
of reach. `minAngle`/`maxAngle` are the two physical extremes, set per-beam
to match the entry and exit ledge heights, the same way a gate's open/closed
heights are per-gate.

Like a crate or gate, the beam is not part of the static grid. Its two-point
segment is rebuilt every step from its current angle via the same `segment()`
helper physics.js already uses for every other line, and it is added
alongside movers, crates, and gates in `Level.near()` and `Level.solidsFor()`
so both the ball and a crate collide with it correctly.

### Torque and angle

Each step: `torque = restBias + Σ(rider.weight × signedOffsetFromFulcrum)`
for every body (ball, crate) currently resting on the beam, where the offset
is measured along the beam's own axis, not world x. `torque` maps linearly to
a `targetAngle` clamped to `[minAngle, maxAngle]`, and the beam's actual
`angle` eases toward that target over a short bounded duration — the same
non-instant lerp idiom `pads[].squashT` and the gate's height animation
already use, not an instant snap. Rider weight values and the lerp speed are
new `CONFIG.BEAM` constants, tunable like every other number in `config.js`.

### New carrier contract, for rotation

Every existing carrier (movers, crates, gates) shares one `dx`/`dy` applied
identically to every rider, which is only correct for pure translation. A
rotating beam moves different points by different amounts depending on
distance from the pivot, so it cannot expose a flat `dx`/`dy`. Instead the
beam exposes a small function — given a rider's current `(x, y)`, it returns
that specific point's `(dx, dy)` for this step — and `player.js` and the
crate's own update call that instead of reading a shared field. This is a
deliberate, documented extension of the carrier contract for anything that
rotates rather than a violation of it: everything standing on anything still
gets its motion this way, just computed per-rider instead of shared. Any
future rotating carrier (this project's remaining list has none planned, but
a future one might) reuses this same shape rather than inventing another one.

### Crate-on-beam

No new crate physics beyond what riding a moving carrier already requires. A
crate already rests on sloped ground via the existing `supportUnder` logic —
slopes are not new. What is new is riding a *moving* sloped segment, handled
by the beam's per-rider delta function exactly as a crate already rides a
moving platform's shared `dx`/`dy`. The crate still never slides on its own;
it only moves sideways when pushed and downward when falling, matching the
existing invariant ("wood means you can push it," never that it slides
under it own weight). Pushing it across the fulcrum, so its torque
contribution flips from holding the entry side down to holding the exit side
down, is the entire puzzle.

### Falling off

A ball or crate that rolls off the beam's side into the gap is handled
exactly like any other fall — the ball respawns at the level's last
checkpoint, and a crate that falls returns to its authored position, the same
as falling off any ledge today. No new fail-state code.

### Visuals

Per the precedent set by the gate (stone-coloured despite being a "wall,"
specifically so it doesn't read as pushable wood): the beam and its fulcrum
wedge are a distinct mechanism grey, not wood, since the ball or crate can't
push the beam itself — only a crate riding on it moves it. New
`CONFIG.COLORS.BEAM` / `BEAM_PIVOT` entries, styled apart from
`CRATE`/`CRATE_LINE`.

## Level 7 content

Following the same "run first, then the puzzle" shape level 3 and level 6
used:

1. A warm-up stretch of already-taught obstacles to reach the puzzle.
2. The beam: resting at `minAngle`, long arm down at the entry ledge (where
   the ball and a crate both start), short arm up and out of reach past the
   gap. One beam only — first exposure to a mechanic in this project has
   always been singular (level 3's one crate, level 6's one switch/gate). A
   harder, multi-beam or multi-crate combination is a later level's job.
3. Push the crate onto the beam and across the fulcrum; the beam levels out
   and meets the exit ledge. Cross.
4. A recurring already-taught obstacle elsewhere in the level, away from the
   beam itself (a spike patch or a walker) — content, not a second new idea,
   the same way level 6 brought back a walker from level 3 alongside its new
   switch.
5. Continue to the flag.

## Testing

`finish.mjs` gets a level-7 route: walk to the beam, push the crate across
the fulcrum until the beam levels, cross to the exit ledge. Plus a negative
check in the same shape as level 6's — with the beam's rest bias forced so it
never levels (or its crate removed), no route clears the gap, proving the
beam is load-bearing rather than decorative.

The offline physics suite gets direct torque/angle unit coverage: given fixed
rider positions and weights, the resulting target angle and eased angle are
deterministic, the same way the gate's height animation is tested today
without a browser. This is where the new per-rider delta function gets its
correctness proven — a crate at a known offset from the fulcrum should end up
at a known new position after one step, with no NaN the moment it starts
riding (the exact bug class `CLAUDE.md` already warns about for any carrier
missing its `dx`/`dy`/`vx`/`vy`).

Screenshot-based visual check at 568×320 and 740×280, per this project's
"look at it" practice, confirming the beam's mechanism-grey colouring reads
as distinct from crate wood at both the smallest and widest phone shapes, and
that the fulcrum wedge doesn't get hidden behind ground texture added in the
previous project.

## Where this fits

This is the second of several independent follow-up mechanics from the Red
Ball 4-inspired list. The rest — moving carts, buoyancy/floating crates,
timed triggers, key-lock doors, laser boundaries, gravity-warping, and
smarter enemy variants — remain unscoped and will each get their own
brainstorming pass. Gravity-warping is still flagged as the largest remaining
lift (see the pressure-switch spec for why); explosive/ticking-box enemies
still need a content-boundary conversation before design, for the same
reason noted there.
