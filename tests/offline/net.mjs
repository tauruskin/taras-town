// Milestone 6 logic, with no network involved: room parsing, the roster
// merge, forgetting players who go quiet, and — most importantly — that
// rubbish arriving over the wire cannot break anything.
//
// The real connection is exercised separately by live-net.mjs.

// net.js reaches for window/document at import time only inside functions,
// but roomFromUrl reads window.location, so give it somewhere to look.
globalThis.window = { location: { search: '' } };
globalThis.document = { createElement: () => ({}), head: { appendChild() {} } };

const { Net, roomFromUrl } = await import('../../js/net.js');
const { CONFIG } = await import('../../js/config.js');

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- 1. reading the room out of the address -------------------------------
console.log('');
console.log('1. reading ?room= from the address');
const cases = [
  ['', null, 'no room at all means ordinary single player'],
  ['?room=', null, 'an empty room is ignored'],
  ['?room=ab', null, 'too short to be a real room'],
  ['?room=family', 'family', 'a plain room name'],
  ['?room=FAMILY', 'family', 'case does not matter'],
  ['?room=taras-8f3k2p', 'taras-8f3k2p', 'letters, digits and dashes'],
  ['?room=<script>alert(1)</script>', 'scriptalert1script', 'markup is stripped to harmless characters'],
  ['?room=' + 'x'.repeat(200), 'x'.repeat(40), 'absurdly long names are cut short'],
  ['?other=1', null, 'some other parameter is not a room'],
];
for (const [search, want, label] of cases) {
  window.location.search = search;
  const got = roomFromUrl();
  check(label, got === want, JSON.stringify(got));
}

// --- 2. a guest merging the host's roster ---------------------------------
console.log('');
console.log('2. merging the list of who is where');
const net = new Net('testroom');
net.peer = { id: 'me' };
net.status = 'guest';

net._onRoster({ t: 'all', p: [
  { id: 'me', x: 1, y: 1 },                                   // ourselves
  { id: 'a', x: 100, y: 200, angle: 0.5, mode: 'foot', hat: 1, shirt: 2, car: 3 },
  { id: 'b', x: 300, y: 400, angle: 1.5, mode: 'drive', hat: 0, shirt: 0, car: 0 },
] });
check('two other players are recorded', net.others.size === 2, [...net.others.keys()].join(','));
check('we are not listed as one of the others', !net.others.has('me'));
check('their position comes through', net.others.get('a').x === 100);
check('the count includes ourselves', net.playerCount === 3, String(net.playerCount));

// Someone leaving disappears from the next roster.
net._onRoster({ t: 'all', p: [{ id: 'a', x: 150, y: 250 }] });
check('a player who left is dropped', !net.others.has('b'), [...net.others.keys()].join(','));
check('the one still there is updated', net.others.get('a').x === 150);

// --- 3. rubbish over the wire must not break anything ---------------------
console.log('');
console.log('3. defending against nonsense arriving over the wire');
const before = net.others.size;
const junk = [
  null, undefined, 42, 'hello', [], {}, { t: 'all' },
  { t: 'all', p: 'not an array' }, { t: 'all', p: [null, undefined] },
  { t: 'nonsense', p: [{ id: 'z' }] },
];
let threw = null;
for (const bad of junk) {
  try { net._onRoster(bad); } catch (e) { threw = JSON.stringify(bad) + ' -> ' + e.message; }
}
check('nothing thrown by junk messages', threw === null, threw || '');
check('an unknown message type is ignored', !net.others.has('z'));
check('the roster is not corrupted', net.others.size <= before + 0, net.others.size + ' players');

// --- 4. forgetting somebody who goes quiet --------------------------------
console.log('');
console.log('4. forgetting a player who goes quiet');
const quiet = new Net('testroom');
quiet.peer = { id: 'me' };
quiet.status = 'guest';
quiet.toHost = { open: false, send() {} };
quiet._onRoster({ t: 'all', p: [{ id: 'gone', x: 1, y: 2, angle: 0, mode: 'foot' }] });
check('they are there to begin with', quiet.others.size === 1);

let t = 0;
while (quiet.others.size > 0 && t < CONFIG.NET.FORGET_AFTER_SECONDS + 3) {
  quiet.update(0.25, { x: 0, y: 0, angle: 0, mode: 'foot', hat: 0, shirt: 0, car: 0 });
  t += 0.25;
}
check('they are forgotten after going quiet', quiet.others.size === 0, 'after ' + t + 's');
check('which is about the configured time', Math.abs(t - CONFIG.NET.FORGET_AFTER_SECONDS) < 1,
      CONFIG.NET.FORGET_AFTER_SECONDS + 's configured');

// A player who keeps talking is NOT forgotten.
const chatty = new Net('testroom');
chatty.peer = { id: 'me' };
chatty.status = 'guest';
chatty.toHost = { open: false, send() {} };
let t2 = 0;
while (t2 < CONFIG.NET.FORGET_AFTER_SECONDS * 2) {
  chatty._onRoster({ t: 'all', p: [{ id: 'here', x: 1, y: 2, angle: 0, mode: 'foot' }] });
  chatty.update(0.25, { x: 0, y: 0, angle: 0, mode: 'foot', hat: 0, shirt: 0, car: 0 });
  t2 += 0.25;
}
check('somebody who keeps talking is kept', chatty.others.size === 1);

// --- 4b. a host that goes silent without saying goodbye -------------------
console.log('');
console.log('4b. a host that goes quiet without a close event');
const silent = new Net('testroom');
silent.peer = { id: 'me' };
silent.status = 'guest';
silent.toHost = { open: true, send() {} };
silent._onRoster({ t: 'all', p: [{ id: 'host', x: 1, y: 2, angle: 0, mode: 'foot' }] });
check('starts out connected', silent.status === 'guest' && silent.others.size === 1);

let t3 = 0;
while (silent.status === 'guest' && t3 < CONFIG.NET.SILENCE_SECONDS + 4) {
  silent.update(0.25, { x: 0, y: 0, angle: 0, mode: 'foot', hat: 0, shirt: 0, car: 0 });
  t3 += 0.25;
}
check('gives up on a silent host', silent.status === 'failed', 'after ' + t3 + 's');
check('and clears everyone away', silent.others.size === 0);

// It must then actually try again rather than sitting in failed for ever.
let tried = false;
silent.join = async () => { tried = true; };
let t4 = 0;
while (!tried && t4 < CONFIG.NET.RETRY_SECONDS + 4) {
  silent.update(0.25, { x: 0, y: 0, angle: 0, mode: 'foot', hat: 0, shirt: 0, car: 0 });
  t4 += 0.25;
}
check('and tries to rejoin', tried, 'after a further ' + t4 + 's');

// Somebody who keeps hearing from the host is NOT dropped.
const talking = new Net('testroom');
talking.peer = { id: 'me' };
talking.status = 'guest';
talking.toHost = { open: true, send() {} };
let t5 = 0;
while (t5 < CONFIG.NET.SILENCE_SECONDS * 3) {
  talking._onRoster({ t: 'all', p: [{ id: 'host', x: 1, y: 2, angle: 0, mode: 'foot' }] });
  talking.update(0.25, { x: 0, y: 0, angle: 0, mode: 'foot', hat: 0, shirt: 0, car: 0 });
  t5 += 0.25;
}
check('a host that keeps talking is kept', talking.status === 'guest');

// --- 5. what actually goes out on the wire --------------------------------
console.log('');
console.log('5. what is sent');
const sent = [];
const host = new Net('testroom');
host.peer = { id: 'hostid' };
host.status = 'host';
host.isHost = true;
host.guests.set('g1', { open: true, send: (m) => sent.push(m) });
host.others.set('g1', { x: 5, y: 6, angle: 0.1, mode: 'foot', hat: 1, shirt: 1, car: 1, seen: 0 });

for (let i = 0; i < 20; i++) {
  host.update(0.05, { x: 10, y: 20, angle: 0.3, mode: 'drive', hat: 2, shirt: 3, car: 4 });
}
check('the host does send updates', sent.length > 0, sent.length + ' messages');
const rate = sent.length / 1.0;
check('at roughly the configured rate', Math.abs(rate - CONFIG.NET.SENDS_PER_SECOND) <= 2,
      rate + '/s vs ' + CONFIG.NET.SENDS_PER_SECOND + '/s configured');

const fields = new Set();
for (const m of sent) for (const p of m.p) for (const k of Object.keys(p)) fields.add(k);
check('only position and appearance are sent', [...fields].sort().join(',') === 'angle,car,hat,id,mode,shirt,x,y',
      [...fields].sort().join(','));

// This is the one that matters for safety: nothing resembling free text.
const asText = JSON.stringify(sent);
const noText = !/name|chat|message|text|said/i.test(asText);
check('nothing that could carry words is sent', noText);

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL NET CHECKS PASSED');
process.exit(fail ? 1 : 0);
