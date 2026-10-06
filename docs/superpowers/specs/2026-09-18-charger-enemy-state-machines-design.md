# Pushkar Ball — sub-project 2: enemy state machines and the charger (levels 10–11)

Agreed 2026-09-18, and **built** 2026-09-19 as levels 10 and 11; the open
questions that build left were all decided on 2026-09-20, at the end of this
page, so nothing here is still pending.
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

Level data: `{ kind: 'charger', x, y, from, to, dir?: 1|-1, see? }`. `x, y` is
its home, and `see` is how far ahead it notices the ball — the level's to set,
`SEE` when it does not. Every number below lives in `CONFIG.ENEMY.CHARGER` and is a guess
awaiting a thumb.

**Movement.** Through `physics.step`, like the roller, so gravity, slopes,
gates, stone and crates stop it with no special case. It never leaves
`[from, to]` — patrolling or charging. The `levels` suite requires unbroken
ground under every charger's whole range (plus its radius each side), which
is what proves "never charges off a ledge" without a browser.

**States.**

| State | What it does | Ends when | Next |
|---|---|---|---|
| patrol | walks at `PATROL_SPEED` (~120), turns at the ends of its range | ball on its own level (`|ball.y − y| < LEVEL_TOL`), in front, within its sight (`SEE`, ~240, unless the level says otherwise) | wind-up |
| wind-up | stands, crouches, paws, puffs; keeps its facing | `WINDUP` (0.8 s) | charge |
| charge | straight dash at `CHARGE_SPEED` (~480, faster than the ball's 420; a jump clears it) | meets stone, a gate, a button's post, a crate, or the end of its range | dazed |
| dazed | stays put; stars circle it and visibly count down | `DAZED` (3.5 s) | patrol |
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
  button's face cannot be reached by the ball — stone fills its post up to
  the roof, and the gap between the planks and the post is 30, narrower than
  the ball — but the charger's dash can reach it. The ball stands beyond the
  button, the charger sees it, charges, breaks the planks, presses the
  button, and ends dazed against the post. Wire and lamps show the link, as
  in level 8. The exact layout is the plan's to find, under one constraint
  the `finish.mjs` probes enforce: the ball can neither press that button nor
  break those planks itself — only the charger can.
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

The rest of this section is what the 2026-09-20 pass over the open questions
taught, which was mostly about the suites rather than about the charger.

- **A bug nobody had reported, on a shipped level.** Proving
  `CAMERA.TOP_CLEAR` out found that before it an ordinary bounce off level 5's
  pad took the ball's centre 30-40 world units *above* the top of the view at
  740×280 — the whole ball, radius 20 and all, gone from the screen.
  `offline/pads` passed throughout and always had, because it tests what the
  pad does to the ball and nothing anywhere was asking where the camera was
  pointing. The lift at pad height is now part of
  `tests/offline/camera.mjs`, which prints the clearance for every screen on
  every run, and `tests/browser/small.mjs` now photographs the top of a bounce
  on both small screens — the half that would have found it.
- **A check written against a constant that does not exist yet passes in
  silence.** The camera check was specified as
  `if (highest <= CONFIG.CAMERA.TOP_CLEAR) fail(...)`, and was written before
  the constant was added. Every comparison in the section was therefore
  NaN-false: the suite printed a contented line while, at 740×280, a 300-unit
  climb was leaving the ball's centre some 65 units *past* the top of the
  view. A `Number.isFinite` guard on the constant now stands in front of the
  checks and says so instead.
- **A browser suite photographed the wrong room and passed.** `chargers.mjs`
  in `tests/browser` drives level 11 to room B. With the gap jump
  mistimed the ball fell, respawned at the checkpoint *before* room A, rolled
  to room A's door, stood there and was let through — and the suite wrote a
  picture named `roomB` showing room A with one heart of three, over a
  perfectly plausible timing for room B's door. Nothing in the route could
  tell the two doors apart from outside. It was found by breaking the route
  on purpose, not by running it. Each picture is now held to the one thing
  that cannot happen on a clean run: the lit heart pixels are counted before
  and after it.
  The trap met while building that guard is worth carrying — `COLOURS.STAR_ON`
  is byte-identical to `COLOURS.FLAG`, and level 11's flag stands in shot in
  room B's yard, so a whole-canvas count would have been polluted exactly
  where it was needed. The count reads the hearts' own corner, its geometry
  asked of `Hearts` in `ui.js`.
- **Two numbers written into comments were wrong, and both were back-computed
  rather than measured.** Review caught both; no suite could have. One was a
  "46 units" of room B door slack that was the answer to a superseded question
  — the real bound is 34, and it runs the other way. The other was a set of
  settled-camera figures (235, 271, 309) derived so that subtracting a jump
  from them would land near the apex, and credited to `camera.mjs`, which
  never computed them; the measured figures are 231, 267 and 304, and the
  apex is printed. The habit worth keeping: for every number put in a comment,
  say whether the suite prints it, it was derived from `config.js`, or it was
  simulated — and do not write one that is none of the three.

### Where the build departs from this spec

- **Level 10's checkpoint is after the pen, at 3300, not before it.** The plan
  put it there, out of the charger's sight (its range ends at 2800 and it
  sees 240); this spec's level-10 section says "checkpoint before the pen".
  **Settled 2026-09-20 by having both** — see the decisions below.
- **Level 11's button has stone filling from its post up to the roof**, not
  a "stone lip" over it. The effect the spec asked for holds — the ball can
  reach neither the cap nor the planks, which 3m proves — but the shape
  differs. **Accepted 2026-09-20**, and the room A paragraph above now says
  what is built: a lip is the more fragile of the two shapes, a thin ledge
  with a ball-sized world underneath it, and nothing is gained by asking the
  level for one.
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
- A charger's sight is now **per-instance**: `e.see` in the level data,
  falling back to `CONFIG.ENEMY.CHARGER.SEE`, which is the roadmap's "every
  mechanism is an instance with its own config" applied to an enemy. Anything
  that used to reach for the config's number must ask the loaded enemy
  instead; `levels.mjs`'s checkpoint-out-of-sight check and `finish.mjs`'s
  lure band both do now. A new enemy with a range worth tuning per level
  should be built that way from the start.
- `COLOURS.ENEMY` is no longer shared by the charger: it has its own
  `CHARGER_BODY` and `CHARGER_EDGE`. That is the shape the shell and the
  swooper should follow — an enemy whose rules differ wants its own colour,
  and a browser suite that counts pixels of it wants one too.
- **A popped charger's debris once burst in `COLOURS.ENEMY` violet**, not in
  its own blue, which a child does see because level 10's optional lesson is
  stomping a dazed one. Fixed in sub-project 3 (`334e2b5`): each kind carries
  a `popShade`, and a charger's debris is `COLOURS.CHARGER_POP` (`#7FA8E0`),
  a paler blue than `CHARGER_BODY`. Not the body colour itself:
  `tests/browser/chargers.mjs` finds the charger by counting `CHARGER_BODY`,
  so debris in it would be counted as charger while it flew.

### The open questions, decided (2026-09-20)

All of them, in a pass over the built levels. Five needed code; three needed
only a decision.

**Level 10's way in — accepted.** A child who hops the step blind still loses
a heart about 6% of the time, and that stands. It is not a shrug: the reason
is structural. The ball and the charger share one floor and a jump clears 131,
so there is no safe strip in the pen that cannot be hopped out of. A kerb
inside the step only moves the landing; a wider dead zone only lowers the odds,
because a running jump carries about 290. Moving the charger's home was already
known not to work. What defends the child is the 0.8 s crouch-and-paw — the
charger's whole contract — and the step he can watch it from, which nothing can
reach him on. The cost is one of three hearts, instantly undone. The full
reasoning is in level 10's header comment in `js/levels.js`, beside the
`PEN_GUARD` note it replaces, so the level says why rather than this page
alone.

**Level 10's checkpoint — both.** One added at 1150, before the pen and out of
the charger's sight (its range starts at 1486 and it sees 240, so 1246 is the
limit), and 3300 kept. The first stops three hearts spent in the pen costing
the walk up to it; the second stops a death later in the level making him do
the charger over again. There was never a reason to choose.

**Room B's margin — the daze got longer, not the door closer.** `DAZED` is
3.5 s, up from 3.0, and 2c now reports 48% of it against its 60% limit. The
honest reading of the thin number was that the room always had its 1.31 s of
real slack and it was the limit that was tight; `DAZED` is in `config.js`
precisely because it is a guess awaiting a thumb, and a longer daze is the
right direction for both levels that introduce the charger — level 10 only
gets an easier stomp out of it. This spec's own suggested fix, pulling room B's
door left, was examined and rejected, and the reason is worth recording: it was
the answer to a question that no longer exists. See the next paragraph.

**Room B's invisible sight line — the charger was given a wider one.** That
charger now carries `see: 320` in the level data, against the default 240, and
a charger's sight is per-instance from here on. The whole yard is inside it:
the furthest a ball can rest from where the charge ends (5734) is the door
itself, 286. So a child who misses the door and simply waits at it is noticed
where he stands, instead of having to find a sight line nothing on screen ever
showed. This **inverts the old requirement** — room B used to need the resting
spot out of sight and now depends on its being in sight — which is why moving
the door left is no longer the fix it was. The bound runs the other way now: a
resting ball sits at 6020 and sight reaches 6054, so the door has 34 units of
room to the *right* before the lure stops working. `finish.mjs`'s 3n is the
check.

**The charger's width at 740×280 — accepted, no code.** It is the whole world
that is drawn smaller on that screen, not the charger; the horns, the brow and
the narrowed eye all still separate at that size. The screenshots are the
evidence, which is the only kind this question could have had.

**The ball against the top edge on level 11's roof — fixed in the camera, not
in the level.** A new `CONFIG.CAMERA.TOP_CLEAR` (75 world units) is a hard
floor under the slow vertical follow: the ball's centre is never drawn nearer
than that to the top of the view. It only ever moves the camera up, and only
when the ball has climbed faster than `LERP_Y` can ease, so an ordinary jump
never engages it — which `camera.mjs` proves on every screen by printing the
apex, tightest at 104 against the 75. Proving it out turned up more than it was
asked to; see "What the build taught".

**The shared enemy colour — the charger has its own.** `COLOURS.CHARGER_BODY`
and `CHARGER_EDGE`, a blue. The reason is level 12: it is the Mastery level and
puts charger, shell and popper in one room, and the charger is the one whose
stomp rule is conditional — safe only while dazed — so it is the one that must
never read as another enemy. It also makes the browser suite's pixel count of
it honest, instead of leaning on "level 10 has no other enemy".

**The dazed charger's horns overlapping the step — accepted.** About 3 CSS px
of the step's face in level 10. It charged into it, and that is what that looks
like.

### Open after this pass

- **Level 11's room B makes a child wait.** `finish.mjs`'s 3n measures the wait
  at the shut door, after a missed door, at **15.6 seconds** of standing
  perfectly still. That is a full patrol: the charger notices the ball only
  while walking towards it, so after a daze it walks the length of the pen and
  comes back — and the pen's end wall is solid stone, so from the yard the
  child cannot watch it coming. The room is no longer a dead end, which is what
  the change was for, but the feedback is slow enough that a child might decide
  nothing is going to happen. Shortening that charger's `from` (4766, the pen's
  far end today) would halve the cycle, at the cost of a shorter patrol to
  watch on the way in.

## Out of scope

The popper upgrade, the shell, the swooper, the conveyor, and any change to
walker, roller or popper behaviour. Sound, as for the rest of the game.
