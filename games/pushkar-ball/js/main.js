/**
 * main.js — canvas sizing, the one-tap start, the loop, and the drawing of
 * the world.
 *
 * This file holds the loop and the drawing, and nothing else. Taras Town's
 * main.js reached 1800 lines by becoming the place anything went when it had
 * no obvious home; that is a cost being paid there, not a pattern to copy.
 * The on-screen controls live in ui.js, the physics in physics.js, the ball's
 * feel in player.js, and every number in config.js.
 *
 * Everything drawn here is drawn with shapes. There is no image file in this
 * game and there is not going to be one.
 */
import { CONFIG } from './config.js';
import { LEVELS } from './levels.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Buttons, Overlay, Panel, Hearts } from './ui.js';
import { Flow } from './flow.js';
import { loadProgress, saveProgress, markWon } from './save.js';
import { drawSpikes } from './hazards.js';
import { drawEnemies } from './enemies.js';
import { drawWires, drawSenders, drawReceivers } from './circuits.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let cssW = 0, cssH = 0;      // the canvas in CSS pixels
// The current level's world, ball and camera, rebuilt on every level by
// `levelBegan` and read by the drawing below. `camera` is declared up here so
// that `resize` can tell it its bias, which happens before the first level
// exists — a `let` read before assignment is `undefined` rather than an error,
// which is what the guard in `resize` relies on.
let level, ball, camera;
let scale = 1;               // world units -> CSS pixels
let viewW = 0, viewH = 0;    // the visible world, in world units

function resize() {
  // Capped: a 4x device pixel ratio quadruples the pixels drawn for a
  // difference nobody can see on a phone held at arm's length.
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

  // Rotating a tablet changes where the camera should aim. Guarded because
  // `resize` runs once before there is a camera to tell.
  if (camera) aimCamera();
}

/**
 * Tell the camera how far below the ball to aim, for this screen.
 *
 * It depends on the screen because the two things that want to decide it
 * disagree: the horizon wants a fraction of the height, and the thumb buttons
 * want a fixed number of pixels. One function, called from both places that
 * need it — every resize, and every new camera — so the two cannot drift.
 */
function aimCamera() {
  camera.biasY = Camera.biasFor(cssH, scale, CONFIG.BALL.R, cssW);
}
window.addEventListener('resize', resize);
resize();

const input = new Input(canvas);


/**
 * A level has just begun — the first, the next one, or a retry. The flow has
 * built the world and the ball; the camera is the part that needs the screen,
 * so it is built here.
 */
function levelBegan(f) {
  level = f.level;
  ball = f.ball;
  camera = new Camera(level);
  // The bias BEFORE the snap, and this is the line that is easy to leave out.
  // A fresh Camera carries only its own default guess at `biasY`. Snapping
  // on that guess would start the level with the horizon back at the middle
  // of the screen, and on a short phone with the ball parked under a thumb
  // button. `resize` cannot be relied on to have told it: it only tells the
  // camera that exists when the screen changes, and this one did not exist
  // until a moment ago. The bug this prevents would be invisible on level one
  // in testing and waiting on level two.
  aimCamera();
  // Snapped, not eased: the first frame of a new level should be the new level
  // and not a swoop in from wherever the last one ended.
  camera.snap(ball);
  camera.update(CONFIG.STEP, ball, viewW, viewH);
}

// Progress, from the device's own storage. Reaching `localStorage` can itself
// throw in a locked-down browser, so even getting hold of it is guarded; a
// null store simply means a game with no memory, which save.js handles.
const store = (() => { try { return window.localStorage; } catch (_) { return null; } })();
let progress = loadProgress(store, LEVELS);

// Winning, the results panel, retry and moving on all live in flow.js, where
// node can test them. This file keeps the loop, the camera and the drawing.
const flow = new Flow(input, {
  levels: LEVELS,
  onStart: levelBegan,
  onWin: (f) => {
    progress = markWon(progress, f.levelIndex, LEVELS);
    saveProgress(store, progress);
  },
});
// Level one is loaded behind the screens so the canvas always has a world to
// draw; nothing is simulated until a tile is chosen.
flow.start(0);

// The loop's clock. Declared here, above `play`, which resets it.
let last = 0, accumulator = 0;

// The world is drawn from the first frame, behind the screens, so the tap on
// a tile reveals a level rather than a blank screen. Only the simulation waits.
let playing = false;
const startScreen = document.getElementById('start-screen');
const levelsScreen = document.getElementById('levels-screen');
const grid = document.getElementById('level-grid');

const STAR = '<svg class="star" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 L30 18 L45 19 L33 29 L37 44 L24 36 L11 44 L15 29 L3 19 L18 18 Z"/></svg>';
const LOCK = '<svg class="lock" viewBox="0 0 48 48" aria-hidden="true"><path d="M14 22 V16 a10 10 0 0 1 20 0 V22 H38 V44 H10 V22 Z M19 22 H29 V16 a5 5 0 0 0 -10 0 Z"/></svg>';

/**
 * Show level select, with the tiles rebuilt from the progress as it is now.
 * Play stops and every press in flight is dropped, so a thumb that was on the
 * right arrow does not come back holding it.
 */
function showLevels() {
  playing = false;
  input.setControls(false);
  grid.replaceChildren(...LEVELS.map((data, i) => {
    const b = document.createElement('button');
    const open = i < progress.unlocked;
    const done = progress.finished.includes(data.id);
    b.className = 'tile' + (open ? '' : ' locked') + (open && !done ? ' next' : '');
    b.dataset.index = String(i);
    if (open) {
      b.setAttribute('aria-label', `Level ${data.id}`);
      b.textContent = String(data.id);
      if (done) b.insertAdjacentHTML('beforeend', STAR);
      b.addEventListener('click', () => play(i));
    } else {
      b.setAttribute('aria-label', 'Locked');
      b.disabled = true;
      b.innerHTML = LOCK;
    }
    return b;
  }));
  levelsScreen.classList.remove('hidden');
}

/** Start the level at `i` and hide level select. */
function play(i) {
  levelsScreen.classList.add('hidden');
  flow.start(i);
  accumulator = 0;
  playing = true;
}

document.getElementById('start-button').addEventListener('click', () => {
  startScreen.classList.add('hidden');
  showLevels();
  // Fullscreen is a bonus, never a requirement: a browser that refuses must
  // still give a playable game.
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) {}
});

// Relative, with no leading slash, because GitHub Pages serves this from a
// sub-folder and a leading slash silently looks at the top of the whole site.
for (const id of ['hub-button', 'levels-hub-button']) {
  document.getElementById(id).addEventListener('click', () => {
    window.location.href = '../../index.html';
  });
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);

  const dt = last ? Math.min((now - last) / 1000, CONFIG.MAX_FRAME) : 0;
  last = now;

  if (playing) {
    // Fixed-step, so the physics is identical on a 60Hz phone and a 144Hz
    // monitor. The clamp above is what stops a backgrounded tab handing back
    // one enormous delta and fast-forwarding the ball through the floor; the
    // step cap below is the second half of the same guard, in case a slow
    // frame ever leaves more in the accumulator than a frame can work off.
    accumulator += dt;
    let steps = 0;
    while (accumulator >= CONFIG.STEP && steps < 240) {
      // The ball puts itself back at its home when it fails, and the camera
      // has to go with it instead of easing across the whole level after it.
      //
      // The signal is the ARRIVAL, not the death, and the difference matters
      // because the intuitive version is the wrong one. A death and the
      // respawn it causes are DEFLATE.TIME apart, and the ball does not move
      // at all in between — so snapping when `deaths` changes parks the camera
      // over the empty hole the ball fell down, and then, when the ball
      // reappears at a checkpoint somewhere else entirely, the camera glides
      // the whole way there with the ball already rolling and already being
      // steered from off screen. That is exactly the glide `snap` and the
      // camera's constructor were written to remove, arriving by a different
      // route.
      //
      // `reviving` rises from 0 to DEFLATE.INFLATE in precisely the step the
      // respawn happens, so it is the honest signal and needs no new state.
      // Once the snap is at the arrival, whatever the camera was doing before
      // stops mattering: `snap` writes both coordinates outright, so it
      // re-establishes the settled resting position for the new place.
      //
      // Not covered offline — this loop needs a DOM. Task 3's browser deflate
      // suite is where it is checked, by screenshotting the ball just after it
      // comes back: a camera mid-glide puts the ball somewhere a settled
      // camera would not.
      //
      // Only when the flow did not start a new level on this step: a new ball
      // has `reviving` of 0 and a new camera was snapped in `levelBegan`.
      const before = ball, revivingBefore = ball.reviving;
      flow.step(CONFIG.STEP);
      if (ball === before && revivingBefore === 0 && ball.reviving > 0) camera.snap(ball);
      // A door or bridge the player just opened, off the edge: lean to show it.
      for (const r of level.opened) camera.reveal(r.x);

      camera.update(CONFIG.STEP, ball, viewW, viewH);
      accumulator -= CONFIG.STEP;
      steps++;
    }

    // Taps and actions once a frame rather than once a step: a press happened
    // at a moment of wall-clock time and is not something the fixed-step
    // simulation can be asked about. Taps go to the results panel, and the
    // flow ignores any that land while the level is being played; actions come
    // from the corner buttons during play, and the flow ignores those while
    // the panel is up. Either can ask for level select.
    const tap = input.takeTap();
    const action = input.takeAction();
    if ((tap && flow.tap(tap.x, tap.y, cssW, cssH) === 'levels') ||
        (action && flow.act(action) === 'levels')) {
      showLevels();
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

  drawSun();
  drawClouds();
  drawParallax();

  ctx.save();
  // World -> screen: scale, then put the camera in the middle.
  ctx.translate(cssW / 2, cssH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-camera.x, -camera.y);

  drawWires(ctx, level, CONFIG);
  drawGround();
  drawWater();
  drawWalls();
  drawCrates();
  drawBreakables();
  drawCheckpoints();
  drawSenders(ctx, level, CONFIG);
  drawSpikes(ctx, level.spikes, CONFIG);
  drawEnemies(ctx, level.enemies, level.time, CONFIG);
  drawParticles();
  drawPlatforms();
  drawPads();
  drawGates();
  drawReceivers(ctx, level, level.time, CONFIG);
  drawBeams();
  drawGoal();
  drawBall();

  ctx.restore();

  // The screen dims while the ball is deflating and lifts again as it swells
  // back up. Both halves of it belong to ui.js, which owns this screen-space
  // layer: the amount is arithmetic and is therefore testable in Node, and
  // anything else drawn over the world goes there too rather than accumulating
  // here. Drawn before the buttons, so the controls never dim.
  Overlay.drawDim(ctx, cssW, cssH, Overlay.dim(ball));

  // Both of these are outside the world transform, so they sit at a thumb's
  // size on every screen instead of scaling with the level.
  //
  // The panel goes OVER the dim, and the controls are replaced by it rather
  // than drawn under it.
  //
  // Over the dim, because the dim is what failing looks like and the panel is
  // what winning looks like: a results panel behind a wash of dark blue would
  // read as a win that had gone wrong. In practice the two never meet — a ball
  // that has won is neither deflating nor re-inflating, so the dim is zero for
  // as long as the panel is up — and the ordering is written this way so that
  // it stays right by construction rather than by that coincidence.
  //
  // INSTEAD of the controls, because rolling the ball around behind a results
  // panel is not a thing that should be possible, and because a thumb aiming
  // at the panel's own buttons would otherwise be landing on the jump button.
  if (flow.mode === 'won') {
    Panel.draw(ctx, cssW, cssH, { level: level.data.id, stars: flow.stars });
  } else {
    Hearts.draw(ctx, cssW, cssH, ball.hearts);
    Buttons.draw(ctx, cssW, cssH, input.held());
  }
}

/**
 * Hills behind the level, moving slower than it.
 *
 * Drawn in screen space with the camera folded into the phase, so the bands
 * are endless and cost nothing at either end of a long level. They are also
 * drawn before the world transform is applied, which is what keeps them
 * behind the ground rather than in front of it.
 */
/**
 * The sun: a disc plus a soft glow, fixed at its own screen fraction. It
 * does not scroll with the level at all — a sun this far away wouldn't
 * visibly move as the camera pans a few thousand units.
 */
function drawSun() {
  const C = CONFIG.COLOURS;
  const S = CONFIG.SUN;
  const cx = cssW * S.X, cy = cssH * S.Y;

  const glow = ctx.createRadialGradient(cx, cy, S.R * 0.5, cx, cy, S.R * S.GLOW);
  glow.addColorStop(0, C.SUN_GLOW);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, S.R * S.GLOW, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = C.SUN;
  ctx.beginPath();
  ctx.arc(cx, cy, S.R, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A handful of drifting clouds, wrapped around so the band is endless — the
 * same reason the hills wrap, but as discrete puffs on a repeating spacing
 * rather than a continuous sine, since a cloud has a shape a sine doesn't.
 */
function drawClouds() {
  const C = CONFIG.COLOURS;
  const CL = CONFIG.CLOUDS;
  const spacing = cssW / CL.COUNT + CL.SIZE * 2;
  const total = spacing * CL.COUNT;
  const shift = camera.x * CL.FACTOR * scale;
  ctx.fillStyle = C.CLOUD;
  for (let i = 0; i < CL.COUNT; i++) {
    const raw = i * spacing - shift;
    const x = ((raw % total) + total) % total - CL.SIZE;
    const y = cssH * CL.TOP + (i % 2) * CL.STAGGER;
    drawCloudPuff(x, y, CL.SIZE);
  }
}

/** One cloud: three overlapping circles, wide and flat rather than round. */
function drawCloudPuff(x, y, size) {
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.6, size * 0.32, 0, 0, Math.PI * 2);
  ctx.ellipse(x - size * 0.4, y + size * 0.08, size * 0.4, size * 0.24, 0, 0, Math.PI * 2);
  ctx.ellipse(x + size * 0.45, y + size * 0.05, size * 0.42, size * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawParallax() {
  const C = CONFIG.COLOURS;
  for (const band of CONFIG.PARALLAX) {
    ctx.fillStyle = C[band.colour];
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
 * A plain, stateless pseudo-random value in [0, 1) for a number — the
 * classic sine-based GLSL hash. Used to scatter ground texture from world
 * position alone, so the same X always draws the same rock or flower and
 * nothing has to be saved or recomputed between frames.
 */
function groundHash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** The ground polyline's own y at a given x, by linear interpolation. */
function yOnLine(line, x) {
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, y0] = line[i], [x1, y1] = line[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return line[line.length - 1][1];
}

/** The closed fill outline for one ground polyline, down to the level floor. */
function groundFillPath(line) {
  ctx.beginPath();
  ctx.moveTo(line[0][0], line[0][1]);
  for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
  ctx.lineTo(line[line.length - 1][0], level.bounds.h);
  ctx.lineTo(line[0][0], level.bounds.h);
  ctx.closePath();
}

/**
 * Strata lines and rock speckle for one ground polyline, clipped to its own
 * filled shape so neither ever draws outside the dirt body regardless of
 * slope.
 */
function drawGroundDetail(line) {
  const C = CONFIG.COLOURS;
  const T = CONFIG.GROUND_TEXTURE;

  ctx.save();
  groundFillPath(line);
  ctx.clip();

  ctx.strokeStyle = C.GROUND_STRATA;
  ctx.lineWidth = 3;
  for (const depth of T.STRATA_DEPTHS) {
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1] + depth);
    for (const [x, y] of line.slice(1)) ctx.lineTo(x, y + depth);
    ctx.stroke();
  }

  ctx.fillStyle = C.GROUND_ROCK;
  const x0 = line[0][0], x1 = line[line.length - 1][0];
  for (let x = x0; x < x1; x += T.ROCK_SPACING) {
    const h1 = groundHash(x), h2 = groundHash(x + 0.37);
    const surface = yOnLine(line, x);
    const y = surface + T.ROCK_MIN_DEPTH + h2 * (T.ROCK_MAX_DEPTH - T.ROCK_MIN_DEPTH);
    ctx.beginPath();
    ctx.ellipse(x + h1 * T.ROCK_SPACING * 0.6, y, T.ROCK_R * (0.6 + h1 * 0.4), T.ROCK_R * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Flowers along one ground polyline's top edge, drawn with no clip in force
 * so they aren't cut off at the ground's own top boundary.
 */
function drawGroundFlowers(line) {
  const C = CONFIG.COLOURS;
  const T = CONFIG.GROUND_TEXTURE;
  const flowerColours = [C.FLOWER_A, C.FLOWER_B, C.FLOWER_C];
  const x0 = line[0][0], x1 = line[line.length - 1][0];
  for (let x = x0; x < x1; x += T.FLOWER_SPACING) {
    const h = groundHash(x + 100);
    if (h > T.FLOWER_CHANCE) continue;
    const y = yOnLine(line, x);
    ctx.fillStyle = flowerColours[Math.floor(h / T.FLOWER_CHANCE * flowerColours.length) % flowerColours.length];
    ctx.beginPath();
    ctx.arc(x, y - 4, T.FLOWER_R, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The ground: each polyline filled down to the bottom of the level, with its
 * top edge picked out in a darker line so a slope reads as a surface.
 *
 * Filled from the level data rather than from the segments the loader made,
 * because the polyline is already the outline that wants filling and rebuilding
 * it from segments would only be the same list with the joins lost.
 */
function drawGround() {
  const C = CONFIG.COLOURS;
  for (const line of level.data.ground || []) {
    groundFillPath(line);
    ctx.fillStyle = C.GROUND;
    ctx.fill();

    drawGroundDetail(line);
    drawGroundFlowers(line);

    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
    ctx.strokeStyle = C.GROUND_EDGE;
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/**
 * A cosmetic water band under every gap between two ground polylines —
 * computed straight from `level.data.ground`, the same "an edge with
 * nothing continuing from it" idea tests/offline/finish.mjs's own `runner`
 * already uses to find where a jump is needed, just applied to drawing
 * instead of driving. Purely decorative: the ball still just falls through
 * a gap, exactly as it always has.
 *
 * Except where the gap has a floor: a stone box spanning it from rim to rim,
 * no higher than the lower rim — level nine's dry trench. Water drawn there
 * sat on top of the stone and told a child the crate would sink.
 */
function drawWater() {
  const C = CONFIG.COLOURS;
  const W = CONFIG.WATER;
  const lines = level.data.ground || [];
  for (let i = 0; i < lines.length - 1; i++) {
    const endA = lines[i][lines[i].length - 1];
    const startB = lines[i + 1][0];
    const gapW = startB[0] - endA[0];
    if (gapW < 20) continue;   // touching, not a real gap
    const rim = Math.min(endA[1], startB[1]);
    if (level.walls.some((b) => b.x <= endA[0] && b.x + b.w >= startB[0] && b.y >= rim)) continue;

    const top = Math.max(endA[1], startB[1]) + W.DEPTH_BELOW;
    ctx.fillStyle = C.WATER;
    ctx.fillRect(endA[0], top, gapW, level.bounds.h - top);

    ctx.strokeStyle = C.WATER_RIPPLE;
    ctx.lineWidth = 2;
    for (const dy of W.RIPPLE_OFFSETS) {
      ctx.beginPath();
      ctx.moveTo(endA[0], top + dy);
      ctx.lineTo(startB[0], top + dy);
      ctx.stroke();
    }
  }
}

/**
 * The level's boundaries: stone, not wood.
 *
 * They are boxes in the data exactly like a crate is, and they used to be drawn
 * in the same wood. That was harmless while nothing moved, and became a lie the
 * moment crates could be pushed — a child shoving fruitlessly at the end wall
 * has been told by the picture that it should give. Wood gives way; stone never does.
 */
function drawWalls() {
  const C = CONFIG.COLOURS;
  for (const b of level.walls) {
    ctx.fillStyle = C.WALL;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = C.WALL_EDGE;
    ctx.fillRect(b.x, b.y, b.w, 6);
  }
}

/**
 * The crates, at wherever they have been shoved to — `c.x`/`c.y`, never the
 * position they were declared at.
 */
function drawCrates() {
  const C = CONFIG.COLOURS;
  for (const c of level.crates) {
    ctx.fillStyle = C.CRATE;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = C.CRATE_LINE;
    ctx.lineWidth = 5;
    ctx.strokeRect(c.x + 2.5, c.y + 2.5, c.w - 5, c.h - 5);
    // Two planks, so a crate is not a plain brown rectangle.
    ctx.beginPath();
    ctx.moveTo(c.x, c.y + c.h / 3); ctx.lineTo(c.x + c.w, c.y + c.h / 3);
    ctx.moveTo(c.x, c.y + (c.h * 2) / 3); ctx.lineTo(c.x + c.w, c.y + (c.h * 2) / 3);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

/**
 * Plank walls: a row of upright boards with daylight between them, in the
 * crate's own wood — so it reads as wood, and so as something that gives way —
 * but never a solid box, so it is never mistaken for a crate. A knock rattles
 * the drawing (never the collider) and leaves a crack for good. A broken one
 * is simply not drawn; its pieces are `level.particles`.
 */
function drawBreakables() {
  const C = CONFIG.COLOURS;
  const B = CONFIG.BREAKABLE;
  for (const b of level.breakables) {
    if (b.broken) continue;
    const x0 = b.x + (b.wobbleT > 0 ? Math.sin(b.wobbleT * 60) * B.WOBBLE_PX : 0);
    const n = Math.max(1, Math.round(b.w / B.BOARD_W));
    const bw = b.w / n;
    ctx.fillStyle = C.CRATE;
    ctx.strokeStyle = C.CRATE_LINE;
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * bw;
      ctx.fillRect(bx + 3, b.y, bw - 6, b.h);
      ctx.strokeRect(bx + 4, b.y + 1, bw - 8, b.h - 2);
    }
    if (b.cracked) {
      // Clipped to the boards themselves. The zigzag spans the whole wall, and
      // unclipped it was drawn straight across the daylight between two
      // boards — a crack hanging in open air.
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.rect(x0 + i * bw + 3, b.y, bw - 6, b.h);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x0 + b.w * 0.2, b.y + b.h * 0.15);
      ctx.lineTo(x0 + b.w * 0.6, b.y + b.h * 0.4);
      ctx.lineTo(x0 + b.w * 0.3, b.y + b.h * 0.6);
      ctx.lineTo(x0 + b.w * 0.8, b.y + b.h * 0.85);
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
  }
}

/**
 * The checkpoints: a little flag on a pole, grey until reached and green
 * after.
 *
 * Green rather than red, and that is not a taste call — the browser suites
 * find the ball by being the only thing on screen of its hue, so a red flag
 * would be measured as part of the ball.
 */
function drawCheckpoints() {
  const C = CONFIG.COLOURS;
  const K = CONFIG.CHECKPOINT;
  const h = K.POLE_H;
  for (const c of level.checkpoints) {
    // The flag's own pole colour, not a wall's. Borrowing WALL_EDGE meant
    // retinting the scenery silently retinted every checkpoint with it.
    ctx.fillStyle = C.FLAG_POLE;
    ctx.fillRect(c.x - K.POLE_W2, c.y - h, K.POLE_W2 * 2, h);

    ctx.beginPath();
    ctx.moveTo(c.x + K.POLE_W2, c.y - h);
    ctx.lineTo(c.x + K.FLAG_OUT, c.y - h + K.FLAG_MID);
    ctx.lineTo(c.x + K.POLE_W2, c.y - h + K.FLAG_DROP);
    ctx.closePath();
    ctx.fillStyle = c.taken ? C.CHECK_ON : C.CHECK_OFF;
    ctx.fill();
  }
}

/**
 * The gate: a plain stone box, drawn at wherever its own animation has it
 * right now — `g.x`/`g.y`, never the closed position it was declared at.
 * Deliberately the same visual language `drawWalls` already uses (a flat
 * fill plus a lighter top edge), since a gate is exactly a wall except that
 * it moves.
 */
function drawGates() {
  const C = CONFIG.COLOURS;
  for (const g of level.gates) {
    ctx.fillStyle = C.WALL;
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = C.WALL_EDGE;
    ctx.fillRect(g.x, g.y, g.w, 6);
  }
}

/**
 * The balance beam: a plank rotated to its current angle around its own
 * fulcrum, plus a small stone wedge underneath as the pivot. Stone-family
 * grey, like a gate — the beam itself cannot be pushed, only ridden or
 * weighed down by a crate — never wood, which in this game always means
 * something that gives way.
 */
function drawBeams() {
  const C = CONFIG.COLOURS;
  for (const b of level.beams) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = C.BEAM;
    ctx.fillRect(-b.halfLength, -10, b.halfLength * 2, 20);
    ctx.restore();

    ctx.fillStyle = C.BEAM_PIVOT;
    ctx.beginPath();
    ctx.moveTo(b.x - 16, b.y + 18);
    ctx.lineTo(b.x + 16, b.y + 18);
    ctx.lineTo(b.x, b.y - 2);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * The moving platforms, at wherever the level's sine has them this instant —
 * `m.x` and `m.y`, never the `p.x` and `p.y` they were declared at.
 */
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
 * The bounce pad: two posts holding up a springy surface that squashes flat
 * the instant it is touched and eases back out — the same squash-then-
 * recover IDEA `Ball.squash()` gives the ball its own deflate animation,
 * though the mechanics differ: the ball deforms its shape on two axes,
 * this pad only moves a fixed-size ellipse up and down on one.
 *
 * `p.squashT` counts down in `Level.update`, set by player.js the instant a
 * bounce happens; this function only ever reads it.
 */
function drawPads() {
  const C = CONFIG.COLOURS;
  const B = CONFIG.BOUNCE;
  for (const p of level.pads) {
    const t = p.squashT / B.SQUASH_TIME;
    const lift = B.POST_H * (1 - t * B.SQUASH);
    const topY = p.y - lift;

    ctx.strokeStyle = C.BOUNCE_POST;
    ctx.lineWidth = B.POST_LINE_W;
    ctx.beginPath();
    ctx.moveTo(p.x + B.POST_INSET, p.y);
    ctx.lineTo(p.x + B.POST_INSET, topY);
    ctx.moveTo(p.x + p.w - B.POST_INSET, p.y);
    ctx.lineTo(p.x + p.w - B.POST_INSET, topY);
    ctx.stroke();

    ctx.fillStyle = C.BOUNCE_PAD;
    ctx.beginPath();
    ctx.ellipse(p.x + p.w / 2, topY, p.w / 2, B.PAD_RY, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The pop: a handful of small triangles flying off a just-defeated enemy,
 * each pointing outward at its own fixed angle, shrinking and fading as
 * they go. `level.particles` is built once per
 * stomp in `Level.stompEnemy` and advanced every step in `Level.update`;
 * this function only ever reads it, the same read-only relationship
 * `drawPads` has with `level.pads`.
 *
 * Drawn in the same colours a live enemy is drawn in (`drawSpikyBody` in
 * enemies.js), so the debris visibly belongs to what it came from. Pieces of
 * broken planks carry `wood` and are drawn in the crate's colours instead.
 *
 * The charger is a known exception, and it is deliberate rather than
 * forgotten: since Sep 2026 it has its own blue body (`CHARGER_BODY`), and a
 * popped one still bursts in `ENEMY`'s violet — which a child does see, since
 * level ten's optional lesson is stomping a dazed charger. It is left that
 * way for now because `tests/browser/chargers.mjs` finds the charger by
 * counting `CHARGER_BODY` and leans on nothing else in the game being drawn
 * in it; debris in that blue would be counted as charger while it flew.
 * Giving the pop its own shade of blue would settle both, and that is the fix
 * to make when something needs it, not a one-word swap here.
 */
function drawParticles() {
  const C = CONFIG.COLOURS;
  const P = CONFIG.ENEMY.POP;
  for (const p of level.particles) {
    const t = p.life / P.LIFE;
    const s = P.SIZE * t;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.globalAlpha = t;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, s * 0.6);
    ctx.lineTo(-s * 0.6, -s * 0.6);
    ctx.closePath();
    ctx.fillStyle = p.wood ? C.CRATE : C.ENEMY;
    ctx.fill();
    ctx.strokeStyle = p.wood ? C.CRATE_LINE : C.ENEMY_EDGE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The flag at the end, waving once it has been reached.
 *
 * The wave is not decoration. A flag that does nothing when it is touched
 * leaves a child unsure whether anything happened at all, and until audio
 * arrives in phase 4 this and the panel are the whole of the reward.
 *
 * Driven by the flow's `wonFor`, which only advances while the panel is up,
 * so the flag is still before the win and still again the moment the next
 * level begins.
 */
function drawGoal() {
  if (!level.goal) return;
  const C = CONFIG.COLOURS;
  const g = level.goal;
  ctx.fillStyle = C.FLAG_POLE;
  ctx.fillRect(g.x - 3, g.y - 90, 6, 90);
  const wave = flow.mode === 'won' ? Math.sin(flow.wonFor * 9) * 10 : 0;
  ctx.beginPath();
  ctx.moveTo(g.x + 3, g.y - 90);
  ctx.lineTo(g.x + 52, g.y - 74 + wave);
  ctx.lineTo(g.x + 3, g.y - 58);
  ctx.closePath();
  ctx.fillStyle = C.FLAG;
  ctx.fill();
}

/**
 * The ball, turned by its spin, squashed if it is dying and small if it has
 * just come back.
 *
 * The two marks exist only so the turn is visible. A ball drawn as a plain
 * circle slides across the screen and looks wrong without anybody being able
 * to say why — and the roll suite reads exactly these marks moving, by
 * cropping a patch centred on the ball, to know that it turns at all.
 *
 * Failing is drawn and never simulated. Deflating goes from a round ball to a
 * flat puddle where it stood; re-inflating swells from a small ball back to a
 * round one at home. Both are a scale on the canvas rather than a change to
 * `ball.r`, because `r` is the collision radius and the physics must not care
 * what the drawing is doing — a shrinking radius would quietly drop the ball
 * through the floor it is lying on.
 */
function drawBall() {
  const C = CONFIG.COLOURS;

  // How squashed, and how big. The curve itself is the ball's own state and
  // lives on the ball, so node can assert its shape; only the transform below
  // is drawing and belongs here.
  const { sx, sy } = ball.squash();

  ctx.save();
  ctx.globalAlpha = Overlay.flash(ball);
  // Squash towards the ground it is lying on, not towards its own middle.
  // Scaling about the centre would sink a deflating ball halfway into the
  // floor as it flattened; lowering the origin by the height it loses keeps
  // its BOTTOM on the ground, which is where a puddle belongs. The same offset
  // is what makes a re-inflating ball grow upward off the floor rather than
  // out of it.
  ctx.translate(ball.x, ball.y + ball.r * (1 - sy));
  ctx.scale(sx, sy);

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
