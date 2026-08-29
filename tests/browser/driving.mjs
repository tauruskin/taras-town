// End-to-end milestone 2: walk to a car, get in, drive it, get out again —
// in a real browser, using real touch events.
//
// State is asserted by sampling the live canvas with getImageData rather than
// by exposing test hooks from the game, so nothing test-only ships.
import { writeFileSync } from 'node:fs';
import { makeWalker, town, nearestCar } from './_helpers.mjs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'm2';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(res => ws.addEventListener('open', res));

let id = 0;
const pending = new Map();
const problems = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    problems.push('CONSOLE ERROR: ' + m.params.args.map(a => a.value).join(' '));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    problems.push('LOG ERROR: ' + m.params.entry.text);
  }
});
const send = (method, params = {}) => new Promise(res => {
  const myId = ++id; pending.set(myId, res);
  ws.send(JSON.stringify({ id: myId, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

// Start from a clean save so the player is always at the town-centre spawn.
// This must happen while the game page is NOT loaded: the game saves on
// `pagehide`, so clearing storage and then navigating would immediately
// write the old position straight back.
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);
await send('Storage.clearDataForOrigin', {
  origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
});
await send('Page.navigate', { url: URL });
await sleep(2400);

await evaluate(`document.getElementById('start-button').click()`);
await sleep(700);

// --- helpers --------------------------------------------------------------
const touch = (type, x, y) => send('Input.dispatchTouchEvent', {
  type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
});

/** Colour of the action button's centre, read straight off the live canvas. */
const buttonColour = () => evaluate(`(() => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const x = Math.round((parseFloat(c.style.width) - 96) * dpr);
  // Sample ABOVE the centre: the middle of the button is covered by the
  // white icon, so the centre pixel tells you nothing about which button it is.
  const y = Math.round((parseFloat(c.style.height) - 92 - 34) * dpr);
  const d = g.getImageData(x, y, 1, 1).data;
  return d[0] + ',' + d[1] + ',' + d[2];
})()`);

// The button is green on foot beside a car, orange while driving.
const near = (rgb, r, g, b, tol = 26) => {
  const [R, G, B] = rgb.split(',').map(Number);
  return Math.abs(R - r) <= tol && Math.abs(G - g) <= tol && Math.abs(B - b) <= tol;
};
const state = (rgb) => near(rgb, 90, 200, 90) ? 'CAN-ENTER'
                     : near(rgb, 255, 159, 69) ? 'DRIVING'
                     : 'no button';

const shots = [];
const shoot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const file = `${TAG}-${name}.png`;
  writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  shots.push(file);
};

let failures = 0;
const expect = (label, actual, wanted) => {
  const ok = actual === wanted;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}: ${actual}${ok ? '' : ` (expected ${wanted})`}`);
};

// --- 1. at spawn, no car within reach -------------------------------------
expect('at spawn, no car in reach', state(await buttonColour()), 'no button');
await shoot('1-spawn');

// --- 2. go to the car ------------------------------------------------------
//
// Where the nearest car is depends on the town the game generated, so it is
// asked of the generator rather than typed in as a direction to walk.
const world = await town();
const car = await nearestCar(world);
const { walkTo } = makeWalker({ send, ev: evaluate, sleep });
const reached = await walkTo(car.x, car.y, 70);
expect('walked to the nearest parked car', reached.arrived, true);
expect('after walking to the car, button appears', state(await buttonColour()), 'CAN-ENTER');
await shoot('2-beside-car');

// --- 3. press it and get in ------------------------------------------------
const btn = await evaluate(`(() => {
  const c = document.getElementById('game');
  return JSON.stringify({ x: parseFloat(c.style.width) - 96, y: parseFloat(c.style.height) - 92 });
})()`);
const B = JSON.parse(btn);
await touch('touchStart', B.x, B.y);
await sleep(120);
await touch('touchEnd', 0, 0);
await sleep(700);

expect('after pressing, now driving', state(await buttonColour()), 'DRIVING');
await shoot('3-in-car');

// --- 4. actually drive ----------------------------------------------------
const posBefore = await evaluate(`(() => { try { return localStorage.getItem('tarasTown.save.v1') } catch(e){ return null } })()`);

await touch('touchStart', 120, 250);
for (let i = 0; i < 45; i++) {           // steer up the road, then curve
  const a = -Math.PI / 2 + i * 0.02;
  await touch('touchMove', 120 + Math.cos(a) * 50, 250 + Math.sin(a) * 50);
  await sleep(40);
}
await touch('touchEnd', 0, 0);
await sleep(600);

expect('still driving after 2s at the wheel', state(await buttonColour()), 'DRIVING');
await shoot('4-driving');

// --- 5. get back out ------------------------------------------------------
await touch('touchStart', B.x, B.y);
await sleep(120);
await touch('touchEnd', 0, 0);
await sleep(800);

const after = state(await buttonColour());
const outOk = after === 'CAN-ENTER' || after === 'no button';
if (!outOk) failures++;
console.log(`  ${outOk ? 'ok  ' : 'FAIL'}  got out of the car: ${after}`);
await shoot('5-back-on-foot');

// --- 6. the save moved, i.e. driving actually took him somewhere ----------
await sleep(3200);
const posAfter = await evaluate(`(() => { try { return localStorage.getItem('tarasTown.save.v1') } catch(e){ return null } })()`);
const moved = posBefore !== posAfter;
if (!moved) failures++;
console.log(`  ${moved ? 'ok  ' : 'FAIL'}  position changed while driving`);
console.log(`        before: ${posBefore}`);
console.log(`        after:  ${posAfter}`);

console.log('\nscreenshots: ' + shots.join(', '));
console.log('problems: ' + (problems.length ? '\n  ' + problems.join('\n  ') : 'NONE'));
console.log(failures || problems.length ? `\n${failures} FAILURE(S)` : '\nALL DRIVING CHECKS PASSED');

ws.close();
process.exit(failures || problems.length ? 1 : 0);
