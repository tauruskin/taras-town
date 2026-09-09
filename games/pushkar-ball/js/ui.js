/**
 * ui.js — where every on-screen button is, and what it looks like.
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
 * Only `draw` touches a canvas context, and it is handed one — which is what
 * lets Node import this file and ask where anything is without a browser.
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
