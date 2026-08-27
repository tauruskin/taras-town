// Flood-fills the town from the spawn point to prove every part of it can
// actually be walked to. A tree or building that quietly seals off a corner
// would leave a 6-year-old stuck with no idea why.
const { World, T } = await import('../../js/world.js');
const { CONFIG }   = await import('../../js/config.js');

const w = new World();
const half = CONFIG.PLAYER.HITBOX / 2;
const STEP = 8;                       // sampling grid, in world pixels
const W = Math.floor(w.width / STEP);
const H = Math.floor(w.height / STEP);

const free = (gx, gy) => {
  const x = gx * STEP + STEP / 2, y = gy * STEP + STEP / 2;
  if (x < half || y < half || x > w.width - half || y > w.height - half) return false;
  return !w._overlaps(x, y, half, half);
};

// Pre-compute the free cells once (the overlap test is the slow part).
const isFree = new Uint8Array(W * H);
let freeCount = 0;
for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
  if (free(gx, gy)) { isFree[gy * W + gx] = 1; freeCount++; }
}

// Breadth-first flood fill from spawn.
const seen = new Uint8Array(W * H);
const sx = Math.floor(w.spawn.x / STEP), sy = Math.floor(w.spawn.y / STEP);
const queue = [sy * W + sx];
seen[sy * W + sx] = 1;
let reached = 1;

while (queue.length) {
  const i = queue.pop();
  const gx = i % W, gy = (i / W) | 0;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nx = gx + dx, ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const ni = ny * W + nx;
    if (seen[ni] || !isFree[ni]) continue;
    seen[ni] = 1; reached++; queue.push(ni);
  }
}

console.log(`walkable cells: ${freeCount}, reachable from spawn: ${reached} (${(100*reached/freeCount).toFixed(1)}%)`);

// Can he get to the places that matter?
const landmarks = {
  'park fountain (N side)': [25 * 64, 19.4 * 64],
  'duck pond (S side)':     [23 * 64, 24.2 * 64],
  'river bank':             [43.5 * 64, 18 * 64],
  'top-left corner':        [0.6 * 64, 0.6 * 64],
  'bottom-left corner':     [0.6 * 64, 35.4 * 64],
  'top-right (by river)':   [42.4 * 64, 0.6 * 64],
  'bottom-right (by river)':[42.4 * 64, 35.4 * 64],
  'town centre crossroads': [19 * 64, 17 * 64],
};

let bad = 0;
for (const [name, [x, y]] of Object.entries(landmarks)) {
  const gx = Math.floor(x / STEP), gy = Math.floor(y / STEP);
  // Look in a small neighbourhood: the exact pixel may sit inside a tree.
  let ok = false;
  for (let oy = -3; oy <= 3 && !ok; oy++) for (let ox = -3; ox <= 3 && !ok; ox++) {
    const i = (gy + oy) * W + (gx + ox);
    if (i >= 0 && i < seen.length && seen[i]) ok = true;
  }
  if (!ok) bad++;
  console.log(`  ${ok ? 'reachable  ' : 'UNREACHABLE'}  ${name}`);
}

// Any decent-sized pocket cut off from the rest of town?
let stranded = 0;
for (let i = 0; i < isFree.length; i++) if (isFree[i] && !seen[i]) stranded++;
console.log(`stranded (walkable but cut off): ${stranded} cells = ${(stranded * STEP * STEP / 4096).toFixed(1)} tiles`);

if (bad) { console.log('\nFAILED: some landmarks cannot be walked to'); process.exit(1); }
console.log('\nREACHABILITY OK');
