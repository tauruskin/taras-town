# Pushkar Ball — mechanisms and enemies: the roadmap for levels 8 and on

Agreed 2026-09-18. This is a **programme**, not a spec: it fixes the toolkit,
the order it is built in, and the rules every piece of it follows. Each
sub-project below still gets its own design spec, plan and build, the same
cycle every mechanic in this game has been through. Sub-project 1 is
specified in
`docs/superpowers/specs/2026-09-18-wiring-buttons-timers-bridges-design.md`,
and **built** (levels 8 and 9, 2026-09-18). Sub-project 2 is specified in
`docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md`,
and **built** (levels 10 and 11, 2026-09-19). Each spec's "What the build
taught" section is worth reading before designing the next sub-project.
**Nothing below sub-project 2 is designed yet** beyond what this page says,
and nothing should be built from this page directly.

## Why

Levels 1-7 each taught one mechanic — rolling and jumping, enemies, crates,
spikes, bounce pads, the pressure switch, the balance beam — and the later
levels bring earlier ones back. What they do not yet do is ask the player to
*work something out*: look at a mechanism, find its rule, and use it. The
request that started this was for obstacles that cannot be passed by rolling
and jumping alone, for mechanisms that are reusable instances so later levels
can combine them, and for enemies with genuinely different roles rather than
more of the same.

## Rules for every level in this programme

- **Difficulty is combination, not bigger numbers.** A later level asks for
  two things the player already knows at once, not a wider gap.
- **Every level has one stage from this progression**, stated in its header
  comment:
  1. *Introduction* — one new mechanic, somewhere nothing can go wrong.
  2. *Reinforcement* — the same mechanic with one small complication.
  3. *Combination* — two mechanics already taught.
  4. *Reversal* — a familiar mechanic used in a way that contradicts what it
     taught.
  5. *Mastery* — several mechanics together, fairly.
- **Every mechanism is an instance with its own config** in the level data,
  never a special case in code for one level.
- **Nothing hidden.** Every sender that matters can be seen, and its link to
  what it drives can be seen (see the wiring spec's lamps and wires), before
  the player has to use it.
- **No dead ends.** Every room stays solvable from every state a player can
  get it into, or puts itself back. The restart button exists and is not a
  licence to design a trap.
- **Every crate gets a dead-end check** in `finish.mjs`: can the ball get
  behind it and shove it flush against something? Both of sub-project 1's
  crate rooms could be trapped that way, no route found it, and only trying
  to break the room on purpose did.
- **A far-off receiver is shown by the camera, not by the screen's width.**
  The ball sits mid-screen, so a phone shows only ~480 units ahead; opening
  something within `CIRCUIT.SEE` leans the camera to show it (sub-project 1's
  spec).
- **No trial-and-error failures.** A player who is paying attention can see
  what is about to happen: timers show their time, enemies telegraph, bridges
  shake before they go.
- **Nothing pixel-perfect.** Any timed route is proved in `finish.mjs` with
  a stated fraction of its time to spare across the lead/delay sweep.
- **A mistake costs a room, not a level.** Checkpoints sit before each hard
  room, as they already do.
- **Every mechanic recurs.** Anything introduced is used again in at least
  one later level of this programme. If a later sub-project drops one, it
  must say so and say why.
- The hub rules hold unchanged, including Pushkar Ball's own narrow
  exception: enemies may look menacing, and **no enemy holds or throws
  anything but the popper's soft ball.**

## The toolkit

Chosen for quality over quantity from a much longer list (light and dark,
magnets, gravity zones, water, ice, lava, limited-use abilities and more were
considered and left out — each could be a later programme's).

| Piece | What it is | Sub-project |
|---|---|---|
| Wiring | senders (plate, button, timer) drive receivers (gate, bridge); AND and inverted inputs; lamps and wires show the links | 1 |
| Enemy state machines | a small shared shape every new enemy is written in | 2 (built) |
| Charger | spots the ball, winds up, charges; breaks plank walls, hits buttons | 2 (built) |
| Shell | armoured; can't be stomped; heavy enough to hold a plate | 3 |
| Popper upgrade | a visible aim arc; its lob hits buttons and cracks plank walls | 3 |
| Swooper | hovers, then dives along a telegraphed line; cover beats it | 4 |
| Conveyor | a belt that carries the ball and crates | 4 |

## The levels

| Level | Stage | Content | Sub-project |
|---|---|---|---|
| 8 | Introduction | buttons, a gate and a bridge; a two-lamp gate solved with a crate | 1 (built) |
| 9 | Reinforcement + Reversal | timers ("set up the room first", with a button detour, not a crate); an inverted plate that a crate holds *shut*, with a kerb so the crate cannot be pinned the wrong way | 1 (built) |
| 10 | Introduction | the charger, somewhere safe | 2 (built) |
| 11 | Combination | lure the charger through a plank wall and into a button; then onto a plate that holds a door open while it is dazed | 2 (built) |
| 12 | Mastery | wiring, charger, shell, popper redirection | 3 |
| 13+ | Introduction, then Combination | swooper, conveyor | 4 |

Levels are **appended** to `LEVELS`, never inserted — `save.js` stores a
count, not a set of ids.

## Enemies

Every enemy is a small **state machine with named states**. A state changes
only on a timer or a distance check, never at random, so the same situation
plays out the same way every time — which is what lets a player learn it,
and what lets Node test it without a browser, the same guarantee moving
platforms already give.

| | Walker (exists) | Popper (upgraded) | Charger | Shell | Swooper |
|---|---|---|---|---|---|
| **Role** | patrol | ranged / turret | charger | armoured | flier |
| **States** | patrol | idle → aim → fire → reload | patrol → wind-up → charge → dazed → patrol; popped → patrol (built: noticing is the wind-up) | patrol → flipped | hover → lock → swoop → climb |
| **Movement** | sine of level time over a fixed range | stationary, facing one way | slow patrol over a set range | slow patrol, turns at edges | hovers at a fixed high spot |
| **Detection** | none | ball in range on its facing side | ball on its own level, in front, within about five ball-widths | none | ball passing under its hover spot |
| **Attack** | contact costs a heart | lobs a soft ball on a parabola | fast straight-line dash until it meets something | contact costs a heart | straight dive, then climbs back |
| **Warning** | none needed — fully predictable | dotted aim arc for 1s before firing | a puff and a crouch, pawing the ground, for 0.8s | the shiny shell itself says a stomp won't work | dotted dive line for 0.8s |
| **Counterplay** | stomp, or time the pass | stand outside the arc; it cannot hit behind itself | jump the dash; stomp it while dazed | drop a crate on it, or send a charger into it — either flips it | stand under cover; keep moving |
| **Uses the world** | no | lob hits buttons, cracks plank walls | dash breaks plank walls, hits buttons; holds a plate while dazed | holds a plate down while standing on one | no — its job is removing safe standing places |
| **Puzzle role** | timing and position | *redirect it*: stand so the lob lands where you can't reach | *lure it*: stand beyond a wall or button so the dash does the work | a moving weight on a plate to be trapped or removed | pressure during timed routes |
| **Not frustrating because** | — | arc always drawn; range never covers a checkpoint | always telegraphs; dazed long enough to stomp; never charges off a ledge | slow; never chases | never dives at a checkpoint or a button; one dive per pass |

The roller stays as it is: a hazard that happens to move, not one of the
roles above.

Everything that can press a button or weigh a plate — ball, crate, and each
enemy that uses the world — reaches the wiring through the same *presser*
list the wiring spec defines, so sub-projects 2-4 add enemies to that list
without changing the wiring itself.
