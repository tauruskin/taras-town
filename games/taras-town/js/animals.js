/**
 * animals.js — The dogs, cats, ducks, birds and hens he can pat.
 *
 * Where they live is the WORLD's business (`world.animalSpots`), so every
 * phone agrees. This file is what they do: a small state machine per animal,
 * and how each kind is drawn. It never touches the DOM, so the offline suite
 * can run the real thing.
 *
 * One best friend at a time. Patting an animal makes it the friend; patting
 * another sends the old one home. A friend he leaves behind — in a car, in a
 * house, across water a cat will not swim — sits and waits, then gives up and
 * wanders home. A bird friend flies beside the helicopter instead.
 *
 * States change only on a timer, a distance or a pat. Never at random.
 *
 * Nothing here is solid and nothing is blocked by walls. Cover is never
 * solid in this town, and an animal that could wedge him, or be wedged
 * itself, is worse than one that trots through a hedge.
 */

import { CONFIG } from './config.js';

const LAND_ONLY = new Set(['cat', 'hen']);

export class Animal {
  constructor(spot) {
    this.id = spot.id;
    this.kind = spot.kind;
    this.homeX = spot.x;
    this.homeY = spot.y;
    this.x = spot.x;
    this.y = spot.y;
    this.state = 'idle';
    this.t = 0;          // seconds in this state
    this.facing = 1;     // 1 right, -1 left
    this.lift = 0;       // 0..1, only ever above 0 for a bird
    this.moving = false;
  }

  enter(state) {
    this.state = state;
    this.t = 0;
  }
}

export class Animals {
  constructor(world) {
    this.world = world;
    this.list = world.animalSpots.map((s) => new Animal(s));
    this.friend = null;
    this.clock = 0;
  }

  /** The nearest animal he could pat from (x, y), with its distance, or null. */
  nearest(x, y, reach = CONFIG.ANIMALS.PAT_RADIUS) {
    let best = null;
    let bestD = reach;
    for (const a of this.list) {
      if (a.state === 'flying') continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best ? { animal: best, d: bestD } : null;
  }

  /** Pat it. It becomes the friend. Returns its kind, for the sound. */
  pat(a) {
    if (this.friend && this.friend !== a) this.friend.enter('home');
    this.friend = a;
    a.enter('happy');
    return a.kind;
  }

  /**
   * Which animal other players should see trailing him: its id, or -1.
   * A waiting friend is not with him, so it is not sent.
   */
  friendId() {
    const f = this.friend;
    return f && f.state !== 'waiting' ? f.id : -1;
  }

  update(dt, who) {
    const A = CONFIG.ANIMALS;
    this.clock += dt;

    for (const a of this.list) {
      a.t += dt;
      a.moving = false;
      if (a.state !== 'flying') a.lift = Math.max(0, a.lift - dt * CONFIG.HELI.LIFT_SPEED);

      if (a.state === 'idle') this._idle(a);
      else if (a.state === 'happy') { if (a.t >= A.HAPPY_TIME) a.enter('following'); }
      else if (a.state === 'following') this._follow(a, dt, who);
      else if (a.state === 'waiting') this._wait(a, who);
      else if (a.state === 'flying') this._fly(a, dt, who);
      else if (a.state === 'home') this._goHome(a, dt, who);
    }
  }

  _idle(a) {
    const A = CONFIG.ANIMALS;
    // Eased in over the first second, so arriving home does not jump.
    const k = Math.min(1, a.t) * A.WANDER;
    const p = this.clock * 0.7 + a.id * 1.3;
    a.x = a.homeX + Math.sin(p) * k;
    a.y = a.homeY + Math.sin(this.clock * 0.45 + a.id * 2.1) * k * 0.6;
    a.facing = Math.cos(p) >= 0 ? 1 : -1;
    a.moving = true;
  }

  _follow(a, dt, who) {
    const A = CONFIG.ANIMALS;
    const birdInTheAir = a.kind === 'bird' && who.mode === 'drive' && who.flying;
    if (who.mode === 'inside' || (who.mode === 'drive' && !birdInTheAir)) { a.enter('waiting'); return; }
    if (birdInTheAir) { a.enter('flying'); return; }

    let dx = who.x - a.x;
    let dy = who.y - a.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) return;

    if (d > A.CATCHUP) {
      const nx = who.x - (dx / d) * A.CATCHUP_TO;
      const ny = who.y - (dy / d) * A.CATCHUP_TO;
      if (LAND_ONLY.has(a.kind) && this.world.isWaterAt(nx, ny)) { a.enter('waiting'); return; }
      a.x = nx; a.y = ny;
      dx = who.x - a.x; dy = who.y - a.y; d = Math.hypot(dx, dy);
    }

    if (d > A.FOLLOW_GAP) {
      const s = Math.min(d - A.FOLLOW_GAP, A.SPEED * dt);
      const nx = a.x + (dx / d) * s;
      const ny = a.y + (dy / d) * s;
      if (LAND_ONLY.has(a.kind) && this.world.isWaterAt(nx, ny)) { a.enter('waiting'); return; }
      a.x = nx; a.y = ny;
      a.moving = true;
      if (Math.abs(dx) > 1) a.facing = dx > 0 ? 1 : -1;
    }
  }

  _wait(a, who) {
    const A = CONFIG.ANIMALS;
    if (who.mode === 'foot' && Math.hypot(who.x - a.x, who.y - a.y) < A.RETURN_RADIUS) {
      a.enter('following');
      return;
    }
    if (a.t >= A.WAIT_TIME) {
      a.enter('home');
      if (this.friend === a) this.friend = null;
    }
  }

  _fly(a, dt, who) {
    const A = CONFIG.ANIMALS;
    if (!(who.mode === 'drive' && who.flying)) { a.enter('following'); return; }
    const tx = who.x + A.FLY_SIDE;
    const ty = who.y + A.FLY_SIDE * 0.4;
    const k = Math.min(1, 8 * dt);
    if (Math.abs(tx - a.x) > 1) a.facing = tx > a.x ? 1 : -1;
    a.x += (tx - a.x) * k;
    a.y += (ty - a.y) * k;
    a.lift = who.lift;
    a.moving = true;
  }

  _goHome(a, dt, who) {
    const A = CONFIG.ANIMALS;
    let dx = a.homeX - a.x;
    let dy = a.homeY - a.y;
    let d = Math.hypot(dx, dy);

    const unseen = who.mode === 'inside' || Math.hypot(who.x - a.x, who.y - a.y) > A.UNSEEN;
    if (d > A.HOME_SNAP && unseen) d = 0;

    if (d < 2) {
      a.x = a.homeX; a.y = a.homeY;
      a.enter('idle');
      return;
    }
    const s = Math.min(d, A.HOME_SPEED * dt);
    a.x += (dx / d) * s;
    a.y += (dy / d) * s;
    a.moving = true;
    if (Math.abs(dx) > 1) a.facing = dx > 0 ? 1 : -1;
  }

  _visible(a, view, pad = 60) {
    return a.x > view.x - pad && a.x < view.x + view.w + pad &&
           a.y > view.y - pad && a.y < view.y + view.h + pad;
  }

  /** Everything on the ground, plus the shadows of anything in the air. */
  drawGround(ctx, view) {
    for (const a of this.list) {
      if (!this._visible(a, view)) continue;
      const up = a.lift > 0.05;
      drawAnimal(ctx, a.kind, a.x, a.y, {
        time: this.clock, seed: a.id, facing: a.facing, pose: poseOf(a),
        swim: !up && a.kind !== 'bird' && this.world.isWaterAt(a.x, a.y),
        lift: a.lift, only: up ? 'shadow' : undefined,
      });
    }
  }

  /** Birds in the air, drawn after the treetops they fly over. */
  drawAir(ctx, view) {
    for (const a of this.list) {
      if (a.lift <= 0.05 || !this._visible(a, view)) continue;
      drawAnimal(ctx, a.kind, a.x, a.y, {
        time: this.clock, seed: a.id, facing: a.facing, pose: 'walk', lift: a.lift, only: 'body',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing. Side-on and chunky, so a dog reads as a dog at phone size — from
// directly above, every animal is the same brown blob. All shapes; no images.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

/**
 * One animal, standing with its feet at (x, y).
 *
 * @param o.time    seconds, for wagging and walking
 * @param o.seed    per-animal offset, so two dogs do not wag in step
 * @param o.facing  1 right, -1 left
 * @param o.pose    'stand' | 'walk' | 'sit' | 'happy'
 * @param o.swim    only the top half shows, with a ripple
 * @param o.lift    0..1 height, for a bird in the air
 * @param o.only    'shadow' | 'body' to draw half of it
 */
export function drawAnimal(ctx, kind, x, y, o = {}) {
  const C = CONFIG.ANIMALS.COLORS[kind];
  const time = (o.time || 0) + (o.seed || 0) * 0.37;
  const facing = o.facing || 1;
  const lift = o.lift || 0;
  const pose = o.pose || 'stand';

  if (o.only !== 'body') {
    const s = 1 - lift * 0.35;
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 13 * s, 5 * s, 0, 0, TAU);
    ctx.fill();
  }
  if (o.only === 'shadow') return;

  let by = y - lift * CONFIG.HELI.ALTITUDE;
  if (pose === 'happy') by -= Math.abs(Math.sin(time * 12)) * 7;

  ctx.save();
  ctx.translate(x, by);
  if (o.swim) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 2, 15 + Math.sin(time * 4) * 2, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-40, -50, 80, 52);
    ctx.clip();
  }
  ctx.scale(facing, 1);
  SHAPES[kind](ctx, C, time, pose, lift > 0.05);
  ctx.restore();

  if (pose === 'happy') drawHearts(ctx, x, by - 26, time);
}

function eye(ctx, x, y) {
  ctx.fillStyle = '#2B2B2B';
  ctx.beginPath(); ctx.arc(x, y, 1.9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(x + 0.6, y - 0.7, 0.7, 0, TAU); ctx.fill();
}

function legs(ctx, colour, time, pose, xs) {
  if (pose === 'sit') return;
  const swing = pose === 'walk' || pose === 'happy' ? Math.sin(time * 14) * 2.5 : 0;
  ctx.fillStyle = colour;
  xs.forEach((lx, i) => ctx.fillRect(lx + (i % 2 ? -swing : swing) - 1.5, 2, 3, 6));
}

function beak(ctx, colour, x, y, len) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y - 2); ctx.lineTo(x + len, y); ctx.lineTo(x, y + 2);
  ctx.closePath(); ctx.fill();
}

const SHAPES = {
  dog(ctx, C, t, pose) {
    const sit = pose === 'sit';
    legs(ctx, C.body, t, pose, [-7, -3, 4, 8]);
    ctx.fillStyle = C.body;
    ctx.beginPath();
    ctx.ellipse(sit ? -2 : 0, sit ? -1 : -2, 11, sit ? 8 : 7, sit ? -0.5 : 0, 0, TAU);
    ctx.fill();
    const wag = Math.sin(t * (sit || pose === 'happy' ? 18 : 7)) * 0.6;
    ctx.strokeStyle = C.body; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(-10 - Math.cos(wag + 0.8) * 8, -4 - Math.sin(wag + 0.8) * 8);
    ctx.stroke();
    const hy = sit ? -12 : -9;
    ctx.beginPath(); ctx.arc(10, hy, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ear;
    ctx.beginPath(); ctx.ellipse(7, hy - 2, 2.6, 5, 0.3, 0, TAU); ctx.fill();
    eye(ctx, 12, hy - 1);
    ctx.fillStyle = '#3B2A20';
    ctx.beginPath(); ctx.arc(16.5, hy + 1, 1.8, 0, TAU); ctx.fill();
  },

  cat(ctx, C, t, pose) {
    const sit = pose === 'sit';
    legs(ctx, C.body, t, pose, [-7, -3, 4, 8]);
    ctx.fillStyle = C.body;
    ctx.beginPath();
    ctx.ellipse(sit ? -2 : 0, sit ? -2 : -2, 10, sit ? 8 : 6, sit ? -0.5 : 0, 0, TAU);
    ctx.fill();
    const curl = Math.sin(t * (sit ? 3 : 5)) * 3;
    ctx.strokeStyle = C.body; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.quadraticCurveTo(-17, -6, -14 + curl, -16);
    ctx.stroke();
    const hy = sit ? -13 : -9;
    ctx.beginPath(); ctx.arc(10, hy, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ear;
    for (const ex of [6.5, 12.5]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.5, hy - 4); ctx.lineTo(ex, hy - 10); ctx.lineTo(ex + 2.5, hy - 4);
      ctx.closePath(); ctx.fill();
    }
    eye(ctx, 12, hy - 1);
    ctx.fillStyle = '#FF8FA3';
    ctx.beginPath(); ctx.arc(15.5, hy + 1.5, 1.3, 0, TAU); ctx.fill();
  },

  duck(ctx, C, t, pose) {
    legs(ctx, C.beak, t, pose, [-3, 3]);
    ctx.fillStyle = C.body;
    ctx.beginPath(); ctx.ellipse(0, -2, 11, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, -4); ctx.lineTo(-15, -9); ctx.lineTo(-8, -7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.ear;
    ctx.beginPath(); ctx.arc(8, -11, 5.5, 0, TAU); ctx.fill();
    beak(ctx, C.beak, 12.5, -10, 6);
    eye(ctx, 9.5, -12.5);
  },

  bird(ctx, C, t, pose, flying) {
    if (!flying) legs(ctx, C.beak, t, pose, [-1.5, 2]);
    ctx.fillStyle = C.body;
    ctx.beginPath(); ctx.ellipse(0, -3, 7, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ear;
    ctx.beginPath(); ctx.ellipse(1.5, -1, 4.5, 3.5, 0, 0, TAU); ctx.fill();
    const flap = flying || pose === 'happy' ? Math.sin(t * 22) * 0.9 : 0.2;
    ctx.fillStyle = C.body;
    ctx.save();
    ctx.translate(-1, -6);
    ctx.rotate(-0.6 - flap);
    ctx.beginPath(); ctx.ellipse(-4, 0, 6, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();
    beak(ctx, C.beak, 6.5, -5, 4);
    eye(ctx, 3.5, -6);
  },

  hen(ctx, C, t, pose) {
    legs(ctx, C.beak, t, pose, [-3, 3]);
    ctx.fillStyle = C.body;
    ctx.beginPath(); ctx.ellipse(0, -4, 10, 9, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7, -13, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ear;
    ctx.beginPath(); ctx.arc(6, -19, 2.2, 0, TAU); ctx.arc(9, -19, 2.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(11.5, -9.5, 1.6, 0, TAU); ctx.fill();
    const flap = pose === 'happy' ? Math.sin(t * 20) * 0.5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.save(); ctx.translate(-1, -4); ctx.rotate(flap);
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, 0, TAU); ctx.fill();
    ctx.restore();
    beak(ctx, C.beak, 12, -13, 4);
    eye(ctx, 9, -14.5);
  },
};

function drawHearts(ctx, x, y, time) {
  ctx.save();
  ctx.fillStyle = '#FF5C8A';
  for (let i = 0; i < 2; i++) {
    const p = (time * 1.2 + i * 0.5) % 1;
    const hx = x + (i ? 7 : -7);
    const hy = y - p * 14;
    const s = 4;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.moveTo(hx, hy + s);
    ctx.arc(hx - s / 2, hy, s / 2, Math.PI * 0.75, Math.PI * 1.9);
    ctx.arc(hx + s / 2, hy, s / 2, Math.PI * 1.1, Math.PI * 0.25);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** The pose a live animal is in right now. */
function poseOf(a) {
  if (a.state === 'happy') return 'happy';
  if (a.state === 'waiting') return 'sit';
  return a.moving ? 'walk' : 'stand';
}

/**
 * A friend trailing somebody else's character, on THIS phone. Same follow
 * as the real thing, none of its rules: it is only ever drawn.
 */
export function trail(pet, x, y, dt) {
  const A = CONFIG.ANIMALS;
  const dx = x - pet.x;
  const dy = y - pet.y;
  const d = Math.hypot(dx, dy);
  pet.moving = false;
  if (d < 1e-6) return;
  if (d > A.CATCHUP) {
    pet.x = x - (dx / d) * A.FOLLOW_GAP;
    pet.y = y - (dy / d) * A.FOLLOW_GAP;
    return;
  }
  if (d > A.FOLLOW_GAP + 2) {
    const s = Math.min(d - A.FOLLOW_GAP, A.SPEED * dt);
    pet.x += (dx / d) * s;
    pet.y += (dy / d) * s;
    pet.moving = true;
    if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
  }
}
