// The new way in: one player taps "play together", makes a game, and reads a
// code off the screen. The other taps "play together", types that code on the
// number pad, and ends up in the same town.
//
// Two separate browsers, because Chrome throttles requestAnimationFrame in
// background tabs — with both players in one browser the host's game loop
// stops and it looks exactly like a broken connection.
import { writeFileSync } from 'node:fs';

const PORT_A = 9333;
const PORT_B = 9334;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(label, port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const targetId = target.id;
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'info') {
      console.log('    [' + label + '] ' + m.params.args.map((a) => a.value).join(' '));
    }
  });

  const send = (method, params = {}) => new Promise((r) => {
    const myId = ++id; pending.set(myId, r);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

  await send('Runtime.enable');
  await send('Page.enable');
  // Always fetch fresh. A stale style.css once left every panel visible at
  // once, and width-based checks happily passed anyway.
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  return {
    label, send, ev, problems,
    shoot: async (n) => {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync('mpcode-' + n + '.png', Buffer.from(s.result.data, 'base64'));
    },
    /** Tap a real DOM element by id, the way a finger would. */
    tapId: async (elId) => {
      const box = await ev(`(() => {
        const el = document.getElementById('${elId}');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0) return null;
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      })()`);
      if (!box) return false;
      const { x, y } = JSON.parse(box);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(60);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(320);
      return true;
    },
    /**
     * Type a name into the box and press on.
     *
     * The value is set directly rather than typed key by key: what is being
     * checked here is the joining flow, and the phone's own keyboard is not
     * this game's code to test.
     */
    name: async (who) => {
      await ev(`(() => {
        const box = document.getElementById('name-input');
        if (box) box.value = ${JSON.stringify(who)};
      })()`);
      const el = await ev(`(() => {
        const b = document.getElementById('name-done-button');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      })()`);
      if (!el) return false;
      const { x, y } = JSON.parse(el);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(60);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(320);
      return true;
    },

    /** Tap a numbered key on the pad by the digit printed on it. */
    tapDigit: async (digit) => {
      const box = await ev(`(() => {
        const keys = [...document.querySelectorAll('#keypad button')];
        const el = keys.find((k) => k.textContent === '${digit}');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      })()`);
      if (!box) return false;
      const { x, y } = JSON.parse(box);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(50);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(180);
      return true;
    },
    visible: (elId) => ev(`(() => {
      const el = document.getElementById('${elId}');
      return !!(el && el.getBoundingClientRect().width > 0);
    })()`),
    /**
     * Which panel is showing — and only one ever should be.
     *
     * Checking an element merely has width is not enough: with the stylesheet
     * missing, every panel is "visible" at once and such a check passes while
     * the screen is unusable.
     */
    onlyPanel: () => ev(`(() => {
      const shown = [...document.querySelectorAll('#start-screen .panel')]
        .filter((p) => p.getBoundingClientRect().width > 0 && !p.classList.contains('hidden'));
      return shown.length === 1 ? shown[0].id : shown.length + ' panels: ' + shown.map((p) => p.id).join();
    })()`),
    // Shut the TAB, not just the socket. A leftover tab is still there for
    // the next suite to find, and a backgrounded tab has its animation frames
    // throttled — which looks like the game having stopped.
    close: async () => {
      try { await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`); } catch (_) {}
      try { ws.close(); } catch (_) {}
    },
  };
}

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const a = await openPage('A', PORT_A);
const b = await openPage('B', PORT_B);

// Clean saves, and no leftover ?room= from anything else.
for (const p of [a, b]) {
  await p.send('Page.navigate', { url: 'about:blank' });
  await p.send('Storage.clearDataForOrigin', {
    origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
  });
}

// --- 1. the opening screen offers both ways to play ----------------------
await a.send('Page.navigate', { url: URL }); await sleep(2400);
check('exactly one panel is showing', (await a.onlyPanel()) === 'panel-welcome', await a.onlyPanel());
check('the opening screen offers playing alone', await a.visible('start-button'));
check('and offers playing together', await a.visible('together-button'));
await a.shoot('1-welcome');

// --- 2. A says what to call them, then makes a game ----------------------
await a.tapId('together-button');
check('choosing together asks for a name first', (await a.onlyPanel()) === 'panel-name', await a.onlyPanel());
await a.name('Taras');
check('and then moves to make-or-join alone', (await a.onlyPanel()) === 'panel-together', await a.onlyPanel());
check('choosing together offers making a game', await a.visible('make-button'));
check('and offers joining one', await a.visible('join-button'));
await a.shoot('2-make-or-join');

await a.tapId('make-button');
const code = await a.ev(`(() => {
  const row = document.getElementById('room-code');
  return row ? [...row.querySelectorAll('.digit')].map((d) => d.textContent).join('') : '';
})()`);
check('a code is shown', /^[1-9][0-9]{3}$/.test(code), code);
await a.shoot('3-the-code');

await a.tapId('code-play-button');
await sleep(2000);
check('the game starts after showing the code',
      (await a.ev("document.getElementById('start-screen').classList.contains('hidden')")) === true);
check('and the code goes into the address so it can be shared',
      (await a.ev('location.search')).includes('room=' + code), await a.ev('location.search'));
await a.shoot('4-host-playing');

// --- 3. B types that code on the number pad ------------------------------
await b.send('Page.navigate', { url: URL }); await sleep(2400);
await b.tapId('together-button');
await b.name('Sasha');
await b.tapId('join-button');
check('the number pad is the only thing showing', (await b.onlyPanel()) === 'panel-keypad', await b.onlyPanel());
check('and it has all ten digits and a delete key',
      (await b.ev("document.querySelectorAll('#keypad button').length")) === 11,
      (await b.ev("document.querySelectorAll('#keypad button').length")) + ' keys');
await b.shoot('5-keypad');

for (const digit of code) {
  const hit = await b.tapDigit(digit);
  if (!hit) { check('could tap the digit ' + digit, false); break; }
}
await sleep(2400);
check('typing the last digit starts the game on its own',
      (await b.ev("document.getElementById('start-screen').classList.contains('hidden')")) === true);
check('and it joined the right room',
      (await b.ev('location.search')).includes('room=' + code), await b.ev('location.search'));

// --- 4. they can actually see each other ---------------------------------
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
for (let i = 0; i < 20 && !together; i++) {
  await sleep(1000);
  together = (await badge(a)) > 200 && (await badge(b)) > 200;
}
check('the two of them end up in the same game', together);
await a.shoot('6-host-with-guest');
await b.shoot('7-guest-with-host');

const problems = [...a.problems, ...b.problems];
console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL CODE-JOIN CHECKS PASSED');
await a.close(); await b.close();
process.exit(fail || problems.length ? 1 : 0);
