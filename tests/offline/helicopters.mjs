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

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL HELICOPTER CHECKS PASSED');
process.exit(fail ? 1 : 0);
