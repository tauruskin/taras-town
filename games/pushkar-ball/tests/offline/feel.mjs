// The forgiveness. Coyote time, jump buffering, and moving platforms carrying a
// rider — three things nobody notices when they work and everybody feels when
// they do not.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

/** A stand-in for input.js, so none of this needs a browser or an event loop. */
const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

/** A one-off flat level whose ground ends at `edge`, so a ball can roll off it. */
const flat = (edge = 1200) => loadLevel({
  id: 99, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [edge, 760]]],
  boxes: [],
  platforms: [],
});

const run = (ball, level, input, seconds, each) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    if (each) each(i * CONFIG.STEP);
  }
};

// --- 1. rolling and stopping ---------------------------------------------
console.log('\n1. rolling');
{
  const level = flat(4000);
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const input = stub();
  run(ball, level, input, 0.6);           // let it settle

  input.right = true;
  run(ball, level, input, 1.5);
  if (ball.vx < CONFIG.MAX_SPEED * 0.9) fail(`held right for 1.5s and only reached ${ball.vx.toFixed(0)} px/s`);
  if (ball.vx > CONFIG.MAX_SPEED + 1) fail(`ball exceeded its own top speed: ${ball.vx.toFixed(0)}`);
  if (Math.abs(ball.spin) < 1) fail('the ball rolled without turning');

  input.right = false;
  run(ball, level, input, 2.5);
  if (Math.abs(ball.vx) > 12) fail(`ball did not roll to a stop: still ${ball.vx.toFixed(1)} px/s`);
  console.log(`   reached ${CONFIG.MAX_SPEED} px/s, spun ${ball.spin.toFixed(1)} rad, rolled to a stop`);
}

// --- 2. coyote time ------------------------------------------------------
//
// A jump asked for just after the edge should still work. This is the single
// cheapest thing that stops a platformer feeling stiff.
console.log('\n2. coyote time');
{
  const afterEdge = (delay) => {
    const level = flat(1200);
    const ball = new Ball(1000, 600);
    const input = stub();
    run(ball, level, input, 0.6);
    input.right = true;
    let airborne = -1;
    run(ball, level, input, 2.5, () => {
      // Start the clock the moment the ball leaves the ground for good.
      if (!ball.grounded && airborne < 0) airborne = 0;
      else if (airborne >= 0) airborne += CONFIG.STEP;
      if (airborne >= delay && !ball.jumped && !input._jump && airborne < delay + CONFIG.STEP * 2) {
        input.press();
      }
    });
    return ball;
  };

  const forgiven = afterEdge(CONFIG.COYOTE * 0.4);
  if (!forgiven.everJumped) fail(`a jump ${(CONFIG.COYOTE * 0.4).toFixed(2)}s after the edge was refused`);

  const tooLate = afterEdge(CONFIG.COYOTE * 4);
  if (tooLate.everJumped) fail(`a jump ${(CONFIG.COYOTE * 4).toFixed(2)}s after the edge was allowed — that is a double jump`);
  console.log(`   within ${CONFIG.COYOTE}s forgiven, well after it refused`);
}

// --- 3. jump buffering ---------------------------------------------------
console.log('\n3. jump buffering');
{
  const level = flat(4000);
  const ball = new Ball(600, 600);
  const input = stub();
  run(ball, level, input, 0.8);
  const restY = ball.y;

  ball.vy = -CONFIG.JUMP_V;               // put it in the air
  let pressed = false, jumpedAfter = false;
  run(ball, level, input, 2, () => {
    // Press while still falling and close enough to the ground to be remembered
    // — but not so close that it lands in the same step and needs no buffer.
    if (!pressed && ball.vy > 0 && restY - ball.y < 30 && restY - ball.y > 6) {
      input.press();
      pressed = true;
    }
    if (pressed && ball.jumped) jumpedAfter = true;
  });
  if (!pressed) fail('the test never got close enough to the ground to press early');
  else if (!jumpedAfter) fail('a press just before landing was forgotten instead of buffered');
  else console.log(`   a press within ${CONFIG.BUFFER}s of landing fires on landing`);
}

// --- 4. holding jump is not a double jump --------------------------------
//
// takeJump consumes a PRESS. If it reported "held" instead, the ball would
// bounce up the moment it touched anything, for ever.
console.log('\n4. one press, one jump');
{
  const level = flat(4000);
  const ball = new Ball(600, 600);
  const input = stub();
  run(ball, level, input, 0.8);

  let jumps = 0;
  input.press();
  // A real held button presses once and stays down; the stub models that by
  // simply never pressing again.
  run(ball, level, input, 3, () => { if (ball.jumped) jumps++; });
  if (jumps !== 1) fail(`one press produced ${jumps} jumps`);
  else console.log('   one press, one jump');
}

// --- 5. a moving platform carries its rider ------------------------------
console.log('\n5. riding a platform');
{
  const level = loadLevel({
    id: 98, theme: 'hills',
    bounds: { w: 2400, h: 1080 },
    spawn: { x: 600, y: 500 },
    ground: [[[40, 1000], [2360, 1000]]],
    boxes: [],
    platforms: [{ x: 600, y: 700, w: 260, h: 28, axis: 'x', dist: 200, period: 4, phase: 0 }],
  });
  const ball = new Ball(level.movers[0].x + 130, 600);
  const input = stub();
  run(ball, level, input, 1.0);

  if (!ball.platform) fail('the ball is not standing on the platform it was dropped onto');
  const x0 = ball.x, px0 = level.movers[0].x;
  run(ball, level, input, 0.8);
  const moved = ball.x - x0, platformMoved = level.movers[0].x - px0;
  if (Math.abs(platformMoved) < 20) fail('the platform barely moved — the test would prove nothing');
  if (Math.abs(moved - platformMoved) > 12) {
    fail(`platform moved ${platformMoved.toFixed(1)} but its rider moved ${moved.toFixed(1)}`);
  } else {
    console.log(`   platform moved ${platformMoved.toFixed(0)}, rider came along`);
  }
}

// --- 6. jumping off a moving platform carries its speed ------------------
console.log('\n6. jumping off a mover');
{
  const board = (dist) => {
    const level = loadLevel({
      id: 97, theme: 'hills',
      bounds: { w: 4000, h: 1080 },
      spawn: { x: 600, y: 500 },
      ground: [[[40, 1000], [3960, 1000]]],
      boxes: [],
      // The phase is chosen so the platform is at its FASTEST one second in,
      // which is when the ball jumps. phase 0 is wrong for that: the sine is
      // steepest at t=0, and a quarter of the 4s period later — exactly when
      // the jump happens — it is at the end of its travel and momentarily
      // still, so nothing could be carried and the check proved nothing.
      platforms: [{ x: 600, y: 700, w: 260, h: 28, axis: 'x', dist, period: 4, phase: 0.75 }],
    });
    const ball = new Ball(level.movers[0].x + 130, 600);
    const input = stub();
    run(ball, level, input, 1.0);
    const speed = level.movers[0].vx;
    input.press();
    run(ball, level, input, CONFIG.STEP * 2);
    return { vx: ball.vx, platform: speed };
  };

  const still = board(0);
  const moving = board(200);
  console.log(`   platform was doing ${moving.platform.toFixed(0)} px/s at the moment of the jump`);
  // Without this the check can pass for the wrong reason: a platform that
  // happens to be at the end of its travel is momentarily still, and carrying
  // nothing from a stationary platform is correct behaviour, not a pass.
  if (Math.abs(moving.platform) < 100) {
    fail(`the platform was only doing ${moving.platform.toFixed(0)} px/s when the ball jumped — this proves nothing`);
  }
  if (moving.vx - still.vx < 40) {
    fail(`jumped off a moving platform at vx ${moving.vx.toFixed(1)} vs ${still.vx.toFixed(1)} off a still one — its speed was not carried`);
  } else {
    console.log(`   carried ${(moving.vx - still.vx).toFixed(0)} px/s off the platform`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL FEEL CHECKS PASSED');
process.exit(failures ? 1 : 0);
