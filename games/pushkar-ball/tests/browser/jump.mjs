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

// --- 3. driven along the flat, the ball keeps going and stays in the world -
//
// The window is derived from the level, and the derivation matters, because the
// obvious one is wrong. This used to run until just before the level's first
// gap, on the reasoning that the ball cannot cover that distance faster than
// MAX_SPEED. It can. MAX_SPEED only clamps the acceleration the player asks
// for — a slope adds to vx underneath that clamp — so the ramp down towards
// the gap throws the ball past 420px/s and it arrives EARLY. It then fell in
// and respawned, and the last sample caught it back at the spawn, so a test of
// "did the ball make progress" answered with about zero. It passed for two
// phases on the timing of whichever machine ran it.
//
// So the window is the FLAT stretch only, where MAX_SPEED genuinely is the cap
// because there is no slope to beat it. `flatEnd` is where the first polyline
// stops being level, asked of the level rather than typed here.
//
// No jumping during it, and that is deliberate too. Hammering jump up the ramp
// throws the ball clear off the TOP of the screen — the camera follows
// vertically on purpose slowly — and ballAt cannot tell a ball above the
// viewport from one that has left the world. Neither is a bug, so neither
// belongs in an assertion.
const g = LEVELS[0].ground;
const gapFrom = g[0][g[0].length - 1][0];
const gapTo = g[1][0][0];
const flatEnd = g[0][1][0];
const onFlat = ((flatEnd - LEVELS[0].spawn.x) / CONFIG.MAX_SPEED) * 0.9;
console.log(`\n3. the level's first gap is ${gapTo - gapFrom}px wide; the flat runs out at` +
            ` ${flatEnd}, which at MAX_SPEED is ${(onFlat / 0.9).toFixed(2)}s away`);

await sleep(1500);
const samples = Math.max(6, Math.floor(onFlat * 1000 / 100));
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
if (lost) fail(`the ball vanished for ${lost} of ${samples} samples while being driven along flat ground`);
else console.log(`   driven right for ${(samples / 10).toFixed(1)}s, visible in every one of ${samples} samples`);

// And it must actually have gone somewhere.
//
// Measured across the SCREEN, which only says anything while the camera is
// still pinned to the left edge of the level — once it starts following, the
// ball sits near the middle by definition and its screen position stops
// moving however fast it travels. That is fine here and only here: the camera
// is clamped for the first two thirds of this window, so a ball that is
// really rolling crosses about 270px of screen, and one that is wedged or
// deaf to the button crosses none. Do not extend this window thinking it
// makes the check stronger; past the clamp it measures nothing at all.
if (first && last && last.x - first.x < 60) {
  fail(`driven right for ${(samples / 10).toFixed(1)}s and the ball only moved ${(last.x - first.x).toFixed(0)}px across the screen`);
} else if (last) {
  console.log(`   and travelled ${(last.x - first.x).toFixed(0)}px across the screen before the camera took over`);
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
