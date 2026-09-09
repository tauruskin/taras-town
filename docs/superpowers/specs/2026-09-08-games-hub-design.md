# Games hub — design

## Why

Taras Town is going to stop being the only game in this repo. A second game,
similar in spirit to "Red Ball" with its own missions, is planned next. Rather
than bolt a second game onto Taras Town's own code, the repo becomes a small
hub: a picker screen a player sees first, which launches whichever game they
tap. This spec covers only the hub shell and moving Taras Town behind it —
the second game is future work.

## Scope

In scope:
- A new hub entry point at the repo root with one tile: Taras Town.
- Moving all of Taras Town's code, assets, tests and tools into
  `games/taras-town/`.
- Repointing the PWA (manifest + service worker) at the hub as the app's
  front door, under a new identity: **Pushkar Games**.

Out of scope (future work, own spec when it happens):
- Building the Red-Ball-like second game.
- Any shared code between games (there is none to share yet).
- Redesigning Taras Town's own start screen, orientation handling, or
  anything inside `games/taras-town/` beyond the paths needed to make the
  move.

## Architecture

```
index.html          new hub page: tile picker only
css/hub.css          new, hub-specific styles
js/hub.js            new, tiny module: renders tiles, navigates on tap
manifest.json         renamed "Pushkar Games", start_url "./index.html" (the hub)
sw.js                 precache list updated to games/taras-town/... paths, plus hub's own files
icons/                hub app icons (reuse existing sun icon; no new art required)

games/taras-town/
  index.html           today's index.html, paths adjusted for its new location
  css/, js/, sounds/    moved as-is; every path inside them is already relative,
                        so nothing inside these files needs to change
  tests/, tools/        moved as-is
```

Tapping the Taras Town tile navigates the browser to
`games/taras-town/index.html` — a real page load, not a single-page
transition. Taras Town becomes a fully separate page/app: its own script
graph, its own styles, its own fullscreen/orientation handling triggered by
its own first tap (same pattern it already uses today). This keeps today's
game completely decoupled from whatever the second game turns out to be
built with, and means nothing inside `games/taras-town/` has to change to
accommodate a sibling game later — a new game is just another folder and
another tile.

## Hub screen

One panel, following the existing "no text, picture only" rule used
throughout Taras Town: the only text anywhere is what a player types
themselves or the room code.

**Amended Sep 2026, on request:** each tile now shows its game's name
underneath the square. The picture and the colour remain what a
six-year-old navigates by — they are unchanged in size and position — and the
name is a smaller label below, inside the same single tap target, for an adult
handing over the phone and for him in a year or two. See the note under
"Almost no text" in `CLAUDE.md`. A single tile button for Taras Town, showing an
icon built from the same inline-SVG-shapes approach as the rest of the game
(no image files — consistent with "nothing is drawn from a file"). Centered,
sized for a young child's tap target. Laid out as a flex/grid row so a
second tile is a pure addition later, not a layout rework.

The hub has no back-and-forth of its own state to manage — it doesn't know
or care about room codes, saves, or multiplayer. It only ever does one
thing: show tiles, navigate on tap.

## PWA / service worker

One shared manifest and service worker at the repo root, since a service
worker can only control pages inside the folder it's served from, and this
project is served from the site root.

- `manifest.json`: `name`/`short_name` become **Pushkar Games**,
  `start_url` and `scope` stay `"./index.html"` / `"./"` but now point at the
  hub page as the front door. `orientation: "landscape"` is left unchanged —
  not something this spec is asked to revisit.
- `sw.js`: `PRECACHE` list gets every existing Taras Town entry rewritten
  with a `games/taras-town/` prefix, plus the new hub files
  (`./`, `./index.html`, `./manifest.json`, `./css/hub.css`, `./js/hub.js`)
  added. The existing network-first-with-cache-fallback strategy is
  unchanged.
- Icons: reuse the existing icon set as-is. No new icon art in this pass.

## What doesn't change

Taras Town's game code, its save format (`tarasTown.save.v1`), multiplayer,
the audio budget rule, and every other rule in `CLAUDE.md` — none of that is
touched by this move. Only *where the files live* and *what loads first*
change.

## Testing

`games/taras-town/tests/` and `games/taras-town/tools/` move as a unit with
the code they exercise; their relative imports (`../js/...` etc.) stay
correct because the whole tree moves together. After the move,
`node tests/run.mjs offline` is run from the new location to confirm
nothing broke. A quick manual check in a browser confirms: hub loads at
`/`, shows one tile, tapping it opens Taras Town at its new path, and the
game plays exactly as before.
