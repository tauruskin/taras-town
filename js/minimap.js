/**
 * minimap.js — A little picture of the whole town, in the corner.
 *
 * The town is 6144x4608 and a phone shows about a fortieth of it at a time,
 * which is easy to get lost in. This draws the lot, small, with a dot for
 * where you are.
 *
 * The map itself never changes — it is generated from a fixed seed — so it is
 * painted ONCE into an offscreen canvas and then simply stamped into the
 * corner each frame. Redrawing nine thousand tiles every frame to fill a
 * hundred pixels would be a silly way to spend a phone's battery.
 *
 * ONLY YOU ARE SHOWN ON IT. Not the other players — this game is mostly used
 * for hide-and-seek, and a map with everybody's position on it would end that
 * in about four seconds.
 */

import { CONFIG } from './config.js';
import { T } from './world.js';
import { roundRect } from './world.js';

/** How wide the minimap is, as a fraction of the screen, and its limits. */
const WIDTH_FRACTION = 0.17;
const MIN_WIDTH = 76;
const MAX_WIDTH = 132;

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
    this.canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w.cols, w.rows)
      : Object.assign(document.createElement('canvas'), { width: w.cols, height: w.rows });

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
        ctx.fillRect(c, r, 1, 1);
      }
    }

    // Buildings, so the town reads as streets of houses rather than a grid of
    // coloured squares.
    for (const b of w.buildings) {
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x / w.tile, b.y / w.tile, b.w / w.tile, b.h / w.tile);
    }
  }

  /** Where the minimap sits on screen, in screen pixels. */
  static rect(w, h, world) {
    const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w * WIDTH_FRACTION));
    const height = width * (world.height / world.width);
    return {
      // Tucked under the row of round buttons in the top corner.
      x: w - width - 16,
      y: 90,
      w: width,
      h: height,
    };
  }

  /**
   * @param at      where the player is, in world coordinates
   * @param driving whether they are in a vehicle, which changes the marker
   */
  draw(ctx, w, h, at, driving) {
    const world = this.world;
    const r = Minimap.rect(w, h, world);

    ctx.save();

    // A soft dark card behind it, so the map reads against a bright town.
    ctx.fillStyle = 'rgba(20,24,34,0.55)';
    roundRect(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 10);
    ctx.fill();

    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, 7);
    ctx.clip();
    // The town itself, stretched from its one-pixel-per-tile version.
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.canvas, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    roundRect(ctx, r.x, r.y, r.w, r.h, 7);
    ctx.stroke();

    // You. A white ring round a red dot, which stays visible over green park,
    // grey road and blue water alike.
    const px = r.x + (at.x / world.width) * r.w;
    const py = r.y + (at.y / world.height) * r.h;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px, py, driving ? 6 : 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = driving ? '#FF9F45' : '#E5484D';
    ctx.beginPath();
    ctx.arc(px, py, driving ? 4 : 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
