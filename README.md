# Pushkar Games

A small hub of browser games made for a 6-year-old. Pick a tile, play a game
— no accounts, no ads, nothing leaves the phone.

**Play:** https://tauruskin.github.io/taras-town/

## How it's built

Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies
— the same rule every game inside follows. `index.html`, `css/hub.css` and
`js/hub.js` are the hub itself: a picker screen with one tile per game.
`manifest.json` and `sw.js` make the whole thing installable and playable
offline; they live here at the root because a service worker can only ever
control pages inside the folder it's served from.

Tapping a tile is a real page navigation into that game's own folder, not an
in-page transition — every game is a fully separate app, decoupled from every
other one.

## The games

| Folder | What it is |
| --- | --- |
| [`games/taras-town/`](games/taras-town/) | An open-world town to wander, drive and swim around. See its own README for everything about it. |

## Running it on your own computer

```
python -m http.server 8777
```

Then open <http://127.0.0.1:8777/> and pick a tile.

## Checking nothing broke

Each game keeps its own test suite alongside its code. For Taras Town:

```
node games/taras-town/tests/run.mjs
```

See [`games/taras-town/tests/README.md`](games/taras-town/tests/README.md)
for what each one covers.

## Publishing an update

```
git add -A
git commit -m "what changed"
git push
```

GitHub Pages usually takes about a minute to catch up.
