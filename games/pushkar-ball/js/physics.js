/**
 * physics.js — the ball, the segments, and what happens when they meet.
 *
 * All world geometry is line segments with a normal. A box is four segments; a
 * slope is one; a bowl is a polyline of several. Nothing else is a collider.
 * That is the whole reason a rolling ball works here: a grid of tiles is
 * simpler to write and has no honest slopes, and slopes are where a rolling
 * ball earns its existence.
 *
 * Nothing in this file touches the DOM, so node imports it directly and tests
 * the real arithmetic rather than an approximation of it.
 *
 * SCREEN COORDINATES throughout: y increases DOWNWARD, so an upward-facing
 * normal has ny < 0. Getting that backwards is the easiest way to lose an hour
 * in here.
 */

/**
 * A segment from a to b, with the left-hand perpendicular as its normal.
 *
 * Winding order therefore decides which side is solid, and ONLY that side is.
 * Ground polylines are authored left to right, which puts their normal up.
 */
export function segment(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return { ax, ay, bx, by, nx: dy / len, ny: -dx / len, owner: null };
}

/**
 * The four sides of a box, each facing outward.
 *
 * The order matters and is top, right, bottom, left — walking the corners so
 * that every left-hand perpendicular points away from the middle. Reorder these
 * and you get a box that is solid only from the inside.
 */
export function boxSegments(x, y, w, h) {
  return [
    segment(x, y, x + w, y),
    segment(x + w, y, x + w, y + h),
    segment(x + w, y + h, x, y + h),
    segment(x, y + h, x, y),
  ];
}

function closestOn(s, px, py) {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: s.ax + t * dx, y: s.ay + t * dy };
}

/**
 * Segments in buckets, so resolution only ever looks at what is nearby.
 *
 * A level is a few hundred segments, so this is not a performance need today.
 * It is here so the resolution loop stays honest at the size the last level
 * reaches, without anybody having to think about it again.
 */
export class SegmentGrid {
  constructor(segments, cell = 128) {
    this.cell = cell;
    this.buckets = new Map();
    for (const s of segments) this._add(s);
  }

  _add(s) {
    const c = this.cell;
    const c0 = Math.floor(Math.min(s.ax, s.bx) / c), c1 = Math.floor(Math.max(s.ax, s.bx) / c);
    const r0 = Math.floor(Math.min(s.ay, s.by) / c), r1 = Math.floor(Math.max(s.ay, s.by) / c);
    for (let r = r0; r <= r1; r++) {
      for (let cc = c0; cc <= c1; cc++) {
        const k = cc + ',' + r;
        let b = this.buckets.get(k);
        if (!b) this.buckets.set(k, b = []);
        b.push(s);
      }
    }
  }

  /** Every segment whose bucket the circle overlaps. A Set, so no duplicates. */
  near(x, y, r) {
    const c = this.cell;
    const out = new Set();
    const c0 = Math.floor((x - r) / c), c1 = Math.floor((x + r) / c);
    const r0 = Math.floor((y - r) / c), r1 = Math.floor((y + r) / c);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const b = this.buckets.get(cc + ',' + rr);
        if (b) for (const s of b) out.add(s);
      }
    }
    return out;
  }
}

/**
 * Push the ball out of everything it is inside, and take the speed out of the
 * impacts.
 *
 * @returns the contacts made, each with the direction it pushed and the segment
 *          responsible. The caller works out from these whether the ball is on
 *          the ground — the terrain never says so itself, which is what makes
 *          slopes, crates and moving platforms all work with no special case
 *          anywhere.
 */
export function resolve(ball, segments, cfg) {
  const contacts = [];

  for (const s of segments) {
    const c = closestOn(s, ball.x, ball.y);
    let ox = ball.x - c.x, oy = ball.y - c.y;
    let d = Math.hypot(ox, oy);

    // Dead centre on the segment: there is no direction to push out along, so
    // use the segment's own.
    if (d < 1e-6) { ox = s.nx; oy = s.ny; d = 1; }
    if (d >= ball.r) continue;

    const nx = ox / d, ny = oy / d;

    // Only ever push out on the solid side. Without this, a ball that has
    // somehow got past a thin floor is helpfully pushed the rest of the way
    // through it, and one-sided ground stops being one-sided.
    if (nx * s.nx + ny * s.ny <= 0) continue;

    ball.x += nx * (ball.r - d);
    ball.y += ny * (ball.r - d);

    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      // Below REST_EPS the impact is absorbed rather than returned. A
      // restitution applied all the way down leaves a resting ball jittering
      // for ever, never settling and never reading as grounded twice running —
      // which makes jumping fail at random.
      const back = -vn < cfg.REST_EPS ? 0 : -vn * cfg.RESTITUTION;
      const dv = back - vn;
      ball.vx += nx * dv;
      ball.vy += ny * dv;
    }

    contacts.push({ nx, ny, seg: s });
  }

  return contacts;
}

/**
 * One step of the world: gravity, movement, resolution.
 *
 * @param world anything with `near(x, y, r)` returning segments
 */
export function step(ball, world, dt, cfg) {
  ball.vy += cfg.GRAVITY * dt;

  // Subdivide rather than move further than half a radius in one go. At the
  // tuned speeds this never fires; it is the difference between a fast ball and
  // a ball that passes through a floor.
  const travel = Math.hypot(ball.vx, ball.vy) * dt;
  const n = Math.max(1, Math.ceil(travel / (ball.r * 0.5)));
  const sub = dt / n;

  let contacts = [];
  for (let i = 0; i < n; i++) {
    ball.x += ball.vx * sub;
    ball.y += ball.vy * sub;

    // Twice. Two segments meeting at a corner each push the ball out, and the
    // second can undo part of the first — one pass leaves the ball slightly
    // inside a corner it should have been ejected from. A second pass converges
    // it, and costs nothing on the handful of segments that are ever nearby.
    const nearby = world.near(ball.x, ball.y, ball.r);
    const made = resolve(ball, nearby, cfg);
    if (made.length) {
      contacts = contacts.concat(made);
      resolve(ball, nearby, cfg);
    }
  }
  return contacts;
}
