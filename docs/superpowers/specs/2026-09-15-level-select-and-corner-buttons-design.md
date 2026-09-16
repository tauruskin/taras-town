# Level select, and restart / levels buttons during play — DONE

Built per the plan in `docs/superpowers/plans/2026-09-15-level-select-and-corner-buttons.md`.
Two deviations along the way: `sw.js`'s `CACHE` was left at `pushkar-games-v2`
rather than bumped as this spec's Architecture section says — that text was
wrong, since `sw.js`'s own comment above `CACHE` says a bump is only needed
when a listed file is renamed or removed, not when new paths are added to
`PRECACHE`. The corner buttons also ended up with their own colours,
`COLOURS.CORNER`/`COLOURS.CORNER_MARK`, rather than reusing the move buttons'
`COLOURS.BUTTON`/`COLOURS.BUTTON_MARK` this spec describes below, so they read
as distinct from the move buttons rather than part of the same set.

Pushkar Ball today goes straight from its opening screen into level 1 and plays
the levels in order. The only ways out of a level are finishing it (the results
panel has retry and a house to the hub) or the browser's back button. The user
asked (Sep 15 2026) for:

1. a button to restart the level,
2. a button to the main screen,
3. a main screen listing every available level, from which the player chooses.

This is the "level select with locks and star ratings" and `save.js` that
`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md` planned for phase 4,
built now, minus pause (not asked for) and minus gem-based stars (no gems yet).

## Decisions made with the user

- **Levels unlock as you go.** Level 1 is always open; finishing a level opens
  the next. Progress is saved on the device.
- **"Main screen" is level select**, and it becomes the game's main screen: the
  opening screen's Play leads there.
- **Two buttons always visible during play, one tap each.** A pause menu and
  press-and-hold were offered as protection against stray taps and declined:
  the player is 12, and speed was preferred.
- **Level select is an HTML screen**, like the existing opening screen, rather
  than drawn on the canvas.

## What the player sees

- **Opening screen:** unchanged, except Play opens level select.
- **Level select:** seven square tiles, two rows, sized against the screen's
  height so they fit 740×280. Each tile shows its level number — digits are
  the one kind of text the hub allows — and:
  - **finished:** a star,
  - **open, not yet finished:** highlighted,
  - **locked:** a padlock picture, and tapping it does nothing.

  The house button, top-left, goes back to the hub of all games. Tapping an open
  tile starts that level.
- **During play:** two round buttons top-right — the corner the hearts, top-left,
  leave free — drawn in the same style as the move buttons. A **curved arrow**
  restarts the level immediately; a **grid of four squares** opens level
  select.
- **Results panel:** retry stays. The **house becomes the grid**, since the house
  now lives on level select. Auto-advance to the next level is unchanged. The
  last level still stays on its panel, where the grid is the way on.
- **Unlocking** happens the moment the flag is touched, before auto-advance, so
  a player who leaves at once still finds the next level open.

## Architecture

### `js/save.js` (new)

Progress only, no DOM. One key, `pushkar-ball-save`, holding
`{ unlocked, finished }`: `unlocked` is how many levels from the start are
playable (1..level count), `finished` is the list of finished level ids.

- Every function takes the storage object to use — `localStorage` in the game,
  a fake in tests — so Node can test it.
- Every read and write is in try/catch. A storage that is missing or throws, or
  JSON that is garbage, gives the default `{ unlocked: 1, finished: [] }` and
  never an error. A private-mode browser gets a playable game with no memory.
- Loaded data is sanitised: `unlocked` clamped to 1..level count, `finished`
  filtered to ids that exist.
- `markWon(progress, index, count)` returns progress with that level finished
  and `unlocked` raised to include the next level — never lowered, never past
  `count`.

### Existing files

- **`config.js`:** size and spacing of the two corner buttons in `UI`.
- **`ui.js`:** `Buttons.restart(w, h)` and `Buttons.levels(w, h)`, top-right,
  their hit test and their pictures. The results panel's `home` becomes
  `levels`, drawn as a grid. Every position stays here; no test may contain a
  coordinate.
- **`input.js`:** a press on a corner button records a one-shot action, read by
  `takeAction()` — consumed, like a jump press, so a resting thumb cannot
  restart the level every frame. `setControls` drains it with everything else.
  While controls are off (results panel up) the corner buttons are inactive.
- **`flow.js`** (stays DOM-free):
  - a `restart` action starts the same level again (a fresh level and ball);
  - a `levels` action is returned to the caller;
  - an `onWin(index)` hook is called on the step the flag is touched, before
    auto-advance, and that is where progress is saved;
  - the panel's grid button returns `'levels'`.
- **`index.html` / `style.css`:** `#levels-screen` with the house button and a
  grid container. The tiles are built by `main.js` from `LEVELS`, so a level
  added later appears without touching the HTML.
- **`main.js`:** Play shows level select. Tapping an open tile starts that level
  and hides the screen. `'levels'` from the flow stops play and shows level
  select, tiles refreshed from the save. No level runs until a tile is tapped.
- **`sw.js`:** add `./games/pushkar-ball/js/save.js` to `PRECACHE` and bump
  `CACHE` to `pushkar-games-v3`. **This touches the file both games share, so
  both games' full suites must pass before it is pushed.**

## Testing

- **`offline/save.mjs` (new):** empty storage gives level 1 only; a throwing
  storage loads and saves without throwing; garbage JSON and out-of-range data
  are sanitised; `markWon` opens the next level, never past the last, never
  re-locks; a save round-trips.
- **`offline/buttons.mjs`:** at all four screen sizes both corner buttons are
  fully on screen, clear of the hearts, the move buttons, jump and each other by
  their hit radii, and found by their own hit test. The panel's `levels` gets
  every check `home` has today.
- **`offline/progress.mjs`:** `restart` rebuilds the level with the ball at the
  spawn; `levels` is returned, not acted on; `onWin` runs before auto-advance;
  an action pressed as controls switch off is dropped.
- **Browser:** the shared start-the-game helper taps Play and then tile 1.
  `small.mjs` also asserts the level-select tiles, the house and both corner
  buttons are on screen at 568×320 and 740×280. A new `screens.mjs` walks
  opening → level select → level 1 → grid → level select, checks a locked tile
  does nothing, and that level 2 is open after a win is written to storage.
- **Look at it:** level select, and the corner buttons during play, at both
  small sizes.

## Out of scope

Pause, gem- or time-based stars, sound, keyboard shortcuts for the new buttons,
and level 7's missing finish route (next, separately).
