// Every level, checked for the mistakes that are easy to make by hand and
// invisible until someone plays it: a polyline wound backwards so you fall
// through the floor, a spawn inside a wall, geometry outside the bounds the
// camera clamps to.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { LEVELS, loadLevel, revealPoint } = await import('../../js/levels.js');
const { step } = await import('../../js/physics.js');
const { hitsSpikes } = await import('../../js/hazards.js');
const { parseNeed } = await import('../../js/circuits.js');

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

  // The check above only ever sees a rising patch at its t=0 height, because
  // that is what `loadLevel` freezes into `authored.spikes` — it never runs
  // the clock. An arrival safely clear of a riser at t=0 can still be sitting
  // directly under where its teeth reach at the top of the cycle, so probe
  // every arrival again with every rising patch pinned at SPIKE.RISE_H.
  const atPeak = authored.spikes.map((s) => (s.rise ? { ...s, h: CONFIG.SPIKE.RISE_H } : s));
  for (const a of arrivals) {
    const probe = { x: a.x, y: a.y, r: CONFIG.BALL.R * 2.5 };
    if (hitsSpikes(probe, atPeak, CONFIG)) fail(`level ${data.id}: a rising spike patch reaches ${a.what} at the top of its cycle`);
  }

  // A rising patch's height comes out of `spikeHeight`, which divides level
  // time by `rise.period`. A missing or zero period divides by zero or
  // nothing at all, and either way the result is NaN — a NaN patch has no
  // hit box (every comparison against NaN is false) and draws nothing, so the
  // spikes are silently not there: the worst kind of authoring mistake,
  // because nothing on screen says so. Checked on the RAW data, not the
  // loaded level, since the loader has already turned a bad `rise` into a
  // NaN `h` by the time `authored.spikes` exists.
  for (const [i, s] of (data.spikes || []).entries()) {
    if (!s.rise) continue;
    if (!(Number.isFinite(s.rise.period) && s.rise.period > 0)) {
      fail(`level ${data.id}: spike patch ${i}'s rise.period is ${s.rise.period}, not a finite number > 0 — the height comes out NaN and the patch is silently not there`);
    }
    if (s.rise.phase !== undefined && !Number.isFinite(s.rise.phase)) {
      fail(`level ${data.id}: spike patch ${i}'s rise.phase is ${s.rise.phase}, not a finite number`);
    }
    if (s.h !== undefined) {
      fail(`level ${data.id}: spike patch ${i} authors both h and rise — a rising patch ignores h entirely, so this number is a lie about what the patch does`);
    }
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
    // A patch wider than the jump can clear cannot be got past at all — unless
    // it was never meant to be jumped in the first place. `clearable` is
    // derived from SPIKE.H, which is honest for a plain patch and for a
    // rising one (its low point IS SPIKE.H, so it is jumpable at the bottom
    // of its cycle) but not for a STATIC patch authored taller than SPIKE.H:
    // that one is deliberately never jumpable, at any width, so the level
    // must give it another way past instead — a route `finish.mjs` is what
    // actually proves exists, by finishing the level without ever crossing it
    // as a jump.
    const staticallyTall = !s.rise && s.h > CONFIG.SPIKE.H;
    if (!staticallyTall && s.w > clearable * 0.5) {
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

  // --- 11. an enemy's own range never leaves the level bounds -------------
  //
  // A walker or roller authored to patrol past the edge of the level would
  // wander into geometry that does not exist — the same class of mistake
  // check 4 already catches for moving platforms.
  for (const [i, e] of (data.enemies || []).entries()) {
    if (e.kind === 'walker') {
      const lo = e.x - e.amplitude, hi = e.x + e.amplitude;
      if (lo < 0 || hi > authored.bounds.w) {
        fail(`level ${data.id}: walker ${i} patrols ${lo.toFixed(0)}..${hi.toFixed(0)}, outside the level`);
      }
    } else if (e.kind === 'roller') {
      if (e.from < 0 || e.to > authored.bounds.w) {
        fail(`level ${data.id}: roller ${i} patrols ${e.from}..${e.to}, outside the level`);
      }
    } else if (e.kind === 'popper') {
      if (e.x < 0 || e.x > authored.bounds.w) {
        fail(`level ${data.id}: popper ${i} at x=${e.x} is outside the level`);
      }
    } else if (e.kind === 'charger') {
      const r = CONFIG.ENEMY.CHARGER.R;
      if (e.from - r < 0 || e.to + r > authored.bounds.w) {
        fail(`level ${data.id}: charger ${i} ranges ${e.from}..${e.to}, outside the level`);
      }
      if (!(e.from <= e.x && e.x <= e.to)) fail(`level ${data.id}: charger ${i}'s home x=${e.x} is outside its own range`);
    }
  }

  // --- 12. nothing may hurt you where you arrive ---------------------------
  //
  // The same rule check 8 already applies to spikes, extended to enemies: an
  // enemy overlapping the spawn or a checkpoint is an unfinishable level.
  {
    const { enemyHit } = await import('../../js/enemies.js');
    for (const a of arrivals) {
      const probe = { x: a.x, y: a.y, r: CONFIG.BALL.R * 2.5 };
      if (enemyHit(probe, authored.enemies)) fail(`level ${data.id}: an enemy is on top of ${a.what}`);
    }
  }
  if (authored.enemies.length) {
    console.log(`   ${authored.enemies.length} enemy/enemies; none patrol outside the level, none overlap the spawn or a checkpoint`);
  }

  // --- 13. ground polylines are listed left to right ----------------------
  //
  // Check 2 already checks that points within one polyline don't go
  // backwards. drawWater() in main.js draws a decorative water band under the
  // gap between each consecutive pair of ground entries, and it assumes those
  // entries are themselves listed in x-order — it computes a gap's width as
  // the next polyline's first x minus the previous polyline's last x, with no
  // clamping. Two adjacent entries touching (gap width 0) is normal — that's
  // how a level joins two floors with no water between them — but a next
  // entry starting BEFORE the previous one ends is not: that is two ground
  // entries listed out of order, and it would hand drawWater a negative gap
  // width with nothing here to catch it.
  const ground = data.ground || [];
  for (let i = 0; i < ground.length - 1; i++) {
    const prevEnd = ground[i][ground[i].length - 1];
    const nextStart = ground[i + 1][0];
    if (nextStart[0] < prevEnd[0]) {
      fail(`level ${data.id}: ground polyline ${i + 1} starts at x=${nextStart[0]}, before polyline ${i} ends at x=${prevEnd[0]} — drawWater assumes ground entries are listed left to right`);
    }
  }
}

// --- wiring ------------------------------------------------------------------
//
// Every need names a real sender; a sender and each receiver it drives are
// close enough for the camera's reveal to fire (CIRCUIT.SEE); and no
// checkpoint sits between them — a respawn resets buttons, so a checkpoint
// there would leave a player past the button and facing a shut door.
console.log('\nwiring');
for (const data of LEVELS) {
  const level = loadLevel(data);
  const ids = level.senders.map((s) => s.id);
  if (new Set(ids).size !== ids.length) fail(`level ${data.id}: two senders share an id (${ids.join(', ')})`);
  for (const s of level.senders) {
    if (s.kind === 'timer' && !(s.time > 0)) fail(`level ${data.id}: timer '${s.id}' has time ${s.time}`);
    if (s.kind !== 'plate' && s.face !== 'left' && s.face !== 'right') fail(`level ${data.id}: button '${s.id}' faces '${s.face}'`);
  }
  for (const r of [...level.gates, ...level.bridges]) {
    if (!r.needs.length) fail(`level ${data.id}: a ${r.kind} at x=${r.x} needs nothing, so it can never open`);
    for (const n of r.needs) {
      const s = level.senders.find((x) => x.id === parseNeed(n).id);
      if (!s) { fail(`level ${data.id}: a ${r.kind} at x=${r.x} needs '${n}', and there is no such sender`); continue; }
      // Measured the way `noteOpening` measures it: from where the ball is
      // when it presses — against the capped face of a post, or on the
      // middle of a plate — to the point the reveal would lean toward.
      // Post-to-gate-edge would be a different number, and a wire could
      // pass here and still open its door unseen.
      const R = CONFIG.BALL.R;
      const from = s.kind === 'plate' ? s.x + s.w / 2
        : s.face === 'right' ? s.x + CONFIG.CIRCUIT.POST_W + R : s.x - R;
      const apart = Math.abs(revealPoint(r) - from);
      console.log(`   level ${data.id}: '${s.id}' -> ${r.kind} at x=${r.x}: ${apart.toFixed(0)} apart`);
      if (apart > CONFIG.CIRCUIT.SEE) fail(`level ${data.id}: '${s.id}' is ${apart} from the ${r.kind} it drives; ${CONFIG.CIRCUIT.SEE} is as far as the camera reveal reaches`);
      const lo = Math.min(s.x, r.x), hi = Math.max(s.x, r.x);
      for (const c of level.checkpoints) {
        if (c.x > lo && c.x < hi) fail(`level ${data.id}: checkpoint at x=${c.x} sits between '${s.id}' and the ${r.kind} it drives`);
      }
    }
  }

  // A closing gate refuses to close on its blockers (Level.update's
  // `blockers`): the ball, crates, and any enemy with `blocks`. Spikes are
  // never among them. A gate whose span overlaps a spike patch, a walker's
  // patrol, a roller's range or a blocking enemy's range can therefore close
  // right through one, or hang open over it, which either looks broken or,
  // for a spike, means the gate is guarding nothing since the hazard already
  // sits in the gap.
  for (const g of level.gates) {
    const glo = g.x, ghi = g.x + g.w;
    for (const s of level.spikes) {
      if (s.x < ghi && s.x + s.w > glo) {
        fail(`level ${data.id}: a spike patch at x=${s.x} sits under the gate at x=${g.x}`);
      }
    }
    for (const [i, e] of (data.enemies || []).entries()) {
      const live = level.enemies[i];
      if (e.kind === 'walker') {
        const r = CONFIG.ENEMY.WALKER.R;
        const lo = e.x - e.amplitude - r, hi = e.x + e.amplitude + r;
        if (lo < ghi && hi > glo) fail(`level ${data.id}: a walker patrols under the gate at x=${g.x}`);
      } else if (e.kind === 'roller') {
        // from/to bound the roller's centre, so its body reaches R past
        // either end — the same allowance the walker gets above.
        const r = CONFIG.ENEMY.ROLLER.R;
        if (e.from - r < ghi && e.to + r > glo) fail(`level ${data.id}: a roller patrols under the gate at x=${g.x}`);
      } else if (live.blocks) {
        // Anything that holds a closing gate up would hang it open over its
        // range — asked of the enemy itself, so a new kind cannot be missed.
        if (!(Number.isFinite(e.from) && Number.isFinite(e.to))) {
          fail(`level ${data.id}: enemy ${i} (${e.kind}) blocks gates but has no from/to range`);
        } else if (e.from - live.r < ghi && e.to + live.r > glo) {
          fail(`level ${data.id}: a ${e.kind} ranges under the gate at x=${g.x}`);
        }
      }
    }
  }
}

// --- chargers: ground under the whole range, and no checkpoint in sight ----
//
// "Never charges off a ledge" rests on this: a charge ends at the end of its
// range, so if every x in the range, plus the body's radius each side, has
// ground under it at the charger's own feet, there is no ledge to go off.
// And the roadmap's "never at a checkpoint": a ball respawning must not be
// in sight of one — its own sight past either end of its range.
{
  const R = CONFIG.ENEMY.CHARGER.R;
  let n = 0;
  for (const data of LEVELS) {
    const level = loadLevel(data);
    for (const [i, e] of (data.enemies || []).entries()) {
      if (e.kind !== 'charger') continue;
      n++;
      // Ask the charger itself rather than re-deriving the default here:
      // `level.enemies` is a straight map of `data.enemies`, so this is the
      // same enemy, and makeCharger keeps sole ownership of the rule.
      const SEE = level.enemies[i].see;
      const feet = e.y + R;
      for (let x = e.from - R; x <= e.to + R; x += 5) {
        const held = level.statics.some((s) => s.ny < -0.9 &&
          Math.min(s.ax, s.bx) <= x && Math.max(s.ax, s.bx) >= x &&
          Math.abs(s.ay + (s.by - s.ay) * ((x - s.ax) / ((s.bx - s.ax) || 1)) - feet) < 2);
        if (!held) { fail(`level ${data.id}: charger ${i} has no ground under x=${x} at y=${feet}`); break; }
      }
      for (const c of data.checkpoints || []) {
        if (c.x > e.from - SEE && c.x < e.to + SEE && Math.abs(c.y - feet) < 200) {
          fail(`level ${data.id}: checkpoint at x=${c.x} is within sight of charger ${i} (${e.from}..${e.to}, sees ${SEE})`);
        }
      }
    }
  }
  console.log(`\nchargers: ${n} checked for ground under their whole range and checkpoints out of sight`);
}

// --- aimed poppers: no checkpoint within reach -------------------------------
// The roadmap's "range never covers a checkpoint": a ball respawning must
// never be inside what a popper can see and reach.
{
  let n = 0;
  for (const data of LEVELS) {
    const level = loadLevel(data);
    for (const [i, e] of (data.enemies || []).entries()) {
      if (e.kind !== 'popper' || e.fixed) continue;
      n++;
      const range = level.enemies[i].range;
      if (!Number.isFinite(range)) { fail(`level ${data.id}: popper ${i} has no numeric range`); continue; }
      for (const c of data.checkpoints || []) {
        const dx = c.x - e.x;
        if (Math.sign(dx) === (e.dir ?? 1) && Math.abs(dx) <= range + CONFIG.BALL.R) {
          fail(`level ${data.id}: checkpoint at x=${c.x} is within reach of popper ${i} (range ${range})`);
        }
      }
    }
  }
  console.log(`\naimed poppers: ${n} checked for checkpoints out of reach`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL LEVEL CHECKS PASSED');
process.exit(failures ? 1 : 0);
