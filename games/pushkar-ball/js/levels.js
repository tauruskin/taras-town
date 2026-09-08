/**
 * levels.js — the levels as data, and the loader that turns them into colliders.
 *
 * A level is a plain object. Nothing is drawn pixel by pixel and no geometry is
 * computed at draw time, so a level can be tweaked or a new one added without
 * going anywhere near the game loop.
 *
 * Ground polylines are authored LEFT TO RIGHT. That is not a convention for
 * tidiness: winding order is what decides which side of a segment is solid, and
 * a backwards polyline is a floor you fall through — which looks completely
 * normal in a screenshot. tests/offline/levels.mjs enforces it.
 *
 * DOM-free, so node can ask it anything the browser knows.
 */
import { segment, boxSegments, SegmentGrid } from './physics.js';

export const LEVELS = [
  {
    id: 1,
    theme: 'hills',
    bounds: { w: 4800, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 4660, y: 680 },

    ground: [
      // Flat to begin with, then up a ramp, along the top and down the other
      // side. Rolling and slopes, before anything at all is asked of the player.
      [[40, 760], [900, 760], [1250, 600], [1600, 600], [1950, 760], [2400, 760]],
      // After a 200px gap: flat, a bowl to roll through, then flat again. 200px
      // is comfortable at speed — the jump reaches about 290px — so the first
      // gap in the game is nowhere near the limit.
      [[2600, 760], [3100, 760], [3250, 840], [3450, 840], [3600, 760], [4200, 760]],
      // The last ledge. Nothing but the moving platform reaches it.
      [[4560, 680], [4760, 680]],
    ],

    boxes: [
      // Walls at both ends, so the level cannot be left sideways.
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 4760, y: 0, w: 40, h: 1080 },
      // A crate on the flat: jump it, or build up speed and roll over it.
      { x: 3780, y: 660, w: 110, h: 100 },
    ],

    platforms: [
      // Across the last gap. Its travel is chosen so its left edge reaches back
      // over the ground at 4200 and its right edge stops short of the ledge at
      // 4560, leaving a small hop — a platform that docks exactly with the
      // scenery just reads as part of it.
      { x: 4275, y: 740, w: 170, h: 28, axis: 'x', dist: 85, period: 5.0, phase: 0 },
      // A lift over the first flat. Nothing needs it; it is here so vertical
      // movers are exercised by the game and not only by the tests.
      { x: 1700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 },
    ],
  },
];

/**
 * A moving platform.
 *
 * Driven by a sine of level TIME rather than by integrated velocity, which buys
 * two things worth having: the level looks identical on every attempt, so a
 * player learns the timing instead of re-reading it; and a test can assert
 * where a platform is at time t without running the game.
 */
function makeMover(p) {
  const m = {
    ...p,
    x: p.x, y: p.y,
    dx: 0, dy: 0,     // how far it moved this step, so a rider comes along
    vx: 0, vy: 0,     // how fast it is going, so a jump off it carries
    segments: [],

    update(t) {
      const a = (t / p.period + (p.phase || 0)) * Math.PI * 2;
      const off = Math.sin(a) * p.dist;
      const nx = p.x + (p.axis === 'x' ? off : 0);
      const ny = p.y + (p.axis === 'y' ? off : 0);
      m.dx = nx - m.x; m.dy = ny - m.y;
      m.x = nx; m.y = ny;

      // The exact derivative of the sine above, not a difference divided by dt:
      // a ball jumping off should carry the speed the platform actually has.
      // Without this half, jumping off a moving platform feels broken in a way
      // players notice and cannot name.
      const v = Math.cos(a) * p.dist * (Math.PI * 2 / p.period);
      m.vx = p.axis === 'x' ? v : 0;
      m.vy = p.axis === 'y' ? v : 0;

      m.segments = boxSegments(m.x, m.y, p.w, p.h);
      // So a contact can be traced back to the platform that made it, which is
      // how the ball knows what it is riding.
      for (const s of m.segments) s.owner = m;
    },

    overlaps(x, y, r) {
      return x + r > m.x && x - r < m.x + p.w && y + r > m.y && y - r < m.y + p.h;
    },
  };
  m.update(0);
  // update(0) reports a delta from the platform's declared position to its
  // position at t=0, which is not movement anybody rode.
  m.dx = 0; m.dy = 0;
  return m;
}

class Level {
  constructor(data) {
    this.data = data;
    this.bounds = data.bounds;
    this.spawn = { ...data.spawn };
    this.goal = data.goal ? { ...data.goal } : null;
    this.theme = data.theme;
    this.time = 0;

    const segs = [];
    for (const line of data.ground || []) {
      for (let i = 0; i < line.length - 1; i++) {
        const s = segment(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
        // Marked so the level test can insist ground faces up, without having
        // to guess which segments came from a polyline and which from a box.
        s.fromGround = true;
        segs.push(s);
      }
    }
    for (const b of data.boxes || []) segs.push(...boxSegments(b.x, b.y, b.w, b.h));

    this.statics = segs;
    this.grid = new SegmentGrid(segs);
    this.movers = (data.platforms || []).map(makeMover);
  }

  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
  }

  /**
   * Every segment the ball could touch right now.
   *
   * Statics come from the grid; movers are checked one by one because there are
   * a handful of them, and rebuilding a grid every step to save four
   * comparisons would be a poor trade.
   */
  near(x, y, r) {
    const out = [...this.grid.near(x, y, r)];
    for (const m of this.movers) if (m.overlaps(x, y, r)) out.push(...m.segments);
    return out;
  }
}

export function loadLevel(data) { return new Level(data); }
