// Animals: where they live, and the one best friend.
//
// The thing that would ruin this feature is an animal that changes HIS town:
// a neighbour moved, a parked car moved, or worst of all a house's seed
// moved, which carries his furniture off to a different house. So section 1
// pins everything that existed before animals, byte for byte.
import { World, T } from '../../js/world.js';
import { CONFIG } from '../../js/config.js';
import { Animals } from '../../js/animals.js';

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

// --- 3. the best friend ------------------------------------------------------
console.log('');
console.log('3. one best friend');

const step = (animals, who, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) animals.update(1 / 60, who);
};
const first = (kind) => {
  const s = spots.find((p) => p.kind === kind);
  return s;
};
const foot = (x, y) => ({ mode: 'foot', x, y, flying: false, lift: 0 });

{
  const zoo = new Animals(world);
  const dog = zoo.list[first('dog').id];
  const cat = zoo.list[first('cat').id];

  check('nobody is a friend to begin with', zoo.friend === null && zoo.friendId() === -1);
  check('every animal starts idle at home',
        zoo.list.every((a) => a.state === 'idle' && a.x === a.homeX && a.y === a.homeY));

  check('patting says which kind it was', zoo.pat(dog) === 'dog');
  check('a pat makes it happy', dog.state === 'happy');
  check('and makes it the friend', zoo.friend === dog && zoo.friendId() === dog.id);

  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);
  check('happiness turns into following', dog.state === 'following', dog.state);

  // Walk off; the dog keeps up.
  let px = dog.x, py = dog.y;
  for (let i = 0; i < 120; i++) { px += 150 / 60; zoo.update(1 / 60, foot(px, py)); }
  const gap = Math.hypot(dog.x - px, dog.y - py);
  check('a friend keeps up behind him', gap <= A.FOLLOW_GAP + 10, gap.toFixed(1) + 'px');

  // Pat a second animal: only one friend, and the first goes home.
  zoo.pat(cat);
  check('patting another swaps the friend', zoo.friend === cat);
  check('the old friend heads home', dog.state === 'home', dog.state);
  check('exactly one animal is following or happy',
        zoo.list.filter((a) => ['happy', 'following', 'waiting', 'flying'].includes(a.state)).length === 1);

  // The old friend gets home and settles.
  step(zoo, foot(cat.x, cat.y), 60);
  check('the old friend gets home and goes back to idle', dog.state === 'idle', dog.state);

  // Re-patting the friend keeps it.
  step(zoo, foot(cat.x, cat.y), A.HAPPY_TIME + 0.05);
  zoo.pat(cat);
  check('re-patting the friend keeps it the friend', zoo.friend === cat && cat.state === 'happy');
  step(zoo, foot(cat.x, cat.y), A.HAPPY_TIME + 0.05);
  check('and it goes back to following', cat.state === 'following', cat.state);
}

// --- 4. waiting, and going home ---------------------------------------------
console.log('');
console.log('4. waiting');
{
  const zoo = new Animals(world);
  const dog = zoo.list[first('dog').id];
  zoo.pat(dog);
  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);

  step(zoo, { mode: 'drive', x: dog.x + 30, y: dog.y, flying: false, lift: 0 }, 0.1);
  check('getting into a car leaves the friend waiting', dog.state === 'waiting', dog.state);
  check('a waiting friend is not sent to other players', zoo.friendId() === -1);

  const waitX = dog.x, waitY = dog.y;
  step(zoo, { mode: 'inside', x: 9999, y: 9999, flying: false, lift: 0 }, 5);
  check('it stays put while he is away', dog.x === waitX && dog.y === waitY);

  step(zoo, foot(waitX + 20, waitY), 0.1);
  check('coming back to it gets it following again', dog.state === 'following', dog.state);

  step(zoo, { mode: 'inside', x: 0, y: 0, flying: false, lift: 0 }, 0.1);
  check('going indoors leaves it waiting too', dog.state === 'waiting', dog.state);
  zoo.pat(dog);
  check('a waiting friend can be patted again', dog.state === 'happy' && zoo.friend === dog);
  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);

  step(zoo, { mode: 'inside', x: 0, y: 0, flying: false, lift: 0 }, A.WAIT_TIME + 0.5);
  check('after WAIT_TIME it gives up and heads home', dog.state === 'home' || dog.state === 'idle', dog.state);
  check('and is nobody\'s friend any more', zoo.friend === null);
  step(zoo, { mode: 'inside', x: 0, y: 0, flying: false, lift: 0 }, 60);
  check('it gets home', dog.state === 'idle' &&
        Math.hypot(dog.x - dog.homeX, dog.y - dog.homeY) <= A.WANDER + 1, dog.state);
}

// --- 5. water ------------------------------------------------------------------
console.log('');
console.log('5. water');
{
  // A dry tile right beside water, and the water tile next to it.
  const bank = (() => {
    for (let r = 2; r < world.rows - 2; r++) {
      for (let c = 2; c < world.cols - 2; c++) {
        if (world.grid[r][c] === T.WATER && world.grid[r][c - 1] !== T.WATER &&
            world.grid[r][c - 2] !== T.WATER && world.grid[r][c + 3] === T.WATER) {
          return { land: (c - 1.5) * world.tile, water: (c + 2.5) * world.tile, y: (r + 0.5) * world.tile };
        }
      }
    }
    return null;
  })();
  check('found a river bank to test on', !!bank);

  for (const [kind, swims] of [['cat', false], ['hen', false], ['dog', true], ['duck', true]]) {
    const zoo = new Animals(world);
    const a = zoo.list[first(kind).id];
    a.x = bank.land - 60; a.y = bank.y;
    zoo.pat(a);
    step(zoo, foot(a.x, a.y), A.HAPPY_TIME + 0.05);
    step(zoo, foot(bank.water, bank.y), 3);
    const wet = world.isWaterAt(a.x, a.y);
    check(kind + (swims ? ' swims after him' : ' waits at the water\'s edge'),
          swims ? (a.state === 'following' && wet) : (a.state === 'waiting' && !wet),
          a.state + (wet ? ', in water' : ', on land'));
  }
}

// --- 6. a bird and the helicopter --------------------------------------------
console.log('');
console.log('6. flying');
{
  const zoo = new Animals(world);
  const bird = zoo.list[first('bird').id];
  const dog = zoo.list[first('dog').id];
  zoo.pat(bird);
  step(zoo, foot(bird.x, bird.y), A.HAPPY_TIME + 0.05);

  const hx = bird.x + 30, hy = bird.y;
  step(zoo, { mode: 'drive', x: hx, y: hy, flying: true, lift: 0.4 }, 0.1);
  check('a bird takes off with him', bird.state === 'flying', bird.state);
  step(zoo, { mode: 'drive', x: hx + 300, y: hy, flying: true, lift: 1 }, 2);
  check('and flies at the helicopter\'s height', bird.lift === 1, String(bird.lift));
  check('beside it', Math.hypot(bird.x - (hx + 300), bird.y - hy) < A.FLY_SIDE * 2,
        Math.hypot(bird.x - (hx + 300), bird.y - hy).toFixed(1) + 'px');
  check('a flying friend is still sent to other players', zoo.friendId() === bird.id);

  step(zoo, foot(hx + 330, hy), 0.1);
  check('landing turns it back to following', bird.state === 'following', bird.state);
  step(zoo, foot(hx + 330, hy), 2);
  check('and it settles back down to the ground', bird.lift === 0, String(bird.lift));

  // A dog does not fly.
  zoo.pat(dog);
  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);
  step(zoo, { mode: 'drive', x: dog.x, y: dog.y, flying: true, lift: 0.5 }, 0.1);
  check('a dog waits when he takes off', dog.state === 'waiting', dog.state);
}

// --- 7. never stranded ---------------------------------------------------------
console.log('');
console.log('7. catching up');
{
  const zoo = new Animals(world);
  const dog = zoo.list[first('dog').id];
  zoo.pat(dog);
  step(zoo, foot(dog.x, dog.y), A.HAPPY_TIME + 0.05);
  step(zoo, foot(dog.x + 2000, dog.y), 1 / 60);
  const d = Math.hypot(dog.x - (dog.homeX + 2000), dog.y - dog.homeY);
  check('a friend left far behind is brought within reach at once', d <= A.CATCHUP, d.toFixed(0) + 'px');
}

console.log('');
process.exit(fail ? 1 : 0);
