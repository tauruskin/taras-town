// Milestone 4 logic, all four job kinds: are the neighbours standing somewhere
// sensible, is every destination walkable AND reachable AND open enough, does
// the job cycle work, and does a race tick its checkpoints off in order?
const { World, T }   = await import('../../js/world.js');
const { createCars } = await import('../../js/car.js');
const { createNpcs } = await import('../../js/npc.js');
const { Missions }   = await import('../../js/missions.js');
const { CONFIG }     = await import('../../js/config.js');

const world = new World();
const cars = createCars(world);
const npcs = createNpcs(world);
const missions = new Missions(world);
const half = CONFIG.PLAYER.HITBOX / 2;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- reachability map from spawn, with cars and people as obstacles --------
const carBoxes = [...cars.map(c => c.boundsBox()), ...npcs.map(n => n.boundsBox())];
const STEP = 8;
const W = Math.floor(world.width / STEP), H = Math.floor(world.height / STEP);
const free = new Uint8Array(W * H);
for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
  const x = gx * STEP + STEP / 2, y = gy * STEP + STEP / 2;
  if (x < half || y < half || x > world.width - half || y > world.height - half) continue;
  if (!world._overlaps(x, y, half, half, carBoxes)) free[gy * W + gx] = 1;
}
const seen = new Uint8Array(W * H);
const s0 = Math.floor(world.spawn.y / STEP) * W + Math.floor(world.spawn.x / STEP);
const q = [s0]; seen[s0] = 1;
while (q.length) {
  const i = q.pop(), gx = i % W, gy = (i / W) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = gx + dx, ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const ni = ny * W + nx;
    if (seen[ni] || !free[ni]) continue;
    seen[ni] = 1; q.push(ni);
  }
}
const reachableWithin = (x, y, radius) => {
  const R = Math.ceil(radius / STEP);
  const gx = Math.round(x / STEP), gy = Math.round(y / STEP);
  for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
    if (Math.hypot(ox, oy) * STEP > radius) continue;
    const ni = (gy + oy) * W + (gx + ox);
    if (ni >= 0 && ni < seen.length && seen[ni]) return true;
  }
  return false;
};
const openPct = (x, y) => {
  let open = 0;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    let clear = true;
    for (let d = 14; d <= 84; d += 14) {
      if (world._overlaps(x + Math.cos(a) * d, y + Math.sin(a) * d, half, half)) { clear = false; break; }
    }
    if (clear) open++;
  }
  return open / 16;
};

// --- 1. the neighbours -----------------------------------------------------
console.log('');
console.log('1. neighbours: ' + npcs.length);
const wanted = ['pizza', 'toy', 'ride', 'race'];
check('one neighbour per job kind', wanted.every(k => npcs.some(n => n.mission === k)),
      npcs.map(n => n.mission).join(', '));
npcs.forEach((n) => {
  const kind = world.grid[Math.floor(n.y / 64)][Math.floor(n.x / 64)];
  const name = Object.keys(T).find(k => T[k] === kind);
  const others = [...cars.map(c => c.boundsBox()), ...npcs.filter(o => o !== n).map(o => o.boundsBox())];
  check(n.mission + ' neighbour is standing somewhere clear',
        !world._overlaps(n.x, n.y, half, half, others), name);
  check(n.mission + ' neighbour is not in the road', kind !== T.ROAD, name);
  check(n.mission + ' neighbour can be walked up to',
        reachableWithin(n.x, n.y, CONFIG.MISSION.OFFER_RADIUS));
});

// --- 2. every destination list --------------------------------------------
console.log('');
console.log('2. destinations');
for (const kind of ['pizza', 'toy', 'ride']) {
  const list = missions.spots[kind];
  check(kind + ' has somewhere to send you', list.length > 0, list.length + ' spots');
  let worstOpen = 1, allReachable = true;
  for (const s of list) {
    worstOpen = Math.min(worstOpen, openPct(s.x, s.y));
    if (!reachableWithin(s.x, s.y, CONFIG.MISSION.ARRIVE_RADIUS)) allReachable = false;
  }
  check(kind + ' destinations are all reachable', allReachable);
  check(kind + ' destinations are all open enough', worstOpen >= 0.45,
        'worst ' + (worstOpen * 100).toFixed(0) + '%');
}
const stops = missions.raceStops;
check('there are enough checkpoints for a race', stops.length >= CONFIG.MISSION.RACE_CHECKPOINTS,
      stops.length + ' road points');
check('every checkpoint is on a road',
      stops.every(s => world.grid[Math.floor(s.y / 64)][Math.floor(s.x / 64)] === T.ROAD));
check('every checkpoint is reachable',
      stops.every(s => reachableWithin(s.x, s.y, CONFIG.MISSION.RACE_ARRIVE_RADIUS)));

// --- 3. the job cycle, for each kind --------------------------------------
console.log('');
console.log('3. the job cycle');
for (const kind of wanted) {
  const npc = npcs.find(n => n.mission === kind);
  missions.active = null;

  check(kind + ': offered when nothing is running', missions.canOffer(npc));
  check(kind + ': starts', missions.start(npc));
  check(kind + ': no second job while one runs', !missions.canOffer(npc));
  check(kind + ': the giver is marked busy', missions.isBusy(npc));

  const steps = missions.active.targets.length;
  const expected = kind === 'race' ? CONFIG.MISSION.RACE_CHECKPOINTS : 1;
  check(kind + ': has ' + expected + ' place(s) to reach', steps === expected, String(steps));

  // Standing far away must do nothing.
  const first = missions.target;
  check(kind + ': far away does not finish it', missions.update(first.x + 900, first.y) === null);

  // Walk each step in turn.
  let result = null;
  for (let i = 0; i < steps; i++) {
    const t = missions.target;
    result = missions.update(t.x + 5, t.y + 5);
    if (i < steps - 1) {
      check(kind + ': step ' + (i + 1) + ' ticks off without finishing',
            result !== null && result.kind === 'checkpoint');
    }
  }
  check(kind + ': finishes on the last one', result !== null && result.kind === 'done');
  check(kind + ': pays the right amount',
        result.job.reward === (kind === 'race' ? CONFIG.MISSION.RACE_REWARD : CONFIG.MISSION.REWARD),
        result.job.reward + ' coins');
  check(kind + ': offered again afterwards', missions.canOffer(npc));
}

// --- 4. variety and course shape ------------------------------------------
console.log('');
console.log('4. variety');
for (const kind of ['pizza', 'toy', 'ride']) {
  const npc = npcs.find(n => n.mission === kind);
  if (missions.spots[kind].length < 2) {
    console.log('  --    ' + kind + ': only one destination, nothing to vary');
    continue;
  }
  let repeats = 0, prev = null;
  for (let i = 0; i < 80; i++) {
    missions.active = null;
    missions.start(npc);
    const key = missions.target.x + ',' + missions.target.y;
    if (key === prev) repeats++;
    prev = key;
  }
  check(kind + ': never sends you straight back to the same place', repeats === 0, repeats + ' repeats in 80');
}

const racer = npcs.find(n => n.mission === 'race');
let worstLeg = 0;
let worstFirstLeg = 0;
let duplicatesInACourse = 0;
const distinctCourses = new Set();
for (let i = 0; i < 60; i++) {
  missions.active = null;
  missions.start(racer);
  const t = missions.active.targets;
  distinctCourses.add(t.map(s => s.x + ',' + s.y).join('|'));
  if (new Set(t.map(s => s.x + ',' + s.y)).size !== t.length) duplicatesInACourse++;
  worstFirstLeg = Math.max(worstFirstLeg, Math.hypot(t[0].x - racer.x, t[0].y - racer.y));
  for (let k = 1; k < t.length; k++) {
    worstLeg = Math.max(worstLeg, Math.hypot(t[k].x - t[k - 1].x, t[k].y - t[k - 1].y));
  }
}
check('race: no checkpoint repeats within a course', duplicatesInACourse === 0, duplicatesInACourse + ' bad courses');
check('race: courses vary between runs', distinctCourses.size > 3, distinctCourses.size + ' different courses in 60');
// The town is ~3800px corner to corner. A leg much longer than half that would
// mean the nearest-neighbour ordering is not actually ordering anything.
// A race must not open with a long haul across town before anything happens.
check('race: starts near the person offering it', worstFirstLeg < 900, 'longest first leg ' + worstFirstLeg.toFixed(0) + 'px');
check('race: no wild zig-zag between checkpoints', worstLeg < 2600, 'longest leg ' + worstLeg.toFixed(0) + 'px');

// --- 5. drawing ------------------------------------------------------------
let calls = 0;
const ctx = new Proxy({}, {
  get(_, p) {
    if (p === 'canvas') return { width: 844, height: 390 };
    return (...a) => {
      calls++;
      for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('NaN to ctx.' + String(p));
    };
  },
  set() { return true; },
});
for (const kind of wanted) {
  missions.active = null;
  missions.start(npcs.find(n => n.mission === kind));
  missions.drawTarget(ctx, 2.5);
  missions.drawPassenger(ctx, { x: 100, y: 100 });
}
for (const n of npcs) { n.drawGlow(ctx, 2.5); n.draw(ctx, 2.5); n.drawBadge(ctx, 2.5); }
console.log('');
console.log('5. drawing: ' + calls + ' canvas calls, no NaN');


// --- neighbours are solid -------------------------------------------------
//
// You cannot walk through a person. This used to be checked in the browser by
// steering into somebody and reading the distance, which depended on choosing
// a clear approach on a map that keeps changing. Here it is just physics, so
// every neighbour can be pushed at from every side.
console.log('');
console.log('neighbours are solid');

const { Player: SolidPlayer } = await import('../../js/player.js');
let walkedThrough = 0;
let tried = 0;

for (const npc of npcs) {
  const box = npc.boundsBox();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const from = { x: npc.x - dx * 90, y: npc.y - dy * 90 };
    if (world._overlaps(from.x, from.y, 11, 11, [box])) continue;

    tried++;
    const p = new SolidPlayer(world, from.x, from.y);
    for (let i = 0; i < 90; i++) p.update(1 / 60, { x: dx, y: dy, mag: 1 }, [box]);

    // Through them means out the far side: past the middle, still going.
    const past = (p.x - npc.x) * dx + (p.y - npc.y) * dy;
    if (past > 0) walkedThrough++;
  }
}
check('nobody can be walked through', walkedThrough === 0,
      walkedThrough + ' of ' + tried + ' approaches went straight through');

// The control, without which the check above is worthless: a player who never
// moves at all would also "never walk through anybody". Run the identical
// simulation with the neighbour NOT treated as solid, and it must pass through
// every time — that is what proves the walking, and the measurement, work.
let passedThroughWhenAllowed = 0;
let controlTried = 0;
for (const npc of npcs) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const from = { x: npc.x - dx * 90, y: npc.y - dy * 90 };
    if (world._overlaps(from.x, from.y, 11, 11, [npc.boundsBox()])) continue;

    controlTried++;
    const p = new SolidPlayer(world, from.x, from.y);
    for (let i = 0; i < 90; i++) p.update(1 / 60, { x: dx, y: dy, mag: 1 }, []);
    if ((p.x - npc.x) * dx + (p.y - npc.y) * dy > 0) passedThroughWhenAllowed++;
  }
}
check('and the same walk DOES go through when they are not solid',
      passedThroughWhenAllowed > controlTried * 0.6,
      passedThroughWhenAllowed + ' of ' + controlTried);

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL JOB CHECKS PASSED');
process.exit(fail ? 1 : 0);
