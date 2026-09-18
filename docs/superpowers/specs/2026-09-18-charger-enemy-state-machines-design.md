# Pushkar Ball — sub-project 2: enemy state machines and the charger (levels 10–11)

Agreed 2026-09-18. Part of the programme in
`docs/superpowers/specs/2026-09-18-mechanisms-and-enemies-roadmap.md`, whose
rules every level here follows. Read sub-project 1's "What the build taught"
(`2026-09-18-wiring-buttons-timers-bridges-design.md`) before building.

## Decisions taken with the user

- **Stomp only while dazed.** Patrolling, winding up or charging, a charger
  hurts on any contact, a landing from above included. Dazed, touching it is
  harmless and a stomp pops it. The lesson is "let it charge, then stomp".
- **A popped charger comes back**, always and everywhere, so no level that
  needs one as a tool can be left unfinishable by stomping it early.
- **A charge shoves a crate.** Wood gives way; stone never does. The price is
  a dead-end check for every crate a charger can reach.
- **Approach A:** a small shared state-machine shape, used first by the
  charger. Walker, roller and popper are not touched — their level
  placements were tuned against their exact current maths. The popper moves
  onto the shape in sub-project 3, with its upgrade.

## The state-machine shape

In `js/enemies.js`, beside the existing makers. An enemy written in it has
`state` (a name), `stateT` (seconds spent in it) and a table of states. Each
state has an `update(e, dt, level, cfg)` that returns the next state's name
or nothing, and an optional `enter(e)`. Changing state resets `stateT` and
calls `enter`. A state changes only on a timer or a distance check, never at
random, so the same situation plays out the same way every time and Node can
test it. The helper is a few dozen lines and knows nothing about chargers.
The DOM rule holds: `enemies.js`'s update paths never touch it; drawing is a
separate export, as now.

## The charger

Level data: `{ kind: 'charger', x, y, from, to, dir?: 1|-1 }`. `x, y` is its
home. Every number below lives in `CONFIG.ENEMY.CHARGER` and is a guess
awaiting a thumb.

**Movement.** Through `physics.step`, like the roller, so gravity, slopes,
gates, stone and crates stop it with no special case. It never leaves
`[from, to]` — patrolling or charging. The `levels` suite requires unbroken
ground under every charger's whole range (plus its radius each side), which
is what proves "never charges off a ledge" without a browser.

**States.**

| State | What it does | Ends when | Next |
|---|---|---|---|
| patrol | walks at `PATROL_SPEED` (~60), turns at the ends of its range | ball on its own level (`|ball.y − y| < LEVEL_TOL`), in front, within `SEE` (~200) | wind-up |
| wind-up | stands, crouches, paws, puffs; keeps its facing | `WINDUP` (0.8 s) | charge |
| charge | straight dash at `CHARGE_SPEED` (~480, faster than the ball's 420; a jump clears it) | meets stone, a gate, a button's post, a crate, or the end of its range | dazed |
| dazed | stays put; stars circle it and visibly count down | `DAZED` (~2 s) | patrol |
| popped | gone | `RETURN` (~4 s) **and** ball further than `SEE` from home | patrol, at home, facing `dir` |

During a charge:
- **plank wall** — broken through `Level.breakWood`, and the charge goes on;
- **crate** — one fixed shove (`CRATE_SHOVE`, a short distance through the
  crate's own movement, so it can never be pushed into anything), then dazed;
- **the ball** — does not stop it; the ball is knocked back and loses a heart
  through the same `hazardKnockDir` path as every hazard.

Dazed stars count down (three stars, one goes each third of `DAZED`), because
a timer the player needs must show its time.

**Wiring.** While not popped, a charger is added in `Level.update` to both
lists: a presser `{ heavy: true, resting: grounded }` and a blocker. So a
charge into a button's capped side presses it, standing on a plate holds it,
and a gate never closes on it. A popped charger is in neither list. Enemies
are added in `Level.update` itself, as the wiring spec says, because they are
the level's own.

**Hit rules.** `stompEnemy` pops a charger only when dazed; otherwise a
landing on it is a hit like a side contact. `hazardKnockDir` ignores a dazed
or popped charger.

**Look.** Its own silhouette, so it never reads as a walker: a low, wide
body, two forward-pointing horns, a heavy brow and the shared angry face. The
pose is the warning — a crouch and dust puffs for wind-up, a forward lean and
speed streaks for the charge, a wobble and cartoon stars for dazed, a puff
for its return. It holds nothing and throws nothing.

## Level 10 — Introduction

Appended to `LEVELS`. The charger, somewhere nothing else can go wrong.
Checkpoint before the pen. A flat pen with one charger and no other hazard,
which teaches the three things the charger is: it telegraphs, a jump clears
the charge, and dazed means stompable. Stone at the end it charges towards
first, so the first charge ends dazed with a stomp waiting. A plank wall at
the pen's other end, which a later charge breaks on the way — so the child
sees a charger break wood before level 11 asks him to use that. (The ball
could break it too; nothing here depends on who does.) Then a short reprise
of known things (a proven gap, the stone step) to the flag.

## Level 11 — Combination

Appended. Two rooms, a checkpoint before each.

- **Room A — lure it.** A gate wired to a button behind a plank wall. The
  button's face cannot be reached by the ball (a stone lip over it); the
  charger's dash can. The ball stands beyond the button, the charger sees it,
  charges, breaks the planks, presses the button, and ends dazed against the
  post. Wire and lamps show the link, as in level 8. The exact layout is the
  plan's to find, under one constraint the `finish.mjs` probes enforce: the
  ball can neither press that button nor break those planks itself — only
  the charger can.
- **Room B — use the daze.** A plate the ball is too light to hold drives a
  door. A charge that ends on the plate (stopped by stone just past it)
  leaves the charger dazed there, holding the door open for `DAZED`. The
  ball has that long to get through, proved in `finish.mjs` with a stated
  fraction to spare across the lead/delay sweep. Stomping it releases the
  plate; it returns and can be lured again.

Every crate in either level gets a dead-end check.

## Tests

- **Offline, new `chargers.mjs`:** each state change and its trigger; the
  exact wind-up length; never leaving its range; plank, crate and stone
  outcomes; stomp only when dazed; no harm when dazed; the return timer and
  its wait for the ball; presser and blocker membership, and neither when
  popped.
- **`levels.mjs`:** unbroken ground under every charger's range; the gate-hazard check, which matches enemies by kind
  name today, taught the charger.
- **`finish.mjs`:** routes for levels 10 and 11 across the sweep, with
  stated spare; dead-end probes — can a charger shove a crate flush against
  something? can a stomped or dazed charger leave either room unfinishable?
- **Rendering:** screenshots of every pose, and both levels, at 568×320 and
  740×280.

## Out of scope

The popper upgrade, the shell, the swooper, the conveyor, and any change to
walker, roller or popper behaviour. Sound, as for the rest of the game.
