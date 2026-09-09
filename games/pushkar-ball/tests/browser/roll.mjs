// Does the ball roll, does it spin while it rolls, and does it stop?
import { connect, boot, ballAt, makeHold, IS_BALL } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'roll';
const PORT = Number(process.argv[4] || 9335);

// Asked of the game, never written down here. A button coordinate typed into a
// test fails silently — the tap lands on the world behind and something passes
// or fails for the wrong reason.
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
if (!start) {
  // Anything the page threw is printed BEFORE giving up. When the ball is
  // missing entirely the usual cause is that a module failed to load or the
  // draw threw on its first frame, and that exception is the whole answer —
  // exiting without it turns a one-line diagnosis into an afternoon.
  for (const p of problems) console.log('  ' + p);
  console.log('  FAIL: no red ball anywhere on the canvas');
  process.exit(1);
}
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
//
// Centred on the ball using the SAME test ballAt uses, from _helpers.mjs. When
// this had its own looser copy of that test, the centre landed on the crate
// wall instead and the patch was a crop of motionless scenery — which reported
// a ball that rolled without turning while the ball was in fact turning fine.
const patch = () => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (${IS_BALL}) {
      const p = i / 4; sx += p % c.width; sy += Math.floor(p / c.width); n++;
    }
  }
  if (!n) return null;
  const cx = Math.round(sx / n), cy = Math.round(sy / n), r = 26;
  const box = g.getImageData(cx - r, cy - r, r * 2, r * 2).data;
  return Array.from(box).filter((_, i) => i % 4 === 0);
})()`);

/** Mean absolute difference between two patches, per pixel. */
const differ = (a, b) => {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
};

// Rolling: the marks must move.
//
// Sampled fast, and compared across several different gaps, because the ball's
// two marks sit opposite each other and so its pattern repeats every HALF
// turn. At full speed the ball turns vx/r = 21 rad/s, which is 2.52 rad in
// 120ms — only 36 degrees short of that half turn, so two samples 120ms apart
// land almost on top of one another and a fast, plainly spinning ball reads as
// one that is not turning at all. Six samples at 50ms give effective gaps of
// 0.84, 1.68 and 2.52 rad, and no single rotation speed can alias against all
// three at once.
const spin = [];
{
  const send = cdp.send;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
  for (let i = 0; i < 6; i++) { await sleep(50); spin.push(await patch()); }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
let spinChange = 0;
for (let gap = 1; gap <= 3; gap++) {
  for (let i = 0; i + gap < spin.length; i++) {
    spinChange = Math.max(spinChange, differ(spin[i], spin[i + gap]));
  }
}
if (!Number.isFinite(spinChange)) fail('could not read the ball while it was rolling');
else if (spinChange < 4) fail(`the ball rolled without turning (patch changed by ${spinChange.toFixed(2)})`);
else console.log(`\n3. spinning: patch changed by ${spinChange.toFixed(1)} at its most`);

// --- 4. it rolls to a stop ------------------------------------------------
await sleep(3000);
const a = await ballAt(ev);
await sleep(700);
const b = await ballAt(ev);
if (!a || !b) fail('lost the ball while waiting for it to stop');
else if (Math.abs(b.x - a.x) > 6) fail(`ball never stopped: still moving ${(b.x - a.x).toFixed(1)}px per 700ms`);
else console.log('\n4. rolled to a stop');
await shoot('3-stopped');

// --- 5. and left works too, all the way back to the wall ------------------
//
// Driven left until it stops rather than for a fixed moment, and compared
// against where it SPAWNED rather than against where it happens to be now.
// Both of those are deliberate, because a fixed hold here is not a test of
// anything: while the camera is still following the ball, the ball stays near
// the middle of the screen by definition, so its screen position says almost
// nothing about how far it has actually gone. Worse, the camera looks ahead in
// the direction of travel, so for the first fraction of a second of rolling
// left the ball drifts very slightly RIGHT on screen. A 700ms hold measured
// 18px of travel one run and 36px the next, against a 20px threshold — a coin
// toss dressed up as an assertion.
//
// Driving it into the left wall removes the camera from the question. The
// camera cannot show anything outside the level, so once it is pinned against
// the left edge, screen position means world position again, and the ball ends
// at a fixed place — against the wall, left of where it spawned — every time.
const before = await ballAt(ev);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: LEFT.x, y: LEFT.y, id: 1 }] });
let after = before, stalled = 0;
for (let i = 0; i < 45 && stalled < 3; i++) {
  await sleep(100);
  const now = await ballAt(ev);
  if (!now) break;
  stalled = Math.abs(now.x - after.x) < 2 ? stalled + 1 : 0;
  after = now;
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

if (!after) fail('lost the ball while rolling left');
else if (after.x >= start.x - 40) {
  fail(`driven left from ${before.x.toFixed(0)}, the ball came to rest at ${after.x.toFixed(0)},` +
       ` which is not past where it spawned (${start.x.toFixed(0)})`);
} else {
  console.log(`\n5. driven left from ${before.x.toFixed(0)}, came to rest against the wall at` +
              ` ${after.x.toFixed(0)}, past its spawn at ${start.x.toFixed(0)}`);
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nROLLING LOOKS RIGHT');
process.exit(failures ? 1 : 0);
