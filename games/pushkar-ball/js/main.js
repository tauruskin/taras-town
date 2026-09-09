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
import { Buttons } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let cssW = 0, cssH = 0;      // the canvas in CSS pixels
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
}
window.addEventListener('resize', resize);
resize();

const level = loadLevel(LEVELS[0]);
const ball = new Ball(level.spawn.x, level.spawn.y);
const camera = new Camera(level);
const input = new Input(canvas);

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
 * The ball, turned by its spin.
 *
 * The two marks exist only so the turn is visible. A ball drawn as a plain
 * circle slides across the screen and looks wrong without anybody being able
 * to say why — and the roll suite reads exactly these marks moving, by
 * cropping a patch centred on the ball, to know that it turns at all.
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
