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
`browser/_helpers.mjs` holds what more than one browser suite needs, so there
is one copy of it. Among them: `connect` (a fresh tab per suite, with what the
page throws collected and the HTTP cache off), `boot` (a screen size, storage
cleared, and level one started), `IS_BALL` and `ballAt` (below), `press` and
`release` (a thumb down on a button, and every thumb up), `makeHold` built
from them, and `openLevel`, which writes a save with every level open from
inside the page, reloads, and starts one level from level select the way a
player would, with an optional hook to photograph level select on the way.

## What is in here

### `offline/` — no browser

| Suite | Checks |
|---|---|
| `physics` | A ball dropped on flat ground comes to rest exactly its radius above it and stays there. It accelerates downhill on a slope. It never ends a step inside a segment. Fired at a wall at full speed it does not pass through. Jump height matches the closed-form `JUMP_V² / 2·GRAVITY`. |
| `feel` | Coyote time allows a jump for `COYOTE` seconds after an edge and refuses it after. A press within `BUFFER` of landing fires on landing. Jumping off a platform moving right carries its velocity. |
| `crates` | A crate falls and rests and does not creep. The ball pushes it, stops pushing and it stops. Standing on it does not drag it. It cannot be shoved through a wall or lost down a hole. Standing on one and jumping clears a ledge the jump provably cannot reach from the floor. Falling out of the level puts the ball back at the start with nothing queued. And six seconds of riding, pushing and jumping off a crate leaves every value finite — the check that would have caught the `NaN` below in one run. |
| `risers` | A patch without `rise` keeps its authored height (`SPIKE.H` by default, 100 when authored 100) and its hit box matches. A rising patch's height is exactly the sine — midpoint at t=0, `RISE_H` a quarter in, `SPIKE.H` three quarters in, repeating each period. `Level.update` drives it and the hit box follows. `RISE_H` leaves at least 30px between a jump's peak and the teeth, and a patch held at `RISE_H` is never jumped cleanly from any of 60 take-off points — with a `SPIKE.H` control on the same sweep that must be crossed sometimes, so a broken harness cannot pass it. Eight seconds against a riser leaves every value finite and the height inside `SPIKE.H`..`RISE_H`. |
| `breakables` | The loader builds a plank wall as a box's four segments that lead back to it, carrying `dx`/`dy`/`vx`/`vy`. A slow knock from 15px rattles and cracks it but does not break it or let the ball through, and leaning on it afterwards does not keep rattling it. A full-speed roll breaks it, throws pieces, removes its segments and carries the ball on through at no cost in hearts; it stays broken after the ball runs out of hearts and respawns. A crate shoved into it is stopped at its face without breaking it. Landing on top of it is safe and does not break it. |
| `circuits` | The wiring on its own, with hand-made pressers: a plate is held only by something heavy and resting, never hit; a button latches; only its capped side presses, and resting on top of its post does not; a timer runs out after exactly its time and only a *new* hit refills it; AND and NOT; a reset puts every button and timer back; a timer about to run out warns; colours come from the list in order. Then a real ball on a real level: rolling into a button opens its gate, a crate pushed into one presses it, a respawn resets it, a closing gate does not come down on the ball, and a ball resting flush on a gate's face does not hold it open; level six's old switch still loads as a plate. A bridge carries the ball across a gap at full speed in either direction, withdraws from under it after warning, drops a crate that then returns to its start, and refuses bad data. Last, what the camera's reveal hangs on: an opening within `CIRCUIT.SEE` is reported once, and a closing, a level's first look at its own wiring and a door across the map are not. |
| `levels` | For every level: ids unique, spawn in free space, all geometry inside `bounds`, and **every ground polyline's normals point up** — the one authoring mistake that is easy to make and invisible until you fall through the floor. Also: a ball dropped at, and respawned at, every checkpoint settles on that checkpoint's own floor; nothing kills you where you arrive, probed again with every rising patch pinned at `RISE_H`; a `rise` has a finite period above zero, a finite phase if any, and no `h` beside it; every spike patch is at least one tooth wide and no wider than half what a perfect jump clears, except a static patch authored taller than `SPIKE.H`, which is never meant to be jumped and must be given another way past; a level over 3000px has checkpoints and none has more than three; no crate shares ground with spikes; no enemy patrols outside the level or sits on the spawn or a checkpoint. And the wiring: sender ids are unique, every `needs` names a real sender, no receiver needs nothing, a sender is within `CIRCUIT.SEE` of every receiver it drives, no checkpoint sits between them, and no spike patch, walker patrol, roller range or charger range lies under a gate — a closing gate holds only for the ball, crates and chargers, so it would close straight through the first three and hang open over a charger. And for every charger: its range, plus its radius, is inside the level and its home is inside its range; there is ground under every x of that range at its own feet, which is what "never charges off a ledge" rests on; and no checkpoint is within that charger's OWN sight of either end of it — the one it was given in the level data, not `CONFIG`'s, which room B's wider-eyed charger would otherwise slip past — so a ball never respawns in sight of one. |
| `finish` | **Every level can be finished**, shown by finishing it: a small route per level (a generic runner — which jumps gaps, spikes, crates, stone steps and enemies — plus scripts for level one's platform and level three's crate, and `waitForLow` for levels two, three and four, which looks ahead with `spikeHeight` and only crosses a rising patch that will stay under 75px) drives the real ball from the spawn to the flag 30 ways — starting late and jumping early and late — and from every checkpoint, never failing once, and any run taking a hit within 60px of a rising patch fails. Level three without its crate cannot reach its ledge, with the margin pinned. Level four is finished both ways past its tall patch: through the planks, which the route must have broken, and by the crate without breaking them, spread over early, on-time and late second presses with no hit allowed; with no crate and unbreakable planks, no jump from 60 take-off points gets past, even taking a hit; and a slow roll leaves the planks standing. A level with no route fails — and level seven has none yet, so a full `finish` run currently reports exactly one failure, "level 7 has no route in finish.mjs". That predates the wiring and is not a sign of anything newer being broken; any *second* failure is. Levels eight and nine are finished the same 30 ways, and each room is shown to be load-bearing: without its button, no route gets past a gate (3e, 3h) or clears level eight's 420 gap; without the crate, level eight's shelf is out of reach with the margin pinned (3f); pressing level nine's timer first — exactly once, with the bridge button genuinely pressed too — arrives to a shut gate (3i); and the crate left on the plate keeps the last door shut (3j). Every run of level nine's timed room is held to under 60% of the timer's time (2b), including one that hesitates after the press and hops for nothing. Both levels' crates get a dead-end check (3g, 3k): every way found of getting behind the crate and shoving it the wrong way is tried, and the crate must never end up anywhere the room cannot be finished from. Levels ten and eleven are finished the same 30 ways and from every checkpoint too, with `dodge` — stand still while a charger winds up or charges at the ball, and jump when the charge is `150 * lead` away — and, on level ten, `holdAtStep`, which holds the ball back outside the pen's stone step while the charger patrols towards it within `PEN_GUARD` (600), because a hop over the step is committed in the air and cannot dodge. The level-eleven probes read the rooms from the level's own geometry (`room11`, `lure11`) rather than copying positions out of `levels.js`. Every run of level eleven's room B is held to under 60% of the charger's daze between the plate going down and the ball being through the door, including one that hesitates and hops for nothing, and a run that finds the door shut in front of it fails (2c). Level ten's optional lesson is proved: stomp the dazed charger after its first charge, and still finish without a heart lost (3l). Whether the charger has come back is printed, not asserted — whether it returns before the flag depends on how fast the route is — and the return itself is proved in `offline/chargers`. In level eleven's room A, the ball alone — coming to every spot in the yard from either side, then rolling or jumping each way — never presses the button or breaks the planks, and every run must really have got down into the yard (3m); in room B, a ball that misses the door and rests against it out of the charger's sight can step back into sight, lure it again and get through on the second daze (3n). Sections 1 and 2 count deaths, not hearts: a run that takes two hits and finishes on its last heart still passes, so when placing an enemy, check the fewest hearts the ball drops to (`ball.hearts`) over the same 30-way matrix yourself. The exception is `COUNTS_HEARTS`, levels ten and eleven, where sections 1 and 2 fail on a single lost heart: on ten a lost heart means the ball landed on the charger over the step or was still on it when its daze ended, and on eleven both chargers are shut in their pens, so any lost heart means one got out. |
| `chargers` | The charger, with the real `Level` and the real physics. It patrols its range and never leaves it; sees the ball only in front, on its own level and within `SEE` — or within whatever wider sight its own level data gives it, since the default is `CONFIG`'s and a level that needs one charger to watch a wider yard says so itself (2b); winds up for exactly `WINDUP`, standing still; charges straight at `CHARGE_SPEED` without turning to follow; and a charge ends dazed exactly at the end of its range, or against stone for `DAZED` before it patrols again. Planks break and the charge goes on through; a patrol only turns at them. A crate is shoved `CRATE_SHOVE` on and the charger dazed, and a shove never puts the crate inside stone. A popped charger stays gone for `RETURN` and until the ball is away from home, then comes back home facing its first way. In a level, a charge presses a button's capped side; a patrol over a plate never holds it, a dazed charger on it holds it throughout, and a gate whose power goes never comes down on one. With the real ball: landing on a charger that is not dazed costs a heart and pops nothing, landing on a dazed one pops it for free, and rolling into a dazed one from the side is harmless and does not stop the ball. |
| `progress` | Rolling into the flag wins, only near the flag rather than from across the level, never on a level with no flag, and a death right after winning cannot take it back — including a ball mid-deflate or mid-reinflate when it wins, both of which must resolve rather than stay frozen behind the panel. The flag outranks a spike patch it stands in: a ball on the flag wins even inside one, while a second ball in the same patch away from the flag still dies, which is what proves the ordering rather than the patch being inert. The level list knows what comes next, and every level loads and settles a dropped ball without dying. The state machine in `flow.js` is driven through the real `Input`, not a stub: a thumb still holding right, or a tap made just before the panel appeared, must not survive into the panel; the controls switch off and every queued press drops with them; retry rebuilds the level (crate, checkpoint and clock all reset) with the ball back at the spawn; auto-advance fires on the exact step that reaches `RESULTS.HOLD`, never a step early, and `onWin` is always recorded before the next level's `onStart`; the panel's grid button is handed back as `'levels'` rather than acted on; and the last level stays on its own panel forever, since there is nowhere to advance to. The two corner buttons during play are read as one-shot actions, consumed like a jump press, never a held control and never mistaken for a tap on the panel — restart rebuilds the same level, levels is handed back the same way the panel's grid is, and a press just as the controls switch off does not survive it. |
| `buttons` | All five on-screen buttons — left, right, jump and the two top-right corner buttons, restart and levels — fit on 844×390, 568×320, 740×280 and 480×320, none overlaps another (by hit radius, not drawn radius, for the corner pair and the panel), the middle of the screen is not a button, jump is the biggest one, and the hearts HUD stays clear of the corner buttons and the control band. The results panel's own buttons — retry and the grid to level select — are held to the same standard: on screen, hit by their own middle, clear of the game's controls by `RESULTS.CLEAR`, and the stars and level number sit clear of each other and of the buttons below them. A last check pins the panel's size and button spacing against `CONFIG.RESULTS` directly, independent of what `Panel` itself reports. |
| `precache` | Every file the game loads is in the root `sw.js` `PRECACHE` list, and this folder contains **no image or audio file at all**. |
| `save` | Empty, missing or throwing storage all give the fresh `{ unlocked: 1, finished: [] }`, quietly. Garbage JSON, a plain number, an out-of-range or non-integer `unlocked`, and a `finished` full of unknown or repeated ids are all sanitised rather than trusted. `markWon` opens the next level, never re-locks a level by replaying an earlier one, never opens past the last level, and leaves the progress object it was given untouched. A save written to working storage round-trips back unchanged. |

### `browser/` — headless Chrome, reading pixels

| Suite | Checks |
|---|---|
| `roll` | Holding right rolls the ball right, it visibly *turns* while it rolls, it rolls to a stop when released, and left works too. |
| `jump` | One tap lifts the ball. Two taps are not two jumps. Driven right for as long as the level guarantees ground beneath it, the ball stays in the world and gets somewhere. |
| `small` | An iPhone SE on its side (568×320) and a short landscape window (740×280): the hub button and the play button are on screen before play; level select's hub button and every tile are on screen and no tile overlaps it; and during play all five buttons — left, right, jump, restart, levels — and the ball are on screen. A child must always be able to get out of whatever he is in. It also photographs level five's rehearsal bounce pad at the top of a bounce on both screens, retaking the picture every time the ball is higher than it has been: before `CAMERA.TOP_CLEAR` an ordinary bounce there took the whole ball off the top of a 740×280 view, and the ball must be on screen on every frame of the window. |
| `wiring` | At 568×320 and 740×280: rolling into level eight's first button, and level nine's first timer, lights the first wire colour — counted as exact-colour pixels on the canvas, so no coordinate is needed — and the timer's light goes out again once its time is up. Before anything is pressed, almost nothing is that colour, which is what proves an unlit lamp or wire is never drawn in the lit one. |
| `chargers` | At 568×320 and 740×280, level ten: roll up to the pen's stone step and photograph the charger coming, winding up, charging, sitting dazed and walking off — a picture every quarter second, and back to back, by the clock, for `WINDUP + SEE / CHARGE_SPEED + 0.2` s from the moment the wind-up's crouch is seen in the colour count, because the charge itself lasts under 0.3 s and quarter-second pictures stepped straight over it. Then level eleven: its slope, its two roofs, and room B — the ball standing at the shut door with the plate and the charger in the same frame, and the moment the door opens with the charger dazed on the plate. Holding right does not get there, so the route is driven from what can be seen from outside: the ball is watched for standing still five seconds at room A's door, the jump over the 200 gap is taken 1.05 s after it has moved one radius from where it stood, and the open-door picture is retaken every poll and stopped by the ball moving, so the file left is the last frame before it went. Level select is photographed on the way into each, since that is where the eleventh tile has to fit. The only assertions are that the charger was drawn (a count of `COLOURS.CHARGER_BODY`, which nothing else in the game uses) and that the page threw nothing; the pictures are the point, and they found two drawing bugs on the first look. |
| `screens` | Walks the screens the way a player does. The opening screen shows first, Play opens level select with only level one unlocked and highlighted as the one to play next, and a locked tile does nothing. Tapping level one hides level select and starts it; holding right moves the ball, and the restart corner button snaps it back to the spawn the camera began at. The levels corner button returns to level select. With a save already on the device showing level one finished, level one carries a star, level two is unlocked and highlighted, and anything past it stays locked. |

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
