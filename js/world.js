/**
 * world.js — The town of Taras Town: its map, its scenery and its walls.
 *
 * The map is a grid of tiles (grass / road / sidewalk / water / park).
 * The grid is generated from a short description of where the roads and the
 * river run, rather than being typed out square by square, so the layout is
 * easy to change: edit H_ROADS / V_ROADS / the building list below.
 *
 * Anything the player cannot walk through is an axis-aligned rectangle in
 * `this.solids`. Collision is a plain rectangle-overlap test — there are only
 * a hundred or so of them, which is nothing for a phone to check each frame.
 */

import { CONFIG } from './config.js';

// Tile kinds
export const T = {
  GRASS: 0,
  ROAD: 1,
  SIDEWALK: 2,
  WATER: 3,
  PARK: 4,
  SAND: 5,
};

// --- Layout description -------------------------------------------------
// Roads are two tiles wide so a car has a lane in each direction later on.
const H_ROADS = [[6, 7], [16, 17], [26, 27]];   // rows
const V_ROADS = [[5, 6], [18, 19], [31, 32], [40, 41]]; // columns

const RIVER_START_COL = 44;   // river runs from here to the right edge
const SAND_COL = 43;          // sandy bank beside it
const ROAD_END_COL = 42;      // roads stop before the bank

// The park: a whole block with no buildings in it.
const PARK = { c0: 21, c1: 29, r0: 19, r1: 24 };

// Houses and shops, in tile coordinates. tw/th are width/height in tiles.
const BUILDINGS = [
  // Top band
  { tx: 1,  ty: 1,  tw: 3, th: 3 },
  { tx: 8,  ty: 1,  tw: 4, th: 4 },
  { tx: 13, ty: 1,  tw: 4, th: 4 },
  { tx: 21, ty: 1,  tw: 5, th: 4, shop: true },
  { tx: 27, ty: 1,  tw: 4, th: 4, shop: true },
  { tx: 34, ty: 1,  tw: 5, th: 4 },

  // Second band
  { tx: 1,  ty: 10, tw: 3, th: 3 },
  { tx: 8,  ty: 9,  tw: 4, th: 3 },
  { tx: 13, ty: 9,  tw: 4, th: 3 },
  { tx: 8,  ty: 12, tw: 4, th: 3 },
  { tx: 13, ty: 12, tw: 4, th: 3 },
  { tx: 21, ty: 9,  tw: 4, th: 3, shop: true },
  { tx: 26, ty: 9,  tw: 4, th: 3, shop: true },
  { tx: 21, ty: 12, tw: 4, th: 3 },
  { tx: 26, ty: 12, tw: 4, th: 3 },
  { tx: 34, ty: 9,  tw: 5, th: 3 },
  { tx: 34, ty: 12, tw: 5, th: 3 },

  // Third band (the park fills the middle block)
  { tx: 1,  ty: 20, tw: 3, th: 3 },
  { tx: 8,  ty: 19, tw: 4, th: 3 },
  { tx: 13, ty: 19, tw: 4, th: 3 },
  { tx: 8,  ty: 22, tw: 4, th: 3 },
  { tx: 13, ty: 22, tw: 4, th: 3 },
  { tx: 34, ty: 19, tw: 5, th: 3, shop: true },
  { tx: 34, ty: 22, tw: 5, th: 3 },

  // Bottom band
  { tx: 1,  ty: 30, tw: 3, th: 3 },
  { tx: 8,  ty: 29, tw: 4, th: 3 },
  { tx: 13, ty: 29, tw: 4, th: 3 },
  { tx: 8,  ty: 32, tw: 4, th: 3 },
  { tx: 13, ty: 32, tw: 4, th: 3 },
  { tx: 21, ty: 29, tw: 5, th: 4, shop: true },
  { tx: 27, ty: 29, tw: 3, th: 3 },
  { tx: 34, ty: 29, tw: 5, th: 3 },
  { tx: 34, ty: 33, tw: 5, th: 2 },
];

/**
 * A tiny deterministic "random" number from a pair of coordinates.
 * Same input always gives the same output, so the town looks identical every
 * time it loads without us storing any of it.
 */
function hash(x, y) {
  // Math.imul keeps the multiplications as true 32-bit integers. Using plain
  // `*` here overflows into floating point and quietly throws away the low
  // bits, which made neighbouring squares produce near-identical numbers —
  // that showed up in-game as trees planted in tidy rows.
  let n = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export class World {
  constructor() {
    this.cols = CONFIG.MAP_COLS;
    this.rows = CONFIG.MAP_ROWS;
    this.tile = CONFIG.TILE;
    this.width = this.cols * this.tile;
    this.height = this.rows * this.tile;

    this.grid = [];       // tile kinds
    this.buildings = [];  // drawn + solid
    this.trees = [];      // drawn on top of the player, solid trunk
    this.props = [];      // fountain, pond, benches
    this.solids = [];     // every rectangle the player cannot enter

    this._buildGrid();
    this._buildBuildings();
    this._buildParkProps();
    this._buildTrees();
    this._collectSolids();

    // A safe spot on the pavement near the middle of town.
    this.spawn = { x: 20.5 * this.tile, y: 18.5 * this.tile };
  }

  // =====================================================================
  // Map generation
  // =====================================================================
  _buildGrid() {
    const { cols, rows } = this;

    // 1. Everything starts as grass.
    for (let r = 0; r < rows; r++) {
      this.grid[r] = new Array(cols).fill(T.GRASS);
    }

    // 2. The river down the right-hand edge, with a sandy bank.
    for (let r = 0; r < rows; r++) {
      for (let c = RIVER_START_COL; c < cols; c++) this.grid[r][c] = T.WATER;
      this.grid[r][SAND_COL] = T.SAND;
    }

    // 3. The park block.
    for (let r = PARK.r0; r <= PARK.r1; r++) {
      for (let c = PARK.c0; c <= PARK.c1; c++) this.grid[r][c] = T.PARK;
    }

    // 4. Roads.
    for (const [rA, rB] of H_ROADS) {
      for (let r = rA; r <= rB; r++) {
        for (let c = 0; c <= ROAD_END_COL; c++) this.grid[r][c] = T.ROAD;
      }
    }
    for (const [cA, cB] of V_ROADS) {
      for (let c = cA; c <= cB; c++) {
        for (let r = 0; r < rows; r++) this.grid[r][c] = T.ROAD;
      }
    }

    // 5. Pavement: any non-road, non-water tile touching a road.
    //    Done from a snapshot so freshly-made pavement doesn't spread.
    const snapshot = this.grid.map((row) => row.slice());
    const touchesRoad = (r, c) =>
      (snapshot[r - 1]?.[c] === T.ROAD) || (snapshot[r + 1]?.[c] === T.ROAD) ||
      (snapshot[r][c - 1] === T.ROAD)   || (snapshot[r][c + 1] === T.ROAD);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = snapshot[r][c];
        if (t === T.ROAD || t === T.WATER || t === T.SAND) continue;
        if (touchesRoad(r, c)) this.grid[r][c] = T.SIDEWALK;
      }
    }
  }

  _buildBuildings() {
    const tile = this.tile;
    BUILDINGS.forEach((b, i) => {
      // Roof and wall come from the same slot in their two lists, so the
      // wall is always the deeper version of that building's roof colour.
      const slot = (i * 3) % CONFIG.ROOF_PALETTE.length;
      const roof = CONFIG.ROOF_PALETTE[slot];
      const wall = CONFIG.WALL_PALETTE[slot];
      this.buildings.push({
        x: b.tx * tile,
        y: b.ty * tile,
        w: b.tw * tile,
        h: b.th * tile,
        wall,
        roof,
        shop: !!b.shop,
        seed: i,
      });
    });
  }

  _buildParkProps() {
    const tile = this.tile;

    // A fountain to run around.
    this.props.push({
      kind: 'fountain',
      x: 25 * tile, y: 20 * tile, w: 2 * tile, h: 2 * tile,
    });

    // A duck pond.
    this.props.push({
      kind: 'pond',
      x: 21.6 * tile, y: 22.2 * tile, w: 3.2 * tile, h: 1.9 * tile,
    });

    // Benches beside the fountain. Low enough to be scenery, but solid.
    this.props.push({ kind: 'bench', x: 23.3 * tile, y: 20.6 * tile, w: 46, h: 18 });
    this.props.push({ kind: 'bench', x: 27.4 * tile, y: 20.6 * tile, w: 46, h: 18 });
  }

  _buildTrees() {
    const tile = this.tile;

    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        const t = this.grid[r][c];
        if (t !== T.GRASS && t !== T.PARK) continue;

        // Denser planting inside the park than in back gardens.
        const chance = t === T.PARK ? 0.55 : 0.42;
        const h = hash(c, r);
        if (h > chance) continue;

        // Nudge each tree off the exact centre of its square, otherwise a
        // whole row of them shares a y coordinate and the grid shows.
        const cx = c * tile + tile * (0.28 + hash(c + 911, r) * 0.44);
        const cy = r * tile + tile * (0.28 + hash(c, r + 733) * 0.44);

        // Skip anywhere already occupied so nothing grows through a wall.
        if (this._pointInAny(cx, cy, 26)) continue;

        this.trees.push({
          x: cx,
          y: cy,
          scale: 0.8 + hash(r + 401, c + 57) * 0.45,   // a bit of size variety
          seed: (c * 31 + r) % 100,
        });
      }
    }
  }

  /** Helper used while planting: is this spot already taken? */
  _pointInAny(x, y, pad) {
    const boxes = [...this.buildings, ...this.props];
    for (const b of boxes) {
      if (x > b.x - pad && x < b.x + b.w + pad &&
          y > b.y - pad && y < b.y + b.h + pad) return true;
    }
    return false;
  }

  _collectSolids() {
    // Buildings block completely.
    for (const b of this.buildings) {
      this.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    }

    // Park props block.
    for (const p of this.props) {
      this.solids.push({ x: p.x, y: p.y, w: p.w, h: p.h });
    }

    // Tree trunks block, but only a small square — you can brush past the
    // leaves, which keeps walking through the park from feeling sticky.
    for (const t of this.trees) {
      const s = 13 * t.scale;
      this.solids.push({ x: t.x - s / 2, y: t.y - s / 2 + 6, w: s, h: s });
    }

    // The river. One big rectangle covering the water tiles.
    this.solids.push({
      x: RIVER_START_COL * this.tile,
      y: 0,
      w: (this.cols - RIVER_START_COL) * this.tile,
      h: this.height,
    });
  }

  // =====================================================================
  // Collision
  // =====================================================================

  /**
   * Move a box from (x, y) by (dx, dy), stopping at anything solid.
   * Each axis is resolved separately, which is what lets the player slide
   * along a wall instead of sticking to it.
   *
   * @param extra  additional rectangles to treat as solid for this move —
   *               used for cars, which move about and so cannot live in the
   *               fixed `solids` list.
   * @returns { x, y, blocked } — the new centre, and whether anything was hit.
   */
  moveBox(x, y, halfW, halfH, dx, dy, extra) {
    let blocked = false;

    let nx = x + dx;
    if (this._overlaps(nx, y, halfW, halfH, extra)) { nx = x; blocked = true; }

    let ny = y + dy;
    if (this._overlaps(nx, ny, halfW, halfH, extra)) { ny = y; blocked = true; }

    // Never leave the map.
    const cx = Math.min(Math.max(nx, halfW), this.width - halfW);
    const cy = Math.min(Math.max(ny, halfH), this.height - halfH);
    if (cx !== nx || cy !== ny) blocked = true;

    return { x: cx, y: cy, blocked };
  }

  _overlaps(cx, cy, halfW, halfH, extra) {
    const l = cx - halfW, r = cx + halfW;
    const t = cy - halfH, b = cy + halfH;

    for (const s of this.solids) {
      if (r > s.x && l < s.x + s.w && b > s.y && t < s.y + s.h) return true;
    }
    if (extra) {
      for (const s of extra) {
        if (r > s.x && l < s.x + s.w && b > s.y && t < s.y + s.h) return true;
      }
    }
    return false;
  }

  // =====================================================================
  // Drawing
  // =====================================================================

  /**
   * Ground tiles. Only the squares actually on screen are drawn, so the size
   * of the map costs us nothing.
   * `view` is the visible world rectangle: { x, y, w, h }.
   */
  drawGround(ctx, view, time) {
    const C = CONFIG.COLORS;
    const tile = this.tile;

    const c0 = Math.max(0, Math.floor(view.x / tile));
    const c1 = Math.min(this.cols - 1, Math.ceil((view.x + view.w) / tile));
    const r0 = Math.max(0, Math.floor(view.y / tile));
    const r1 = Math.min(this.rows - 1, Math.ceil((view.y + view.h) / tile));

    // --- pass 1: flat base colour for every visible square ---------------
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        switch (this.grid[r][c]) {
          case T.ROAD:     ctx.fillStyle = C.ROAD; break;
          case T.SIDEWALK: ctx.fillStyle = C.SIDEWALK; break;
          case T.PARK:     ctx.fillStyle = C.PARK; break;
          case T.WATER:    ctx.fillStyle = C.WATER; break;
          case T.SAND:     ctx.fillStyle = C.SAND; break;
          default:         ctx.fillStyle = C.GRASS; break;
        }
        // +1 on the size hides hairline seams between squares when the
        // whole scene is drawn at a fractional zoom.
        ctx.fillRect(c * tile, r * tile, tile + 1, tile + 1);
      }
    }

    // --- pass 2: scattered detail, grouped by colour so the canvas only
    //             has to change brush a handful of times per frame -------
    this._drawTufts(ctx, r0, r1, c0, c1, T.GRASS, C.GRASS_TUFT);
    this._drawTufts(ctx, r0, r1, c0, c1, T.PARK, C.PARK_TUFT);
    this._drawTufts(ctx, r0, r1, c0, c1, T.SAND, C.SAND_SPECK);
    this._drawPavingJoints(ctx, r0, r1, c0, c1);
    this._drawKerbs(ctx, r0, r1, c0, c1);

    this._drawRoadMarkings(ctx, view);
    this._drawWaterSparkle(ctx, view, time);
  }

  /** Little tufts of grass (or grains of sand) so open ground isn't blank. */
  _drawTufts(ctx, r0, r1, c0, c1, kind, colour) {
    const tile = this.tile;
    ctx.fillStyle = colour;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.grid[r][c] !== kind) continue;

        // Two tufts per square, always in the same spot for a given square.
        for (let i = 0; i < 2; i++) {
          const hx = hash(c * 2 + i, r);
          const hy = hash(c, r * 2 + i);
          ctx.fillRect(
            c * tile + 6 + hx * (tile - 18),
            r * tile + 6 + hy * (tile - 14),
            9, 4,
          );
        }
      }
    }
  }

  /** Paving-slab joints, so pavement reads as pavement and not as sand. */
  _drawPavingJoints(ctx, r0, r1, c0, c1) {
    const tile = this.tile;
    const half = tile / 2;

    ctx.strokeStyle = CONFIG.COLORS.SIDEWALK_LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.grid[r][c] !== T.SIDEWALK) continue;
        const x = c * tile, y = r * tile;
        ctx.moveTo(x, y + half); ctx.lineTo(x + tile, y + half);
        ctx.moveTo(x + half, y); ctx.lineTo(x + half, y + tile);
      }
    }
    ctx.stroke();
  }

  /** A darker line wherever pavement meets road — the kerb. */
  _drawKerbs(ctx, r0, r1, c0, c1) {
    const tile = this.tile;

    ctx.strokeStyle = CONFIG.COLORS.KERB;
    ctx.lineWidth = 4;
    ctx.beginPath();

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.grid[r][c] !== T.ROAD) continue;
        const x = c * tile, y = r * tile;

        if (this.grid[r - 1]?.[c] === T.SIDEWALK) { ctx.moveTo(x, y); ctx.lineTo(x + tile, y); }
        if (this.grid[r + 1]?.[c] === T.SIDEWALK) { ctx.moveTo(x, y + tile); ctx.lineTo(x + tile, y + tile); }
        if (this.grid[r][c - 1] === T.SIDEWALK)   { ctx.moveTo(x, y); ctx.lineTo(x, y + tile); }
        if (this.grid[r][c + 1] === T.SIDEWALK)   { ctx.moveTo(x + tile, y); ctx.lineTo(x + tile, y + tile); }
      }
    }
    ctx.stroke();
  }

  _drawRoadMarkings(ctx, view) {
    ctx.save();
    ctx.strokeStyle = CONFIG.COLORS.ROAD_LINE;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.setLineDash([26, 22]);

    const tile = this.tile;

    // Centre line down the middle of each horizontal road.
    for (const [rA, rB] of H_ROADS) {
      const y = (rB) * tile; // boundary between the two lanes
      if (y < view.y - 20 || y > view.y + view.h + 20) continue;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, view.x - 40), y);
      ctx.lineTo(Math.min(ROAD_END_COL * tile + tile, view.x + view.w + 40), y);
      ctx.stroke();
    }

    // ...and each vertical road.
    for (const [cA, cB] of V_ROADS) {
      const x = (cB) * tile;
      if (x < view.x - 20 || x > view.x + view.w + 20) continue;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, view.y - 40));
      ctx.lineTo(x, Math.min(this.height, view.y + view.h + 40));
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawWaterSparkle(ctx, view, time) {
    const riverX = RIVER_START_COL * this.tile;
    if (view.x + view.w < riverX) return;   // river is off screen

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    const step = 70;
    const startY = Math.floor(view.y / step) * step;
    for (let y = startY; y < view.y + view.h + step; y += step) {
      for (let i = 0; i < 3; i++) {
        const x = riverX + 40 + i * 90 + Math.sin(time * 1.2 + y * 0.05 + i) * 12;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 26, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Buildings and park props — drawn underneath the player. */
  drawBuildings(ctx, view) {
    for (const p of this.props) {
      if (!this._onScreen(p, view)) continue;
      if (p.kind === 'fountain') this._drawFountain(ctx, p);
      else if (p.kind === 'pond') this._drawPond(ctx, p);
      else this._drawBench(ctx, p);
    }

    for (const b of this.buildings) {
      if (!this._onScreen(b, view)) continue;
      this._drawBuilding(ctx, b);
    }
  }

  /** Tree canopies — drawn on TOP of the player so they feel three-dimensional. */
  drawCanopies(ctx, view) {
    for (const t of this.trees) {
      if (t.x < view.x - 60 || t.x > view.x + view.w + 60) continue;
      if (t.y < view.y - 60 || t.y > view.y + view.h + 60) continue;
      this._drawTree(ctx, t);
    }
  }

  _onScreen(b, view) {
    return !(b.x + b.w < view.x - 40 || b.x > view.x + view.w + 40 ||
             b.y + b.h < view.y - 40 || b.y > view.y + view.h + 40);
  }

  // --- individual pieces of scenery ------------------------------------

  /**
   * A building seen from directly above: mostly roof, with a rim of wall
   * around it. The rim plus the drop shadow is what sells the height —
   * without it a building is just a coloured rectangle on the grass.
   */
  _drawBuilding(ctx, b) {
    const rim = Math.min(16, b.w * 0.11, b.h * 0.11);

    // Drop shadow.
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    roundRect(ctx, b.x + 6, b.y + 9, b.w, b.h, 10);
    ctx.fill();

    // The walls, seen edge-on from above.
    ctx.fillStyle = b.wall;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fill();

    // The roof.
    const rx = b.x + rim, ry = b.y + rim;
    const rw = b.w - rim * 2, rh = b.h - rim * 2;
    ctx.fillStyle = b.roof;
    roundRect(ctx, rx, ry, rw, rh, 7);
    ctx.fill();

    // Roof panelling: a few evenly spaced lines across it.
    ctx.save();
    roundRect(ctx, rx, ry, rw, rh, 7);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = ry + 26; y < ry + rh; y += 26) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    ctx.stroke();
    ctx.restore();

    // A skylight or two, placed from the building's own seed so it never
    // changes between loads.
    const lights = b.w > 200 ? 2 : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < lights; i++) {
      const hx = hash(b.seed * 7 + i, b.seed);
      const hy = hash(b.seed, b.seed * 5 + i);
      const s = 18;
      roundRect(ctx, rx + 10 + hx * (rw - 20 - s), ry + 10 + hy * (rh - 20 - s), s, s, 4);
      ctx.fill();
    }

    if (b.shop) {
      // A stripey awning along the front marks a shop.
      const stripeW = 18;
      const ay = b.y + b.h - 15;
      for (let x = b.x + 8; x < b.x + b.w - 8; x += stripeW) {
        ctx.fillStyle = ((x / stripeW) | 0) % 2 ? '#FFFFFF' : '#FF5D5D';
        ctx.fillRect(x, ay, Math.min(stripeW, b.x + b.w - 8 - x), 13);
      }
    } else {
      // A chimney, and a little front door.
      ctx.fillStyle = b.wall;
      roundRect(ctx, rx + rw - 30, ry + 8, 20, 20, 5);
      ctx.fill();

      ctx.fillStyle = '#7B4B2A';
      roundRect(ctx, b.x + b.w / 2 - 15, b.y + b.h - 17, 30, 13, 5);
      ctx.fill();
    }
  }

  _drawFountain(ctx, p) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const R = p.w / 2;

    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath(); ctx.ellipse(cx, cy + 8, R, R * 0.8, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#D8D2C4';               // stone rim
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.WATER;      // water
    ctx.beginPath(); ctx.arc(cx, cy, R - 11, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#D8D2C4';               // centre pillar
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
  }

  _drawPond(ctx, p) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;

    ctx.fillStyle = '#6FBF73';                // grassy edge
    ctx.beginPath();
    ctx.ellipse(cx, cy, p.w / 2 + 6, p.h / 2 + 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.WATER;
    ctx.beginPath();
    ctx.ellipse(cx, cy, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.WATER_LIGHT;
    ctx.beginPath();
    ctx.ellipse(cx - 14, cy - 8, p.w / 5, p.h / 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawBench(ctx, p) {
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    roundRect(ctx, p.x + 2, p.y + 5, p.w, p.h, 4); ctx.fill();

    ctx.fillStyle = '#A9743F';
    roundRect(ctx, p.x, p.y, p.w, p.h, 4); ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + 4, p.y + p.h / 2);
    ctx.lineTo(p.x + p.w - 4, p.y + p.h / 2);
    ctx.stroke();
  }

  _drawTree(ctx, t) {
    const s = t.scale;

    // Shadow on the ground.
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(t.x + 4, t.y + 20 * s, 22 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk.
    ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
    roundRect(ctx, t.x - 5 * s, t.y - 2 * s, 10 * s, 22 * s, 4);
    ctx.fill();

    // Canopy: three overlapping blobs so it isn't a plain circle.
    ctx.fillStyle = CONFIG.COLORS.TREE_LEAF;
    ctx.beginPath();
    ctx.arc(t.x - 13 * s, t.y - 4 * s, 17 * s, 0, Math.PI * 2);
    ctx.arc(t.x + 13 * s, t.y - 2 * s, 16 * s, 0, Math.PI * 2);
    ctx.arc(t.x, t.y - 18 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();

    // Highlight on the sunny side.
    ctx.fillStyle = CONFIG.COLORS.TREE_LEAF_HI;
    ctx.beginPath();
    ctx.arc(t.x - 5 * s, t.y - 20 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Rounded-rectangle path helper. Shared by several drawing routines. */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
