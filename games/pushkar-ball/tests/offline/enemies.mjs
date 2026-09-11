// The three enemy types. Nothing in here is placed into a real level yet —
// that is a separate, later plan (the curriculum reshuffle). This suite
// proves the mechanism itself: a walker and a popper are pure functions of
// level time, the same guarantee the game already makes for moving platforms
// (see levels.js's makeMover); a roller is not, and gets a weaker but still
// concrete proof instead, in a later task.
const { CONFIG } = await import('../../js/config.js');
const { makeWalker, makePopper, enemyHit, projectileHit } = await import('../../js/enemies.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// --- 1. a walker's position is a pure function of level time -------------
{
  const W = CONFIG.ENEMY.WALKER;
  const e = { kind: 'walker', x: 1000, y: 760, amplitude: 200 };
  const w = makeWalker(e, CONFIG);
  console.log(`\n1. a walker patrols ${e.amplitude}px either side of x=${e.x}`);
  for (const t of [0, 0.5, 1.3, 4.0, 10.0]) {
    w.update(0, t, null, CONFIG);
    const expected = e.x + e.amplitude * Math.sin(t * W.SPEED);
    if (Math.abs(w.x - expected) > 1e-9) {
      fail(`at t=${t}, walker.x is ${w.x}, expected ${expected} from the closed form`);
    }
  }
  if (w.x < e.x - e.amplitude - 1 || w.x > e.x + e.amplitude + 1) {
    fail(`walker.x=${w.x} is outside its own patrol range`);
  }
  const box = w.box();
  if (box.x !== w.x - w.r || box.y !== w.y - w.r || box.w !== w.r * 2 || box.h !== w.r * 2) {
    fail(`box() is ${JSON.stringify(box)}, not centred on the walker's own x/y/r`);
  }
  if (w.activeProjectile(0) !== null) fail('a walker must never report an active projectile');
}

// --- 2. a popper's projectile follows a closed-form parabola -------------
//
// No physics simulation involved — activeProjectile(t) is asked directly,
// against a hand-derived parabola, the same style levels.js's moving
// platforms already get.
{
  const P = CONFIG.ENEMY.POPPER;
  const e = { kind: 'popper', x: 2000, y: 760, dir: 1, period: 3.0, phase: 0 };
  const p = makePopper(e, CONFIG);
  const flight = (2 * P.VY0) / CONFIG.GRAVITY;
  console.log(`\n2. a popper launches every ${e.period}s, in flight for ${flight.toFixed(2)}s`);

  const soon = p.activeProjectile(0.05);
  if (!soon) fail('no projectile 0.05s after a launch');
  else if (Math.abs(soon.y - e.y) > 60) fail(`projectile is already ${(e.y - soon.y).toFixed(0)}px up after only 0.05s`);

  for (const cycle of [0.3, flight * 0.5, flight - 0.05]) {
    const got = p.activeProjectile(cycle);
    const wantX = e.x + P.VX * cycle;
    const wantY = e.y - P.VY0 * cycle + 0.5 * CONFIG.GRAVITY * cycle * cycle;
    if (!got) fail(`no projectile at cycle=${cycle}, inside the flight window`);
    else if (Math.abs(got.x - wantX) > 1e-6 || Math.abs(got.y - wantY) > 1e-6) {
      fail(`at cycle=${cycle}, projectile is at ${got.x.toFixed(2)},${got.y.toFixed(2)}, expected ${wantX.toFixed(2)},${wantY.toFixed(2)}`);
    }
  }

  if (p.activeProjectile(flight + 0.1)) fail('a projectile is still active well after its flight time');

  const early = p.activeProjectile(0.3);
  const later = p.activeProjectile(0.3 + e.period * 4);
  if (!later || Math.abs(early.x - later.x) > 1e-6 || Math.abs(early.y - later.y) > 1e-6) {
    fail('the launch cycle does not repeat correctly after several periods');
  }

  // A query before `phase` exercises the modulo-wrap's negative-`since`
  // branch (`((since % period) + period) % period`). Chosen so the wrap
  // lands inside the flight window: phase=1.0, period=3.0, t=-1.8 gives
  // since=-2.8, which wraps to cycle=0.2 (comfortably inside flight).
  const e2 = { kind: 'popper', x: 500, y: 760, dir: 1, period: 3.0, phase: 1.0 };
  const p2 = makePopper(e2, CONFIG);
  const t2 = -1.8;
  const cycle2 = 0.2;
  const got2 = p2.activeProjectile(t2);
  const wantX2 = e2.x + P.VX * cycle2;
  const wantY2 = e2.y - P.VY0 * cycle2 + 0.5 * CONFIG.GRAVITY * cycle2 * cycle2;
  if (!got2 || Math.abs(got2.x - wantX2) > 1e-6 || Math.abs(got2.y - wantY2) > 1e-6) {
    fail(`at t=${t2} (before phase=${e2.phase}), projectile is at ${got2 ? got2.x.toFixed(2) + ',' + got2.y.toFixed(2) : 'null'}, expected ${wantX2.toFixed(2)},${wantY2.toFixed(2)} from wrapped cycle=${cycle2}`);
  }
}

// --- 3. enemyHit and projectileHit query a whole array at once -----------
//
// Built from real makeWalker/makePopper enemies, not hand-rolled objects, so
// this also exercises box() and activeProjectile() as enemyHit/projectileHit
// actually call them, not just the two functions' own loop logic.
{
  console.log('\n3. enemyHit/projectileHit pick the right enemy out of a group');
  const P = CONFIG.ENEMY.POPPER;
  const flight = (2 * P.VY0) / CONFIG.GRAVITY;

  const near = makeWalker({ kind: 'walker', x: 3000, y: 760, amplitude: 0 }, CONFIG);
  near.update(0, 0, null, CONFIG); // sin(0) = 0, so x settles exactly on 3000

  const dead = makeWalker({ kind: 'walker', x: 3200, y: 760, amplitude: 0 }, CONFIG);
  dead.update(0, 0, null, CONFIG);
  dead.alive = false;

  const far = makeWalker({ kind: 'walker', x: 9000, y: 760, amplitude: 0 }, CONFIG);
  far.update(0, 0, null, CONFIG);

  const enemies = [near, dead, far];

  const touchingNear = { x: 3000, y: 760, r: 5 };
  if (enemyHit(touchingNear, enemies) !== near) {
    fail('enemyHit did not return the alive enemy the body is touching');
  }

  const touchingNothing = { x: 5000, y: 760, r: 5 };
  if (enemyHit(touchingNothing, enemies) !== null) {
    fail('enemyHit found an enemy where the body is touching none of them');
  }

  const touchingDead = { x: 3200, y: 760, r: 5 };
  if (enemyHit(touchingDead, enemies) !== null) {
    fail('enemyHit returned a dead enemy instead of skipping it');
  }

  const pop = makePopper({ kind: 'popper', x: 4000, y: 760, dir: 1, period: 3.0, phase: 0 }, CONFIG);
  const projEnemies = [pop];
  const midCycle = flight * 0.5;
  const projAt = pop.activeProjectile(midCycle);
  const touchingProj = { x: projAt.x, y: projAt.y, r: 5 };

  const foundProj = projectileHit(touchingProj, projEnemies, midCycle);
  if (!foundProj || Math.abs(foundProj.x - projAt.x) > 1e-6 || Math.abs(foundProj.y - projAt.y) > 1e-6) {
    fail("projectileHit did not find the popper's active projectile at the expected position");
  }

  // Same body position, but asked about a time outside the flight window —
  // the projectile itself has long since landed and relaunched, so nothing
  // should be there even though the body never moved.
  const outsideT = flight + 0.5;
  if (projectileHit(touchingProj, projEnemies, outsideT) !== null) {
    fail("projectileHit found a projectile outside its launch's flight window");
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL ENEMY CHECKS PASSED (so far)');
process.exit(failures ? 1 : 0);
