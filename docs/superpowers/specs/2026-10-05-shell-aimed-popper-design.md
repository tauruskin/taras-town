# Pushkar Ball — sub-project 3: the shell, the aimed popper (levels 12–15)

Agreed 2026-10-05. Not built. Part of the programme in
`docs/superpowers/specs/2026-09-18-mechanisms-and-enemies-roadmap.md`, whose
rules every level here follows. Read the charger spec's "What the build
taught" and "Carried over from the reviews"
(`2026-09-18-charger-enemy-state-machines-design.md`) before building.

## Decisions taken with the user

- **The upgraded popper aims at the ball.** When it starts aiming it locks
  onto where the ball is, draws the arc for 1 s, then fires at that spot.
  Steering the lob onto a button or a plank wall is the redirection puzzle.
  Level 2's popper keeps its timed, fixed lob through `fixed: true` in its
  level data, so its tuning is not touched. It still moves onto the
  state-machine shape.
- **A flip is temporary, like the charger's daze.** While flipped a shell is
  harmless and can be stomped; when the countdown ends it rights itself. A
  popped shell comes back, as a charger does. A shell weighs down a plate
  whether upright or flipped, so freeing a plate means flipping the shell and
  then stomping it.
- **Pressing and blocking become separate fields.** `presses` covers button
  hits and `blocks` covers closing gates. A shell is `heavy`, `blocks`, and
  does not press. A charger gets `presses: true, blocks: true` and behaves
  exactly as before.
- **The roadmap's single Mastery level becomes four levels.** Neither the
  shell nor the aimed popper had been introduced anywhere, and Mastery means
  mechanics the player already knows. The order is 12 *Introduction: shell*,
  13 *Introduction: aimed popper*, 14 *Combination: shell and charger*,
  15 *Mastery*. Sub-project 4 moves to level 16 and on. The roadmap's levels
  table has to be corrected to match.

## The shell

Level data: `{ kind: 'shell', x, y, from, to, dir?: 1|-1 }`. Every number
lives in `CONFIG.ENEMY.SHELL` and is a guess awaiting a thumb.

**Movement.** Through `physics.step`, like the charger. A patrol turns at the
ends of `[from, to]` and at anything solid in front of it, button posts
included. The `levels` suite requires unbroken ground under its whole range,
plus its radius each side.

| State | What it does | Ends when | Next |
|---|---|---|---|
| patrol | walks at `PATROL_SPEED` (slower than the charger's 120) | flipped by a crate or a dash | flipped |
| flipped | on its back, legs waving, with a visible countdown | `FLIPPED` runs out / stomped | patrol / popped |
| popped | gone | `RETURN` **and** ball further than `RETURN_CLEAR` from home **and** home clear of crates | patrol, at home, facing `dir` |

- **Contact.** Upright, any contact costs a heart, a landing from above
  included; the shiny dome is what says a stomp will not work (`stompable`
  and `harmless` are false). Flipped, both are true.
- **Flipped by a crate.** A crate that lands on the shell falling faster than
  `FLIP_VY` flips it. A crate resting on it does not. After the flip the crate
  slides off to the shell's far side. If there is no room there, the crate
  goes back to where the level put it, the same rule a crate shoved down a
  hole already follows.
- **Flipped by a charger.** A charging charger that touches a shell flips it
  and is dazed, as if it had hit stone. A patrolling charger turns at a shell
  as it does at anything solid.
- **Wiring.** `heavy: true` in every state but popped. `blocks: true` while
  alive. `presses: false`. It keeps `grounded` up to date.
- **Colour.** `COLOURS.SHELL_BODY` and `SHELL_EDGE`, distinct from the walker
  and popper violet and from the charger's blue, so a browser suite can count
  it.
- **Look.** A domed, shiny shell with jagged edges and narrowed eyes is
  inside Pushkar Ball's content exception. It holds nothing.

## The aimed popper

Level data: `{ kind: 'popper', x, y, dir?, range?, fixed?, period?, phase? }`.
`fixed: true` keeps today's closed-form timed lob exactly, with `period` and
`phase`. Without `fixed`, the popper aims. Its numbers live in
`CONFIG.ENEMY.POPPER`, and `range` falls back to `POPPER.RANGE` when an
instance does not set it. As with the charger's `see`, anything that needs a
popper's range asks the loaded enemy for it, never the config.

| State | What it does | Ends when | Next |
|---|---|---|---|
| idle | waits | ball on its facing side within `range` | aim |
| aim | locks the target on entry; draws the dotted arc to it | `AIM` (1 s) | fire |
| fire | the lob is in flight | the lob meets something solid | reload |
| reload | waits | `RELOAD` | idle |

A `fixed` popper runs on the same machinery but cycles on its clock alone, and
its lob positions match today's `activeProjectile(t)` at every `t`.

- **Aim.** The target is the ball's position when aim begins, clamped to
  `range` horizontally. It never aims behind itself.
- **Lob.** A closed-form parabola from the popper to the target, taking a
  fixed flight time `FLIGHT`. Past the target it carries on along the same
  curve until it meets the first solid segment, button cap, plank wall or the
  ball. Where it ends depends only on the target, so Node can work it out
  ahead of time.
- **What it touches.** The ball costs a heart, as now. A button is pressed by
  the lob's hit: the lob joins the presser list for that moment with
  `presses: true`, `heavy: false`, `blocks: false`. A plank wall breaks in
  one hit, as a charger's dash breaks it. Enemies are passed through
  harmlessly and nothing is flipped. It stays the game's one thrown thing, a
  soft ball.
- **Fair.** The arc is always drawn before a lob. A new `levels.mjs` check
  fails any aimed popper whose range covers a checkpoint.

## Carried over from the charger reviews, now decided

1. **Two enemies under a landing ball.** `stompEnemy` gathers every enemy the
   ball overlaps. If any of them is stompable, every stompable one pops, the
   ball bounces, and nothing hurts. The ball is hurt only if none is
   stompable or harmless.
2. **A sender's `touched` becomes per presser**, so a lob's hit on a timer the
   ball is already touching still counts.
3. **A popped charger or shell waits for its home to be clear of crates**, as
   well as for the ball to be away.
4. **Pop debris gets its own shade per kind**: `COLOURS.CHARGER_POP` and
   `SHELL_POP`, distinct from both body colours, so a body count is never
   polluted by debris. Walker and popper debris stay `COLOURS.ENEMY`.
5. **`levels.mjs`'s gate-hazard check reads `blocks`, not kind names**, so a
   new kind cannot be forgotten there.

## The levels

All four are appended to `LEVELS`. Below are sketches: every position comes
from `finish.mjs`, and every sweep result is written into the level's header
comment along with its stage.

**Level 12 — Introduction: the shell.** A checkpoint before each room.
- *Room A, "it can't be stomped, but its weight is useful."* A shell patrols a
  flat floor. A plate under one end of its range drives a gate, which is open
  while the shell is on the plate. A raised ledge out of reach lets the
  player watch first. The lesson is timing the run, not stomping.
- *Room B, "drop a crate on it."* A crate on a ledge over the patrol. Pushed
  off while the shell is underneath, it flips the shell. The stomped shell
  stops blocking a narrow pass. A crate that misses can be recovered, and it
  gets a dead-end check.

**Level 13 — Introduction: the aimed popper.**
- *Room A, "it aims where you were."* An open floor with nothing to hit. Step
  aside from the arc.
- *Room B, "make it hit the button."* A button the ball cannot reach. Stand
  past it and the lob presses it, opening a gate.
- *Room C, "make it break the planks."* The same, with a plank wall.

**Level 14 — Combination: shell and charger.**
- A warm-up: lure a charger into a shell with nothing wired.
- The main room: a shell patrols over a plate that holds a gate *shut*
  (inverted input). Lure the charger so its dash flips the shell, stomp the
  shell, and get through before it returns. The time to spare is printed.

**Level 15 — Mastery: wiring, charger, shell, popper redirection.** Rooms that
each need two or three of these at once, for example:
- a lob breaks planks that free a crate, which drops onto a shell on a plate;
- a charger's dash opens a gate a shell would otherwise block;
- a lob hits a timer button while the ball runs for its gate, which is the
  per-presser `touched` fix in use.

The plan fixes the rooms. This spec fixes only that each combines mechanics
already taught, each is fair, and none can be left unsolvable.

Every mechanic recurs: the shell in 12, 14 and 15, the aimed popper in 13 and
15.

## Tests

**Offline (Node).**
- The shell's machine: a crate landing above `FLIP_VY` flips it and one
  resting does not; a dash flips it and dazes the charger; the flip times
  out; a stomp pops it; it returns only once its home is clear of the ball
  and of crates.
- The popper: the lob reaches the locked target at `FLIGHT`; it never aims
  behind itself; the aim is clamped to range; a `fixed` popper's lob
  positions equal today's at sampled times, which protects level 2.
- The wiring: a lob presses a button and breaks planks; per-presser `touched`
  does not swallow a second presser's hit.
- The landing rule: overlapping enemies under a landing ball, and the stomp
  wins.
- `levels.mjs`: unbroken ground under every shell, no popper range covering a
  checkpoint, the gate check reading `blocks`.
- `finish.mjs`: routes for 12–15 (all in `COUNTS_HEARTS`), lead and delay
  sweeps, a dead-end check for every crate, a printed fraction to spare for
  every timed window.

**Browser.** The shell counted by `SHELL_BODY`; each picture held to the
heart-count guard so it cannot show the wrong room. Screenshots at 568×320 and
740×280 of the aim arc, a flipped shell, and both pop shades.

**Habits.** Each new check is broken on purpose once to prove it can fail, and
any check comparing against a constant stands behind a `Number.isFinite`
guard. Every number in a comment says whether the suite prints it, it was
derived from `config.js`, or it was simulated.

## Out of scope

The swooper and the conveyor (sub-project 4, now levels 16 and on). Any change
to walker or roller behaviour. Level 11 room B's 15.6 s wait, which stays open
by the user's decision. Level 7's missing route in `finish.mjs`. Sound.
