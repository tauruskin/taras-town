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

check('every door sits just outside the wall it is on',
  world.buildings.every((b) => b.doorSide === 'front'
    ? b.door.y > b.y + b.h && b.door.y < b.y + b.h + 64
    : b.door.y < b.y && b.door.y > b.y - 64),
  'a door is inside its building or too far from it');

// The one that matters. Houses are built in rows back to back, and a door on
// the wrong wall opens into the house behind — 17 of the 53 did, and those
// houses could not be walked up to at all. Jobs never noticed because they
// quietly skip a doorstep they cannot stand on, so a third of the town was
// undeliverable too and the only symptom was deliveries never going there.
//
// This asks the only question that matters: can he actually get to it?
const half = CONFIG.PLAYER.HITBOX / 2;
const reachable = (b) => {
  for (let a = 0; a < 24; a++) {
    for (const rad of [0, 14, 28, 42]) {
      if (rad > CONFIG.INTERIOR.ENTER_RADIUS) continue;
      const x = b.door.x + Math.cos((a / 24) * Math.PI * 2) * rad;
      const y = b.door.y + Math.sin((a / 24) * Math.PI * 2) * rad;
      if (!world._overlaps(x, y, half, half)) return true;
    }
  }
  return false;
};
const shut = world.buildings.filter((b) => !reachable(b));
check('every house can actually be walked up to and entered',
  shut.length === 0,
  `${shut.length} of ${world.buildings.length} are sealed shut (seeds ${shut.map((b) => b.seed).join(', ')})`);

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

// A room has to fit on the phone, and this is not a detail — the mat is on the
// FRONT wall, so a room taller than the screen puts the only way out below the
// bottom of it. That is a room he can walk into and not get out of.
//
// 320 is an iPhone SE held sideways, the smallest ordinary phone this game is
// played on. Anything squatter than that is rescued by the scale-to-fit in
// main.js; nothing should need rescuing on a real phone.
const SMALLEST_PHONE_HEIGHT = 320;
check(`every room fits on a ${SMALLEST_PHONE_HEIGHT}px-high screen without scaling`,
  rooms.every((r) => r.h <= SMALLEST_PHONE_HEIGHT),
  `tallest room is ${Math.max(...rooms.map((r) => r.h))}px`);

// And the way out must be inside the room it belongs to, however the room is
// shaped — a mat hanging off the bottom edge is unreachable.
check('the way out is inside every room',
  rooms.every((r) => r.mat.y >= 0 && r.mat.y + r.mat.h <= r.h &&
                     r.mat.x >= 0 && r.mat.x + r.mat.w <= r.w),
  'a mat hangs outside its room');

// --- drawing must not throw, and must never pass NaN to a canvas -----------
const { drawRoom } = await import('../../js/interior.js');
console.log('\ndrawing');

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

// Destructured under different names because the furniture section further
// down imports the same module again — reusing the names there would be a
// redeclaration, and referring to those ones from up here would be a temporal
// dead zone error.
const { drawFurniture: drawPieceForTest, FURNITURE: catalogForTest } =
  await import('../../js/furniture.js');

let drewFilled = 0;
for (const room of rooms) {
  // Once empty, and once with every spot filled — a room full of furniture is
  // a different code path from an empty one, and it is the one he will
  // actually be looking at.
  drawRoom(ctx, room, {}, 0, drawPieceForTest);
  const full = {};
  room.spots.forEach((_, i) => { full[i] = catalogForTest[i % catalogForTest.length].id; });
  drawRoom(ctx, room, full, 0, drawPieceForTest);
  drewFilled++;
}
check(`drew all ${drewFilled} rooms empty and full, with no NaN`, drewFilled === rooms.length);

// --- furniture -------------------------------------------------------------
const { FURNITURE, priceOfFurniture, isFurnitureUnlocked, drawFurniture } =
  await import('../../js/furniture.js');
console.log('\nfurniture');

check('the catalog is not empty', FURNITURE.length > 0);

check('every piece has a unique id',
  new Set(FURNITURE.map((f) => f.id)).size === FURNITURE.length,
  'two pieces share an id, so they would share a save slot');

check('at least two pieces are free',
  FURNITURE.filter((f) => priceOfFurniture(f.id) === 0).length >= 2,
  'an empty purse could not decorate anything');

check('a free piece is unlocked with no save at all',
  isFurnitureUnlocked('stool', { coins: 0, unlocked: {} }) === true);

check('a paid piece is locked until it is bought',
  isFurnitureUnlocked('chest', { coins: 0, unlocked: { furniture: [] } }) === false &&
  isFurnitureUnlocked('chest', { coins: 0, unlocked: { furniture: ['chest'] } }) === true);

check('an unknown id is never unlocked',
  isFurnitureUnlocked('nonsense', { coins: 999, unlocked: { furniture: [] } }) === false);

let drewFurniture = 0;
for (const f of FURNITURE) { drawFurniture(ctx, f.id, 40); drewFurniture++; }
check(`drew all ${drewFurniture} pieces with no NaN`, drewFurniture === FURNITURE.length);

// --- the picker must fit on the phone --------------------------------------
//
// Its clear and close buttons are the only way out of it. Laid out from fixed
// numbers they fell off the bottom of three of these seven screens — an
// iPhone SE among them — so opening the picker on those phones was a trap:
// no way to close it, no way to change your mind, and nothing on screen to
// say why. Same shape of bug as a room taller than the display.
//
// These are the sizes tests/offline/menu-buttons.mjs already treats as
// supported, and they are listed here rather than imported so that adding one
// there makes this fail until somebody has thought about it.
const { pickerButtons, drawPicker } = await import('../../js/furniture.js');
console.log('\nthe picker');

const SCREENS = [
  { w: 568, h: 320, what: 'iPhone SE, landscape' },
  { w: 667, h: 375, what: 'iPhone 8, landscape' },
  { w: 844, h: 390, what: 'iPhone 12, landscape' },
  { w: 915, h: 412, what: 'a big Android, landscape' },
  { w: 1024, h: 768, what: 'a tablet' },
  { w: 640, h: 300, what: 'a squat viewport' },
  { w: 740, h: 280, what: 'a very squat viewport' },
];

for (const s of SCREENS) {
  const buttons = pickerButtons(s.w, s.h);
  const off = buttons.filter((b) =>
    b.x - b.r < 0 || b.x + b.r > s.w || b.y - b.r < 0 || b.y + b.r > s.h);
  check(`${s.what}: all ${buttons.length} choices are on screen`,
    off.length === 0, off.map((b) => b.id).join(', '));
}

// A finger is not a pixel. Anything he has to hit must stay big enough to hit.
const MIN_TAP_R = 16;
for (const s of SCREENS) {
  const tooSmall = pickerButtons(s.w, s.h).filter((b) => b.r < MIN_TAP_R);
  check(`${s.what}: nothing shrank below ${MIN_TAP_R}px`,
    tooSmall.length === 0,
    `smallest is ${Math.min(...pickerButtons(s.w, s.h).map((b) => b.r)).toFixed(1)}px`);
}

// And the two buttons that get him out must never end up under one another.
for (const s of SCREENS) {
  const bs = pickerButtons(s.w, s.h);
  const none = bs.find((b) => b.id === 'furniture:none');
  const close = bs.find((b) => b.id === 'picker-close');
  check(`${s.what}: clear and close do not overlap`,
    Math.hypot(none.x - close.x, none.y - close.y) > none.r + close.r,
    'the two ways out of the picker are on top of each other');
}

let drewPicker = 0;
for (const s of SCREENS) {
  drawPicker(ctx, s.w, s.h, { coins: 30, unlocked: { furniture: [] } }, null);
  drawPicker(ctx, s.w, s.h, { coins: 0, unlocked: {} }, { id: 'furniture:chest', amount: 0.4 });
  drewPicker++;
}
check(`drew the picker at all ${drewPicker} sizes with no NaN`, drewPicker === SCREENS.length);

// --- the save shape --------------------------------------------------------
const { defaultSaveForTests } = await import('../../js/save.js');
console.log('\nsaving');

const fresh = defaultSaveForTests();
check('a new save has an empty set of rooms',
  fresh.rooms && typeof fresh.rooms === 'object' && Object.keys(fresh.rooms).length === 0,
  'save.rooms is missing or not empty');
check('a new save has an empty furniture unlock list',
  Array.isArray(fresh.unlocked.furniture) && fresh.unlocked.furniture.length === 0,
  'save.unlocked.furniture is missing or not empty');

// Loading has to survive two things: a save written before any of this
// existed, and a save somebody has edited by hand. The shop already holds
// itself to that standard and rooms are no different — except that a room
// that throws while drawing takes the whole game with it, where a bad shop
// entry only spoils a hat.
const { loadGame } = await import('../../js/save.js');

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const loadWith = (obj) => {
  store['tarasTown.save.v1'] = JSON.stringify(obj);
  return loadGame();
};

// A save from before interiors existed: no rooms, no furniture list.
const old = loadWith({ version: 1, coins: 40, hat: 1, unlocked: { hat: [1], shirt: [], car: [], vehicle: [] } });
check('a save from before interiors still loads',
  old.coins === 40 && old.hat === 1, 'the old fields were lost');
check('...and gains the new fields rather than undefined',
  Array.isArray(old.unlocked.furniture) && old.unlocked.furniture.length === 0 &&
  old.rooms && Object.keys(old.rooms).length === 0,
  'an old save comes back without rooms or a furniture list, which would' +
  ' throw the first time he buys anything');

// Now the hand-edited ones. None of these may throw, and none may leave a
// shape the game will trip over later.
const nonsense = [
  { rooms: 'banana' },
  { rooms: [1, 2, 3] },
  { rooms: { 4: 'not-an-object' } },
  { rooms: { 4: { 0: 12345 } } },
  { rooms: { 4: { notANumber: 'chair' } } },
  { unlocked: { furniture: 'chair' } },
  { unlocked: { furniture: [1, 2, 3] } },
];
let survived = 0;
for (const bad of nonsense) {
  try {
    const s = loadWith({ version: 1, ...bad });
    const roomsOk = s.rooms && typeof s.rooms === 'object' && !Array.isArray(s.rooms) &&
      Object.values(s.rooms).every((r) => r && typeof r === 'object' &&
        Object.values(r).every((id) => typeof id === 'string'));
    const furnOk = Array.isArray(s.unlocked.furniture) &&
      s.unlocked.furniture.every((id) => typeof id === 'string');
    if (roomsOk && furnOk) survived++;
  } catch (err) { /* counted as a failure below */ }
}
check(`a hand-edited save cannot crash a room (${survived}/${nonsense.length} cleaned)`,
  survived === nonsense.length,
  `${nonsense.length - survived} corrupt saves came back in a shape that would throw`);

delete globalThis.localStorage;

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL INTERIOR CHECKS PASSED');
process.exit(fail ? 1 : 0);
