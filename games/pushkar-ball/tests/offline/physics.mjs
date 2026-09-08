// The simulation, with no browser anywhere near it.
//
// The step is a fixed 1/120s, so this is not an approximation of what the game
// does — it is the same arithmetic, and these numbers are exact. That is the
// whole reason the physics modules are forbidden from touching the DOM.
const { CONFIG } = await import('../../js/config.js');
const { segment, boxSegments, SegmentGrid, step } = await import('../../js/physics.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const near = (a, b, tol, what) => {
  if (Math.abs(a - b) > tol) fail(`${what}: got ${a.toFixed(2)}, wanted ${b.toFixed(2)} +/-${tol}`);
};

const ball = (x, y) => ({ x, y, r: CONFIG.BALL.R, vx: 0, vy: 0 });

/** A collider around a fixed set of segments, which is all `step` needs. */
const world = (segs) => {
  const grid = new SegmentGrid(segs);
  return { near: (x, y, r) => [...grid.near(x, y, r)] };
};

const run = (b, w, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) step(b, w, CONFIG.STEP, CONFIG);
  return b;
};

// --- 1. normals point out of the solid ------------------------------------
//
// Winding order decides which side of a segment is solid, and getting it
// backwards makes a surface you fall through. Ground is authored left to right,
// so its normal must point up — and up is NEGATIVE y on a screen.
console.log('\n1. normals');
{
  const flat = segment(0, 700, 600, 700);
  near(flat.nx, 0, 1e-9, 'flat ground normal x');
  near(flat.ny, -1, 1e-9, 'flat ground normal y');

  // A box is four segments and every one of them must face outwards.
  const [top, right, bottom, left] = boxSegments(100, 100, 50, 50);
  near(top.ny, -1, 1e-9, 'box top normal y');
  near(right.nx, 1, 1e-9, 'box right normal x');
  near(bottom.ny, 1, 1e-9, 'box bottom normal y');
  near(left.nx, -1, 1e-9, 'box left normal x');
}

// --- 2. a ball dropped on flat ground settles and stays settled -----------
//
// Settling is the easy half. STAYING settled is the half that catches the
// classic bug: a restitution applied all the way down to zero leaves the ball
// jittering for ever at ever-smaller amplitudes, never resting and never
// reading as grounded two steps running — which makes jumping unreliable in a
// way that looks random.
console.log('\n2. resting on flat ground');
{
  const w = world([segment(0, 700, 1200, 700)]);
  const b = ball(600, 300);
  run(b, w, 3);
  near(b.y, 700 - CONFIG.BALL.R, 0.5, 'resting centre height');
  near(b.vy, 0, 1, 'resting vertical speed');

  const y0 = b.y;
  run(b, w, 2);
  near(b.y, y0, 0.05, 'still resting two seconds later');
  console.log(`   settled at y=${b.y.toFixed(2)} and stayed there`);
}

// --- 3. a ball on a slope rolls downhill ----------------------------------
console.log('\n3. a slope');
{
  // Down to the right: 600 across, 300 down, about 27 degrees.
  const w = world([segment(0, 400, 600, 700)]);
  const b = ball(100, 300);
  run(b, w, 1.2);
  if (b.vx < 60) fail(`ball on a slope only reached vx ${b.vx.toFixed(1)} — it should roll downhill`);
  if (b.x < 110) fail('ball on a slope did not move downhill at all');
  console.log(`   rolled to vx ${b.vx.toFixed(0)} px/s`);
}

// --- 4. nothing ever ends a step inside a segment -------------------------
//
// The check that matters most, because the symptom of failing it is a ball that
// sinks into the floor or teleports out of it, and that is invisible in a
// screenshot until it happens to someone playing.
console.log('\n4. never inside anything');
{
  const segs = [
    segment(0, 700, 900, 700),
    segment(900, 700, 1200, 560),
    segment(1200, 560, 1600, 560),
    ...boxSegments(0, 0, 40, 900),
    ...boxSegments(1560, 0, 40, 900),
  ];
  const w = world(segs);
  const b = ball(200, 300);
  let worst = Infinity;
  let touches = 0;

  // A scripted shove about — deterministic, so a failure is reproducible.
  //
  // The kick is UPWARD ONLY WHEN THE BALL IS ON SOMETHING, which is how a
  // player jumps. The first version of this simply reset vy upward every 40
  // steps regardless, and that out-paces gravity: the ball drifted off the top
  // of the world, touched nothing for ten seconds, and the check passed while
  // proving absolutely nothing. Hence the two assertions below it, which make
  // going vacuous a failure rather than a silent pass.
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let onSomething = false;
  for (let i = 0; i < 1200; i++) {
    if (i % 40 === 0) {
      b.vx = (rnd() * 2 - 1) * CONFIG.MAX_SPEED;
      if (onSomething) b.vy = -rnd() * CONFIG.JUMP_V;
    }
    const made = step(b, w, CONFIG.STEP, CONFIG);
    onSomething = made.some((c) => c.ny < CONFIG.GROUND_NY);
    touches += made.length;

    for (const s of segs) {
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ox = b.x - (s.ax + t * dx), oy = b.y - (s.ay + t * dy);
      const d = Math.hypot(ox, oy);
      // Only on the solid side: a one-sided floor is allowed to have the ball
      // underneath it, and measuring that as an overlap would be nonsense.
      if (d > 0 && (ox / d) * s.nx + (oy / d) * s.ny > 0) worst = Math.min(worst, d);
    }
  }
  console.log(`   ${touches} contacts, closest approach ${worst.toFixed(2)} (radius ${CONFIG.BALL.R})`);
  if (worst < CONFIG.BALL.R - 0.6) fail(`ball got ${worst.toFixed(2)} from a surface — that is inside it`);

  // The two that stop this passing for the wrong reason. A ball that never
  // touches anything trivially never ends up inside anything.
  if (touches < 100) fail(`only ${touches} contacts in ten seconds — the ball is not being tested against anything`);
  if (worst > CONFIG.BALL.R + 2) fail(`the ball never actually came within ${(worst - CONFIG.BALL.R).toFixed(1)}px of touching a surface`);
}

// --- 5. a very fast ball does not pass through a wall ---------------------
//
// This is what the sub-stepping in `step` is for. Ten times top speed is far
// beyond anything the game produces; the point is that the guard exists, not
// that it is needed today.
console.log('\n5. no tunnelling');
{
  const w = world(boxSegments(1000, 0, 40, 900));
  const b = ball(500, 400);
  b.vx = CONFIG.MAX_SPEED * 10;
  run(b, w, 1);
  if (b.x > 1000) fail(`ball at ${(CONFIG.MAX_SPEED * 10).toFixed(0)} px/s passed through the wall (x=${b.x.toFixed(0)})`);
  else console.log(`   stopped at x=${b.x.toFixed(0)}, wall at 1000`);
}

// --- 6. jump height matches the arithmetic --------------------------------
//
// Closed form, so this catches gravity being applied twice, or once per
// sub-step, or before the position instead of after it.
console.log('\n6. jump height');
{
  const w = world([segment(0, 700, 1200, 700)]);
  const b = ball(600, 300);
  run(b, w, 2);
  const rest = b.y;
  b.vy = -CONFIG.JUMP_V;
  let peak = rest;
  for (let i = 0; i < Math.round(1.5 / CONFIG.STEP); i++) {
    step(b, w, CONFIG.STEP, CONFIG);
    peak = Math.min(peak, b.y);
  }
  const height = rest - peak;
  const want = (CONFIG.JUMP_V * CONFIG.JUMP_V) / (2 * CONFIG.GRAVITY);
  console.log(`   rose ${height.toFixed(1)} px (arithmetic says ${want.toFixed(1)})`);
  near(height, want, 6, 'jump height');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PHYSICS CHECKS PASSED');
process.exit(failures ? 1 : 0);
