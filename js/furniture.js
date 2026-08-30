/**
 * furniture.js — What can go in a room, and how each piece is drawn.
 *
 * Every piece is drawn by code. There are no images in this game and there is
 * not going to be one for a chair.
 *
 * Bought once, placed freely: `save.unlocked.furniture` is a list of ids he
 * owns, and `save.rooms[seed][spotIndex]` is which one he put where.
 */

import { CONFIG } from './config.js';

export const FURNITURE = CONFIG.FURNITURE;

/** What a piece costs. 0 means it was always free. */
export function priceOfFurniture(id) {
  const f = FURNITURE.find((x) => x.id === id);
  return f ? f.price : 0;
}

/** Is this piece free, or already bought? */
export function isFurnitureUnlocked(id, save) {
  const f = FURNITURE.find((x) => x.id === id);
  if (!f) return false;
  if (f.price === 0) return true;
  const list = save.unlocked && save.unlocked.furniture;
  return Array.isArray(list) && list.includes(id);
}

/**
 * Draw one piece around (0, 0), sized to fit a box `size` across.
 *
 * The caller has already translated. Everything is drawn from the middle so a
 * piece looks the same in the picker as it does standing in the room.
 */
export function drawFurniture(ctx, id, size) {
  const u = size / 48;
  ctx.save();

  const wood = '#B98A5A';
  const darkWood = '#8C6A4A';

  if (id === 'stool') {
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, -4 * u, 15 * u, 7 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darkWood;
    ctx.fillRect(-11 * u, -2 * u, 4 * u, 14 * u);
    ctx.fillRect(7 * u, -2 * u, 4 * u, 14 * u);

  } else if (id === 'chair') {
    ctx.fillStyle = '#E07A5F';
    ctx.fillRect(-13 * u, -18 * u, 5 * u, 20 * u);          // back
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15 * u, 7 * u, 0, 0, Math.PI * 2);    // seat
    ctx.fill();
    ctx.fillStyle = darkWood;
    ctx.fillRect(-11 * u, 2 * u, 4 * u, 14 * u);
    ctx.fillRect(7 * u, 2 * u, 4 * u, 14 * u);

  } else if (id === 'table') {
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, -4 * u, 22 * u, 10 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darkWood;
    ctx.fillRect(-2 * u, 2 * u, 4 * u, 16 * u);
    ctx.fillRect(-14 * u, 14 * u, 28 * u, 4 * u);

  } else if (id === 'lamp') {
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.moveTo(-13 * u, -4 * u);
    ctx.lineTo(13 * u, -4 * u);
    ctx.lineTo(8 * u, -20 * u);
    ctx.lineTo(-8 * u, -20 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = darkWood;
    ctx.fillRect(-2 * u, -4 * u, 4 * u, 20 * u);
    ctx.fillRect(-9 * u, 14 * u, 18 * u, 4 * u);

  } else if (id === 'plant') {
    ctx.fillStyle = '#7BB661';
    for (const a of [-0.9, -0.3, 0.3, 0.9]) {
      ctx.beginPath();
      ctx.ellipse(Math.sin(a) * 9 * u, -12 * u - Math.cos(a) * 5 * u,
                  6 * u, 11 * u, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#C08A7A';
    ctx.beginPath();
    ctx.moveTo(-10 * u, 0);
    ctx.lineTo(10 * u, 0);
    ctx.lineTo(7 * u, 16 * u);
    ctx.lineTo(-7 * u, 16 * u);
    ctx.closePath();
    ctx.fill();

  } else if (id === 'shelf') {
    ctx.fillStyle = darkWood;
    ctx.fillRect(-18 * u, -18 * u, 36 * u, 4 * u);
    ctx.fillRect(-18 * u, -2 * u, 36 * u, 4 * u);
    ctx.fillRect(-18 * u, 14 * u, 36 * u, 4 * u);
    const books = ['#E07A5F', '#7BB661', '#6C9BD1', '#FFD166'];
    books.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect((-16 + i * 8) * u, -14 * u, 6 * u, 12 * u);
      ctx.fillRect((-16 + i * 8) * u, 2 * u, 6 * u, 12 * u);
    });

  } else if (id === 'picture') {
    ctx.fillStyle = darkWood;
    ctx.fillRect(-18 * u, -14 * u, 36 * u, 28 * u);
    ctx.fillStyle = '#BFE3F5';
    ctx.fillRect(-14 * u, -10 * u, 28 * u, 20 * u);
    ctx.fillStyle = '#7BB661';
    ctx.beginPath();
    ctx.moveTo(-14 * u, 10 * u);
    ctx.lineTo(-2 * u, -2 * u);
    ctx.lineTo(10 * u, 10 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.arc(8 * u, -5 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();

  } else if (id === 'chest') {
    ctx.fillStyle = wood;
    ctx.fillRect(-18 * u, -6 * u, 36 * u, 22 * u);
    ctx.fillStyle = darkWood;
    ctx.beginPath();
    ctx.moveTo(-18 * u, -6 * u);
    ctx.lineTo(18 * u, -6 * u);
    ctx.lineTo(14 * u, -18 * u);
    ctx.lineTo(-14 * u, -18 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFD166';
    ctx.fillRect(-4 * u, -4 * u, 8 * u, 9 * u);
  }

  ctx.restore();
}
