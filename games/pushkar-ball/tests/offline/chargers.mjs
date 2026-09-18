// The charger, in Node: every state change and what triggers it, with the
// real Level and the real physics. Like the roller, a charger is not a pure
// function of level time — it reacts to the ball — so what is proved here is
// that the same situation always plays out the same way, step by step.
const { CONFIG } = await import('../../js/config.js');
const { makeCharger } = await import('../../js/enemies.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const K = CONFIG.ENEMY.CHARGER;
const DT = CONFIG.STEP;
const FLOOR = 760;
const CY = FLOOR - K.R;

/** A flat, walled floor from 40 to 2960, plus any boxes and other level data given. */
function room({ boxes = [], ...rest } = {}) {
  return loadLevel({
    id: 90, theme: 'hills', bounds: { w: 3000, h: 1080 },
    spawn: { x: 200, y: 600 },
    ground: [[[40, FLOOR], [2960, FLOOR]]],
    boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2960, y: 0, w: 40, h: 1080 }, ...boxes],
    platforms: [],
    ...rest,
  });
}

/** A stand-in ball: only what the charger and Level.update read. */
function fakeBall(x, y = FLOOR - CONFIG.BALL.R) {
  return { x, y, r: CONFIG.BALL.R, grounded: true, dying: 0 };
}

/** Step a lone charger (not in the level's own list) for `seconds`, calling `each` after every step. */
function run(level, c, seconds, each = () => {}) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    level.update(DT);
    c.update(DT, level.time, level, CONFIG);
    if (each(c, i) === false) break;
  }
}

// --- 1. it patrols its range and never leaves it -----------------------------
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 800, to: 1200, dir: 1 }, CONFIG);
  let lo = c.x, hi = c.x, other = null;
  run(level, c, 12, () => {
    lo = Math.min(lo, c.x); hi = Math.max(hi, c.x);
    if (c.state !== 'patrol') other = c.state;
  });
  console.log(`\n1. no ball: patrolled ${lo.toFixed(0)}..${hi.toFixed(0)} of 800..1200`);
  if (other) fail(`with no ball anywhere it went into '${other}'`);
  if (lo < 800 - 3 || hi > 1200 + 3) fail(`left its range: ${lo.toFixed(1)}..${hi.toFixed(1)}`);
  if (hi - lo < 350) fail(`only covered ${(hi - lo).toFixed(0)} of its 400-wide range in 12s`);
  if (Math.abs(c.y - CY) > 2) fail(`y is ${c.y.toFixed(1)}, not resting on the floor at ${CY}`);
}

// --- 2. it sees the ball in front, on its level, within SEE — and only then --
{
  const cases = [
    { what: 'in front, near', ball: [1000 + K.SEE - 20], sees: true },
    { what: 'in front, too far', ball: [1000 + K.SEE + 40], sees: false },
    { what: 'behind, near', ball: [1000 - 100], sees: false },
    { what: 'in front, near, but high above', ball: [1100, CY - K.LEVEL_TOL - 60], sees: false },
  ];
  console.log('\n2. what it notices');
  for (const k of cases) {
    const level = room();
    const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: 1 }, CONFIG);
    level.noteBall(fakeBall(...k.ball));
    // Hold the ball level with the charger as it walks: a fresh ball each
    // step at the same offset, so patrol's own motion changes nothing.
    const off = k.ball[0] - c.x;
    let saw = false;
    run(level, c, 0.5, () => {
      level.noteBall(fakeBall(c.x + off, k.ball[1]));
      if (c.state === 'windup') saw = true;
    });
    console.log(`   ${k.what}: ${saw ? 'winds up' : 'ignores it'}`);
    if (saw !== k.sees) fail(`${k.what}: expected ${k.sees ? 'a wind-up' : 'no wind-up'}`);
  }
}

// --- 3. the wind-up lasts exactly WINDUP, standing still, then it charges ----
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  level.noteBall(fakeBall(1150));
  let upAt = null, chargeAt = null, drift = 0, x0 = null;
  run(level, c, 2, (_, i) => {
    if (c.state === 'windup' && upAt === null) { upAt = i; x0 = c.x; }
    if (c.state === 'windup') drift = Math.max(drift, Math.abs(c.x - x0));
    if (c.state === 'charge' && chargeAt === null) chargeAt = i;
  });
  const took = (chargeAt - upAt) * DT;
  console.log(`\n3. wind-up took ${took.toFixed(3)}s (WINDUP ${K.WINDUP}), moved ${drift.toFixed(2)}px`);
  if (upAt === null || chargeAt === null) fail('never wound up and charged');
  else if (Math.abs(took - K.WINDUP) > DT * 1.5) fail(`wind-up took ${took.toFixed(3)}s, not ${K.WINDUP}`);
  if (drift > 1) fail(`it moved ${drift.toFixed(2)}px while winding up — it must stand still`);
}

// --- 4. a charge is CHARGE_SPEED, straight, and does not turn to follow ------
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  level.noteBall(fakeBall(1150));
  let fastest = 0, turned = false;
  run(level, c, 2.5, () => {
    // The ball jumps behind it the moment the charge starts.
    if (c.state === 'charge') {
      level.noteBall(fakeBall(c.x - 100));
      fastest = Math.max(fastest, Math.abs(c.vx));
      if (c.dir !== 1) turned = true;
    }
  });
  console.log(`\n4. charge speed ${fastest.toFixed(0)} (CHARGE_SPEED ${K.CHARGE_SPEED})`);
  if (Math.abs(fastest - K.CHARGE_SPEED) > 1) fail(`charged at ${fastest.toFixed(0)}, not ${K.CHARGE_SPEED}`);
  if (turned) fail('turned round mid-charge to follow the ball');
}

// --- 5. the end of its range ends a charge: dazed, exactly at the bound -----
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1500, dir: 1 }, CONFIG);
  level.noteBall(fakeBall(1150));
  let maxX = 0, dazedAt = null;
  run(level, c, 3, () => {
    maxX = Math.max(maxX, c.x);
    if (c.state === 'dazed' && dazedAt === null) dazedAt = c.x;
  });
  console.log(`\n5. charge ended at x=${dazedAt?.toFixed(1)}, furthest ${maxX.toFixed(1)}, range ends 1500`);
  if (dazedAt === null) fail('a charge reaching the end of the range did not end dazed');
  if (maxX > 1500 + 0.01) fail(`went ${(maxX - 1500).toFixed(2)}px past the end of its range`);
  else if (Math.abs(dazedAt - 1500) > 0.01) fail(`dazed at x=${dazedAt.toFixed(2)}, not exactly at the bound 1500`);
}

/** Wind a charger up at a ball placed `ahead` in front of it, and run `seconds`. */
function chargeAt(level, c, ahead, seconds, each) {
  level.noteBall(fakeBall(c.x + c.dir * ahead));
  run(level, c, seconds, (cc, i) => {
    // The ball steps out of the way once the charge is under way.
    if (c.state === 'charge') level.noteBall(fakeBall(c.x - c.dir * 400, CY - 300));
    return each ? each(cc, i) : undefined;
  });
}

// --- 6. stone ends a charge: dazed against it, for DAZED, then patrol ------
{
  const level = room({ boxes: [{ x: 1400, y: 660, w: 60, h: 100 }] });
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  let dazedX = null, dazedFor = 0, after = null;
  chargeAt(level, c, 150, 6, () => {
    if (c.state === 'dazed') { if (dazedX === null) dazedX = c.x; dazedFor += DT; }
    else if (dazedX !== null && after === null) after = c.state;
  });
  console.log(`\n6. stone: dazed at x=${dazedX?.toFixed(1)} (stone face 1400) for ${dazedFor.toFixed(2)}s, then '${after}'`);
  if (dazedX === null) fail('running into stone did not daze it');
  else if (Math.abs(dazedX + K.R - 1400) > 3) fail(`dazed at ${dazedX.toFixed(1)}, not flush against the stone`);
  if (Math.abs(dazedFor - K.DAZED) > DT * 2) fail(`dazed for ${dazedFor.toFixed(2)}s, not ${K.DAZED}`);
  if (after !== 'patrol') fail(`after dazed it went to '${after}', not patrol`);
}

// --- 7. planks: broken, and the charge goes on through --------------------
{
  const level = room({ breakables: [{ x: 1300, y: 560, w: 30, h: 200 }] });
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: 1 }, CONFIG);
  let brokeAt = null, dazedX = null;
  chargeAt(level, c, 150, 4, () => {
    if (level.breakables[0].broken && brokeAt === null) brokeAt = c.x;
    if (c.state === 'dazed' && dazedX === null) dazedX = c.x;
  });
  console.log(`\n7. planks: broken with the charger at x=${brokeAt?.toFixed(0)}; charge ended at x=${dazedX?.toFixed(0)}`);
  if (brokeAt === null) fail('a charge did not break the planks');
  if (dazedX === null || dazedX < 1800 - 1) fail(`the charge stopped at ${dazedX?.toFixed(0)} instead of going on to the end of its range`);
}

// --- 8. a patrol only turns at planks; it never breaks them ---------------
{
  const level = room({ breakables: [{ x: 1300, y: 560, w: 30, h: 200 }] });
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: 1 }, CONFIG);
  let hi = 0;
  run(level, c, 10, () => { hi = Math.max(hi, c.x); });
  console.log(`\n8. a patrol into planks turned at x=${hi.toFixed(0)}; broken=${level.breakables[0].broken}`);
  if (level.breakables[0].broken) fail('a patrol broke the planks');
  if (hi > 1300 - K.R + 2) fail(`patrol got to ${hi.toFixed(0)}, into the planks`);
}

// --- 9. a crate: shoved CRATE_SHOVE on, the charger dazed -------------------
{
  const level = room({ boxes: [{ x: 1300, y: 660, w: 100, h: 100, movable: true }] });
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  const crate = level.crates[0];
  let dazed = false;
  chargeAt(level, c, 150, 3, () => { if (c.state === 'dazed') dazed = true; });
  const moved = crate.x - 1300;
  console.log(`\n9. crate: moved ${moved.toFixed(1)} (CRATE_SHOVE ${K.CRATE_SHOVE}); dazed=${dazed}`);
  if (!dazed) fail('running into a crate did not daze it');
  if (Math.abs(moved - K.CRATE_SHOVE) > 3) fail(`the crate moved ${moved.toFixed(1)}, not ${K.CRATE_SHOVE}`);

  // And a crate with stone just past it moves only as far as the stone.
  const level2 = room({ boxes: [{ x: 1300, y: 660, w: 100, h: 100, movable: true }, { x: 1420, y: 560, w: 40, h: 200 }] });
  const c2 = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 2400, dir: 1 }, CONFIG);
  chargeAt(level2, c2, 150, 3);
  const cr2 = level2.crates[0];
  console.log(`   crate with stone 20 past it: right edge at ${(cr2.x + cr2.w).toFixed(1)} (stone at 1420)`);
  if (cr2.x + cr2.w > 1420 + 0.01) fail('a shove put the crate inside the stone');
}

// --- 10. popped: gone for RETURN at least, back home only once the ball is away --
{
  const level = room();
  const c = makeCharger({ kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: -1 }, CONFIG);
  c.alive = false;                        // what stompEnemy does
  level.noteBall(fakeBall(1100));         // standing near home
  let backAt = null;
  run(level, c, K.RETURN + 3, (_, i) => {
    if (i * DT > K.RETURN + 1) level.noteBall(fakeBall(1000 + K.SEE + 50));
    if (c.alive && backAt === null) { backAt = i * DT; return false; }
  });
  console.log(`\n10. popped: back after ${backAt?.toFixed(2)}s (RETURN ${K.RETURN}; the ball left at ${(K.RETURN + 1).toFixed(1)}s)`);
  if (backAt === null) fail('a popped charger never came back');
  else if (backAt < K.RETURN + 1 - DT) fail(`came back at ${backAt.toFixed(2)}s, with the ball still near home`);
  if (c.alive && (Math.abs(c.x - 1000) > 30 || c.dir !== -1)) fail(`came back at x=${c.x.toFixed(0)} facing ${c.dir}, not home facing -1`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHARGER CHECKS PASSED');
process.exit(failures ? 1 : 0);
