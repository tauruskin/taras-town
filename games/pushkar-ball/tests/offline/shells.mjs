// The shell, in Node: it patrols upright, armoured and hurting; a crate
// falling on it or a charger's dash flips it, harmless and stompable, for
// FLIPPED seconds; a popped one comes back only when its home is clear; it
// holds a plate down; and a respawn puts it back home.
const { CONFIG } = await import('../../js/config.js');
const { loadLevel } = await import('../../js/levels.js');
const { Ball } = await import('../../js/player.js');
const { hitZone } = await import('../../js/circuits.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const S = CONFIG.ENEMY.SHELL, DT = CONFIG.STEP, FLOOR = 760, SY = FLOOR - S.R;
for (const k of Object.keys(S)) if (!Number.isFinite(S[k])) fail(`CONFIG.ENEMY.SHELL.${k} is not a number`);

// A flat room walled at both ends, as in poppers.mjs (suites share nothing).
// `extra` adds to it; its `boxes` are added to the two walls.
function room(extra = {}) {
  const { boxes = [], ...rest } = extra;
  return loadLevel({
    id: 91, theme: 'hills', bounds: { w: 3000, h: 1080 }, spawn: { x: 200, y: 600 },
    ground: [[[40, FLOOR], [2960, FLOOR]]],
    platforms: [], ...rest,
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 }, ...boxes],
  });
}
const ballAt = (x) => ({ x, y: FLOOR - CONFIG.BALL.R, r: CONFIG.BALL.R, grounded: true, dying: 0 });
function steps(level, seconds, each = () => {}) {
  for (let i = 0; i < Math.round(seconds / DT); i++) { level.update(DT); if (each(i) === false) break; }
}

// --- 1. it patrols its range, upright, hurting and unstompable ----------------
{
  const level = room({ enemies: [{ kind: 'shell', x: 1000, y: SY, from: 800, to: 1200 }] });
  const s = level.enemies[0];
  let lo = s.x, hi = s.x;
  steps(level, 15, () => { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x); });
  console.log(`\n1. shell patrolled ${lo.toFixed(0)}..${hi.toFixed(0)} (range 800..1200), state ${s.state}`);
  if (lo < 800 - 1 || hi > 1200 + 1) fail('a shell left its range');
  if (hi - lo < 300) fail('a shell did not patrol its range');
  if (s.stompable || s.harmless) fail('an upright shell is stompable or harmless');
  const body = { x: s.x, y: s.box().y - 5, r: CONFIG.BALL.R, vy: 300 };
  if (level.stompEnemy(body)) fail('a landing on an upright shell counted as a stomp');
  if (level.hazardKnockDir(body) === null) fail('a landing on an upright shell did not hurt');
  if (!(s.heavy && s.blocks && !s.presses)) fail(`shell wiring fields wrong: heavy ${s.heavy}, blocks ${s.blocks}, presses ${s.presses}`);
}

// --- 2. a falling crate flips it; a resting one does not ----------------------
{
  // A crate dropped from 340 above the floor (its top at y=360, floor 760).
  const level = room({
    enemies: [{ kind: 'shell', x: 1000, y: SY, from: 990, to: 1010 }],
    boxes: [{ x: 970, y: 360, w: 60, h: 60, movable: true }],
  });
  const s = level.enemies[0];
  const c = level.crates[0];
  let flippedAt = null, vyAtFlip = null, landedAt = null;
  steps(level, 2, () => {
    if (s.state === 'flipped' && flippedAt === null) { flippedAt = level.time; vyAtFlip = c.vy; }
    if (c.grounded && landedAt === null) landedAt = level.time;
  });
  console.log(`\n2a. a dropped crate flipped the shell: ${flippedAt !== null} at t=${flippedAt?.toFixed(3)} (crate vy then ${vyAtFlip?.toFixed(0)}, crate landed t=${landedAt?.toFixed(3)}; state now ${s.state}, shell x ${s.x.toFixed(0)}, crate x ${c.x.toFixed(0)})`);
  if (flippedAt === null) fail('a crate dropped on a shell did not flip it');
  if (flippedAt !== null && landedAt !== null && flippedAt > landedAt) fail('the shell flipped only after the crate had landed');
  const overlap = s.x + s.r > c.x && s.x - s.r < c.x + c.w;
  if (overlap) console.log('     (the shell is still under the crate: its kick was blocked — allowed, harmless)');
}
{
  // A crate resting on the floor never flips it, though the shell walks into its edge.
  const level = room({
    enemies: [{ kind: 'shell', x: 900, y: SY, from: 850, to: 1150 }],
    boxes: [{ x: 1100, y: FLOOR - 60, w: 60, h: 60, movable: true }],
  });
  const s = level.enemies[0];
  let flipped = false, hi = s.x;
  steps(level, 10, () => { if (s.state === 'flipped') flipped = true; hi = Math.max(hi, s.x); });
  console.log(`2b. resting crate at 1100: shell reached x ${hi.toFixed(0)}, flipped ${flipped}`);
  if (flipped) fail('a resting crate flipped a shell');
}

// --- 3. a charge flips it and dazes the charger --------------------------------
{
  const level = room({
    enemies: [
      { kind: 'charger', x: 600, y: FLOOR - CONFIG.ENEMY.CHARGER.R, from: 500, to: 1400, dir: 1 },
      { kind: 'shell', x: 1000, y: SY, from: 990, to: 1010 },
    ],
  });
  const [c, s] = level.enemies;
  let sawFlip = false, chargerState = null, sawCharge = false;
  steps(level, 3, () => {
    // Keep the ball just beyond the shell, in front of the charger, so it charges.
    level.ball = ballAt(Math.min(c.x + 200, 1100));
    if (c.state === 'charge') sawCharge = true;
    if (s.state === 'flipped' && !sawFlip) { sawFlip = true; chargerState = c.state; }
  });
  console.log(`\n3. a charge into a shell: charged ${sawCharge}, flipped ${sawFlip}, charger then ${chargerState}`);
  if (!sawCharge) fail('the charger never charged, so this test measured nothing');
  if (!sawFlip) fail('a charge did not flip the shell');
  if (chargerState !== 'dazed') fail(`the charger was ${chargerState} after flipping a shell, not dazed`);
}
{
  // A patrolling charger meeting a shell turns round and flips nothing.
  const level = room({
    enemies: [
      { kind: 'charger', x: 800, y: FLOOR - CONFIG.ENEMY.CHARGER.R, from: 500, to: 1400, dir: 1 },
      { kind: 'shell', x: 1000, y: SY, from: 990, to: 1010 },
    ],
  });
  const [c, s] = level.enemies;
  level.ball = ballAt(2500);
  let flipped = false, hi = c.x;
  steps(level, 4, () => { if (s.state === 'flipped') flipped = true; hi = Math.max(hi, c.x); });
  console.log(`3b. patrolling charger met the shell: furthest x ${hi.toFixed(0)}, shell flipped ${flipped}`);
  if (flipped) fail('a patrolling charger flipped a shell');
  if (hi > 1000) fail('a patrolling charger walked through a shell');
}

// --- 4. flipped: harmless, stompable, and it rights itself after FLIPPED ------
{
  const level = room({ enemies: [{ kind: 'shell', x: 1000, y: SY, from: 800, to: 1200 }] });
  const s = level.enemies[0];
  s.flip(1, level);
  if (!(s.harmless && s.stompable)) fail('a flipped shell is not harmless and stompable');
  if (!s.heavy) fail('a flipped shell stopped weighing plates');
  let back = null;
  steps(level, S.FLIPPED + 1, () => { if (back === null && s.state === 'patrol') back = level.time; });
  console.log(`\n4. flipped shell righted itself after ${back?.toFixed(2)}s (FLIPPED ${S.FLIPPED}, from config.js)`);
  if (!(Math.abs(back - S.FLIPPED) < 2 * DT + 1e-9)) fail(`righted itself after ${back}, not FLIPPED`);
}

// --- 5. stomped while flipped: popped; returns only when home is clear -------
{
  // The crate that will sit on its home starts far off and is moved there
  // once the shell is popped — the same crate object the level owns.
  const level = room({
    enemies: [{ kind: 'shell', x: 1000, y: SY, from: 800, to: 1200 }],
    boxes: [{ x: 2600, y: FLOOR - 60, w: 60, h: 60, movable: true }],
  });
  const s = level.enemies[0];
  const crate = level.crates[0];
  s.flip(0, level);
  steps(level, DT);
  const body = { x: s.x, y: s.box().y - 5, r: CONFIG.BALL.R, vy: 300 };
  if (!level.stompEnemy(body)) fail('a flipped shell could not be stomped');
  level.ball = ballAt(1000 + S.RETURN_CLEAR - 50);      // too near home
  steps(level, S.RETURN + 2);
  const nearBall = s.alive;
  if (s.alive) fail('a popped shell came back with the ball near its home');
  level.ball = ballAt(2500);
  crate.x = 980; crate._reseg();                        // on its home
  steps(level, 1);
  const onCrate = s.alive;
  if (s.alive) fail('a popped shell came back inside a crate on its home');
  crate.x = 2600; crate._reseg();
  steps(level, 1);
  console.log(`\n5. popped shell back: ball near ${nearBall}, crate on home ${onCrate}, home clear ${s.alive} (state ${s.state})`);
  if (!s.alive) fail('a popped shell never came back once its home was clear');
}

// --- 6. a shell holds a plate down, upright and flipped -----------------------
{
  const level = room({
    enemies: [{ kind: 'shell', x: 1000, y: SY, from: 995, to: 1005 }],
    senders: [{ id: 'p', kind: 'plate', x: 950, y: FLOOR, w: 110 }],
    gates: [{ x: 2000, y: 560, w: 40, h: 200, needs: ['p'] }],
  });
  steps(level, 1);
  const upright = level.senders[0].pressed;
  level.enemies[0].flip(0, level);
  steps(level, DT * 4);
  const flipped = level.senders[0].pressed;
  console.log(`\n6. plate under a shell: upright ${upright}, flipped ${flipped}`);
  if (!upright || !flipped) fail('a shell on a plate did not hold it down in both states');
}

// --- 6b. its weight never hits a button ----------------------------------------
// A shell turns at a button's post, so it can hardly reach the cap; this asks
// the wiring directly, with the shell's own presser box from Level.update laid
// right over a button's hit zone.
{
  const level = room({
    enemies: [{ kind: 'shell', x: 1000, y: SY, from: 995, to: 1005 }],
    senders: [{ id: 'b', kind: 'button', x: 1000, y: FLOOR, face: 'left' }],
    gates: [{ x: 2000, y: 560, w: 40, h: 200, needs: ['b'] }],
  });
  const s = level.enemies[0], b = level.senders[0];
  const z = hitZone(b, CONFIG);
  s.x = z.x + z.w / 2; s.y = z.y + z.h / 2;
  s.update = () => {};                                  // hold it there: this asks the wiring only
  steps(level, DT * 3);
  console.log(`6b. shell laid over a button's hit zone: pressed ${b.pressed}`);
  if (b.pressed) fail("a shell's weight pressed a button");
}

// --- 7. a respawn puts a shell back home, upright and patrolling ---------------
// Through the real respawn path, from both states that carry something over:
// flipped and kicked away, and popped.
for (const what of ['flipped', 'popped']) {
  const level = room({ enemies: [{ kind: 'shell', x: 1000, y: SY, from: 800, to: 1200, dir: -1 }] });
  const s = level.enemies[0];
  const ball = new Ball(2500, FLOOR - CONFIG.BALL.R);
  level.ball = ball;
  steps(level, 1);
  s.flip(1, level);
  steps(level, DT * 10);                               // mid-kick
  if (what === 'popped') level.pop(s), steps(level, DT);
  const before = s.state;
  ball.respawn(level);
  const st = { state: s.state, alive: s.alive, x: s.x, y: s.y, dir: s.dir, kick: s.kick, vx: s.vx, vy: s.vy };
  console.log(`7. ${what}: state ${before} at the respawn, then ${st.state} alive ${st.alive} at ${st.x.toFixed(0)},${st.y.toFixed(0)} dir ${st.dir} kick ${st.kick}`);
  if (before !== what) fail(`${what}: shell was ${before} at the respawn, so this measured nothing`);
  if (!(st.state === 'patrol' && st.alive && st.x === 1000 && st.y === SY && st.dir === -1 && st.kick === 0 && st.vx === 0 && st.vy === 0)) {
    fail(`${what}: a respawn did not put the shell home and patrolling: ${JSON.stringify(st)}`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL SHELL CHECKS PASSED');
process.exit(failures ? 1 : 0);
