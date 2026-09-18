// Wiring: what presses what, and what a door needs.
//
// Part 1 is the logic on its own, with pressers made by hand — no level, no
// ball. Later parts (added in Tasks 3 and 4) drive a real ball on a real
// level.
const { CONFIG } = await import('../../js/config.js');
const C = await import('../../js/circuits.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const STEP = CONFIG.STEP;
const P = CONFIG.CIRCUIT;

const senders = (list) => list.map((d, i) => C.makeSender(d, i, CONFIG));
const tick = (ss, pressers, seconds = STEP) => {
  const n = Math.max(1, Math.round(seconds / STEP));
  for (let i = 0; i < n; i++) C.updateSenders(ss, STEP, pressers, CONFIG);
};
// A presser standing just touching a left-facing post at x=500 on y=760.
const touchLeft = { x: 500 - 40, y: 720, w: 40, h: 40, heavy: false, resting: true };
const away = { x: 100, y: 720, w: 40, h: 40, heavy: false, resting: true };

console.log('\n1. a plate is weighed, never hit');
{
  const ss = senders([{ id: 'p', kind: 'plate', x: 500, y: 760, w: 110 }]);
  tick(ss, [{ x: 520, y: 720, w: 40, h: 40, heavy: false, resting: true }]);
  if (ss[0].pressed) fail('the ball pressed a plate');
  tick(ss, [{ x: 505, y: 660, w: 100, h: 100, heavy: true, resting: false }]);
  if (ss[0].pressed) fail('a crate still falling pressed a plate');
  tick(ss, [{ x: 505, y: 660, w: 100, h: 100, heavy: true, resting: true }]);
  if (!ss[0].pressed) fail('a crate resting on a plate did not press it');
  tick(ss, []);
  if (ss[0].pressed) fail('a plate stayed pressed with nothing on it');
  tick(ss, [{ x: 700, y: 660, w: 100, h: 100, heavy: true, resting: true }]);
  if (ss[0].pressed) fail('a crate beside a plate, not overlapping it, pressed it');
}

console.log('\n2. a button latches');
{
  const ss = senders([{ id: 'b', kind: 'button', x: 500, y: 760, face: 'left' }]);
  tick(ss, [away]);
  if (ss[0].pressed) fail('a button was pressed by something nowhere near it');
  tick(ss, [touchLeft]);
  if (!ss[0].pressed) fail('touching a left button on its left did not press it');
  tick(ss, [away], 5);
  if (!ss[0].pressed) fail('a button let go once nothing touched it');
}

console.log('\n3. only the capped side presses');
{
  const ss = senders([{ id: 'b', kind: 'button', x: 500, y: 760, face: 'right' }]);
  tick(ss, [touchLeft]);
  if (ss[0].pressed) fail('a right-facing button was pressed from its left, plain side');
  tick(ss, [{ x: 500 + P.POST_W, y: 720, w: 40, h: 40, heavy: false, resting: true }]);
  if (!ss[0].pressed) fail('a right-facing button was not pressed from its right');
}

console.log('\n4. a timer runs out after exactly its time, and only a new hit refills it');
{
  const ss = senders([{ id: 't', kind: 'timer', x: 500, y: 760, face: 'left', time: 2 }]);
  tick(ss, [touchLeft]);                       // hit
  // Keep touching: that is NOT a new hit, so the ring drains anyway.
  let steps = 1;
  while (ss[0].pressed && steps < 1000) { tick(ss, [touchLeft]); steps++; }
  const ran = steps * STEP;
  console.log(`   a timer of 2s held against went off after ${ran.toFixed(3)}s`);
  // Two and a half steps of slack: the hit step itself, and floating-point
  // dust in 240 subtractions of 1/120 that can leave one step's sliver.
  if (Math.abs(ran - 2) > STEP * 2.5) fail(`a 2s timer ran for ${ran.toFixed(3)}s while a presser leaned on it`);

  tick(ss, [away]);
  tick(ss, [touchLeft]);                       // a fresh hit
  if (!ss[0].pressed || Math.abs(ss[0].left - 2) > 1e-9) fail('a fresh hit did not start the timer full');
  tick(ss, [away], 1);
  const before = ss[0].left;
  tick(ss, [touchLeft]);                       // another fresh hit while running
  if (ss[0].left <= before) fail(`a fresh hit while running did not refill it (${before.toFixed(2)} -> ${ss[0].left.toFixed(2)})`);
}

console.log('\n5. AND and NOT');
{
  const ss = senders([
    { id: 'a', kind: 'button', x: 500, y: 760, face: 'left' },
    { id: 'b', kind: 'button', x: 900, y: 760, face: 'left' },
  ]);
  if (C.powered(['a', 'b'], ss)) fail('AND powered with nothing pressed');
  ss[0].pressed = true;
  if (C.powered(['a', 'b'], ss)) fail('AND powered with one of two pressed');
  ss[1].pressed = true;
  if (!C.powered(['a', 'b'], ss)) fail('AND not powered with both pressed');
  if (C.powered(['!a'], ss)) fail('NOT powered while its sender is on');
  ss[0].pressed = false;
  if (!C.powered(['!a'], ss)) fail('NOT not powered while its sender is off');
  if (!C.lampLit('!a', ss) || C.lampLit('a', ss)) fail('lampLit disagrees with powered');
  if (C.powered(['nobody'], ss)) fail('a need naming no sender powered its receiver');
  if (C.powered([], ss)) fail('a receiver needing nothing is powered — it should stay shut');
}

console.log('\n6. reset');
{
  const ss = senders([
    { id: 'b', kind: 'button', x: 500, y: 760, face: 'left' },
    { id: 't', kind: 'timer', x: 900, y: 760, face: 'left', time: 3 },
  ]);
  ss[0].pressed = true; ss[1].pressed = true; ss[1].left = 2;
  C.resetSenders(ss);
  if (ss[0].pressed || ss[1].pressed || ss[1].left !== 0) fail('reset left a sender on');

  // A presser still touching after a reset (e.g. a crate parked against a
  // button after a respawn) re-presses it immediately — the post is
  // literally being pushed, so that is intended, not a leftover.
  const ss2 = senders([{ id: 'b2', kind: 'button', x: 500, y: 760, face: 'left' }]);
  tick(ss2, [touchLeft]);
  if (!ss2[0].pressed) fail('setup: touching did not press before the reset re-press check');
  C.resetSenders(ss2);
  tick(ss2, [touchLeft]);
  if (!ss2[0].pressed) fail('a presser still touching after reset did not re-press it');
}

console.log('\n7. warning');
{
  const ss = senders([{ id: 't', kind: 'timer', x: 500, y: 760, face: 'left', time: 3 }]);
  ss[0].pressed = true; ss[0].left = 2;
  if (C.warning(['t'], ss, CONFIG)) fail('warned with 2s left');
  ss[0].left = P.WARN - 0.1;
  if (!C.warning(['t'], ss, CONFIG)) fail(`did not warn with ${P.WARN - 0.1}s left`);
  if (C.warning(['!t'], ss, CONFIG)) fail('an inverted input warned — it is about to turn ON, not off');

  const ss2 = senders([{ id: 't2', kind: 'timer', x: 500, y: 760, face: 'left', time: 3 }]);
  if (C.warning(['t2'], ss2, CONFIG)) fail('an unpressed timer warned');

  const ss3 = senders([{ id: 'b2', kind: 'button', x: 500, y: 760, face: 'left' }]);
  ss3[0].pressed = true;
  if (C.warning(['b2'], ss3, CONFIG)) fail('a pressed button warned as if it were a running-out timer');
}

console.log('\n8. colours come from the list, in order');
{
  const ss = senders([
    { id: 'a', kind: 'button', x: 500, y: 760 },
    { id: 'b', kind: 'plate', x: 900, y: 760, w: 110 },
  ]);
  if (ss[0].colour !== CONFIG.COLOURS.WIRE[0] || ss[1].colour !== CONFIG.COLOURS.WIRE[1]) fail('sender colours are not the WIRE list in order');
  if (ss[0].face !== 'left') fail('a button with no face did not default to left');
  let threw = false;
  try { senders([{ id: 'x', kind: 'lever', x: 0, y: 0 }]); } catch (_) { threw = true; }
  if (!threw) fail('an unknown sender kind was accepted silently');

  threw = false;
  try { senders([{ id: 'y', kind: 'timer', x: 0, y: 0, time: 0 }]); } catch (_) { threw = true; }
  if (!threw) fail('a timer with no positive time was accepted silently');

  threw = false;
  try { senders([{ id: 'z', kind: 'plate', x: 0, y: 0, w: 0 }]); } catch (_) { threw = true; }
  if (!threw) fail('a plate with no positive width was accepted silently');

  const five = senders([
    { id: 'a', kind: 'button', x: 0, y: 0 },
    { id: 'b', kind: 'button', x: 0, y: 0 },
    { id: 'c', kind: 'button', x: 0, y: 0 },
    { id: 'd', kind: 'button', x: 0, y: 0 },
    { id: 'e', kind: 'button', x: 0, y: 0 },
  ]);
  if (five[4].colour !== CONFIG.COLOURS.WIRE[0]) fail('the fifth sender did not wrap around to WIRE[0]');
}

console.log('\n9. resting on top of a post does not press it, only hanging over its capped side does');
{
  const postTop = 760 - P.POST_H;
  const over = (bottom) => ({ x: 500 - 20, y: bottom - 40, w: 40, h: 40, heavy: false, resting: true });

  let ss = senders([{ id: 'r1', kind: 'button', x: 500, y: 760, face: 'left' }]);
  tick(ss, [over(postTop)]);
  if (ss[0].pressed) fail('a presser resting exactly on top of a post pressed it');

  ss = senders([{ id: 'r2', kind: 'button', x: 500, y: 760, face: 'left' }]);
  tick(ss, [over(postTop + 1e-9)]);
  if (ss[0].pressed) fail('a presser resting a hair below the post top pressed it (float dust)');

  ss = senders([{ id: 'r3', kind: 'button', x: 500, y: 760, face: 'left' }]);
  tick(ss, [over(postTop + 10)]);
  if (!ss[0].pressed) fail('a presser hanging 10 units over the capped side did not press it');
}

// --- Part 2: a real ball on a real level ----------------------------------
const { Ball } = await import('../../js/player.js');
const { loadLevel, LEVELS } = await import('../../js/levels.js');
const GROUND = 760;
const stage = (extra) => loadLevel({
  id: 96, theme: 'hills',
  bounds: { w: 3000, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, GROUND], [2960, GROUND]]],
  boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 }],
  platforms: [],
  ...extra,
});
const drive = (ball, level, want, seconds) => {
  const input = { left: !!want.left, right: !!want.right, takeJump: () => false };
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    level.update(STEP);
    ball.update(STEP, input, level);
  }
};

console.log('\n10. the ball rolls into a button, and the gate it drives opens');
{
  const level = stage({
    senders: [{ id: 'a', kind: 'button', x: 800, y: GROUND, face: 'left' }],
    gates: [{ x: 1200, y: GROUND - 200, w: 40, h: 200, needs: ['a'] }],
  });
  const ball = new Ball(400, GROUND - 20);
  drive(ball, level, { right: true }, 3);
  const s = level.senders[0];
  console.log(`   pressed=${s.pressed}, ball stopped at x=${ball.x.toFixed(1)}, gate openT=${level.gates[0].openT.toFixed(2)}`);
  if (!s.pressed) fail('rolling into a left button did not press it');
  if (ball.x > 800 - ball.r + 1) fail(`the ball went through the post — it is at ${ball.x.toFixed(1)}`);
  if (level.gates[0].openT !== 1) fail('the gate did not open fully');
}

console.log('\n11. a crate pushed into a button presses it');
{
  const level = stage({
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 },
            { x: 500, y: GROUND - 100, w: 100, h: 100, movable: true }],
    senders: [{ id: 'a', kind: 'button', x: 800, y: GROUND, face: 'left' }],
  });
  const ball = new Ball(420, GROUND - 20);
  drive(ball, level, { right: true }, 4);
  const crate = level.crates[0];
  console.log(`   crate stopped at x=${crate.x.toFixed(1)} (post at 800), pressed=${level.senders[0].pressed}`);
  if (crate.x + crate.w > 800 + 0.5) fail('the crate was pushed into the post');
  if (!level.senders[0].pressed) fail('the crate against the button did not press it');
}

console.log('\n12. a respawn puts buttons back');
{
  const level = stage({ senders: [{ id: 'a', kind: 'button', x: 800, y: GROUND, face: 'left' }] });
  const ball = new Ball(400, GROUND - 20);
  drive(ball, level, { right: true }, 3);
  if (!level.senders[0].pressed) fail('setup: the button was never pressed');
  ball.respawn(level);
  if (level.senders[0].pressed) fail('a respawn left a button pressed');
}

console.log('\n13. a closing gate does not come down on the ball');
{
  const level = stage({
    senders: [{ id: 't', kind: 'timer', x: 800, y: GROUND, face: 'left', time: 1.5 }],
    gates: [{ x: 1200, y: GROUND - 200, w: 40, h: 200, needs: ['t'] }],
  });
  const gate = level.gates[0];
  const ball = new Ball(400, GROUND - 20);
  // Pressed about 1s in, so at 2s the timer still has ~0.5s and the gate is
  // fully open when the ball is put under it.
  drive(ball, level, { right: true }, 2);
  if (!level.senders[0].pressed || gate.openT !== 1) fail(`setup: timer pressed=${level.senders[0].pressed}, gate openT=${gate.openT}`);
  ball.x = 1220; ball.y = GROUND - 20; ball.vx = 0; ball.vy = 0;   // stand under the gate
  drive(ball, level, {}, 2);                        // the timer runs out meanwhile
  console.log(`   ball under the gate after the timer ran out: openT=${gate.openT.toFixed(2)}, ball y=${ball.y.toFixed(1)}`);
  if (gate.openT < 0.99) fail(`the gate came down on the ball (openT ${gate.openT.toFixed(2)})`);
  // The timer has run out, so it is the hold keeping the gate up and not a
  // timer still counting down.
  if (level.senders[0].pressed) fail('setup: the timer was still running at the hold check');
  ball.x = 1500;
  drive(ball, level, {}, CONFIG.GATE.OPEN_TIME + 0.2);
  if (gate.openT !== 0) fail(`once the ball moved away the gate did not finish closing (openT ${gate.openT})`);
}

console.log('\n14. level six still loads its old switch as a plate');
{
  const level = loadLevel(LEVELS.find((l) => l.id === 6));
  const s = level.senders;
  if (s.length !== 1 || s[0].kind !== 'plate' || s[0].id !== 'gate1') fail(`level 6's senders are ${JSON.stringify(s.map((x) => [x.id, x.kind]))}`);
  if (level.switches[0] !== s[0]) fail('level.switches is not the plate sender itself');
  if (JSON.stringify(level.gates[0].needs) !== '["gate1"]') fail(`level 6's gate needs ${JSON.stringify(level.gates[0].needs)}`);
}

console.log('\n15. a ball resting flush against a gate\'s face does not hold it open');
{
  const level = stage({
    senders: [{ id: 't', kind: 'timer', x: 800, y: GROUND, face: 'left', time: 1.5 }],
    gates: [{ x: 1200, y: GROUND - 200, w: 40, h: 200, needs: ['t'] }],
  });
  const gate = level.gates[0];
  const ball = new Ball(400, GROUND - 20);
  drive(ball, level, { right: true }, 2);
  if (!level.senders[0].pressed || gate.openT !== 1) fail(`setup: timer pressed=${level.senders[0].pressed}, gate openT=${gate.openT}`);
  // Flush against the gate's left face while the timer runs out. Not rolling
  // right: while the gate is open that carries the ball straight under it
  // and on, and the test would pass with nothing touching the face at all.
  // Resting flush is exactly the case the 2-unit inset in isUnder exists for.
  const flush = 1200 - ball.r;
  ball.x = flush; ball.y = GROUND - 20; ball.vx = 0; ball.vy = 0;
  let drift = 0;
  const watch = (seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      drive(ball, level, {}, STEP);
      drift = Math.max(drift, Math.abs(ball.x - flush));
    }
  };
  let steps = 0;
  while (level.senders[0].pressed && steps < 1000) { watch(STEP); steps++; }
  watch(CONFIG.GATE.OPEN_TIME + 0.3);
  console.log(`   flush against the face after the timer ran out: openT=${gate.openT.toFixed(2)}, ball x=${ball.x.toFixed(2)} (drifted ${drift.toFixed(3)})`);
  if (drift > 0.5) fail(`setup: the ball did not stay flush with the gate's face (drifted ${drift.toFixed(3)})`);
  if (gate.openT !== 0) fail(`a ball leaning on the gate's face held it open (openT ${gate.openT.toFixed(2)}, ball x ${ball.x.toFixed(1)})`);
}

console.log('\n16. a bridge carries the ball across a gap at full speed');
{
  const level = stage({
    ground: [[[40, GROUND], [1000, GROUND]], [[1420, GROUND], [2960, GROUND]]],
    senders: [{ id: 'b', kind: 'button', x: 300, y: GROUND, face: 'right' }],
    bridges: [{ x: 1000, y: GROUND, w: 420, dir: 1, needs: ['b'] }],
  });
  level.senders[0].pressed = true;
  drive(new Ball(600, GROUND - 20), level, {}, CONFIG.BRIDGE.OPEN_TIME + 0.1);
  const br = level.bridges[0];
  if (br.openT !== 1) fail(`the bridge is not fully out (openT ${br.openT})`);
  if (br.segments.length !== 1 || br.segments[0].ny >= 0) fail('a bridge must be exactly one segment, solid side up');
  const ball = new Ball(600, GROUND - 20);
  let lowest = 0, minVx = Infinity;
  const input = { left: false, right: true, takeJump: () => false };
  for (let i = 0; i < Math.round(3 / STEP); i++) {
    level.update(STEP);
    ball.update(STEP, input, level);
    if (ball.x > 950 && ball.x < 1470) { lowest = Math.max(lowest, ball.y); minVx = Math.min(minVx, ball.vx); }
    if (![ball.x, ball.y, ball.vx, ball.vy].every(Number.isFinite)) { fail('the ball went NaN on the bridge'); break; }
  }
  console.log(`   crossing: lowest y=${lowest.toFixed(1)}, slowest vx=${minVx.toFixed(0)}, ended at x=${ball.x.toFixed(0)}`);
  if (ball.x < 1500) fail('the ball did not get across the bridge');
  if (lowest > GROUND - 20 + 2) fail(`the ball dipped to y=${lowest.toFixed(1)} crossing — a bump at a joint`);
  if (minVx < CONFIG.MAX_SPEED * 0.9) fail(`the ball slowed to ${minVx.toFixed(0)} crossing — it caught on a joint`);
}

console.log('\n17. an unpowered bridge withdraws from under the ball, and warns first');
{
  const level = stage({
    ground: [[[40, GROUND], [1000, GROUND]], [[1420, GROUND], [2960, GROUND]]],
    senders: [{ id: 't', kind: 'timer', x: 300, y: GROUND, face: 'right', time: 1.5 }],
    bridges: [{ x: 1000, y: GROUND, w: 420, dir: 1, needs: ['t'] }],
  });
  const t = level.senders[0];
  // Get the bridge fully out first, with time to spare, before the ball is
  // put on it — at t=0 there is no bridge to stand on.
  t.pressed = true; t.left = 10;
  for (let i = 0; i < Math.round(1 / STEP); i++) level.update(STEP);
  t.left = 1.5;
  const ball = new Ball(1300, GROUND - 20);
  let warned = false;
  const input = { left: false, right: false, takeJump: () => false };
  for (let i = 0; i < Math.round(1.4 / STEP); i++) {
    level.update(STEP);
    ball.update(STEP, input, level);
    if (level.bridges[0].warn) warned = true;
  }
  if (!warned) fail('the bridge never warned in its last second');
  if (ball.y > GROUND - 20 + 1) fail('the ball fell before the timer ran out');
  drive(ball, level, {}, 1.5);
  console.log(`   after the timer: ball y=${ball.y.toFixed(0)}, deaths=${ball.deaths}`);
  if (ball.y < GROUND + 50 && !ball.deaths) fail('the bridge did not withdraw from under the ball');
}

console.log('\n18. a crate on a withdrawing bridge falls and comes back');
{
  const level = stage({
    ground: [[[40, GROUND], [1000, GROUND]], [[1420, GROUND], [2960, GROUND]]],
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 },
            { x: 1020, y: 200, w: 100, h: 100, movable: true }],
    senders: [{ id: 'b', kind: 'button', x: 300, y: GROUND, face: 'right' }],
    bridges: [{ x: 1000, y: GROUND, w: 420, dir: 1, needs: ['b'] }],
  });
  level.senders[0].pressed = true;
  for (let i = 0; i < Math.round(2 / STEP); i++) level.update(STEP);
  const crate = level.crates[0];
  if (!crate.grounded || Math.abs(crate.y - (GROUND - 100)) > 1) fail(`setup: the crate is not resting on the bridge (y=${crate.y.toFixed(1)})`);
  level.senders[0].pressed = false;
  for (let i = 0; i < Math.round(3 / STEP); i++) level.update(STEP);
  console.log(`   crate falls=${crate.falls}, x=${crate.x}`);
  if (crate.falls < 1) fail('a crate on a withdrawn bridge did not fall and return');
  if (crate.x !== 1020) fail(`the returned crate is at x=${crate.x}, not where the level put it`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nWIRING WORKS');
process.exit(failures ? 1 : 0);
