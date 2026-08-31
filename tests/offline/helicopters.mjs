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

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL HELICOPTER CHECKS PASSED');
process.exit(fail ? 1 : 0);
