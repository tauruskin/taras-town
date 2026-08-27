/**
 * camera.js — Follows the player around town.
 *
 * The camera keeps a rectangle of the world in view. It eases towards the
 * player rather than snapping, which stops the picture jolting every time
 * the character changes direction, and it never scrolls past the edge of the
 * map so the player never sees empty space beyond the town.
 */

import { CONFIG } from './config.js';

export class Camera {
  constructor(world) {
    this.world = world;
    this.x = 0;  // top-left of the visible rectangle, in world pixels
    this.y = 0;
    this.w = 0;  // size of the visible rectangle, in world pixels
    this.h = 0;
  }

  /** Jump straight to a position with no easing (used when the game starts). */
  snapTo(cx, cy) {
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this._clamp();
  }

  /**
   * @param dt      seconds since the last frame
   * @param cx, cy  the point to centre on (the player)
   * @param w, h    how much world to show, in world pixels
   */
  update(dt, cx, cy, w, h) {
    this.w = w;
    this.h = h;

    const targetX = cx - w / 2;
    const targetY = cy - h / 2;

    // Frame-rate independent easing: the same feel at 30fps and 60fps.
    const t = 1 - Math.exp(-CONFIG.CAMERA.LERP * dt);
    this.x += (targetX - this.x) * t;
    this.y += (targetY - this.y) * t;

    this._clamp();
  }

  _clamp() {
    const { width, height } = this.world;

    // If the town is narrower than the screen, centre it instead of clamping.
    this.x = this.w >= width
      ? (width - this.w) / 2
      : Math.min(Math.max(this.x, 0), width - this.w);

    this.y = this.h >= height
      ? (height - this.h) / 2
      : Math.min(Math.max(this.y, 0), height - this.h);
  }

  /** The visible world rectangle, handed to the drawing code for culling. */
  get view() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}
