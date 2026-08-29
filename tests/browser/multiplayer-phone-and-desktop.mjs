// Milestone 6 for real: two browser pages, the same room, an actual WebRTC
// connection between them. Checks that they find each other, that each sees
// the other as a second player, and that moving one moves the other's view
// of them.
//
// This one genuinely talks to the outside world (the free introduction
// service), so a failure here may mean that service is down rather than that
// the game is broken — the output says which.
import { writeFileSync } from 'node:fs';

// TWO separate browsers, not two tabs in one.
//
// Chrome throttles requestAnimationFrame in background tabs, and only one tab
// per browser is ever in the foreground. With both players in one browser the
// host's game loop simply stops running, so it never broadcasts and the guest
// sees an empty town — which looks exactly like a broken connection.
const PORT_A = 9333;
const PORT_B = 9334;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const ROOM = 'ttest-' + Math.random().toString(36).slice(2, 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A thin CDP client for one page. */
async function openPage(label, port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  const problems = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      problems.push(label + ' EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map(x => x.value ?? x.description ?? x.type).join(' ');
      console.log('    [' + label + ' ' + m.params.type + '] ' + text);
    }
    if (m.method === 'Log.entryAdded') {
      console.log('    [' + label + ' log:' + m.params.entry.level + '] ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  });

  const send = (method, params = {}) => new Promise(r => {
    const myId = ++id; pending.set(myId, r);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false })).result?.result?.value;

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  // A is a phone; B is a desktop browser window. This is the mixed case:
  // can a computer and a phone see each other in the same town?
  if (label === 'A') {
    await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  } else {
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  }
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  return {
    label, send, ev, problems, targetId: target.id,
    shoot: async (name) => {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync('net-' + name + '.png', Buffer.from(s.result.data, 'base64'));
    },
    pixel: (x, y) => ev(
      "(() => { const c=document.getElementById('game'), g=c.getContext('2d');" +
      " const dpr=c.width/parseFloat(c.style.width);" +
      " const d=g.getImageData(Math.round(" + x + "*dpr), Math.round(" + y + "*dpr),1,1).data;" +
      " return d[0]+','+d[1]+','+d[2]; })()"),
    push: async (vx, vy, ms) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 200, id: 1 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + vx * 60, y: 200 + vy * 60, id: 1 }] });
      await sleep(ms);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(120);
    },
    close: () => { try { ws.close(); } catch (_) {} },
  };
}

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };
// Starting a game that already names a room now asks what to call you first.
// Clicking Play shows the name box straight away, so the same step can fill it
// in and carry on.
const startAs = (who) => `(() => {
  document.getElementById('start-button').click();
  const panel = document.getElementById('panel-name');
  const box = document.getElementById('name-input');
  if (panel && box && !panel.classList.contains('hidden')) {
    box.value = ${JSON.stringify(who)};
    document.getElementById('name-done-button').click();
  }
})()`;


const near = (s, r, g, b, t = 26) => {
  const [R, G, B] = s.split(',').map(Number);
  return Math.abs(R - r) <= t && Math.abs(G - g) <= t && Math.abs(B - b) <= t;
};

console.log('room: ' + ROOM);
const url = URL + '?room=' + ROOM;

const a = await openPage('A', PORT_A);
const b = await openPage('B', PORT_B);

// Start both from a clean save. Without this each player reappears wherever
// the previous run left them, which can be right across town from each other.
for (const p of [a, b]) {
  await p.send('Page.navigate', { url: 'about:blank' });
  await p.send('Storage.clearDataForOrigin', {
    origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
  });
}

// A first, so it becomes the host; B a moment later, so it becomes a guest.
await a.send('Page.navigate', { url }); await sleep(2600);
await a.ev(startAs('Taras'));
await sleep(1500);

await b.send('Page.navigate', { url }); await sleep(2600);
await b.ev(startAs('Sasha'));
await sleep(1500);

/**
 * Is the green "how many of us" badge showing?
 *
 * Scans the strip it lives in rather than sampling one pixel: a single point
 * lands on the pill's anti-aliased edge or on the white icon inside it,
 * neither of which is the colour being looked for.
 */
const badgeShowing = (page) => page.ev(`(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const dpr = c.width / parseFloat(c.style.width);
  const cx = Math.round(parseFloat(c.style.width) / 2 * dpr);
  const d = g.getImageData(cx - Math.round(50 * dpr), Math.round(14 * dpr),
                           Math.round(100 * dpr), Math.round(40 * dpr)).data;
  let green = 0;
  for (let i = 0; i < d.length; i += 4) {
    // The pill is rgba(40,150,60,0.85) over whatever is behind it.
    if (d[i] < 110 && d[i + 1] > 110 && d[i + 1] < 190 && d[i + 2] < 130 && d[i + 1] - d[i] > 55) green++;
  }
  return green;
})()`);

// Give the introduction service and the handshake time to finish.
let connected = false;
let lastSeen = '';
for (let i = 0; i < 15 && !connected; i++) {
  await sleep(1000);
  const ga = await badgeShowing(a);
  const gb = await badgeShowing(b);
  lastSeen = 'A=' + ga + ' B=' + gb + ' green pixels';
  connected = ga > 200 && gb > 200;
}

check('both pages show the connected badge', connected,
      connected ? lastSeen : 'never connected (' + lastSeen + ') — the game still plays alone, but check the introduction service is reachable');

await a.shoot('1-host');
await b.shoot('2-guest');

if (connected) {
  // --- does the other player actually move on screen? ---------------------
  // Give A a BLUE cap first. The default yellow (#FFD23F) is the exact colour
  // of the coins lying in the street, so searching for it finds the scenery
  // as well as the player.
  const R = Math.min(34, 390 * 0.095);
  const FIRST = 844 * 0.175;
  const GAP = ((844 - R - 24) - FIRST) / 7;
  const tap = async (page, x, y) => {
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(90);
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(320);
  };
  await tap(a, 844 - 52, 52);                       // open A's menu
  await tap(a, FIRST + 2 * GAP, 390 * 0.33);        // blue cap, third along, free
  await tap(a, 844 - 52, 52);                       // close it
  await sleep(900);

  /**
   * Where is the OTHER player on this screen?
   *
   * Looks for the blue cap, and ignores a box around the middle of the screen
   * because your own character is always drawn there — the camera follows it.
   */
  const findGhostX = async (page) => page.ev(`(() => {
    const c = document.getElementById('game'), g = c.getContext('2d');
    const w = c.width, h = c.height;
    const d = g.getImageData(0, 0, w, h).data;
    const midX = w / 2, midY = h / 2;
    let sum = 0, n = 0;
    for (let y = Math.round(h * 0.2); y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (Math.abs(x - midX) < 46 && Math.abs(y - midY) < 46) continue;  // ourselves
        const i = (y * w + x) * 4;
        // The blue cap crown, #4EA8FF, tightly matched so the river's #4FC3F7
        // and the pond do not count.
        if (Math.abs(d[i] - 78) < 12 && Math.abs(d[i + 1] - 168) < 12 && Math.abs(d[i + 2] - 255) < 12) {
          sum += x; n++;
        }
      }
    }
    return n > 12 ? Math.round(sum / n) : -1;
  })()`);

  // Everyone starts on the same square, so A's character is sitting exactly
  // underneath B's own — inside the box excluded above. Step apart first.
  await a.push(-1, 0, 1800);
  await sleep(900);

  const westX = await findGhostX(b);
  check('B can see A on screen', westX >= 0, westX >= 0 ? 'at x=' + westX : 'no other player visible');
  await b.shoot('3-guest-sees-host');

  // Now come back part of the way. Deliberately shorter than the walk out:
  // returning the whole way puts A exactly on top of B, back inside the box
  // excluded above, which reads as "not visible" rather than "moved".
  await a.push(1, 0, 750);
  await sleep(1000);

  const eastX = await findGhostX(b);
  check("A walking east moves east on B's screen", eastX >= 0 && eastX > westX + 40,
        westX + ' -> ' + eastX);
  await b.shoot('4-guest-sees-host-move');

  // --- and the other way round: B should be visible to A ------------------
  const seenByHost = await a.ev(`(() => {
    const c = document.getElementById('game'), g = c.getContext('2d');
    const w = c.width, h = c.height, d = g.getImageData(0, 0, w, h).data;
    const midX = w / 2, midY = h / 2;
    let n = 0;
    for (let y = Math.round(h * 0.2); y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (Math.abs(x - midX) < 46 && Math.abs(y - midY) < 46) continue;
        const i = (y * w + x) * 4;
        // B still wears the default yellow cap; its brim (#B87A0C) is unique
        // to a cap, unlike the crown which matches the coins.
        if (Math.abs(d[i] - 184) < 14 && Math.abs(d[i + 1] - 122) < 14 && Math.abs(d[i + 2] - 12) < 22) n++;
      }
    }
    return n;
  })()`);
  check('and A can see B', seenByHost > 8, seenByHost + ' cap-brim pixels');
  await a.shoot('5-host-sees-guest');
}

const problems = [...a.problems, ...b.problems];
console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL LIVE NETWORK CHECKS PASSED');

a.close(); b.close();
process.exit(fail || problems.length ? 1 : 0);
