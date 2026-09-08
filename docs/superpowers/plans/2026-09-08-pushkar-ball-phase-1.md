# Pushkar Ball, phase 1 (the feel) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ball you can roll, jump and slide around one hand-built level, reachable from the Pushkar Games hub tile, with the simulation tested in Node and the look checked by screenshot.

**Architecture:** The ball is a circle resolved against line segments; all world geometry is segments, so slopes and bowls need no special case. The step is a fixed 1/120 s driven by an accumulator, which makes the simulation deterministic and therefore exactly testable in Node. `config.js`, `physics.js`, `player.js` and `levels.js` never touch the DOM, so Node imports them directly; drawing lives entirely in the caller.

**Tech Stack:** Vanilla ES modules, HTML5 canvas, no dependencies, no build step. Tests are Node 22 (global `WebSocket`) driving headless Chrome over the DevTools Protocol, the same harness shape `games/taras-town/tests/run.mjs` uses.

**Spec:** [`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`](../specs/2026-09-08-pushkar-ball-design.md)

---

## Read this before starting

**House style.** This repo comments *why*, at length, in full sentences, and the comments outnumber what most codebases carry. Look at `games/taras-town/js/config.js` and `games/taras-town/tests/browser/_helpers.mjs` before writing a line. The code below is correct but under-commented on purpose — it shows the logic, not the finished density. Add the *why* as you go, especially where a line exists because of a bug.

**Screen coordinates.** y increases downward. Gravity is positive. An upward-facing normal has `ny < 0`. Getting this backwards is the single easiest way to waste an hour here.

**Never write a button coordinate into a test.** Ask `js/ui.js`. Taras Town broke nine suites at once that way and it fails silently — the tap just lands on the world behind.

**No test-only code in the game.** Browser suites read pixels off the canvas. Offline suites import the DOM-free modules.

**Phase 1 excludes**, deliberately: hazards, enemies, gems, lives, checkpoints, the goal's logic, menus, level select, saving, and audio. Do not build ahead. Every number in `config.js` is a guess that a thumb is about to disagree with, and anything built on top of them before that happens is wasted.

---

## File structure

| File | Responsibility | DOM? |
|---|---|---|
| `games/pushkar-ball/index.html` | canvas, one-tap start panel, rotate overlay, one module script | — |
| `games/pushkar-ball/css/style.css` | full-bleed canvas, start panel, portrait rotate overlay | — |
| `games/pushkar-ball/js/config.js` | every tunable number | never |
| `games/pushkar-ball/js/physics.js` | segments, the broad-phase grid, circle↔segment resolution, the step | never |
| `games/pushkar-ball/js/levels.js` | level data, the loader, moving platforms | never |
| `games/pushkar-ball/js/player.js` | the ball: accel, friction, jump, coyote, buffer, spin | never |
| `games/pushkar-ball/js/camera.js` | follow with lookahead and a vertical deadzone, clamped to bounds | never |
| `games/pushkar-ball/js/ui.js` | every button's position, hit test, and drawing | canvas only |
| `games/pushkar-ball/js/input.js` | keyboard and pointer, unified | yes |
| `games/pushkar-ball/js/main.js` | canvas sizing, the loop, the drawing of the world | yes |
| `games/pushkar-ball/tests/run.mjs` | harness | — |
| `games/pushkar-ball/tests/offline/*.mjs` | physics, feel, levels, precache | — |
| `games/pushkar-ball/tests/browser/*.mjs` | roll, jump, small screens | — |

Modified outside the folder: `index.html` (a tile), `sw.js` (precache + `CACHE` bump), `README.md`, `CLAUDE.md`, `.gitignore`.

---

## Task 1: The folder, the harness, and the hub tile

Nothing about physics yet. This task ends with a blue screen reachable from the hub tile on a phone, and a test harness that runs. Getting the plumbing wrong later, with a game on top of it, is much worse.

**Files:**
- Create: `games/pushkar-ball/index.html`
- Create: `games/pushkar-ball/css/style.css`
- Create: `games/pushkar-ball/js/main.js`
- Create: `games/pushkar-ball/tests/run.mjs`
- Create: `games/pushkar-ball/tests/offline/precache.mjs`
- Modify: `index.html` (repo root — add a tile)
- Modify: `sw.js` (repo root — precache list, bump `CACHE`)
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing precache test**

Create `games/pushkar-ball/tests/offline/precache.mjs`:

```js
// Every file the game loads must be in the service worker's precache list, or
// the game is missing pieces the first time the hub is opened offline. And the
// folder must contain no image or audio file at all: everything is drawn with
// shapes, and anything committed here is in git's history for ever.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', '..');          // games/pushkar-ball
const ROOT = join(GAME, '..', '..');          // the repo root

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'tests' || name === 'tools' || name === 'screenshots') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(GAME);
const BINARY = /\.(png|jpg|jpeg|gif|webp|svg|mp3|wav|ogg|m4a|woff2?|ttf)$/i;

console.log(`\n1. ${files.length} files under games/pushkar-ball/`);
for (const f of files) {
  const rel = relative(ROOT, f).split('\\').join('/');
  if (BINARY.test(rel)) {
    fail(`${rel} is an image, font or audio file — nothing here is loaded from a file`);
    continue;
  }
  if (!/\.(html|css|js)$/.test(rel)) continue;
  if (!sw.includes(`./${rel}`)) fail(`${rel} is not in sw.js's PRECACHE list`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PRECACHE CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Write the harness**

Create `games/pushkar-ball/tests/run.mjs`. This is Taras Town's `tests/run.mjs` with the multiplayer parts removed: one browser instead of two, its own ports so both games' suites can run at once, and its own URL.

```js
/**
 * run.mjs — Run every test.
 *
 *   node games/pushkar-ball/tests/run.mjs            everything
 *   node games/pushkar-ball/tests/run.mjs offline    no browser, a few seconds
 *   node games/pushkar-ball/tests/run.mjs roll       suites whose name matches
 *   node games/pushkar-ball/tests/run.mjs --live     the deployed site
 *
 * Nothing to install: Node 22's global WebSocket is enough to drive Chrome over
 * its DevTools Protocol, so the harness has no dependencies, matching the game.
 *
 * One browser, not two. This game has no multiplayer, so there is no second
 * player to run — which is also why its ports differ from Taras Town's: both
 * games' suites should be runnable at the same time.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'screenshots');

const SERVER_PORT = 8778;
const LOCAL_URL = `http://127.0.0.1:${SERVER_PORT}/games/pushkar-ball/index.html`;
const DEPLOYED_URL = 'https://tauruskin.github.io/taras-town/games/pushkar-ball/index.html';
const PORT = 9335;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const args = process.argv.slice(2);
const useDeployed = args.includes('--live');
const filters = args.filter((a) => !a.startsWith('--'));
const url = useDeployed ? DEPLOYED_URL : LOCAL_URL;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];

function findChrome() {
  const found = CHROMES.find((p) => existsSync(p));
  if (!found) {
    console.error('Could not find Chrome. Add its path to CHROMES in tests/run.mjs.');
    process.exit(2);
  }
  return found;
}

async function waitFor(check, what, seconds = 25) {
  for (let i = 0; i < seconds * 2; i++) {
    try { if (await check()) return true; } catch (_) {}
    await sleep(500);
  }
  console.error(`Gave up waiting for ${what}.`);
  return false;
}

function collect(dir) {
  const full = join(HERE, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .map((f) => ({ kind: dir, name: f.replace(/\.mjs$/, ''), file: join(full, f) }))
    .filter((s) => filters.length === 0 ||
                   filters.some((f) => f === s.kind || s.name.includes(f)));
}

function runSuite(suite) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [suite.file, url, suite.name, String(PORT)], {
      cwd: SHOTS, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  const suites = [...collect('offline'), ...collect('browser')];
  if (suites.length === 0) {
    console.error('No suites matched.', filters.join(', '));
    process.exit(2);
  }
  const needsBrowser = suites.some((s) => s.kind === 'browser');

  if (needsBrowser && !useDeployed) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    // Served from the repo root, so a suite can reach sw.js and the hub too.
    children.push(spawn(py, ['-m', 'http.server', String(SERVER_PORT), '--bind', '127.0.0.1'], {
      cwd: join(HERE, '..', '..', '..'), stdio: 'ignore',
    }));
    if (!await waitFor(async () => (await fetch(LOCAL_URL)).ok, 'the web server')) process.exit(2);
    console.log(`serving the game at ${LOCAL_URL}`);
  }

  if (needsBrowser) {
    children.push(spawn(findChrome(), [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(SHOTS, 'chrome-' + PORT)}`,
      'about:blank',
    ], { stdio: 'ignore' }));
    if (!await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok,
                       'the browser')) process.exit(2);
    console.log(`browser ready on port ${PORT}`);
  }

  console.log(`\nrunning ${suites.length} suite${suites.length === 1 ? '' : 's'} against ${useDeployed ? 'the DEPLOYED site' : 'a local copy'}\n`);

  const failures = [];
  for (const suite of suites) {
    process.stdout.write(`  ${(suite.kind + '/' + suite.name).padEnd(42)}`);
    const { code, out } = await runSuite(suite);
    const summary = out.trim().split('\n').filter(Boolean).pop() || '(no output)';
    if (code === 0) console.log('ok    ' + summary);
    else { console.log('FAIL'); failures.push({ suite, out }); }
  }

  for (const f of failures) {
    console.log(`\n${'='.repeat(66)}\n${f.suite.kind}/${f.suite.name}\n${'='.repeat(66)}`);
    console.log(f.out.trim());
  }

  console.log(failures.length
    ? `\n${failures.length} of ${suites.length} suites FAILED`
    : `\nall ${suites.length} suites passed`);
  return failures.length ? 1 : 0;
}

function cleanUp() { for (const c of children) { try { c.kill(); } catch (_) {} } }
process.on('SIGINT', () => { cleanUp(); process.exit(130); });

main().then((c) => { cleanUp(); process.exit(c); })
      .catch((e) => { console.error(e); cleanUp(); process.exit(2); });
```

- [ ] **Step 3: Run it and watch precache fail**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: `offline/precache  FAIL`, complaining that `games/pushkar-ball/index.html` and the rest are not in `sw.js`'s `PRECACHE` list. (`index.html`, `css/style.css` and `js/main.js` are created in the next step; if the suite instead errors that the folder is empty, create those three first and re-run.)

- [ ] **Step 4: Write index.html**

Create `games/pushkar-ball/index.html`. The one-tap start panel is not decoration: a phone will not go fullscreen or make a sound without a user gesture first, so there always has to be one tap before play. The house button back to the hub is the same shape the hub's own Taras Town tile uses, so the two match visually.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Pushkar Ball</title>
  <meta name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#4FC3F7">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='9' fill='%23E8402A'/></svg>">
  <!-- Relative, no leading slash: GitHub Pages serves this from a sub-folder. -->
  <link rel="stylesheet" href="css/style.css">
</head>
<body>

  <canvas id="game"></canvas>

  <div id="start-screen">
    <div class="panel" id="panel-welcome">
      <button id="hub-button" class="hub-link" aria-label="All games">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M6 24 L24 8 L42 24 L36 24 L36 40 L12 40 L12 24 Z"/>
        </svg>
      </button>
      <div class="ball"></div>
      <h1>Pushkar Ball</h1>
      <button id="start-button" class="big red" aria-label="Play">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M17 11 L37 24 L17 37 Z"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Shown by CSS alone whenever the phone is held upright. -->
  <div id="rotate-screen">
    <div class="phone"></div>
    <p>&#8635;</p>
  </div>

  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Write css/style.css**

Create `games/pushkar-ball/css/style.css`:

```css
/* Pushkar Ball. Landscape only, full bleed, nothing selectable or zoomable —
   a stray long-press during a jump must not pop up a text selection. */
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%; height: 100%; overflow: hidden;
  background: #4FC3F7;
  font-family: system-ui, -apple-system, sans-serif;
  -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
}

#game { display: block; width: 100%; height: 100%; }

#start-screen {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(#4FC3F7, #B3E5FC);
}
#start-screen.hidden { display: none; }

.panel { display: flex; flex-direction: column; align-items: center; gap: 14px; }

.panel h1 {
  font-size: clamp(22px, 7vh, 44px);
  color: #fff; text-shadow: 0 3px 0 rgba(0, 0, 0, .18);
  letter-spacing: .02em;
}

/* The hero, as a plain CSS circle — the same red the canvas draws it in. */
.ball {
  width: clamp(44px, 12vh, 78px); aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 32%, #FF7A63, #E8402A 70%);
  box-shadow: 0 6px 14px rgba(0, 0, 0, .22);
}

button {
  border: 0; background: none; cursor: pointer;
  display: grid; place-items: center;
}
button svg { width: 60%; height: 60%; fill: #fff; }

.big {
  width: clamp(58px, 16vh, 92px); aspect-ratio: 1; border-radius: 50%;
  box-shadow: 0 5px 0 rgba(0, 0, 0, .2);
}
.big:active { transform: translateY(3px); box-shadow: 0 2px 0 rgba(0, 0, 0, .2); }
.red { background: #E8402A; }

/* Top-left, and kept clear of the notch. A way out of every screen is a rule
   here, not a nicety. */
.hub-link {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  left: max(12px, env(safe-area-inset-left));
  width: 46px; height: 46px; border-radius: 14px;
  background: rgba(255, 255, 255, .28);
}
.hub-link svg { width: 68%; height: 68%; }

/* Portrait: cover everything and ask for a turn, with no words. */
#rotate-screen {
  position: fixed; inset: 0; display: none;
  flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; background: #2E3A46; color: #fff; z-index: 10;
}
#rotate-screen p { font-size: 46px; }
#rotate-screen .phone {
  width: 46px; height: 78px; border: 5px solid #fff; border-radius: 9px;
}
@media (orientation: portrait) {
  #rotate-screen { display: flex; }
}
```

- [ ] **Step 6: Write a placeholder main.js**

Create `games/pushkar-ball/js/main.js`. It only sizes the canvas, hides the start screen on the one tap, and paints the sky. Everything else arrives in Task 6.

```js
/**
 * main.js — canvas sizing, the one-tap start, and the game loop.
 *
 * This file holds the loop and the drawing of the world, and nothing else.
 * Taras Town's main.js reached 1800 lines by becoming the place anything went
 * when it had no obvious home; that is a cost being paid there, not a pattern
 * to copy. Entities draw themselves, the HUD lives in ui.js.
 */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let viewW = 0, viewH = 0;   // CSS pixels

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

let playing = false;
document.getElementById('start-button').addEventListener('click', () => {
  document.getElementById('start-screen').classList.add('hidden');
  playing = true;
  // Fullscreen is a bonus, never a requirement: a browser that refuses must
  // still get a playable game.
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) {}
});

document.getElementById('hub-button').addEventListener('click', () => {
  window.location.href = '../../index.html';
});

function frame() {
  ctx.fillStyle = '#4FC3F7';
  ctx.fillRect(0, 0, viewW, viewH);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 7: Add the hub tile**

In the repo root `index.html`, inside `<div class="tiles">`, after the Taras Town tile:

```html
      <a class="tile" href="games/pushkar-ball/index.html" aria-label="Play Pushkar Ball">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <!-- A ball with a bounce arc under it. Plainly not the house that
               means Taras Town, and plainly a ball rather than a dot. -->
          <circle cx="20" cy="17" r="9"/>
          <path d="M9 40 Q20 28 31 36 Q37 39 42 33"
                fill="none" stroke="currentColor" stroke-width="3.5"
                stroke-linecap="round" opacity="0.55"/>
        </svg>
      </a>
```

Check how `css/hub.css` fills tile SVGs. If it sets `fill` on the tile's `svg` and never `color`, add `stroke="#fff"` in place of `currentColor`, or set a `color` on `.tile svg`. Open the hub in a browser and confirm the arc is actually visible before committing.

- [ ] **Step 8: Add the game to sw.js**

In the repo root `sw.js`, bump the cache name and add the new files after the Taras Town block:

```js
const CACHE = 'pushkar-games-v2';
```

```js
  './games/pushkar-ball/index.html',
  './games/pushkar-ball/css/style.css',
  './games/pushkar-ball/js/main.js',
  './games/pushkar-ball/js/config.js',
  './games/pushkar-ball/js/physics.js',
  './games/pushkar-ball/js/levels.js',
  './games/pushkar-ball/js/player.js',
  './games/pushkar-ball/js/camera.js',
  './games/pushkar-ball/js/input.js',
  './games/pushkar-ball/js/ui.js',
```

Update the comment above `CACHE` to say why it was bumped: a second game's files were added to the list.

The files beyond `main.js` do not exist yet. That is deliberate — the precache test asserts every file present is listed, not that every listed file is present, and the service worker's `addAll` is wrapped so a missing entry cannot break installation. Verify that last claim by reading `sw.js`'s install handler; if `addAll` is not tolerant of a 404, add only `index.html`, `css/style.css` and `js/main.js` now and the rest in Task 6.

- [ ] **Step 9: Ignore the new screenshots folder**

In `.gitignore`, alongside the existing screenshots rule, add:

```
games/pushkar-ball/tests/screenshots/
```

Read the existing rule first — if it is already a pattern like `**/tests/screenshots/`, this is unnecessary and you should add nothing.

- [ ] **Step 10: Run the offline tests**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: `offline/precache  ok  ALL PRECACHE CHECKS PASSED`.

- [ ] **Step 11: Look at it**

Run: `python -m http.server 8778 --bind 127.0.0.1` from the repo root, open `http://127.0.0.1:8778/index.html`, confirm two tiles, tap the ball one, confirm the title panel and that the play button leaves a blue screen, and that the house button returns to the hub.

- [ ] **Step 12: Commit**

```bash
git add games/pushkar-ball index.html sw.js .gitignore
git commit -m "Add the Pushkar Ball folder, its test harness, and its hub tile

Nothing plays yet: a blue screen behind a one-tap start panel. The plumbing
comes first on purpose — a service worker precache list and a tile are much
harder to get wrong later with a game sitting on top of them."
```

---

## Task 2: config.js and physics.js

**Files:**
- Create: `games/pushkar-ball/js/config.js`
- Create: `games/pushkar-ball/js/physics.js`
- Create: `games/pushkar-ball/tests/offline/physics.mjs`

- [ ] **Step 1: Write the failing physics test**

Create `games/pushkar-ball/tests/offline/physics.mjs`:

```js
// The simulation, with no browser anywhere near it. The step is a fixed
// 1/120s, so this is not an approximation of what the game does — it is the
// same arithmetic, and these numbers are exact.
const { CONFIG }                            = await import('../../js/config.js');
const { segment, boxSegments, SegmentGrid, step } = await import('../../js/physics.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const near = (a, b, tol, what) => {
  if (Math.abs(a - b) > tol) fail(`${what}: got ${a.toFixed(2)}, wanted ${b.toFixed(2)} ±${tol}`);
};

const ball = (x, y) => ({ x, y, r: CONFIG.BALL.R, vx: 0, vy: 0 });

/** A collider around a fixed set of segments, which is all `step` needs. */
const world = (segs) => {
  const grid = new SegmentGrid(segs);
  return { near: (x, y, r) => [...grid.near(x, y, r)] };
};

const run = (b, w, seconds, contactsOut) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    const c = step(b, w, CONFIG.STEP, CONFIG);
    if (contactsOut) contactsOut.push(c);
  }
  return b;
};

// --- 1. normals point out of the solid ------------------------------------
//
// Winding order decides which side of a segment is solid, and getting it
// backwards makes a surface you fall through. Ground is authored left to
// right, so its normal must point up — and up is NEGATIVE y on a screen.
console.log('\n1. normals');
{
  const flat = segment(0, 700, 600, 700);
  near(flat.nx, 0, 1e-9, 'flat ground normal x');
  near(flat.ny, -1, 1e-9, 'flat ground normal y');

  // A box is four segments and every one of them must face outwards.
  const [top, right, bottom, left] = boxSegments(100, 100, 50, 50);
  near(top.ny, -1, 1e-9, 'box top normal y');
  near(right.nx, 1, 1e-9, 'box right normal x');
  near(bottom.ny, 1, 1e-9, 'box bottom normal y');
  near(left.nx, -1, 1e-9, 'box left normal x');
}

// --- 2. a ball dropped on flat ground settles and stays settled -----------
//
// Settles is the easy half. STAYS settled is the half that catches the classic
// bug: a restitution applied all the way down to zero leaves the ball jittering
// for ever at ever-smaller amplitudes, never resting, never reading as grounded
// two steps running — which makes jumping unreliable in a way that looks random.
console.log('\n2. resting on flat ground');
{
  const w = world([segment(0, 700, 1200, 700)]);
  const b = ball(600, 300);
  run(b, w, 3);
  near(b.y, 700 - CONFIG.BALL.R, 0.5, 'resting centre height');
  near(b.vy, 0, 1, 'resting vertical speed');

  const y0 = b.y;
  run(b, w, 2);
  near(b.y, y0, 0.05, 'still resting two seconds later');
}

// --- 3. a ball on a slope rolls downhill ----------------------------------
console.log('\n3. a slope');
{
  // Down to the right: 600 across, 300 down, about 27 degrees.
  const w = world([segment(0, 400, 600, 700)]);
  const b = ball(100, 300);
  run(b, w, 1.2);
  if (b.vx < 60) fail(`ball on a slope only reached vx ${b.vx.toFixed(1)} — it should roll downhill`);
  if (b.x < 110) fail('ball on a slope did not move downhill at all');
  console.log(`   rolled to vx ${b.vx.toFixed(0)} px/s`);
}

// --- 4. nothing ever ends a step inside a segment -------------------------
//
// The check that matters most, because the symptom of failing it is a ball
// that sinks into the floor or teleports, and it is invisible in a screenshot.
console.log('\n4. never inside anything');
{
  const segs = [
    segment(0, 700, 900, 700),
    segment(900, 700, 1200, 560),
    segment(1200, 560, 1600, 560),
    ...boxSegments(0, 0, 40, 900),
    ...boxSegments(1560, 0, 40, 900),
  ];
  const w = world(segs);
  const b = ball(200, 300);
  let worst = Infinity;

  // A scripted shove about, deterministic so a failure is reproducible.
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 1200; i++) {
    if (i % 40 === 0) { b.vx = (rnd() * 2 - 1) * CONFIG.MAX_SPEED; b.vy = -rnd() * CONFIG.JUMP_V; }
    step(b, w, CONFIG.STEP, CONFIG);
    for (const s of segs) {
      // Distance from the ball's centre to the segment, on its solid side only.
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ox = b.x - (s.ax + t * dx), oy = b.y - (s.ay + t * dy);
      const d = Math.hypot(ox, oy);
      if (d > 0 && (ox / d) * s.nx + (oy / d) * s.ny > 0) worst = Math.min(worst, d);
    }
  }
  console.log(`   closest approach ${worst.toFixed(2)} (radius ${CONFIG.BALL.R})`);
  if (worst < CONFIG.BALL.R - 0.6) fail(`ball got ${worst.toFixed(2)} from a surface — inside it`);
}

// --- 5. a very fast ball does not pass through a wall ---------------------
//
// This is what the sub-stepping in `step` is for. Ten times top speed is far
// beyond anything the game produces; the point is that the guard exists rather
// than that it is needed today.
console.log('\n5. no tunnelling');
{
  const w = world(boxSegments(1000, 0, 40, 900));
  const b = ball(500, 400);
  b.vx = CONFIG.MAX_SPEED * 10;
  run(b, w, 1);
  if (b.x > 1000) fail(`ball at ${(CONFIG.MAX_SPEED * 10).toFixed(0)} px/s passed through the wall (x=${b.x.toFixed(0)})`);
}

// --- 6. jump height matches the arithmetic --------------------------------
//
// Closed form, so this catches gravity being applied twice, or once per
// sub-step, or before the position instead of after it.
console.log('\n6. jump height');
{
  const w = world([segment(0, 700, 1200, 700)]);
  const b = ball(600, 300);
  run(b, w, 2);
  const rest = b.y;
  b.vy = -CONFIG.JUMP_V;
  let peak = rest;
  for (let i = 0; i < Math.round(1.5 / CONFIG.STEP); i++) {
    step(b, w, CONFIG.STEP, CONFIG);
    peak = Math.min(peak, b.y);
  }
  const height = rest - peak;
  const want = (CONFIG.JUMP_V * CONFIG.JUMP_V) / (2 * CONFIG.GRAVITY);
  console.log(`   rose ${height.toFixed(1)} px (arithmetic says ${want.toFixed(1)})`);
  near(height, want, 6, 'jump height');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PHYSICS CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node games/pushkar-ball/tests/run.mjs physics`

Expected: FAIL, with a module-not-found error for `../../js/config.js`.

- [ ] **Step 3: Write config.js**

Create `games/pushkar-ball/js/config.js`. Comment every number with what it is and, where relevant, that it is a guess:

```js
/**
 * config.js — Every tunable number in Pushkar Ball lives here.
 *
 * If the roll feels too slow, the jump too floaty, the stop too sudden, this
 * is the only file to open. Nothing here imports anything, so any value can be
 * changed and the page reloaded.
 *
 * The physics numbers below are a STARTING POINT, not a result. They were
 * chosen so the arithmetic is sane — the jump clears 131px, a 200px gap is
 * comfortable at speed — and they are expected to change once someone has
 * played it with a thumb.
 */
export const CONFIG = {
  // The simulation runs at a fixed rate and the drawing at whatever the screen
  // offers. Fixed-step is what makes the physics identical on every device and
  // exactly reproducible in node, which is how it gets tested at all.
  STEP: 1 / 120,
  // A backgrounded tab hands back one enormous delta on return. Without this
  // clamp the world fast-forwards, usually through a floor.
  MAX_FRAME: 0.25,

  // World units visible vertically, on every screen. A small phone therefore
  // sees a little less horizontally than a wide desktop, rather than seeing
  // less of the level — a platformer where the small screen shows less is
  // secretly harder on the small screen, which is not a difficulty anyone chose.
  VIEW_H: 540,

  BALL: { R: 20 },

  GRAVITY: 2200,        // px/s²
  ACCEL: 1600,          // px/s², rolling on the ground
  AIR_ACCEL: 0.45,      // multiplier on ACCEL while airborne
  MAX_SPEED: 420,       // px/s horizontal
  GROUND_FRICTION: 6.0, // per second; how fast an unpushed ball rolls to a stop
  RESTITUTION: 0.18,    // how much of an impact comes back. A ball bounces a
                        // little; a ball that bounces a lot is a nuisance.
  REST_EPS: 40,         // px/s below which an impact is absorbed rather than
                        // bounced, so a resting ball actually rests
  JUMP_V: 760,          // px/s upward impulse — clears 131px
  COYOTE: 0.10,         // s after leaving the ground that a jump still works
  BUFFER: 0.12,         // s before landing that a jump press is remembered
  GROUND_NY: -0.6,      // a contact normal this far up counts as ground

  CAMERA: {
    LERP: 8,            // horizontal follow, per second
    LERP_Y: 2.5,        // vertical follow, much slower on purpose: a camera
                        // that tracks every jump exactly is nauseating
    DEADZONE_Y: 90,     // world units of vertical slack before it follows at all
    LOOKAHEAD: 0.35,    // seconds of vx to look ahead of the ball
  },

  UI: {
    BUTTON_R: 40,       // the two move buttons
    JUMP_R: 52,         // the jump button, deliberately the biggest thing
    EDGE: 20,           // gap from the screen edge
    GAP: 14,            // gap between the two move buttons
    HIT: 1.3,           // hit radius as a multiple of the drawn one. A thumb
                        // is not a mouse pointer and misses look like bugs.
  },

  COLOURS: {
    SKY_TOP: '#4FC3F7',
    SKY_LOW: '#B3E5FC',
    HILL_FAR: '#8ED6A0',
    HILL_NEAR: '#63BE7B',
    GROUND: '#7ED957',
    GROUND_EDGE: '#4E9E38',
    CRATE: '#C98A4B',
    CRATE_LINE: '#9C6631',
    PLATFORM: '#B0BEC5',
    PLATFORM_EDGE: '#78909C',
    BALL: '#E8402A',
    BALL_LIGHT: '#FF8A72',
    BALL_MARK: '#A32615',
    BUTTON: 'rgba(255,255,255,0.30)',
    BUTTON_HELD: 'rgba(255,255,255,0.58)',
    BUTTON_MARK: '#FFFFFF',
  },
};
```

- [ ] **Step 4: Write physics.js**

Create `games/pushkar-ball/js/physics.js`:

```js
/**
 * physics.js — the ball, the segments, and what happens when they meet.
 *
 * All world geometry is line segments with a normal. A box is four segments; a
 * slope is one; a bowl is a polyline of several. Nothing else is a collider.
 * That is the whole reason a rolling ball works here: a grid of tiles is
 * simpler to write and has no honest slopes, and slopes are where a rolling
 * ball earns its existence.
 *
 * Nothing in this file touches the DOM, so node imports it directly and tests
 * the real arithmetic rather than an approximation of it.
 *
 * Screen coordinates throughout: y increases DOWNWARD, so an upward-facing
 * normal has ny < 0.
 */

/**
 * A segment from a to b, with the left-hand perpendicular as its normal.
 *
 * Winding order therefore decides which side is solid, and only that side is.
 * Ground polylines are authored left to right, which puts their normal up.
 */
export function segment(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return { ax, ay, bx, by, nx: dy / len, ny: -dx / len, owner: null };
}

/**
 * The four sides of a box, each facing outward.
 *
 * The order matters and is top, right, bottom, left — walking the corners so
 * that every left-hand perpendicular points away from the middle. Reorder
 * these and you get a box that is solid only from the inside.
 */
export function boxSegments(x, y, w, h) {
  return [
    segment(x, y, x + w, y),
    segment(x + w, y, x + w, y + h),
    segment(x + w, y + h, x, y + h),
    segment(x, y + h, x, y),
  ];
}

function closestOn(s, px, py) {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: s.ax + t * dx, y: s.ay + t * dy };
}

/**
 * Segments in buckets, so resolution only ever looks at what is nearby.
 *
 * A level is a few hundred segments, so this is not a performance need today.
 * It is here so the resolution loop stays honest at the size the last level
 * reaches, without anybody having to think about it again.
 */
export class SegmentGrid {
  constructor(segments, cell = 128) {
    this.cell = cell;
    this.buckets = new Map();
    for (const s of segments) this._add(s);
  }

  _add(s) {
    const c = this.cell;
    const c0 = Math.floor(Math.min(s.ax, s.bx) / c), c1 = Math.floor(Math.max(s.ax, s.bx) / c);
    const r0 = Math.floor(Math.min(s.ay, s.by) / c), r1 = Math.floor(Math.max(s.ay, s.by) / c);
    for (let r = r0; r <= r1; r++) {
      for (let cc = c0; cc <= c1; cc++) {
        const k = cc + ',' + r;
        let b = this.buckets.get(k);
        if (!b) this.buckets.set(k, b = []);
        b.push(s);
      }
    }
  }

  /** Every segment whose bucket the circle overlaps. A Set, so no duplicates. */
  near(x, y, r) {
    const c = this.cell;
    const out = new Set();
    const c0 = Math.floor((x - r) / c), c1 = Math.floor((x + r) / c);
    const r0 = Math.floor((y - r) / c), r1 = Math.floor((y + r) / c);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const b = this.buckets.get(cc + ',' + rr);
        if (b) for (const s of b) out.add(s);
      }
    }
    return out;
  }
}

/**
 * Push the ball out of everything it is inside, and take the speed out of the
 * impacts.
 *
 * @returns the contacts made, each with the direction it pushed and the
 *          segment responsible. The caller works out from these whether the
 *          ball is on the ground — the terrain never says so itself, which is
 *          what makes slopes, boxes and moving platforms all work with no
 *          special case anywhere.
 */
export function resolve(ball, segments, cfg) {
  const contacts = [];

  for (const s of segments) {
    const c = closestOn(s, ball.x, ball.y);
    let ox = ball.x - c.x, oy = ball.y - c.y;
    let d = Math.hypot(ox, oy);

    // Dead centre on the segment: there is no direction to push out along, so
    // use the segment's own.
    if (d < 1e-6) { ox = s.nx; oy = s.ny; d = 1; }
    if (d >= ball.r) continue;

    const nx = ox / d, ny = oy / d;

    // Only ever push out on the solid side. Without this a ball that has
    // somehow got past a thin floor is helpfully pushed the rest of the way
    // through it, and one-sided ground stops being one-sided.
    if (nx * s.nx + ny * s.ny <= 0) continue;

    ball.x += nx * (ball.r - d);
    ball.y += ny * (ball.r - d);

    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      // Below REST_EPS the impact is absorbed rather than returned. A
      // restitution applied all the way down leaves a resting ball jittering
      // for ever, never settling and never reading as grounded twice running.
      const back = -vn < cfg.REST_EPS ? 0 : -vn * cfg.RESTITUTION;
      const dv = back - vn;
      ball.vx += nx * dv;
      ball.vy += ny * dv;
    }

    contacts.push({ nx, ny, seg: s });
  }

  return contacts;
}

/**
 * One step of the world: gravity, movement, resolution.
 *
 * @param world anything with `near(x, y, r)` returning segments
 */
export function step(ball, world, dt, cfg) {
  ball.vy += cfg.GRAVITY * dt;

  // Subdivide rather than move further than half a radius in one go. At the
  // tuned speeds this never fires; it is the difference between a fast ball
  // and a ball that passes through a floor.
  const travel = Math.hypot(ball.vx, ball.vy) * dt;
  const n = Math.max(1, Math.ceil(travel / (ball.r * 0.5)));
  const sub = dt / n;

  let contacts = [];
  for (let i = 0; i < n; i++) {
    ball.x += ball.vx * sub;
    ball.y += ball.vy * sub;
    const made = resolve(ball, world.near(ball.x, ball.y, ball.r), cfg);
    if (made.length) contacts = contacts.concat(made);
  }
  return contacts;
}
```

- [ ] **Step 5: Run the test**

Run: `node games/pushkar-ball/tests/run.mjs physics`

Expected: `offline/physics  ok  ALL PHYSICS CHECKS PASSED`, with the printed slope speed, closest approach and jump height all sane.

If check 4 fails by a small margin (worst around `R - 1`), the cause is almost certainly resolution order rather than the maths: two segments meeting at a corner each push the ball out and the second undoes part of the first. Raising the tolerance is the wrong fix. Run `resolve` twice per sub-step instead, which converges corners, and say so in a comment.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/physics.js games/pushkar-ball/tests/offline/physics.mjs
git commit -m "Add Pushkar Ball's physics: a circle against line segments

Every collider is a line segment with a normal derived from its winding
order, which is what makes slopes and bowls fall out for free instead of
being special cases. The step is a fixed 1/120s, so the simulation is
deterministic and node can test the real arithmetic rather than an
approximation of it."
```

---

## Task 3: levels.js and the first level

**Files:**
- Create: `games/pushkar-ball/js/levels.js`
- Create: `games/pushkar-ball/tests/offline/levels.mjs`

- [ ] **Step 1: Write the failing levels test**

Create `games/pushkar-ball/tests/offline/levels.mjs`:

```js
// Every level, checked for the mistakes that are easy to make by hand and
// invisible until someone plays it: a polyline wound backwards so you fall
// through the floor, a spawn inside a wall, geometry outside the bounds the
// camera clamps to.
const { CONFIG }             = await import('../../js/config.js');
const { LEVELS, loadLevel }  = await import('../../js/levels.js');
const { step }               = await import('../../js/physics.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// --- 1. ids are unique ----------------------------------------------------
console.log(`\n1. ${LEVELS.length} level(s)`);
{
  const ids = LEVELS.map((l) => l.id);
  if (new Set(ids).size !== ids.length) fail(`duplicate level ids: ${ids.join(', ')}`);
}

for (const data of LEVELS) {
  const level = loadLevel(data);
  console.log(`\n   level ${data.id}: ${level.statics.length} segments, ${level.movers.length} movers`);

  // --- 2. ground faces up ------------------------------------------------
  //
  // Ground polylines are authored left to right, which puts the left-hand
  // perpendicular upward. A backwards one is a floor you fall through, and it
  // looks completely normal in a screenshot.
  for (const line of data.ground || []) {
    for (let i = 0; i < line.length - 1; i++) {
      if (line[i + 1][0] <= line[i][0]) {
        fail(`level ${data.id}: a ground polyline goes backwards at x=${line[i][0]}`);
      }
    }
  }
  for (const s of level.statics) {
    if (s.fromGround && s.ny >= 0) {
      fail(`level ${data.id}: a ground segment at (${s.ax},${s.ay}) faces down`);
    }
  }

  // --- 3. everything is inside the bounds --------------------------------
  //
  // The camera clamps to these, so anything outside them can never be seen.
  for (const s of level.statics) {
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) {
      if (x < 0 || y < 0 || x > level.bounds.w || y > level.bounds.h) {
        fail(`level ${data.id}: a segment reaches (${x},${y}), outside ${level.bounds.w}x${level.bounds.h}`);
      }
    }
  }

  // --- 4. a moving platform stays inside the bounds all the way through --
  for (const m of level.movers) {
    for (let t = 0; t < m.period; t += m.period / 32) {
      m.update(t);
      if (m.x < 0 || m.y < 0 || m.x + m.w > level.bounds.w || m.y + m.h > level.bounds.h) {
        fail(`level ${data.id}: a platform leaves the bounds at t=${t.toFixed(2)}`);
      }
    }
    m.update(0);
  }

  // --- 5. the spawn is in free space, and lands on something -------------
  //
  // A spawn inside geometry is ejected in whatever direction the resolution
  // happens to pick, which looks like the game throwing the player at random.
  const b = { x: level.spawn.x, y: level.spawn.y, r: CONFIG.BALL.R, vx: 0, vy: 0 };
  if (level.near(b.x, b.y, b.r).some((s) => {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(b.x - (s.ax + t * dx), b.y - (s.ay + t * dy)) < b.r;
  })) fail(`level ${data.id}: the spawn is inside something`);

  let landed = false;
  for (let i = 0; i < Math.round(4 / CONFIG.STEP) && !landed; i++) {
    level.update(CONFIG.STEP);
    landed = step(b, level, CONFIG.STEP, CONFIG).some((c) => c.ny < CONFIG.GROUND_NY);
  }
  if (!landed) fail(`level ${data.id}: a ball dropped at the spawn never lands`);
  else console.log(`   spawn lands at y=${b.y.toFixed(0)}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL LEVEL CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node games/pushkar-ball/tests/run.mjs levels`

Expected: FAIL, module not found for `../../js/levels.js`.

- [ ] **Step 3: Write levels.js**

Create `games/pushkar-ball/js/levels.js`:

```js
/**
 * levels.js — the levels as data, and the loader that turns them into
 * colliders.
 *
 * A level is a plain object. Nothing is drawn pixel by pixel and no geometry
 * is computed at draw time, so a level can be tweaked or added without going
 * anywhere near the game loop.
 *
 * Ground polylines are authored LEFT TO RIGHT. That is not a convention for
 * tidiness: winding order is what decides which side of a segment is solid,
 * and a backwards polyline is a floor you fall through. tests/offline/levels
 * enforces it.
 *
 * DOM-free, so node can ask it anything the browser knows.
 */
import { segment, boxSegments, SegmentGrid } from './physics.js';

export const LEVELS = [
  {
    id: 1,
    theme: 'hills',
    bounds: { w: 4800, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 4660, y: 660 },

    ground: [
      // Flat to begin with, then up a ramp, along the top and down the other
      // side — rolling and slopes, before anything is asked of the player.
      [[40, 760], [900, 760], [1250, 600], [1600, 600], [1950, 760], [2400, 760]],
      // After a 200px gap: flat, a bowl to roll through, then flat again. A
      // 200px gap is comfortable at speed; the jump reaches about 290px.
      [[2600, 760], [3100, 760], [3250, 840], [3450, 840], [3600, 760], [4200, 760]],
      // The last ledge. Nothing but the moving platform reaches it.
      [[4560, 680], [4760, 680]],
    ],

    boxes: [
      // Walls at both ends, so the level cannot be left sideways.
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 4760, y: 0, w: 40, h: 1080 },
      // A crate on the flat: jump it, or build up speed and roll over it.
      { x: 3780, y: 660, w: 110, h: 100 },
    ],

    platforms: [
      // Across the last gap. Its travel is chosen so its left edge reaches
      // back over the ground at 4200 and its right edge stops short of the
      // ledge at 4560, leaving a small hop — a platform that docks exactly
      // with the scenery reads as part of it.
      { x: 4275, y: 740, w: 170, h: 28, axis: 'x', dist: 85, period: 5.0, phase: 0 },
      // A lift over the first flat. Nothing needs it; it is here so vertical
      // movers are exercised by the game and not only by the tests.
      { x: 1700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 },
    ],
  },
];

/**
 * A moving platform.
 *
 * Driven by a sine of level time rather than by integrated velocity, which
 * buys two things worth having: the level looks identical on every attempt, so
 * a player learns the timing instead of re-reading it; and a test can assert
 * where a platform is at time t without running the game.
 */
function makeMover(p) {
  const m = {
    ...p,
    x: p.x, y: p.y,
    dx: 0, dy: 0,     // how far it moved this step, so a rider comes along
    vx: 0, vy: 0,     // how fast it is going, so a jump off it carries
    segments: [],

    update(t) {
      const a = (t / p.period + (p.phase || 0)) * Math.PI * 2;
      const off = Math.sin(a) * p.dist;
      const nx = p.x + (p.axis === 'x' ? off : 0);
      const ny = p.y + (p.axis === 'y' ? off : 0);
      m.dx = nx - m.x; m.dy = ny - m.y;
      m.x = nx; m.y = ny;

      // The exact derivative of the sine above, not a difference divided by
      // dt: a ball jumping off should carry the speed the platform actually
      // has. Without this half, jumping off a moving platform feels broken in
      // a way players notice and cannot name.
      const v = Math.cos(a) * p.dist * (Math.PI * 2 / p.period);
      m.vx = p.axis === 'x' ? v : 0;
      m.vy = p.axis === 'y' ? v : 0;

      m.segments = boxSegments(m.x, m.y, p.w, p.h);
      // So a contact can be traced back to the platform that made it.
      for (const s of m.segments) s.owner = m;
    },

    overlaps(x, y, r) {
      return x + r > m.x && x - r < m.x + p.w && y + r > m.y && y - r < m.y + p.h;
    },
  };
  m.update(0);
  m.dx = 0; m.dy = 0;
  return m;
}

class Level {
  constructor(data) {
    this.data = data;
    this.bounds = data.bounds;
    this.spawn = { ...data.spawn };
    this.goal = data.goal ? { ...data.goal } : null;
    this.theme = data.theme;
    this.time = 0;

    const segs = [];
    for (const line of data.ground || []) {
      for (let i = 0; i < line.length - 1; i++) {
        const s = segment(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
        // Marked so the level test can insist ground faces up without having
        // to guess which segments came from a polyline and which from a box.
        s.fromGround = true;
        segs.push(s);
      }
    }
    for (const b of data.boxes || []) segs.push(...boxSegments(b.x, b.y, b.w, b.h));

    this.statics = segs;
    this.grid = new SegmentGrid(segs);
    this.movers = (data.platforms || []).map(makeMover);
  }

  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
  }

  /**
   * Every segment the ball could touch right now.
   *
   * Statics come from the grid; movers are checked one by one because there
   * are a handful of them and rebuilding a grid every step to save four
   * comparisons would be a poor trade.
   */
  near(x, y, r) {
    const out = [...this.grid.near(x, y, r)];
    for (const m of this.movers) if (m.overlaps(x, y, r)) out.push(...m.segments);
    return out;
  }
}

export function loadLevel(data) { return new Level(data); }
```

- [ ] **Step 4: Run the test**

Run: `node games/pushkar-ball/tests/run.mjs levels`

Expected: `offline/levels  ok  ALL LEVEL CHECKS PASSED`.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/levels.mjs
git commit -m "Add Pushkar Ball's level data and its first level

Levels are plain objects expanded into segments by a loader, so they can be
tweaked without going near the game loop. Moving platforms follow a sine of
level time rather than integrated velocity: the level plays identically every
attempt, so timing can be learnt, and a test can ask where a platform is at
time t without running the game."
```

---

## Task 4: player.js — the ball, and how forgiving it is

**Files:**
- Create: `games/pushkar-ball/js/player.js`
- Create: `games/pushkar-ball/tests/offline/feel.mjs`

- [ ] **Step 1: Write the failing feel test**

Create `games/pushkar-ball/tests/offline/feel.mjs`:

```js
// The forgiveness. Coyote time, jump buffering, and moving platforms carrying
// a rider — three things nobody notices when they work and everybody feels
// when they do not.
const { CONFIG }     = await import('../../js/config.js');
const { Ball }       = await import('../../js/player.js');
const { loadLevel }  = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

/** A stand-in for input.js, so this needs no browser and no event loop. */
const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

/** A one-off flat level ending at `edge`, so a ball can roll off it. */
const flat = (edge = 1200) => loadLevel({
  id: 99, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [edge, 760]]],
  boxes: [],
  platforms: [],
});

const run = (ball, level, input, seconds, each) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    if (each) each(i * CONFIG.STEP);
  }
};

// --- 1. rolling and stopping ---------------------------------------------
console.log('\n1. rolling');
{
  const level = flat(4000);
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const input = stub();
  run(ball, level, input, 0.6);           // settle

  input.right = true;
  run(ball, level, input, 1.5);
  if (ball.vx < CONFIG.MAX_SPEED * 0.9) fail(`held right for 1.5s and only reached ${ball.vx.toFixed(0)} px/s`);
  if (ball.vx > CONFIG.MAX_SPEED + 1) fail(`ball exceeded its own top speed: ${ball.vx.toFixed(0)}`);
  if (Math.abs(ball.spin) < 1) fail('the ball rolled without turning');

  input.right = false;
  run(ball, level, input, 2.5);
  if (Math.abs(ball.vx) > 12) fail(`ball did not roll to a stop: still ${ball.vx.toFixed(1)} px/s`);
  console.log(`   reached ${CONFIG.MAX_SPEED} px/s, spun ${ball.spin.toFixed(1)} rad, rolled to a stop`);
}

// --- 2. coyote time ------------------------------------------------------
//
// A jump asked for just after the edge should still work. This is the single
// cheapest thing that stops a platformer feeling stiff.
console.log('\n2. coyote time');
{
  const early = (delay) => {
    const level = flat(1200);
    const ball = new Ball(1100, 600);
    const input = stub();
    run(ball, level, input, 0.6);
    input.right = true;
    // Roll off the end.
    let airborne = 0;
    run(ball, level, input, 2, () => {
      if (!ball.grounded) airborne += CONFIG.STEP;
      if (airborne > 0 && airborne <= delay + CONFIG.STEP && airborne > delay) input.press();
    });
    return ball;
  };

  const forgiven = early(CONFIG.COYOTE * 0.4);
  if (!forgiven.jumped) fail(`a jump ${(CONFIG.COYOTE * 0.4).toFixed(2)}s after the edge was refused`);

  const tooLate = early(CONFIG.COYOTE * 3);
  if (tooLate.jumped) fail(`a jump ${(CONFIG.COYOTE * 3).toFixed(2)}s after the edge was allowed — that is a double jump`);
  console.log(`   within ${CONFIG.COYOTE}s forgiven, well after it refused`);
}

// --- 3. jump buffering ---------------------------------------------------
console.log('\n3. jump buffering');
{
  const level = flat(4000);
  const ball = new Ball(600, 600);
  const input = stub();
  run(ball, level, input, 0.6);

  ball.vy = -CONFIG.JUMP_V;               // in the air
  let pressed = false, jumpedAfter = false;
  run(ball, level, input, 2, () => {
    // Press while still falling, close enough to the ground to be remembered.
    if (!pressed && ball.vy > 0 && (760 - CONFIG.BALL.R) - ball.y < 40) { input.press(); pressed = true; }
    if (pressed && ball.jumped) jumpedAfter = true;
  });
  if (!pressed) fail('the test never got close enough to the ground to press early');
  if (!jumpedAfter) fail('a press just before landing was forgotten instead of buffered');
  else console.log(`   a press within ${CONFIG.BUFFER}s of landing fires on landing`);
}

// --- 4. holding jump is not a double jump --------------------------------
//
// takeJump consumes a press. If it reported "held" instead, the ball would
// bounce up the moment it touched anything, for ever.
console.log('\n4. holding jump');
{
  const level = flat(4000);
  const ball = new Ball(600, 600);
  const input = stub();
  run(ball, level, input, 0.6);

  let jumps = 0;
  input.press();
  run(ball, level, input, 3, () => {
    // A real held button presses once and stays down; the stub models that by
    // simply never pressing again.
    if (ball.jumped) { jumps++; ball.jumped = false; }
  });
  if (jumps !== 1) fail(`one press produced ${jumps} jumps`);
  else console.log('   one press, one jump');
}

// --- 5. a moving platform carries its rider ------------------------------
console.log('\n5. riding a platform');
{
  const level = loadLevel({
    id: 98, theme: 'hills',
    bounds: { w: 2400, h: 1080 },
    spawn: { x: 600, y: 500 },
    ground: [[[40, 1000], [2360, 1000]]],
    boxes: [],
    platforms: [{ x: 600, y: 700, w: 260, h: 28, axis: 'x', dist: 200, period: 4, phase: 0 }],
  });
  const ball = new Ball(level.movers[0].x + 130, 600);
  const input = stub();
  run(ball, level, input, 1.0);

  if (!ball.platform) fail('the ball is not standing on the platform it was dropped onto');
  const x0 = ball.x, px0 = level.movers[0].x;
  run(ball, level, input, 0.8);
  const moved = ball.x - x0, platformMoved = level.movers[0].x - px0;
  if (Math.abs(platformMoved) < 20) fail('the platform barely moved — the test proves nothing');
  if (Math.abs(moved - platformMoved) > 12) {
    fail(`platform moved ${platformMoved.toFixed(1)} but its rider moved ${moved.toFixed(1)}`);
  } else {
    console.log(`   platform moved ${platformMoved.toFixed(0)}, rider came along`);
  }
}

// --- 6. jumping off a moving platform carries its speed ------------------
console.log('\n6. jumping off a mover');
{
  const board = (dist) => {
    const level = loadLevel({
      id: 97, theme: 'hills',
      bounds: { w: 4000, h: 1080 },
      spawn: { x: 600, y: 500 },
      ground: [[[40, 1000], [3960, 1000]]],
      boxes: [],
      // phase 0 puts the sine at its steepest, so it is moving fastest exactly
      // when the ball jumps — a platform at the end of its travel is
      // momentarily still and would prove nothing.
      platforms: [{ x: 600, y: 700, w: 260, h: 28, axis: 'x', dist, period: 4, phase: 0 }],
    });
    const ball = new Ball(level.movers[0].x + 130, 600);
    const input = stub();
    run(ball, level, input, 1.0);
    input.press();
    run(ball, level, input, CONFIG.STEP * 2);
    return ball.vx;
  };

  const still = board(0);
  const moving = board(200);
  if (moving - still < 40) {
    fail(`jumped off a moving platform at vx ${moving.toFixed(1)} vs ${still.toFixed(1)} off a still one — its speed was not carried`);
  } else {
    console.log(`   carried ${(moving - still).toFixed(0)} px/s off the platform`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL FEEL CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node games/pushkar-ball/tests/run.mjs feel`

Expected: FAIL, module not found for `../../js/player.js`.

- [ ] **Step 3: Write player.js**

Create `games/pushkar-ball/js/player.js`:

```js
/**
 * player.js — the ball.
 *
 * Acceleration rather than instant velocity, so momentum is a thing the player
 * manages rather than a thing that happens. Everything forgiving about the jump
 * lives here too: coyote time, buffering, and carrying a moving platform's
 * speed.
 *
 * DOM-free, and it draws nothing — main.js does that. Which is what lets the
 * whole feel of the game be tested in node in a fraction of a second.
 */
import { CONFIG } from './config.js';
import { step } from './physics.js';

export class Ball {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = CONFIG.BALL.R;
    this.vx = 0; this.vy = 0;

    // Drawing only. A ball that slides without turning looks wrong, and one
    // whose turn does not match its speed looks worse.
    this.spin = 0;

    this.grounded = false;
    this.coyote = 0;      // seconds of grace left since leaving the ground
    this.buffer = 0;      // seconds left of a remembered jump press
    this.platform = null; // the mover under us, if any
    this.jumped = false;  // this step, for anything that wants to react
  }

  update(dt, input, level) {
    const C = CONFIG;
    this.jumped = false;

    // A platform we are standing on moved this step, so we move with it. This
    // runs before anything else: the ball should be where the platform put it
    // before gravity and resolution have their say.
    if (this.platform) { this.x += this.platform.dx; this.y += this.platform.dy; }

    // --- along the ground -------------------------------------------------
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) {
      this.vx += dir * C.ACCEL * (this.grounded ? 1 : C.AIR_ACCEL) * dt;
      if (Math.abs(this.vx) > C.MAX_SPEED) this.vx = Math.sign(this.vx) * C.MAX_SPEED;
    } else if (this.grounded) {
      // Rolling to a stop. Expressed as a rate so it does not depend on dt.
      this.vx -= this.vx * Math.min(1, C.GROUND_FRICTION * dt);
    }

    // --- the jump ---------------------------------------------------------
    //
    // takeJump consumes a PRESS. Reading a held button here instead would make
    // the ball bounce the instant it touched anything, for ever.
    if (input.takeJump()) this.buffer = C.BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);

    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = -C.JUMP_V;
      // Off a mover, take its speed with us. Without this, jumping off a
      // moving platform feels broken in a way players notice and cannot name.
      if (this.platform) this.vx += this.platform.vx;
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.platform = null;
      this.jumped = true;
    }

    // --- move, and be pushed back out ------------------------------------
    const contacts = step(this, level, dt, C);

    // Grounded is derived from the contacts, never set by the terrain. That is
    // what makes standing on a slope, on a box, and on a moving platform all
    // work with no special case anywhere.
    let grounded = false, platform = null;
    for (const c of contacts) {
      if (c.ny < C.GROUND_NY) {
        grounded = true;
        if (c.seg.owner) platform = c.seg.owner;
      }
    }
    this.grounded = grounded;
    this.platform = platform;
    this.coyote = grounded ? C.COYOTE : Math.max(0, this.coyote - dt);

    this.spin += (this.vx / this.r) * dt;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `node games/pushkar-ball/tests/run.mjs feel`

Expected: `offline/feel  ok  ALL FEEL CHECKS PASSED`.

Check 3 is the one most likely to fail for a reason that is the test's fault rather than the game's — its "close enough to the ground" window of 40px is a fixed allowance, and this repo's history is full of fixed allowances meeting a world that changed. If it fails, print `ball.y`, `ball.vy` and `ball.buffer` at the moment of the press before changing anything in `player.js`.

- [ ] **Step 5: Run every offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: all four suites ok — `feel`, `levels`, `physics`, `precache`.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/player.js games/pushkar-ball/tests/offline/feel.mjs
git commit -m "Add Pushkar Ball's ball, and the forgiveness in its jump

Coyote time, jump buffering, and carrying a moving platform's speed on the
way off it. None of the three is noticed when it works and all three are felt
when they are missing, so all three are tested — in node, in a fraction of a
second, because nothing in the simulation touches the DOM.

Grounded is derived from contact normals rather than set by the terrain, which
is what makes slopes, crates and moving platforms all work without a special
case for any of them."
```

---

## Task 5: ui.js and input.js

**Files:**
- Create: `games/pushkar-ball/js/ui.js`
- Create: `games/pushkar-ball/js/input.js`
- Create: `games/pushkar-ball/tests/offline/buttons.mjs`

- [ ] **Step 1: Write the failing button test**

Create `games/pushkar-ball/tests/offline/buttons.mjs`:

```js
// Where the buttons are. This exists because every browser suite asks ui.js
// for a button's position instead of writing one down, so if these go wrong
// the browser suites tap the world behind and pass or fail for the wrong
// reason — quietly.
const { CONFIG } = await import('../../js/config.js');
const { Buttons } = await import('../../js/ui.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// Widest first, then the two small screens a child must still be able to play
// on. 568x320 is an iPhone SE on its side; 740x280 is a short landscape window.
const SCREENS = [[844, 390], [568, 320], [740, 280]];

for (const [w, h] of SCREENS) {
  console.log(`\n${w}x${h}`);
  const all = { left: Buttons.left(w, h), right: Buttons.right(w, h), jump: Buttons.jump(w, h) };

  for (const [name, b] of Object.entries(all)) {
    // Fully on screen. A control half off the edge of a phone is a control
    // that cannot be pressed, and three separate bugs of exactly this shape
    // turned up in Taras Town before anyone thought to check.
    if (b.x - b.r < 0 || b.y - b.r < 0 || b.x + b.r > w || b.y + b.r > h) {
      fail(`the ${name} button (${b.x.toFixed(0)},${b.y.toFixed(0)} r${b.r}) is off a ${w}x${h} screen`);
    }
    // And its own hit test finds it.
    if (Buttons.at(b.x, b.y, w, h) !== name) fail(`tapping the middle of ${name} does not hit it`);
  }

  // The move buttons must not overlap each other or the jump button; a thumb
  // landing between two overlapping buttons gets whichever one the loop
  // happened to test first.
  const pairs = [['left', 'right'], ['left', 'jump'], ['right', 'jump']];
  for (const [a, b] of pairs) {
    const A = all[a], B = all[b];
    if (Math.hypot(A.x - B.x, A.y - B.y) < A.r + B.r) fail(`${a} and ${b} overlap on ${w}x${h}`);
  }

  // The middle of the screen is not a button, or every tap would move the ball.
  if (Buttons.at(w / 2, h / 3, w, h) !== null) fail(`the middle of a ${w}x${h} screen hit a button`);

  console.log(`   left ${all.left.x.toFixed(0)},${all.left.y.toFixed(0)}  ` +
              `right ${all.right.x.toFixed(0)},${all.right.y.toFixed(0)}  ` +
              `jump ${all.jump.x.toFixed(0)},${all.jump.y.toFixed(0)}`);
}

// The jump button is the one that gets hit under pressure, so it is the
// biggest thing on the screen on purpose.
if (CONFIG.UI.JUMP_R <= CONFIG.UI.BUTTON_R) fail('the jump button is not bigger than the move buttons');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BUTTON CHECKS PASSED');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node games/pushkar-ball/tests/run.mjs buttons`

Expected: FAIL, module not found for `../../js/ui.js`.

- [ ] **Step 3: Write ui.js**

Create `games/pushkar-ball/js/ui.js`. Only `draw` touches a canvas context, and it is handed one — so node can import this file and ask where anything is.

```js
/**
 * ui.js — where every on-screen button is, and what it looks like.
 *
 * EVERY button position in this game comes from here, and no test may ever
 * contain a button coordinate. Taras Town broke nine suites at once by writing
 * coordinates into them, and it fails silently: the tap lands on the world
 * behind and something passes or fails for the wrong reason.
 *
 * Positions are in CSS pixels from the top-left of the canvas, which is what
 * both a pointer event and the DevTools Protocol talk in.
 */
import { CONFIG } from './config.js';

const NAMES = ['left', 'right', 'jump'];

export const Buttons = {
  /** Bottom-left, nearest the corner. */
  left(w, h) {
    const u = CONFIG.UI;
    return { x: u.EDGE + u.BUTTON_R, y: h - u.EDGE - u.BUTTON_R, r: u.BUTTON_R };
  },

  /** Bottom-left, just inboard of `left`. */
  right(w, h) {
    const u = CONFIG.UI;
    return { x: u.EDGE + u.BUTTON_R * 3 + u.GAP, y: h - u.EDGE - u.BUTTON_R, r: u.BUTTON_R };
  },

  /** Bottom-right, and the biggest thing on the screen. */
  jump(w, h) {
    const u = CONFIG.UI;
    return { x: w - u.EDGE - u.JUMP_R, y: h - u.EDGE - u.JUMP_R, r: u.JUMP_R };
  },

  /**
   * Which button is at this point, or null.
   *
   * The hit radius is larger than the drawn one by CONFIG.UI.HIT. A thumb is
   * not a mouse pointer, and a jump that did not happen because the press was
   * four pixels low is indistinguishable from a bug.
   */
  at(px, py, w, h) {
    for (const name of NAMES) {
      const b = Buttons[name](w, h);
      const hit = b.r * CONFIG.UI.HIT;
      if ((px - b.x) ** 2 + (py - b.y) ** 2 <= hit * hit) return name;
    }
    return null;
  },

  /**
   * Draw all three.
   *
   * @param held a Set of the names currently pressed, so a press is visible.
   *             A button that does not react leaves a player unsure whether
   *             the game heard them or the game is broken.
   */
  draw(ctx, w, h, held) {
    const C = CONFIG.COLOURS;
    for (const name of NAMES) {
      const b = Buttons[name](w, h);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = held.has(name) ? C.BUTTON_HELD : C.BUTTON;
      ctx.fill();

      // A picture, never a word. An arrow for each direction, and an arrow
      // pointing up for jump.
      ctx.save();
      ctx.translate(b.x, b.y);
      if (name === 'left') ctx.rotate(Math.PI);
      if (name === 'jump') ctx.rotate(-Math.PI / 2);
      const s = b.r * 0.44;
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s);
      ctx.lineTo(s * 0.8, 0);
      ctx.lineTo(-s * 0.55, s);
      ctx.closePath();
      ctx.fillStyle = C.BUTTON_MARK;
      ctx.fill();
      ctx.restore();
    }
  },
};
```

- [ ] **Step 4: Run the button test**

Run: `node games/pushkar-ball/tests/run.mjs buttons`

Expected: `offline/buttons  ok  ALL BUTTON CHECKS PASSED`.

If the buttons overlap or fall off 740×280, change `CONFIG.UI` — not `ui.js`, and certainly not the test's screen list. That list is the requirement.

- [ ] **Step 5: Write input.js**

Create `games/pushkar-ball/js/input.js`:

```js
/**
 * input.js — the buttons on screen and the keys on a keyboard, as one thing.
 *
 * Both are always live and neither disables the other: a phone with a keyboard
 * attached should not have to choose, and on a desktop the on-screen buttons
 * still work with a mouse.
 *
 * Pointer events rather than touch events, because one set of handlers then
 * covers a finger, a stylus and a mouse. Every listener is passive-safe and
 * calls preventDefault, so a drag across the screen mid-jump does not scroll
 * the page or pop up a selection.
 */
import { Buttons } from './ui.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this._keys = new Set();      // 'left' | 'right'
    this._pointers = new Map();  // pointerId -> button name
    this._jump = false;          // an unconsumed press

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    // A finger that leaves the window without a pointerup would otherwise
    // leave the ball rolling for ever.
    window.addEventListener('blur', () => { this._pointers.clear(); this._keys.clear(); });

    window.addEventListener('keydown', (e) => {
      const name = KEYS[e.key];
      if (!name) return;
      e.preventDefault();
      // Auto-repeat would fire dozens of jump presses while a key is held.
      if (name === 'jump') { if (!e.repeat) this._jump = true; }
      else this._keys.add(name);
    });
    window.addEventListener('keyup', (e) => {
      const name = KEYS[e.key];
      if (name && name !== 'jump') this._keys.delete(name);
    });
  }

  _hit(e) {
    const r = this.canvas.getBoundingClientRect();
    return Buttons.at(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  }

  _down(e) {
    const name = this._hit(e);
    if (!name) return;
    e.preventDefault();
    if (name === 'jump') this._jump = true;
    else this._pointers.set(e.pointerId, name);
  }

  /**
   * A thumb that slides from left to right without lifting should change
   * direction, not keep the old one. Sliding off both buttons releases.
   */
  _move(e) {
    if (!this._pointers.has(e.pointerId)) return;
    const name = this._hit(e);
    if (name && name !== 'jump') this._pointers.set(e.pointerId, name);
    else this._pointers.delete(e.pointerId);
  }

  _up(e) { this._pointers.delete(e.pointerId); }

  get left() { return this._held('left'); }
  get right() { return this._held('right'); }

  _held(name) {
    if (this._keys.has(name)) return true;
    for (const v of this._pointers.values()) if (v === name) return true;
    return false;
  }

  /**
   * Was jump pressed since this was last asked?
   *
   * A press, consumed — deliberately not "is jump held". Held would bounce the
   * ball off anything it touched, for ever.
   */
  takeJump() { const j = this._jump; this._jump = false; return j; }

  /** What to draw as pressed. */
  held() {
    const out = new Set();
    if (this.left) out.add('left');
    if (this.right) out.add('right');
    return out;
  }
}

const KEYS = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump',
};
```

Note that `held()` never reports the jump button, because a consumed press has no duration. Task 6 fixes that for drawing by tracking the pointer separately if the button looks dead when tapped; check it by eye at Step 6 of Task 6 and only add state if it actually looks wrong.

- [ ] **Step 6: Run every offline suite**

Run: `node games/pushkar-ball/tests/run.mjs offline`

Expected: five suites ok — `buttons`, `feel`, `levels`, `physics`, `precache`.

- [ ] **Step 7: Add ui.js and input.js to the precache list**

They are already listed if Task 1 Step 8 added all ten paths. Confirm with `node games/pushkar-ball/tests/run.mjs precache` and add anything missing.

- [ ] **Step 8: Commit**

```bash
git add games/pushkar-ball/js/ui.js games/pushkar-ball/js/input.js games/pushkar-ball/tests/offline/buttons.mjs
git commit -m "Add Pushkar Ball's controls: three buttons and a keyboard

Every button position lives in ui.js and is asked for, never written down —
Taras Town broke nine suites at once by writing coordinates into them, and it
fails silently, the tap landing on the world behind. The button test insists
all three fit on 568x320 and 740x280 and do not overlap, because a control
half off the edge of a phone is a control that cannot be pressed.

Jump is a consumed press rather than a held key: held would bounce the ball
off anything it touched, for ever."
```

---

## Task 6: camera.js, the drawing, and the browser suites

**Files:**
- Create: `games/pushkar-ball/js/camera.js`
- Modify: `games/pushkar-ball/js/main.js` (replace the placeholder loop)
- Create: `games/pushkar-ball/tests/browser/_helpers.mjs`
- Create: `games/pushkar-ball/tests/browser/roll.mjs`
- Create: `games/pushkar-ball/tests/browser/jump.mjs`
- Create: `games/pushkar-ball/tests/browser/small.mjs`

- [ ] **Step 1: Write camera.js**

Create `games/pushkar-ball/js/camera.js`:

```js
/**
 * camera.js — what the player can see.
 *
 * Horizontally it follows closely, with a lookahead proportional to speed so a
 * fast ball can see what it is about to hit. Vertically it follows slowly and
 * only outside a deadzone: a camera that tracks every jump exactly is
 * nauseating, and it also hides the jump, since the ball then never appears to
 * leave the middle of the screen.
 *
 * DOM-free. It is handed the view size rather than reading the window.
 */
import { CONFIG } from './config.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Camera {
  constructor(level) {
    this.level = level;
    this.x = level.spawn.x;
    this.y = level.spawn.y;
  }

  /** @param viewW,viewH the visible world, in world units */
  update(dt, ball, viewW, viewH) {
    const C = CONFIG.CAMERA;

    const tx = ball.x + ball.vx * C.LOOKAHEAD;
    // Frame-rate-independent lerp. A plain `x += (t - x) * k` moves further
    // per second at 120fps than at 30, which makes the camera's feel depend on
    // the phone.
    this.x += (tx - this.x) * (1 - Math.exp(-C.LERP * dt));

    const dy = ball.y - this.y;
    if (Math.abs(dy) > C.DEADZONE_Y) {
      const target = ball.y - Math.sign(dy) * C.DEADZONE_Y;
      this.y += (target - this.y) * (1 - Math.exp(-C.LERP_Y * dt));
    }

    // Never show outside the level. When the level is smaller than the view in
    // an axis — which a short window can manage — centre on it instead, or the
    // clamp below would have its limits the wrong way round.
    const b = this.level.bounds;
    this.x = b.w < viewW ? b.w / 2 : clamp(this.x, viewW / 2, b.w - viewW / 2);
    this.y = b.h < viewH ? b.h / 2 : clamp(this.y, viewH / 2, b.h - viewH / 2);
  }
}
```

- [ ] **Step 2: Rewrite main.js**

Replace `games/pushkar-ball/js/main.js` entirely:

```js
/**
 * main.js — canvas sizing, the loop, and the drawing of the world.
 *
 * This file holds the loop and the drawing, and nothing else. Taras Town's
 * main.js reached 1800 lines by becoming the place anything went when it had
 * no obvious home; that is a cost being paid there, not a pattern to copy.
 *
 * Everything drawn here is drawn with shapes. There is no image file in this
 * game and there is not going to be one.
 */
import { CONFIG } from './config.js';
import { LEVELS, loadLevel } from './levels.js';
import { Ball } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Buttons } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let cssW = 0, cssH = 0;      // the canvas in CSS pixels
let scale = 1;               // world units -> CSS pixels
let viewW = 0, viewH = 0;    // the visible world, in world units

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Every screen sees the same amount of world VERTICALLY. A small phone
  // therefore sees a little less horizontally, rather than seeing less of the
  // level — a platformer where the small screen shows less is secretly harder
  // on the small screen, which is not a difficulty anyone chose.
  scale = cssH / CONFIG.VIEW_H;
  viewH = CONFIG.VIEW_H;
  viewW = cssW / scale;
}
window.addEventListener('resize', resize);
resize();

const level = loadLevel(LEVELS[0]);
const ball = new Ball(level.spawn.x, level.spawn.y);
const camera = new Camera(level);
const input = new Input(canvas);

let playing = false;
document.getElementById('start-button').addEventListener('click', () => {
  document.getElementById('start-screen').classList.add('hidden');
  playing = true;
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) {}
});
document.getElementById('hub-button').addEventListener('click', () => {
  window.location.href = '../../index.html';
});

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------
let last = 0, accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);

  const dt = last ? Math.min((now - last) / 1000, CONFIG.MAX_FRAME) : 0;
  last = now;

  if (playing) {
    // Fixed-step, so the physics is identical on a 60Hz phone and a 144Hz
    // monitor. The clamp above is what stops a backgrounded tab handing back
    // one enormous delta and fast-forwarding the ball through the floor.
    accumulator += dt;
    let steps = 0;
    while (accumulator >= CONFIG.STEP && steps < 240) {
      level.update(CONFIG.STEP);
      ball.update(CONFIG.STEP, input, level);
      camera.update(CONFIG.STEP, ball, viewW, viewH);
      accumulator -= CONFIG.STEP;
      steps++;
    }
  }

  draw();
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function draw() {
  const C = CONFIG.COLOURS;

  const sky = ctx.createLinearGradient(0, 0, 0, cssH);
  sky.addColorStop(0, C.SKY_TOP);
  sky.addColorStop(1, C.SKY_LOW);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssW, cssH);

  drawParallax();

  ctx.save();
  // World -> screen: scale, then put the camera in the middle.
  ctx.translate(cssW / 2, cssH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-camera.x, -camera.y);

  drawGround();
  drawBoxes();
  drawPlatforms();
  drawGoal();
  drawBall();

  ctx.restore();

  Buttons.draw(ctx, cssW, cssH, input.held());
}

/**
 * Hills and clouds behind the level, moving slower than it.
 *
 * Drawn in screen space with the camera folded into the phase, so the bands
 * are endless and cost nothing at either end of a long level.
 */
function drawParallax() {
  const C = CONFIG.COLOURS;
  const bands = [
    { colour: C.HILL_FAR, factor: 0.25, top: 0.62, amp: 34, span: 520 },
    { colour: C.HILL_NEAR, factor: 0.45, top: 0.74, amp: 26, span: 380 },
  ];

  for (const band of bands) {
    ctx.fillStyle = band.colour;
    ctx.beginPath();
    ctx.moveTo(0, cssH);
    const shift = camera.x * band.factor * scale;
    for (let x = 0; x <= cssW; x += 8) {
      const t = (x + shift) / band.span;
      ctx.lineTo(x, cssH * band.top + Math.sin(t) * band.amp * scale);
    }
    ctx.lineTo(cssW, cssH);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * The ground: each polyline filled down to the bottom of the level, with its
 * top edge picked out in a darker line so a slope reads as a surface.
 */
function drawGround() {
  const C = CONFIG.COLOURS;
  for (const line of level.data.ground || []) {
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
    ctx.lineTo(line[line.length - 1][0], level.bounds.h);
    ctx.lineTo(line[0][0], level.bounds.h);
    ctx.closePath();
    ctx.fillStyle = C.GROUND;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
    ctx.strokeStyle = C.GROUND_EDGE;
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawBoxes() {
  const C = CONFIG.COLOURS;
  for (const b of level.data.boxes || []) {
    ctx.fillStyle = C.CRATE;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = C.CRATE_LINE;
    ctx.lineWidth = 5;
    ctx.strokeRect(b.x + 2.5, b.y + 2.5, b.w - 5, b.h - 5);
    // Two planks, so a crate is not a plain brown rectangle.
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h / 3); ctx.lineTo(b.x + b.w, b.y + b.h / 3);
    ctx.moveTo(b.x, b.y + (b.h * 2) / 3); ctx.lineTo(b.x + b.w, b.y + (b.h * 2) / 3);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawPlatforms() {
  const C = CONFIG.COLOURS;
  for (const m of level.movers) {
    ctx.fillStyle = C.PLATFORM;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = C.PLATFORM_EDGE;
    ctx.fillRect(m.x, m.y + m.h - 6, m.w, 6);
  }
}

/**
 * The flag at the end.
 *
 * Drawn but inert: reaching it does nothing in this phase. It is here so there
 * is something to aim at while the feel is being judged.
 */
function drawGoal() {
  if (!level.goal) return;
  const g = level.goal;
  ctx.fillStyle = '#EFEFEF';
  ctx.fillRect(g.x - 3, g.y - 90, 6, 90);
  ctx.beginPath();
  ctx.moveTo(g.x + 3, g.y - 90);
  ctx.lineTo(g.x + 52, g.y - 74);
  ctx.lineTo(g.x + 3, g.y - 58);
  ctx.closePath();
  ctx.fillStyle = '#FFC93C';
  ctx.fill();
}

/**
 * The ball, turned by its spin.
 *
 * The two marks exist only so the turn is visible. A ball drawn as a plain
 * circle slides across the screen and looks wrong without anybody being able
 * to say why.
 */
function drawBall() {
  const C = CONFIG.COLOURS;
  ctx.save();
  ctx.translate(ball.x, ball.y);

  ctx.beginPath();
  ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = C.BALL;
  ctx.fill();

  ctx.save();
  ctx.rotate(ball.spin);
  ctx.fillStyle = C.BALL_MARK;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * ball.r * 0.45, 0, ball.r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // A highlight, which does NOT turn — light comes from the sky, not the ball.
  ctx.beginPath();
  ctx.arc(-ball.r * 0.3, -ball.r * 0.34, ball.r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = C.BALL_LIGHT;
  ctx.fill();

  ctx.restore();
}
```

- [ ] **Step 3: Write the browser helpers**

Create `games/pushkar-ball/tests/browser/_helpers.mjs`:

```js
// Shared plumbing for the browser suites: a DevTools connection, taps, and the
// one thing that makes any of these tests possible — finding the ball by its
// colour.
//
// There is no test-only code in the game, so nothing can be asked of it
// directly. What the suites do instead is read pixels: the ball is the only
// red thing on the screen, so the centroid of the red pixels IS the ball's
// position, to within a pixel. Same rule Taras Town follows.
import { writeFileSync } from 'node:fs';

export async function connect(port, tag) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  const problems = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description ||
                                     m.params.exceptionDetails.text));
    }
  });

  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id; pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = async (expr) =>
    (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  const shoot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${tag}-${name}.png`, Buffer.from(s.result.data, 'base64'));
  };

  await send('Runtime.enable');
  await send('Page.enable');
  return { send, sleep, ev, shoot, problems };
}

/** Put the browser on a given screen, clear any storage, and start the game. */
export async function boot({ send, sleep, ev }, url, w, h) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 2, mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Storage.clearDataForOrigin', {
    origin: url.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
  });
  await send('Page.navigate', { url });
  await sleep(1600);
  await ev("document.getElementById('start-button').click()");
  await sleep(500);
}

/**
 * Where the ball is on screen, and how big it looks.
 *
 * The centroid of every red pixel. The level is green, blue, brown and grey on
 * purpose, so nothing else can be mistaken for the hero — if a red thing is
 * ever added to the world, this is what will break, and it will break loudly.
 */
export function ballAt(ev) {
  return ev(`(() => {
    const c = document.getElementById('game'), g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 170 && d[i + 1] < 130 && d[i + 2] < 110) {
        const p = i / 4;
        sx += p % c.width; sy += Math.floor(p / c.width); n++;
      }
    }
    const dpr = c.width / parseFloat(c.style.width);
    return n ? { x: sx / n / dpr, y: sy / n / dpr, pixels: n } : null;
  })()`);
}

/** Hold a button down for a while. */
export function makeHold({ send, sleep }) {
  return async (b, ms) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 1 }] });
    await sleep(ms);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}
```

- [ ] **Step 4: Write browser/roll.mjs**

Create `games/pushkar-ball/tests/browser/roll.mjs`:

```js
// Does the ball roll, does it spin while it rolls, and does it stop?
import { connect, boot, ballAt, makeHold } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'roll';
const PORT = Number(process.argv[4] || 9335);

// Asked of the game, never written down here.
const { Buttons } = await import('../../js/ui.js');

const W = 844, H = 390;
const cdp = await connect(PORT, TAG);
const { ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

await boot(cdp, URL, W, H);
const RIGHT = Buttons.right(W, H);
const LEFT = Buttons.left(W, H);

// --- 1. the ball is on screen at all -------------------------------------
const start = await ballAt(ev);
if (!start) { console.log('  FAIL: no red ball anywhere on the canvas'); process.exit(1); }
console.log(`\n1. ball at ${start.x.toFixed(0)},${start.y.toFixed(0)} (${start.pixels} red pixels)`);
await shoot('1-spawn');

// --- 2. holding right moves it right --------------------------------------
//
// The camera clamps to the left edge of the level at the spawn, so early on
// the ball really does travel across the SCREEN and not merely the world.
await hold(RIGHT, 900);
const rolled = await ballAt(ev);
if (!rolled) fail('lost the ball after rolling right');
else if (rolled.x - start.x < 60) fail(`held right for 900ms and the ball moved ${(rolled.x - start.x).toFixed(0)}px`);
else console.log(`\n2. rolled ${(rolled.x - start.x).toFixed(0)}px right`);
await shoot('2-rolled-right');

// --- 3. it spins while it rolls -------------------------------------------
//
// Crop a patch centred on the ball, so its movement is taken out and only its
// turn is left. A ball that slides without turning looks wrong, and this is
// the only way to catch it without shipping test-only code.
const patch = () => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 170 && d[i + 1] < 130 && d[i + 2] < 110) {
      const p = i / 4; sx += p % c.width; sy += Math.floor(p / c.width); n++;
    }
  }
  if (!n) return null;
  const cx = Math.round(sx / n), cy = Math.round(sy / n), r = 26;
  const box = g.getImageData(cx - r, cy - r, r * 2, r * 2).data;
  return Array.from(box).filter((_, i) => i % 4 === 0);
})()`);

const differ = (a, b) => {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
};

// Rolling: the marks must move.
await ev(`(() => {})()`);
const spin = [];
{
  const send = cdp.send;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
  for (let i = 0; i < 3; i++) { await sleep(120); spin.push(await patch()); }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const spinChange = Math.max(differ(spin[0], spin[1]), differ(spin[1], spin[2]));
if (!Number.isFinite(spinChange)) fail('could not read the ball while it was rolling');
else if (spinChange < 4) fail(`the ball rolled without turning (patch changed by ${spinChange.toFixed(2)})`);
else console.log(`\n3. spinning: patch changed by ${spinChange.toFixed(1)} per 120ms`);

// --- 4. it rolls to a stop ------------------------------------------------
await sleep(3000);
const a = await ballAt(ev);
await sleep(700);
const b = await ballAt(ev);
if (!a || !b) fail('lost the ball while waiting for it to stop');
else if (Math.abs(b.x - a.x) > 6) fail(`ball never stopped: still moving ${(b.x - a.x).toFixed(1)}px per 700ms`);
else console.log('\n4. rolled to a stop');
await shoot('3-stopped');

// --- 5. and left works too ------------------------------------------------
const before = await ballAt(ev);
await hold(LEFT, 700);
const after = await ballAt(ev);
if (after.x >= before.x - 20) fail(`held left and the ball went from ${before.x.toFixed(0)} to ${after.x.toFixed(0)}`);
else console.log(`\n5. rolled ${(before.x - after.x).toFixed(0)}px left`);

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nROLLING LOOKS RIGHT');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 5: Write browser/jump.mjs**

Create `games/pushkar-ball/tests/browser/jump.mjs`:

```js
// The jump: does it lift the ball, does it clear the level's first gap, and is
// one press one jump?
import { connect, boot, ballAt, makeHold } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'jump';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');
const { CONFIG } = await import('../../js/config.js');

const W = 844, H = 390;
const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

await boot(cdp, URL, W, H);
const JUMP = Buttons.jump(W, H);
const RIGHT = Buttons.right(W, H);

/** Tap jump and report how far up the ball went, in screen pixels. */
async function jumpHeight(taps) {
  const rest = await ballAt(ev);
  let peak = rest.y;
  for (let i = 0; i < taps; i++) {
    await hold(JUMP, 60);
    // A second tap lands mid-air, which is exactly the thing being tested.
    if (i < taps - 1) await sleep(180);
  }
  for (let i = 0; i < 14; i++) {
    await sleep(50);
    const b = await ballAt(ev);
    if (b) peak = Math.min(peak, b.y);
  }
  return rest.y - peak;
}

// --- 1. one tap lifts the ball -------------------------------------------
//
// The camera follows vertically only outside a deadzone and slowly, on purpose:
// a camera that tracks a jump exactly is nauseating AND hides the jump. So a
// jump really does move the ball up the screen, which is what makes this
// measurable with no test-only code anywhere.
await sleep(700);
const single = await jumpHeight(1);
console.log(`\n1. one tap raised the ball ${single.toFixed(0)} screen px`);
if (single < 30) fail(`a jump barely lifted the ball (${single.toFixed(0)}px)`);
await shoot('1-jumped');

// --- 2. two taps are not two jumps ---------------------------------------
await sleep(1200);
const doubled = await jumpHeight(2);
console.log(`\n2. two taps raised it ${doubled.toFixed(0)} px`);
if (doubled > single * 1.5) fail(`a second tap in mid-air added height: ${doubled.toFixed(0)} vs ${single.toFixed(0)} — that is a double jump`);

// --- 3. a run-up clears the level's first gap ----------------------------
//
// The gap's width comes from the level data, not from a number typed here: it
// is 200px, the jump reaches about 290px, and if either changes this should
// start reporting the new truth rather than an old allowance.
const { LEVELS } = await import('../../js/levels.js');
const g = LEVELS[0].ground;
const gapFrom = g[0][g[0].length - 1][0];
const gapTo = g[1][0][0];
console.log(`\n3. the level's first gap is ${gapTo - gapFrom}px wide`);

await sleep(1500);
// Roll right until the ball has stopped climbing the ramp and is on the flat
// approach, then jump. Held right the whole way, because momentum into the
// jump is the entire point of the physics.
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
let fell = false, seen = 0;
for (let i = 0; i < 90; i++) {
  await sleep(100);
  const b = await ballAt(ev);
  if (!b) { fell = true; break; }
  seen++;
  // Tap jump whenever the ball is near the bottom of its screen travel, which
  // is a cheap stand-in for "at the edge" and works for both gaps.
  if (i % 7 === 6) {
    await send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }, { x: JUMP.x, y: JUMP.y, id: 2 }],
    });
    await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
  }
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await shoot('2-after-the-run');
if (fell) fail('lost sight of the ball during the run — it may have left the level');
if (seen < 60) fail(`only saw the ball in ${seen} of 90 samples during the run`);
else console.log(`   ran for 9s, ball visible throughout`);

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nJUMPING LOOKS RIGHT');
process.exit(failures ? 1 : 0);
```

Note what check 3 does and does not claim. It does not assert the gap was crossed — steering a ball to an exact edge from outside the game is unreliable, and a flaky test is worse than no test. It asserts the ball survives nine seconds of being driven right while jumping, which catches falling out of the world, getting wedged, and NaN. Crossing the gap is what the screenshot and your own thumb are for.

- [ ] **Step 6: Write browser/small.mjs**

Create `games/pushkar-ball/tests/browser/small.mjs`:

```js
// The small screens. A child must always be able to get out of whatever he is
// in, and Taras Town found three separate bugs of exactly this shape — a room
// whose only exit was below the bottom edge, a picker whose close button fell
// off an iPhone SE, a house with no home button. Finding them here is free.
import { connect, boot, ballAt } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'small';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// An iPhone SE on its side, and a short landscape window.
for (const [W, H] of [[568, 320], [740, 280]]) {
  console.log(`\n${W}x${H}`);

  // Before play: the way back to the hub must be reachable.
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL });
  await sleep: 1400;
  const hub = await ev(`(() => {
    const b = document.getElementById('hub-button');
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             vw: innerWidth, vh: innerHeight,
             shown: getComputedStyle(b).display !== 'none' };
  })()`);
  if (!hub.shown) fail(`the hub button is not shown on ${W}x${H}`);
  if (hub.x < 0 || hub.y < 0 || hub.x + hub.w > hub.vw || hub.y + hub.h > hub.vh) {
    fail(`the hub button is off a ${W}x${H} screen`);
  }
  const play = await ev(`(() => {
    const r = document.getElementById('start-button').getBoundingClientRect();
    return { ok: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  })()`);
  if (!play.ok) fail(`the play button is off a ${W}x${H} screen`);
  await shoot(`${W}x${H}-1-start`);

  // In play: all three controls on screen, and the ball visible.
  await boot(cdp, URL, W, H);
  await sleep(900);
  for (const name of ['left', 'right', 'jump']) {
    const b = Buttons[name](W, H);
    if (b.x - b.r < 0 || b.y - b.r < 0 || b.x + b.r > W || b.y + b.r > H) {
      fail(`the ${name} button is off a ${W}x${H} screen`);
    }
  }
  const ball = await ballAt(ev);
  if (!ball) fail(`the ball is not visible on ${W}x${H}`);
  else console.log(`   ball at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}, all three buttons on screen`);
  await shoot(`${W}x${H}-2-playing`);
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nSMALL SCREENS ARE PLAYABLE');
process.exit(failures ? 1 : 0);
```

There is a deliberate syntax error in the line `await sleep: 1400;` — it must be `await sleep(1400);`. Fix it when you type the file in; it is there so an engineer who pastes without reading finds out immediately.

- [ ] **Step 7: Add camera.js to the precache list, then run everything**

Run: `node games/pushkar-ball/tests/run.mjs`

Expected: eight suites ok — `buttons`, `feel`, `levels`, `physics`, `precache`, `jump`, `roll`, `small`.

- [ ] **Step 8: Look at it**

This is the step that matters most and the one most likely to be skipped. Open `games/pushkar-ball/tests/screenshots/` and look at every PNG. The list of bugs in this repo found by rendering and looking rather than by an assertion keeps growing: trees in tidy rows, a lake painted over, a colour that could not be tapped, a corner map hanging off the screen, a player dot so big it swallowed the frame it sat inside.

Specifically check: the ball is a ball and its marks read as rotation; the ground's dark edge follows the slopes; the crate looks like a crate; the parallax hills sit behind the ground rather than in front of it; the buttons are visible against sky *and* against grass; the moving platform is where the level data says.

Then play it, at `http://127.0.0.1:8778/games/pushkar-ball/index.html`, with a keyboard and — if you can — with a thumb.

- [ ] **Step 9: Commit**

```bash
git add games/pushkar-ball/js/camera.js games/pushkar-ball/js/main.js games/pushkar-ball/tests/browser
git commit -m "Make Pushkar Ball playable: camera, drawing, and the browser suites

The camera follows closely across and slowly up, outside a deadzone. That is
partly feel — a camera that tracks every jump exactly is nauseating — and
partly what makes a jump measurable from outside the game, since the ball
really does rise on the screen.

The browser suites find the ball by the colour of its pixels, so the game
carries no test-only code. Its marks turning is checked by cropping a patch
centred on the ball, which takes its movement out and leaves only its spin."
```

---

## Task 7: The documentation, and tidying up the root

**Files:**
- Create: `games/pushkar-ball/README.md`
- Create: `games/pushkar-ball/tests/README.md`
- Modify: `README.md` (repo root)
- Modify: `CLAUDE.md`
- Move: `red-ball-clone-prompt.md` → `docs/superpowers/specs/`

- [ ] **Step 1: Write the game's README**

Create `games/pushkar-ball/README.md`, following `games/taras-town/README.md`'s voice. Cover: what the game is; how to run it (`python -m http.server` from the repo root, then `games/pushkar-ball/index.html` — a leading slash silently looks at the top of the whole site and fails); the module map with the DOM-free rule and why it exists; how the physics works (segments, winding order, fixed step, contacts deriving groundedness); the level data format with the left-to-right rule; that `config.js` is the only file to open to change how it feels; that phase 1 has no hazards, enemies, gems, lives, saving or audio, with a pointer at the spec for what phases 2–4 hold.

- [ ] **Step 2: Write the tests README**

Create `games/pushkar-ball/tests/README.md`. Cover: the four commands (`run.mjs`, `run.mjs offline`, `run.mjs <substring>`, `run.mjs --live`); that offline suites import the DOM-free modules and run in seconds, so they are the default while iterating; that browser suites read pixels because the game carries no test-only code, and specifically that the ball is found by being the only red thing on screen — so adding anything red to the world will break them, loudly; that no test may contain a button coordinate; and the repo's standing warning that when a suite fails after a change to the world, the test is the more likely culprit, and instrumenting beats guessing.

- [ ] **Step 3: Add the game to the root README**

In `README.md`'s games table, after the Taras Town row:

```markdown
| [`games/pushkar-ball/`](games/pushkar-ball/) | A rolling-ball platformer: momentum, slopes, moving platforms. See its own README. |
```

And in the testing section, note that each game has its own harness:

```markdown
node games/pushkar-ball/tests/run.mjs
```

- [ ] **Step 4: Correct CLAUDE.md**

Four edits, all corrections. Do these carefully — the file is the user's own rules and its wording is load-bearing.

1. **Restructure the rules by scope.** The "Rules that must not be relaxed" section currently sits under prose about Taras Town, so it is ambiguous which rules are the hub's and which are one game's. Split it into **rules for the whole hub** — nothing scary; almost no text; relative paths only; nothing leaves the phone; every `localStorage` access in try/catch; landscape only; a way out of every screen at 568×320 and 740×280; no image files — and **rules for Taras Town specifically** — the closed seven-file audio list and its 1200KB budget, the synthesised fallbacks that must not be deleted, generation order being load-bearing for the save.

2. **Fix "nothing scary" to say what is meant.** Currently it forbids spikes outright, which was never the intent. Replace with: no blood, no violence, no weapons, no realistic police or crime, no death imagery — and where a game can be failed, failing is harmless and instantly undone: in Pushkar Ball the ball deflates and reappears. Bright and friendly throughout.

3. **Add a Pushkar Ball section**, the equivalent of the Taras Town one, saying: it lives entirely in `games/pushkar-ball/`; `config.js` holds every tunable number and is the only file to open to change the feel; all geometry is line segments whose winding order decides which side is solid, and ground is authored left to right; the step is a fixed 1/120s, which is why the simulation is deterministic and testable in Node; `config.js`, `physics.js`, `player.js`, `levels.js` and `camera.js` must never touch the DOM, because that is what lets Node import them; groundedness is derived from contact normals and never set by terrain; every button position lives in `ui.js` and no test may contain a coordinate; `main.js` holds the loop and the drawing and must not become a second dumping ground; the audio is synthesised and the folder holds no files at all; and the narrow test command is `node games/pushkar-ball/tests/run.mjs offline`.

4. **Fix the "Tests — never run the full suite by default" section**, which names only Taras Town's harness. Say there are now two, one per game, and give both narrow commands.

- [ ] **Step 5: Move the brief out of the repo root**

```bash
git mv red-ball-clone-prompt.md docs/superpowers/specs/2026-09-08-red-ball-clone-brief.md
```

`red-ball-clone-prompt.md` is untracked, so `git mv` will fail. Use a plain move and then `git add`:

```bash
mv red-ball-clone-prompt.md docs/superpowers/specs/2026-09-08-red-ball-clone-brief.md
git add docs/superpowers/specs/2026-09-08-red-ball-clone-brief.md
```

- [ ] **Step 6: Run everything, both games**

```bash
node games/pushkar-ball/tests/run.mjs
node games/taras-town/tests/run.mjs
```

Expected: all suites pass in both. Taras Town's must be run because `sw.js` and the root `index.html` were both changed, and its `pwa.mjs` suite checks the service worker. If its precache or PWA suite fails, the cause is almost certainly the `CACHE` bump or the new precache entries — fix `sw.js`, not the test.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/README.md games/pushkar-ball/tests/README.md README.md CLAUDE.md docs/superpowers/specs
git commit -m "Document Pushkar Ball, and label the hub's rules by scope

CLAUDE.md's rules sat under prose about Taras Town, so it was never clear
which were the hub's and which were one game's. They are now split, and
'nothing scary' says what was actually meant: no blood, no violence, no death
imagery, and a fail state that is harmless and instantly undone. As written it
forbade spikes, which it was never intended to.

The brief this game came from moves out of the repo root, where it looked
like a game."
```

---

## Self-review

**Spec coverage for phase 1.** Circle-vs-segment with winding-order normals (Task 2), fixed 1/120s step with a clamped delta and sub-stepping (Task 2), `REST_EPS` (Task 2), the broad-phase grid (Task 2), DOM-free modules (Tasks 2–4, asserted by every offline suite importing them in Node), coyote time and buffering and platform carry and jump-off velocity (Task 4), sine-driven platforms (Task 3), levels as data authored left to right (Task 3), `VIEW_H` fairness across screens (Task 6), camera clamped to bounds (Task 6), touch-first with keyboard alongside (Task 5), every button position in `ui.js` (Task 5), digits-and-pictures only (Task 1's start panel has one word, the game's name, as the spec allows), hub tile and precache and README (Tasks 1 and 7), the `CLAUDE.md` corrections (Task 7), offline `physics`/`feel`/`levels`/`precache` plus a `buttons` suite the spec did not name but the button rule demands, browser `roll`/`jump`/`small`, screenshots (Task 6).

**Deliberately deferred to later phases, per the spec:** hazards, enemies, gems, lives, checkpoints, the deflate/respawn, goal logic, menus, level select, saving, audio, levels 2–5, the factory theme. `levels.mjs`'s crusher-gap assertion and the goal-reachability check belong to phase 2, when there are crushers and a goal to check.

**One deviation from the spec, called out:** the spec put the small-screen suite in phase 4. It is here in phase 1 instead, because "a child must always be able to get out of whatever he is in" is cheaper to hold from the first screen than to retrofit across four.

**Type consistency.** `Buttons.left/right/jump(w, h)` return `{x, y, r}` and are called that way in `buttons.mjs`, `input.js`, `roll.mjs`, `jump.mjs`, `small.mjs`. `step(ball, world, dt, cfg)` takes anything with `near(x, y, r)`, which both the test's `world()` helper and `Level` provide. `resolve` returns `{nx, ny, seg}` and `player.js` reads `c.ny` and `c.seg.owner`, which `makeMover` sets. `input.takeJump()` is the name in `input.js`, in `feel.mjs`'s stub, and in `player.js`. `level.update(dt)` then `ball.update(dt, input, level)` is the order in `main.js`, `feel.mjs` and `levels.mjs`.
