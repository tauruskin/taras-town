// Do the installable-app files actually agree with each other?
//
// This cannot prove the game opens offline — that needs a real browser and
// lives in tests/browser/pwa.mjs — but it catches the cheap mistakes fast:
// a manifest pointing at an icon that was never generated, an icon that is
// not actually the size it claims to be, a precache list that has drifted
// from the files that exist.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const path = (...p) => join(ROOT, ...p);

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- 1. the manifest itself -------------------------------------------------
console.log('');
console.log('1. manifest.json');
const manifestRaw = readFileSync(path('manifest.json'), 'utf-8');
let manifest;
try { manifest = JSON.parse(manifestRaw); } catch (e) { manifest = null; }
check('is valid JSON', manifest !== null);

if (manifest) {
  check('has a name', typeof manifest.name === 'string' && manifest.name.length > 0, manifest.name);
  check('opens standalone, like an app', manifest.display === 'standalone', manifest.display);
  check('locks to landscape', manifest.orientation === 'landscape', manifest.orientation);

  // Leading slashes silently break on a GitHub Pages subpath — the exact
  // trap the whole project has avoided everywhere else.
  for (const field of ['start_url', 'scope']) {
    check(field + ' is a relative path, not a leading slash',
          typeof manifest[field] === 'string' && !manifest[field].startsWith('/'), manifest[field]);
  }
  check('has at least one icon', Array.isArray(manifest.icons) && manifest.icons.length > 0);
  check('has a maskable icon', manifest.icons.some((i) => (i.purpose || '').includes('maskable')));
}

// --- 2. every icon the manifest promises actually exists, at that size ----
console.log('');
console.log('2. icons');

/** Read a PNG's real width/height straight out of its IHDR chunk. */
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b.readUInt8(25) };
}

const seen = new Set();
for (const icon of manifest?.icons || []) {
  const file = path(icon.src);
  const key = icon.src;
  if (seen.has(key)) continue;
  seen.add(key);

  check(key + ' exists on disk', existsSync(file));
  if (!existsSync(file)) continue;

  const [wantW, wantH] = icon.sizes.split('x').map(Number);
  const { w, h, colorType } = pngSize(file);
  check(key + ' is really ' + icon.sizes, w === wantW && h === wantH, w + 'x' + h);
  // Colour type 6 is RGBA. A transparent icon renders as a black square on
  // iOS, which does not composite alpha for home-screen icons.
  check(key + ' has no transparency', colorType !== 6, 'colorType=' + colorType);
}

check('the apple touch icon exists and is 180x180', existsSync(path('icons/apple-touch-icon.png')) &&
      pngSize(path('icons/apple-touch-icon.png')).w === 180);

// --- 3. index.html actually links to all of this ---------------------------
console.log('');
console.log('3. index.html');
const html = readFileSync(path('index.html'), 'utf-8');
check('links the manifest', /<link\s+rel="manifest"\s+href="manifest\.json"/.test(html));
check('links an apple touch icon', /<link\s+rel="apple-touch-icon"/.test(html));
check('none of the new tags use a leading slash', !/href="\/(manifest|icons)/.test(html));

// --- 4. the service worker's own precache list is not stale ---------------
console.log('');
console.log('4. sw.js precache list');
const sw = readFileSync(path('sw.js'), 'utf-8');
const match = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
check('PRECACHE list is present', !!match);

if (match) {
  const files = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  check('lists more than a couple of files', files.length > 5, files.length + ' entries');

  let missing = 0;
  for (const f of files) {
    if (f === './') continue;   // the navigation request, not a real file
    if (!existsSync(path(f.replace(/^\.\//, '')))) { missing++; console.log('    missing: ' + f); }
  }
  check('every listed file actually exists', missing === 0, missing + ' missing');

  // And the reverse: every game .js file should be listed, or it will only
  // ever load online and quietly stop working the moment the phone is offline.
  const { readdirSync } = await import('node:fs');
  const realJs = readdirSync(path('js')).filter((f) => f.endsWith('.js')).map((f) => './js/' + f);
  const notListed = realJs.filter((f) => !files.includes(f));
  check('every js/*.js file is precached', notListed.length === 0, notListed.join(', '));
}

check('only handles GET, and only same-origin',
      sw.includes("req.method !== 'GET'") && sw.includes('self.location.origin'));

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL PWA FILE CHECKS PASSED');
process.exit(fail ? 1 : 0);
