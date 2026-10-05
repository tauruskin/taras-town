# Pushkar Ball

A rolling ball you push around a hilly landscape: momentum you have to manage,
slopes that read as slopes, a jump that forgives a late thumb, platforms that
slide back and forth on a schedule you can learn, and wooden crates you can
shove around to reach places the jump alone will not. No violence, nothing
scary, and almost no words on the screen.

**Play:** https://tauruskin.github.io/taras-town/games/pushkar-ball/ (or tap
its tile from the hub at https://tauruskin.github.io/taras-town/)

It is an original game. It takes its feel from the Red Ball games and nothing
else from them — no artwork, no names, no level layouts.

---

## What is here, and what is not

**Eleven levels**, chosen from a level-select screen rather than played in a
fixed order: level one is always open, and finishing a level opens the next
one. A tile shows its level's number, a star once it is finished, a highlight
on the one open tile not yet finished, and an unresponsive padlock on anything
still locked. Progress — which levels are open, which are finished — is saved
on the device, and a private-mode browser, or any storage that refuses to
save, gets a playable game with no memory rather than an error.

Losing all three hearts, or falling down a hole, sends the ball back to its
level's last checkpoint — the start of the level, if none has been reached yet
— and costs nothing else: no screen to dismiss, no wait, and nothing that
follows the player between attempts except the hearts refilling. That is the
hub's rule rather than a design flourish — where a game can be failed, failing
has to be harmless and instantly undone.

Deliberately absent, and not to be built ahead of time: gems, and sound of any
kind. Every number in `js/config.js` is a guess until somebody has played it
with a thumb, and anything built on top of those numbers before that happens
is work thrown away. The original plan is in
[`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`](../../docs/superpowers/specs/2026-09-08-pushkar-ball-design.md);
level select and the corner buttons were added later and are documented in
[`docs/superpowers/specs/2026-09-15-level-select-and-corner-buttons-design.md`](../../docs/superpowers/specs/2026-09-15-level-select-and-corner-buttons-design.md),
the wiring of levels 8 and 9 in
[`docs/superpowers/specs/2026-09-18-wiring-buttons-timers-bridges-design.md`](../../docs/superpowers/specs/2026-09-18-wiring-buttons-timers-bridges-design.md),
and the charger of levels 10 and 11 in
[`docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md`](../../docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md).

## How it's built

Plain HTML, CSS and JavaScript ES modules. No framework, no build step, no
dependencies. **The files in this repository are exactly the files that get
served.**

Nothing is loaded from another website, and **there are no image files and no
audio files at all** — every hill, crate, flag and the ball itself is drawn
with shapes by the code, and when this game gets sound it will be synthesised
in code. Nothing leaves the device: no accounts, no analytics, no third-party
requests, and this game has no network code in it whatsoever.

## Running it on your own computer

From the **repository root**, not from this folder:

```
python -m http.server 8778
```

Then open <http://127.0.0.1:8778/games/pushkar-ball/index.html>.

Serving from the root matters, and so does the fact that every path in the
game is relative. GitHub Pages serves this site from a sub-folder, so a leading
`/` on any path silently looks at the top of the whole site instead and the
file is quietly not there.

## Controls

Touch first, because the hub is a phone app:

| Where | What |
|---|---|
| Bottom left, two round buttons | roll left, roll right |
| Bottom right, the big one | jump |
| Top right, two small round buttons | restart the level (curved arrow), level select (grid) |

Every one is a picture, never a word. A keyboard works at the same time and
neither disables the other, so a phone with a keyboard attached does not have
to choose: **←/→ or A/D** to roll, **space, ↑ or W** to jump.

The results panel that appears on finishing a level carries the same two
pictures: a curved arrow to play the level again, and a grid to level select.
Level select itself has the house, top-left, back to the hub of all games.

**Every button's position comes from `js/ui.js`**, and `js/config.js`'s `UI`
block holds its size. Nothing else may decide where a button is, and no test
may ever contain a button coordinate — see `tests/README.md` for what happens
when one does.

## The modules

| File | What it does | Touches the DOM? |
|---|---|---|
| `js/config.js` | every tunable number and colour | never |
| `js/physics.js` | segments, the broad-phase grid, circle-vs-segment resolution, the step, and the two box questions a crate asks | never |
| `js/levels.js` | the level data, the loader that expands it, moving platforms, crates | never |
| `js/enemies.js` | walker, roller, popper and charger; the state-machine shape every new enemy is written in | update never; drawing on a canvas handed in |
| `js/circuits.js` | wiring: plates, buttons, timers, the AND/NOT needs, and the drawing of lamps, wires and bridges | canvas only, handed in |
| `js/player.js` | the ball: acceleration, friction, jump, coyote time, buffering, spin, pushing, respawning | never |
| `js/camera.js` | follow with lookahead and a vertical deadzone, clamped to the level | never |
| `js/ui.js` | where every on-screen button is, and what it looks like | canvas only |
| `js/input.js` | the on-screen buttons and the keyboard, as one thing | yes |
| `js/save.js` | which levels are open and finished, in `localStorage` under `pushkar-ball-save`; the storage is handed in, and every failure gives a fresh game | never |
| `js/main.js` | canvas sizing, the loop, and the drawing of the world | yes |

**The modules marked "never" must stay that way.** They must not touch
`document`, `window`, `Image` or `Audio`, at import time or in their update
paths. This is not tidiness — it is the whole reason the simulation can be
imported straight into Node and tested exactly, in a couple of seconds, with
no browser anywhere. Drawing belongs to the caller.

`js/main.js` holds the loop and the drawing and nothing else. Taras Town's
`main.js` reached 1800 lines by becoming the place anything went when it had no
obvious home. That is a cost being paid over there, not a pattern to copy: HUD
drawing belongs in `ui.js`, and an entity's update and drawing belong with the
entity.

## How the physics works

**Everything solid is a line segment.** A box is four segments, a slope is one,
a bowl is a polyline of several. There is no other kind of collider. That one
decision is what makes a rolling ball worth having: a grid of tiles is simpler
to write and has no honest slopes, and slopes are the entire point of a ball.

**A segment's normal comes from its winding order**, never from a hand-written
number: the normal is the left-hand perpendicular of `a → b`, and *only that
side is solid*. So ground polylines are **authored left to right**, which puts
their solid side up. Author one right to left and you get ground you fall
straight through, which is the one likely mistake — so the loader marks
polyline segments and the `levels` test suite fails on any whose normal does
not point upward.

**Screen coordinates throughout: y increases downward.** Gravity is positive,
and an upward-facing normal has `ny < 0`. Getting that backwards is the easiest
way to lose an hour in here.

**The step is a fixed 1/120 s**, driven by an accumulator fed from
`requestAnimationFrame`, with the frame delta clamped so a backgrounded tab
cannot hand back one enormous jump and fast-forward the ball through the floor.
Fixed-step is why the physics is identical on a 60Hz phone and a 144Hz monitor,
why a whole family of bugs where jump height depends on frame rate cannot
happen, and — because it makes the simulation deterministic — why Node can
test it at all. A step that would move the ball more than half its radius is
subdivided; at the tuned speeds that never fires, and it is the difference
between a fast ball and a ball that tunnels.

**Being on the ground is derived, never declared.** The terrain does not set a
flag. Resolution returns the contacts it made, and if any of them had a normal
pointing mostly up the ball is grounded and its coyote timer resets. That is
what makes jumping off a slope, off a crate, off a moving platform and out of a
bowl all work without a single special case for any of them.

Two smaller things that exist because of specific bugs: below `REST_EPS` an
impact is absorbed rather than bounced back, or a resting ball jitters for ever
and never reads as grounded twice running, which makes jumping fail at random;
and resolution runs twice per sub-step, because two segments meeting at a
corner each push the ball out and the second can undo part of the first.

## The forgiveness in the jump

Three things nobody notices when they work and everybody feels when they do
not, all in `js/player.js`:

- **Coyote time** — a jump still works for `COYOTE` seconds after the ball has
  left the ground, so running off an edge and jumping does what you meant.
- **Jump buffering** — a press up to `BUFFER` seconds *before* landing fires on
  landing, so an early thumb is not simply ignored.
- **Moving platforms carry you** — while grounded on one, the platform's
  movement is added to the ball's position, and its velocity is added to the
  ball's on jump. Without that second half, jumping off a moving platform feels
  broken in a way players notice and cannot name.

Jump is a **consumed press**, not a held button. Held would bounce the ball off
anything it touched, for ever.

## Crates

**Wood gives way; stone never does.** That rule holds everywhere with no
exceptions, which is the only way a child is going to learn it — there is no
text to explain it and there is not going to be any. A crate gives way by
sliding. A plank wall — upright boards with daylight between them — gives way
by breaking, when the ball rolls into it at `BREAKABLE.SPEED`; a slower knock
rattles and cracks it, and once broken it stays broken for the rest of the
level. The level's boundary walls are boxes in the data exactly like a crate
is, and they used to be drawn in the same wood; they are stone now, because
the day crates started moving, that shared colour became a picture telling a
child to keep shoving at something that will never give.

A crate is deliberately **not** a general rigid body. It moves sideways only
when something pushes it, and downwards only by falling straight onto whatever
is under it. It cannot tumble, spin, or slide off on its own. That is a
restriction worth having rather than a shortcut: the one genuinely bad thing a
crate could do is end up somewhere that makes the level impossible, and a crate
that only ever goes where it is pushed cannot manage that by itself.

The rest of what keeps a crate safe:

- **It cannot be pushed into anything.** A move that would end with the crate
  inside a wall, another crate or the ground is refused outright. The ball
  pushing it has no idea what is on the far side, so this is the only thing
  between a child and a crate shoved out through the level's boundary.
- **A small rise lifts it instead of stopping it** (`CRATE.STEP_UP`), so a
  crate can be walked up the foot of a slope but is still stopped dead by
  anything wall-shaped.
- **A crate pushed into a hole comes back**, to exactly where the level put it.
  A crate with nothing under it falls for ever, and "gone for ever" would one
  day mean a level a child has permanently broken with no way to undo it.
- **It slides at its own speed** (`CRATE.PUSH_SPEED`, 150) rather than the
  ball's (420), which is what makes it feel heavy, and the ball is held to that
  speed while pushing.
- **Standing on one does not push it.** A push has to be a side-on contact
  (`CRATE.PUSH_NX`) *and* in the direction the player is asking for. Without
  the first, the ball shoves the crate along while sitting on top of it, which
  looks like the crate is haunted.

**A crate is something the ball stands on, which makes it a carrier exactly
like a moving platform, and it has to answer the same four questions:** `dx`,
`dy`, `vx`, `vy`. This is not tidiness. `player.js` adds `platform.dx` to the
ball's position without asking whether it exists, so a crate without a `dx`
made that `undefined`, the ball's position became `NaN` on the first frame it
stood on a crate, and the ball vanished from the level with nothing logged
anywhere. Anything new that can be stood on owes the same four.

Nothing in level one *needs* a crate — there is no spot in it a jump cannot
already reach, and the crates are there so the mechanic is in a child's hands
from the first level. A level built around a crate belongs with phase 2's level
design. That a crate can genuinely reach the unreachable is proved in
`tests/offline/crates.mjs`, on a level built for it, with a ledge placed higher
than `JUMP_V² / 2·GRAVITY` so the jump provably cannot clear it from the floor.

## Wiring

Levels 8 and 9 are built from **senders** that drive **receivers**, all in
`js/circuits.js`. A *plate* is level six's switch: on while something heavy
rests on it, which today means a crate and never the ball. A *button* is a
cap on one side of a short stone post: anything that hits the capped side
presses it, and it stays pressed. A *timer* is a button with a ring round the
cap that drains over `time` seconds and then lets go. The one sentence a child
can learn from those, with no text to help: *heavy things hold plates down;
anything that hits a button presses it.* A gate slides up and a bridge slides
out across a gap while powered, and each lists what it `needs` — every id on,
and an id written `!id` off. AND and NOT, nothing more.

Every sender has a lamp in its own colour, and every receiver has one lamp per
input on a thin signal pole planted in the ground; an inverted input's lamp is
a **ring**, lit while its sender is *off*. The rule is the same everywhere:
*light every lamp on the door.* A sheathed wire runs from each sender to each
receiver it drives and lights with it, so before pressing anything the player
can see what it will do. The pole does not move: a gate's lamps used to ride up
with the gate, straight into the corner buttons. Because the camera keeps the
ball in the middle, a phone shows only about 480 units ahead, and a sender can
be up to `CIRCUIT.SEE` (900) from what it drives — so when something the
player did opens a door or a bridge within that distance, the camera leans to
show it for `CAMERA.REVEAL_TIME` and eases back, never letting the ball within
`REVEAL_MARGIN` of the edge. Only an opening: a timer running out behind the
player shuts its door without dragging the camera back.

The rules that keep it fair. **A hit is the moment of touching**, not the
touching, or a ball parked against a timer would hold its door open for ever;
resting on top of a post presses nothing. **A respawn resets buttons and
timers**, which is only safe because no checkpoint sits between a sender and
what it drives, and a sender is within `CIRCUIT.SEE` of its receivers —
`levels.mjs` enforces both. **A gate never closes onto the ball, a crate or a
charger** under its closed footprint; it holds and finishes closing once they
have moved, and since it asks only about those, `levels.mjs` forbids spikes,
walker patrols, roller ranges and charger ranges under any gate — a charger
because a gate hanging open over one looks just as broken as one closing
through it. **A bridge's top is its only solid part**, it slides
out from under what stands on it rather than carrying it, and it shakes for
its last `CIRCUIT.WARN` second before a timer withdraws it; it still owes
`dx`/`dy`/`vx`/`vy` like every carrier. And **every crate gets a dead-end
check**: level 8 and level 9 each had a way for the ball to get behind a crate
and shove it flush against something, leaving a room that cannot be failed and
cannot be finished. Both were found only by trying to break the room on
purpose, and `finish.mjs` (3g, 3k) now tries. Bad sender or bridge data — a
timer with no time, a plate with no width, a bridge with no width or a
direction that is neither way — throws when the level loads rather than
building a door that can never open. The rest, including what was tried and
thrown away, is in the spec.

## The charger

Levels 10 and 11 add the first enemy that uses the world rather than just
standing in it. It lives in `js/enemies.js` beside the walker, roller and
popper, and like the roller it moves through the real physics, so stone,
gates, crates and slopes stop it with no special case for any of them.

It has five states, and each ends in exactly one way:

- **patrol** — walks its range at `PATROL_SPEED`, turning at either end or
  at anything solid in front, planks included: only a charge breaks wood.
  Ends when the ball is in front of it, on its own level (`LEVEL_TOL`) and
  within `SEE`.
- **wind-up** — stands still, crouches and paws the ground for `WINDUP`
  seconds. That is the warning, and it always comes.
- **charge** — a straight dash at `CHARGE_SPEED`, faster than the ball, so the
  answer is a jump, not a run. A plank wall does not end it: the charge
  breaks the wall and goes on. It ends at the end of its range, or against
  anything else solid — stone, a gate, a button's post, a crate.
- **dazed** — sits still with stars circling it for `DAZED` seconds, one star
  going each third, because a timer the player needs must show its time.
  Then it patrols again.
- **popped** — gone, for `RETURN` seconds at least, and until the ball is out
  of `SEE` of its home. Then it is back at home with a puff, facing the way
  the level first put it.

**Only a dazed charger can be stomped, and only a dazed one is harmless.**
Any other contact costs a heart, a landing from above included; dazed, the
ball can roll straight through it or pop it. `stompable` and `harmless` are
how it tells `stompEnemy` and `hazardKnockDir` so. The lesson is *let it
charge, then stomp*. It always comes back after a pop, everywhere, so no
level that needs a charger as a tool can be left unfinishable by popping it
early.

What it does to the world: a charge breaks plank walls, shoves a crate
`CRATE_SHOVE` on through the crate's own push (so it can never wedge one
inside anything), and presses a button whose capped side it touches — any
touch of the cap presses it, as for the ball, and in practice that touch is
a charge. It holds a plate down **only while dazed** — heavy all the time would let a
patrol open a door by walking over its plate. It reaches the wiring through
four fields every enemy may carry, `presses`, `blocks`, `heavy` and `grounded`.
`Level.update` reads `presses` to put it on the presser list (button hits, and
plates when it is heavy) and `blocks` to put it on the blocker list; a closing
gate therefore never comes down on it.

**The charger is written in a small state-machine shape, `enterState` and
`runStates`, and every new enemy is written in it.** An enemy has a `state`,
a `stateT` (seconds in it) and a table of named states, each with an
`update` that returns the next state's name or nothing, and an optional
`enter`. A state changes only on a timer, a distance check or a contact,
never at random, so the same situation plays out the same way every time — which is
what lets a child learn it and Node test it. Walker, roller and popper
predate the shape and are deliberately left as they are, because their
levels were tuned against their exact maths.

Level 10 introduces it in a pen with nothing else in it that can hurt: its
first charge ends dazed against the stone step the ball came in over, and a
later one breaks the pen's plank wall. Level 11 uses it twice, each time in
a closed pen under a stone roof the ball crosses without being seen: in room
A a charge breaks planks and presses a button the ball cannot reach, and in
room B the charge ends dazed on a plate, and the door is open for as long as
it sits there. The ball can never get into either pen, so the room's tool can
never be stomped out of the way.

## Levels are data

A level is a plain object; the loader expands it into segments, moving
platforms and the broad-phase grid. Nothing is drawn pixel by pixel and no
geometry is worked out at draw time.

```js
{
  id: 1,
  theme: 'hills',
  bounds: { w: 4800, h: 1080 },
  spawn:  { x: 200, y: 560 },
  goal:   { x: 4660, y: 680 },
  ground: [                                  // polylines, AUTHORED LEFT TO RIGHT
    [[40, 760], [900, 760], [1250, 600]],
  ],
  boxes:     [ { x, y, w, h },                     // scenery: stone, immovable
               { x, y, w, h, movable: true } ],   // a wooden crate
  platforms: [ { x, y, w, h, axis: 'x', dist: 200, period: 4, phase: 0 } ],
  spikes:    [ { x, y, w },                        // SPIKE.H tall
               { x, y, w, h },                     // authored height
               { x, y, w, rise: { period, phase } } ], // rises to SPIKE.RISE_H and back
  breakables:[ { x, y, w, h } ],                   // a plank wall
  senders:   [ { id, kind: 'plate', x, y, w },            // held by a crate
               { id, kind: 'button', x, y, face },         // latched; face 'left' | 'right'
               { id, kind: 'timer', x, y, face, time } ],  // lets go after `time` s
  gates:     [ { x, y, w, h, needs: ['a', '!b'] } ],        // all lamps lit → open
  bridges:   [ { x, y, w, dir, needs } ],                   // slides out across a gap
}
```

**Moving platforms are a sine of level time**, not integrated velocity. Two
things worth having fall out of that: the level looks identical on every
attempt, so a player learns the timing instead of re-reading it; and a test can
assert where a platform is at time *t* without running the game at all.

**A new level must be appended to `LEVELS`, never inserted in the middle.**
`save.js`'s `unlocked` is a *count* of how many levels from the start are open,
not a set of unlocked ids — it has no idea which level is which, only how far
into the list play has reached. Inserting a level shifts every id after it
down the list, so a player with existing saved progress would find levels
silently relocked or wrongly unlocked the next time they opened the game.

## Changing how it feels

**`js/config.js` is the only file you need to open.** Every number about the
ball, the camera, the hills and the controls is in there, nothing in it imports
anything, and the page just needs reloading. If the roll is too slow, the jump
too floaty or the stop too sudden, that is the file — not `player.js`, and
certainly not a number typed into some other file.

Every screen sees **the same amount of world vertically** (`VIEW_H`), so a
small phone sees a little less horizontally rather than seeing less of the
level. A platformer where the small screen shows less of what is coming is
secretly harder on the small screen, which is not a difficulty anybody chose.

**Where the ball sits on that screen is worked out per screen**, by
`Camera.biasFor`, because the two things that want to decide it disagree.
`CAMERA.GROUND_AT` wants a resting ball's feet a fraction of the way down, so
the horizon looks the same on a phone and a monitor. The thumb buttons want the
ball above them by `GROUND_CLEAR`, and they take a fixed 124 CSS pixels — a
tenth of a tall window, but 44% of a 280px one. The buttons always win, so
`GROUND_AT` is a target honoured where there is room and given up where there
is not: about two fifths of the screen is land on a monitor, closer to a half
on the shortest phone, and `tests/offline/camera.mjs` asserts both halves of
that rule rather than one number that could only be right on one screen.

## Tests

```
node games/pushkar-ball/tests/run.mjs offline
```

That is the one to use while working — no browser, a couple of seconds. See
[`tests/README.md`](tests/README.md) for the rest, and for the two rules that
matter: the browser suites find the ball by it being the only red thing on the
screen, and no test may ever contain a button coordinate.
