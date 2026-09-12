# Tests

```
node games/pushkar-ball/tests/run.mjs
```

That is the whole thing. It starts a web server and a browser, runs every
suite, tells you what passed, prints the full output of anything that failed,
and shuts everything down again.

One browser, not two — this game has no multiplayer, so there is no second
player to run. That is also why its ports differ from Taras Town's: both games'
suites should be runnable at the same time.

**Nothing to install.** Node 22 has a global `WebSocket`, which is enough to
drive Chrome over its DevTools Protocol, so the tests have no dependencies —
the same rule the game itself follows.

You need **Node 22 or newer**, **Chrome**, and **Python** (only for the little
web server; ES modules will not load from a `file://` page).

## Running less than everything

```
node games/pushkar-ball/tests/run.mjs offline     no browser, a couple of seconds
node games/pushkar-ball/tests/run.mjs browser     the ones that drive a real browser
node games/pushkar-ball/tests/run.mjs roll        any suite whose name contains "roll"
node games/pushkar-ball/tests/run.mjs --live      test the DEPLOYED site, not a local copy
```

**`offline` is the one to use while working.** It imports the DOM-free modules
straight into Node and runs the real arithmetic in a couple of seconds, with no
browser anywhere. Reach for the full run before a commit or a deploy, not while
iterating.

`--live` is the one to run after a deploy. It catches what a local copy never
will: a missing file, or a path with a leading slash that works locally and
looks at the top of the whole site on GitHub Pages.

Files beginning with `_` are shared helpers, not suites, and are skipped.

## What is in here

### `offline/` — no browser

| Suite | Checks |
|---|---|
| `physics` | A ball dropped on flat ground comes to rest exactly its radius above it and stays there. It accelerates downhill on a slope. It never ends a step inside a segment. Fired at a wall at full speed it does not pass through. Jump height matches the closed-form `JUMP_V² / 2·GRAVITY`. |
| `feel` | Coyote time allows a jump for `COYOTE` seconds after an edge and refuses it after. A press within `BUFFER` of landing fires on landing. Jumping off a platform moving right carries its velocity. |
| `crates` | A crate falls and rests and does not creep. The ball pushes it, stops pushing and it stops. Standing on it does not drag it. It cannot be shoved through a wall or lost down a hole. Standing on one and jumping clears a ledge the jump provably cannot reach from the floor. Falling out of the level puts the ball back at the start with nothing queued. And six seconds of riding, pushing and jumping off a crate leaves every value finite — the check that would have caught the `NaN` below in one run. |
| `levels` | For every level: ids unique, spawn in free space, all geometry inside `bounds`, and **every ground polyline's normals point up** — the one authoring mistake that is easy to make and invisible until you fall through the floor. Also: a ball dropped at, and respawned at, every checkpoint settles on that checkpoint's own floor; nothing kills you where you arrive; every spike patch is at least one tooth wide and no wider than half what a perfect jump clears; a level over 3000px has checkpoints and none has more than three; no crate shares ground with spikes; no enemy patrols outside the level or sits on the spawn or a checkpoint. |
| `finish` | **Every level can be finished**, shown by finishing it: a small route per level (a generic runner — which jumps gaps, spikes, crates, stone steps and enemies — plus scripts for level one's platform and level three's crate) drives the real ball from the spawn to the flag 30 ways — starting late and jumping early and late — and from every checkpoint, never failing once. Level three without its crate cannot reach its ledge, with the margin pinned. A level with no route fails. It counts deaths, not hearts: a run that takes two hits and finishes on its last heart still passes, so when placing an enemy, check the fewest hearts the ball drops to (`ball.hearts`) over the same 30-way matrix yourself. |
| `buttons` | All three buttons fit on 844×390, 568×320 and 740×280, none overlaps another, the middle of the screen is not a button, and jump is the biggest one. |
| `precache` | Every file the game loads is in the root `sw.js` `PRECACHE` list, and this folder contains **no image or audio file at all**. |

### `browser/` — headless Chrome, reading pixels

| Suite | Checks |
|---|---|
| `roll` | Holding right rolls the ball right, it visibly *turns* while it rolls, it rolls to a stop when released, and left works too. |
| `jump` | One tap lifts the ball. Two taps are not two jumps. Driven right for as long as the level guarantees ground beneath it, the ball stays in the world and gets somewhere. |
| `small` | An iPhone SE on its side (568×320) and a short landscape window (740×280): the hub button and the play button are on screen before play, and all three controls and the ball are on screen during it. A child must always be able to get out of whatever he is in. |

Screenshots land in `screenshots/`, which is gitignored. **Look at them.** Most
of the bugs worth finding in this repo were found by rendering and looking
rather than by an assertion — including, in this game, hills whose wavelength
was four times the width of a phone, so both "hill" bands drew as flat washes
and nobody's assertion cared.

## Two rules that are not negotiable

**No test-only code in the game.** Nothing exists in the game because a test
wanted it. The offline suites import the DOM-free modules and ask the real
arithmetic; the browser suites read pixels off the canvas.

**No test may ever contain a button coordinate.** Ask `js/ui.js` where a button
is. Taras Town broke nine suites at once by writing coordinates into them, and
it fails *quietly* — the tap simply lands on the world behind and something
passes or fails for the wrong reason.

## How the browser suites find the ball

They read the pixels, because the game has no hook to ask. **The ball is the
only red thing on the screen**, so the centroid of the ball-coloured pixels is
its position to within a pixel. Add anything red to the world and these break —
loudly, which is the intended outcome.

"Red" is a test of **hue**, not of the raw channels, and both halves of that
were learned the hard way:

- Plain red-ish channel thresholds also match **wood**, whose brown blends
  against its own darker outline into something that passes. When this was
  found, the level's boundary walls were drawn in that same wood, and a wall
  runs the full height of the level — so it dragged the measured centroid clean
  off the ball and every position reported was a measurement of the scenery.
  The walls are stone now, for unrelated reasons, but the crates are still
  wood and this is still exactly why the predicate has to be what it is.
- Tightening the thresholds is the trap on the other side. The ball is drawn
  *under* the on-screen buttons, and a button is a 30% white wash, so a ball
  behind one is much paler than `#E8402A`. Any threshold tight enough to
  exclude brown also threw most of the ball away exactly when a button was
  being held — which is exactly when a roll is being measured.

Hue survives a white wash unchanged and brown is simply not that hue, so
`IS_BALL` in `_helpers.mjs` asks "much more red than blue, and barely greener
than it is blue". Keep any new predicate in that one place; a second copy
drifting from the first is how a suite ends up passing for the wrong reason.

## When a suite fails, suspect the test first

That is the standing rule in this repository and it has already been earned
several times over in this game alone. Four of the first five browser failures
here were the test's fault, not the game's:

- Two were the colour predicate above.
- One was the suites sharing a single browser page. **A page already driven by
  another suite silently refuses synthesised touch** — Chrome accepts every
  `Input.dispatchTouchEvent`, replies with success, and delivers no pointer
  event to the page at all. What that looks like from here is a game that
  ignores its own buttons. Each suite opens its own tab now.
- One was the spin check sampling every 120ms. The ball's two marks sit
  opposite each other, so its pattern repeats every *half* turn, and at full
  speed 120ms is only 36° short of exactly that — a plainly spinning ball read
  as one that was not turning at all.

**But "suspect the test" is a starting point, not a verdict.** The worst bug in
the game so far was found the other way round, by a test that was right. A
crate is something the ball stands on, which makes it a carrier exactly like a
moving platform, and `player.js` adds `platform.dx` to the ball's position
without asking whether it exists — so a crate with no `dx` made that
`undefined`, the ball's position became `NaN` the first frame it stood on a
crate, and the ball vanished from the level with nothing logged anywhere at
all. `crates` now checks that every value is still finite after six seconds of
riding, pushing and jumping off a crate, which is the check that would have
found it in one run instead of three. When a symptom is "the thing is simply
not there any more", suspect arithmetic before suspecting the harness.

Two habits came out of that, both worth keeping:

**Instrument before guessing.** Asking the simulation directly in Node — it is
deterministic, so it will tell you the truth in one run — settled in seconds
what three rounds of guessing at the browser had not.

**Let failures be loud.** `send()` collects Chrome's error replies instead of
dropping them, the browser is forbidden from answering out of its HTTP cache
(its profile outlives a run, so a stale module reads as an exception in code
you have just fixed), and a suite that cannot find the ball prints what the
page threw *before* giving up. That last one turned an afternoon-shaped
mystery into a one-line diagnosis on its very first run.

And beware a fixed allowance meeting a world that has grown — the failure mode
that has caught Taras Town four times. Ask the level for the number instead.
`jump` computes how long the ball can possibly be driven right before the first
gap could be reached from the level's own geometry and `MAX_SPEED`, so it
reports the new truth rather than an old allowance.
