// A balance beam: a plank pivoting on a fulcrum, tilting toward whichever end
// a crate weighs down. This suite is about the MECHANISM in isolation — a
// small, hand-picked geometry, not level seven's own numbers — the same way
// switches.mjs tests the switch/gate mechanism on a stub level rather than on
// level six itself.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({ left: false, right: false, takeJump: () => false });

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    if (ball) ball.update(CONFIG.STEP, input, level);
  }
};

// Fulcrum at (1000, 700), half-length 150, minAngle -30°: the entry (a) end
// sits at (1000 - 150*cos(30°), 700 + 150*sin(30°)) = (870, 775), and the
// far (b) end at (1130, 625) — both computed here with the same formula
// `makeBeam` uses, not retyped as separately-guessed literals, so this suite
// is checking the FORMULA against itself rather than against a number that
// could quietly drift from it.
const FX = 1000, FY = 700, HALF = 150, MIN_A = -Math.PI / 6, MAX_A = 0;
const cosMin = Math.cos(MIN_A), sinMin = Math.sin(MIN_A);
const AX = FX - HALF * cosMin, AY = FY - HALF * sinMin;
const BX = FX + HALF * cosMin, BY = FY + HALF * sinMin;

const world = (extra) => loadLevel({
  id: 98, theme: 'hills',
  bounds: { w: 2000, h: 1080 },
  spawn: { x: 200, y: 700 },
  ground: [
    [[40, AY], [Math.round(AX), AY]],
    [[Math.round(BX), BY], [1960, BY]],
  ],
  boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
  ],
  platforms: [],
  beams: [{ x: FX, y: FY, halfLength: HALF, minAngle: MIN_A, maxAngle: MAX_A }],
  ...extra,
});

// --- 1. the loader builds a beam, starting at minAngle, endpoints match ----
{
  const level = world();
  const beam = level.beams[0];
  console.log(`\n1. ${level.beams.length} beam(s), angle=${beam.angle.toFixed(3)}`);
  if (level.beams.length !== 1) fail(`expected 1 beam, got ${level.beams.length}`);
  if (Math.abs(beam.angle - MIN_A) > 1e-9) fail(`a fresh beam's angle is ${beam.angle}, expected minAngle ${MIN_A}`);
  if (Math.abs(beam.ax - AX) > 0.01 || Math.abs(beam.ay - AY) > 0.01) {
    fail(`beam's near end is at (${beam.ax.toFixed(1)},${beam.ay.toFixed(1)}), expected (${AX.toFixed(1)},${AY.toFixed(1)})`);
  }
  if (Math.abs(beam.bx - BX) > 0.01 || Math.abs(beam.by - BY) > 0.01) {
    fail(`beam's far end is at (${beam.bx.toFixed(1)},${beam.by.toFixed(1)}), expected (${BX.toFixed(1)},${BY.toFixed(1)})`);
  }
}

// --- 2. a crate resting past the fulcrum levels the beam -------------------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
    // Centre at FX + 80 = 1080, comfortably past the fulcrum and still well
    // inside the beam's own far half (which reaches to BX ≈ 1130 at rest).
    { x: 1030, y: 550, w: 100, h: 100, movable: true },
  ] });
  // Let it fall and settle onto the (still tilted) beam.
  run(null, level, stub(), 2);
  const crate = level.crates[0], beam = level.beams[0];
  console.log(`\n2. crate settled at y=${crate.y.toFixed(0)}, grounded=${crate.grounded}`);
  if (!crate.grounded) fail('2: the crate never settled, so nothing below was tested');
  // Give it several full SWING_TIMEs to reach (or get very close to) maxAngle.
  run(null, level, stub(), CONFIG.BEAM.SWING_TIME * 4);
  console.log(`   after settling: beam angle=${beam.angle.toFixed(3)} (maxAngle=${MAX_A})`);
  if (Math.abs(beam.angle - MAX_A) > 0.01) fail(`beam angle is ${beam.angle.toFixed(3)}, expected to have eased to maxAngle ${MAX_A}`);
}

// --- 3. a crate before the fulcrum leaves the beam at minAngle -------------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
    // Centre at FX - 80 = 920: on the near/entry side of the fulcrum.
    { x: 870, y: 550, w: 100, h: 100, movable: true },
  ] });
  run(null, level, stub(), 2 + CONFIG.BEAM.SWING_TIME * 4);
  const beam = level.beams[0];
  console.log(`\n3. crate on the entry side the whole time: beam angle=${beam.angle.toFixed(3)} (minAngle=${MIN_A})`);
  if (Math.abs(beam.angle - MIN_A) > 0.01) fail(`beam angle is ${beam.angle.toFixed(3)}, expected to have stayed at minAngle ${MIN_A}`);
}

// --- 4. taking the crate away lets the beam ease back to minAngle ----------
{
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
    { x: 1030, y: 550, w: 100, h: 100, movable: true },
  ] });
  run(null, level, stub(), 2 + CONFIG.BEAM.SWING_TIME * 4);
  const beam = level.beams[0];
  if (Math.abs(beam.angle - MAX_A) > 0.01) fail(`4: setup failed to level the beam first (angle=${beam.angle.toFixed(3)}) — nothing below was tested`);
  // Shove the crate off the beam entirely, by hand — this suite has no
  // interest in HOW a crate gets moved, only in what the beam does once it's
  // gone, the same shape switches.mjs's own case 5 already uses.
  level.crates[0].x = 100;
  level.crates[0]._reseg();
  run(null, level, stub(), CONFIG.BEAM.SWING_TIME * 4);
  console.log(`\n4. crate removed: beam angle=${beam.angle.toFixed(3)} (minAngle=${MIN_A})`);
  if (Math.abs(beam.angle - MIN_A) > 0.01) fail(`beam angle is ${beam.angle.toFixed(3)}, expected to have eased back to minAngle ${MIN_A}`);
}

// --- 5. a beam owes the four carrier fields, like every other carrier ------
//
// Permanently zero here rather than a translation — see this plan's own
// "Important deviation from the approved spec" note for why — but they must
// still exist and stay numeric, or player.js's `platform.dx` line turns the
// ball's position to NaN the first frame it stands on one, the exact bug
// CLAUDE.md already warns about.
{
  const level = world();
  const beam = level.beams[0];
  for (const f of ['dx', 'dy', 'vx', 'vy']) {
    if (typeof beam[f] !== 'number') fail(`a fresh beam has no numeric '${f}'`);
    if (beam[f] !== 0) fail(`a fresh beam's '${f}' is ${beam[f]}, expected permanently 0`);
  }
  run(null, level, stub(), 3);
  for (const f of ['dx', 'dy', 'vx', 'vy']) {
    if (beam[f] !== 0) fail(`after the beam moved, '${f}' is ${beam[f]}, expected still permanently 0`);
  }
  console.log(`\n5. beam carrier fields stay 0 throughout: dx=${beam.dx}, dy=${beam.dy}, vx=${beam.vx}, vy=${beam.vy}`);
}

// --- 6. a ball riding the entry half is carried up as the beam levels ------
//
// This is the concrete check behind this plan's claim that ordinary contact
// resolution — no explicit carrying code — is enough for the ball: drop a
// ball onto the beam's entry half, then let a crate on the far half level it
// out from underneath, and confirm the ball is smoothly lifted with the
// rising surface rather than left behind or falling through.
{
  // A thin wall immediately left of where the ball lands, pinning it in
  // place horizontally. This is deliberate and needed: a ball resting on
  // ANY incline in this game rolls downhill under plain gravity with no
  // static friction to hold it (that is the whole point of a rolling-ball
  // engine — see CLAUDE.md, "slopes are where a rolling ball earns its
  // existence") and the beam's entry half is, before it levels, a real
  // incline. Without something to stop it, the ball simply rolls off the
  // low/entry end and settles on ordinary ground nearby — which is
  // correct, unrelated physics, not a beam bug, but it would swap out from
  // under this check before there was anything left to observe. The wall
  // isolates the one thing this case exists to test — is the ball carried
  // UP as the surface under it rises — from that separate, already-covered
  // behaviour.
  const level = world({ boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 1960, y: 0, w: 40, h: 1080 },
    { x: 1030, y: 550, w: 100, h: 100, movable: true },
    { x: 895, y: 0, w: 10, h: 1080 },
  ] });
  // Drop the ball near the beam's own entry end, and capture its height
  // the instant it FIRST settles — not after a fixed pause — so this
  // check has no dependency on how long the ball's own fall happens to
  // take: whatever that is, "the moment it lands" is when the beam still
  // has the most remaining travel left to lift it through.
  const ball = new Ball(920, 500);
  let landFrames = 0;
  while (!ball.grounded && landFrames < 600) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, stub(), level);
    landFrames++;
  }
  if (!ball.grounded) fail('6: the ball never settled on the beam, so nothing below was tested');
  const yBefore = ball.y;
  run(ball, level, stub(), CONFIG.BEAM.SWING_TIME * 4);
  console.log(`\n6. ball y before levelling=${yBefore.toFixed(1)}, after=${ball.y.toFixed(1)}, deaths=${ball.deaths}`);
  if (ball.deaths > 0) fail(`the ball died while the beam levelled under it (${ball.deaths} time(s)) — it was not carried, it fell through`);
  if (ball.y >= yBefore - 1) fail(`the ball's y barely changed (${yBefore.toFixed(1)} -> ${ball.y.toFixed(1)}) while the beam levelled beneath it — it was not carried upward with the rising surface`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BEAM CHECKS PASSED');
process.exit(failures ? 1 : 0);
