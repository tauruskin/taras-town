// Checkpoints: reaching one, coming back to it, and never coming back to one
// that was never reached.
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

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

/** Flat ground that stops at 1600, so the ball can be driven off the end. */
const world = () => loadLevel({
  id: 95, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [1600, 760]]],
  boxes: [], platforms: [],
  checkpoints: [{ x: 700, y: 760 }, { x: 1200, y: 760 }],
});

// --- 1. the loader expands them, untaken ---------------------------------
{
  const level = world();
  console.log(`\n1. the level has ${level.checkpoints.length} checkpoints`);
  if (level.checkpoints.length !== 2) fail(`expected 2 checkpoints, got ${level.checkpoints.length}`);
  if (level.checkpoints.some((c) => c.taken)) fail('a checkpoint started out already taken');
}

// --- 2. rolling past one takes it ----------------------------------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);

  if (ball.home.x !== level.spawn.x) fail('the ball did not start out homed to the spawn');

  input.right = true;
  run(ball, level, input, 2.0);   // enough to pass 700 but not 1200
  input.right = false;

  console.log(`\n2. after rolling to x=${ball.x.toFixed(0)}: first taken=${level.checkpoints[0].taken},` +
              ` second taken=${level.checkpoints[1].taken}, home x=${ball.home.x.toFixed(0)}`);
  if (!level.checkpoints[0].taken) fail('rolling straight over the first checkpoint did not take it');
  if (ball.home.x !== level.checkpoints[0].x) {
    fail(`home is ${ball.home.x.toFixed(0)}, not the checkpoint at ${level.checkpoints[0].x}`);
  }
}

// --- 3. falling out returns to the checkpoint, not the spawn -------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);

  input.right = true;
  // Driven right until it falls off the end of the ground at 1600, which is
  // past both checkpoints.
  let steps = 0;
  const limit = Math.round(12 / CONFIG.STEP);
  while (ball.deaths === 0 && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;
  if (ball.deaths === 0) { fail('the ball never fell off the end, so nothing was tested'); }

  // Let the deflate finish and the ball settle.
  run(ball, level, input, 2.0);

  console.log(`\n3. fell off the end and came back to x=${ball.x.toFixed(0)}` +
              ` (spawn ${level.spawn.x}, last checkpoint ${level.checkpoints[1].x})`);
  if (Math.abs(ball.x - level.checkpoints[1].x) > 120) {
    fail(`came back to x=${ball.x.toFixed(0)} instead of the last checkpoint at ${level.checkpoints[1].x}`);
  }
  if (Math.abs(ball.x - level.spawn.x) < 120) fail('came back to the spawn, ignoring both checkpoints');
}

// --- 4. an unreached checkpoint is not a home ----------------------------
//
// The ball is dropped past the FIRST checkpoint's x but never touches the
// second, then killed. It must come back to the first.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);
  input.right = true;
  run(ball, level, input, 2.0);
  input.right = false;
  run(ball, level, input, 1.5);

  ball.die(level);
  run(ball, level, input, 2.0);

  console.log(`\n4. killed before the second checkpoint, came back to x=${ball.x.toFixed(0)}`);
  if (Math.abs(ball.x - level.checkpoints[0].x) > 120) {
    fail(`came back to ${ball.x.toFixed(0)} instead of the first checkpoint at ${level.checkpoints[0].x}`);
  }
  if (level.checkpoints[1].taken) fail('a checkpoint the ball never reached was marked taken');
}

// --- 5. a taken checkpoint stays taken -----------------------------------
//
// Rolling back and forth over one must not un-take it, and must not shuffle
// home backwards to an earlier one.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);
  input.right = true;
  run(ball, level, input, 5.0);          // past both
  const homeAfter = ball.home.x;
  input.right = false;
  input.left = true;
  run(ball, level, input, 3.0);          // back over the first one
  input.left = false;

  console.log(`\n5. home was ${homeAfter.toFixed(0)} and after rolling back it is ${ball.home.x.toFixed(0)}`);
  if (ball.home.x !== homeAfter) {
    fail(`rolling back over an earlier checkpoint moved home from ${homeAfter.toFixed(0)} to ${ball.home.x.toFixed(0)}`);
  }
  if (!level.checkpoints.every((c) => c.taken)) fail('rolling back un-took a checkpoint');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKPOINT CHECKS PASSED');
process.exit(failures ? 1 : 0);
