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
