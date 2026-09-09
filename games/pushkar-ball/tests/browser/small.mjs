// The small screens. A child must always be able to get out of whatever he is
// in, and Taras Town found three separate bugs of exactly this shape — a room
// whose only exit was below the bottom edge, a picker whose close button fell
// off an iPhone SE, a house with no home button. Finding them here is free.
import { connect, boot, ballAt } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'small';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// An iPhone SE on its side, and a short landscape window.
for (const [W, H] of [[568, 320], [740, 280]]) {
  console.log(`\n${W}x${H}`);

  // Before play: the way back to the hub must be reachable.
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL });
  await sleep(1400);
  const hub = await ev(`(() => {
    const b = document.getElementById('hub-button');
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             vw: innerWidth, vh: innerHeight,
             shown: getComputedStyle(b).display !== 'none' };
  })()`);
  if (!hub.shown) fail(`the hub button is not shown on ${W}x${H}`);
  if (hub.x < 0 || hub.y < 0 || hub.x + hub.w > hub.vw || hub.y + hub.h > hub.vh) {
    fail(`the hub button is off a ${W}x${H} screen`);
  }
  const play = await ev(`(() => {
    const r = document.getElementById('start-button').getBoundingClientRect();
    return { ok: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  })()`);
  if (!play.ok) fail(`the play button is off a ${W}x${H} screen`);
  await shoot(`${W}x${H}-1-start`);

  // In play: all three controls on screen, and the ball visible.
  await boot(cdp, URL, W, H);
  await sleep(900);
  for (const name of ['left', 'right', 'jump']) {
    const b = Buttons[name](W, H);
    if (b.x - b.r < 0 || b.y - b.r < 0 || b.x + b.r > W || b.y + b.r > H) {
      fail(`the ${name} button is off a ${W}x${H} screen`);
    }
  }
  const ball = await ballAt(ev);
  if (!ball) fail(`the ball is not visible on ${W}x${H}`);
  else console.log(`   ball at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}, all three buttons on screen`);
  await shoot(`${W}x${H}-2-playing`);
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nSMALL SCREENS ARE PLAYABLE');
process.exit(failures ? 1 : 0);
