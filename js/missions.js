/**
 * missions.js — Jobs the neighbours ask for.
 *
 * Every job is the same shape underneath: a neighbour asks, somewhere in town
 * lights up, and getting there finishes it. Only one job runs at a time, which
 * keeps it simple to understand and means the arrow on screen only ever has
 * one thing to point at.
 *
 * Nothing here can be failed, and there is no timer. A 6-year-old who wanders
 * off to look at the river should come back to a job still patiently waiting.
 *
 * Two kinds so far:
 *   pizza — take a pizza to a front door on the other side of town
 *   toy   — find a teddy someone has lost
 *
 * Destinations are worked out from the map when the game starts, not typed
 * out by hand, and each job picks a different one from last time.
 */

import { CONFIG } from './config.js';
import { T } from './world.js';
import { drawMissionIcon } from './ui.js';

/**
 * How open a spot is: the fraction of directions you can walk 84px away in.
 *
 * This exists because hand-typed destinations rot. An earlier version listed
 * doors and hiding places as literal coordinates; several of them were inside
 * buildings, and `findFreeSpot` quietly rescued them by shifting up to 182px,
 * so the "front door" wasn't at a door at all. Two others sat in gaps only 8%
 * open — reachable on paper, but a child would just bump around in them.
 *
 * Both lists are now derived from the map and filtered on this, so adding a
 * building adds a delivery address, and nowhere cramped can be chosen.
 */
function openness(world, x, y, half) {
  const DIRS = 16;
  let open = 0;

  for (let k = 0; k < DIRS; k++) {
    const a = (k / DIRS) * Math.PI * 2;
    let clear = true;
    for (let d = 14; d <= 84; d += 14) {
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (px < half || py < half || px > world.width - half || py > world.height - half ||
          world._overlaps(px, py, half, half)) { clear = false; break; }
    }
    if (clear) open++;
  }
  return open / DIRS;
}

/** A spot is only good enough to send a child to if it is this open. */
const MIN_OPENNESS = 0.45;

/** How far apart hiding places must be, so they feel spread around town. */
const MIN_SEPARATION = 420;

export class Missions {
  constructor(world) {
    this.world = world;
    this.active = null;   // { type, giver, target: {x, y}, reward }
    this.lastPick = {};   // so the same destination isn't offered twice running

    // Worked out once from the map, not typed out by hand.
    this.spots = {
      pizza: this._findDoorSteps(),
      toy: this._findHidingPlaces(),
    };
  }

  /**
   * One doorstep per house, taken from the buildings themselves: the door is
   * drawn on a building's bottom edge, so the step is just below it.
   *
   * Anything that can't be stood on, or is too cramped, is dropped. Add a
   * building to the town and it gets a delivery address for free.
   */
  _findDoorSteps() {
    const half = CONFIG.PLAYER.HITBOX / 2;
    const out = [];

    for (const b of this.world.buildings) {
      const x = b.x + b.w / 2;
      const y = b.y + b.h + 26;

      // A small search radius on purpose: if the doorstep isn't nearly where
      // the door is, this isn't a doorstep and we'd rather not use it.
      const spot = this.world.findFreeSpot(x, y, half, null, 40);
      if (!spot) continue;
      if (openness(this.world, spot.x, spot.y, half) < MIN_OPENNESS) continue;

      out.push(spot);
    }
    return out;
  }

  /**
   * Places a teddy could be left: open ground, spread around town so the
   * search takes you somewhere new each time.
   *
   * Deterministic — the same town always offers the same hiding places.
   */
  _findHidingPlaces() {
    const half = CONFIG.PLAYER.HITBOX / 2;
    const tile = this.world.tile;
    const out = [];

    // Coarse sweep. Corners first so the far edges of town get used, rather
    // than every hiding place clustering near the middle.
    for (let r = 1; r < this.world.rows - 1; r += 2) {
      for (let c = 1; c < this.world.cols - 1; c += 2) {
        const kind = this.world.grid[r][c];
        // Grass, park and the riverbank — never a road or a pavement, so a
        // teddy is somewhere you'd have to go looking.
        if (kind !== T.GRASS && kind !== T.PARK && kind !== T.SAND) continue;

        const x = c * tile + tile / 2;
        const y = r * tile + tile / 2;
        if (this.world._overlaps(x, y, half, half)) continue;
        if (openness(this.world, x, y, half) < MIN_OPENNESS) continue;

        // Keep them well apart.
        if (out.some((s) => Math.hypot(s.x - x, s.y - y) < MIN_SEPARATION)) continue;

        out.push({ x, y });
      }
    }
    return out;
  }

  /** Can this neighbour hand out a job right now? */
  canOffer(npc) {
    return this.active === null;
  }

  /** Is this the neighbour whose job is currently being done? */
  isBusy(npc) {
    return this.active !== null && this.active.giver === npc;
  }

  start(npc) {
    const target = this._pickTarget(npc.mission);
    if (!target) return false;      // nowhere clear to send them; do nothing

    this.active = {
      type: npc.mission,
      giver: npc,
      target,
      reward: CONFIG.MISSION.REWARD,
    };
    return true;
  }

  /**
   * Called every frame with wherever the player is (on foot or in a car).
   * @returns the finished job if this was the moment it was completed, else null
   */
  update(x, y) {
    if (!this.active) return null;

    const d = Math.hypot(x - this.active.target.x, y - this.active.target.y);
    if (d > CONFIG.MISSION.ARRIVE_RADIUS) return null;

    const done = this.active;
    this.active = null;
    return done;
  }

  /** Pick somewhere to go, never the same place twice running. */
  _pickTarget(type) {
    const list = this.spots[type];
    if (!list || list.length === 0) return null;

    if (list.length === 1) {
      this.lastPick[type] = 0;
      return list[0];
    }

    // Choose from every destination EXCEPT last time's, by picking out of one
    // fewer and stepping over the excluded one. A do/while that re-rolls until
    // it differs would spin for ever if Math.random ever returned a constant.
    const last = this.lastPick[type];
    let i;
    if (last === undefined) {
      i = (Math.random() * list.length) | 0;
    } else {
      i = (Math.random() * (list.length - 1)) | 0;
      if (i >= last) i++;
    }

    this.lastPick[type] = i;
    return list[i];
  }

  // =====================================================================
  // Drawing
  // =====================================================================

  /**
   * The beacon at the destination, in world coordinates.
   * A pulsing ring on the ground plus the job's picture floating above it.
   */
  drawTarget(ctx, time) {
    if (!this.active) return;

    const { x, y } = this.active.target;

    // Two rings expanding out of the spot, half a beat apart, so the marker
    // reads as "here!" rather than as scenery.
    for (const offset of [0, 0.5]) {
      const t = ((time * 0.8 + offset) % 1);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.75;
      ctx.strokeStyle = '#FFD23F';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(x, y, 16 + t * 46, (16 + t * 46) * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Solid centre, so there's something definite to walk onto.
    ctx.fillStyle = 'rgba(255,210,63,0.42)';
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // The pizza or the teddy, bobbing above the spot.
    const bob = Math.sin(time * 3) * 5;
    ctx.save();
    ctx.translate(x, y - 34 + bob);

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 36 - bob, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    drawMissionIcon(ctx, this.active.type, 20);
    ctx.restore();
  }
}
