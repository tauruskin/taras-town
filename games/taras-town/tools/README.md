# Tools

Scripts that generate files, so nothing binary in this repository was hand-drawn
or downloaded — the same rule the game itself follows.

## `make-icons.mjs`

Renders `icon.html` into the three PNG files under `icons/` (192x192, 512x512,
and the 180x180 apple-touch-icon), using a headless Chrome that must already be
running with `--remote-debugging-port=9333` — the same one `tests/run.mjs`
starts.

```
node tools/make-icons.mjs
```

Run it again after editing `icon.html`, whenever the icon design changes.

## `map.html`

Draws the **whole town on one page**, small enough to see at once, with dots for
the cars, the neighbours and where the game starts. Underneath it prints the
counts: buildings, parks, trees, every kind of hiding place, cars, coins, walls.

```
python -m http.server 8777
```

then open <http://127.0.0.1:8777/tools/map.html>.

The town is generated from two numbers, which makes it easy to change and hard
to *see* — a phone shows about a fortieth of it. Open this after any change to
world generation. Every layout bug in this project so far was found by looking
at it rather than by a failing test: trees planted in tidy rows, a lake that had
been painted over and did not exist, hiding places sitting inside walls.

It is a development tool. Nothing in the game links to it, and it is not in the
service worker's precache list.
