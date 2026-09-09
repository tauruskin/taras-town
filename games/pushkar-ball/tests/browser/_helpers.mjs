// Shared plumbing for the browser suites: a DevTools connection, taps, and the
// one thing that makes any of these tests possible — finding the ball by its
// colour.
//
// There is no test-only code in the game, so nothing can be asked of it
// directly. What the suites do instead is read pixels: the ball is the only
// red thing on the screen, so the centroid of the red pixels IS the ball's
// position, to within a pixel. Same rule Taras Town follows, for the same
// reason — a hook the game only has because a test wanted it is a hook that
// ships to a child's phone and rots.
import { writeFileSync } from 'node:fs';

/**
 * Open a page of our own and attach to it.
 *
 * A page of our OWN, deliberately, rather than whichever tab the browser
 * happens to have open. The suites share one Chrome, and a page that has
 * already been driven by another suite can end up refusing synthesised touch
 * input entirely — Chrome accepts every `Input.dispatchTouchEvent`, replies
 * with success, and delivers no pointer event to the page at all. What that
 * looks like from here is a game that ignores its own buttons: the ball sits
 * still, nothing errors, and the suite blames the game. It cost an afternoon.
 * A fresh tab per suite has fresh input state and cannot inherit that.
 */
export async function connect(port, tag) {
  const made = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,
                                  { method: 'PUT' })).json();
  const ws = new WebSocket(made.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  // Anything the page threw. Collected rather than thrown here, so a suite
  // reports its own findings first and then the exception, instead of dying
  // mid-run with no idea how far it got.
  const problems = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description ||
                                     m.params.exceptionDetails.text));
    }
  });

  // A command that Chrome REFUSES is collected, never ignored. This cost most
  // of an afternoon: a leftover touch point from the previous suite made every
  // `Input.dispatchTouchEvent` come back as an error, the errors were dropped
  // on the floor here, and what the suite saw was a ball that would not move —
  // indistinguishable from a game that ignores its buttons, and it sent the
  // search into the game three times before the harness owned up.
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pending.set(i, (m) => {
      if (m.error) problems.push(`CDP ${method} refused: ${m.error.message}`);
      r(m);
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = async (expr) =>
    (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  // Written to the working directory, which run.mjs sets to tests/screenshots.
  const shoot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${tag}-${name}.png`, Buffer.from(s.result.data, 'base64'));
  };

  await send('Runtime.enable');
  await send('Page.enable');
  // Never let the browser answer from its HTTP cache. Chrome's profile lives
  // in tests/screenshots and outlives a run, so without this a module edited
  // between runs can still be served stale — and what that looks like is a
  // brand new exception from code you have just fixed, or worse, a suite that
  // passes against the previous version of the game.
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  return { send, sleep, ev, shoot, problems };
}

/** Put the browser on a given screen, clear any storage, and start the game. */
export async function boot({ send, sleep, ev }, url, w, h) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 2, mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // Away from the page before clearing its storage, so nothing writes back on
  // the way out.
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Storage.clearDataForOrigin', {
    origin: url.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
  });
  await send('Page.navigate', { url });
  await sleep(1600);
  await ev("document.getElementById('start-button').click()");
  await sleep(500);
}

/**
 * Is the pixel at `i` the body of the ball?
 *
 * Source for an expression, not a function, because it is spliced into code
 * that runs inside the page. It lives here so that every suite asks the same
 * question — a second copy of this test drifting from the first is how a
 * browser suite ends up passing for the wrong reason.
 *
 * This is a test of HUE, and both halves of it were learned the hard way.
 *
 * A plain "red-ish" test on the channels (r > 170, g < 130, b < 110) also
 * matches the crate wall: #C98A4B blended against its own darker outline
 * #9C6631 comes out around 191,129,68, which passed, and since that wall runs
 * the full height of the level it dragged the centroid clean off the ball and
 * made every position this returned a measurement of the scenery.
 *
 * Tightening the channels instead is the trap on the other side. The ball is
 * drawn UNDER the on-screen buttons, and a button is a 30% white wash, so a
 * ball behind one reads 239,121,106 rather than 232,64,42. Any threshold on a
 * channel or on r-g throws most of the ball away exactly when a button is
 * being held — which is exactly when a roll is being measured — and reports a
 * ball that did not move.
 *
 * Hue survives that wash untouched: (g-b)/(r-b) is 0.114 for the ball at every
 * wash strength, and 0.50 for the crate at every wash strength. So the test is
 * "much more red than blue, and barely any greener than it is blue", which
 * admits the ball's body, its two darker marks and its highlight, washed or
 * not, and admits nothing else in the level's palette — not the green ground
 * (r-b is 39), not the yellow flag (far too green), not brown at any blend.
 */
export const IS_BALL =
  '(d[i] - d[i + 2] > 60 && (d[i + 1] - d[i + 2]) * 4 < d[i] - d[i + 2])';

/**
 * Where the ball is on screen, and how big it looks.
 *
 * The centroid of every ball pixel. The level is green, blue, brown and grey
 * on purpose, so nothing else can be mistaken for the hero — if a red thing is
 * ever added to the world, this is what will break, and it will break loudly.
 *
 * Returned in CSS pixels, not device pixels: the canvas is drawn at
 * devicePixelRatio, and a tap is not.
 */
export function ballAt(ev) {
  return ev(`(() => {
    const c = document.getElementById('game'), g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (${IS_BALL}) {
        const p = i / 4;
        sx += p % c.width; sy += Math.floor(p / c.width); n++;
      }
    }
    const dpr = c.width / parseFloat(c.style.width);
    return n ? { x: sx / n / dpr, y: sy / n / dpr, pixels: n } : null;
  })()`);
}

/** Hold a button down for a while. */
export function makeHold({ send, sleep }) {
  return async (b, ms) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 1 }] });
    await sleep(ms);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}
