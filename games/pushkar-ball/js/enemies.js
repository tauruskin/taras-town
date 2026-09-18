/**
 * enemies.js — the enemy types.
 *
 * Like a spike, an enemy is NOT a collider: the ball never bounces off one,
 * it rolls into (or lands on) one and something happens — a stomp defeats
 * it, anything else costs a heart via the same `Ball.hit()` a spike already
 * calls. That is what makes a walker and a popper pure functions of level
 * time, the same trick levels.js's moving platforms already use: no physics
 * simulation needed to know where either one is at time *t*, which is what
 * lets a test assert an exact position with no browser.
 *
 * The roller is the one exception — see makeRoller's own comment. The
 * charger is written in the small state-machine shape below
 * (`enterState`/`runStates`), which every new enemy uses.
 */
import { circleHitsBox } from './hazards.js';
import { step } from './physics.js';

/**
 * Walker: paces back and forth, `x = patrolCenter + amplitude * sin(t * speed)`.
 *
 * @param e   level data: { x: patrolCenter, y, amplitude, speed? }
 * @param cfg CONFIG, handed in explicitly rather than imported, so a test can
 *            hand it a CONFIG built for the purpose if it ever needs to.
 */
export function makeWalker(e, cfg) {
  const W = cfg.ENEMY.WALKER;
  const speed = e.speed ?? W.SPEED;
  const w = {
    kind: 'walker',
    alive: true,
    r: W.R,
    x: e.x,
    y: e.y,

    /** Same signature every enemy type gets, even the ones that ignore most of it — see makeRoller. */
    update(dt, t, level, cfg) {
      w.x = e.x + e.amplitude * Math.sin(t * speed);
    },

    box() {
      return { x: w.x - w.r, y: w.y - w.r, w: w.r * 2, h: w.r * 2 };
    },

    /** A walker never throws anything. */
    activeProjectile(t) {
      return null;
    },
  };
  w.update(0, 0, null, cfg);
  return w;
}

/**
 * Popper: stationary, lobs a soft round ball on a timer. The projectile's
 * position is a closed-form parabola from its launch time — asked for
 * directly by `activeProjectile(t)`, never simulated step by step.
 *
 * @param e   level data: { x, y, dir?: 1|-1, period?, phase? }
 */
export function makePopper(e, cfg) {
  const P = cfg.ENEMY.POPPER;
  const period = e.period ?? P.PERIOD;
  const phase = e.phase || 0;
  const dir = e.dir ?? 1;
  // Time-of-flight until the projectile returns to launch height — the
  // closed-form root of `0 = -VY0*t + 0.5*GRAVITY*t^2` other than t=0.
  const flight = (2 * P.VY0) / cfg.GRAVITY;

  const p = {
    kind: 'popper',
    alive: true,
    r: P.R,
    x: e.x,
    y: e.y,

    /** A popper never moves; nothing to advance except the clock the caller already owns. */
    update(dt, t, level, cfg) {},

    box() {
      return { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
    },

    /**
     * Where the lobbed ball is at level time `t`, or null between launches.
     *
     * `cycle` is time since the most recent launch, wrapped into [0, period)
     * with a positive-modulo trick so a `t` before `phase` still gives a
     * sane answer rather than a negative cycle.
     */
    activeProjectile(t) {
      const since = t - phase;
      const cycle = ((since % period) + period) % period;
      if (cycle > flight) return null;
      return {
        x: p.x + dir * P.VX * cycle,
        y: p.y - P.VY0 * cycle + 0.5 * cfg.GRAVITY * cycle * cycle,
        r: P.PROJ_R,
      };
    },
  };
  return p;
}

/**
 * Roller: a spiky ball that rolls along the ground under real gravity and
 * ground collision — the same physics engine the player ball uses (see
 * physics.js's `step`), driven by a scripted horizontal push rather than
 * player input, reversing at the ends of its patrol range or when it hits a
 * wall.
 *
 * This is the one enemy that is NOT a pure function of level time — its
 * behaviour comes from the same real collision resolution the player ball
 * gets, which is the whole point (it behaves like a hazard that happens to
 * move, the way a ball naturally would on the level's own slopes) but also
 * means there is no closed form to test its position against. See
 * tests/offline/enemies.mjs check 4 for the weaker, still concrete proof
 * this gets instead: it stays inside its patrol range and never falls
 * through the ground.
 *
 * @param e   level data: { x, y, from, to, dir?: 1|-1 }
 */
export function makeRoller(e, cfg) {
  const R = cfg.ENEMY.ROLLER;
  const r = {
    kind: 'roller',
    alive: true,
    r: R.R,
    x: e.x,
    y: e.y,
    vx: (e.dir ?? 1) * R.SPEED,
    vy: 0,

    /**
     * @param level anything with `near(x, y, r)`, exactly what `step` itself
     *              asks for — the real Level already provides this.
     */
    update(dt, t, level, cfg) {
      if (r.x <= e.from) r.vx = Math.abs(r.vx);
      if (r.x >= e.to) r.vx = -Math.abs(r.vx);
      const contacts = step(r, level, dt, cfg);
      // A near-vertical contact normal means a wall, not the ground —
      // turn around rather than pushing uselessly into it until the patrol
      // bound above is reached, which could be a long way off.
      //
      // This assumes at most one wall-ish contact lands in a single step —
      // two in the same step would flip twice and net no reversal at all.
      // Not reachable by anything placed in a level yet (nothing puts a
      // roller near geometry narrower than its own diameter), but worth
      // knowing before a level ever does.
      for (const c of contacts) {
        if (Math.abs(c.nx) > 0.5) r.vx = -r.vx;
      }
    },

    box() {
      return { x: r.x - r.r, y: r.y - r.r, w: r.r * 2, h: r.r * 2 };
    },

    /** A roller never throws anything. */
    activeProjectile(t) {
      return null;
    },
  };
  return r;
}

/**
 * The shape every new enemy is written in: a table of named states, each an
 * `update(e, dt, level, cfg)` that returns the next state's name or nothing,
 * and optionally an `enter(e)`. `e.stateT` is seconds in the current state;
 * a timed state reads it itself.
 *
 * A state changes only on a timer or a distance check, never at random —
 * the same situation plays out the same way every time, which is what lets a
 * child learn it and Node test it.
 */
export function enterState(e, states, name) {
  e.state = name;
  e.stateT = 0;
  if (states[name].enter) states[name].enter(e);
}

/** One step of a state machine: age the state, ask it, and change if told to. */
export function runStates(e, states, dt, level, cfg) {
  e.stateT += dt;
  const next = states[e.state].update(e, dt, level, cfg);
  if (next && next !== e.state) enterState(e, states, next);
}

/**
 * Move a charger one step through the real physics, like the roller, and
 * report the contact in front of it, if any — something with a near-vertical
 * normal pointing back at it. Also keeps `grounded`, which the wiring reads.
 */
function stepCharger(c, level, dt, cfg) {
  const contacts = step(c, level, dt, cfg);
  c.grounded = contacts.some((k) => k.ny < -0.5);
  return contacts.find((k) => Math.abs(k.nx) > 0.5 && Math.sign(k.nx) === -c.dir) || null;
}

/** Is the ball on this charger's level, in front of it, and within SEE? */
function sees(c, level, K) {
  const b = level && level.ball;
  if (!b || b.dying) return false;
  const dx = b.x - c.x;
  return Math.sign(dx) === c.dir && Math.abs(dx) < K.SEE && Math.abs(b.y - c.y) < K.LEVEL_TOL;
}

const CHARGER = {
  patrol: {
    update(c, dt, level, cfg) {
      const K = cfg.ENEMY.CHARGER;
      if (c.x <= c.from) c.dir = 1;
      if (c.x >= c.to) c.dir = -1;
      if (sees(c, level, K)) return 'windup';
      c.vx = c.dir * K.PATROL_SPEED;
      // Anything solid in front turns it round — planks included: only a
      // charge breaks wood.
      if (stepCharger(c, level, dt, cfg)) c.dir = -c.dir;
    },
  },
  windup: {
    enter(c) { c.vx = 0; },
    update(c, dt, level, cfg) {
      c.vx = 0;
      stepCharger(c, level, dt, cfg);
      if (c.stateT >= cfg.ENEMY.CHARGER.WINDUP) return 'charge';
    },
  },
  charge: {
    update(c, dt, level, cfg) {
      c.vx = c.dir * cfg.ENEMY.CHARGER.CHARGE_SPEED;
      const hit = stepCharger(c, level, dt, cfg);
      // Never past the end of its range. levels.mjs proves there is ground
      // under all of it, which is what "never charges off a ledge" rests on.
      const end = c.dir > 0 ? c.to : c.from;
      if (c.dir > 0 ? c.x >= end : c.x <= end) {
        c.x = end;
        return 'dazed';
      }
      if (!hit) return;
      const owner = hit.seg.owner;
      if (owner && owner.breakable) {
        level.breakWood(owner);
        return;
      }
      if (owner && owner.movable) {
        c.shoving = owner;
        c.shoveLeft = cfg.ENEMY.CHARGER.CRATE_SHOVE;
      }
      return 'dazed';
    },
  },
  dazed: {
    enter(c) { c.vx = 0; },
    update(c, dt, level, cfg) {
      c.vx = 0;
      stepCharger(c, level, dt, cfg);
      // A crate it ran into slides on a little, at a crate's own push speed,
      // through the crate's own tryPush — which refuses anything that would
      // put it inside something, so a shove can never wedge a crate.
      if (c.shoving) {
        const moved = c.shoving.tryPush(c.dir * cfg.CRATE.PUSH_SPEED * dt, dt, level.solidsFor(c.shoving), cfg);
        c.shoveLeft -= Math.abs(moved);
        if (!moved || c.shoveLeft <= 0) c.shoving = null;
      }
      if (c.stateT >= cfg.ENEMY.CHARGER.DAZED) return 'patrol';
    },
  },
  popped: {
    enter(c) { c.vx = 0; c.vy = 0; c.shoving = null; },
    update(c, dt, level, cfg) {
      const K = cfg.ENEMY.CHARGER;
      if (c.stateT < K.RETURN) return;
      // Never back on top of him: it waits for the ball to be out of sight
      // of home.
      const b = level && level.ball;
      if (b && Math.abs(b.x - c.home.x) < K.SEE && Math.abs(b.y - c.home.y) < K.SEE) return;
      c.x = c.home.x; c.y = c.home.y;
      c.dir = c.home.dir;
      c.alive = true;
      c.returnT = K.PUFF_TIME;
      return 'patrol';
    },
  },
};

/**
 * Charger: patrols, notices the ball in front of it, winds up, charges in a
 * straight line until it meets something, and sits dazed. See the spec,
 * docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md.
 *
 * Moves through the real physics, like the roller, so gates, stone, crates
 * and slopes stop it with no special case. Hurts on any contact except while
 * dazed; can be stomped only while dazed; a popped one comes back.
 *
 * @param e   level data: { x, y, from, to, dir?: 1|-1 } — x, y is home
 */
export function makeCharger(e, cfg) {
  const K = cfg.ENEMY.CHARGER;
  const c = {
    kind: 'charger',
    alive: true,
    r: K.R,
    x: e.x,
    y: e.y,
    vx: 0,
    vy: 0,
    dir: e.dir ?? 1,
    from: e.from,
    to: e.to,
    home: { x: e.x, y: e.y, dir: e.dir ?? 1 },
    grounded: false,
    shoving: null,
    shoveLeft: 0,
    returnT: 0,          // cosmetic: its return puff
    state: 'patrol',
    stateT: 0,

    // What Level.update and the hit rules ask of any enemy that uses the
    // world. The roadmap's "holds a plate while dazed" is `heavy`.
    presses: true,
    get heavy() { return c.state === 'dazed'; },
    get stompable() { return c.state === 'dazed'; },
    get harmless() { return c.state === 'dazed'; },

    update(dt, t, level, cfg) {
      // stompEnemy only ever sets `alive`; the machine notices.
      if (!c.alive && c.state !== 'popped') enterState(c, CHARGER, 'popped');
      c.returnT = Math.max(0, c.returnT - dt);
      runStates(c, CHARGER, dt, level, cfg);
    },

    box() {
      return { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 };
    },

    /** A charger never throws anything. */
    activeProjectile(t) {
      return null;
    },
  };
  return c;
}

/**
 * Which alive enemy this body is touching, or null.
 *
 * One question for a whole level's enemies, the same shape `spikeHit` in
 * hazards.js already gives for spikes — `levels.js`'s `stompEnemy` and
 * `hazardKnockDir` both build on this rather than looping enemies twice.
 */
export function enemyHit(body, enemies) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (circleHitsBox(body.x, body.y, body.r, e.box())) return e;
  }
  return null;
}

/** Which alive enemy's active projectile this body is touching, or null. */
export function projectileHit(body, enemies, t) {
  for (const e of enemies) {
    if (!e.alive) continue;
    const proj = e.activeProjectile(t);
    if (!proj) continue;
    const box = { x: proj.x - proj.r, y: proj.y - proj.r, w: proj.r * 2, h: proj.r * 2 };
    if (circleHitsBox(body.x, body.y, body.r, box)) return proj;
  }
  return null;
}

/**
 * Draw every alive enemy, and any popper's active projectile.
 *
 * Called inside the world transform, so everything here is in world units —
 * the same calling convention `drawSpikes` in hazards.js already uses.
 * Projectiles are drawn in their own pass, after every enemy body, so one
 * always sits on top of the popper that threw it rather than under it.
 */
export function drawEnemies(ctx, enemies, time, cfg) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.kind === 'popper') drawPopper(ctx, e, cfg);
    else drawSpikyBody(ctx, e, cfg);
  }
  for (const e of enemies) {
    if (!e.alive || e.kind !== 'popper') continue;
    const p = e.activeProjectile(time);
    if (p) drawProjectile(ctx, p, cfg);
  }
}

/** A walker or a roller: a ring of spikes around a angry face. */
function drawSpikyBody(ctx, e, cfg) {
  const C = cfg.COLOURS;
  const n = 8; // spikes around the rim
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.5) / n) * Math.PI * 2;
    ctx.lineTo(e.x + Math.cos(a0) * e.r, e.y + Math.sin(a0) * e.r);
    ctx.lineTo(e.x + Math.cos(a1) * e.r * 1.5, e.y + Math.sin(a1) * e.r * 1.5);
  }
  ctx.closePath();
  ctx.fillStyle = C.ENEMY;
  ctx.fill();
  ctx.strokeStyle = C.ENEMY_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();

  drawAngryFace(ctx, e.x, e.y, e.r * 0.5, cfg);
}

/** A popper: a squat body with two short horns, facing whichever way it throws. */
function drawPopper(ctx, e, cfg) {
  const C = cfg.COLOURS;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  ctx.fillStyle = C.ENEMY;
  ctx.fill();
  ctx.strokeStyle = C.ENEMY_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Two short horns on top — the shape difference from drawSpikyBody's full
  // ring of spikes is what tells a popper apart from a walker at a glance.
  ctx.beginPath();
  ctx.moveTo(e.x - e.r * 0.5, e.y - e.r * 0.8);
  ctx.lineTo(e.x - e.r * 0.3, e.y - e.r * 1.4);
  ctx.lineTo(e.x - e.r * 0.1, e.y - e.r * 0.8);
  ctx.moveTo(e.x + e.r * 0.5, e.y - e.r * 0.8);
  ctx.lineTo(e.x + e.r * 0.3, e.y - e.r * 1.4);
  ctx.lineTo(e.x + e.r * 0.1, e.y - e.r * 0.8);
  ctx.closePath();
  ctx.fillStyle = C.ENEMY_EDGE;
  ctx.fill();

  drawAngryFace(ctx, e.x, e.y, e.r * 0.5, cfg);
}

/**
 * Narrowed eyes and a strip of bared teeth — the "sharper, still unarmed"
 * look every enemy shares. Shape and expression only, never a held object,
 * per CLAUDE.md's narrow exception for this game's older audience.
 */
function drawAngryFace(ctx, cx, cy, s, cfg) {
  const C = cfg.COLOURS;
  ctx.fillStyle = C.ENEMY_EYE;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * s * 0.2, cy - s * 0.5);
    ctx.lineTo(cx + side * s * 0.9, cy - s * 0.2);
    ctx.lineTo(cx + side * s * 0.9, cy - s * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  const teeth = 4;
  for (let i = 0; i <= teeth; i++) {
    const x = cx - s * 0.6 + (i / teeth) * s * 1.2;
    const y = cy + s * 0.3 + (i % 2 === 0 ? 0 : s * 0.3);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(cx + s * 0.6, cy + s * 0.15);
  ctx.lineTo(cx - s * 0.6, cy + s * 0.15);
  ctx.closePath();
  ctx.fill();
}

/** A popper's lobbed ball — steel, the same as a spike, not a shaped weapon. */
function drawProjectile(ctx, p, cfg) {
  const C = cfg.COLOURS;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = C.SPIKE;
  ctx.fill();
  ctx.strokeStyle = C.SPIKE_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();
}
