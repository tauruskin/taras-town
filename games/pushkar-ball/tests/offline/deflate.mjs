// Failing, and how long it takes, and what the player can do while it happens.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { Overlay } = await import('../../js/ui.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

// The floor of the stub world, named because two of the checks below need to
// place the ball relative to it and a second copy of the number would drift.
const GROUND_Y = 760;

const world = () => loadLevel({
  id: 94, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 300, y: 600 },
  ground: [[[40, GROUND_Y], [2000, GROUND_Y]]],
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
//
// Homed at CHECKPOINT height, not at the spawn, and that is the whole reason
// this check has teeth. A checkpoint's respawn sits CHECKPOINT.CLEARANCE above
// the floor, which at GRAVITY is a fall of about 0.06s — comfortably inside
// BUFFER's 0.12s, so a jump press that survived the deflate really does fire
// the instant the ball lands. Homed at the SPAWN instead, the ball falls 200px,
// takes far longer than BUFFER to arrive, and the stale press has quietly
// expired before it could do any harm: the check still passes, but it passes
// because the scenario cannot express the bug rather than because the bug is
// absent. Every checkpoint in the real game is at the height used here.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  ball.home.y = GROUND_Y - ball.r - CONFIG.CHECKPOINT.CLEARANCE;
  ball.die();

  const n = Math.round(CONFIG.DEFLATE.TIME / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    input.press();                       // hammering jump through the deflate
    ball.update(CONFIG.STEP, input, level);
  }

  const bufferOnArrival = ball.buffer;

  // Long enough to cover the short fall onto the floor AND the whole of BUFFER
  // after it, so a stale press has every chance to fire before this stops
  // watching. Six steps — the fall alone is about seven — would have stopped
  // watching just before the moment being tested.
  let jumped = false, landed = false;
  const after = Math.round((CONFIG.BUFFER + 0.2) / CONFIG.STEP);
  for (let i = 0; i < after; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);   // nothing pressed now
    if (ball.jumped) jumped = true;
    // EVER grounded, not grounded at the end. A ball that lands and is then
    // thrown off the floor by the phantom jump this is hunting has still
    // reached the floor, and asking at the end instead reports the scenario as
    // broken on top of the bug it just caught — two failures for one cause.
    if (ball.grounded) landed = true;
  }
  console.log(`\n4. jump hammered through a deflate that ends at checkpoint height:` +
              ` buffer on arrival ${bufferOnArrival.toFixed(3)}, reached the floor=${landed}`);
  if (jumped) fail('a jump pressed during the deflate fired the moment the ball came back');
  if (bufferOnArrival > 0) fail(`the jump buffer survived the deflate (${bufferOnArrival.toFixed(3)}s in it)`);
  if (!landed) fail('the ball never reached the floor, so nothing was tested');
}

// --- 5. the dim is a single hump, peaking at the respawn -----------------
//
// The dim is the visible half of failing, and this is where it is actually
// proved. `Overlay.dim` is arithmetic on the ball and touches no canvas, so
// Node can ask it directly — which is the whole reason it lives in ui.js
// rather than inline in main.js's draw. A browser cannot check this nearly as
// well: the ball is killed below the bottom of the screen, so by the time a
// screenshot notices it has gone the dim has not started, and the deepest
// frame of it is a matter of luck and timing.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  if (Overlay.dim(ball) !== 0) fail(`the screen was dimmed while nothing was happening: ${Overlay.dim(ball)}`);

  ball.die();
  if (Math.abs(Overlay.dim(ball)) > 1e-9) fail(`the dim jumped straight in at the death: ${Overlay.dim(ball)}`);

  // Walk the whole failure a step at a time and keep the series, so the SHAPE
  // can be asserted rather than just its extremes.
  const series = [];
  const n = Math.round((CONFIG.DEFLATE.TIME + CONFIG.DEFLATE.INFLATE + 0.3) / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    series.push(Overlay.dim(ball));
  }

  const peak = Math.max(...series);
  const peakAt = series.indexOf(peak);
  // One hump: never falls before the peak, never rises after it. A dim that
  // flickered would read as a fault in the game rather than as a setback.
  let wrongWay = 0;
  for (let i = 1; i < series.length; i++) {
    const rising = i <= peakAt;
    if (rising && series[i] < series[i - 1] - 1e-9) wrongWay++;
    if (!rising && series[i] > series[i - 1] + 1e-9) wrongWay++;
  }

  const respawnAt = Math.round(CONFIG.DEFLATE.TIME / CONFIG.STEP) - 1;
  console.log(`\n5. the dim peaked at ${peak.toFixed(3)} of ${CONFIG.DEFLATE.DIM} on step ${peakAt},` +
              ` and the respawn is on step ~${respawnAt}`);
  if (peak > CONFIG.DEFLATE.DIM + 1e-9) fail(`the dim went past DEFLATE.DIM: ${peak}`);
  if (peak < CONFIG.DEFLATE.DIM * 0.9) fail(`the dim never got close to DEFLATE.DIM: peaked at ${peak.toFixed(3)}`);
  // Within a couple of steps of the respawn, which is the frame the camera
  // snaps on — the dim exists to cover exactly that cut.
  if (Math.abs(peakAt - respawnAt) > 2) fail(`the dim peaked on step ${peakAt}, nowhere near the respawn at ${respawnAt}`);
  if (wrongWay) fail(`the dim is not a single hump: it changed direction on ${wrongWay} steps`);
  if (Overlay.dim(ball) !== 0) fail(`the screen was still dim after the inflate: ${Overlay.dim(ball)}`);
  console.log(`   and it is back to ${Overlay.dim(ball)} once the ball is playable again`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL DEFLATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
