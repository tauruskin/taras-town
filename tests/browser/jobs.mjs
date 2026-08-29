// Milestone 4 end to end: walk to a neighbour, take the job, arrive, get paid.
//
// Movement is POSITION-driven, not time-driven: headless Chrome can run below
// 60fps, and the game clamps dt, so "hold the stick for 1.3s" covers a
// different distance here than it does on a real phone. Walking until the
// saved position says we have arrived is immune to that.
import { writeFileSync } from 'node:fs';
const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'job';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();

// Where things are is worked out HERE, in node, from exactly the same town
// generation the browser is about to run. It used to be a list of typed-in
// coordinates "worked out offline", which quietly stopped being true the
// moment the town was generated at four times the size. The town is the same
// on both sides because it is built from a fixed seed, so asking the real
// code where the coins are beats writing the answer down.
const { World: _World } = await import('../../js/world.js');

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
const hex = s => '#' + s.split(',').map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
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
// The game writes on pagehide, so nudge it before reading the position.
const pos = async () => { await ev("window.dispatchEvent(new Event('pagehide'))"); return (await save()).lastPos; };
const coins = async () => { const s = await save(); return s ? s.coins : 0; };

const push = async (vx, vy, ms) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 200, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + vx * 60, y: 200 + vy * 60, id: 1 }] });
  await sleep(ms);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(120);
};
const tapButton = async () => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: W - 96, y: H - 92, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
};

/**
 * Walk until we are within tol of (tx, ty), or give up.
 *
 * Walking into something used to end the attempt. That was survivable on the
 * old hand-drawn map, where the few targets sat in open ground a short stroll
 * away; the generated town is four times the size and full of corners, and
 * giving up at the first wall meant the test never arrived and then passed or
 * failed on whatever happened to be nearby. It now slides along whatever it
 * hits and keeps going, alternating sides so it can work its way round.
 */
async function walkTo(tx, ty, tol, tries = 44, onStep = null) {
  let last = null;
  let bumps = 0;
  for (let i = 0; i < tries; i++) {
    const p = await pos();
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d <= tol) return { arrived: true, pos: p };

    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) {
      bumps++;
      const turn = (bumps % 2 ? 1 : -1) * (Math.PI / 2);
      const a = Math.atan2(dy, dx) + turn;
      await push(Math.cos(a), Math.sin(a), 460);
      if (onStep) await onStep();
      last = null;
      continue;
    }
    last = p;
    await push(dx / d, dy / d, Math.min(600, Math.max(140, (d / 175) * 1000)));
    if (onStep) await onStep();
  }
  return { arrived: false, pos: await pos() };
}

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// The child who has lost a teddy, wherever the town put her.
const { createNpcs: _createNpcs } = await import('../../js/npc.js');
const _world = new _World();
const _npcs = _createNpcs(_world);
const _child = _npcs.find((n) => n.mission === 'toy') || _npcs[0];
const NPC = { x: _child.x, y: _child.y };
// Where the teddy will be. The test pins Math.random to 0.5 before taking the
// job, and the picker with no previous choice does `(0.5 * list.length) | 0`,
// so the same sum here gives the same spot — worked out from the real list of
// hiding places rather than written down as a coordinate.
const { Missions: _Missions } = await import('../../js/missions.js');
const _toySpots = new _Missions(_world).spots.toy;
const TEDDY = _toySpots[(0.5 * _toySpots.length) | 0];

// Playing on your own must stay exactly that: with no ?room= in the address,
// none of the networking code should even be fetched.
const netScripts = await ev("document.querySelectorAll('script[src*=peerjs]').length");
check('single player downloads no networking code at all', netScripts === 0, netScripts + ' script tags');

check('coin counter is drawn', hex(await pixel(54, 44)) === '#FFD23F', hex(await pixel(54, 44)));
check('starts with no coins', (await coins()) === 0);
check('no action offered at spawn', (await btnState()) === 'none');

// --- approach the neighbour from whichever side is actually clear ----------
//
// This used to come at them from directly above, which worked on the old
// hand-drawn map and put the player inside a wall on a generated one. The
// open side is asked of the real town instead of assumed.
const APPROACH = (() => {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = NPC.x + Math.cos(a) * 140;
    const y = NPC.y + Math.sin(a) * 140;
    if (x < 40 || y < 40 || x > _world.width - 40 || y > _world.height - 40) continue;
    if (!_world._overlaps(x, y, 11, 11, null)) return { x, y, a };
  }
  return { x: NPC.x, y: NPC.y - 140, a: -Math.PI / 2 };
})();

const above = await walkTo(APPROACH.x, APPROACH.y, 26);
check('walked to a clear spot beside the neighbour', above.arrived, above.pos.x + ',' + above.pos.y);

// Now push straight at them until we stop moving.
const toNpc = { x: Math.cos(APPROACH.a + Math.PI), y: Math.sin(APPROACH.a + Math.PI) };
let prev = above.pos;
for (let i = 0; i < 8; i++) {
  await push(toNpc.x, toNpc.y, 420);
  const now = await pos();
  if (Math.hypot(now.x - prev.x, now.y - prev.y) < 2) break;
  prev = now;
}
// Against the NEAREST neighbour, not the one we set out for: on a big town
// the walk can quite reasonably end up beside a different one, and measuring
// against the wrong person would report a failure that is not there.
const gap = Math.min(..._npcs.map((n) => Math.hypot(prev.x - n.x, prev.y - n.y)));
// Player half-box 11 + neighbour half-box 16 = 27. Anything near that means we
// are pressed against them; much more means we drifted past without touching.
check('cannot walk onto a neighbour', gap >= 22 && gap <= 46, 'stopped ' + gap.toFixed(0) + 'px away');

await shoot('1-at-neighbour');
check('standing by a neighbour offers a job', (await btnState()) === 'JOB', await btnState());

// --- take the job, with the destination pinned so we know where to go -----
await ev('window.__realRandom = Math.random; Math.random = () => 0.5;');
await tapButton();
await ev('Math.random = window.__realRandom;');
check('job taken, so no job on offer any more', (await btnState()) === 'none', await btnState());
await shoot('2-job-taken');

// --- go and find the teddy -------------------------------------------------
// Watch the purse on the way, and look for the JUMP rather than the total.
//
// This used to check the total was exactly the reward, which only held because
// the old walk was short enough to cross no coins. Across a town this size the
// walk collects a dozen on the way, and a total tells you nothing. A coin adds
// one at a time; only finishing the job adds five at once, so a single step
// worth five or more is the payout and nothing else.
let biggestJump = 0;
let purse = await coins();
const found = await walkTo(TEDDY.x, TEDDY.y, 45, 44, async () => {
  const now = await coins();
  biggestJump = Math.max(biggestJump, now - purse);
  purse = now;
});
await sleep(300);
const afterJump = (await coins()) - purse;
biggestJump = Math.max(biggestJump, afterJump);
check('reached the teddy', found.arrived, found.pos.x + ',' + found.pos.y);
check('arriving pays out', biggestJump >= 5, 'biggest single jump was ' + biggestJump);
await shoot('3-celebration');

// --- and the neighbour offers again ---------------------------------------
await walkTo(NPC.x, NPC.y - 60, 40);
check('the neighbour has another job afterwards', (await btnState()) === 'JOB', await btnState());

// --- a far-away job should raise the edge arrow ---------------------------
await ev('window.__realRandom = Math.random; Math.random = () => 0.99;');
await tapButton();
await ev('Math.random = window.__realRandom;');
await sleep(400);
// The job is no longer on offer. It need not be "no button": having taken it,
// a car parked nearby quite properly becomes the next thing to offer, and on a
// town this size there usually is one.
const afterSecond = await btnState();
check('second job accepted', afterSecond !== 'JOB', afterSecond);
await shoot('4-arrow-far-target');

console.log('\nproblems: ' + (problems.length ? '\n  ' + problems.join('\n  ') : 'NONE'));
console.log(fail || problems.length ? '\n' + fail + ' FAILURE(S)' : '\nALL LIVE JOB CHECKS PASSED');
ws.close(); process.exit(fail || problems.length ? 1 : 0);
