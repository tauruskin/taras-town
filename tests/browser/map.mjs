// The map in the corner, and the whole-town map you get by tapping it.
//
// The corner map is small on purpose, so the thing that makes it useful is the
// frame drawn round whatever is currently on screen: a dot alone says where you
// are but nothing about how much of the town you can see, and a phone shows
// about a fortieth of it.
import { writeFileSync } from 'node:fs';
import { makeWalker } from './_helpers.mjs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'map';
const W = 844, H = 390;

const { Minimap: _Minimap } = await import('../../js/minimap.js');
const { World: _World } = await import('../../js/world.js');
const _world = new _World();
const MAP = _Minimap.rect(W, H, _world);

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
});
const send = (method, params = {}) => new Promise((r) => {
  const myId = ++id; pending.set(myId, r);
  ws.send(JSON.stringify({ id: myId, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const shoot = async (n) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${TAG}-${n}.png`, Buffer.from(s.result.data, 'base64'));
};
const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(450);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Storage.clearDataForOrigin', {
  origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
});
await send('Page.navigate', { url: URL });
await sleep(2400);
await ev(`document.getElementById('start-button').click()`);
await sleep(1200);

/**
 * How much of a region is bright, near-white pixels.
 *
 * The full map covers the screen with a dark sheet and a big pale town on top
 * of it, so "is the map open?" is a question about how much of the middle of
 * the screen is map-coloured rather than town-coloured.
 */
const brightness = (x, y, w, h) => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const d = g.getImageData(Math.round(${x} * dpr), Math.round(${y} * dpr),
                           Math.round(${w} * dpr), Math.round(${h} * dpr)).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
  return Math.round(sum / n);
})()`);

// --- 1. the corner map is small and out of the way ------------------------
console.log('');
check('the corner map is small', MAP.w <= W * 0.14, Math.round(MAP.w) + 'px wide on a ' + W + 'px screen');
check('and clear of the buttons above it', MAP.y > 50, 'top edge at y=' + Math.round(MAP.y));
check('and does not reach the bottom of the screen', MAP.y + MAP.h < H * 0.6,
      'bottom edge at y=' + Math.round(MAP.y + MAP.h));
await shoot('1-corner-map');

// --- 2. it shows the view frame -------------------------------------------
//
// The frame is white, so the corner map should be measurably brighter than the
// same map drawn without one. Checked by comparing against the dark card the
// map sits on, which is the only reference available from outside the game.
const onMap = await brightness(MAP.x + 2, MAP.y + 2, MAP.w - 4, MAP.h - 4);
check('the corner map is drawn at all', onMap > 40, 'average brightness ' + onMap);

// --- 3. tapping it opens the whole town -----------------------------------
// Sample the EDGE of the screen, not the middle.
//
// The full map keeps the town's proportions, so on a wide phone it leaves a
// dark band down each side — and that band is the signal. The middle is
// covered by the map itself, which is about as bright as the town it replaced,
// so measuring there compares two similar pictures and says almost nothing.
const edge = () => brightness(8, H / 2 - 50, 60, 100);

const edgeBefore = await edge();
await tap(MAP.x + MAP.w / 2, MAP.y + MAP.h / 2);
const edgeAfter = await edge();

check('tapping the corner map dims the town behind it',
      edgeBefore - edgeAfter > 25,
      edgeBefore + ' -> ' + edgeAfter + ' average brightness at the screen edge');
await shoot('2-map-open');

// --- 4. and the game is paused underneath ---------------------------------
//
// Pressing the stick while looking at the map must not walk him off somewhere,
// or a child comes back to find himself in the river.
const { pos } = makeWalker({ send, ev, sleep });
const before = await pos();
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 200, id: 1 }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 210, y: 200, id: 1 }] });
await sleep(900);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
const after = await pos();
check('the joystick does nothing while the map is up',
      Math.hypot(after.x - before.x, after.y - before.y) < 8,
      JSON.stringify(before) + ' -> ' + JSON.stringify(after));

// --- 5. tapping anywhere closes it ----------------------------------------
//
// Anywhere at all, deliberately: a child should never have to find a
// particular spot to get back to the game.
await tap(W * 0.3, H * 0.7);
const edgeClosed = await edge();
check('tapping again closes it', Math.abs(edgeClosed - edgeBefore) < 20,
      edgeAfter + ' -> ' + edgeClosed + ' (started at ' + edgeBefore + ')');
await shoot('3-map-closed');

// And the game works again afterwards.
const beforeWalk = await pos();
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 200, id: 1 }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 210, y: 200, id: 1 }] });
await sleep(900);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
const afterWalk = await pos();
check('and he can walk again once it is shut',
      Math.hypot(afterWalk.x - beforeWalk.x, afterWalk.y - beforeWalk.y) > 30,
      JSON.stringify(beforeWalk) + ' -> ' + JSON.stringify(afterWalk));

console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL MAP CHECKS PASSED');
ws.close();
process.exit(fail || problems.length ? 1 : 0);
