// Renders tools/icon.html into the PNG files the manifest and index.html
// need, at exact pixel sizes, using a headless Chrome that must already be
// running with --remote-debugging-port=9333 (tests/run.mjs starts one).
//
//   node tools/make-icons.mjs
//
// No image library involved: this is the same DevTools Protocol screenshot
// technique the test suite already uses, just capturing tools/icon.html
// instead of the game.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = 9333;

const SIZES = [
  { file: 'icons/icon-192.png', px: 192 },
  { file: 'icons/icon-512.png', px: 512 },
  { file: 'icons/apple-touch-icon.png', px: 180 },
];

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = targets.find((t) => t.type === 'page') || (await (await fetch(
  `http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json());

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => {
  const myId = ++id;
  pending.set(myId, r);
  ws.send(JSON.stringify({ id: myId, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Page.navigate', { url: 'file:///' + join(ROOT, 'tools', 'icon.html').replace(/\\/g, '/') });
await sleep(400);

// The canvas is always drawn at 512x512; `clip.scale` alone resizes the
// capture to whatever output size is wanted. Setting BOTH this and the
// emulated device pixel ratio multiplies the two together — a first attempt
// at this did exactly that and quietly produced icons a third of the size
// they claimed to be.
await send('Emulation.setDeviceMetricsOverride', {
  width: 512, height: 512, deviceScaleFactor: 1, mobile: false,
});

for (const { file, px } of SIZES) {
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 512, height: 512, scale: px / 512 },
  });
  writeFileSync(join(ROOT, file), Buffer.from(shot.result.data, 'base64'));
  console.log(`wrote ${file} (${px}x${px})`);
}

ws.close();
