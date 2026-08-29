/**
 * npc.js — The neighbours who have jobs to hand out.
 *
 * They stand in one place and don't move. Each one wears a badge above their
 * head showing the job they have — a pizza, or a lost teddy — so the player
 * can tell from across the street what that person wants, without reading.
 *
 * They are drawn the same way the player is, from above with a cap on, so it
 * is obvious they are people too.
 */

import { CONFIG } from './config.js';
import { roundRect, T } from './world.js';
import { drawMissionIcon, drawBadge as drawBadgeShape } from './ui.js';

export class Npc {
  constructor(x, y, opts) {
    this.x = x;
    this.y = y;
    this.mission = opts.mission;     // 'pizza' | 'toy'
    this.hat = CONFIG.HAT_PALETTE[opts.hat];
    this.shirt = CONFIG.SHIRT_PALETTE[opts.shirt];
    this.angle = opts.angle ?? Math.PI / 2;   // facing down the screen
    this.bobSeed = opts.hat * 1.7 + opts.shirt;
  }

  /**
   * People are solid. Without this the player walks straight into a
   * neighbour and the two of them overlap into an unreadable mush.
   */
  boundsBox() {
    // A little wider than the player's own hitbox so the two sprites keep
    // some daylight between them, but deliberately well under one map square:
    // a bigger box would wall off the pavement a neighbour is standing on.
    const h = 16;
    return { x: this.x - h, y: this.y - h, w: h * 2, h: h * 2 };
  }

  /**
   * A ring pulsing on the ground at their feet, drawn before anyone stands on
   * it. This is what says "there is somebody here to go and see".
   *
   * The badge above their head alone wasn't enough: a big white circle
   * floating over a small character reads as "a pizza", not as "a person who
   * wants something". Marking the ground under their feet puts the emphasis
   * back on the person, and it reuses the same ring the game already draws
   * under a car you can get into, so it means the same thing both times.
   */
  drawGlow(ctx, time) {
    const pulse = (time * 0.75 + this.bobSeed) % 1;

    ctx.save();
    ctx.globalAlpha = (1 - pulse) * 0.75;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 10, 16 + pulse * 26, (16 + pulse * 26) * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** The person themselves. Drawn under the trees, like everyone else. */
  draw(ctx, time) {
    ctx.save();
    // A gentle idle bob, so they read as somebody standing there waiting
    // rather than as another piece of scenery.
    ctx.translate(this.x, this.y + Math.sin(time * 2.2 + this.bobSeed) * 1.6);

    // --- the person, drawn like the player but standing still
    ctx.save();
    ctx.rotate(this.angle + Math.PI / 2);
    ctx.scale(CONFIG.PLAYER.DRAW_SCALE, CONFIG.PLAYER.DRAW_SCALE);

    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, 4, 17, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.SHOE;
    roundRect(ctx, -10, 2, 8, 9, 4); ctx.fill();
    roundRect(ctx, 2, 2, 8, 9, 4); ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.PANTS;
    roundRect(ctx, -10, -2, 8, 9, 3); ctx.fill();
    roundRect(ctx, 2, -2, 8, 9, 3); ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.SKIN;
    ctx.beginPath(); ctx.arc(-14, -2, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -2, 5.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = this.shirt;
    roundRect(ctx, -12, -12, 24, 20, 8); ctx.fill();

    ctx.fillStyle = this.hat.brim;
    ctx.beginPath();
    ctx.ellipse(0, -19, 11, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.hat.crown;
    ctx.beginPath(); ctx.arc(0, -9, 11, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = CONFIG.COLORS.HAT_TOP;
    ctx.beginPath(); ctx.arc(0, -9, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * The badge above their head, bobbing gently to catch the eye.
   *
   * Drawn separately from the body, and AFTER the tree canopies, because it
   * is the only thing telling the player a job exists here — a leaf hiding it
   * hides the job itself.
   */
  drawBadge(ctx, time) {
    const bob = Math.sin(time * 2.6 + this.bobSeed) * 4;
    const by = this.y - 54 + bob;

    // Slightly smaller than it was, so it reads as something the person is
    // holding up rather than as their head.
    drawBadgeShape(ctx, this.x, by, 18);
    ctx.save();
    ctx.translate(this.x, by);
    drawMissionIcon(ctx, this.mission, 13.5);
    ctx.restore();
  }
}

/**
 * Where the neighbours stand, in map squares.
 *
 * These are wishes, not guarantees: each one is snapped to the nearest spot
 * that is actually clear, so a tree growing next to someone can never leave
 * them stuck inside it.
 */
/** How many more neighbours to scatter over the rest of the town. */
const EXTRA_NEIGHBOURS = 8;

const PEOPLE = [
  // The pizza cook, on the pavement outside the parade of shops.
  { tx: 23.0, ty: 8.5, mission: 'pizza', hat: 1, shirt: 2, angle: Math.PI / 2 },

  // A child in the park who has lost a teddy.
  { tx: 23.0, ty: 21.0, mission: 'toy', hat: 4, shirt: 6, angle: Math.PI / 2 },

  // A friend on the pavement who would like a lift to the park.
  { tx: 8.5, ty: 18.5, mission: 'ride', hat: 2, shirt: 3, angle: Math.PI / 2 },

  // Someone up by the shops who has marked out a course to follow.
  { tx: 33.0, ty: 8.5, mission: 'race', hat: 5, shirt: 0, angle: Math.PI / 2 },
];

/**
 * Put the neighbours out on the pavement.
 *
 * Their positions used to be typed in as tile coordinates. On a town four
 * times the size that left all four of them huddled in one corner, so a
 * player starting in the middle could wander a long way without meeting
 * anybody with a job to offer. They are now placed on the nearest decent
 * spots to wherever the game starts, spread far enough apart to be four
 * separate errands rather than a queue.
 */
/**
 * Put the neighbours out on the pavement.
 *
 * Two things are wanted at once, and they pull in opposite directions. A
 * child who has just pressed Play should meet somebody with a job almost at
 * once, so a few stand near where the game starts. But four people on a town
 * this size means most of it has nobody in it at all, so the rest are spread
 * right across the map with a long way between them.
 *
 * The four personalities in PEOPLE are dealt round the extra spots, so every
 * kind of job can be found in more than one place — and `lastPick` in
 * missions.js is per job TYPE, not per person, so several people offering the
 * same kind of job still send you somewhere different each time.
 */
export function createNpcs(world) {
  const half = CONFIG.PLAYER.HITBOX / 2;

  const spots = world.sweepSpots(
    (kind) => kind === T.SIDEWALK || kind === T.PARK,
    150,
    0.5,
    half,
    2,
  );

  const byDistance = spots.slice().sort((a, b) =>
    Math.hypot(a.x - world.spawn.x, a.y - world.spawn.y) -
    Math.hypot(b.x - world.spawn.x, b.y - world.spawn.y));

  const chosen = [];
  const farEnough = (s, gap) => !chosen.some((c) => Math.hypot(c.x - s.x, c.y - s.y) < gap);

  // First, one of each job within a short walk of the start.
  for (const s of byDistance) {
    if (chosen.length >= PEOPLE.length) break;
    if (farEnough(s, 320)) chosen.push(s);
  }

  // Then more, spread right out across the rest of the town. Kept few and far
  // apart on purpose: a neighbour on every corner would make the place feel
  // crowded and the jobs feel cheap.
  for (const s of spots) {
    if (chosen.length >= PEOPLE.length + EXTRA_NEIGHBOURS) break;
    if (farEnough(s, 1100)) chosen.push(s);
  }

  return chosen.map((spot, i) => {
    // The personalities are dealt round, so the extras are not all the same
    // person standing in different places.
    const who = PEOPLE[i % PEOPLE.length];
    return new Npc(spot.x, spot.y, who);
  });
}
