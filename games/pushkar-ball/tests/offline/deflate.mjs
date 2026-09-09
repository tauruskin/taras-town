// Failing, and how long it takes, and what the player can do while it happens.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

const world = () => loadLevel({
  id: 94, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 300, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [], platforms: [],
});

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

// --- 1. dying stops the ball dead and lasts as long as it says -----------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  run(ball, level, input, 1.0);
  const movingAt = ball.x;
  if (Math.abs(ball.vx) < 100) fail('the ball was not actually moving before it was killed');

  ball.die();
  console.log(`\n1. killed at x=${movingAt.toFixed(0)}: dying=${ball.dying.toFixed(3)}s, vx=${ball.vx.toFixed(1)}`);
  if (Math.abs(ball.vx) > 0.001) fail(`dying did not stop the ball: vx=${ball.vx.toFixed(1)}`);
  if (Math.abs(ball.dying - CONFIG.DEFLATE.TIME) > 1e-9) fail(`dying is ${ball.dying}, not DEFLATE.TIME`);

  // Input is ignored while dying. Holding right through a deflate must not
  // slide the corpse along the ground.
  const where = ball.x;
  run(ball, level, input, CONFIG.DEFLATE.TIME * 0.5);
  if (Math.abs(ball.x - where) > 0.001) fail(`the ball moved ${(ball.x - where).toFixed(2)}px while deflating`);
  if (ball.dying <= 0) fail('the deflate finished in half its own duration');
  console.log(`   halfway through: still at x=${ball.x.toFixed(0)}, dying=${ball.dying.toFixed(3)}s`);
}

// --- 2. it comes back at home, inflating ---------------------------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  input.right = true;
  run(ball, level, input, 1.5);
  input.right = false;

  ball.die();
  run(ball, level, input, CONFIG.DEFLATE.TIME + CONFIG.STEP * 2);

  console.log(`\n2. after the deflate: x=${ball.x.toFixed(0)} (home ${ball.home.x}),` +
              ` dying=${ball.dying.toFixed(3)}, reviving=${ball.reviving.toFixed(3)}`);
  if (ball.dying > 0) fail('still dying after DEFLATE.TIME had passed');
  if (Math.abs(ball.x - ball.home.x) > 1) fail(`came back at x=${ball.x.toFixed(0)}, not home at ${ball.home.x}`);
  if (ball.reviving <= 0) fail('the ball came back without re-inflating');

  // And it is playable again once the inflate is over.
  run(ball, level, input, CONFIG.DEFLATE.INFLATE + 1.0);
  if (ball.reviving > 0) fail('still re-inflating long after INFLATE had passed');
  if (!ball.grounded) fail('the ball never settled on the ground after coming back');

  input.right = true;
  run(ball, level, input, 0.5);
  if (Math.abs(ball.vx) < 50) fail(`the ball would not roll after coming back: vx=${ball.vx.toFixed(1)}`);
  else console.log(`   and it rolls again: vx=${ball.vx.toFixed(0)}`);
}

// --- 3. a second death during a deflate is not a second death ------------
//
// The guard that matters. A ball killed by a spike is still sitting on that
// spike, so without it the death re-triggers every step and the deflate never
// finishes.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  ball.die();
  const first = ball.deaths;
  for (let i = 0; i < 10; i++) ball.die();
  console.log(`\n3. ten more die() calls during a deflate: deaths went ${first} -> ${ball.deaths}`);
  if (ball.deaths !== first) fail(`a death during a deflate counted again: ${first} -> ${ball.deaths}`);

  run(ball, level, input, CONFIG.DEFLATE.TIME + 0.5);
  if (ball.dying > 0) fail('the deflate never finished');
}

// --- 4. a jump pressed during the deflate does not fire on arrival -------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  ball.die();

  const n = Math.round(CONFIG.DEFLATE.TIME / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    input.press();                       // hammering jump through the deflate
    ball.update(CONFIG.STEP, input, level);
  }

  let jumped = false;
  for (let i = 0; i < 6; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);   // nothing pressed now
    if (ball.jumped) jumped = true;
  }
  console.log(`\n4. jump hammered through the deflate: buffer on arrival ${ball.buffer.toFixed(3)}`);
  if (jumped) fail('a jump pressed during the deflate fired the moment the ball came back');
  if (ball.buffer > 0) fail(`the jump buffer survived the deflate (${ball.buffer.toFixed(3)}s in it)`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL DEFLATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
