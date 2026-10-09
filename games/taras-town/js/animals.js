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
}
