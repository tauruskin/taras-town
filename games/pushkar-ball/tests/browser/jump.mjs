// The jump: does it lift the ball, does one press stay one jump, and does the
// ball keep going and stay in the world when it is driven right for as long as
// the level guarantees there is ground under it?
import { connect, boot, ballAt, makeHold } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'jump';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');
const { CONFIG } = await import('../../js/config.js');
const { LEVELS } = await import('../../js/levels.js');

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

// --- 3. driven right, the ball keeps going and stays in the world --------
//
// The window this asserts over is derived from the level, not typed in. The
// gap starts at `gapFrom`, so for the ball to fall into it the ball must first
// travel gapFrom - spawn.x, and it cannot do that faster than MAX_SPEED — it
// has a ramp to climb on the way, which only slows it down. So MAX_SPEED gives
// a LOWER bound on the time before the gap can possibly be reached, and inside
// that window a ball that vanishes has not fallen down a hole: it has tunnelled
// through the ground, got wedged, or gone NaN. Four times in Taras Town a suite
// failed because a fixed allowance met a world that had grown; asking the level
// for the number instead means this reports the new truth rather than an old one.
//
// No jumping during the window, and that is deliberate too. Hammering jump up
// the ramp throws the ball clear off the TOP of the screen — the camera follows
// vertically on purpose slowly — and ballAt cannot tell a ball that is above
// the viewport from one that has left the world. Neither is a bug, so neither
// belongs in an assertion.
const g = LEVELS[0].ground;
const gapFrom = g[0][g[0].length - 1][0];
const gapTo = g[1][0][0];
const preGap = (gapFrom - LEVELS[0].spawn.x) / CONFIG.MAX_SPEED;
console.log(`\n3. the level's first gap is ${gapTo - gapFrom}px wide, and the ball` +
            ` cannot reach it in under ${preGap.toFixed(1)}s`);

await sleep(1500);
const samples = Math.floor((preGap * 0.95) * 1000 / 100);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
let lost = 0, first = null, last = null;
for (let i = 0; i < samples; i++) {
  await sleep(100);
  const b = await ballAt(ev);
  if (!b) { lost++; continue; }
  if (!first) first = b;
  last = b;
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
if (lost) fail(`the ball vanished for ${lost} of ${samples} samples while being driven right, before the gap could possibly be reached`);
else console.log(`   driven right for ${(samples / 10).toFixed(1)}s, visible in every one of ${samples} samples`);

// And it must actually have gone somewhere. Wedged against the ramp is the
// failure this catches, and it looks nothing like vanishing: the ball stays
// perfectly visible and perfectly still.
if (first && last && last.x - first.x < 40) {
  fail(`driven right for ${(samples / 10).toFixed(1)}s and the ball only moved ${(last.x - first.x).toFixed(0)}px across the screen`);
} else if (last) {
  console.log(`   and travelled ${(last.x - first.x).toFixed(0)}px across the screen while the camera followed`);
}

// --- 4. and it survives being driven right WHILE jumping -----------------
//
// Reported, not asserted, for the reason above: with jump hammered the ball
// leaves the top of the screen and may legitimately drop into the gap, since
// phase 1 has no respawn. What this is still good for is exceptions and NaN,
// which `problems` collects, and the screenshot, which is what the eye judges.
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
let seen = 0;
for (let i = 0; i < 40; i++) {
  await sleep(100);
  if (await ballAt(ev)) seen++;
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }, { x: JUMP.x, y: JUMP.y, id: 2 }],
  });
  await sleep(60);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: RIGHT.x, y: RIGHT.y, id: 1 }] });
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
console.log(`\n4. driven right with jump hammered for 6s: ball in view for ${seen} of 40 samples`);
await shoot('2-after-the-run');

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nJUMPING LOOKS RIGHT');
process.exit(failures ? 1 : 0);
