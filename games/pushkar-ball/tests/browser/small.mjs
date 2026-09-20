// The small screens. A child must always be able to get out of whatever he is
// in, and Taras Town found three separate bugs of exactly this shape — a room
// whose only exit was below the bottom edge, a picker whose close button fell
// off an iPhone SE, a house with no home button. Finding them here is free.
// It also holds the look at level five's bounce pad, for the same reason: the
// bug it watches for was a small-screen bug and nothing else.
import { connect, boot, ballAt, press, release, openLevel } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'small';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');
const { LEVELS } = await import('../../js/levels.js');

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

  // Level select: the way back to the hub, and every tile, on screen.
  await ev("document.getElementById('start-button').click()");
  await sleep(400);
  const sel = await ev(`(() => {
    const on = (r) => r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    const hub = document.getElementById('levels-hub-button').getBoundingClientRect();
    const tiles = [...document.querySelectorAll('#level-grid .tile')].map((t) => t.getBoundingClientRect());
    const overlaps = tiles.some((r) => r.x < hub.right && r.right > hub.x && r.y < hub.bottom && r.bottom > hub.y);
    return { hub: on(hub), tiles: tiles.length, off: tiles.filter((r) => !on(r)).length, overlaps };
  })()`);
  if (!sel.hub) fail(`level select's hub button is off a ${W}x${H} screen`);
  if (sel.tiles === 0) fail(`level select shows no tiles on ${W}x${H}`);
  if (sel.off) fail(`${sel.off} of ${sel.tiles} level tiles are off a ${W}x${H} screen`);
  if (sel.overlaps) fail(`a level tile overlaps the hub button on ${W}x${H}`);
  console.log(`   level select: ${sel.tiles} tiles, all on screen`);
  await shoot(`${W}x${H}-2-levels`);

  // In play: all five controls on screen, and the ball visible.
  await boot(cdp, URL, W, H);
  await sleep(900);
  for (const name of ['left', 'right', 'jump', 'restart', 'levels']) {
    const b = Buttons[name](W, H);
    if (b.x - b.r < 0 || b.y - b.r < 0 || b.x + b.r > W || b.y + b.r > H) {
      fail(`the ${name} button is off a ${W}x${H} screen`);
    }
  }
  const ball = await ballAt(ev);
  if (!ball) fail(`the ball is not visible on ${W}x${H}`);
  else console.log(`   ball at ${ball.x.toFixed(0)},${ball.y.toFixed(0)}, all five buttons on screen`);
  await shoot(`${W}x${H}-3-playing`);

  // Level five's bounce pad, at the top of a bounce, on both small screens.
  // Before CAMERA.TOP_CLEAR an ordinary bounce off the rehearsal pad took the
  // ball's centre 30-40 world units above the top of a 740x280 view — the
  // whole ball, radius and all, gone from the screen on a shipped level, with
  // nothing asserting anything about it. tests/offline/camera.mjs now checks
  // the arithmetic at pad height; this is the looking at it, which is the
  // half that actually found it.
  //
  // The rehearsal pad sits 1300 units along open flat ground, so holding
  // right rolls onto it in about three seconds. From there the ball's screen
  // y is sampled rather than timed, and the picture is retaken every time the
  // ball is higher than it has been — so whatever else the timing does, the
  // file left behind is the top of a bounce.
  //
  // Forty samples 60ms apart, so the window is the 2.5s to 4.9s of the
  // level. A full scan for the ball comes back in under ten milliseconds, so
  // the sleep is what makes this cover the bounce at all rather than a
  // quarter of a second of the approach: without it the whole loop ran before
  // the ball had even reached the pad, and left a picture of it rolling along
  // the flat that looked perfectly plausible. The far end of the window
  // matters as much: the flat ends in a 200 gap at 2500, which an unattended
  // ball rolls into at about six seconds and comes back from three frames
  // later, and "the ball is not on the screen" then means a deflate, not a
  // camera that lost it.
  await openLevel(cdp, URL, W, H, LEVELS.findIndex((l) => l.id === 5), LEVELS.length);
  // Where the ball sits at rest, and how big it looks, before any of this:
  // both are the ruler the bounce is measured against below. The apparent
  // diameter comes from the ball's own pixel count, so it is right at
  // whatever zoom the window gives, and needs no number written here.
  const rest = await ballAt(ev);
  const dpr = await ev("(() => { const c = document.getElementById('game'); return c.width / parseFloat(c.style.width); })()");
  const across = rest ? 2 * Math.sqrt(rest.pixels / Math.PI) / dpr : 0;
  await press(cdp, Buttons.right(W, H));
  await sleep(2500);
  let top = Infinity, lost = 0;
  for (let i = 0; i < 40; i++) {
    const b = await ballAt(ev);
    if (!b) { lost++; }
    else if (b.y < top) { top = b.y; await shoot(`${W}x${H}-4-pad`); }
    await sleep(60);
  }
  await release(cdp);
  // The bounce has to be IN the picture, not merely not-missing from it. A
  // window that covers only flat ground leaves a perfectly plausible picture
  // of the ball rolling, `lost` at nought and nothing to say so — which is
  // exactly what the first version of this did. A whole ball-diameter above
  // where it was resting cannot happen by rolling: the pad lifts it many
  // times that, so this is a floor and not a measurement.
  if (!rest) fail(`the ball was not on a ${W}x${H} screen at level five's spawn`);
  else if (lost) fail(`the ball left a ${W}x${H} screen entirely on ${lost} of 40 frames over level five's pad`);
  else if (top > rest.y - across) {
    fail(`the ball never left the ground over level five's pad at ${W}x${H}: it rose to y=${top.toFixed(0)} `
         + `from a resting ${rest.y.toFixed(0)}, less than the ${across.toFixed(0)} it is wide, so this is not a bounce`);
  } else {
    console.log(`   level five's pad: the ball rose to y=${top.toFixed(0)} of ${H}, `
                + `${(rest.y - top).toFixed(0)} above its resting ${rest.y.toFixed(0)}, on screen throughout`);
  }
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nSMALL SCREENS ARE PLAYABLE');
process.exit(failures ? 1 : 0);
