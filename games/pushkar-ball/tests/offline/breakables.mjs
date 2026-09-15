// Breakable wood: a plank wall that stops everything until the ball rolls into
// it hard, then is gone for the rest of that play of the level. A slower knock
// only rattles and cracks it. See
// docs/superpowers/specs/2026-09-15-moving-spikes-and-breakable-wood-design.md.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const PLANKS = { x: 1000, y: 660, w: 30, h: 100 };
const world = (extraBoxes = []) => loadLevel({
  id: 95, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 700 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2000, y: 0, w: 40, h: 1080 }, ...extraBoxes],
  platforms: [],
  breakables: [PLANKS],
});

const hold = (right) => ({ left: false, right, takeJump: () => false });
const run = (ball, level, input, seconds, each) => {
  for (let i = 0; i < seconds / CONFIG.STEP; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    if (each) each();
  }
};

// --- 1. the loader builds it ----------------------------------------------
{
  const level = world();
  const b = level.breakables[0];
  console.log(`\n1. ${level.breakables.length} breakable(s), broken=${b.broken}, ${b.segments.length} segments`);
  if (level.breakables.length !== 1) fail('expected one breakable');
  if (b.broken) fail('a fresh one is already broken');
  if (b.segments.length !== 4) fail(`expected a box's 4 segments, got ${b.segments.length}`);
  if (!b.segments.every((s) => s.owner === b)) fail('its segments do not lead back to it');
  // The carrier contract CLAUDE.md warns about: anything the ball can stand on
  // owes dx, dy, vx, vy, or the ball's position goes NaN the first frame.
  if (![b.dx, b.dy, b.vx, b.vy].every((v) => v === 0)) fail('it does not carry dx/dy/vx/vy');
}

// --- 2. a slow knock rattles it and does not break it -----------------------
//
// 15px from the face at rest, then held right: contact comes at about 220px/s,
// under BREAKABLE.SPEED, and the ball keeps leaning on it for two seconds.
{
  const level = world();
  const b = level.breakables[0];
  const ball = new Ball(PLANKS.x - CONFIG.BALL.R - 15, 740);
  run(ball, level, hold(false), 0.5);
  let wobbled = false;
  run(ball, level, hold(true), 2, () => { if (b.wobbleT > 0) wobbled = true; });
  console.log(`\n2. a slow knock: broken=${b.broken}, cracked=${b.cracked}, wobbled=${wobbled}, ball at x=${ball.x.toFixed(1)}`);
  if (b.broken) fail('a slow knock broke it');
  if (!b.cracked || !wobbled) fail('a slow knock did not rattle it');
  if (ball.x > PLANKS.x) fail('the ball got through unbroken planks');
}

// --- 3. a fast roll breaks it, and the ball keeps going -----------------------
{
  const level = world();
  const b = level.breakables[0];
  const ball = new Ball(400, 740);
  run(ball, level, hold(false), 0.3);
  let pieces = 0;
  run(ball, level, hold(true), 2, () => { if (b.broken && !pieces) pieces = level.particles.length; });
  console.log(`\n3. a fast roll: broken=${b.broken}, ${pieces} pieces, ball at x=${ball.x.toFixed(0)}, hits=${ball.hits}`);
  if (!b.broken) fail('rolling into it at full speed did not break it');
  if (!pieces) fail('breaking it threw no pieces');
  if (b.segments.length) fail('a broken one still has segments');
  if (ball.x < PLANKS.x + PLANKS.w + 100) fail(`the ball stopped at x=${ball.x.toFixed(0)} instead of going through`);
  if (ball.hits) fail('breaking it cost a heart');

  // --- 4. and it stays broken after a respawn ---------------------------------
  for (let h = 0; h < CONFIG.HEALTH.HEARTS; h++) {
    ball.hit(1);
    run(ball, level, hold(false), CONFIG.HEALTH.IFRAME + 0.05);
  }
  run(ball, level, hold(false), 3);
  const near = level.near(PLANKS.x + 15, 710, 60);
  console.log(`\n4. after running out of hearts: deaths=${ball.deaths}, ball at x=${ball.x.toFixed(0)}, broken=${b.broken}`);
  if (ball.deaths !== 1) fail(`expected one death, got ${ball.deaths} — nothing below was tested`);
  if (!b.broken) fail('a respawn put the planks back');
  if (near.some((s) => s.owner === b)) fail('a broken one still offers the ball segments');
}

// --- 5. a crate is stopped by it and does not break it ------------------------
{
  const level = world([{ x: 800, y: 660, w: 100, h: 100, movable: true }]);
  const b = level.breakables[0], crate = level.crates[0];
  const ball = new Ball(700, 740);
  run(ball, level, hold(true), 4);
  console.log(`\n5. a crate shoved into it: crate at x=${crate.x.toFixed(1)}, broken=${b.broken}`);
  if (b.broken) fail('a pushed crate broke it');
  if (crate.x + crate.w > PLANKS.x + 0.5) fail(`the crate went into the planks, to x=${crate.x.toFixed(1)}`);
  if (crate.x < PLANKS.x - crate.w - 5) fail('the crate never reached the planks, so nothing was tested');
}

// --- 6. standing on top of it is safe ----------------------------------------
{
  const level = world();
  const ball = new Ball(PLANKS.x + 15, 600);
  run(ball, level, hold(false), 1);
  console.log(`\n6. dropped on top: at ${ball.x.toFixed(1)},${ball.y.toFixed(1)}, grounded=${ball.grounded}`);
  if (![ball.x, ball.y, ball.vx, ball.vy].every(Number.isFinite)) fail('standing on it made the ball non-finite');
  if (level.breakables[0].broken) fail('landing on top broke it');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BREAKABLE CHECKS PASSED');
process.exit(failures ? 1 : 0);
