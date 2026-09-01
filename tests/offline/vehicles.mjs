// The vehicles: are their specs sane, do they all drive without wedging or
// escaping the town, and — the one that matters — can swapping between them
// ever leave you embedded in a wall?
//
// Switching vehicle changes its SIZE, which is the whole reason this needs
// testing: turning a hatchback into a bus while parked in a tight gap is
// exactly the kind of thing that quietly puts a player inside a building.
const { World, T }                   = await import('../../js/world.js');
const { Car, createCars, vehicleByIndex } = await import('../../js/car.js');
const { createNpcs }                 = await import('../../js/npc.js');
const { Menu }                       = await import('../../js/ui.js');
const { CONFIG }                     = await import('../../js/config.js');

const world = new World();
const cars = createCars(world);
const npcs = createNpcs(world);

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- 1. the specs themselves ----------------------------------------------
console.log('');
console.log('1. ' + CONFIG.VEHICLES.length + ' vehicles');

const ids = CONFIG.VEHICLES.map((v) => v.id);
check('every id is unique', new Set(ids).size === ids.length, ids.join(', '));
check('at least one is free to start with', CONFIG.VEHICLES.some((v) => v.price === 0));

let lastPaid = -1, ascending = true;
for (const v of CONFIG.VEHICLES) {
  if (v.price === 0) continue;
  if (v.price <= lastPaid) ascending = false;
  lastPaid = v.price;
}
check('prices climb as you go along the row', ascending,
      CONFIG.VEHICLES.map((v) => v.price).join(' -> '));

for (const v of CONFIG.VEHICLES) {
  // A boat has no wheels, and neither does a helicopter, so `wheel` is 0 for
  // either and must be positive for anything that actually rolls.
  const sane = v.LENGTH > 20 && v.WIDTH > 15 && v.MAX_SPEED > 50 &&
               v.ACCEL > 50 && v.TURN_RATE > 0.5 &&
               ((v.water || v.air) ? v.wheel === 0 : v.wheel > 0);
  check(v.id + ': the numbers are sane', sane,
        v.LENGTH + 'x' + v.WIDTH + ' speed ' + v.MAX_SPEED + ' turn ' + v.TURN_RATE);

  // A road is two 64px squares. Anything approaching that long could never
  // get round a corner.
  check(v.id + ': short enough to turn a corner', v.LENGTH < CONFIG.TILE * 2 - 10,
        v.LENGTH + 'px vs a ' + (CONFIG.TILE * 2) + 'px road');

  check(v.id + ': has a drawing shape', typeof v.shape === 'string' && v.shape.length > 0, v.shape);
}

// They must actually feel different, or the money buys a repaint.
const speeds = new Set(CONFIG.VEHICLES.map((v) => v.MAX_SPEED));
check('they do not all drive identically', speeds.size >= CONFIG.VEHICLES.length - 1,
      speeds.size + ' different top speeds');

// --- 2. shop pricing agrees with the specs --------------------------------
console.log('');
console.log('2. the shop');
for (let i = 0; i < CONFIG.VEHICLES.length; i++) {
  const v = CONFIG.VEHICLES[i];
  check(v.id + ': shop price matches its spec', Menu.priceOf('vehicle', i) === v.price,
        Menu.priceOf('vehicle', i) + ' vs ' + v.price);
}
const empty = { coins: 0, unlocked: { hat: [], shirt: [], car: [], vehicle: [] } };
for (let i = 0; i < CONFIG.VEHICLES.length; i++) {
  const free = CONFIG.VEHICLES[i].price === 0;
  check(CONFIG.VEHICLES[i].id + (free ? ': free from the start' : ': locked until bought'),
        Menu.isUnlocked('vehicle', i, empty) === free);
}
// The colour rows must not have been disturbed by adding a fourth row.
check('colour rows still have their free ones', Menu.priceOf('hat', 0) === 0 && Menu.priceOf('hat', 7) === CONFIG.SHOP.PRICE);

// --- 3. every vehicle can drive without wedging or escaping ---------------
console.log('');
console.log('3. driving each one hard');
const others = cars.slice(1);
for (let i = 0; i < CONFIG.VEHICLES.length; i++) {
  const v = CONFIG.VEHICLES[i];
  const car = new Car(world, world.spawn.x, world.spawn.y - 96, 0,
                      { body: '#FF6B6B', roof: '#E05252', type: v.id });

  if (v.water) {
    // A boat has to be tested on the river. Driven round the town square it
    // is aground from the first frame, and "wedged" would be the right
    // answer to the wrong question.
    // Clear of the moored boats as well as afloat: `others` now includes them,
    // and starting inside one would be reported as ending up inside scenery.
    const otherBoxes = others.map((c) => c.boundsBox());
    const afloat = world.sweepSpots((kind) => kind === T.WATER, 300, 0, car.half + 8, 2)
      .find((s) => !world.blocksBoat(s.x, s.y, car.half, car.half) &&
                   !world._overlaps(s.x, s.y, car.half, car.half, otherBoxes));
    if (!afloat) { check(v.id + ': somewhere to float', false, 'nowhere on the map'); continue; }
    car.x = afloat.x;
    car.y = afloat.y;
  } else {
    // Put it somewhere it definitely fits before starting.
    const start = world.findFreeSpot(car.x, car.y, car.half, [], 300);
    if (start) { car.x = start.x; car.y = start.y; }
  }

  let top = 0, stuck = 0, escaped = false, embedded = false;
  let prev = { x: car.x, y: car.y };

  for (let f = 0; f < 4000; f++) {
    const a = Math.sin(f * 0.013) * 3 + Math.cos(f * 0.041) * 2;
    const mag = f % 400 < 40 ? 0 : 1;
    car.update(1 / 60, { x: Math.cos(a), y: Math.sin(a), mag }, others);

    top = Math.max(top, Math.abs(car.speed));
    if (!Number.isFinite(car.x) || !Number.isFinite(car.y)) { embedded = true; break; }
    if (car.x < 0 || car.y < 0 || car.x > world.width || car.y > world.height) { escaped = true; break; }
    // A helicopter is SUPPOSED to pass straight over another vehicle parked
    // beneath it — that is the entire feature — so this overlap check, which
    // exists to catch a grounded car wedging into one, does not apply to it.
    if (!v.air &&
        world._overlaps(car.x, car.y, car.half, car.half, others.map((c) => c.boundsBox()))) {
      embedded = true; break;
    }

    const moved = Math.hypot(car.x - prev.x, car.y - prev.y);
    if (mag > 0 && moved < 0.01) stuck++; else stuck = 0;
    if (stuck > 240) break;
    prev = { x: car.x, y: car.y };
  }

  check(v.id + ': never escapes or ends up inside scenery', !escaped && !embedded);
  check(v.id + ': never wedges for 4 seconds at full throttle', stuck <= 240, stuck + ' stuck frames');
  check(v.id + ': respects its own top speed', top <= v.MAX_SPEED + 1,
        top.toFixed(0) + ' vs ' + v.MAX_SPEED);
}

// --- 4. swapping vehicles, everywhere, must never wall you in ------------
console.log('');
console.log('4. swapping vehicle in a thousand places');

// Collect a spread of places a player could plausibly be parked.
// Only places clear of the already-parked cars. sweepSpots knows about the
// scenery but not about traffic, and starting a test vehicle on top of a
// parked one would fail the check below for a reason that has nothing to do
// with swapping vehicles.
const parked = cars.map((c) => c.boundsBox());
const spots = world
  .sweepSpots((k) => k === T.ROAD || k === T.SIDEWALK, 90, 0.30, CONFIG.CAR.HITBOX_MAX / 2, 1)
  .filter((s) => !world._overlaps(s.x, s.y, CONFIG.CAR.HITBOX_MAX / 2, CONFIG.CAR.HITBOX_MAX / 2, parked));
check('found plenty of places to try', spots.length > 50, spots.length + ' spots clear of parked cars');

let embeddedAfterSwap = 0, refused = 0, nudged = 0, tried = 0;
for (const spot of spots) {
  const car = new Car(world, spot.x, spot.y, 0, { body: '#fff', roof: '#fff', type: 'car' });

  // Walk it up through every vehicle, largest included, from this spot.
  for (let i = 0; i < CONFIG.VEHICLES.length; i++) {
    tried++;
    const wasX = car.x, wasY = car.y;
    const ok = car.setVehicle(i, cars);

    if (!ok) {
      refused++;
      // A refusal must leave it exactly as it was, not half-changed.
      if (car.x !== wasX || car.y !== wasY) embeddedAfterSwap++;
      continue;
    }
    if (car.x !== wasX || car.y !== wasY) nudged++;

    if (world._overlaps(car.x, car.y, car.half, car.half, parked)) {
      embeddedAfterSwap++;
    }
  }
}
check('swapping never leaves a vehicle inside scenery', embeddedAfterSwap === 0,
      embeddedAfterSwap + ' of ' + tried + ' swaps went wrong');
console.log('        (' + nudged + ' needed nudging aside, ' + refused + ' were refused outright)');

// Refusing should be rare — if it happens often the shop feels broken.
check('refusals are rare', refused / tried < 0.05,
      (100 * refused / tried).toFixed(1) + '% of swaps refused');

// --- 4b. the tight-spot case, forced -------------------------------------
//
// The sweep above never actually needed the nudge, which would leave that
// safety path completely untested. So find somewhere a small car fits and a
// bus does not, and swap there on purpose.
console.log('');
console.log('4b. swapping where the big one does not fit');

const carHalf = CONFIG.CAR.HITBOX_MIN / 2;
const busIndex = CONFIG.VEHICLES.findIndex((v) => v.id === 'bus');
const busSpec = CONFIG.VEHICLES[busIndex];
const busHalf = Math.max(CONFIG.CAR.HITBOX_MIN,
  Math.min(CONFIG.CAR.HITBOX_MAX, busSpec.WIDTH * CONFIG.CAR.HITBOX_FROM_WIDTH)) / 2;

const tight = [];
for (let y = 40; y < world.height - 40 && tight.length < 40; y += 13) {
  for (let x = 40; x < world.width - 40 && tight.length < 40; x += 13) {
    if (world._overlaps(x, y, carHalf, carHalf, parked)) continue;      // car fits
    if (!world._overlaps(x, y, busHalf, busHalf, parked)) continue;     // bus does not
    tight.push({ x, y });
  }
}
check('found tight spots to test', tight.length > 0, tight.length + ' spots');

let handled = 0, wedged = 0, movedAway = 0, saidNo = 0;
for (const spot of tight) {
  const car = new Car(world, spot.x, spot.y, 0, { body: '#fff', roof: '#fff', type: 'car' });
  const ok = car.setVehicle(busIndex, cars);

  if (ok) {
    movedAway++;
    if (world._overlaps(car.x, car.y, car.half, car.half, parked)) wedged++;
  } else {
    saidNo++;
    // A refusal must leave it exactly as it was — still a car, still here.
    if (car.spec.id !== 'car' || car.x !== spot.x || car.y !== spot.y) wedged++;
  }
  handled++;
}
check('a bus never ends up inside a wall in a tight spot', wedged === 0,
      wedged + ' of ' + handled + ' went wrong');
check('the safety path actually ran', movedAway + saidNo === handled,
      movedAway + ' nudged aside, ' + saidNo + ' refused');

// --- 5. drawing every vehicle ---------------------------------------------
let calls = 0;
const ctx = new Proxy({}, {
  get(_, p) {
    if (p === 'canvas') return { width: 844, height: 390 };
    return (...a) => {
      calls++;
      for (const val of a) {
        if (typeof val === 'number' && !Number.isFinite(val)) throw new Error('NaN to ctx.' + String(p));
      }
    };
  },
  set() { return true; },
});
for (let i = 0; i < CONFIG.VEHICLES.length; i++) {
  const car = new Car(world, 500, 500, 0.7, { body: '#FF6B6B', roof: '#E05252', type: vehicleByIndex(i).id });
  car.draw(ctx);
}
console.log('');
console.log('5. drawing every vehicle: ' + calls + ' canvas calls, no NaN');

// --- 6. what the other players are told you are driving -------------------
//
// The wire carries a position in CONFIG.VEHICLES, and everyone else builds a
// stand-in from it with setVehicleVisual. Send the wrong number and they see
// the wrong vehicle — which is exactly what happened to boats: a chosen boat
// lives in save.boat, kept apart from save.vehicle on purpose, so sending
// save.vehicle while out on the river showed everybody a hatchback sailing
// down the middle of it.
console.log('');
console.log('6. what other players are told you are driving');

const { vehicleIndexOf } = await import('../../js/car.js');

check('every vehicle can be found by its own id',
  CONFIG.VEHICLES.every((v, i) => vehicleIndexOf(v.id) === i),
  CONFIG.VEHICLES.filter((v, i) => vehicleIndexOf(v.id) !== i).map((v) => v.id).join(', '));

check('an unknown id falls back to the ordinary car rather than breaking',
  vehicleIndexOf('nonsense') === 0);

// The real thing. Take each vehicle, do to a stand-in exactly what
// updateGhosts does with the number off the wire, and see what floats.
const ghost = new Car(world, 500, 500, 0, { body: '#FFF', roof: '#EEE', type: 'car' });
const wrong = CONFIG.VEHICLES.filter((v) => {
  ghost.setVehicleVisual(vehicleIndexOf(v.id));
  return ghost.water !== !!v.water;
});
check('a boat is shown as a boat and a car as a car',
  wrong.length === 0,
  wrong.map((v) => v.id).join(', '));

// And the bug itself, stated as a rule: the number sent for a boat must never
// be one that describes something with wheels.
const boats = CONFIG.VEHICLES.filter((v) => v.water);
check(`all ${boats.length} boats send an index that really is a boat`,
  boats.every((b) => CONFIG.VEHICLES[vehicleIndexOf(b.id)].water === true),
  boats.filter((b) => !CONFIG.VEHICLES[vehicleIndexOf(b.id)].water).map((b) => b.id).join(', '));

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL VEHICLE CHECKS PASSED');
process.exit(fail ? 1 : 0);
