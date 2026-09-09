# Pushkar Ball

A rolling ball you push around a hilly landscape: momentum you have to manage,
slopes that read as slopes, a jump that forgives a late thumb, and platforms
that slide back and forth on a schedule you can learn. No violence, nothing
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
| `js/physics.js` | segments, the broad-phase grid, circle-vs-segment resolution, the step | never |
| `js/levels.js` | the level data, the loader that expands it, moving platforms | never |
| `js/player.js` | the ball: acceleration, friction, jump, coyote time, buffering, spin | never |
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
  boxes:     [ { x, y, w, h } ],
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
