// Background music.
//
// The music is a recording now, `sounds/music.m4a`, looping — with the tune
// this module used to be kept behind it as a fallback for when the file
// cannot be fetched or decoded. Both paths have to work.
//
// Audio is awkward to test by listening, so this watches what the page ASKS
// the audio hardware for: a looping buffer source means the recording is
// playing, and oscillators mean the fallback tune is. Either counts as music;
// neither means silence.
//
// This used to count only oscillators, and went red the day the recording
// landed — it was measuring the old implementation rather than the promise.
//
// Nothing test-only ships in the game for this. The counter lives in the page,
// injected by the test, and the game knows nothing about it.
import { writeFileSync } from 'node:fs';

const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';

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
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

await send('Runtime.enable');
await send('Page.enable');
// Make sure this page is the one in front. Animation frames are throttled in a
// backgrounded tab, and the music is scheduled from the game loop — so a tab
// left open by an earlier suite would make the music look as though it had
// stopped when the browser had simply stopped drawing.
await send('Page.bringToFront');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Storage.clearDataForOrigin', {
  origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage',
});

// Count every oscillator the page ever makes, from before any game code runs.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    window.__notes = 0;
    window.__ctx = null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    // Count every note, and hold on to the game's own context so the test can
    // tell "the music stopped" apart from "this browser never gave us a
    // working audio clock" — which are very different answers.
    // Count animation frames too: the music is scheduled from the game loop,
    // so "did the loop run?" and "did the music play?" are different questions
    // and the answer matters.
    window.__frames = 0;
    const spin = () => { window.__frames++; requestAnimationFrame(spin); };
    requestAnimationFrame(spin);

    const real = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () {
      window.__notes++;
      window.__ctx = this;
      return real.apply(this, arguments);
    };

    // And the recording. A LOOPING buffer source is the music specifically —
    // the footsteps and the swimming are buffer sources too, but they play
    // once. Checked when it is started rather than when it is made, because
    // the loop flag is set in between.
    window.__loops = 0;
    const realBuf = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () {
      window.__ctx = this;
      const node = realBuf.apply(this, arguments);
      const realStart = node.start.bind(node);
      node.start = function () {
        if (node.loop) window.__loops++;
        return realStart.apply(null, arguments);
      };
      return node;
    };
  })()`,
});

await send('Page.navigate', { url: URL });
await sleep(2200);

// --- 1. nothing before the tap -------------------------------------------
//
// Phones refuse sound until the page is touched, so the game must not even try.
check('silent before the game starts',
      (await ev('window.__notes')) === 0 && (await ev('window.__loops')) === 0,
      (await ev('window.__notes')) + ' notes, ' + (await ev('window.__loops')) + ' loops');

await ev(`document.getElementById('start-button').click()`);
await sleep(2500);

// --- 2. music plays on its own, with nobody touching anything ------------
const after = await ev('window.__notes');
const loops = await ev('window.__loops');

// Either path is music. The recording is one looping source; the fallback
// tune is at least four notes a bar — three of chord and one of bass, with
// the melody deliberately sparse on top.
check('music starts playing by itself', loops >= 1 || after >= 4,
      loops + ' looping tracks, ' + after + ' notes');

// Which one actually happened? Not a pass or a fail on its own, but the
// single most useful line in this output when something is wrong.
console.log('  --    playing ' + (loops >= 1 ? 'the recording' : after >= 4 ? 'the generated fallback' : 'NOTHING'));

// The recording has to be the thing that plays under normal conditions. If
// this ever flips to the fallback, the file is missing, unfetchable, or the
// browser will not decode it — the game would still make a noise, so nothing
// else here would notice.
check('and it is the recording, not the fallback', loops >= 1,
      loops >= 1 ? '' : 'fell back to the generated tune: sounds/music.m4a did not load or decode');

// Does this browser actually have a running audio clock? Notes are scheduled
// against `currentTime`, so a frozen clock means one burst and then silence
// for ever — which looks exactly like a bug and is not one. Headless Chrome
// only runs the clock with the audio flags `tests/run.mjs` passes, and after
// many suites in one browser it can stop providing one at all.
const clockA = await ev('window.__ctx ? window.__ctx.currentTime : -1');

// Wait for NOTES, not for a fixed number of seconds.
//
// A bar is nearly four seconds long and is scheduled about a second and a half
// before it is due, so across any short window the honest answer is often "no
// new notes yet" — and the first version of this asked for four new notes
// within three seconds, which the music cannot always deliver even when it is
// working perfectly. Poll instead, and give it long enough for a bar to come
// round.
let later = after;
for (let i = 0; i < 24 && later <= after + 3; i++) {
  await sleep(500);
  later = await ev('window.__notes');
}

const clockB = await ev('window.__ctx ? window.__ctx.currentTime : -1');
const clockRuns = clockB > clockA + 0.5;
if (clockRuns) {
  const frames = await ev('window.__frames');
  // A looping recording schedules nothing as it goes — it was started once and
  // the hardware carries it — so "still playing" for that path means the node
  // is still there and the clock is still running, not that new notes appeared.
  if (loops >= 1) {
    const alive = await ev('window.__loops');
    check('and keeps playing', alive >= 1 && clockRuns,
          alive + ' looping tracks, ' + frames + ' frames drawn, clock ' +
          clockA.toFixed(1) + ' -> ' + clockB.toFixed(1) + 's');
  } else {
    check('and keeps playing', later > after + 3,
          after + ' -> ' + later + ' notes, ' + frames + ' frames drawn, clock ' +
          clockA.toFixed(1) + ' -> ' + clockB.toFixed(1) + 's');
  }
} else {
  console.log('  --    no running audio clock in this browser (' +
              clockA.toFixed(2) + ' -> ' + clockB.toFixed(2) + 's); skipping the rest');
  console.log('');
  console.log('ALL MUSIC CHECKS PASSED (nothing more to test here)');
  ws.close();
  process.exit(fail ? 1 : 0);
}

// --- 3. it stops when the game is not on screen --------------------------
//
// Playing to a pocket is a waste of battery.
await ev(`(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
})()`);
await sleep(2600);

// Measured as "notes plus started tracks", so this reads the same whichever
// path is playing. Counting notes alone was vacuously true once the music
// became a recording: it is always nought, hidden or not.
const sound = () => ev('window.__notes + window.__loops * 100');
const atHide = await sound();
await sleep(3000);
const whileHidden = await sound();
check('music stops while the game is hidden', whileHidden <= atHide + 1,
      atHide + ' -> ' + whileHidden + ' (notes + tracks x100)');

// --- 4. and comes back ----------------------------------------------------
await ev(`(() => {
  delete document.visibilityState;
  const d = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  if (d) Object.defineProperty(Document.prototype, 'visibilityState', d);
  document.dispatchEvent(new Event('visibilitychange'));
})()`);
await sleep(3000);
const back = await sound();
// Coming back starts a fresh looping source (+100) or resumes scheduling
// notes (+several); either is a real restart.
check('and starts again when it comes back', back > whileHidden + 2,
      whileHidden + ' -> ' + back + ' (notes + tracks x100)');

console.log('');
console.log('problems: ' + (problems.length ? problems.join('; ') : 'NONE'));
console.log(fail || problems.length ? (fail + ' FAILURE(S)') : 'ALL MUSIC CHECKS PASSED');
ws.close();
process.exit(fail || problems.length ? 1 : 0);
