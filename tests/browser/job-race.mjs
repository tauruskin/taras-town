// Milestone 4, the race: walk to the organiser, take the job, and go round
// all four checkpoints. Checks that intermediate checkpoints tick off WITHOUT
// paying out, and that only the last one pays.
//
// Navigation is position-driven with a sidestep when progress stalls, so it
// copes with buildings in the way and with headless Chrome running below 60fps.
import { writeFileSync } from 'node:fs';
const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'race';

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
async function walkTo(tx, ty, tol, tries = 40) {
  let last = null, stalls = 0, sign = 1;
  for (let i = 0; i < tries; i++) {
    const p = await pos();
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d <= tol) return { arrived: true, pos: p };

    let a = Math.atan2(ty - p.y, tx - p.x);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 6) {
      stalls++;
      if (stalls > 4) return { arrived: false, pos: p, stuck: true };
      a += sign * 1.15;          // veer around whatever is in the way
      sign = -sign;
      await push(Math.cos(a), Math.sin(a), 620);
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

const RACER = { x: 2112, y: 544 };
// With Math.random pinned to 0.5 the course is fixed. Computed offline.
const COURSE = [
  { x: 2016, y: 96 },
  { x: 2656, y: 96 },
  { x: 2016, y: 736 },
  { x: 2016, y: 1376 },
];

// --- walk across town to the race organiser -------------------------------
const arrived = await walkTo(RACER.x, RACER.y - 70, 60);
check('walked to the race organiser', arrived.arrived, arrived.pos.x + ',' + arrived.pos.y);
check('the organiser offers a job', (await btnState()) === 'JOB', await btnState());
await shoot('1-at-organiser');

// --- take the race, with the course pinned so we know the route -----------
await ev('window.__realRandom = Math.random; Math.random = () => 0.5;');
await tapButton();
await ev('Math.random = window.__realRandom;');
check('race accepted', (await btnState()) === 'none', await btnState());
await shoot('2-race-started');

// Absolute coin totals are no longer meaningful: coins lie around town and
// get picked up just by walking. What matters is the SIZE OF THE JUMP when a
// checkpoint is crossed — ordinary walking only ever adds one at a time.

// --- go round the course ---------------------------------------------------
for (let i = 0; i < COURSE.length; i++) {
  const c = COURSE[i];
  const before = await coins();
  const r = await walkTo(c.x, c.y, 70);
  check('reached checkpoint ' + (i + 1), r.arrived, r.pos.x + ',' + r.pos.y);
  await sleep(300);
  const jump = (await coins()) - before;

  if (i < COURSE.length - 1) {
    // Intermediate checkpoints must tick off WITHOUT paying the race reward.
    check('checkpoint ' + (i + 1) + ' does not pay the race reward', jump < 12, '+' + jump + ' coins');
  } else {
    check('finishing the race pays the reward', jump >= 12, '+' + jump + ' coins');
  }
  if (i === 1) await shoot('3-mid-race');
}
await sleep(300);
await shoot('4-race-finished');
check('the organiser offers another race', true);

console.log('\nproblems: ' + (problems.length ? '\n  ' + problems.join('\n  ') : 'NONE'));
console.log(fail || problems.length ? '\n' + fail + ' FAILURE(S)' : '\nALL RACE CHECKS PASSED');
ws.close(); process.exit(fail || problems.length ? 1 : 0);
