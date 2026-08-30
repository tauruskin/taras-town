# Tests

```
node tests/run.mjs
```

That is the whole thing. It starts a web server and two browsers, runs every
suite, tells you what passed, prints the full output of anything that failed,
and shuts everything down again.

**Nothing to install.** Node 22 has a global `WebSocket`, which is enough to
drive Chrome over its DevTools Protocol, so the tests have no dependencies —
the same rule the game itself follows.

You need **Node 22 or newer**, **Chrome**, and **Python** (only for the little
web server; ES modules will not load from a `file://` page).

## Running less than everything

```
node tests/run.mjs offline        no browser needed, a few seconds
node tests/run.mjs browser        the ones that drive a real browser
node tests/run.mjs jobs           any suite whose name contains "jobs"
node tests/run.mjs --live         test the DEPLOYED site, not a local copy
```

`--live` is the one to run after a deploy. It catches things a local copy never
will — a missing file, a broken relative path, or, once, multiplayer that
reconnected perfectly on localhost and not at all on the real site.

Files beginning with `_` are shared helpers, not suites, and are skipped.

## What is in here

### `offline/` — no browser

Imports the game's modules straight into Node, with a `Proxy` standing in for
the drawing surface.

| Suite | Checks |
|---|---|
| `world` | The map generates, the spawn point is walkable, no building sits on a road, walking never clips through scenery. |
| `reachability` | Flood-fills the whole town from the spawn point. Every corner reachable, nothing walled off. |
| `road-markings` | The dashes down the middle of the road fall in the same place whatever the camera is doing. |
| `cars` | Every car parks legally on a road and every boat is moored afloat; each can be walked up to and has somewhere to get out onto. 6000 frames of erratic steering never wedge one. |
| `getting-out` | 5,000 ways out of a vehicle, for every vehicle, at every angle, in hundreds of places. Nobody is ever left standing inside something, and — the harder question — nobody is left unable to *walk*. |
| `hiding` | There are plenty of hiding places, of several kinds, spread over the whole town; you can walk into every one of them; standing in one hides you; and standing in the road does **not**. |
| `swimming` | Wading in starts him swimming, swimming is slower than running, boats float and cars do not — and from every water tile on the map there is always a way back to dry land. |
| `jobs` | All four job kinds offer, run and complete. Every destination is clear, reachable and not cramped. Races do not zig-zag or start with a long haul. Neighbours are solid and cannot be walked through. |
| `coins-and-shop` | Coins lie somewhere sensible and come back after being taken. Free colours are free, the rest are locked, and a corrupt save cannot break the shop. |
| `menu-buttons` | Presses the middle of every button in the shop at seven screen sizes and checks the right one answers. |
| `net` | Room parsing, roster merging, forgetting players who go quiet — and the exact list of fields that may cross the wire. |
| `vehicles` | Every vehicle's numbers are sane and its prices climb; each one drives 4000 frames without wedging or escaping (boats on the water, cars on the road); and swapping between them in 400 different places never leaves one inside a wall. |
| `pwa` | `manifest.json` is valid and internally consistent, every icon exists at the size it claims, and the service worker's precache list is neither missing a real file nor missing a real `js/*.js` file. |

### `browser/` — drives a real browser

Real touch and key events, and assertions made by reading pixels back off the
live canvas rather than by exposing test hooks. **Nothing test-only ships in the
game.**

| Suite | Checks |
|---|---|
| `driving` | Walk to a car, get in, drive, get out. |
| `keyboard` | W/A/S/D and arrows move the right way; diagonals are not faster; losing focus stops a held key. |
| `keyboard-driving` | The whole driving loop using only the keyboard. |
| `menu` | Colours apply, save, survive a reload; the joystick is dead while the menu is open. |
| `jobs` | Walk to a neighbour, take a job, arrive, get paid. Also that single player downloads no networking code at all. |
| `job-friend-lift` / `job-race` | The two more complicated jobs, including that race checkpoints pay nothing until the last one. |
| `shop` | A locked colour cannot be worn while broke, coins are collected off the street, buying deducts the right amount and survives a reload. |
| `vehicle-shop` | Buying a vehicle: the right price comes out, an unaffordable one stays locked, an owned one is free to re-select, it survives a reload — and the bus bought actually appears on the road. |
| `sound` | The speaker toggles, looks different in each state, is remembered across a reload, and works from inside the menu — **and the music button is a genuinely separate switch**, which a single button wired to both settings would otherwise pass. |
| `map` | The corner map is small and clear of the buttons; tapping it opens the whole town and dims the game; the joystick is dead while it is up; tapping anywhere closes it and play resumes. |
| `getting-out-live` | Drives hard into scenery until the vehicle really is wedged, then gets out and checks the player can walk. A smoke test, not the regression test — see the note below. |
| `main-menu-button` | The house button is drawn on the playing screen and in the menu, leaves the shared game, returns to the opening screen with both choices offered, and loses nothing from the save. |
| `multiplayer` | Two browsers, a real connection: they find each other and moving one moves the other's view of them. |
| `multiplayer-code` | The opening screen: a name is asked for, one player makes a game and is shown a code, the other types it on the number pad, and the two end up in the same town. |
| `multiplayer-phone-and-desktop` | The same, with one phone-shaped browser and one desktop-shaped one. |
| `multiplayer-rejoin` | The host leaves; the other player takes over hosting on its own; the first rejoins. Nobody reloads anything. |
| `bumping` | Walking into another player moves them — **and neither player can ever be stuck**, including one leaned on while backed against a wall. |
| `music` | Music starts by itself after the first tap, keeps playing, stops when the game is hidden, and starts again when it comes back — counted by wrapping `createOscillator`, so no test-only code ships. |
| `pwa` | Loads the game online so the service worker installs, cuts the network off entirely, then opens the game again as a fresh visit and confirms it still boots and plays. |

### `_helpers.mjs`

Shared by the browser suites:

- **`makeWalker`** — `push`, `pos` and `walkTo`. `walkTo` slides along whatever
  it hits and keeps going rather than giving up at the first wall, committing to
  one way round for several tries before switching sides (alternating on every
  bump just rocks back and forth in a dead end).
- **`makeRouter`** — a breadth-first search over a coarse grid, for crossings
  long enough that steering greedily is not enough. The race uses it.
- **`town`, `nearestCar`, `npcWithMission`** — ask the real generation code
  where things are.

## Things worth knowing before changing these

### The two that cost the most time

- **Never write a button's coordinates into a test either.** Nine suites broke
  at once when the buttons were made smaller, because they each had `W - 96`
  and `H - 92` written into them. They now ask `Menu.cornerPos`,
  `Menu.openerPos` and `Menu.actionPos`, which is why all the on-screen
  geometry lives in `ui.js` rather than in `main.js`. A coordinate that is
  merely stale does not fail loudly: the tap lands on the town behind.
- **Never navigate by hardcoded directions or destinations.** The suites used to
  say "drag down-left for 560ms and there will be a car" and "the teddy is at
  1376,1248". Both were true of one particular map and stopped being true the
  moment the town was generated at four times the size — and, far worse, they
  did not fail cleanly: the player ended up beside some *other* car or *other*
  neighbour and checks passed for the wrong reason. Ask the real generation code
  where things are (it is deterministic, so Node and the browser agree) and
  steer while reading the player's actual position.

- **Reading a position must not fire `pagehide`.** The game treats `pagehide` as
  "we are leaving" and hangs up the multiplayer connection, so a `pos()` helper
  that fired it ended the shared game — and every check afterwards was quietly
  measuring two children in separate empty towns. `pos()` now asks for a save
  via `visibilitychange`, which only saves. If you write a new position helper,
  do the same.

### Assertions that pass for the wrong reason

This is the recurring theme of this project, and every example below is real:

- "Cannot walk onto a neighbour" was measuring the player walking straight
  *past* one.
- "The joystick is dead while the menu is open" passed because the drag landed
  on a colour dot.
- "The number pad appears" passed against a stale stylesheet where every panel
  was showing at once.
- "Swapping never leaves a vehicle inside scenery" reported 0 nudges — meaning
  the safety path it existed to test had never run.
- "No vehicle can be driven into the water" passed for the two boats, which
  cannot move on land at all and so never reached the water either.
- "They are in the same game" passed on a badge that was no longer true by the
  time anything was measured.

**Write the control.** Where a check could pass by nothing happening, prove the
opposite case too: `offline/jobs` shows the same walk *does* pass through a
neighbour when they are not solid; `offline/swimming` shows a person crosses the
line a car is stopped at; `offline/road-markings` shows the dash offset really
does change with the camera. Check the number, not just the boolean.

### Know what a suite is actually for

`browser/getting-out-live` is a smoke test, and says so at the top. It was
measured: with the old broken `exitSpot` put back deliberately, `offline/getting-out`
failed five ways while every check in the live suite still passed — the bad
cases are about 32 in 5000, far too rare for four rounds to land on. Being clear
about which suite guards what stops a green tick being mistaken for proof.

### Mechanics

- **Two browsers, not two tabs.** Chrome throttles `requestAnimationFrame` in
  background tabs, so with both players in one browser the host's game loop
  stops and it looks exactly like a broken connection.
- **Drive by position, not by time.** Headless Chrome runs below 60fps and the
  game clamps its timestep, so "hold the stick for 1.3s" covers a different
  distance here than on a phone.
- **Clear storage while on `about:blank`.** The game saves when the page goes
  away, so clearing storage and then navigating writes the old state straight
  back.
- **You cannot seed a save and then navigate to the game** — leaving the page
  writes the running game's state over your seed. `browser/vehicle-shop` seeds
  from `tools/icon.html`, a same-origin page that runs no game code.
- **Pin `Math.random`** from the page when a test needs a specific random
  destination, and restore it immediately afterwards. Node can reproduce the
  same choice by running the same picker with the same pin.
- **Sample pixels beside an icon, not at a button's centre.** The centre is the
  white glyph, not the button colour.
- **A button's on-screen position is not its visual centre.** `browser/pwa` once
  dispatched a touch at the viewport centre expecting the start button, which
  actually sits below the sun and title. Call `.click()` on the element.
- **Checking an element "has width" is not the same as checking it is showing.**
  Disable the browser's HTTP cache, or a stale stylesheet will show every panel
  at once and width-based checks will pass anyway.
- **Do not scan only part of the screen when hunting for the other player.** Two
  suites skipped the top fifth to avoid the HUD — which is exactly where the
  other player often is. Exclude the HUD boxes, not a whole band.
- **A CDP screenshot's clip `scale` and an emulated device pixel ratio both
  resize the capture — setting both multiplies them together.** That silently
  produced icons a third of the size they claimed.
- **Headless Chrome has no audio clock unless you ask for one.** `run.mjs`
  passes `--autoplay-policy=no-user-gesture-required` and `--mute-audio`;
  without them the AudioContext stays suspended, `currentTime` never advances,
  and the music schedules one bar and then nothing for ever. `browser/music`
  checks whether the clock is actually running and says so rather than
  reporting a bug that is not there.
- **A stuck service worker survives between runs.** The browsers keep their
  profile in `tests/screenshots/chrome-*`, so a failed registration stays
  failed and `browser/pwa` then fails for a reason that has nothing to do with
  your change. Delete those folders and run it again before believing it.
- **Look at the screenshots** in `tests/screenshots/`, and at
  `tools/map.html` for the map. Code that passes every assertion has looked
  visibly broken more than once.
