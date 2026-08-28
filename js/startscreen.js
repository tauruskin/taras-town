/**
 * startscreen.js — The opening screen, and choosing who you are playing with.
 *
 * Four panels, one shown at a time:
 *
 *   welcome   on your own, or together?
 *   together  start a new game, or join one?
 *   code      here is your code — tell it to the other player
 *   keypad    type the code you were told
 *
 * Nothing here has a word on it. Every choice is a picture, because the
 * player may not read. The single exception is the room code itself, which is
 * digits — the one kind of text a 6-year-old reliably manages, which is
 * exactly why codes are numbers rather than words.
 *
 * This module only decides WHICH ROOM, if any. It knows nothing about how a
 * connection is made; it just hands back a room name (or null for playing
 * alone) and lets the game get on with it.
 */

/** How many digits a room code has. */
const CODE_LENGTH = 4;

/**
 * Make up a room code.
 *
 * Digits only, and never starting with a zero: "0037" invites somebody to
 * read out three digits, and a leading zero is the easiest one to drop.
 */
export function makeRoomCode() {
  let code = String(1 + Math.floor(Math.random() * 9));
  for (let i = 1; i < CODE_LENGTH; i++) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
}

export class StartScreen {
  /**
   * @param onStart  called once, with the room to join or null to play alone
   */
  constructor(onStart) {
    this.onStart = onStart;
    this.started = false;
    this.typed = '';

    this.screen = document.getElementById('start-screen');
    this.panels = {
      welcome: document.getElementById('panel-welcome'),
      together: document.getElementById('panel-together'),
      code: document.getElementById('panel-code'),
      keypad: document.getElementById('panel-keypad'),
    };

    this._buildKeypad();
    this._wire();
  }

  // =====================================================================
  // Which panel is showing
  // =====================================================================
  show(name) {
    for (const [key, el] of Object.entries(this.panels)) {
      if (el) el.classList.toggle('hidden', key !== name);
    }
  }

  _wire() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    on('start-button', () => this._begin(null));
    on('together-button', () => this.show('together'));

    on('make-button', () => {
      this.room = makeRoomCode();
      this._paintCode(document.getElementById('room-code'), this.room);
      this.show('code');
    });

    on('code-play-button', () => this._begin(this.room));

    on('join-button', () => {
      this.typed = '';
      this._paintCode(document.getElementById('typed-code'), '');
      this.show('keypad');
    });

    for (const back of this.screen.querySelectorAll('.back')) {
      back.addEventListener('click', () => {
        const target = back.dataset.back || 'panel-welcome';
        this.show(target.replace('panel-', ''));
      });
    }
  }

  /** Two rows of five: landscape has room for width, not height. */
  _buildKeypad() {
    const pad = document.getElementById('keypad');
    if (!pad) return;

    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
      const key = document.createElement('button');
      key.textContent = String(n);
      key.setAttribute('aria-label', String(n));
      key.addEventListener('click', () => this._type(String(n)));
      pad.appendChild(key);
    }

    const erase = document.createElement('button');
    erase.className = 'erase';
    erase.textContent = '⌫';
    erase.setAttribute('aria-label', 'Delete');
    erase.addEventListener('click', () => {
      this.typed = this.typed.slice(0, -1);
      this._paintCode(document.getElementById('typed-code'), this.typed);
    });
    pad.appendChild(erase);
  }

  _type(digit) {
    if (this.typed.length >= CODE_LENGTH) return;
    this.typed += digit;
    this._paintCode(document.getElementById('typed-code'), this.typed);

    // Off we go as soon as the last digit lands. Asking a 6-year-old to find
    // a separate "done" button after already getting four digits right is one
    // step too many.
    if (this.typed.length === CODE_LENGTH) {
      const room = this.typed;
      setTimeout(() => this._begin(room), 260);
    }
  }

  /** Draw a code as separate boxes, with empty slots for what is still to come. */
  _paintCode(row, code) {
    if (!row) return;
    row.textContent = '';

    for (let i = 0; i < CODE_LENGTH; i++) {
      const box = document.createElement('div');
      box.className = code[i] ? 'digit' : 'digit empty';
      box.textContent = code[i] || '·';
      row.appendChild(box);
    }
  }

  // =====================================================================
  // Off we go
  // =====================================================================
  _begin(room) {
    if (this.started) return;
    this.started = true;
    this.screen.classList.add('hidden');
    this.onStart(room || null);
  }

  /**
   * Skip the whole thing and show one Play button.
   *
   * Used when a `?room=` is already in the address — the choice has been made
   * by whoever shared the link, so asking again would be pointless. It also
   * keeps that older way of starting a game working exactly as it did.
   */
  straightToPlay() {
    this.show('welcome');
    const together = document.getElementById('together-button');
    if (together) together.classList.add('hidden');
  }
}
