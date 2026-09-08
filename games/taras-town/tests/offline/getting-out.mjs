// Getting out of a vehicle must never leave you stuck.
//
// "Stuck" is not the same as "overlapping something" — what matters to a
// player is whether they can WALK. So every check here puts the player where
// getting out would put them and then tries to move in eight directions: if
// none of them move at all, that is a trap, however tidy the position looked.
const { World, T }        = await import('../../js/world.js');
const { Car, createCars } = await import('../../js/car.js');
const { createNpcs }      = await import('../../js/npc.js');
const { Player }          = await import('../../js/player.js');
const { CONFIG }          = await import('../../js/config.js');

const world = new World();
const cars = createCars(world);
const npcs = createNpcs(world);
const half = CONFIG.PLAYER.HITBOX / 2;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

/**
 * Everything solid once you are out on foot — INCLUDING the vehicle you just
 * stepped out of. That is the whole point: while driving it is not in your
 * way, and the instant you are out it is.
 */
const blockersFor = (extraCar) => [
  ...cars.map((c) => c.boundsBox()),
  ...npcs.map((n) => n.boundsBox()),
  ...(extraCar ? [extraCar.boundsBox()] : []),
];

/** Can somebody standing here actually walk anywhere? */
function canWalk(x, y, blockers) {
  const p = new Player(world, x, y);
  for (let k = 0; k < 8; k++) {
    p.x = x; p.y = y;
    const a = (k / 8) * Math.PI * 2;
    // A good half second of walking, so a single blocked frame is not
    // mistaken for being trapped.
    for (let f = 0; f < 30; f++) {
      p.update(1 / 60, { x: Math.cos(a), y: Math.sin(a), mag: 1 }, blockers);
    }
    if (Math.hypot(p.x - x, p.y - y) > 12) return true;
  }
  return false;
}

// --- 1. getting out of every parked vehicle in town ------------------------
console.log('');
console.log('1. getting out of the vehicles parked around town');

let trapped = 0, overlapping = 0, refused = 0;
for (const car of cars) {
  const spot = car.exitSpot([...cars.filter((c) => c !== car), ...npcs]);
  const blockers = blockersFor(car);

  // null means "nowhere to stand, stay in the vehicle". Safe, but no vehicle
  // parked around town should ever be that badly boxed in.
  if (spot === null) { refused++; continue; }
  if (world._overlaps(spot.x, spot.y, half, half, blockers)) overlapping++;
  if (!canWalk(spot.x, spot.y, blockers)) trapped++;
}
check('nobody is left standing inside something', overlapping === 0, overlapping + ' of ' + cars.length);
check('nobody is left unable to walk', trapped === 0, trapped + ' of ' + cars.length);
check('and getting out is never refused outright', refused === 0, refused + ' of ' + cars.length);

// --- 2. every vehicle, everywhere, at every angle -------------------------
//
// The long ones matter most: stepping out "behind" a bus is a very different
// distance from stepping out behind a hatchback.
console.log('');
console.log('2. every vehicle, in hundreds of places, at every angle');

const spots = world
  .sweepSpots((k) => k === T.ROAD || k === T.SIDEWALK, 110, 0.30, CONFIG.CAR.HITBOX_MAX / 2, 1)
  .filter((s) => !world._overlaps(s.x, s.y, CONFIG.CAR.HITBOX_MAX / 2, CONFIG.CAR.HITBOX_MAX / 2,
                                 cars.map((c) => c.boundsBox())));
check('found plenty of places to park', spots.length > 40, spots.length + ' spots');

const worst = {};
let tried = 0, stuckTotal = 0, insideTotal = 0, refusedTotal = 0;

for (const v of CONFIG.VEHICLES) {
  let stuck = 0, inside = 0, count = 0;

  for (const spot of spots) {
    for (let a = 0; a < 4; a++) {
      const car = new Car(world, spot.x, spot.y, a * (Math.PI / 2),
                          { body: '#fff', roof: '#fff', type: v.id });
      // Only test from places this vehicle could actually have been left.
      if (world._overlaps(car.x, car.y, car.half, car.half, cars.map((c) => c.boundsBox()))) continue;

      count++; tried++;
      const out = car.exitSpot([...cars, ...npcs]);
      const blockers = blockersFor(car);

      if (out === null) { refusedTotal++; continue; }
      if (world._overlaps(out.x, out.y, half, half, blockers)) { inside++; insideTotal++; }
      else if (!canWalk(out.x, out.y, blockers)) { stuck++; stuckTotal++; }
    }
  }
  worst[v.id] = { stuck, inside, count };
}

for (const [id, r] of Object.entries(worst)) {
  check(id + ': never left standing inside anything', r.inside === 0, r.inside + ' of ' + r.count);
  check(id + ': never left unable to walk', r.stuck === 0, r.stuck + ' of ' + r.count);
}

console.log('');
console.log('   ' + tried + ' ways out tried, ' + insideTotal + ' inside something, '
            + stuckTotal + ' unable to move, ' + refusedTotal + ' refused');
// Refusing is safe, but refusing often would mean getting out felt broken.
check('getting out almost never has to be refused', refusedTotal <= tried * 0.01,
      refusedTotal + ' of ' + tried);

// --- 3. the awkward case: boxed in ----------------------------------------
//
// Somewhere a vehicle fits but there is very little room around it. Getting
// out there must still work, or refuse in a way that leaves the player safely
// where they were rather than inside a wall.
console.log('');
console.log('3. parked somewhere tight');

const tight = [];
for (let y = 40; y < world.height - 40 && tight.length < 30; y += 11) {
  for (let x = 40; x < world.width - 40 && tight.length < 30; x += 11) {
    const car = new Car(world, x, y, 0, { body: '#fff', roof: '#fff', type: 'car' });
    if (world._overlaps(x, y, car.half, car.half, [])) continue;
    // Little room to the sides: exactly where a naive "step to the left" fails.
    const boxedLeft = world._overlaps(x, y - 46, half, half, []);
    const boxedRight = world._overlaps(x, y + 46, half, half, []);
    if (boxedLeft && boxedRight) tight.push({ x, y });
  }
}
check('found tight parking spots', tight.length > 0, tight.length + ' spots');

let tightStuck = 0, tightRefused = 0;
for (const spot of tight) {
  const car = new Car(world, spot.x, spot.y, 0, { body: '#fff', roof: '#fff', type: 'car' });
  const out = car.exitSpot([...cars, ...npcs]);
  const blockers = blockersFor(car);
  // Somewhere this tight, "you can't get out here" is a perfectly good answer
  // — the player simply drives on. Being put down inside a wall is not.
  if (out === null) { tightRefused++; continue; }
  if (world._overlaps(out.x, out.y, half, half, blockers) || !canWalk(out.x, out.y, blockers)) tightStuck++;
}
check('a tight spot never leaves you stuck', tightStuck === 0, tightStuck + ' of ' + tight.length);
check('and mostly still lets you out', tightRefused < tight.length,
      tightRefused + ' of ' + tight.length + ' refused');

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL GETTING-OUT CHECKS PASSED');
process.exit(fail ? 1 : 0);
