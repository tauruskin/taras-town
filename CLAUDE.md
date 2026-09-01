# Taras Town — working notes for Claude

A game for a 6-year-old. Pure static site: HTML, CSS, vanilla JS (ES modules).
No build step, no package manager, no dependencies. Whatever is in this repo is
exactly what GitHub Pages serves — never introduce a bundler, transpiler, or npm
package.

Full documentation is in `README.md`; how the tests work is in
`tests/README.md`. This file is only the things worth knowing *before* touching
anything.

## Rules that must not be relaxed

These are the user's, not suggestions:

- **Nothing scary.** No weapons, no fighting, no blood, no stealing, no
  realistic police or crime. It is a bright, friendly town.
- **Almost no text.** He may not read fluently. Every control is a picture. The
  only text anywhere is what he types himself (his name) and the room code,
  which is digits — the one kind of text he reliably reads.
- **Relative paths only.** GitHub Pages serves from `/taras-town/`, so a leading
  `/` silently looks at the top of the whole site and fails.
- **Nothing leaves the phone** except, in a shared game, position and a name.
  No accounts, no analytics, no third-party requests. Every `localStorage` read
  and write is wrapped in try/catch.
- **No test-only code in the game.** The browser suites read pixels off the
  canvas instead. If a test needs to know something, ask the generation code in
  Node — it is deterministic, so both sides agree.
- **Nothing is drawn from a file.** Every tree, house, boat and character is
  drawn with shapes by the code, and every *effect* except two is generated.
  Never add an image.
- **Audio is the one exception, and it is a closed list.** `sounds/` holds seven
  recordings — four footsteps, a swimming stroke, a rotor loop and one music
  track, 850KB in total — added deliberately in Aug 2026 after the synthesised
  music and swimming were judged not good enough by ear. `tests/offline/pwa.mjs` enforces a
  1200KB budget for that folder and that every file in it is precached.
  **Do not iterate on these files in git.** Anything committed there is in the
  history for ever whether or not it is later deleted, so a swap costs the
  size of both copies. Prepare a replacement outside the repo, agree it, then
  commit it once. The project has been bitten by this already, with a 14MB
  MP3 a collaborator added.
- **The generated audio is still there and still runs**, as the fallback when
  a file will not fetch or decode. Do not delete `music.js`'s tune or the
  synthesised footsteps in `audio.js` on the grounds that nothing calls them.

## Before reading files

- `js/main.js` (~1800 lines) is the game loop *and* a dumping ground: HUD
  drawing (`drawSound`, `drawMusic`, `drawHome`, `drawCoinCounter`,
  `drawJoystick`, `drawActionButton`, `drawWaypointArrow`, `roundRectPath`),
  the other players (`updateGhosts`, `drawGhosts`, `drawNameplates`,
  `separateIfInsideSomebody`), and the shop presses (`handleMenuPresses`,
  `chooseItem`) all live here. Don't read the whole file for a HUD tweak —
  `Grep` for the function name, then read that region with `Read`'s
  `offset`/`limit`.
- Other large files: `js/world.js` (~1690), `js/ui.js` (~890), `js/car.js`
  (~750). Same rule.
- Flight lives in `js/flight.js` (~90), and should keep living there.
- Insides of houses live in `js/interior.js` (~310) and `js/furniture.js`
  (~290), and should keep living there. `main.js` holds the mode wiring and
  nothing else about them.
- For "where is X handled" questions that need scanning many files, delegate to
  the Explore subagent instead of grepping in the main thread.

## The shape of the thing

- **The town is generated** from `MAP_COLS` × `MAP_ROWS` in `js/config.js`
  (96 × 72). Roads, blocks, houses, parks, the river, islands and the lake all
  fall out of that. Deterministic, so nothing about the map is ever saved or
  sent. Order of generation matters — see "The town is generated" in the README
  before reordering anything in the `World` constructor.
- **`js/config.js` holds every tunable number.** Prefer changing it over
  hardcoding anything anywhere else.
- **Two hitboxes per vehicle.** `half` is the forgiving square it moves with;
  `boundsBox()` is the real footprint everything else collides with. They are
  not interchangeable.
- **Three kinds of travel.** `moveBox(..., terrain)` takes `null` for a person
  (who walks and swims), `'land'` for wheels, `'water'` for a hull.
- **Cover is never solid.** You walk into a bush and it is drawn over you. A
  piece of cover you bounce off is a bug.
- **Nothing indoors is solid either** — not the bed, not the rug, not a chair
  he has placed. Only the walls. Getting wedged behind furniture in a room
  with one way out is the worst thing that can happen in there, and it is
  worth more than a realistically solid table.
- **Generation order is now load-bearing for his SAVE, not just the map.**
  `building.seed` is the order houses are made in, and his furniture is stored
  under it. Reorder `_buildBuildings` and every child's furniture moves house.
  Appending is safe; inserting, removing or resorting is not.
- **A child must always be able to get out of whatever he is in.** Three bugs
  of exactly this shape turned up while interiors were built: a room taller
  than the phone screen with its only exit below the bottom edge, a picker
  whose close button fell off an iPhone SE, and a house with no home button.
  Anything new that fills the screen needs checking at 568×320 and 740×280,
  not just on a desktop.
- **Other players are never solid.** They push apart instead, and only the one
  who is walking pushes. Making them solid sticks two children together — this
  has been tried and reverted.
- **Cars park on the pavement, never on the road.** A road is two tiles wide
  and a car and a driver are about 45px each, so a parked car either side left
  a gap too narrow to drive through — 15.7% of the driving line was blocked.
  `world.parking` holds the spots.
- **`world.neighbourSpots` and `world.parking` both live on the World**, and
  the neighbours choose first. Both want the pavement, and whoever creates
  them must not get to decide: a neighbour inside a parked car is a job that
  cannot be taken. Letting the cars win moved a neighbour behind a hedge and
  cost a job without any test noticing until the browser suite walked to her.
- **Every on-screen button's position lives in `js/ui.js`** — `Menu.cornerPos`
  for the four round ones, `Menu.actionPos` for the big one — and their sizes
  come from `CONFIG.UI`. The tests read those. Writing a coordinate into a test
  broke nine suites at once when the buttons shrank, and it fails quietly: the
  tap simply lands on the town behind.
- **Sound effects and music are separate switches**, `save.muted` and
  `save.musicMuted`. One button for both was tried and replaced on request.
- **Two maps.** The corner one is a zoomed circle showing the ground around the
  player; tapping it opens the whole town. `js/minimap.js` holds both, and the
  town is pre-rendered once at 4px per tile.
- **Flying is `mode === DRIVING` with an `air` vehicle, NOT a mode of its own.**
  `mode` goes over the wire, so a fourth value would mean a peer could not draw
  a flying friend and every `mode === DRIVING` check would need auditing.
  Getting into a helicopter takes off; getting out lands. `js/flight.js` holds
  the rules, and **height is a drawing offset, never a coordinate** — the
  machine's x and y stay on the ground, which is what makes the shadow free and
  the minimap right for nothing.
- **A helicopter only lands where he can also get out.** Not on water, not
  where it will not fit, not where there is no spot to step onto. Where it
  cannot, the button offers nothing rather than promising and refusing.
- **Boats are the opposite of cars.** `moveBox`'s terrain argument decides
  which: `'land'` is stopped by water, `'water'` by land. A chosen boat is
  `save.boat`, kept apart from `save.vehicle` so buying a speedboat does not
  turn the car parked at the kerb into one.

## Tests — never run the full suite by default

`tests/run.mjs` spawns two headless Chromes and produces a lot of output. Use
the narrowest command that answers the question:

- Logic-only change (world gen, jobs, coins, cars, net, swimming, hiding):
  `node tests/run.mjs offline` — a few seconds, no browser.
- One suite: `node tests/run.mjs <name-substring>`, e.g. `node tests/run.mjs jobs`.
- Only run the full `node tests/run.mjs` (or `--live` against the deployed site)
  right before a commit/deploy, not while iterating.
- Pipe to `tail` if output must be inspected.

The two-browser multiplayer suites are the slowest and the most sensitive to
load; if one fails at the end of a long run, re-run it alone before believing
it — but do not *assume* flakiness, because twice now that explanation was
wrong and there was a real bug underneath.

## Look at it

Most of the bugs worth finding here were found by rendering and looking, not by
an assertion. The list keeps growing: trees in tidy rows, a lake that had been
painted over and did not exist, a colour that could not be tapped, road markings
that slid along the road, a corner map hanging off the side of the screen, a
player dot so big it swallowed the frame it sat inside. Screenshots land in
`tests/screenshots/`; `tools/map.html` draws the whole town on one page.

## Tests are usually the thing that is wrong

When a suite fails after a change to the world, suspect the test first. Four
times running it has been a fixed allowance meeting a town that got bigger — a
swim across a river that doubled in width, a race course that got longer, a walk
back to a neighbour, a music bar that does not fit in a three-second window.
Instrument before guessing: a frame counter and the module's own state, printed
at the point of failure, settled one of these in a single run after three wrong
guesses.

## Tools

- `tools/map.html` — the whole town at a glance. Open it after any change to
  world generation.
- `tools/make-icons.mjs` — regenerates the PNG icons from `tools/icon.html`.
  Only needed after editing that file. See `tools/README.md`.

## Session hygiene

- One task per session. `/clear` when switching tasks instead of letting context
  accumulate.
- For a multi-step change: explore first, write a short plan to a scratch file,
  `/clear`, then implement from the plan. Cheaper and more reliable than
  `/compact` mid-task.
