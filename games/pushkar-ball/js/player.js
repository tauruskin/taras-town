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
    this.falls = 0;         // how many times it has dropped out of the level
  }

  /**
   * Back to the start of the level, as if nothing had happened.
   *
   * This is the whole of failing, and it is meant to be: no lives to run out,
   * no screen to dismiss, no wait. Falling down a hole and being handed the
   * level back immediately is the least discouraging thing that can happen to
   * a six-year-old, and it is what the hub's rules ask for — where a game can
   * be failed, failing is harmless and instantly undone.
   *
   * Every piece of carried state has to go, not just position. A leftover
   * upward velocity launches the ball off the spawn point; a leftover jump in
   * `buffer` fires the instant it lands; a leftover `platform` makes it ride a
   * platform elsewhere in the level.
   */
  respawn(level) {
    this.x = level.spawn.x;
    this.y = level.spawn.y;
    this.vx = 0; this.vy = 0;
    this.spin = 0;
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.platform = null;
    this.falls++;
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

    // --- shove a crate ----------------------------------------------------
    //
    // A push is a SIDE-ON contact with something movable while the player is
    // asking to go that way. Both halves matter: without the direction the
    // ball would drag a crate around merely by resting against it, and without
    // the side-on test it would push the crate along while standing on top of
    // it, which looks like the crate is haunted.
    //
    // The crate slides at its own speed rather than inheriting the ball's, so
    // it feels heavy and stays controllable — and because it is slower than
    // the ball, the ball stays pressed against it and the push continues for
    // as long as the button is held.
    if (dir) {
      for (const c of contacts) {
        const crate = c.seg.owner;
        if (!crate || !crate.movable) continue;
        // c.nx points from the crate towards the ball, so pushing right means
        // being on the crate's left, where nx is negative.
        if (Math.abs(c.nx) < C.CRATE.PUSH_NX) continue;
        if (Math.sign(c.nx) === Math.sign(dir)) continue;

        const moved = crate.tryPush(dir * C.CRATE.PUSH_SPEED * dt, dt, level.solidsFor(crate), C);
        if (moved) {
          // Travel WITH the crate, and at its speed. Without this the push
          // stutters badly and almost stops: resolution takes the ball's speed
          // away on contact, so the crate slides a millimetre out of reach, the
          // ball spends ten steps accelerating back into it, and a crate that
          // should slide at 150px/s crawls at twenty. Moving with it keeps the
          // contact alive, and being held to the crate's speed is what makes a
          // crate feel heavy in the hand instead of merely slow.
          this.x += moved;
          this.vx = dir * C.CRATE.PUSH_SPEED;
        }
        break;
      }
    }

    // --- fell out of the world -------------------------------------------
    //
    // `bounds.h` is exactly the lowest the camera is ever allowed to show, so a
    // ball below it is off the bottom of the screen and is never coming back
    // under its own power. No margin needed and none wanted: a margin here is
    // just a delay before the level is handed back.
    if (this.y - this.r > level.bounds.h) this.respawn(level);
  }
}
