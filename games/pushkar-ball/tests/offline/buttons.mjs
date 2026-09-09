// Where the buttons are. This exists because every browser suite asks ui.js
// for a button's position instead of writing one down, so if these go wrong
// the browser suites tap the world behind and pass or fail for the wrong
// reason — quietly.
const { CONFIG } = await import('../../js/config.js');
const { Buttons } = await import('../../js/ui.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// Widest first, then the two small screens a child must still be able to play
// on. 568x320 is an iPhone SE on its side; 740x280 is a short landscape window.
const SCREENS = [[844, 390], [568, 320], [740, 280]];

for (const [w, h] of SCREENS) {
  console.log(`\n${w}x${h}`);
  const all = { left: Buttons.left(w, h), right: Buttons.right(w, h), jump: Buttons.jump(w, h) };

  for (const [name, b] of Object.entries(all)) {
    // Fully on screen. A control half off the edge of a phone is a control
    // that cannot be pressed, and three separate bugs of exactly this shape
    // turned up in Taras Town before anyone thought to check.
    if (b.x - b.r < 0 || b.y - b.r < 0 || b.x + b.r > w || b.y + b.r > h) {
      fail(`the ${name} button (${b.x.toFixed(0)},${b.y.toFixed(0)} r${b.r}) is off a ${w}x${h} screen`);
    }
    // And its own hit test finds it.
    if (Buttons.at(b.x, b.y, w, h) !== name) fail(`tapping the middle of ${name} does not hit it`);
  }

  // The move buttons must not overlap each other or the jump button; a thumb
  // landing between two overlapping buttons gets whichever one the loop
  // happened to test first.
  const pairs = [['left', 'right'], ['left', 'jump'], ['right', 'jump']];
  for (const [a, b] of pairs) {
    const A = all[a], B = all[b];
    if (Math.hypot(A.x - B.x, A.y - B.y) < A.r + B.r) fail(`${a} and ${b} overlap on ${w}x${h}`);
  }

  // The middle of the screen is not a button, or every tap would move the ball.
  if (Buttons.at(w / 2, h / 3, w, h) !== null) fail(`the middle of a ${w}x${h} screen hit a button`);

  console.log(`   left ${all.left.x.toFixed(0)},${all.left.y.toFixed(0)}  ` +
              `right ${all.right.x.toFixed(0)},${all.right.y.toFixed(0)}  ` +
              `jump ${all.jump.x.toFixed(0)},${all.jump.y.toFixed(0)}`);
}

// The jump button is the one that gets hit under pressure, so it is the
// biggest thing on the screen on purpose.
if (CONFIG.UI.JUMP_R <= CONFIG.UI.BUTTON_R) fail('the jump button is not bigger than the move buttons');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BUTTON CHECKS PASSED');
process.exit(failures ? 1 : 0);
