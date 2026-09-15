// Saved progress: which levels are open and which are finished. Every read and
// write can fail — private mode, blocked storage, a value someone typed into
// DevTools — and every failure has to give a playable game with no memory,
// never an error. So the storage is handed in, and this suite hands in ones
// that work, ones that throw, and ones full of rubbish.
const { SAVE_KEY, freshProgress, loadProgress, saveProgress, markWon } = await import('../../js/save.js');

let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const LEVELS = [{ id: 1 }, { id: 2 }, { id: 3 }];
const memory = (init) => {
  const m = new Map(init ? [[SAVE_KEY, init]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

// --- 1. nothing saved, or no storage at all, is level one only -------------
{
  console.log('\n1. defaults');
  const fresh = freshProgress();
  if (!same(fresh, { unlocked: 1, finished: [] })) fail(`fresh progress is ${JSON.stringify(fresh)}`);
  if (!same(loadProgress(memory(), LEVELS), fresh)) fail('empty storage did not give fresh progress');
  let threw = false, got;
  try { got = loadProgress(throwing, LEVELS); } catch (_) { threw = true; }
  if (threw || !same(got, fresh)) fail('a storage that throws did not give fresh progress quietly');
  try { got = loadProgress(null, LEVELS); } catch (_) { threw = true; }
  if (threw || !same(got, fresh)) fail('no storage at all did not give fresh progress quietly');
  let saved;
  try { saved = saveProgress(throwing, fresh); } catch (_) { threw = true; }
  if (threw || saved !== false) fail('saving to a storage that throws did not return false quietly');
}

// --- 2. rubbish is cleaned, not trusted -------------------------------------
{
  console.log('\n2. sanitising');
  const cases = [
    ['not json', '{oops', { unlocked: 1, finished: [] }],
    ['a number', '7', { unlocked: 1, finished: [] }],
    ['unlocked too high', JSON.stringify({ unlocked: 99, finished: [] }), { unlocked: 3, finished: [] }],
    ['unlocked zero', JSON.stringify({ unlocked: 0, finished: [] }), { unlocked: 1, finished: [] }],
    ['unlocked not a whole number', JSON.stringify({ unlocked: 2.5, finished: [] }), { unlocked: 1, finished: [] }],
    ['unknown and repeated ids', JSON.stringify({ unlocked: 2, finished: [1, 1, 9, 'x'] }), { unlocked: 2, finished: [1] }],
    ['finished not a list', JSON.stringify({ unlocked: 2, finished: 'all' }), { unlocked: 2, finished: [] }],
  ];
  for (const [what, raw, want] of cases) {
    const got = loadProgress(memory(raw), LEVELS);
    if (!same(got, want)) fail(`${what}: loaded ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
  console.log(`   ${cases.length} kinds of rubbish`);
}

// --- 3. winning opens the next level, and never closes anything ------------
{
  console.log('\n3. markWon');
  let p = markWon(freshProgress(), 0, LEVELS);
  if (!same(p, { unlocked: 2, finished: [1] })) fail(`winning level 1 gave ${JSON.stringify(p)}`);
  p = markWon(p, 0, LEVELS);
  if (!same(p, { unlocked: 2, finished: [1] })) fail(`winning level 1 twice gave ${JSON.stringify(p)}`);
  p = markWon({ unlocked: 3, finished: [1, 2] }, 0, LEVELS);
  if (p.unlocked !== 3) fail(`replaying level 1 lowered unlocked to ${p.unlocked}`);
  p = markWon({ unlocked: 3, finished: [1, 2] }, 2, LEVELS);
  if (!same(p, { unlocked: 3, finished: [1, 2, 3] })) fail(`winning the last level gave ${JSON.stringify(p)}`);
  const before = { unlocked: 1, finished: [] };
  markWon(before, 0, LEVELS);
  if (!same(before, { unlocked: 1, finished: [] })) fail('markWon changed the progress it was given');
}

// --- 4. a save comes back as it went in -------------------------------------
{
  console.log('\n4. round trip');
  const store = memory();
  const p = { unlocked: 3, finished: [1, 3] };
  if (saveProgress(store, p) !== true) fail('saving to working storage did not return true');
  if (!same(loadProgress(store, LEVELS), p)) fail(`saved ${JSON.stringify(p)}, loaded ${JSON.stringify(loadProgress(store, LEVELS))}`);
  console.log(`   stored under ${SAVE_KEY}: ${store.m.get(SAVE_KEY)}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL SAVE CHECKS PASSED');
process.exit(failures ? 1 : 0);
