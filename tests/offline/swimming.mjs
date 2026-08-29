// Swimming: getting in, getting about, and getting out again.
//
// The thing that would ruin this feature is not swimming being wrong, it is
// swimming being a TRAP — somewhere a child can get to and then not get back
// from. So the checks that matter most here are the last ones: from anywhere
// in the water, there is always a way back to dry land.
import { World, T } from '../../js/world.js';
import { Player } from '../../js/player.js';
import { Car } from '../../js/car.js';
import { CONFIG } from '../../js/config.js';

const world = new World();
const half = CONFIG.PLAYER.HITBOX / 2;

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

/** Every water tile on the map, as world coordinates. */
const waterSpots = [];
for (let r = 1; r < world.rows - 1; r++) {
  for (let c = 1; c < world.cols - 1; c++) {
    if (world.grid[r][c] === T.WATER) {
      waterSpots.push({ x: c * world.tile + world.tile / 2, y: r * world.tile + world.tile / 2 });
    }
  }
}

// --- 1. there is water, and a decent amount of it -------------------------
console.log('');
console.log('1. there is somewhere to swim');
check('the map has plenty of water', waterSpots.length > 300, waterSpots.length + ' tiles');
check('and an inland lake as well as the river',
      waterSpots.some((s) => s.x < (world.riverCol - 6) * world.tile),
      world.lake ? 'lake at column ' + Math.round(world.lake.c) : 'no lake');

// --- 2. you can get in, and you look different when you do ---------------
console.log('');
console.log('2. wading in');

// Start on the bank and walk towards the water.
//
// Found from the map rather than worked out from the river column: the river
// has been widened twice now, and a hand-computed bank has been wrong both
// times — silently, because a player who cannot move also never reaches the
// water and the check passes.
const bank = (() => {
  for (let r = 4; r < world.rows - 4; r++) {
    for (let c = 2; c < world.cols - 2; c++) {
      if (world.grid[r][c] !== T.WATER) continue;
      if (world.grid[r][c - 1] === T.WATER) continue;      // want the west edge
      const x = (c - 1) * world.tile + world.tile / 2;
      const y = r * world.tile + world.tile / 2;
      if (world._overlaps(x, y, half, half, null)) continue;
      if (world.isWaterAt(x, y)) continue;
      return { x, y };
    }
  }
  return { x: (world.sandCol - 1) * world.tile + 32, y: 2000 };
})();
const p = new Player(world, bank.x, bank.y);
check('starts on dry land, not swimming', p.swimming === false);

let becameSwimmer = false;
for (let i = 0; i < 200 && !becameSwimmer; i++) {
  p.update(1 / 60, { x: 1, y: 0, mag: 1 }, []);
  if (p.swimming) becameSwimmer = true;
}
check('walking into the river starts him swimming', becameSwimmer);
check('and the game agrees he is in water', world.isWaterAt(p.x, p.y));

// --- 3. swimming is slower than running ----------------------------------
// The best of four directions, so "how fast does he run" is not really a
// measurement of whatever happens to be standing north of the spawn.
let ranDistance = 0;
for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
  const runner = new Player(world, world.spawn.x, world.spawn.y);
  for (let i = 0; i < 30; i++) runner.update(1 / 60, { x: dx, y: dy, mag: 1 }, []);
  ranDistance = Math.max(ranDistance,
    Math.hypot(runner.x - world.spawn.x, runner.y - world.spawn.y));
}

const swimStart = { x: p.x, y: p.y };
for (let i = 0; i < 30; i++) p.update(1 / 60, { x: 1, y: 0, mag: 1 }, []);
const swamDistance = Math.hypot(p.x - swimStart.x, p.y - swimStart.y);
check('swimming is slower than running', swamDistance < ranDistance * 0.95,
      Math.round(swamDistance) + 'px swum vs ' + Math.round(ranDistance) + 'px run in half a second');

// --- 4. and you can always get out again ---------------------------------
//
// The one that really matters. Every water tile is tried: swim in the four
// compass directions and see whether dry land is ever reached. A pocket of
// water with no way out is a child stuck in a river.
console.log('');
console.log('3. getting out again');

let trapped = 0;
for (const spot of waterSpots) {
  let escaped = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const swimmer = new Player(world, spot.x, spot.y);
    // Long enough to cross the widest water on the map. The river is ten
    // tiles across and swimming is deliberately slow, so a short attempt
    // reports the middle of the river as a trap when it is merely far out.
    for (let i = 0; i < 800 && !escaped; i++) {
      swimmer.update(1 / 60, { x: dx, y: dy, mag: 1 }, []);
      if (!world.isWaterAt(swimmer.x, swimmer.y)) escaped = true;
    }
    if (escaped) break;
  }
  if (!escaped) trapped++;
}
check('from anywhere in the water there is a way back to land', trapped === 0,
      trapped + ' of ' + waterSpots.length + ' spots had no way out');

// --- 5. vehicles stay out of it ------------------------------------------
//
// A bus in the river would be both stuck and sad.
console.log('');
console.log('4. vehicles stay on the road');

// Only the ones with wheels. Putting a boat on the bank and finding it never
// reaches the water would prove nothing — it cannot move on land at all, so
// the check would pass for entirely the wrong reason.
const wheeled = CONFIG.VEHICLES.filter((v) => !v.water);
let drovein = 0;
for (const v of wheeled) {
  const car = new Car(world, bank.x, bank.y, 0, { body: '#fff', roof: '#fff', type: v.id });
  for (let i = 0; i < 240; i++) car.update(1 / 60, { x: 1, y: 0, mag: 1 }, []);
  if (world.isWaterAt(car.x, car.y)) drovein++;
}
check('no vehicle can be driven into the water', drovein === 0,
      drovein + ' of ' + wheeled.length + ' ended up in the river');

// And the mirror image, which is the boats' half of the same rule: start one
// afloat and drive it at the bank, and it must stay on the water.
let ranAground = 0;
const boats = CONFIG.VEHICLES.filter((v) => v.water);
for (const v of boats) {
  const boat = new Car(world, 0, 0, 0, { body: '#fff', roof: '#fff', type: v.id });
  // Somewhere with clear water AHEAD of it. Moored hard against the bank it
  // is aground on the first frame, and "it barely moved" would be a fact
  // about where the test parked it rather than about the boat.
  const spot = world.sweepSpots((k) => k === T.WATER, 300, 0, boat.half + 8, 2)
    .find((s) => !world.blocksBoat(s.x, s.y, boat.half, boat.half) &&
                 !world.blocksBoat(s.x - 220, s.y, boat.half, boat.half));
  if (!spot) { check(v.id + ': somewhere to float', false); continue; }

  boat.x = spot.x; boat.y = spot.y;
  const from = { x: boat.x, y: boat.y };
  // Drive at the western bank, which every bit of water on this map has.
  for (let i = 0; i < 400; i++) boat.update(1 / 60, { x: -1, y: 0, mag: 1 }, []);
  if (world.blocksBoat(boat.x, boat.y, boat.half, boat.half)) ranAground++;
  // It must actually have tried: a boat that never moved proves nothing.
  check(v.id + ': moves under its own power', Math.hypot(boat.x - from.x, boat.y - from.y) > 40,
        Math.round(Math.hypot(boat.x - from.x, boat.y - from.y)) + 'px');
}
check('and no boat can be driven up onto the land', ranAground === 0,
      ranAground + ' of ' + boats.length + ' ended up aground');

// And the control: the same drive DOES cross that line when water is walkable,
// so the check above is measuring the block and not a car that never moved.
const roller = new Player(world, bank.x, bank.y);
for (let i = 0; i < 240; i++) roller.update(1 / 60, { x: 1, y: 0, mag: 1 }, []);
check('though a person driving nothing swims straight across it',
      world.isWaterAt(roller.x, roller.y), 'ended at ' + Math.round(roller.x));

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL SWIMMING CHECKS PASSED');
process.exit(fail ? 1 : 0);
