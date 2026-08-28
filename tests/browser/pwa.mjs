// The one test that actually proves this: load the game once online so the
// service worker can install and cache everything, then cut the network off
// entirely and load it again as a fresh navigation — not a reload of an
// already-running page, an actual new visit — and confirm the game still
// boots and plays.
//
// Anything short of that is just checking that some files exist; a browser
// can be surprisingly willing to half-load a broken offline page and this is
// the only way to catch that.
import { writeFileSync } from 'node:fs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'pwa';

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
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shoot = async (n) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(TAG + '-' + n + '.png', Buffer.from(s.result.data, 'base64'));
};

await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
const W = 844, H = 390;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

// Start from a clean save, and make sure any earlier test's service worker
// for this origin is gone — otherwise an old cache from a previous run could
// make this pass for the wrong reason.
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Storage.clearDataForOrigin', {
  origin: URL.split('/').slice(0, 3).join('/'),
  storageTypes: 'local_storage,cache_storage,service_workers',
});

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const pixel = (x, y) => ev(
  "(() => { const c=document.getElementById('game'), g=c.getContext('2d');" +
  " const dpr=c.width/parseFloat(c.style.width);" +
  " const d=g.getImageData(Math.round(" + x + "*dpr), Math.round(" + y + "*dpr),1,1).data;" +
  " return d[0]+','+d[1]+','+d[2]; })()");
const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

// --- 1. a normal, online visit, so the service worker gets a chance to install
await send('Page.navigate', { url: URL });
await sleep(2200);

const swSupported = await ev('"serviceWorker" in navigator');
if (!swSupported) {
  console.log('  --    service workers are not available in this browser context; skipping');
  console.log('\nALL PWA LIVE CHECKS PASSED (nothing to test here)');
  ws.close();
  process.exit(0);
}

// Wait for install to actually finish — not just "registered", but that
// every precached file has genuinely landed in the cache, since that is what
// offline mode is about to depend on.
const wantCount = await ev(`fetch('./sw.js').then(r => r.text()).then(t =>
  (t.match(/const PRECACHE = \\[([\\s\\S]*?)\\];/)[1].match(/'[^']+'/g) || []).length)`);
check('the service worker file lists files to precache', wantCount > 5, wantCount + ' files');

let cached = 0;
for (let i = 0; i < 20; i++) {
  cached = await ev(`caches.open('taras-town-v1').then(c => c.keys()).then(k => k.length).catch(() => 0)`);
  if (cached >= wantCount) break;
  await sleep(500);
}
check('every precached file actually landed in the cache', cached >= wantCount, cached + '/' + wantCount);

const swActive = await ev(`navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))`);
check('a service worker is active for this page', swActive);

// --- 2. cut the network off completely, then visit again as if for the first
//        time today — not a reload of a live page, a fresh navigation ------
console.log('  ... going offline and opening the game again');
await send('Network.emulateNetworkConditions', {
  offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
});

await send('Page.navigate', { url: URL });
await sleep(2000);

const gotThePage = await ev("!!document.getElementById('start-button')");
check('the real game loads with no network at all, not a browser error page', gotThePage);

if (gotThePage) {
  // Click the button directly rather than guessing its on-screen position:
  // the start button sits below the panel's sun and title, not at the
  // viewport centre, and this is exactly what every other browser suite in
  // this project already does for the same reason.
  await ev("document.getElementById('start-button').click()");
  await sleep(1200);

  const bg = await pixel(W / 2, 30);
  // The tap-to-start screen's sky gradient. If this is missing the canvas is
  // blank, which a passing "the button exists" check alone would not catch.
  const [r, g, b] = bg.split(',').map(Number);
  check('the game actually renders something, offline', r + g + b > 60, bg);
  await shoot('1-offline');

  const started = await ev(`(() => {
    const el = document.getElementById('start-screen');
    return el ? el.classList.contains('hidden') : null;
  })()`);
  check('tapping play works offline too', started === true);
}

// --- 3. back online, to leave the browser in a normal state ---------------
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});

console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL PWA LIVE CHECKS PASSED');
ws.close();
process.exit(fail || problems.length ? 1 : 0);
