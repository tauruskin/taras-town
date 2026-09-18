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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nWIRING WORKS');
process.exit(failures ? 1 : 0);
