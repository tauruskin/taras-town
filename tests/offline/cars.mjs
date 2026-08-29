// Milestone 2 checks: are the cars parked legally, do they drive without
// escaping the map or wedging in geometry, and can you always get back out?
const { World, T }        = await import('../../js/world.js');
const { Car, createCars } = await import('../../js/car.js');
const { CONFIG }          = await import('../../js/config.js');

const world = new World();
const cars = createCars(world);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// --- 1. every car is parked on a road, clear of scenery -------------------
console.log(`\n1. ${cars.length} parked cars`);
cars.forEach((car, i) => {
  const tc = Math.floor(car.x / world.tile);
  const tr = Math.floor(car.y / world.tile);
  const kind = world.grid[tr][tc];
  const kindName = Object.keys(T).find(k => T[k] === kind);

  // Boats are moored in the river, which is the whole point of them.
  if (car.water) {
    if (kind !== T.WATER) fail(`boat ${i} is moored on ${kindName}, not water`);
    if (world.blocksBoat(car.x, car.y, car.half, car.half)) fail(`boat ${i} is aground`);
  } else if (kind !== T.ROAD) {
    fail(`car ${i} is parked on ${kindName}, not a road`);
  }

  const others = cars.filter(c => c !== car).map(c => c.boundsBox());
  if (world._overlaps(car.x, car.y, car.half, car.half, others)) {
    fail(`car ${i} at (${car.x},${car.y}) is overlapping scenery or another car`);
  }
});
if (!failures) console.log('   all on roads, none overlapping');

// --- 2. the player can reach every car on foot ----------------------------
// (a car walled in by trees would be a car he can never drive)
console.log('\n2. reachability of each car from spawn');
const half = CONFIG.PLAYER.HITBOX / 2;
const STEP = 8;
const W = Math.floor(world.width / STEP), H = Math.floor(world.height / STEP);
const carBoxes = cars.map(c => c.boundsBox());
const isFree = new Uint8Array(W * H);
for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
  const x = gx * STEP + STEP / 2, y = gy * STEP + STEP / 2;
  if (x < half || y < half || x > world.width - half || y > world.height - half) continue;
  if (!world._overlaps(x, y, half, half, carBoxes)) isFree[gy * W + gx] = 1;
}
const seen = new Uint8Array(W * H);
const start = Math.floor(world.spawn.y / STEP) * W + Math.floor(world.spawn.x / STEP);
const q = [start]; seen[start] = 1;
while (q.length) {
  const i = q.pop(), gx = i % W, gy = (i / W) | 0;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = gx + dx, ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const ni = ny * W + nx;
    if (seen[ni] || !isFree[ni]) continue;
    seen[ni] = 1; q.push(ni);
  }
}
cars.forEach((car, i) => {
  // Can he stand anywhere within ENTER_RADIUS of this car?
  const R = Math.ceil(CONFIG.CAR.ENTER_RADIUS / STEP);
  const gx = Math.round(car.x / STEP), gy = Math.round(car.y / STEP);
  let ok = false;
  for (let oy = -R; oy <= R && !ok; oy++) for (let ox = -R; ox <= R && !ok; ox++) {
    if (Math.hypot(ox, oy) * STEP > CONFIG.CAR.ENTER_RADIUS) continue;
    const ni = (gy + oy) * W + (gx + ox);
    if (ni >= 0 && ni < seen.length && seen[ni]) ok = true;
  }
  if (!ok) fail(`car ${i} cannot be walked up to`);
});
console.log('   every car can be walked up to');

// --- 3. you can always get back out --------------------------------------
console.log('\n3. exit spots');
cars.forEach((car, i) => {
  const spot = car.exitSpot(cars.filter(c => c !== car));
  const others = cars.filter(c => c !== car).map(c => c.boundsBox());
  if (world._overlaps(spot.x, spot.y, half, half, others)) {
    fail(`car ${i} drops the player inside something solid`);
  }
});
console.log('   every parked car has a clear spot to step out onto');

// --- 4. drive hard and see if anything breaks ----------------------------
console.log('\n4. driving 6000 frames with erratic steering');
const car = cars[0];
const dt = 1 / 60;
let maxSpeed = 0, bumps = 0, stuckFrames = 0;
let prev = { x: car.x, y: car.y };

for (let i = 0; i < 6000; i++) {
  // Wildly changing input, the way a 6-year-old actually plays.
  const a = Math.sin(i * 0.013) * 3 + Math.cos(i * 0.041) * 2;
  const mag = i % 400 < 40 ? 0 : 1;           // occasional coasting
  car.update(dt, { x: Math.cos(a), y: Math.sin(a), mag }, cars.slice(1));

  maxSpeed = Math.max(maxSpeed, Math.abs(car.speed));

  if (!Number.isFinite(car.x) || !Number.isFinite(car.y) || !Number.isFinite(car.angle)) {
    fail(`car position/angle went NaN at frame ${i}`); break;
  }
  if (car.x < 0 || car.y < 0 || car.x > world.width || car.y > world.height) {
    fail(`car left the map at frame ${i}: ${car.x},${car.y}`); break;
  }
  if (world._overlaps(car.x, car.y, car.half, car.half, cars.slice(1).map(c => c.boundsBox()))) {
    fail(`car ended up inside solid geometry at frame ${i}`); break;
  }

  const moved = Math.hypot(car.x - prev.x, car.y - prev.y);
  if (mag > 0 && moved < 0.01) stuckFrames++; else stuckFrames = 0;
  if (stuckFrames > 240) { fail(`car wedged: 4 seconds of full throttle with no movement (frame ${i})`); break; }
  if (moved < 0.01 && mag > 0) bumps++;
  prev = { x: car.x, y: car.y };
}
console.log(`   top speed ${maxSpeed.toFixed(0)} px/s (limit ${CONFIG.CAR.MAX_SPEED}), never wedged`);
if (maxSpeed > CONFIG.CAR.MAX_SPEED + 1) fail('car exceeded its own top speed');

// --- 5. drawing doesn't throw or emit NaN --------------------------------
let calls = 0;
const ctx = new Proxy({}, { get(_, p) {
  if (p === 'canvas') return { width: 800, height: 390 };
  return (...args) => {
    calls++;
    for (const v of args) if (typeof v === 'number' && !Number.isFinite(v)) {
      throw new Error(`non-finite arg to ctx.${String(p)}`);
    }
  };
}, set() { return true; } });
for (const c of cars) c.draw(ctx);
console.log(`\n5. drew all cars: ${calls} canvas calls, no NaN`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CAR CHECKS PASSED');
process.exit(failures ? 1 : 0);
