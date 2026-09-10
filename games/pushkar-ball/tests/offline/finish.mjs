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
// roll right, and jump a little before any gap edge, spike patch or crate
// ahead. Only the two things a runner cannot do by rolling right get a script
// of their own — riding level one's platform to its last ledge, and working
// level two's crate — and those scripts are the proof that those levels can be
// done. If you move the geometry they are written against, move them too; if
// a new level has no route, this suite says so rather than passing.
//
// Then from every checkpoint too, because a checkpoint is a new start: one
// placed so close to a patch that a ball respawning from rest cannot get over
// it would be a trap the full run never sees.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { LEVELS, loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

/**
 * Play `data` with `route` from (x, y), after sitting still for `delay`
 * seconds. Returns the ball, the level and how long it took.
 */
function play(data, route, { delay = 0, from = null, seconds = 60 } = {}) {
  const level = loadLevel(data);
  const at = from || level.spawn;
  const ball = new Ball(at.x, at.y);
  let press = false;
  const input = {
    left: false, right: false,
    takeJump() { const j = press; press = false; return j; },
  };
  const drive = route(level);
  const n = Math.round(seconds / CONFIG.STEP);
  let i = 0;
  for (; i < n && !ball.won; i++) {
    const t = i * CONFIG.STEP;
    const want = t < delay ? {} : drive(ball, t);
    input.left = !!want.left;
    input.right = !!want.right;
    if (want.jump) press = true;
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
  return { ball, level, t: i * CONFIG.STEP };
}

/**
 * Roll right, jumping a little before whatever is ahead.
 *
 * `lead` scales how early it jumps, which is how a run is made sloppy on
 * purpose. The obstacles come from the level: the end of any ground line that
 * no other line carries on from, every spike patch, and every crate that is
 * still in the way.
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
    // A crate is jumped onto and rolled off, never pushed along by the runner:
    // pushing is slow and that is not the question here.
    if (level.crates.some((c) => ahead(c.x, 40) && ball.y > c.y)) want.jump = true;
    return want;
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

  // Level two: run to the flat below the ledge, shove the crate against the
  // ledge's face, back off, hop onto the crate and jump from it to the ledge.
  2: (level, lead) => {
    const run = runner(level, lead);
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

  // Level three: nothing but running and jumping. The platform across its gap
  // is the second way over, not the only one.
  3: (level, lead) => runner(level, lead),
};

// A spread wide enough to be sloppy, not so wide it is somebody else's route:
// jumping at 70% to 130% of the chosen lead, and starting at any of ten points
// through a platform's cycle, which is how the moving parts are met out of
// step with each other.
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
      const { ball, level, t } = play(data, (lv) => route(lv, lead), { delay });
      // WHERE it won, not just whether: the flag is the only thing that sets
      // `won`, but a goal moved without the check noticing would still pass a
      // bare boolean.
      const atFlag = Math.hypot(ball.x - level.goal.x, ball.y - level.goal.y) <= CONFIG.GOAL.R;
      if (!ball.won || !atFlag || ball.deaths > 0) {
        bad.push(`lead ${lead} delay ${delay}: won=${ball.won} deaths=${ball.deaths} at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
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
      const { ball } = play(data, (lv) => route(lv, lead), { from });
      if (!ball.won || ball.deaths > 0) bad.push(`lead ${lead}: won=${ball.won} deaths=${ball.deaths} at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
    }
    if (bad.length) fail(`level ${data.id}: a ball respawned at checkpoint ${i} (${c.x},${c.y}) did not finish cleanly — ${bad.join('; ')}`);
  }
  if (data.checkpoints?.length) console.log(`   level ${data.id}: finished from each of its ${data.checkpoints.length} checkpoints`);
}

// --- 3. level two cannot be finished without its crate ----------------------
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
console.log('\n3. level two without its crate');
{
  const data = LEVELS.find((l) => l.id === 2);
  if (!data) fail('there is no level 2');
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
    if (won) fail(`level 2 was finished without its crate ${won} time(s) of ${tries} — the ledge no longer needs it`);
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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nEVERY LEVEL CAN BE FINISHED');
process.exit(failures ? 1 : 0);
