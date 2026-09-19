# Pushkar Ball — sub-project 2: enemy state machines and the charger (levels 10–11)

Agreed 2026-09-18, and **built** 2026-09-19 as levels 10 and 11.
Part of the programme in
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
or nothing, and an optional `enter(e)`. A timed state reads `stateT` itself;
there is no separate duration field. Changing state resets `stateT` and
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
| patrol | walks at `PATROL_SPEED` (~120), turns at the ends of its range | ball on its own level (`|ball.y − y| < LEVEL_TOL`), in front, within `SEE` (~240) | wind-up |
| wind-up | stands, crouches, paws, puffs; keeps its facing | `WINDUP` (0.8 s) | charge |
| charge | straight dash at `CHARGE_SPEED` (~480, faster than the ball's 420; a jump clears it) | meets stone, a gate, a button's post, a crate, or the end of its range | dazed |
| dazed | stays put; stars circle it and visibly count down | `DAZED` (~3 s) | patrol |
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
lists: a presser `{ heavy: dazed, resting: grounded }` and a blocker. So a
charge into a button's capped side presses it, a gate never closes on it,
and it holds a plate **only while dazed** — the roadmap's "holds a plate
while dazed". Heavy all the time would let a patrol open a door by walking
over its plate, which muddles the one thing level 11's room B teaches. A
popped charger is in neither list. Enemies are added in `Level.update`
itself, as the wiring spec says, because they are the level's own.

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
  fraction to spare across the lead/delay sweep. Missing the door costs
  nothing: the charger recovers, patrols, and can be lured again.

Both rooms share one shape, found while planning: the charger lives in a
closed pen under a stone roof, the ball crosses the roof and drops into a
small yard beyond it, and the yard's far side is a stone wall with the door
in it. On the roof the ball is not on the charger's level, so it is not
seen; in the yard it is. The ball can never get into a pen, so a charger
that is the room's tool can never be stomped out of the way, and the yard
cannot be climbed out of except through its door — which is safe only
because the charger always comes back round and sees him.

Every crate in either level gets a dead-end check.

## Tests

- **Offline, new `chargers.mjs`:** each state change and its trigger; the
  exact wind-up length; never leaving its range; plank, crate and stone
  outcomes; stomp only when dazed; no harm when dazed; the return timer and
  its wait for the ball; presser and blocker membership, and neither when
  popped.
- **`levels.mjs`:** a charger's range inside the level; unbroken ground
  under every charger's range; no checkpoint within `SEE` of one; the
  gate-hazard check, which matches enemies by kind name today, taught the
  charger.
- **`finish.mjs`:** routes for levels 10 and 11 across the sweep, with
  stated spare; dead-end probes — can a charger shove a crate flush against
  something? can a stomped or dazed charger leave either room unfinishable?
- **Rendering:** screenshots of every pose, and both levels, at 568×320 and
  740×280.

## What the build taught

- **No position the suites measure moved from the paper layout, in either
  level.** The only numbers changed are level 11's two pen floors, which now
  start 40 further left, under their walls (1840 to 1800, 4740 to 4700), to
  mend a crack drawn below each wall (see rendering, below); `finish.mjs`
  and `levels.mjs` reported the same results before and after. The other
  fixes were in the routes `finish.mjs` drives, and in how the charger is
  drawn.
- **Level 10's way in needed a guard, and no position could supply it.** The
  plan's route hopped the 60 stone step at 1400 and sometimes landed on a
  charger that had just arrived on the other side: a ball in the air cannot
  obey `dodge`. The daze end was not the cause. Moving the charger's home
  cannot fix it — the pen is 840 wide and a 4.5 s spread of arrivals covers
  540 of its patrol, so some arrival always meets it there. The fix is in the
  route: `holdAtStep` waits outside the step while the charger is patrolling
  towards it within `PEN_GUARD` (600). Outside the step nothing can reach the
  ball, which is the step's other job.
- **The `PEN_GUARD` sweep.** A scratch sweep, not something `finish.mjs`
  runs: five leads 0.7-1.3, start delays 0-25 s every 0.25 s — a whole ~13 s
  patrol of the pen, 505 runs per value. Hits: 31 with no guard, 15 at 300, 5
  at 400, none from 500 to 900. 600 is 500 with room. What `finish.mjs`
  runs is its usual three leads at delays 0-4.5 s.
- **A child who hops in blind loses a heart about 6% of the time.** The spec
  reviewer's independent sweep with no guard found 16 of 255 runs losing a
  heart. `holdAtStep` makes the route safe; it does not make the level safe
  for a child who does not wait. See the open questions.
- **Hearts, not only lives, for levels 10 and 11.** `finish.mjs`'s sections 1
  and 2 count deaths, which would let a route that lands on the charger pass.
  `COUNTS_HEARTS` = {10, 11} makes them fail on a single lost heart there;
  3l fails on one too.
- **A route that starts from a checkpoint must know where it is.** Level
  10's route, respawned at its checkpoint past the planks, waited for ever
  for a charge that would never come, and level 11's needed the same fix for
  its second checkpoint, past room A. Both now choose their first stage from
  where the ball starts.
- **Level 11 passed first time, and its thin number is 2c: 56% of the daze,
  against a 60% limit** — about 0.12 s of a 3 s daze to spare. The worst run
  is the lead-1.3 thumb that hesitates 0.9 s and hops once for nothing (1.69
  s); one that does not hesitate uses 21% (0.63 s). It is the same at every
  delay, because every charge in room B ends at 5734. If it ever goes over,
  the first thing to try is moving room B's door wall and gate left of 6040,
  keeping the door more than `SEE` (240) from 5734 so resting there stays out
  of sight. No run of level 11 loses a heart anywhere: both chargers are shut
  in their pens, so the route needs no `dodge`.
- **Probes have to prove they tested something.** 3m and 3n were rewritten to
  read the rooms from the level's own geometry (`room11`, `lure11`) and to
  fail if a run never got down into the yard, or never rested at the shut
  door out of sight before luring again.
- **Slowest finishes:** level 10 in 33.6 s, level 11 in 40.0 s.
- **Rendering found two things no assertion saw.** The charge's nose-down
  lean turned about the middle of the feet and pushed the front leg about 5
  CSS px into the ground; any lean now turns about the foot on the side going
  down, which fixed the daze's wobble too. And level 11's pen floors started
  at 1840 and 4740, the pen walls' inner faces, leaving a 40-wide hole in the
  ground's fill under each wall, drawn as a crack to the bottom of the screen;
  they now start at 1800 and 4700, under the walls.
- **A charge is too quick for quarter-second pictures.** It lasts under 0.3 s,
  so the browser suite stepped straight over it. It now takes pictures back
  to back from the wind-up's crouch, timed by the clock.
- **A ball still on a charger when its daze ends takes a heart**, on the
  exact frame it wakes (patrol, `stateT` 0). It happens only if the ball sits
  on the dazed charger on purpose; before the route fix, 3l at start delays
  1-2 was still steering over it when it woke. It is not fixed in the
  charger, and is documented in level 10's comment. 3l fails on a lost heart,
  and a scratch sweep of the stomp (five leads, delays 0-13 s, 265 runs)
  always landed before the daze ran out.

### Where the build departs from this spec

- **Level 10's checkpoint is after the pen, at 3300, not before it.** The plan
  put it there, out of the charger's sight (its range ends at 2800 and it
  sees 240); this spec's level-10 section says "checkpoint before the pen".
  Flagged to the user and not yet decided.
- **Level 11's button has stone filling from its post up to the roof**, not
  a "stone lip" over it. The effect the spec asked for holds — the ball can
  reach neither the cap nor the planks, which 3m proves — but the shape
  differs.
- **A patrol turns at anything solid in front of it, planks included**, not
  only at the ends of its range as the state table above says. It has to:
  without it a patrol would push uselessly into a wall or a crate. Only a
  charge breaks wood.
- **There is no "notice" state**, which the roadmap's enemy table listed
  between patrol and wind-up: seeing the ball goes straight to wind-up, and
  the wind-up is the warning. And there is a **popped** state the roadmap
  did not list, for the charger's return. The roadmap's table now says
  patrol → wind-up → charge → dazed → patrol, and popped → patrol.

### Carried over from the reviews, for the next sub-project

- `stompEnemy` asks only the first enemy the ball overlaps. Two enemies
  overlapping each other under a landing ball would be judged by whichever
  comes first in the list.
- A sender's `touched` is per sender, not per presser, so a charger's hit on
  a timer the ball is already touching is swallowed. Levels 10 and 11 have no
  timers.
- A popped charger can come back inside a crate sitting on its home: its
  return waits only for the ball. Levels 10 and 11 have no crates.
- The charger sees through walls. That is intended, and level 11 relies on
  it: the ball in the yard is seen through the pen's end.
- Decide pressers versus gate `blockers` per enemy kind. Today one field,
  `presses`, puts an enemy on both lists; a kind that should block a gate
  without pressing anything, or press without blocking, would need a
  separate field. Walkers pass through button posts. The gate-hazard check
  in `levels.mjs` still goes by kind name, so each new enemy kind has to be
  taught to it.
- `COLOURS.ENEMY` is shared by every enemy; that is fine in level 10, which
  has only the charger.

### Open questions for the user

None of these is decided.

- **Level 10's way in.** A child who hops the step without waiting loses a
  heart about 6% of the time. Is that acceptable as part of learning the
  charger, or should the level change so waiting is not needed?
- **Level 10's checkpoint:** after the pen, as built, or before it, as this
  spec says?
- **Level 11's room B** needs the child to find a sight line he cannot see:
  resting at the door is out of the charger's sight, so he has to step back
  towards the pen to be noticed. Is that learnable without text?
- **Looks, from the screenshots:** the charger is only ~30 CSS px wide at
  740×280; on level 11's roof at 740×280 the ball sits ~13 CSS px from the
  top edge just after the climb, while the camera eases; and a dazed
  charger's horns overlap the step's face in level 10.

## Out of scope

The popper upgrade, the shell, the swooper, the conveyor, and any change to
walker, roller or popper behaviour. Sound, as for the rest of the game.
