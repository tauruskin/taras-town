/**
 * missions.js — Jobs the neighbours ask for.
 *
 * Every job is the same shape underneath: a neighbour asks, somewhere in town
 * lights up, and getting there finishes it. Only one job runs at a time, which
 * keeps it simple to understand and means the arrow on screen only ever has
 * one thing to point at.
 *
 * A job is a LIST of places to reach, in order. Most jobs have one; the race
 * has several, and finishing one lights up the next. That is the only
 * difference between a delivery and a race.
 *
 * Nothing here can be failed, and there is no timer — not even on the race.
 * A 6-year-old who wanders off to look at the river should come back to a job
 * still patiently waiting.
 *
 * Four kinds:
 *   pizza — take a pizza to a front door on the other side of town
 *   toy   — find a teddy someone has lost
 *   ride  — take a friend to the park
 *   race  — follow a course of checkpoints around the roads
 *
 * Destinations are worked out from the map when the game starts, not typed
 * out by hand, and each job picks a different one from last time.
 */

import { CONFIG } from './config.js';
import { T } from './world.js';
import { drawMissionIcon } from './ui.js';

/**
 * A spot is only good enough to send a child to if it is this open.
 *
 * This threshold exists because hand-typed destinations rot. An earlier
 * version listed doors and hiding places as literal coordinates; several were
 * inside buildings, and `findFreeSpot` quietly rescued them by shifting up to
 * 182px, so a "front door" wasn't at a door at all. Two others sat in gaps
 * only 8% open — reachable on paper, but a child would just bump around.
 */
const MIN_OPENNESS = 0.45;

/** How far apart hiding places must be, so they feel spread around town. */
const MIN_SEPARATION = 420;

/** Checkpoints are spread wider still, so a race actually crosses town. */
const RACE_SEPARATION = 620;

export class Missions {
  constructor(world) {
    this.world = world;
    this.active = null;   // { type, giver, targets: [...], step, reward }
    this.lastPick = {};   // so the same destination isn't offered twice running

    // Worked out once from the map, not typed out by hand.
    this.spots = {
      pizza: this._findDoorSteps(),
      toy: this._findHidingPlaces(),
      ride: this._findParkSpots(),
    };
    this.raceStops = this._findRoadPoints();
  }

  // =====================================================================
  // Working out where jobs can send you
  // =====================================================================

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
      if (this.world.openness(spot.x, spot.y, half) < MIN_OPENNESS) continue;

      out.push(spot);
    }
    return out;
  }

  /**
   * Places a teddy could be left: open ground, spread around town so the
   * search takes you somewhere new each time.
   */
  _findHidingPlaces() {
    return this._sweep(
      (kind) => kind === T.GRASS || kind === T.PARK || kind === T.SAND,
      MIN_SEPARATION,
    );
  }

  /** Spots inside the park, for dropping a friend off. */
  _findParkSpots() {
    return this._sweep((kind) => kind === T.PARK, 150);
  }

  /** Points out on the road, for race checkpoints. */
  _findRoadPoints() {
    return this._sweep((kind) => kind === T.ROAD, RACE_SEPARATION);
  }

  /** Open, well-spread spots on matching squares. Shared with the coins. */
  _sweep(matches, separation) {
    return this.world.sweepSpots(matches, separation, MIN_OPENNESS, CONFIG.PLAYER.HITBOX / 2);
  }

  // =====================================================================
  // Running a job
  // =====================================================================

  /** Can this neighbour hand out a job right now? */
  canOffer(npc) {
    return this.active === null;
  }

  /** Is this the neighbour whose job is currently being done? */
  isBusy(npc) {
    return this.active !== null && this.active.giver === npc;
  }

  /**
   * Is this neighbour currently riding along with the player?
   *
   * They must not also be drawn standing in their usual spot — the friend
   * appearing in two places at once is exactly as odd as it sounds — and
   * while they are away they must not block the pavement either.
   */
  isRidingAlong(npc) {
    return this.active !== null && this.active.type === 'ride' && this.active.giver === npc;
  }

  start(npc) {
    const targets = npc.mission === 'race'
      ? this._buildCourse(npc)
      : this._pickOne(npc.mission);

    if (!targets || targets.length === 0) return false;

    this.active = {
      type: npc.mission,
      giver: npc,
      targets,
      step: 0,
      reward: npc.mission === 'race' ? CONFIG.MISSION.RACE_REWARD : CONFIG.MISSION.REWARD,
    };
    return true;
  }

  /** Where to go right now. */
  get target() {
    if (!this.active) return null;
    return this.active.targets[this.active.step];
  }

  /** How many places are left, including the current one. */
  get stepsLeft() {
    if (!this.active) return 0;
    return this.active.targets.length - this.active.step;
  }

  /**
   * Called every frame with wherever the player is (on foot or in a car).
   *
   * @returns null if nothing happened, { kind: 'checkpoint' } when a race
   *          checkpoint was ticked off, or { kind: 'done', job } when the
   *          whole job is finished.
   */
  update(x, y) {
    if (!this.active) return null;

    const t = this.target;
    // Checkpoints are more forgiving, because they are usually taken at speed.
    const radius = this.active.type === 'race'
      ? CONFIG.MISSION.RACE_ARRIVE_RADIUS
      : CONFIG.MISSION.ARRIVE_RADIUS;

    if (Math.hypot(x - t.x, y - t.y) > radius) return null;

    this.active.step++;

    // Still more to go: light up the next one.
    if (this.active.step < this.active.targets.length) {
      return { kind: 'checkpoint', at: t };
    }

    const job = this.active;
    this.active = null;
    return { kind: 'done', job };
  }

  /** Pick a single destination, never the same one twice running. */
  _pickOne(type) {
    const list = this.spots[type];
    if (!list || list.length === 0) return null;
    if (list.length === 1) { this.lastPick[type] = 0; return [list[0]]; }

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
    return [list[i]];
  }

  /**
   * A course of checkpoints, ordered so each one is the nearest not yet used.
   *
   * Ordering matters: picked at random the course would zig-zag back and forth
   * across town, which is bewildering to follow with one arrow at a time.
   */
  _buildCourse(npc) {
    const pool = this.raceStops.slice();
    if (pool.length === 0) return null;

    const wanted = Math.min(CONFIG.MISSION.RACE_CHECKPOINTS, pool.length);
    const course = [];

    // The first checkpoint is picked from the handful NEAREST the person
    // offering the race, not from the whole town. Choosing at random meant a
    // race could open with a 1900px trek right across town before anything
    // race-like happened — the dullest possible start.
    //
    // Picking from several near ones rather than always the nearest keeps
    // courses varied without ever starting with a long haul.
    pool.sort((a, b) =>
      Math.hypot(a.x - npc.x, a.y - npc.y) - Math.hypot(b.x - npc.x, b.y - npc.y));
    const nearby = Math.min(3, pool.length);
    const firstIndex = (Math.random() * nearby) | 0;

    course.push(pool.splice(firstIndex, 1)[0]);
    let from = course[0];

    // Then join up the checkpoints, each time choosing at random between the
    // two nearest remaining ones.
    //
    // Always taking the very nearest gives a tidy course but only three
    // possible races in total, which a child would exhaust in a morning.
    // Choosing between the two nearest keeps every leg short while giving
    // roughly twenty different courses.
    while (course.length < wanted && pool.length > 0) {
      const ranked = pool
        .map((s, i) => ({ i, d: Math.hypot(s.x - from.x, s.y - from.y) }))
        .sort((a, b) => a.d - b.d);

      const amongst = Math.min(2, ranked.length);
      const chosen = ranked[(Math.random() * amongst) | 0].i;

      from = pool[chosen];
      course.push(pool.splice(chosen, 1)[0]);
    }
    return course;
  }

  // =====================================================================
  // Drawing
  // =====================================================================

  /**
   * The beacon at the place to head for, in world coordinates.
   * A pulsing ring on the ground plus the job's picture floating above it.
   */
  drawTarget(ctx, time) {
    if (!this.active) return;

    // On a race, show the checkpoints still to come as small quiet rings, so
    // the shape of the course is visible without competing with the live one.
    if (this.active.type === 'race') {
      for (let i = this.active.step + 1; i < this.active.targets.length; i++) {
        const s = this.active.targets[i];
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 26, 16, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    const { x, y } = this.target;

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

    // Solid centre, so there's something definite to drive onto.
    ctx.fillStyle = 'rgba(255,210,63,0.42)';
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // The job's picture, bobbing above the spot.
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

  /**
   * The friend riding along, drawn as a little head tucked beside whoever is
   * carrying them. It is the only sign the passenger is actually aboard.
   */
  drawPassenger(ctx, mover) {
    if (!this.active || this.active.type !== 'ride') return;

    const hat = this.active.giver.hat;
    const x = mover.x + 13;
    const y = mover.y - 16;

    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath(); ctx.arc(x, y + 3, 10, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = hat.brim;
    ctx.beginPath(); ctx.arc(x, y + 2, 9.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = hat.crown;
    ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2); ctx.fill();
  }
}
