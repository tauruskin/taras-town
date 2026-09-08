// The sound button: does it toggle, does it look different, and is being
// switched off remembered next time?
import { writeFileSync } from 'node:fs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'sound';

// Where the buttons are, asked of the game rather than written down here.
// Coordinates typed into a test go wrong the moment a button moves or changes
// size, and they do not fail loudly — the tap simply lands on the town behind.
const { Menu: _Menu } = await import('../../js/ui.js');


const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
const shoot = async n => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(TAG + '-' + n + '.png', Buffer.from(s.result.data, 'base64')); };

await send('Runtime.enable'); await send('Page.enable');
const W = 844, H = 390;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage' });

async function boot() {
  await send('Page.navigate', { url: URL }); await sleep(2400);
  await ev("document.getElementById('start-button').click()");
  await sleep(1400);
}

/** Boot with an empty save, so a section can start from a known state. */
async function freshBoot() {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Storage.clearDataForOrigin', {
    origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
  });
  await boot();
}
await boot();

// The speaker is the second button in from the corner; the shop is the first.
const BTN = _Menu.cornerPos(W, H, 1);
const OPENER = _Menu.openerPos(W, H);

const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(350);
};

// Count the red pixels inside the button. The "off" state strikes a red line
// through the speaker; the "on" state has no red in it anywhere. Counting a
// region is far steadier than trying to hit one pixel of a diagonal line.
const redInCircle = (b) => ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const x = Math.round((${b.x} - ${b.r}) * dpr), y = Math.round((${b.y} - ${b.r}) * dpr);
  const n = Math.round(${b.r} * 2 * dpr);
  const d = g.getImageData(x, y, n, n).data;
  let red = 0;

  // Only inside the CIRCLE. The button is round and this box is square, so its
  // corners show the town behind it — and the town has red roofs and red cars
  // in it. Counting the corners meant the answer depended on what happened to
  // be parked behind the speaker.
  const mid = n / 2;
  const limit = (mid * 0.82) * (mid * 0.82);

  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const dx = px - mid, dy = py - mid;
      if (dx * dx + dy * dy > limit) continue;
      const i = (py * n + px) * 4;
      if (d[i] > 190 && d[i + 1] < 110 && d[i + 2] < 110) red++;
    }
  }
  return red;
})()`);

const redInButton = () => redInCircle(BTN);

const saved = async () => {
  await ev("window.dispatchEvent(new Event('pagehide'))");
  const raw = await ev("(()=>{try{return localStorage.getItem('tarasTown.save.v1')}catch(e){return null}})()");
  return raw ? JSON.parse(raw) : null;
};

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- 1. sound starts on ----------------------------------------------------
const redWhenOn = await redInButton();
check('sound starts switched on', redWhenOn < 20, redWhenOn + ' red pixels');
check('and the save agrees', (await saved()).muted === false);
await shoot('1-sound-on');

// --- 2. tapping switches it off -------------------------------------------
await tap(BTN.x, BTN.y);
const redWhenOff = await redInButton();
check('tapping strikes the speaker through', redWhenOff > 60, redWhenOff + ' red pixels');
check('and the save records it', (await saved()).muted === true);
await shoot('2-sound-off');

// --- 3. tapping again switches it back ------------------------------------
await tap(BTN.x, BTN.y);
check('tapping again turns it back on', (await redInButton()) < 20);
check('and the save agrees again', (await saved()).muted === false);

// --- 4. being switched off is remembered ----------------------------------
await tap(BTN.x, BTN.y);
check('switched off before reloading', (await saved()).muted === true);
await boot();
check('still off after a reload', (await saved()).muted === true);
check('and still drawn as off', (await redInButton()) > 60);
await shoot('3-still-off-after-reload');

// --- 5. the music button is a SEPARATE switch -----------------------------
//
// The whole reason there are two. Wanting the coin pings without the tune, or
// the other way round, is an ordinary thing to want, and one button could not
// say which. So the two must not move together — a single button wired to both
// settings would pass every check above and fail the point of the feature.
const MUSIC = _Menu.cornerPos(W, H, 2);
const redInMusic = () => redInCircle(MUSIC);

await freshBoot();                              // both on, nothing remembered
check('both start switched on',
      (await saved()).muted === false && (await saved()).musicMuted === false,
      'effects ' + (await saved()).muted + ', music ' + (await saved()).musicMuted);
check('and neither button is struck through',
      (await redInButton()) < 30 && (await redInMusic()) < 30,
      (await redInButton()) + ' / ' + (await redInMusic()) + ' red pixels');

await tap(MUSIC.x, MUSIC.y);
await sleep(300);
check('turning the music off records it', (await saved()).musicMuted === true);
check('and strikes the music button through', (await redInMusic()) > 60, (await redInMusic()) + ' red pixels');
check('WITHOUT silencing the sound effects', (await saved()).muted === false);
check('and without striking the speaker through', (await redInButton()) < 30, (await redInButton()) + ' red pixels');
await shoot('5-music-off-effects-on');

await tap(BTN.x, BTN.y);
await sleep(300);
check('turning the effects off leaves the music off too', (await saved()).musicMuted === true);
check('and now both are struck through',
      (await redInButton()) > 60 && (await redInMusic()) > 60);

await tap(MUSIC.x, MUSIC.y);
await sleep(300);
check('the music can come back on with the effects still off',
      (await saved()).musicMuted === false && (await saved()).muted === true,
      'effects ' + (await saved()).muted + ', music ' + (await saved()).musicMuted);

await boot();
check('and both settings survive a reload',
      (await saved()).muted === true && (await saved()).musicMuted === false,
      'effects ' + (await saved()).muted + ', music ' + (await saved()).musicMuted);
await shoot('6-effects-off-music-on');

// The section below expects the speaker to be OFF, so put it there on purpose
// rather than relying on where the taps above happened to leave it.
if ((await saved()).muted !== true) {
  await tap(BTN.x, BTN.y);
  await sleep(300);
}
check('effects are off going into the menu check', (await saved()).muted === true);

// --- 6. it works from inside the menu too ---------------------------------
await tap(OPENER.x, OPENER.y);               // open the menu
await sleep(300);
const redInMenu = await redInButton();
check('the button is still there with the menu open', redInMenu > 60, redInMenu + ' red pixels');
await tap(BTN.x, BTN.y);                     // unmute from inside the menu
check('and still works from in there', (await saved()).muted === false);
await shoot('4-in-menu');

console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL SOUND CHECKS PASSED');
ws.close(); process.exit(fail || problems.length ? 1 : 0);
