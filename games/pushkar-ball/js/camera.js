/**
 * camera.js — what the player can see.
 *
 * Horizontally it follows closely, with a lookahead proportional to speed so a
 * fast ball can see what it is about to hit. Vertically it follows slowly and
 * only outside a deadzone: a camera that tracks every jump exactly is
 * nauseating, and it also hides the jump, since the ball then never appears to
 * leave the middle of the screen. That second half is not only feel — it is
 * what lets a browser suite measure a jump by watching the ball rise on the
 * screen, with no test-only code anywhere in the game.
 *
 * DOM-free, like config, physics, levels and player. It is handed the view size
 * in world units rather than reading the window, which is what lets node ask it
 * where it would point.
 */
import { CONFIG } from './config.js';
// Only for where the control band starts. ui.js is DOM-free apart from its
// drawing functions, so importing it here costs this module nothing.
import { Buttons } from './ui.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Camera {
  /**
   * How far below the ball to aim, in world units, for a given screen.
   *
   * Pure, static, and derived rather than tuned — which is the whole reason
   * this is a function and not a number in config.js. Two things want to
   * decide where the ball sits, and they disagree:
   *
   *   - GROUND_AT wants a resting ball's feet a fixed FRACTION of the way
   *     down, so the horizon looks the same on a phone and a monitor.
   *   - The thumb buttons want the ball above them by GROUND_CLEAR, and they
   *     occupy a fixed number of PIXELS regardless of screen size — 124px,
   *     which is 10% of a tall window and 44% of a 280px one.
   *
   * So the fraction is honoured where there is room and abandoned where there
   * is not, and the buttons always win. Whichever target is higher up the
   * screen is the one used, because both are lower bounds on how high the ball
   * must be.
   *
   * Working: a settled camera rests at `ball.y + BIAS - DEADZONE_Y`, so a
   * resting ball's feet land at `cssH/2 + (r - (BIAS - DEADZONE_Y)) * scale`.
   * Setting that equal to the target and solving for BIAS gives the line
   * below.
   *
   * @param cssH   screen height in CSS pixels
   * @param scale  world units to CSS pixels, i.e. cssH / VIEW_H
   * @param ballR  the ball's collision radius, in world units
   * @param cssW   screen width, only so the buttons can be asked where they are
   */
  static biasFor(cssH, scale, ballR, cssW) {
    const C = CONFIG.CAMERA;
    const wanted = C.GROUND_AT * cssH;
    const allowed = Buttons.topEdge(cssW, cssH) - C.GROUND_CLEAR;
    const feet = Math.min(wanted, allowed);
    return ballR - (feet - cssH / 2) / scale + C.DEADZONE_Y;
  }

  constructor(level) {
    this.level = level;

    // A sane default so a camera works the moment it is constructed, and so
    // every offline suite that never mentions a screen still gets sensible
    // behaviour. main.js overwrites it on every resize with the value
    // `biasFor` derives for the actual screen.
    this.biasY = CONFIG.CAMERA.DEADZONE_Y + CONFIG.BALL.R;
    // Starting on the spawn rather than at the origin, or the first frame of
    // every level is a swoop across the map — and starting exactly where a
    // settled camera rests, or it is a small swoop instead of a large one.
    // That is `snap`'s whole argument, so this calls `snap` rather than
    // repeating its expression: the resting offset is written down once. The
    // spawn is `{x, y}`, which is all `snap` reads, and `this.level` is
    // assigned first because `snap` may want it.
    this.snap(level.spawn);

    // The reveal in progress, if any: where to lean and for how much longer.
    // See `reveal`.
    this.revealX = 0;
    this.revealLeft = 0;
  }

  /**
   * Lean toward world x `x` for CAMERA.REVEAL_TIME, then come back.
   *
   * For a door or bridge the player has just opened somewhere off the screen
   * — level.js reports those in `level.opened` and main.js passes them on.
   * A new reveal replaces one in progress rather than queueing behind it:
   * the latest thing the player did is the one worth showing.
   *
   * Only the horizontal target changes, and only in `update`; nothing here
   * touches the ball or the level, so the simulation cannot tell a reveal
   * happened.
   */
  reveal(x) {
    this.revealX = x;
    this.revealLeft = CONFIG.CAMERA.REVEAL_TIME;
  }

  /**
   * Jump straight to the ball, with no easing at all.
   *
   * For a respawn. Letting the camera lerp back from wherever the ball fell to
   * the start of the level is a long swoop across the scenery, during which the
   * ball is already rolling and already being steered from somewhere the player
   * cannot see.
   *
   * The vertical is NOT simply `ball.y`, and that is not an oversight to be
   * tidied away. `update` aims `biasY` below the ball and stops as soon as it
   * is within DEADZONE_Y of that, and gravity always brings a ball down into
   * that slack from above — so a settled camera rests at
   * `ball.y + biasY - DEADZONE_Y`, not on the ball. Snapping to `ball.y`
   * would put the camera somewhere `update` immediately eases away from, so
   * every respawn would end with a small glide: exactly the easing this
   * function exists to avoid, and about to happen dozens of times a level
   * once there are hazards to die on. Written as the expression rather than
   * the number it currently comes to, so that retuning either value in
   * config.js keeps snapping and settling in agreement.
   *
   * It also ends any reveal in progress. A respawn has just shut every door
   * and bridge the senders were holding open (`level.resetSenders`), so a
   * reveal still running would lean the camera toward a door that is closed
   * again and that the player, from where they now stand, did not open.
   */
  snap(ball) {
    this.x = ball.x;
    this.y = ball.y + this.biasY - CONFIG.CAMERA.DEADZONE_Y;
    this.revealLeft = 0;
  }

  /** @param viewW,viewH the visible world, in world units */
  update(dt, ball, viewW, viewH) {
    const C = CONFIG.CAMERA;

    let tx = ball.x + ball.vx * C.LOOKAHEAD;

    // A reveal aims halfway between where the camera would be and the thing
    // being shown, not AT the thing: halfway keeps both on screen whenever
    // they fit, where aiming at the door would put the ball off the edge.
    // `room` is how far the camera may stray from the ball and still keep it
    // REVEAL_MARGIN inside the view. If the point is already in sight of the
    // normal target, there is nothing to show and the target is untouched.
    const room = viewW / 2 - C.REVEAL_MARGIN;
    const revealing = this.revealLeft > 0;
    if (revealing) {
      this.revealLeft -= dt;
      if (Math.abs(this.revealX - tx) > room) {
        tx = clamp((tx + this.revealX) / 2, ball.x - room, ball.x + room);
      }
    }

    // Frame-rate-independent lerp. A plain `x += (t - x) * k` moves further
    // per second at 120fps than at 30, which makes the camera's feel depend on
    // the phone. This form does not, and it costs one exp() a step. The same
    // lerp carries the camera out to a reveal and back from it, so neither
    // is a cut.
    this.x += (tx - this.x) * (1 - Math.exp(-C.LERP * dt));

    // The target is clamped near the ball, but a lerp toward it trails the
    // ball, so a ball rolling hard away from the point being shown could
    // still outrun the margin. Only while revealing: the normal follow never
    // comes near this, and leaving it alone keeps it exactly as it was.
    if (revealing) this.x = clamp(this.x, ball.x - room, ball.x + room);

    // The camera wants to be `biasY` below the ball, and the deadzone is slack
    // around that, not around the ball itself. Applying the deadzone to the
    // ball's own y is what left a grounded ball a full deadzone low on screen:
    // gravity always brings the ball down into the deadzone from above, so it
    // always settled at its lower edge, which on a short phone is inside the
    // band where the on-screen buttons are drawn.
    const want = ball.y + this.biasY;
    const dy = want - this.y;
    if (Math.abs(dy) > C.DEADZONE_Y) {
      // Chase the edge of the deadzone, not the target. Chasing the target
      // would make the camera lurch the moment the deadzone was crossed.
      const target = want - Math.sign(dy) * C.DEADZONE_Y;
      this.y += (target - this.y) * (1 - Math.exp(-C.LERP_Y * dt));
    } else if (ball.grounded) {
      // Inside the deadzone, a ball on the ground brings the camera to rest:
      // the same place a settled camera rests, one deadzone above the aim
      // point. Without this, a ball that has climbed out of a dip keeps the
      // camera where the dip left it, low by however far it climbed, for as
      // long as it stays — so it sat 40 too high on the screen at level
      // thirteen's room B door, and its button's cap, which has to be above a
      // jump, was cut off the top of a 740x280 view. Only on the ground, so
      // a jump still moves the camera not at all.
      const rest = want - C.DEADZONE_Y;
      this.y += (rest - this.y) * (1 - Math.exp(-C.LERP_Y * dt));
    }

    // A hard floor under the slow follow above. `this.y` is the middle of the
    // view, so the ball's centre is `viewH / 2 + (ball.y - this.y)` from the
    // view's top; holding that at or above TOP_CLEAR means capping this.y.
    // Only ever moves the camera UP, and only when the ball has climbed
    // faster than LERP_Y can ease — an ordinary jump stays well clear of it,
    // which camera.mjs proves at every screen size.
    this.y = Math.min(this.y, ball.y + viewH / 2 - C.TOP_CLEAR);

    // Never show outside the level. When the level is smaller than the view in
    // an axis — which a short window can manage — centre on it instead, or the
    // clamp below would have its limits the wrong way round and would pin the
    // camera to whichever bound it tested last.
    const b = this.level.bounds;
    this.x = b.w < viewW ? b.w / 2 : clamp(this.x, viewW / 2, b.w - viewW / 2);
    this.y = b.h < viewH ? b.h / 2 : clamp(this.y, viewH / 2, b.h - viewH / 2);
  }
}
