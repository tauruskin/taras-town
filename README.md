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
| [`games/pushkar-ball/`](games/pushkar-ball/) | A rolling-ball platformer: momentum, slopes, moving platforms. See its own README. |

## Running it on your own computer

```
python -m http.server 8777
```

Then open <http://127.0.0.1:8777/> and pick a tile.

## Checking nothing broke

Each game keeps its own test suite alongside its own code, and its own harness
to run it. There is no shared one.

```
node games/taras-town/tests/run.mjs
node games/pushkar-ball/tests/run.mjs
```

Both take `offline` to skip the browser suites, which is the fast way to check
a change while working on it. See
[`games/taras-town/tests/README.md`](games/taras-town/tests/README.md) and
[`games/pushkar-ball/tests/README.md`](games/pushkar-ball/tests/README.md) for
what each one covers.

Anything that changes `sw.js` or the hub's `index.html` touches both games, so
run both suites before pushing it.

## Publishing an update

```
git add -A
git commit -m "what changed"
git push
```

GitHub Pages usually takes about a minute to catch up.
