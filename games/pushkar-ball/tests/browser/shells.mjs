// The shell and the aimed popper, in the browser: levels twelve, thirteen and
// fourteen at both small phone sizes, photographed at the moments their
// mechanisms are about — room A's shell on the plate, room B's shell flipped
// by the crate, room B's popper mid-aim and mid-lob, the charger's dash
// meeting a shell, and a shell's and a charger's pop.
//
// HOW IT IS DRIVEN. The game exposes nothing, and some of these moments are
// too narrow to find by watching pixels: level twelve's crate has to fall
// when the corridor's shell will be under it, which no picture can say in
// time. So each level is played first in Node, through the very modules the
// page loads, by the stage logic of tests/offline/finish.mjs's routes
// (copied here, not imported: suites share nothing but _helpers.mjs). That
// run records which buttons were down on every step and when each moment
// happened, and the page is then played by pressing the same buttons at the
// same level times and photographed at the moments Node saw.
//
// That works because the simulation is deterministic and fixed-step, and the
// moments hang on things that are functions of level time — a shell's
// patrol, a popper's clock — more than on where the ball is to the unit. The
// page's ball does drift from Node's, a frame of press timing at a time, so
// the routes are changed in one way, each said where it is: wherever
// finish.mjs steers the ball to a spot and holds it there, this leans it on
// a door or a step instead. A lean puts the ball in the same place however
// late it arrived, so drift does not survive it. And Node proves the plan is
// not fragile before the browser opens: every press is replayed up to LATE (eight)
// steps late, at random, a dozen times, and every moment must still come.
//
// Stomps are the one thing that cannot be played blind — a jump a few steps
// late lands a ball-width off — so level fourteen's are steered live, the way
// chargers.mjs drives level eleven: the ball and its target found by their
// colours on every poll, and stomp14's own rule applied to the gap between
// them, measured in world units through the scale every screen draws at.
//
// WHAT IS CHECKED, from the pictures themselves (each PNG is decoded here, so
// a count is of exactly the frame that was saved, never of a later one):
// - every picture shows as many lit hearts as the level began with. A clean
//   run loses none, and a run that went wrong would otherwise go on
//   photographing whatever room the ball fell back to, under the names of
//   rooms it never reached;
// - each kind is where it is supposed to be, by counting its own colour
//   (SHELL_BODY, CHARGER_BODY, the popper's arc dots, the lob's steel);
// - a pop is drawn in its own shade, and the body is gone in the very frame
//   the pop appears. That is counted on EVERY frame the page draws while
//   the stomp is steered (recordStart / popFrames), not from the pictures:
//   a pop lasts a few frames and a screenshot only catches it by luck. The
//   pictures are still held to it — none may show the pop and the body
//   together — and the ones around the pop are kept to look at.
// The pictures are the point: look at every one of them.
import { connect, IS_BALL } from './_helpers.mjs';
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const URL = process.argv[2];
const TAG = process.argv[3] || 'shells';
const PORT = Number(process.argv[4] || 9335);

const { CONFIG } = await import('../../js/config.js');
const { Buttons, Hearts } = await import('../../js/ui.js');
const { LEVELS, loadLevel } = await import('../../js/levels.js');
const { Ball } = await import('../../js/player.js');
const { Camera } = await import('../../js/camera.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const R = CONFIG.BALL.R, STEP = CONFIG.STEP, C = CONFIG.COLOURS;
const DPR = 2;   // what the page is emulated at, below
const SIZES = [[568, 320], [740, 280]];

// ---------------------------------------------------------------------------
// Pictures: decoded here, counted here
// ---------------------------------------------------------------------------

/** A PNG from Chrome — 8-bit RGB or RGBA, not interlaced — as RGBA pixels. */
function decodePng(buf) {
  let p = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4); type = body[9];
      if (body[8] !== 8 || body[12] !== 0 || (type !== 2 && type !== 6)) throw new Error('unexpected PNG format');
    } else if (kind === 'IDAT') idat.push(body);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y ? px[row - stride + x] : 0;
      const c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[row + x] = v & 255;
    }
  }
  const d = new Uint8Array(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += bpp) {
    d[i * 4] = px[j]; d[i * 4 + 1] = px[j + 1]; d[i * 4 + 2] = px[j + 2]; d[i * 4 + 3] = 255;
  }
  return { w, h, d };
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Pixels of one colour, within `tol` on every channel, optionally inside a
 * box given in CSS pixels. Tolerance 6 for a solid fill, as chargers.mjs.
 */
function count(img, hex, tol = 6, box = null) {
  const [r, g, b] = rgb(hex);
  const x0 = box ? Math.max(0, Math.floor(box.x0 * DPR)) : 0, y0 = box ? Math.max(0, Math.floor(box.y0 * DPR)) : 0;
  const x1 = box ? Math.min(img.w, Math.ceil(box.x1 * DPR)) : img.w, y1 = box ? Math.min(img.h, Math.ceil(box.y1 * DPR)) : img.h;
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.w + x) * 4, d = img.d;
    if (Math.abs(d[i] - r) <= tol && Math.abs(d[i + 1] - g) <= tol && Math.abs(d[i + 2] - b) <= tol) n++;
  }
  return n;
}

// Lit hearts, counted in the hearts' own corner only: the lit colour is
// STAR_ON, which is also the flag's (see chargers.mjs, where this guard was
// first needed).
const heartBox = (W, H) => {
  const first = Hearts.at(0, W, H), last = Hearts.at(CONFIG.HEALTH.HEARTS - 1, W, H), r = CONFIG.HEARTS_UI.R;
  return { x0: first.x - r, y0: first.y - r, x1: last.x + r, y1: last.y + r };
};

// A pop's pieces fade as they fly (globalAlpha = life left), so a frame a
// few hundredths of a second after the pop already has them a shade off
// their own colour: 14 on a channel is allowed. That much also admits the
// anti-aliased seam between a shell's body and its shine, which passes
// exactly through SHELL_POP on its way — so only the INSIDE of a piece is
// counted: a pixel whose neighbours two pixels away on all four sides match
// as well. A seam is a pixel or two wide and has no inside; a piece is a
// triangle some sixteen device pixels across. Every picture with the body in
// it is checked to count none, which is what keeps that honest. (Counting a
// blend of the shade with whatever is behind it, to catch fainter pieces,
// was tried: CHARGER_POP is close enough to the sky's blues that the sky
// itself counted, thousands of pixels of it.)
const POP_TOL = 14;
function popPixels(img, hex, box = null, tol = POP_TOL) {
  const [r, g, b] = rgb(hex), d = img.d, w = img.w;
  const is = (i) => Math.abs(d[i] - r) <= tol && Math.abs(d[i + 1] - g) <= tol && Math.abs(d[i + 2] - b) <= tol;
  const x0 = Math.max(2, box ? Math.floor(box.x0 * DPR) : 0), x1 = Math.min(w - 2, box ? Math.ceil(box.x1 * DPR) : w);
  let n = 0;
  for (let y = 2; y < img.h - 2; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4;
    if (is(i) && is(i - 8) && is(i + 8) && is(i - 8 * w) && is(i + 8 * w)) n++;
  }
  return n;
}

/**
 * The popper's aim arc, as a number of dots. The dots are white at
 * ARC_ALPHA over whatever is behind them, so they are found as the
 * difference from a frame of the same view a moment before the aim began
 * (the ball resting, so the camera with it): near-white pixels that were not
 * near-white then, gathered into blobs, and every blob at least a third of a
 * dot's drawn area counted as one dot.
 */
function arcDots(img, base, W, H) {
  const scale = H / CONFIG.VIEW_H;
  const dotArea = Math.PI * (CONFIG.ENEMY.POPPER.ARC_DOT_R * scale * DPR) ** 2;
  const floor = Math.floor(255 * CONFIG.ENEMY.POPPER.ARC_ALPHA) - 8;
  const on = new Uint8Array(img.w * img.h);
  for (let i = 0; i < on.length; i++) {
    const a = img.d, b = base.d, k = i * 4;
    const white = a[k] >= floor && a[k + 1] >= floor && a[k + 2] >= floor;
    const changed = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 24;
    if (white && changed) on[i] = 1;
  }
  const sizes = [];
  const stack = [];
  for (let s = 0; s < on.length; s++) {
    if (!on[s]) continue;
    let n = 0;
    on[s] = 0; stack.push(s);
    while (stack.length) {
      const i = stack.pop(); n++;
      const x = i % img.w;
      for (const j of [i - 1, i + 1, i - img.w, i + img.w]) {
        if (j < 0 || j >= on.length || !on[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === img.w - 1)) continue;
        on[j] = 0; stack.push(j);
      }
    }
    sizes.push(n);
  }
  const dots = sizes.filter((n) => n >= dotArea / 3 && n <= dotArea * 3).length;
  return { dots, blobs: sizes.length, dotArea: Math.round(dotArea) };
}

// ---------------------------------------------------------------------------
// The plan: each level played in Node first
// ---------------------------------------------------------------------------

const sender = (level, id) => level.senders.find((s) => s.id === id);

/**
 * Play `data` with `route` (pressing nothing for `delay` seconds), or replay
 * recorded buttons, and record the buttons on every step. A jump is recorded
 * as a TAP on the step the route first asks for it: in the page a jump is
 * one touch, not a held button, so a route that keeps asking is one tap here
 * as it is there. `watch(level, ball, t, cam)` is called after every step.
 *
 * `screen`, given as [W, H], also runs a camera exactly as main.js does for
 * that screen — biased, snapped at the start and on every respawn, leaning
 * to show what was opened — so a watcher can ask what is in view.
 */
function simulate(data, makeRoute, { delay = 0, seconds = 60, watch = null, replay = null, screen = null } = {}) {
  const level = loadLevel(data);
  const ball = new Ball(level.spawn.x, level.spawn.y);
  let press = false;
  const input = { left: false, right: false, takeJump() { const j = press; press = false; return j; } };
  const drive = replay ? null : makeRoute(level);
  let cam = null, viewW = 0;
  const viewH = CONFIG.VIEW_H;
  if (screen) {
    const [W, H] = screen, scale = H / CONFIG.VIEW_H;
    viewW = W / scale;
    cam = new Camera(level);
    cam.biasY = Camera.biasFor(H, scale, R, W);
    cam.snap(ball);
    cam.update(STEP, ball, viewW, viewH);
  }
  const steps = [];
  let prevJump = false;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && !ball.won; i++) {
    const t = i * STEP;
    let s;
    if (replay) s = replay[i] || { l: false, r: false, tap: false };
    else {
      const want = t < delay ? {} : drive(ball, t);
      const j = !!want.jump;
      s = { l: !!want.left, r: !!want.right && !want.left, tap: j && !prevJump };
      prevJump = j;
    }
    steps.push(s);
    input.left = s.l; input.right = s.r;
    if (s.tap) press = true;
    const reviving = ball.reviving;
    level.update(STEP);
    ball.update(STEP, input, level);
    if (cam) {
      if (reviving === 0 && ball.reviving > 0) cam.snap(ball);
      for (const r of level.opened) cam.reveal(r.x);
      cam.update(STEP, ball, viewW, viewH);
    }
    const view = cam && { x0: cam.x - viewW / 2, y0: cam.y - viewH / 2, x1: cam.x + viewW / 2, y1: cam.y + viewH / 2 };
    if (watch && watch(level, ball, (i + 1) * STEP, view) === 'stop') break;
  }
  return { level, ball, steps };
}

/**
 * The recorded buttons with every press moved 0..`most` steps later, each
 * by its own random amount: what a page does to a press, a little worse.
 */
function jittered(steps, most, seed) {
  let x = (seed * 2654435761) % 4294967296 || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const out = steps.map(() => ({ l: false, r: false, tap: false }));
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].tap) { const k = i + Math.floor(rnd() * (most + 1)); if (out[k]) out[k].tap = true; }
  }
  // A held button is whatever the latest change to have ARRIVED says.
  const arrivals = [];
  for (let i = 0; i < steps.length; i++) {
    const p = steps[i - 1] || { l: false, r: false };
    if (steps[i].l !== p.l || steps[i].r !== p.r) arrivals.push({ at: i + Math.floor(rnd() * (most + 1)), l: steps[i].l, r: steps[i].r });
  }
  arrivals.sort((a, b) => a.at - b.at);
  let k = 0, last = { l: false, r: false };
  for (let i = 0; i < out.length; i++) {
    while (k < arrivals.length && arrivals[k].at <= i) last = arrivals[k++];
    out[i].l = last.l; out[i].r = last.r;
  }
  return out;
}

// --- Level twelve (finish.mjs's room12 / shellAhead / route12, without the
// bookkeeping its checks keep) ----------------------------------------------

function room12(level) {
  const shells = level.enemies.filter((e) => e.kind === 'shell').sort((a, b) => a.from - b.from);
  const [sA, sB] = shells;
  const roofA = level.walls.find((w) => !w.movable && w.x <= sA.from && w.x + w.w >= sA.to && w.y + w.h <= sA.y - sA.r);
  const gate = level.gates.filter((g) => g.x >= roofA.x + roofA.w).sort((a, b) => a.x - b.x)[0];
  const crate = level.crates[0];
  const home = level.data.boxes.find((b) => b.movable);
  const lip = home.y + home.h;
  const roofs = level.walls.filter((w) => !w.movable && w.y === lip).sort((a, b) => a.x - b.x);
  const overPit = roofs.filter((w) => w.x + w.w <= sB.from).at(-1);
  const L = overPit.x + overPit.w;
  const mid = roofs.find((w) => w.x > L);
  const tall = level.walls.filter((w) => !w.movable && w.y === 0 && w.x > L && w.h < level.bounds.h).sort((a, b) => a.x - b.x)[0];
  if (!sA || !sB || !roofA || !gate || !crate || !mid || !tall) throw new Error('level 12: room12 could not find its pieces');
  return { sA, sB, roofA, gate, crate, home, lip, L, hole1: [L, mid.x], hole2: [mid.x + mid.w, tall.x], floor: sB.y + sB.r };
}

function shellAhead(s, t) {
  const v = CONFIG.ENEMY.SHELL.PATROL_SPEED;
  let x = s.x, dir = s.dir;
  for (let left = t; left > 0; left -= STEP) {
    if (x <= s.from) dir = 1;
    if (x >= s.to) dir = -1;
    x += dir * v * STEP;
  }
  return x;
}

function route12(level) {
  const S = CONFIG.ENEMY.SHELL;
  const { sB, roofA, gate, crate, home, lip, L, hole1, hole2, floor } = room12(level);
  let stage = null;
  const fall = Math.sqrt(2 * ((floor - 2 * sB.r) - lip) / CONFIG.GRAVITY);
  const inCorridor = () => crate.y > lip;
  const steer = (ball, x, tol = 3) => (ball.x < x - tol ? { right: true } : ball.x > x + tol ? { left: true } : {});
  const intoHole2 = (ball, target) => {
    if (ball.x < hole2[0] + R) return { right: true, jump: ball.grounded && ball.x > hole1[0] - R - 6 && ball.x < hole1[0] };
    return steer(ball, Math.min(Math.max(target, hole2[0] + R + 2), hole2[1] - R - 2));
  };
  const timed = () => {
    if (!sB.alive || sB.state !== 'patrol') return false;
    const CONTACT = 0.03;
    const t = (L - crate.x) / CONFIG.CRATE.PUSH_SPEED + CONTACT + fall;
    // The crate lands as the shell, heading right, is at the start of its
    // patrol (finish.mjs's route12 with its phase 0).
    const x0 = shellAhead(sB, t), x1 = shellAhead(sB, t + STEP);
    return Math.sign(x1 - x0) === 1 && Math.abs(x0 - sB.from) <= S.PATROL_SPEED * STEP;
  };
  return (ball) => {
    if (!stage) stage = ball.x < gate.x ? 'toA' : 'toB';
    // Room A, changed from route12 for a page that is played blind: lean on
    // the door instead of waiting on the roof. Leaning on it puts the ball in
    // the same place however late it arrived, so nothing a press's timing
    // got wrong on the way survives to room B, and the shell still has to
    // come onto the plate for the ball to be let through.
    if (stage === 'toA') {
      if (ball.x > gate.x + gate.w + R) stage = 'toB';
      else return { right: true };
    }
    if (stage === 'toB') {
      if (inCorridor()) stage = 'rWait';
      else if (ball.y < lip && ball.x > crate.x + crate.w) stage = 'rBack';
      else if (ball.grounded && ball.y < lip && crate.x - (ball.x + R) < 2) stage = 'pushB';
      else return { right: true };
    }
    if (stage === 'pushB') {
      // Stopped short by as far as the crate slides in LATE steps, changed
      // from route12 for the page: a release that late off route12's 6 units
      // pushed the crate over the edge early, and the shell was not under it
      // (simulated: route12's release replayed 5 steps late, three hearts
      // lost). The nudge is timed from wherever the crate stopped.
      if (crate.x >= L - 6 - CONFIG.CRATE.PUSH_SPEED * LATE * STEP) stage = 'aimB';
      else return { right: true };
    }
    if (stage === 'aimB') {
      if (timed()) stage = 'nudge';
      else return {};
    }
    if (stage === 'nudge') {
      if (crate.y > lip - home.h + 2) stage = 'falling';
      else return { right: true };
    }
    if (stage === 'falling') {
      if (sB.state === 'flipped') stage = 'jumpB';
      else if (crate.grounded && inCorridor()) stage = 'rWait';
      else return {};
    }
    if (stage === 'jumpB') {
      if (ball.y > lip) stage = 'stompB';
      else return intoHole2(ball, sB.x);
    }
    if (stage === 'stompB') {
      if (!sB.alive || ball.grounded) stage = 'throughB';
      else return steer(ball, sB.x);
    }
    if (stage[0] === 'r' && ball.y > lip - R && ball.y < floor - 2 * R && ball.x > hole1[0] && ball.x < hole1[1] && inCorridor()) {
      stage = 'rWait';
      return { left: true, jump: ball.grounded };
    }
    if (stage === 'rWait') {
      const spot = L - 4 * R;
      if (ball.y < lip && ball.grounded && Math.abs(ball.x - spot) < 8 && Math.abs(ball.vx) < 30 &&
          sB.alive && sB.state === 'patrol' && sB.dir === 1 && sB.x > hole2[1] + sB.r + 2 * R) stage = 'rJump';
      else if (ball.y > floor - 2 * R) stage = 'rIn';
      else return steer(ball, spot);
    }
    if (stage === 'rJump') {
      if (ball.y > lip) stage = 'rIn';
      else return intoHole2(ball, hole2[0]);
    }
    if (stage === 'rIn') {
      if (!inCorridor() || crate.x + crate.w < hole1[0]) stage = 'rOut';
      else return { left: true };
    }
    if (stage === 'rOut') {
      const under = (hole1[0] + hole1[1]) / 2;
      if (ball.y < lip && ball.grounded) stage = 'rBack';
      else if (ball.y > lip && ball.grounded && Math.abs(ball.x - under) < 8 && Math.abs(ball.vx) < 40) return { jump: true, left: true };
      else if (ball.y < lip + R) return { left: true };
      else return steer(ball, under);
    }
    if (stage === 'rBack') {
      if (ball.grounded && ball.x < crate.x - R - 2) stage = 'toB';
      else return { left: true, jump: ball.grounded && ball.x - (crate.x + crate.w) < 40 + R };
    }
    return { right: true };
  };
}

// --- Level thirteen (room13 / route13) --------------------------------------

function room13(level) {
  const [pA, pB, pC] = level.enemies.filter((e) => e.kind === 'popper' && !e.fixed).sort((a, b) => a.x - b.x);
  const b = sender(level, 'b');
  const gate = level.gates.find((g) => g.needs.includes('b'));
  const stepBeside = (wd) => level.walls.find((w) => !w.movable && Math.abs(w.x - (wd.x + wd.w)) < 1 && w.y > wd.y + wd.h);
  const wood = level.breakables.find((wd) => stepBeside(wd));
  if (!pC || !b || !gate || !wood) throw new Error('level 13: room13 could not find its pieces');
  const step = stepBeside(wood);
  return { pA, pB, pC, b, gate, wood, step, spotB: gate.x - R, spotC: step.x - R };
}

function route13(level) {
  const { gate, wood, step } = room13(level);
  let stage = null;
  return (ball) => {
    if (!stage) stage = ball.x < gate.x ? 'toB' : 'toC';
    // Resting against the door and the step, as route13 does, but by
    // leaning on them rather than steering to a spot beside them: in a page
    // played blind, a lean is exact and a steer drifts.
    if (stage === 'toB') {
      if (gate.openT > 0.9) stage = 'throughB';
      else return { right: true };
    }
    if (stage === 'throughB') {
      if (ball.x > gate.x + gate.w + R) stage = 'toC';
      else return { right: true };
    }
    if (stage === 'toC') {
      if (wood.broken) stage = 'up';
      else return { right: true };
    }
    if (stage === 'up') {
      if (ball.grounded && ball.y < step.y) stage = 'end';
      else return { right: true, jump: ball.grounded };
    }
    return { right: true };
  };
}

// --- Level fourteen (room14 / stomp14 / route14) -----------------------------

function room14(level, i) {
  const K = CONFIG.ENEMY.CHARGER;
  const byFrom = (k) => level.enemies.filter((e) => e.kind === k).sort((a, b) => a.from - b.from);
  const c = byFrom('charger')[i], s = byFrom('shell')[i];
  const over = level.walls.filter((w) => !w.movable && w.x <= c.from && w.x + w.w >= c.to && w.y + w.h <= c.y - c.r);
  const roof = over.slice().sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
  const next = byFrom('charger')[i + 1];
  const gate = level.gates.filter((g) => g.x > s.to && (!next || g.x < next.from)).sort((a, b) => a.x - b.x)[0] || null;
  let x1;
  if (gate) x1 = gate.x - R;
  else {
    const line = level.data.ground.find((l) => l[0][0] <= c.from && l.at(-1)[0] > s.to);
    const climb = line.findIndex((p) => p[1] !== line[0][1]);
    x1 = line[climb - 1][0];
  }
  const x0 = s.to + s.r + R;
  return {
    c, s, roof, gate, x0, x1,
    down: (ball) => ball.grounded && Math.abs(ball.y - c.y) < K.LEVEL_TOL && ball.x >= x0 - 1 && ball.x <= x1 + 1,
  };
}

// Level fourteen, blind part: roll into room A's yard and let go once down
// (route14's 'toA'), and let the ball coast to a stop there instead of
// steering it to and fro inside the lure band — every turn of a steer is a
// press the page times a little wrongly. The charger sees it anywhere in the
// yard. Everything after the dash is steered live: see stompLive.
function route14(level) {
  const A = room14(level, 0);
  let down = false;
  return (ball) => {
    if (!down && A.down(ball)) down = true;
    return down ? {} : { right: true };
  };
}

// --- What is photographed, and when ------------------------------------------

// How late a press may be. The page's presses ran up to 45ms late on a
// loaded run (printed by this suite, at both sizes on level twelve), past
// the four steps this was first; Node proves every plan survives this many.
const LATE = 8;
// Seconds of level time before the first press. The page needs a moment
// after the tile's tap before a touch reaches the game; this suite's own
// lateness print stays under ten milliseconds from the first press on with
// it (printed by this suite), and it costs nothing, since every plan is
// simulated with the same idle start.
const DELAY = 1.2;

// Every planner takes an optional recording to replay instead of its route
// (the jitter check), and an optional screen to run a camera for.
function plan12(data, replay = null) {
  const seen = {};
  const { ball } = simulate(data, route12, {
    delay: DELAY, seconds: 120, replay,
    watch: (lv, b, t) => {
      const { sA, sB, roofA, gate } = room12(lv);
      const p = sender(lv, 'p');
      // Room A: the ball on the pen's roof and the plate pressed — by the
      // shell, the only thing in the pen — at the moment the two are
      // closest, so both are in the picture on the narrowest screen. (At the
      // door instead, the shell is half a screen off to the left, and at
      // 568x320 the pen's floor is behind the thumb buttons there.)
      const onRoof = b.grounded && b.x > roofA.x && b.x < roofA.x + roofA.w;
      if (onRoof && p.pressed && sA.alive && (seen.plateGap == null || Math.abs(sA.x - b.x) < seen.plateGap)) {
        seen.plateGap = Math.abs(sA.x - b.x);
        seen.plate = t;
      }
      if (seen.flip == null && sB.state === 'flipped') seen.flip = t;
      if (seen.flip != null && t > seen.flip + 0.7) return 'stop';
    },
  });
  return { seen, hits: ball.hits, route: route12, seconds: (seen.flip || 100) + 0.7 };
}

function plan13(data, replay = null, screen = null) {
  const seen = {};
  let restFrom = null, beforeView = null, lobShown = false;
  const stretches = [];
  const { ball } = simulate(data, route13, {
    delay: DELAY, seconds: 120, replay, screen,
    watch: (lv, b, t, view) => {
      const { pB, gate } = room13(lv);
      const resting = b.grounded && Math.abs(b.vx) < 1 && b.x > gate.x - 2 * R && b.x < gate.x;
      if (seen.aim0 == null) {
        if (resting) { if (restFrom == null) restFrom = t; } else restFrom = null;
        // The first aim at the ball resting against the door, a second into
        // the rest at least, so the camera has settled too.
        if (restFrom != null && t - restFrom > 1 && pB.state === 'aim' && pB.target) seen.aim0 = t;
        if (view && restFrom != null) beforeView = view;
      } else if (seen.aim1 == null && pB.state !== 'aim') seen.aim1 = t;
      if (seen.aim0 != null && seen.aim1 == null && view && seen.aimMid == null && t >= seen.aim0 + 0.4) {
        // How many of the arc's dots the camera has in view, asked of the
        // same arithmetic drawAimArc uses, and whether the camera has moved
        // since the frame the arc is compared against.
        seen.aimMid = t;
        const P = CONFIG.ENEMY.POPPER, F = pB.flight, g = CONFIG.GRAVITY;
        const x0 = pB.x, y0 = pB.y - pB.r, vx = (pB.target.x - x0) / F, vy = (pB.target.y - y0 - 0.5 * g * F * F) / F;
        let n = 0, top = Infinity;
        for (let k = 1; k <= P.ARC_DOTS; k++) {
          const s = (k / P.ARC_DOTS) * F, x = x0 + vx * s, y = y0 + vy * s + 0.5 * g * s * s;
          top = Math.min(top, y);
          // The last dot is the spot it locked, which is the resting ball:
          // drawn, and drawn over by the ball.
          if (Math.hypot(x - b.x, y - b.y) < R + P.ARC_DOT_R) continue;
          if (x > view.x0 + P.ARC_DOT_R && x < view.x1 - P.ARC_DOT_R && y > view.y0 + P.ARC_DOT_R && y < view.y1 - P.ARC_DOT_R) n++;
        }
        seen.dotsInView = n; seen.flight = F;
        seen.arcAbove = Math.round(view.y0 - top);
        seen.cameraStill = beforeView && Math.abs(beforeView.x0 - view.x0) < 0.5 && Math.abs(beforeView.y0 - view.y0) < 0.5;
      }
      const lob = seen.aim1 != null ? pB.activeProjectile(lv.time) : null;
      if (lob && seen.lob0 == null) seen.lob0 = t;
      // The lob in view: the stretches of its flight the camera can see. It
      // leaves the top of the screen on the way up on both screens here, so
      // there is one as it leaves the popper and, on some screens, another
      // as it comes down onto the button; the longer is photographed.
      if (lob && view && lob.y - lob.r > view.y0 && lob.y + lob.r < view.y1) {
        if (!lobShown) stretches.push([t, t]);
        stretches.at(-1)[1] = t;
        lobShown = true;
      } else lobShown = false;
      if (seen.lob0 != null && !lob) { seen.lob1 = t; return 'stop'; }
    },
  });
  const best = stretches.sort((a, b2) => (b2[1] - b2[0]) - (a[1] - a[0]))[0];
  if (best) { seen.lobIn0 = best[0]; seen.lobIn1 = best[1]; }
  seen.lobShownFor = stretches.reduce((n, [a, b2]) => n + b2 - a + STEP, 0);
  return { seen, hits: ball.hits, route: route13, seconds: (seen.lob1 || 100) + 0.3 };
}

function plan14(data, replay = null) {
  const seen = {};
  const { ball } = simulate(data, route14, {
    delay: DELAY, seconds: 60, replay,
    watch: (lv, b, t) => {
      const A = room14(lv, 0);
      if (seen.dash == null && A.s.state === 'flipped') seen.dash = t;
      if (seen.dash != null && t >= seen.dash + 0.4) { seen.restVx = Math.abs(b.vx); return 'stop'; }
    },
  });
  return { seen, hits: ball.hits, route: route14, seconds: (seen.dash || 50) + 0.4 };
}

/** Plan a level, and print what Node saw. */
function prepare(id, planner) {
  const data = LEVELS.find((l) => l.id === id);
  const pl = planner(data);
  const { steps, ball } = simulate(data, pl.route, { delay: DELAY, seconds: pl.seconds });
  pl.steps = steps;
  console.log(`\nlevel ${id}, planned in Node: ${Object.entries(pl.seen).map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' ')}`);
  if (ball.hits) fail(`level ${id}: the planned run itself lost ${ball.hits} heart(s)`);
  return { data, pl };
}

/** Replay a plan with every press up to LATE steps late; every moment must still come, on time. */
function jitterCheck(id, { data, pl }, planner, keys, tol = {}) {
  const bad = [];
  for (let seed = 1; seed <= 12; seed++) {
    const again = planner(data, jittered(pl.steps, LATE, seed));
    if (again.hits) bad.push(`seed ${seed}: ${again.hits} heart(s) lost`);
    for (const k of keys) {
      const a = pl.seen[k], b = again.seen[k];
      if (a == null) continue;
      if (b == null || Math.abs(a - b) > (tol[k] ?? 0.15)) bad.push(`seed ${seed}: ${k} ${a.toFixed(2)} -> ${b == null ? 'never' : b.toFixed(2)}`);
    }
  }
  console.log(`   every press up to ${LATE} steps late, 12 runs: ${bad.length ? bad.length + ' went wrong' : 'every moment kept'}`);
  for (const b of bad) fail(`level ${id} is too sensitive to a press's timing to be played blind in a page: ${b}`);
}

const plans = { 12: prepare(12, plan12), 13: prepare(13, plan13), 14: prepare(14, plan14) };
jitterCheck(12, plans[12], plan12, ['plate', 'flip']);
// The lob is photographed mid-way through the stretch it is in view, which
// is about a tenth of a second at 740x280 (0.108s, printed by this suite).
// Holding lob0 to half of that under LATE-step jitter was tried and cannot
// hold: the popper aims once the ball has rested, so the lob moves one for
// one with how late the presses that brought the ball were (simulated:
// 6 of 12 seeds moved lob0 by 0.06-0.07s, i.e. the 8 steps). So Node checks
// the lob is never moved MORE than the presses were, and the page checks
// what matters directly: its presses on this level were less than half the
// window late, and the picture was captured inside the window.
const lobWindow = Math.min(...SIZES.map((sz) => {
  const sn = plan13(plans[13].data, plans[13].pl.steps, sz).seen;
  return sn.lobIn1 - sn.lobIn0;
}));
console.log(`   level 13: the lob's narrowest window in view is ${lobWindow.toFixed(3)}s; presses there may be at most ${(lobWindow / 2 * 1000).toFixed(0)}ms late`);
jitterCheck(13, plans[13], plan13, ['aim0', 'lob0'], { lob0: (LATE + 1) * STEP });
jitterCheck(14, plans[14], plan14, ['dash']);
for (const [id, keys] of [[12, ['plate', 'flip']], [13, ['aim0', 'aim1', 'lob0']], [14, ['dash']]]) {
  for (const k of keys) if (plans[id].pl.seen[k] == null) fail(`level ${id}: Node never saw ${k}, so there is nothing to photograph`);
}
if (plans[14].pl.seen.restVx > 5) fail(`level 14: the ball is still rolling (${plans[14].pl.seen.restVx.toFixed(0)}/s) when the live stomp is to begin`);

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, problems } = cdp;

/** Wait until wall-clock `at` (ms), sleeping most of it and spinning the end. */
async function until(at) {
  const left = at - Date.now();
  if (left > 6) await sleep(left - 5);
  while (Date.now() < at) { /* the last few ms */ }
}

/**
 * Open level `id` with every level unlocked, as openLevel in _helpers.mjs
 * does, except that the tile's tap is timed: that is level time zero.
 */
async function openTimed(W, H, id) {
  const index = LEVELS.findIndex((l) => l.id === id);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL });
  await sleep(1600);
  await ev(`localStorage.setItem('pushkar-ball-save', JSON.stringify({ unlocked: ${LEVELS.length}, finished: [] }))`);
  await send('Page.navigate', { url: URL });
  await sleep(1600);
  await ev("document.getElementById('start-button').click()");
  await sleep(400);
  const a = Date.now();
  await ev(`document.querySelectorAll('#level-grid .tile')[${index}].click()`);
  return (a + Date.now()) / 2;
}

/**
 * A thumb on the left or right button (or neither), and taps on jump. Each
 * returns once Chrome has taken the press.
 */
function thumbs(W, H) {
  const at = { l: Buttons.left(W, H), r: Buttons.right(W, H) }, jump = Buttons.jump(W, H);
  let held = null;
  const pts = () => (held ? [{ x: at[held].x, y: at[held].y, id: 1 }] : []);
  const touch = (type, touchPoints) => send('Input.dispatchTouchEvent', { type, touchPoints });
  return {
    async hold(dir) {
      if (dir === held) return;
      const was = held;
      held = dir;
      if (!held) await touch('touchEnd', []);
      else if (!was) await touch('touchStart', pts());
      else await touch('touchMove', pts());
    },
    // `dir`, from no thumb down, puts the thumb down in the same touch as
    // the jump: two presses due on one step, sent one after the other, made
    // the second a whole round trip late (31-45ms on a loaded run, printed by
    // this suite at level twelve's flip).
    async tap(dir) {
      if (dir && !held) held = dir;
      await touch('touchStart', [...pts(), { x: jump.x, y: jump.y, id: 2 }]);
      if (held) await touch('touchMove', pts());
      else await touch('touchEnd', []);
    },
    lift() { if (held) { held = null; return touch('touchEnd', []); } },
  };
}

/**
 * Pictures, one at a time. Two captures in flight at once came back as a
 * half-size two-by-two tiling of the screen — Chrome's doing, not the
 * game's — so each waits for the last. And no press is sent while one is in
 * flight: a touch that arrives during a capture is accepted, replied to as a
 * success, and never reaches the page — the ball simply did not move, which
 * cost a run of this suite blaming its own steering. `idle` is for that.
 */
function camera(W, H) {
  let chain = Promise.resolve();
  const taken = [];
  return {
    take(name) {
      let at = 0;
      chain = chain.then(() => { at = Date.now(); return send('Page.captureScreenshot', { format: 'png' }); }).then((m) => {
        if (!m.result) { fail(`no picture for ${name}`); return; }
        taken.push({ name, at, buf: Buffer.from(m.result.data, 'base64') });
      });
      return chain;
    },
    idle() { return chain; },
    peek() { return taken; },
    async done() { await chain; return taken; },
    W, H,
  };
}

/** Decode and keep every picture, writing to disk those `keep` says to. */
function develop(W, H, taken, keep = () => true) {
  const pics = new Map();
  for (const { name, buf } of taken) {
    pics.set(name, decodePng(buf));
    if (keep(name)) writeFileSync(`${TAG}-${W}x${H}-${name}.png`, buf);
  }
  return pics;
}

/**
 * Press the recorded buttons into the page by level time, and take each of
 * `shots` ({ name, t }) at its level time.
 */
async function blind(origin, hands, cam, steps, shots, seconds) {
  const acts = [];
  let prev = { l: false, r: false };
  const n = Math.min(steps.length, Math.round(seconds / STEP));
  for (let i = 0; i < n; i++) {
    const s = steps[i];
    const dir = s.l ? 'l' : s.r ? 'r' : null, moved = s.l !== prev.l || s.r !== prev.r;
    const wasNone = !prev.l && !prev.r;
    // A thumb going down from none on the step of a jump goes down with it.
    if (moved && !(s.tap && wasNone)) acts.push({ t: i * STEP, held: dir });
    if (s.tap) acts.push({ t: i * STEP, tap: true, dir: moved && wasNone ? dir : null });
    prev = s;
  }
  // A picture must not be in flight when a press is due (see `camera`), so
  // one that would be is taken just after the press instead.
  const pressTimes = acts.map((a) => a.t);
  for (const sh of shots) {
    let t = sh.t;
    const clash = pressTimes.find((p) => p >= t - 0.01 && p < t + 0.25);
    if (clash != null) t = clash + 0.02;
    // A picture with a window ([from, to], level time) must be ASKED for
    // inside it; moved past a press, it may not be.
    if (sh.window && (t < sh.window[0] || t > sh.window[1])) {
      fail(`${sh.name}: ${clash != null ? `a press at ${clash.toFixed(3)}s moves the picture to` : 'the picture is asked for at'} ${t.toFixed(3)}s, outside its window ${sh.window[0].toFixed(3)}-${sh.window[1].toFixed(3)}s`);
    }
    acts.push({ t, shot: sh.name });
  }
  acts.push({ t: seconds, end: true });
  acts.sort((a, b) => a.t - b.t);
  let latest = 0, held = 0;
  for (const a of acts) {
    await until(origin + a.t * 1000);
    latest = Math.max(latest, Date.now() - (origin + a.t * 1000));
    if (a.shot) { cam.take(a.shot); continue; }
    if (a.end) continue;
    await cam.idle();
    const late = Date.now() - (origin + a.t * 1000);
    held = Math.max(held, late);
    if (a.tap) await hands.tap(a.dir);
    else await hands.hold(a.held);
  }
  console.log(`   ${acts.length - 1} presses and pictures by level time; the latest was ${latest.toFixed(0)}ms behind, the latest press ${held.toFixed(0)}ms`);
  // A windowed picture is held to its window by when its capture actually
  // began, not when it was asked for: one queued behind another picture
  // starts late. Checked once all of them are in.
  const windowed = shots.filter((sh) => sh.window);
  if (windowed.length) {
    const taken = await cam.idle().then(() => cam.peek());
    for (const sh of windowed) {
      const got = taken.find((x) => x.name === sh.name);
      if (!got) continue;
      const lt = (got.at - origin) / 1000;
      console.log(`   ${sh.name}: captured at ${lt.toFixed(3)}s of level time, window ${sh.window[0].toFixed(3)}-${sh.window[1].toFixed(3)}s`);
      if (lt < sh.window[0] || lt > sh.window[1]) fail(`${sh.name} was captured at ${lt.toFixed(3)}s, outside its window ${sh.window[0].toFixed(3)}-${sh.window[1].toFixed(3)}s`);
    }
  }
  // LATE steps is what the jitter check proved the plan survives.
  if (held > LATE * STEP * 1000) fail(`a press went ${held.toFixed(0)}ms late, more than the ${LATE} steps the plan was checked against`);
  return held;
}

/**
 * How far either side of the ball a stomp's target is looked for, in world
 * units: the width of a yard from the door, where the ball waits, to the
 * charger dazed at the far end, and still short of the next room's pair,
 * which is more than five hundred away at its nearest — at 740x280 the
 * whole of level fourteen's room B, its charger and its shell, is on screen
 * while the ball is still in room A, and a centroid of both rooms' shells is
 * a point between them where there is nothing to stomp. 400 is a round
 * number between the two: the yard is under 400 wide and the next pair more
 * than 500 away (both read off level fourteen's data in levels.js).
 */
const REACH = 400;

/**
 * The ball, a target colour within REACH of it, and how many pixels of
 * dazed stars there are anywhere, found on the canvas in one look — every fourth device pixel each way,
 * which is plenty for a centroid and keeps a look to a hundredth of a second
 * or two. CSS pixels.
 */
/** The ball and the stars only: no target colour, so no reach is needed. */
const lookBall = () => look(null, 1, CONFIG.VIEW_H);
const look = (hex, W, H, more = null) => {
  const [r, g, b] = hex ? rgb(hex) : [-99, -99, -99];
  const [sr, sg, sb] = rgb(C.CHARGER_STAR);
  const reach = REACH * (H / CONFIG.VIEW_H);
  // `more`, for stompLive's trace only: lit heart pixels in the hearts'
  // corner, and another colour's centroid within REACH (the charger).
  const [hr, hg, hb] = rgb(C.STAR_ON), [or, og, ob] = more ? rgb(more.other) : [-99, -99, -99];
  const hb0 = more ? more.hearts : { x0: 0, y0: 0, x1: 0, y1: 0 };
  return ev(`(() => {
    const c = document.getElementById('game');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const dpr = c.width / parseFloat(c.style.width);
    let bn = 0, bx = 0, by = 0, tn = 0, tx = 0, ty = 0, stars = 0;
    // Every second pixel for this pass: the stars are small, and at every
    // fourth a charger's three could come to none.
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
      const i = (y * c.width + x) * 4;
      if (${IS_BALL}) { bn++; bx += x; by += y; }
      else if (Math.abs(d[i] - ${sr}) < 6 && Math.abs(d[i + 1] - ${sg}) < 6 && Math.abs(d[i + 2] - ${sb}) < 6) stars++;
    }
    if (!bn) return { ball: null, tgt: null, stars };
    bx /= bn; by /= bn;
    const x0 = bx - ${reach} * dpr, x1 = bx + ${reach} * dpr;
    for (let y = 0; y < c.height; y += 4) for (let x = 0; x < c.width; x += 4) {
      if (x < x0 || x > x1) continue;
      const i = (y * c.width + x) * 4;
      if (Math.abs(d[i] - ${r}) < 6 && Math.abs(d[i + 1] - ${g}) < 6 && Math.abs(d[i + 2] - ${b}) < 6) { tn++; tx += x; ty += y; }
    }
    let hearts = 0, on = 0, ox = 0, oy = 0;
    if (${!!more}) {
      for (let y = Math.floor(${hb0.y0} * dpr); y < ${hb0.y1} * dpr; y += 2) for (let x = Math.floor(${hb0.x0} * dpr); x < ${hb0.x1} * dpr; x += 2) {
        const i = (y * c.width + x) * 4;
        if (Math.abs(d[i] - ${hr}) <= 6 && Math.abs(d[i + 1] - ${hg}) <= 6 && Math.abs(d[i + 2] - ${hb}) <= 6) hearts++;
      }
      for (let y = 0; y < c.height; y += 4) for (let x = 0; x < c.width; x += 4) {
        if (x < x0 || x > x1) continue;
        const i = (y * c.width + x) * 4;
        if (Math.abs(d[i] - ${or}) < 6 && Math.abs(d[i + 1] - ${og}) < 6 && Math.abs(d[i + 2] - ${ob}) < 6) { on++; ox += x; oy += y; }
      }
    }
    return { ball: { x: bx / dpr, y: by / dpr },
             tgt: tn ? { x: tx / tn / dpr, y: ty / tn / dpr, n: tn } : null, stars,
             hearts, other: on ? { x: ox / on / dpr, y: oy / on / dpr, n: on } : null };
  })()`);
};

/** Hold one way until the ball has stood still for `still` seconds — against a door, here. */
async function rollToRest(hands, dir, still = 1.2, seconds = 20) {
  await hands.hold(dir);
  const end = Date.now() + seconds * 1000;
  let last = null, since = 0;
  while (Date.now() < end) {
    const q = await lookBall();
    if (q.ball && last && Math.hypot(q.ball.x - last.x, q.ball.y - last.y) < 0.5) {
      if (!since) since = Date.now();
      else if (Date.now() - since > still * 1000) return true;
    } else since = 0;
    if (q.ball) last = q.ball;
  }
  return false;
}

/** Wait for a dazed charger's (or a flipped shell's) stars. */
async function waitForStars(seconds = 20) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) if ((await lookBall()).stars > 5) return true;
  return false;
}

/**
 * Stomp whatever is drawn in `hex`, steered live: stomp14's rule — on the
 * ground, roll at it and jump from within 70 units on its right; in the
 * air, steer over it — with the gap read off the canvas every look, in world
 * units through the scale (`H / VIEW_H` CSS pixels to a unit). Grounded is
 * "back at the height it started from", which on the flat of a yard it is.
 * Pictures are taken back to back the whole time and for a moment after the
 * target is gone. Returns whether it went.
 */
async function stompLive(hands, cam, hex, name, W, H, { whileStars = false, after = 3, seconds = 5 } = {}) {
  const scale = H / CONFIG.VIEW_H;
  // The trace: every look and what it led to, printed only when the stomp
  // goes wrong (a heart lost, or no pop), so a failure says what the ball,
  // the target and the other kind were doing step by step.
  const more = { hearts: heartBox(W, H), other: hex === C.SHELL_BODY ? C.CHARGER_BODY : C.SHELL_BODY };
  const t0 = Date.now(), trace = [], heartsSeen = [];
  const first = await look(hex, W, H, more);
  if (!first.ball || !first.tgt) { await hands.hold(null); return 'not there'; }
  if (whileStars && !first.stars) return 'not dazed';
  const ground = first.ball.y;
  let k = 0, missing = 0, starless = 0, jumped = false, lastY = ground, prevQ = null, prevT = 0;
  const report = (why) => {
    const u = (v) => (v / scale).toFixed(1);
    console.log(`   ${name}: ${why}; the steering, look by look (ms since the first look; world units, x/y from the screen's left/top; v from the look before):`);
    console.log(`     first look: ball ${u(first.ball.x)},${u(first.ball.y)}, target ${u(first.tgt.x)},${u(first.tgt.y)}, stars ${first.stars}, hearts ${first.hearts}`);
    for (const r of trace) console.log('     ' + r);
  };
  const shot = () => cam.take(`${name}-${String(k++).padStart(2, '0')}`);
  await shot();
  const end = Date.now() + seconds * 1000;
  // Look and press, in turn, a look every hundredth of a second or so. A
  // picture costs about a tenth — far too long to steer through — so they
  // are taken only at the start (the target whole, before anything) and
  // back to back as the ball comes down onto the target, which is when the
  // pop is. See `camera` for why never during a press.
  while (Date.now() < end) {
    const tl = Date.now();
    const q = await look(hex, W, H, more);
    const now = Date.now(), act = [];
    const row = () => {
      const u = (v) => (v / scale).toFixed(1);
      const dt = (now - prevT) / 1000;
      const v = q.ball && prevQ?.ball ? `v ${u((q.ball.x - prevQ.ball.x) / dt)},${u((q.ball.y - prevQ.ball.y) / dt)}` : 'v ?';
      trace.push(`${String(now - t0).padStart(5)}ms (look ${now - tl}ms) ball ${q.ball ? `${u(q.ball.x)},${u(q.ball.y)}` : '-'} ${v} `
        + `${q.ball && Math.abs(q.ball.y - ground) < 1.5 ? 'GROUND' : 'air'} | target ${q.tgt ? `${u(q.tgt.x)},${u(q.tgt.y)} n${q.tgt.n}` : '-'} `
        + `dx ${q.ball && q.tgt ? u(q.ball.x - q.tgt.x) : '-'} | other ${q.other ? `${u(q.other.x)},${u(q.other.y)} n${q.other.n}` : '-'} `
        + `| stars ${q.stars} hearts ${q.hearts} | ${act.join(' ') || '-'} (${Date.now() - now}ms)`);
      if (q.hearts != null) heartsSeen.push(q.hearts);
      prevQ = q; prevT = now;
    };
    if (!q.tgt || q.tgt.n < 3) { if (++missing >= 2) { row(); break; } } else missing = 0;
    // Three looks running, because the last star can pass behind the ball.
    if (whileStars && q.tgt && (q.stars ? (starless = 0) : ++starless >= 3)) { await hands.hold(null); row(); report('came round'); return 'came round'; }
    if (!q.ball || !q.tgt) { row(); continue; }
    const dx = (q.ball.x - q.tgt.x) / scale;
    // Tolerances in world units. The steering band (4 on the ground, 3 in
    // the air) and jumping only from the target's near side are stomp14's in
    // finish.mjs. Its jump gap is 30 + 40 × lead; 70 is that with lead 1,
    // its default, because a look lags the page by a frame or so. 1.5 CSS
    // pixels is how still the ball's centroid sits on flat ground between
    // looks (chosen; the ball's own bounce is smaller).
    const grounded = Math.abs(q.ball.y - ground) < 1.5;
    if (grounded) {
      const d = dx > 4 ? 'l' : dx < -4 ? 'r' : null;
      await hands.hold(d); act.push(`hold ${d || '-'}`);
      if (dx > 0 && dx < 70 && !jumped) { await hands.tap(); jumped = true; act.push('JUMP'); }
    } else {
      jumped = false;
      const d = dx > 3 ? 'l' : dx < -3 ? 'r' : null;
      await hands.hold(d); act.push(`hold ${d || '-'}`);
      if (q.ball.y > lastY && Math.abs(dx) < 30) {
        for (let i = 0; i < 5; i++) await shot();
        act.push('5 pictures');
      }
    }
    row();
    lastY = q.ball.y;
  }
  await hands.hold(null);
  for (let i = 0; i < after; i++) await shot();
  const result = missing >= 2 ? 'gone' : 'still there';
  const lost = first.hearts > 0 && heartsSeen.some((n) => n < first.hearts * 0.9);
  if (result !== 'gone' || lost) report(`${result}${lost ? ', and a heart was lost' : ''}`);
  return result;
}

/**
 * Every frame the page draws, counted in the page while a stomp is steered:
 * a pop's pieces live a fraction of a second, and a screenshot costs about
 * a tenth, so pictures alone caught a pop on some runs and not others (about
 * one in seven at 740x280, printed by this suite). This counts, on every
 * animation frame, the pop's pieces by their inside (as popPixels does, on
 * every second device pixel) and the popped kind's body, both within REACH
 * of the ball, so a pop cannot fall between two looks.
 */
async function recordStart(popHex, bodyHex, W, H) {
  const [pr, pg, pb] = rgb(popHex), [br, bg, bb] = rgb(bodyHex);
  const reach = REACH * (H / CONFIG.VIEW_H);
  await ev(`(() => {
    const c = document.getElementById('game'), ctx = c.getContext('2d');
    const rec = window.__shellsRec = { frames: [], on: true };
    const frame = () => {
      if (!rec.on) return;
      const w = c.width, h = c.height, d = ctx.getImageData(0, 0, w, h).data;
      const dpr = w / parseFloat(c.style.width);
      let bn = 0, bx = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        if (${IS_BALL}) { bn++; bx += x; }
      }
      let x0 = 2, x1 = w - 2;
      if (bn) { const cx = bx / bn; x0 = Math.max(2, Math.floor(cx - ${reach} * dpr)); x1 = Math.min(w - 2, Math.ceil(cx + ${reach} * dpr)); }
      const P = ${POP_TOL};
      const isP = (i) => Math.abs(d[i] - ${pr}) <= P && Math.abs(d[i + 1] - ${pg}) <= P && Math.abs(d[i + 2] - ${pb}) <= P;
      // The body on EVERY device pixel, as popCheck's count() does on a
      // picture, so "no frame shows both" is as strict as the pictures' own
      // check; the pop on every second, which can only miss a piece, never
      // invent one.
      let pop = 0, body = 0;
      for (let y = 0; y < h; y++) for (let x = Math.max(0, x0 - 2); x < Math.min(w, x1 + 2); x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(d[i] - ${br}) <= 6 && Math.abs(d[i + 1] - ${bg}) <= 6 && Math.abs(d[i + 2] - ${bb}) <= 6) body++;
      }
      for (let y = 2; y < h - 2; y += 2) for (let x = x0; x < x1; x += 2) {
        const i = (y * w + x) * 4;
        if (isP(i) && isP(i - 8) && isP(i + 8) && isP(i - 8 * w) && isP(i + 8 * w)) pop++;
      }
      rec.frames.push([pop, body, bn > 0 ? 1 : 0]);
      requestAnimationFrame(frame);
    };
    // Ordering: the game's loop asked for its animation frame when the page
    // loaded, long before this, and asks again from inside each callback,
    // so in every frame its callback runs first and draws, and this one then
    // reads what it drew. Were the order ever reversed, this would read the
    // frame before — still one whole drawn frame, one frame late, and the
    // body-gone-with-the-pop check would hold all the same.
    requestAnimationFrame(frame);
  })()`);
}
async function recordStop() {
  return ev(`(() => { const r = window.__shellsRec; r.on = false; return JSON.stringify(r.frames); })()`).then((v) => JSON.parse(v));
}
/**
 * The pop, frame by frame: some frame draws its pieces with none of the
 * kind's body, some frame before it still drew the body, and no frame ever
 * draws both — so the body is gone in the very frame the pop appears.
 */
function popFrames(W, H, frames, name, kind) {
  const first = frames.findIndex(([p]) => p > 0);
  const both = frames.filter(([p, b]) => p > 0 && b > 0).length;
  const bodyBefore = first > 0 && frames.slice(0, first).some(([p, b]) => b > 0);
  const around = first < 0 ? '' : frames.slice(Math.max(0, first - 3), first + 4).map(([p, b]) => `${p}/${b}`).join(' ');
  console.log(`   ${name}, every frame drawn: ${frames.length} frames, the pop first in frame ${first}; pop/body around it: ${around}`);
  if (frames.length < 30) fail(`${name} at ${W}x${H}: only ${frames.length} frames were counted, so the frame check means little`);
  if (first < 0) fail(`no frame drawn shows the ${kind}'s pop (${name}) at ${W}x${H}`);
  else if (!bodyBefore) fail(`${name} at ${W}x${H}: no frame before the pop shows the ${kind}'s body`);
  if (both) fail(`${name} at ${W}x${H}: ${both} frame(s) draw the ${kind}'s pop and its body together`);
}

/** Every picture shows the hearts the level began with. */
function heartsHeld(W, H, pics, label) {
  const box = heartBox(W, H);
  const h0 = count([...pics].find(([n]) => n.endsWith('start'))[1], C.STAR_ON, 6, box);
  if (h0 < 50) fail(`${label}: only ${h0} lit heart pixels at the start, so the guard would mean nothing`);
  const lows = [];
  for (const [name, img] of pics) {
    const n = count(img, C.STAR_ON, 6, box);
    if (n < h0 * 0.9) lows.push(`${name} (${n})`);
  }
  console.log(`   lit heart pixels at the start: ${h0}; pictures short of it: ${lows.length ? lows.join(', ') : 'none'}`);
  if (lows.length) {
    fail(`${label}: a heart was lost before ${lows.join(', ')} — the run went wrong, `
         + `so those pictures are not of the moments they are named for (${h0} lit at the start)`);
  }
}

const isBall = new Function('d', 'i', `return ${IS_BALL};`);
/** The part of a picture within REACH of the ball, in CSS pixels, or the whole of it if there is no ball. */
function nearBall(img, W, H) {
  let n = 0, sx = 0;
  for (let i = 0; i < img.d.length; i += 4) if (isBall(img.d, i)) { n++; sx += (i / 4) % img.w; }
  if (!n) return null;
  const x = sx / n / DPR, reach = REACH * (H / CONFIG.VIEW_H);
  return { x0: x - reach, y0: 0, x1: x + reach, y1: H };
}

/**
 * A pop, checked across the pictures of one stomp: none shows its debris
 * beside its kind's body colour, and the first to show the pop is not the
 * first picture. Whether any picture caught the pop is not asked here —
 * popFrames asks it of every frame. Returns the names worth keeping on disk:
 * the last three before the pop and the first five with it, or all of them.
 */
function popCheck(W, H, pics, name, popHex, bodyHex, kind) {
  const rows = [], keep = [];
  let firstPop = -1, i = 0;
  const names = [...pics.keys()].filter((n) => [].concat(name).some((p) => n.startsWith(p + '-')));
  name = [].concat(name).join('+');
  for (const n of names) {
    // Within REACH of the ball, which is where the stomp is: at 740x280 the
    // next room's charger and shell are on screen too, alive and well.
    const img = pics.get(n), box = nearBall(img, W, H), p = popPixels(img, popHex, box), b = count(img, bodyHex, 6, box);
    rows.push(`${p}/${b}`);
    if (p > 0 && firstPop < 0) firstPop = i;
    if (p > 0 && b > 0) fail(`${n} at ${W}x${H}: the ${kind}'s pop is drawn and so are ${b} pixels of a ${kind}'s body`);
    i++;
  }
  console.log(`   ${name}, pop/body pixels picture by picture: ${rows.join(' ')}`);
  // Whether a picture caught the pop is luck (a screenshot is a tenth of a
  // second, the pieces barely more); popFrames holds every drawn frame to it.
  if (firstPop < 0) console.log(`   (no picture of ${name} at ${W}x${H} happened to catch the pop; the frame count above decides)`);
  else if (firstPop === 0) fail(`${name} at ${W}x${H}: the first picture already shows the pop, so nothing shows the ${kind} before it`);
  names.forEach((n, j) => { if (firstPop < 0 || (j >= firstPop - 3 && j < firstPop + 5)) keep.push(n); });
  return keep;
}

for (const [W, H] of SIZES) {
  // --- Level twelve: room A's shell on the plate; room B's shell flipped by the crate.
  {
    const { seen, steps, seconds } = plans[12].pl;
    console.log(`\n${W}x${H}, level 12`);
    const cam = camera(W, H), hands = thumbs(W, H);
    const origin = await openTimed(W, H, 12);
    await blind(origin, hands, cam, steps, [
      { name: '12-start', t: 0.6 },
      { name: '12-roomA-plate', t: seen.plate },
      { name: '12-roomB-flip', t: seen.flip + 0.15 },
      { name: '12-roomB-flipped', t: seen.flip + 0.5 },
    ], seconds);
    await hands.lift();
    const pics = develop(W, H, await cam.done());
    heartsHeld(W, H, pics, `level 12 at ${W}x${H}`);
    // A shell, and on its back or not by its stars: a flipped shell is the
    // only thing on this level that draws CHARGER_STAR. A count of its body
    // alone passed a picture of an upright shell with the crate still on the
    // roof, filed as the flip — found by breaking the route on purpose.
    for (const [name, flipped] of [['12-roomA-plate', false], ['12-roomB-flip', true], ['12-roomB-flipped', true]]) {
      const n = count(pics.get(name), C.SHELL_BODY), stars = count(pics.get(name), C.CHARGER_STAR);
      console.log(`   ${name}: ${n} SHELL_BODY pixels, ${stars} of its stars`);
      if (!(n > 0)) fail(`no shell in ${name} at ${W}x${H}`);
      if (flipped && !(stars > 0)) fail(`the shell in ${name} at ${W}x${H} is not on its back: no stars`);
      if (!flipped && stars > 0) fail(`stars in ${name} at ${W}x${H}, where the shell walks the plate upright: the star count would mean nothing`);
    }
  }

  // --- Level thirteen: room B's popper mid-aim and mid-lob.
  {
    const { steps, seconds } = plans[13].pl;
    // The camera depends on the screen, so what is in view is asked per screen.
    const { seen } = plan13(plans[13].data, steps, [W, H]);
    console.log(`\n${W}x${H}, level 13`);
    console.log(`   Node: ${seen.dotsInView} of ${CONFIG.ENEMY.POPPER.ARC_DOTS} arc dots in view mid-aim, the arc's top ${seen.arcAbove} units above the screen's; `
                + `the lob in view for ${seen.lobShownFor?.toFixed(2)}s of its ${seen.flight}s flight, longest from ${seen.lobIn0?.toFixed(2)} to ${seen.lobIn1?.toFixed(2)}`);
    if (!seen.cameraStill) fail(`level 13 at ${W}x${H}: the camera moves between the frame before the aim and the aim, so the arc's dots cannot be told from the scenery`);
    const cam = camera(W, H), hands = thumbs(W, H);
    const origin = await openTimed(W, H, 13);
    const held13 = await blind(origin, hands, cam, steps, [
      { name: '13-start', t: 0.6 },
      { name: '13-roomB-before', t: seen.aim0 - 0.15 },
      { name: '13-roomB-aim', t: seen.aimMid },
      { name: '13-roomB-lob', t: (seen.lobIn0 + seen.lobIn1) / 2, window: [seen.lobIn0, seen.lobIn1] },
    ], seconds);
    await hands.lift();
    // The lob moves with the presses (see lobWindow): late by half its
    // window, and the picture taken at Node's moment could miss it.
    if (held13 > lobWindow / 2 * 1000) fail(`level 13 at ${W}x${H}: a press went ${held13.toFixed(0)}ms late, more than half the lob's ${(lobWindow * 1000).toFixed(0)}ms window`);
    const pics = develop(W, H, await cam.done());
    heartsHeld(W, H, pics, `level 13 at ${W}x${H}`);
    const before = pics.get('13-roomB-before'), aim = pics.get('13-roomB-aim'), lob = pics.get('13-roomB-lob');
    const a = arcDots(aim, before, W, H);
    console.log(`   aim arc: ${a.dots} dots drawn (${a.blobs} new near-white blobs; a dot is ~${a.dotArea} device px), ${seen.dotsInView} expected in view`);
    // Every dot the camera has in view must be drawn — and that has to be a
    // real number of dots, or this proves nothing.
    // More than six, as the plan for this suite asks: an arc of two or three
    // dots under a popper that is itself off the top of the screen is not
    // an aim a child can read.
    if (!(seen.dotsInView > 6)) fail(`level 13 at ${W}x${H}: only ${seen.dotsInView} of the arc's ${CONFIG.ENEMY.POPPER.ARC_DOTS} dots are in view mid-aim`);
    if (!(a.dots > 6)) fail(`level 13 at ${W}x${H}: only ${a.dots} of the arc's dots are drawn on screen mid-aim`);
    if (a.dots < seen.dotsInView) fail(`the aim arc shows ${a.dots} dots at ${W}x${H}, where ${seen.dotsInView} are in view`);
    if (a.dots > seen.dotsInView) fail(`the aim arc counts ${a.dots} dots at ${W}x${H}, more than the ${seen.dotsInView} in view: the count is finding something else`);
    // The lob's steel by its inside, as a pop is counted: a few pixels of
    // anti-aliased edge elsewhere come out SPIKE-coloured too.
    const steelBefore = popPixels(before, C.SPIKE, null, 6), steel = popPixels(lob, C.SPIKE, null, 6);
    console.log(`   the lob's steel: ${steel} pixels mid-lob, ${steelBefore} before it`);
    if (steelBefore > 0) fail(`${steelBefore} lob-coloured pixels before any lob at ${W}x${H}: the lob count would mean nothing`);
    if (!(steel > 0)) fail(`no lob in the air in 13-roomB-lob at ${W}x${H}`);
  }

  // --- Level fourteen: the dash meets the shell; room A's shell popped;
  // room B's dazed charger popped.
  {
    const { seen, steps, seconds } = plans[14].pl;
    console.log(`\n${W}x${H}, level 14`);
    const cam = camera(W, H), hands = thumbs(W, H);
    const origin = await openTimed(W, H, 14);
    const dash = [];
    for (let k = 0; k < 6; k++) dash.push({ name: `14-dash-${k}`, t: seen.dash - 0.2 + k * 0.1 });
    await blind(origin, hands, cam, steps, [{ name: '14-start', t: 0.6 }, ...dash], seconds);
    await recordStart(C.SHELL_POP, C.SHELL_BODY, W, H);
    const poppedA = await stompLive(hands, cam, C.SHELL_BODY, '14-shellpopA', W, H);
    const framesA = await recordStop();
    if (poppedA !== 'gone') fail(`room A's shell was not stomped at ${W}x${H}: ${poppedA}`);
    if (!await rollToRest(hands, 'r')) fail(`the ball never came to rest at room B's door at ${W}x${H}`);
    await hands.hold(null);
    if (!await waitForStars()) fail(`room B's charger never dashed at ${W}x${H}`);
    // Room B's charger, dazed by its dash into the shell, stomped while it
    // is dazed — only while, which its stars say: one that has come round
    // is not stompable, and steering at it then costs a heart. The ball
    // rolls through the flipped shell on the way, which is harmless. Room
    // A has already shown a shell's pop, so room B's shell is left alone:
    // going for both in the daze's 3.5s was tried, shell first and charger
    // first, and one of the two had always come round by the time the ball
    // got to it. One landing can still take both, as finish.mjs's 3r does
    // on purpose; that is said if it happens.
    await recordStart(C.CHARGER_POP, C.CHARGER_BODY, W, H);
    const poppedC = await stompLive(hands, cam, C.CHARGER_BODY, '14-chargerpop', W, H, { whileStars: true });
    const framesC = await recordStop();
    if (poppedC !== 'gone') fail(`room B's dazed charger was not stomped at ${W}x${H}: ${poppedC}`);
    cam.take('14-end');
    await hands.lift();
    const taken = await cam.done();
    const pics = develop(W, H, taken, () => false);
    heartsHeld(W, H, pics, `level 14 at ${W}x${H}`);
    const both = dash.filter((s) => count(pics.get(s.name), C.SHELL_BODY) > 0 && count(pics.get(s.name), C.CHARGER_BODY) > 0);
    console.log(`   the dash: ${both.length} of ${dash.length} pictures show the charger and the shell together`);
    if (!both.length) fail(`no picture of the dash shows both the charger and the shell at ${W}x${H}`);
    for (const s of [{ name: '14-start' }, ...dash]) {
      const a = popPixels(pics.get(s.name), C.SHELL_POP), b = popPixels(pics.get(s.name), C.CHARGER_POP);
      if (a || b) fail(`${s.name} at ${W}x${H}, before any pop, counts ${a} shell-pop and ${b} charger-pop pixels: the pop counts would mean nothing`);
    }
    const keep = new Set(['14-start', '14-end', ...dash.map((s) => s.name),
      ...popCheck(W, H, pics, '14-shellpopA', C.SHELL_POP, C.SHELL_BODY, 'shell'),
      ...popCheck(W, H, pics, '14-chargerpop', C.CHARGER_POP, C.CHARGER_BODY, 'charger')]);
    popFrames(W, H, framesA, '14-shellpopA', 'shell');
    popFrames(W, H, framesC, '14-chargerpop', 'charger');
    const alsoShell = [...pics.keys()].filter((n) => n.startsWith('14-chargerpop-')).some((n) => popPixels(pics.get(n), C.SHELL_POP, nearBall(pics.get(n), W, H)) > 0);
    if (alsoShell) console.log('   the same landing popped the shell in room B too');
    develop(W, H, taken.filter((t) => keep.has(t.name)));
  }
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nSHELLS AND POPPERS DRAWN');
process.exit(failures ? 1 : 0);
