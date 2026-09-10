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

    this.dying = 0;         // seconds of deflating left
    this.reviving = 0;      // seconds of re-inflating left

    // Touched the flag: the level is over. Latched and never cleared — a new
    // level means a new ball, which is why there is nothing anywhere that
    // sets this back to false. See the goal check in `update`.
    this.won = false;

    // Where a respawn puts the ball: the spawn to begin with, then the last
    // checkpoint reached. Set by whoever constructs the ball, because the ball
    // is handed its position and not the level.
    this.home = { x, y };

    // Every way of failing, counted together. This used to be `falls`, when
    // falling out of the world was the only way to fail; a hazard is not a
    // fall, and two counters for one idea is how they drift apart.
    this.deaths = 0;
  }

  /**
   * Send the ball back to its home — the last checkpoint, or the spawn.
   *
   * This is the whole of failing, and it is meant to be: no lives to run out,
   * no screen to dismiss, no wait beyond the deflate. Being handed the level
   * back is the least discouraging thing that can happen to a six-year-old,
   * and it is what the hub's rules ask for.
   *
   * Every piece of carried state has to go, not just position. A leftover
   * upward velocity launches the ball off the respawn point; a leftover jump
   * in `buffer` fires the instant it lands; a leftover `platform` makes it
   * ride a platform elsewhere in the level.
   */
  respawn() {
    this.x = this.home.x;
    this.y = this.home.y;
    this.vx = 0; this.vy = 0;
    this.spin = 0;
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.platform = null;
    // The deflate's own timers included. Today's only caller has just zeroed
    // `dying` itself, so this changes nothing — but `respawn` means "put the
    // ball in a known state", and a second caller (a level transition, say)
    // that inherited a half-spent deflate would be exactly the class of bug
    // the paragraph above warns about, arriving from the other side.
    this.dying = 0;
    this.reviving = 0;
  }

  /**
   * Fail. The ball deflates where it stands, then re-inflates at home.
   *
   * Ignored while already dying, which matters more than it looks: a ball that
   * dies on a spike is still overlapping that spike, and without this guard it
   * would re-trigger every single step and never finish deflating.
   *
   * Ignored once the level is WON, too, and for two separate reasons. The
   * gentle one is that the win is the reward and outranks the hazard: nothing
   * should be able to take it back after the flag has been touched. The
   * mechanical one is a freeze. `dying` is decremented only in `update`, and
   * main.js stops updating the ball once the level is won — so a deflate begun
   * on the winning step would never finish, and the ball would sit behind the
   * results panel as a flat puddle for as long as the panel was up. Guarding
   * here rather than in the caller means every future way of failing — a saw,
   * a crusher, the fall out of the world at the bottom of this file — inherits
   * it without having to remember to.
   */
  die() {
    if (this.won) return;
    if (this.dying > 0) return;
    this.dying = CONFIG.DEFLATE.TIME;
    this.reviving = 0;
    this.vx = 0; this.vy = 0;
    this.deaths++;
  }

  /**
   * How the ball should be drawn right now: `sx`/`sy` multipliers, 1 when it
   * is whole. Deflating flattens it, re-inflating swells it back.
   *
   * State, not drawing — which is why it lives here and not in main.js, and
   * why it returns numbers rather than touching a context. It is here at all
   * so that it can be asserted in node: the squash happens off the bottom of
   * the screen when a ball falls out of the world, so until a spike kills one
   * in plain view there is nothing anywhere that can watch it happen.
   *
   * None of this touches `this.r`. That is the collision radius, and the
   * physics must not care what the drawing is doing.
   */
  squash() {
    const D = CONFIG.DEFLATE;
    if (this.dying > 0) {
      const t = 1 - this.dying / D.TIME;       // 0 at death, 1 at the end
      return { sx: 1 + D.SPREAD * t, sy: 1 - D.SQUASH * t };
    }
    if (this.reviving > 0) {
      const t = 1 - this.reviving / D.INFLATE; // 0 on arrival, 1 when done
      // One scale for both axes, so it comes back ROUND rather than as an
      // oval that snaps circular on the last frame.
      const s = D.INFLATE_FROM + (1 - D.INFLATE_FROM) * t;
      return { sx: s, sy: s };
    }
    return { sx: 1, sy: 1 };
  }

  update(dt, input, level) {
    const C = CONFIG;
    this.jumped = false;

    // --- deflating --------------------------------------------------------
    //
    // While the ball is deflating it is not simulated at all: no gravity, no
    // input, no resolution. Everything is deliberate. Gravity would drag the
    // squashed ball through the floor it died on; input would let the player
    // steer a corpse; and resolution against a spike it is still overlapping
    // would fight the death every step.
    //
    // The input is still DRAINED, though — `takeJump` is called and its result
    // thrown away — because a press held through the deflate would otherwise
    // sit in the buffer and fire the instant the ball came back, and the level
    // would resume with a jump nobody asked for.
    if (this.dying > 0) {
      input.takeJump();
      this.dying -= dt;
      if (this.dying <= 0) {
        this.dying = 0;
        this.respawn();
        this.reviving = C.DEFLATE.INFLATE;
      }
      return;
    }
    if (this.reviving > 0) this.reviving = Math.max(0, this.reviving - dt);

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

    // --- the flag ---------------------------------------------------------
    //
    // Checked BEFORE the hazards, and that order is the whole of it. A ball
    // that reaches the flag while overlapping a spike must win rather than
    // die: the flag is the reward and it outranks the hazard. Put the hazard
    // first and which of the two happened would depend on how a level was
    // authored — a flag planted a little too close to a spike patch would
    // sometimes end the level and sometimes deflate the ball, with nothing
    // anywhere to explain the difference to a six-year-old.
    //
    // `level.goal` is null on a level that has none, and `won` must stay false
    // for those rather than measuring the distance to `undefined` — which
    // would come out NaN, compare false, and quietly work until the day the
    // arithmetic changed.
    if (!this.won && level.goal) {
      const g = CONFIG.GOAL.R;
      if ((this.x - level.goal.x) ** 2 + (this.y - level.goal.y) ** 2 <= g * g) {
        this.won = true;
        // Whole again, the instant it wins. Nothing calls `update` on a ball
        // whose level is over, so a half-spent re-inflate would freeze exactly
        // where it was and the ball would sit behind the results panel at
        // three-quarter size with the screen still half dimmed — for as long
        // as the panel was up. `dying` cannot be positive here at all, because
        // a deflating ball returns from `update` long before this line.
        this.reviving = 0;
      }
    }

    // --- hazards ----------------------------------------------------------
    //
    // Checked after movement and resolution, so the ball is asked about where
    // it actually ended up rather than where it was heading. Checked before
    // checkpoints, so a checkpoint standing in a patch of spikes cannot be
    // armed by the same step that kills you — which would make failing there
    // permanent.
    if (level.hitsHazard(this)) this.die();

    // --- checkpoints ------------------------------------------------------
    //
    // Checked after the move, so the checkpoint the ball is standing in this
    // step is the one that arms — and after the push, so a checkpoint reached
    // while shoving a crate still counts.
    // A checkpoint's `y` is its GROUND ANCHOR — the flag is drawn upward from
    // it — so home is that anchor lifted by the ball's radius and a little
    // daylight, which is where a ball RESTS on that floor. Homing to the
    // anchor itself puts the ball's centre exactly on the ground segment,
    // where the resolver has nothing to eject it out of: the ball falls
    // through the floor, dies, comes back inside the floor, and the level is
    // destroyed with no way out at all. Measured at 21 deaths in 20 seconds
    // before this line existed.
    const reached = level.takeCheckpoint(this.x, this.y);
    if (reached) {
      this.home.x = reached.x;
      this.home.y = reached.y - this.r - C.CHECKPOINT.CLEARANCE;
    }

    // --- fell out of the world -------------------------------------------
    //
    // `bounds.h` is exactly the lowest the camera is ever allowed to show, so
    // a ball below it is off the bottom of the screen and is never coming back
    // under its own power. It fails the same way a spike fails it, through the
    // same `die`, so there is one fail path and not two.
    if (this.y - this.r > level.bounds.h) this.die();
  }
}
