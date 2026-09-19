// The charger, in the browser: open level ten at both small phone sizes,
// roll up against the pen's stone step (no jump, so it stops there, outside
// the pen; the charger's charge ends in the step's far side), and take a
// picture every quarter second while the charger comes, winds up, charges,
// sits dazed and walks off again. The pictures start while the ball is still
// rolling, so the patrol towards it is in them as well as the one away.
// The assertion is only that the charger is drawn (a count of its exact body
// colour, which only enemies and their pop pieces use, and level ten has no
// enemy but the charger) and that the page threw nothing. The pictures are
// the point: look at every one of them.
// Then level eleven's opening, for the level-select tile and the roofs.
import { connect, makeHold, press, release, openLevel } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'chargers';
const PORT = Number(process.argv[4] || 9335);

const { CONFIG } = await import('../../js/config.js');
const { Buttons } = await import('../../js/ui.js');
const { LEVELS } = await import('../../js/levels.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const hex = CONFIG.COLOURS.ENEMY;
const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const enemyPixels = () => ev(`(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - ${R}) < 6 && Math.abs(d[i + 1] - ${G}) < 6 && Math.abs(d[i + 2] - ${B}) < 6) n++;
  }
  return n;
})()`);

// Level select is photographed on the way in, every time: it is where the
// eleventh tile has to fit.
const open = (W, H, id) =>
  openLevel(cdp, URL, W, H, LEVELS.findIndex((l) => l.id === id), LEVELS.length,
            () => shoot(`${W}x${H}-levels`));

const K = CONFIG.ENEMY.CHARGER;

for (const [W, H] of [[568, 320], [740, 280]]) {
  console.log(`\n${W}x${H}, level 10: the charger's poses`);
  await open(W, H, 10);
  // Spawn 200 to the pen's step at 1400; with no jump the ball stops there,
  // at about 1375, some three seconds into the hold. The charger starts at
  // 2100 walking left at PATROL_SPEED and sees the ball from SEE away, at
  // about 1615: (2100 - 1615) / 120 is about 4s into the level, or 3.1s
  // into the hold, since the level starts 0.9s before it. So the pictures
  // start at 1.8s, well before that, or the patrol towards the ball is never
  // in one.
  await press(cdp, Buttons.right(W, H));
  const began = Date.now();
  let held = true;
  await sleep(1800);
  // The charge itself is short: from where it sees the ball to the step is
  // about 130 at CHARGE_SPEED, under 0.3s, so a picture every quarter second
  // can step right over it. The wind-up's crouch is the cue: drawCharger
  // squashes the body to 0.82 of its height while winding up, which takes
  // the colour count to about 0.8 of a standing charger's, so a count below
  // 0.9 of the most seen so far is the crouch. From there the pictures are
  // taken back to back, by the clock rather than by counting frames: for
  // the whole of WINDUP (the crouch may be caught at its very start), the
  // longest charge the level allows (SEE / CHARGE_SPEED, 0.5s), and 0.2s
  // over. That is about a dozen pictures at the ~125ms one takes here.
  //
  // 32 pictures in all: a few of the patrol towards the ball, the burst,
  // and then about 17 a quarter second apart (some 6s) — the whole of the
  // 3s daze and its stars going, and the patrol away until it walks off.
  const burstFor = (K.WINDUP + K.SEE / K.CHARGE_SPEED + 0.2) * 1000;
  let seen = 0, burstUntil = 0;
  const counts = [];
  for (let i = 0; i < 32; i++) {
    if (held && Date.now() - began >= 3600) {
      await release(cdp);
      held = false;
    }
    const n = await enemyPixels();
    counts.push(n);
    if (!burstUntil && n > 0 && n < 0.9 * seen) burstUntil = Date.now() + burstFor;
    seen = Math.max(seen, n);
    await shoot(`${W}x${H}-10-${String(i).padStart(2, '0')}`);
    if (Date.now() >= burstUntil) await sleep(250);
  }
  if (!burstUntil) fail(`the wind-up's crouch was never seen at ${W}x${H}, so the charge may not be in any picture`);
  if (held) await release(cdp);
  console.log(`   charger-colour pixels, frame by frame: ${counts.join(' ')}`);
  console.log(`   most charger-colour pixels in one frame: ${seen}`);
  // A standing charger, whole on screen, measured about 1500 at 568x320 and
  // 1100 at 740x280 (and a crouch about 1200 and 920). 500 is under half the
  // smaller, so a charger partly off the edge still passes, while a few
  // stray pixels of that violet somewhere never could.
  if (seen < 500) fail(`the charger was never drawn at ${W}x${H} (at most ${seen} pixels of its colour)`);

  console.log(`\n${W}x${H}, level 11: opening`);
  await open(W, H, 11);
  await hold(Buttons.right(W, H), 3000);
  await shoot(`${W}x${H}-11-roof`);
  // And on up the slope onto the roof itself, with the charger in its pen
  // below: the roof has to read as somewhere to roll, not as a wall's top.
  await hold(Buttons.right(W, H), 1500);
  await shoot(`${W}x${H}-11-roof-top`);
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nCHARGERS DRAWN');
process.exit(failures ? 1 : 0);
