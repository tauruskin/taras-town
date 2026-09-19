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

/**
 * What a child does about a charger, or null if none needs anything.
 *
 * Stand still while one winds up or charges at him, and jump when a charge
 * is `150 * lead` away. Worked on paper and swept in Node: jumping from rest,
 * the ball clears the charger's 52-tall box if the charge is 84 to 248 away,
 * centre to centre, so 105 (lead 0.7) to 195 (lead 1.3) all sit inside it.
 * A dazed one is left to the caller: rolled through or stomped.
 */
function dodge(level, ball, lead) {
  for (const c of level.enemies) {
    if (c.kind !== 'charger' || !c.alive) continue;
    if (Math.abs(c.y - ball.y) > 60) continue;
    const toward = Math.sign(ball.x - c.x) === c.dir;
    const gap = Math.abs(ball.x - c.x);
    if (!toward || gap > 400) continue;
    if (c.state === 'charge' && gap < 150 * lead) return { jump: ball.grounded };
    if (c.state === 'charge' || c.state === 'windup') return {};
    // Patrolling towards him and about to see him: wait for it.
    if (c.state === 'patrol' && gap < 320) return {};
  }
  // Patrolling away from him, ahead: wait for it to turn round rather than
  // catch it up and land on it, which costs a heart. Every level goes right,
  // so "ahead" is to the right.
  for (const c of level.enemies) {
    if (c.kind !== 'charger' || !c.alive || c.state !== 'patrol') continue;
    if (Math.abs(c.y - ball.y) > 60) continue;
    if (c.x > ball.x && c.dir === 1 && c.x - ball.x < 400) return {};
  }
  return null;
}

/**
 * Level ten, outside the pen: hold back from the step while the charger is
 * patrolling towards it within PEN_GUARD, or null to carry on.
 *
 * `dodge` alone is not enough here, because it can only stop a ball on the
 * ground: the hop over the step is committed from outside, and it landed the
 * ball on a charger that had arrived just the other side — 31 hits in 505
 * runs (leads 0.7-1.3, start delays 0-25s, a whole ~13s patrol of the pen).
 * Outside the step nothing can reach him, so waiting there costs nothing.
 * Swept the same way: 300 still took 15 hits, 400 five, 500 to 900 none;
 * 600 is 500 with room. No home for the charger fixes it instead: the pen is
 * 840 wide and a 4.5s spread of arrivals is 540 of its patrol.
 */
const PEN_GUARD = 600;
function holdAtStep(level, ball, c) {
  const step = level.walls.find((w) => w.x === 1400 && w.h === 60);
  if (ball.x >= step.x || !c.alive || c.state !== 'patrol' || c.dir !== -1) return null;
  if (c.x - step.x >= PEN_GUARD) return null;
  return ball.x > step.x - 150 ? { left: true } : {};
}

/** A level's sender by id. */
const sender = (level, id) => level.senders.find((s) => s.id === id);

// Every prepared run through level nine's timed room records how much of the
// timer it used. Checked after section 2: every run, from every lead, delay
// and checkpoint, must leave at least 40% of the time unused — the proof
// that room is not a pixel-perfect run.
const SPARE9 = [];

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
    const run = waitForLow(level, lead);
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

  // Level eight: buttons. Each stage is one thing a thumb does. The stage it
  // starts in comes from where the ball starts, so the same route serves the
  // spawn and both checkpoints.
  8: (level, lead) => {
    const run = runner(level, lead);
    const a = sender(level, 'a'), b = sender(level, 'b'), c = sender(level, 'c'), d = sender(level, 'd');
    const crate = level.crates[0];
    const shelf = level.walls.find((w) => w.x === 11000 && w.y === 590);
    const bridge = level.bridges[0];
    const W = CONFIG.CIRCUIT.POST_W;
    let stage = null, stuck = 0, lastX = crate.x;
    return (ball) => {
      if (!stage) stage = ball.x < a.x ? 'a' : ball.x < b.x - 300 ? 'run' : ball.x < c.x - 300 ? 'run2' : 'c';
      // Room A: roll into the button, then hop its post.
      if (stage === 'a') { if (a.pressed) stage = 'hopA'; else return { right: true }; }
      if (stage === 'hopA') {
        if (ball.x > a.x + W + 30) stage = 'run';
        return { right: true, jump: ball.grounded };
      }
      // The warm-up belongs to the generic runner.
      if (stage === 'run') { if (ball.x > b.x - 300) stage = 'overB'; else return run(ball); }
      // Room B: hop the post's plain side, then come back into its cap.
      if (stage === 'overB') {
        if (ball.x > b.x + W + 100) stage = 'backB';
        return { right: true, jump: ball.grounded && b.x - ball.x > 0 && b.x - ball.x < 120 * lead };
      }
      if (stage === 'backB') { if (b.pressed) stage = 'cross'; else return { left: true }; }
      if (stage === 'cross') { if (ball.x > bridge.x + bridge.w + 60) stage = 'run2'; else return { right: true }; }
      if (stage === 'run2') { if (ball.x > c.x - 300) stage = 'c'; else return run(ball); }
      // Room C: the floor button, the crate to the shelf, up, the shelf button.
      if (stage === 'c') { if (c.pressed) stage = 'hopC'; else return { right: true }; }
      if (stage === 'hopC') {
        if (ball.grounded && ball.x > c.x + W + 30) stage = 'push';
        return { right: true, jump: ball.grounded && ball.x < c.x + W + 30 };
      }
      if (stage === 'push') {
        stuck = Math.abs(crate.x - lastX) < 0.01 && crate.x + crate.w > shelf.x - 5 ? stuck + 1 : 0;
        lastX = crate.x;
        if (stuck > 30) stage = 'back';
        return { right: true };
      }
      if (stage === 'back') { if (ball.x < crate.x - 160) stage = 'hop'; return { left: true }; }
      if (stage === 'hop') {
        if (ball.grounded && ball.platform === crate) stage = 'up';
        else return { right: true, jump: ball.grounded && ball.platform !== crate && ball.x > crate.x - 50 * lead };
      }
      if (stage === 'up') {
        if (ball.grounded && ball.y < shelf.y) stage = 'd';
        else return { right: true, jump: ball.grounded && ball.platform === crate };
      }
      if (stage === 'd') { if (d.pressed) stage = 'hopD'; else return { right: true }; }
      if (stage === 'hopD') {
        if (ball.x > d.x + W + 30) stage = 'end';
        return { right: true, jump: ball.grounded };
      }
      return run(ball);
    };
  },

  // Level nine: timers. Room B is the one to read: the bridge's button on the
  // floating ledge first, then the timer — which faces right, so it is
  // hopped and come back to — then run. The timer is pressed last, which is
  // the whole lesson.
  9: (level, lead) => {
    const run = runner(level, lead);
    const t1 = sender(level, 't1'), b = sender(level, 'b'), t2 = sender(level, 't2'), p = sender(level, 'p');
    const ledge = level.walls.find((w) => w.x === 7400 && w.y === 670);
    const gateB = level.gates.find((g) => g.needs.includes('t2'));
    const crate = level.crates[0];
    const W = CONFIG.CIRCUIT.POST_W;
    let stage = null, pressedAt = 0, hopped = false;
    return (ball) => {
      if (!stage) stage = ball.x < t1.x ? 'a' : ball.x < ledge.x - 400 ? 'run' : ball.x < gateB.x ? 'ledge' : 'run3';
      // Room A: a timer in the path; the gate is well inside its time.
      if (stage === 'a') { if (t1.pressed) stage = 'hopA'; else return { right: true }; }
      if (stage === 'hopA') {
        if (ball.x > t1.x + W + 30) stage = 'run';
        return { right: true, jump: ball.grounded };
      }
      if (stage === 'run') { if (ball.x > ledge.x - 400) stage = 'ledge'; else return run(ball); }
      // Room B, first the bridge: up onto the floating ledge. Jumped from far
      // enough out that the ball is above the ledge's lip when it gets there.
      // A ball that misses rolls on underneath; it goes back and tries again.
      if (stage === 'ledge') {
        if (ball.grounded && ball.y < ledge.y) stage = 'b';
        else if (ball.grounded && ball.x > ledge.x + ledge.w) stage = 'retry';
        else return { right: true, jump: ball.grounded && ball.y > ledge.y && ledge.x - ball.x > 0 && ledge.x - ball.x < 165 * lead };
      }
      if (stage === 'retry') { if (ball.x < ledge.x - 400) stage = 'ledge'; return { left: true }; }
      if (stage === 'b') { if (b.pressed) stage = 'hopB'; else return { right: true }; }
      if (stage === 'hopB') {
        if (ball.grounded && ball.y > ledge.y && ball.x > ledge.x + ledge.w) stage = 'overT2';
        return { right: true, jump: ball.grounded && ball.y < ledge.y };
      }
      // Then the timer: hop its plain side, come back into its cap, run.
      if (stage === 'overT2') {
        if (ball.x > t2.x + W + 100) stage = 'backT2';
        return { right: true, jump: ball.grounded && t2.x - ball.x > 0 && t2.x - ball.x < 120 * lead };
      }
      if (stage === 'backT2') {
        if (t2.pressed) { stage = 'go'; pressedAt = level.time; }
        else return { left: true };
      }
      // After the press, a sloppy thumb: it hesitates for longer the sloppier
      // the lead (0, 0.45, 0.9s), and at the sloppiest hops once for nothing
      // on the way. Otherwise every record here is the same roll.
      if (stage === 'go') {
        if (level.time - pressedAt < (lead - 0.7) * 1.5) return {};
        if (ball.x > gateB.x + gateB.w + 20) {
          SPARE9.push({ lead, used: level.time - pressedAt, time: t2.time });
          stage = 'run3';
        } else {
          const hop = lead > 1.2 && !hopped && ball.grounded && ball.x > t2.x + 150;
          if (hop) hopped = true;
          return { right: true, jump: hop };
        }
      }
      // Room C: push the crate off the plate, into the trench.
      if (stage === 'run3') { if (ball.x > p.x - 300) stage = 'push'; else return run(ball); }
      if (stage === 'push') { if (crate.y > 700) stage = 'end'; else return { right: true }; }
      return run(ball);
    };
  },
  // Level ten: wait for the charger, jump its charge into the stone step,
  // then wait by the planks for the second charge, which breaks them.
  10: (level, lead) => {
    const run = runner(level, lead);
    const c = level.enemies.find((e) => e.kind === 'charger');
    const wood = level.breakables[0];
    let stage = null;
    return (ball) => {
      // From the checkpoint, past the planks, there is nothing left to wait for.
      if (!stage) stage = ball.x > wood.x + wood.w ? 'out' : 'in';
      const d = dodge(level, ball, lead);
      if (d) return d;
      if (stage === 'in') {
        if (ball.grounded && ball.x > 1700) stage = 'wait1';
        else return holdAtStep(level, ball, c) || run(ball);
      }
      // Popped (a hop over the step can land on it while dazed) is as good
      // as dazed behind him; with it gone, the ball breaks the planks itself.
      if (stage === 'wait1') {
        if (!c.alive || (c.state === 'dazed' && c.x < ball.x)) stage = 'wait2';
        else return {};
      }
      if (stage === 'wait2') {
        if (wood.broken || !c.alive) stage = 'out';
        else return ball.x < 2150 ? { right: true } : {};
      }
      return run(ball);
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
// crate. Negative: press once, while still falling onto it, about that many
// seconds before it lands — the jump buffer has to carry it. About, because
// the trigger divides the distance left by the current fall speed and ignores
// gravity: -0.1 presses roughly 0.075s early.
function crateRoute4(level, lead, late) {
  const run = waitForLow(level, lead);
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

// --- 2b. level nine's timed room is never a pixel-perfect run ---------------
console.log('\n2b. level nine: time to spare at the timed gate');
if (!SPARE9.length) fail('no run of level nine ever reached its timed gate — nothing was measured');
else {
  const worst = SPARE9.reduce((w, s) => Math.max(w, s.used / s.time), 0);
  const tight = SPARE9.filter((s) => s.used > 0.6 * s.time);
  if (tight.length) fail(`${tight.length} of ${SPARE9.length} runs used more than 60% of level nine's timer (worst ${(worst * 100).toFixed(0)}%)`);
  else console.log(`   ${SPARE9.length} runs; the slowest used ${(worst * 100).toFixed(0)}% of the timer`);
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
        if (!ball.won || ball.deaths > 0 || ball.hits > 0 || broken) {
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

// --- 3e. level eight: each room needs its button ----------------------------
console.log('\n3e. level eight without its buttons');
{
  const data = LEVELS.find((l) => l.id === 8);
  const gateA = data.gates[0];
  // Room A without its button: hopping and running for all they are worth,
  // nothing gets past the gate.
  {
    const bare = { ...data, senders: data.senders.filter((s) => s.id !== 'a') };
    const { ball } = play(bare, () => (b) => ({ right: true, jump: b.grounded }), { seconds: 8 });
    if (ball.x > gateA.x) fail(`level 8 room A was passed without its button (ball at x=${ball.x.toFixed(0)})`);
    else console.log(`   room A without its button: stopped at x=${ball.x.toFixed(0)}, gate at ${gateA.x}`);
  }
  // Room B without its button: no single jump from anywhere clears the gap.
  {
    const bare = { ...data, senders: data.senders.filter((s) => s.id !== 'b') };
    const br = data.bridges[0];
    let cleared = 0, tries = 0, reached = 0;
    for (let jumpAt = br.x - 300; jumpAt <= br.x - 5; jumpAt += 5) {
      tries++;
      let done = false;
      const { ball } = play(bare, () => (b) => {
        reached = Math.max(reached, b.x);
        const jump = !done && b.grounded && b.x >= jumpAt;
        if (jump) done = true;
        return { right: true, jump };
      }, { from: { x: br.x - 500, y: 740 }, seconds: 4 });
      if (ball.deaths === 0 && ball.x > br.x + br.w + 20) cleared++;
    }
    if (cleared) fail(`level 8's gap was crossed without its bridge ${cleared} time(s) of ${tries}`);
    else if (reached < br.x) fail(`no attempt reached level 8's gap edge (furthest ${reached.toFixed(0)}) — this proves nothing`);
    else console.log(`   room B without its button: ${tries} jumps, none crossed the ${br.w} gap`);
  }
  // Room C without either of its buttons: from the shelf, rolling and hopping
  // at the door, nothing gets past it.
  {
    const gateC = data.gates[1];
    for (const id of ['c', 'd']) {
      const bare = { ...data, senders: data.senders.filter((s) => s.id !== id) };
      let furthest = 0;
      play(bare, () => (b) => {
        furthest = Math.max(furthest, b.x);
        return { right: true, jump: b.grounded };
      }, { from: { x: 11050, y: 570 }, seconds: 6 });
      if (furthest > gateC.x + gateC.w) fail(`level 8 room C was passed without button ${id} (ball reached x=${furthest.toFixed(0)})`);
      else console.log(`   room C without button ${id}: got no further than x=${furthest.toFixed(0)}, gate at ${gateC.x}`);
    }
  }
}

// --- 3f. level eight: the shelf needs the crate ------------------------------
console.log('\n3f. level eight without its crate');
{
  const data = LEVELS.find((l) => l.id === 8);
  const shelf = data.boxes.find((b) => b.x === 11000 && b.y === 590);
  const bare = { ...data, boxes: data.boxes.filter((b) => !b.movable) };
  // It starts just right of button c's post, not left of it: the post is a
  // step too, and the header comment's arithmetic is what rules that step
  // out (it ends 520 short of the shelf, and a jump carries at most 290).
  const c = data.senders.find((s) => s.id === 'c');
  const fromX = c.x + CONFIG.CIRCUIT.POST_W + CONFIG.BALL.R + 10;
  let onShelf = 0, tries = 0, best = Infinity;
  for (let jumpAt = shelf.x - 400; jumpAt <= shelf.x - 5; jumpAt += 5) {
    for (const spam of [false, true]) {
      tries++;
      let pressed = false, up = false;
      play(bare, () => (b) => {
        if (b.x > shelf.x - 60) best = Math.min(best, b.y + CONFIG.BALL.R);
        if (b.grounded && b.y < shelf.y) up = true;
        const jump = b.x >= jumpAt && (spam || !pressed);
        if (jump) pressed = true;
        return { right: true, jump };
      }, { from: { x: fromX, y: 740 }, seconds: 4 });
      if (up) onShelf++;
    }
  }
  if (onShelf) fail(`level 8's shelf was reached without the crate ${onShelf} time(s) of ${tries}`);
  // `best` is the highest (smallest y) a ball's BOTTOM got beside the shelf;
  // the header comment's arithmetic says about 629, 39 below the top at 590.
  else if (best - shelf.y < 30) fail(`without the crate a ball's bottom got to y=${best.toFixed(0)}, within 30 of the shelf top ${shelf.y} — too close to be sure it needs the crate`);
  else console.log(`   ${tries} tries, none reached the shelf; the highest a ball's bottom got beside it was y=${best.toFixed(0)} (shelf top ${shelf.y})`);
}

// --- 3g. level eight: room C has no dead end ---------------------------------
//
// Room C cannot be failed, so a crate shoved somewhere useless is a room with
// no way out but the restart button. The one way to shove it left is from
// between it and the shelf, so the crate starts too close to the shelf's face
// for the ball to get in there. Try the ways a ball could: rolling left off
// the shelf (plain, and jumping near the crate), and the reviewer's recipe —
// run right, jump once anywhere across the crate, then hold left. The crate
// must never be moved left at all, let alone end up against button c's post.
console.log('\n3g. level eight: room C has no dead end');
{
  const data = LEVELS.find((l) => l.id === 8);
  const start = data.boxes.find((b) => b.movable);
  const c = data.senders.find((s) => s.id === 'c');
  const postRight = c.x + CONFIG.CIRCUIT.POST_W;
  const shelf = data.boxes.find((b) => b.x === 11000 && b.y === 590);
  const tries = [];
  // Off the shelf's left edge, holding left; and the same, jumping once as it
  // comes over the crate.
  for (const jumpNear of [false, true]) {
    tries.push({ name: `off the shelf${jumpNear ? ', jumping near the crate' : ''}`,
      from: { x: shelf.x + 30, y: shelf.y - CONFIG.BALL.R - 2 },
      drive: () => { let done = false; return (b, t, lv) => {
        const cr = lv.crates[0];
        const jump = jumpNear && !done && b.grounded && b.x < cr.x + cr.w + 60;
        if (jump) done = true;
        return { left: true, jump };
      }; } });
  }
  // The trap recipe: right from just past button c's post, one jump at
  // jumpAt, then left for 10s.
  for (let jumpAt = 10610; jumpAt <= 10790; jumpAt += 20) {
    tries.push({ name: `jump at ${jumpAt} then left`,
      from: { x: postRight + 40, y: 740 },
      drive: () => { let done = false; return (b, t) => {
        if (t >= 3) return { left: true };
        const jump = !done && b.grounded && b.x >= jumpAt;
        if (jump) done = true;
        return { right: true, jump };
      }; } });
  }
  let bad = 0, least = Infinity;
  for (const tr of tries) {
    let lowest = Infinity;
    play(data, (lv) => { const d = tr.drive(); return (b, t) => { lowest = Math.min(lowest, lv.crates[0].x); return d(b, t, lv); }; },
      { from: tr.from, seconds: 13 });
    least = Math.min(least, lowest);
    if (lowest < start.x - 1) {
      bad++;
      fail(`level 8's crate was shoved left to x=${lowest.toFixed(0)} (start ${start.x}${lowest < postRight + 60 ? `, within 60 of button c's post at ${postRight}` : ''}) by: ${tr.name}`);
    }
  }
  if (!bad) console.log(`   ${tries.length} tries at getting behind the crate, none moved it left (lowest x=${least.toFixed(0)}, start ${start.x}, button c's post ends at ${postRight})`);
}

// --- 3h. level nine: room A needs its timer --------------------------------
console.log('\n3h. level nine without its first timer');
{
  const data = LEVELS.find((l) => l.id === 9);
  const bare = { ...data, senders: data.senders.filter((s) => s.id !== 't1') };
  const { ball } = play(bare, () => (b) => ({ right: true, jump: b.grounded }), { seconds: 8 });
  if (ball.x > data.gates[0].x) fail(`level 9 room A was passed without its timer (x=${ball.x.toFixed(0)})`);
  else console.log(`   stopped at x=${ball.x.toFixed(0)}`);
}

// --- 3i. level nine: pressing the timer first does not get through ---------
//
// From checkpoint one: hop the timer's plain side, come back into its cap —
// pressed FIRST — then jump back over it without touching it, roll under the
// ledge and turn round, up onto the ledge for the bridge, and back to the
// gate. Must arrive to a shut gate. It must also really have pressed both,
// or it proves nothing.
console.log('\n3i. level nine, timer pressed first');
{
  const data = LEVELS.find((l) => l.id === 9);
  const cp = data.checkpoints[0];
  const W = CONFIG.CIRCUIT.POST_W;
  // A hit is any refill, not just switching on: a second touch while it runs
  // tops the timer up, and would make "pressed first" prove less than it says.
  let hits = 0, bPressed = false, prevLeft = 0;
  const { ball, level } = play(data, (lv) => {
    const t2 = sender(lv, 't2'), b = sender(lv, 'b');
    const ledge = lv.walls.find((w) => w.x === 7400 && w.y === 670);
    let stage = 'over';
    return (bl) => {
      if (t2.left > prevLeft + 1e-9) hits++;
      prevLeft = t2.left;
      if (b.pressed) bPressed = true;
      if (stage === 'over') {
        if (bl.x > t2.x + W + 100) stage = 'back';
        return { right: true, jump: bl.grounded && t2.x - bl.x > 0 && t2.x - bl.x < 120 };
      }
      if (stage === 'back') { if (t2.pressed) stage = 'away'; else return { left: true }; }
      if (stage === 'away') {
        if (bl.x < ledge.x - 300) stage = 'ledge';
        return { left: true, jump: bl.grounded && bl.x - (t2.x + W) > 0 && bl.x - (t2.x + W) < 120 };
      }
      if (stage === 'ledge') {
        if (bl.grounded && bl.y < ledge.y) stage = 'b';
        else return { right: true, jump: bl.grounded && bl.y > ledge.y && ledge.x - bl.x > 0 && ledge.x - bl.x < 165 };
      }
      if (stage === 'b') { if (b.pressed) stage = 'hop'; else return { right: true }; }
      if (stage === 'hop') {
        if (bl.grounded && bl.y > ledge.y && bl.x > ledge.x + ledge.w) stage = 'overAgain';
        return { right: true, jump: bl.grounded && bl.y < ledge.y };
      }
      // Over the timer's plain side, never back into its cap, and on to the gate.
      return { right: true, jump: bl.grounded && t2.x - bl.x > 0 && t2.x - bl.x < 120 };
    };
  }, { from: { x: cp.x, y: cp.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE }, seconds: 25 });
  const gateB = level.gates.find((g) => g.needs.includes('t2'));
  console.log(`   timer pressed ${hits} time(s), bridge button ${bPressed ? 'pressed' : 'NOT pressed'}, ball ended at x=${ball.x.toFixed(0)} (gate at ${gateB.x})`);
  if (hits !== 1) fail(`the timer-first run pressed the timer ${hits} times — it must be exactly once to prove anything`);
  if (!bPressed) fail('the timer-first run never pressed the bridge button — it proves nothing');
  if (ball.x > gateB.x + gateB.w) fail('pressing the timer first still got through level nine\'s timed gate');
}

// --- 3j. level nine: the crate left on the plate keeps the door shut -------
console.log('\n3j. level nine, crate left on the plate');
{
  const data = LEVELS.find((l) => l.id === 9);
  const gateC = data.gates.find((g) => g.needs.includes('!p'));
  const { ball, level } = play(data, () => () => ({ right: true }), { from: { x: gateC.x - 150, y: 740 }, seconds: 6 });
  const g = level.gates.find((x) => x.needs.includes('!p'));
  console.log(`   gate openT=${g.openT.toFixed(2)}, ball at x=${ball.x.toFixed(0)}`);
  if (g.openT > 0.1) fail(`with the crate on the plate, level nine's last gate opened (openT ${g.openT.toFixed(2)})`);
  if (ball.x > gateC.x) fail('with the crate on the plate, the ball got past level nine\'s last gate');
}

// --- 3k. level nine: room C has no dead end ---------------------------------
//
// The ball can hop the crate and push it LEFT. Without the kerb left of the
// plate nothing stops it short of room B's gate — shut once its timer has
// run out — and a crate flush against that can never be got behind again, in
// a room with no way to fail. So from the right of the crate, try to shove
// it left every way: holding left, jumping near it and then holding left,
// and hopping over it going left and landing on the far side. The crate
// must never go further left than the kerb, AND from wherever it ends up,
// the ball must still be able to push it into the trench: back over it to
// its left, then right.
console.log('\n3k. level nine: room C has no dead end');
{
  const data = LEVELS.find((l) => l.id === 9);
  const kerb = data.boxes.find((b) => !b.movable && b.h < 60 && b.x > 9000);
  const plate = data.senders.find((s) => s.id === 'p');
  const floor = kerb ? kerb.x + kerb.w : plate.x;
  const gateC = data.gates.find((g) => g.needs.includes('!p'));
  const tries = [];
  // Just right of the crate (between it and the trench), and from past the
  // trench, where the ball has jumped out of it.
  for (const fromX of [10124, 10300, 10400]) {
    tries.push({ name: `hold left from ${fromX}`, fromX,
      drive: () => (b, t) => ({ left: true }) });
    for (let jumpAfter = 0; jumpAfter <= 1.5; jumpAfter += 0.25) {
      tries.push({ name: `from ${fromX}, one jump after ${jumpAfter}s, then left`, fromX,
        drive: () => { let done = false; return (b, t) => {
          const jump = !done && b.grounded && t >= jumpAfter;
          if (jump) done = true;
          return { left: true, jump };
        }; } });
    }
    tries.push({ name: `from ${fromX}, hopping all the time`, fromX,
      drive: () => (b) => ({ left: true, jump: b.grounded }) });
  }
  let bad = 0, least = Infinity, recovered = 0;
  for (const tr of tries) {
    let lowest = Infinity;
    // 10s of trying to shove it left, then the way back: hop over it leftwards
    // until clear of it, then hold right until it is in the trench.
    let stage = 'shove', t0 = 0;
    const { level } = play(data, (lv) => {
      const d = tr.drive();
      return (b, t) => {
        const cr = lv.crates[0];
        lowest = Math.min(lowest, cr.x);
        if (stage === 'shove') { if (t > 10) { stage = 'over'; t0 = t; } else return d(b, t); }
        if (stage === 'over') {
          if (b.grounded && b.x < cr.x - 60) stage = 'push';
          else return { left: true, jump: b.grounded };
        }
        return { right: true };
      };
    }, { from: { x: tr.fromX, y: 738 }, seconds: 30 });
    least = Math.min(least, lowest);
    const cr = level.crates[0];
    const g = level.gates.find((x) => x.needs.includes('!p'));
    if (lowest < floor - 1) { bad++; fail(`level 9's crate was shoved left to x=${lowest.toFixed(0)}, past the kerb at ${floor}, by: ${tr.name}`); }
    else if (cr.y <= 700 || g.openT < 0.9) { bad++; fail(`after "${tr.name}", pushing level 9's crate right again did not drop it in the trench (crate at ${cr.x.toFixed(0)},${cr.y.toFixed(0)}, gate openT ${g.openT.toFixed(2)})`); }
    else recovered++;
  }
  if (!bad) console.log(`   ${tries.length} tries at shoving the crate left: it got no further than x=${least.toFixed(0)} (kerb at ${floor}), and every time it was pushed back into the trench after (gate at ${gateC.x} open)`);
}

// --- 3l. level ten: a stomp after the first charge, and the level still goes -
//
// The optional lesson: stomp it while dazed. Then the charger is gone, comes
// back at home once the ball is out of sight, and the level still finishes —
// by the ball breaking the planks itself.
console.log('\n3l. level ten: stomp the dazed charger, and still finish');
{
  const data = LEVELS.find((l) => l.id === 10);
  for (const lead of LEADS) {
    let stomped = false, back = false;
    const route = (level) => {
      const run = runner(level, lead);
      const c = level.enemies[0];
      let stage = 'in';
      return (ball) => {
        if (!c.alive) stomped = true;
        if (stomped && c.alive) back = true;
        const d = dodge(level, ball, lead);
        if (d) return d;
        if (stage === 'in') { if (ball.grounded && ball.x > 1700) stage = 'wait'; else return holdAtStep(level, ball, c) || run(ball); }
        if (stage === 'wait') { if (c.state === 'dazed') stage = 'stomp'; else return {}; }
        // Roll back into it (dazed, it is not solid and does not hurt),
        // settle over it, and jump straight up: the way down is the stomp.
        if (stage === 'stomp') {
          if (!c.alive) { stage = 'out'; return {}; }
          const gap = ball.x - c.x;
          if (gap > 30) return { left: true };
          if (gap < -30) return { right: true };
          return { jump: ball.grounded && Math.abs(ball.vx) < 80 };
        }
        return run(ball);
      };
    };
    const { ball, t } = play(data, route, { seconds: 90 });
    console.log(`   lead ${lead}: stomped=${stomped}, came back=${back}, won=${ball.won} in ${t.toFixed(1)}s, hits=${ball.hits}`);
    if (!stomped) fail(`level ten, lead ${lead}: never stomped the dazed charger`);
    if (!ball.won || ball.deaths) fail(`level ten, lead ${lead}: after a stomp the level was not finished cleanly`);
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
