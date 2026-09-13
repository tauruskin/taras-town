// Bounce pads: landing on one launches the ball immediately, with no button
// press and no resting state. Every top contact bounces; nothing stands on
// a trampoline.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({ left: false, right: false, takeJump: () => false });

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

const GROUND_Y = 760;

/**
 * Flat ground with one pad on it, flush with the ground — `y` is the same
 * ground-anchor convention checkpoints and spikes already use, so a pad
 * placed at `{x, y: GROUND_Y, w}` sits exactly on a floor at GROUND_Y with
 * no step to climb.
 */
const world = (extra) => loadLevel({
  id: 98, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, GROUND_Y], [2000, GROUND_Y]]],
  boxes: [], platforms: [],
  pads: [{ x: 700, y: GROUND_Y, w: CONFIG.BOUNCE.W }],
  ...extra,
});

// --- 1. the loader builds a pad -------------------------------------------
{
  const level = world();
  console.log(`\n1. the level has ${level.pads.length} pad(s)`);
  if (level.pads.length !== 1) fail(`expected 1 pad, got ${level.pads.length}`);
  if (!level.pads[0].bounce) fail('a pad was built without its own bounce marker');
}

// --- 2. landing on top launches the ball, instantly, touching only vy ----
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);   // settle on the ground
  input.right = true;
  // By x=700 the ball has long since reached MAX_SPEED (420) from a standing
  // start 500 units back — v²/(2*ACCEL) = 420²/3200 = 55px of runway is all
  // it needs — so vx should already be flat against the cap and untouched
  // by the bounce, not still accelerating.
  let bounced = false, vxPrev = 0;
  for (let i = 0; i < Math.round(3.0 / CONFIG.STEP) && !bounced; i++) {
    level.update(CONFIG.STEP);
    vxPrev = ball.vx;
    ball.update(CONFIG.STEP, input, level);
    if (ball.vy <= -CONFIG.BOUNCE.V + 1) bounced = true;
  }
  if (!bounced) fail('2: the ball never bounced, so nothing below was tested');
  else {
    console.log(`\n2. bounced: vy=${ball.vy.toFixed(0)}, grounded=${ball.grounded}, ` +
                `platform=${!!ball.platform}, vx before/after=${vxPrev.toFixed(0)}/${ball.vx.toFixed(0)}`);
    if (Math.abs(ball.vy - (-CONFIG.BOUNCE.V)) > 1) fail(`vy is ${ball.vy.toFixed(1)}, expected exactly ${-CONFIG.BOUNCE.V}`);
    if (ball.grounded) fail('the ball reads as grounded the instant it bounced');
    if (ball.platform) fail('the ball is still carrying a platform reference right after bouncing');
    if (Math.abs(ball.vx - vxPrev) > 2) fail(`horizontal speed changed from ${vxPrev.toFixed(0)} to ${ball.vx.toFixed(0)} — a bounce must only touch vy`);
  }
}

// --- 3. it never becomes a resting place -----------------------------------
//
// Dropped straight down onto it, with no horizontal input to carry it away,
// the ball must keep bouncing rather than settle — "stand on a trampoline
// safely" is not how one behaves and would be a strange thing to teach.
{
  const level = world();
  const input = stub();
  const padMidX = level.pads[0].x + level.pads[0].w / 2;
  const ball = new Ball(padMidX, 300);
  let everGroundedOnPad = false;
  for (let i = 0; i < Math.round(6.0 / CONFIG.STEP); i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    if (ball.grounded && Math.abs(ball.x - padMidX) < level.pads[0].w) everGroundedOnPad = true;
  }
  console.log(`\n3. dropped straight onto the pad for 6s: ever came to rest on it = ${everGroundedOnPad}`);
  if (everGroundedOnPad) fail('the ball came to rest on top of the pad instead of bouncing again');
}

// --- 4. a stray coyote window cannot weaken the bounce ----------------------
//
// player.js resets coyote to 0 on a bounce for exactly this reason: without
// it, a jump pressed a step later could still fire (coyote was set to
// CONFIG.COYOTE the very frame the bounce happened, before being cleared)
// and overwrite the bounce's vy with the far weaker JUMP_V.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);
  input.right = true;
  let bounced = false;
  for (let i = 0; i < Math.round(3.0 / CONFIG.STEP) && !bounced; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    if (ball.vy <= -CONFIG.BOUNCE.V + 1) bounced = true;
  }
  if (!bounced) fail('4: the ball never bounced, so nothing was tested');
  else {
    console.log(`\n4. coyote right after the bounce: ${ball.coyote}`);
    if (ball.coyote !== 0) fail(`coyote is ${ball.coyote} right after a bounce, expected exactly 0`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BOUNCE PAD CHECKS PASSED');
process.exit(failures ? 1 : 0);
