/**
 * input.js — Touch controls.
 *
 * Milestone 1 provides one thing: a virtual joystick on the left half of the
 * screen. It is deliberately forgiving for small hands:
 *
 *   - You can start the drag ANYWHERE in the left half; the ring jumps to
 *     wherever the thumb landed instead of demanding a precise hit.
 *   - When nothing is being touched, the ring sits in a fixed resting spot
 *     so it is always visible and obvious.
 *   - A dead zone swallows tiny wobbles so the character doesn't jitter.
 *
 * All coordinates here are CSS pixels relative to the canvas element, which
 * is the same space the HUD is drawn in.
 */

import { CONFIG } from './config.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;

    // Joystick state
    this.stickPointerId = null;   // which finger owns the joystick
    this.origin = { x: 0, y: 0 }; // centre of the ring right now
    this.current = { x: 0, y: 0 };// where that finger is

    // Output, read by the game each frame
    this.vector = { x: 0, y: 0, mag: 0 };

    this._bind();
  }

  // ---------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------
  _bind() {
    const c = this.canvas;

    // Pointer Events cover touch on iOS 13+ and Android Chrome, and also give
    // us mouse support for free when testing on a desktop.
    c.addEventListener('pointerdown', (e) => this._onDown(e));
    c.addEventListener('pointermove', (e) => this._onMove(e));
    c.addEventListener('pointerup', (e) => this._onUp(e));
    c.addEventListener('pointercancel', (e) => this._onUp(e));
    c.addEventListener('pointerleave', (e) => this._onUp(e));

    // Belt and braces: stop iOS Safari from scrolling, pinch-zooming or
    // double-tap-zooming the page while playing.
    const swallow = (e) => e.preventDefault();
    c.addEventListener('touchstart', swallow, { passive: false });
    c.addEventListener('touchmove', swallow, { passive: false });
    c.addEventListener('contextmenu', swallow);
  }

  /** Convert a pointer event into canvas-relative CSS pixels. */
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------------------------------------------------------------------
  // Pointer handlers
  // ---------------------------------------------------------------------
  _onDown(e) {
    const p = this._pos(e);
    const halfWidth = this.canvas.clientWidth / 2;

    // Left half of the screen drives the joystick.
    // (The right half is reserved for action buttons in milestone 2.)
    if (this.stickPointerId === null && p.x < halfWidth) {
      this.stickPointerId = e.pointerId;
      this.origin = this._clampOriginToScreen(p);
      this.current = p;
      this._recalc();
      // Keep receiving moves even if the finger slides outside the canvas.
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }

  _onMove(e) {
    if (e.pointerId !== this.stickPointerId) return;
    this.current = this._pos(e);
    this._recalc();
  }

  _onUp(e) {
    if (e.pointerId !== this.stickPointerId) return;
    this.stickPointerId = null;
    this.vector = { x: 0, y: 0, mag: 0 };
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  /**
   * Keep the joystick ring fully on screen even if the thumb lands right at
   * the very edge, so it never gets visually clipped.
   */
  _clampOriginToScreen(p) {
    const pad = CONFIG.JOYSTICK.BASE_RADIUS + 6;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: Math.min(Math.max(p.x, pad), w / 2 - 4),
      y: Math.min(Math.max(p.y, pad), h - pad),
    };
  }

  /** Turn (origin -> current) into a normalised direction + strength. */
  _recalc() {
    const { MAX_PUSH, DEAD_ZONE } = CONFIG.JOYSTICK;

    let dx = this.current.x - this.origin.x;
    let dy = this.current.y - this.origin.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.0001) {
      this.vector = { x: 0, y: 0, mag: 0 };
      return;
    }

    // Strength grows with distance and caps out at MAX_PUSH.
    let mag = Math.min(dist / MAX_PUSH, 1);
    if (mag < DEAD_ZONE) {
      this.vector = { x: 0, y: 0, mag: 0 };
      return;
    }

    // Rescale so the character starts at a crawl just past the dead zone
    // rather than jumping straight to a jog.
    mag = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);

    this.vector = { x: dx / dist, y: dy / dist, mag };
  }

  // ---------------------------------------------------------------------
  // Drawing helpers (used by the HUD renderer)
  // ---------------------------------------------------------------------

  /** Is a finger currently on the stick? */
  get isActive() {
    return this.stickPointerId !== null;
  }

  /** Where the ring should be drawn: under the thumb, or at rest. */
  getRingCenter() {
    if (this.isActive) return this.origin;
    return {
      x: CONFIG.JOYSTICK.MARGIN_X,
      y: this.canvas.clientHeight - CONFIG.JOYSTICK.MARGIN_Y,
    };
  }

  /** Where the thumb dot should be drawn. */
  getKnobCenter() {
    const centre = this.getRingCenter();
    if (!this.isActive) return centre;

    const dx = this.current.x - this.origin.x;
    const dy = this.current.y - this.origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) return centre;

    const capped = Math.min(dist, CONFIG.JOYSTICK.MAX_PUSH);
    return {
      x: centre.x + (dx / dist) * capped,
      y: centre.y + (dy / dist) * capped,
    };
  }
}
