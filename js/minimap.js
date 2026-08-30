/**
 * minimap.js — Two maps: a round one in the corner, and the whole town.
 *
 * THE CORNER ONE IS ZOOMED IN, and that is the whole point of it. The first
 * version showed the entire town shrunk into ninety pixels, which looked tidy
 * and told you nothing — at that size the streets are a pixel wide and one
 * green smudge is much like another. It now shows the ground immediately
 * around the player, at a size where a road looks like a road, and you are
 * always in the middle of it.
 *
 * It is a CIRCLE. A round map has no corners to misread, it sits under the row
 * of round buttons as though it belongs with them, and being round is itself a
 * reminder that what it shows is "near you" rather than "the town".
 *
 * THE WHOLE TOWN is still there, and still useful — it is what you get by
 * tapping the circle, and it fills the screen.
 *
 * The map never changes, being generated from a fixed seed, so it is painted
 * ONCE into an offscreen canvas and then simply stamped out each frame.
 * Redrawing nine thousand tiles every frame would be a silly way to spend a
 * phone's battery.
 *
 * ONLY YOU ARE SHOWN ON IT. Not the other players — this game is mostly used
 * for hide-and-seek, and a map with everybody's position on it would end that
 * in about four seconds.
 */

import { CONFIG } from './config.js';
import { T } from './world.js';
import { roundRect } from './world.js';

/** How wide the corner map is, as a fraction of the screen, and its limits. */
const WIDTH_FRACTION = 0.12;
const MIN_WIDTH = 53;
const MAX_WIDTH = 92;

/**
 * How much ground the corner map shows, in map squares across.
 *
 * About two screens' worth. Enough to see the next junction and which way the
 * water is, without shrinking back into the unreadable smudge the whole-town
 * version was.
 */
const TILES_ACROSS = 26;

/**
 * How big the offscreen copy of the town is, in pixels per map square.
 *
 * One pixel per square was enough when the whole town was squeezed into the
 * corner. Zoomed in, one pixel per square is a mess of enormous blocks, so the
 * copy is drawn four times finer. It costs a 384x288 canvas, which is nothing.
 */
const TOWN_PX = 4;

export class Minimap {
  constructor(world) {
    this.world = world;
    this.canvas = null;
    this._paintTown();
  }

  /**
   * Paint the town once, one pixel per tile, into an offscreen canvas.
   *
   * Buildings go on afterwards as rectangles rather than as tiles, because a
   * building is not a tile kind — it sits on top of the ground.
   */
  _paintTown() {
    const w = this.world;

    // OffscreenCanvas is not on older iOS Safari, so fall back to a plain
    // detached <canvas>, which works everywhere and costs nothing here.
    const pw = w.cols * TOWN_PX;
    const ph = w.rows * TOWN_PX;

    this.canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(pw, ph)
      : Object.assign(document.createElement('canvas'), { width: pw, height: ph });

    const ctx = this.canvas.getContext('2d');
    const C = CONFIG.COLORS;

    const colourOf = (kind) => {
      switch (kind) {
        case T.ROAD:     return C.ROAD;
        case T.SIDEWALK: return C.SIDEWALK;
        case T.WATER:    return C.WATER;
        case T.PARK:     return C.PARK;
        case T.SAND:     return C.SAND;
        default:         return C.GRASS;
      }
    };

    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        ctx.fillStyle = colourOf(w.grid[r][c]);
        ctx.fillRect(c * TOWN_PX, r * TOWN_PX, TOWN_PX, TOWN_PX);
      }
    }

    // Buildings, so the town reads as streets of houses rather than a grid of
    // coloured squares.
    const k = TOWN_PX / w.tile;
    for (const b of w.buildings) {
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x * k, b.y * k, b.w * k, b.h * k);
    }
  }

  /**
   * Where the corner map sits, as a circle: middle and radius.
   *
   * Tucked under the row of round buttons, lined up with the one in the very
   * corner so the whole group reads as one column of controls.
   */
  static circle(w, h) {
    const size = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w * WIDTH_FRACTION));
    const r = size / 2;
    // Positioned by ITS OWN radius, not the buttons'. Lining the middle up
    // with the button above it hung the circle nine pixels off the side of
    // the screen, because it is more than twice as wide as a button.
    return {
      x: w - CONFIG.UI.EDGE - r,
      y: CONFIG.UI.EDGE + CONFIG.UI.BUTTON_R * 2 + 16 + r,
      r,
    };
  }

  /**
   * Draw the town into a given box, with the player on it and a frame around
   * whatever is currently on screen.
   *
   * The frame is the useful part. A dot alone says where you are but nothing
   * about how much of the town you can see — and on a map this size a phone
   * shows about a fortieth of it, which is impossible to guess.
   */
  _paintInto(ctx, r, at, driving, view) {
    const world = this.world;

    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 7);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.canvas, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;

    // What is on screen right now.
    if (view) {
      const vx = r.x + (view.x / world.width) * r.w;
      const vy = r.y + (view.y / world.height) * r.h;
      const vw = Math.max(3, (view.w / world.width) * r.w);
      const vh = Math.max(3, (view.h / world.height) * r.h);

      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(vx, vy, vw, vh);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(vx, vy, vw, vh);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    roundRect(ctx, r.x, r.y, r.w, r.h, 7);
    ctx.stroke();

    // You. A white ring round a red dot, which stays visible over green park,
    // grey road and blue water alike.
    const px = r.x + (at.x / world.width) * r.w;
    const py = r.y + (at.y / world.height) * r.h;
    // Small on both sizes of map. Scaled purely by width it came out twenty
    // pixels across on the full map and swallowed the view frame — the very
    // thing the frame is there to show.
    const dot = Math.max(3.5, Math.min(7, r.w * 0.045));

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px, py, dot + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = driving ? '#FF9F45' : '#E5484D';
    ctx.beginPath();
    ctx.arc(px, py, dot, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * The whole town, filling the screen, for when the little one is not enough.
   *
   * Opened by tapping the corner map. Everything else is dimmed behind it, the
   * same way the shop is, so it is obvious that this is a thing to look at and
   * then close rather than part of the game.
   */
  drawFull(ctx, w, h, at, view) {
    const world = this.world;

    ctx.save();
    ctx.fillStyle = 'rgba(20,24,34,0.72)';
    ctx.fillRect(0, 0, w, h);

    // As big as fits, keeping the town's proportions.
    const margin = 26;
    const scale = Math.min((w - margin * 2) / world.width,
                           (h - margin * 2) / world.height);
    const bw = world.width * scale;
    const bh = world.height * scale;
    const r = { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };

    ctx.fillStyle = 'rgba(20,24,34,0.55)';
    roundRect(ctx, r.x - 5, r.y - 5, r.w + 10, r.h + 10, 12);
    ctx.fill();

    this._paintInto(ctx, r, at, false, view);
    ctx.restore();
  }

  /**
   * The round map in the corner: the ground around the player, zoomed in.
   *
   * North stays up. Rotating the map to face the way he is walking is a common
   * trick and the wrong one here — a 6-year-old reading a map that spins has
   * to work out which way is which every time he turns round.
   *
   * @param at    where the player is, in world coordinates
   * @param view  the visible world rectangle, drawn as a frame
   */
  draw(ctx, w, h, at, driving, view) {
    const world = this.world;
    const c = Minimap.circle(w, h);

    // How much ground fits across the circle, and how many offscreen pixels
    // that is.
    const worldAcross = TILES_ACROSS * world.tile;
    const srcSize = TILES_ACROSS * TOWN_PX;
    const perWorld = (c.r * 2) / worldAcross;      // screen px per world px

    ctx.save();

    // The dark ring it sits on, drawn slightly larger so the map has an edge.
    ctx.fillStyle = 'rgba(20,24,34,0.55)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.clip();

    // Beyond the edge of the world there is nothing to draw, so fill first —
    // otherwise the last row of the town smears outwards, which reads as land
    // that is not there.
    ctx.fillStyle = 'rgba(30,40,54,0.95)';
    ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);

    // The window of the town around the player.
    const k = TOWN_PX / world.tile;
    const sx = at.x * k - srcSize / 2;
    const sy = at.y * k - srcSize / 2;

    ctx.imageSmoothingEnabled = false;   // crisp streets, not a blur
    ctx.drawImage(this.canvas, sx, sy, srcSize, srcSize,
                  c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);

    // A frame around what is actually on screen, so the zoom is legible: it
    // says "this much of what you can see" without needing any words.
    if (view) {
      const vw = view.w * perWorld;
      const vh = view.h * perWorld;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - vw / 2, c.y - vh / 2, vw, vh);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.stroke();

    // You, always in the middle. A white ring round a coloured dot, which
    // stays visible over green park, grey road and blue water alike.
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = driving ? '#FF9F45' : '#E5484D';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
