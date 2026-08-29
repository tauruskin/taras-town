// Walking into another player.
//
// This has been got wrong once already. Players were made SOLID so that you
// could find somebody hiding under a bush by bumping into them — and they
// found each other, and then stuck together, because two people pressing into
// one another are each blocked by the other. It was the same trap the cars
// used to set.
//
// So the two things checked here are the two that matter, and they pull
// against each other:
//
//   1. NOBODY IS EVER STUCK. Whatever another player does to you, you can
//      still walk. This is the one that was broken.
//   2. YOU CAN STILL TELL SOMEBODY IS THERE. Walking into a player moves
//      them, which is how a hidden one is discovered.
//
// A test that only checked the first would pass with the feature deleted.
import { writeFileSync } from 'node:fs';
import { makeWalker } from './_helpers.mjs';

const PORT_A = 9333;
const PORT_B = 9334;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const TAG = process.argv[3] || 'bumping';
const ROOM = '7731';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(label, port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  const problems = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      problems.push(label + ' EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    }
  });

  const send = (method, params = {}) => new Promise((r) => {
    const myId = ++id; pending.set(myId, r);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const walker = makeWalker({ send, ev, sleep });

  return {
    label, send, ev, problems, ...walker,
    shoot: async (n) => {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${TAG}-${n}.png`, Buffer.from(s.result.data, 'base64'));
    },
    close: () => { try { ws.close(); } catch (_) {} },
  };
}

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const a = await openPage('A', PORT_A);
const b = await openPage('B', PORT_B);

// Both into the same room, with names so they step aside predictably.
for (const [page, who] of [[a, 'Taras'], [b, 'Sasha']]) {
  await page.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await page.send('Storage.clearDataForOrigin', {
    origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
  });
  await page.send('Page.navigate', { url: URL + '?room=' + ROOM });
  await sleep(2400);
  await page.ev(`(() => {
    document.getElementById('start-button').click();
    const panel = document.getElementById('panel-name');
    const box = document.getElementById('name-input');
    if (panel && box && !panel.classList.contains('hidden')) {
      box.value = ${JSON.stringify(who)};
      document.getElementById('name-done-button').click();
    }
  })()`);
  await sleep(1600);
}

// Wait until they have actually FOUND each other, not merely until the
// networking code has loaded. The green "2 players" badge is the game's own
// statement that the connection is up; without waiting for it the whole test
// runs against two people alone in separate towns, and "walking into somebody
// moved them" fails for want of a somebody.
const badge = (page) => page.ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const cx = Math.round(parseFloat(c.style.width) / 2 * dpr);
  const d = g.getImageData(cx - Math.round(50 * dpr), Math.round(14 * dpr),
                           Math.round(100 * dpr), Math.round(40 * dpr)).data;
  let green = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 110 && d[i + 1] > 110 && d[i + 1] < 190 && d[i + 2] < 130 && d[i + 1] - d[i] > 55) green++;
  }
  return green;
})()`);

let together = false;
for (let i = 0; i < 25 && !together; i++) {
  await sleep(1000);
  together = (await badge(a)) > 120 && (await badge(b)) > 120;
}
check('the two of them are in the same game', together);

const startA = await a.pos();
const startB = await b.pos();
check('both players are in the town', !!startA && !!startB,
      JSON.stringify(startA) + ' / ' + JSON.stringify(startB));

// --- 1. walk A straight at B ----------------------------------------------
const toB = { x: startB.x - startA.x, y: startB.y - startA.y };
const len = Math.hypot(toB.x, toB.y) || 1;
const dir = { x: toB.x / len, y: toB.y / len };

// Chase, re-aiming at where B actually is each time.
//
// Walking once towards where B started does not do it: both players are
// pushed apart on contact, so A slides round B and carries on into empty
// town. Following B is what a child does anyway when they have found
// somebody, and it is the only way to keep the two of them in contact long
// enough to measure.
const bBefore = await b.pos();
let shoved = 0;
let closest = Infinity;

for (let i = 0; i < 30; i++) {
  const pa = await a.pos();
  const pb = await b.pos();
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const d = Math.hypot(dx, dy) || 1;
  closest = Math.min(closest, d);

  // Short bursts. A long push carries A clean past B and out the other side,
  // so the two of them are only in contact for a fraction of each step.
  await a.push(dx / d, dy / d, 130);

  const now = await b.pos();
  shoved = Math.max(shoved, Math.hypot(now.x - bBefore.x, now.y - bBefore.y));
  if (shoved > 30) break;
}

check('the two of them actually met', closest < 60, 'closest ' + Math.round(closest) + 'px');
check('walking into somebody moves them', shoved > 10, Math.round(shoved) + 'px shifted');
await a.shoot('1-pressed-together');

// --- 2. and neither of them is stuck --------------------------------------
//
// The one that was broken. Both players walk in each of four directions and
// must get somewhere in at least one of them — while still pressed together.
const canStillWalk = async (page) => {
  let best = 0;
  for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const from = await page.pos();
    await page.push(vx, vy, 620);
    const to = await page.pos();
    best = Math.max(best, Math.hypot(to.x - from.x, to.y - from.y));
    if (best > 40) break;
  }
  return best;
};

const aFree = await canStillWalk(a);
check('the one doing the pushing can still walk away', aFree > 40, Math.round(aFree) + 'px');

const bFree = await canStillWalk(b);
check('and so can the one being pushed', bFree > 40, Math.round(bFree) + 'px');
await a.shoot('2-after-getting-apart');

// --- 3. even squeezed against something ------------------------------------
//
// The nastiest case, and the one the old solid version could not survive:
// somebody backed into a wall with a friend pressing on them.
const wallA = await a.pos();
for (let i = 0; i < 6; i++) await b.push(dir.x * -1, dir.y * -1, 500);   // B leans on A
await sleep(500);
const squeezed = await canStillWalk(a);
check('somebody leaned on cannot be pinned', squeezed > 40, Math.round(squeezed) + 'px');

const problems = [...a.problems, ...b.problems];
console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL BUMPING CHECKS PASSED');
a.close(); b.close();
process.exit(fail || problems.length ? 1 : 0);
