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
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
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


// --- 1. the two of them get together --------------------------------------
const waitForBoth = async (secs) => {
  for (let i = 0; i < secs; i++) {
    await sleep(1000);
    if ((await badgeShowing(a)) > 200 && (await badgeShowing(b)) > 200) return true;
  }
  return false;
};

const joined = await waitForBoth(15);
check('the two players find each other', joined);

// --- 2. the HOST leaves ----------------------------------------------------
// This is the case that matters at home: whoever opened the link first is the
// host, and when their phone locks or they close the game, everyone else used
// to be left staring at an empty town until they reloaded the page.
console.log('  ... host (A) leaves');
await a.send('Page.navigate', { url: 'about:blank' });
await sleep(2000);

let aloneAgain = false;
for (let i = 0; i < 12 && !aloneAgain; i++) {
  await sleep(1000);
  aloneAgain = (await badgeShowing(b)) < 50;    // the badge hides when alone
}
check('the remaining player notices they are alone', aloneAgain);

// --- 3. the host comes back, and they reconnect without reloading ---------
console.log('  ... host (A) comes back');
await a.send('Page.navigate', { url }); await sleep(2600);
await a.ev(startAs('Taras'));
await sleep(1500);

const backTogether = await waitForBoth(35);
check('they get back together on their own, with nobody reloading anything',
      backTogether, backTogether ? 'reconnected' : 'still apart after 35s');
await b.shoot('6-after-host-returned');

console.log('');
console.log('problems: ' + ([...a.problems, ...b.problems].join('; ') || 'NONE'));
console.log(fail ? (fail + ' FAILURE(S)') : 'ALL REJOIN CHECKS PASSED');
a.close(); b.close();
process.exit(fail ? 1 : 0);
