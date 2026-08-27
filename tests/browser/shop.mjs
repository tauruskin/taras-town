// Milestone 5 end to end: pick coins up off the street, then spend them in
// the menu. Checks that a locked colour cannot be worn until it is bought,
// that buying deducts the right amount, and that it all survives a reload.
import { writeFileSync } from 'node:fs';
const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'shop';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('LOG: ' + m.params.entry.text);
});
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
const shoot = async n => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(TAG + '-' + n + '.png', Buffer.from(s.result.data, 'base64')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
const W = 844, H = 390;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage' });

async function boot() {
  await send('Page.navigate', { url: URL }); await sleep(2400);
  await ev("document.getElementById('start-button').click()");
  await sleep(1400);   // let a cold browser get its first frames out
}
await boot();

const pixel = (x, y) => ev(
  "(() => { const c=document.getElementById('game'), g=c.getContext('2d');" +
  " const dpr=c.width/parseFloat(c.style.width);" +
  " const d=g.getImageData(Math.round(" + x + "*dpr), Math.round(" + y + "*dpr),1,1).data;" +
  " return d[0]+','+d[1]+','+d[2]; })()");
const hex = s => '#' + s.split(',').map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
// The game only writes on a timer or when something happens, so a failed
// purchase (which correctly changes nothing) leaves no file at all. Nudge a
// write first so there is always something to read.
const save = async () => {
  await ev("window.dispatchEvent(new Event('pagehide'))");
  const raw = await ev("(()=>{try{return localStorage.getItem('tarasTown.save.v1')}catch(e){return null}})()");
  return raw ? JSON.parse(raw) : null;
};
const pos = async () => (await save()).lastPos;
const coins = async () => { const s = await save(); return s ? s.coins : 0; };

const push = async (vx, vy, ms) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 200, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + vx * 60, y: 200 + vy * 60, id: 1 }] });
  await sleep(ms);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(110);
};
const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(320);
};

async function walkTo(tx, ty, tol, tries = 30) {
  let last = null, stalls = 0, sign = 1;
  for (let i = 0; i < tries; i++) {
    const p = await pos();
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d <= tol) return { arrived: true, pos: p };
    let a = Math.atan2(ty - p.y, tx - p.x);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 6) {
      if (++stalls > 4) return { arrived: false, pos: p, stuck: true };
      a += sign * 1.15; sign = -sign;
      await push(Math.cos(a), Math.sin(a), 600); last = p; continue;
    }
    stalls = 0; last = p;
    await push(Math.cos(a), Math.sin(a), Math.min(620, Math.max(150, (d / 175) * 1000)));
  }
  return { arrived: false, pos: await pos() };
}

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// Menu geometry, mirroring ui.js.
const R = Math.min(34, H * 0.095);
const FIRST = W * 0.175;
const GAP = ((W - R - 24) - FIRST) / 7;
const ROW_Y = [H * 0.33, H * 0.56, H * 0.79];
const swatch = (row, i) => ({ x: FIRST + i * GAP, y: ROW_Y[row] });
const OPENER = { x: W - 52, y: 52 };

// Coins nearest the spawn point, worked out offline.
const NEAR_COINS = [
  { x: 1248, y: 1120 }, { x: 1376, y: 1376 }, { x: 1440, y: 992 },
  { x: 1120, y: 1312 }, { x: 1568, y: 1184 }, { x: 1120, y: 928 },
  { x: 992, y: 1120 }, { x: 1312, y: 800 }, { x: 1696, y: 992 },
  { x: 1120, y: 1568 }, { x: 1376, y: 1632 }, { x: 1696, y: 1504 },
];

check('starts with no coins', (await coins()) === 0, String(await coins()));

// --- 1. a locked colour cannot be worn while broke -------------------------
await tap(OPENER.x, OPENER.y);
await shoot('1-shop-broke');
const locked = swatch(0, 6);              // hat 6 costs coins
await tap(locked.x, locked.y);
await sleep(200);
const afterBroke = await save();
check('tapping a locked colour while broke does not wear it', afterBroke.hat !== 6, 'hat = ' + afterBroke.hat);
check('and does not go into debt', afterBroke.coins === 0, afterBroke.coins + ' coins');
check('and does not unlock it', !(afterBroke.unlocked.hat || []).includes(6),
      JSON.stringify(afterBroke.unlocked.hat));
await shoot('2-cannot-afford');

// A free colour still works with no money at all.
const freeOne = swatch(0, 2);
await tap(freeOne.x, freeOne.y);
await sleep(200);
check('a free colour can still be worn while broke', (await save()).hat === 2, 'hat = ' + (await save()).hat);
await tap(OPENER.x, OPENER.y);            // close

// --- 2. collect coins off the street ---------------------------------------
let collected = 0;
let shotTaken = false;
for (const c of NEAR_COINS) {
  await walkTo(c.x, c.y, 26);
  collected = await coins();
  if (!shotTaken && collected >= 1) { await shoot('3-collecting'); shotTaken = true; }
  if (collected >= 11) break;      // one more than a purchase costs
}
check('walking over coins collects them', collected >= 3, collected + ' coins');
const banked = collected;
check('collected enough to go shopping', banked >= 10, banked + ' coins');

// --- 3. buy the locked colour ----------------------------------------------
await tap(OPENER.x, OPENER.y);
await shoot('4-shop-with-money');
const before = await coins();
await tap(locked.x, locked.y);
await sleep(400);
const bought = await save();
check('buying deducts the price', bought.coins === before - 10, before + ' -> ' + bought.coins);
check('the colour is now unlocked', (bought.unlocked.hat || []).includes(6),
      JSON.stringify(bought.unlocked.hat));
check('and is worn straight away', bought.hat === 6, 'hat = ' + bought.hat);
await shoot('5-bought');

// Buying it again must not charge twice.
const afterBuy = await coins();
await tap(locked.x, locked.y);
await sleep(250);
check('wearing it again is free', (await coins()) === afterBuy, afterBuy + ' -> ' + (await coins()));

// --- 4. it all survives a reload -------------------------------------------
await ev("window.dispatchEvent(new Event('pagehide'))");
await boot();
const reloaded = await save();
check('the purchase survives a reload', (reloaded.unlocked.hat || []).includes(6),
      JSON.stringify(reloaded.unlocked.hat));
check('the coins survive a reload', reloaded.coins === afterBuy, reloaded.coins + ' coins');
check('the colour is still being worn', reloaded.hat === 6, 'hat = ' + reloaded.hat);

console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL LIVE SHOP CHECKS PASSED');
ws.close(); process.exit(fail || problems.length ? 1 : 0);
