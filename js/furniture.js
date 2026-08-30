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

  const wood = '#8A5A32';
  const darkWood = '#5E3D22';

  // Every piece is drawn with a dark outline round it.
  //
  // Without one, a piece whose colour happens to match the floor it is
  // standing on simply is not there: the wood was the exact same brown as one
  // of the five floors, and a chair bought and placed on that floor showed
  // nothing but its legs. Chasing the clashes one at a time is hopeless —
  // nine colours against five floors is forty-five pairs, and every new piece
  // or new floor adds more. An outline means the shape always reads, whatever
  // it is standing on and whatever gets added later.
  ctx.strokeStyle = 'rgba(50,34,22,0.85)';
  ctx.lineWidth = 2 * u;
  ctx.lineJoin = 'round';
  const box = (x, y, w, h) => { ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); };
  const blob = () => { ctx.fill(); ctx.stroke(); };

  if (id === 'stool') {
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, -4 * u, 15 * u, 7 * u, 0, 0, Math.PI * 2);
    blob();
    ctx.fillStyle = darkWood;
    box(-11 * u, -2 * u, 4 * u, 14 * u);
    box(7 * u, -2 * u, 4 * u, 14 * u);

  } else if (id === 'chair') {
    // A wide back across the whole seat, not a single post.
    //
    // It was a thin bar up one side, and at this size that read as a stick
    // standing next to a stool — and the stool is the piece immediately
    // before this one in the list. Two things he cannot tell apart are worth
    // less than one, when the only way he can choose is by the picture.
    ctx.fillStyle = '#E07A5F';
    box(-14 * u, -20 * u, 28 * u, 13 * u);         // the back
    ctx.fillStyle = darkWood;
    box(-12 * u, -9 * u, 3 * u, 10 * u);           // the posts holding it up
    box(9 * u, -9 * u, 3 * u, 10 * u);

    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15 * u, 7 * u, 0, 0, Math.PI * 2);    // seat
    blob();
    ctx.fillStyle = darkWood;
    box(-11 * u, 2 * u, 4 * u, 14 * u);
    box(7 * u, 2 * u, 4 * u, 14 * u);

  } else if (id === 'table') {
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, -4 * u, 22 * u, 10 * u, 0, 0, Math.PI * 2);
    blob();
    ctx.fillStyle = darkWood;
    box(-2 * u, 2 * u, 4 * u, 16 * u);
    box(-14 * u, 14 * u, 28 * u, 4 * u);

  } else if (id === 'lamp') {
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.moveTo(-13 * u, -4 * u);
    ctx.lineTo(13 * u, -4 * u);
    ctx.lineTo(8 * u, -20 * u);
    ctx.lineTo(-8 * u, -20 * u);
    ctx.closePath();
    blob();
    ctx.fillStyle = darkWood;
    box(-2 * u, -4 * u, 4 * u, 20 * u);
    box(-9 * u, 14 * u, 18 * u, 4 * u);

  } else if (id === 'plant') {
    ctx.fillStyle = '#7BB661';
    for (const a of [-0.9, -0.3, 0.3, 0.9]) {
      ctx.beginPath();
      ctx.ellipse(Math.sin(a) * 9 * u, -12 * u - Math.cos(a) * 5 * u,
                  6 * u, 11 * u, a, 0, Math.PI * 2);
      blob();
    }
    ctx.fillStyle = '#C08A7A';
    ctx.beginPath();
    ctx.moveTo(-10 * u, 0);
    ctx.lineTo(10 * u, 0);
    ctx.lineTo(7 * u, 16 * u);
    ctx.lineTo(-7 * u, 16 * u);
    ctx.closePath();
    blob();

  } else if (id === 'shelf') {
    ctx.fillStyle = darkWood;
    box(-18 * u, -18 * u, 36 * u, 4 * u);
    box(-18 * u, -2 * u, 36 * u, 4 * u);
    box(-18 * u, 14 * u, 36 * u, 4 * u);
    const books = ['#E07A5F', '#7BB661', '#6C9BD1', '#FFD166'];
    books.forEach((c, i) => {
      ctx.fillStyle = c;
      box((-16 + i * 8) * u, -14 * u, 6 * u, 12 * u);
      box((-16 + i * 8) * u, 2 * u, 6 * u, 12 * u);
    });

  } else if (id === 'picture') {
    ctx.fillStyle = darkWood;
    box(-18 * u, -14 * u, 36 * u, 28 * u);
    ctx.fillStyle = '#BFE3F5';
    box(-14 * u, -10 * u, 28 * u, 20 * u);
    ctx.fillStyle = '#7BB661';
    ctx.beginPath();
    ctx.moveTo(-14 * u, 10 * u);
    ctx.lineTo(-2 * u, -2 * u);
    ctx.lineTo(10 * u, 10 * u);
    ctx.closePath();
    blob();
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.arc(8 * u, -5 * u, 4 * u, 0, Math.PI * 2);
    blob();

  } else if (id === 'chest') {
    ctx.fillStyle = wood;
    box(-18 * u, -6 * u, 36 * u, 22 * u);
    ctx.fillStyle = darkWood;
    ctx.beginPath();
    ctx.moveTo(-18 * u, -6 * u);
    ctx.lineTo(18 * u, -6 * u);
    ctx.lineTo(14 * u, -18 * u);
    ctx.lineTo(-14 * u, -18 * u);
    ctx.closePath();
    blob();
    ctx.fillStyle = '#FFD166';
    box(-4 * u, -4 * u, 8 * u, 9 * u);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// The picker: a compact overlay for choosing one piece.
//
// Deliberately NOT the full-screen shop. The shop is for changing what he
// wears; this appears where he tapped, shows pictures and prices, and gets out
// of the way. Two different jobs, two different shapes.
// ---------------------------------------------------------------------------

const PICKER = { r: 30, gap: 74, cols: 4, padY: 26 };

/** Where each choice sits, given the screen size. Also used for hit-testing. */
export function pickerButtons(w, h) {
  const rows = Math.ceil(FURNITURE.length / PICKER.cols);
  const gridW = (PICKER.cols - 1) * PICKER.gap;
  const gridH = (rows - 1) * PICKER.gap;
  const x0 = w / 2 - gridW / 2;
  const y0 = h / 2 - gridH / 2 + PICKER.padY;

  const out = FURNITURE.map((f, i) => ({
    id: `furniture:${f.id}`,
    x: x0 + (i % PICKER.cols) * PICKER.gap,
    y: y0 + Math.floor(i / PICKER.cols) * PICKER.gap,
    r: PICKER.r,
  }));

  // Clearing the spot, and closing without choosing.
  out.push({ id: 'furniture:none', x: w / 2 - 46, y: y0 + gridH + 76, r: PICKER.r });
  out.push({ id: 'picker-close',   x: w / 2 + 46, y: y0 + gridH + 76, r: PICKER.r });
  return out;
}

/**
 * @param save   for coins and what has been bought
 * @param shake  { id, amount } — a locked piece being wobbled after a failed
 *               purchase, which is how "not enough coins yet" is said without
 *               any words
 */
export function drawPicker(ctx, w, h, save, shake) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,24,34,0.72)';
  ctx.fillRect(0, 0, w, h);

  for (const b of pickerButtons(w, h)) {
    const wobble = shake && shake.id === b.id
      ? Math.sin(shake.amount * 30) * 6 : 0;
    ctx.save();
    ctx.translate(b.x + wobble, b.y);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();

    if (b.id === 'picker-close') {
      // A tick: done here.
      ctx.strokeStyle = '#3A3A42';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-11, 1); ctx.lineTo(-3, 9); ctx.lineTo(12, -9);
      ctx.stroke();
    } else if (b.id === 'furniture:none') {
      // An empty spot: take whatever is here away.
      ctx.strokeStyle = '#9AA0AC';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const id = b.id.split(':')[1];
      const owned = isFurnitureUnlocked(id, save);
      ctx.globalAlpha = owned ? 1 : 0.45;
      drawFurniture(ctx, id, 40);
      ctx.globalAlpha = 1;

      if (!owned) {
        // A coin and a number. Digits are the one kind of text he reads.
        const price = priceOfFurniture(id);
        ctx.fillStyle = '#FFD166';
        ctx.beginPath();
        ctx.arc(0, b.r - 2, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3A3A42';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(price), 0, b.r - 1);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
