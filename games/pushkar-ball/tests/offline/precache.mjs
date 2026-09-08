// Every file the game loads must be in the service worker's precache list, or
// the game is missing pieces the first time the hub is opened offline. And the
// folder must contain no image, font or audio file at all: everything here is
// drawn with shapes and synthesised, and anything committed is in git's history
// for ever whether or not it is later deleted. This project has already been
// bitten by that, with a 14MB MP3.
//
// Note which direction this checks. Every file present must be LISTED; it does
// not insist every listed file exists. That is deliberate — sw.js's install
// uses cache.addAll, which rejects wholesale on a single 404, so a path may
// only be listed once the file behind it is real.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', '..');          // games/pushkar-ball
const ROOT = join(GAME, '..', '..');          // the repo root

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'tests' || name === 'tools' || name === 'screenshots') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(GAME);
const BINARY = /\.(png|jpg|jpeg|gif|webp|svg|mp3|wav|ogg|m4a|woff2?|ttf)$/i;

console.log(`\n1. ${files.length} files under games/pushkar-ball/`);
for (const f of files) {
  // Windows hands back backslashes; sw.js is written with forward slashes.
  const rel = relative(ROOT, f).split('\\').join('/');
  if (BINARY.test(rel)) {
    fail(`${rel} is an image, font or audio file — nothing here is loaded from a file`);
    continue;
  }
  if (!/\.(html|css|js)$/.test(rel)) continue;
  if (!sw.includes(`./${rel}`)) fail(`${rel} is not in sw.js's PRECACHE list`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PRECACHE CHECKS PASSED');
process.exit(failures ? 1 : 0);
