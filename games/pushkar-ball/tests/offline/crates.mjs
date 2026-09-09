// Crates, and falling out of the level.
//
// Both of these are things a child does on purpose within a minute of picking
// the game up: shoving a box around, and dropping down a hole. Neither is
// allowed to leave the level in a state he cannot get out of, which is what
// most of the checks below are really about.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { LEVELS, loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

/** A stand-in for input.js, so none of this needs a browser or an event loop. */
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

/** A level of our own, so a check does not depend on level one's layout. */
const world = (extra) => loadLevel({
  id: 98, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [],
  platforms: [],
  ...extra,
});

// --- 1. a crate falls, and stops on the ground ---------------------------
{
  const level = world({ boxes: [{ x: 600, y: 300, w: 100, h: 100, movable: true }] });
  const crate = level.crates[0];
  for (let i = 0; i < 240; i++) level.update(CONFIG.STEP);

  console.log(`\n1. a crate dropped from y=300 settled at y=${crate.y.toFixed(1)}`);
  if (Math.abs(crate.y + crate.h - 760) > 0.5) {
    fail(`a crate should rest with its bottom on the ground at 760, but it is at ${(crate.y + crate.h).toFixed(1)}`);
  }
  // And it must STAY there. A body that resolves against its own floor creeps
  // downward a fraction every step, which is invisible for a second and has
  // the crate underground a minute later.
  const settled = crate.y;
  for (let i = 0; i < 600; i++) level.update(CONFIG.STEP);
  if (Math.abs(crate.y - settled) > 0.01) {
    fail(`the crate drifted ${(crate.y - settled).toFixed(3)}px over 5s while resting`);
  } else console.log('   and stayed exactly there for another 5s');
}

// --- 2. the ball pushes it, and only when asked --------------------------
{
  const level = world({ boxes: [{ x: 400, y: 660, w: 100, h: 100, movable: true }] });
  const crate = level.crates[0];
  const input = stub();
  const ball = new Ball(250, 700);
  run(ball, level, input, 1.0);

  const before = crate.x;
  input.right = true;
  run(ball, level, input, 2.0);
  const moved = crate.x - before;
  console.log(`\n2. pushed right for 2s: the crate moved ${moved.toFixed(0)}px`);
  if (moved < 100) fail(`the ball rolled into a crate for 2s and it only moved ${moved.toFixed(0)}px`);

  // The ball must end up behind the crate, not inside it. Being inside is what
  // a solid body pushed by a resolver looks like when the push outruns the
  // resolution.
  if (ball.x > crate.x) fail(`the ball (x=${ball.x.toFixed(0)}) ended up past the crate it was pushing (x=${crate.x.toFixed(0)})`);

  // Let go and the crate stops. A crate that keeps sliding is a crate that
  // ends up somewhere nobody chose.
  input.right = false;
  const stopped = crate.x;
  run(ball, level, input, 2.0);
  if (Math.abs(crate.x - stopped) > 0.5) fail(`the crate kept moving ${(crate.x - stopped).toFixed(1)}px after the push stopped`);
  else console.log('   and stopped the moment the push did');
}

// --- 3. standing on a crate does not push it -----------------------------
//
// This is the "haunted crate" check. A contact is a contact, so without a test
// for how side-on it is, a ball sitting on top of a crate and rolling drags the
// crate along under it.
{
  const level = world({ boxes: [{ x: 600, y: 660, w: 120, h: 100, movable: true }] });
  const crate = level.crates[0];
  const input = stub();
  const ball = new Ball(660, 620);      // dropped onto the crate's lid
  run(ball, level, input, 0.6);
  if (!ball.grounded) fail('the ball did not land on the crate at all');

  const before = crate.x;
  input.right = true;
  run(ball, level, input, 0.5);
  console.log(`\n3. rolling along the crate's lid moved it ${(crate.x - before).toFixed(2)}px`);
  if (Math.abs(crate.x - before) > 1) {
    fail(`standing on a crate and rolling dragged it ${(crate.x - before).toFixed(1)}px`);
  }
}

// --- 4. a crate cannot be shoved through a wall --------------------------
//
// The one that would actually break a level: a crate pushed out through the
// boundary is a crate gone for good, and in a level where it was the way up,
// gone for good means unfinishable.
{
  const level = world({
    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 200, y: 660, w: 100, h: 100, movable: true },
    ],
  });
  const crate = level.crates[0];
  const input = stub();
  const ball = new Ball(500, 700);
  input.left = true;
  run(ball, level, input, 6.0);

  console.log(`\n4. shoved left into the wall for 6s: the crate's left edge is at ${crate.x.toFixed(1)} (wall ends at 40)`);
  if (crate.x < 40 - 0.5) fail(`the crate was pushed into or through the wall, to x=${crate.x.toFixed(1)}`);
  if (crate.x > 200) fail(`the crate moved the wrong way, to x=${crate.x.toFixed(1)}`);
}

// --- 5. a crate is a step up to somewhere out of reach -------------------
//
// The whole reason crates exist. The numbers are asked of config, not typed:
// a jump from flat ground clears JUMP_V^2 / 2*GRAVITY, and the ledge here is
// deliberately higher than that, so the level is only finishable by using the
// crate. If the jump is ever retuned this check follows it.
{
  const reach = (CONFIG.JUMP_V ** 2) / (2 * CONFIG.GRAVITY);
  const ledgeUp = reach + 40;                 // out of reach from the floor
  const ledgeY = 760 - ledgeUp;
  console.log(`\n5. a jump from flat ground clears ${reach.toFixed(0)}px; the test ledge is ${ledgeUp.toFixed(0)}px up`);

  // The floor runs right up to the foot of the ledge, so that a crate shoved
  // under the ledge still has something to stand on. The first draft of this
  // stopped the floor at 1200 and then put the crate at 1250, which quietly
  // dropped the crate out of the world before the check even began — and the
  // failure it produced looked exactly like a jump that would not clear.
  const build = () => loadLevel({
    id: 97, theme: 'hills',
    bounds: { w: 2400, h: 1080 },
    spawn: { x: 200, y: 600 },
    ground: [[[40, 760], [1390, 760]], [[1400, ledgeY], [2000, ledgeY]]],
    boxes: [{ x: 700, y: 660, w: 100, h: 100, movable: true }],
    platforms: [],
  });

  // Without the crate: jumping at the ledge from the floor cannot reach it.
  {
    const level = build();
    const input = stub();
    const ball = new Ball(1150, 700);
    let best = ball.y;
    for (let i = 0; i < Math.round(2.5 / CONFIG.STEP); i++) {
      level.update(CONFIG.STEP);
      if (ball.grounded) input.press();
      ball.update(CONFIG.STEP, input, level);
      best = Math.min(best, ball.y);
    }
    if (best <= ledgeY) fail(`the ledge at ${ledgeY} was supposed to be out of reach, but a jump from the floor got to ${best.toFixed(0)}`);
    else console.log(`   from the floor the ball only got up to y=${best.toFixed(0)}, short of the ledge at ${ledgeY}`);
  }

  // With the crate under it: standing on the crate, the same jump clears it.
  {
    const level = build();
    const crate = level.crates[0];
    crate.x = 1250;                      // as if it had been pushed under the ledge
    crate._reseg();
    for (let i = 0; i < 120; i++) level.update(CONFIG.STEP);

    const input = stub();
    const ball = new Ball(1300, crate.y - 40);
    run(ball, level, input, 0.8);
    if (!ball.grounded) fail('the ball would not settle on the crate under the ledge');

    let best = ball.y;
    input.right = true;
    for (let i = 0; i < Math.round(1.5 / CONFIG.STEP); i++) {
      level.update(CONFIG.STEP);
      if (ball.grounded) input.press();
      ball.update(CONFIG.STEP, input, level);
      best = Math.min(best, ball.y);
    }
    if (best > ledgeY) fail(`jumping off the crate reached only y=${best.toFixed(0)}, still short of the ledge at ${ledgeY}`);
    else console.log(`   standing on the crate, the same jump reached y=${best.toFixed(0)} and cleared it`);
  }
}

// --- 6. falling out of the level puts the ball back at the start ---------
{
  const level = world({ ground: [[[40, 760], [600, 760]], [[900, 760], [2000, 760]]] });
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  // Driven right only until it falls, then let go. Holding right for a fixed
  // stretch instead simply falls down the same hole twice, which is correct
  // behaviour and a useless thing to assert about.
  input.right = true;
  let steps = 0;
  const limit = Math.round(6.0 / CONFIG.STEP);
  while (ball.falls === 0 && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;

  console.log(`\n6. driven off the end of the ground, the ball fell ${ball.falls} time(s)` +
              ` after ${(steps * CONFIG.STEP).toFixed(1)}s`);
  if (ball.falls !== 1) fail(`expected exactly one fall, got ${ball.falls}`);
  if (Math.abs(ball.x - level.spawn.x) > 300) {
    fail(`after falling the ball is at x=${ball.x.toFixed(0)}, nowhere near the spawn at ${level.spawn.x}`);
  }

  // It has to be *playable* again, not merely repositioned: on the ground,
  // still, and not carrying the speed it fell with.
  input.right = false;
  run(ball, level, input, 1.0);
  if (!ball.grounded) fail('after respawning the ball never came to rest on the ground');
  if (Math.abs(ball.vy) > 1) fail(`after respawning the ball still has vy=${ball.vy.toFixed(1)}`);
  else console.log(`   and it is back on the ground at x=${ball.x.toFixed(0)}, at rest`);
}

// --- 7. a queued jump does not fire on respawn ---------------------------
//
// The subtle one. Falling down a hole while hammering jump leaves a press in
// the buffer, and a buffer that survives the respawn spends it the instant the
// ball touches the ground at the spawn — so the level begins with a jump the
// player did not ask for, every single time.
{
  const level = world({ ground: [[[40, 760], [600, 760]], [[900, 760], [2000, 760]]] });
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  const limit = Math.round(6.0 / CONFIG.STEP);
  let steps = 0, fellAt = -1;
  while (fellAt < 0 && steps < limit) {
    level.update(CONFIG.STEP);
    input.press();                       // jump hammered the whole way down
    const before = ball.falls;
    ball.update(CONFIG.STEP, input, level);
    if (ball.falls !== before) fellAt = steps;
    steps++;
  }
  if (fellAt < 0) fail('the ball never fell out of the level, so nothing was tested here');

  // The moment after the respawn: the buffer must be empty, so the ball is
  // sitting still at the spawn rather than launching off it.
  const bufferAfter = ball.buffer;
  input.right = false;
  let jumpedImmediately = false;
  for (let i = 0; i < 3; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);   // nothing pressed now
    if (ball.jumped) jumpedImmediately = true;
  }
  console.log(`\n7. jump hammered all the way down: fell after ${(fellAt * CONFIG.STEP).toFixed(1)}s,` +
              ` buffer on respawn ${bufferAfter.toFixed(3)}`);
  if (bufferAfter > 0) fail(`the jump buffer survived the respawn (${bufferAfter.toFixed(3)}s left in it)`);
  if (jumpedImmediately) fail('a jump buffered during the fall fired the moment the ball respawned');
  else console.log('   and the ball respawned with nothing queued');
}

// --- 8. a crate shoved into a hole comes back ----------------------------
//
// A crate with nothing under it falls for ever. Left alone that is a crate
// gone for good, and the day a level needs one to be finishable, "gone" means
// a child has permanently broken his own game with no way to undo it and no
// way to understand why.
{
  const level = world({
    ground: [[[40, 760], [700, 760]], [[1100, 760], [2000, 760]]],
    boxes: [{ x: 500, y: 660, w: 100, h: 100, movable: true }],
  });
  const crate = level.crates[0];
  const home = crate.x;
  const input = stub();
  const ball = new Ball(300, 700);

  // Stopped at the instant of the first fall. Running on for a fixed stretch
  // instead just lets the ball — still holding right — shove the respawned
  // crate straight back down the same hole, and then the crate is legitimately
  // mid-push somewhere and there is nothing to compare against.
  input.right = true;
  let steps = 0, lowest = crate.y;
  const limit = Math.round(12.0 / CONFIG.STEP);
  while (crate.falls === 0 && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    lowest = Math.max(lowest, crate.y);
    steps++;
  }

  console.log(`\n8. shoved into a hole after ${(steps * CONFIG.STEP).toFixed(1)}s: fell ${crate.falls} time(s),` +
              ` back at x=${crate.x.toFixed(1)} (level put it at ${home}), fell as far as y=${lowest.toFixed(0)}`);
  if (crate.falls < 1) fail('the crate was never actually pushed into the hole, so nothing was tested');
  if (Math.abs(crate.x - home) > 0.5) fail(`the crate came back to x=${crate.x.toFixed(1)} instead of where the level put it, ${home}`);
  if (crate.y > level.bounds.h) fail(`the crate is still below the level at y=${crate.y.toFixed(0)}`);
}

// --- 9. nothing anywhere ever goes NaN ------------------------------------
//
// The check that would have caught the worst bug in all of this in one run. A
// crate is something the ball STANDS on, which makes it a carrier exactly like
// a moving platform, and player.js adds `platform.dx` to the ball's position
// without asking whether it exists. A crate without a `dx` made that
// `undefined`, so the ball's position became NaN the first frame it stood on a
// crate and the ball vanished from the level — no error, no log, nothing but a
// missing ball.
{
  const level = world({
    boxes: [{ x: 600, y: 660, w: 120, h: 100, movable: true }],
    platforms: [{ x: 1200, y: 600, w: 150, h: 28, axis: 'y', dist: 80, period: 3, phase: 0 }],
  });
  const crate = level.crates[0];
  const input = stub();
  const ball = new Ball(660, 600);      // dropped straight onto the crate's lid

  const finite = (v) => Number.isFinite(v);
  let broke = null;
  for (let i = 0; i < Math.round(6 / CONFIG.STEP) && !broke; i++) {
    level.update(CONFIG.STEP);
    // Roll about on the lid, jump off it, land on it again.
    input.right = i % 240 < 120;
    input.left = !input.right;
    if (i % 60 === 0) input.press();
    ball.update(CONFIG.STEP, input, level);

    for (const [what, v] of [['ball.x', ball.x], ['ball.y', ball.y], ['ball.vx', ball.vx],
                             ['ball.vy', ball.vy], ['ball.spin', ball.spin],
                             ['crate.x', crate.x], ['crate.y', crate.y]]) {
      if (!finite(v)) { broke = `${what} went ${v} after ${(i * CONFIG.STEP).toFixed(2)}s`; break; }
    }
  }
  if (broke) fail(broke);
  else console.log(`\n9. 6s of riding, pushing and jumping off a crate: every value still finite`);

  // And standing on a crate must actually work — it is a floor.
  if (!ball.grounded && ball.y > 1000) fail('the ball ended up below the level after playing on a crate');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CRATE AND RESPAWN CHECKS PASSED');
process.exit(failures ? 1 : 0);
