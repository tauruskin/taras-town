// Winning: touching the flag, and what happens next.
//
// Checks 1 to 5 are the ball and the level list: that the ball notices the
// flag, only when it is actually there, that a win cannot be taken back, and
// that the list supports advancing. Check 6 is the state machine on top, in
// flow.js — auto-advance, retry, home, the controls switching off under the
// panel — which lives there rather than in main.js precisely so that it can
// be tested here. What is left in main.js is the camera, the drawing and the
// one line that goes to another page.
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
  // The freeze flow.js depends on being impossible. `dying` is decremented
  // only inside `Ball.update`, and flow.js stops updating the ball once the
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
  console.log(`   and in the same patch but away from the flag: won=${inSpikes.won}, hits=${inSpikes.hits}`);
  if (inSpikes.won) fail(`won at x=${inSpikes.x.toFixed(0)}, which is ${Math.abs(inSpikes.x - level.goal.x).toFixed(0)}px from the flag`);
  if (inSpikes.hits === 0) fail('the spike patch touched nothing, so the check above proves nothing about ordering');
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

// --- 6. the flow: winning, the panel, retry, home, and moving on ----------
//
// This is the state machine that used to live in main.js, where nothing could
// reach it. It is driven here through the REAL Input, not a stub, because
// half of what can go wrong is in the handover between the two: a finger
// still resting on the right arrow when the flag is touched, a tap that
// landed on the world a moment before the panel appeared, a jab where the
// jump button used to be. Input needs only a canvas that can report its
// bounds and a window to add listeners to, so both are faked; it never
// touches either at import time.
//
// Two levels of its own, rather than LEVELS, because LEVELS has one level
// until Task 6 and moving on needs somewhere to move on to. Each has a crate,
// a checkpoint and moving time, so a retry can be seen to rebuild all three.
{
  const { Flow } = await import('../../js/flow.js');
  const { Input } = await import('../../js/input.js');
  const { Buttons, Panel } = await import('../../js/ui.js');

  const W = 844, H = 390;
  // The window keeps the listeners Input gives it, so a real key can be
  // pressed: a keyboard jump is the one press that can arrive while the panel
  // is up and still reach the next level.
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  const key = (type, k) => listeners[type].forEach((fn) => fn({ key: k, repeat: false, preventDefault() {} }));
  const canvas = {
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  };
  const input = new Input(canvas);
  let nextId = 1;
  // A finger going down, and optionally coming back up. Positions come from
  // ui.js, never from this file.
  const down = (p) => { const id = nextId++; input._down({ clientX: p.x, clientY: p.y, pointerId: id, preventDefault() {} }); return id; };
  const up = (id) => input._up({ pointerId: id });
  const tapAt = (p) => up(down(p));

  const flowLevel = (id) => ({
    id, theme: 'hills',
    bounds: { w: 2400, h: 1080 },
    spawn: { x: 200, y: 600 },
    goal: { x: 900, y: 760 },
    ground: [[[40, 760], [2000, 760]]],
    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 2000, y: 0, w: 40, h: 1080 },
      { x: 500, y: 700, w: 60, h: 60, movable: true },
    ],
    checkpoints: [{ x: 400, y: 760 }],
    platforms: [],
  });
  const levels = [flowLevel(81), flowLevel(82)];

  const starts = [];
  const flow = new Flow(input, { levels, onStart: (f) => starts.push(f.levelIndex) });
  flow.start(0);

  // Hold the right arrow until the flag, like a thumb would. Along the way,
  // tap the world exactly where retry WILL be once the panel is up: that tap
  // is stale by the time the panel exists and must not retry the level.
  const holding = down(Buttons.right(W, H));
  tapAt(Panel.retry(W, H));
  let steps = 0;
  while (flow.mode === 'playing' && steps < Math.round(12 / CONFIG.STEP)) { flow.step(CONFIG.STEP); steps++; }

  const crateMoved = flow.level.crates[0].x - 500;
  const cpTaken = flow.level.checkpoints[0].taken;
  const timeAtWin = flow.level.time;
  console.log(`\n6. won level ${levels[flow.levelIndex].id} after ${(steps * CONFIG.STEP).toFixed(2)}s: ` +
              `crate pushed ${crateMoved.toFixed(0)}px, checkpoint taken=${cpTaken}, level time ${timeAtWin.toFixed(2)}s`);
  if (flow.mode !== 'won') fail('rolling into the flag did not put the flow into its won state');
  if (!(crateMoved > 0 && cpTaken)) fail('the run to the flag did not move the crate and take the checkpoint, so the retry check below proves nothing');

  // The switch drained everything. The finger is STILL down on the right
  // arrow here — it never came up — and must not count.
  if (input.controls) fail('the controls are still live under the results panel');
  if (input.right) fail('a thumb resting on the right arrow when the flag was touched still holds right under the panel');
  if (input.takeTap() !== null) fail('a tap made on the world before the panel appeared survived into the panel');
  // With the controls off, a jab where jump used to be is only a tap.
  tapAt(Buttons.jump(W, H));
  if (input.takeJump()) fail('a tap where the jump button used to be queued a jump under the panel');
  const jab = input.takeTap();
  if (!jab) fail('with the controls off, a press on a control position was not recorded as a tap');
  else if (flow.tap(jab.x, jab.y, W, H) !== null) fail('a tap on the old jump button did something on the panel');
  // And a tap on retry is a tap on retry, never the right arrow, whatever the
  // panel's geometry happens to be — buttons.mjs keeps the two apart as well,
  // but this is the check that does not depend on that.
  tapAt(Panel.retry(W, H));
  if (input.right) fail('a tap on the panel\'s retry was taken as the right arrow');
  input.takeTap();
  up(holding);

  // Nothing simulates the ball while won. Counted by wrapping the ball's own
  // update, which is the only thing that could move it.
  const ball = flow.ball;
  const orig = ball.update.bind(ball);
  let ballSteps = 0;
  ball.update = (...a) => { ballSteps++; return orig(...a); };
  const frozenAt = { x: ball.x, y: ball.y };
  const hold = CONFIG.RESULTS.HOLD;
  const toAdvance = Math.round(hold / CONFIG.STEP);
  for (let i = 0; i < toAdvance - 1; i++) flow.step(CONFIG.STEP);
  console.log(`   ${toAdvance - 1} steps into the panel: level ${flow.levelIndex}, mode ${flow.mode}, ball stepped ${ballSteps} times`);
  if (ballSteps !== 0) fail(`the ball was stepped ${ballSteps} times behind the results panel`);
  if (ball.x !== frozenAt.x || ball.y !== frozenAt.y) fail('the ball moved behind the results panel');
  if (flow.level.time <= timeAtWin) fail('the level stopped running when the panel came up; the platforms would freeze');

  // Retry, from inside the HOLD, rebuilds the level: the crate is back, the
  // checkpoint untaken, time zero, the ball at the spawn, and it is a new
  // level object rather than the old one tidied.
  if (flow.mode !== 'won' || flow.levelIndex !== 0) fail(`moved on after ${toAdvance - 1} steps, before RESULTS.HOLD of ${hold}s`);
  const oldLevel = flow.level;
  // Space pressed while the panel is up. The ball is not simulated, so it
  // sits in Input as a queued jump — and the level that follows must not
  // begin with a jump nobody asked for.
  key('keydown', ' ');
  key('keyup', ' ');
  tapAt(Panel.retry(W, H));
  const t = input.takeTap();
  const res = t ? flow.tap(t.x, t.y, W, H) : 'no tap recorded';
  console.log(`   tapped retry: ${res}; level ${flow.levelIndex}, mode ${flow.mode}, crate at ${flow.level.crates[0].x}, ` +
              `checkpoint taken=${flow.level.checkpoints[0].taken}, time ${flow.level.time}, ball at ${flow.ball.x},${flow.ball.y}`);
  if (res !== 'retry') fail(`tapping the panel's retry returned ${res}`);
  if (flow.level === oldLevel) fail('retry kept the old level object');
  if (flow.levelIndex !== 0 || flow.mode !== 'playing') fail('retry did not restart the same level in play');
  if (flow.level.crates[0].x !== 500) fail(`retry left the crate where it was pushed, at x=${flow.level.crates[0].x}`);
  if (flow.level.checkpoints[0].taken) fail('retry left the checkpoint taken');
  if (flow.level.time !== 0) fail(`retry kept the level's time at ${flow.level.time}`);
  if (flow.ball === ball || flow.ball.x !== 200 || flow.ball.won) fail('retry did not give a fresh ball at the spawn');
  if (!input.controls) fail('the controls stayed off after retry');
  if (input.takeJump()) fail('a jump pressed on the keyboard under the panel was carried into the retried level');

  // Auto-advance at exactly RESULTS.HOLD: not a step before, and on the step
  // that reaches it.
  const again = down(Buttons.right(W, H));
  steps = 0;
  while (flow.mode === 'playing' && steps < Math.round(12 / CONFIG.STEP)) { flow.step(CONFIG.STEP); steps++; }
  up(again);
  for (let i = 0; i < toAdvance - 1; i++) flow.step(CONFIG.STEP);
  const before = { index: flow.levelIndex, mode: flow.mode };
  flow.step(CONFIG.STEP);
  console.log(`   auto-advance: after ${toAdvance - 1} steps level ${before.index} ${before.mode}; after ${toAdvance} level ${flow.levelIndex} ${flow.mode}`);
  if (before.index !== 0 || before.mode !== 'won') fail(`advanced a step early, before RESULTS.HOLD`);
  if (flow.levelIndex !== 1 || flow.mode !== 'playing') fail(`did not advance on the step that reached RESULTS.HOLD`);
  if (!input.controls) fail('the controls stayed off on the new level');

  // Home is handed back as a value; the flow itself goes nowhere.
  const last = down(Buttons.right(W, H));
  steps = 0;
  while (flow.mode === 'playing' && steps < Math.round(12 / CONFIG.STEP)) { flow.step(CONFIG.STEP); steps++; }
  up(last);
  const hm = Panel.home(W, H);
  const homeRes = flow.tap(hm.x, hm.y, W, H);
  if (homeRes !== 'home') fail(`tapping the panel's house returned ${homeRes}`);
  if (flow.mode !== 'won' || flow.levelIndex !== 1) fail('tapping home changed the level or the mode');

  // The last level has nowhere to go, so it stays on its panel.
  flow.step(hold + 2);
  for (let i = 0; i < Math.round(2 / CONFIG.STEP); i++) flow.step(CONFIG.STEP);
  console.log(`   the last level, well past HOLD: level ${flow.levelIndex}, mode ${flow.mode}`);
  if (flow.levelIndex !== 1 || flow.mode !== 'won') fail('the last level did not stay on its panel');

  // A tap while playing never retries or goes home.
  flow.start(0);
  const r = Panel.retry(W, H);
  if (flow.tap(r.x, r.y, W, H) !== null) fail('a tap where retry would be did something while the level was being played');

  console.log(`   onStart ran for levels ${starts.join(', ')}`);
  if (starts.join() !== '0,0,1,0') fail(`onStart ran for ${starts.join(', ')}, expected 0, 0, 1, 0`);
}

// Check 6 installed a fake `window` so the real Input could be constructed in
// node. Take it away again, so that nothing added after it here inherits a
// half-built browser and passes or fails because of it.
delete globalThis.window;

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PROGRESS CHECKS PASSED');
process.exit(failures ? 1 : 0);
