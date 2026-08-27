/**
 * ui.js — The customisation menu.
 *
 * Three rows of colour dots: hat, shirt, car. Tapping a dot applies it
 * immediately — there is no "confirm" step and no text anywhere, because the
 * player may not read yet. Each row has a picture on the left showing what it
 * changes, drawn in the colour currently chosen, so there is always something
 * to look at even when the change isn't visible on the town behind.
 *
 * Every control is a circle, which lets the menu reuse the same round-button
 * hit testing the driving controls already use.
 */

import { CONFIG } from './config.js';

export class Menu {
  constructor() {
    this.open = false;
  }

  toggle() {
    this.open = !this.open;
  }

  // =====================================================================
  // Layout
  //
  // Worked out from the canvas size every frame rather than stored, so the
  // menu survives the phone being rotated or the browser chrome sliding away.
  // =====================================================================
  layout(w, h) {
    // Big dots, spread across the full width. A 6-year-old's aim is not
    // precise, so target size matters more here than tidy spacing does.
    const r = Math.min(34, h * 0.095);
    const firstX = w * 0.175;
    const lastX = w - r - 24;
    const gap = (lastX - firstX) / (CONFIG.HAT_PALETTE.length - 1);

    // The close button sits exactly where the open button was, so the corner
    // reads as one control that toggles rather than two that nearly overlap.
    const opener = Menu.openerPos(w, h);

    return {
      r,
      gap,
      firstX,
      previewX: w * 0.075,
      // Pushed down far enough that the top row clears the close button.
      rowY: [h * 0.33, h * 0.56, h * 0.79],
      close: { x: opener.x, y: opener.y, r: opener.r + 2 },
    };
  }

  /** Where the menu button itself lives when the menu is shut. */
  static openerPos(w, h) {
    return { x: w - 52, y: 52, r: 26 };
  }

  /** The rows, in order. Kept as data so milestone 5 can mark items locked. */
  rows() {
    return [
      { id: 'hat', count: CONFIG.HAT_PALETTE.length },
      { id: 'shirt', count: CONFIG.SHIRT_PALETTE.length },
      { id: 'car', count: CONFIG.CAR_BODY_PALETTE.length },
    ];
  }

  /** Round buttons for the input layer: every swatch, plus close. */
  buttons(w, h) {
    const L = this.layout(w, h);
    const out = [{ id: 'menu-close', x: L.close.x, y: L.close.y, r: L.close.r }];

    this.rows().forEach((row, ri) => {
      for (let i = 0; i < row.count; i++) {
        out.push({
          id: `${row.id}:${i}`,
          x: L.firstX + i * L.gap,
          y: L.rowY[ri],
          r: L.r,
        });
      }
    });
    return out;
  }

  // =====================================================================
  // Drawing
  // =====================================================================

  /** @param choice { hat, shirt, car } — the selected index in each row */
  draw(ctx, w, h, choice) {
    const L = this.layout(w, h);

    // Dim the town behind so the dots are unmistakably the thing to press.
    ctx.fillStyle = 'rgba(20,24,34,0.62)';
    ctx.fillRect(0, 0, w, h);

    this.rows().forEach((row, ri) => {
      const y = L.rowY[ri];

      // The picture that says what this row changes.
      ctx.save();
      ctx.translate(L.previewX, y);
      if (row.id === 'hat') drawHatPreview(ctx, choice.hat);
      else if (row.id === 'shirt') drawShirtPreview(ctx, choice.shirt);
      else drawCarPreview(ctx, choice.car);
      ctx.restore();

      // The colour dots.
      for (let i = 0; i < row.count; i++) {
        const x = L.firstX + i * L.gap;
        const picked = choice[row.id] === i;
        const rr = picked ? L.r * 1.12 : L.r;

        ctx.fillStyle = swatchColour(row.id, i);
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = picked ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
        ctx.lineWidth = picked ? 5 : 2.5;
        ctx.stroke();
      }
    });

    // Close: a big friendly tick, not an X. Nothing here can go wrong, so
    // the way out should look like "done", not like "cancel".
    ctx.fillStyle = '#5AC85A';
    ctx.beginPath();
    ctx.arc(L.close.x, L.close.y, L.close.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();

    const t = L.close.r * 0.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(L.close.x - t, L.close.y);
    ctx.lineTo(L.close.x - t * 0.15, L.close.y + t * 0.75);
    ctx.lineTo(L.close.x + t, L.close.y - t * 0.7);
    ctx.stroke();
  }

  /** The little three-dot button that opens the menu. */
  drawOpener(ctx, w, h, held) {
    const b = Menu.openerPos(w, h);
    const r = held ? b.r - 2 : b.r;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.arc(b.x, b.y + (held ? 2 : 5), r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Three colour dots — a palette, which reads as "change how things look"
    // to someone who cannot read the word "options".
    const dots = ['#FF6B6B', '#4EA8FF', '#FFD23F'];
    const d = r * 0.30;
    const positions = [[-d, -d * 0.5], [d, -d * 0.5], [0, d]];
    positions.forEach((p, i) => {
      ctx.fillStyle = dots[i];
      ctx.beginPath();
      ctx.arc(b.x + p[0], b.y + p[1], r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/** The colour a given swatch shows. */
export function swatchColour(rowId, i) {
  if (rowId === 'hat') return CONFIG.HAT_PALETTE[i].crown;
  if (rowId === 'shirt') return CONFIG.SHIRT_PALETTE[i];
  return CONFIG.CAR_BODY_PALETTE[i];
}

// ---------------------------------------------------------------------------
// Row pictures. Drawn around (0, 0); the caller has already translated.
// ---------------------------------------------------------------------------

function drawHatPreview(ctx, idx) {
  const hat = CONFIG.HAT_PALETTE[idx];

  ctx.fillStyle = hat.brim;
  ctx.beginPath();
  ctx.ellipse(0, 12, 26, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hat.crown;
  ctx.beginPath();
  ctx.arc(0, 0, 19, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-19, 0, 38, 8);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(-6, -8, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawShirtPreview(ctx, idx) {
  ctx.fillStyle = CONFIG.SHIRT_PALETTE[idx];

  // Body
  roundRect(ctx, -16, -12, 32, 32, 7);
  ctx.fill();
  // Sleeves
  roundRect(ctx, -28, -12, 14, 16, 6); ctx.fill();
  roundRect(ctx, 14, -12, 14, 16, 6); ctx.fill();

  // Collar
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, -7, -14, 14, 7, 3);
  ctx.fill();
}

function drawCarPreview(ctx, idx) {
  const body = CONFIG.CAR_BODY_PALETTE[idx];
  const roof = CONFIG.CAR_ROOF_PALETTE[idx];

  ctx.fillStyle = '#3A3A42';
  roundRect(ctx, -22, -19, 10, 8, 3); ctx.fill();
  roundRect(ctx, 12, -19, 10, 8, 3); ctx.fill();
  roundRect(ctx, -22, 11, 10, 8, 3); ctx.fill();
  roundRect(ctx, 12, 11, 10, 8, 3); ctx.fill();

  ctx.fillStyle = body;
  roundRect(ctx, -17, -25, 34, 50, 9);
  ctx.fill();

  ctx.fillStyle = '#BFE6F5';
  roundRect(ctx, -12, -19, 24, 9, 3); ctx.fill();
  roundRect(ctx, -12, 11, 24, 8, 3); ctx.fill();

  ctx.fillStyle = roof;
  roundRect(ctx, -13, -8, 26, 17, 5);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Job icons.
//
// These are the only way the player is told what a job is, so the same picture
// has to work everywhere it appears: on the badge over a neighbour's head, on
// the action button, on the beacon at the destination, and in the corner while
// the job is in progress. They are drawn around (0, 0) at roughly 2 * `size`
// across, so the caller can translate and scale freely.
// ---------------------------------------------------------------------------

export function drawMissionIcon(ctx, type, size) {
  if (type === 'pizza') drawPizza(ctx, size);
  else if (type === 'ride') drawFriends(ctx, size);
  else if (type === 'race') drawFlag(ctx, size);
  else drawTeddy(ctx, size);
}

/** Two friends side by side — "come with me". */
function drawFriends(ctx, s) {
  const u = s / 16;

  // The one behind, slightly smaller and offset.
  ctx.fillStyle = '#7FB8FF';
  ctx.beginPath(); ctx.arc(5 * u, -3 * u, 6.5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5E95E0';
  roundRect(ctx, -0.5 * u, 3 * u, 11 * u, 10 * u, 4 * u); ctx.fill();

  // The one in front.
  ctx.fillStyle = '#FFD23F';
  ctx.beginPath(); ctx.arc(-5 * u, -4 * u, 7.5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FF6B6B';
  roundRect(ctx, -11 * u, 2.5 * u, 12 * u, 11 * u, 4.5 * u); ctx.fill();
}

/** A chequered flag. */
function drawFlag(ctx, s) {
  const u = s / 16;

  // Pole.
  ctx.fillStyle = '#8B5E3C';
  roundRect(ctx, -11 * u, -13 * u, 3 * u, 27 * u, 1.5 * u); ctx.fill();

  // Chequers: a 4 x 3 board of alternating squares.
  const cell = 4.5 * u;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#2B2B33' : '#FFFFFF';
      ctx.fillRect(-8 * u + col * cell, -12 * u + row * cell, cell + 0.5, cell + 0.5);
    }
  }
}

/** A slice of pizza, point down. */
function drawPizza(ctx, s) {
  const u = s / 16;

  // Crust along the top.
  ctx.fillStyle = '#E8A33D';
  ctx.beginPath();
  ctx.moveTo(-13 * u, -10 * u);
  ctx.lineTo(13 * u, -10 * u);
  ctx.lineTo(11 * u, -4 * u);
  ctx.lineTo(-11 * u, -4 * u);
  ctx.closePath();
  ctx.fill();

  // Cheese, tapering to a point.
  ctx.fillStyle = '#FFD98A';
  ctx.beginPath();
  ctx.moveTo(-12 * u, -6 * u);
  ctx.lineTo(12 * u, -6 * u);
  ctx.lineTo(0, 14 * u);
  ctx.closePath();
  ctx.fill();

  // Pepperoni.
  ctx.fillStyle = '#E5484D';
  for (const [px, py, pr] of [[-5, -1, 2.6], [5, -1, 2.6], [0, 6, 2.4]]) {
    ctx.beginPath();
    ctx.arc(px * u, py * u, pr * u, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A teddy bear's head. */
function drawTeddy(ctx, s) {
  const u = s / 16;

  ctx.fillStyle = '#A9743F';
  ctx.beginPath(); ctx.arc(-9 * u, -9 * u, 4.6 * u, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(9 * u, -9 * u, 4.6 * u, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#C08A50';
  ctx.beginPath(); ctx.arc(0, 0, 12 * u, 0, Math.PI * 2); ctx.fill();

  // Muzzle.
  ctx.fillStyle = '#E8CBA6';
  ctx.beginPath(); ctx.ellipse(0, 4.5 * u, 6.5 * u, 5 * u, 0, 0, Math.PI * 2); ctx.fill();

  // Eyes and nose.
  ctx.fillStyle = '#3A2A1C';
  ctx.beginPath(); ctx.arc(-4.5 * u, -2.5 * u, 1.9 * u, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4.5 * u, -2.5 * u, 1.9 * u, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 2.5 * u, 2.4 * u, 1.9 * u, 0, 0, Math.PI * 2); ctx.fill();
}

/** The rounded speech bubble a neighbour's job icon sits in. */
export function drawBadge(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.arc(x, y + 4, r, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  // Little tail pointing down at whoever is talking.
  ctx.beginPath();
  ctx.moveTo(x - r * 0.34, y + r * 0.72);
  ctx.lineTo(x + r * 0.16, y + r * 0.72);
  ctx.lineTo(x - r * 0.10, y + r * 1.42);
  ctx.closePath();
  ctx.fill();
}
