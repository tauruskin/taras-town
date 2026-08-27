// Keyboard-only: walk to a car with S+A, press Space to get in, drive with W,
// press Space to get out. Also grabs a close-up of the player for the hat.
import { writeFileSync } from 'node:fs';
const PORT = 9333;
const URL = process.argv[2] || 'http://127.0.0.1:8777/index.html';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const problems = [];
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('LOG: ' + m.params.entry.text);
});
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
await send('Storage.clearDataForOrigin', { origin: URL.split('/').slice(0,3).join('/'), storageTypes: 'local_storage' });
await send('Page.navigate', { url: URL }); await sleep(2400);
await ev(`document.getElementById('start-button').click()`); await sleep(700);

const VK = { w:87, a:65, s:83, d:68, ' ':32 };
const key = (t, k) => send('Input.dispatchKeyEvent', { type: t, key: k,
  code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase(), windowsVirtualKeyCode: VK[k], nativeVirtualKeyCode: VK[k] });

const btn = () => ev(`(() => { const c=document.getElementById('game'), g=c.getContext('2d');
  const dpr=c.width/parseFloat(c.style.width);
  const d=g.getImageData(Math.round((parseFloat(c.style.width)-96)*dpr), Math.round((parseFloat(c.style.height)-92-34)*dpr),1,1).data;
  return d[0]+','+d[1]+','+d[2]; })()`);
const near = (s,r,g,b,t=26) => { const [R,G,B]=s.split(',').map(Number); return Math.abs(R-r)<=t&&Math.abs(G-g)<=t&&Math.abs(B-b)<=t; };
const state = s => near(s,90,200,90) ? 'CAN-ENTER' : near(s,255,159,69) ? 'DRIVING' : 'no button';
const shoot = async n => { const s = await send('Page.captureScreenshot', { format:'png' }); writeFileSync(n, Buffer.from(s.result.data,'base64')); };

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log(`  ${ok?'ok  ':'FAIL'}  ${l}${d?': '+d:''}`); };

await shoot('hat-closeup.png');

// walk down-left to the car with two keys at once
await key('keyDown','s'); await key('keyDown','a');
await sleep(430);
await key('keyUp','s'); await key('keyUp','a');
await sleep(300);
check('walked to the car with S+A', state(await btn()) === 'CAN-ENTER', state(await btn()));

// Space to get in
await key('keyDown',' '); await sleep(90); await key('keyUp',' '); await sleep(700);
check('Space gets in the car', state(await btn()) === 'DRIVING', state(await btn()));
await shoot('key-in-car.png');

// W to drive
await key('keyDown','w'); await sleep(1300); await key('keyUp','w'); await sleep(400);
check('still driving after W', state(await btn()) === 'DRIVING', state(await btn()));
await shoot('key-driving.png');

// Space to get out
await key('keyDown',' '); await sleep(90); await key('keyUp',' '); await sleep(700);
const out = state(await btn());
check('Space gets out again', out === 'CAN-ENTER' || out === 'no button', out);
await shoot('key-out.png');

console.log('\nproblems: ' + (problems.length ? '\n  ' + problems.join('\n  ') : 'NONE'));
console.log(fail || problems.length ? `\n${fail} FAILURE(S)` : '\nALL KEYBOARD-DRIVING CHECKS PASSED');
ws.close(); process.exit(fail || problems.length ? 1 : 0);
