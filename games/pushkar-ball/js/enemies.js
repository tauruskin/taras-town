/**
 * enemies.js — the enemy types.
 *
 * Like a spike, an enemy is NOT a collider: the ball never bounces off one,
 * it rolls into (or lands on) one and something happens — a stomp defeats
 * it, anything else costs a heart via the same `Ball.hit()` a spike already
 * calls. That is what makes a walker and a fixed popper pure functions of level
 * time, the same trick levels.js's moving platforms already use: no physics
 * simulation needed to know where either one is at time *t*, which is what
 * lets a test assert an exact position with no browser.
 *
 * The roller is the one exception — see makeRoller's own comment. The
 * charger is written in the small state-machine shape below
 * (`enterState`/`runStates`), which every new enemy uses.
 */
import { circleHitsBox } from './hazards.js';
import { segmentHitsBox, step } from './physics.js';

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

const POPPER_FIXED = {
  // A timed popper has one state: its lob is a pure function of level time,
  // asked for directly by activeProjectile(t). This is level two's popper,
  // which keeps the lob it was tuned against through `fixed: true`.
  timed: { update() {} },
};

/** Is the ball in front of this aimed popper, within its range, near its height? */
function popperSees(p, level, P) {
  const b = level && level.ball;
  if (!b || b.dying) return false;
  const dx = b.x - p.x;
  return Math.sign(dx) === p.dir && Math.abs(dx) <= p.range && Math.abs(b.y - p.y) < P.LEVEL_TOL;
}

/**
 * The launch velocity that carries a lob from just above the popper to its
 * locked target in exactly FLIGHT seconds. The aim arc and the lob both ask
 * this, so the arc he is warned with is the arc that flies.
 */
function lobVelocity(p, cfg) {
  const F = cfg.ENEMY.POPPER.FLIGHT;
  const x0 = p.x, y0 = p.y - p.r;
  return { x0, y0, vx: (p.target.x - x0) / F, vy: (p.target.y - y0 - 0.5 * cfg.GRAVITY * F * F) / F };
}

/** The lob's position `s` seconds after launch: closed form, never integrated. */
function lobAt(p, s, cfg) {
  const L = p.lob;
  return { x: L.x0 + L.vx * s, y: L.y0 + L.vy * s + 0.5 * cfg.GRAVITY * s * s, r: cfg.ENEMY.POPPER.PROJ_R };
}

const POPPER_AIMED = {
  idle: {
    // The target is locked the moment it sees the ball, on the step it starts
    // aiming, and never moves after: the arc he sees is the arc that flies.
    // Never behind itself, never past its range.
    update(p, dt, level, cfg) {
      if (!popperSees(p, level, cfg.ENEMY.POPPER)) return;
      const b = level.ball;
      const reach = Math.min(Math.abs(b.x - p.x), p.range);
      p.target = { x: p.x + p.dir * reach, y: b.y };
      return 'aim';
    },
  },
  aim: {
    update(p, dt, level, cfg) { if (p.stateT >= cfg.ENEMY.POPPER.AIM) return 'fire'; },
  },
  fire: {
    enter(p) { p.lob = null; },
    update(p, dt, level, cfg) {
      if (!p.lob) {
        // `shot` is this lob's presser key, made once per shot: a button
        // sees one hit per lob, never a fresh one every step.
        p.lob = { ...lobVelocity(p, cfg), shot: {} };
      }
      const q = lobAt(p, p.stateT, cfg);
      p.lobNow = q;
      // Ends at the first solid thing it meets, past the target or not.
      // Planks break; anything else just stops it. Nothing here is random, so
      // where a lob ends depends only on where it was aimed.
      const bx = q.x - q.r, by = q.y - q.r, w = q.r * 2;
      const hit = level.near(q.x, q.y, q.r * 2).find((s) => segmentHitsBox(s, bx, by, w, w));
      if (hit || q.y > level.bounds.h) {
        if (hit && hit.owner && hit.owner.breakable && !hit.owner.broken) level.breakWood(hit.owner);
        return 'reload';
      }
    },
  },
  reload: {
    enter(p) { p.target = null; },
    update(p, dt, level, cfg) {
      // The lob's last position (the one that touched something) stays a
      // presser on the step fire ends AND on this state's first step, under
      // the same `shot` key — still one hit — so a lob ending against a
      // button's post counts as having touched its cap. (Fire's first sample
      // is at s = dt, since runStates ages a state before asking it.)
      if (p.stateT > dt * 1.5) p.lobNow = null;
      if (p.stateT >= cfg.ENEMY.POPPER.RELOAD) return 'idle';
    },
  },
};

/**
 * Popper: stationary, and one of two kinds.
 *
 * A fixed popper (`fixed: true`, level two's) lobs a soft round ball on a
 * timer. Its projectile is a closed-form parabola from its launch time,
 * asked for directly by `activeProjectile(t)`, never simulated step by step;
 * its one-state machine has nothing to do but age.
 *
 * An aimed popper (no `fixed`) waits until the ball is in front of it within
 * its `range`, locks the spot where the ball was, draws the dotted arc to it
 * for AIM seconds, then lobs onto exactly that arc. The lob ends at the
 * first solid thing it meets, breaking planks, and presses a button it hits
 * (Level.update puts it among the pressers). `activeProjectile` ignores `t`
 * for it: an aimed lob belongs to the machine, not the clock.
 *
 * @param e   level data: { x, y, dir?: 1|-1, fixed?, period?, phase?, range? }
 */
export function makePopper(e, cfg) {
  const P = cfg.ENEMY.POPPER;
  const dir = e.dir ?? 1;
  if (!e.fixed) {
    const p = {
      kind: 'popper', alive: true, r: P.R, x: e.x, y: e.y, dir,
      fixed: false,
      // How far ahead it notices and can reach: the level's, else CONFIG's.
      // Ask the loaded popper, never the config (levels.mjs does).
      range: e.range ?? P.RANGE,
      target: null, lob: null, lobNow: null,
      // Its body presses nothing and blocks nothing; its lob presses, through
      // its own loop in Level.update.
      presses: false, blocks: false,
      state: 'idle', stateT: 0,
      update(dt, t, level, cfg) { runStates(p, POPPER_AIMED, dt, level, cfg); },
      /** Back to sleep, with nothing aimed and nothing in flight. Called on every respawn. */
      reset() {
        p.state = 'idle'; p.stateT = 0;
        p.target = null; p.lob = null; p.lobNow = null;
      },
      box() { return { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }; },
      /** The lob in flight, or null. Ignores `t`: an aimed lob is the machine's, not the clock's. */
      activeProjectile() { return p.state === 'fire' ? p.lobNow : null; },
    };
    return p;
  }

  const period = e.period ?? P.PERIOD;
  const phase = e.phase || 0;
  // Time-of-flight until the projectile returns to launch height — the
  // closed-form root of `0 = -VY0*t + 0.5*GRAVITY*t^2` other than t=0.
  const flight = (2 * P.VY0) / cfg.GRAVITY;

  const p = {
    kind: 'popper',
    alive: true,
    r: P.R,
    x: e.x,
    y: e.y,
    dir,
    fixed: true,
    presses: false,
    blocks: false,
    state: 'timed',
    stateT: 0,

    /** A fixed popper never moves; its state machine has nothing to do but age. */
    update(dt, t, level, cfg) { runStates(p, POPPER_FIXED, dt, level, cfg); },

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
 * A state changes only on a timer, a distance check or a contact, never at
 * random — the same situation plays out the same way every time, which is
 * what lets a child learn it and Node test it.
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

/** Is the ball on this charger's level, in front of it, and within its sight? */
function sees(c, level, K) {
  const b = level && level.ball;
  if (!b || b.dying) return false;
  const dx = b.x - c.x;
  return Math.sign(dx) === c.dir && Math.abs(dx) < c.see && Math.abs(b.y - c.y) < K.LEVEL_TOL;
}

const CHARGER = {
  patrol: {
    update(c, dt, level, cfg) {
      const K = cfg.ENEMY.CHARGER;
      if (c.x <= c.from) c.dir = 1;
      if (c.x >= c.to) c.dir = -1;
      if (sees(c, level, K)) return 'windup';
      // A shell in front turns it, as a wall would: only a charge flips one.
      const shell = touching(c, level, 'shell');
      if (shell && Math.sign(shell.x - c.x) === c.dir) c.dir = -c.dir;
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
      // A charge into a shell flips it, and stops the charger as stone would.
      // A shell already flipped is not in the way: a charge passes through
      // it harmlessly, as it would through any enemy.
      const shell = touching(c, level, 'shell');
      if (shell && shell.state === 'patrol' && Math.sign(shell.x - c.x) === c.dir) {
        shell.flip(c.dir);
        return 'dazed';
      }
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
      // Never back on top of him. A keep-away box round home, not a sight
      // line: `sees` splits the axes (sight across, LEVEL_TOL up and down)
      // because it asks what the charger can notice, and this asks whether it
      // is about to appear on top of him, which has no front or back. Its own
      // `see` on both axes, so a level that widens a charger's reach widens
      // the room it gives him too. And never back inside a crate sitting on
      // its home: homeClear refuses that too.
      if (!homeClear(c, level, c.see)) return;
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
 * @param e   level data: { x, y, from, to, dir?: 1|-1, see? } — x, y is home
 */
export function makeCharger(e, cfg) {
  const K = cfg.ENEMY.CHARGER;
  const c = {
    kind: 'charger',
    popShade: { fill: 'CHARGER_POP', edge: 'CHARGER_POP_EDGE' },
    alive: true,
    r: K.R,
    x: e.x,
    y: e.y,
    vx: 0,
    vy: 0,
    dir: e.dir ?? 1,
    from: e.from,
    to: e.to,
    // How far ahead it notices the ball. CONFIG's SEE unless the level says
    // otherwise: a charger whose yard is wider than the default sight can be
    // given enough to watch the whole of it, so a ball that misses the door is
    // noticed where it stands instead of having to find a sight line nothing
    // on screen shows.
    see: e.see ?? K.SEE,
    home: { x: e.x, y: e.y, dir: e.dir ?? 1 },
    grounded: false,
    shoving: null,
    shoveLeft: 0,
    returnT: 0,          // cosmetic: its return puff
    state: 'patrol',
    stateT: 0,

    // What Level.update and the hit rules ask of any enemy that uses the
    // world. The roadmap's "holds a plate while dazed" is `heavy`.
    // Two separate questions: does it press buttons (and weigh plates), and
    // does a closing gate refuse to come down on it. A charger does both.
    presses: true,
    blocks: true,
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
 * May a popped enemy reappear at home? Not with the ball within `clear` on
 * either axis, and not inside a crate sitting there — both would put it on
 * top of something.
 */
function homeClear(e, level, clear) {
  const b = level && level.ball;
  if (b && Math.abs(b.x - e.home.x) < clear && Math.abs(b.y - e.home.y) < clear) return false;
  const h = { x: e.home.x - e.r, y: e.home.y - e.r, w: e.r * 2, h: e.r * 2 };
  return !((level && level.crates) || []).some((c) => c.x < h.x + h.w && c.x + c.w > h.x && c.y < h.y + h.h && c.y + c.h > h.y);
}

/** Another alive enemy of `kind` overlapping this one's box, if any. */
function touching(e, level, kind) {
  const a = e.box();
  return ((level && level.enemies) || []).find((o) => {
    if (o === e || !o.alive || o.kind !== kind) return false;
    const b = o.box();
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  });
}

/** Move a shell one step through the real physics; true if something solid is in front of it. */
function stepShell(s, level, dt, cfg) {
  const contacts = step(s, level, dt, cfg);
  s.grounded = contacts.some((k) => k.ny < -0.5);
  return contacts.some((k) => Math.abs(k.nx) > 0.5 && Math.sign(k.nx) === -s.dir);
}

/**
 * A crate falling onto this shell fast enough to flip it, if any. Crates
 * update before enemies in Level.update, so a crate on its landing step has
 * already had its vy zeroed — but it overlaps the shell's box, still falling,
 * on the steps before that, and that is when this sees it.
 */
function fallingCrateOn(s, level, S) {
  const a = s.box();
  return ((level && level.crates) || []).find((c) => c.vy >= S.FLIP_VY &&
    c.x < a.x + a.w && c.x + c.w > a.x && c.y + c.h > a.y && c.y < a.y + a.h);
}

const SHELL = {
  patrol: {
    update(s, dt, level, cfg) {
      const S = cfg.ENEMY.SHELL;
      const crate = fallingCrateOn(s, level, S);
      if (crate) { s.flip(s.x >= crate.x + crate.w / 2 ? 1 : -1); return; }
      if (s.x <= s.from) s.dir = 1;
      if (s.x >= s.to) s.dir = -1;
      s.vx = s.dir * S.PATROL_SPEED;
      // Anything solid in front turns it — a button's post included, which is
      // why a shell never presses buttons — and so does a charger it meets
      // walking. Only a charge flips it.
      const other = touching(s, level, 'charger');
      const blocked = stepShell(s, level, dt, cfg);
      if (blocked || (other && Math.sign(other.x - s.x) === s.dir && other.state !== 'charge')) s.dir = -s.dir;
    },
  },
  flipped: {
    update(s, dt, level, cfg) {
      const S = cfg.ENEMY.SHELL;
      s.vx = s.stateT < S.KICK_TIME ? s.kick * S.KICK : 0;
      // The kick never carries it out of its own range: levels.mjs proves
      // ground under the range, and nothing past it. A kick whose next step
      // would leave the range is spent there.
      const nx = s.x + s.vx * dt;
      if (nx < s.from || nx > s.to) { s.kick = 0; s.vx = 0; }
      stepShell(s, level, dt, cfg);
      // Backstop only: the line above should already have kept it inside.
      s.x = Math.min(s.to, Math.max(s.from, s.x));
      if (s.stateT >= S.FLIPPED) { s.kick = 0; return 'patrol'; }
    },
  },
  popped: {
    enter(s) { s.vx = 0; s.vy = 0; s.kick = 0; },
    update(s, dt, level, cfg) {
      const S = cfg.ENEMY.SHELL;
      if (s.stateT < S.RETURN) return;
      if (!homeClear(s, level, S.RETURN_CLEAR)) return;
      s.x = s.home.x; s.y = s.home.y; s.dir = s.home.dir;
      s.alive = true;
      s.returnT = S.PUFF_TIME;
      return 'patrol';
    },
  },
};

/**
 * Shell: armoured, slow, and heavy. Cannot be stomped upright; flipped by a
 * falling crate or a charger's dash, it lies harmless and stompable for
 * FLIPPED seconds, then rights itself. A popped one comes back. See the spec,
 * docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md.
 *
 * Not a collider: a crate that flips it lands on the floor through it, and
 * the shell is kicked out from under, through the real physics.
 *
 * @param e   level data: { x, y, from, to, dir?: 1|-1 } — x, y is home
 */
export function makeShell(e, cfg) {
  const S = cfg.ENEMY.SHELL;
  const s = {
    kind: 'shell',
    popShade: { fill: 'SHELL_POP', edge: 'SHELL_POP_EDGE' },
    alive: true,
    r: S.R,
    x: e.x,
    y: e.y,
    vx: 0,
    vy: 0,
    dir: e.dir ?? 1,
    from: e.from,
    to: e.to,
    home: { x: e.x, y: e.y, dir: e.dir ?? 1 },
    grounded: false,
    kick: 0,             // -1, 0 or 1: which way a flip knocked it
    returnT: 0,          // cosmetic: its return puff
    state: 'patrol',
    stateT: 0,

    // Weight, not buttons: it holds plates in every state it is there for
    // (Level.update skips it while popped), and a gate never closes on it;
    // it turns at a button's post.
    presses: false,
    blocks: true,
    heavy: true,
    get stompable() { return s.state === 'flipped'; },
    get harmless() { return s.state === 'flipped'; },

    /** Knocked onto its back. `dir` is which way it is kicked: -1, 1, or 0 for not at all. */
    flip(dir) {
      if (!s.alive || s.state === 'flipped') return;
      s.kick = dir;
      enterState(s, SHELL, 'flipped');
    },

    /**
     * A respawn: home, upright, patrolling, alive, nothing carried over —
     * not a kick, not a fall speed, not a return puff.
     */
    reset() {
      s.x = s.home.x; s.y = s.home.y; s.dir = s.home.dir;
      s.vx = 0; s.vy = 0;
      s.kick = 0;
      s.alive = true;
      s.grounded = false;
      s.returnT = 0;
      enterState(s, SHELL, 'patrol');
    },

    update(dt, t, level, cfg) {
      // stompEnemy only ever sets `alive`; the machine notices.
      if (!s.alive && s.state !== 'popped') enterState(s, SHELL, 'popped');
      s.returnT = Math.max(0, s.returnT - dt);
      runStates(s, SHELL, dt, level, cfg);
    },

    box() {
      return { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
    },

    /** A shell never throws anything. */
    activeProjectile(t) {
      return null;
    },
  };
  return s;
}

/**
 * Which alive enemy this body is touching, or null.
 *
 * One question for a whole level's enemies, the same shape `spikeHit` in
 * hazards.js already gives for spikes — `levels.js`'s `hazardKnockDir` builds on
 * this. (`stompEnemy` asks for every enemy touched, not the first, so it
 * tests each box itself.)
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
    else if (e.kind === 'charger') drawCharger(ctx, e, time, cfg);
    else if (e.kind === 'shell') drawShell(ctx, e, time, cfg);
    else drawSpikyBody(ctx, e, cfg);
  }
  for (const e of enemies) {
    if (!e.alive || e.kind !== 'popper' || e.state !== 'aim' || !e.target) continue;
    drawAimArc(ctx, e, cfg);
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
 * A charger: a low, wide body with two horns pointing the way it faces, a
 * heavy brow and the shared angry face — a different silhouette from the
 * walker's ring of spikes, so the two never read as the same thing.
 *
 * The pose is the warning, and there is no text: a crouch, a pawing foot and
 * dust for the wind-up; a lean and streaks for the charge; a wobble and
 * stars for dazed, the stars going one by one as the daze runs out. Nothing
 * held, nothing thrown.
 */
function drawCharger(ctx, e, time, cfg) {
  const C = cfg.COLOURS, K = cfg.ENEMY.CHARGER;
  const r = e.r, d = e.dir;
  const feet = e.y + r;
  let squash = 1, lean = 0, paw = 0;
  // The wind-up's 0.82 squash is also what tests/browser/chargers.mjs sees
  // the crouch by: it takes the body-colour count to about 0.8 of a standing
  // charger's, under that suite's 0.9 threshold. Squash less than about 0.88
  // and the suite has to be told.
  if (e.state === 'windup') { squash = 0.82; paw = Math.sin(e.stateT * 28) * r * 0.25; }
  if (e.state === 'charge') lean = 0.22;
  if (e.state === 'dazed') lean = Math.sin(time * 9) * 0.12;

  // Behind the body: dust while winding up, streaks while charging.
  if (e.state === 'windup') {
    ctx.fillStyle = C.CHARGER_DUST;
    for (let i = 0; i < 3; i++) {
      const grow = (e.stateT * 3 + i / 3) % 1;
      ctx.beginPath();
      ctx.arc(e.x - d * (r * 1.1 + grow * r), feet - r * 0.2 - grow * r * 0.5, r * (0.18 + 0.2 * grow), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (e.state === 'charge') {
    ctx.strokeStyle = C.CHARGER_DUST;
    ctx.lineWidth = 4;
    for (const k of [0.3, 0.8, 1.3]) {
      ctx.beginPath();
      ctx.moveTo(e.x - d * r * 1.4, feet - r * k);
      ctx.lineTo(e.x - d * r * 2.4, feet - r * k);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(e.x, feet);
  // Any lean turns about the foot on the side that goes down — the front
  // foot for a charge's nose-down lean, either foot as the daze wobbles —
  // never about the middle: turned about the middle, the charge's lean
  // pushed the front leg through the ground. A positive turn lowers the +x
  // side, so the sign of the turn picks the foot.
  const pivot = Math.sign(lean * d) * r * 0.75;
  ctx.translate(pivot, 0);
  ctx.rotate(lean * d);
  ctx.translate(-pivot, 0);
  ctx.scale(d, squash);           // draw facing right; the scale mirrors it

  // Stubby legs, the front one pawing during the wind-up.
  ctx.fillStyle = C.CHARGER_EDGE;
  ctx.fillRect(-r * 0.8, -r * 0.35, r * 0.4, r * 0.35);
  ctx.fillRect(r * 0.35 + paw, -r * 0.35, r * 0.4, r * 0.35);

  // A low dome of a body, wider than it is tall.
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.35, r * 1.2, r * 1.2, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = C.CHARGER_BODY;
  ctx.fill();
  ctx.strokeStyle = C.CHARGER_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Two horns out of the front of the head, pointing forward. The brow's
  // fillRect below shares this fill style.
  ctx.fillStyle = C.CHARGER_EDGE;
  for (const up of [0.95, 0.6]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -r * up - r * 0.12);
    ctx.lineTo(r * 1.55, -r * up - r * 0.35);
    ctx.lineTo(r * 0.75, -r * up + r * 0.14);
    ctx.closePath();
    ctx.fill();
  }

  // A heavy brow over the face.
  ctx.fillRect(r * 0.05, -r * 1.12, r * 0.95, r * 0.16);
  ctx.restore();

  // The shared face, drawn unmirrored so it never reads backwards, pushed
  // towards the front.
  drawAngryFace(ctx, e.x + d * r * 0.5, feet - r * 0.8 * squash, r * 0.42, cfg);

  // Dazed: stars round its head, one fewer each third of the daze.
  if (e.state === 'dazed') {
    const left = Math.ceil(3 * (1 - e.stateT / K.DAZED));
    ctx.fillStyle = C.CHARGER_STAR;
    for (let i = 0; i < left; i++) {
      const a = time * 3 + (i / 3) * Math.PI * 2;
      drawStar(ctx, e.x + Math.cos(a) * r * 0.9, feet - r * 1.9 + Math.sin(a) * r * 0.25, r * 0.28);
    }
  }

  // Coming back: a puff that swells and fades.
  if (e.returnT > 0) {
    const f = 1 - e.returnT / K.PUFF_TIME;
    ctx.globalAlpha = 1 - f;
    ctx.fillStyle = C.CHARGER_DUST;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * r * (0.6 + f), e.y + Math.sin(a) * r * (0.6 + f), r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * A shell: a shiny armoured dome with a jagged rim and narrowed eyes peering
 * from a pale head under its front edge. Flipped, the dome is upside down,
 * its pale belly up, four stubby legs wave in the air, and stars circle it,
 * one fewer each quarter of the flip. Nothing held, nothing thrown.
 */
function drawShell(ctx, e, time, cfg) {
  const C = cfg.COLOURS, S = cfg.ENEMY.SHELL;
  const r = e.r, d = e.dir;
  const feet = e.y + r;
  const flipped = e.state === 'flipped';

  ctx.save();
  if (flipped) {
    // Upside down: the dome's crown rests on the ground, rocking a little,
    // and its pale belly faces the sky with four legs waving off it.
    ctx.translate(e.x, feet - r * 1.05);
    ctx.rotate(Math.sin(time * 6) * 0.12);
    ctx.strokeStyle = C.SHELL_EDGE;
    ctx.lineWidth = r * 0.22;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const lx = -r * 0.75 + i * r * 0.5;
      const wave = Math.sin(time * 12 + i * 1.7) * r * 0.25;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx + wave, -r * 0.6);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.scale(1, -1);
  } else {
    ctx.translate(e.x, feet - r * 0.3);
    ctx.scale(d, 1);
    // A head poking out under the front rim, pale so the face on it reads.
    ctx.beginPath();
    ctx.ellipse(r * 1.0, -r * 0.15, r * 0.55, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.SHELL_SHINE;
    ctx.fill();
    ctx.strokeStyle = C.SHELL_EDGE;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The dome.
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 1.05, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = C.SHELL_BODY;
  ctx.fill();
  ctx.strokeStyle = C.SHELL_EDGE;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Armour plates: two curved seams across the dome.
  ctx.lineWidth = 2;
  for (const k of [-0.4, 0.4]) {
    ctx.beginPath();
    ctx.moveTo(r * k * 1.6, 0);
    ctx.quadraticCurveTo(r * k * 0.9, -r * 0.7, 0, -r * 1.05);
    ctx.stroke();
  }

  if (flipped) {
    // The belly: a pale flat plate across the open side.
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.SHELL_SHINE;
    ctx.fill();
    ctx.strokeStyle = C.SHELL_EDGE;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // A jagged rim: six teeth pointing down along its edge.
    ctx.fillStyle = C.SHELL_EDGE;
    for (let i = 0; i < 6; i++) {
      const x0 = -r * 1.15 + i * (r * 2.3 / 6);
      ctx.beginPath();
      ctx.moveTo(x0, -1);
      ctx.lineTo(x0 + r * 2.3 / 12, r * 0.3);
      ctx.lineTo(x0 + r * 2.3 / 6, -1);
      ctx.closePath();
      ctx.fill();
    }
  }

  // The shine: a curved highlight high on the dome, toward the back.
  ctx.strokeStyle = C.SHELL_SHINE;
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.8, r * 0.72, 0, Math.PI * 1.18, Math.PI * 1.45);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.restore();

  // Upright: the shared face on the head under the front rim, unmirrored.
  if (!flipped) drawAngryFace(ctx, e.x + d * r * 1.05, feet - r * 0.45, r * 0.5, cfg);

  // Flipped: stars circling it, one fewer each quarter of the flip.
  if (flipped) {
    const left = Math.ceil(4 * (1 - e.stateT / S.FLIPPED));
    ctx.fillStyle = C.CHARGER_STAR;
    for (let i = 0; i < left; i++) {
      const a = time * 3 + (i / 4) * Math.PI * 2;
      drawStar(ctx, e.x + Math.cos(a) * r * 1.1, feet - r * 2.1 + Math.sin(a) * r * 0.25, r * 0.26);
    }
  }

  // Coming back: a puff that swells and fades.
  if (e.returnT > 0) {
    const f = 1 - e.returnT / S.PUFF_TIME;
    ctx.globalAlpha = 1 - f;
    ctx.fillStyle = C.SHELL_POP;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * r * (0.6 + f), e.y + Math.sin(a) * r * (0.6 + f), r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** A five-pointed cartoon star. */
function drawStar(ctx, cx, cy, s) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 === 0 ? s : s * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
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

/**
 * The warning: dots along exactly the curve the lob will fly, from the popper
 * to the spot it locked. Drawn for the whole AIM, so nothing an aimed popper
 * throws is ever a surprise.
 */
function drawAimArc(ctx, p, cfg) {
  const F = cfg.ENEMY.POPPER.FLIGHT;
  const L = lobVelocity(p, cfg);
  ctx.save();
  const P = cfg.ENEMY.POPPER, N = P.ARC_DOTS;
  ctx.fillStyle = cfg.COLOURS.POPPER_ARC;
  ctx.strokeStyle = cfg.COLOURS.POPPER_ARC_EDGE;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = P.ARC_ALPHA;
  for (let i = 1; i <= N; i++) {
    const s = (i / N) * F;
    ctx.beginPath();
    ctx.arc(L.x0 + L.vx * s, L.y0 + L.vy * s + 0.5 * cfg.GRAVITY * s * s, P.ARC_DOT_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
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
