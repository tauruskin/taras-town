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

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Camera {
  constructor(level) {
    this.level = level;
    // Starting on the spawn rather than at the origin, or the first frame of
    // every level is a swoop across the map.
    this.x = level.spawn.x;
    this.y = level.spawn.y;
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
   * tidied away. `update` aims BIAS_Y below the ball and stops as soon as it
   * is within DEADZONE_Y of that, and gravity always brings a ball down into
   * that slack from above — so a settled camera rests at
   * `ball.y + BIAS_Y - DEADZONE_Y`, not on the ball. Snapping to `ball.y`
   * would put the camera somewhere `update` immediately eases away from, so
   * every respawn would end with a small glide: exactly the easing this
   * function exists to avoid, and about to happen dozens of times a level
   * once there are hazards to die on. Written as the expression rather than
   * the number it currently comes to, so that retuning either value in
   * config.js keeps snapping and settling in agreement.
   */
  snap(ball) {
    const C = CONFIG.CAMERA;
    this.x = ball.x;
    this.y = ball.y + C.BIAS_Y - C.DEADZONE_Y;
  }

  /** @param viewW,viewH the visible world, in world units */
  update(dt, ball, viewW, viewH) {
    const C = CONFIG.CAMERA;

    const tx = ball.x + ball.vx * C.LOOKAHEAD;
    // Frame-rate-independent lerp. A plain `x += (t - x) * k` moves further
    // per second at 120fps than at 30, which makes the camera's feel depend on
    // the phone. This form does not, and it costs one exp() a step.
    this.x += (tx - this.x) * (1 - Math.exp(-C.LERP * dt));

    // The camera wants to be BIAS_Y below the ball, and the deadzone is slack
    // around that, not around the ball itself. Applying the deadzone to the
    // ball's own y is what left a grounded ball a full deadzone low on screen:
    // gravity always brings the ball down into the deadzone from above, so it
    // always settled at its lower edge, which on a short phone is inside the
    // band where the on-screen buttons are drawn.
    const want = ball.y + C.BIAS_Y;
    const dy = want - this.y;
    if (Math.abs(dy) > C.DEADZONE_Y) {
      // Chase the edge of the deadzone, not the target. Chasing the target
      // would make the camera lurch the moment the deadzone was crossed.
      const target = want - Math.sign(dy) * C.DEADZONE_Y;
      this.y += (target - this.y) * (1 - Math.exp(-C.LERP_Y * dt));
    }

    // Never show outside the level. When the level is smaller than the view in
    // an axis — which a short window can manage — centre on it instead, or the
    // clamp below would have its limits the wrong way round and would pin the
    // camera to whichever bound it tested last.
    const b = this.level.bounds;
    this.x = b.w < viewW ? b.w / 2 : clamp(this.x, viewW / 2, b.w - viewW / 2);
    this.y = b.h < viewH ? b.h / 2 : clamp(this.y, viewH / 2, b.h - viewH / 2);
  }
}
