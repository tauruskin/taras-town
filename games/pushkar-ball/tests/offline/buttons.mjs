// Where the buttons are. This exists because every browser suite asks ui.js
// for a button's position instead of writing one down, so if these go wrong
// the browser suites tap the world behind and pass or fail for the wrong
// reason — quietly.
const { CONFIG } = await import('../../js/config.js');
const { Buttons, Panel, Hearts } = await import('../../js/ui.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// Widest first, then the small screens a child must still be able to play on.
// 568x320 is an iPhone SE on its side; 740x280 is a short landscape window.
// 480x320 is narrower than any phone we expect, and it is here because it is
// the screen that proves the panel-versus-controls check below means
// something: on it the results panel's retry button and the right-arrow
// control sit almost on top of each other unless the panel moves out of the
// way.
const SCREENS = [[844, 390], [568, 320], [740, 280], [480, 320]];

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

  // The hearts HUD, top-left, one per CONFIG.HEALTH.HEARTS. On screen, and
  // clear of the control band below — Buttons.topEdge is exactly what the
  // camera already keeps the ball clear of, so the hearts hold to the same
  // line rather than a second number that could drift from it.
  for (let i = 0; i < CONFIG.HEALTH.HEARTS; i++) {
    const p = Hearts.at(i, w, h);
    if (p.x - CONFIG.HEARTS_UI.R < 0 || p.x + CONFIG.HEARTS_UI.R > w || p.y - CONFIG.HEARTS_UI.R < 0) {
      fail(`heart ${i} (${p.x.toFixed(0)},${p.y.toFixed(0)}) is off a ${w}x${h} screen`);
    }
    if (p.y + CONFIG.HEARTS_UI.R > Buttons.topEdge(w, h)) {
      fail(`heart ${i} at y=${p.y.toFixed(0)} reaches into the control band, which starts at ${Buttons.topEdge(w, h).toFixed(0)} on ${w}x${h}`);
    }
  }

  // The results panel's own buttons, held to exactly the same standard. The
  // panel appears on top of the game and advances by itself, so a button of
  // its own that has fallen off the screen is a child carried into the next
  // level with no way to stop it.
  const panel = Panel.box(w, h);
  if (panel.x < 0 || panel.y < 0 || panel.x + panel.w > w || panel.y + panel.h > h) {
    fail(`the results panel (${panel.w.toFixed(0)}x${panel.h.toFixed(0)}) does not fit a ${w}x${h} screen`);
  }
  for (const name of ['retry', 'home']) {
    const b = Panel[name](w, h);
    if (b.x - b.r < 0 || b.y - b.r < 0 || b.x + b.r > w || b.y + b.r > h) {
      fail(`the panel's ${name} button is off a ${w}x${h} screen`);
    }
    if (Panel.at(b.x, b.y, w, h) !== name) fail(`tapping the middle of the panel's ${name} does not hit it`);
    // And off-centre, right at the edge of the forgiving radius, and just past
    // it. Only tapping dead centre let a Panel.at that had shrunk its radius to
    // a tenth of the drawn one pass — a button a thumb almost never hits.
    // Straight up, because the other panel button is beside it, not above.
    const reach = b.r * CONFIG.UI.HIT;
    if (Panel.at(b.x, b.y - (reach - 1), w, h) !== name) {
      fail(`a tap ${(reach - 1).toFixed(1)}px above the middle of the panel's ${name} missed it; its hit radius should be ${reach.toFixed(1)}`);
    }
    if (Panel.at(b.x, b.y - (reach + 1), w, h) === name) {
      fail(`a tap ${(reach + 1).toFixed(1)}px above the middle of the panel's ${name} still hit it; its hit radius should be ${reach.toFixed(1)}`);
    }
    // The panel's buttons and the game's controls must be clear of each other
    // by their HIT radii, not just their drawn ones, and by a margin on top.
    // The controls are switched off while the panel is up, so today a tap on
    // retry cannot become a held right-arrow — but that switch is one line in
    // input.js, and this is the backstop that makes forgetting it harmless.
    // Before the panel learned to move out of the way, retry's hit circle was
    // 0.7px from the right button's on an iPhone SE and overlapped it by 33px
    // on 480x320, so a thumb on retry held the ball rolling right instead.
    for (const [cname, c] of Object.entries(all)) {
      const need = reach + c.r * CONFIG.UI.HIT + CONFIG.RESULTS.CLEAR;
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d < need) {
        fail(`the panel's ${name} is ${(d - need + CONFIG.RESULTS.CLEAR).toFixed(1)}px from the ${cname} control's hit circle on ${w}x${h}; it needs ${CONFIG.RESULTS.CLEAR}`);
      }
    }
    // And it must sit inside the panel it is drawn on, or it is a button
    // floating on the game behind with nothing under it to say it is one.
    if (b.x - b.r < panel.x || b.x + b.r > panel.x + panel.w ||
        b.y - b.r < panel.y || b.y + b.r > panel.y + panel.h) {
      fail(`the panel's ${name} button hangs off the panel itself on ${w}x${h}`);
    }
  }
  const pr = Panel.retry(w, h), ph = Panel.home(w, h);
  if (Math.hypot(pr.x - ph.x, pr.y - ph.y) < pr.r + ph.r) fail(`the panel's two buttons overlap on ${w}x${h}`);

  // The stars and the level number are on the same face as those buttons, and
  // this is the only thing anywhere that can check the layout: they are drawn
  // with a canvas and there is no canvas in node, so the arithmetic is asked
  // instead. A digit that is legible in a screenshot on a desktop and buried
  // under a thumb button on a 280px-tall window is the exact bug shape this
  // repo keeps finding.
  const num = Panel.number(w, h);
  const numTop = num.y - num.size / 2, numBottom = num.y + num.size / 2;
  if (numTop < panel.y || numBottom > panel.y + panel.h) {
    fail(`the level number (${numTop.toFixed(0)}..${numBottom.toFixed(0)}) is off the panel on ${w}x${h}`);
  }
  for (const [name, b] of [['retry', pr], ['home', ph]]) {
    // The digit has a row of its own, above the buttons, and this insists on
    // exactly that. Vertical clearance only, on purpose: it is the one kind of
    // clearance that holds however many digits the level number has, and
    // node cannot measure how wide "12" is.
    if (numBottom > b.y - b.r) {
      fail(`the level number (bottom ${numBottom.toFixed(0)}) runs into the panel's ${name} button (top ${(b.y - b.r).toFixed(0)}) on ${w}x${h}`);
    }
  }
  for (let i = 0; i < 3; i++) {
    const s = Panel.star(i, w, h);
    if (s.x - s.r < panel.x || s.x + s.r > panel.x + panel.w ||
        s.y - s.r < panel.y || s.y + s.r > panel.y + panel.h) {
      fail(`star ${i} is off the panel on ${w}x${h}`);
    }
    if (s.y + s.r > numTop) fail(`star ${i} overlaps the level number on ${w}x${h}`);
  }
  console.log(`   panel ${panel.w.toFixed(0)}x${panel.h.toFixed(0)} at ${panel.x.toFixed(0)},${panel.y.toFixed(0)}  ` +
              `retry ${pr.x.toFixed(0)},${pr.y.toFixed(0)}  home ${ph.x.toFixed(0)},${ph.y.toFixed(0)}  ` +
              `number ${num.x.toFixed(0)},${num.y.toFixed(0)} at ${num.size}px`);

  console.log(`   left ${all.left.x.toFixed(0)},${all.left.y.toFixed(0)}  ` +
              `right ${all.right.x.toFixed(0)},${all.right.y.toFixed(0)}  ` +
              `jump ${all.jump.x.toFixed(0)},${all.jump.y.toFixed(0)}`);
}

// One check that does NOT derive its expectations from Panel.
//
// Everything above asks Panel where things are and then asks whether that is
// sane, and a suite built entirely that way cannot catch the thing it is built
// on: a Panel that put its box in the wrong place would move its own buttons
// with it and every relation above would still hold. So this one pins the
// panel against CONFIG.RESULTS and plain arithmetic instead. Not coordinates —
// there are none written down here — but an independent derivation of them.
//
// The 844x390 screen is the one with room for the panel at full size, which is
// what makes the comparison against PANEL_W and PANEL_H meaningful at all.
{
  const R = CONFIG.RESULTS;
  const [w, h] = [844, 390];
  const b = Panel.box(w, h);
  if (b.w !== R.PANEL_W || b.h !== R.PANEL_H) {
    fail(`the panel is ${b.w}x${b.h} on a screen with room for ${R.PANEL_W}x${R.PANEL_H}`);
  }
  if (b.x !== (w - R.PANEL_W) / 2 || b.y !== (h - R.PANEL_H) / 2) {
    fail(`the panel is at ${b.x},${b.y}, which is not centred on a ${w}x${h} screen`);
  }
  // The two buttons, symmetric about the middle of the screen and GAP apart.
  const retry = Panel.retry(w, h), home = Panel.home(w, h);
  if (Math.abs((retry.x + home.x) / 2 - w / 2) > 1e-9) {
    fail(`the panel's buttons are not symmetric about the middle: ${retry.x} and ${home.x} on a ${w}px screen`);
  }
  if (Math.abs((home.x - retry.x) - (2 * R.BUTTON_R + R.GAP)) > 1e-9) {
    fail(`the panel's buttons are ${(home.x - retry.x).toFixed(1)}px apart, not the ${2 * R.BUTTON_R + R.GAP} that BUTTON_R and GAP ask for`);
  }
  if (Math.abs(retry.y - (b.y + R.PANEL_H - R.BUTTON_LIFT - R.BUTTON_R)) > 1e-9) {
    fail(`the panel's buttons sit at y=${retry.y}, not BUTTON_LIFT above the panel's bottom edge`);
  }
  console.log(`\npinned against CONFIG.RESULTS: ${b.w}x${b.h} centred at ${b.x},${b.y}, ` +
              `buttons ${(home.x - retry.x).toFixed(0)}px apart`);
}

// The jump button is the one that gets hit under pressure, so it is the
// biggest thing on the screen on purpose.
if (CONFIG.UI.JUMP_R <= CONFIG.UI.BUTTON_R) fail('the jump button is not bigger than the move buttons');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BUTTON CHECKS PASSED');
process.exit(failures ? 1 : 0);
