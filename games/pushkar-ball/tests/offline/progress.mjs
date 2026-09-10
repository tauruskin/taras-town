// Winning: touching the flag, and what happens next.
//
// The state machine lives in main.js, which needs a DOM, so what this suite
// tests is everything underneath it: that the ball notices the flag, that it
// notices it only when it is actually there, that a win cannot be taken back,
// and that the level list supports advancing. main.js's own wiring is checked
// by eye and by the browser suites.
//
// Every test world here is WALLED at both ends. That is not decoration: Task
// 4's spike suite passed with the hazard code deleted, because it only asked
// "did the ball die" and the ball had rolled off the end of an unwalled world
// and died of the fall instead. A wall means a death is the death the check is
// about, and it also means a roll can be given a generous number of seconds
// without the ball leaving the level while nobody is looking.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { LEVELS, loadLevel, nextLevel } = await import('../../js/levels.js');

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

/** Roll right until the flag, or until `seconds` are up. Returns the steps. */
const rollToFlag = (ball, level, input, seconds = 8) => {
  const limit = Math.round(seconds / CONFIG.STEP);
  let steps = 0;
  input.right = true;
  while (!ball.won && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;
  return steps;
};

// Flat ground with a wall at each end, a spawn on the left and a flag in the
// middle. `extra` merges in spikes or moves the flag for the checks that want
// something different.
const world = (extra = {}) => loadLevel({
  id: 92, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  goal: { x: 900, y: 760 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2000, y: 0, w: 40, h: 1080 },
  ],
  platforms: [],
  ...extra,
});

// --- 1. rolling into the flag wins ---------------------------------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);
  if (ball.won) fail('the ball started out already having won');

  const steps = rollToFlag(ball, level, input);

  console.log(`\n1. rolled into the flag after ${(steps * CONFIG.STEP).toFixed(2)}s at x=${ball.x.toFixed(0)} (flag at ${level.goal.x})`);
  if (!ball.won) fail('rolled straight over the flag without winning');
  // WHERE it won, not merely that it did. A `won` that latched the moment the
  // level loaded would satisfy the line above and nothing else.
  if (Math.abs(ball.x - level.goal.x) > CONFIG.GOAL.R + 40) {
    fail(`won at x=${ball.x.toFixed(0)}, too far from the flag at ${level.goal.x}`);
  }
  if (ball.deaths > 0) fail(`died ${ball.deaths} time(s) on the way to the flag across flat ground`);
}

// --- 2. it does not win from across the level ----------------------------
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 2.0);          // sitting still, far from the flag
  console.log(`\n2. sat at x=${ball.x.toFixed(0)} with the flag at ${level.goal.x}: won=${ball.won}`);
  if (ball.won) fail('won without going anywhere near the flag');

  // And the reach is a radius, not the whole level: a ball parked just outside
  // it must still be outside it. A GOAL.R of, say, 5000 would break this and
  // check 1 alone would never notice.
  const gap = CONFIG.GOAL.R + 30;
  const near = world({ goal: { x: 200 + gap, y: 740 } });
  const parked = new Ball(near.spawn.x, near.spawn.y);
  run(parked, near, stub(), 2.0);
  console.log(`   a flag ${gap}px away from a still ball: won=${parked.won}`);
  if (parked.won) fail(`won a flag ${gap}px away, which is outside GOAL.R of ${CONFIG.GOAL.R}`);
}

// --- 3. a level with no flag can never be won ----------------------------
//
// Every level in LEVELS has one, but a test level might not, and `won` going
// true because `undefined` was near the ball would be a silent disaster.
{
  const level = loadLevel({
    id: 91, theme: 'hills', bounds: { w: 1200, h: 1080 },
    spawn: { x: 200, y: 600 },
    ground: [[[40, 760], [1000, 760]]],
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 1000, y: 0, w: 40, h: 1080 }],
    platforms: [],
  });
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const steps = rollToFlag(ball, level, input, 4.0);
  console.log(`\n3. a level with no goal, after ${(steps * CONFIG.STEP).toFixed(2)}s at x=${ball.x.toFixed(0)}: won=${ball.won}`);
  if (ball.won) fail('won a level that has no flag in it');
}

// --- 4. dying does not un-win, and winning outlives a death --------------
//
// Once the flag is touched the level is over. A stray death in the same step —
// the ball landing on the flag and rolling into something — must not steal it.
{
  const level = world();
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  rollToFlag(ball, level, input);
  const wonAt = ball.x;
  ball.die();
  // The freeze main.js depends on being impossible. `dying` is decremented
  // only inside `Ball.update`, and main.js stops updating the ball once the
  // level is won — so a ball left mid-deflate at the moment of the win would
  // stay a flat puddle behind the results panel for ever. `die` is therefore a
  // no-op once `won` is latched, and this is the check that says so.
  console.log(`\n4. died right after winning at x=${wonAt.toFixed(0)}: won=${ball.won}, dying=${ball.dying.toFixed(2)}, deaths=${ball.deaths}`);
  if (ball.dying !== 0) fail(`die() after the flag began a deflate (dying=${ball.dying}) that nothing will ever finish`);
  run(ball, level, input, CONFIG.DEFLATE.TIME + 0.5);
  if (!ball.won) fail('a death after the flag took the win away');
  if (Math.abs(ball.x - level.goal.x) > CONFIG.GOAL.R + 40) {
    fail(`the ball left the flag for x=${ball.x.toFixed(0)} after winning, so a respawn ran anyway`);
  }

  // Latched means latched. Roll on past the flag and well out of its reach —
  // the wall at the far end keeps the ball in the level — and the win must
  // still be there. Without this, a `won` that was merely "is the ball near
  // the flag right now" passes every other check in this suite, because in all
  // of them the ball has barely moved after winning.
  input.right = true;
  run(ball, level, input, 2.0);
  input.right = false;
  const beyond = ball.x - level.goal.x;
  console.log(`   rolled on to ${beyond.toFixed(0)}px past the flag: won=${ball.won}`);
  if (beyond < CONFIG.GOAL.R * 3) fail(`only got ${beyond.toFixed(0)}px past the flag, so the latch was not tested`);
  if (!ball.won) fail('the win was lost by rolling away from the flag, so it is not latched');

  // The other half of the same freeze. A ball that had just come back from a
  // death and then rolled straight into the flag would be mid-INFLATE when it
  // won, and `reviving` is only ever decremented in `update` too — so it would
  // stay part-inflated behind the panel, with the screen still part dimmed,
  // for as long as the panel was up. Winning therefore makes the ball whole.
  const midInflate = new Ball(level.goal.x, level.goal.y - CONFIG.BALL.R);
  midInflate.reviving = CONFIG.DEFLATE.INFLATE;
  run(midInflate, level, input, CONFIG.STEP);
  console.log(`   winning while re-inflating: won=${midInflate.won}, reviving=${midInflate.reviving.toFixed(2)}`);
  if (!midInflate.won) fail('a ball standing on the flag while re-inflating did not win');
  if (midInflate.reviving !== 0) {
    fail(`won with reviving=${midInflate.reviving}, which nothing will ever count down`);
  }
}

// --- 4b. the flag outranks the spikes it stands in ------------------------
//
// The goal check runs BEFORE the hazard check, so a ball that is at the flag
// while overlapping a spike wins rather than dies. Which of the two happens
// must not depend on how a level was authored.
//
// Placed rather than rolled, on purpose. Rolling in makes the answer a matter
// of which boundary the ball's 3.5px step happens to cross first, so a rolling
// version of this check would pass under either ordering as often as not.
// Standing the ball ON the flag inside the patch means both conditions are
// true in the same step and the order is the only thing left that can decide.
//
// The second ball is what stops the first from self-cancelling: it stands in
// the SAME patch, away from the flag, and must die. Without it a patch that
// had stopped hitting anything at all would make the first ball's win look
// like the ordering working.
{
  const level = world({
    goal: { x: 900, y: 760 },
    spikes: [{ x: 700, y: 760, w: 300 }],
  });
  const input = stub();

  const onFlag = new Ball(level.goal.x, level.goal.y - CONFIG.BALL.R);
  run(onFlag, level, input, 0.5);
  console.log(`\n4b. standing on a flag that is inside a spike patch: won=${onFlag.won}, deaths=${onFlag.deaths}, dying=${onFlag.dying.toFixed(2)}`);
  if (!onFlag.won) fail('a flag standing in a patch of spikes did not end the level');
  if (onFlag.deaths > 0) fail(`the ball died ${onFlag.deaths} time(s) on a flag it should have won at, so the hazard was checked first`);
  if (onFlag.dying !== 0) fail('the ball is deflating on the flag it just won at');

  const inSpikes = new Ball(level.spikes[0].x + 30, level.goal.y - CONFIG.BALL.R);
  run(inSpikes, level, input, 0.5);
  console.log(`   and in the same patch but away from the flag: won=${inSpikes.won}, deaths=${inSpikes.deaths}`);
  if (inSpikes.won) fail(`won at x=${inSpikes.x.toFixed(0)}, which is ${Math.abs(inSpikes.x - level.goal.x).toFixed(0)}px from the flag`);
  if (inSpikes.deaths === 0) fail('the spike patch killed nothing, so the check above proves nothing about ordering');
}

// --- 5. the level list knows what comes next -----------------------------
{
  console.log(`\n5. ${LEVELS.length} levels; ids ${LEVELS.map((l) => l.id).join(', ')}`);
  if (LEVELS.length < 2) fail('there is nothing to advance into');

  for (let i = 0; i < LEVELS.length - 1; i++) {
    if (nextLevel(i) !== i + 1) fail(`nextLevel(${i}) is ${nextLevel(i)}, expected ${i + 1}`);
  }
  const last = LEVELS.length - 1;
  if (nextLevel(last) !== null) {
    fail(`nextLevel on the last level is ${nextLevel(last)}, expected null — there is nowhere to go`);
  } else {
    console.log(`   and nextLevel(${last}) is null, because the last level has nowhere to advance to`);
  }

  // Every level must be loadable and give a ball somewhere to stand. A level
  // that throws on load is a level the auto-advance walks straight into.
  for (let i = 0; i < LEVELS.length; i++) {
    const level = loadLevel(LEVELS[i]);
    const ball = new Ball(level.spawn.x, level.spawn.y);
    const input = stub();
    run(ball, level, input, 2.0);
    if (!ball.grounded) fail(`level ${LEVELS[i].id}: a ball dropped at the spawn never settled`);
    if (ball.deaths > 0) fail(`level ${LEVELS[i].id}: a ball dropped at the spawn died ${ball.deaths} time(s) doing nothing`);
    if (ball.won) fail(`level ${LEVELS[i].id}: the spawn is inside the flag`);
  }
  console.log(`   every level loads, and a ball dropped at each spawn settles without dying`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PROGRESS CHECKS PASSED');
process.exit(failures ? 1 : 0);
