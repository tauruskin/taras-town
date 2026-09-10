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

/**
 * Panel — the results panel shown when a level is won.
 *
 * Its geometry lives here for exactly the reason the control buttons' does:
 * the tests ask for it, and no test may ever contain a coordinate. Positions
 * are in CSS pixels from the top-left of the canvas.
 *
 * There are two buttons and no more. A grid button to level select is missing
 * on purpose — level select is phase 4, and a button that goes nowhere is
 * worse than no button. Retry is the curved arrow; the house goes back to the
 * hub. Both are visible the whole time the panel is, because the panel
 * advances to the next level by itself and a child who wants to replay the
 * level he just enjoyed must not be carried onward regardless.
 *
 * Everything here except `draw` is arithmetic, and nothing measures anything:
 * measuring text needs a context, and this file has to stay importable in Node
 * with no browser anywhere. So the digit's box is DECLARED in config.js and
 * the drawing is made to fit it, rather than the other way round.
 */
export const Panel = {
  /**
   * The panel itself, centred, and clamped so it always fits.
   *
   * Clamped rather than scaled: a panel that shrank would take its buttons and
   * its digit down with it, and both of those are sized for a thumb and an eye
   * rather than for the window. What the clamp protects against is a screen
   * shorter than the panel, where the honest answer is to lose the margin.
   */
  box(w, h) {
    const R = CONFIG.RESULTS;
    const pw = Math.min(R.PANEL_W, w - 24);
    const ph = Math.min(R.PANEL_H, h - 24);
    return { x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph };
  },

  /** Replay this level. Left of centre, low in the panel. */
  retry(w, h) {
    const R = CONFIG.RESULTS;
    const b = Panel.box(w, h);
    return {
      x: b.x + b.w / 2 - R.BUTTON_R - R.GAP / 2,
      y: b.y + b.h - R.BUTTON_R - R.BUTTON_LIFT,
      r: R.BUTTON_R,
    };
  },

  /** Back to the hub's tile screen. Right of centre, level with retry. */
  home(w, h) {
    const R = CONFIG.RESULTS;
    const b = Panel.box(w, h);
    return {
      x: b.x + b.w / 2 + R.BUTTON_R + R.GAP / 2,
      y: b.y + b.h - R.BUTTON_R - R.BUTTON_LIFT,
      r: R.BUTTON_R,
    };
  },

  /** Where the i'th of the three stars is. */
  star(i, w, h) {
    const R = CONFIG.RESULTS;
    const b = Panel.box(w, h);
    return {
      x: b.x + b.w / 2 + (i - 1) * R.STAR_R * R.STAR_SPACING,
      y: b.y + R.STAR_TOP,
      r: R.STAR_R,
    };
  },

  /**
   * Where the level number goes, and how tall it is.
   *
   * A box and not just a point, so a test can check it clears the buttons and
   * stays on the panel without measuring any text — which is the only way to
   * check it at all in Node. `size` is the font's height in CSS pixels, and
   * the digit is drawn centred on `x` and middled on `y`, so its band is `y`
   * plus or minus half of `size`.
   */
  number(w, h) {
    const R = CONFIG.RESULTS;
    const b = Panel.box(w, h);
    return { x: b.x + b.w / 2, y: b.y + R.NUMBER_Y, size: R.NUMBER_SIZE };
  },

  /** Which of the panel's buttons is at this point, or null. */
  at(px, py, w, h) {
    for (const name of PANEL_NAMES) {
      const b = Panel[name](w, h);
      const hit = b.r * CONFIG.UI.HIT;
      if ((px - b.x) ** 2 + (py - b.y) ** 2 <= hit * hit) return name;
    }
    return null;
  },

  /**
   * Draw it.
   *
   * @param level the level's own id, as a digit. The one kind of text he reads
   *              reliably, and the only text this game draws anywhere.
   * @param stars how many of three are earned. Phase 2 has no gems to collect,
   *              so finishing earns one; the other two arrive with gems in
   *              phase 3 and are drawn empty until then. Empty rather than
   *              absent, so the picture already says there is more to get.
   */
  draw(ctx, w, h, { level, stars }) {
    const C = CONFIG.COLOURS;
    const b = Panel.box(w, h);

    ctx.fillStyle = C.PANEL;
    roundRect(ctx, b.x, b.y, b.w, b.h, 22);
    ctx.fill();
    ctx.strokeStyle = C.PANEL_EDGE;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Three stars, filled from the left.
    for (let i = 0; i < 3; i++) {
      const s = Panel.star(i, w, h);
      star(ctx, s.x, s.y, s.r, i < stars ? C.STAR_ON : C.STAR_OFF);
    }

    // The level number. `textAlign`/`textBaseline` are set every time rather
    // than once at the top of the file, because this context is shared with
    // the whole of the world drawing and cannot be assumed to be in any
    // particular state — and because setting them here is what makes
    // `Panel.number`'s promise (centred on x, middled on y) actually true,
    // which is what the button suite is checking against.
    const n = Panel.number(w, h);
    ctx.fillStyle = C.PANEL_INK;
    ctx.font = `bold ${n.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), n.x, n.y);

    // Retry: a curved arrow, drawn as an arc with a head on its end. Home: a
    // house. Pictures, never words.
    const r = Panel.retry(w, h);
    circleButton(ctx, r, C);
    ctx.strokeStyle = C.PANEL_INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * 0.5, Math.PI * 0.35, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r.x + r.r * 0.5, r.y - r.r * 0.32);
    ctx.lineTo(r.x + r.r * 0.16, r.y - r.r * 0.2);
    ctx.lineTo(r.x + r.r * 0.52, r.y + r.r * 0.06);
    ctx.closePath();
    ctx.fillStyle = C.PANEL_INK;
    ctx.fill();

    // The house: a wide roof, a square body, and a door punched out of it.
    //
    // Drawn as three pieces rather than as the one clever seven-point polygon
    // it started as. That version was a roof over a narrow stem, and on screen
    // it read as a fat arrow pointing up — which is the picture the JUMP
    // button already uses, on a panel whose other button is also an arrow. The
    // door is what makes it unmistakably a house, and a picture a child has to
    // work out is a picture that has failed.
    const hm = Panel.home(w, h);
    circleButton(ctx, hm, C);
    ctx.fillStyle = C.PANEL_INK;
    ctx.beginPath();
    ctx.moveTo(hm.x - hm.r * 0.62, hm.y - hm.r * 0.06);
    ctx.lineTo(hm.x, hm.y - hm.r * 0.58);
    ctx.lineTo(hm.x + hm.r * 0.62, hm.y - hm.r * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(hm.x - hm.r * 0.42, hm.y - hm.r * 0.1, hm.r * 0.84, hm.r * 0.62);
    // The door, in the panel's own colour so it reads as a hole in the house
    // rather than a mark on it. STAR_OFF and not PANEL: this is punched out of
    // the disc the picture sits on, and that disc is the grey one.
    ctx.fillStyle = C.STAR_OFF;
    ctx.fillRect(hm.x - hm.r * 0.14, hm.y + hm.r * 0.18, hm.r * 0.28, hm.r * 0.34);
  },
};

// The order Panel.at walks. Same shape as NAMES above, and the same reason:
// it only matters if two of them overlap, which the button suite forbids on
// every screen size.
const PANEL_NAMES = ['retry', 'home'];

/** The disc a panel button's picture sits on. */
function circleButton(ctx, b, C) {
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = C.STAR_OFF;
  ctx.fill();
}

/** A rounded rectangle, as a path — the caller fills or strokes it. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A five-pointed star, filled. Ten points, alternating in and out. */
function star(ctx, cx, cy, r, colour) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}
