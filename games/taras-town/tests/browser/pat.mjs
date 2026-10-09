// Walk to a dog, pat it, walk away, and see that it came too.
//
// Where the dog lives is asked of the real generation code in node, the same
// way every other suite finds things. Whether it followed is read off the
// canvas: pixels of the dog's colour near the player, who is in the middle
// of the screen. No test-only code ships in the game for this.
import { writeFileSync } from 'node:fs';
import { makeWalker, town, makeRouter } from './_helpers.mjs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'pat';
const W = 844, H = 390;

const { Menu } = await import('../../js/ui.js');
const { CONFIG } = await import('../../js/config.js');
const ACTION = Menu.actionPos(W, H);

const world = await town();
// Only a dog he can walk to without swimming: one on an island is not a fair test.
const dogs = world.animalSpots.filter((s) => s.kind === 'dog' && world.onMainland(s.x, s.y));
const dog = dogs.sort((a, b) =>
  Math.hypot(a.x - world.spawn.x, a.y - world.spawn.y) -
  Math.hypot(b.x - world.spawn.x, b.y - world.spawn.y))[0];

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('LOG: ' + m.params.entry.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
const shoot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(TAG + '-' + n + '.png', Buffer.from(s.result.data, 'base64')); };

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage' });
await send('Page.navigate', { url: URL }); await sleep(2400);
await ev("document.getElementById('start-button').click()");
await sleep(1400);

const { walkTo, pos } = makeWalker({ send, ev, sleep });
const route = makeRouter(world);

/** How many pixels in a box round the middle of the screen are dog-coloured. */
const hex = CONFIG.ANIMALS.COLORS.dog.body;
const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dogPixelsNearMiddle = () => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const box = 160 * dpr;
  const d = g.getImageData(Math.round(c.width / 2 - box / 2), Math.round(c.height / 2 - box / 2), box, box).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - ${R}) < 14 && Math.abs(d[i + 1] - ${G}) < 14 && Math.abs(d[i + 2] - ${B}) < 14) n++;
  }
  return n;
})()`);
const buttonColour = async () => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const d = g.getImageData(Math.round(${ACTION.x} * dpr), Math.round(${ACTION.y - ACTION.r * 0.74} * dpr), 1, 1).data;
  return [d[0], d[1], d[2]];
})()`);
const tapAction = async () => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ACTION.x, y: ACTION.y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
};

console.log('');
console.log('1. walk to the nearest dog');
for (const wp of route(world.spawn, dog) || [dog]) await walkTo(wp.x, wp.y, 40);
const arrived = await walkTo(dog.x, dog.y, CONFIG.ANIMALS.PAT_RADIUS - 16);
check('got to the dog', arrived.arrived, JSON.stringify(arrived.pos));
await shoot('1-by-the-dog');

console.log('');
console.log('2. the button offers a pat');
const [r, g, b] = await buttonColour();
check('the action button is pink', Math.abs(r - 255) < 24 && Math.abs(g - 122) < 24 && Math.abs(b - 168) < 24, [r, g, b].join(','));

console.log('');
console.log('3. pat it and walk away');
await tapAction();
await sleep(CONFIG.ANIMALS.HAPPY_TIME * 1000 + 200);
const here = await pos();
// Away from the dog's home, along a route, so it has to follow to be seen.
const away = { x: here.x + (here.x > world.width / 2 ? -320 : 320), y: here.y };
for (const wp of route(here, away) || [away]) await walkTo(wp.x, wp.y, 40);
await sleep(800);
const n = await dogPixelsNearMiddle();
check('the dog is still beside him', n > 20, n + ' dog-coloured pixels');
await shoot('2-followed');

for (const [w, h] of [[568, 320], [740, 280]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  await shoot('3-' + w + 'x' + h);
}

if (problems.length) { check('no errors in the page', false, problems.join(' | ')); }
console.log('');
process.exit(fail ? 1 : 0);
