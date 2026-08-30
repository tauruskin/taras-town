// Interiors: doors, room generation, and drawing.
//
// Room layout is a pure function of the building seed, which is what lets this
// suite exist at all — it asks the generator the same questions the game asks
// it, in node, with no browser and no canvas.
const { World } = await import('../../js/world.js');
const { CONFIG } = await import('../../js/config.js');

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

const world = new World();

// --- every building must carry its own door --------------------------------
console.log(`\ndoors (${world.buildings.length} buildings)`);

check('every building has a door',
  world.buildings.every((b) => b.door && Number.isFinite(b.door.x) && Number.isFinite(b.door.y)),
  'some building is missing door {x, y}');

check('every door sits on the bottom edge, horizontally centred',
  world.buildings.every((b) => Math.abs(b.door.x - (b.x + b.w / 2)) < 0.01),
  'a door is not centred on its building');

check('every door sits just outside the front wall',
  world.buildings.every((b) => b.door.y > b.y + b.h && b.door.y < b.y + b.h + 64),
  'a door is inside the building or too far from it');

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL INTERIOR CHECKS PASSED');
process.exit(fail ? 1 : 0);
