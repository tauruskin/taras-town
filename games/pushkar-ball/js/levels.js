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
import { segment, boxSegments, SegmentGrid, segmentHitsBox, supportUnder } from './physics.js';
// Crates fall, so they need GRAVITY and the crate numbers. config.js imports
// nothing and touches nothing, so this stays as DOM-free as it was.
import { CONFIG } from './config.js';
// Hazards are geometry, not colliders, so this brings in a hit test and
// nothing that touches the segment world or the DOM.
import { hitsSpikes } from './hazards.js';

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
      // Walls at both ends, so the level cannot be left sideways. Not movable,
      // and drawn as stone rather than wood so that "wood means you can push
      // it" stays true everywhere.
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 4760, y: 0, w: 40, h: 1080 },
      // Two wooden crates, and both can be pushed. Jump them, roll over them
      // at speed, or shove them about.
      //
      // Nothing in THIS level needs a crate to be finished — there is no spot
      // here that a jump cannot already reach, and saying otherwise in a
      // comment would be the easiest kind of lie to leave behind. They are
      // here so the mechanic is in a child's hands from the first level and so
      // the game exercises it; the level that is built around a crate belongs
      // with phase 2's level design, where the geometry can be drawn for it.
      // What a crate can do is proved in tests/offline/crates.mjs, on a level
      // built for the purpose, with a ledge the jump provably cannot reach.
      //
      // Both sit beyond the first flat, and the first flat is kept clear on
      // purpose: the roll suite measures friction by letting the ball coast to
      // a stop there. A crate put on that stretch — the obvious place for one,
      // and where this one started — stops the ball dead instead, and the
      // suite goes on passing while measuring nothing at all.
      { x: 2700, y: 660, w: 100, h: 100, movable: true },
      { x: 3780, y: 660, w: 110, h: 100, movable: true },
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

    // Two, both immediately before something that can be failed: the first
    // gap, and the last one that needs the moving platform. Not evenly spaced
    // — a checkpoint in the middle of an easy run banks progress nobody was
    // going to lose.
    checkpoints: [
      { x: 2300, y: 760 },
      { x: 4120, y: 760 },
    ],
  },

  {
    // Level two teaches the crate. Level one has crates and never needs one;
    // here the only way onto the high ledge is to shove a crate under it and
    // jump off the top, so the idea is learned somewhere it can be practised
    // without a hazard anywhere in sight.
    id: 2,
    theme: 'hills',
    bounds: { w: 3540, h: 1080 },
    spawn: { x: 180, y: 560 },
    goal: { x: 3380, y: 620 },

    ground: [
      // A long flat run to get up to speed, then two gaps of increasing size.
      // 200px is comfortable at speed; 260px needs a proper run-up. Measured
      // in tests/offline/finish.mjs's terms, a press anywhere in about 140px
      // before the first edge gets across and about 100px before the second —
      // the second is the tightest jump in the first three levels.
      [[40, 760], [1200, 760]],
      [[1400, 760], [2000, 760]],
      // A step down and along: the flat where the crate lives, below the ledge.
      [[2260, 800], [2900, 800]],
      // The high ledge, and the goal is on it. Its top is 180px above the flat
      // below, and a jump from that flat reaches 131px — a ball there is at
      // y=780 and peaks at 649, which is not the 600 it needs to land on 620.
      // Standing on a 100px crate it is at 680 and peaks at 549, which is. So
      // the crate is the only way up, with about 50px of margin either way.
      [[2960, 620], [3500, 620]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 3500, y: 0, w: 40, h: 1080 },
      // The ledge's face, as a stone box rather than a bend in the polyline.
      //
      // A ground polyline cannot turn vertical here: winding order gives a
      // vertical segment a sideways normal, `ny` is 0, and levels.mjs rightly
      // insists every ground segment faces up. So the step's face is a box,
      // which is what boxes are for.
      //
      // It also has to exist at all. Without a face the ledge is a floating
      // horizontal line: the crate gets shoved straight underneath it and off
      // the end of the flat, and there is nothing to push it up against.
      //
      // It runs to the bottom of the level rather than stopping at the flat's
      // 800, because the ground is drawn as a filled band under each line and
      // the two bands here end 60px apart. A face stopping at 800 left that
      // slot open below it, and the hills showed through a crevice under the
      // stone.
      { x: 2900, y: 620, w: 60, h: 460 },
      // The crate that matters, on the flat below the ledge, well clear of
      // both gaps so it cannot be shoved into one before it is needed. It can
      // be — crates come back when they fall out — but a child who loses it
      // for ten seconds has learned nothing except that things vanish.
      { x: 2400, y: 700, w: 100, h: 100, movable: true },
    ],

    platforms: [],

    checkpoints: [
      // Before the second, wider gap — the tightest jump in the level: a press
      // anywhere in about 100px of run-up gets across, against about 140px for
      // the 200px gaps. Respawning here leaves 100px to the edge, and the ball
      // is at full speed after 55 of them.
      { x: 1900, y: 760 },
      // On the flat where the crate lives, just past the landing: the puzzle
      // is the hard stretch in this level, not the gap before it. Working out
      // a crate means backing up and trying again, and the flat ends in that
      // wide gap on its left — without this flag, every child who backs off
      // the end while experimenting is sent to redo the hardest jump in the
      // level before he may try the crate again.
      { x: 2300, y: 800 },
    ],
  },

  {
    // Level three introduces the spike, and nothing else. Everything under it
    // — rolling, gaps, crates, a moving platform — has already been met.
    //
    // The first patch is somewhere failing costs a few seconds: flat ground,
    // in plain sight, with a checkpoint just before it. That is the rule for
    // introducing anything, and it is the reason this level is longer than it
    // looks: the safe rehearsal has to come before the real ask.
    id: 3,
    theme: 'hills',
    bounds: { w: 4380, h: 1080 },
    spawn: { x: 180, y: 560 },
    // On the ground, like every other goal in the game — level one's sits at
    // its ledge's own height. GOAL.R is forgiving enough either way, but a
    // flag floating 60px in the air is a flag drawn hovering.
    goal: { x: 4200, y: 760 },

    ground: [
      // Flat, with the first spikes on it, in the open.
      [[40, 760], [1500, 760]],
      // A 200px gap, the same size as level one's, then a long flat with the
      // second patch well along it.
      [[1700, 760], [2600, 760]],
      // Up a ramp and along the high ground, with the third patch on it.
      [[2600, 760], [2950, 620], [3500, 620]],
      // Down and home.
      [[3500, 620], [3800, 760], [4340, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 4340, y: 0, w: 40, h: 1080 },
    ],

    platforms: [
      // Across the gap, so it can be crossed by waiting as well as by jumping.
      // Two ways past the same obstacle is how a level stops being a wall.
      { x: 1540, y: 800, w: 150, h: 26, axis: 'x', dist: 70, period: 4.5, phase: 0 },
    ],

    spikes: [
      // The rehearsal: narrow, flat, unmissable, right after a checkpoint.
      { x: 900, y: 760, w: 80 },
      // After the gap, but a long way after it — the landing edge is at 1700,
      // so that is 550px of flat between it and the teeth. Close behind the
      // landing would make the gap and the spikes one piece of timing, which
      // is the thing never to ask.
      { x: 2250, y: 760, w: 100 },
      // On the high ground, 250px past the crest of the ramp, so it is in
      // plain view from the top before it has to be jumped.
      { x: 3200, y: 620, w: 90 },
    ],

    checkpoints: [
      // One immediately before each patch, and nowhere else. Meeting spikes
      // for the first time is exactly the moment to lose nothing but seconds,
      // and a patch failed should never send him back to redo the one before
      // it — or the gap.
      //
      // Nothing guards the gap at 1500-1700 itself, 720px past this one —
      // that is deliberate rather than an oversight. The gap is the same
      // 200px as level one's, already met and already practised there; only
      // a NEW idea earns its own checkpoint here, which is why every one of
      // the three below sits on a spike patch and none sits on a gap.
      // tests/offline/finish.mjs proves the stretch from here is still
      // completable in one.
      { x: 780, y: 760 },
      { x: 2100, y: 760 },
      { x: 3050, y: 620 },
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

/**
 * A wooden crate: solid, standable, and pushable.
 *
 * It exists so there is a way to reach somewhere the jump alone will not — put
 * a crate under a high ledge and jump off it. Everything wooden in the game can
 * be pushed, and nothing that can be pushed is any other colour, so the rule
 * is legible without a word of explanation.
 *
 * Deliberately NOT a general rigid body. It moves horizontally only when
 * something pushes it, and vertically only by falling straight down onto
 * whatever is beneath it. A crate that could tumble, spin, or slide down a
 * slope of its own accord would be more realistic and much worse: the one
 * genuinely bad outcome here is a crate ending up somewhere that makes the
 * level impossible, and a crate that only goes where it is pushed cannot do
 * that by itself.
 */
function makeCrate(b) {
  const c = {
    ...b,
    x: b.x, y: b.y,
    movable: true,       // what player.js looks for before pushing
    grounded: false,
    falls: 0,            // times it has been shoved out of the level
    segments: [],

    // A crate is something the ball can STAND on, which makes it a carrier in
    // exactly the way a moving platform is, and it has to answer the same four
    // questions or it cannot be stood on safely: how far it moved this step, so
    // a rider comes with it, and how fast it is going, so a jump off it
    // carries. Leaving these off is not a missing nicety — `player.js` adds
    // `platform.dx` to the ball's position unconditionally, so an absent `dx`
    // is `undefined`, the ball's position becomes NaN on the first frame it
    // stands on a crate, and the ball simply disappears from the level with
    // nothing logged anywhere.
    dx: 0, dy: 0,
    vx: 0, vy: 0,

    /** Rebuild the colliders, and tag them so a contact leads back here. */
    _reseg() {
      c.segments = boxSegments(c.x, c.y, b.w, b.h);
      for (const s of c.segments) s.owner = c;
    },

    /**
     * Fall, and land.
     *
     * `solids` is everything that could hold this crate up — the level's static
     * geometry and the other crates, but never this crate itself, or it would
     * rest on its own floor and hang in the air for ever.
     */
    update(dt, solids, cfg, boundsH) {
      // A fresh step: whatever it was shoved by last step is spent. Any push
      // this step happens later, during the ball's update, and is carried by a
      // rider on the step after — the same one-step lag a moving platform's
      // rider already lives with.
      const wasY = c.y;
      c.dx = 0;
      c.vx = 0;

      c.vy += cfg.GRAVITY * dt;
      c.y += c.vy * dt;

      const floor = supportUnder(c.x, b.w, c.y, b.h, solids, cfg);
      if (floor < Infinity && c.y + b.h > floor) {
        c.y = floor - b.h;
        c.vy = 0;
        c.grounded = true;
      } else {
        c.grounded = false;
      }

      // Fell out of the level: put it back where the level put it.
      //
      // A crate can be shoved off a ledge, and a crate with nothing under it
      // falls for ever. Without this it is simply gone — and the day a level
      // needs a crate to be finishable, "gone" means a child has permanently
      // broken his own game with no way to undo it and no way to know why. The
      // ball is handed the level back when it falls; so is the crate.
      if (c.y > boundsH) {
        c.x = b.x; c.y = b.y;
        c.vy = 0;
        c.falls++;
        // No rider delta for a respawn. `dy` means "how far the lid moved, so
        // bring whoever is standing on it" — reporting the whole trip back up
        // the level would teleport the ball with it.
        c.dy = 0;
        c._reseg();
        return;
      }

      // What a rider on the lid should be moved by. This is the case that
      // matters: a crate shoved off a ledge with the ball on top takes the ball
      // down with it instead of leaving it hanging in the air.
      c.dy = c.y - wasY;
      c._reseg();
    },

    /**
     * Try to slide by dx. Returns how far it actually went.
     *
     * Refused outright if the crate would end up inside something. A crate is
     * pushed by a ball with no idea what is on the far side of it, so this is
     * the only thing standing between a child and a crate shoved through the
     * level's boundary wall.
     *
     * The exception is a small rise, STEP_UP: the foot of a slope lifts the
     * crate a little rather than stopping it, so a crate can be walked up a
     * ramp but is still stopped dead by anything wall-shaped.
     */
    tryPush(dx, dt, solids, cfg) {
      const nx = c.x + dx;

      // Inset VERTICALLY only, and that asymmetry is the whole point. The
      // inset exists because a crate resting on the ground genuinely touches
      // the ground segment, and counting that as blocked would report every
      // crate everywhere as stuck. But inset horizontally too and the crate
      // may overlap a wall by the width of the inset before anything objects —
      // which showed up as a crate sitting 1.2px inside the level's boundary.
      // Nothing about the ground needs slack sideways.
      const IN = 1.5;
      const clear = (atX, atY) => {
        for (const s of solids) {
          if (segmentHitsBox(s, atX, atY + IN, b.w, b.h - IN * 2)) return false;
        }
        return true;
      };

      if (!clear(nx, c.y)) {
        // Perhaps it is only a step up rather than a wall. Try again lifted;
        // this is what lets a crate ride up the foot of a slope while still
        // being stopped dead by anything wall-shaped.
        const lifted = c.y - cfg.CRATE.STEP_UP;
        if (!clear(nx, lifted)) return 0;
        c.y = lifted;
      }

      c.x = nx;
      c.dx += dx;
      c.vx = dx / dt;
      c._reseg();
      return dx;
    },

    overlaps(x, y, r) {
      return x + r > c.x && x - r < c.x + b.w && y + r > c.y && y - r < c.y + b.h;
    },
  };
  c._reseg();
  return c;
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
    // Boxes come in two kinds and it matters which. A `movable` one is a
    // wooden crate: it is a body that moves, so it must stay OUT of the static
    // grid, which is built once and never rebuilt. Everything else is scenery
    // — in level one, the boundary walls — and is baked in like the ground.
    this.walls = (data.boxes || []).filter((b) => !b.movable);
    this.crates = (data.boxes || []).filter((b) => b.movable).map(makeCrate);
    for (const b of this.walls) segs.push(...boxSegments(b.x, b.y, b.w, b.h));

    // Checkpoints are not colliders and never touch the segment world; they
    // are places the ball remembers. `taken` is per-run state and belongs on
    // the loaded level rather than in the data, so that reloading a level
    // resets them all with no bookkeeping anywhere.
    this.checkpoints = (data.checkpoints || []).map((c) => ({ x: c.x, y: c.y, taken: false }));

    // Hazards are not colliders and never enter the segment world. The ball
    // does not bounce off a spike; it rolls into one and fails.
    this.spikes = (data.spikes || []).map((s) => ({ x: s.x, y: s.y, w: s.w }));

    this.statics = segs;
    this.grid = new SegmentGrid(segs);
    this.movers = (data.platforms || []).map(makeMover);
  }

  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
  }

  /**
   * Everything a crate may rest on or be stopped by: the level's fixed
   * geometry, the moving platforms, and every crate EXCEPT itself.
   *
   * Excluding itself is the whole point. A crate asked whether it may stand
   * somewhere, with its own four sides in the list, is told no by its own
   * floor — and a crate that rests on itself hangs in mid-air for ever.
   */
  solidsFor(crate) {
    const out = [...this.statics];
    for (const m of this.movers) out.push(...m.segments);
    for (const c of this.crates) if (c !== crate) out.push(...c.segments);
    return out;
  }

  /**
   * Every segment the ball could touch right now.
   *
   * Statics come from the grid; movers and crates are checked one by one
   * because there are a handful of them, and rebuilding a grid every step to
   * save a few comparisons would be a poor trade.
   */
  near(x, y, r) {
    const out = [...this.grid.near(x, y, r)];
    for (const m of this.movers) if (m.overlaps(x, y, r)) out.push(...m.segments);
    for (const c of this.crates) if (c.overlaps(x, y, r)) out.push(...c.segments);
    return out;
  }

  /**
   * The checkpoint a point is inside, if any — and it is marked taken.
   *
   * Takes a bare x and y rather than the ball, because that is all it looks
   * at, and this file has no business knowing what a ball is.
   *
   * The capture region is a box the shape of the flag that is drawn: `R` to
   * either side, and from the top of the pole down to `R` below its foot. A
   * circle around the anchor was tried first and let a jump sail over the
   * flag without arming, because a circle's window narrows to nothing exactly
   * where the pole is tallest.
   *
   * It both marks and returns, deliberately: splitting the question from the
   * arming invites a caller that asks and then forgets to arm.
   *
   * Already taken ones are skipped, which is what stops rolling back over an
   * earlier checkpoint from dragging home backwards down the level.
   */
  takeCheckpoint(x, y) {
    const K = CONFIG.CHECKPOINT;
    for (const c of this.checkpoints) {
      if (c.taken) continue;
      if (x >= c.x - K.R && x <= c.x + K.R &&
          y >= c.y - K.POLE_H && y <= c.y + K.R) {
        c.taken = true;
        return c;
      }
    }
    return null;
  }

  /**
   * Is this body touching anything that should send it back?
   *
   * One question for the whole level, so that when saws and crushers arrive in
   * phase 3 the caller in player.js does not have to learn about them.
   *
   * `body` and not `ball`, because it need not be one: anything with an `x`, a
   * `y` and an `r` can ask, and Task 6 asks on behalf of a candidate spot with
   * a radius of its own to check that a level is authorable there.
   */
  hitsHazard(body) {
    return hitsSpikes(body, this.spikes, CONFIG);
  }
}

export function loadLevel(data) { return new Level(data); }

/**
 * The index of the level after this one, or null if there is none.
 *
 * Null rather than wrapping round to zero, and rather than clamping to the
 * last one. The caller has to decide what "nowhere to go" means — for the
 * results panel it means staying on the panel instead of promising a level
 * that does not exist — and a function that quietly returned the same level
 * again would hide that decision rather than force it, which is how a child
 * ends up replaying the last level for ever with no idea why.
 *
 * An INDEX and not an id, because that is what the caller has: flow.js holds
 * `levelIndex` into the list, and ids are for the digit on the panel.
 *
 * The list is a parameter, defaulting to LEVELS, so that the flow can be
 * tested on levels built for the purpose — moving on needs somewhere to move
 * on to, and a test should not depend on how many levels the game has today.
 */
export function nextLevel(index, levels = LEVELS) {
  return index + 1 < levels.length ? index + 1 : null;
}
