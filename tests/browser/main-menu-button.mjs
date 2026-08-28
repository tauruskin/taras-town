// Leaving a game and going back to the opening screen.
//
// The point of the feature: he is playing with somebody else, wants to stop,
// and wants to carry on by himself. So the things that matter are that the way
// out is findable, that it really does end the shared game, that his coins and
// clothes survive it, and — just as important — that it CANNOT be hit by
// accident while he is playing, because leaving cuts him off from his friend.
import { writeFileSync } from 'node:fs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'main-menu-button';
const ROOM = '4821';

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
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    problems.push('LOG ERROR: ' + m.params.entry.text);
  }
});
const send = (method, params = {}) => new Promise((r) => {
  const myId = ++id; pending.set(myId, r);
  ws.send(JSON.stringify({ id: myId, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;

const shots = [];
const shoot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const file = `${TAG}-${name}.png`;
  writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  shots.push(file);
};

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(80);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(420);
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

// Start in a shared game, which is the situation the button exists for.
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);
await send('Storage.clearDataForOrigin', {
  origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
});
await send('Page.navigate', { url: URL + '?room=' + ROOM });
await sleep(2400);
await ev(`document.getElementById('start-button').click()`);
await sleep(1400);

check('started in a shared game', (await ev('location.search')).includes('room=' + ROOM), await ev('location.search'));

// Where the buttons are, in CSS pixels, straight from the page.
const size = JSON.parse(await ev(`(() => {
  const c = document.getElementById('game');
  return JSON.stringify({ w: parseFloat(c.style.width), h: parseFloat(c.style.height) });
})()`));
const HOME = { x: size.w - 180, y: 52 };
const OPENER = { x: size.w - 52, y: 52 };

/** Is the opening screen showing? */
const onStartScreen = () => ev(`(() => {
  const s = document.getElementById('start-screen');
  return !!s && !s.classList.contains('hidden');
})()`);

/** Whatever is saved, as an object. */
const saved = async () => {
  const raw = await ev(`(() => { try { return localStorage.getItem('tarasTown.save.v1'); } catch (e) { return null; } })()`);
  try { return JSON.parse(raw); } catch (_) { return null; }
};

// --- 1. it cannot be hit while he is just playing -------------------------
//
// The whole reason it lives inside the menu. If this check ever fails, a
// stray finger can end a game with his friend in one tap.
await tap(HOME.x, HOME.y);
await sleep(600);
check('tapping that spot while playing does NOT leave the game', (await onStartScreen()) === false);
check('and he is still in the room', (await ev('location.search')).includes('room=' + ROOM), await ev('location.search'));
await shoot('1-playing');

// --- 2. it is there once the menu is open ---------------------------------
await tap(OPENER.x, OPENER.y);
await sleep(500);

// Read the button off the canvas rather than trusting that it was drawn: a
// white disc with a dark house in the middle of it.
const homeLooks = JSON.parse(await ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const px = (dx, dy) => {
    const d = g.getImageData(Math.round((${HOME.x} + dx) * dpr), Math.round((${HOME.y} + dy) * dpr), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  };
  const edge = px(-19, 0);       // white disc, clear of the house
  const roof = px(0, -6);        // dark roof
  return JSON.stringify({ edge, roof });
})()`));
const isWhite = (c) => c.r > 235 && c.g > 235 && c.b > 235;
const isDark = (c) => c.r < 90 && c.g < 90 && c.b < 90;
check('a white round button is drawn there', isWhite(homeLooks.edge), JSON.stringify(homeLooks.edge));
check('with a dark house on it', isDark(homeLooks.roof), JSON.stringify(homeLooks.roof));
await shoot('2-menu-open');

const before = await saved();

// --- 3. tapping it goes back to the opening screen ------------------------
await tap(HOME.x, HOME.y);
await sleep(2600);               // it reloads, so give the page time to come back

check('back on the opening screen', (await onStartScreen()) === true);
check('the shared game is left behind', !(await ev('location.search')).includes('room='), await ev('location.search') || '(none)');
await shoot('3-back-at-the-start');

// --- 4. and he can now choose to play on his own --------------------------
//
// Both choices have to be offered again. Coming back to a screen with only
// "play together" on it would be no escape at all.
const panel = await ev(`(() => {
  const shown = [...document.querySelectorAll('#start-screen .panel')]
    .filter((p) => p.getBoundingClientRect().width > 0 && !p.classList.contains('hidden'));
  return shown.length === 1 ? shown[0].id : shown.length + ' panels';
})()`);
check('the first panel is showing, and only it', panel === 'panel-welcome', panel);

const visible = (elId) => ev(`(() => {
  const el = document.getElementById('${elId}');
  return !!(el && el.getBoundingClientRect().width > 0 && !el.classList.contains('hidden'));
})()`);
check('playing on his own is offered', await visible('start-button'));
check('and playing together is still offered', await visible('together-button'));

// --- 5. nothing he owned was lost ----------------------------------------
const after = await saved();
check('his save survived leaving', after !== null);
if (before && after) {
  check('coins are unchanged', after.coins === before.coins, `${before.coins} -> ${after.coins}`);
  check('what he is wearing is unchanged',
        after.hat === before.hat && after.shirt === before.shirt && after.vehicle === before.vehicle,
        `hat ${before.hat}->${after.hat}, shirt ${before.shirt}->${after.shirt}, vehicle ${before.vehicle}->${after.vehicle}`);
}

// --- 6. and playing alone from here really works --------------------------
await ev(`document.getElementById('start-button').click()`);
await sleep(1600);
check('he can start a game on his own', (await onStartScreen()) === false);
check('and it is not a shared one', !(await ev('location.search')).includes('room='), await ev('location.search') || '(none)');
await shoot('4-playing-alone');

console.log('');
console.log('screenshots: ' + shots.join(', '));
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? `${fail} FAILURE(S)` : 'ALL MAIN-MENU-BUTTON CHECKS PASSED');
ws.close();
process.exit(fail || problems.length ? 1 : 0);
