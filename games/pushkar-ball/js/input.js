/**
 * input.js — the buttons on screen and the keys on a keyboard, as one thing.
 *
 * Both are always live and neither disables the other: a phone with a keyboard
 * attached should not have to choose, and on a desktop the on-screen buttons
 * still work with a mouse. The rest of the game asks `left`, `right` and
 * `takeJump()` and never learns which one it got.
 *
 * Pointer events rather than touch events, because one set of handlers then
 * covers a finger, a stylus and a mouse. A press that lands on a button calls
 * preventDefault, so a drag across the screen mid-jump does not scroll the
 * page or pop up a text selection; a press anywhere else is left alone.
 */
import { Buttons } from './ui.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this._keys = new Set();      // 'left' | 'right'
    this._pointers = new Map();  // pointerId -> button name
    this._jump = false;          // an unconsumed press

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    // A finger that leaves the window without a pointerup would otherwise
    // leave the ball rolling for ever — which is exactly what happens when a
    // notification slides down over the top of the screen mid-roll.
    window.addEventListener('blur', () => { this._pointers.clear(); this._keys.clear(); });

    window.addEventListener('keydown', (e) => {
      const name = KEYS[e.key];
      if (!name) return;
      e.preventDefault();
      // Auto-repeat would fire dozens of jump presses while a key is held.
      if (name === 'jump') { if (!e.repeat) this._jump = true; }
      else this._keys.add(name);
    });
    window.addEventListener('keyup', (e) => {
      const name = KEYS[e.key];
      if (name && name !== 'jump') this._keys.delete(name);
    });
  }

  /**
   * Which button this event landed on, in CSS pixels from the canvas's own
   * top-left. The bounding rect rather than the canvas's width attribute:
   * that one is in device pixels and would be wrong by devicePixelRatio.
   */
  _hit(e) {
    const r = this.canvas.getBoundingClientRect();
    return Buttons.at(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  }

  _down(e) {
    const name = this._hit(e);
    if (!name) return;
    e.preventDefault();
    if (name === 'jump') this._jump = true;
    else this._pointers.set(e.pointerId, name);
  }

  /**
   * A thumb that slides from left to right without lifting should change
   * direction, not keep the old one. Sliding off both buttons releases.
   */
  _move(e) {
    if (!this._pointers.has(e.pointerId)) return;
    const name = this._hit(e);
    if (name && name !== 'jump') this._pointers.set(e.pointerId, name);
    else this._pointers.delete(e.pointerId);
  }

  _up(e) { this._pointers.delete(e.pointerId); }

  get left() { return this._held('left'); }
  get right() { return this._held('right'); }

  _held(name) {
    if (this._keys.has(name)) return true;
    for (const v of this._pointers.values()) if (v === name) return true;
    return false;
  }

  /**
   * Was jump pressed since this was last asked?
   *
   * A press, consumed — deliberately not "is jump held". Held would bounce the
   * ball off anything it touched, for ever. This is also what makes the jump
   * buffer in player.js possible: the press survives until something is ready
   * to use it, rather than existing only during the frame the finger was down.
   */
  takeJump() { const j = this._jump; this._jump = false; return j; }

  /** What to draw as pressed. */
  held() {
    const out = new Set();
    if (this.left) out.add('left');
    if (this.right) out.add('right');
    return out;
  }
}

// Arrows and WASD together, because the adult testing this on a laptop and the
// child on a phone should not have to agree on a layout. Space jumps too; it is
// the key a hand already rests on.
const KEYS = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump',
};
