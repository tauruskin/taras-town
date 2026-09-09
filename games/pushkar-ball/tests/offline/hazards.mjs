// Spikes: they kill when touched, they do not kill when merely near, and they
// are more forgiving than they look.
const { CONFIG } = await import('../../js/config.js');
const { Ball } = await import('../../js/player.js');
const { loadLevel } = await import('../../js/levels.js');
const { spikeBox, hitsSpikes } = await import('../../js/hazards.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const stub = () => ({
  left: false, right: false, _jump: false,
  press() { this._jump = true; },
  takeJump() { const j = this._jump; this._jump = false; return j; },
});

const run = (ball, level, input, seconds) => {
  const n = Math.round(seconds / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
  }
};

/**
 * Flat ground with one patch of spikes on it, walled at both ends.
 *
 * The walls are not decoration and this suite is wrong without them, which was
 * found the hard way: with the ground simply ENDING at 2000, a ball asked to
 * roll right for several seconds runs off the edge and dies of the fall. Every
 * check below that expects exactly one death then gets one whether the spikes
 * work or not — with the kill removed from player.js altogether, the whole
 * suite still passed. Real levels are bracketed by boundary boxes for exactly
 * this reason, so this stub is too, and the only thing left in here that can
 * kill the ball is the hazard being tested.
 */
const world = (spikes) => loadLevel({
  id: 93, theme: 'hills',
  bounds: { w: 2400, h: 1080 },
  spawn: { x: 200, y: 600 },
  ground: [[[40, 760], [2000, 760]]],
  boxes: [
    { x: 0, y: 0, w: 40, h: 1080 },
    { x: 2000, y: 0, w: 40, h: 1080 },
  ],
  platforms: [],
  spikes,
});

// --- 1. the loader expands them ------------------------------------------
{
  const level = world([{ x: 800, y: 760, w: 120 }]);
  console.log(`\n1. the level has ${level.spikes.length} spike patch(es)`);
  if (level.spikes.length !== 1) fail(`expected 1 patch, got ${level.spikes.length}`);
}

// --- 2. the box is the picture, and the BALL is what shrinks --------------
//
// The contract, and it is the opposite way round from the obvious one: the box
// is exactly what is drawn, and forgiveness is taken off the ball. The reason
// it is this way round is in config.js, next to FORGIVE itself.
//
// THIS CHECK IS THE ANCHOR OF THE WHOLE SUITE, and it looks more redundant
// than it is. Every other check here derives its expectations from `spikeBox`,
// which is the right way round — a band typed by hand is what let an earlier
// draft through review. But it means those checks cannot catch `spikeBox`
// itself being wrong: mutate it to `x: s.x + 25` and check 3 SELF-CANCELS,
// because it recomputes its own band from the same mutated function and the
// two errors agree. Check 2 is the only place literals appear at all, and so
// the only place that failure has to surface.
//
// So: pin the numbers here, derive everything else from the pinned thing. Do
// not "simplify away" the clauses below on the grounds that they must be true
// by construction. Being true by construction is exactly what they check.
{
  const s = { x: 800, y: 760, w: 120 };
  const box = spikeBox(s, CONFIG);
  const effR = CONFIG.BALL.R - CONFIG.SPIKE.FORGIVE;
  console.log(`\n2. a ${s.w}px patch drawn ${CONFIG.SPIKE.H}px tall has a hit box ` +
              `${box.w.toFixed(0)}x${box.h.toFixed(0)} at ${box.x.toFixed(0)},${box.y.toFixed(0)},` +
              ` and a ${CONFIG.BALL.R}px ball hits it as ${effR}px`);
  if (box.x !== s.x || box.w !== s.w) fail(`the box is ${box.x}+${box.w}, not the ${s.x}+${s.w} drawn`);
  if (box.h !== CONFIG.SPIKE.H) fail(`the box is ${box.h} tall, not the ${CONFIG.SPIKE.H} drawn`);
  // Flush with the ground, and that is the one edge forgiveness must not
  // reach: a ball rolling on the floor is only caught while the box still
  // comes down to the floor it is rolling on.
  if (box.y + box.h !== s.y) fail(`the box's foot is at ${box.y + box.h}, not on the ground at ${s.y}`);

  // Both bounds on FORGIVE. Over BALL.R and the effective ball is a point, so
  // the spikes barely work; over H and a ball on the floor steps over a patch
  // entirely, because the whole height of the box is inside the allowance.
  if (!(CONFIG.SPIKE.FORGIVE < CONFIG.BALL.R)) {
    fail(`FORGIVE ${CONFIG.SPIKE.FORGIVE} is not under BALL.R ${CONFIG.BALL.R}: the effective ball is a point`);
  }
  if (!(CONFIG.SPIKE.FORGIVE < CONFIG.SPIKE.H)) {
    fail(`FORGIVE ${CONFIG.SPIKE.FORGIVE} is not under H ${CONFIG.SPIKE.H}: a rolling ball steps over a patch`);
  }
  if (effR <= 0) fail(`the effective kill radius is ${effR}`);

  // And the effective radius is not merely arithmetic on paper — `hitsSpikes`
  // has to actually use it. Asked directly, with no simulation in the way, so
  // that a failure here means the geometry is wrong and nothing else.
  //
  // First the obvious one: a ball resting on the floor in the middle of a
  // patch is dead. This is the flush-foot invariant made concrete — it is only
  // true while the box reaches down to the floor the ball is rolling on, which
  // is why FORGIVE has to stay under H.
  const restY = s.y - CONFIG.BALL.R;
  const midX = box.x + box.w / 2;
  if (!hitsSpikes({ x: midX, y: restY, r: CONFIG.BALL.R }, [s], CONFIG)) {
    fail(`a ball resting at ${midX},${restY} in the middle of a patch was not hit at all`);
  }

  // Then the clause that actually pins the radius, which the one above cannot.
  // H is 26 and BALL.R is 20, so a resting ball's centre sits INSIDE the box
  // vertically — its closest point is itself, at distance zero, so the test
  // above passes at any radius above zero at all. It survives an effective
  // radius of 0.01. Only an edge does the pinning: a ball approaching from
  // outside is hit exactly when its effective circle reaches the picture, so
  // straddle that threshold from both sides. Half a pixel either way, which is
  // finer than the 3.5px a ball covers in a step, so no simulation could ask
  // this question.
  const brink = box.x - effR;
  if (!hitsSpikes({ x: brink + 0.5, y: restY, r: CONFIG.BALL.R }, [s], CONFIG)) {
    fail(`a ball ${(0.5).toFixed(1)}px inside the kill threshold at ${brink} was not hit`);
  }
  if (hitsSpikes({ x: brink - 0.5, y: restY, r: CONFIG.BALL.R }, [s], CONFIG)) {
    fail(`a ball 0.5px OUTSIDE the kill threshold at ${brink} was hit anyway`);
  }
  console.log(`   the kill threshold on the near edge is centre x=${brink}, straddled from both sides`);
}

// --- 3. rolling into them kills ------------------------------------------
{
  const patch = { x: 800, y: 760, w: 160 };
  const box = spikeBox(patch, CONFIG);
  const effR = CONFIG.BALL.R - CONFIG.SPIKE.FORGIVE;
  const level = world([patch]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  let steps = 0;
  const limit = Math.round(8 / CONFIG.STEP);
  while (ball.deaths === 0 && steps < limit) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;

  console.log(`\n3. rolled into a spike patch and died after ${(steps * CONFIG.STEP).toFixed(2)}s at x=${ball.x.toFixed(2)};` +
              ` its effective leading edge was at ${(ball.x + effR).toFixed(2)}, and the picture starts at ${box.x}`);
  if (ball.deaths !== 1) fail(`rolling into spikes gave ${ball.deaths} deaths, expected 1`);

  // WHERE it died, derived from the box and the effective radius rather than
  // typed. A hand-written band is how the inverted forgiveness got through
  // review: `700 < x < 1000` around a patch spanning 800..960 tolerates a kill
  // a hundred pixels early, which is most of a screen on a phone.
  //
  // This is the clause that states the design outright: the ball must not die
  // before its effective leading edge has reached the picture at all. Under
  // the inset-the-box version this held only by accident of the two
  // formulations being the same arithmetic; stated here, it cannot drift.
  if (ball.x + effR < box.x) {
    fail(`killed at x=${ball.x.toFixed(2)} before touching the picture: its edge was at ` +
         `${(ball.x + effR).toFixed(2)}, the patch starts at ${box.x}`);
  }
  // And not late either: a ball whose CENTRE is past the far side has rolled
  // clean through, so something else killed it. That is exactly how an earlier
  // draft of this suite passed with the kill deleted from player.js.
  if (ball.x > box.x + box.w) {
    fail(`died at x=${ball.x.toFixed(2)}, past the patch's far side at ${box.x + box.w} — something else killed it`);
  }
  // Nor may it survive deep into the patch: more than the effective radius in
  // and the hazard is reacting too slowly to be the thing that killed it.
  if (ball.x - effR > box.x) {
    fail(`died at x=${ball.x.toFixed(2)}, already ${(ball.x - effR - box.x).toFixed(2)}px inside the picture`);
  }
}

// --- 4. rolling past where they are NOT does not kill --------------------
{
  const level = world([{ x: 1500, y: 760, w: 100 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  run(ball, level, input, 1.5);      // nowhere near 1500 yet
  input.right = false;

  console.log(`\n4. rolled to x=${ball.x.toFixed(0)} with spikes at 1500: deaths=${ball.deaths}`);
  if (ball.deaths !== 0) fail('died without reaching the spikes at all');
}

// --- 5. jumping over them survives ---------------------------------------
//
// The whole point of a spike is that it can be got past. If a patch narrower
// than the jump's reach cannot be cleared, the hit box is wrong, not the jump.
{
  const reach = (CONFIG.JUMP_V ** 2) / (2 * CONFIG.GRAVITY);
  const patch = { x: 900, y: 760, w: 90 };
  const level = world([patch]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  // Roll right at speed and jump when the patch's near edge comes within a
  // jump's reach, which is a deliberate take-off rather than a bounce.
  //
  // The first draft of this check pressed jump on EVERY grounded step and ran
  // for six seconds, and it failed — not because the hit box was too big, but
  // twice over because of the scenario:
  //
  //   - A ball that hops continuously from this spawn touches down at x = 370,
  //     657, 944, 1231. 944 is squarely inside a patch spanning 900..990, so
  //     the ball came DOWN on the spikes from above. That is a real landing on
  //     a hazard and no hit box smaller than its own picture can avoid it; the
  //     landing phase happened to line up with the patch, which is luck, not a
  //     property of the game.
  //   - The flat here ends at x = 2000 and six seconds at MAX_SPEED is 2520px
  //     of rolling, so the ball ran off the end of the world and died of the
  //     fall regardless. Run with the spikes REMOVED entirely, that draft
  //     still reported one death — which is the proof that it was measuring
  //     the harness and not the hazard.
  //
  // So: jump on purpose, and stop while there is still ground underneath.
  input.right = true;
  const n = Math.round(2.5 / CONFIG.STEP);
  for (let i = 0; i < n; i++) {
    level.update(CONFIG.STEP);
    if (ball.grounded && patch.x - ball.x < reach) input.press();
    ball.update(CONFIG.STEP, input, level);
  }
  input.right = false;

  console.log(`\n5. a jump clears ${reach.toFixed(0)}px; jumping over a 90px patch gave ${ball.deaths} death(s),` +
              ` ending at x=${ball.x.toFixed(0)}`);
  if (ball.deaths > 0) fail(`jumping over a 90px spike patch still died ${ball.deaths} time(s)`);
  if (ball.x < 990) fail(`never got past the patch: ended at x=${ball.x.toFixed(0)}`);
}

// --- 6. dying on spikes finishes deflating and comes back ---------------
//
// The case the die() guard exists for: the ball dies ON the spikes and is
// still overlapping them the whole time it deflates.
{
  const level = world([{ x: 800, y: 760, w: 160 }]);
  const input = stub();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  run(ball, level, input, 1.0);

  input.right = true;
  let steps = 0;
  while (ball.deaths === 0 && steps < Math.round(8 / CONFIG.STEP)) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, input, level);
    steps++;
  }
  input.right = false;
  // Where it died, so this check is known to be about a death ON the spikes
  // and not about some other way of failing further along. Derived from the
  // box and the effective radius, for the same reason check 3 is.
  const diedAt = ball.x;
  const box6 = spikeBox({ x: 800, y: 760, w: 160 }, CONFIG);
  const effR6 = CONFIG.BALL.R - CONFIG.SPIKE.FORGIVE;
  if (diedAt + effR6 < box6.x || diedAt > box6.x + box6.w) {
    fail(`died at x=${diedAt.toFixed(2)}, not on the patch at ${box6.x}..${box6.x + box6.w}`);
  }

  run(ball, level, input, CONFIG.DEFLATE.TIME + CONFIG.DEFLATE.INFLATE + 1.0);
  console.log(`\n6. after dying on the spikes: deaths=${ball.deaths}, x=${ball.x.toFixed(0)}, home=${ball.home.x}`);
  if (ball.deaths !== 1) fail(`the death on the spikes re-triggered: ${ball.deaths} deaths`);
  if (Math.abs(ball.x - ball.home.x) > 60) fail(`did not come back home: x=${ball.x.toFixed(0)}, home=${ball.home.x}`);
  if (ball.dying > 0) fail('still deflating long after it should have finished');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL HAZARD CHECKS PASSED');
process.exit(failures ? 1 : 0);
