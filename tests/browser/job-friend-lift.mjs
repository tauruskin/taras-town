// Milestone 4, the friend lift: walk to the friend, take the job, and take
// them to the park. Also captures a screenshot of the passenger riding along,
// which is the only bit of this job that is purely visual.
//
// Navigation is position-driven with a sidestep when progress stalls, so it
// copes with buildings in the way and with headless Chrome running below 60fps.
import { writeFileSync } from 'node:fs';
const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'ride';

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
await send('Page.navigate', { url: URL }); await sleep(2400);
await ev("document.getElementById('start-button').click()");
// Let the first few frames go by before measuring anything: a cold
// browser renders slowly and that alone can look like being stuck.
await sleep(1400);

const pixel = (x, y) => ev(
  "(() => { const c=document.getElementById('game'), g=c.getContext('2d');" +
  " const dpr=c.width/parseFloat(c.style.width);" +
  " const d=g.getImageData(Math.round(" + x + "*dpr), Math.round(" + y + "*dpr),1,1).data;" +
  " return d[0]+','+d[1]+','+d[2]; })()");
const near = (s, r, g, b, t = 22) => {
  const [R, G, B] = s.split(',').map(Number);
  return Math.abs(R - r) <= t && Math.abs(G - g) <= t && Math.abs(B - b) <= t;
};
const btnState = async () => {
  const c = await pixel(W - 96, H - 92 - 34);
  return near(c, 90, 200, 90) ? 'ENTER-CAR'
       : near(c, 255, 159, 69) ? 'EXIT-CAR'
       : near(c, 78, 168, 255) ? 'JOB' : 'none';
};
const save = async () => {
  const raw = await ev("(()=>{try{return localStorage.getItem('tarasTown.save.v1')}catch(e){return null}})()");
  return raw ? JSON.parse(raw) : null;
};
const pos = async () => { await ev("window.dispatchEvent(new Event('pagehide'))"); return (await save()).lastPos; };
const coins = async () => { const s = await save(); return s ? s.coins : 0; };

const push = async (vx, vy, ms) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 200, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + vx * 60, y: 200 + vy * 60, id: 1 }] });
  await sleep(ms);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(110);
};
const tapButton = async () => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: W - 96, y: H - 92, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
};

/**
 * Walk to a point, veering aside when progress stalls so a building in the
 * way doesn't end the attempt.
 */
async function walkTo(tx, ty, tol, tries = 60) {
  let last = null, stalls = 0, sign = 1;
  for (let i = 0; i < tries; i++) {
    const p = await pos();
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d <= tol) return { arrived: true, pos: p };

    let a = Math.atan2(ty - p.y, tx - p.x);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 6) {
      stalls++;
      if (stalls > 16) return { arrived: false, pos: p, stuck: true };
      // Commit to one way round for several goes before trying the other.
      // Flipping sides every single time just rocks back and forth in the
      // mouth of a dead end, which is exactly where this used to give up.
      if (stalls % 4 === 0) sign = -sign;
      a += sign * (Math.PI / 2);
      await push(Math.cos(a), Math.sin(a), 520 + stalls * 80);
      last = p;
      continue;
    }
    stalls = 0;
    last = p;
    await push(Math.cos(a), Math.sin(a), Math.min(650, Math.max(160, (d / 175) * 1000)));
  }
  return { arrived: false, pos: await pos() };
}

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// The friend, and the park spots they might ask to be taken to, from the real
// town rather than from coordinates that were only ever true of the old one.
const { town: _town, npcWithMission: _npcWith, makeRouter: _makeRouter } = await import('./_helpers.mjs');
const { Missions: _Missions } = await import('../../js/missions.js');
const _world = await _town();
const _friend = await _npcWith(_world, 'ride');
const FRIEND = { x: _friend.x, y: _friend.y };
// With Math.random pinned to 0.5 and nothing chosen before, the picker does
// `(0.5 * list.length) | 0`. The same sum here names the same park spot.
const _rideSpots = new _Missions(_world).spots.ride;
const _parkSpots = [_rideSpots[(0.5 * _rideSpots.length) | 0]];

// --- walk to the friend ----------------------------------------------------
// Straight at them, not to a spot beside them. A neighbour offers a job
// within 92px, and "60px to the right, give or take 55" can land outside that.
const there = await walkTo(FRIEND.x, FRIEND.y, 60);
check('walked to the friend', there.arrived, there.pos.x + ',' + there.pos.y);
await sleep(400);
check('the friend offers a lift', (await btnState()) === 'JOB', await btnState());
await shoot('1-at-friend');

// Pin the choice, so the test knows where the friend actually wants to go.
// Walking to a handful of likely park spots and hoping one of them is the
// right one is a coin toss on a town with forty-seven of them.
await ev('window.__realRandom = Math.random; Math.random = () => 0.5;');
await tapButton();
await ev('Math.random = window.__realRandom;');
check('lift accepted', (await btnState()) === 'none', await btnState());

// Walk a little so the passenger is clearly visible riding along.
await push(1, 0, 500);
await shoot('2-passenger-riding');

// --- take them to the park -------------------------------------------------
// The destination is one of a handful of park spots; head for the park and
// let the arrival radius do the rest.
// Coins lie around town now, so an absolute total says nothing. Watch for the
// JUMP instead: walking picks them up one at a time, a drop-off pays five.
let biggestJump = 0;
const _route = _makeRouter(_world);
for (const aim of _parkSpots) {
  const before = await coins();
  // Follow a route worked out from the map. Steering straight at the park can
  // walk into the side of a building, or now into the lake, and simply stop.
  const legs = _route(await pos(), aim) || [aim];
  for (const leg of legs) await walkTo(leg.x, leg.y, 46, 26);
  await walkTo(aim.x, aim.y, 60, 24);
  biggestJump = Math.max(biggestJump, (await coins()) - before);
  if (biggestJump >= 5) break;
}
check('dropping the friend off pays out', biggestJump >= 5, '+' + biggestJump + ' coins in one step');
await shoot('3-dropped-off');

console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL RIDE CHECKS PASSED');
ws.close(); process.exit(fail || problems.length ? 1 : 0);
