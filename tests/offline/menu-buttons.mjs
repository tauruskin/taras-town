// Every button in the menu must be reachable, at every screen size.
//
// This exists because the buttons are laid out from the canvas size, and a tap
// is matched against them IN ORDER — the first one within reach wins. That
// makes overlap silent: nothing looks wrong, the button is drawn perfectly, and
// pressing it just does something else instead. The opening screen had exactly
// this bug once, where a back button sat on top of a choice and swallowed it.
//
// So rather than eyeball one phone, this walks a range of landscape sizes and
// asks the real question: if a finger lands on the middle of this button, which
// button does the game think was pressed?
import { Menu } from '../../js/ui.js';

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

/**
 * The game's own hit test, copied deliberately rather than imported.
 *
 * input.js is full of browser event wiring that will not load under node, and
 * the rule it applies is two lines long. If those two lines ever change, this
 * copy is wrong and this test is worthless — so it is written out here in full
 * where a reader can see it and compare.
 *
 *   for (const b of this.buttons)
 *     if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 12) return b;
 */
const AIM_MARGIN = 12;
function whatGetsPressed(buttons, x, y) {
  for (const b of buttons) {
    if (Math.hypot(x - b.x, y - b.y) <= b.r + AIM_MARGIN) return b.id;
  }
  return null;
}

// Landscape sizes worth caring about: a small old phone, the common modern
// ones, a tablet, and two deliberately squat viewports standing in for a phone
// with a lot of browser chrome in the way.
const SIZES = [
  { w: 568, h: 320, what: 'iPhone SE, landscape' },
  { w: 667, h: 375, what: 'iPhone 8, landscape' },
  { w: 844, h: 390, what: 'iPhone 12, landscape' },
  { w: 915, h: 412, what: 'a big Android, landscape' },
  { w: 1024, h: 768, what: 'a tablet' },
  { w: 640, h: 300, what: 'a squat viewport' },
  { w: 740, h: 280, what: 'a very squat viewport' },
];

const menu = new Menu();

console.log('');
console.log('every menu button answers to its own middle');

for (const size of SIZES) {
  const buttons = menu.buttons(size.w, size.h);
  const wrong = [];

  for (const b of buttons) {
    const got = whatGetsPressed(buttons, b.x, b.y);
    if (got !== b.id) wrong.push(`${b.id} -> ${got}`);
  }

  check(`${size.what} (${size.w}x${size.h})`, wrong.length === 0,
        wrong.length ? wrong.join(', ') : buttons.length + ' buttons');
}

// --- the way out is always there -----------------------------------------
//
// Leaving the game is the one button with no other way to reach it: if a
// swatch ever covers it, he is stuck in a game with somebody until he closes
// the browser, which is precisely the thing this button was added to avoid.
console.log('');
console.log('the way out of a shared game is never covered');

for (const size of SIZES) {
  const buttons = menu.buttons(size.w, size.h);
  const home = buttons.find((b) => b.id === 'menu-home');
  check(`${size.what}: home answers`, home && whatGetsPressed(buttons, home.x, home.y) === 'menu-home',
        home ? whatGetsPressed(buttons, home.x, home.y) : 'no home button at all');
}

// --- and choosing a colour still wins any tie ----------------------------
//
// The swatches are what he presses all the time. Where the corner buttons and
// the top row are close enough to overlap, the swatch has to be the one that
// answers, which is why home is listed last.
console.log('');
console.log('choosing a colour is never stolen by a corner button');

for (const size of SIZES) {
  const buttons = menu.buttons(size.w, size.h);
  const swatches = buttons.filter((b) => b.id.includes(':'));
  const stolen = swatches.filter((b) => whatGetsPressed(buttons, b.x, b.y) !== b.id)
                         .map((b) => `${b.id} -> ${whatGetsPressed(buttons, b.x, b.y)}`);
  check(`${size.what}: all ${swatches.length} swatches answer`, stolen.length === 0, stolen.join(', '));
}

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL MENU BUTTON CHECKS PASSED');
process.exit(fail ? 1 : 0);
