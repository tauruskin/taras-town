/**
 * enemies.js — the three enemy types.
 *
 * Like a spike, an enemy is NOT a collider: the ball never bounces off one,
 * it rolls into (or lands on) one and something happens — a stomp defeats
 * it, anything else costs a heart via the same `Ball.hit()` a spike already
 * calls. That is what makes a walker and a popper pure functions of level
 * time, the same trick levels.js's moving platforms already use: no physics
 * simulation needed to know where either one is at time *t*, which is what
 * lets a test assert an exact position with no browser.
 *
 * The roller is the one exception — see makeRoller's own comment.
 */
import { circleHitsBox } from './hazards.js';

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
