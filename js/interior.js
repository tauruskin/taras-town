/**
 * interior.js — The insides of houses.
 *
 * A room is NOT a place on the map. It is a separate space with its own
 * coordinates, entered by switching mode. That is what stops a child walking
 * out through an interior wall into the middle of a solid block, and it means
 * the town's tile grid never learns that interiors exist.
 *
 * Every room is a pure function of its building's seed, exactly like the town
 * itself: 43 houses have 43 different insides and not one byte is stored for
 * them. Only the furniture he places is ever saved.
 *
 * The file is in two halves and they must stay apart:
 *
 *   roomFor()   plain data, no canvas, no DOM — so the offline tests can ask
 *               it the same questions the game asks it
 *   drawRoom()  everything that touches a canvas
 */

import { CONFIG } from './config.js';
import { hash } from './world.js';

const I = () => CONFIG.INTERIOR;

/** Does a circle at (x, y) touch this box? */
function touches(x, y, r, box) {
  return Math.abs(x - (box.x + box.w / 2)) < box.w / 2 + r &&
         Math.abs(y - (box.y + box.h / 2)) < box.h / 2 + r;
}

/**
 * The room inside a given building, as plain data.
 *
 * Deterministic: same building in, same room out, every load on every phone.
 */
export function roomFor(building) {
  const C = I();
  const s = building.seed;

  // A wider house gets a wider room, so the inside matches what he just
  // walked up to from the street.
  const cols = Math.max(3, Math.round(building.w / CONFIG.TILE));
  const w = cols * C.TILE;
  const h = C.ROWS * C.TILE;

  const floor = C.FLOORS[Math.floor(hash(s + 29, 7) * C.FLOORS.length) % C.FLOORS.length];
  const boards = hash(s + 11, 3) < 0.5;

  // One or two windows on the back wall, showing sky.
  const windowCount = hash(s + 41, 13) < 0.5 ? 1 : 2;
  const windows = [];
  for (let i = 0; i < windowCount; i++) {
    windows.push({ x: (w * (i + 1)) / (windowCount + 1) - 34, w: 68 });
  }

  // The way out, on the front wall, under where the door is outside.
  const mat = { x: w / 2 - C.MAT.w / 2, y: h - C.MAT.h, w: C.MAT.w, h: C.MAT.h };

  // Two pieces that are always there, so a house he has never touched still
  // looks like somebody lives in it rather than like an empty box. They are
  // not removable and they are not solid.
  const bedLeft = hash(s + 57, 19) < 0.5;
  const fixed = [
    { kind: 'bed', x: bedLeft ? 16 : w - 16 - 78, y: C.WALL + 12, w: 78, h: 122 },
    { kind: 'rug', x: w / 2 - 62, y: h / 2 - 30, w: 124, h: 68 },
  ];

  // Decorating spots: every floor square that is clear, then the best few by a
  // deterministic roll, then sorted so the order NEVER wobbles — the save
  // keys furniture by spot index, so a reshuffle would move his chairs.
  const clear = [];
  for (let r = 0; r < C.ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * C.TILE;
      const y = C.WALL + (r + 0.5) * ((h - C.WALL) / C.ROWS);
      if (x - C.SPOT_R < 0 || x + C.SPOT_R > w) continue;
      if (y - C.SPOT_R < 0 || y + C.SPOT_R > h) continue;
      if (touches(x, y, C.SPOT_R, mat)) continue;
      if (fixed.some((f) => touches(x, y, C.SPOT_R, f))) continue;
      clear.push({ x, y, roll: hash(s * 7 + c + 1, r * 5 + 3) });
    }
  }

  clear.sort((a, b) => a.roll - b.roll);
  const want = C.MIN_SPOTS + Math.floor(hash(s + 77, 31) * (C.MAX_SPOTS - C.MIN_SPOTS + 1));
  const spots = clear
    .slice(0, Math.min(want, clear.length))
    .map(({ x, y }) => ({ x, y }))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return {
    seed: s,
    w, h,
    wall: building.wall,
    roof: building.roof,
    floor,
    boards,
    windows,
    mat,
    fixed,
    spots,
    // Standing just inside the door, facing into the room.
    start: { x: w / 2, y: h - C.MAT.h - 34 },
  };
}

/**
 * Keep the player inside the walls.
 *
 * Nothing in a room is solid except the walls themselves — not the bed, not
 * the rug, not a chair he has placed. Getting wedged behind furniture in a
 * room with one way out is the worst thing that could happen in here, and it
 * is worth more than the realism of a solid table.
 */
export function clampToRoom(room, x, y, half) {
  return {
    x: Math.min(Math.max(x, half), room.w - half),
    y: Math.min(Math.max(y, I().WALL + half), room.h - half),
  };
}

/** Is the player standing on the mat, i.e. close enough to leave? */
export function onMat(room, x, y) {
  return touches(x, y, CONFIG.PLAYER.HITBOX / 2, room.mat);
}
