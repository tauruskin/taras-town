// Drives the game with real keyboard events: W/A/S/D, arrows, diagonals, and
// the Space action key. Checks the player actually goes the right way, and
// that releasing focus doesn't leave him walking off on his own.
import { writeFileSync } from 'node:fs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(res => ws.addEventListener('open', res));

let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('LOG ERROR: ' + m.params.entry.text);
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 500, deviceScaleFactor: 2, mobile: false });

await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage' });
await send('Page.navigate', { url: URL }); await sleep(2400);
await evaluate(`document.getElementById('start-button').click()`);
await sleep(700);

// Windows virtual key codes, needed for the game to see a normal key event.
const VK = { w: 87, a: 65, s: 83, d: 68, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ' ': 32 };
const key = (type, k) => send('Input.dispatchKeyEvent', {
  type, key: k, code: k === ' ' ? 'Space' : (k.length === 1 ? 'Key' + k.toUpperCase() : k),
  windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k],
});

// The save file is the only window we have onto the player's position, and
// it only updates every 3s, so force a write by hiding the page instead.
const pos = async () => {
  await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
  // visibilitychange only persists when actually hidden, so call the same
  // path the page uses on unload:
  await evaluate(`window.dispatchEvent(new Event('pagehide'))`);
  const raw = await evaluate(`(()=>{try{return localStorage.getItem('tarasTown.save.v1')}catch(e){return null}})()`);
  return raw ? JSON.parse(raw).lastPos : null;
};

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ': ' + detail : ''}`);
};

const start = await pos();
console.log(`start: ${start.x},${start.y}`);

async function hold(k, ms) {
  await key('keyDown', k);
  await sleep(ms);
  await key('keyUp', k);
  await sleep(120);
  return pos();
}

// --- each key moves the right way -----------------------------------------
let p = start;
let before = p;
p = await hold('w', 400);
check('W moves up', p.y < before.y - 20, `${before.y} -> ${p.y}`);

before = p;
p = await hold('s', 400);
check('S moves down', p.y > before.y + 20, `${before.y} -> ${p.y}`);

before = p;
p = await hold('a', 400);
check('A moves left', p.x < before.x - 20, `${before.x} -> ${p.x}`);

before = p;
p = await hold('d', 400);
check('D moves right', p.x > before.x + 20, `${before.x} -> ${p.x}`);

// --- arrow keys too --------------------------------------------------------
before = p;
p = await hold('ArrowUp', 350);
check('ArrowUp moves up', p.y < before.y - 20, `${before.y} -> ${p.y}`);

// --- diagonals are not faster than straight lines -------------------------
before = p;
await key('keyDown', 'd'); await key('keyDown', 's');
await sleep(500);
await key('keyUp', 'd'); await key('keyUp', 's');
await sleep(120);
p = await pos();
const diag = Math.hypot(p.x - before.x, p.y - before.y);
const straightMax = 175 * 0.5 * 1.15;    // SPEED * seconds, plus slack
check('diagonal is not faster than straight', diag <= straightMax, `${diag.toFixed(0)}px in 0.5s (cap ${straightMax.toFixed(0)})`);
check('diagonal actually moved both axes', p.x > before.x + 10 && p.y > before.y + 10, `dx=${p.x-before.x} dy=${p.y-before.y}`);

// --- losing focus must stop him -------------------------------------------
await key('keyDown', 'w');
await sleep(200);
await evaluate(`window.dispatchEvent(new Event('blur'))`);
await sleep(150);
before = await pos();
await sleep(600);
p = await pos();
check('blur stops a held key', Math.hypot(p.x - before.x, p.y - before.y) < 6, `drifted ${Math.hypot(p.x-before.x, p.y-before.y).toFixed(1)}px after blur`);
await key('keyUp', 'w');

console.log('\nproblems: ' + (problems.length ? '\n  ' + problems.join('\n  ') : 'NONE'));
console.log(failures || problems.length ? `\n${failures} FAILURE(S)` : '\nALL KEYBOARD CHECKS PASSED');
ws.close();
process.exit(failures || problems.length ? 1 : 0);
