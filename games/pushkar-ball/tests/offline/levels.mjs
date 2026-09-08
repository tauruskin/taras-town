// Every level, checked for the mistakes that are easy to make by hand and
// invisible until someone plays it: a polyline wound backwards so you fall
// through the floor, a spawn inside a wall, geometry outside the bounds the
// camera clamps to.
const { CONFIG } = await import('../../js/config.js');
const { LEVELS, loadLevel } = await import('../../js/levels.js');
const { step } = await import('../../js/physics.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

/** Distance from a point to a segment. */
const distTo = (s, px, py) => {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
};

// --- 1. ids are unique ----------------------------------------------------
console.log(`\n1. ${LEVELS.length} level(s)`);
{
  const ids = LEVELS.map((l) => l.id);
  if (new Set(ids).size !== ids.length) fail(`duplicate level ids: ${ids.join(', ')}`);
}

for (const data of LEVELS) {
  const level = loadLevel(data);
  console.log(`\n   level ${data.id}: ${level.statics.length} segments, ${level.movers.length} movers`);

  // --- 2. ground faces up -------------------------------------------------
  //
  // Ground polylines are authored left to right, which puts the left-hand
  // perpendicular upward. A backwards one is a floor you fall through, and it
  // looks completely normal in a screenshot.
  for (const line of data.ground || []) {
    for (let i = 0; i < line.length - 1; i++) {
      if (line[i + 1][0] <= line[i][0]) {
        fail(`level ${data.id}: a ground polyline goes backwards at x=${line[i][0]}`);
      }
    }
  }
  for (const s of level.statics) {
    if (s.fromGround && s.ny >= 0) {
      fail(`level ${data.id}: a ground segment at (${s.ax},${s.ay}) faces down`);
    }
  }

  // --- 3. everything is inside the bounds --------------------------------
  //
  // The camera clamps to these, so anything outside them can never be seen.
  for (const s of level.statics) {
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) {
      if (x < 0 || y < 0 || x > level.bounds.w || y > level.bounds.h) {
        fail(`level ${data.id}: a segment reaches (${x},${y}), outside ${level.bounds.w}x${level.bounds.h}`);
      }
    }
  }

  // --- 4. a moving platform stays inside the bounds all the way through ---
  for (const m of level.movers) {
    for (let t = 0; t < m.period; t += m.period / 32) {
      m.update(t);
      if (m.x < 0 || m.y < 0 || m.x + m.w > level.bounds.w || m.y + m.h > level.bounds.h) {
        fail(`level ${data.id}: a platform leaves the bounds at t=${t.toFixed(2)}`);
      }
    }
    m.update(0);
  }

  // --- 5. the spawn is in free space, and lands on something -------------
  //
  // A spawn inside geometry is ejected in whatever direction resolution happens
  // to pick, which looks like the game throwing the player at random.
  const b = { x: level.spawn.x, y: level.spawn.y, r: CONFIG.BALL.R, vx: 0, vy: 0 };
  if (level.near(b.x, b.y, b.r).some((s) => distTo(s, b.x, b.y) < b.r)) {
    fail(`level ${data.id}: the spawn is inside something`);
  }

  let landed = false;
  for (let i = 0; i < Math.round(4 / CONFIG.STEP) && !landed; i++) {
    level.update(CONFIG.STEP);
    landed = step(b, level, CONFIG.STEP, CONFIG).some((c) => c.ny < CONFIG.GROUND_NY);
  }
  if (!landed) fail(`level ${data.id}: a ball dropped at the spawn never lands`);
  else console.log(`   spawn lands at y=${b.y.toFixed(0)}`);

  // --- 6. the goal is somewhere a ball could stand ------------------------
  //
  // Not a reachability proof — that needs the whole game. Just the weak version
  // that catches a flag left floating in the sky or buried in the ground.
  if (level.goal) {
    const g = { x: level.goal.x, y: level.goal.y - CONFIG.BALL.R * 2, r: CONFIG.BALL.R, vx: 0, vy: 0 };
    if (level.near(g.x, g.y, g.r).some((s) => distTo(s, g.x, g.y) < g.r)) {
      fail(`level ${data.id}: the goal is buried in geometry`);
    }
    let goalLands = false;
    for (let i = 0; i < Math.round(3 / CONFIG.STEP) && !goalLands; i++) {
      level.update(CONFIG.STEP);
      goalLands = step(g, level, CONFIG.STEP, CONFIG).some((c) => c.ny < CONFIG.GROUND_NY);
    }
    if (!goalLands) fail(`level ${data.id}: the goal has no ground under it`);
    else console.log(`   goal stands at y=${g.y.toFixed(0)}`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL LEVEL CHECKS PASSED');
process.exit(failures ? 1 : 0);
