// Spikes: they kill when touched, they do not kill when merely near, and they
// are more forgiving than they look.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');
const { spikeBox } = await import('../../js/hazards.js');

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

/**
 * Flat ground with one patch of spikes on it, walled at both ends.
 *
 * The walls are not decoration and this suite is wrong without them, which was
 * found the hard way: with the ground simply ENDING at 2000, a ball asked to
 * roll right for several seconds runs off the edge and dies of the fall. Every
 * check below that expects exactly one death then gets one whether the spikes
 * work or not — with the kill removed from player.js altogether, the whole
 * suite still passed. Real levels are bracketed by boundary boxes for exactly
 * this reason, so this stub is too, and the only thing left in here that can
 * kill the ball is the hazard being tested.
 */
const world = (spikes) => loadLevel({
  id: 93, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2000, y: 0, w: 40, h: 1080 },
  ],
  platforms: [],
  spikes,
});

// --- 1. the loader expands them ------------------------------------------
{
  const level = world([{ x: 800, y: 760, w: 120 }]);
  console.log(`\n1. the level has ${level.spikes.length} spike patch(es)`);
  if (level.spikes.length !== 1) fail(`expected 1 patch, got ${level.spikes.length}`);
}

// --- 2. the hit box is smaller than the drawing --------------------------
//
// Forgiveness, deliberately. A hazard whose hit box matches its picture kills
// on a graze that looked like a miss, and a six-year-old cannot tell the
// difference between that and the game cheating.
{
  const s = { x: 800, y: 760, w: 120 };
  const box = spikeBox(s, CONFIG);
  console.log(`\n2. a ${s.w}px patch drawn ${CONFIG.SPIKE.H}px tall has a hit box ` +
              `${box.w.toFixed(0)}x${box.h.toFixed(0)} at ${box.x.toFixed(0)},${box.y.toFixed(0)}`);
  if (box.w >= s.w) fail(`the hit box is ${box.w} wide, not narrower than the ${s.w} drawn`);
  if (box.h >= CONFIG.SPIKE.H) fail(`the hit box is ${box.h} tall, not shorter than the ${CONFIG.SPIKE.H} drawn`);
  if (box.y + box.h > s.y + 0.001) fail('the hit box hangs below the ground the spikes stand on');
}

// --- 3. rolling into them kills ------------------------------------------
{
  const level = world([{ x: 800, y: 760, w: 160 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  let steps = 0;
  const limit = Math.round(8 / CONFIG.STEP);
  while (ball.deaths === 0 && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;

  console.log(`\n3. rolled into a spike patch and died after ${(steps * CONFIG.STEP).toFixed(2)}s at x=${ball.x.toFixed(0)}`);
  if (ball.deaths !== 1) fail(`rolling into spikes gave ${ball.deaths} deaths, expected 1`);
  // WHERE it died, on both sides. A lower bound alone is not enough: a ball
  // that rolled clean through the patch and died of something else further
  // along the level satisfies it, which is precisely how an earlier draft of
  // this suite passed with the kill removed from player.js entirely.
  if (ball.x < 700) fail(`died at x=${ball.x.toFixed(0)}, well before the spikes at 800 — something else killed it`);
  if (ball.x > 1000) fail(`died at x=${ball.x.toFixed(0)}, past the patch's far side — something else killed it`);
}

// --- 4. rolling past where they are NOT does not kill --------------------
{
  const level = world([{ x: 1500, y: 760, w: 100 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  run(ball, level, input, 1.5);      // nowhere near 1500 yet
  input.right = false;

  console.log(`\n4. rolled to x=${ball.x.toFixed(0)} with spikes at 1500: deaths=${ball.deaths}`);
  if (ball.deaths !== 0) fail('died without reaching the spikes at all');
}

// --- 5. jumping over them survives ---------------------------------------
//
// The whole point of a spike is that it can be got past. If a patch narrower
// than the jump's reach cannot be cleared, the hit box is wrong, not the jump.
{
  const reach = (CONFIG.JUMP_V ** 2) / (2 * CONFIG.GRAVITY);
  const patch = { x: 900, y: 760, w: 90 };
  const level = world([patch]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  // Roll right at speed and jump when the patch's near edge comes within a
  // jump's reach, which is a deliberate take-off rather than a bounce.
  //
  // The first draft of this check pressed jump on EVERY grounded step and ran
  // for six seconds, and it failed — not because the hit box was too big, but
  // twice over because of the scenario:
  //
  //   - A ball that hops continuously from this spawn touches down at x = 370,
  //     657, 944, 1231. 944 is squarely inside a patch spanning 900..990, so
  //     the ball came DOWN on the spikes from above. That is a real landing on
  //     a hazard and no hit box smaller than its own picture can avoid it; the
  //     landing phase happened to line up with the patch, which is luck, not a
  //     property of the game.
  //   - The flat here ends at x = 2000 and six seconds at MAX_SPEED is 2520px
  //     of rolling, so the ball ran off the end of the world and died of the
  //     fall regardless. Run with the spikes REMOVED entirely, that draft
  //     still reported one death — which is the proof that it was measuring
  //     the harness and not the hazard.
  //
  // So: jump on purpose, and stop while there is still ground underneath.
  input.right = true;
  const n = Math.round(2.5 / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    if (ball.grounded && patch.x - ball.x < reach) input.press();
    ball.update(CONFIG.STEP, input, level);
  }
  input.right = false;

  console.log(`\n5. a jump clears ${reach.toFixed(0)}px; jumping over a 90px patch gave ${ball.deaths} death(s),` +
              ` ending at x=${ball.x.toFixed(0)}`);
  if (ball.deaths > 0) fail(`jumping over a 90px spike patch still died ${ball.deaths} time(s)`);
  if (ball.x < 990) fail(`never got past the patch: ended at x=${ball.x.toFixed(0)}`);
}

// --- 6. dying on spikes finishes deflating and comes back ---------------
//
// The case the die() guard exists for: the ball dies ON the spikes and is
// still overlapping them the whole time it deflates.
{
  const level = world([{ x: 800, y: 760, w: 160 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  let steps = 0;
  while (ball.deaths === 0 && steps < Math.round(8 / CONFIG.STEP)) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;
  // Where it died, so this check is known to be about a death ON the spikes
  // and not about some other way of failing further along.
  const diedAt = ball.x;
  if (diedAt < 700 || diedAt > 1000) fail(`died at x=${diedAt.toFixed(0)}, not on the patch at 800..960`);

  run(ball, level, input, CONFIG.DEFLATE.TIME + CONFIG.DEFLATE.INFLATE + 1.0);
  console.log(`\n6. after dying on the spikes: deaths=${ball.deaths}, x=${ball.x.toFixed(0)}, home=${ball.home.x}`);
  if (ball.deaths !== 1) fail(`the death on the spikes re-triggered: ${ball.deaths} deaths`);
  if (Math.abs(ball.x - ball.home.x) > 60) fail(`did not come back home: x=${ball.x.toFixed(0)}, home=${ball.home.x}`);
  if (ball.dying > 0) fail('still deflating long after it should have finished');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL HAZARD CHECKS PASSED');
process.exit(failures ? 1 : 0);
