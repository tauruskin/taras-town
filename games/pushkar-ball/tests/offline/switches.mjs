// A pressure switch and its gate: only a crate presses the switch, and the
// gate slides open while it's pressed and closes again once it isn't. This
// is the whole mechanic — the gate has no other way to open, and nothing
// about it is a resting place for the ball itself.
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

const GROUND_Y = 760;

/**
 * Flat ground with one switch/gate pair on it. The gate's `y` is its CLOSED
 * top — the same "y is the top, h reaches down to the ground" convention
 * level four's stone wall already uses — so `{ y: GROUND_Y - h, h }` sits
 * flush with the floor, fully blocking it.
 */
const world = (extra) => loadLevel({
  id: 97, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, GROUND_Y], [2360, GROUND_Y]]],
  boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2360, y: 0, w: 40, h: 1080 },
  ],
  platforms: [],
  switches: [{ id: 'g1', x: 900, y: GROUND_Y, w: 110 }],
  gates: [{ x: 1010, y: GROUND_Y - 200, w: 40, h: 200, switchId: 'g1' }],
  ...extra,
});

// --- 1. the loader builds a switch and a gate, gate starts closed --------
{
  const level = world();
  console.log(`\n1. ${level.switches.length} switch(es), ${level.gates.length} gate(s)`);
  if (level.switches.length !== 1) fail(`expected 1 switch, got ${level.switches.length}`);
  if (level.gates.length !== 1) fail(`expected 1 gate, got ${level.gates.length}`);
  if (level.switches[0].pressed) fail('a switch reads as pressed before anything is on it');
  if (level.gates[0].openT !== 0) fail(`a gate starts with openT=${level.gates[0].openT}, expected 0 (closed)`);
}

// --- 2. a closed gate blocks the ball --------------------------------------
{
  const level = world();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const input = stub();
  input.right = true;
  run(ball, level, input, 8);
  console.log(`\n2. rolled at a closed gate for 8s: stopped at x=${ball.x.toFixed(0)}`);
  if (ball.x > 1010) fail(`the ball is at x=${ball.x.toFixed(0)}, past the closed gate at x=1010`);
}

// --- 3. a crate on the switch presses it, and the gate opens --------------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2360, y: 0, w: 40, h: 1080 },
    { x: 850, y: GROUND_Y - 100, w: 100, h: 100, movable: true },
  ] });
  // Drop the crate straight onto the plate rather than pushing it — this
  // suite is about the switch and gate, not about crate-pushing, which
  // already has its own coverage.
  run(new Ball(-1000, -1000), level, stub(), 1.5);   // let the crate settle
  const sw = level.switches[0], gate = level.gates[0];
  console.log(`\n3. crate settled and grounded=${level.crates[0].grounded}; switch pressed=${sw.pressed}`);
  if (!level.crates[0].grounded) fail('3: the crate never settled, so nothing below was tested');
  if (!sw.pressed) fail('the switch never reads as pressed with a crate resting on it');
  // Give the gate its full CONFIG.GATE.OPEN_TIME to swing all the way open.
  for (let i = 0; i < Math.round((CONFIG.GATE.OPEN_TIME + 0.2) / CONFIG.STEP); i++) level.update(CONFIG.STEP);
  console.log(`   after ${(CONFIG.GATE.OPEN_TIME + 0.2).toFixed(2)}s: openT=${gate.openT.toFixed(2)}, switch animT=${sw.animT.toFixed(2)}`);
  if (gate.openT !== 1) fail(`gate openT is ${gate.openT}, expected exactly 1 (fully open)`);
  // CONFIG.SWITCH.PRESS_TIME is much shorter than CONFIG.GATE.OPEN_TIME, so by
  // the time the gate finishes opening, the switch's own dip animation has
  // long since finished too.
  if (sw.animT !== 1) fail(`switch animT is ${sw.animT}, expected exactly 1 (fully pressed) by the time the gate is fully open`);
  // Fully open means the gate has slid its own height clear of the ground —
  // its current bottom (gate.y + gate.h) must be at or above the ground it
  // used to block, or a "fully open" gate would still catch a rolling ball.
  if (gate.y + gate.h > GROUND_Y - 1) fail(`gate's bottom is at y=${(gate.y + gate.h).toFixed(0)}, still at or below the ground it should have cleared`);
}

// --- 4. an open gate lets the ball through ---------------------------------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2360, y: 0, w: 40, h: 1080 },
    { x: 850, y: GROUND_Y - 100, w: 100, h: 100, movable: true },
  ] });
  run(new Ball(-1000, -1000), level, stub(), 1.5 + CONFIG.GATE.OPEN_TIME + 0.2);
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const input = stub();
  input.right = true;
  run(ball, level, input, 8);
  console.log(`\n4. rolled at the open gate for 8s: reached x=${ball.x.toFixed(0)}`);
  if (ball.x < 1200) fail(`the ball only reached x=${ball.x.toFixed(0)}, the open gate still stopped it`);
}

// --- 5. remove the crate: the switch un-presses and the gate re-closes ----
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2360, y: 0, w: 40, h: 1080 },
    { x: 850, y: GROUND_Y - 100, w: 100, h: 100, movable: true },
  ] });
  run(new Ball(-1000, -1000), level, stub(), 1.5 + CONFIG.GATE.OPEN_TIME + 0.2);
  // Shove the crate off the plate to the left by hand — this suite has no
  // interest in HOW a crate gets moved, only in what the switch does once
  // it's gone.
  level.crates[0].x = 200;
  level.crates[0]._reseg();
  for (let i = 0; i < Math.round((CONFIG.GATE.OPEN_TIME + 0.2) / CONFIG.STEP); i++) level.update(CONFIG.STEP);
  console.log(`\n5. crate moved off the plate: switch pressed=${level.switches[0].pressed}, gate openT=${level.gates[0].openT.toFixed(2)}, switch animT=${level.switches[0].animT.toFixed(2)}`);
  if (level.switches[0].pressed) fail('the switch still reads as pressed with the crate gone');
  if (level.gates[0].openT !== 0) fail(`gate openT is ${level.gates[0].openT}, expected exactly 0 (closed again)`);
  if (level.switches[0].animT !== 0) fail(`switch animT is ${level.switches[0].animT}, expected exactly 0 (fully released) by the time the gate is fully closed`);
}

// --- 6. a gate owes the four carrier fields, like every other carrier -----
//
// CLAUDE.md's own rule: anything the ball can stand on is a carrier and
// owes dx, dy, vx, vy, or player.js's `platform.dx` line turns the ball's
// position into NaN the first frame it stands on one mid-swing. A gate's
// TOP is exactly such a surface while it's animating.
{
  const level = world();
  const gate = level.gates[0];
  for (const f of ['dx', 'dy', 'vx', 'vy']) {
    if (typeof gate[f] !== 'number') fail(`a fresh gate has no numeric '${f}' — a rider standing on it mid-swing would go NaN`);
  }
  console.log(`\n6. gate carrier fields: dx=${gate.dx}, dy=${gate.dy}, vx=${gate.vx}, vy=${gate.vy}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL SWITCH/GATE CHECKS PASSED');
process.exit(failures ? 1 : 0);
