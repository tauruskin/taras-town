/**
 * player.js — the ball.
 *
 * Acceleration rather than instant velocity, so momentum is something the
 * player manages rather than something that happens to them. Everything
 * forgiving about the jump lives here too: coyote time, buffering, and carrying
 * a moving platform's speed on the way off it.
 *
 * DOM-free, and it draws nothing — main.js does that. Which is what lets the
 * whole feel of the game be tested in node in a fraction of a second.
 */
import { CONFIG } from './config.js';
import { step } from './physics.js';

export class Ball {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = CONFIG.BALL.R;
    this.vx = 0; this.vy = 0;

    // Drawing only. A ball that slides without turning looks wrong, and one
    // whose turn does not match its speed looks worse.
    this.spin = 0;

    this.grounded = false;
    this.coyote = 0;        // seconds of grace left since leaving the ground
    this.buffer = 0;        // seconds left of a remembered jump press
    this.platform = null;   // the mover under us, if any
    this.jumped = false;    // jumped THIS step
    this.everJumped = false; // jumped at any point — for tests asking "did it?"
  }

  update(dt, input, level) {
    const C = CONFIG;
    this.jumped = false;

    // A platform we are standing on moved this step, so we move with it. This
    // runs before anything else: the ball should be where the platform put it
    // before gravity and resolution have their say.
    if (this.platform) { this.x += this.platform.dx; this.y += this.platform.dy; }

    // --- along the ground -------------------------------------------------
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) {
      this.vx += dir * C.ACCEL * (this.grounded ? 1 : C.AIR_ACCEL) * dt;
      if (Math.abs(this.vx) > C.MAX_SPEED) this.vx = Math.sign(this.vx) * C.MAX_SPEED;
    } else if (this.grounded) {
      // Rolling to a stop. Expressed as a rate, so it does not depend on dt.
      this.vx -= this.vx * Math.min(1, C.GROUND_FRICTION * dt);
    }

    // --- the jump ---------------------------------------------------------
    //
    // takeJump consumes a PRESS. Reading a held button here instead would make
    // the ball bounce the instant it touched anything, for ever.
    if (input.takeJump()) this.buffer = C.BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);

    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = -C.JUMP_V;
      // Off a mover, take its speed with us. Without this, jumping off a moving
      // platform feels broken in a way players notice and cannot name.
      if (this.platform) this.vx += this.platform.vx;
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.platform = null;
      this.jumped = true;
      this.everJumped = true;
    }

    // --- move, and be pushed back out ------------------------------------
    const contacts = step(this, level, dt, C);

    // Grounded is DERIVED from the contacts, never set by the terrain. That is
    // what makes standing on a slope, on a crate and on a moving platform all
    // work with no special case for any of them.
    let grounded = false, platform = null;
    for (const c of contacts) {
      if (c.ny < C.GROUND_NY) {
        grounded = true;
        if (c.seg.owner) platform = c.seg.owner;
      }
    }
    this.grounded = grounded;
    this.platform = platform;
    this.coyote = grounded ? C.COYOTE : Math.max(0, this.coyote - dt);

    this.spin += (this.vx / this.r) * dt;
  }
}
