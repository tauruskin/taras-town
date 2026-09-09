// Falling in a hole in a real browser, and coming back from it.
//
// The offline suite proves the arithmetic. This proves the whole thing is
// wired up: that the ball really does leave the screen, really does come back,
// and comes back somewhere sensible — none of which the offline suite can see,
// because it has no screen.
import { connect, boot, ballAt } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'deflate';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');
const { CONFIG } = await import('../../js/config.js');
const { LEVELS } = await import('../../js/levels.js');

const W = 844, H = 390;
const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

await boot(cdp, URL, W, H);
const RIGHT = Buttons.right(W, H);

const start = await ballAt(ev);
if (!start) {
  for (const p of problems) console.log('  ' + p);
  console.log('  FAIL: no ball on the canvas to begin with');
  process.exit(1);
}
console.log(`\n1. ball at ${start.x.toFixed(0)},${start.y.toFixed(0)}`);

// Drive right until the ball vanishes. The level's first gap is where it will
// go; the time allowed comes from the level and MAX_SPEED rather than being
// typed, so a level change reports the new truth.
//
// A budget, though, and NOT a derivation — MAX_SPEED clamps only the
// acceleration the player asks for, so a slope adds to vx underneath it and
// the ball can arrive early. That is harmless here, because nothing below
// asserts a position from this number; it only says how long to keep holding
// the button before giving up. See jump.mjs's check 3 for where assuming
// otherwise cost two phases of a test that measured nothing.
const g = LEVELS[0].ground;
const gapFrom = g[0][g[0].length - 1][0];
const allowed = ((gapFrom - LEVELS[0].spawn.x) / CONFIG.MAX_SPEED) * 2.5;
console.log(`\n2. driving right; the first gap is at ${gapFrom}, so allowing ${allowed.toFixed(1)}s`);

await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
let goneAt = -1;
const samples = Math.round(allowed * 10);
for (let i = 0; i < samples; i++) {
  await sleep(100);
  if (!(await ballAt(ev))) { goneAt = i; break; }
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

if (goneAt < 0) fail('the ball never fell into the gap, so nothing was tested');
else console.log(`   the ball left the screen after ${(goneAt / 10).toFixed(1)}s`);
await shoot('1-gone');

// It must come back, and quickly. The deflate plus the inflate is the whole
// budget; anything much longer than that is a freeze rather than a setback.
const budget = (CONFIG.DEFLATE.TIME + CONFIG.DEFLATE.INFLATE) * 1000 + 1200;
let back = null;
for (let waited = 0; waited < budget && !back; waited += 100) {
  await sleep(100);
  back = await ballAt(ev);
}

if (!back) fail(`the ball never came back within ${(budget / 1000).toFixed(1)}s of falling`);
else {
  console.log(`\n3. it came back at ${back.x.toFixed(0)},${back.y.toFixed(0)} (it started at ${start.x.toFixed(0)},${start.y.toFixed(0)})`);
  // Level one has no checkpoints before its first gap, so home is still the
  // spawn and the ball must be back roughly where it began.
  if (Math.abs(back.x - start.x) > 120) {
    fail(`it came back at x=${back.x.toFixed(0)}, nowhere near where it started, ${start.x.toFixed(0)}`);
  }
}
await shoot('2-back');

// And it is playable: holding right moves it again.
//
// Measured across the SCREEN, which only says anything while the camera is
// still clamped to the left edge of the level — and just after a respawn at
// the spawn it is. If this ever reads marginal, do not simply widen the 60:
// read jump.mjs's check 3 first, because past the clamp the ball's screen
// position stops moving however fast it travels, and the check would be
// measuring nothing at all.
const before = await ballAt(ev);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
await sleep(900);
const after = await ballAt(ev);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
if (!after) fail('lost the ball again while checking it still rolls');
else if (after.x - before.x < 60) fail(`after coming back the ball only moved ${(after.x - before.x).toFixed(0)}px`);
else console.log(`\n4. and it rolls again: ${(after.x - before.x).toFixed(0)}px right`);

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nDEFLATING AND COMING BACK LOOKS RIGHT');
process.exit(failures ? 1 : 0);
