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
  // Level one has a checkpoint immediately before its first gap, which the
  // drive right has just rolled through, so home is that flag and not the
  // spawn. It is far from the level's left edge, so the camera is not clamped
  // there: it snaps to the ball on arrival, and a snapped camera with a ball
  // at rest puts the ball in the exact middle of the screen, sideways. That
  // is a sharper question than "near the start" was — a camera still gliding
  // over from the hole would put the ball somewhere else.
  //
  // This used to assert the ball came back where it began, which was only
  // true while level one had no checkpoints; they arrived in Task 6.
  const cp = LEVELS[0].checkpoints?.find((c) => c.x < gapFrom);
  if (!cp) fail('level one has no checkpoint before its first gap, so the check below is asking the wrong question');
  else console.log(`   home is the checkpoint at ${cp.x}, before the gap at ${gapFrom}`);
  if (Math.abs(back.x - W / 2) > 30) {
    fail(`it came back at x=${back.x.toFixed(0)}; a camera snapped to a ball at its checkpoint puts it at ${W / 2}`);
  }
}
// Caught mid-inflate, most likely, since the poll above stops the instant any
// ball pixel appears and the swell takes DEFLATE.INFLATE to finish. Kept for
// exactly that reason: it is the one shot that shows the swell happening.
await shoot('2-back');

// And the swell must FINISH. This is the check the offline suite cannot make
// and a screenshot alone will not enforce: a ball left permanently at
// INFLATE_FROM is still a ball at the right place with the right hue, so every
// other assertion here passes while the hero is drawn a quarter size for the
// rest of the level. Pixel COUNT is what notices, and ballAt already returns
// it.
await sleep(CONFIG.DEFLATE.INFLATE * 1000 + 700);
const settled = await ballAt(ev);
if (!settled) fail('the ball disappeared again while its inflate was finishing');
else {
  const ratio = settled.pixels / start.pixels;
  console.log(`\n4. once settled it is ${settled.pixels} pixels against ${start.pixels} at the start` +
              ` — ${(ratio * 100).toFixed(0)}% of full size`);
  if (Math.abs(ratio - 1) > 0.1) {
    fail(`the ball settled at ${(ratio * 100).toFixed(0)}% of its starting size,` +
         ` so the inflate did not finish (or overshot)`);
  }
}
// The one for a human to look at. Task 7's look-at-it pass wants a settled
// ball at full size, which the mid-inflate shot above cannot show.
await shoot('3-settled');

// And it is playable: holding a direction moves it again.
//
// LEFT, away from the gap: home is now 100px short of it, and holding right
// would drop the ball straight back in. And measured by the camera's
// LOOKAHEAD, because the camera is not clamped here and follows the ball, so
// the ball's screen position says nothing about how far it went — see
// jump.mjs's check 3 for what assuming otherwise cost. What it does say is
// how FAST it is going: at full speed the ball settles off-centre by a fixed
// amount, derived below.
//
// NOT `LOOKAHEAD * MAX_SPEED`. That treats `camera.x` as though it snapped
// straight to its target every step, but `update` LERPS toward
// `ball.x + vx*LOOKAHEAD` at rate `LERP`, and a lerp chasing a target moving
// at a steady velocity never catches up — it settles into a constant lag of
// `vx / LERP` behind whatever it is chasing. So at full speed the camera
// itself trails the moving target by `MAX_SPEED / LERP`, and what is left of
// the lookahead once that lag is subtracted is the ball's actual steady-state
// offset from screen centre: `(LOOKAHEAD - 1/LERP) * MAX_SPEED`, in world
// units, times `scale` for screen pixels. With today's numbers that is about
// 68px, not the roughly 106px the naive instant-snap formula gives — and this
// derivation is the reason: get the model wrong and the threshold is wrong by
// 2x while looking perfectly reasonable, which is exactly the "test is wrong
// about the harness" trap CLAUDE.md warns about. If LOOKAHEAD or LERP is
// retuned, this number moves with it; a fixed pixel figure here would not.
//
// A generous safety fraction (0.8) on top, since 900ms may not be quite long
// enough to fully settle and the steady-state formula is itself a limit.
const LEFT = Buttons.left(W, H);
const before = await ballAt(ev);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: LEFT.x, y: LEFT.y, id: 1 }] });
await sleep(900);
const after = await ballAt(ev);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const C = CONFIG.CAMERA;
const steadyLead = (C.LOOKAHEAD - 1 / C.LERP) * CONFIG.MAX_SPEED * (H / CONFIG.VIEW_H);
if (!after) fail('lost the ball again while checking it still rolls');
else if (after.x - before.x < steadyLead * 0.8) {
  fail(`after coming back, holding left put the ball only ${(after.x - before.x).toFixed(0)}px right of where it was; the camera's steady-state lag at full speed puts it about ${steadyLead.toFixed(0)}px`);
} else console.log(`\n5. and it rolls again: the camera leads it by ${(after.x - before.x).toFixed(0)}px, about ${steadyLead.toFixed(0)} at full speed`);

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nDEFLATING AND COMING BACK LOOKS RIGHT');
process.exit(failures ? 1 : 0);
