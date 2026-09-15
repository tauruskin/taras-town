// Every level can be finished — shown by finishing it.
//
// The worst thing a level edit can do in this game is make a level impossible,
// because a six-year-old cannot tell an impossible level from a hard one: he
// just keeps failing. levels.mjs catches the authoring mistakes one at a time;
// this is the whole question, answered the only honest way, by driving a ball
// from the spawn to the flag with the real Ball on the real level.
//
// A route is a little player: it looks at the ball and the level each step and
// decides what to press, the way a thumb would. It is NOT a recording of
// frame-perfect input. Each one is run many times over — starting late, so the
// platforms are somewhere else when the ball arrives, and pressing jump early
// and late — and every one of those runs has to finish without failing once.
// A route that only works on one exact frame would prove nothing about a
// child, and would break on the first harmless tweak to anything.
//
// Most of the driving is one generic runner that reads the level's own data:
// roll right, and jump a little before any gap edge, spike patch, crate, stone
// step or enemy ahead. Only the two things a runner cannot do by rolling right
// get a script of their own — riding level one's platform to its last ledge,
// and working level three's crate — and those scripts are the proof that those
// levels can be done. If you move the geometry they are written against, move
// them too; if a new level has no route, this suite says so rather than
// passing.
//
// Then from every checkpoint too, because a checkpoint is a new start: one
// placed so close to a patch that a ball respawning from rest cannot get over
// it would be a trap the full run never sees.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { LEVELS, loadLevel } = await import('../../js/levels.js');
const { spikeHeight } = await import('../../js/hazards.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

/**
 * Play `data` with `route` from (x, y), after sitting still for `delay`
 * seconds. Returns the ball, the level, how long it took, and `riserHits` —
 * how many times a hit landed while the ball was within 60px of a rising
 * patch. The suite otherwise counts deaths, not hearts, so a hit at a rising
 * patch that did not happen to use up the last heart would slip through as a
 * pass; this catches such a hit even when no death follows.
 */
function play(data, route, { delay = 0, from = null, seconds = 60 } = {}) {
  const level = loadLevel(data);
  const at = from || level.spawn;
  const ball = new Ball(at.x, at.y);
  const risers = level.spikes.filter((s) => s.rise);
  let press = false;
  const input = {
    left: false, right: false,
    takeJump() { const j = press; press = false; return j; },
  };
  const drive = route(level);
  const n = Math.round(seconds / CONFIG.STEP);
  let i = 0, riserHits = 0, riserHitX = null;
  for (; i < n && !ball.won; i++) {
    const t = i * CONFIG.STEP;
    const want = t < delay ? {} : drive(ball, t);
    input.left = !!want.left;
    input.right = !!want.right;
    if (want.jump) press = true;
    level.update(CONFIG.STEP);
    const hitsBefore = ball.hits;
    ball.update(CONFIG.STEP, input, level);
    if (ball.hits > hitsBefore && risers.some((s) => ball.x > s.x - 60 && ball.x < s.x + s.w + 60)) {
      riserHits++;
      riserHitX = ball.x;
    }
  }
  return { ball, level, t: i * CONFIG.STEP, riserHits, riserHitX };
}

/**
 * Roll right, jumping a little before whatever is ahead.
 *
 * `lead` scales how early it jumps, which is how a run is made sloppy on
 * purpose. The obstacles come from the level: the end of any ground line that
 * no other line carries on from, every spike patch, every crate or low stone
 * step that is still in the way, and every alive enemy.
 *
 * An enemy is treated exactly like a spike here — jumped over, not avoided by
 * any smarter means. Landing on one from above still defeats it (a bonus, not
 * a problem for this check); a side graze costs a heart, and that alone does
 * not fail a run here — a run fails if it dies (falls, or loses all three
 * hearts in one stretch between checkpoints) or never reaches the flag. It
 * counts deaths, not hearts, so how close a placement comes to losing all
 * three has to be checked by hand — level two's walker two and level three's
 * walker both were. Nothing here tries to dodge a popper's lobbed projectile
 * specifically: it is meant to be a minor tap, not a precision dodge, and the
 * same heart budget covers it.
 */
function runner(level, lead) {
  const lines = level.data.ground || [];
  const edges = [];
  for (const line of lines) {
    const [ex, ey] = line[line.length - 1];
    const continues = lines.some((l) => l !== line && Math.abs(l[0][0] - ex) < 1 && Math.abs(l[0][1] - ey) < 1);
    if (!continues) edges.push(ex);
  }
  return (ball) => {
    const want = { right: true };
    if (!ball.grounded) return want;
    const ahead = (x, d) => x - ball.x > 0 && x - ball.x < d * lead;
    if (edges.some((x) => ahead(x, 20))) want.jump = true;
    if (level.spikes.some((s) => ahead(s.x, 70))) want.jump = true;
    if (level.enemies.some((e) => e.alive && ahead(e.x, 70))) want.jump = true;
    // A crate is jumped onto and rolled off, never pushed along by the runner:
    // pushing is slow and that is not the question here.
    if (level.crates.some((c) => ahead(c.x, 40) && ball.y > c.y)) want.jump = true;
    // A low stone box, a step like level one's block and staircase, is met
    // the same way, since it cannot be pushed at all. Full-height boxes are
    // the level's end walls, which there is no hopping. Level three's ledge
    // face is a shorter stone box too, but its route stops using the runner
    // well before the ball gets near it.
    if (level.walls.some((w) => w.h < level.bounds.h && ahead(w.x, 40) && ball.y > w.y)) want.jump = true;
    return want;
  };
}

/**
 * The runner, except that it waits for a rising patch to be down.
 *
 * Within 260px of a rising patch, and not yet committed to it, it looks ahead
 * with the same formula the level uses: if the patch will stay under LOW_OK for
 * the whole crossing — 0.2 to 1.0s from now — it runs; otherwise it backs off
 * to 200px and holds still. 75 is not what a jump clears at the patch's front
 * edge — the sloppiest one here (lead 0.7) clears only about 59px there — but
 * the patch keeps sinking while the ball crosses it. Swept at every lead from
 * 0.7 to 1.3 and start delays every 0.1s, 75 found no hit at all, the closest
 * pass about 6px, on level two's slow patch. 90 let a lead-0.7 jump meet a
 * patch still sinking; 60 finds no window on the 3.5s cycle.
 */
const LOW_OK = 75;
function waitForLow(level, lead) {
  const run = runner(level, lead);
  const risers = level.spikes.filter((s) => s.rise);
  return (ball) => {
    const s = risers.find((r) => r.x + r.w > ball.x - 20 && r.x - ball.x < 260);
    if (!s || !ball.grounded || ball.x > s.x - 60) return run(ball);
    for (let k = 0.2; k <= 1.0; k += 0.05) {
      if (spikeHeight(s, level.time + k, CONFIG) > LOW_OK) {
        if (ball.x > s.x - 200) return { left: true };
        return { left: ball.vx > 30, right: ball.vx < -30 };
      }
    }
    return run(ball);
  };
}

// --- the routes ------------------------------------------------------------
//
// Keyed by level id. Each takes the loaded level and a lead, and returns the
// per-step driver.
const ROUTES = {
  // Level one: run, then stop at the last gap, wait for the platform, ride it
  // across and hop up to the ledge. Nothing but the platform reaches that
  // ledge, so there is no route that does not wait for it.
  1: (level, lead) => {
    const run = runner(level, lead);
    const m = level.movers[0];
    const edge = 16200;         // the end of the ground before the last gap
    const ledge = 16560;        // where the ledge begins
    let stage = 'run';
    return (ball) => {
      if (stage === 'run') {
        if (ball.x > edge - 120) stage = 'wait';
        else return run(ball);
      }
      if (stage === 'wait') {
        // Come to a stop short of the edge, then go when the platform is at
        // its nearest and about to head for the ledge.
        if (ball.x > edge - 50) return { left: ball.vx > 0 };
        if (Math.abs(ball.vx) < 30 && m.x < edge + 15 && m.vx < 0) stage = 'board';
        return { right: ball.vx < 0 };
      }
      if (stage === 'board') {
        if (ball.platform === m) stage = 'ride';
        else return { right: ball.x < m.x + 40, jump: ball.grounded && !ball.platform };
      }
      if (stage === 'ride') {
        if (m.x + m.w > ledge - 40 && ball.platform === m) stage = 'leap';
        else {
          const mid = m.x + m.w / 2;
          return { right: ball.x < mid - 20, left: ball.x > mid + 20 };
        }
      }
      return { right: true, jump: !!ball.platform };
    };
  },

  // Level two: running and jumping over gaps and every enemy, and waiting for
  // its one rising patch to be down.
  2: (level, lead) => waitForLow(level, lead),

  // Level three: run to the flat below the ledge, jumping its walker on the
  // way, shove the crate against the ledge's face, back off, hop onto the
  // crate and jump from it to the ledge. Moved here from level two in the
  // Sep 2026 curriculum reshuffle — the route body is unchanged, only its key
  // moved with the level; the walker needs nothing of its own, since the
  // runner jumps any enemy ahead. It waits for the level's rising patch the
  // same way level two does.
  3: (level, lead) => {
    const run = waitForLow(level, lead);
    const crate = level.crates[0];
    const face = level.walls.find((w) => w.h < level.bounds.h);  // the ledge's stone face
    let stage = 'run', stuck = 0, lastX = crate.x;
    return (ball) => {
      if (stage === 'run') {
        // Onto the lower flat, left of the crate: stop running, start pushing.
        if (ball.grounded && ball.y > face.y + 100 && ball.x > crate.x - 200 && ball.x < crate.x) stage = 'push';
        else return run(ball);
      }
      if (stage === 'push') {
        // Push until the crate is up against the face and stops moving.
        stuck = Math.abs(crate.x - lastX) < 0.01 && crate.x + crate.w > face.x - 5 ? stuck + 1 : 0;
        lastX = crate.x;
        if (stuck > 30) stage = 'back';
        return { right: true };
      }
      if (stage === 'back') {
        if (ball.x < crate.x - 90) stage = 'hop';
        return { left: true };
      }
      if (stage === 'hop') {
        if (ball.grounded && ball.platform === crate) stage = 'up';
        return { right: true, jump: ball.grounded && ball.platform !== crate && ball.x > crate.x - 70 * lead };
      }
      return { right: true, jump: ball.grounded && ball.platform === crate };
    };
  },

  // Level four: the runner, until the planks under its tall patch. From 500
  // short of them to just past the tunnel it only holds right, so it arrives
  // at full speed, breaks them and rolls underneath. Section 3d proves the
  // crate way too, and that there is no third.
  4: (level, lead) => {
    const run = runner(level, lead);
    const wood = level.breakables[0];
    return (ball) => {
      if (ball.x > wood.x - 500 && ball.x < wood.x + 150) return { right: true };
      return run(ball);
    };
  },

  // Level five: the generic runner handles it all, gate included. Once
  // grounded contact with the second pad launches the ball, the runner's
  // own obstacle checks (edges, spikes, crates, steps) all gate on
  // `ball.grounded`, so mid-air past the pad it already just holds right —
  // the same thing a bespoke override would do, verified by running the
  // plain runner alone across every lead/delay combination with zero
  // failures before settling on this.
  5: (level, lead) => runner(level, lead),

  // Level six: run to the crate, push it onto the plate — it comes to rest
  // against the closed gate's own face, the same way level three's crate
  // comes to rest against its ledge face — then just keep holding right.
  // The gate takes CONFIG.GATE.OPEN_TIME to swing open once pressed; the
  // runner has no reason to stop and wait, since by the time the ball
  // finishes crossing the now-empty flat between the crate and the gate,
  // the gate has had time to open.
  6: (level, lead) => {
    const run = runner(level, lead);
    const crate = level.crates[0];
    const sw = level.switches[0];
    let stage = 'run', stuck = 0, lastX = crate.x;
    return (ball) => {
      if (stage === 'run') {
        if (ball.grounded && ball.y > 700 && ball.x > crate.x - 200 && ball.x < crate.x) stage = 'push';
        else return run(ball);
      }
      if (stage === 'push') {
        stuck = Math.abs(crate.x - lastX) < 0.01 && crate.x + crate.w > sw.x + sw.w - 5 ? stuck + 1 : 0;
        lastX = crate.x;
        if (stuck > 30) stage = 'through';
        return { right: true };
      }
      // Through: nothing left for the generic runner's own checks (edges,
      // spikes, crates, steps) to react to on this stretch, so just hold
      // right — the gate opens on its own.
      return { right: true };
    };
  },
};

// Level four's other way: shove the crate against the planks, back off at
// least 160, hop onto the crate from within 50 * lead of it, and jump off it.
// Simulated from rest: hopping from within 30-70px of the crate cleared the
// patch; from 90px or more it hit the teeth.
//
// `late` spreads the second press the way `lead` spreads the first, since
// this is the one way over once the crate is flush and a thumb is never
// frame-exact. Zero or more: press that many seconds after landing on the
// crate. Negative: press once, while still falling onto it, that many seconds
// before it lands — the jump buffer has to carry it.
function crateRoute4(level, lead, late) {
  const run = runner(level, lead);
  const crate = level.crates[0];
  const wood = level.breakables[0];
  let stage = 'run', stuck = 0, lastX = crate.x, landed = 0;
  return (ball) => {
    if (stage === 'run') {
      if (ball.grounded && ball.x > crate.x - 200 && ball.x < crate.x) stage = 'push';
      else return run(ball);
    }
    if (stage === 'push') {
      stuck = Math.abs(crate.x - lastX) < 0.01 && crate.x + crate.w > wood.x - 5 ? stuck + 1 : 0;
      lastX = crate.x;
      if (stuck > 30) stage = 'back';
      return { right: true };
    }
    if (stage === 'back') {
      if (ball.x < crate.x - 160) stage = 'hop';
      return { left: true };
    }
    if (stage === 'hop') {
      if (ball.grounded && ball.platform === crate) { stage = 'over'; landed = level.time; }
      else if (late < 0 && !ball.grounded && ball.vy > 0 && ball.x + CONFIG.BALL.R > crate.x &&
               crate.y - (ball.y + CONFIG.BALL.R) < -late * ball.vy) {
        stage = 'off';               // pressed early, falling onto the crate
        return { right: true, jump: true };
      } else {
        return { right: true, jump: ball.grounded && ball.platform !== crate && ball.x > crate.x - 50 * lead };
      }
    }
    if (stage === 'over') {
      // An early run that landed here never pressed at all, and must not be
      // rescued by an on-time press: it fails, loudly, at the teeth.
      return { right: true, jump: late >= 0 && ball.grounded && ball.platform === crate && level.time - landed >= late };
    }
    return { right: true };
  };
}

// A spread wide enough to be sloppy, not so wide it is somebody else's route:
// jumping at 70% to 130% of the chosen lead, and starting at any of ten points
// through a platform's cycle, which is how the moving parts are met out of
// step with each other.
//
// Ten points over 4.5s cover a whole cycle of every platform here (4-5s), a
// walker (about 4.5s) and a popper (3s), but only a fifth or so of a roller's
// 23-27s patrol, so a roller is only ever met where a quick arrival finds it.
// Level four's roller comment in levels.js has what a whole-patrol sweep
// shows.
const LEADS = [0.7, 1, 1.3];
const DELAYS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];

// --- 1. every level is finished by its route, every way it is tried --------
console.log(`\n1. ${LEVELS.length} level(s), each tried ${LEADS.length * DELAYS.length} ways`);
for (const data of LEVELS) {
  const route = ROUTES[data.id];
  if (!route) { fail(`level ${data.id} has no route in finish.mjs — nothing shows it can be finished`); continue; }

  let worst = 0, bad = [];
  for (const lead of LEADS) {
    for (const delay of DELAYS) {
      const { ball, level, t, riserHits, riserHitX } = play(data, (lv) => route(lv, lead), { delay });
      // WHERE it won, not just whether: the flag is the only thing that sets
      // `won`, but a goal moved without the check noticing would still pass a
      // bare boolean.
      const atFlag = Math.hypot(ball.x - level.goal.x, ball.y - level.goal.y) <= CONFIG.GOAL.R;
      if (!ball.won || !atFlag || ball.deaths > 0) {
        bad.push(`lead ${lead} delay ${delay}: won=${ball.won} deaths=${ball.deaths} at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
      } else if (riserHits > 0) {
        bad.push(`lead ${lead} delay ${delay}: took a hit at a rising patch at x=${riserHitX.toFixed(0)}`);
      }
      worst = Math.max(worst, t - delay);
    }
  }
  if (bad.length) {
    fail(`level ${data.id} was not finished cleanly ${bad.length} time(s) of ${LEADS.length * DELAYS.length}:`);
    for (const b of bad.slice(0, 5)) console.log('        ' + b);
  } else {
    console.log(`   level ${data.id}: finished every time without failing, slowest in ${worst.toFixed(1)}s`);
  }
}

// --- 2. and from every checkpoint ------------------------------------------
//
// From the point a respawn actually uses, lifted off the anchor, and from
// rest — which is the whole difference. A ball arriving at full speed clears a
// patch that one starting still, a few lengths away, may not.
console.log('\n2. from every checkpoint');
for (const data of LEVELS) {
  const route = ROUTES[data.id];
  if (!route) continue;
  for (const [i, c] of (data.checkpoints || []).entries()) {
    const from = { x: c.x, y: c.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE };
    const bad = [];
    for (const lead of LEADS) {
      const { ball, riserHits, riserHitX } = play(data, (lv) => route(lv, lead), { from });
      if (!ball.won || ball.deaths > 0) bad.push(`lead ${lead}: won=${ball.won} deaths=${ball.deaths} at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
      else if (riserHits > 0) bad.push(`lead ${lead}: took a hit at a rising patch at x=${riserHitX.toFixed(0)}`);
    }
    if (bad.length) fail(`level ${data.id}: a ball respawned at checkpoint ${i} (${c.x},${c.y}) did not finish cleanly — ${bad.join('; ')}`);
  }
  if (data.checkpoints?.length) console.log(`   level ${data.id}: finished from each of its ${data.checkpoints.length} checkpoints`);
}

// --- 3. level three cannot be finished without its crate --------------------
//
// It is the level that teaches the crate, and a ledge a strong jump can reach
// teaches nothing: the child simply never learns there was another way. So
// take the crate away and try everything a ball on the flat below can do —
// jump from every point along it, once or over and over, running right the
// whole time — and the ledge must stay out of reach.
//
// The margin is pinned, not only the verdict. The ledge is at y=620, so a
// ball has to get its centre above 600 to land on it; from the flat at 800 a
// jump brings the centre to about 649. That is 49px short, measured here
// rather than trusted from a comment — and if a change to the jump eats most
// of it, this says so before the level quietly stops needing the crate.
//
// Moved here from level two in the Sep 2026 curriculum reshuffle — only the
// id this check looks up changed; the level's own geometry and this
// arithmetic did not.
console.log('\n3. level three without its crate');
{
  const data = LEVELS.find((l) => l.id === 3);
  if (!data) fail('there is no level 3');
  else {
    const bare = { ...data, boxes: data.boxes.filter((b) => !b.movable) };
    const face = bare.boxes.find((b) => b.h < data.bounds.h);
    const need = face.y - CONFIG.BALL.R;         // centre height that lands on the ledge
    let best = Infinity, won = 0, tries = 0;
    for (let from = face.x - 620; from <= face.x - 10; from += 4) {
      for (const spam of [false, true]) {
        tries++;
        let pressed = false;
        const { ball } = play({ ...bare, spawn: { x: face.x - 610, y: face.y + 150 } }, () => (b) => {
          if (b.x > face.x - 60) best = Math.min(best, b.y);
          const jump = b.x >= from && (spam || !pressed);
          if (jump) pressed = true;
          return { right: true, jump };
        }, { seconds: 5 });
        if (ball.won) won++;
      }
    }
    if (won) fail(`level 3 was finished without its crate ${won} time(s) of ${tries} — the ledge no longer needs it`);
    else if (best - need < 30) {
      fail(`without the crate a ball gets its centre to y=${best.toFixed(0)} beside the ledge, within ${(best - need).toFixed(0)}px of the ${need} it needs — too close to be sure it needs the crate`);
    } else {
      console.log(`   ${tries} tries without it, none finished; the best got to y=${best.toFixed(0)} beside the ledge, ${(best - need).toFixed(0)}px short of ${need}`);
    }
    // And against a literal, so a change that moved the ledge and the jump
    // together cannot slide past a check that derives both from the level.
    if (best < 620) fail(`without the crate a ball gets its centre to y=${best.toFixed(0)}; it was about 649 when this was written`);
  }
}

// --- 3b. level five cannot clear the wall without the second pad -----------
//
// The first pad (the rehearsal, on open ground) stays — removing it would
// also remove the one place this checks that a ball can even reach the
// wall's approach normally. Only the gate pad, at 11140, is taken away.
console.log('\n3b. level five without its gate pad');
{
  const data = LEVELS.find((l) => l.id === 5);
  if (!data) fail('there is no level 5');
  else {
    const gatePad = data.pads.find((p) => p.x === 11140);
    if (!gatePad) fail('level 5 has no pad at x=11140 to remove — has the geometry moved?');
    else {
      const bare = { ...data, pads: data.pads.filter((p) => p !== gatePad) };
      const wallX = 11360;
      let cleared = 0, tries = 0, closest = Infinity;
      for (let from = wallX - 700; from <= wallX - 100; from += 20) {
        tries++;
        const { ball } = play({ ...bare, spawn: { x: from, y: 600 } }, () => (b) => ({ right: true }), { seconds: 6 });
        closest = Math.min(closest, wallX - ball.x);
        if (ball.x > wallX + 60) cleared++;
      }
      if (cleared) fail(`level 5 was cleared past the wall without its gate pad ${cleared} time(s) of ${tries} — the wall no longer needs it`);
      else if (closest > 40) fail(`without the pad, the closest any attempt got to the wall was ${closest.toFixed(0)}px short — this proves nothing about needing the pad`);
      else console.log(`   ${tries} tries without it, none got past the wall at x=${wallX} (closest approach ${closest.toFixed(0)}px short)`);
    }
  }
}

// --- 3c. level six cannot open its gate without the switch -----------------
//
// Remove the switch entirely, so `g.switchId` matches nothing and the gate
// finds no switch to read `pressed` from — the same "unfound reference
// behaves as false" `Level.update`'s own `sw && sw.pressed` already falls
// back to — and confirm the gate simply never opens.
console.log('\n3c. level six without its switch');
{
  const data = LEVELS.find((l) => l.id === 6);
  if (!data) fail('there is no level 6');
  else {
    const bare = { ...data, switches: [] };
    const gateX = data.gates[0].x;
    let cleared = 0, tries = 0;
    for (let from = gateX - 700; from <= gateX - 100; from += 20) {
      tries++;
      const { ball } = play({ ...bare, spawn: { x: from, y: 600 } }, () => (b) => ({ right: true }), { seconds: 8 });
      if (ball.x > gateX + 100) cleared++;
    }
    if (cleared) fail(`level 6 was cleared past the gate ${cleared} time(s) of ${tries} without its switch — the gate no longer needs it`);
    else console.log(`   ${tries} tries without it, none got past the gate at x=${gateX}`);
  }
}

// --- 3d. level four: both ways past its tall patch, and no third -----------
//
// The route above goes through the tunnel, so it must have broken the planks.
// The crate route, from checkpoint two, must finish without breaking them. With
// the crate gone and the planks made unbreakable, no jump from anywhere gets
// past. And a slow roll into the real planks leaves them standing.
console.log('\n3d. level four, both ways past its tall patch');
{
  const data = LEVELS.find((l) => l.id === 4);
  const plank = data.breakables?.[0];
  const tall = plank && data.spikes.find((s) => s.x === plank.x);
  if (!plank || !tall || !data.boxes.some((b) => b.movable)) fail('level 4 has no planks under a tall patch, or no crate — has the geometry moved?');
  else {
    const past = plank.x + tall.w + 20;

    const tunnel = play(data, (lv) => ROUTES[4](lv, 1));
    if (!tunnel.ball.won) fail('level 4\'s tunnel route did not finish');
    else if (!tunnel.level.breakables[0].broken) fail('level 4 was finished without breaking the planks — the tunnel is not what finished it');
    else console.log('   the tunnel route broke the planks on its way to the flag');

    const cp = data.checkpoints[1];
    const from = { x: cp.x, y: cp.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE };
    // A second press 0.1s early (the buffer carries it), on the landing step,
    // and 0.08s late.
    const LATES = [-0.1, 0, 0.08];
    const bad = [];
    const crateAt = new Set();
    for (const lead of LEADS) {
      for (const late of LATES) {
        const { ball, level } = play(data, (lv) => crateRoute4(lv, lead, late), { from });
        const broken = level.breakables[0].broken;
        crateAt.add(level.crates[0].x.toFixed(0));
        if (!ball.won || ball.deaths > 0 || broken) {
          bad.push(`lead ${lead} late ${late}: won=${ball.won} deaths=${ball.deaths} hits=${ball.hits} broken=${broken} at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
        }
      }
    }
    if (bad.length) fail(`level 4's crate route did not finish cleanly ${bad.length} time(s) of ${LEADS.length * LATES.length}: ${bad.join('; ')}`);
    else console.log(`   the crate route finished all ${LEADS.length * LATES.length} ways (early, on time, late) without breaking the planks (crate left at x=${[...crateAt].join(', ')})`);

    const bare = {
      ...data,
      boxes: data.boxes.filter((b) => !b.movable).concat([{ x: plank.x, y: plank.y, w: plank.w, h: plank.h }]),
      breakables: [],
    };
    // A crossing is any run that gets past without dying, hit or not: taking
    // a heart and being knocked over the teeth is still a way past.
    let cleared = 0, tries = 0, reached = 0;
    for (let jumpAt = plank.x - 300; jumpAt <= plank.x - 5; jumpAt += 5) {
      tries++;
      let done = false, crossed = false;
      const { ball } = play(bare, () => (b) => {
        if (b.deaths === 0) {
          reached = Math.max(reached, b.x);
          if (b.x > past) crossed = true;
        }
        const jump = !done && b.grounded && b.x >= jumpAt;
        if (jump) done = true;
        return { right: true, jump };
      }, { from: { x: plank.x - 700, y: 740 }, seconds: 5 });
      if (ball.deaths === 0 && ball.x > past) crossed = true;
      if (crossed) cleared++;
    }
    if (cleared) fail(`without the crate or the tunnel, level 4's tall patch was crossed ${cleared} time(s) of ${tries}, hits allowed (furthest x=${reached.toFixed(0)}, past it is ${past})`);
    else if (reached < plank.x - 60) fail(`without the crate or the tunnel, no attempt got nearer than x=${reached.toFixed(0)} to the planks at ${plank.x} — this proves nothing`);
    else console.log(`   ${tries} jumps with no crate and no tunnel, none got past even taking a hit (furthest x=${reached.toFixed(0)}, past it is ${past})`);

    const slow = play(data, () => () => ({ right: true }), { from: { x: plank.x - CONFIG.BALL.R - 15, y: 740 }, seconds: 3 });
    if (slow.level.breakables[0].broken) fail('a slow roll into level 4\'s planks broke them');
    else console.log('   a slow roll into the planks left them standing');
  }
}

// --- 4. exhausting hearts mid-level sends the ball back to its start ------
//
// Everything above proves a level can be finished without ever running out
// of hearts. This proves the OTHER path is real too: play level one for real
// up to its first checkpoint, take three hits by hand (level one has no
// enemies, and the runner clears its one spike patch without a touch, so
// nothing there supplies them for real), and confirm the ball comes
// back at the level's spawn with hearts refilled, not at the checkpoint it
// had already reached.
console.log('\n4. exhausting hearts mid-level');
{
  const data = LEVELS[0];
  const level = loadLevel(data);
  const ball = new Ball(level.spawn.x, level.spawn.y);
  // Level one's own first gap (2950-3150, flat to flat) sits well before its
  // first checkpoint at x=8750, so getting there for real needs the same
  // jump-before-a-gap driving every other check in this file already uses —
  // holding right and never jumping drops the ball into that gap forever.
  // Reuse the file's own runner rather than inventing a second way to drive.
  const run = runner(level, 1);
  let press = false;
  const input = {
    left: false, right: false,
    takeJump() { const j = press; press = false; return j; },
  };
  const n = Math.round(60 / CONFIG.STEP);
  let i = 0;
  for (; i < n && !level.checkpoints[0].taken; i++) {
    const want = run(ball);
    input.left = !!want.left;
    input.right = !!want.right;
    if (want.jump) press = true;
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
  if (!level.checkpoints[0].taken) fail('level one: never reached its first checkpoint, so nothing was tested');
  else {
    const spawn = { ...ball.spawn };
    for (let h = 0; h < CONFIG.HEALTH.HEARTS; h++) {
      ball.hit(1);
      for (let s = 0; s < Math.round((CONFIG.HEALTH.IFRAME + 0.05) / CONFIG.STEP); s++) {
        level.update(CONFIG.STEP);
        ball.update(CONFIG.STEP, { left: false, right: false, takeJump: () => false }, level);
      }
    }
    console.log(`   after 3 hits past checkpoint 0: hearts=${ball.hearts}, x=${ball.x.toFixed(0)} (level start ${spawn.x})`);
    if (Math.abs(ball.x - spawn.x) > 5) fail(`came back at x=${ball.x.toFixed(0)}, not level one's own start at ${spawn.x}`);
    if (ball.hearts !== CONFIG.HEALTH.HEARTS) fail(`hearts did not refill: ${ball.hearts}`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nEVERY LEVEL CAN BE FINISHED');
process.exit(failures ? 1 : 0);
