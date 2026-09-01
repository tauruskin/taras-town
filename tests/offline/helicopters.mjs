// Helicopters: the vehicle, where the four of them stand, and — the part that
// matters — that he can never land somewhere he cannot get out of.
const { CONFIG } = await import('../../js/config.js');

let fail = 0;
const check = (l, ok, d) => {
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (!ok && d ? ': ' + d : ''));
};

// --- the vehicle ----------------------------------------------------------
console.log('\nthe vehicle');

const heli = CONFIG.VEHICLES.find((v) => v.id === 'helicopter');
check('there is a helicopter in the vehicle list', !!heli);

if (heli) {
  check('it is marked as an air vehicle', heli.air === true);
  check('it is not also a boat', !heli.water);
  check('it is the most expensive thing in the game',
    CONFIG.VEHICLES.every((v) => v.id === 'helicopter' || v.price < heli.price),
    'something else costs as much or more');
  check('it costs 1000', heli.price === 1000, String(heli.price));

  // It turns on the spot. A bus cannot; a helicopter must, or hovering and
  // looking around is impossible.
  check('it can turn while barely moving', heli.TURN_MIN >= 0.8,
    'TURN_MIN is ' + heli.TURN_MIN);
}

// --- the save slot --------------------------------------------------------
console.log('\nthe save');
const { defaultSaveForTests } = await import('../../js/save.js');
const fresh = defaultSaveForTests();
check('a new save owns no helicopter', fresh.heli === null);
check('and the slot is separate from the car and the boat',
  'heli' in fresh && 'boat' in fresh && 'vehicle' in fresh,
  'buying a helicopter must not turn the car at the kerb into one');

// --- where the four of them stand ----------------------------------------
const { World, T } = await import('../../js/world.js');
const { createCars } = await import('../../js/car.js');
console.log('\nwhere they stand');

const world = new World();
const all = createCars(world);
const helis = all.filter((c) => c.air);

check(`there are ${CONFIG.HELI.COUNT} of them`,
  helis.length === CONFIG.HELI.COUNT, String(helis.length));

check('none is standing in the water',
  helis.every((c) => !world.isWaterAt(c.x, c.y)),
  'a helicopter is parked in the river');

check('none is standing inside anything solid',
  helis.every((c) => !world._overlaps(c.x, c.y, c.half, c.half)),
  'a helicopter is inside a building or a tree');

check('they are spread across the town',
  helis.every((a, i) => helis.every((b, j) =>
    i === j || Math.hypot(a.x - b.x, a.y - b.y) >= CONFIG.HELI.SEPARATION * 0.9)),
  'two of them are practically next to each other');

// The whole point of them being visible from the first load is that he can
// walk up and look at one long before he can afford it.
check('every one can be walked up to', helis.every((c) => {
  const half = CONFIG.PLAYER.HITBOX / 2;
  for (let a = 0; a < 24; a++) {
    for (const rad of [60, 80, 100]) {
      if (rad > CONFIG.CAR.ENTER_RADIUS) continue;
      const x = c.x + Math.cos((a / 24) * Math.PI * 2) * rad;
      const y = c.y + Math.sin((a / 24) * Math.PI * 2) * rad;
      if (!world._overlaps(x, y, half, half)) return true;
    }
  }
  return false;
}), 'a helicopter cannot be reached on foot');

// The one that matters most, and the reason a mainland map exists at all.
check('every one can be walked to without swimming',
  helis.every((c) => world.onMainland(c.x, c.y)),
  'a helicopter is across the water -- and a helicopter is the thing that' +
  ' makes water easy, so needing to swim to reach one is backwards');

check('placement is deterministic',
  JSON.stringify(createCars(new World()).filter((c) => c.air).map((c) => [c.x, c.y])) ===
  JSON.stringify(helis.map((c) => [c.x, c.y])),
  'two runs put the helicopters in different places');

// --- drawing ----------------------------------------------------------
console.log('\ndrawing');

let calls = 0;
const ctx = new Proxy({}, {
  get(_, prop) {
    if (prop === 'canvas') return { width: 800, height: 460 };
    return (...args) => {
      calls++;
      for (const a of args) {
        if (typeof a === 'number' && !Number.isFinite(a)) {
          throw new Error(`Non-finite number passed to ctx.${String(prop)}: ${args}`);
        }
      }
    };
  },
  set() { return true; },
});

let drew = 0;
for (const c of helis) {
  c.draw(ctx);
  c.angle += 1.1;      // rotors and a body at a few different headings
  c.draw(ctx);
  drew++;
}
check(`drew all ${drew} helicopters with no NaN (${calls} canvas calls)`,
  drew === helis.length);

// A helicopter must actually be DRAWN as one.
//
// The NaN check above cannot tell: a vehicle with no shape case of its own
// falls through to the plain car drawing, which emits perfectly finite
// numbers and passes happily.
//
// Comparing the whole trace against a car's does not work either -- that was
// tried, and it passes even with the shape case deleted, because the ROTOR is
// drawn separately and makes the two differ on its own. So this asks about
// the body specifically: the cabin and the nose window are ellipses, and no
// land vehicle in this game draws one. Delete the shape case and this goes
// red, which was verified by actually deleting it.
//
// If the cabin is ever redrawn as something other than an ellipse, this line
// needs updating -- it is standing in for "the body is not a car's body".
const countCalls = (type) => {
  const seen = {};
  const rec = new Proxy({}, {
    get(_, prop) {
      if (prop === 'canvas') return { width: 800, height: 460 };
      return () => { seen[String(prop)] = (seen[String(prop)] || 0) + 1; };
    },
    set() { return true; },
  });
  const { Car: C } = carModule;
  new C(world, 500, 500, 0, { body: '#fff', roof: '#eee', type }).draw(rec);
  return seen;
};
const carModule = await import('../../js/car.js');
const heliCalls = countCalls('helicopter');
const carCalls = countCalls('car');

check('a helicopter is drawn with its own shape, not the car one',
  (heliCalls.ellipse || 0) > 0 && (carCalls.ellipse || 0) === 0,
  `helicopter drew ${heliCalls.ellipse || 0} ellipses and a car drew ` +
  `${carCalls.ellipse || 0}; if those match, the helicopter is falling ` +
  'through to the car drawing');

// The rotor is drawn as lines over the top, and a car has none of those.
check('and its rotor is drawn over it',
  (heliCalls.stroke || 0) > 0 && (carCalls.stroke || 0) === 0,
  'no rotor strokes -- a parked helicopter with still blades reads as scenery');

// The shop preview is a different code path from the one in the world.
const { drawVehiclePicture } = await import('../../js/ui.js');
const heliIndex = CONFIG.VEHICLES.findIndex((v) => v.air);
drawVehiclePicture(ctx, heliIndex, 34, 0);
check('the shop can draw a helicopter too', true);

// --- flying ---------------------------------------------------------------
const { liftToward } = await import('../../js/flight.js');
console.log('\nflying');

// Nothing up there stops it. Fly a helicopter straight at a building at full
// speed and it should sail over the top.
const flier = helis[0];
const before = { x: flier.x, y: flier.y };
flier.angle = 0;
for (let i = 0; i < 240; i++) {
  flier.update(1 / 60, { x: 1, y: 0, mag: 1 }, all.filter((c) => c !== flier));
}
check('a helicopter is not stopped by the town',
  flier.x - before.x > 400,
  `only travelled ${(flier.x - before.x).toFixed(0)}px in 4 seconds`);

check('and it stays on the map',
  flier.x >= 0 && flier.x <= world.width && flier.y >= 0 && flier.y <= world.height,
  'it flew off the edge of the world');

// Fly it into the far edge and make sure it stops there rather than leaving.
for (let i = 0; i < 3000; i++) {
  flier.update(1 / 60, { x: 1, y: 0, mag: 1 }, []);
}
check('the edge of the map still stops it',
  flier.x <= world.width && flier.x > world.width - 200,
  `ended at x=${flier.x.toFixed(0)} of ${world.width}`);

// A car in the same place is stopped by the same building.
const car = all.find((c) => !c.air && !c.water);
const carStart = { x: car.x, y: car.y };
car.angle = 0;
for (let i = 0; i < 240; i++) {
  car.update(1 / 60, { x: 1, y: 0, mag: 1 }, all.filter((c) => c !== car));
}
check('a car, unlike it, is still stopped by things',
  Math.hypot(car.x - carStart.x, car.y - carStart.y) < 2000,
  'the car went as far as the helicopter, so nothing is being collided with');

// The height easing: up when flying, back down when not.
let lift = 0;
for (let i = 0; i < 120; i++) lift = liftToward(lift, true, 1 / 60);
check('it rises when flown', lift > 0.95, `lift reached only ${lift.toFixed(2)}`);
for (let i = 0; i < 120; i++) lift = liftToward(lift, false, 1 / 60);
check('and settles back down', lift < 0.05, `lift stayed at ${lift.toFixed(2)}`);

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL HELICOPTER CHECKS PASSED');
process.exit(fail ? 1 : 0);
