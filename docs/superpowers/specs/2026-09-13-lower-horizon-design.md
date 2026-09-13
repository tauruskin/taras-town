# Pushkar Ball — lower the horizon on roomy screens

Follow-up item 3 from `docs/superpowers/specs/2026-09-11-followup-ideas.md`.
Brainstormed 2026-09-13, informed by a shared reference screenshot and an
interactive mockup comparing horizon proportions.

## The ambiguity, resolved

"Ground/hill height should come down ~20%" could have meant the actual
terrain (elevation deltas in each level's `ground` data) or the camera's
framing (`CONFIG.CAMERA.GROUND_AT`, how much of the screen is sky vs. ground,
independent of the terrain itself). A third candidate — the decorative
`CONFIG.PARALLAX` background bands — surfaced during exploration but wasn't
raised in feedback and isn't part of this fix.

The user's reference screenshot settled it: a "Red Ball"-style scene with
essentially **flat** ground in view, but a low horizon line leaving lots of
sky and generous visible ground depth below it. That's a framing complaint,
not a terrain complaint — `CAMERA.GROUND_AT`, not level data.

(The reference also showed a richly textured ground — dirt strata, embedded
rocks — and a full atmospheric background with a sun and clouds. That part
is out of scope here: it's a separate, larger visual-style task, and
recreating that specific game's distinctive art directly is off the table
regardless of scope — see "Out of scope" below. This spec is proportions
only, using the ground and sky the game already draws.)

## What actually happens today, measured

`Camera.biasFor` (`games/pushkar-ball/js/camera.js`) picks whichever puts the
ball's feet higher: `GROUND_AT * cssH` (the target) or
`Buttons.topEdge(...) - GROUND_CLEAR` (the button-clearance floor). Computing
both across real screen sizes at the current `GROUND_AT = 0.73`:

| screen | wanted (0.73) | allowed | result |
|---|---|---|---|
| 740×280 (small-screen check) | 204 | 130 | capped at 130 — buttons win |
| 568×320 (small-screen check) | 234 | 170 | capped at 170 — buttons win |
| 844×390 (a common phone) | 285 | 240 | capped at 240 — buttons win |
| 1440×810 (desktop-sized) | 591 | 660 | honoured at 591 |

On every phone-sized screen tested, `GROUND_AT` is **already overridden** by
the button-clearance floor — the 0.73 target never actually applies there
today. It only takes effect on large, tall windows, which is exactly where
the "very flat, long horizon" screenshot feedback most plausibly came from.

## The fix

Change `CONFIG.CAMERA.GROUND_AT` from `0.73` to `0.60` in
`games/pushkar-ball/js/config.js`. Nothing else in the camera, the levels, or
the parallax background changes.

Recomputing the same table at `0.60`:

| screen | wanted (0.60) | allowed | result |
|---|---|---|---|
| 740×280 | 168 | 130 | capped at 130 — **unchanged** |
| 568×320 | 192 | 170 | capped at 170 — **unchanged** |
| 844×390 | 234 | 240 | honoured at 234 — was capped at 240 (6px difference) |
| 1440×810 | 486 | 660 | honoured at 486 — was 591 (105px higher, visibly more sky and ground) |

The two smallest screens this project checks against are **untouched** — the
button-clearance floor already dominated them and still does, so there is no
regression risk on the tightest phones. The visible change lands on
mid-size phones (a small, ~6px shift) and grows on genuinely roomy windows,
where the ball rises noticeably and the ground fills more of the screen —
which is where the flatness was actually being seen.

## A test threshold this deliberately moves past

`tests/offline/camera.mjs` asserts, for any screen 700px tall or more, that
"land" (the ground's share of the screen height) stays at or under 35% —
written to catch the original half-and-half bug (a fixed `BIAS_Y` that put
the horizon at exactly 50%). At `GROUND_AT = 0.60`, a tall screen's honoured
land share becomes exactly 40% (`1 - 0.60`), which is a deliberate, understood
change past that 35% line — not a regression toward the 50% bug it was
written to catch, but past the number literally written down.

The fix updates that threshold from 35 to 42: comfortably above the new
target's exact 40%, and still meaningfully below the 50% "half sky, half
field" failure mode the check exists to catch. The threshold is being
raised because the design's own target moved, not because the check was
wrong.

## Docs

- `games/pushkar-ball/README.md`'s "about a quarter of the screen is land on
  a monitor" (in the section describing `Camera.biasFor`) becomes "about two
  fifths," matching the new honoured-case fraction (`1 - 0.60`). The rest of
  that paragraph — the shortest-phone case, the pointer to
  `tests/offline/camera.mjs` — is unaffected and stays as written.

## Testing

- `tests/offline/camera.mjs` already derives its assertions from
  `CONFIG.CAMERA.GROUND_AT` rather than a hardcoded number (confirmed by
  reading it), so the config change alone doesn't break it — only the 35→42
  threshold needs a manual edit, per above.
- No other suite references `GROUND_AT` (confirmed by search) — every other
  suite works in world space, independent of the camera's screen framing.
- Run the full offline suite after the change; expect all suites green,
  including `camera`.
- This is a config-and-threshold change with no new mechanic, so no new test
  case is needed beyond the existing camera suite's coverage.

## Out of scope

- No change to any level's `ground` data (elevation deltas stay as
  authored) or to `CONFIG.PARALLAX`'s background bands.
- No change to the ground's visual texture (dirt layers, embedded rocks) or
  to the sky (sun, clouds, background trees) seen in the reference
  screenshot — CLAUDE.md's "no image files, ever; every tree, house, hill
  and crate is drawn with shapes by the code" rule stands, and recreating a
  specific commercial game's distinctive illustrated art style is off the
  table regardless of format. A richer, code-drawn ground/background is a
  legitimate future follow-up, but it is a separate, larger design pass, not
  this one.
- No change to level obstacles or puzzle design — that request (from the
  same conversation) is follow-up item 4 territory ("must jump to proceed"
  gates) and needs its own brainstorm.
