// The health system: hearts, invincibility after a hit, and what happens
// when they run out. hazards.mjs proves a spike touch correctly calls into
// this; this suite proves the hearts arithmetic itself by calling `hit()`
// and `die()` directly, so nothing here depends on rolling into anything or
// on knockback physics settling anywhere in particular.
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

const world = (checkpoints) => loadLevel({
  id: 96, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [], platforms: [],
  checkpoints: checkpoints || [],
});

// --- 1. a fresh ball starts at full hearts, no invincibility -------------
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  console.log(`\n1. a fresh ball has ${ball.hearts} heart(s), iframe=${ball.iframe}, hits=${ball.hits}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`starts with ${ball.hearts} hearts, expected ${CONFIG.HEALTH.HEARTS}`);
  if (ball.iframe !== 0) fail(`starts with ${ball.iframe}s of invincibility, expected 0`);
  if (ball.hits !== 0) fail(`starts with ${ball.hits} hits, expected 0`);
}

// --- 2. a hit with hearts to spare knocks back and stays in play ---------
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  ball.hit(1);
  console.log(`\n2. hit once: hearts=${ball.hearts}, hits=${ball.hits}, vx=${ball.vx}, vy=${ball.vy}, deaths=${ball.deaths}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 1) fail(`hearts went to ${ball.hearts}, expected ${CONFIG.HEALTH.HEARTS - 1}`);
  if (ball.hits !== 1) fail(`hits is ${ball.hits}, expected 1`);
  if (ball.deaths !== 0) fail('a hit with hearts to spare must not relocate the ball');
  if (ball.dying !== 0) fail('a hit with hearts to spare must not start a deflate');
  if (ball.vx !== CONFIG.HEALTH.KNOCKBACK) fail(`vx is ${ball.vx}, expected exactly ${CONFIG.HEALTH.KNOCKBACK} (knockDir was 1)`);
  if (ball.vy !== -CONFIG.HEALTH.KNOCKBACK_UP) fail(`vy is ${ball.vy}, expected exactly ${-CONFIG.HEALTH.KNOCKBACK_UP}`);
  if (ball.iframe !== CONFIG.HEALTH.IFRAME) fail(`iframe is ${ball.iframe}, expected ${CONFIG.HEALTH.IFRAME}`);
}

// --- 3. invincibility blocks a second hit, and it expires -----------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  ball.hit(1);
  ball.hit(1);   // same instant: must be ignored
  console.log(`\n3. hit twice with no time between: hearts=${ball.hearts}, hits=${ball.hits}`);
  if (ball.hits !== 1) fail(`a second hit inside the invincibility window counted anyway: hits=${ball.hits}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 1) fail(`hearts changed on the blocked hit: ${ball.hearts}`);

  run(ball, level, input, CONFIG.HEALTH.IFRAME + 0.05);
  if (ball.iframe !== 0) fail(`invincibility did not run out: iframe=${ball.iframe}`);
  ball.hit(1);
  console.log(`   after it wore off: hearts=${ball.hearts}, hits=${ball.hits}`);
  if (ball.hits !== 2) fail(`a hit after invincibility wore off did not count: hits=${ball.hits}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 2) fail(`hearts is ${ball.hearts}, expected ${CONFIG.HEALTH.HEARTS - 2}`);
}

// --- 4. the third hit exhausts hearts and sends the ball to the level's
// START, not the last checkpoint — and refills on arrival ----------------
{
  const level = world([{ x: 900, y: 760 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  input.right = true;
  run(ball, level, input, 2.0);          // past the checkpoint
  input.right = false;
  if (!level.checkpoints[0].taken) fail('the checkpoint was never reached, so this proves nothing');
  const home = { ...ball.home };
  const spawn = { ...ball.spawn };
  if (home.x === spawn.x) fail('home and spawn are the same point, so this cannot tell them apart');

  for (let i = 0; i < CONFIG.HEALTH.HEARTS; i++) {
    ball.hit(1);
    run(ball, level, stub(), CONFIG.HEALTH.IFRAME + 0.05);
  }
  console.log(`\n4. after ${CONFIG.HEALTH.HEARTS} hits: hearts=${ball.hearts}, deaths=${ball.deaths}, ` +
              `x=${ball.x.toFixed(0)} (spawn ${spawn.x}, checkpoint home ${home.x})`);
  if (ball.deaths !== 1) fail(`exhausting hearts should relocate exactly once; deaths=${ball.deaths}`);
  if (Math.abs(ball.x - spawn.x) > 5) fail(`came back at x=${ball.x.toFixed(0)}, not the level's start at ${spawn.x}`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`hearts did not refill on arrival: ${ball.hearts}`);
}

// --- 5. a hit while already relocating does not count a second time -----
//
// The same guard `die()` has always needed, carried over: a ball mid-deflate
// is still overlapping whatever hit it last, and without this the relocate
// would re-trigger every step and never finish.
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  ball.hearts = 1;
  ball.hit(1);
  const deathsAfterFirst = ball.deaths;
  for (let i = 0; i < 10; i++) ball.hit(1);
  console.log(`\n5. ten more hits during a relocate: deaths went ${deathsAfterFirst} -> ${ball.deaths}`);
  if (ball.deaths !== deathsAfterFirst) fail(`a hit during a relocate counted again: ${deathsAfterFirst} -> ${ball.deaths}`);
}

// --- 6. falling behaves the same way: costs a heart, and only exhausting
// them sends the ball to the start rather than the last checkpoint -------
{
  const level = world([{ x: 900, y: 760 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  input.right = true;
  run(ball, level, input, 2.0);
  input.right = false;
  const home = { ...ball.home };

  ball.die();
  run(ball, level, input, CONFIG.DEFLATE.TIME + CONFIG.DEFLATE.INFLATE + 0.5);
  console.log(`\n6. one fall: hearts=${ball.hearts}, deaths=${ball.deaths}, x=${ball.x.toFixed(0)} (checkpoint ${home.x})`);
  if (ball.hearts !== CONFIG.HEALTH.HEARTS - 1) fail(`a fall did not cost a heart: ${ball.hearts}`);
  if (ball.deaths !== 1) fail(`a fall with hearts to spare should still relocate once; deaths=${ball.deaths}`);
  if (Math.abs(ball.x - home.x) > 5) fail(`a fall with hearts to spare went to x=${ball.x.toFixed(0)}, not the checkpoint at ${home.x}`);
}

// --- 7. a fall still relocates even during another hit's invincibility --
//
// die() must not be blocked by iframe the way hit() is: a fall physically
// leaves the play space, so unlike a hazard touch there is no "recover in
// place" to wait for invincibility to run out. Regression test for a gap
// found in code review, where die() shared hit()'s iframe gate and a fall
// during the 0.5s after a hit would sit un-relocated until iframe expired.
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  ball.hit(1);
  if (ball.iframe <= 0) fail('the hit did not grant invincibility, so this proves nothing');
  const heartsAfterHit = ball.hearts;
  ball.die();
  console.log(`\n7. fell while still invincible from a hit: hearts ${heartsAfterHit} -> ${ball.hearts}, deaths=${ball.deaths}`);
  if (ball.hearts !== heartsAfterHit - 1) fail(`the fall did not cost a heart: hearts=${ball.hearts}`);
  if (ball.deaths !== 1) fail(`the fall did not relocate while invincible: deaths=${ball.deaths}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL HEALTH CHECKS PASSED');
process.exit(failures ? 1 : 0);
