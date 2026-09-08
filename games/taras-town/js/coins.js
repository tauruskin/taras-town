/**
 * coins.js — Coins scattered around town to pick up.
 *
 * Where they lie is worked out from the map, the same way job destinations
 * are, so they are always somewhere you can actually get to and never inside
 * a wall. Because that calculation is deterministic, nothing about them needs
 * saving: the same town always puts coins in the same places.
 *
 * A collected coin comes back after a while. A town that runs permanently dry
 * would leave nothing to find on the second afternoon, and wandering about
 * picking things up is most of the fun at six.
 *
 * Only the TOTAL is saved. Which particular coins are currently collected is
 * deliberately forgotten when the game closes, so every session starts with a
 * full town.
 */

import { CONFIG } from './config.js';
import { T } from './world.js';
import { drawCoin } from './effects.js';

export class Coins {
  constructor(world) {
    this.world = world;

    // Anywhere you can walk or drive: grass, park, sand, pavement and road.
    // Roads included on purpose, so there is something to collect while
    // driving as well as on foot.
    const spots = world.sweepSpots(
      (kind) => kind !== T.WATER,
      CONFIG.COIN.SPACING,
      CONFIG.COIN.MIN_OPENNESS,
      CONFIG.PLAYER.HITBOX / 2,
      1,                                  // every square, not every other one
    );

    this.items = spots.map((s, i) => ({
      x: s.x,
      y: s.y,
      taken: false,
      timer: 0,
      phase: (i * 0.7) % (Math.PI * 2),   // so they don't all bob in step
    }));
  }

  get total() {
    return this.items.length;
  }

  /**
   * Quietly clear away any coin the player is already standing on when the
   * game starts, without paying for it.
   *
   * Which coins are collected is deliberately not saved, so reopening the
   * game puts them all back. Without this, closing the game while standing on
   * a coin and reopening it handed out a free coin every single time.
   */
  clearAtStart(x, y) {
    for (const c of this.items) {
      if (Math.hypot(c.x - x, c.y - y) < CONFIG.COIN.PICKUP_RADIUS) {
        c.taken = true;
        c.timer = CONFIG.COIN.RESPAWN_SECONDS;
      }
    }
  }

  /**
   * @param x, y  wherever the player is — on foot or in a car
   * @returns how many were picked up this frame
   */
  update(dt, x, y) {
    const radius = CONFIG.COIN.PICKUP_RADIUS;
    let got = 0;

    for (const c of this.items) {
      if (c.taken) {
        c.timer -= dt;
        if (c.timer <= 0) c.taken = false;
        continue;
      }
      if (Math.hypot(c.x - x, c.y - y) < radius) {
        c.taken = true;
        c.timer = CONFIG.COIN.RESPAWN_SECONDS;
        got++;
      }
    }
    return got;
  }

  draw(ctx, view, time) {
    for (const c of this.items) {
      if (c.taken) continue;
      if (c.x < view.x - 40 || c.x > view.x + view.w + 40) continue;
      if (c.y < view.y - 40 || c.y > view.y + view.h + 40) continue;

      const t = time * 2.4 + c.phase;
      const bob = Math.sin(t) * 4;

      // Shadow stays put while the coin bobs, which is what sells the hover.
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 11, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Squashing the width turns it edge-on and back: a cheap spin.
      const spin = Math.abs(Math.cos(t * 0.8));
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.scale(Math.max(0.18, spin), 1);
      drawCoin(ctx, 0, 0, 11);
      ctx.restore();
    }
  }
}
