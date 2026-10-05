// The aimed popper, in Node: it wakes on the ball, locks a target, warns for
// AIM seconds, and lobs on a closed-form parabola that reaches the target at
// FLIGHT and ends at the first solid thing. Also: it presses a button and
// breaks planks with that lob.
const { CONFIG } = await import('../../js/config.js');
const { loadLevel } = await import('../../js/levels.js');
const { resetSenders } = await import('../../js/circuits.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const P = CONFIG.ENEMY.POPPER, DT = CONFIG.STEP, FLOOR = 760;
for (const k of ['RANGE', 'AIM', 'FLIGHT', 'RELOAD', 'LEVEL_TOL']) {
  if (!Number.isFinite(P[k])) fail(`CONFIG.ENEMY.POPPER.${k} is not a number`);
}

// A flat room walled at both ends. `extra` adds to it; its `boxes` are added
// to the two walls rather than replacing them.
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

// --- 1. asleep until the ball is in front and in range ----------------------
{
  const level = room({ enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }] });
  const p = level.enemies[0];
  level.ball = ballAt(1000 - 200);                 // behind it
  steps(level, 3);
  if (p.state !== 'idle') fail(`a ball behind the popper woke it (state ${p.state})`);
  level.ball = ballAt(1000 + P.RANGE + 100);       // in front, out of range
  steps(level, 3);
  if (p.state !== 'idle') fail(`a ball out of range woke it (state ${p.state})`);
  level.ball = ballAt(1000 + 200);
  steps(level, DT * 2);
  console.log(`\n1. popper wakes on the ball in front within ${P.RANGE}: state ${p.state}`);
  if (p.state !== 'aim') fail(`a ball in front within range did not start the aim (state ${p.state})`);
}

// --- 2. the lob reaches the locked spot at FLIGHT, after AIM of warning -----
{
  const level = room({ enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }] });
  const p = level.enemies[0];
  level.ball = ballAt(1250);
  steps(level, DT);
  const target = { ...p.target };
  level.ball = ballAt(2500);                        // he steps away: the lock holds
  let firedAt = null, at = null;
  steps(level, P.AIM + P.FLIGHT + 0.5, () => {
    if (p.state === 'fire' && firedAt === null) firedAt = level.time;
    if (firedAt !== null && at === null && level.time - firedAt >= P.FLIGHT - DT / 2) at = p.activeProjectile(level.time);
  });
  console.log(`\n2. target ${target.x.toFixed(0)},${target.y.toFixed(0)}; fired after ${(firedAt ?? NaN).toFixed(2)}s; at FLIGHT: ${at ? at.x.toFixed(1) + ',' + at.y.toFixed(1) : 'gone'}`);
  if (Math.abs(target.x - 1250) > 1) fail(`target x ${target.x}, expected where the ball was (1250)`);
  if (!(Math.abs(firedAt - P.AIM) < 2 * DT + 1e-9)) fail(`fired after ${firedAt}s, expected AIM (${P.AIM})`);
  if (!at) fail('the lob was gone before FLIGHT (it ended on something first)');
  if (at && Math.hypot(at.x - target.x, at.y - target.y) > 6) fail('the lob missed the locked spot at FLIGHT');
}

// --- 3. never behind itself; clamped to range --------------------------------
{
  const level = room({ enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: -1, range: 200 }] });
  const p = level.enemies[0];
  level.ball = ballAt(1000 - 199);
  steps(level, DT);
  if (!(p.target && p.target.x < 1000)) fail('a left-facing popper aimed right');
  if (p.range !== 200) fail(`range from level data not honoured (got ${p.range})`);
  if (p.target && Math.abs(p.target.x - 1000) > 200 + 1e-9) fail('aim went past its range');
}

// --- 4. the lob presses a button and breaks planks ---------------------------
{
  const level = room({
    enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }],
    senders: [{ id: 'b', kind: 'button', x: 1260, y: FLOOR, face: 'left' }],
    gates: [{ x: 2000, y: 560, w: 40, h: 200, needs: ['b'] }],
  });
  // The ball waits against the capped side, so the lock lands on the cap.
  // Not "just past the button": the lob comes down steeply (about 4.5 px down
  // for every px forward at the end, simulated from the closed form with
  // config.js's numbers), so one aimed at x=1300 clears the 50-tall post and
  // ends on the post's far top corner, touching nothing that presses.
  // That ball presses the button itself, so once the lock is taken it steps
  // well away and the button is reset: only the lob can press it after.
  level.ball = ballAt(1250);
  steps(level, DT);
  level.ball = ballAt(2500);
  resetSenders(level.senders);
  if (level.senders[0].pressed) fail('the button did not reset');
  let pressed = false;
  steps(level, P.AIM + P.FLIGHT + 1, () => { if (level.senders[0].pressed) pressed = true; });
  console.log(`\n4a. a lob aimed at a ball against a button's cap pressed it: ${pressed}`);
  if (!pressed) fail("a lob aimed at a button's capped side did not press it");
}
{
  const level = room({
    enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }],
    breakables: [{ x: 1240, y: 600, w: 30, h: 160 }],
  });
  level.ball = ballAt(1300);
  steps(level, P.AIM + P.FLIGHT + 1);
  console.log(`4b. a lob aimed past planks broke them: ${level.breakables[0].broken}`);
  if (!level.breakables[0].broken) fail('a lob aimed past planks did not break them');
}

// --- 5. the same situation, the same lob --------------------------------------
{
  const trace = () => {
    const level = room({ enemies: [{ kind: 'popper', x: 1000, y: FLOOR - P.R, dir: 1 }] });
    level.ball = ballAt(1180);
    const out = [];
    steps(level, 5, () => { const q = level.enemies[0].activeProjectile(level.time); out.push(q ? q.x.toFixed(6) + ',' + q.y.toFixed(6) : '-'); });
    return out.join(';');
  };
  if (trace() !== trace()) fail('two identical runs lobbed differently');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL POPPER CHECKS PASSED');
process.exit(failures ? 1 : 0);
