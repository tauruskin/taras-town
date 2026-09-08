// Milestone 5: coins lying around town, and buying colours with them.
const { World, T }   = await import('../../js/world.js');
const { createCars } = await import('../../js/car.js');
const { createNpcs } = await import('../../js/npc.js');
const { Coins }      = await import('../../js/coins.js');
const { Menu }       = await import('../../js/ui.js');
const { CONFIG }     = await import('../../js/config.js');

const world = new World();
const cars = createCars(world);
const npcs = createNpcs(world);
const coins = new Coins(world);
const half = CONFIG.PLAYER.HITBOX / 2;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- reachability from spawn ----------------------------------------------
const blockers = [...cars.map(c => c.boundsBox()), ...npcs.map(n => n.boundsBox())];
const STEP = 8;
const W = Math.floor(world.width / STEP), H = Math.floor(world.height / STEP);
const free = new Uint8Array(W * H);
for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
  const x = gx * STEP + STEP / 2, y = gy * STEP + STEP / 2;
  if (x < half || y < half || x > world.width - half || y > world.height - half) continue;
  if (!world._overlaps(x, y, half, half, blockers)) free[gy * W + gx] = 1;
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

// --- 1. where the coins are ------------------------------------------------
console.log('');
console.log('1. ' + coins.total + ' coins scattered');
check('there are plenty to find', coins.total >= 40, coins.total + ' coins');

let inScenery = 0, inWater = 0, unreachable = 0, tooClose = 0;
for (const c of coins.items) {
  if (world._overlaps(c.x, c.y, half, half)) inScenery++;
  if (world.grid[Math.floor(c.y / 64)][Math.floor(c.x / 64)] === T.WATER) inWater++;
  if (!reachableWithin(c.x, c.y, CONFIG.COIN.PICKUP_RADIUS)) unreachable++;
}
for (let i = 0; i < coins.items.length; i++) {
  for (let j = i + 1; j < coins.items.length; j++) {
    const a = coins.items[i], b = coins.items[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < CONFIG.COIN.SPACING - 0.01) tooClose++;
  }
}
check('none are inside scenery', inScenery === 0, inScenery + ' bad');
check('none are in the river', inWater === 0, inWater + ' bad');
check('every one can be reached from spawn', unreachable === 0, unreachable + ' unreachable');
check('none are bunched together', tooClose === 0, tooClose + ' pairs too close');

// Coins should appear on roads too, so there is something to collect driving.
const onRoad = coins.items.filter(c => world.grid[Math.floor(c.y / 64)][Math.floor(c.x / 64)] === T.ROAD).length;
check('some lie on the road, for collecting while driving', onRoad > 5, onRoad + ' on roads');

// --- 2. picking them up ----------------------------------------------------
console.log('');
console.log('2. picking them up');
const first = coins.items[0];
check('standing far away picks up nothing', coins.update(1 / 60, first.x + 500, first.y) === 0);
check('standing on one picks it up', coins.update(1 / 60, first.x, first.y) === 1);
check('it is gone once taken', first.taken === true);
check('it cannot be picked up twice', coins.update(1 / 60, first.x, first.y) === 0);

// Wait out the respawn.
let waited = 0;
while (first.taken && waited < CONFIG.COIN.RESPAWN_SECONDS + 5) { coins.update(0.5, 0, 0); waited += 0.5; }
check('it comes back after a while', first.taken === false, 'after ' + waited + 's');
check('and can be picked up again', coins.update(1 / 60, first.x, first.y) === 1);

// Driving through a line of them should collect several.
const fresh = new Coins(world);
let run = 0;
for (const c of fresh.items.slice(0, 12)) run += fresh.update(1 / 60, c.x, c.y);
check('a dozen different coins all collect', run === 12, run + ' collected');

// Reopening the game while standing on a coin must not hand out a free one.
const onACoin = new Coins(world);
const spot = onACoin.items[3];
onACoin.clearAtStart(spot.x, spot.y);
check('a coin you log off standing on is not handed to you on return',
      onACoin.update(1 / 60, spot.x, spot.y) === 0);
check('and it comes back later like any other', spot.taken === true);

// --- 3. the shop ------------------------------------------------------------
console.log('');
console.log('3. the shop');
const save = { coins: 0, hat: 0, shirt: 0, car: 0, unlocked: { hat: [], shirt: [], car: [] } };
const FREE = CONFIG.SHOP.FREE_PER_ROW;

for (const row of ['hat', 'shirt', 'car']) {
  let freeOk = true, lockedOk = true;
  for (let i = 0; i < FREE; i++) if (!Menu.isUnlocked(row, i, save)) freeOk = false;
  for (let i = FREE; i < 8; i++) if (Menu.isUnlocked(row, i, save)) lockedOk = false;
  check(row + ': the first ' + FREE + ' are free', freeOk);
  check(row + ': the rest start locked', lockedOk);
}

save.unlocked.hat.push(5);
check('a bought colour counts as unlocked', Menu.isUnlocked('hat', 5, save));
check('its neighbours are still locked', !Menu.isUnlocked('hat', 6, save));
check('buying a hat does not unlock the same shirt', !Menu.isUnlocked('shirt', 5, save));

// --- 4. a broken save must not break the shop -----------------------------
console.log('');
console.log('4. defending against a broken save');
const nasty = [
  { coins: 5 },                                             // no unlocked at all
  { coins: 5, unlocked: null },
  { coins: 5, unlocked: { hat: 'not an array' } },
  { coins: 5, unlocked: { hat: [1, 'x', -4, null, 7] } },
];
for (const bad of nasty) {
  let threw = false, result = null;
  try { result = Menu.isUnlocked('hat', 7, bad); } catch (e) { threw = true; }
  check('survives ' + JSON.stringify(bad.unlocked), !threw, threw ? 'THREW' : 'returned ' + result);
}

// --- 5. drawing -------------------------------------------------------------
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
coins.draw(ctx, { x: 0, y: 0, w: 3072, h: 2304 }, 3.1);
const menu = new Menu();
menu.draw(ctx, 844, 390, { hat: 0, shirt: 0, car: 0 }, save, { id: 'hat:6', amount: 0.3 });
menu.draw(ctx, 844, 390, { hat: 0, shirt: 0, car: 0 }, { ...save, coins: 99 }, null);
console.log('');
console.log('5. drawing: ' + calls + ' canvas calls, no NaN');

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL SHOP CHECKS PASSED');
process.exit(fail ? 1 : 0);
