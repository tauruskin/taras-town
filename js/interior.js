/**
 * interior.js — The insides of houses.
 *
 * A room is NOT a place on the map. It is a separate space with its own
 * coordinates, entered by switching mode. That is what stops a child walking
 * out through an interior wall into the middle of a solid block, and it means
 * the town's tile grid never learns that interiors exist.
 *
 * Every room is a pure function of its building's seed, exactly like the town
 * itself: all 53 buildings have their own inside and not one byte is stored
 * for any of them. Only the furniture he places is ever saved.
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
  const bed = { kind: 'bed', x: bedLeft ? 16 : w - 16 - 78, y: C.WALL + 12, w: 78, h: 122 };

  // The rug lies on the floor BELOW the bed, not beside it. Beside it, the two
  // overlapped by a corner in the narrowest rooms — invisible while the rug was
  // a faint smudge, and obviously wrong the moment it was solid enough to see.
  // Measuring from the bed rather than from the middle of the room means it
  // stays clear however the room is proportioned.
  const rug = { kind: 'rug', x: w / 2 - 62, y: bed.y + bed.h + 8, w: 124, h: 68 };

  const fixed = [bed, rug];

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

// ---------------------------------------------------------------------------
// Drawing. Everything below here touches a canvas; everything above does not.
// ---------------------------------------------------------------------------

/**
 * Where a room sits on screen, and how much it had to shrink to get there.
 *
 * Scaled down to fit but never enlarged. A room is sized for an ordinary
 * phone held sideways, but "ordinary" is not every phone — and the mat is on
 * the FRONT wall, so a room even slightly taller than the screen puts the
 * only way out below the bottom of it. A child who cannot get out of a room
 * is the worst thing this feature could do, so the fit is enforced rather
 * than assumed.
 *
 * Used by the drawing AND by the hit-testing, from here, because a spot drawn
 * in one place and tapped in another is a bug you cannot see in a screenshot.
 *
 * The margins keep the walls clear of the joystick and the action button,
 * which are drawn on top of the room.
 */
export function roomPlacement(room, screenW, screenH) {
  const scale = Math.min(1, (screenW - 96) / room.w, (screenH - 72) / room.h);
  return {
    x: Math.round((screenW - room.w * scale) / 2),
    y: Math.round((screenH - room.h * scale) / 2),
    scale,
  };
}

/** A rounded rectangle path. Same helper the HUD uses, kept local. */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw a room, in room coordinates. The caller has already translated so that
 * (0, 0) is the room's top-left corner.
 *
 * @param placed    { [spotIndex]: furnitureId } — what he has put in here
 * @param clock     seconds, for the pulse on the empty spots
 * @param drawPiece how to draw one piece of furniture. Passed in rather than
 *                  imported: furniture.js is the catalog and this file is the
 *                  room, and having them import each other would be a cycle.
 */
export function drawRoom(ctx, room, placed, clock, drawPiece = () => {}) {
  const C = I();

  // Floor.
  ctx.fillStyle = room.floor;
  ctx.fillRect(0, 0, room.w, room.h);

  // Boards or tiles, drawn faintly over it so the floor has a grain and the
  // room does not read as a flat coloured rectangle.
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (room.boards) {
    for (let x = C.TILE; x < room.w; x += C.TILE) {
      ctx.moveTo(x, C.WALL); ctx.lineTo(x, room.h);
    }
  } else {
    for (let x = C.TILE; x < room.w; x += C.TILE) {
      ctx.moveTo(x, C.WALL); ctx.lineTo(x, room.h);
    }
    for (let y = C.WALL + C.TILE; y < room.h; y += C.TILE) {
      ctx.moveTo(0, y); ctx.lineTo(room.w, y);
    }
  }
  ctx.stroke();

  // The back wall, in the same colour as the outside of the house.
  ctx.fillStyle = room.wall;
  ctx.fillRect(0, 0, room.w, C.WALL);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, C.WALL - 4, room.w, 4);

  // Windows, showing sky.
  for (const win of room.windows) {
    ctx.fillStyle = '#BFE3F5';
    roundRectPath(ctx, win.x, 5, win.w, C.WALL - 14, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // The fixed pieces, under everything he places.
  for (const f of room.fixed) {
    if (f.kind === 'rug') {
      // Solid, with a border. At 30% white it was a faint smudge on the floor
      // and did not read as a rug at all — which defeats the only reason the
      // fixed pieces exist, which is that an undecorated room should still
      // look like somebody lives in it.
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      roundRectPath(ctx, f.x, f.y, f.w, f.h, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#E8EDF2';                     // mattress
      roundRectPath(ctx, f.x, f.y, f.w, f.h, 8);
      ctx.fill();
      ctx.fillStyle = '#7FB6E0';                     // blanket
      roundRectPath(ctx, f.x, f.y + f.h * 0.42, f.w, f.h * 0.58, 8);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';                     // pillow
      roundRectPath(ctx, f.x + 10, f.y + 9, f.w - 20, 22, 6);
      ctx.fill();
    }
  }

  // The way out. A mat, so it reads as a doorway from the inside.
  ctx.fillStyle = '#8C6A4A';
  roundRectPath(ctx, room.mat.x, room.mat.y, room.mat.w, room.mat.h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRectPath(ctx, room.mat.x + 8, room.mat.y + 7, room.mat.w - 16, room.mat.h - 14, 4);
  ctx.fill();
}

/**
 * The empty decorating spots, pulsing gently.
 *
 * Drawn separately from the room and AFTER the player, so a spot he is
 * standing on is still visible — the thing he is about to tap must never be
 * hidden by his own feet.
 */
export function drawSpots(ctx, room, placed, clock) {
  const C = I();
  const pulse = 0.5 + 0.5 * Math.sin(clock * 2.2);

  room.spots.forEach((spot, i) => {
    if (placed && placed[i]) return;        // filled spots do not glow
    ctx.save();
    ctx.globalAlpha = 0.30 + 0.30 * pulse;
    ctx.fillStyle = '#FFF3B0';
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, C.SPOT_R * (0.86 + 0.14 * pulse), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  });
}
