/**
 * world.js — The town of Taras Town: its map, its scenery and its walls.
 *
 * The map is a grid of tiles (grass / road / sidewalk / water / park).
 * The grid is generated from a short description of where the roads and the
 * river run, rather than being typed out square by square, so the layout is
 * easy to change: the whole town is generated from MAP_COLS and MAP_ROWS.
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
//
// The town is GENERATED from these few numbers rather than typed out block by
// block, which is what lets it be made much bigger by changing MAP_COLS and
// MAP_ROWS in config.js and nothing else.
//
// All of it is deterministic: the same numbers in give the same town out,
// every time, on every phone. That is why nothing about the map is ever saved
// or sent to another player — two phones running this code are already
// looking at exactly the same town.

// Roads are two tiles wide so a car has a lane in each direction.
const FIRST_ROAD_ROW = 6;
const FIRST_ROAD_COL = 5;
const ROAD_EVERY_ROWS = 10;
const ROAD_EVERY_COLS = 13;

// How much of the right-hand edge is river, plus its sandy bank.
//
// Wide enough to be somewhere you go rather than an edge you walk along: it
// can be swum in, it has islands out in the middle of it, and the things
// floating on it are cover in their own right.
const RIVER_TILES = 42;

/** How many islands are dropped into the river. */
const ISLANDS = 9;

// Roughly one block in four is left as parkland rather than built on. Parks
// are where most of the trees are, and trees are where you hide.
const PARK_CHANCE = 0.28;

/**
 * The gaps between a list of road bands — in other words, the blocks.
 *
 * @param roads sorted [start, end] pairs
 * @param lo    first index of the map
 * @param hi    last index worth using
 */
function bandsBetween(roads, lo, hi) {
  const out = [];
  let cur = lo;
  for (const [a, b] of roads) {
    if (a - 1 >= cur) out.push([cur, a - 1]);
    cur = b + 1;
  }
  if (hi >= cur) out.push([cur, hi]);
  return out;
}

/**
 * A tiny deterministic "random" number from a pair of coordinates.
 * Same input always gives the same output, so the town looks identical every
 * time it loads without us storing any of it.
 */
export function hash(x, y) {
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

    // Everything you can stand UNDER and be covered by: tree canopies, market
    // awnings, bus shelters, the bandstand. These are what make hide-and-seek
    // work, because they are drawn over the top of whoever is beneath them.
    this.canopies = [];

    this._plan();
    this._buildGrid();
    this._buildBuildings();
    this._buildParkProps();
    this._buildTrees();

    // Walls are gathered BEFORE the hiding places are put out, so that each
    // one can check a player could actually stand in it. Cover you bounce off
    // is scenery, not a hiding place, and nothing on screen tells you which is
    // which. Hiding places add no walls of their own, so nothing is missed by
    // doing it in this order.
    this._collectSolids();
    this._indexSolids();
    this._buildHidingPlaces();
    this._buildWaterHidingPlaces();

    // A safe spot on the pavement near the middle of town.
    this.spawn = this._findSpawn();
  }

  /**
   * Where the roads run, and what sits in the blocks between them.
   *
   * Worked out from the map size rather than listed by hand, so a bigger map
   * simply gets more streets and more blocks.
   */
  _plan() {
    this.riverCol = this.cols - RIVER_TILES;
    this.sandCol = this.riverCol - 1;
    this.roadEndCol = this.sandCol - 1;

    this.hRoads = [];
    for (let r = FIRST_ROAD_ROW; r <= this.rows - 4; r += ROAD_EVERY_ROWS) {
      this.hRoads.push([r, r + 1]);
    }
    this.vRoads = [];
    for (let c = FIRST_ROAD_COL; c <= this.roadEndCol - 3; c += ROAD_EVERY_COLS) {
      this.vRoads.push([c, c + 1]);
    }

    // The blocks are simply the gaps left over between the streets.
    const rowBands = bandsBetween(this.hRoads, 0, this.rows - 1);
    const colBands = bandsBetween(this.vRoads, 0, this.roadEndCol);

    this.blocks = [];
    for (const [r0, r1] of rowBands) {
      for (const [c0, c1] of colBands) {
        // Too thin to hold anything: leave it as grass between the roads.
        if (r1 - r0 < 2 || c1 - c0 < 2) continue;
        this.blocks.push({
          r0, r1, c0, c1,
          park: hash(c0 * 7 + 13, r0 * 5 + 3) < PARK_CHANCE,
        });
      }
    }

    // The block nearest the middle is always the town park, so there is one
    // proper green space with a fountain in it wherever the map size lands.
    const midR = this.rows / 2;
    const midC = this.roadEndCol / 2;
    let best = null;
    let bestD = Infinity;
    for (const b of this.blocks) {
      const d = Math.hypot((b.r0 + b.r1) / 2 - midR, (b.c0 + b.c1) / 2 - midC);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) { best.park = true; best.main = true; }
    this.mainPark = best;
  }

  /**
   * Somewhere sensible to start: near the middle, on dry land, in the open.
   *
   * "In the open" means not under a bush or a tree. It sounds like a detail
   * and is not: two children starting a game together both appear here, and
   * if the spot happens to be under cover they cannot see each other at all.
   * The first thing either of them would see is an empty town.
   */
  _findSpawn() {
    const tile = this.tile;
    const half = CONFIG.PLAYER.HITBOX / 2;
    const want = { x: (this.roadEndCol / 2) * tile, y: (this.rows / 2) * tile };

    // Spiral outwards from the middle until somewhere works.
    for (let radius = 0; radius < 1400; radius += 40) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = want.x + Math.cos(a) * radius;
        const y = want.y + Math.sin(a) * radius;
        if (x < 80 || y < 80 || x > this.width - 80 || y > this.height - 80) continue;
        if (this._overlaps(x, y, half, half, null)) continue;
        if (this.isWaterAt(x, y)) continue;
        if (this.hiddenAt(x, y)) continue;
        // Room to walk off in ANY direction. A spot can be free and still be
        // a slot between two walls, and starting a game unable to walk north
        // is a poor first impression.
        if (this.openness(x, y, half) < 0.8) continue;
        return { x, y };
      }
    }

    return this.findFreeSpot(want.x, want.y, half, null, 900) || want;
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
      for (let c = this.riverCol; c < cols; c++) this.grid[r][c] = T.WATER;
      this.grid[r][this.sandCol] = T.SAND;
    }

    // 2a. Islands out in the river, with sand all round them. Somewhere to
    //     swim TO, which is what turns a wide river into a place rather than
    //     a border — and a fine spot to be hiding when nobody thinks to swim.
    for (let i = 0; i < ISLANDS; i++) {
      const cy = Math.floor((i + 0.5) * (rows / ISLANDS) + hash(i * 31, 7) * 6 - 3);
      const cx = this.riverCol + 2 + Math.floor(hash(i, 91) * (RIVER_TILES - 5));
      const rx = 2 + Math.floor(hash(i + 5, 11) * 2);
      const ry = 2 + Math.floor(hash(i + 9, 23) * 2);

      for (let r = cy - ry; r <= cy + ry; r++) {
        for (let c = cx - rx; c <= cx + rx; c++) {
          if (r < 1 || c < 1 || r >= rows - 1 || c >= cols - 1) continue;
          const d = ((r - cy) / ry) ** 2 + ((c - cx) / rx) ** 2;
          if (d > 1) continue;
          this.grid[r][c] = d > 0.45 ? T.SAND : T.GRASS;
        }
      }
    }

    // 3. Every block that came out as parkland.
    for (const b of this.blocks) {
      if (!b.park) continue;
      for (let r = b.r0; r <= b.r1; r++) {
        for (let c = b.c0; c <= b.c1; c++) this.grid[r][c] = T.PARK;
      }
    }

    // 3b. A lake inland, so swimming is not a trek to one edge of the map.
    //     It goes in a park, where there is room and nothing to knock down.
    //
    //     AFTER the parks are painted, not before. Carving it first and then
    //     filling the park in over the top left no lake at all — and nothing
    //     about the map looked wrong, it was simply a park like the others.
    // The roomiest park that is not the town park, so the lake has space and
    // the fountain keeps its own green. Remembered, so the market does not
    // later try to set out its stalls in the water.
    const lakeBlock = this.blocks
      .filter((b) => b.park && !b.main && b.r1 - b.r0 >= 4 && b.c1 - b.c0 >= 6 &&
                     b.c1 < this.riverCol - 10)
      // Of the ones big enough, the nearest the middle of town: a lake tucked
      // against the river would just look like a bend in it.
      .sort((a, b) =>
        Math.hypot((a.c0 + a.c1) / 2 - this.roadEndCol / 2, (a.r0 + a.r1) / 2 - this.rows / 2) -
        Math.hypot((b.c0 + b.c1) / 2 - this.roadEndCol / 2, (b.r0 + b.r1) / 2 - this.rows / 2))[0];
    if (lakeBlock) lakeBlock.lake = true;
    if (lakeBlock) {
      const lr = (lakeBlock.r0 + lakeBlock.r1) / 2;
      const lc = (lakeBlock.c0 + lakeBlock.c1) / 2;
      // Use nearly the whole block. Kept small, the ellipse has too few rows
      // to round off and comes out as a rectangle with notched corners — it
      // reads as a swimming pool rather than a pond.
      const rx = Math.max(3, Math.floor((lakeBlock.c1 - lakeBlock.c0) / 2));
      const ry = Math.max(2, Math.floor((lakeBlock.r1 - lakeBlock.r0) / 2));

      for (let r = Math.floor(lr - ry); r <= Math.ceil(lr + ry); r++) {
        for (let c = Math.floor(lc - rx); c <= Math.ceil(lc + rx); c++) {
          if (r < 1 || c < 1 || r >= rows - 1 || c >= cols - 1) continue;
          const d = ((r - lr) / ry) ** 2 + ((c - lc) / rx) ** 2;
          if (d > 1) continue;
          this.grid[r][c] = d > 0.55 ? T.SAND : T.WATER;
        }
      }
      this.lake = { r: lr, c: lc, rx, ry };
    }

    // 4. Roads.
    for (const [rA, rB] of this.hRoads) {
      for (let r = rA; r <= rB; r++) {
        for (let c = 0; c <= this.roadEndCol; c++) this.grid[r][c] = T.ROAD;
      }
    }
    for (const [cA, cB] of this.vRoads) {
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
    let i = 0;

    for (const block of this.blocks) {
      if (block.park) continue;

      // Inset by one tile all round, which is the strip that becomes pavement.
      const r0 = block.r0 + 1, r1 = block.r1 - 1;
      const c0 = block.c0 + 1, c1 = block.c1 - 1;

      // Rows of houses back to back, the way a real block is laid out.
      for (let ty = r0; ty + 2 <= r1; ty += 3) {
        for (let tx = c0; tx + 2 <= c1; ) {
          const tw = 3 + Math.floor(hash(tx * 3 + 1, ty * 5 + 7) * 3);   // 3..5
          if (tx + tw - 1 > c1) break;

          // Leave the odd plot empty. The gaps are alleys and back gardens,
          // and an alley is a fine place to hide.
          if (hash(tx + 57, ty + 91) > 0.16) {
            const slot = (i * 3) % CONFIG.ROOF_PALETTE.length;
            this.buildings.push({
              x: tx * tile,
              y: ty * tile,
              w: tw * tile,
              h: 3 * tile,
              wall: CONFIG.WALL_PALETTE[slot],
              roof: CONFIG.ROOF_PALETTE[slot],
              // Roughly one in five is a shop, which gets a sign over the door.
              shop: hash(tx + 13, ty + 29) < 0.2,
              seed: i,
            });
            i++;
          }
          tx += tw + 1;     // a one-tile gap between neighbours
        }
      }
    }
  }

  _buildParkProps() {
    const tile = this.tile;
    const park = this.mainPark;
    if (!park) return;

    // Middle of the town park, in tiles.
    const cx = (park.c0 + park.c1 + 1) / 2;
    const cy = (park.r0 + park.r1 + 1) / 2;

    // A fountain to run around.
    this.props.push({
      kind: 'fountain',
      x: (cx - 1) * tile, y: (cy - 1) * tile, w: 2 * tile, h: 2 * tile,
    });

    // A duck pond, off to one side of it.
    this.props.push({
      kind: 'pond',
      x: (cx - 3.4) * tile, y: (cy + 1.2) * tile, w: 3.2 * tile, h: 1.9 * tile,
    });

    // Benches either side of the fountain. Low enough to be scenery, but solid.
    this.props.push({ kind: 'bench', x: (cx - 2.7) * tile, y: (cy - 0.4) * tile, w: 46, h: 18 });
    this.props.push({ kind: 'bench', x: (cx + 1.4) * tile, y: (cy - 0.4) * tile, w: 46, h: 18 });
  }

  _buildTrees() {
    const tile = this.tile;

    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        const t = this.grid[r][c];
        if (t !== T.GRASS && t !== T.PARK) continue;

        // Denser planting inside a park than in back gardens. Parks are where
        // hide-and-seek actually happens, so they are properly wooded.
        const chance = t === T.PARK ? 0.62 : 0.45;
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
          // Every third or so is a tall pointed one, for variety in the
          // skyline and so the park does not look stamped out.
          pine: hash(c + 77, r + 143) < 0.3,
          seed: (c * 31 + r) % 100,
        });
      }
    }
  }

  /**
   * Everything else you can duck under.
   *
   * NONE of these are solid. You walk straight under a market awning or into
   * a bush and the thing is simply drawn over the top of you — which is the
   * whole point, and much more fun than bumping into a post. Tree trunks stay
   * solid because a tree you can stand inside looks wrong.
   */
  _buildHidingPlaces() {
    const tile = this.tile;
    const half = CONFIG.PLAYER.HITBOX / 2;

    /** Could somebody actually stand here? If not, cover here is useless. */
    const standable = (x, y) => !this._overlaps(x, y, half, half, null);

    /**
     * On dry land.
     *
     * Water stopped being solid when swimming arrived, which means `standable`
     * is perfectly happy in the middle of the river. Everything below that
     * belongs on land has to say so, or there would be bus shelters out in the
     * lake.
     */
    const onLand = (x, y) => !this.isWaterAt(x, y);

    /**
     * The same spot, or the nearest one somebody could stand in.
     *
     * Used for the few pieces there is only one of — the bandstand, the market
     * stalls — where dropping it because a bench happens to be in the way
     * would quietly cost the town its landmark. The many small things (bushes,
     * parasols) are simply skipped instead: there are hundreds of those.
     */
    const nudged = (x, y, reach = 90) =>
      standable(x, y) ? { x, y } : this.findFreeSpot(x, y, half, null, reach);

    // --- bushes, anywhere green ------------------------------------------
    //
    // The workhorse hiding place: small, everywhere, and completely covering.
    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        const t = this.grid[r][c];
        if (t !== T.GRASS && t !== T.PARK) continue;
        if (hash(c + 313, r + 517) > 0.30) continue;

        const x = c * tile + tile * (0.2 + hash(c + 61, r + 29) * 0.6);
        const y = r * tile + tile * (0.2 + hash(c + 97, r + 43) * 0.6);
        if (!standable(x, y) || !onLand(x, y)) continue;

        const size = 22 + hash(c + 5, r + 11) * 12;
        this.canopies.push({ kind: 'bush', x, y, rx: size, ry: size * 0.82,
                             seed: (c * 17 + r * 7) % 100 });
      }
    }

    // --- bus shelters, on the pavement beside a road ---------------------
    for (let r = 2; r < this.rows - 2; r++) {
      for (let c = 2; c < this.roadEndCol - 1; c++) {
        if (this.grid[r][c] !== T.SIDEWALK) continue;
        if (hash(c + 701, r + 809) > 0.035) continue;

        const x = c * tile + tile / 2;
        const y = r * tile + tile / 2;
        if (!standable(x, y) || !onLand(x, y)) continue;
        if (this._tooCloseToCanopy(x, y, 150)) continue;

        this.canopies.push({ kind: 'shelter', x, y, rx: 44, ry: 30,
                             seed: (c + r * 3) % 100 });
      }
    }

    // --- market stalls, clustered into a square --------------------------
    //
    // Put in one park so there is a proper little market to run around in,
    // rather than stalls sprinkled at random across the whole town.
    const marketBlocks = this.blocks.filter((b) => b.park && !b.main && !b.lake);
    const market = marketBlocks.length
      ? marketBlocks[Math.floor(hash(7, 13) * marketBlocks.length)]
      : null;
    if (market) {
      for (let r = market.r0 + 1; r <= market.r1 - 1; r += 2) {
        for (let c = market.c0 + 1; c <= market.c1 - 1; c += 2) {
          const x = c * tile + tile / 2;
          const y = r * tile + tile / 2;
          if (!onLand(x, y)) continue;
          const spot = nudged(x, y, 70);
          if (!spot) continue;
          this.canopies.push({ kind: 'stall', x: spot.x, y: spot.y, rx: 46, ry: 34,
                               seed: (c * 5 + r) % 100 });
        }
      }
      this.market = market;
    }

    // --- a bandstand in the middle of the town park ----------------------
    if (this.mainPark) {
      const p = this.mainPark;
      const x = ((p.c0 + p.c1 + 1) / 2 + 2.6) * tile;
      const y = ((p.r0 + p.r1 + 1) / 2 + 1.6) * tile;
      const spot = nudged(x, y, 200);
      if (spot) {
        this.canopies.push({ kind: 'bandstand', x: spot.x, y: spot.y, rx: 62, ry: 58, seed: 3 });
      }
    }

    // --- parasols, dotted about the parks --------------------------------
    for (const b of this.blocks) {
      if (!b.park) continue;
      for (let r = b.r0; r <= b.r1; r++) {
        for (let c = b.c0; c <= b.c1; c++) {
          if (hash(c + 1201, r + 1303) > 0.05) continue;
          const x = c * tile + tile / 2;
          const y = r * tile + tile / 2;
          if (!standable(x, y) || !onLand(x, y)) continue;
          if (this._tooCloseToCanopy(x, y, 90)) continue;
          this.canopies.push({ kind: 'parasol', x, y, rx: 38, ry: 34,
                               seed: (c * 11 + r * 3) % 100 });
        }
      }
    }
  }

  /**
   * Things to hide under in the water.
   *
   * Same rule as on land: none of it is solid, all of it is drawn over the
   * top of whoever is underneath. Lily pads and reeds are the cover; the
   * jetties and moored boats are there so the river reads as somewhere people
   * go, and they happen to make excellent hiding places too.
   */
  _buildWaterHidingPlaces() {
    const tile = this.tile;

    const isWaterTile = (r, c) =>
      r >= 0 && c >= 0 && r < this.rows && c < this.cols && this.grid[r][c] === T.WATER;
    const nextToLand = (r, c) =>
      !isWaterTile(r - 1, c) || !isWaterTile(r + 1, c) ||
      !isWaterTile(r, c - 1) || !isWaterTile(r, c + 1);

    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        if (!isWaterTile(r, c)) continue;

        const x = c * tile + tile * (0.25 + hash(c + 211, r + 307) * 0.5);
        const y = r * tile + tile * (0.25 + hash(c + 401, r + 503) * 0.5);
        const edge = nextToLand(r, c);

        // Reeds grow in the shallows, so they line the banks and the islands.
        if (edge && hash(c + 71, r + 137) < 0.5) {
          this.canopies.push({ kind: 'reeds', x, y, rx: 26, ry: 24,
                               seed: (c * 7 + r * 3) % 100 });
          continue;
        }

        // Lily pads float further out, in the open water.
        if (!edge && hash(c + 811, r + 907) < 0.34) {
          const size = 26 + hash(c + 3, r + 17) * 12;
          this.canopies.push({ kind: 'lily', x, y, rx: size, ry: size * 0.86,
                               seed: (c * 13 + r * 5) % 100 });
        }
      }
    }

    // Jetties, sticking out from the bank into the river, with a boat tied up
    // at the end of some of them.
    // Spaced by remembering the last one, NOT by asking how close the nearest
    // piece of scenery is: by this point the river is full of lily pads, and
    // that question always answers "too close", which is why the first version
    // of this built no jetties at all.
    let lastJetty = -99;

    for (let r = 3; r < this.rows - 3; r++) {
      const c = this.riverCol;
      if (!isWaterTile(r, c)) continue;
      if (hash(r + 1601, 17) > 0.16) continue;
      if (r - lastJetty < 7) continue;
      lastJetty = r;

      const x = c * tile + tile * 1.2;
      const y = r * tile + tile / 2;
      this.canopies.push({ kind: 'jetty', x, y, rx: 74, ry: 20, seed: r % 100 });

      if (hash(r + 55, 91) < 0.6) {
        this.canopies.push({ kind: 'boat', x: x + 96, y, rx: 34, ry: 20, seed: r % 100 });
      }
    }
  }

  /** Keep the bigger pieces of scenery from piling up on one another. */
  _tooCloseToCanopy(x, y, dist) {
    for (const c of this.canopies) {
      if (c.kind === 'bush' || c.kind === 'lily' || c.kind === 'reeds') continue;          // bushes may crowd in freely
      if (Math.abs(c.x - x) < dist && Math.abs(c.y - y) < dist) return true;
    }
    return false;
  }

  /**
   * Is somebody standing here covered up?
   *
   * Used to decide whether to draw a player's name: a name floating over a
   * bush would give away the hiding place the bush exists to provide.
   */
  hiddenAt(x, y) {
    for (const t of this.trees) {
      const r = 27 * t.scale;
      const dx = x - t.x, dy = y - (t.y - 6);
      if (dx * dx + dy * dy < r * r) return true;
    }
    for (const c of this.canopies) {
      if (Math.abs(x - c.x) < c.rx && Math.abs(y - c.y) < c.ry) return true;
    }
    return false;
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

    // NOTE: water is deliberately NOT in this list any more.
    //
    // It used to be one big rectangle down the right-hand edge, which made the
    // river a wall. It is now somewhere to swim, so it stops being solid for
    // anybody on foot — and stays solid for anything with wheels, which is
    // handled separately in moveBox rather than here. See `blocksVehicle`.
  }

  /**
   * Sort the solids into a coarse grid of buckets.
   *
   * Collision used to walk the whole list every time. That was fine when the
   * town had seventy-odd walls in it; the town is now four times the size and
   * thick with trees, and checking every one of them against every moving
   * thing, twice a frame, is work a phone should not be asked to do. Bucketing
   * means each test only looks at the handful of walls actually nearby.
   */
  _indexSolids() {
    const CELL = 128;
    this._cell = CELL;
    this._gw = Math.ceil(this.width / CELL);
    this._gh = Math.ceil(this.height / CELL);
    this._buckets = new Array(this._gw * this._gh);

    for (const s of this.solids) {
      const c0 = Math.max(0, Math.floor(s.x / CELL));
      const c1 = Math.min(this._gw - 1, Math.floor((s.x + s.w) / CELL));
      const r0 = Math.max(0, Math.floor(s.y / CELL));
      const r1 = Math.min(this._gh - 1, Math.floor((s.y + s.h) / CELL));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const i = r * this._gw + c;
          (this._buckets[i] || (this._buckets[i] = [])).push(s);
        }
      }
    }
  }

  // =====================================================================
  // Water
  // =====================================================================

  /** Is this spot in the water? */
  isWaterAt(x, y) {
    const c = Math.floor(x / this.tile);
    const r = Math.floor(y / this.tile);
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return false;
    return this.grid[r][c] === T.WATER;
  }

  /**
   * Would a vehicle be in the water here?
   *
   * Water stops being solid when the game learns to swim, but only for people.
   * A bus in the river would be both stuck and sad, so anything with wheels
   * still treats it as a wall — checked at the corners as well as the middle,
   * or a long vehicle could straddle the bank with its nose in the river.
   */
  blocksVehicle(cx, cy, halfW, halfH) {
    for (const dx of [-halfW, 0, halfW]) {
      for (const dy of [-halfH, 0, halfH]) {
        if (this.isWaterAt(cx + dx, cy + dy)) return true;
      }
    }
    return false;
  }

  /**
   * And the exact opposite, for a boat: is any part of it aground?
   *
   * Same corner-and-middle test, so a ferry cannot beach its bow while the
   * rest of it floats.
   */
  blocksBoat(cx, cy, halfW, halfH) {
    for (const dx of [-halfW, 0, halfW]) {
      for (const dy of [-halfH, 0, halfH]) {
        if (!this.isWaterAt(cx + dx, cy + dy)) return true;
      }
    }
    return false;
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
  /**
   * @param terrain  what this thing can travel over:
   *                 null    — a person, who walks and swims and minds neither
   *                 'land'  — wheels, stopped by water
   *                 'water' — a hull, stopped by land
   */
  moveBox(x, y, halfW, halfH, dx, dy, extra, terrain = null) {
    let blocked = false;
    const stopped = (px, py) =>
      this._overlaps(px, py, halfW, halfH, extra) ||
      (terrain === 'land' && this.blocksVehicle(px, py, halfW, halfH)) ||
      (terrain === 'water' && this.blocksBoat(px, py, halfW, halfH));

    let nx = x + dx;
    if (stopped(nx, y)) { nx = x; blocked = true; }

    let ny = y + dy;
    if (stopped(nx, ny)) { ny = y; blocked = true; }

    // Never leave the map.
    const cx = Math.min(Math.max(nx, halfW), this.width - halfW);
    const cy = Math.min(Math.max(ny, halfH), this.height - halfH);
    if (cx !== nx || cy !== ny) blocked = true;

    return { x: cx, y: cy, blocked };
  }

  /**
   * How open a spot is: the fraction of directions you can walk `reach` away in.
   *
   * Jobs and scattered coins both need this. Somewhere with a low score is
   * reachable on paper but is a pocket a child would just bump around in.
   */
  openness(x, y, half, reach = 84) {
    const DIRS = 16;
    let open = 0;

    for (let k = 0; k < DIRS; k++) {
      const a = (k / DIRS) * Math.PI * 2;
      let clear = true;
      for (let d = 14; d <= reach; d += 14) {
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d;
        if (px < half || py < half || px > this.width - half || py > this.height - half ||
            this._overlaps(px, py, half, half)) { clear = false; break; }
      }
      if (clear) open++;
    }
    return open / DIRS;
  }

  /**
   * Walk the map and collect open, well-spread spots on matching squares.
   *
   * Deterministic: the same town always yields the same list, so nothing has
   * to be saved and every player sees things in the same places.
   *
   * @param matches      (tileKind) => boolean
   * @param separation   how far apart the results must be, in pixels
   * @param minOpenness  reject anywhere more hemmed-in than this
   * @param stride       how many squares to skip while sweeping
   */
  sweepSpots(matches, separation, minOpenness, half, stride = 2) {
    const out = [];

    for (let r = 1; r < this.rows - 1; r += stride) {
      for (let c = 1; c < this.cols - 1; c += stride) {
        if (!matches(this.grid[r][c])) continue;

        const x = c * this.tile + this.tile / 2;
        const y = r * this.tile + this.tile / 2;
        if (this._overlaps(x, y, half, half)) continue;
        if (this.openness(x, y, half) < minOpenness) continue;
        if (out.some((s) => Math.hypot(s.x - x, s.y - y) < separation)) continue;

        out.push({ x, y });
      }
    }
    return out;
  }

  /**
   * The nearest spot to (x, y) that something of this size can stand in.
   *
   * Used for placing people and job destinations: a spot can be described
   * loosely ("outside that front door") and still be guaranteed walkable,
   * even after the scenery around it changes.
   *
   * Returns null if nowhere within `maxRadius` works.
   */
  findFreeSpot(x, y, half, extra, maxRadius = 260) {
    const fits = (px, py) =>
      px > half && py > half &&
      px < this.width - half && py < this.height - half &&
      !this._overlaps(px, py, half, half, extra);

    if (fits(x, y)) return { x, y };

    for (let r = 14; r <= maxRadius; r += 14) {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (fits(px, py)) return { x: px, y: py };
      }
    }
    return null;
  }

  _overlaps(cx, cy, halfW, halfH, extra) {
    const l = cx - halfW, r = cx + halfW;
    const t = cy - halfH, b = cy + halfH;

    if (this._buckets) {
      // Only the buckets this box actually touches. A wall spanning several
      // buckets may be tested more than once, which is harmless and much
      // cheaper than the bookkeeping to avoid it.
      const CELL = this._cell;
      const c0 = Math.max(0, Math.floor(l / CELL));
      const c1 = Math.min(this._gw - 1, Math.floor(r / CELL));
      const r0 = Math.max(0, Math.floor(t / CELL));
      const r1 = Math.min(this._gh - 1, Math.floor(b / CELL));

      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          const bucket = this._buckets[rr * this._gw + cc];
          if (!bucket) continue;
          for (const s of bucket) {
            if (r > s.x && l < s.x + s.w && b > s.y && t < s.y + s.h) return true;
          }
        }
      }
    } else {
      // Before the index is built — during generation itself.
      for (const s of this.solids) {
        if (r > s.x && l < s.x + s.w && b > s.y && t < s.y + s.h) return true;
      }
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

    // Only the visible stretch of each line is drawn, which is what keeps a
    // map this size cheap — but a dash pattern starts counting from wherever
    // the path begins, so a line starting at the edge of the view had its
    // dashes shift every time the camera moved. On screen that read as the
    // markings SLIDING along the road as the player walked, as though the
    // road were on a conveyor belt.
    //
    // lineDashOffset puts the phase back where it belongs: setting it to the
    // world coordinate the path starts at makes the dashes fall exactly where
    // they would if every line were drawn from the very edge of the map.

    // Centre line down the middle of each horizontal road.
    for (const [rA, rB] of this.hRoads) {
      const y = (rB) * tile; // boundary between the two lanes
      if (y < view.y - 20 || y > view.y + view.h + 20) continue;

      const from = Math.max(0, view.x - 40);
      ctx.lineDashOffset = from;
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(Math.min(this.roadEndCol * tile + tile, view.x + view.w + 40), y);
      ctx.stroke();
    }

    // ...and each vertical road.
    for (const [cA, cB] of this.vRoads) {
      const x = (cB) * tile;
      if (x < view.x - 20 || x > view.x + view.w + 20) continue;

      const from = Math.max(0, view.y - 40);
      ctx.lineDashOffset = from;
      ctx.beginPath();
      ctx.moveTo(x, from);
      ctx.lineTo(x, Math.min(this.height, view.y + view.h + 40));
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawWaterSparkle(ctx, view, time) {
    const riverX = this.riverCol * this.tile;
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
  /**
   * Everything drawn OVER the player: what covers you when you hide.
   *
   * Order matters a little. The low leafy things go down first and the built
   * ones after, so a market awning sits over the bush beside it rather than
   * disappearing behind it.
   */
  drawCanopies(ctx, view) {
    for (const c of this.canopies) {
      if (c.kind !== 'bush' && c.kind !== 'lily' && c.kind !== 'reeds') continue;
      if (c.x < view.x - 90 || c.x > view.x + view.w + 90) continue;
      if (c.y < view.y - 90 || c.y > view.y + view.h + 90) continue;
      if (c.kind === 'bush') this._drawBush(ctx, c);
      else if (c.kind === 'lily') this._drawLily(ctx, c);
      else this._drawReeds(ctx, c);
    }

    for (const t of this.trees) {
      if (t.x < view.x - 60 || t.x > view.x + view.w + 60) continue;
      if (t.y < view.y - 60 || t.y > view.y + view.h + 60) continue;
      if (t.pine) this._drawPine(ctx, t); else this._drawTree(ctx, t);
    }

    for (const c of this.canopies) {
      if (c.kind === 'bush' || c.kind === 'lily' || c.kind === 'reeds') continue;
      if (c.x < view.x - 120 || c.x > view.x + view.w + 120) continue;
      if (c.y < view.y - 120 || c.y > view.y + view.h + 120) continue;
      if (c.kind === 'shelter') this._drawShelter(ctx, c);
      else if (c.kind === 'stall') this._drawStall(ctx, c);
      else if (c.kind === 'bandstand') this._drawBandstand(ctx, c);
      else if (c.kind === 'parasol') this._drawParasol(ctx, c);
      else if (c.kind === 'lily') this._drawLily(ctx, c);
      else if (c.kind === 'reeds') this._drawReeds(ctx, c);
      else if (c.kind === 'jetty') this._drawJetty(ctx, c);
      else if (c.kind === 'boat') this._drawBoat(ctx, c);
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

  /**
   * A tall pointed tree, seen from above: rings of green getting smaller.
   *
   * From directly overhead a pine is really just a target of circles, and that
   * happens to read as "a different sort of tree" instantly, without needing
   * any more detail than that.
   */
  _drawPine(ctx, t) {
    const s = t.scale;

    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(t.x + 4, t.y + 18 * s, 20 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.TREE_TRUNK;
    roundRect(ctx, t.x - 4 * s, t.y - 2 * s, 8 * s, 20 * s, 3);
    ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.TREE_LEAF;
    ctx.beginPath();
    ctx.arc(t.x, t.y - 6 * s, 22 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.TREE_LEAF_HI;
    ctx.beginPath();
    ctx.arc(t.x - 1 * s, t.y - 9 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.TREE_LEAF;
    ctx.beginPath();
    ctx.arc(t.x - 2 * s, t.y - 12 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A leafy blob big enough to stand right inside. */
  _drawBush(ctx, c) {
    const r = c.rx;

    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(c.x + 3, c.y + r * 0.5, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Three overlapping lumps, nudged by the seed, so no two bushes in a row
    // look like copies of each other.
    const w = (c.seed % 7) - 3;
    ctx.fillStyle = CONFIG.COLORS.TREE_LEAF;
    ctx.beginPath();
    ctx.arc(c.x - r * 0.42, c.y + r * 0.1, r * 0.58, 0, Math.PI * 2);
    ctx.arc(c.x + r * 0.40, c.y + r * 0.05 + w, r * 0.55, 0, Math.PI * 2);
    ctx.arc(c.x + w * 0.5, c.y - r * 0.28, r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.TREE_LEAF_HI;
    ctx.beginPath();
    ctx.arc(c.x - r * 0.2, c.y - r * 0.36, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A bus shelter: a flat roof standing on two legs. */
  _drawShelter(ctx, c) {
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    roundRect(ctx, c.x - c.rx + 6, c.y - c.ry + 14, c.rx * 2, c.ry * 2, 8);
    ctx.fill();

    // Legs first, so the roof reads as sitting on top of them.
    ctx.fillStyle = '#7C8794';
    roundRect(ctx, c.x - c.rx + 6, c.y + c.ry - 12, 7, 12, 3);
    ctx.fill();
    roundRect(ctx, c.x + c.rx - 13, c.y + c.ry - 12, 7, 12, 3);
    ctx.fill();

    ctx.fillStyle = '#5C9BE0';
    roundRect(ctx, c.x - c.rx, c.y - c.ry, c.rx * 2, c.ry * 2 - 6, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    roundRect(ctx, c.x - c.rx + 7, c.y - c.ry + 7, c.rx * 2 - 14, 10, 5);
    ctx.fill();
  }

  /** A market stall under a striped awning. */
  _drawStall(ctx, c) {
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    roundRect(ctx, c.x - c.rx + 6, c.y - c.ry + 14, c.rx * 2, c.ry * 2, 7);
    ctx.fill();

    ctx.fillStyle = '#B5843F';
    roundRect(ctx, c.x - c.rx + 4, c.y + c.ry - 14, 6, 14, 3);
    ctx.fill();
    roundRect(ctx, c.x + c.rx - 10, c.y + c.ry - 14, 6, 14, 3);
    ctx.fill();

    // Stripes, in one of four colours picked from the seed, so the market is
    // not all one shade.
    const warm = ['#FF6B6B', '#FFB03A', '#4EA8FF', '#7ED957'][c.seed % 4];
    ctx.save();
    roundRect(ctx, c.x - c.rx, c.y - c.ry, c.rx * 2, c.ry * 2 - 8, 7);
    ctx.clip();
    ctx.fillStyle = '#FFF6E4';
    ctx.fillRect(c.x - c.rx, c.y - c.ry, c.rx * 2, c.ry * 2);
    ctx.fillStyle = warm;
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(c.x - c.rx + i * 13, c.y - c.ry, 7, c.ry * 2);
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 2;
    roundRect(ctx, c.x - c.rx, c.y - c.ry, c.rx * 2, c.ry * 2 - 8, 7);
    ctx.stroke();
  }

  /** The bandstand in the town park: a round roof on posts. */
  _drawBandstand(ctx, c) {
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(c.x + 5, c.y + 16, c.rx, c.ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#C9A227';
    for (const a of [0.4, 1.4, 2.4, 3.4, 4.4, 5.4]) {
      roundRect(ctx, c.x + Math.cos(a) * (c.rx - 12) - 4,
                c.y + Math.sin(a) * (c.ry - 12) - 4, 8, 16, 3);
      ctx.fill();
    }

    ctx.fillStyle = '#E5484D';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(c.x - c.rx * 0.22, c.y - c.ry * 0.28, c.rx * 0.42, c.ry * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFD93D';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * A lily pad: a round leaf with a notch cut out of it, and sometimes a
   * flower. Big enough to swim under and disappear.
   */
  _drawLily(ctx, c) {
    const r = c.rx * 0.9;

    // A darker patch of water underneath, which is what makes it read as
    // floating ON the river rather than being part of it.
    ctx.fillStyle = 'rgba(12,60,90,0.22)';
    ctx.beginPath();
    ctx.ellipse(c.x + 3, c.y + 4, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4FA65B';
    ctx.beginPath();
    // The notch is the whole trick: a plain circle reads as a coin.
    const notch = (c.seed / 100) * Math.PI * 2;
    ctx.ellipse(c.x, c.y, r, r * 0.82, 0, notch + 0.45, notch + Math.PI * 2 - 0.45);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(c.x - r * 0.22, c.y - r * 0.26, r * 0.4, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    if (c.seed % 4 === 0) {
      ctx.fillStyle = '#FF9EC4';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(c.x + Math.cos(a) * 5, c.y + Math.sin(a) * 5, 5, 3.4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#FFD93D';
      ctx.beginPath(); ctx.arc(c.x, c.y, 3.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** Reeds in the shallows: a clump of tall blades. */
  _drawReeds(ctx, c) {
    const blades = 7 + (c.seed % 4);

    for (let i = 0; i < blades; i++) {
      const t = (i / blades) * Math.PI * 2 + c.seed;
      const bx = c.x + Math.cos(t) * c.rx * 0.55;
      const by = c.y + Math.sin(t) * c.ry * 0.5;
      const lean = ((i % 3) - 1) * 3;

      ctx.strokeStyle = i % 3 === 0 ? '#4E8C4A' : '#63A45A';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by + 8);
      ctx.quadraticCurveTo(bx + lean, by - 6, bx + lean * 2, by - 16);
      ctx.stroke();

      // A brown seed head on some of them.
      if (i % 4 === 0) {
        ctx.fillStyle = '#8A5A2B';
        roundRect(ctx, bx + lean * 2 - 2, by - 22, 4, 8, 2);
        ctx.fill();
      }
    }
  }

  /** A wooden jetty running out from the bank. */
  _drawJetty(ctx, c) {
    ctx.fillStyle = 'rgba(12,60,90,0.28)';
    roundRect(ctx, c.x - c.rx + 5, c.y - c.ry + 7, c.rx * 2, c.ry * 2, 4);
    ctx.fill();

    ctx.fillStyle = '#B98A52';
    roundRect(ctx, c.x - c.rx, c.y - c.ry, c.rx * 2, c.ry * 2, 4);
    ctx.fill();

    // Planks, which is what makes it wood rather than a brown rectangle.
    ctx.strokeStyle = 'rgba(90,58,26,0.45)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 8; i++) {
      const x = c.x - c.rx + (i / 8) * c.rx * 2;
      ctx.beginPath();
      ctx.moveTo(x, c.y - c.ry + 3);
      ctx.lineTo(x, c.y + c.ry - 3);
      ctx.stroke();
    }

    // Posts at the far end.
    ctx.fillStyle = '#8A6238';
    ctx.beginPath(); ctx.arc(c.x + c.rx - 5, c.y - c.ry + 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(c.x + c.rx - 5, c.y + c.ry - 4, 4, 0, Math.PI * 2); ctx.fill();
  }

  /** A little rowing boat, tied up. */
  _drawBoat(ctx, c) {
    ctx.fillStyle = 'rgba(12,60,90,0.28)';
    ctx.beginPath();
    ctx.ellipse(c.x + 4, c.y + 6, c.rx, c.ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    const hull = ['#E5484D', '#4EA8FF', '#FFB03A'][c.seed % 3];
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.rx, c.ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // The inside of the boat, and a bench across it.
    ctx.fillStyle = '#F6E2C0';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.rx * 0.72, c.ry * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#B98A52';
    roundRect(ctx, c.x - 5, c.y - c.ry * 0.44, 10, c.ry * 0.88, 2);
    ctx.fill();

    // Oars.
    ctx.strokeStyle = '#B98A52';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c.x - 2, c.y + side * 4);
      ctx.lineTo(c.x + 16, c.y + side * (c.ry + 6));
      ctx.stroke();
    }
  }

  /** A big garden parasol. */
  _drawParasol(ctx, c) {
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(c.x + 4, c.y + 14, c.rx * 0.9, c.ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#9A7B4F';
    roundRect(ctx, c.x - 3, c.y - 2, 6, 20, 3);
    ctx.fill();

    // Alternating wedges, which is what says "umbrella" when seen from above.
    const tone = ['#FF6B6B', '#4EA8FF', '#7ED957', '#FFB03A'][c.seed % 4];
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? tone : '#FFF6E4';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, c.rx * 0.86, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#FFF6E4';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
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
