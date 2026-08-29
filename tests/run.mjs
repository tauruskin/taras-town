/**
 * run.mjs — Run every test.
 *
 *   node tests/run.mjs                 everything
 *   node tests/run.mjs offline         only the ones that need no browser
 *   node tests/run.mjs browser         only the ones that drive a real browser
 *   node tests/run.mjs jobs            only suites whose name contains "jobs"
 *   node tests/run.mjs --live          test the deployed site instead of a
 *                                      local copy
 *
 * There is nothing to install. Node 22 has a global WebSocket, which is enough
 * to drive Chrome over its DevTools Protocol, so the whole harness has no
 * dependencies at all — matching the game itself.
 *
 * This starts what each suite needs (a web server, one or two browsers), runs
 * them one at a time, and shuts everything down afterwards.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'screenshots');

const SERVER_PORT = 8777;
const LOCAL_URL = `http://127.0.0.1:${SERVER_PORT}/index.html`;
const DEPLOYED_URL = 'https://tauruskin.github.io/taras-town/index.html';

// Two browsers, not two tabs. Chrome throttles requestAnimationFrame in
// background tabs, so with both players in one browser the host's game loop
// simply stops — which looks exactly like a broken connection.
const PORTS = [9333, 9334];

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
    .filter((s) => filters.length === 0 ||
                   filters.some((f) => f === s.kind || s.name.includes(f)));
}

function runSuite(suite) {
  return new Promise((resolve) => {
    // Run from the screenshots folder so any pictures a suite takes land
    // there. Imports resolve relative to the file, not the working directory,
    // so this is safe.
    const child = spawn(process.execPath, [suite.file, url, suite.name], {
      cwd: SHOTS,
      stdio: ['ignore', 'pipe', 'pipe'],
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
    console.error('No suites matched.', filters.length ? filters.join(', ') : '');
    process.exit(2);
  }
  const needsBrowser = suites.some((s) => s.kind === 'browser');

  // --- the things the suites need ---------------------------------------
  if (needsBrowser && !useDeployed) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    children.push(spawn(py, ['-m', 'http.server', String(SERVER_PORT), '--bind', '127.0.0.1'], {
      cwd: join(HERE, '..'), stdio: 'ignore',
    }));
    const up = await waitFor(async () => (await fetch(LOCAL_URL)).ok, 'the web server');
    if (!up) process.exit(2);
    console.log(`serving the game at ${LOCAL_URL}`);
  }

  if (needsBrowser) {
    const chrome = findChrome();
    for (const port of PORTS) {
      children.push(spawn(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${join(SHOTS, 'chrome-' + port)}`,
        'about:blank',
      ], { stdio: 'ignore' }));
    }
    const up = await waitFor(
      async () => (await Promise.all(PORTS.map((p) => fetch(`http://127.0.0.1:${p}/json/version`)))).every((r) => r.ok),
      'the browsers');
    if (!up) process.exit(2);
    console.log(`two browsers ready on ports ${PORTS.join(' and ')}`);
  }

  // --- run them ----------------------------------------------------------
  console.log(`\nrunning ${suites.length} suite${suites.length === 1 ? '' : 's'} against ${useDeployed ? 'the DEPLOYED site' : 'a local copy'}\n`);

  const failures = [];
  for (const suite of suites) {
    process.stdout.write(`  ${(suite.kind + '/' + suite.name).padEnd(42)}`);
    const { code, out } = await runSuite(suite);
    const summary = out.trim().split('\n').filter(Boolean).pop() || '(no output)';

    if (code === 0) {
      console.log('ok    ' + summary);
    } else {
      console.log('FAIL');
      failures.push({ suite, out });
    }
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

function cleanUp() {
  for (const c of children) { try { c.kill(); } catch (_) {} }
}
process.on('SIGINT', () => { cleanUp(); process.exit(130); });

main()
  .then((code) => { cleanUp(); process.exit(code); })
  .catch((err) => { console.error(err); cleanUp(); process.exit(2); });
