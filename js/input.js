/**
 * input.js — Touch and keyboard controls.
 *
 * The phone is the real target, so the virtual joystick comes first. It is
 * deliberately forgiving for small hands:
 *
 *   - You can start the drag ANYWHERE in the left half; the ring jumps to
 *     wherever the thumb landed instead of demanding a precise hit.
 *   - When nothing is being touched, the ring sits in a fixed resting spot
 *     so it is always visible and obvious.
 *   - A dead zone swallows tiny wobbles so the character doesn't jitter.
 *
 * Keyboard (W/A/S/D or the arrow keys, plus Space/E for the action button)
 * is supported too, mainly so the game can be tried on a computer. Both
 * feed the same direction vector, so nothing downstream knows or cares
 * which one is being used.
 *
 * All coordinates here are CSS pixels relative to the canvas element, which
 * is the same space the HUD is drawn in.
 */

import { CONFIG } from './config.js';

/**
 * Keyboard movement. W/A/S/D and the arrow keys both work.
 *
 * These produce a direction exactly like the joystick does, rather than being
 * wired separately into walking and driving. That means one control model
 * everywhere: on foot the direction is the way he walks, and in a car it is
 * the heading the car steers towards.
 */
const MOVE_KEYS = {
  w: 'up',    arrowup: 'up',
  s: 'down',  arrowdown: 'down',
  a: 'left',  arrowleft: 'left',
  d: 'right', arrowright: 'right',
};

/** Keys that press the on-screen action button (get in / out of a car). */
const ACTION_KEYS = new Set([' ', 'enter', 'e']);

const ZERO = { x: 0, y: 0, mag: 0 };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;

    // Joystick state
    this.stickPointerId = null;   // which finger owns the joystick
    this.origin = { x: 0, y: 0 }; // centre of the ring right now
    this.current = { x: 0, y: 0 };// where that finger is

    // The joystick's own output. Read `this.vector` instead — it falls back
    // to the keyboard when no thumb is on the stick.
    this._stickVector = { x: 0, y: 0, mag: 0 };

    // Movement keys currently held down, as directions ('up', 'left', ...).
    this.keys = new Set();
    this._actionKeyDown = false;

    // Round action buttons. The game replaces this list every frame with
    // whatever buttons currently apply: { id, x, y, r }.
    this.buttons = [];
    this._buttonPointers = new Map();  // pointerId -> button id (held down)
    this._presses = new Set();         // buttons pressed since last checked

    this._bind();
    this._bindKeys();
  }

  /**
   * Which way the player wants to go this frame.
   *
   * A thumb on the joystick always wins; otherwise the keyboard is used. They
   * are never blended, so holding W while dragging the stick can't fight it.
   */
  get vector() {
    if (this.stickPointerId !== null) return this._stickVector;
    return this._keyVector();
  }

  _keyVector() {
    let x = 0, y = 0;
    if (this.keys.has('left')) x -= 1;
    if (this.keys.has('right')) x += 1;
    if (this.keys.has('up')) y -= 1;     // screen y grows downwards
    if (this.keys.has('down')) y += 1;

    if (x === 0 && y === 0) return ZERO;

    // Normalise so diagonals aren't faster than the straight directions.
    const d = Math.hypot(x, y);
    return { x: x / d, y: y / d, mag: 1 };
  }

  _bindKeys() {
    const onKey = (e, down) => {
      if (e.repeat && down) return;      // ignore auto-repeat while held
      const k = e.key.toLowerCase();

      const dir = MOVE_KEYS[k];
      if (dir) {
        if (down) this.keys.add(dir); else this.keys.delete(dir);
        e.preventDefault();              // stop arrow keys scrolling the page
        return;
      }

      if (ACTION_KEYS.has(k)) {
        // Edge-triggered, exactly like a tap on the on-screen button.
        if (down && !this._actionKeyDown) this._presses.add('action');
        this._actionKeyDown = down;
        e.preventDefault();              // stop Space re-clicking the Play button
      }
    };

    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));

    // If the window loses focus mid-press the keyup never arrives, and the
    // player would walk off on his own for ever.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this._actionKeyDown = false;
    });
  }

  /** Called each frame by the game to say which buttons exist right now. */
  setButtons(list) {
    this.buttons = list;
  }

  /**
   * Did this button get pressed? Reading it clears it, so a single tap
   * triggers exactly one action however long the frame took.
   */
  consumePress(id) {
    if (!this._presses.has(id)) return false;
    this._presses.delete(id);
    return true;
  }

  /** Is a finger currently resting on this button? Used to draw it pushed in. */
  isHeld(id) {
    if (id === 'action' && this._actionKeyDown) return true;
    for (const held of this._buttonPointers.values()) {
      if (held === id) return true;
    }
    return false;
  }

  _hitButton(p) {
    for (const b of this.buttons) {
      // A generous margin: a 6-year-old's aim is not precise.
      if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 12) return b;
    }
    return null;
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

    // Buttons are checked first, wherever they happen to be on screen.
    const hit = this._hitButton(p);
    if (hit) {
      this._buttonPointers.set(e.pointerId, hit.id);
      this._presses.add(hit.id);
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }

    // Otherwise the left half of the screen drives the joystick.
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
    if (this._buttonPointers.has(e.pointerId)) {
      this._buttonPointers.delete(e.pointerId);
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      return;
    }

    if (e.pointerId !== this.stickPointerId) return;
    this.stickPointerId = null;
    this._stickVector = { x: 0, y: 0, mag: 0 };
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
      this._stickVector = { x: 0, y: 0, mag: 0 };
      return;
    }

    // Strength grows with distance and caps out at MAX_PUSH.
    let mag = Math.min(dist / MAX_PUSH, 1);
    if (mag < DEAD_ZONE) {
      this._stickVector = { x: 0, y: 0, mag: 0 };
      return;
    }

    // Rescale so the character starts at a crawl just past the dead zone
    // rather than jumping straight to a jog.
    mag = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);

    this._stickVector = { x: dx / dist, y: dy / dist, mag };
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
