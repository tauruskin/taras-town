// Milestone 3: open the menu, pick a hat / shirt / car colour, close it,
// reload, and check the choices survived. Colours are read off the live
// canvas so this asserts what is actually drawn, not what we believe.
import { writeFileSync } from 'node:fs';
const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'menu';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('LOG: ' + m.params.entry.text);
});
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
const shoot = async n => { const s = await send('Page.captureScreenshot', { format:'png' }); writeFileSync(`${TAG}-${n}.png`, Buffer.from(s.result.data,'base64')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0,3).join('/'), storageTypes: 'local_storage' });

async function boot() {
  await send('Page.navigate', { url: URL }); await sleep(2400);
  await ev(`document.getElementById('start-button').click()`); await sleep(700);
}
await boot();

const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(280);
};
const pixel = (x, y) => ev(`(() => { const c=document.getElementById('game'), g=c.getContext('2d');
  const dpr=c.width/parseFloat(c.style.width);
  const d=g.getImageData(Math.round(${x}*dpr), Math.round(${y}*dpr),1,1).data;
  return d[0]+','+d[1]+','+d[2]; })()`);
const hex = s => '#' + s.split(',').map(n => (+n).toString(16).padStart(2,'0')).join('').toUpperCase();
const saved = async () => JSON.parse(await ev(`(()=>{try{return localStorage.getItem('tarasTown.save.v1')}catch(e){return 'null'}})()`) || 'null');

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log(`  ${ok?'ok  ':'FAIL'}  ${l}${d?': '+d:''}`); };

const W = 844, H = 390;
const opener = { x: W - 52, y: 52 };
// Layout mirrors ui.js
// Mirrors ui.js. Four rows now that vehicles are for sale, so the dots are
// smaller and sit differently than they did with three.
const R = Math.min(26, H * 0.072);
const FIRST = W * 0.175;
const GAP = ((W - R - 20) - FIRST) / 7;   // spacing comes from the widest row (8)
const ROW_Y = [H * 0.30, H * 0.465, H * 0.63, H * 0.795];
const swatch = (row, i) => ({ x: FIRST + i * GAP, y: ROW_Y[row] });

// --- open the menu ---------------------------------------------------------
await tap(opener.x, opener.y);
await shoot('1-open');
// The dim overlay should now cover the middle of the screen.
const mid = await pixel(W / 2, H * 0.10);
check('menu opened (screen is dimmed)', hex(mid) !== '#8A94A3' && (+mid.split(',')[0]) < 140, hex(mid));

// --- pick hat 4 (purple), shirt 3 (green), car 1 (blue) --------------------
// Only the first FREE_PER_ROW colours in each row are free; the rest are
// locked until bought, and a locked dot is drawn dimmed and cannot be worn.
// This test is about the menu, not the shop, so it sticks to the free ones.
const picks = { hat: 1, shirt: 2, car: 1 };
const expected = { hat: '#FF6B6B', shirt: '#FFD93D', car: '#4EA8FF' };

for (const [rowIdx, name] of [[0,'hat'],[1,'shirt'],[2,'car']]) {
  const s = swatch(rowIdx, picks[name]);
  await tap(s.x, s.y);
  const got = hex(await pixel(s.x, s.y));
  check(`${name} swatch ${picks[name]} shows the right colour`, got === expected[name], `${got} (want ${expected[name]})`);
}
await shoot('2-picked');

const afterPick = await saved();
check('choices written to the save', afterPick.hat === 1 && afterPick.shirt === 2 && afterPick.car === 1,
      JSON.stringify({ hat: afterPick.hat, shirt: afterPick.shirt, car: afterPick.car }));

// --- close, and confirm the town is running again --------------------------
await tap(opener.x, opener.y);
await sleep(300);
const road = await pixel(W / 2, H * 0.10);
check('menu closed (town visible again)', (+road.split(',')[0]) > 120, hex(road));
await shoot('3-closed');

// --- the town really is paused while the menu is open ----------------------
await tap(opener.x, opener.y);       // open again
const p1 = (await saved()).lastPos;
// Drag well below the bottom row of dots, so this really is testing the
// joystick and not quietly landing on a swatch.
const DRAG_Y = H - 20;
if (Math.abs(DRAG_Y - ROW_Y[2]) < R + 12) throw new Error('drag point overlaps a swatch; move it');
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: DRAG_Y, id: 1 }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: DRAG_Y, id: 1 }] });
await sleep(900);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await ev(`window.dispatchEvent(new Event('pagehide'))`);
const p2 = (await saved()).lastPos;
check('joystick does nothing while the menu is open',
      p1.x === p2.x && p1.y === p2.y, `${p1.x},${p1.y} -> ${p2.x},${p2.y}`);
await tap(opener.x, opener.y);       // close

// --- reload: choices must survive -----------------------------------------
await ev(`window.dispatchEvent(new Event('pagehide'))`);
await boot();
const reloaded = await saved();
check('choices survive a reload', reloaded.hat === 1 && reloaded.shirt === 2 && reloaded.car === 1,
      JSON.stringify({ hat: reloaded.hat, shirt: reloaded.shirt, car: reloaded.car }));

await tap(opener.x, opener.y);
const s0 = swatch(0, 1);
const still = hex(await pixel(s0.x, s0.y));
check('menu reopens on the saved hat colour', still === expected.hat, still);
await shoot('4-after-reload');

console.log('\nproblems: ' + (problems.length ? '\n  ' + problems.join('\n  ') : 'NONE'));
console.log(fail || problems.length ? `\n${fail} FAILURE(S)` : '\nALL MENU CHECKS PASSED');
ws.close(); process.exit(fail || problems.length ? 1 : 0);
