// Buying a vehicle for real: does the right amount come out of the purse,
// does an unaffordable one stay locked, does it survive a reload, and does
// the player actually end up driving the thing they paid for?
//
// Coins are seeded straight into the save rather than collected off the
// street — a bus costs 400, and picking those up one at a time would make
// this test take a quarter of an hour to say nothing extra.
import { writeFileSync } from 'node:fs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'vehicle-shop';

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
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
const shoot = async (n) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(TAG + '-' + n + '.png', Buffer.from(s.result.data, 'base64'));
};

await send('Runtime.enable');
await send('Page.enable');
const W = 844, H = 390;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
const origin = URL.split('/').slice(0, 3).join('/');
await send('Storage.clearDataForOrigin', { origin, storageTypes: 'local_storage' });

/**
 * Put a save in place, then open the game on top of it.
 *
 * The seed is written from a DIFFERENT same-origin page — tools/icon.html,
 * which runs no game code. Writing it from the game's own page does not
 * work: the game saves on `pagehide`, so navigating away immediately writes
 * the running game's empty purse straight back over the seed.
 */
const SEED_PAGE = origin + '/tools/icon.html';

async function bootWith(coins) {
  await send('Page.navigate', { url: SEED_PAGE });
  await sleep(700);

  const wrote = await ev(`(() => {
    try {
      localStorage.setItem('tarasTown.save.v1', JSON.stringify({
        version: 1, coins: ${coins}, lastPos: null,
        muted: true, hat: 0, shirt: 0, car: 0, vehicle: 0,
        unlocked: { hat: [], shirt: [], car: [], vehicle: [] },
      }));
      return JSON.parse(localStorage.getItem('tarasTown.save.v1')).coins;
    } catch (e) { return 'ERROR ' + e.message; }
  })()`);
  if (wrote !== coins) {
    console.log('  --    could not seed the save (got ' + wrote + '); the rest will fail');
  }

  await send('Page.navigate', { url: URL });
  await sleep(2200);
  await ev("document.getElementById('start-button').click()");
  await sleep(1400);
}

const save = async () => {
  await ev("window.dispatchEvent(new Event('pagehide'))");
  const raw = await ev("(()=>{try{return localStorage.getItem('tarasTown.save.v1')}catch(e){return null}})()");
  return raw ? JSON.parse(raw) : null;
};
const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(360);
};

// Mirrors ui.js. The vehicle row's buttons are bigger than the colour dots.
const R = Math.min(26, H * 0.072);
const FIRST = W * 0.175;
const GAP = ((W - R - 20) - FIRST) / 7;
const ROW_Y = [H * 0.30, H * 0.465, H * 0.63, H * 0.795];
const vehicleDot = (i) => ({ x: FIRST + i * GAP, y: ROW_Y[3] });
const OPENER = { x: W - 52, y: 52 };

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const JEEP = 2, SPORTS = 3, BUS = 5;

// --- 1. with 250 coins: a jeep is affordable, a bus is not ---------------
await bootWith(250);
await tap(OPENER.x, OPENER.y);
await shoot('1-shop-250-coins');

const start = await save();
check('starts with the coins we seeded', start.coins === 250, start.coins + '');
check('starts driving the free car', start.vehicle === 0, 'vehicle ' + start.vehicle);

// Buy the jeep.
const jeep = vehicleDot(JEEP);
await tap(jeep.x, jeep.y);
const afterJeep = await save();
check('buying the jeep costs exactly 100', afterJeep.coins === 150, '250 -> ' + afterJeep.coins);
check('the jeep is now owned', (afterJeep.unlocked.vehicle || []).includes(JEEP),
      JSON.stringify(afterJeep.unlocked.vehicle));
check('and is being driven straight away', afterJeep.vehicle === JEEP, 'vehicle ' + afterJeep.vehicle);
await shoot('2-bought-jeep');

// The bus costs 400 and only 150 is left.
const bus = vehicleDot(BUS);
await tap(bus.x, bus.y);
const afterBus = await save();
check('a bus that cannot be afforded is refused', !(afterBus.unlocked.vehicle || []).includes(BUS),
      JSON.stringify(afterBus.unlocked.vehicle));
check('and nothing is taken from the purse', afterBus.coins === 150, afterBus.coins + '');
check('and the jeep is still what is being driven', afterBus.vehicle === JEEP, 'vehicle ' + afterBus.vehicle);

// Switching back to a free one is always allowed.
await tap(vehicleDot(0).x, vehicleDot(0).y);
check('switching back to the free car is free', (await save()).vehicle === 0);
check('and still costs nothing', (await save()).coins === 150);

// And back to the jeep, which is now owned, without paying twice.
await tap(jeep.x, jeep.y);
const again = await save();
check('driving an owned vehicle again is free', again.coins === 150, again.coins + '');
check('and it is selected', again.vehicle === JEEP);

// --- 2. it survives a reload ---------------------------------------------
await ev("window.dispatchEvent(new Event('pagehide'))");
await send('Page.navigate', { url: URL });
await sleep(2200);
await ev("document.getElementById('start-button').click()");
await sleep(1400);

const reloaded = await save();
check('the jeep is still owned after a reload', (reloaded.unlocked.vehicle || []).includes(JEEP),
      JSON.stringify(reloaded.unlocked.vehicle));
check('and still being driven', reloaded.vehicle === JEEP, 'vehicle ' + reloaded.vehicle);
check('and the coins are still right', reloaded.coins === 150, reloaded.coins + '');

// --- 3. with plenty of money, the biggest one is buyable too -------------
await bootWith(1000);
await tap(OPENER.x, OPENER.y);
await tap(bus.x, bus.y);
const rich = await save();
check('with enough saved up, the bus can be bought', (rich.unlocked.vehicle || []).includes(BUS),
      JSON.stringify(rich.unlocked.vehicle));
check('and it costs exactly 400', rich.coins === 600, '1000 -> ' + rich.coins);
await shoot('3-bought-bus');

// --- 4. the bought vehicle is what actually gets driven ------------------
// Close the menu, walk to the car parked by the spawn point, and get in. What
// should appear is a BUS, not the hatchback that is parked there — proving the
// purchase reaches the road and not just the save file.
await tap(OPENER.x, OPENER.y);
await sleep(300);

const push = async (vx, vy, ms) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 200, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + vx * 60, y: 200 + vy * 60, id: 1 }] });
  await sleep(ms);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(120);
};

// Position-driven, because headless Chrome runs below 60fps and the game
// clamps its timestep, so holding the stick for a fixed time covers a
// different distance here than on a phone.
const { town: _town, nearestCar: _nearestCar } = await import('./_helpers.mjs');
const _world = await _town();
const _car = await _nearestCar(_world);
const CAR = { x: _car.x, y: _car.y };
for (let i = 0; i < 14; i++) {
  const p = (await save()).lastPos;
  const dx = CAR.x - p.x, dy = CAR.y - p.y, d = Math.hypot(dx, dy);
  if (d < 70) break;
  await push(dx / d, dy / d, Math.min(600, Math.max(150, (d / 175) * 1000)));
}

// The action button turns green when a vehicle is in reach; press it.
const btnColour = () => ev(`(() => { const c=document.getElementById('game'), g=c.getContext('2d');
  const dpr=c.width/parseFloat(c.style.width);
  const d=g.getImageData(Math.round((${W} - 96)*dpr), Math.round((${H} - 92 - 34)*dpr),1,1).data;
  return d[0]+','+d[1]+','+d[2]; })()`);
const near = (s, r, g, b, t = 22) => {
  const [R, G, B] = s.split(',').map(Number);
  return Math.abs(R - r) <= t && Math.abs(G - g) <= t && Math.abs(B - b) <= t;
};
check('reached a vehicle to get into', near(await btnColour(), 90, 200, 90), await btnColour());

await tap(W - 96, H - 92);
await sleep(900);
check('now driving', near(await btnColour(), 255, 159, 69), await btnColour());
await shoot('4-driving-the-bus');

// A bus is 98px long against the hatchback's 62. At the driving zoom that is
// a big difference, so count how much of the screen the vehicle's body
// colour covers around the middle, where the camera keeps it.
const bodyPixels = await ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const w = c.width, h = c.height;
  const d = g.getImageData(Math.round(w/2 - w*0.14), Math.round(h/2 - h*0.30),
                           Math.round(w*0.28), Math.round(h*0.60)).data;
  let n = 0;
  // The default car colour, #FF6B6B.
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i]-255)<14 && Math.abs(d[i+1]-107)<14 && Math.abs(d[i+2]-107)<14) n++;
  }
  return n;
})()`);
check('the thing being driven is big enough to be the bus', bodyPixels > 2500,
      bodyPixels + ' body pixels around the middle of the screen');

console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL VEHICLE SHOP CHECKS PASSED');
ws.close();
process.exit(fail || problems.length ? 1 : 0);
