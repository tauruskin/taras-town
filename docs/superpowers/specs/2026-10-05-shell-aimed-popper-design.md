# Pushkar Ball — sub-project 3: the shell, the aimed popper (levels 12–15)

Agreed 2026-10-05. **Built** 2026-10-06 (levels 12-15, `a66e64c`..`4fab783`);
see "What the build taught" and "Where the build departs from this spec"
at the end. Part of the programme in
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

## What the build taught

- **`runStates` runs a new state's `update` only on the next step.** Anything
  that must be captured on entering a state is captured in the state before
  it. The aimed popper therefore locks its target in `idle`, on the step it
  sees the ball, not on entering `aim`.
- **Wiring is three independent questions, asked per kind:** `presses` (hits
  buttons and timers), `heavy` (weighs a plate), `blocks` (a closing gate
  won't come down on it), plus `grounded`. The spec had only split pressing
  from blocking; the shell, heavy but not pressing, had no way onto plates
  until Task 7's review found it. Every presser now carries a `key` and a
  boolean `buttons` (`buttons: !!e.presses` for an enemy), and
  `updateSenders` throws on either missing: keyless pressers would share one
  identity in a per-presser `touched` and swallow each other's hits.
- **A lob falls steeply.** At its end it drops about 4.5 px for every px
  forward at `CONFIG`'s 1.1 s flight (simulated), so a lob aimed past a
  button on a floor-standing post lands on the post's top and presses
  nothing. A cap meant for a lob is mounted high, on a wall or bracket facing
  the popper, with the ball waiting at its foot: level 13's room B bracket,
  and the stone at the end of level 15's room 3 lane.
- **A lob's height costs screen.** A lob always takes its whole flight, so at
  1.1 s the arc's top was about 410 over a ball resting at level 13's room B
  door, while a settled camera shows only about 231 over a resting ball at
  740×280 (both from `config.js`; see level 13's header). Only 2 of the
  arc's 12 dots were in view mid-aim there. Hence a per-popper `flight`
  (below). And a grounded ball climbing 40 out of a dip left the camera 40
  low, cutting the cap off the top of the view, which is what changed
  `camera.js` (below).
- **Quality reviews caught real bugs the spec reviews missed:** a respawn not
  resetting poppers, the spawn missing from the popper-reach check, the shell
  missing plates. Plan code was wrong in places (Task 1's dropped comment,
  Task 6's room helper clobbering `boxes`, Task 6 test 4a's geometry, Task 7's
  missing path to plates): a starting point, never a reason to weaken an
  assertion.
- **The browser suite has one known fragility.** `tests/browser/shells.mjs`
  steers level 14's stomps live from the colours on screen, and under a full
  run's load the stomp at 740×280 once lost a heart; the heart guard failed
  the run, as it is meant to. Re-run it alone before believing a failure
  there, but do not assume flakiness.

## Where the build departs from this spec

- **A crate flips a shell by kicking the shell out from under it**, not by
  sliding the crate off. The shell is not a collider, so a falling crate
  lands on the floor through it. Moving the shell (`KICK` for `KICK_TIME`,
  through `physics.step`) keeps the crate exactly where its own rules put it
  and adds no crate motion needing its own dead-end check. A blocked kick
  leaves the shell flipped under the crate, harmless and not solid. A kick is
  spent at the edge of its range. The user accepted this by approving the
  plan. `levels.mjs` now also requires every crate in a shell's level to
  stand taller than a shell.
- **Wiring:** three questions and two guards, above, rather than two fields.
- **Popped enemies and respawns.** Aimed poppers and shells have `reset()`,
  run on respawn through `Level.resetEnemies()` after `resetSenders`.
  Chargers deliberately do not. The gap is reachable on level 11: a charger
  mid-charge at a respawn can still press button b afterwards. That only
  opens a door, so it is harmless, and it is left.
- **"Stomp wins" postpones a same-step hurt by one step**, rather than
  cancelling it; pinned by `offline/chargers` 18.
- **An aimed popper's `flight` is per instance**, like `range` and a
  charger's `see`: `flight` in the level data, `CONFIG.ENEMY.POPPER.FLIGHT`
  otherwise, and anything that needs it asks the loaded enemy. Level 13's
  room B popper flies 0.72 s. That is close to a floor on purpose. At 0.70
  the lob presses a cap on a floor-standing post from 3 of 17 rests, so
  `finish.mjs` 3p's floor-cap check fails and the bracket stops being the
  reason; 0.71 still passes. At 0.73 and 0.75 only 7 dots are in view at
  740×280, one over the shells suite's "more than 6". 0.72 gives 8 (11 at
  568×320) and passes 3p (all printed by the suites at each value; see level
  13's header). With the flatter lob the bracket moved 40 further out.
- **The camera.** A grounded ball now brings the camera to rest inside the
  vertical deadzone (`f34fc33`, `b93f95a`), at the same place a settled
  camera rests. It fixed level 13's room B cap at 740×280, and it changes the
  feel in every level with slopes and steps, so it wants a thumb.
  `offline/camera` holds it, with a control that must stay low.
- **Level 12 room B:** the missed-crate recovery is the user's option A with
  the pit at the corridor's **closed** end (3920-4000, 80 wide, with a lip),
  not its open end. A crate under hole 1 is left of the shell, and shoving
  it right would bulldoze the shell out of its range. A ball can take two
  hits and run through an upright shell; accepted.
- **Level 13:** the ball enters each room from behind the popper, under its
  perch, not over open floor in front of it, because a popper only aims
  forward and each checkpoint has to sit behind it; the arc is still seen
  first, its first lock 92 out in the room (`finish.mjs` 2e). Room B's cap
  is on a stone bracket, room C's planks under a porch roof, and posts on the
  perches keep a ball from climbing up to a popper. All accepted.
- **Level 14:** the shell's patrol is 30 wide, and cannot exceed about 45:
  with a dazed charger heavy and a plate held by overlap, every dash must
  meet the shell while the plate starts past the dazed charger's reach and
  under every shell position, which leaves `to - from` under 48 (derived by
  hand during the build, not simulated). Widening it means dropping one of
  those: the dazed charger not heavy in level 14, or the door not wired to a
  plate under the shell. Open for the user; it stays 30.
- **Level 15:** room 3 is option A with the crate **required** — the gate
  needs timer t *and* plate c, which only the crate holds — and the timer is
  2.5 s (at 2 s the slowest thumb used 63%, simulated). Room 2's stomp is
  **forced**: the door stands on the pen's roof and needs `!s`, and the
  planned plate q was dropped; the spec review noted this brings it closer to
  level 14, accepted. Lingering in the pen's mouth after the charger wakes
  can cost a heart, accepted. The level's routes keep level 11's 0.9 s
  hesitation.
- **Test numbering.** The new `finish.mjs` checks are 2e/3p/3q (level 13),
  2f/3r (level 14), 2g/3s(a)-(g) (level 15) and 3o (level 12).
