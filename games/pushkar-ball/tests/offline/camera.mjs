// Where the ball sits on the screen, and whether a thumb is on top of it.
//
// This asks the camera and ui.js and works out the answer, rather than reading
// pixels: camera.js is DOM-free precisely so that questions like this can be
// settled in node in a millisecond. No coordinate is written down here — the
// button positions come from ui.js, exactly as everywhere else.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { Camera } = await import('../../js/camera.js');
const { loadLevel } = await import('../../js/levels.js');
const { Buttons } = await import('../../js/ui.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// The widest phone, an iPhone SE on its side, and a short landscape window.
const SCREENS = [[844, 390], [568, 320], [740, 280]];

const flat = () => loadLevel({
  id: 96, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 400, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [], platforms: [],
});

for (const [w, h] of SCREENS) {
  const scale = h / CONFIG.VIEW_H;
  const viewH = CONFIG.VIEW_H;
  const viewW = w / scale;

  const level = flat();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const camera = new Camera(level);
  const input = { left: false, right: false, takeJump: () => false };

  // Four seconds is far longer than the camera needs to settle; the point is
  // to measure where it ENDS UP, not how it gets there.
  for (let i = 0; i < Math.round(4 / CONFIG.STEP); i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    camera.update(CONFIG.STEP, ball, viewW, viewH);
  }

  const screenY = h / 2 + (ball.y - camera.y) * scale;
  const bottom = screenY + ball.r * scale;

  // The top of the highest thing a thumb covers.
  const tops = ['left', 'right', 'jump'].map((n) => {
    const b = Buttons[n](w, h);
    return b.y - b.r;
  });
  const controlTop = Math.min(...tops);
  const margin = controlTop - bottom;

  console.log(`\n${w}x${h}: a grounded ball sits at y=${screenY.toFixed(0)}, ` +
              `its bottom at ${bottom.toFixed(0)}, controls start at ${controlTop.toFixed(0)}` +
              ` — ${margin.toFixed(0)}px of daylight`);

  if (margin <= 0) {
    fail(`on ${w}x${h} the ball overlaps the controls by ${(-margin).toFixed(0)}px — a thumb sits on the hero`);
  } else if (margin < ball.r * scale * 0.5) {
    // Clear is not enough; it has to be obviously clear. Half a ball of
    // daylight is the least that reads as separate on a phone.
    fail(`on ${w}x${h} the ball clears the controls by only ${margin.toFixed(0)}px, less than half a ball`);
  }

  // And it must not have gone the other way. A ball pinned to the top of the
  // screen cannot see what it is falling towards.
  if (screenY < h * 0.25) fail(`on ${w}x${h} the ball rides at ${screenY.toFixed(0)}, too high to see what is below it`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CAMERA CHECKS PASSED');
process.exit(failures ? 1 : 0);
