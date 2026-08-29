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
    // Four rows now, so the dots are smaller than they were with three. Still
    // as big as will fit: a 6-year-old's aim is not precise, and target size
    // matters more here than tidy spacing does.
    const r = Math.min(26, h * 0.072);
    const firstX = w * 0.175;
    const lastX = w - r - 20;

    // Spacing comes from the LONGEST row, so every row lines up in a column
    // even though the vehicle row has fewer items than the colour rows.
    const widest = Math.max(...this.rows().map((row) => row.count));
    const gap = (lastX - firstX) / (widest - 1);

    // The close button sits exactly where the open button was, so the corner
    // reads as one control that toggles rather than two that nearly overlap.
    const opener = Menu.openerPos(w, h);

    const closeR = opener.r + 2;

    // Where the rows may start.
    //
    // This used to be a plain fraction of the height, "pushed down far enough
    // that the top row clears the close button" — which it does on a roomy
    // screen and does NOT on a squat one. On a short landscape phone the top
    // row rose under the corner buttons and the last hat colour could not be
    // chosen at all: the tap landed on the done button instead. Nothing looked
    // wrong, which is exactly why it went unnoticed.
    //
    // So the top is now derived from what is actually up there rather than
    // guessed, and the rows are spread through whatever is left. See
    // offline/menu-buttons, which presses the middle of every button at a
    // range of screen sizes and checks the right one answers.
    const rowsN = this.rows().length;
    const biggestR = r * Math.max(...this.rows().map((row) => row.scale || 1));
    const top = Math.max(h * 0.30, opener.y + closeR + r + 8);
    const bottom = h - biggestR - 8;
    const step = rowsN > 1 ? (bottom - top) / (rowsN - 1) : 0;

    return {
      r,
      gap,
      firstX,
      previewX: w * 0.075,
      rowY: Array.from({ length: rowsN }, (_, i) => top + i * step),
      close: { x: opener.x, y: opener.y, r: closeR },
    };
  }

  /** Where the menu button itself lives when the menu is shut. */
  static openerPos(w, h) {
    return { x: w - 52, y: 52, r: 26 };
  }

  /**
   * The way back to the opening screen — for leaving a game you are playing
   * with somebody else and carrying on by yourself.
   *
   * It lives INSIDE the menu rather than out on the playing screen on purpose.
   * Leaving cuts you off from whoever you were playing with, and a single
   * stray finger beside the joystick should not be able to do that; having to
   * open the menu first makes it two deliberate taps. It sits in the same top
   * corner row as the sound and done buttons, which is where this game keeps
   * things that are about the game rather than about the town.
   */
  static homePos(w, h) {
    return { x: w - 180, y: 52, r: 26 };
  }

  /** The rows, in order. Kept as data so milestone 5 can mark items locked. */
  rows() {
    return [
      { id: 'hat', count: CONFIG.HAT_PALETTE.length },
      { id: 'shirt', count: CONFIG.SHIRT_PALETTE.length },
      { id: 'car', count: CONFIG.CAR_BODY_PALETTE.length },
      // The vehicle row shows little pictures rather than colour dots,
      // because a coloured circle cannot tell you a bus from a sports car.
      //
      // Its buttons are bigger than the colour dots on purpose: a colour only
      // has to be one recognisable hue, but telling a jeep from a bus needs
      // enough room to actually see the shape.
      { id: 'vehicle', count: CONFIG.VEHICLES.length, pictures: true, scale: 1.35 },
    ];
  }

  /** Round buttons for the input layer: every swatch, plus close and home. */
  buttons(w, h) {
    const L = this.layout(w, h);
    const out = [{ id: 'menu-close', x: L.close.x, y: L.close.y, r: L.close.r }];

    this.rows().forEach((row, ri) => {
      for (let i = 0; i < row.count; i++) {
        out.push({
          id: `${row.id}:${i}`,
          x: L.firstX + i * L.gap,
          y: L.rowY[ri],
          r: L.r * (row.scale || 1),
        });
      }
    });

    // Home goes LAST on purpose. A tap is matched against this list in order,
    // and on a short landscape screen the top row of swatches rises close
    // enough to the corner buttons to overlap. Whoever is listed first wins
    // such a tie, and choosing a colour is the thing he does constantly while
    // leaving the game is the thing he does once — so the swatch must win.
    // Home stays comfortably reachable at its own centre, which is what
    // offline/menu-buttons checks, at every screen size worth caring about.
    const home = Menu.homePos(w, h);
    out.push({ id: 'menu-home', x: home.x, y: home.y, r: home.r });
    return out;
  }

  // =====================================================================
  // Drawing
  // =====================================================================

  /**
   * What this item costs. 0 means it was always free.
   *
   * Colours are all the same modest price, with the first few free so there
   * is always something to change with an empty purse. Vehicles carry their
   * own prices, which climb steeply — saving up for the bus is meant to be a
   * proper undertaking.
   */
  static priceOf(rowId, i) {
    if (rowId === 'vehicle') {
      const v = CONFIG.VEHICLES[i];
      return v ? v.price : 0;
    }
    return i < CONFIG.SHOP.FREE_PER_ROW ? 0 : CONFIG.SHOP.PRICE;
  }

  /** Is this item free, or already bought? */
  static isUnlocked(rowId, i, save) {
    if (Menu.priceOf(rowId, i) === 0) return true;
    const list = save.unlocked && save.unlocked[rowId];
    return Array.isArray(list) && list.includes(i);
  }

  /**
   * @param choice { hat, shirt, car } — the selected index in each row
   * @param save   the whole save, for coins and what has been bought
   * @param shake  { id, amount } — a locked dot being wobbled after a failed
   *               purchase, which is how "not enough coins yet" is said
   *               without any words
   */
  draw(ctx, w, h, choice, save, shake) {
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
      else if (row.id === 'vehicle') drawVehiclePicture(ctx, choice.vehicle, 58, choice.car);
      else drawCarPreview(ctx, choice.car);
      ctx.restore();

      // The colour dots.
      for (let i = 0; i < row.count; i++) {
        const id = row.id + ':' + i;
        let x = L.firstX + i * L.gap;
        const picked = choice[row.id] === i;
        const unlocked = Menu.isUnlocked(row.id, i, save);
        const base = L.r * (row.scale || 1);
        const rr = picked ? base * 1.12 : base;

        // A locked dot that has just been pressed without enough coins wobbles.
        if (shake && shake.id === id) x += Math.sin(shake.amount * 34) * 9;

        ctx.save();
        // Locked items are shown, not hidden: seeing what there is to work
        // towards is the whole point of having anything to buy.
        if (!unlocked) ctx.globalAlpha = row.pictures ? 0.62 : 0.42;

        if (row.pictures) {
          // A dark disc to sit the picture on, so a pale vehicle still reads
          // against the dimmed town behind the menu.
          ctx.fillStyle = 'rgba(20,24,34,0.55)';
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();
          ctx.translate(x, y);
          drawVehiclePicture(ctx, i, rr * 2.05, choice.car);
          ctx.restore();
        } else {
          ctx.fillStyle = swatchColour(row.id, i);
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = picked ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
        ctx.lineWidth = picked ? 5 : 2.5;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const price = Menu.priceOf(row.id, i);
        if (!unlocked) drawPrice(ctx, x, y, base, price, save.coins >= price);
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

/**
 * The price on a locked colour: a coin and a number.
 *
 * A digit is the one piece of text a 6-year-old reliably reads, and the coin
 * beside it says what the number means. When there is enough saved up the tag
 * turns gold, so "I can have that one now" is visible at a glance without
 * having to compare two numbers.
 */
function drawPrice(ctx, x, y, r, price, affordable) {
  const label = String(price);
  // Wide enough for the number it actually holds: "400" needs more room than
  // "10", and a tag that clips its own price is worse than no tag.
  const wide = 34 + label.length * 9;
  const cy = y + r * 0.78;

  ctx.save();
  ctx.fillStyle = affordable ? '#FFD23F' : 'rgba(20,24,34,0.86)';
  roundRect(ctx, x - wide / 2, cy - 11, wide, 22, 11);
  ctx.fill();
  ctx.strokeStyle = affordable ? '#FFFFFF' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Small coin.
  const coinX = x - wide / 2 + 12;
  ctx.fillStyle = affordable ? '#B87A0C' : '#E0A81F';
  ctx.beginPath(); ctx.arc(coinX, cy, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = affordable ? '#FFF0A8' : '#FFD23F';
  ctx.beginPath(); ctx.arc(coinX, cy, 4.2, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = affordable ? '#3A2A00' : '#FFFFFF';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, coinX + 9, cy + 1);
  ctx.restore();
}

/**
 * A small picture of a vehicle, seen from above, drawn around (0, 0).
 *
 * Deliberately a simplified silhouette rather than a scaled-down copy of the
 * real drawing code: at this size the windows and lights of the full version
 * turn into mud, and what matters is only that a bus is instantly not a
 * sports car.
 */
export function drawVehiclePicture(ctx, index, size, colourIndex = 0) {
  const v = CONFIG.VEHICLES[index] || CONFIG.VEHICLES[0];
  const body = CONFIG.CAR_BODY_PALETTE[colourIndex % CONFIG.CAR_BODY_PALETTE.length];
  const roof = CONFIG.CAR_ROOF_PALETTE[colourIndex % CONFIG.CAR_ROOF_PALETTE.length];

  // Every vehicle is scaled by the SAME factor, set by the longest one, so
  // their relative sizes survive: the bus genuinely looks longer than the car.
  //
  // Scaling each one individually to fill its circle — the obvious thing to
  // do — squeezed the bus down to the same length as the hatchback and threw
  // away the single clearest difference between them.
  const longest = Math.max(...CONFIG.VEHICLES.map((x) => x.LENGTH));
  const scale = (size * 0.92) / longest;
  const L = v.LENGTH * scale;
  const W = v.WIDTH * scale;

  ctx.save();
  ctx.rotate(-Math.PI / 2);        // nose towards the top of the screen

  // Wheels first, so they sit under the body — except the monster truck's,
  // which are big enough to show either side, which is how you know it.
  // Wheels sized relative to the vehicle, not in fixed pixels, so the monster
  // truck's still visibly stick out past its body at this size.
  // Lighter than the real thing: these sit on a dark disc, where the almost
  // black of the in-game wheels simply disappears — taking the monster
  // truck's one defining feature with it.
  const k = v.wheel;
  ctx.fillStyle = '#79808F';
  const wx = L * 0.28, wy = W / 2;
  const wl = L * 0.24 * k, wt = W * 0.20 * k;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      roundRect(ctx, sx * wx - wl / 2, sy * wy - wt / 2, wl, wt, Math.min(wl, wt) * 0.4);
      ctx.fill();
    }
  }

  ctx.fillStyle = body;
  if (v.shape === 'sports') {
    ctx.beginPath();
    ctx.moveTo(L / 2, 0);
    ctx.lineTo(L * 0.22, -W / 2);
    ctx.lineTo(-L * 0.46, -W / 2);
    ctx.quadraticCurveTo(-L / 2, 0, -L * 0.46, W / 2);
    ctx.lineTo(L * 0.22, W / 2);
    ctx.closePath();
    ctx.fill();
  } else if (v.shape === 'monster') {
    roundRect(ctx, -L * 0.26, -W * 0.40, L * 0.62, W * 0.80, 2.5);
    ctx.fill();
  } else {
    roundRect(ctx, -L / 2, -W / 2, L, W, v.shape === 'jeep' ? 1.5 : 3);
    ctx.fill();
  }

  // One roof panel, which is enough to stop each shape reading as a plain
  // coloured block.
  ctx.fillStyle = roof;
  if (v.shape === 'bus') {
    roundRect(ctx, -L * 0.42, -W / 2 + 1.5, L * 0.84, 2, 1); ctx.fill();
    roundRect(ctx, -L * 0.42, W / 2 - 3.5, L * 0.84, 2, 1); ctx.fill();
  } else if (v.shape === 'monster') {
    roundRect(ctx, -L * 0.20, -W * 0.36, L * 0.32, W * 0.72, 2); ctx.fill();
  } else {
    roundRect(ctx, -L * 0.24, -W / 2 + 2, L * 0.34, W - 4, 2); ctx.fill();
  }

  ctx.restore();
}

/**
 * The sound button: a speaker, with waves coming out of it when sound is on
 * and a line struck through it when it is off.
 *
 * Both states are drawn as a speaker rather than one being an empty space, so
 * it always looks like the same button doing the same job.
 */
export function drawSoundButton(ctx, x, y, r, on, held) {
  const rr = held ? r - 2 : r;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(x, y + (held ? 2 : 5), rr, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y);
  const u = rr / 26;
  const body = on ? '#3A3A42' : '#9AA0AC';

  // The speaker: a little box with a cone opening out of it.
  ctx.fillStyle = body;
  roundRect(ctx, -11 * u, -5 * u, 7 * u, 10 * u, 2 * u);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4 * u, -4.5 * u);
  ctx.lineTo(3 * u, -11 * u);
  ctx.lineTo(3 * u, 11 * u);
  ctx.lineTo(-4 * u, 4.5 * u);
  ctx.closePath();
  ctx.fill();

  if (on) {
    // Two arcs of sound coming out.
    ctx.strokeStyle = body;
    ctx.lineWidth = 2.6 * u;
    ctx.lineCap = 'round';
    for (const rad of [7, 12]) {
      ctx.beginPath();
      ctx.arc(4 * u, 0, rad * u, -0.9, 0.9);
      ctx.stroke();
    }
  } else {
    // A red line through it. Unmistakable, and needs no reading.
    ctx.strokeStyle = '#E5484D';
    ctx.lineWidth = 4 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(5 * u, -10 * u);
    ctx.lineTo(15 * u, 10 * u);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The way back to the opening screen: a little house.
 *
 * A house is the one picture that says "back to the start" to somebody who
 * cannot read "menu" — it is the same idea as the home button on the phone
 * itself, which he already knows.
 */
export function drawHomeButton(ctx, x, y, r, held) {
  const rr = held ? r - 2 : r;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(x, y + (held ? 2 : 5), rr, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y);
  const u = rr / 26;

  ctx.fillStyle = '#3A3A42';
  // Roof, drawn wider than the walls so the shape reads as a house and not
  // as an arrow at this size.
  ctx.beginPath();
  ctx.moveTo(-13 * u, -1 * u);
  ctx.lineTo(0, -12.5 * u);
  ctx.lineTo(13 * u, -1 * u);
  ctx.closePath();
  ctx.fill();

  // Walls.
  roundRect(ctx, -9 * u, -2 * u, 18 * u, 13 * u, 2 * u);
  ctx.fill();

  // A doorway punched back out in white, which is what stops the walls
  // reading as a plain dark block.
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, -3.5 * u, 3 * u, 7 * u, 8 * u, 1.5 * u);
  ctx.fill();

  ctx.restore();
}

/**
 * A player's name, on a small sign floating over their head.
 *
 * Drawn in SCREEN coordinates, not world ones, so it stays the same crisp
 * size whatever the world happens to be scaled to — a name that grew and
 * shrank with the zoom would be unreadable at exactly the moments it matters.
 *
 * The dark pill is what makes it legible: this town is bright green grass and
 * bright grey road, and white text alone disappears against half of it.
 */
export function drawNameplate(ctx, x, y, name) {
  const label = String(name == null ? '' : name).slice(0, 10);
  if (!label) return;

  ctx.save();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const high = 21;
  const wide = ctx.measureText(label).width + 18;

  ctx.fillStyle = 'rgba(20,24,34,0.62)';
  roundRect(ctx, x - wide / 2, y - high / 2, wide, high, high / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
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

  // A long tail reaching down towards whoever is talking. The stubby original
  // left the bubble looking like a balloon floating on its own.
  ctx.beginPath();
  ctx.moveTo(x - r * 0.40, y + r * 0.66);
  ctx.lineTo(x + r * 0.22, y + r * 0.66);
  ctx.lineTo(x - r * 0.06, y + r * 1.95);
  ctx.closePath();
  ctx.fill();
}
