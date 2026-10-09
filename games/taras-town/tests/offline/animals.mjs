// Animals: where they live, and the one best friend.
//
// The thing that would ruin this feature is an animal that changes HIS town:
// a neighbour moved, a parked car moved, or worst of all a house's seed
// moved, which carries his furniture off to a different house. So section 1
// pins everything that existed before animals, byte for byte.
import { World, T } from '../../js/world.js';
import { CONFIG } from '../../js/config.js';

const world = new World();
const A = CONFIG.ANIMALS;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- 1. nothing that was there before has moved ---------------------------
console.log('');
console.log('1. the town is unchanged');
// Captured on 2026-10-09 from the town as it was before animals, with this
// exact expression. If a deliberate change to the town moves any of these,
// recapture it — but only after checking building seeds did not move.
const fingerprint = (() => {
  const s = JSON.stringify([
    world.neighbourSpots, world.parking,
    world.buildings.map((b) => [b.seed, b.door && b.door.x, b.door && b.door.y]),
    world.spawn, world.trees.length, world.props.length, world.canopies.length,
  ]);
  let h = 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
})();
check('neighbours, parking, houses and scenery are where they were',
      fingerprint === -308509121, String(fingerprint));

// --- 2. where the animals live ---------------------------------------------
console.log('');
console.log('2. animal spots');
const spots = world.animalSpots;
check('there are animal spots', Array.isArray(spots) && spots.length > 0, String(spots && spots.length));

const again = new World().animalSpots;
check('the same on every build of the town', JSON.stringify(again) === JSON.stringify(spots));

check('each id is its index', spots.every((s, i) => s.id === i));

for (const kind of Object.keys(A.COUNT)) {
  const n = spots.filter((s) => s.kind === kind).length;
  check(kind + ': the configured number', n === A.COUNT[kind], n + ' of ' + A.COUNT[kind]);
}

check('none in the water', spots.every((s) => !world.isWaterAt(s.x, s.y)));
check('none inside anything solid',
      spots.every((s) => !world._overlaps(s.x, s.y, A.HALF, A.HALF)));

const pond = world.props.find((p) => p.kind === 'pond');
const nearWater = (x, y) => {
  const r = world.tile * 2;
  for (let dy = -r; dy <= r; dy += world.tile / 2) {
    for (let dx = -r; dx <= r; dx += world.tile / 2) {
      if (world.isWaterAt(x + dx, y + dy)) return true;
    }
  }
  return x > pond.x - r && x < pond.x + pond.w + r && y > pond.y - r && y < pond.y + pond.h + r;
};
check('every duck is within two tiles of water',
      spots.filter((s) => s.kind === 'duck').every((s) => nearWater(s.x, s.y)));

check('no two animals on top of each other',
      spots.every((a, i) => spots.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) >= A.GAP)));
check('none standing on a neighbour',
      spots.every((s) => world.neighbourSpots.every((n) => Math.hypot(n.x - s.x, n.y - s.y) >= 60)));
check('none standing on a parking space',
      spots.every((s) => world.parking.every((p) => Math.abs(p.x - s.x) >= 56 || Math.abs(p.y - s.y) >= 56)));

console.log('');
process.exit(fail ? 1 : 0);
