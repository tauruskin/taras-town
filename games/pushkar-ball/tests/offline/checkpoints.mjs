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

// The floor every fixture here stands on, and where a ball at rest on it
// belongs: its centre one radius up. Written as an expression so that
// retuning BALL.R does not quietly turn these into an allowance that passes
// while measuring nothing.
const GROUND_Y = 760;
const RESTING_Y = GROUND_Y - CONFIG.BALL.R;

/**
 * Flat ground that stops at 1600 by default, so the ball can be driven off
 * the end of it, with both checkpoints authored ON the ground — which is the
 * only sensible place to author one, and the case that once respawned the
 * ball inside the floor for ever.
 */
const world = (extra) => loadLevel({
  id: 95, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, GROUND_Y], [1600, GROUND_Y]]],
  boxes: [], platforms: [],
  checkpoints: [{ x: 700, y: GROUND_Y }, { x: 1200, y: GROUND_Y }],
  ...extra,
});

/**
 * The ball is back, alive, and standing — not merely at the right x.
 *
 * This exists because the x alone is blind to the worst thing that can happen
 * here. A ball respawned INSIDE the floor is at exactly the right x while it
 * falls through it, dies, and comes back inside the floor again, for ever, and
 * a check that only reads x passes contentedly all the way through a level
 * that has been destroyed. `deaths` is the assertion that catches it: a
 * respawn loop climbs it without limit.
 */
const alive = (ball, deaths, what) => {
  if (ball.deaths !== deaths) {
    fail(`${what}: expected ${deaths} death(s), got ${ball.deaths} — a ball that keeps` +
         ' dying after a respawn is one that came back inside the floor');
  }
  if (!ball.grounded) fail(`${what}: the ball came back but never came to rest on the ground`);
  if (Math.abs(ball.y - RESTING_Y) > 2) {
    fail(`${what}: the ball settled at y=${ball.y.toFixed(1)}, not resting on the floor at ${RESTING_Y}`);
  }
};

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
  alive(ball, 1, '3');
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
  alive(ball, 1, '4');
}

// --- 5. a taken checkpoint stays taken -----------------------------------
//
// Rolling back and forth over one must not un-take it, and must not shuffle
// home backwards to an earlier one.
//
// The ground is extended past both checkpoints for this one, and that is the
// whole check rather than a detail. On the default fixture the ball ran off
// the end at 1600 and died before it ever rolled back, so the return trip
// never happened and this passed even with `takeCheckpoint`'s "skip the ones
// already taken" line deleted — it was protecting nothing at all.
{
  const level = world({ ground: [[[40, GROUND_Y], [2300, GROUND_Y]]] });
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);
  input.right = true;
  run(ball, level, input, 5.0);          // past both
  const furthest = ball.x;
  const homeAfter = ball.home.x;
  input.right = false;
  input.left = true;
  run(ball, level, input, 4.5);          // back over the first one
  input.left = false;
  run(ball, level, input, 0.5);

  console.log(`
5. rolled out to x=${furthest.toFixed(0)} and back to x=${ball.x.toFixed(0)};` +
              ` home was ${homeAfter.toFixed(0)} and is now ${ball.home.x.toFixed(0)}`);

  // The trip has to have actually happened, or none of the below means
  // anything: past the second checkpoint on the way out, back over the first
  // on the way home, and alive the whole time.
  if (furthest <= level.checkpoints[1].x) {
    fail(`the ball only reached x=${furthest.toFixed(0)}, never passing the second checkpoint` +
         ` at ${level.checkpoints[1].x}, so the roll back tested nothing`);
  }
  if (ball.x > level.checkpoints[0].x) {
    fail(`the ball came back only to x=${ball.x.toFixed(0)}, never re-crossing the first` +
         ` checkpoint at ${level.checkpoints[0].x}, so the roll back tested nothing`);
  }
  alive(ball, 0, '5');

  if (ball.home.x !== homeAfter) {
    fail(`rolling back over an earlier checkpoint moved home from ${homeAfter.toFixed(0)} to ${ball.home.x.toFixed(0)}`);
  }
  if (!level.checkpoints.every((c) => c.taken)) fail('rolling back un-took a checkpoint');
}

// --- 6. a checkpoint is armed at the height it is drawn ------------------
//
// Capture used to be a circle around the anchor at the foot of the pole, so
// its window narrowed to nothing exactly where the pole is tallest and a ball
// passing at flag height missed it entirely. Silent non-arming is the one
// thing a checkpoint must never do: the player believes it armed and finds out
// otherwise only by dying.
//
// So the claim being tested is that the capture region is the shape of the
// PICTURE — anywhere against the drawn pole arms it, and only genuinely
// clearing the whole flag does not.
{
  const K = CONFIG.CHECKPOINT;
  const at = (dy) => {
    const level = world();
    const c = level.checkpoints[0];
    return !!level.takeCheckpoint(c.x, c.y + dy);
  };
  const poleTop = at(-K.POLE_H + 1);        // brushing the top of the pole
  const poleMid = at(-K.POLE_H / 2);        // halfway up it, where a jump goes
  const over = at(-K.POLE_H - 30);          // clear over the whole flag

  console.log(`
6. against the pole: top=${poleTop}, middle=${poleMid}, clear over it=${over}`);
  if (!poleMid) fail('a ball passing at flag height did not arm the checkpoint');
  if (!poleTop) fail('a ball passing at the very top of the pole did not arm the checkpoint');
  if (over) fail('a ball well clear of the whole flag armed it anyway');

  // And the same thing with a real jump, because the geometry above is only
  // worth having if the ball can actually be somewhere it applies. The ball is
  // driven at the flag and jumps late, so it crosses the pole partway up
  // rather than sailing over the top of it.
  const level = world({ ground: [[[40, GROUND_Y], [2300, GROUND_Y]]] });
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);
  input.right = true;
  const flag = level.checkpoints[0];
  let crossedAt = null, jumped = false;
  for (let i = 0; i < Math.round(4.0 / CONFIG.STEP); i++) {
    level.update(CONFIG.STEP);
    if (!jumped && ball.x > flag.x - 20 && ball.grounded) { input.press(); jumped = true; }
    const wasLeft = ball.x <= flag.x;
    ball.update(CONFIG.STEP, input, level);
    if (wasLeft && ball.x > flag.x) crossedAt = ball.y;
  }
  input.right = false;

  const up = crossedAt === null ? 0 : RESTING_Y - crossedAt;
  console.log(`   and jumping across it, the ball passed ${up.toFixed(0)}px off the ground:` +
              ` taken=${flag.taken}`);
  if (!jumped || crossedAt === null) fail('the ball never jumped across the flag, so nothing was tested');
  if (up < 20) fail(`the ball was only ${up.toFixed(0)}px up as it crossed, which a roll would manage`);
  if (!flag.taken) fail('a checkpoint crossed mid-jump, at the height of its own flag, did not arm');
}

// --- 7. reaching a checkpoint refills hearts -----------------------------
//
// Added Sep 2026 with the health system: a checkpoint's job used to be only
// "where a fall sends the ball back to." It is now also "a clean slate" —
// damage taken on the way to it should not make the stretch AFTER it harder
// than the level intended.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 0.8);

  ball.hit(1);
  const heartsAfterHit = ball.hearts;
  if (heartsAfterHit >= CONFIG.HEALTH.HEARTS) fail('the hit did not actually cost a heart, so this proves nothing');

  input.right = true;
  run(ball, level, input, 2.0);   // past the first checkpoint at x=700
  input.right = false;

  console.log(`\n7. after a hit (hearts=${heartsAfterHit}) and reaching a checkpoint: hearts=${ball.hearts}`);
  if (!level.checkpoints[0].taken) fail('the checkpoint was never reached, so this proves nothing');
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`hearts did not refill at the checkpoint: ${ball.hearts}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKPOINT CHECKS PASSED');
process.exit(failures ? 1 : 0);
