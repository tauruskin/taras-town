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
    // A tap that hit no control, for the panels. Kept as a POSITION and not as
    // a button name, because the results panel's buttons are not game controls
    // and are not in ui.js's Buttons: the panel knows its own geometry, and
    // this file has no business learning about every overlay the game ever
    // grows. Null when there is nothing waiting.
    this._tap = null;
    // Whether the game's controls are live. Off while the results panel is
    // up, and then EVERY press is a tap for the panel and none is hit-tested
    // against Buttons at all. Without this the controls stay live and merely
    // invisible under the panel: on a narrow phone a thumb on retry landed
    // inside the right arrow's hit circle and became a held right, and a jab
    // where jump used to be queued a jump into the next level. Set it through
    // `setControls`, never directly, because the switch has to drain.
    this.controls = true;

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
    if (!this.controls) { this._tap = this._where(e); return; }
    const name = this._hit(e);
    if (!name) {
      // Remembered rather than dropped, so an overlay can ask where the last
      // tap on nothing was. Not preventDefault'd, deliberately: a press that
      // is not on a control is left alone exactly as it was before, so a tap
      // on the world still behaves like a tap on a page.
      this._tap = this._where(e);
      return;
    }
    e.preventDefault();
    if (name === 'jump') this._jump = true;
    else this._pointers.set(e.pointerId, name);
  }

  /** Where a pointer event is, in CSS pixels from the canvas's top-left. */
  _where(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /**
   * Turn the game's controls on or off, and forget every press in flight.
   *
   * The draining is the point, and it happens on EVERY switch, both ways.
   * Turning off, it drops a thumb still resting on the right arrow when the
   * flag was touched, a jump pressed on the winning step, and a tap on the
   * world a moment earlier — which would otherwise land on whatever panel
   * button is now under it. Turning on, it drops a jump pressed on the
   * keyboard while the panel was up, so a level never begins with a jump
   * nobody asked for.
   *
   * Held KEYS are left alone. The key really is down, and clearing it would
   * leave a held arrow dead on the new level until it was let go and pressed
   * again — while the ball is not simulated during the panel, so the key can
   * do nothing there anyway.
   */
  setControls(on) {
    this.controls = on;
    this._pointers.clear();
    this._jump = false;
    this._tap = null;
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

  /**
   * Where the last tap that missed every control was, consumed.
   *
   * Consumed for the same reason a jump press is: an overlay that read a HELD
   * position would fire its button on every frame the finger was down, so a
   * results panel would retry the level dozens of times in the third of a
   * second a thumb rests on it.
   */
  takeTap() { const t = this._tap; this._tap = null; return t; }

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
