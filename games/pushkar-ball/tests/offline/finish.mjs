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
 * ball on a charger that had arrived just the other side. Outside the step
 * nothing can reach him, so waiting there costs nothing. A scratch sweep,
 * not run here (five leads 0.7-1.3, start delays 0-25s every 0.25s: a whole
 * ~13s patrol of the pen, 505 runs a value), found 31 hits with no guard,
 * 15 at 300, five at 400, none from 500 to 900; 600 is 500 with room. What
 * this suite runs is section 1's leads and delays, which fail on a lost
 * heart for this level (COUNTS_HEARTS). No home for the charger fixes it instead: the pen is
 * 840 wide and a 4.5s spread of arrivals is 540 of its patrol.
 */
const PEN_GUARD = 600;
// How far short of the step the ball backs off to while it waits: far enough
// that a ball arriving at full speed has stopped before it touches the stone.
const PEN_BACKOFF = 150;
function holdAtStep(level, ball, c) {
  const step = penStep(level, c);
  if (ball.x >= step.x || !c.alive || c.state !== 'patrol' || c.dir !== -1) return null;
  if (c.x - step.x >= PEN_GUARD) return null;
  return ball.x > step.x - PEN_BACKOFF ? { left: true } : {};
}

/** The pen's step: the 60-tall stone the charger's range ends against. */
function penStep(level, c) {
  const step = level.walls
    .filter((w) => !w.movable && w.h === 60 && w.x + w.w <= c.from)
    .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
  if (!step) throw new Error(`level ${level.data.id}: no 60-tall stone step ends at or before the charger's range end (${c.from})`);
  return step;
}

/** A level's sender by id. */
const sender = (level, id) => level.senders.find((s) => s.id === id);

/**
 * One of level eleven's rooms (0 = A, 1 = B), from the level's own geometry,
 * so ROUTES[11], 3m and 3n all read the same numbers and none of them copies
 * a position out of levels.js.
 *
 * The room's charger is the i-th by range; its roof is the stone above it
 * spanning its whole range; its door is the first gate past the roof's end.
 * The yard is between them: a ball's centre rests anywhere from `x0` (the
 * roof's end plus a radius) to `x1` (the gate minus one). `down` is "grounded
 * in the yard, on the charger's own level" — its LEVEL_TOL, so exactly when it
 * can be seen.
 */
function room11(level, i) {
  const R = CONFIG.BALL.R, K = CONFIG.ENEMY.CHARGER;
  const c = level.enemies.filter((e) => e.kind === 'charger').sort((a, b) => a.from - b.from)[i];
  if (!c) throw new Error(`level ${level.data.id}: no charger ${i}`);
  const roof = level.walls.find((w) => w.x <= c.from && w.x + w.w >= c.to && w.y + w.h <= c.y - c.r);
  if (!roof) throw new Error(`level ${level.data.id}: no stone roof over charger ${i}'s range ${c.from}..${c.to}`);
  const gate = level.gates.filter((g) => g.x >= roof.x + roof.w).sort((a, b) => a.x - b.x)[0];
  if (!gate) throw new Error(`level ${level.data.id}: no gate past the end of charger ${i}'s roof (${roof.x + roof.w})`);
  const x0 = roof.x + roof.w + R, x1 = gate.x - R;
  return {
    c, roof, gate, x0, x1,
    down: (ball) => ball.grounded && Math.abs(ball.y - c.y) < K.LEVEL_TOL && ball.x >= x0 - 1 && ball.x < gate.x,
  };
}

/**
 * Where a ball stands in a level-eleven yard to be seen: the yard's second
 * ball-width past `x0`. Shared by ROUTES[11] and 3n so they cannot disagree.
 * It must end a ball's radius inside the charger's sight of its range's end
 * and short of the door, or luring from it would prove nothing. Room A's
 * yard is too narrow for it and needs none: every spot there is in sight.
 */
function lure11(room) {
  const R = CONFIG.BALL.R;
  const near = room.x0 + 2 * R, far = room.x0 + 4 * R;
  if (far > room.c.to + room.c.see - R) throw new Error(`level 11: the lure band ends at ${far}, not inside the charger's sight of ${room.c.to} (sees ${room.c.see})`);
  if (far > room.x1) throw new Error(`level 11: the lure band ends at ${far}, past the door (${room.x1})`);
  return (ball) => (ball.x > far ? { left: true } : ball.x < near ? { right: true } : {});
}

/**
 * Level twelve's two rooms, from the level's own geometry, so ROUTES[12] and
 * 3o read the same numbers and neither copies a position out of levels.js.
 *
 * Room A: the shell is the one whose range sits under a stone roof; the door
 * is the first gate past that roof. Room B: the other shell patrols the
 * corridor. Its roof is every stone piece whose top is the crate's floor
 * (`lip`). Hole 1 opens at the end of the last such piece short of the
 * shell's range (`L`) and runs to the next piece; hole 2 runs from that piece
 * to the tall wall. The pit is the gap between the ground line ending short
 * of `L` and the corridor floor, which starts at `L`.
 */
function room12(level) {
  const shells = level.enemies.filter((e) => e.kind === 'shell').sort((a, b) => a.from - b.from);
  const [sA, sB] = shells;
  if (!sA || !sB) throw new Error(`level ${level.data.id}: room12 needs two shells, found ${shells.length}`);
  const roofA = level.walls.find((w) => !w.movable && w.x <= sA.from && w.x + w.w >= sA.to && w.y + w.h <= sA.y - sA.r);
  if (!roofA) throw new Error(`level ${level.data.id}: no stone roof over room A's shell (${sA.from}..${sA.to})`);
  const gate = level.gates.filter((g) => g.x >= roofA.x + roofA.w).sort((a, b) => a.x - b.x)[0];
  if (!gate) throw new Error(`level ${level.data.id}: no gate past room A's roof`);
  const crate = level.crates[0];
  const home = level.data.boxes.find((b) => b.movable);
  if (!crate || !home) throw new Error(`level ${level.data.id}: no crate`);
  const lip = home.y + home.h;
  const roofs = level.walls.filter((w) => !w.movable && w.y === lip).sort((a, b) => a.x - b.x);
  const overPit = roofs.filter((w) => w.x + w.w <= sB.from).at(-1);
  if (!overPit) throw new Error(`level ${level.data.id}: no roof piece at ${lip} short of the corridor shell's range (${sB.from})`);
  const L = overPit.x + overPit.w;
  const mid = roofs.find((w) => w.x > L);
  const tall = level.walls.filter((w) => !w.movable && w.y === 0 && w.x > L && w.h < level.bounds.h).sort((a, b) => a.x - b.x)[0];
  if (!mid || !tall) throw new Error(`level ${level.data.id}: no stone between the holes, or no tall wall past them`);
  const pitLine = level.data.ground.find((l) => l.at(-1)[0] < L && l.at(-1)[1] === lip);
  if (!pitLine) throw new Error(`level ${level.data.id}: no ground line at ${lip} ending short of hole 1 (${L})`);
  return {
    sA, sB, roofA, gate, crate, home, lip, L,
    hole1: [L, mid.x], hole2: [mid.x + mid.w, tall.x],
    pit: [pitLine.at(-1)[0], L],
    floor: sB.y + sB.r,
  };
}

/** Where a patrolling shell will be in `t` seconds, if nothing but its range turns it. */
function shellAhead(s, t) {
  const v = CONFIG.ENEMY.SHELL.PATROL_SPEED, h = CONFIG.STEP;
  let x = s.x, dir = s.dir;
  for (let left = t; left > 0; left -= h) {
    if (x <= s.from) dir = 1;
    if (x >= s.to) dir = -1;
    x += dir * v * h;
  }
  return x;
}

/**
 * Level twelve's route. Room A: walk the roof over the pen and wait there for
 * the shell to step onto the plate, then go through the door. Room B: shove
 * the crate to the edge of hole 1, then the last few units when the shell
 * will be under it; jump hole 1 and drop through hole 2 onto the flipped
 * shell. The route may read the shell's state — it is the test, not the game.
 *
 * `opts.phase`: when the crate should arrive, in seconds after the shell's
 * turn at its range's left end; by default `lead - 1`, so a sloppy thumb is
 * up to 0.3s early or late. `opts.pushAfter`: shove this long after reaching
 * the edge instead, whatever the shell is doing — 3o's way of missing on purpose; once a crate
 * has been got back, the route aims properly. A crate that lands in the
 * corridor is got back: wait on the roof for the shell to be walking away
 * past hole 2, drop in, shove the crate left into the pit (it goes home),
 * jump out of hole 1, hop back over the crate and start again.
 * `opts.shoves` collects each get-back's timing, for 3o.
 */
function route12(level, lead, opts = {}) {
  const R = CONFIG.BALL.R, S = CONFIG.ENEMY.SHELL;
  const { sB, roofA, gate, crate, home, lip, L, hole1, hole2, floor } = room12(level);
  const p = sender(level, 'p');
  const phase = opts.phase ?? (lead - 1);
  let stage = null, sawUp = false, pressedAt = null, rec = null, recovered = 0, shove = null, aimAt = 0;
  // How long the crate takes to fall from the lip to the shell's top, from rest.
  const fall = Math.sqrt(2 * ((floor - 2 * sB.r) - lip) / CONFIG.GRAVITY);
  const inCorridor = () => crate.y > lip;
  const steer = (ball, x, tol = 3) => (ball.x < x - tol ? { right: true } : ball.x > x + tol ? { left: true } : {});
  // From the roof left of hole 1: jump at its edge, then come down in hole 2
  // over `target` (the tall wall stops any overshoot).
  const intoHole2 = (ball, target) => {
    if (ball.x < hole2[0] + R) return { right: true, jump: ball.grounded && ball.x > hole1[0] - R - 6 && ball.x < hole1[0] };
    return steer(ball, Math.min(Math.max(target, hole2[0] + R + 2), hole2[1] - R - 2));
  };
  const timed = () => {
    if (opts.pushAfter != null && !recovered) return level.time - aimAt >= opts.pushAfter;
    if (!sB.alive || sB.state !== 'patrol') return false;
    // CONTACT: the ball, let go against the crate, has bounced off it a
    // little and takes about this long to roll back into it (simulated: the
    // route's own runs, ball and crate positions printed step by step).
    const CONTACT = 0.03;
    const t = (L - crate.x) / CONFIG.CRATE.PUSH_SPEED + CONTACT + fall;
    const want = sB.from + Math.abs(phase) * S.PATROL_SPEED, dir = phase < 0 ? -1 : 1;
    const x0 = shellAhead(sB, t), x1 = shellAhead(sB, t + CONFIG.STEP);
    // Within one step's walk of the wanted spot, so exactly one step or two
    // ever match it, and never none.
    return Math.sign(x1 - x0) === dir && Math.abs(x0 - want) <= S.PATROL_SPEED * CONFIG.STEP;
  };
  return (ball) => {
    if (rec && rec.window == null && !p.pressed) rec.window = level.time - rec.pressedAt;
    if (!stage) stage = ball.x < gate.x ? 'toA' : 'toB';
    const wait = roofA.x + roofA.w - 3 * R;
    if (stage === 'toA') {
      if (ball.x > wait - 2 * R && ball.grounded) stage = 'waitA';
      else return { right: true };
    }
    // Only a fresh press counts: arriving to a door already open, he could
    // be arriving at the end of its window, and that is not what is timed.
    if (stage === 'waitA') {
      if (!p.pressed) sawUp = true;
      else if (sawUp && pressedAt == null) pressedAt = level.time;
      if (pressedAt != null && gate.openT > 0.9) stage = 'goA';
      else return steer(ball, wait, R);
    }
    if (stage === 'goA') {
      if (ball.x > gate.x + gate.w + R) {
        rec = { lead, pressedAt, used: level.time - pressedAt, window: null };
        SPARE12.push(rec);
        stage = 'toB';
      } else if (!p.pressed && gate.openT === 0) {
        SPARE12.push({ lead, missed: true });
        stage = 'toB';
      } else return { right: true };
    }
    if (stage === 'toB') {
      if (inCorridor()) stage = 'rWait';
      else if (ball.y < lip && ball.x > crate.x + crate.w) stage = 'rBack';
      else if (ball.grounded && ball.y < lip && crate.x - (ball.x + R) < 2) stage = 'pushB';
      else return { right: true };
    }
    if (stage === 'pushB') {
      if (crate.x >= L - 6) { stage = 'aimB'; aimAt = level.time; }
      else return { right: true };
    }
    if (stage === 'aimB') {
      if (timed()) stage = 'nudge';
      else return {};
    }
    if (stage === 'nudge') {
      if (crate.y > lip - home.h + 2) stage = 'falling';
      else return { right: true };
    }
    // Watch it land: on the shell, go; on the floor, get it back.
    if (stage === 'falling') {
      if (sB.state === 'flipped') stage = opts.waitOut && !recovered ? 'waitOut' : 'jumpB';
      else if (crate.grounded && inCorridor()) stage = 'rWait';
      else return {};
    }
    // 3o only: stand back on the roof until the flipped shell is up again,
    // then carry on as if the crate had missed.
    if (stage === 'waitOut') {
      if (sB.state === 'patrol') stage = 'toB';
      else return steer(ball, L - 4 * R);
    }
    if (stage === 'jumpB') {
      if (ball.y > lip) stage = 'stompB';
      else return intoHole2(ball, sB.x);
    }
    if (stage === 'stompB') {
      if (!sB.alive || ball.grounded) stage = 'throughB';
      else return steer(ball, sB.x);
    }
    // Followed the crate into hole 1 and standing on it: out, to the left.
    if (stage[0] === 'r' && ball.y > lip - R && ball.y < floor - 2 * R && ball.x > hole1[0] && ball.x < hole1[1] && inCorridor()) {
      stage = 'rWait';
      return { left: true, jump: ball.grounded };
    }
    if (stage === 'rWait') {
      // Far enough back for a run-up into hole 2.
      const spot = L - 4 * R;
      if (ball.y < lip && ball.grounded && Math.abs(ball.x - spot) < 8 && Math.abs(ball.vx) < 30 &&
          // Walking away, and clear of hole 2 by its own half-width and a
          // ball's width, so the ball lands behind it, not on it.
          sB.alive && sB.state === 'patrol' && sB.dir === 1 && sB.x > hole2[1] + sB.r + 2 * R) stage = 'rJump';
      else if (ball.y > floor - 2 * R) stage = 'rIn';
      else return steer(ball, spot);
    }
    if (stage === 'rJump') {
      if (ball.y > lip) stage = 'rIn';
      else return intoHole2(ball, hole2[0]);
    }
    if (stage === 'rIn') {
      if (!shove) {
        // How long until the shell, walking as it is now, would touch a ball
        // standing under hole 1 — the time this get-back has.
        const under = (hole1[0] + hole1[1]) / 2;
        // REACH_CAP is far past a whole patrol; reaching it means the shell
        // never came, and the ratio would be meaningless: recorded as null.
        const REACH_CAP = 60;
        let reach = 0;
        while (reach < REACH_CAP && Math.abs(shellAhead(sB, reach) - under) >= R + sB.r) reach += 0.05;
        shove = { inAt: level.time, reach: reach < REACH_CAP ? reach : null };
      }
      // Stop shoving the moment it tips into the pit, or follow it in.
      if (!inCorridor() || crate.x + crate.w < hole1[0]) { stage = 'rOut'; recovered++; }
      else return { left: true };
    }
    if (stage === 'rOut') {
      const under = (hole1[0] + hole1[1]) / 2;
      if (ball.y < lip && ball.grounded) {
        if (opts.shoves) opts.shoves.push({ used: level.time - shove.inAt, reach: shove.reach });
        shove = null;
        stage = 'rBack';
      } else if (ball.y > lip && ball.grounded && Math.abs(ball.x - under) < 8 && Math.abs(ball.vx) < 40) return { jump: true, left: true };
      else if (ball.y < lip + R) return { left: true };
      else return steer(ball, under);
    }
    if (stage === 'rBack') {
      if (ball.grounded && ball.x < crate.x - R - 2) stage = 'toB';
      // Hop it the way the runner hops a crate: from within 40 * lead of its
      // face (runner's own number), measured from the ball's edge, not centre.
      else return { left: true, jump: ball.grounded && ball.x - (crate.x + crate.w) < 40 * lead + R };
    }
    return { right: true };
  };
}

// Every prepared run through level nine's timed room records how much of the
// timer it used. Checked after section 2: every run, from every lead, delay
// and checkpoint, must leave at least 40% of the time unused — the proof
// that room is not a pixel-perfect run.
const SPARE9 = [];

// The same for level eleven's room B: every run records how much of the
// charger's daze it used between the plate going down and the ball being
// through the door. Checked in 2c.
const SPARE11 = [];

// The same for level twelve's room A: how much of the time the shell stands
// on the plate a run used between the plate going down and the ball being
// through the door. Checked in 2d.
const SPARE12 = [];

// Level thirteen's room A: every run that starts before popper A records each
// lock popper A takes on the ball (where it aimed, where the ball was) and
// where each of its lobs came down. Checked in 2e.
const LOCKS13 = [];

/**
 * Watch popper A for one run: a new lock is a new `target` object; a lob
 * comes down on the step its `fire` ends, when `lobNow` is its last spot.
 * Returns a function to call once a step.
 */
function watchLocks13(pA, rec) {
  let lastTarget = null, lastState = pA.state;
  return (ball) => {
    if (pA.target && pA.target !== lastTarget) rec.locks.push({ aimX: pA.target.x, ballX: ball.x, landX: null });
    lastTarget = pA.target;
    // A landing belongs to the lock that fired it, the latest one. A second
    // landing for the same lock, or one with no lock at all, is counted as
    // `strays`, and 2e fails on any.
    if (lastState === 'fire' && pA.state === 'reload' && pA.lobNow) {
      const l = rec.locks.at(-1);
      if (!l || l.landX != null) rec.strays++;
      else l.landX = pA.lobNow.x;
    }
    lastState = pA.state;
  };
}

/**
 * Level thirteen's rooms, from the level's own geometry, so ROUTES[13] and
 * 3p read the same numbers and neither copies a position out of levels.js.
 *
 * The three aimed poppers, left to right, are rooms A, B and C. Room B's
 * door is the gate that button b drives, and the ball waits resting against
 * it (`spotB`). Room C's porch is the one plank wall; the step it roofs over
 * is the stone box starting where the planks end, the ball waits resting
 * against that (`spotC`), and the porch's stone end is the stone piece
 * flush with the planks' left end.
 */
function room13(level) {
  const R = CONFIG.BALL.R;
  const [pA, pB, pC] = level.enemies.filter((e) => e.kind === 'popper' && !e.fixed).sort((a, b) => a.x - b.x);
  if (!pC) throw new Error(`level ${level.data.id}: room13 needs three aimed poppers`);
  const b = sender(level, 'b');
  const gate = level.gates.find((g) => g.needs.includes('b'));
  if (!b || !gate) throw new Error(`level ${level.data.id}: no button b, or no gate it drives`);
  // The porch is the plank wall whose right end meets a stone step below it.
  const stepBeside = (wd) => level.walls.find((w) => !w.movable && Math.abs(w.x - (wd.x + wd.w)) < 1 && w.y > wd.y + wd.h);
  const wood = level.breakables.find((wd) => stepBeside(wd));
  if (!wood) throw new Error(`level ${level.data.id}: no plank wall ending at a stone step`);
  const step = stepBeside(wood);
  const stoneEnd = level.walls.find((w) => !w.movable && Math.abs(w.x + w.w - wood.x) < 1 && w.y === wood.y);
  const bracket = level.walls.find((w) => !w.movable && Math.abs(w.x + w.w - gate.x) < 1 && w.y === b.y - CONFIG.CIRCUIT.POST_H);
  // The floor is where the closed door stands; a ball resting on it, lifted
  // off it the way section 2 lifts a respawn.
  const floor = gate.y + gate.h;
  const y = floor - R - CONFIG.CHECKPOINT.CLEARANCE;
  // Each room is entered from the start point nearest behind its popper.
  const starts = [level.data.spawn, ...(level.data.checkpoints || [])];
  const behind = (p) => {
    const c = starts.filter((s) => s.x < p.x).sort((a, b2) => b2.x - a.x)[0];
    if (!c) throw new Error(`level ${level.data.id}: nothing to start from behind the popper at ${p.x}`);
    return { x: c.x, y };
  };
  return {
    pA, pB, pC, poppers: [pA, pB, pC], b, gate, wood, step, stoneEnd, bracket, floor,
    fromA: behind(pA), fromB: behind(pB), fromC: behind(pC),
    spotB: gate.x - R, spotC: step.x - R,
  };
}

/**
 * Level thirteen's route. Room A: never stop — whatever spot the popper
 * locks, the ball is long gone when its lob lands. Room B: roll to the door
 * and rest against it until it is open; the lob locked on a ball there ends
 * on button b's cap, over the ball's head. Room C: the same against the
 * step, until the lob breaks the porch roof; then jump up the step.
 * A sloppy thumb like level eleven's: it hesitates longer the sloppier the
 * lead before going on through an opened door or up the step.
 */
function route13(level, lead) {
  const { pA, gate, wood, step, spotB, spotC } = room13(level);
  let stage = null, at = null, watch = null;
  const steer = (ball, x) => (ball.x < x - 1 ? { right: true } : ball.x > x + 1 ? { left: true } : {});
  const hesitate = () => {
    if (at == null) at = level.time;
    return level.time - at < (lead - 0.7) * 1.5;
  };
  return (ball) => {
    if (!stage) {
      stage = ball.x < gate.x ? 'toB' : 'toC';
      if (ball.x < pA.x) { const rec = { lead, locks: [], strays: 0 }; LOCKS13.push(rec); watch = watchLocks13(pA, rec); }
    }
    if (watch) watch(ball);
    if (stage === 'toB') {
      if (gate.openT > 0.9) { if (hesitate()) return {}; stage = 'throughB'; at = null; }
      else return steer(ball, spotB);
    }
    if (stage === 'throughB') {
      if (ball.x > gate.x + gate.w + CONFIG.BALL.R) stage = 'toC';
      else return { right: true };
    }
    if (stage === 'toC') {
      if (wood.broken) { if (hesitate()) return {}; stage = 'up'; }
      else return steer(ball, spotC);
    }
    if (stage === 'up') {
      if (ball.grounded && ball.y < step.y) stage = 'end';
      else return { right: true, jump: ball.grounded };
    }
    return { right: true };
  };
}

// Level fourteen's main room: every run records how long it took from the
// shell popping to the ball being through the door. Checked in 2f, against
// the shell's RETURN — the least the door can stay open, since the return
// also waits for the ball to be RETURN_CLEAR from the shell's home.
const SPARE14 = [];
// And every run through the warm-up that stomped its shell, so 2f can say the
// warm-up was really done and not walked past.
const WARM14 = [];

/**
 * One of level fourteen's rooms (0 = the warm-up, 1 = the main room), from
 * the level's own geometry, so ROUTES[14] and 3r read the same numbers and
 * neither copies a position out of levels.js.
 *
 * The room's charger and shell are the i-th of their kind by range. Over the
 * charger's range lie two pieces of stone: the pen's roof (the lower one) and
 * the bridge he crosses (the one reaching furthest right, past the shell).
 * The yard runs from `x0`, the nearest a ball's centre rests to the shell's
 * range without touching the shell, to `x1`: the door's gate minus a radius
 * where the room has one, else the foot of the slope out. `down` is
 * "grounded in the yard, on the charger's own level" — its LEVEL_TOL, so
 * exactly when it can be seen.
 */
function room14(level, i) {
  const R = CONFIG.BALL.R, K = CONFIG.ENEMY.CHARGER;
  const byFrom = (k) => level.enemies.filter((e) => e.kind === k).sort((a, b) => a.from - b.from);
  const c = byFrom('charger')[i], s = byFrom('shell')[i];
  if (!c || !s) throw new Error(`level ${level.data.id}: room ${i} needs a charger and a shell`);
  const over = level.walls.filter((w) => !w.movable && w.x <= c.from && w.x + w.w >= c.to && w.y + w.h <= c.y - c.r);
  const roof = over.slice().sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
  const bridge = over.slice().sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
  if (!roof || !bridge) throw new Error(`level ${level.data.id}: no stone over charger ${i}'s range ${c.from}..${c.to}`);
  if (bridge.x + bridge.w <= s.to + s.r) throw new Error(`level ${level.data.id}: room ${i}'s bridge ends over its shell, not past it`);
  const next = byFrom('charger')[i + 1];
  const gate = level.gates.filter((g) => g.x > s.to && (!next || g.x < next.from)).sort((a, b) => a.x - b.x)[0] || null;
  let x1;
  if (gate) x1 = gate.x - R;
  else {
    const line = level.data.ground.find((l) => l[0][0] <= c.from && l.at(-1)[0] > s.to);
    if (!line) throw new Error(`level ${level.data.id}: no ground line under room ${i}`);
    const climb = line.findIndex((p) => p[1] !== line[0][1]);
    if (climb < 1) throw new Error(`level ${level.data.id}: room ${i}'s ground line never climbs out of its yard`);
    x1 = line[climb - 1][0];
  }
  const x0 = s.to + s.r + R;
  return {
    c, s, roof, bridge, gate, x0, x1,
    down: (ball) => ball.grounded && Math.abs(ball.y - c.y) < K.LEVEL_TOL && ball.x >= x0 - 1 && ball.x <= x1 + 1,
  };
}

/** Where a ball stands in a level-fourteen yard to be seen: as lure11, from the yard's own `x0`. */
function lure14(room) {
  const R = CONFIG.BALL.R;
  const near = room.x0 + 2 * R, far = room.x0 + 4 * R;
  if (far > room.c.to + room.c.see - R) throw new Error(`level 14: the lure band ends at ${far}, not inside the charger's sight of ${room.c.to} (sees ${room.c.see})`);
  if (far > room.x1) throw new Error(`level 14: the lure band ends at ${far}, past the yard's end (${room.x1})`);
  return (ball) => (ball.x > far ? { left: true } : ball.x < near ? { right: true } : {});
}

/**
 * Stomp a flipped shell from the yard: roll at it, jump within `30 + 40 *
 * lead` of it (a sloppy thumb jumps from further), and steer over it in the
 * air. `aim` is how far right of the shell's centre to come down; 0 unless a
 * check wants the dazed charger beside it too.
 */
function stomp14(ball, s, lead, aim = 0) {
  const x = s.x + aim, dx = ball.x - x;
  if (ball.grounded) return { left: dx > 4, right: dx < -4, jump: dx > 0 && dx < 30 + 40 * lead };
  return dx > 3 ? { left: true } : dx < -3 ? { right: true } : {};
}

function route14(level, lead) {
  const A = room14(level, 0), B = room14(level, 1);
  const lureA = lure14(A), lureB = lure14(B);
  const p = sender(level, 'p');
  let stage = null, poppedAt = 0, hopped = false;
  const warm = { lead, stomped: false };
  return (ball) => {
    if (!stage) {
      stage = ball.x < A.x1 ? 'toA' : ball.x < B.gate.x ? 'mid' : 'end';
      if (stage === 'toA') WARM14.push(warm);
    }
    // The warm-up: down off the bridge, stand in sight, and when the dash
    // has flipped the shell, stomp it. Nothing is wired; it is shown, not
    // needed, but a miss is waited out and lured again like the main room.
    if (stage === 'toA') {
      if (A.down(ball)) stage = 'lureA';
      else return { right: true };
    }
    if (stage === 'lureA') {
      if (A.s.state === 'flipped') stage = 'stompA';
      else return lureA(ball);
    }
    if (stage === 'stompA') {
      if (!A.s.alive) { stage = 'mid'; warm.stomped = true; }
      else if (A.s.state !== 'flipped') { stage = 'lureA'; return lureA(ball); }
      else return stomp14(ball, A.s, lead);
    }
    if (stage === 'mid') {
      if (B.down(ball)) stage = 'lureB';
      else return { right: true };
    }
    if (stage === 'lureB') {
      if (B.s.state === 'flipped') stage = 'stompB';
      else return lureB(ball);
    }
    if (stage === 'stompB') {
      if (!B.s.alive) { stage = 'goB'; poppedAt = level.time; }
      else if (B.s.state !== 'flipped') { stage = 'lureB'; return lureB(ball); }
      else return stomp14(ball, B.s, lead);
    }
    // A sloppy thumb like level eleven's: it hesitates longer the sloppier
    // the lead, and at the sloppiest hops once for nothing.
    if (stage === 'goB') {
      if (level.time - poppedAt < (lead - 0.7) * 1.5) return {};
      if (ball.x > B.gate.x + B.gate.w + CONFIG.BALL.R) {
        SPARE14.push({ lead, used: level.time - poppedAt, time: CONFIG.ENEMY.SHELL.RETURN });
        stage = 'end';
      } else if (B.s.alive && p.pressed && B.gate.openT === 0) {
        SPARE14.push({ lead, missed: true });
        stage = 'end';
      } else {
        const hop = lead > 1.2 && !hopped && ball.grounded;
        if (hop) hopped = true;
        return { right: true, jump: hop };
      }
    }
    return { right: true };
  };
}

// Level fifteen, room 3: every run records the lob's hit on the timer —
// whether the crate was touching the timer at that step, as observed in its
// `touched` set — and how much of the timer it used from that hit to being
// through the gate. Checked in 2g, 60% as level nine's 2b.
const SPARE15 = [];
// Room 2: from the shell popping to the ball being through the door on the
// pen's roof, against SHELL.RETURN. Checked in 2g too.
const SPARE15B = [];
// Room 1: every run from the spawn counts the flips, stomps, misses and
// crates got back it actually saw, for 3s.
const SEEN15 = [];

/**
 * Level fifteen's three rooms, from the level's own geometry, so ROUTES[15]
 * and 3s read the same numbers and none of them copies a position out of
 * levels.js.
 *
 * Room 1: the plank wall is the level's one breakable; its crate is the one
 * the level puts on the same lane floor left of it. The lane roof is the stone whose underside
 * is the planks' top; the hatch is the opening between the piece ending at
 * or before the planks and the next one. The room's shell is the first by
 * range; hole 1 opens at the end of the last stone piece at the lane floor's
 * level short of that shell's range (`L`), the piece itself roofing the pit.
 * Its door is the gate that needs the shell's plate off. The dip is the
 * lowest point of the lane floor. Room 2: the second shell and the charger;
 * its door is the gate driven by the plate under the charger's range's near
 * end. Room 3: the timer and the gate it drives; its crate is the other
 * crate; its gap is the opening between the last roof piece short of the
 * timer's post and the post.
 */
function room15(level) {
  const fail15 = (msg) => { throw new Error(`level ${level.data.id}: ${msg}`); };
  const poppers = level.enemies.filter((e) => e.kind === 'popper' && !e.fixed).sort((a, b) => a.x - b.x);
  const shells = level.enemies.filter((e) => e.kind === 'shell').sort((a, b) => a.from - b.from);
  const c = level.enemies.find((e) => e.kind === 'charger');
  const wood = level.breakables[0];
  const t = level.senders.find((s) => s.kind === 'timer');
  if (poppers.length !== 2 || shells.length !== 2 || !c || !wood || !t) fail15('room15 needs two aimed poppers, two shells, a charger, a plank wall and a timer');
  const [p1, p3] = poppers, [s1, s2] = shells;
  const floor1 = wood.y + wood.h;
  // By where the level put them, not where they are now: level.crates
  // follows the movable boxes in order.
  const homes = level.data.boxes.filter((b) => b.movable);
  const crate1 = level.crates[homes.findIndex((b) => Math.abs(b.y + b.h - floor1) < 1 && b.x < wood.x)];
  const crate3 = level.crates.find((k) => k !== crate1);
  if (!crate1 || !crate3) fail15("no crate in room 1's lane, or no second crate");
  const roofs1 = level.walls.filter((w) => !w.movable && Math.abs(w.y + w.h - wood.y) < 1).sort((a, b) => a.x - b.x);
  const before = roofs1.filter((w) => w.x + w.w <= wood.x).at(-1);
  const after = roofs1.find((w) => w.x >= wood.x + wood.w);
  if (!before || !after) fail15('no roof either side of the planks');
  const hatch = [before.x + before.w, after.x];
  const roofTop = before.y;
  const Xr1 = before.x;
  const lips = level.walls.filter((w) => !w.movable && Math.abs(w.y - floor1) < 1).sort((a, b) => a.x - b.x);
  const overPit = lips.filter((w) => w.x + w.w <= s1.from).at(-1);
  if (!overPit) fail15("no stone at the lane floor short of room 1's shell");
  const L = overPit.x + overPit.w;
  const plate1 = level.senders.find((s) => s.kind === 'plate' && s.x < s1.to + s1.r && s.x + s.w > s1.from - s1.r);
  const gate1 = plate1 && level.gates.find((g) => g.needs.includes('!' + plate1.id));
  if (!gate1) fail15("no gate needing room 1's plate off");
  const lane1 = level.data.ground.find((l) => l[0][0] === Xr1 && l.length > 2);
  if (!lane1) fail15("no lane floor starting at room 1's roof");
  const dip = lane1.reduce((a, q) => (q[1] > a[1] ? q : a));
  // Room 2's door: the other gate that needs a plate off, and that plate
  // (under the second shell's range; 3s(g) moves it in a copy).
  const gate2 = level.gates.find((g) => g !== gate1 && g.needs.some((n) => n.startsWith('!')));
  const plate2 = gate2 && level.senders.find((s) => s.kind === 'plate' && gate2.needs.includes('!' + s.id));
  if (!gate2) fail15("no gate needing room 2's shell's plate off");
  // The pen's roof: the stone over the charger's range whose top the door stands on.
  const roof2 = level.walls.find((w) => !w.movable && w.x <= c.from && w.x + w.w >= gate2.x + gate2.w && Math.abs(w.y - (gate2.y + gate2.h)) < 1);
  if (!roof2) fail15("no pen roof under room 2's door");
  const gate3 = level.gates.find((g) => g.needs.includes(t.id));
  const roof3 = level.walls.filter((w) => !w.movable && w.x + w.w <= t.x && Math.abs(w.y - roofTop) < 1).sort((a, b) => a.x - b.x).at(-1);
  if (!gate3 || !roof3) fail15('no gate on the timer, or no roof short of its post');
  return {
    p1, p3, s1, s2, c, wood, t, crate1, crate3,
    hatch, hc: (hatch[0] + hatch[1]) / 2, roofTop, Xr1, floor1, L, pit: [overPit.x, L], gate1, plate1,
    dipX: dip[0], plate2, gate2, roof2, gate3, Xr3: roof3.x, gap3: [roof3.x + roof3.w, t.x], gc: (roof3.x + roof3.w + t.x) / 2,
    floor2: s1.y + s1.r,
  };
}

/**
 * Level fifteen's route.
 *
 * Room 1: up onto the lane roof, along it and down into the hatch onto the
 * planks; when popper 1 aims there, out and back left off the roof, so the
 * lob comes down on the planks where he was. Then into the lane, shove the
 * crate to hole 1 and over when the shell will be under it (route12's
 * timing), follow it down onto it, stomp the flipped shell, and run for the
 * door. A crate that misses is got back much as in level twelve: stand on it
 * in hole 1, step off behind the shell when it walks away, shove it left into
 * the pit (it goes home), jump out of hole 1 into the lane, settle in the dip
 * under the hatch, jump straight up out through it, and come round again.
 *
 * Room 2: rest just short of the shell at the pen's mouth. When a fresh
 * dash flips the shell and dazes the charger, stomp the shell, and on through
 * the pen past the dazed charger and out of its far door, which needs both.
 * `opts.noStomp`: walk through the flipped shell instead (3s).
 *
 * Room 3: shove the crate along the lane until it is touching the timer's
 * cap; out, up onto the roof, into the gap beside the post; when popper 3
 * aims there, run. The lob comes down through the gap beside the crate and
 * starts the timer.
 *
 * A sloppy thumb like level eleven's: it hesitates longer the sloppier the
 * lead before each go. `opts.pushAfter`: in room 1, shove this long after
 * reaching the edge instead of timing it (3s's way of missing on purpose);
 * once a crate has been got back, it times it properly. `opts.push3`: stop
 * shoving room 3's crate this far short of touching the cap (3s).
 */
function route15(level, lead, opts = {}) {
  const R = CONFIG.BALL.R, S = CONFIG.ENEMY.SHELL;
  const m = room15(level);
  const { p1, p3, s1, s2, c, wood, t, crate1, crate3, hatch, hc, roofTop, Xr1, floor1, L, gate1, dipX, plate2, gate2, roof2, gate3, Xr3, gc } = m;
  const phase = opts.phase ?? (lead - 1);
  const hes = (lead - 0.7) * 1.5;
  // How long the crate takes to fall from the lane floor to the shell's top, from rest.
  const fall = Math.sqrt(2 * ((m.floor2 - 2 * s1.r) - floor1) / CONFIG.GRAVITY);
  const steer = (ball, x, tol = 2) => (ball.x < x - tol ? { right: true } : ball.x > x + tol ? { left: true } : {});
  // Come to rest at x: aim for a speed that shrinks with the distance left,
  // so the ball brakes instead of rolling to and fro across a shallow dip.
  const settle = (ball, x) => {
    const want = Math.max(-300, Math.min(300, (x - ball.x) * 4));
    return ball.vx < want - 10 ? { right: true } : ball.vx > want + 10 ? { left: true } : {};
  };
  const inCorridor = () => crate1.y > floor1;
  const seen = { lead, flips: 0, stomps: 0, recovered: 0, misses: 0 };
  let popAt = null, backRun = false, stage = null, at = null, aimAt = 0, sawUp = false, dazedAt = null, rec3 = null, prevS1 = s1.state;
  // Up onto a lane roof from its plateau: a run-up from at least RUN back,
  // and a jump between RUN * lead and 60 short of the roof's end — from
  // nearer, the ball meets the roof's end face on the way up and bounces
  // off it (simulated: a jump 24 short of it did).
  const RUN = 150;
  let backed = false;
  const onto = (ball, x) => {
    if (!backed) { if (ball.x < x - RUN - 30) backed = true; else return { left: true }; }
    return { right: true, jump: ball.grounded && ball.x > x - RUN * lead && ball.x < x - 60 };
  };
  const wait = (s) => { if (at == null) at = level.time; if (level.time - at < s) return true; return false; };
  const timed = () => {
    if (opts.pushAfter != null && !seen.recovered) return level.time - aimAt >= opts.pushAfter;
    if (!s1.alive || s1.state !== 'patrol') return false;
    // route12's CONTACT, simulated there: the ball's bounce off the crate.
    const CONTACT = 0.03;
    const tt = (L - crate1.x) / CONFIG.CRATE.PUSH_SPEED + CONTACT + fall;
    const want = s1.from + Math.abs(phase) * S.PATROL_SPEED, dir = phase < 0 ? -1 : 1;
    const x0 = shellAhead(s1, tt), x1 = shellAhead(s1, tt + CONFIG.STEP);
    return Math.sign(x1 - x0) === dir && Math.abs(x0 - want) <= S.PATROL_SPEED * CONFIG.STEP;
  };
  return (ball) => {
    // Room 3's timer, watched every step once he is in the room, so each
    // claim in 2g is something seen. The crate's own press: its key in
    // `touched` with the time full. Run out: the crate still touching and
    // the timer off, before the lob's hit. The hit: a key that is neither the
    // crate nor the ball arriving with the time full.
    if (rec3 && rec3.hitAt == null) {
      const full = t.left === t.time;
      if (rec3.crateAt == null && full && t.touched.has(crate3)) rec3.crateAt = level.time;
      if (rec3.crateAt != null && !t.pressed && t.touched.has(crate3)) rec3.ranOut = true;
      if (full) for (const k of t.touched) if (k !== crate3 && k !== ball) { rec3.hitAt = level.time; rec3.crateTouching = t.touched.has(crate3); rec3.ballX = ball.x; }
    }
    if (s1.state === 'flipped' && prevS1 !== 'flipped') seen.flips++;
    if (s1.state === 'popped' && prevS1 !== 'popped') seen.stomps++;
    prevS1 = s1.state;
    if (!stage) {
      stage = ball.x < gate1.x ? 'up1' : ball.x < gate2.x + gate2.w ? 'to2' : 'to3';
      if (stage === 'up1') SEEN15.push(seen);
    }
    // --- room 1 ---
    if (stage === 'up1') {
      if (ball.grounded && ball.y < roofTop) stage = 'hatch';
      else return onto(ball, Xr1);
    }
    if (stage === 'hatch') {
      if (ball.grounded && ball.y > roofTop - R && Math.abs(ball.x - hc) < 6) stage = 'sit';
      else return steer(ball, hc);
    }
    if (stage === 'sit') {
      if (wood.broken || (p1.state === 'aim' && p1.target && Math.abs(p1.target.x - hc) < 10 && p1.target.y > roofTop - R)) stage = 'leave';
      else return {};
    }
    if (stage === 'leave') {
      // Out of the hatch (or, if the planks went from under him, out of the
      // lane through it from the dip), and left along the roof.
      if (ball.grounded && ball.y < roofTop && ball.x < hatch[0] - R) stage = 'down';
      else if (ball.grounded && ball.y > floor1 - 2 * R) return { ...settle(ball, dipX), jump: Math.abs(ball.x - dipX) < 2 && Math.abs(ball.vx) < 15 };
      else return { left: ball.y < roofTop, jump: ball.grounded };
    }
    if (stage === 'down') {
      if (ball.grounded && ball.y > roofTop && ball.x < Xr1) stage = 'lane';
      else return { left: true };
    }
    if (stage === 'lane') {
      if (inCorridor()) stage = 'rIn';
      else if (!wood.broken) return {};
      else if (ball.grounded && ball.y < floor1 && crate1.x - (ball.x + R) < 2) stage = 'push';
      else return { right: true };
    }
    if (stage === 'push') {
      if (crate1.x >= L - 6) { stage = 'aim'; aimAt = level.time; }
      else return { right: true };
    }
    if (stage === 'aim') { if (timed()) stage = 'nudge'; else return {}; }
    if (stage === 'nudge') {
      if (crate1.y > floor1 - crate1.h + 2) stage = 'falling';
      else return { right: true };
    }
    if (stage === 'falling') {
      if (s1.state === 'flipped') stage = 'follow';
      else if (crate1.grounded && inCorridor()) { seen.misses++; stage = 'rIn'; }
      else return {};
    }
    if (stage === 'follow') {
      if (!s1.alive) { stage = 'go1'; at = null; }
      else if (s1.state !== 'flipped') stage = 'rIn';
      else if (ball.y < floor1) return { right: true };
      else {
        const dx = ball.x - s1.x;
        return dx > 3 ? { left: true } : dx < -3 ? { right: true } : {};
      }
    }
    if (stage === 'go1') {
      if (wait(hes)) return {};
      if (ball.x > gate1.x + gate1.w + R) { stage = 'to2'; at = null; }
      else return { right: true };
    }
    // Got back: stand on the crate in hole 1 until the shell is walking away,
    // well clear of it; step off behind it and shove the crate into the pit.
    if (stage === 'rIn') {
      const on = ball.grounded && ball.platform === crate1;
      const clear = s1.alive && s1.state === 'patrol' && s1.dir === 1 && s1.x > crate1.x + crate1.w + 2 * R + s1.r + 100;
      if (on && clear) stage = 'rOff';
      else if (ball.y < floor1) {
        // Still in the lane: wait for the crate to land, then go in slowly
        // over its middle, so the ball comes down on it and not past it.
        if (!crate1.grounded) return {};
        return settle(ball, crate1.x + crate1.w / 2);
      } else if (ball.grounded && ball.platform !== crate1 && ball.x > crate1.x + crate1.w) {
        // Down past it on the floor: shove now if the shell is walking away,
        // else back up onto the crate.
        if (clear) stage = 'rShove';
        else return { left: true, jump: ball.x - (crate1.x + crate1.w) < 30 + R };
      } else return steer(ball, crate1.x + crate1.w / 2, 4);
    }
    if (stage === 'rOff') {
      if (ball.grounded && ball.platform !== crate1 && ball.x > crate1.x + crate1.w) stage = 'rShove';
      else return settle(ball, crate1.x + crate1.w + R + 4);
    }
    if (stage === 'rShove') {
      // Stop shoving the moment it tips into the pit.
      if (!inCorridor() || crate1.x + crate1.w < L) { stage = 'rOut'; seen.recovered++; }
      else return { left: true };
    }
    if (stage === 'rOut') {
      const under = L + 2 * R;
      if (ball.grounded && ball.y < floor1) stage = 'rDip';
      else if (ball.grounded && ball.y > floor1 && Math.abs(ball.x - under) < 6 && Math.abs(ball.vx) < 40) return { jump: true, left: true };
      else if (ball.y < floor1 + R) return { left: true };
      else return steer(ball, under, 4);
    }
    if (stage === 'rDip') {
      if (ball.grounded && ball.y < roofTop) stage = 'down';
      else if (ball.grounded && ball.y > roofTop) return { ...settle(ball, dipX), jump: Math.abs(ball.x - dipX) < 2 && Math.abs(ball.vx) < 15 };
      else return ball.y < roofTop - R ? { left: true } : {};
    }
    // --- room 2 ---
    if (stage === 'to2') {
      // Rest just short of the shell's reach. Only a dash that starts while
      // he rests there counts: one that met him on his way in may have used
      // its daze up already.
      const lure2 = s2.from - s2.r - R - 4;
      const atSpot = Math.abs(ball.x - lure2) < 6;
      if (c.state !== 'dazed') sawUp = atSpot;
      else if (sawUp && dazedAt == null) dazedAt = level.time;
      if (dazedAt != null && s2.state === 'flipped') { stage = 'in2'; at = null; }
      else if (dazedAt != null && c.state !== 'dazed') { dazedAt = null; sawUp = false; }
      else return settle(ball, lure2);
    }
    if (stage === 'in2') {
      if (wait(hes)) return {};
      if (!s2.alive) { stage = 'up2'; popAt = level.time; at = null; }
      else if (opts.noStomp || s2.state !== 'flipped') stage = 'up2';
      else {
        const dx = ball.x - s2.x;
        if (ball.grounded) return { left: dx > 4, right: dx < -4, jump: dx < 0 && dx > -(30 + 40 * lead) };
        return dx > 3 ? { left: true } : dx < -3 ? { right: true } : {};
      }
    }
    // Up onto the pen's roof from the shell's well, and along it through the
    // door standing on it, which needs the shell's plate off. A run that has
    // not stomped waits at the door. One whose shell came back first, shutting
    // the door before he got through, is recorded as missed.
    if (stage === 'up2') {
      if (ball.x - R > gate2.x + gate2.w) {
        if (popAt != null) SPARE15B.push({ lead, used: level.time - popAt, time: CONFIG.ENEMY.SHELL.RETURN });
        stage = 'to3';
      } else if (popAt != null && s2.alive && plate2.pressed && gate2.openT === 0) {
        SPARE15B.push({ lead, missed: true });
        stage = 'stuck2';
      } else if (ball.y > roof2.y) return { right: true, jump: ball.grounded };
      else return gate2.openT > 0.9 ? { right: true } : settle(ball, gate2.x - R - 2);
    }
    // --- room 3 ---
    if (stage === 'to3') {
      if (!rec3) { rec3 = { lead, crateAt: null, ranOut: false, lockAt: null, hitAt: null, crateTouching: null, through: null, time: t.time }; SPARE15.push(rec3); }
      if (ball.grounded && ball.y > floor1 - 2 * R && ball.x > Xr3 + R) stage = 'push3';
      else return { right: true };
    }
    if (stage === 'push3') {
      const zone = t.x - CONFIG.CIRCUIT.REACH;
      if (crate3.x + crate3.w > zone - (opts.push3 ?? 0)) stage = 'back3';
      else return { right: true };
    }
    if (stage === 'back3') {
      if (ball.grounded && ball.y < floor1 - R && ball.x < Xr3) { stage = 'up3'; backed = false; }
      // Out over the 20 up to the plateau needs a run at it: from a crate
      // barely moved, the ball is at the mouth already, so it backs into the
      // lane first.
      if (!backRun) { if (ball.x > Xr3 + 70 || ball.x + R > crate3.x - 2) backRun = true; else return { right: true }; }
      return { left: true, jump: ball.grounded && ball.y > floor1 - 2 * R && ball.x < Xr3 + 30 };
    }
    if (stage === 'up3') {
      if (ball.grounded && ball.y < roofTop) stage = 'gap3';
      else return onto(ball, Xr3);
    }
    if (stage === 'gap3') {
      if (ball.y > roofTop - R && Math.abs(ball.x - gc) < 3 && Math.abs(ball.vx) < 20) stage = 'sit3';
      else return steer(ball, gc, 1);
    }
    if (stage === 'sit3') {
      if (p3.state === 'aim' && p3.target && Math.abs(p3.target.x - gc) < 10 && p3.target.y > roofTop - R) {
        stage = 'go3'; at = null;
        rec3.lockAt = level.time;
      } else return {};
    }
    if (stage === 'go3') {
      // The hit, observed: the first step a key that is neither the crate
      // nor the ball is in the timer's touched set with its time full.
      if (wait(hes)) return {};
      if (ball.x > gate3.x + gate3.w + R) { rec3.through = level.time; stage = 'end'; }
      else return { right: true, jump: ball.grounded && ball.y > roofTop - R && ball.x < t.x };
    }
    return { right: true };
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
        // Wait a little short of the planks: far enough that the second
        // charge is seen coming and jumped, not met at the wood.
        else return ball.x < wood.x - 150 ? { right: true } : {};
      }
      return run(ball);
    };
  },

  // Level eleven. Room A: over the pen's roof, down into the yard, and wait —
  // the charger sees him, smashes the planks and hits the button. Room B: the
  // same, except the charge ends dazed on a plate, and the door is open only
  // while it sits there. No `dodge`: each charger is shut in its pen, and the
  // ball is never on its side of the wall. The stage it starts in comes from
  // where the ball starts, so the same route serves both checkpoints.
  11: (level, lead) => {
    const run = runner(level, lead);
    const A = room11(level, 0), B = room11(level, 1), lure = lure11(B);
    const p = sender(level, 'p');
    // Past the gap between the rooms, the runner has nothing left to jump:
    // from the foot of room B's slope it is only holding right.
    const slope = level.data.ground.find((l) => l.at(-1)[0] === B.roof.x && l.at(-1)[1] === B.roof.y);
    if (!slope) throw new Error('level 11: no ground line climbs to room B\'s roof');
    const foot = slope.at(-2)[0];
    let stage = null, dazedAt = 0, hopped = false;
    return (ball) => {
      if (!stage) stage = ball.x < A.gate.x ? 'toA' : 'toB';
      if (stage === 'toA') {
        if (A.down(ball)) stage = 'lureA';
        else return { right: true };
      }
      if (stage === 'lureA') {
        if (A.gate.openT > 0.9) stage = 'mid';
        else return {};
      }
      if (stage === 'mid') {
        if (ball.x > foot) stage = 'toB';
        else return run(ball);
      }
      if (stage === 'toB') {
        if (B.down(ball)) stage = 'lureB';
        else return { right: true };
      }
      // Come back to the lure band. Not because anywhere else in the yard is
      // out of sight — this charger's 320 covers all of it — but because the
      // band is the one spot the drop off the roof does not leave the ball
      // at, so luring from it proves the lure and not the arrival.
      if (stage === 'lureB') {
        if (p.pressed) { stage = 'goB'; dazedAt = level.time; }
        else return lure(ball);
      }
      // A sloppy thumb like level nine's: it hesitates longer the sloppier
      // the lead, and at the sloppiest hops once for nothing — here on the
      // first grounded step after the hesitation.
      if (stage === 'goB') {
        if (level.time - dazedAt < (lead - 0.7) * 1.5) return {};
        if (ball.x > B.gate.x + B.gate.w + 20) {
          SPARE11.push({ lead, used: level.time - dazedAt, time: CONFIG.ENEMY.CHARGER.DAZED });
          stage = 'end';
        } else if (!p.pressed && B.gate.openT === 0) {
          // The door shut in front of him: say so in 2c, not only as
          // section 1's timeout.
          SPARE11.push({ lead, missed: true });
          stage = 'end';
        } else {
          const hop = lead > 1.2 && !hopped && ball.grounded;
          if (hop) hopped = true;
          return { right: true, jump: hop };
        }
      }
      return run(ball);
    };
  },

  // Level twelve: see route12.
  12: (level, lead) => route12(level, lead),

  // Level thirteen: see route13.
  13: (level, lead) => route13(level, lead),

  // Level fourteen: see route14.
  14: (level, lead) => route14(level, lead),

  // Level fifteen: see route15.
  15: (level, lead) => route15(level, lead),
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

// Levels whose routes must not lose a single heart, in sections 1 and 2.
// Those sections count lives, not hearts, which is right for most levels (a
// graze is part of the heart budget), but on level ten a heart lost on the
// route means the ball landed on the charger over the step, or was still on
// it when its daze ended — the regressions holdAtStep exists to prevent.
// On level eleven both chargers are shut in their pens and nothing else
// there can hurt, so any heart lost at all is a charger got out. On level
// twelve the route never stands where an upright shell can reach it, so a
// heart lost is a crate that missed or a stomp that did not land. On level
// thirteen nothing can hurt but the three poppers' lobs, and the route never
// stands where one lands: room A is run straight through, and in rooms B and
// C the lob locked on the waiting ball ends on the button or the porch roof
// over its head. A heart lost is a lob that came down on the ball instead.
// On level fourteen each charger is penned behind its shell and the route
// stands only in the yard, clear of the shell's reach, and stomps the shell
// only once it is flipped: a heart lost is a stomp that missed.
const COUNTS_HEARTS = new Set([10, 11, 12, 13, 14, 15]);

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
      } else if (COUNTS_HEARTS.has(data.id) && ball.hits > 0) {
        bad.push(`lead ${lead} delay ${delay}: lost ${ball.hits} heart(s)`);
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
      else if (COUNTS_HEARTS.has(data.id) && ball.hits > 0) bad.push(`lead ${lead}: lost ${ball.hits} heart(s)`);
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

// --- 2e. level thirteen, room A: the popper really aimed at the ball ------
//
// The no-heart claim for room A means nothing unless popper A aimed at the
// running ball at all. Every run from the spawn must see it lock at least
// once, and every lob must come down within a ball's width (2 x BALL.R, from
// config.js) of where it aimed: where he was, not where he is.
console.log('\n2e. level thirteen, room A: the popper aims where he was');
{
  const R = CONFIG.BALL.R;
  const pAx = room13(loadLevel(LEVELS.find((l) => l.id === 13))).pA.x;
  const none = LOCKS13.filter((r) => !(r.locks.length >= 1));
  const all = LOCKS13.flatMap((r) => r.locks);
  const landed = all.filter((l) => l.landX != null);
  const off = landed.filter((l) => !(Math.abs(l.landX - l.aimX) <= 2 * R));
  const first = LOCKS13.filter((r) => r.locks.length).map((r) => r.locks[0].aimX - pAx);
  const strays = LOCKS13.reduce((n, r) => n + r.strays, 0);
  const unlanded = all.length - landed.length;
  const span = (xs) => (xs.length ? `${Math.min(...xs).toFixed(1)}-${Math.max(...xs).toFixed(1)}` : 'none');
  if (!LOCKS13.length) fail('no run of level thirteen started before popper A — nothing was measured');
  else if (!Number.isFinite(R)) fail('BALL.R is not a number');
  else {
    console.log(`   ${LOCKS13.length} runs, ${all.length} locks, ${landed.length} lobs came down, ${strays} stray landing(s); first lock ${span(first)} in front of the popper; a lob came down this far from its aim: ${span(landed.map((l) => Math.abs(l.landX - l.aimX)))}`);
    if (strays) fail(`${strays} of popper A's landings matched no unlanded lock`);
    if (unlanded) fail(`${unlanded} of popper A's locks never had a lob come down`);
    if (none.length) fail(`${none.length} of ${LOCKS13.length} level thirteen runs were never aimed at by popper A — room A proved nothing`);
    if (!landed.length) fail('no lob of popper A was seen to come down');
    if (off.length) fail(`${off.length} of popper A's lobs came down more than a ball's width from where they aimed`);
  }
}

// --- 2c. level eleven's door is never a pixel-perfect run --------------------
console.log('\n2c. level eleven: time to spare while the charger is dazed');
const missed11 = SPARE11.filter((s) => s.missed);
const through11 = SPARE11.filter((s) => !s.missed);
if (missed11.length) fail(`${missed11.length} of ${SPARE11.length} runs of level eleven missed room B's door: it shut before the ball got through`);
if (!through11.length) fail('no run of level eleven ever got through its second door — nothing was measured');
else {
  const worst = through11.reduce((w, s) => Math.max(w, s.used / s.time), 0);
  const tight = through11.filter((s) => s.used > 0.6 * s.time);
  if (tight.length) fail(`${tight.length} of ${through11.length} runs used more than 60% of the daze (worst ${(worst * 100).toFixed(0)}%)`);
  else console.log(`   ${through11.length} runs; the slowest used ${(worst * 100).toFixed(0)}% of the daze`);
}

// --- 2d. level twelve's first door is never a pixel-perfect run --------------
console.log('\n2d. level twelve: time to spare while the shell holds the plate');
{
  const missed = SPARE12.filter((s) => s.missed);
  const through = SPARE12.filter((s) => !s.missed);
  if (missed.length) fail(`${missed.length} of ${SPARE12.length} runs of level twelve missed room A's door: it shut before the ball got through`);
  const unmeasured = through.filter((s) => !(s.window > 0));
  if (unmeasured.length) fail(`${unmeasured.length} runs of level twelve never saw the plate come back up — the window was not measured`);
  if (!through.length) fail("no run of level twelve ever got through room A's door — nothing was measured");
  else if (!unmeasured.length) {
    const worst = through.reduce((w, s) => Math.max(w, s.used / s.window), 0);
    const shortest = through.reduce((w, s) => Math.min(w, s.window), Infinity);
    const tight = through.filter((s) => !(s.used <= 0.6 * s.window));
    if (tight.length) fail(`${tight.length} of ${through.length} runs used more than 60% of the time the shell held the plate (worst ${(worst * 100).toFixed(0)}%)`);
    else console.log(`   ${through.length} runs; the slowest used ${(worst * 100).toFixed(0)}% of the plate's time, the shortest window ${shortest.toFixed(2)}s`);
  }
}

// --- 2f. level fourteen's door is never a pixel-perfect run -----------------
//
// From the shell popping to the ball through the door, against the shell's
// RETURN (config.js): the least the door can be open for, since the return
// also waits for the ball to be RETURN_CLEAR from the shell's home, and he
// spends the first of his run inside that.
console.log('\n2f. level fourteen: time to spare before the shell can come back');
{
  const RET = CONFIG.ENEMY.SHELL.RETURN;
  const missed = SPARE14.filter((s) => s.missed);
  const through = SPARE14.filter((s) => !s.missed);
  // Every run from the spawn goes through the warm-up: 30 of section 1's.
  const fromSpawn = LEADS.length * DELAYS.length;
  if (!Number.isFinite(RET)) fail('ENEMY.SHELL.RETURN is not a number');
  if (missed.length) fail(`${missed.length} of ${SPARE14.length} runs of level fourteen missed the main door: the shell came back before the ball got through`);
  const warmed = WARM14.filter((w) => w.stomped).length;
  if (WARM14.length !== fromSpawn) fail(`${WARM14.length} of level fourteen's runs started before the warm-up, not ${fromSpawn}`);
  if (warmed !== WARM14.length) fail(`only ${warmed} of level fourteen's ${WARM14.length} runs through the warm-up stomped its shell`);
  if (!through.length) fail('no run of level fourteen ever got through its door — nothing was measured');
  else if (Number.isFinite(RET)) {
    const worst = through.reduce((w, s) => Math.max(w, s.used / s.time), 0);
    const tight = through.filter((s) => !(s.used <= 0.6 * s.time));
    if (tight.length) fail(`${tight.length} of ${through.length} runs used more than 60% of the shell's RETURN (worst ${(worst * 100).toFixed(0)}%)`);
    else console.log(`   ${through.length} runs (${warmed} of ${WARM14.length} from the spawn stomped the warm-up's shell too); the slowest used ${(worst * 100).toFixed(0)}% of RETURN (${through.reduce((w, s) => Math.max(w, s.used), 0).toFixed(2)}s of ${RET}s)`);
  }
}

// --- 2g. level fifteen: the lob's hit counts with the crate on the cap, and time to spare
//
// Room 3, every run that reached it, all observed in the timer's own state:
// the crate's first touch pressed it (its key in `touched`, time full); the
// timer then ran out (off) while the crate was still touching; and the lob's
// hit came after (a key that is neither the crate nor the ball arriving with
// the time refilled), with the crate's key in `touched` at that very step.
// That is the per-presser fix in use, not assumed. Then from that hit to
// through the gate, at most 60% of the timer's `time`, as level nine's 2b.
// Room 2: from the shell popping to through the door on the pen's roof, at
// most 60% of SHELL.RETURN (config.js) — the least that door is open for, as
// level fourteen's 2f — and no run whose shell came back first.
console.log('\n2g. level fifteen: the lob counts with the crate on the cap; time to spare');
{
  const RET = CONFIG.ENEMY.SHELL.RETURN;
  // From the spawn (section 1) and from both checkpoints (section 2), every
  // run reaches room 3; all but those from the second checkpoint, room 2.
  const l15 = LEVELS.find((l) => l.id === 15);
  const expect = LEADS.length * DELAYS.length + LEADS.length * (l15.checkpoints || []).length;
  const unpressed = SPARE15.filter((r) => r.crateAt == null);
  const notRunOut = SPARE15.filter((r) => r.crateAt != null && !r.ranOut);
  const unhit = SPARE15.filter((r) => r.hitAt == null);
  const untouched = SPARE15.filter((r) => r.hitAt != null && r.crateTouching !== true);
  const unthrough = SPARE15.filter((r) => r.hitAt != null && r.through == null);
  const done = SPARE15.filter((r) => r.hitAt != null && r.through != null);
  if (SPARE15.length !== expect) fail(`${SPARE15.length} runs of level fifteen reached room 3, not ${expect}`);
  if (unpressed.length) fail(`${unpressed.length} of level fifteen's room 3 runs never saw the crate press the timer`);
  if (notRunOut.length) fail(`${notRunOut.length} of level fifteen's room 3 runs never saw the timer run out with the crate still on it before the lob`);
  if (unhit.length) fail(`${unhit.length} of level fifteen's room 3 runs never saw the lob hit the timer`);
  if (untouched.length) fail(`${untouched.length} of level fifteen's lob hits came with the crate NOT touching the timer — the fix was not in use`);
  if (unthrough.length) fail(`${unthrough.length} of level fifteen's room 3 runs saw the hit but never got through the gate`);
  if (!done.length) fail('no run of level fifteen got through room 3 — nothing was measured');
  else {
    const tight = done.filter((r) => !(r.through - r.hitAt <= 0.6 * r.time));
    const worst = done.reduce((w, r) => Math.max(w, (r.through - r.hitAt) / r.time), 0);
    const xs = done.map((r) => r.ballX);
    if (tight.length) fail(`${tight.length} of ${done.length} level fifteen runs used more than 60% of room 3's timer (worst ${(worst * 100).toFixed(0)}%)`);
    else if (!untouched.length && !notRunOut.length && !unpressed.length) console.log(`   room 3: ${done.length} runs; in every one the crate pressed the timer, it ran out with the crate still on it, and the lob's hit came with the crate on the cap; the slowest used ${(worst * 100).toFixed(0)}% of the timer from the hit; the ball was at x ${Math.min(...xs).toFixed(0)}-${Math.max(...xs).toFixed(0)} when the lob hit`);
  }
  const missed = SPARE15B.filter((r) => r.missed);
  const through = SPARE15B.filter((r) => !r.missed);
  if (!Number.isFinite(RET)) fail('ENEMY.SHELL.RETURN is not a number');
  else if (missed.length) fail(`${missed.length} runs of level fifteen missed room 2's door: the shell came back before the ball got through`);
  else if (through.length !== expect - LEADS.length) fail(`${through.length} runs of level fifteen got through room 2 after a stomp, not ${expect - LEADS.length}`);
  else {
    const tight = through.filter((r) => !(r.used <= 0.6 * r.time));
    const worst = through.reduce((w, r) => Math.max(w, r.used / r.time), 0);
    if (tight.length) fail(`${tight.length} of ${through.length} level fifteen runs used more than 60% of the shell's RETURN in room 2 (worst ${(worst * 100).toFixed(0)}%)`);
    else console.log(`   room 2: ${through.length} runs, each through the door after a stomp; the slowest used ${(worst * 100).toFixed(0)}% of RETURN (${through.reduce((w, r) => Math.max(w, r.used), 0).toFixed(2)}s of ${RET}s)`);
  }
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
      const c = level.enemies.find((e) => e.kind === 'charger');
      let stage = 'in';
      return (ball) => {
        if (stomped && c.alive) back = true;
        const d = dodge(level, ball, lead);
        if (d) return d;
        if (stage === 'in') {
          if (ball.grounded && ball.x > 1700) stage = 'wait';
          else return holdAtStep(level, ball, c) || run(ball);
        }
        if (stage === 'wait') {
          if (c.state === 'dazed') stage = 'stomp';
          else return {};
        }
        // Roll back into it (dazed, it is not solid and does not hurt),
        // settle over it, and jump straight up: the way down is the stomp.
        // Only a pop seen here counts as stomped: one met any other way,
        // such as landing on it over the step, is not the lesson.
        if (stage === 'stomp') {
          if (!c.alive) { stomped = true; stage = 'out'; return {}; }
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
    // A heart lost here is the ball landing on the charger over the step, or
    // still over it when its daze ends: both were seen before holdAtStep.
    if (ball.hits) fail(`level ten, lead ${lead}: the stomp route lost ${ball.hits} heart(s)`);
  }
}

// --- 3m. level eleven, room A: the ball alone cannot open the door ---------
//
// Without the charger, a ball in the yard tries everything a thumb can: it
// comes to each spot across the yard from either side, then rolls each way
// or jumps each way. The button must stay unpressed and the planks whole —
// and every run must really have been down in the yard, or it proves nothing.
console.log('\n3m. level eleven: room A needs the charger');
{
  const data = LEVELS.find((l) => l.id === 11);
  const A = room11(loadLevel(data), 0);
  const bare = { ...data, enemies: [] };
  const spots = [];
  for (let x = A.x0; x < A.x1; x += 20) spots.push(x);
  spots.push(A.x1);
  const startY = A.c.y + A.c.r - CONFIG.BALL.R - 20;
  let pressed = false, broken = false, runs = 0, neverDown = 0;
  for (const spot of spots) {
    for (const fromX of [A.x0, A.x1]) {
      for (const move of [{ left: true }, { right: true }, { left: true, jump: true }, { right: true, jump: true }]) {
        runs++;
        let reached = false, wasDown = false;
        const route = () => (ball) => {
          if (A.down(ball)) wasDown = true;
          if (!reached && Math.abs(ball.x - spot) > 5) return ball.x < spot ? { right: true } : { left: true };
          reached = true;
          return { ...move, jump: move.jump && ball.grounded };
        };
        const { level } = play(bare, route, { from: { x: fromX, y: startY }, seconds: 6 });
        const wood = level.breakables.find((w) => w.x > A.roof.x && w.x < A.roof.x + A.roof.w);
        if (!wood) throw new Error('level 11: no planks under room A\'s roof');
        if (sender(level, 'b').pressed) pressed = true;
        if (wood.broken) broken = true;
        if (!wasDown || !reached) neverDown++;
      }
    }
  }
  console.log(`   ${runs} runs from ${spots.length} spots (${spots.join(', ')}), each from both sides: button ever pressed=${pressed}, planks ever broken=${broken}`);
  if (neverDown) fail(`level eleven: ${neverDown} of 3m's ${runs} runs never got down in room A's yard to its spot — they prove nothing`);
  if (pressed) fail('level eleven: the ball pressed room A\'s button without the charger');
  if (broken) fail('level eleven: the ball broke room A\'s planks without the charger');
}

// --- 3n. level eleven, room B: a door missed is not a dead end -------------
//
// A ball that dawdles while the charger is dazed misses the door. It goes and
// rests against the shut door and STAYS there, steering nothing: the charger
// has to come round, notice it where it stands, and charge again. That is
// what room B's charger's longer sight (320, against a door 286 from where
// its charge ends) buys — before it, resting at the door was out of sight,
// and the child had to find a sight line nothing on screen showed.
console.log('\n3n. level eleven: missing room B\'s door is not a dead end');
{
  const data = LEVELS.find((l) => l.id === 11);
  const B0 = room11(loadLevel(data), 1);
  if (B0.x1 >= B0.c.to + B0.c.see) fail(`level eleven: a ball resting at room B's door (x=${B0.x1}) is out of the charger's sight of ${B0.c.to} (sees ${B0.c.see})`);
  let dazes = 0, atDoor = 0, idleT = 0;
  const route = (level) => {
    const B = room11(level, 1), lure = lure11(B);
    const p = sender(level, 'p');
    let stage = 'lure', was = false, waitFrom = null;
    return (ball) => {
      if (p.pressed && !was) dazes++;
      was = p.pressed;
      if (stage === 'lure') { if (dazes === 1) stage = 'miss'; return lure(ball); }
      if (stage === 'miss') { if (!p.pressed && B.gate.openT === 0) stage = 'door'; return {}; }
      if (stage === 'door') {
        atDoor = Math.max(atDoor, ball.x);
        if (ball.x < B.gate.x - 30) return { right: true };
        stage = 'wait';
      }
      // The whole point: sit still at the shut door and be found there.
      if (stage === 'wait') {
        if (waitFrom === null) waitFrom = level.time;
        idleT = level.time - waitFrom;
        if (dazes < 2) return {};
        stage = 'go';
      }
      return { right: true };
    };
  };
  const from = { x: B0.x0 + 2 * CONFIG.BALL.R, y: B0.c.y + B0.c.r - CONFIG.BALL.R - 20 };
  const { ball } = play(data, route, { from, seconds: 40 });
  const through = ball.x > B0.gate.x + B0.gate.w;
  console.log(`   rested at the shut door (x=${atDoor.toFixed(0)}; a ball at rest sits at ${B0.x1}, the charger's sight reaches ${B0.c.to + B0.c.see}), waited ${idleT.toFixed(1)}s without steering, ${dazes} dazes, got through: ${through} (ball at x=${ball.x.toFixed(0)})`);
  if (atDoor < B0.gate.x - 30) fail('level eleven: 3n never went to rest at the shut door — it proves nothing');
  if (idleT < 1) fail(`level eleven: 3n waited only ${idleT.toFixed(2)}s — the charger found it before it settled at the door, so standing still was never tested`);
  if (dazes < 2) fail(`level eleven: 3n saw only ${dazes} daze(s) — the charger never came back for a ball standing still`);
  if (!through) fail('level eleven: after missing room B\'s door once, the ball could not get through');
}

// --- 3o. level twelve: room B has no dead end, and room A needs its shell --
//
// A crate that misses the shell lands in the corridor under hole 1, and it
// is not put back by anything but the ball: shoved left into the pit at the
// corridor's closed end, it falls out of the level and the level puts it
// home. So try to break room B on purpose. Shove it in at every 0.25s of a
// whole patrol of the corridor's shell, so that most of them miss, and get
// it back each time; and do the other things a ball can do to it — shove it
// as far left along the roof as it goes, stand on it in the corridor and
// push both ways, drop into the corridor beside it and push both ways. From
// every one of those the level must still be finished, and the crate must
// never stand anywhere but on the roof or under hole 1: anywhere further
// along the corridor is in the way of the run to the flag.
//
// Each get-back is timed: from dropping into the corridor to standing back
// on the roof, against how long the shell, walking as it was when he
// dropped in, would take to reach a ball under hole 1. It must use under
// 60% of that, like 2b-2d.
//
// Then room A: in a copy whose shell never reaches the plate, the route
// must stall at the door — and the same route on the real level must not,
// or the stall proves nothing.
//
// It bites: with the pit filled in (a copy with a stone box in it), a
// missed crate can never be got back, and the same tries must fail.
console.log('\n3o. level twelve: room B has no dead end, and room A needs its shell');
{
  const data = LEVELS.find((l) => l.id === 12);
  const cp = data.checkpoints[1];
  const from = { x: cp.x, y: cp.y - CONFIG.BALL.R - CONFIG.CHECKPOINT.CLEARANCE };
  const R = CONFIG.BALL.R;

  // One try: an optional prefix that does something to the room, then
  // route12, made afresh after every relocation so it starts from wherever
  // the ball now is. `outOfPlace` collects every step the crate stood
  // anywhere it should not.
  const try12 = (d, { prefix = null, pushAfter = null, lead = 1, seconds = 150, start = from, waitOut = false } = {}) => {
    const shoves = [], outOfPlace = [];
    let prefixDone = !prefix, leftmost = Infinity, flippedFirst = false, flippedEver = false;
    const res = play(d, (lv) => {
      const room = room12(lv);
      const { crate, lip, L, hole1, floor } = room;
      // The crate's floor on the roof starts where the plateau's ground line ends.
      const plateauEnd = Math.max(...d.ground.filter((l) => l.at(-1)[0] <= room.home.x).map((l) => l.at(-1)[0]));
      const pre = prefix && prefix(lv, room);
      let drive = null, deaths = -1;
      return (b, t) => {
        leftmost = Math.min(leftmost, crate.x);
        // A flip seen before any get-back is the first shove landing.
        if (room.sB.state === 'flipped') { flippedEver = true; if (!shoves.length) flippedFirst = true; }
        if (crate.grounded) {
          // `grounded` is from this step's fall, before the ball's push, so a
          // crate shoved off an edge reads grounded one push past it.
          const slop = CONFIG.CRATE.PUSH_SPEED * CONFIG.STEP;
          const onRoof = Math.abs(crate.y + crate.h - lip) < 1 && crate.x >= plateauEnd - 1 && crate.x <= L + slop;
          const underHole1 = Math.abs(crate.y + crate.h - floor) < 1 && crate.x >= L - crate.w - slop && crate.x + crate.w <= hole1[1] + 1;
          if (!onRoof && !underHole1) outOfPlace.push(`${crate.x.toFixed(0)},${crate.y.toFixed(0)}`);
        }
        if (!prefixDone) {
          const w = pre(b, t);
          if (w) return w;
          prefixDone = true;
        }
        if (b.deaths !== deaths) { deaths = b.deaths; drive = route12(lv, lead, { pushAfter, shoves, waitOut }); }
        return drive(b, t);
      };
    }, { from: start, seconds });
    return { ...res, shoves, outOfPlace, flippedFirst, flippedEver, leftmost };
  };

  const sB = loadLevel(data).enemies.filter((e) => e.kind === 'shell').sort((a, b) => a.from - b.from)[1];
  const patrol = 2 * (sB.to - sB.from) / CONFIG.ENEMY.SHELL.PATROL_SPEED;
  if (!Number.isFinite(patrol)) fail("level 12: the corridor shell's patrol time is not a number");

  // Shoved in at every 0.25s of a whole patrol.
  let hit = 0, miss = 0, worst = 0, slowest = 0;
  const allShoves = [], missedAt = [];
  for (let k = 0; k <= patrol; k += 0.25) {
    const r = try12(data, { pushAfter: k });
    // Hit: the shell was seen flipped before any get-back. Miss: a get-back
    // happened first. Never both, never neither.
    const missed = r.shoves.length > 0 && !r.flippedFirst;
    if (r.flippedFirst === missed) fail(`level 12, crate shoved ${k}s after reaching the edge: flipped first=${r.flippedFirst}, get-backs=${r.shoves.length} — neither a clean hit nor a clean miss`);
    if (missed) { miss++; missedAt.push(k); } else if (r.flippedFirst) hit++;
    allShoves.push(...r.shoves);
    slowest = Math.max(slowest, r.t);
    if (!r.ball.won || r.ball.deaths > 0 || r.ball.hits > 0) fail(`level 12, crate shoved ${k}s after reaching the edge: won=${r.ball.won} deaths=${r.ball.deaths} hits=${r.ball.hits} at ${r.ball.x.toFixed(0)},${r.ball.y.toFixed(0)}`);
    if (r.outOfPlace.length) fail(`level 12, crate shoved ${k}s after reaching the edge: the crate stood at ${r.outOfPlace[0]}, neither on the roof nor under hole 1`);
  }
  const unmeasured = allShoves.filter((sh) => !(sh.reach > 0));
  if (unmeasured.length) fail(`level 12: ${unmeasured.length} get-back(s) never saw the shell come back within the cap — the time to spare was not measured`);
  for (const sh of allShoves) if (sh.reach > 0) worst = Math.max(worst, sh.used / sh.reach);
  if (!miss || !hit) fail(`level 12: of ${hit + miss} shoves, ${hit} hit and ${miss} missed — both must happen, or this proves nothing`);
  if (!(worst <= 0.6)) fail(`level 12: a get-back used ${(worst * 100).toFixed(0)}% of the time before the shell reached it, over 60%`);
  console.log(`   ${hit + miss} shoves over a ${patrol.toFixed(1)}s patrol: ${hit} flipped the shell, ${miss} missed and were got back (${allShoves.length} get-backs, the slowest using ${(worst * 100).toFixed(0)}% of the time before the shell came; slowest finish ${slowest.toFixed(1)}s)`);

  // The other things a ball can do to it. `missFirst` shoves it straight in
  // on arrival, holding right: the shell starts walking away from hole 1, so
  // that is a miss, and the ball follows the crate into the hole.
  const missFirst = (lv, room) => (b) => (room.crate.y > room.lip ? null : { right: true });
  const then = (first, steps) => (lv, room) => {
    const a = first ? first(lv, room) : null;
    let aDone = !a, i = 0, since = null;
    return (b, t) => {
      if (!aDone) { const w = a(b, t); if (w) return w; aDone = true; }
      while (i < steps.length) {
        if (since == null) since = t;
        if (t - since < steps[i].secs) return steps[i].want(b, room, lv);
        i++; since = null;
      }
      return null;
    };
  };
  // On the roof, between the crate and hole 1.
  const crate0 = data.boxes.find((b) => b.movable);
  const rightOfCrate = { x: crate0.x + crate0.w + R + 10, y: crate0.y + crate0.h - R - CONFIG.CHECKPOINT.CLEARANCE };
  const tries = [
    { name: 'on the roof right of the crate: shove it left for 6s', start: rightOfCrate,
      prefix: then(null, [{ secs: 6, want: () => ({ left: true }) }]) },
    { name: 'on the roof right of the crate: shove it left for 6s, jumping', start: rightOfCrate,
      prefix: then(null, [{ secs: 6, want: (b) => ({ left: true, jump: b.grounded }) }]) },
    { name: 'in hole 1 on the missed crate: right 4s, then left 4s',
      prefix: then(missFirst, [
        { secs: 4, want: () => ({ right: true }) },
        { secs: 4, want: () => ({ left: true }) },
      ]) },
    { name: 'into the corridor beside the missed crate: right 3s, then left 3s',
      prefix: then(missFirst, [
        { secs: 1.5, want: (b) => ({ right: true, jump: b.grounded }) },
        { secs: 3, want: () => ({ right: true }) },
        { secs: 3, want: () => ({ left: true }) },
      ]) },
    { name: 'into the corridor beside the missed crate: left 3s, then right 3s, jumping',
      prefix: then(missFirst, [
        { secs: 1.5, want: (b) => ({ right: true, jump: b.grounded }) },
        { secs: 3, want: (b) => ({ left: true, jump: b.grounded }) },
        { secs: 3, want: (b) => ({ right: true, jump: b.grounded }) },
      ]) },
  ];
  for (const tr of tries) {
    const r = try12(data, { prefix: tr.prefix, start: tr.start });
    if (!r.ball.won) fail(`level 12 was not finished after: ${tr.name} (ball at ${r.ball.x.toFixed(0)},${r.ball.y.toFixed(0)}, crate at ${r.level.crates[0].x.toFixed(0)},${r.level.crates[0].y.toFixed(0)})`);
    if (r.outOfPlace.length) fail(`level 12, after: ${tr.name} — the crate stood at ${r.outOfPlace[0]}, neither on the roof nor under hole 1`);
    if (r.ball.won && !r.outOfPlace.length) console.log(`   ${tr.name}: finished in ${r.t.toFixed(1)}s (crate leftmost x=${r.leftmost.toFixed(0)}, back home ${r.level.crates[0].falls} time(s), ${r.ball.deaths} relocation(s))`);
  }

  // A flip that is not stomped: the shell rights itself in the corridor with
  // the crate under hole 1, and the room must still be finishable — by the
  // get-back, from there.
  {
    const r = try12(data, { waitOut: true });
    const ok = r.ball.won && r.flippedFirst && r.shoves.length > 0 && !r.ball.hits && !r.outOfPlace.length;
    if (!ok) fail(`level 12, flip left unstomped: won=${r.ball.won} flipped=${r.flippedFirst} get-backs=${r.shoves.length} hits=${r.ball.hits} crate out of place=${r.outOfPlace.length}`);
    else console.log(`   flip left unstomped until the shell was up again: got the crate back and finished in ${r.t.toFixed(1)}s, no heart lost`);
  }

  // It bites: fill the pit, and a missed crate can never be got back. The
  // first, middle and last of the shoves above that missed.
  {
    const room = room12(loadLevel(data));
    const filled = { ...data, boxes: [...data.boxes, { x: room.pit[0], y: room.floor, w: room.pit[1] - room.pit[0], h: data.bounds.h - room.floor }] };
    const ks = [missedAt[0], missedAt[missedAt.length >> 1], missedAt.at(-1)].filter((k) => k != null);
    const finished = ks.filter((k) => try12(filled, { pushAfter: k, seconds: 60 }).ball.won);
    if (ks.length < 3 || finished.length) fail(`3o does not bite: with level 12's pit filled, ${finished.length} of ${ks.length} missed shoves still finished`);
    else console.log(`   with the pit filled in, none of 3 missed shoves (at ${ks.join(', ')}s) was got back, as it should be`);
  }

  // Room A needs its shell on the plate.
  {
    const cpA = data.checkpoints[0];
    const fromA = { x: cpA.x, y: cpA.y - R - CONFIG.CHECKPOINT.CLEARANCE };
    const plate = data.senders.find((s) => s.id === 'p');
    const shells = data.enemies.filter((e) => e.kind === 'shell').sort((a, b) => a.from - b.from);
    const frozenA = { ...shells[0], to: plate.x - CONFIG.ENEMY.SHELL.R - 40 };
    if (!(frozenA.to > frozenA.from && frozenA.x <= frozenA.to)) throw new Error("level 12: no room to keep room A's shell off the plate");
    const frozen = { ...data, enemies: data.enemies.map((e) => (e === shells[0] ? frozenA : e)) };
    const seconds = 45;
    let opened = 0;
    const stalled = play(frozen, (lv) => { const d = route12(lv, 1), g = room12(lv).gate; return (b, t) => { opened = Math.max(opened, g.openT); return d(b, t); }; }, { from: fromA, seconds });
    const control = play(data, (lv) => route12(lv, 1), { from: fromA, seconds });
    const gate = room12(loadLevel(data)).gate;
    const stalledOk = stalled.ball.x <= gate.x && opened === 0;
    const controlOk = control.ball.x >= gate.x + gate.w;
    if (!stalledOk) fail(`level 12 room A opened (openT ${opened.toFixed(2)}) or was passed (x=${stalled.ball.x.toFixed(0)}) with its shell kept off the plate`);
    if (!controlOk) fail(`level 12 room A: the same route on the real level did not get through its door in ${seconds}s either, so the stall proves nothing`);
    if (stalledOk && controlOk) console.log(`   room A with its shell kept off the plate: the door never opened in ${seconds}s, ball held at x=${stalled.ball.x.toFixed(0)}; on the real level the same route got through`);
  }
}

// --- 3p. level thirteen: rooms B and C need their poppers -------------------
//
// With every popper taken out, a ball in room B or C tries everything a thumb
// can, the way 3m does: it comes to each spot across the room's floor, from
// the checkpoint at full speed or back from the door, then rolls or jumps
// each way. Button b must stay unpressed and the ball must never be through
// its door; the porch must stay whole and the ball never up the step. Every
// run must really have reached its spot, or it proves nothing. Then the same
// tries on two broken copies, to show the check can fail: room B's button and
// bracket lowered 60, to where a jump reaches the cap, and room C's porch
// without its stone end and with the dip under its popper flattened, so a
// running jump meets the planks' face.
console.log('\n3p. level thirteen: rooms B and C need their poppers');
{
  const data = LEVELS.find((l) => l.id === 13);
  const tryAlone = (d, which) => {
    const bare = { ...d, enemies: [] };
    const r = room13(loadLevel(d));
    // From the start point behind the room's popper, so a running jump from
    // anywhere on the way in is tried too, not only from under the popper.
    // Room A has nothing to get through; it is tried for its perch alone,
    // from 400 behind its popper to the end of its range.
    const from = r['from' + which];
    const [x0, x1] = which === 'A' ? [r.pA.x - 400, r.pA.x + r.pA.range] : [from.x, which === 'B' ? r.spotB : r.spotC];
    // Every popper's perch: the stone its foot stands on. A ball that ever
    // gets up beside a popper can stomp the room's only tool, which never
    // comes back.
    const perches = r.poppers.map((p) => {
      const w = loadLevel(d).walls.find((s) => s.y === p.y + p.r && s.x <= p.x && s.x + s.w >= p.x);
      if (!w) throw new Error(`level ${d.id}: no perch under the popper at ${p.x}`);
      return w;
    });
    let opened = false, perched = false, runs = 0, missed = 0;
    const spots = [];
    for (let x = x0; x < x1; x += 20) spots.push(x);
    spots.push(x1);
    for (const spot of spots) {
      for (const fromX of [from.x, x1]) {
        for (const move of [{ left: true }, { right: true }, { left: true, jump: true }, { right: true, jump: true }]) {
          runs++;
          let reached = false;
          const route = () => (ball) => {
            if (perches.some((w) => ball.y < w.y && ball.x > w.x - CONFIG.BALL.R && ball.x < w.x + w.w + CONFIG.BALL.R)) perched = true;
            if (!reached && Math.abs(ball.x - spot) > 5) return ball.x < spot ? { right: true } : { left: true };
            reached = true;
            return { ...move, jump: move.jump && ball.grounded };
          };
          const { ball, level } = play(bare, route, { from: { x: fromX, y: from.y }, seconds: 6 });
          // The same pieces room13 found, in this run's own copy of the level
          // (room13 itself wants the poppers this copy has not got).
          const b = sender(level, 'b'), wd = level.breakables.find((w) => w.x === r.wood.x && w.y === r.wood.y);
          if (which === 'B' && (b.pressed || ball.x > r.gate.x + r.gate.w)) opened = true;
          if (which === 'C' && (wd.broken || (ball.x > r.step.x && ball.y < r.step.y))) opened = true;
          if (!reached) missed++;
        }
      }
    }
    return { opened, perched, runs, missed, spots };
  };
  for (const which of ['A', 'B', 'C']) {
    const { opened, perched, runs, missed, spots } = tryAlone(data, which);
    console.log(`   room ${which}: ${runs} runs from ${spots.length} spots (${spots[0]}-${spots.at(-1)}), each from both sides: ${which === 'A' ? '' : `got through without a popper=${opened}, `}up beside a popper=${perched}`);
    if (perched) fail(`level thirteen: in room ${which} the ball got up beside a popper, where it can stomp it`);
    if (missed) fail(`level thirteen: ${missed} of 3p's room ${which} runs never reached their spot — they prove nothing`);
    if (opened) fail(`level thirteen: the ball got through room ${which} without its popper`);
  }
  // The broken copies: each must be got through somewhere, or 3p cannot fail.
  const r13 = room13(loadLevel(data));
  const same = (bx, w) => bx.x === w.x && bx.y === w.y && bx.w === w.w && bx.h === w.h;
  if (!r13.bracket || !r13.stoneEnd) throw new Error('level 13: no bracket beside button b\'s post, or no stone end to the porch');
  const lowB = structuredClone(data);
  lowB.senders = lowB.senders.map((s) => (s.id === 'b' ? { ...s, y: s.y + 60 } : s));
  const bracket = lowB.boxes.find((bx) => same(bx, r13.bracket));
  if (!bracket) throw new Error('level 13: the bracket is not among the level\'s boxes');
  bracket.y += 60;
  const noEnd = structuredClone(data);
  noEnd.boxes = noEnd.boxes.filter((bx) => !same(bx, r13.stoneEnd));
  if (noEnd.boxes.length !== data.boxes.length - 1) throw new Error('level 13: the porch\'s stone end is not among the level\'s boxes');
  // And a flat run-up to it: the dip under room C's popper alone already
  // spoils every running jump at the bare face. One line at the floor's
  // height, across every ground line there is.
  const xs = data.ground.flat().map(([x]) => x);
  noEnd.ground = [[[Math.min(...xs), r13.floor], [Math.max(...xs), r13.floor]]];
  const bitB = tryAlone(lowB, 'B'), bitC = tryAlone(noEnd, 'C');
  console.log(`   broken copies: button lowered 60, got through=${bitB.opened}; porch without its stone end, got through=${bitC.opened}`);
  if (!bitB.opened) fail('3p cannot fail: a ball alone never pressed room B\'s button even lowered to where a jump reaches it');
  if (!bitC.opened) fail('3p cannot fail: a ball alone never broke room C\'s porch even with its planks\' face bare');

  // How exact the waiting has to be, with the poppers in: a ball that comes
  // from the room's checkpoint and rests at x, every 5 back from where the
  // route waits. The window is the unbroken stretch, ending at the route's
  // own spot, where the lob does its job and no heart is lost. It must be at
  // least a ball wide (2 x BALL.R, from config.js) — a guess at what a thumb
  // can stop within, not a measured one.
  const rw = room13(loadLevel(data));
  for (const which of ['B', 'C']) {
    const spot = which === 'B' ? rw.spotB : rw.spotC;
    const from = rw['from' + which];
    let lo = null, tried = 0;
    // 200 is only where the scan gives up, not anything measured: a window
    // that reached it would print as 195 wide.
    for (let x = spot; x > spot - 200; x -= 5) {
      tried++;
      // Hearts are counted up to the moment the job is done: a ball that
      // then sits on where it was aimed at is simply aimed at again.
      let hitsAtDone = null;
      const steerTo = (lv) => (ball) => {
        const done = which === 'B' ? sender(lv, 'b').pressed : lv.breakables.find((w) => w.x === rw.wood.x && w.y === rw.wood.y).broken;
        if (done && hitsAtDone == null) hitsAtDone = ball.hits;
        return ball.x < x - 2 ? { right: true } : ball.x > x + 2 ? { left: true } : {};
      };
      play(data, steerTo, { from, seconds: 14 });
      if (hitsAtDone !== 0) break;
      lo = x;
    }
    const width = lo == null ? 0 : spot - lo;
    console.log(`   room ${which}: resting anywhere from ${lo} to ${spot} works (${width} wide, ${tried} rests tried)`);
    if (!Number.isFinite(CONFIG.BALL.R)) fail('BALL.R is not a number');
    else if (!(width >= 2 * CONFIG.BALL.R)) fail(`level thirteen: room ${which}'s waiting spot is only ${width} wide, under a ball's width`);
  }

  // Why the bracket: room B's lob comes down too steeply to hit the face of a
  // cap on a post standing on the floor. A copy with the bracket gone and
  // the button lowered 60 onto such a post (as the broken copy above), the ball resting at each spot the window
  // scan tries that keeps it clear of the button: popper B's lob must never
  // press it. Asked at popper B's own flight (the loaded popper's, never
  // the config's), and at a much flatter 0.45s, which must press it, or
  // this cannot fail.
  const floorLob = (flight) => {
    const d = structuredClone(data);
    d.boxes = d.boxes.filter((bx) => !same(bx, r13.bracket));
    d.senders = d.senders.map((s) => (s.id === 'b' ? { ...s, y: s.y + 60 } : s));
    const iB = d.enemies.findIndex((e) => e.kind === 'popper' && !e.fixed && e.x === rw.pB.x);
    d.enemies[iB] = { ...d.enemies[iB], flight };
    let pressed = 0, tried = 0;
    for (let x = rw.spotB; x > rw.spotB - 200; x -= 5) {
      // Clear of the button: a ball touching it presses it itself.
      if (Math.abs(x - rw.b.x) < 2 * CONFIG.BALL.R + 20) continue;
      tried++;
      let lob = false;
      const steerTo = (lv) => (ball) => {
        const b = sender(lv, 'b');
        if (b.pressed && Math.abs(ball.x - b.x) > CONFIG.BALL.R + 20) lob = true;
        return ball.x < x - 2 ? { right: true } : ball.x > x + 2 ? { left: true } : {};
      };
      play(d, steerTo, { from: rw.fromB, seconds: 14 });
      if (lob) pressed++;
    }
    return { pressed, tried };
  };
  const own = floorLob(rw.pB.flight), flat = floorLob(0.45);
  console.log(`   button on the floor, no bracket: popper B's lob (flight ${rw.pB.flight}s) pressed it from ${own.pressed} of ${own.tried} rests; a 0.45s lob from ${flat.pressed} of ${flat.tried}`);
  if (!(own.tried > 0)) fail('3p: no rest clear of room B\'s button was tried with it on the floor');
  if (own.pressed) fail(`level thirteen: room B's lob presses a button on the floor from ${own.pressed} rests, so the bracket is not needed`);
  if (!flat.pressed) fail('3p cannot fail: even a 0.45s lob never pressed room B\'s button on the floor');
}

// --- 3q. level thirteen, room A: standing still is where the lob lands -----
//
// The other half of room A's lesson: a ball that stops in front of popper A,
// halfway between where it first locked on a running ball (2e's first
// lock, as measured) and the end of its range, is hit there. It loses a heart (harmlessly: it has three) and nothing else.
console.log('\n3q. level thirteen: stop in room A and the lob lands on you');
{
  const data = LEVELS.find((l) => l.id === 13);
  const { pA, fromA } = room13(loadLevel(data));
  const firstLock = LOCKS13.find((r) => r.locks.length)?.locks[0].aimX;
  if (!Number.isFinite(firstLock)) fail('3q: 2e measured no first lock in room A to stop after');
  else {
  const spot = (firstLock + pA.x + pA.range) / 2;
  const route = () => (ball) => (ball.x < spot - 2 ? { right: true } : ball.x > spot + 2 ? { left: true } : {});
  const { ball } = play(data, route, { from: fromA, seconds: 8 });
  console.log(`   stopped at ${spot.toFixed(0)} (first lock ${firstLock.toFixed(0)}, popper at ${pA.x}, range ${pA.range}): ${ball.hits} heart(s) lost, deaths ${ball.deaths}`);
  if (!(ball.hits >= 1)) fail('level thirteen: a ball standing still in room A was never hit — the room teaches nothing');
  if (ball.deaths > 0) fail('level thirteen: standing in room A for 8s cost a whole life');
  }
}

// --- 3r. level fourteen: only the charger moves the shell, and early is fine -
//
// First, the ball alone. Without the main room's charger, a ball in its yard
// tries everything a thumb can, as in 3m: it comes to each spot across the
// yard from either side, then rolls each way or jumps each way. The shell
// must never leave its patrol, the door never start to open, and the ball
// never get past it — and every run must really have reached its spot down
// in the yard, or it proves nothing. There is no crate in the level to drop
// on the shell either. A broken copy with a crate on a step beside the shell
// must be caught flipping it, or the sweep could not see a way if there were
// one.
//
// Then, not a dead end. A ball that comes down on the dazed charger and the
// flipped shell together pops both, and the door opens. If it dawdles —
// goes and rests at the door and steers nothing — the shell comes back and
// the door shuts; then the charger comes back, finds it where it stands,
// and dashes into the shell again; and the ball gets through on that one.
console.log('\n3r. level fourteen: the shell moves only for the charger, and no dead end');
{
  const R = CONFIG.BALL.R;
  const data = LEVELS.find((l) => l.id === 14);
  const B0 = room14(loadLevel(data), 1);
  const mainCharger = data.enemies.findIndex((e) => e.kind === 'charger' && e.from === B0.c.from);
  const sweep = (d) => {
    const spots = [];
    for (let x = B0.x0; x < B0.x1; x += 20) spots.push(x);
    spots.push(B0.x1);
    const startY = B0.c.y + B0.c.r - R - 20;
    let flips = 0, opened = 0, past = 0, runs = 0, unreached = 0;
    for (const spot of spots) {
      for (const fromX of [B0.x0, B0.x1]) {
        for (const move of [{ left: true }, { right: true }, { left: true, jump: true }, { right: true, jump: true }]) {
          runs++;
          let reached = false, flipped = false, open = false, out = false;
          // The copy has no charger to find the room by, so its shell and
          // gate are the ones at the real room's places.
          const route = (level) => {
            const sh = level.enemies.find((e) => e.kind === 'shell' && e.from === B0.s.from);
            const gate = level.gates.find((g) => g.x === B0.gate.x);
            return (ball) => {
              if (sh.state !== 'patrol' || !sh.alive) flipped = true;
              if (gate.openT > 0) open = true;
              if (ball.x > gate.x + gate.w) out = true;
              if (!reached && Math.abs(ball.x - spot) > 5) return ball.x < spot ? { right: true } : { left: true };
              if (!reached && B0.down(ball)) reached = true;
              if (!reached) return {};
              return { ...move, jump: move.jump && ball.grounded };
            };
          };
          play(d, route, { from: { x: fromX, y: startY }, seconds: 6 });
          if (flipped) flips++;
          if (open) opened++;
          if (out) past++;
          if (!reached) unreached++;
        }
      }
    }
    return { spots, runs, flips, opened, past, unreached };
  };
  if (mainCharger < 0) fail('3r: no charger in level fourteen\'s main room');
  else {
    const crates = loadLevel(data).crates.length;
    const bare = { ...data, enemies: data.enemies.filter((_, k) => k !== mainCharger) };
    const a = sweep(bare);
    console.log(`   ball alone: ${a.runs} runs from ${a.spots.length} spots (${a.spots[0]}-${a.spots.at(-1)}), each from both sides; ${a.unreached} never reached their spot; shell left its patrol in ${a.flips}, door began to open in ${a.opened}, ball got past it in ${a.past}; crates in the level: ${crates}`);
    if (a.unreached) fail(`level fourteen: ${a.unreached} of 3r's ${a.runs} runs never got down to their spot in the main yard — they prove nothing`);
    if (a.flips) fail(`level fourteen: the ball alone moved the main room's shell out of its patrol in ${a.flips} run(s)`);
    if (a.opened || a.past) fail(`level fourteen: the ball alone opened the main door (${a.opened}) or got past it (${a.past})`);
    if (crates) fail(`level fourteen has ${crates} crate(s) — 3r assumes none could be dropped on the shell`);
    // The broken copy: an 80-high stone step at the yard's near end, and a
    // crate on it, flush with the step's left edge, over the shell's range.
    const step = { x: B0.x0 - R + 4, y: 680, w: 100, h: 80 };
    const broken = { ...bare, boxes: [...bare.boxes, step, { x: step.x, y: step.y - 60, w: 60, h: 60, movable: true }] };
    const b = sweep(broken);
    console.log(`   broken copy (a crate on a step beside the shell): shell left its patrol in ${b.flips} of ${b.runs} runs`);
    if (!b.flips) fail('3r: the sweep never flipped the shell even with a crate on a step beside it — it could not see a way if there were one');
  }

  // Not a dead end.
  let restX = -Infinity, both = 0, shellBack = false, shutAgain = false, chargerBack = false, dashes = 0, doorDashes = 0, idleT = 0, waits = 0;
  const route = (level) => {
    const B = room14(level, 1), lure = lure14(B);
    const roofEnd = B.roof.x + B.roof.w;
    let stage = 'lure', wasDazed = false, waitFrom = null;
    return (ball) => {
      const dazed = B.c.alive && B.c.state === 'dazed';
      if (dazed && !wasDazed) {
        dashes++;
        // A dash at the ball resting at the door: only these show the
        // returned charger found it there.
        if (stage === 'wait' || stage === 'again') doorDashes++;
      }
      wasDazed = dazed;
      if (stage === 'lure') {
        if (dazed && B.s.state === 'flipped') {
          // Where a ball comes down on both: its left edge a little inside
          // the charger's box, and clear of the pen's roof.
          const at = B.c.x + B.c.r + R - 4;
          if (at - R >= roofEnd + 1) stage = 'both';
          else { waits++; stage = 'skip'; }
        } else return lure(ball);
      }
      // This daze left the charger under the roof: let it pass.
      if (stage === 'skip') {
        if (!dazed && B.s.state === 'patrol') stage = 'lure';
        return lure(ball);
      }
      if (stage === 'both') {
        if (!B.c.alive && !B.s.alive) { both++; stage = 'door'; }
        else if (!dazed && B.c.alive) { stage = 'lure'; return lure(ball); }
        else return stomp14(ball, B.s, 1, B.c.x + B.c.r + R - 4 - B.s.x);
      }
      if (stage === 'door') {
        // Short of the open gate's footprint: a ball standing in the
        // doorway holds an opening gate open, and that is not dawdling.
        const spot = B.x1 - 10;
        if (Math.abs(ball.x - spot) < 6 && ball.grounded && Math.abs(ball.vx) < 5) stage = 'wait';
        else return ball.x < spot - 4 ? { right: true } : ball.x > spot + 4 ? { left: true } : {};
      }
      if (stage === 'wait') {
        if (waitFrom === null) waitFrom = level.time;
        idleT = level.time - waitFrom;
        restX = Math.max(restX, ball.x);
        if (B.s.alive) shellBack = true;
        if (shellBack && B.gate.openT === 0) shutAgain = true;
        if (B.c.alive) chargerBack = true;
        if (B.s.state !== 'flipped') return {};
        stage = 'again';
      }
      if (stage === 'again') {
        if (!B.s.alive) stage = 'go';
        else return stomp14(ball, B.s, 1);
      }
      return { right: true };
    };
  };
  const from = { x: B0.x0 + 2 * R, y: B0.c.y + B0.c.r - R - 20 };
  const { ball } = play(data, route, { from, seconds: 60 });
  const through = ball.x > B0.gate.x + B0.gate.w;
  console.log(`   popped both together ${both} time(s) (${waits} daze(s) under the roof let pass), rested at the door ${idleT.toFixed(1)}s steering nothing, at most at x=${restX.toFixed(0)} (the gate is at ${B0.gate.x}): shell back=${shellBack}, door shut again=${shutAgain}, charger back=${chargerBack}, ${dashes} dash(es) in all, ${doorDashes} at the ball resting at the door, got through: ${through} (x=${ball.x.toFixed(0)}, ${ball.hits} heart(s) lost)`);
  if (both !== 1) fail(`level fourteen: 3r popped the charger and shell together ${both} time(s), not once — the early stomp was not tested`);
  if (!shellBack || !shutAgain) fail('level fourteen: 3r never saw the shell come back and the door shut — the dawdle was not tested');
  if (!chargerBack) fail('level fourteen: a charger stomped early never came back');
  if (!(doorDashes >= 1)) fail(`level fourteen: 3r saw ${doorDashes} dash(es) at the ball resting at the door (${dashes} in all) — the returned charger never found it there`);
  if (!(restX + R <= B0.gate.x + 2)) fail(`level fourteen: 3r's resting ball reached x=${restX.toFixed(0)}, inside the gate's footprint — it held the door, it did not wait at it`);
  if (!through) fail('level fourteen: after stomping the charger early and missing the door, the ball could not get through');
  if (ball.hits) fail(`level fourteen: 3r lost ${ball.hits} heart(s)`);
}

// --- 3s. level fifteen: each room needs its mechanic, and no crate is a dead end
//
// Each room's mechanic is broken in a copy of the level and the route has to
// stall there; the ball alone, tried every which way, never does the
// mechanic's job; every crate left anywhere it can be left still lets the
// route finish with no heart lost; and the per-presser fix is shown to be
// what room 3 rests on, by putting the old single flag back on its timer.
// Every broken copy that is meant to be caught is run too, and must be.
console.log('\n3s. level fifteen: each room needs its mechanic, and no crate is a dead end');
{
  const data = LEVELS.find((l) => l.id === 15);
  const R = CONFIG.BALL.R;
  const probe = loadLevel(data);
  const m = room15(probe);
  const cp = (data.checkpoints || []).map((c) => ({ x: c.x, y: c.y - R - CONFIG.CHECKPOINT.CLEARANCE }));
  // level.enemies is made from data.enemies in order; say so once, by kind
  // and x, rather than trust it silently.
  data.enemies.forEach((e, j) => {
    if (probe.enemies[j].kind !== e.kind || probe.enemies[j].x !== e.x) throw new Error(`level 15: loaded enemy ${j} is not data enemy ${j}`);
  });
  const idx = (e) => probe.enemies.indexOf(e);
  const without = (i) => ({ ...data, enemies: data.enemies.filter((_, j) => j !== i) });
  const withEnemy = (i, patch) => ({ ...data, enemies: data.enemies.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  // The ball alone, as a thumb that knows nothing: hold one way, jump every
  // `j` steps (or never), turn round every `f` steps (or never).
  const pattern = (d0, j, f) => () => {
    let n = 0, d = d0;
    return () => { n++; if (f && n % f === 0) d = -d; return { left: d < 0, right: d > 0, jump: !!j && n % j === 0 }; };
  };
  const patterns = [];
  for (const d0 of [1, -1]) for (const j of [0, 20, 45]) for (const f of [0, 60, 150]) patterns.push(pattern(d0, j, f));
  // The route on a copy, watching a door every step: whether the ball ever
  // got through it, not just where it is at the end. (Room 3's gate does
  // open by itself once — the crate's own first touch on the timer — but
  // with the ball far off in the lane, so through is the question.)
  const watchDoor = (d, door, lead, from, seconds, opts = {}) => {
    let opened = false;
    const { ball } = play(d, (lv) => {
      const g = room15(lv)[door], drive = route15(lv, lead, opts);
      return (b) => { if (b.x - CONFIG.BALL.R > g.x + g.w) opened = true; return drive(b); };
    }, { from, seconds });
    return { won: ball.won, opened };
  };

  // (a) Room 1 needs popper 1. Without it the route waits at the hatch for a
  // lob that never comes (its range cut to 100, short of the hatch); and the ball alone, from the plateau, the roof, the
  // hatch and the lane, never breaks the planks (popper 1 left out, so only
  // the ball could). A copy whose hatch is widened 50, so a ball can drop in
  // beside the planks, is caught breaking them.
  {
    const noPop = without(idx(m.p1));
    const short = withEnemy(idx(m.p1), { range: 100 });
    const stalled = LEADS.filter((lead) => {
      const { ball, level } = play(short, (lv) => route15(lv, lead), { seconds: 60 });
      return !ball.won && !level.breakables[0].broken;
    }).length;
    const starts = [
      { x: (m.Xr1 + 850) / 2, y: m.floor1 - 20 - 2 * R },
      { x: m.Xr1 + 50, y: m.roofTop - R - 2 },
      { x: m.hc, y: m.roofTop - R - 10 },
      { x: m.crate1.x - R - 2, y: m.floor1 - R - 2 },
    ];
    const alone = (d) => {
      let broke = 0, n = 0;
      for (const s of starts) for (const pat of patterns) {
        n++;
        const { level } = play(d, () => pat(), { from: s, seconds: 12 });
        if (level.breakables[0].broken) broke++;
      }
      return { broke, n };
    };
    const real = alone(noPop);
    const wide = {
      ...noPop,
      boxes: noPop.boxes.map((b) => (b.x === m.hatch[1] && b.y === m.roofTop ? { ...b, x: b.x + 50, w: b.w - 50 } : b)),
    };
    const caught = alone(wide);
    console.log(`   (a) popper 1's range cut to 100: ${stalled} of ${LEADS.length} routes stalled at the hatch; the ball alone broke the planks in ${real.broke} of ${real.n} tries; with the hatch 50 wider, in ${caught.broke} of ${caught.n}`);
    if (stalled !== LEADS.length) fail(`level fifteen finished room 1 without popper 1 in ${LEADS.length - stalled} run(s)`);
    if (real.broke) fail(`the ball alone broke level fifteen's planks in ${real.broke} of ${real.n} tries`);
    if (!caught.broke) fail('a copy of level fifteen with a hatch 50 wider was not caught breaking the planks — (a) proves nothing');
  }

  // (b) Room 1 needs the crate's fall. With hole 1 stoned over, the crate
  // cannot drop, the shell is never flipped, and the door never opens.
  {
    const closed = { ...data, boxes: [...data.boxes, { x: m.L, y: m.floor1, w: m.pit[1] - m.pit[0], h: 20 }] };
    let opened = 0, won = 0;
    for (const lead of LEADS) {
      const r = watchDoor(closed, 'gate1', lead, null, 60);
      if (r.won) won++;
      if (r.opened) opened++;
    }
    console.log(`   (b) hole 1 stoned over: ${won} of ${LEADS.length} finished, through room 1's door in ${opened}`);
    if (won || opened) fail("level fifteen's room 1 door opened with hole 1 stoned over — something but the crate flips its shell");
  }

  // (c) Room 1's crate: pushed in at every 0.5s of the shell's patrol, so
  // most miss, and every miss is got back; and left anywhere in the lane —
  // the planks already gone, the ball dropping in through the hatch behind
  // it — it is still pushed on. Every run must finish with no heart lost,
  // and the misses, the crates got back and the flips are counted as seen.
  {
    const patrol = 2 * (m.s1.to - m.s1.from) / CONFIG.ENEMY.SHELL.PATROL_SPEED;
    if (!Number.isFinite(patrol)) fail('room 1 shell patrol is not a number');
    let bad = [], misses = 0, recovered = 0, flips = 0, runs = 0;
    for (let a = 0; a <= patrol; a += 0.5) {
      runs++;
      const before = SEEN15.length;
      const { ball } = play(data, (lv) => route15(lv, 1, { pushAfter: a }), { seconds: 180 });
      const seen = SEEN15[before];
      if (!seen) { bad.push(`after ${a}s: nothing seen`); continue; }
      misses += seen.misses; recovered += seen.recovered; flips += seen.flips;
      if (!ball.won || ball.hits > 0) bad.push(`after ${a}s: won=${ball.won} hits=${ball.hits} at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}`);
    }
    const spots = [];
    // From the mouth: a crate shoved left down the lane stops 1.25 short of
    // the plateau's face (simulated, shoving it from the dip), so 2 off it.
    for (let x = m.Xr1 + 2; x + 60 <= m.L - 6; x += 40) spots.push(x);
    let lane = 0;
    for (const x of spots) {
      const r = play(data, (lv) => {
        lv.breakWood(lv.breakables[0]);
        const k = room15(lv).crate1; k.x = x;
        return route15(lv, 1);
      }, { seconds: 180 });
      lane++; runs++;
      if (!r.ball.won || r.ball.hits > 0) bad.push(`crate left at ${x}: won=${r.ball.won} hits=${r.ball.hits} at ${r.ball.x.toFixed(0)},${r.ball.y.toFixed(0)}`);
    }
    console.log(`   (c) room 1's crate pushed at ${runs - spots.length} times through a ${patrol.toFixed(1)}s patrol: ${misses} missed, ${recovered} got back, ${flips} flips seen; left at ${lane} spots in the lane, planks gone`);
    if (bad.length) { fail(`level fifteen's room 1 crate left a dead end or cost a heart ${bad.length} time(s):`); for (const b of bad.slice(0, 5)) console.log('        ' + b); }
    if (!misses) fail('no push in (c) missed the shell — the get-back was never tried');
    // Every run ends on a flip (the one that is stomped), and each miss that
    // flipped nothing still comes round to one: at least one flip per run.
    if (flips < runs - spots.length) fail(`only ${flips} flips were seen in ${runs - spots.length} timed-push runs of level fifteen's room 1`);
    if (recovered < misses) fail(`${misses - recovered} of level fifteen's missed crates were never got back`);
  }

  // (d) Room 2 needs its charger: blind (see 1), it never dashes, the shell
  // is never flipped and the door never opens.
  {
    const blind = withEnemy(idx(m.c), { see: 1 });
    let opened = 0, won = 0;
    for (const lead of LEADS) {
      const r = watchDoor(blind, 'gate2', lead, cp[0], 40);
      if (r.won) won++;
      if (r.opened) opened++;
    }
    console.log(`   (d) a blind charger: ${won} of ${LEADS.length} finished, through room 2's door in ${opened}`);
    if (won || opened) fail("level fifteen's room 2 door opened with a charger that never dashes");
  }

  // (e) Room 3 needs popper 3's lob, and the per-presser fix. With its
  // range cut to 100 it never reaches the gap and the gate never opens. With
  // the old single `touched` flag put back on the timer (test-side: its
  // `touched` set answers `has` for any key while anything at all was
  // touching), the crate on the cap swallows the lob's hit: the lob is seen
  // in the set, and the gate still never opens. And the ball alone, popper 3
  // left out, never gets a key of its own into the timer's set; a copy whose
  // gap is 14 wider, so the ball drops into the lane beside the post, is
  // caught doing it.
  {
    const short = withEnemy(idx(m.p3), { range: 100 });
    let opened = 0, won = 0;
    for (const lead of LEADS) {
      const r = watchDoor(short, 'gate3', lead, cp[1], 40);
      if (r.won) won++;
      if (r.opened) opened++;
    }
    let swallowed = 0, flagOpened = 0, flagWon = 0;
    for (const lead of LEADS) {
      let lobSeen = false, doorSeen = false, sets = 0;
      const r = play(data, (lv) => {
        const t = room15(lv).t;
        let cur = t.touched;
        // The set already there answers as the old flag too, and every set
        // the circuits hand over after it; `sets` counts those, so the
        // emulation is seen to be in use.
        cur.has = () => cur.size > 0;
        Object.defineProperty(t, 'touched', {
          get() { return cur; },
          set(v) { cur = v; v.has = () => v.size > 0; sets++; },
        });
        const drive = route15(lv, lead);
        const k3 = room15(lv).crate3;
        const g3 = room15(lv).gate3;
        return (ball) => {
          if (ball.x - R > g3.x + g3.w) doorSeen = true;
          for (const k of cur) if (k !== k3 && k !== ball) lobSeen = true;
          return drive(ball);
        };
      }, { from: cp[1], seconds: 40 });
      if (!(sets > 0)) fail('the single-flag emulation never saw the timer\'s touched set replaced — it was not in use');
      if (lobSeen) swallowed++;
      if (r.ball.won) flagWon++;
      if (doorSeen) flagOpened++;
    }
    const noPop = without(idx(m.p3));
    const alone = (d) => {
      let pressed = 0, n = 0;
      const s3 = [
        { x: m.Xr3 - 100, y: m.floor1 - 20 - 2 * R },
        { x: m.crate3.x - R - 2, y: m.floor1 - R - 2 },
        { x: m.Xr3 + 50, y: m.roofTop - R - 2 },
        { x: m.gc, y: m.roofTop - R - 10 },
      ];
      for (const s of s3) for (const pat of patterns) {
        n++;
        let hit = false;
        play(d, (lv) => {
          const t = lv.senders.find((x) => x.kind === 'timer');
          const drive = pat();
          return (ball) => { if (t.touched.has(ball)) hit = true; return drive(ball); };
        }, { from: s, seconds: 12 });
        if (hit) pressed++;
      }
      return { pressed, n };
    };
    const real = alone(noPop);
    const wide = { ...noPop, boxes: noPop.boxes.map((b) => (b.x === m.Xr3 && b.y === m.roofTop ? { ...b, w: b.w - 14 } : b)) };
    const caught = alone(wide);
    console.log(`   (e) popper 3's range cut to 100: ${won} of ${LEADS.length} finished, through the gate in ${opened}; the old single flag: the lob was seen at the cap in ${swallowed} of ${LEADS.length}, through the gate in ${flagOpened}, ${flagWon} finished; the ball alone reached the cap in ${real.pressed} of ${real.n} tries, with the gap 14 wider in ${caught.pressed} of ${caught.n}`);
    if (won || opened) fail("level fifteen's room 3 gate opened without popper 3's lob reaching the gap");
    if (swallowed !== LEADS.length) fail(`under the old single flag the lob was seen at room 3's cap in only ${swallowed} of ${LEADS.length} runs — the swallowing was not shown`);
    if (flagOpened || flagWon) fail("under the old single flag room 3's gate still opened — the per-presser fix is not what room 3 rests on");
    if (real.pressed) fail(`the ball alone reached level fifteen's timer cap in ${real.pressed} of ${real.n} tries`);
    if (!caught.pressed) fail('a copy of level fifteen with a 14-wider gap was not caught reaching the cap — (e) proves nothing');
  }

  // (f) Room 3 needs its crate on the cap. The gate needs plate c as well as
  // the timer, and only the crate, flush against the cap, rests on c. Left
  // short by 20, 60 or 120, or never moved, the route never gets through
  // the gate (watched every step), though the lob still hits the timer. A
  // copy whose gate needs only the timer is caught getting through. And the
  // crate is no dead end: the ball can never get past it in the lane, so it
  // only ever goes right, and left anywhere down the lane the route still
  // shoves it onto the cap and finishes with no heart lost.
  {
    const shorts = [20, 60, 120, 10000];
    const tryShort = (d) => {
      let through = 0, n = 0;
      for (const push3 of shorts) for (const lead of LEADS) {
        n++;
        if (watchDoor(d, 'gate3', lead, cp[1], 40, { push3 }).opened) through++;
      }
      return { through, n };
    };
    const real = tryShort(data);
    const tOnly = { ...data, gates: data.gates.map((g) => (g.needs.includes(m.t.id) ? { ...g, needs: [m.t.id] } : g)) };
    const caught = tryShort(tOnly);
    const bad = [];
    let spots = 0;
    const flush = m.t.x - CONFIG.CIRCUIT.REACH - m.crate3.w;
    for (let x = m.Xr3 + 2; x < flush - 20; x += 40) for (const lead of LEADS) {
      spots++;
      const r = play(data, (lv) => { room15(lv).crate3.x = x; return route15(lv, lead); }, { from: cp[1], seconds: 60 });
      if (!r.ball.won || r.ball.hits > 0) bad.push(`crate left at ${x}, lead ${lead}: won=${r.ball.won} hits=${r.ball.hits} at ${r.ball.x.toFixed(0)},${r.ball.y.toFixed(0)}`);
    }
    console.log(`   (f) room 3's crate short of the cap or never moved: through the gate in ${real.through} of ${real.n}; with the gate needing only the timer, ${caught.through} of ${caught.n}; left at ${spots / LEADS.length} spots down the lane, ${spots - bad.length} of ${spots} runs finished with no heart lost`);
    if (real.through) fail(`level fifteen's room 3 gate let the ball through ${real.through} time(s) with the crate off the cap`);
    if (!caught.through) fail('a copy of level fifteen whose gate needs only the timer was not caught getting through — (f) proves nothing');
    if (bad.length) { fail(`level fifteen's room 3 crate left a dead end or cost a heart ${bad.length} time(s):`); for (const b of bad.slice(0, 5)) console.log('        ' + b); }
  }

  // (g) Room 2 needs the stomp. Plate s lies under the shell's range, and the
  // door needs it off; a flipped shell is still heavy. A route that walks
  // through the flipped shell instead of stomping it never gets through the
  // door (watched every step), though the flip is seen. A copy with the
  // plate moved out of the shell's way is caught getting through.
  {
    const noStomp = (d) => {
      let through = 0, flipped = 0;
      for (const lead of LEADS) {
        let sawFlip = false, got = false;
        play(d, (lv) => {
          const r = room15(lv), drive = route15(lv, lead, { noStomp: true });
          return (b) => { if (r.s2.state === 'flipped') sawFlip = true; if (b.x - CONFIG.BALL.R > r.gate2.x + r.gate2.w) got = true; return drive(b); };
        }, { from: cp[0], seconds: 30 });
        if (sawFlip) flipped++;
        if (got) through++;
      }
      return { through, flipped };
    };
    const real = noStomp(data);
    // The plate moved out into the yard, where nothing heavy ever stands.
    const noPlate = { ...data, senders: data.senders.map((s) => (s.id === m.plate2.id ? { ...s, x: cp[0].x } : s)) };
    const caught = noStomp(noPlate);
    console.log(`   (g) room 2 without the stomp: the shell was seen flipped in ${real.flipped} of ${LEADS.length} runs, and ${real.through} got through the door; with plate ${m.plate2.id} moved out of the shell's way, ${caught.through} of ${LEADS.length} did`);
    if (real.flipped !== LEADS.length) fail(`room 2's shell was flipped in only ${real.flipped} of ${LEADS.length} no-stomp runs — (g) measured nothing`);
    if (real.through) fail(`level fifteen's room 2 door let a ball through ${real.through} time(s) without the shell stomped`);
    if (!caught.through) fail("a copy of level fifteen with room 2's shell plate moved away was not caught letting an unstomped run through — (g) proves nothing");
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
