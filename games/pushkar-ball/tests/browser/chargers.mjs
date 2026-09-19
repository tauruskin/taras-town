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
import { connect, makeHold } from './_helpers.mjs';

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

async function openLevel(W, H, id) {
  const index = LEVELS.findIndex((l) => l.id === id);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL });
  await sleep(1600);
  await ev(`localStorage.setItem('pushkar-ball-save', JSON.stringify({ unlocked: ${LEVELS.length}, finished: [] }))`);
  await send('Page.navigate', { url: URL });
  await sleep(1600);
  await ev("document.getElementById('start-button').click()");
  await sleep(400);
  await shoot(`${W}x${H}-levels`);
  await ev(`document.querySelectorAll('#level-grid .tile')[${index}].click()`);
  await sleep(900);
}

for (const [W, H] of [[568, 320], [740, 280]]) {
  console.log(`\n${W}x${H}, level 10: the charger's poses`);
  await openLevel(W, H, 10);
  // Spawn 200 to the pen's step at 1400; with no jump the ball stops there,
  // in about three seconds. The charger starts at 2100 walking left and sees
  // the ball from 240 away, a little after that — so the pictures start
  // before the ball arrives, or the patrol towards it is never in one.
  const right = Buttons.right(W, H);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: right.x, y: right.y, id: 1 }] });
  const began = Date.now();
  let held = true;
  await sleep(1800);
  // The charge itself is short: from where it sees the ball to the step is
  // about 130 at 480/s, under 0.3s, so a picture every quarter second can
  // step right over it. The wind-up's crouch is the cue — it draws the body
  // squashed, so its colour count drops below nine tenths of the most seen —
  // and from there the pictures are taken back to back for a while, which
  // catches the rest of the wind-up and the charge.
  let seen = 0, burst = 0, bursted = false;
  const counts = [];
  for (let i = 0; i < 32; i++) {
    if (held && Date.now() - began >= 3600) {
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      held = false;
    }
    const n = await enemyPixels();
    counts.push(n);
    if (!bursted && n > 0 && n < 0.9 * seen) { burst = 12; bursted = true; }
    seen = Math.max(seen, n);
    await shoot(`${W}x${H}-10-${String(i).padStart(2, '0')}`);
    if (burst > 0) burst--;
    else await sleep(250);
  }
  if (!bursted) fail(`the wind-up's crouch was never seen at ${W}x${H}, so the charge may not be in any picture`);
  if (held) await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log(`   charger-colour pixels, frame by frame: ${counts.join(' ')}`);
  console.log(`   most charger-colour pixels in one frame: ${seen}`);
  if (seen < 200) fail(`the charger was never drawn at ${W}x${H} (at most ${seen} pixels of its colour)`);

  console.log(`\n${W}x${H}, level 11: opening`);
  await openLevel(W, H, 11);
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
