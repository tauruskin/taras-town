// Every level, checked for the mistakes that are easy to make by hand and
// invisible until someone plays it: a polyline wound backwards so you fall
// through the floor, a spawn inside a wall, geometry outside the bounds the
// camera clamps to.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
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

  // Checks 7 onward ask about a level as authored, so they read a fresh copy
  // rather than the one checks 4 to 6 have been running the clock on.
  const authored = loadLevel(data);

  // --- 7. checkpoints -----------------------------------------------------
  //
  // A checkpoint must be somewhere a ball can actually be, or arriving at it
  // is a death. Dropped at each one, the ball has to settle without dying.
  const still = { left: false, right: false, takeJump: () => false };
  const settle = (ball) => {
    const test = loadLevel(data);
    for (let s = 0; s < Math.round(2.5 / CONFIG.STEP); s++) {
      test.update(CONFIG.STEP);
      ball.update(CONFIG.STEP, still, test);
    }
    return ball;
  };
  for (const [i, c] of authored.checkpoints.entries()) {
    if (c.x < 0 || c.x > authored.bounds.w || c.y < 0 || c.y > authored.bounds.h) {
      fail(`level ${data.id}: checkpoint ${i} at ${c.x},${c.y} is outside the level`);
    }
    const probe = settle(new Ball(c.x, c.y - CONFIG.BALL.R * 2));
    if (probe.deaths > 0) fail(`level ${data.id}: a ball dropped at checkpoint ${i} died ${probe.deaths} time(s)`);
    if (!probe.grounded) fail(`level ${data.id}: a ball dropped at checkpoint ${i} never settled`);

    // And the point a RESPAWN actually uses, which is lifted off the anchor by
    // the ball's radius plus CHECKPOINT.CLEARANCE. This is the check that
    // would have caught the respawn-inside-the-floor bug: dropping a ball at
    // the anchor itself is not the same question as respawning at one.
    //
    // WHERE it settles is asserted as well as whether. A ball that came back
    // inside the floor and fell out of the level would die and be counted
    // here — but one that fell through onto some lower floor would settle
    // happily, a long way from its flag, and only the position says so.
    const homeY = c.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE;
    const atHome = settle(new Ball(c.x, homeY));
    if (atHome.deaths > 0) {
      fail(`level ${data.id}: respawning at checkpoint ${i} died ${atHome.deaths} time(s) — the respawn point is not clear`);
    }
    if (!atHome.grounded) fail(`level ${data.id}: respawning at checkpoint ${i} never settled`);
    else if (Math.abs(atHome.y - (c.y - CONFIG.BALL.R)) > 3 || Math.abs(atHome.x - c.x) > CONFIG.CHECKPOINT.R) {
      fail(`level ${data.id}: respawning at checkpoint ${i} (${c.x},${c.y}) came to rest at ${atHome.x.toFixed(0)},${atHome.y.toFixed(0)}, not on the checkpoint's own floor`);
    }
  }
  if (authored.checkpoints.length) {
    console.log(`   ${authored.checkpoints.length} checkpoint(s); a ball dropped on each, and one respawned at each, settles on its floor`);
  }

  // A checkpoint's capture box reaches CHECKPOINT.R *below* its ground anchor
  // as well as POLE_H above it, so a passable route directly underneath a
  // flagged floor would arm that flag from below. That is a gift rather than a
  // trap — home becomes a spot the child has safely stood — but it is
  // surprising, so do not author a lower route under a checkpoint without
  // meaning to.

  // --- 8. hazards ---------------------------------------------------------
  //
  // Nothing may kill you where you arrive. A spike overlapping the spawn or a
  // checkpoint is an unfinishable level, and it is the single easiest level
  // authoring mistake to make.
  const arrivals = [{ x: authored.spawn.x, y: authored.spawn.y, what: 'the spawn' }]
    .concat(authored.checkpoints.map((c, i) => ({ x: c.x, y: c.y, what: `checkpoint ${i}` })));
  for (const a of arrivals) {
    const probe = { x: a.x, y: a.y, r: CONFIG.BALL.R * 2.5 };
    if (authored.hitsHazard(probe)) fail(`level ${data.id}: a hazard is on top of ${a.what}`);
  }

  // How wide a patch a jump can honestly clear — derived from what hitsSpikes
  // actually tests, not from the jump's whole span. The drawn box is SPIKE.H
  // tall and the ball counts as `BALL.R - SPIKE.FORGIVE` wide against it, so a
  // ball that started resting on the ground is clear only once it has risen
  // `SPIKE.H - SPIKE.FORGIVE`. The time it spends above that, at full speed,
  // less the effective ball's reach at either end, is the widest patch a
  // PERFECTLY timed jump gets over. Half of that is the limit, which leaves a
  // timing window at least as wide as the patch itself.
  //
  // The earlier sketch of this used the jump's whole span, which is about 10%
  // generous: it ignores the height of the teeth and the ball's own width.
  const rise = CONFIG.SPIKE.H - CONFIG.SPIKE.FORGIVE;
  const v0 = CONFIG.JUMP_V, g = CONFIG.GRAVITY;
  const aloft = (2 * Math.sqrt(v0 * v0 - 2 * g * rise)) / g;
  const clearable = CONFIG.MAX_SPEED * aloft - 2 * (CONFIG.BALL.R - CONFIG.SPIKE.FORGIVE);

  for (const [i, s] of authored.spikes.entries()) {
    if (s.x < 0 || s.x + s.w > authored.bounds.w) {
      fail(`level ${data.id}: spike patch ${i} runs from ${s.x} to ${s.x + s.w}, outside the level`);
    }

    // A lower bound as well as an upper one, and it is not fussiness. A patch
    // narrower than one tooth draws as a single stretched needle taller than
    // it is wide, and a patch with a negative width draws one tooth backwards
    // while its hit box sits somewhere nothing is drawn at all. Both are
    // authoring mistakes that look like nothing in the data and like a bug in
    // the game.
    if (s.w <= 0) fail(`level ${data.id}: spike patch ${i} has width ${s.w}`);
    else if (s.w < CONFIG.SPIKE.TOOTH_W) {
      fail(`level ${data.id}: spike patch ${i} is ${s.w}px wide, less than one ${CONFIG.SPIKE.TOOTH_W}px tooth — it draws as a single stretched needle`);
    }
    // A patch wider than the jump can clear cannot be got past at all.
    if (s.w > clearable * 0.5) {
      fail(`level ${data.id}: spike patch ${i} is ${s.w}px wide; a perfectly timed jump at full speed clears ${clearable.toFixed(0)}px of spikes, and half that is the limit`);
    }
  }
  if (authored.spikes.length) {
    console.log(`   ${authored.spikes.length} spike patch(es), widest ${Math.max(...authored.spikes.map((s) => s.w))}px; a perfect jump clears ${clearable.toFixed(0)}px`);
  }

  // --- 9. a long level has checkpoints ------------------------------------
  //
  // Long is measured in the level's own width, not in a number typed here.
  if (authored.bounds.w > 3000 && authored.checkpoints.length === 0) {
    fail(`level ${data.id} is ${authored.bounds.w}px wide with no checkpoints — failing near the end costs the whole level`);
  }
  if (authored.checkpoints.length > 3) {
    fail(`level ${data.id} has ${authored.checkpoints.length} checkpoints; two or three is the limit, and evenly-spaced ones just bank progress nobody was going to lose`);
  }

  // --- 10. a crate is never under a hazard --------------------------------
  //
  // A crate that can be shoved into spikes is a crate that can be destroyed,
  // and if it was the way up, the level becomes unfinishable.
  for (const [i, c] of authored.crates.entries()) {
    const overlaps = authored.spikes.some((s) => c.x < s.x + s.w && c.x + c.w > s.x);
    if (overlaps) fail(`level ${data.id}: crate ${i} shares its stretch of ground with spikes`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL LEVEL CHECKS PASSED');
process.exit(failures ? 1 : 0);
