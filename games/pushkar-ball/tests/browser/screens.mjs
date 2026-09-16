// The screens, walked the way a player walks them: opening, level select, a
// level, back to level select by the corner button, and restart. Every button
// position comes from ui.js or from the page itself — never written here.
import { connect, ballAt, makeHold } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'screens';
const PORT = Number(process.argv[4] || 9335);

const { Buttons } = await import('../../js/ui.js');
const { LEVELS } = await import('../../js/levels.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const W = 844, H = 390;
const shown = (id) => ev(`!document.getElementById('${id}').classList.contains('hidden')`);
const tiles = () => ev(`[...document.querySelectorAll('#level-grid .tile')].map((t) => ({
  disabled: t.disabled, text: t.textContent.trim(), star: !!t.querySelector('svg.star'),
  lock: !!t.querySelector('svg.lock'), next: t.classList.contains('next') }))`);
const tap = (b) => hold(b, 60);

async function open() {
  await send('Page.navigate', { url: URL });
  await sleep(1600);
}

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0, 3).join('/'), storageTypes: 'local_storage' });
await open();

// --- 1. opening screen, then level select ---------------------------------
console.log('\n1. opening -> level select');
if (!await shown('start-screen')) fail('the opening screen is not shown first');
if (await shown('levels-screen')) fail('level select is shown before Play');
await ev("document.getElementById('start-button').click()");
await sleep(400);
if (!await shown('levels-screen')) fail('Play did not open level select');
let t = await tiles();
console.log(`   ${t.length} tiles: ${t.map((x) => x.lock ? 'locked' : x.text + (x.next ? '(next)' : '')).join(' ')}`);
if (t.length !== LEVELS.length) fail(`${t.length} tiles for ${LEVELS.length} levels`);
if (t[0].disabled || t[0].text !== String(LEVELS[0].id) || !t[0].next) fail('with nothing saved, level one is not the open, highlighted tile');
if (t.slice(1).some((x) => !x.disabled || !x.lock)) fail('with nothing saved, a tile other than level one is not locked');
await shoot('1-levels-fresh');

// --- 2. a locked tile does nothing ----------------------------------------
console.log('\n2. a locked tile');
await ev("document.querySelectorAll('#level-grid .tile')[1].click()");
await sleep(300);
if (!await shown('levels-screen')) fail('tapping a locked tile left level select');

// --- 3. level one, then restart --------------------------------------------
console.log('\n3. play, then restart');
await ev("document.querySelector('#level-grid .tile').click()");
await sleep(900);
if (await shown('levels-screen')) fail('tapping level one did not hide level select');
const atStart = await ballAt(ev);
await hold(Buttons.right(W, H), 900);
await sleep(200);
const rolled = await ballAt(ev);
await tap(Buttons.restart(W, H));
await sleep(900);
const back = await ballAt(ev);
console.log(`   ball at start ${atStart?.x.toFixed(0)}, after rolling ${rolled?.x.toFixed(0)}, after restart ${back?.x.toFixed(0)}`);
if (!atStart || !rolled || !back) fail('the ball was not visible at some point');
else {
  // The camera follows the ball, so screen x alone cannot say where it is in
  // the level; a restart snaps the camera back to the spawn, which puts the
  // ball where it was at the very start.
  if (Math.abs(rolled.x - atStart.x) < 5 && Math.abs(rolled.y - atStart.y) < 5) fail('holding right did not move the ball, so the restart check proves nothing');
  if (Math.hypot(back.x - atStart.x, back.y - atStart.y) > 12) fail(`after restart the ball is at ${back.x.toFixed(0)},${back.y.toFixed(0)}, not where it began at ${atStart.x.toFixed(0)},${atStart.y.toFixed(0)}`);
}
await shoot('2-playing');

// --- 4. the corner button goes to level select ----------------------------
console.log('\n4. corner button to level select');
await tap(Buttons.levels(W, H));
await sleep(400);
if (!await shown('levels-screen')) fail('the levels corner button did not open level select');
await shoot('3-levels-again');

// --- 5. saved progress opens the next level --------------------------------
console.log('\n5. saved progress');
await ev(`localStorage.setItem('pushkar-ball-save', JSON.stringify({ unlocked: 2, finished: [${LEVELS[0].id}] }))`);
await open();
await ev("document.getElementById('start-button').click()");
await sleep(400);
t = await tiles();
console.log(`   ${t.map((x) => x.lock ? 'locked' : x.text + (x.star ? '*' : '') + (x.next ? '(next)' : '')).join(' ')}`);
if (!t[0].star || t[0].next) fail('a finished level one does not carry a star');
if (t[1].disabled || !t[1].next) fail('with level one finished, level two is not the open, highlighted tile');
if (t.length > 2 && !t[2].disabled) fail('level three opened without level two being finished');
await shoot('4-levels-progress');

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nSCREENS WORK');
process.exit(failures ? 1 : 0);
