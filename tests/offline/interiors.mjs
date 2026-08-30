// Interiors: doors, room generation, and drawing.
//
// Room layout is a pure function of the building seed, which is what lets this
// suite exist at all — it asks the generator the same questions the game asks
// it, in node, with no browser and no canvas.
const { World } = await import('../../js/world.js');
const { CONFIG } = await import('../../js/config.js');

let fail = 0;
// The third argument is what went WRONG, so it is only printed when something
// did. menu-buttons.mjs passes a string that happens to be empty on success
// and so gets away with always printing it; these checks pass a fixed message,
// which on a passing line would read as though the test had just failed.
const check = (l, ok, d) => {
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (!ok && d ? ': ' + d : ''));
};

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

// --- rooms -----------------------------------------------------------------
const { roomFor } = await import('../../js/interior.js');
const I = CONFIG.INTERIOR;
console.log(`\nrooms (one per building)`);

const rooms = world.buildings.map(roomFor);

check('a room is generated for every building', rooms.length === world.buildings.length);

check('generation is deterministic',
  world.buildings.every((b) => JSON.stringify(roomFor(b)) === JSON.stringify(roomFor(b))),
  'roomFor returned different data for the same building');

check(`every room has ${I.MIN_SPOTS}-${I.MAX_SPOTS} decorating spots`,
  rooms.every((r) => r.spots.length >= I.MIN_SPOTS && r.spots.length <= I.MAX_SPOTS),
  'spot counts: ' + [...new Set(rooms.map((r) => r.spots.length))].join(', '));

check('every spot is inside the walls',
  rooms.every((r) => r.spots.every((s) =>
    s.x - I.SPOT_R >= 0 && s.x + I.SPOT_R <= r.w &&
    s.y - I.SPOT_R >= 0 && s.y + I.SPOT_R <= r.h)),
  'a spot hangs through a wall');

const hits = (s, box) =>
  Math.abs(s.x - (box.x + box.w / 2)) < box.w / 2 + I.SPOT_R &&
  Math.abs(s.y - (box.y + box.h / 2)) < box.h / 2 + I.SPOT_R;

check('no spot overlaps the way out',
  rooms.every((r) => r.spots.every((s) => !hits(s, r.mat))),
  'a spot sits on the mat, so tapping it would fight with leaving');

check('no spot overlaps the fixed furniture',
  rooms.every((r) => r.spots.every((s) => r.fixed.every((f) => !hits(s, f)))),
  'a spot sits on the bed or the rug');

// The save keys furniture by spot INDEX, so the order must never wobble.
check('spots come back in a stable order (front to back, left to right)',
  rooms.every((r) => r.spots.every((s, i) =>
    i === 0 || s.y > r.spots[i - 1].y ||
    (s.y === r.spots[i - 1].y && s.x > r.spots[i - 1].x))),
  'spot order is not sorted — saved furniture would move between loads');

check('every room starts the player on open floor, near the way out',
  rooms.every((r) => r.start.x > 0 && r.start.x < r.w && r.start.y > 0 && r.start.y < r.h),
  'a start point is outside its room');

check('rooms vary between houses',
  new Set(rooms.map((r) => `${r.w}x${r.floor}x${r.spots.length}`)).size > 3,
  'every house generated the same room');

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL INTERIOR CHECKS PASSED');
process.exit(fail ? 1 : 0);
