# Pushkar Ball — design

## Why

Pushkar Games has one tile. This spec adds the second: **Pushkar Ball**, a
physics platformer in the spirit of Red Ball 4 — a rolling ball hero, momentum
that carries into jumps, spikes and saws and enemies to get past, a flag at the
end. The games-hub spec anticipated exactly this game and left it as future
work; this is that work.

It is an original game. No Red Ball assets, names, logos or level layouts —
only the gameplay feel.

Unlike Taras Town, this one is built because the *adult* wants it. That does not
loosen the safety rules, because Red Ball's own fail state was never gruesome:
the ball deflates and reappears. Nothing here is scarier than that.

## Scope

In scope for this spec (the whole game, built in phases below):

- A ball with real rolling physics, jumping, slopes and moving platforms.
- Hazards (spikes, saws, crushers), three enemy types, collectibles, a goal.
- Checkpoints and respawn. No lives — see "Failing" below.
- 4–5 levels as data, a level-select screen, progress saved to
  `localStorage`.
- Main menu, HUD, pause and level-complete screens.
- Synthesised sound effects and music, a sound switch.
- Hub wiring: tile, service-worker precache, README.
- Its own test suite, mirroring Taras Town's offline/browser split.

Out of scope, permanently unless asked:

- Multiplayer of any kind. This is a single-player game.
- Any shared code between the two games. There is still nothing worth
  sharing, and inventing a shared layer for two games couples them for no
  gain.
- Any image file, any video, any third-party request.
- A level editor. Levels are hand-written data objects.

## The name and where it lives

`games/pushkar-ball/`, self-contained, exactly the way `games/taras-town/` is.
Nothing outside that folder changes except the hub's tile list, `sw.js`, the
root `README.md` and `CLAUDE.md`.

## Architecture

```
games/pushkar-ball/
  index.html          thin: a canvas, the rotate overlay, one module script
  css/style.css
  js/config.js        every tunable number
  js/physics.js       circle vs. segment collision + integration. Pure, DOM-free.
  js/player.js        the ball: accel, jump, spin, deflate/respawn. DOM-free.
  js/levels.js        level data + the loader that expands it. DOM-free.
  js/camera.js        smooth follow, clamped to level bounds
  js/input.js         on-screen buttons and keyboard
  js/ui.js            every button's position and size; screen layout
  js/main.js          the loop and the screen state machine, and nothing else
  js/hazards.js       spikes, saws, crushers                       (phase 2)
  js/enemies.js       the three enemy types and their AI            (phase 3)
  js/effects.js       particles                                     (phase 3)
  js/audio.js         synthesised effects and music                 (phase 4)
  js/save.js          localStorage, every read and write in try/catch (phase 4)
  tests/run.mjs       harness, same shape as Taras Town's
  tests/offline/      Node suites (physics, levels, precache)
  tests/browser/      headless Chrome suites (pixels off the canvas)
  tests/screenshots/  gitignored output
```

`main.js` stays thin. Taras Town's `main.js` grew to 1800 lines by becoming the
place anything went when it had no obvious home; that is a known cost being
paid there, not a pattern to copy. HUD drawing goes in `ui.js`, entity update
and draw go with their entity.

### Modules must stay DOM-free where marked

`config.js`, `physics.js`, `player.js`, `levels.js` must not touch `document`,
`window`, `Image` or `Audio` at import time or in their update paths. This is
not tidiness — it is what lets Node import them directly and test the
simulation exactly. Drawing lives in the caller.

## Physics

### Representation

The ball is a circle: `{ x, y, r, vx, vy, spin }`. `spin` is drawing only.

All world geometry is **line segments** with a normal:
`{ ax, ay, bx, by, nx, ny }`. A solid box is four segments; a slope is one; a
curved bowl is a polyline of several. Nothing else is a collider.

This is the load-bearing decision. The alternative — a grid of tiles with
axis-aligned resolution — is simpler to write but has no honest slopes, and
slopes are where a rolling ball earns its existence. Circle-vs-segment is about
sixty lines and gives ramps, bowls and half-pipes for free.

Segment normals are derived from winding order, not authored by hand: the
normal is the left-hand perpendicular of `a → b`. Ground polylines are authored
left-to-right so their solid side faces up. Getting the winding backwards makes
a surface you fall through, which is the one likely authoring mistake, so the
level loader asserts that every ground polyline's normals point upward
(`ny < 0`, screen y down) and the offline test suite fails on any that do not.

### Step

Fixed **1/120 s** step, driven by an accumulator fed from `requestAnimationFrame`
delta, delta clamped to 0.25 s so a backgrounded tab does not fast-forward the
world on return. Rendering interpolates nothing; at 120 Hz simulation and 60 Hz
draw the difference is invisible and interpolation would complicate every
entity.

Fixed-step is what makes the simulation deterministic and therefore exactly
testable in Node. It also removes a whole family of feel bugs where jump height
quietly depends on frame rate.

If a step's displacement would exceed `r * 0.5`, the step is subdivided. At the
tuned speeds this never fires, but it is the difference between a fast ball and
a ball that tunnels through a floor.

### Resolution

Per step, per nearby segment: find the closest point on the segment to the
ball's centre. If the distance is less than `r`, push the ball out along the
centre-minus-closest direction and split velocity into normal and tangent
components. The normal component is reflected and scaled by `RESTITUTION`
(small — a ball should bounce a little, not much); the tangent component is
scaled by friction, which is what makes the ball slow on the ground and keep
its speed in the air.

Below a threshold normal speed (`REST_EPS`, 40 px/s) the normal component is
zeroed instead of reflected. Without it a ball at rest on the ground jitters
forever at ever-smaller amplitudes, never settles, and never reads as grounded
two steps in a row.

Broad phase: segments are bucketed into a uniform grid by the loader, and only
the buckets the ball overlaps are tested. A level is a few hundred segments, so
this is not a performance need — it is so the resolution loop stays honest at
level five's size without anyone having to think about it again.

**Grounded** is not a flag the terrain sets; it is derived from contacts. If any
contact this step had a normal pointing mostly up (`ny < -0.6`), the ball is
grounded and the coyote timer resets. This is what makes jumping off a slope,
off a moving platform, and out of a bowl all work without special cases.

### Jump feel

- A fixed upward impulse, not a held acceleration.
- **Coyote time:** jumping is allowed for `COYOTE` seconds after leaving the
  ground.
- **Jump buffering:** a press up to `BUFFER` seconds before landing fires on
  landing.
- **Moving platforms:** while grounded on one, the platform's per-step delta is
  added to the ball's position, and the platform's velocity is added to the
  ball's on jump. Without the second half, jumping off a moving platform feels
  broken in a way players notice but cannot name.

### Starting numbers

Every one of these lives in `config.js` and is a starting point to tune by
feel, not a result:

| Name | Value | Note |
|---|---|---|
`BALL.r` | 20 | world units
`GRAVITY` | 2200 | px/s²
`ACCEL` | 1600 | px/s² on the ground
`AIR_ACCEL` | 0.45 | multiplier on `ACCEL` while airborne
`MAX_SPEED` | 420 | px/s horizontal
`GROUND_FRICTION` | 6.0 | per-second tangential damping
`RESTITUTION` | 0.18 | how bouncy a wall is
`JUMP_V` | 760 | px/s upward impulse
`COYOTE` | 0.10 | s
`BUFFER` | 0.12 | s
`VIEW_H` | 540 | world units visible vertically, on every screen

## Screen, camera and fairness across devices

Landscape only, with the same rotate overlay the hub and Taras Town use.

The canvas is sized to the window in CSS pixels and scaled by
`devicePixelRatio`. World units are not CSS pixels: the draw transform scales by
`canvasHeight / VIEW_H`, so **every device sees the same amount of world
vertically**, and a small phone sees a little less horizontally than a wide
desktop. A platformer where a small screen sees less of the level is a
platformer that is harder on a small screen, which is not a difficulty setting
anyone chose.

Camera follows the ball with a lerp plus a lookahead proportional to `vx`, and
is clamped so it never shows outside the level bounds.

## Levels as data

A level is a plain object. The loader expands it into segments, entity
instances and the broad-phase grid; nothing is drawn pixel-by-pixel and no
geometry is computed at draw time.

```js
{
  id: 1,
  theme: 'hills',                  // 'hills' | 'factory'
  bounds: { w: 4800, h: 1080 },
  spawn:  { x: 120, y: 500 },
  goal:   { x: 4600, y: 620 },
  ground: [                        // polylines, authored left to right
    [[0, 700], [600, 700], [900, 560], [1400, 560]],
  ],
  boxes:      [ { x, y, w, h } ],
  platforms:  [ { x, y, w, h, axis: 'x', dist: 200, period: 4, phase: 0 } ],
  checkpoints:[ { x, y } ],
  spikes:     [ { x, y, w } ],                            // phase 2
  saws:       [ { x, y, r, rpm } ],                       // phase 2
  crushers:   [ { x, y, w, h, dist, period, phase } ],    // phase 2
  enemies:    [ { kind: 'roller', x, y, from, to } ],     // phase 3
  gems:       [ { x, y } ],                               // phase 3
}
```

Moving platforms and crushers are driven by a **phase-based sine of level
time**, not by integrated velocity. Two consequences worth having: the level
looks identical every attempt, so a player learns the timing instead of
re-reading it; and a test can assert a platform's position at time *t* without
running the game.

Level count: five. One and two teach rolling and jumping on hills; three
introduces moving platforms and spikes; four moves indoors to the toy factory
with saws and conveyors; five combines everything.

**A level should be long enough to be worth sitting down for.** Levels one
through three's first draft (phase 2) ran 3,500-4,800 world units — 15-25
seconds of real, unhurried play, closer to a blink than a round. Corrected on
request in Sep 2026 to roughly 13,000-17,000 (60-100+ seconds), which is the
number the shipped levels actually hold to; treat it as the floor for four and
five too, not a one-off fix. The way to get there without making anything
harder is the difficulty rule already below — **longer rather than sharper**:
more distance of plain rolling between moments that matter, and where it fits,
one more low-stakes repetition of the level's own idea (a level already
introducing gaps can have three or four of them instead of two, provided none
is harder than the last and every one is still comfortably inside the jump's
reach) rather than a new kind of difficulty layered in to fill the time.

### Difficulty: rising, and never harsh

Each level is harder than the one before it and **none of them is hard**. That
is a requirement, not a hope, and it is easy to lose one level at a time while
authoring five of them — each individual step feels reasonable and level five
ends up somewhere a six-year-old cannot follow.

What it means concretely:

- **Every level introduces at most one new idea**, and introduces it somewhere
  safe — where failing costs a few seconds, not a checkpoint's progress — before
  it is ever asked for somewhere that matters.
- **No level requires precise timing on more than one thing at once.** A moving
  platform over a gap is fine. A moving platform over a gap with a saw on it is
  two things, and belongs in different levels.
- **Nothing is ever unfair**: no leap of faith into an off-screen landing, no
  hazard that cannot be seen before it can hurt, and no dead end that has to be
  failed to be discovered.
- When a level has to be one or the other, **make it longer rather than
  sharper**. Length is patience; sharpness is a wall.

### Checkpoints

Only long levels get them, and then **two or three, never more**, each placed
**immediately before a hard stretch** rather than spaced evenly. The purpose is
that failing the hard part costs the hard part and nothing else — a checkpoint
in the middle of an easy run just banks progress nobody was going to lose.

A short level gets none: restarting it is quicker than reaching its middle.

**"A hard stretch" means a substantial piece of the level, not an individual
obstacle.** Levels two and three's first draft (Task 6, phase 2) put a
checkpoint before every one of level three's three spike patches — three
checkpoints, one per obstacle. That reads as "immediately before a hard
stretch" if each patch is treated as its own stretch, but it was not what the
rule meant, and it was corrected on request in Sep 2026 along with the level
lengths below. A checkpoint marks the boundary between large *pieces* of a
level — roughly thirds of it — not a fence around every jump. The test of
whether a checkpoint earns its place: would skipping it mean redoing a real
chunk of the level, or would it just mean redoing the one thing right next to
it? Only the first is worth a flag. The easy, already-practised stretch of a
level — including its first hazard of a newly-introduced kind, which is meant
to be cheap to fail — goes unguarded on purpose.

Phase 1 already respawns the ball at the level's spawn when it falls out of the
world, so phase 2's work is to change the *target* of that respawn to the last
checkpoint reached, not to build the mechanism.

### The two themes

Both drawn entirely with shapes, no images anywhere.

- **Hills** — blue sky, parallax cloud and hill bands, green ground with a
  darker rim, wooden crates.
- **Toy factory** — a bright interior, not a dark one: pastel walls, big
  visible gears, conveyor belts, primary-coloured blocks. Toys, not machinery.
  Cheerful is the requirement; the factory is a change of scene, not a change
  of mood.

## Failing, and why nothing here is scary

Touching a hazard or falling below the level sends the ball back. It
**deflates** — squashes flat with a soft puff of particles — the screen dims
briefly, and it re-inflates at the last checkpoint. No blood, no injury, no
death imagery, no sound of pain. This is what Red Ball itself did, and it is
inside the hub's rules rather than an exception to them.

Enemies are squares with faces that pop into a few triangles when bounced on.
They do not chase off-screen, they do not swarm, and there is no weapon.

**There are no lives.** Failing sends the ball back to the last checkpoint, for
ever, and nothing else happens: no counter, no run that can end, nothing to
read. An earlier draft of this spec gave five lives per level and sent an
exhausted run back to level select; that was dropped before phase 2 was
planned, for three reasons.

A lives counter is a number a six-year-old cannot read being used to threaten
him. Checkpoints already make failure cost something — the stretch since the
last one — which is the whole job lives were doing. And "out of lives" is an
extra way for a run to end, in a game whose requirement is that failing be
harmless and instantly undone.

If stakes are ever wanted later, they belong in the star rating, which rewards
doing well rather than punishing doing badly.

**Superseded Sep 2026.** The three paragraphs above explain why phase 2
shipped with no lives at all, and the reasoning was sound for the audience
this game had then. Pushkar Ball's actual audience turned out to be 12, not
6, and at that age a game where nothing can really go wrong reads as boring
rather than safe. The shipped game now has a three-heart health system —
still drawn, never a digit, so "almost no text" still holds — where running
out sends the ball back to the level's own start with hearts refilled,
rather than ending a run or gating progress the way the rejected five-lives
draft above did. See
`docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md` for
the full reasoning and the design as built.

## Reaching the flag, and getting to the next level

Touching the flag ends the level. In order: the flag animates and the ball does
something pleased with itself, a results panel shows what was collected in
digits and stars, and then **the next level begins on its own**.

**Winning does not send the player back to a menu.** A child who has just won
should not have to navigate anything to keep playing — the momentum is most of
the reward, and every menu between two levels is a chance to get lost in one.
Level select exists to *choose where to start* and to replay a level already
beaten, not as a toll gate between every pair of them.

Three consequences that are part of the requirement, not details:

- **The results panel still has a way out while it is auto-advancing** — a grid
  button to level select and a house to the hub, visible the whole time. The
  hub's rule is that a child must always be able to get out of whatever he is
  in, and a boy who wants to replay the level he just enjoyed must not be
  carried onward whether he likes it or not.
- **The last level has nowhere to advance to**, so it returns to level select
  with something celebratory rather than sitting on a panel that promises a
  level that does not exist.
- **Auto-advance is for winning only**, and it is now the only way a level
  ends at all, since there are no lives to run out of.

Unlocking happens before the transition, so the level being advanced into is
already unlocked by the time it starts and a player who leaves immediately
afterwards still finds it available.

**No sound at the flag until phase 4.** All audio is phase 4, so through phases
2 and 3 the flag is animation only. This is a known and accepted gap rather
than an oversight — flagged because "animation and sounds" is the natural way
to describe the moment, and the sound half arrives two phases later.

## Text

Almost none, so the tile stays usable by a six-year-old too:

- Level numbers are **digits**. Digits are the one text he reads reliably —
  the same reasoning that lets Taras Town show a room code.
- Counts (gems, time) are digits with a small drawn icon. There is no lives
  counter, because there are no lives.
- Every button is a picture: a triangle to play, two bars to pause, a curved
  arrow to retry, a grid to go back to level select, a house to go back to the
  hub.
- "How to Play" is a picture: a drawn phone with the two move buttons and the
  jump button labelled by arrows, no sentences.
- The one word anywhere is the game's own name on the opening screen, exactly
  as Taras Town shows its own.

## Controls

Touch first, because the hub is a phone PWA:

- Bottom left: two large round buttons, left and right.
- Bottom right: one larger round jump button.
- Every position and size comes from `ui.js` and `config.js.UI`. **No test may
  ever contain a literal button coordinate.** Taras Town broke nine suites at
  once that way, and it fails silently — the tap lands on the world behind.

Keyboard alongside, always live, never announced on screen: ←/→ or A/D to
roll, space or ↑ or W to jump, P or Esc to pause.

Both at once is fine and neither disables the other; a phone with a keyboard
should not have to choose.

## Saving

`save.js` wraps every `localStorage` read and write in try/catch and returns
defaults on any failure, the same as Taras Town. Private-mode browsers and
storage-blocked browsers get a playable game with no memory, never an error.

Stored, under one key `pushkar-ball-save`: the highest level unlocked, and per
level the best time and the gems found. Nothing else. The star rating shown on
a level-select tile is derived from the gems found, not stored separately: one
star for finishing, two for half the level's gems, three for all of them. Nothing leaves the
device — no accounts, no analytics, no third-party requests, and this game has
no network code at all.

## Audio

Synthesised in code with WebAudio: jump, bounce, gem, hazard puff, level
complete, and a short looping tune. **Zero audio files are committed in this
spec.** If a sound turns out weak by ear, a replacement is prepared outside the
repo, agreed, and committed once — Taras Town's discipline, for Taras Town's
reason: anything committed to git is in the history for ever, and this repo has
already eaten a 14 MB MP3 that way.

Sound and music are separate switches, as they are in Taras Town, and both
persist in the save.

## Hub wiring

- A tile in the root `index.html`, picture-only, pointing at
  `games/pushkar-ball/index.html`. A circle with a small motion arc — plainly
  a ball, and plainly not the house that means Taras Town.
- Every new file added to `sw.js`'s `PRECACHE`, and `CACHE` bumped, so the game
  works offline the first time the hub is opened offline.
- Root `README.md` gains a row in the games table.

## Tests

`games/pushkar-ball/tests/run.mjs`, the same shape as Taras Town's: an
`offline/` half that runs in Node in seconds and a `browser/` half that drives
headless Chrome and reads pixels off the canvas.

**No test-only code in the game.** Browser suites read pixels; offline suites
import the DOM-free modules directly. If a test needs to know a number, it asks
`config.js` or `ui.js` for it.

Offline suites:

- `physics.mjs` — a ball dropped on flat ground comes to rest at exactly
  `r` above it and stays; a ball on a slope accelerates downhill; a ball never
  ends a step inside a segment; a ball fired at a wall at maximum speed does
  not pass through it; jump height from flat ground is within a few units of
  the closed-form `JUMP_V² / (2·GRAVITY)`.
- `feel.mjs` — coyote time allows a jump `COYOTE` seconds after leaving an
  edge and refuses it after; a buffered press within `BUFFER` of landing
  fires; jumping off a platform moving right carries its velocity.
- `crates.mjs` — a crate falls, rests, is pushed, cannot be shoved through a
  wall or lost down a hole, and is a step up to somewhere a jump cannot reach.
  Nothing goes NaN while riding one.
- `levels.mjs` — for every level: ids unique; spawn and every checkpoint sit
  in free space above ground; all geometry inside `bounds`; every ground
  polyline's normals point up; the goal is reachable in the weak sense that a
  ball dropped at it lands on something; no hazard overlaps a spawn or a
  checkpoint.
- `precache.mjs` — every file under `games/pushkar-ball/` that the game loads
  appears in the root `sw.js` `PRECACHE` list, and the folder contains no
  audio or image file at all.

Browser suites:

- `roll.mjs` — holding right moves the ball right and it visibly spins;
  releasing slows it; it comes to rest.
- `jump.mjs` — jump clears a known gap; two presses do not double-jump.
- `level.mjs` — a scripted run reaches the goal and the level-complete screen
  appears.
- `screens.mjs` — menu → level select → play → pause → resume → level select,
  every step by tapping the position `ui.js` reports.
- `small.mjs` — **every screen at 568×320 and 740×280**, asserting the jump
  button, the pause button and every screen's way out are all on screen. A
  child must always be able to get out of whatever he is in; Taras Town found
  three separate bugs of exactly this shape, and finding them here for free is
  cheaper than finding them on the sofa.

And screenshots, because most of the bugs worth finding in this repo were found
by rendering and looking: one per level, plus one of each screen, into
`tests/screenshots/`.

## Phases

Each phase ends playable and ends with the narrowest test run that covers it.

**Phase 1 — the feel.** `index.html`, `css/style.css`, `config.js`,
`physics.js`, `player.js`, `levels.js` (one hand-built level), `camera.js`,
`input.js`, a minimal `ui.js`, `main.js`. Hub tile and `sw.js` wiring, so it is
reachable from the phone the same day. Offline `physics.mjs` and `feel.mjs`,
browser `roll.mjs` and `jump.mjs`, one screenshot.

Nothing else — no hazards, no enemies, no gems, no menus, no save. **This phase
is played and judged before phase 2 starts.** If the roll is wrong, everything
built on top of it is wasted, and the numbers table above is a guess until a
thumb has disagreed with it.

**Phase 2 — danger.** `hazards.js`, checkpoints, the deflate/respawn,
the goal, a results panel, and advancing from one level into the next. Levels
one to three.

Auto-advance falls in this phase and level select does not, which works out
well rather than awkwardly: phase 2 ends as a straight run of three levels with
no menu anywhere in it — the flag, a results panel, the next level. Phase 4
then adds level select *beside* that flow rather than into the middle of it, so
nothing built here has to be taken apart.

Two things phase 1 already left in place for this: the ball respawns itself
when it falls out of the world, so checkpoints change the *target* of a respawn
rather than building one; and the flag is already drawn and inert, so it needs
logic rather than art.

**Phase 3 — company.** `enemies.js` (rolling spike ball, walking blob,
stationary popper that lobs soft balls), bouncing on them, gems, `effects.js`.
Levels four and five, and the factory theme.

**Phase 4 — around the game.** Main menu, level select with locks and star
ratings, pause, `save.js`, `audio.js`, the two sound switches.
Remaining browser suites, all screenshots, the small-screen suite.

## Changes outside the new folder

`CLAUDE.md` needs four edits, all of them corrections rather than additions:

1. **"Nothing scary" says what is actually meant.** No blood, no violence, no
   weapons, no realistic crime — and a fail state that is a deflating ball, not
   an injury. As written it forbids spikes outright, which was never the
   intent.
2. **The rules are labelled by scope.** "Nothing is drawn from a file" and the
   closed audio list are Taras Town's rules about Taras Town's folder. Pushkar
   Ball chooses to follow both, but it should say so itself rather than inherit
   them by proximity — the next game may differ, and a rule nobody can tell the
   scope of is a rule that gets ignored.
3. **A short Pushkar Ball section**, the equivalent of the Taras Town one:
   fixed-step physics, segments not tiles, DOM-free modules, `config.js` first,
   `main.js` stays thin, and the test command
   `node games/pushkar-ball/tests/run.mjs offline`.
4. **The rules that are genuinely hub-wide are stated once as such**: relative
   paths only, nothing leaves the device, no third-party requests, landscape
   only, every `localStorage` access in try/catch, and a way out of every
   screen at 568×320.

`red-ball-clone-prompt.md` — the untracked brief this came from — moves to
`docs/superpowers/specs/` alongside this file, or is deleted. It should not sit
in the repo root as if it were a game.

## Risks

- **The feel is a guess.** Every number in the table is unverified. This is why
  phase 1 exists and why it ships alone.
- **Sine-driven platforms and crushers cannot be pushed off course**, so a ball
  resting between a crusher and the floor has nowhere to go. Every crusher gets
  a gap at its bottom of at least `2r`, asserted in `levels.mjs`. The same
  applies to a pushable crate under a crusher, which is why a crate must never
  be authored where a crusher can reach it.
- **Synthesised music may be judged not good enough by ear**, exactly as it was
  in Taras Town. The answer is the same and is already written down: prepare a
  file outside the repo, agree it, commit it once.
- **Five levels is a lot of authoring by hand.** If it becomes the bottleneck,
  the fallback is four levels, not a level editor.
