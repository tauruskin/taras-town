// Rising spikes: a patch whose height follows a sine of level time, from
// SPIKE.H (jumpable) to SPIKE.RISE_H (no jump clears it). The hit box and the
// picture both read the same `s.h`. A patch with no `rise` keeps whatever
// height it was authored with, SPIKE.H by default — see hazards.mjs.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');
const { spikeBox, spikeHeight } = await import('../../js/hazards.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const S = CONFIG.SPIKE;

// Walled at both ends for the reason hazards.mjs gives: without them a ball
// rolling for seconds falls off the world and the fall is what gets measured.
const world = (spikes) => loadLevel({
  id: 94, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 300, y: 700 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [{ x: 0, y: 0, w: 40, h: 1080 }, { x: 2000, y: 0, w: 40, h: 1080 }],
  platforms: [],
  spikes,
});

// --- 1. a patch without `rise` keeps its authored height -------------------
{
  console.log('\n1. static patches');
  if (spikeHeight({ x: 0, y: 0, w: 60 }, 5, CONFIG) !== S.H) fail(`a plain patch is ${spikeHeight({ x: 0, y: 0, w: 60 }, 5, CONFIG)} tall, not SPIKE.H ${S.H}`);
  if (spikeHeight({ x: 0, y: 0, w: 60, h: 100 }, 5, CONFIG) !== 100) fail('a patch authored 100 tall does not report 100');
  const level = world([{ x: 800, y: 760, w: 60 }, { x: 1200, y: 760, w: 60, h: 100 }]);
  if (level.spikes[0].h !== S.H) fail(`loaded plain patch h=${level.spikes[0].h}`);
  if (level.spikes[1].h !== 100) fail(`loaded tall patch h=${level.spikes[1].h}`);
  const box = spikeBox(level.spikes[1], CONFIG);
  if (box.h !== 100 || box.y !== 660) fail(`a 100-tall patch's box is ${box.h} tall at y=${box.y}, expected 100 at 660`);
}

// --- 2. the cycle's shape ---------------------------------------------------
//
// Period 4, phase 0: a quarter in, the sine is at its top; three quarters in,
// its bottom; at zero, halfway. Exact to float noise, because it is a formula.
{
  const s = { x: 0, y: 760, w: 60, rise: { period: 4, phase: 0 } };
  const mid = (S.H + S.RISE_H) / 2;
  const at = (t) => spikeHeight(s, t, CONFIG);
  console.log(`\n2. period 4: t=0 ${at(0).toFixed(2)}, t=1 ${at(1).toFixed(2)}, t=3 ${at(3).toFixed(2)}`);
  if (Math.abs(at(0) - mid) > 1e-9) fail(`t=0 is ${at(0)}, expected the midpoint ${mid}`);
  if (Math.abs(at(1) - S.RISE_H) > 1e-9) fail(`t=1 is ${at(1)}, expected RISE_H ${S.RISE_H}`);
  if (Math.abs(at(3) - S.H) > 1e-9) fail(`t=3 is ${at(3)}, expected H ${S.H}`);
  if (Math.abs(at(5) - at(1)) > 1e-9) fail('the cycle does not repeat after one period');
}

// --- 3. the level drives it, and the hit box follows ----------------------
{
  const level = world([{ x: 1500, y: 760, w: 60, rise: { period: 4, phase: 0 } }]);
  for (let i = 0; i < 120; i++) level.update(CONFIG.STEP);
  const s = level.spikes[0];
  const want = spikeHeight(s, level.time, CONFIG);
  const box = spikeBox(s, CONFIG);
  console.log(`\n3. after ${level.time.toFixed(3)}s the patch is ${s.h.toFixed(2)} tall; box ${box.h.toFixed(2)} at y=${box.y.toFixed(2)}`);
  if (Math.abs(s.h - want) > 1e-9) fail(`Level.update left h=${s.h}, the formula says ${want}`);
  if (box.h !== s.h || box.y !== s.y - s.h) fail('the hit box does not follow the patch height');
}

// --- 4. RISE_H is out of an unaided jump's reach ---------------------------
//
// On paper first: at the top of a jump the ball's underside is `reach` above
// the ground, and forgiveness lets it sink FORGIVE into the teeth. Then for
// real: a patch held at RISE_H, jumped at every take-off point, is never
// crossed without a hit.
{
  const reach = CONFIG.JUMP_V ** 2 / (2 * CONFIG.GRAVITY);
  const margin = S.RISE_H - S.FORGIVE - reach;
  console.log(`\n4. RISE_H ${S.RISE_H}: a jump's underside peaks ${reach.toFixed(0)}px up, ${margin.toFixed(0)}px short of the teeth`);
  if (margin < 30) fail(`RISE_H leaves only ${margin.toFixed(0)}px between a jump and the teeth; 30 is the least`);

  const X = 1200, W = 60;
  let cleared = 0, tries = 0;
  for (let from = X - 300; from <= X - 5; from += 5) {
    tries++;
    const level = world([{ x: X, y: 760, w: W, h: S.RISE_H }]);
    const ball = new Ball(300, 740);
    let press = false, done = false;
    const input = { left: false, right: true, takeJump() { const j = press; press = false; return j; } };
    for (let i = 0; i < 4 / CONFIG.STEP; i++) {
      if (!done && ball.grounded && ball.x >= from) { press = true; done = true; }
      level.update(CONFIG.STEP);
      ball.update(CONFIG.STEP, input, level);
    }
    if (ball.x > X + W + 20 && ball.hits === 0) cleared++;
  }
  console.log(`   ${tries} take-off points, ${cleared} crossed it`);
  if (cleared) fail(`a patch at RISE_H was jumped cleanly ${cleared} time(s) of ${tries}`);
}

// --- 5. nothing goes NaN ------------------------------------------------------
{
  const level = world([{ x: 900, y: 760, w: 60, rise: { period: 3.5, phase: 0.25 } }]);
  const ball = new Ball(300, 740);
  const input = { left: false, right: true, takeJump: () => ball.grounded };
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 8 / CONFIG.STEP; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    lo = Math.min(lo, level.spikes[0].h); hi = Math.max(hi, level.spikes[0].h);
  }
  console.log(`\n5. eight seconds against a rising patch: ball ${ball.x.toFixed(0)},${ball.y.toFixed(0)}; height ranged ${lo.toFixed(1)}..${hi.toFixed(1)}`);
  if (![ball.x, ball.y, ball.vx, ball.vy, lo, hi].every(Number.isFinite)) fail('a value went non-finite');
  if (lo < S.H - 1e-9 || hi > S.RISE_H + 1e-9) fail(`height left ${S.H}..${S.RISE_H}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL RISER CHECKS PASSED');
process.exit(failures ? 1 : 0);
