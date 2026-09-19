// Wiring, in the browser: roll into level eight's first button, and level
// nine's first timer, and count the lit-lamp colour on the canvas before and
// after. A COUNT of an exact colour, so it needs no coordinate anywhere —
// the same way the ball is found by its hue. The colour is the first sender's,
// read from config.js; unlit lamps and faint wires are deliberately never
// that exact colour (see circuits.js's drawing notes).
import { connect, makeHold, openLevel } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'wiring';
const PORT = Number(process.argv[4] || 9335);

const { CONFIG } = await import('../../js/config.js');
const { Buttons } = await import('../../js/ui.js');
const { LEVELS } = await import('../../js/levels.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const hex = CONFIG.COLOURS.WIRE[0];
const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lit = () => ev(`(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - ${R}) < 12 && Math.abs(d[i + 1] - ${G}) < 12 && Math.abs(d[i + 2] - ${B}) < 12) n++;
  }
  return n;
})()`);

const open = (W, H, id) =>
  openLevel(cdp, URL, W, H, LEVELS.findIndex((l) => l.id === id), LEVELS.length);

for (const [W, H] of [[568, 320], [740, 280]]) {
  console.log(`\n${W}x${H}, level 8: a button`);
  await open(W, H, 8);
  const before = await lit();
  await shoot(`${W}x${H}-8-before`);
  await hold(Buttons.right(W, H), 4000);
  await sleep(300);
  const after = await lit();
  await shoot(`${W}x${H}-8-pressed`);
  console.log(`   lit pixels: ${before} before, ${after} after rolling into the button`);
  if (before > 40) fail(`${before} lit-colour pixels before anything was pressed — something unlit is drawn in the lit colour`);
  if (after < 300) fail(`only ${after} lit-colour pixels after rolling into the button — its lamp, wire and door lamp did not light`);

  console.log(`\n${W}x${H}, level 9: a timer`);
  await open(W, H, 9);
  await hold(Buttons.right(W, H), 4000);
  await sleep(300);
  const running = await lit();
  await shoot(`${W}x${H}-9-running`);
  const t1 = LEVELS.find((l) => l.id === 9).senders.find((s) => s.id === 't1');
  await sleep((t1.time + 1) * 1000);
  const done = await lit();
  await shoot(`${W}x${H}-9-ran-out`);
  console.log(`   lit pixels: ${running} while running, ${done} after it ran out`);
  if (running < 300) fail(`only ${running} lit-colour pixels with the timer running`);
  if (done > 40) fail(`${done} lit-colour pixels after the timer ran out — it did not let go`);
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nWIRING LIGHTS UP');
process.exit(failures ? 1 : 0);
