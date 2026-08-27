const { World, T } = await import('../../js/world.js');
const { Player }   = await import('../../js/player.js');
const { Camera }   = await import('../../js/camera.js');
const { CONFIG }   = await import('../../js/config.js');


let calls = 0;
const ctx = new Proxy({}, {
  get(_, prop) {
    if (prop === 'canvas') return { width: 800, height: 460 };
    return (...args) => {
      calls++;
      for (const a of args) {
        if (typeof a === 'number' && !Number.isFinite(a)) {
          throw new Error(`Non-finite number passed to ctx.${String(prop)}: ${args}`);
        }
      }
    };
  },
  set() { return true; },
});

const world = new World();
console.log(`world: ${world.width}x${world.height}px, ${world.buildings.length} buildings, ${world.trees.length} trees, ${world.solids.length} solids`);

// --- spawn must be walkable ------------------------------------------------
const half = CONFIG.PLAYER.HITBOX / 2;
if (world._overlaps(world.spawn.x, world.spawn.y, half, half)) {
  throw new Error('FAIL: spawn point is inside something solid');
}
const spawnTile = world.grid[Math.floor(world.spawn.y / world.tile)][Math.floor(world.spawn.x / world.tile)];
console.log('spawn tile kind:', Object.keys(T).find(k => T[k] === spawnTile));

// --- no building may sit on a road or pavement -----------------------------
let onRoad = 0;
for (const b of world.buildings) {
  for (let r = Math.floor(b.y / world.tile); r < Math.ceil((b.y + b.h) / world.tile); r++) {
    for (let c = Math.floor(b.x / world.tile); c < Math.ceil((b.x + b.w) / world.tile); c++) {
      if (world.grid[r][c] === T.ROAD) onRoad++;
    }
  }
}
if (onRoad) throw new Error(`FAIL: ${onRoad} building tiles are sitting on a road`);
console.log('no buildings on roads: OK');

// --- walking: 8 directions, 1200 frames, must never leave the map or clip ---
const player = new Player(world, world.spawn.x, world.spawn.y);
const camera = new Camera(world);
camera.snapTo(player.x, player.y);

const dt = 1 / 60;
let maxStep = 0;
for (let i = 0; i < 1200; i++) {
  const a = (i / 60) * 1.3;
  const stick = { x: Math.cos(a), y: Math.sin(a), mag: 1 };

  const px = player.x, py = player.y;
  player.update(dt, stick);
  maxStep = Math.max(maxStep, Math.hypot(player.x - px, player.y - py));

  camera.update(dt, player.x, player.y, 800 / 1.2, 460 / 1.2);

  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) throw new Error('FAIL: player position went NaN');
  if (player.x < 0 || player.x > world.width || player.y < 0 || player.y > world.height) {
    throw new Error(`FAIL: player left the map at ${player.x},${player.y}`);
  }
  if (world._overlaps(player.x, player.y, half, half)) {
    throw new Error(`FAIL: player ended up inside a solid at ${player.x},${player.y}`);
  }
  if (camera.x < -0.01 || camera.y < -0.01) throw new Error('FAIL: camera scrolled past the map edge');
}
console.log(`walked 1200 frames, never clipped. max step/frame ${maxStep.toFixed(2)}px (limit ${(CONFIG.PLAYER.SPEED * dt).toFixed(2)})`);
if (maxStep > CONFIG.PLAYER.SPEED * dt + 0.01) throw new Error('FAIL: player moved faster than SPEED allows');

// --- drawing must not throw, at several places around town -----------------
const spots = [world.spawn, { x: 200, y: 200 }, { x: 2900, y: 1200 }, { x: 1600, y: 1400 }, { x: 400, y: 2100 }];
for (const s of spots) {
  const view = { x: s.x - 400, y: s.y - 230, w: 800, h: 460 };
  world.drawGround(ctx, view, 3.2);
  world.drawBuildings(ctx, view);
  world.drawCanopies(ctx, view);
  player.x = s.x; player.y = s.y;
  player.draw(ctx);
}
console.log(`drawing OK across ${spots.length} viewpoints (${calls} canvas calls, no NaN)`);

// --- the park should really be walkable open space -------------------------
let parkFree = 0, parkTotal = 0;
for (let r = 19; r <= 24; r++) for (let c = 21; c <= 29; c++) {
  parkTotal++;
  if (!world._overlaps(c * 64 + 32, r * 64 + 32, half, half)) parkFree++;
}
console.log(`park walkable: ${parkFree}/${parkTotal} tiles`);

console.log('\nALL CHECKS PASSED');
