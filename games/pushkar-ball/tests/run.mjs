/**
 * run.mjs — Run every test for Pushkar Ball.
 *
 *   node games/pushkar-ball/tests/run.mjs            everything
 *   node games/pushkar-ball/tests/run.mjs offline     no browser, a few seconds
 *   node games/pushkar-ball/tests/run.mjs roll        suites whose name matches
 *   node games/pushkar-ball/tests/run.mjs --live      test the deployed site
 *
 * There is nothing to install. Node 22 has a global WebSocket, which is enough
 * to drive Chrome over its DevTools Protocol, so the whole harness has no
 * dependencies at all — matching the game itself.
 *
 * ONE browser, not two. Taras Town runs two because it has multiplayer and
 * Chrome throttles requestAnimationFrame in a background tab, so two players in
 * one browser means the host's loop simply stops. This game has no multiplayer
 * and needs no second player — which is also why its ports differ from Taras
 * Town's: both games' suites should be runnable at the same time without
 * fighting over a port.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'screenshots');

const SERVER_PORT = 8778;
const LOCAL_URL = `http://127.0.0.1:${SERVER_PORT}/games/pushkar-ball/index.html`;
const DEPLOYED_URL = 'https://tauruskin.github.io/taras-town/games/pushkar-ball/index.html';
const PORT = 9335;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const args = process.argv.slice(2);
const useDeployed = args.includes('--live');
const filters = args.filter((a) => !a.startsWith('--'));
const url = useDeployed ? DEPLOYED_URL : LOCAL_URL;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];

function findChrome() {
  const found = CHROMES.find((p) => existsSync(p));
  if (!found) {
    console.error('Could not find Chrome. Add its path to CHROMES in tests/run.mjs.');
    process.exit(2);
  }
  return found;
}

/** Wait for something to start answering, rather than guessing at a delay. */
async function waitFor(check, what, seconds = 25) {
  for (let i = 0; i < seconds * 2; i++) {
    try { if (await check()) return true; } catch (_) {}
    await sleep(500);
  }
  console.error(`Gave up waiting for ${what}.`);
  return false;
}

function collect(dir) {
  const full = join(HERE, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    // Files beginning with an underscore are shared helpers, not suites.
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .map((f) => ({ kind: dir, name: f.replace(/\.mjs$/, ''), file: join(full, f) }))
    .filter((s) => filters.length === 0 || filters.some((f) => matches(f, s)));
}

/**
 * Does this filter select this suite?
 *
 * Three forms, and the third exists because its absence reads as a passing
 * run. A filter naming a kind takes every suite of that kind; a bare filter is
 * a substring of a suite's name. But once the same name exists in both halves
 * — `offline/deflate` and `browser/deflate` — the only way to ask for one of
 * them was to run both, and the obvious `offline/deflate` matched NOTHING and
 * exited with "No suites matched". In a long session that is indistinguishable
 * from a suite that is simply not there, and it had already been written into
 * three steps of a plan before anyone typed it.
 */
function matches(filter, suite) {
  const slash = filter.indexOf('/');
  if (slash < 0) return filter === suite.kind || suite.name.includes(filter);
  const kind = filter.slice(0, slash);
  const name = filter.slice(slash + 1);
  return kind === suite.kind && (name === '' || suite.name.includes(name));
}

function runSuite(suite) {
  return new Promise((resolve) => {
    // Run from the screenshots folder so any pictures a suite takes land there.
    // Imports resolve relative to the file, not the working directory, so this
    // is safe.
    const child = spawn(process.execPath, [suite.file, url, suite.name, String(PORT)], {
      cwd: SHOTS, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  const suites = [...collect('offline'), ...collect('browser')];
  if (suites.length === 0) {
    console.error('No suites matched.', filters.join(', '));
    process.exit(2);
  }
  const needsBrowser = suites.some((s) => s.kind === 'browser');

  // --- the things the suites need ---------------------------------------
  if (needsBrowser && !useDeployed) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    // Served from the repo ROOT, not this game's folder, so a suite can reach
    // sw.js and the hub through the same server. HERE is
    // games/pushkar-ball/tests, so three ../ reach the root.
    children.push(spawn(py, ['-m', 'http.server', String(SERVER_PORT), '--bind', '127.0.0.1'], {
      cwd: join(HERE, '..', '..', '..'), stdio: 'ignore',
    }));
    if (!await waitFor(async () => (await fetch(LOCAL_URL)).ok, 'the web server')) process.exit(2);
    console.log(`serving the game at ${LOCAL_URL}`);
  }

  if (needsBrowser) {
    children.push(spawn(findChrome(), [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      // Let the audio clock actually run, for when there is audio to hear.
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(SHOTS, 'chrome-' + PORT)}`,
      'about:blank',
    ], { stdio: 'ignore' }));
    if (!await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok,
                       'the browser')) process.exit(2);
    console.log(`browser ready on port ${PORT}`);
  }

  // --- run them ----------------------------------------------------------
  console.log(`\nrunning ${suites.length} suite${suites.length === 1 ? '' : 's'} against ${useDeployed ? 'the DEPLOYED site' : 'a local copy'}\n`);

  const failures = [];
  for (const suite of suites) {
    process.stdout.write(`  ${(suite.kind + '/' + suite.name).padEnd(42)}`);
    const { code, out } = await runSuite(suite);
    const summary = out.trim().split('\n').filter(Boolean).pop() || '(no output)';
    if (code === 0) console.log('ok    ' + summary);
    else { console.log('FAIL'); failures.push({ suite, out }); }
  }

  // --- what went wrong ---------------------------------------------------
  for (const f of failures) {
    console.log(`\n${'='.repeat(66)}\n${f.suite.kind}/${f.suite.name}\n${'='.repeat(66)}`);
    console.log(f.out.trim());
  }

  console.log(failures.length
    ? `\n${failures.length} of ${suites.length} suites FAILED`
    : `\nall ${suites.length} suites passed`);
  return failures.length ? 1 : 0;
}

function cleanUp() { for (const c of children) { try { c.kill(); } catch (_) {} } }
process.on('SIGINT', () => { cleanUp(); process.exit(130); });

main().then((c) => { cleanUp(); process.exit(c); })
      .catch((e) => { console.error(e); cleanUp(); process.exit(2); });
