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

  // The top of the highest thing a thumb covers. This is the button's DRAWN
  // radius, deliberately, even though ui.js's hit radius is larger by
  // CONFIG.UI.HIT: the question here is what a thumb hides, not what it can
  // press, and a thumb rests on the picture it is aiming at.
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

  // Snapping and settling must agree. `snap` is what a respawn uses, and it
  // promises no easing at all — so if it puts the camera anywhere `update`
  // then eases away from, every respawn ends with a small glide. That is what
  // happened when the camera started aiming BIAS_Y below the ball while `snap`
  // still snapped to the ball itself: about 20 world units of it.
  //
  // The allowance is not a bound on what one lerp step can do — there is no
  // such bound related to DEADZONE_Y, since at the deadzone's edge the move is
  // exactly zero and outside it the step is a fraction of however far away the
  // target is. It is simply a small epsilon derived from CONFIG rather than
  // typed as a number, comfortably above the residual the exponential approach
  // leaves behind but far below the ~20 units the real bug produced.
  //
  // That the residual is small enough is a measured fact and it depends on the
  // settle loop above being LONG: after four seconds it is 0.013, but after
  // only two it is 1.86 against an allowance of 1.875. So the loop's length is
  // load-bearing for this check as well as for the daylight one. Shorten it
  // and this fails for a reason that looks like nothing at all.
  const allowed = CONFIG.CAMERA.DEADZONE_Y * CONFIG.CAMERA.LERP_Y * CONFIG.STEP;
  const snapAgrees = (when) => {
    const before = camera.y;
    camera.snap(ball);
    camera.update(CONFIG.STEP, ball, viewW, viewH);
    const drift = Math.abs(camera.y - before);
    if (drift > allowed) {
      fail(`on ${w}x${h} snapping ${when} moved the camera ${drift.toFixed(2)} world ` +
           `units from where it had settled — a respawn would glide`);
    }
  };

  snapAgrees('after the ball had settled');

  // A whole jump must not move the camera at all.
  //
  // This is the deadzone earning its keep, and it is a design property rather
  // than an incidental one. A settled camera sits one deadzone BELOW the point
  // it aims at, so the ball has to rise more than TWO deadzones before the
  // camera is pulled out the other side. The jump clears
  // JUMP_V^2 / 2*GRAVITY, which is nowhere near that — so the camera holds
  // perfectly still through a jump, which is exactly why it is not nauseating
  // and exactly why `tests/browser/jump.mjs` can measure a jump as a rise in
  // screen pixels.
  const escape = 2 * CONFIG.CAMERA.DEADZONE_Y;
  const reach = (CONFIG.JUMP_V ** 2) / (2 * CONFIG.GRAVITY);
  const wasY = camera.y;

  let jumps = 1;
  const jumpOnce = { left: false, right: false, takeJump: () => (jumps-- > 0) };
  let peak = ball.y;
  for (let i = 0; i < Math.round(3 / CONFIG.STEP); i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, jumpOnce, level);
    camera.update(CONFIG.STEP, ball, viewW, viewH);
    peak = Math.min(peak, ball.y);
  }

  if (reach >= escape) {
    // Not a failure of the game, a failure of this check's premise: retuned
    // numbers have made a jump big enough to move the camera, so the
    // assertion below is no longer testing what it claims to.
    fail(`a jump now reaches ${reach.toFixed(0)} but the camera escapes its deadzone at ` +
         `${escape} — this check's reasoning no longer holds and needs rewriting`);
  }
  if (Math.abs(camera.y - wasY) > 0.001) {
    fail(`on ${w}x${h} a jump of ${(ball.y - peak).toFixed(0)} units moved the camera ` +
         `${(camera.y - wasY).toFixed(2)} units; a jump inside the deadzone should move it none`);
  }

  // And snapping still agrees once the ball is back down. Cheap regression
  // rather than new coverage: because the jump above provably cannot move the
  // camera, this ends up asserting the same state the first call did.
  //
  // What is therefore still NOT pinned anywhere is the other stable trailing
  // position. `update` has two — one deadzone below the aim point when
  // trailing a descending ball and one above it when trailing an ascending
  // one, 2 * DEADZONE_Y apart — and `snap` can only ever agree with the
  // falling one. Gravity returns every ball to that case, which is why it is
  // enough today. It stops being enough as soon as something can end a life in
  // mid-air, because the respawn then snaps while the camera trails a ball
  // that was going up. Reaching that state needs a fall of more than
  // 2 * DEADZONE_Y followed by a mid-air respawn, which belongs with the
  // hazards that will make it possible — not here.
  snapAgrees('after a jump and a landing');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CAMERA CHECKS PASSED');
process.exit(failures ? 1 : 0);
