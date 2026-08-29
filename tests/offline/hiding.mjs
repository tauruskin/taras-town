// Places to hide, for hide-and-seek.
//
// The thing that makes hiding work in a game seen from above is that the cover
// is drawn OVER the player and is not solid: you walk into a bush and the bush
// is painted on top of you. So the two properties that matter are exactly the
// two checked here — you can get in, and once in you cannot be seen — and both
// are easy to break without anything looking wrong on screen.
import { World, T } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { CONFIG } from '../../js/config.js';

const world = new World();
const half = CONFIG.PLAYER.HITBOX / 2;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

// --- 1. there are plenty, and of several kinds ---------------------------
console.log('');
console.log('1. what there is to hide under');

const kinds = {};
for (const c of world.canopies) kinds[c.kind] = (kinds[c.kind] || 0) + 1;

check('there are lots of trees', world.trees.length > 300, world.trees.length + ' trees');
check('and lots of other cover', world.canopies.length > 100, world.canopies.length + ' pieces');
check('of several different kinds', Object.keys(kinds).length >= 4, JSON.stringify(kinds));
check('including bushes to duck into', (kinds.bush || 0) > 80, (kinds.bush || 0) + ' bushes');

// --- 2. you can actually get into them -----------------------------------
//
// The whole point. A bush you bounce off is scenery, not a hiding place, and
// nothing on screen would tell you which one it is.
console.log('');
console.log('2. you can walk into them');

let blocked = 0;
for (const c of world.canopies) {
  if (world._overlaps(c.x, c.y, half, half, null)) blocked++;
}
check('no piece of cover is solid', blocked === 0, blocked + ' of ' + world.canopies.length + ' cannot be entered');

// And really walk in, from outside, under your own steam.
//
// Two things this gets right that the obvious version does not. It asks
// whether the player is EVER inside, not where he ends up — a second of
// walking carries him clean through a bush and out the far side, which is
// passing through it, not failing to reach it. And it tries all four sides,
// because the approach from one particular direction may itself start inside
// a wall, which says nothing about the bush.
let couldNotWalkIn = 0;
const sample = world.canopies.filter((c) => c.kind === 'bush').slice(0, 40);
for (const c of sample) {
  let gotIn = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const p = new Player(world, c.x - dx * (c.rx + 20), c.y - dy * (c.ry + 20));
    for (let i = 0; i < 40 && !gotIn; i++) {
      p.update(1 / 60, { x: dx, y: dy, mag: 1 }, []);
      if (world.hiddenAt(p.x, p.y)) gotIn = true;
    }
    if (gotIn) break;
  }
  if (!gotIn) couldNotWalkIn++;
}
check('and can be walked into from outside', couldNotWalkIn <= sample.length * 0.15,
      couldNotWalkIn + ' of ' + sample.length + ' could not be reached');

// --- 3. standing in one hides you ----------------------------------------
console.log('');
console.log('3. standing in one hides you');

let notHidden = 0;
for (const c of world.canopies) {
  if (!world.hiddenAt(c.x, c.y)) notHidden++;
}
check('the middle of every piece of cover hides you', notHidden === 0,
      notHidden + ' of ' + world.canopies.length + ' do not');

let treesNotHiding = 0;
for (const t of world.trees) {
  if (!world.hiddenAt(t.x, t.y - 6)) treesNotHiding++;
}
check('and so does under a tree', treesNotHiding === 0, treesNotHiding + ' of ' + world.trees.length + ' do not');

// The other half of the same claim, and the one that makes it mean anything:
// standing in the open must NOT count as hidden, or "hidden" is just "true".
let falselyHidden = 0;
let openTested = 0;
for (let r = 2; r < world.rows - 2; r += 3) {
  for (let c = 2; c < world.cols - 2; c += 3) {
    if (world.grid[r][c] !== T.ROAD) continue;
    const x = c * world.tile + world.tile / 2;
    const y = r * world.tile + world.tile / 2;
    openTested++;
    if (world.hiddenAt(x, y)) falselyHidden++;
  }
}
check('standing out in the road does not', falselyHidden === 0,
      falselyHidden + ' of ' + openTested + ' road spots wrongly counted as hidden');

// --- 4. cover is spread across the whole town ----------------------------
//
// All the hiding places bunched into one corner would pass every count above
// and be no use at all for a game of hide-and-seek.
console.log('');
console.log('4. spread across the town');

const quadrant = { };
for (const c of [...world.canopies, ...world.trees]) {
  const q = (c.y < world.height / 2 ? 'top' : 'bottom') + '-' +
            (c.x < world.width / 2 ? 'left' : 'right');
  quadrant[q] = (quadrant[q] || 0) + 1;
}
const counts = Object.values(quadrant);
check('every quarter of the town has cover', counts.length === 4 && Math.min(...counts) > 60,
      JSON.stringify(quadrant));

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL HIDING CHECKS PASSED');
process.exit(fail ? 1 : 0);
