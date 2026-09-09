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
import { LEVELS, loadLevel } from './levels.js';
import { Ball } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Buttons, Overlay } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let cssW = 0, cssH = 0;      // the canvas in CSS pixels
// Declared up here only so `resize` can tell the camera its bias; it is
// assigned below, once the level exists. A `let` read before assignment is
// `undefined` rather than an error, which is what the guard in `resize`
// relies on — a `const` down there would throw instead.
let camera;
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

  // How far below the ball the camera aims depends on the screen, because the
  // two things that want to decide it disagree: the horizon wants a fraction
  // of the height, and the thumb buttons want a fixed number of pixels. So it
  // is recomputed here rather than being a constant, and on every resize —
  // rotating a tablet changes the answer.
  //
  // Guarded because `resize` runs once before there is a camera to tell.
  if (camera) camera.biasY = Camera.biasFor(cssH, scale, CONFIG.BALL.R, cssW);
}
window.addEventListener('resize', resize);
resize();

const level = loadLevel(LEVELS[0]);
const ball = new Ball(level.spawn.x, level.spawn.y);
camera = new Camera(level);
const input = new Input(canvas);

// The camera exists now, so give it the bias the first `resize` could not, and
// put it where that bias says rather than where its default guess had it.
camera.biasY = Camera.biasFor(cssH, scale, CONFIG.BALL.R, cssW);
camera.snap(ball);

// The world is drawn from the first frame, behind the start panel, so the tap
// that begins play reveals a level rather than a blank screen. Only the
// simulation waits.
let playing = false;
document.getElementById('start-button').addEventListener('click', () => {
  document.getElementById('start-screen').classList.add('hidden');
  playing = true;
  // Fullscreen is a bonus, never a requirement: a browser that refuses must
  // still give a playable game.
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) {}
});

// Relative, with no leading slash, because GitHub Pages serves this from a
// sub-folder and a leading slash silently looks at the top of the whole site.
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
    // one enormous delta and fast-forwarding the ball through the floor; the
    // step cap below is the second half of the same guard, in case a slow
    // frame ever leaves more in the accumulator than a frame can work off.
    accumulator += dt;
    let steps = 0;
    while (accumulator >= CONFIG.STEP && steps < 240) {
      level.update(CONFIG.STEP);

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
      const revivingBefore = ball.reviving;
      ball.update(CONFIG.STEP, input, level);
      if (revivingBefore === 0 && ball.reviving > 0) camera.snap(ball);

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
  drawWalls();
  drawCrates();
  drawCheckpoints();
  drawPlatforms();
  drawGoal();
  drawBall();

  ctx.restore();

  // The screen dims while the ball is deflating and lifts again as it swells
  // back up. Both halves of it belong to ui.js, which owns this screen-space
  // layer: the amount is arithmetic and is therefore testable in Node, and
  // anything else drawn over the world goes there too rather than accumulating
  // here. Drawn before the buttons, so the controls never dim.
  Overlay.drawDim(ctx, cssW, cssH, Overlay.dim(ball));

  // Buttons last and outside the world transform, so they sit at a thumb's
  // size on every screen instead of scaling with the level.
  Buttons.draw(ctx, cssW, cssH, input.held());
}

/**
 * Hills behind the level, moving slower than it.
 *
 * Drawn in screen space with the camera folded into the phase, so the bands
 * are endless and cost nothing at either end of a long level. They are also
 * drawn before the world transform is applied, which is what keeps them
 * behind the ground rather than in front of it.
 */
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

/**
 * The level's boundaries: stone, not wood.
 *
 * They are boxes in the data exactly like a crate is, and they used to be drawn
 * in the same wood. That was harmless while nothing moved, and became a lie the
 * moment crates could be pushed — a child shoving fruitlessly at the end wall
 * has been told by the picture that it should give. Wood means it moves.
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
 * The flag at the end.
 *
 * Drawn but inert: reaching it does nothing in this phase. It is here so there
 * is something to aim at while the feel is being judged.
 */
function drawGoal() {
  if (!level.goal) return;
  const C = CONFIG.COLOURS;
  const g = level.goal;
  ctx.fillStyle = C.FLAG_POLE;
  ctx.fillRect(g.x - 3, g.y - 90, 6, 90);
  ctx.beginPath();
  ctx.moveTo(g.x + 3, g.y - 90);
  ctx.lineTo(g.x + 52, g.y - 74);
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
  const D = CONFIG.DEFLATE;

  // How squashed, and how big. `t` runs 0..1 through whichever phase is
  // happening, so both curves are read the same way round.
  let sx = 1, sy = 1;
  if (ball.dying > 0) {
    const t = 1 - ball.dying / D.TIME;         // 0 at death, 1 at the end
    sy = 1 - D.SQUASH * t;
    sx = 1 + D.SPREAD * t;
  } else if (ball.reviving > 0) {
    const t = 1 - ball.reviving / D.INFLATE;   // 0 on arrival, 1 when done
    sy = D.INFLATE_FROM + (1 - D.INFLATE_FROM) * t;
    sx = sy;                                   // round the whole way back up
  }

  ctx.save();
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
