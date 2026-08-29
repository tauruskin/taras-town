// Getting out of a vehicle, in a real browser: drive hard up against scenery,
// press the button, and try to walk away.
//
// WHAT THIS SUITE IS FOR, honestly. It is a smoke test, not the regression
// test for the "stuck inside things" bug. That was measured: with the old
// broken exitSpot put back deliberately, offline/getting-out failed five ways
// while every check here still passed — the bad cases are about 32 in 5040,
// far too rare for four rounds to land on. offline/getting-out is what guards
// the fix; this guards the thing that suite cannot see, namely that the whole
// business works end to end in a browser — the button responds, the player
// really is put down somewhere he can walk, and nothing throws.
//
// Measuring "can he walk?" needs care. The town is full of neighbours strolling
// about, so "did the picture change?" is TRUE even when the player is wedged
// solid — a check like that would pass for entirely the wrong reason. What
// separates the two cases is HOW MUCH of the picture changes: walking scrolls
// the whole world and repaints nearly every pixel, while being stuck leaves
// everything but a couple of small moving figures exactly where it was.
import { writeFileSync } from 'node:fs';
import { makeWalker, town, nearestCar } from './_helpers.mjs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'getting-out-live';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let id = 0;
const pending = new Map();
const problems = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    problems.push('LOG ERROR: ' + m.params.entry.text);
  }
});
const send = (method, params = {}) => new Promise((r) => {
  const myId = ++id; pending.set(myId, r);
  ws.send(JSON.stringify({ id: myId, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;

const VK = { w: 87, a: 65, s: 83, d: 68, ' ': 32 };
const key = (type, k) => send('Input.dispatchKeyEvent', {
  type, key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase(),
  windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k],
});
const hold = async (k, ms) => { await key('keyDown', k); await sleep(ms); await key('keyUp', k); };

const shots = [];
const shoot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const file = `${TAG}-${name}.png`;
  writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  shots.push(file);
};

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

/**
 * Back to a clean save at the town-centre spawn.
 *
 * Storage is cleared while the game is NOT loaded, because it writes on
 * `pagehide` — clearing and then navigating puts the old position straight
 * back. Every round starts from here, rather than trying to walk back to the
 * car it just left: once he has been rammed into a corner, "walk back the way
 * you came" does not reliably return him, and the round after would then fail
 * for reasons that have nothing to do with getting out of vehicles.
 */
async function startFresh() {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(400);
  await send('Storage.clearDataForOrigin', {
    origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
  });
  await send('Page.navigate', { url: URL });
  await sleep(2400);
  await ev(`document.getElementById('start-button').click()`);
  await sleep(900);
}

await startFresh();

// --- reading the game off the canvas -------------------------------------
const buttonRgb = () => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const d = g.getImageData(Math.round((parseFloat(c.style.width) - 96) * dpr),
                           Math.round((parseFloat(c.style.height) - 92 - 34) * dpr), 1, 1).data;
  return d[0] + ',' + d[1] + ',' + d[2];
})()`);
const near = (s, r, g, b, tol = 26) => {
  const [R, G, B] = s.split(',').map(Number);
  return Math.abs(R - r) <= tol && Math.abs(G - g) <= tol && Math.abs(B - b) <= tol;
};
const state = async () => {
  const s = await buttonRgb();
  return near(s, 90, 200, 90) ? 'CAN-ENTER' : near(s, 255, 159, 69) ? 'DRIVING' : 'no button';
};

/** A coarse sample of the whole view, for comparing before and after. */
const frame = () => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const out = [];
  for (let i = 0; i < d.length; i += 4 * 53) out.push(d[i]);
  return out;
})()`);

/** What fraction of the view changed between two samples. */
const changed = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 12) n++;
  return n / a.length;
};

/**
 * Try to walk in all four directions, and report the BIGGEST change any of
 * them produced. Walking freely repaints most of the screen; being wedged
 * leaves it nearly identical however long a key is held.
 *
 * Each direction is walked back again afterwards, so measuring whether he can
 * move does not quietly carry him away from the car he just got out of — which
 * would break the next round for reasons that have nothing to do with the game.
 */
const OPPOSITE = { w: 's', s: 'w', a: 'd', d: 'a' };
const walkiness = async () => {
  let best = 0;
  for (const k of ['w', 'a', 's', 'd']) {
    const before = await frame();
    await hold(k, 650);
    await sleep(180);
    best = Math.max(best, changed(before, await frame()));
    await hold(OPPOSITE[k], 650);        // back roughly where we started
    await sleep(120);
  }
  return best;
};

const press = async () => { await key('keyDown', ' '); await sleep(90); await key('keyUp', ' '); await sleep(750); };

// --- calibration: what does freely walking look like? --------------------
//
// Taken at spawn, in the open, where he can certainly move. Everything below
// is judged against this rather than against a number picked out of the air.
const freely = await walkiness();
check('walking in the open repaints most of the view', freely > 0.30, (freely * 100).toFixed(0) + '% of pixels');
const STUCK_BELOW = freely * 0.35;

const world = await town();
const theCar = await nearestCar(world);
const { walkTo } = makeWalker({ send, ev, sleep });

/** Walk to the nearest parked car and get in. */
async function getIntoTheCar() {
  const reached = await walkTo(theCar.x, theCar.y, 70);
  if (!reached.arrived) return false;
  if ((await state()) !== 'CAN-ENTER') return false;
  await press();
  return (await state()) === 'DRIVING';
}

/**
 * Drive forward until the vehicle physically cannot go any further.
 *
 * Simply holding "forward" for a few seconds is NOT enough, and quietly
 * testing nothing: the first version of this drove happily up the middle of
 * the road and got out in open space, so every check passed without the bug
 * ever being reproduced. Pushing until the view stops changing is what
 * actually wedges it against scenery.
 *
 * @returns true if it ended up genuinely stuck against something
 */
async function ramUntilStuck() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await frame();
    await hold('w', 900);
    await sleep(150);
    if (changed(before, await frame()) < 0.06) return true;   // going nowhere
  }
  return false;
}

// --- ram it into things, and get out each time ---------------------------
//
// Four different headings, so we end up jammed against several different bits
// of scenery rather than testing one lucky corner over and over. The turns are
// long enough to swing the car well off the road.
// Every one of these turns first: driving straight from the spawn just goes up
// the open road for ever and wedges against nothing at all.
const runs = [
  ['a'],
  ['d', 'd'],
  ['a', 'a'],
  ['d', 'd', 'd', 'd'],
];

let refusals = 0;
for (let i = 0; i < runs.length; i++) {
  if (i > 0) await startFresh();
  if (!(await getIntoTheCar())) { check(`round ${i + 1}: got into a car`, false, await state()); continue; }

  for (const k of runs[i]) await hold(k, 700);
  const wedged = await ramUntilStuck();
  await sleep(300);
  await shoot(`${i + 1}-jammed`);

  // If it never got stuck, this round is not exercising the bug at all, and
  // saying so is the whole point — a green tick here would be a lie.
  check(`round ${i + 1}: drove until the car was truly stuck`, wedged,
        wedged ? 'wedged against scenery' : 'never stopped moving');

  await press();
  const after = await state();

  if (after === 'DRIVING') {
    // Nowhere to stand, so the game kept him in the vehicle. That is the
    // designed answer for a really tight spot, and it is recoverable.
    refusals++;
    console.log(`  ok    round ${i + 1}: no room to get out, kept him in the car`);
    continue;
  }

  const moved = await walkiness();
  check(`round ${i + 1}: can walk after getting out`, moved > STUCK_BELOW,
        (moved * 100).toFixed(0) + '% of pixels (stuck is under ' + (STUCK_BELOW * 100).toFixed(0) + '%)');
  await shoot(`${i + 1}-after-getting-out`);
}

check('and he was not simply refused every time', refusals < runs.length, refusals + ' of ' + runs.length + ' refused');

console.log('');
console.log('screenshots: ' + shots.join(', '));
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? `${fail} FAILURE(S)` : 'ALL GETTING-OUT-LIVE CHECKS PASSED');
ws.close();
process.exit(fail || problems.length ? 1 : 0);
