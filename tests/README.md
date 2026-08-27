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
node tests/run.mjs offline        no browser needed, a couple of seconds
node tests/run.mjs browser        the ones that drive a real browser
node tests/run.mjs jobs           any suite whose name contains "jobs"
node tests/run.mjs --live         test the DEPLOYED site, not a local copy
```

`--live` is the one to run after a deploy. It catches things a local copy
never will — a missing file, a broken relative path, or, once, multiplayer
that reconnected perfectly on localhost and not at all on the real site.

## What is in here

### `offline/` — no browser

Imports the game's modules straight into Node, with a `Proxy` standing in for
the drawing surface.

| Suite | Checks |
|---|---|
| `world` | The map generates, the spawn point is walkable, no building sits on a road, walking never clips through scenery. |
| `reachability` | Flood-fills the whole town from the spawn point. Every corner reachable, nothing walled off. |
| `cars` | Every car parks legally, can be walked up to, and has somewhere to get out onto. 6000 frames of erratic steering never wedge one. |
| `jobs` | All four job kinds offer, run and complete. Every destination is clear, reachable and not cramped. Races do not zig-zag or start with a long haul. |
| `coins-and-shop` | Coins lie somewhere sensible and come back after being taken. Free colours are free, the rest are locked, and a corrupt save cannot break the shop. |
| `net` | Room parsing, roster merging, forgetting players who go quiet — and that **only position and appearance are ever sent**. |

### `browser/` — drives a real browser

Real touch and key events, and assertions made by reading pixels back off the
live canvas rather than by exposing test hooks. Nothing test-only ships in the
game.

| Suite | Checks |
|---|---|
| `driving` | Walk to a car, get in, drive, get out. |
| `keyboard` | W/A/S/D and arrows move the right way; diagonals are not faster; losing focus stops a held key. |
| `keyboard-driving` | The whole driving loop using only the keyboard. |
| `menu` | Colours apply, save, survive a reload; the joystick is dead while the menu is open. |
| `jobs` | Walk to a neighbour, take a job, arrive, get paid. Also that single player downloads no networking code at all. |
| `job-friend-lift` / `job-race` | The two more complicated jobs, including that race checkpoints pay nothing until the last one. |
| `shop` | A locked colour cannot be worn while broke, coins are collected off the street, buying deducts the right amount and survives a reload. |
| `sound` | The speaker button toggles, looks different in each state, is remembered across a reload, and works from inside the menu. |
| `multiplayer` | Two browsers, a real connection: they find each other and moving one moves the other's view of them. |
| `multiplayer-phone-and-desktop` | The same, with one phone-shaped browser and one desktop-shaped one. |
| `multiplayer-rejoin` | The host leaves; the other player takes over hosting on its own; the first rejoins. Nobody reloads anything. |

## Things worth knowing before changing these

- **Two browsers, not two tabs.** Chrome throttles `requestAnimationFrame` in
  background tabs, so with both players in one browser the host's game loop
  stops and it looks exactly like a broken connection.
- **Drive by position, not by time.** Headless Chrome runs below 60fps and the
  game clamps its timestep, so "hold the stick for 1.3s" covers a different
  distance here than on a phone. Walk until the saved position says you have
  arrived.
- **Clear storage while on `about:blank`.** The game saves on `pagehide`, so
  clearing storage and then navigating writes the old state straight back.
- **Pin `Math.random`** from the page when a test needs a specific random
  destination, and restore it immediately afterwards.
- **Sample pixels beside an icon, not at a button's centre.** The centre is the
  white glyph, not the button colour.
- **Watch out for assertions that pass for the wrong reason.** Two here once
  did: "cannot walk onto a neighbour" was really measuring the player walking
  straight *past* one, and "the joystick is dead while the menu is open" passed
  because the drag happened to land on a colour dot. Check the number, not just
  the boolean.
- **Look at the screenshots** in `tests/screenshots/`. Code that passes every
  assertion has looked visibly broken more than once.
