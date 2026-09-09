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

This is **phase 1**, and phase 1 is only about how the ball feels. One
hand-built level, a flag at the end that does nothing when you reach it, and
that is the whole game.

Falling down a hole is the one way to fail, and it costs nothing: the ball
reappears at the start of the level immediately, with the camera already there.
No lives to run out, no screen to dismiss, no wait. That is the hub's rule
rather than a design flourish — where a game can be failed, failing has to be
harmless and instantly undone.

Deliberately absent, and not to be built ahead of time: hazards, enemies,
gems, lives, checkpoints, a menu, a level-select screen, saved progress, and
sound of any kind. Every number in `js/config.js` is a guess until somebody has
played it with a thumb, and anything built on top of those numbers before that
happens is work thrown away. The plan for phases 2 to 4 is in
[`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`](../../docs/superpowers/specs/2026-09-08-pushkar-ball-design.md).

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

Every one is a picture, never a word. A keyboard works at the same time and
neither disables the other, so a phone with a keyboard attached does not have
to choose: **←/→ or A/D** to roll, **space, ↑ or W** to jump.

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
| `js/player.js` | the ball: acceleration, friction, jump, coyote time, buffering, spin, pushing, respawning | never |
| `js/camera.js` | follow with lookahead and a vertical deadzone, clamped to the level | never |
| `js/ui.js` | where every on-screen button is, and what it looks like | canvas only |
| `js/input.js` | the on-screen buttons and the keyboard, as one thing | yes |
| `js/main.js` | canvas sizing, the loop, and the drawing of the world | yes |

**The five modules marked "never" must stay that way.** They must not touch
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

**If it is wood, you can push it. If it is stone, you cannot.** That rule holds
everywhere with no exceptions, which is the only way a six-year-old is going to
learn it — there is no text to explain it and there is not going to be any. The
level's boundary walls are boxes in the data exactly like a crate is, and they
used to be drawn in the same wood; they are stone now, because the day crates
started moving, that shared colour became a picture telling a child to keep
shoving at something that will never give.

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
}
```

**Moving platforms are a sine of level time**, not integrated velocity. Two
things worth having fall out of that: the level looks identical on every
attempt, so a player learns the timing instead of re-reading it; and a test can
assert where a platform is at time *t* without running the game at all.

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

## Tests

```
node games/pushkar-ball/tests/run.mjs offline
```

That is the one to use while working — no browser, a couple of seconds. See
[`tests/README.md`](tests/README.md) for the rest, and for the two rules that
matter: the browser suites find the ball by it being the only red thing on the
screen, and no test may ever contain a button coordinate.
