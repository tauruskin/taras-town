/**
 * ui.js — the screen-space layer: where every on-screen button is, what it
 * looks like, and whatever else is drawn over the world rather than in it.
 *
 * EVERY button position in this game comes from here, and no test may ever
 * contain a button coordinate. Taras Town broke nine suites at once by writing
 * coordinates into them, and it fails silently: the tap lands on the world
 * behind and something passes or fails for the wrong reason.
 *
 * Positions are in CSS pixels from the top-left of the canvas, which is what
 * both a pointer event and the DevTools Protocol talk in. Not world units and
 * not device pixels: the canvas is scaled by devicePixelRatio for sharpness
 * and by canvasHeight/VIEW_H for the world, and neither of those transforms
 * applies to a thumb.
 *
 * Only the drawing functions touch a canvas context, and each is handed one —
 * which is what lets Node import this file and ask where anything is, or how
 * dark the screen should be, without a browser anywhere.
 */
import { CONFIG } from './config.js';

// The order the hit test walks. Only matters if two buttons overlap, which the
// button suite forbids on every screen size, so it is really just a list.
const NAMES = ['left', 'right', 'jump'];

export const Buttons = {
  /** Bottom-left, nearest the corner. */
  left(w, h) {
    const u = CONFIG.UI;
    return { x: u.EDGE + u.BUTTON_R, y: h - u.EDGE - u.BUTTON_R, r: u.BUTTON_R };
  },

  /** Bottom-left, just inboard of `left`. */
  right(w, h) {
    const u = CONFIG.UI;
    return { x: u.EDGE + u.BUTTON_R * 3 + u.GAP, y: h - u.EDGE - u.BUTTON_R, r: u.BUTTON_R };
  },

  /** Bottom-right, and the biggest thing on the screen. */
  jump(w, h) {
    const u = CONFIG.UI;
    return { x: w - u.EDGE - u.JUMP_R, y: h - u.EDGE - u.JUMP_R, r: u.JUMP_R };
  },

  /**
   * The topmost edge of the whole control band, in CSS pixels.
   *
   * Everything below this line is somewhere a thumb rests, so it is what the
   * camera has to keep the ball clear of. Asked of the buttons rather than
   * derived from CONFIG.UI by whoever needs it, for the same reason no test
   * may contain a coordinate: the moment two places compute it, one of them is
   * wrong after the next change to the layout.
   */
  topEdge(w, h) {
    return Math.min(...NAMES.map((n) => {
      const b = Buttons[n](w, h);
      return b.y - b.r;
    }));
  },

  /**
   * Which button is at this point, or null.
   *
   * The hit radius is larger than the drawn one by CONFIG.UI.HIT. A thumb is
   * not a mouse pointer, and a jump that did not happen because the press was
   * four pixels low is indistinguishable from a bug.
   */
  at(px, py, w, h) {
    for (const name of NAMES) {
      const b = Buttons[name](w, h);
      const hit = b.r * CONFIG.UI.HIT;
      if ((px - b.x) ** 2 + (py - b.y) ** 2 <= hit * hit) return name;
    }
    return null;
  },

  /**
   * Draw all three.
   *
   * Called with the canvas in CSS-pixel space — the world transform must be
   * off, or the buttons scale with the level.
   *
   * @param held a Set of the names currently pressed, so a press is visible.
   *             A button that does not react leaves a player unsure whether
   *             the game heard them or the game is broken.
   */
  draw(ctx, w, h, held) {
    const C = CONFIG.COLOURS;
    for (const name of NAMES) {
      const b = Buttons[name](w, h);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = held.has(name) ? C.BUTTON_HELD : C.BUTTON;
      ctx.fill();

      // A picture, never a word. He may not read fluently, so an arrow for
      // each direction, and an arrow pointing up for jump. One triangle,
      // rotated, does all three.
      ctx.save();
      ctx.translate(b.x, b.y);
      if (name === 'left') ctx.rotate(Math.PI);
      if (name === 'jump') ctx.rotate(-Math.PI / 2);
      const s = b.r * 0.44;
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s);
      ctx.lineTo(s * 0.8, 0);
      ctx.lineTo(-s * 0.55, s);
      ctx.closePath();
      ctx.fillStyle = C.BUTTON_MARK;
      ctx.fill();
      ctx.restore();
    }
  },
};

/**
 * Overlay — what is drawn over the whole screen, on top of the world and
 * under the controls.
 *
 * It lives here rather than in main.js because this is the file that owns the
 * screen-space layer, and because splitting the ARITHMETIC from the drawing
 * lets Node ask "how dark should it be right now" with no canvas at all —
 * which is the only reason the dim has an offline test.
 */
export const Overlay = {
  /**
   * How dark the screen should be, 0..1, for a ball in whatever state it is
   * in. 0 whenever nothing is happening, which is almost always.
   *
   * It RISES to DEFLATE.DIM across the deflate, peaks exactly at the respawn,
   * and FALLS back to 0 across the re-inflate. So it is a single hump over one
   * failure, and the peak sits on the one frame where the ball vanishes from
   * the hole and reappears at its checkpoint — which is the frame the camera
   * snaps on. Covering that cut is half the point of the dim; the other half
   * is that failing should visibly happen rather than be a ball that
   * teleported.
   *
   * Note that the two phases are deliberately NOT normalised the same way
   * round here, unlike the squash in main.js's drawBall, where both phases run
   * a `t` from 0 to 1. Here `dying` counts DOWN towards the peak and
   * `reviving` counts DOWN away from it, so the deflate's expression is
   * inverted and the re-inflate's is not. That is the hump, and writing either
   * one to match the other by symmetry breaks it.
   */
  dim(ball) {
    const D = CONFIG.DEFLATE;
    if (ball.dying > 0) return (1 - ball.dying / D.TIME) * D.DIM;
    if (ball.reviving > 0) return (ball.reviving / D.INFLATE) * D.DIM;
    return 0;
  },

  /**
   * Paint that darkness over everything.
   *
   * Called with the canvas in CSS-pixel space and the world transform off, so
   * it covers the whole screen at any zoom, and called BEFORE the buttons so
   * the controls never dim: a control that fades looks broken rather than
   * paused, and this is precisely the moment a child is already jabbing at
   * them.
   *
   * save/restore rather than setting globalAlpha back to 1 by hand. Putting
   * back a literal assumes what the caller's alpha WAS, which is exactly the
   * assumption that stops being true the first time anything else in this
   * layer wants a partial alpha of its own.
   */
  drawDim(ctx, w, h, amount) {
    if (amount <= 0) return;
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.fillStyle = CONFIG.COLOURS.DIM;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },
};
