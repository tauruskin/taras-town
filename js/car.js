/**
 * car.js — The cars parked around Taras Town, and how they drive.
 *
 * Steering is "point where you want to go": the joystick direction is the
 * heading the car turns towards, and how far the stick is pushed is the
 * throttle. That is much kinder to a 6-year-old than separate steer and
 * accelerate controls, while still feeling like driving, because the car
 * cannot snap to a new direction — it has a turning circle and it carries
 * its momentum.
 *
 * There is no crash physics. Hitting something just scrubs off most of the
 * speed, so bumping a wall feels like a soft nudge rather than a punishment.
 */

import { CONFIG } from './config.js';
import { roundRect } from './world.js';

/** Shortest way round from one angle to another, in the range -PI..PI. */
function angleDelta(target, from) {
  let d = target - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Car {
  /**
   * @param style { body, roof, type } — type is 'car' or 'van'
   */
  constructor(world, x, y, angle, style) {
    this.world = world;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;          // along the car's own heading; negative = reversing
    this.style = style;

    const size = CONFIG.CAR[style.type === 'van' ? 'VAN' : 'CAR'];
    this.length = size.LENGTH;
    this.width = size.WIDTH;

    // Where the car started, so it can be put back if it ever needs to be.
    this.home = { x, y, angle };
  }

  /** Half-size of the square used for collision. */
  get half() {
    return CONFIG.CAR.HITBOX / 2;
  }

  /**
   * Drive for one frame.
   * @param stick      { x, y, mag } from the joystick
   * @param otherCars  the cars this one can bump into (not including itself)
   */
  update(dt, stick, otherCars) {
    const A = CONFIG.CAR;
    const throttle = stick.mag;

    if (throttle > 0) {
      const want = Math.atan2(stick.y, stick.x);
      const diff = angleDelta(want, this.angle);

      // Stick pointing sharply backwards while nearly stopped means "back up".
      // This exists so the car can always get out of a corner it nosed into.
      if (Math.abs(diff) > 2.2 && this.speed < 50) {
        this.speed = Math.max(
          this.speed - A.ACCEL * dt,
          -A.REVERSE_SPEED * throttle,
        );
      } else {
        this.speed = Math.min(this.speed + A.ACCEL * throttle * dt, A.MAX_SPEED);

        // The faster you go the harder you can turn, down to a slow pivot when
        // almost stopped — never zero, or a child can get properly stuck.
        const grip = Math.min(1, Math.abs(this.speed) / (A.MAX_SPEED * 0.45));
        const turn = A.TURN_RATE * (A.TURN_MIN + (1 - A.TURN_MIN) * grip) * dt;
        this.angle += Math.max(-turn, Math.min(turn, diff));
      }
    } else {
      // Coasting: slow down smoothly and come to a proper stop.
      this.speed -= this.speed * Math.min(1, A.DRAG * dt);
      if (Math.abs(this.speed) < 4) this.speed = 0;
    }

    this._move(dt, otherCars);
  }

  _move(dt, otherCars) {
    const dist = this.speed * dt;
    const dx = Math.cos(this.angle) * dist;
    const dy = Math.sin(this.angle) * dist;

    const blockers = otherCars.map((c) => c.boundsBox());
    const next = this.world.moveBox(this.x, this.y, this.half, this.half, dx, dy, blockers);

    this.x = next.x;
    this.y = next.y;

    // A soft bump: keep a little of the speed, lose most of it.
    if (next.blocked) this.speed *= CONFIG.CAR.BOUNCE;
  }

  /**
   * The box OTHER things collide with — the car's real footprint, so the
   * player has to walk around a car rather than onto it.
   *
   * This is deliberately not the same as `half`, which the car uses for its
   * own movement. That one is kept small and forgiving so a child driving
   * badly never wedges on a corner; this one has to match what is drawn, or
   * the player visibly stands on the bonnet.
   */
  boundsBox() {
    // Exact axis-aligned bounds of the rotated body rectangle.
    const c = Math.abs(Math.cos(this.angle));
    const s = Math.abs(Math.sin(this.angle));
    const w = this.length * c + this.width * s;
    const h = this.length * s + this.width * c;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  /**
   * Repaint this car, by index into the car palettes in config.js.
   * Used when the player gets into a car, so the car he drives is always
   * his chosen colour.
   */
  repaint(index) {
    const i = index % CONFIG.CAR_BODY_PALETTE.length;
    this.style = {
      ...this.style,
      body: CONFIG.CAR_BODY_PALETTE[i],
      roof: CONFIG.CAR_ROOF_PALETTE[i],
    };
  }

  /** How fast it is going, regardless of direction. Used by milestone 6. */
  get speedAbs() {
    return Math.abs(this.speed);
  }

  /**
   * Somewhere clear to step out onto: beside the car first, then behind,
   * then in front. Falls back to the car's own position, which is never ideal
   * but is always better than refusing to let the player out.
   *
   * @param otherCars cars that would be in the way
   */
  exitSpot(otherCars) {
    const half = CONFIG.PLAYER.HITBOX / 2;
    const reach = this.width / 2 + 24;
    const blockers = otherCars.map((c) => c.boundsBox());
    const w = this.world;

    // Left, right, behind, in front — as offsets from the car's heading.
    for (const turn of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
      const a = this.angle + turn;
      const x = this.x + Math.cos(a) * reach;
      const y = this.y + Math.sin(a) * reach;

      if (x < half || y < half || x > w.width - half || y > w.height - half) continue;
      if (!w._overlaps(x, y, half, half, blockers)) return { x, y };
    }
    return { x: this.x, y: this.y };
  }

  // =====================================================================
  // Drawing
  // =====================================================================
  draw(ctx) {
    const L = this.length;
    const W = this.width;
    const s = this.style;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);   // local +x is the front of the car

    // Shadow.
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    roundRect(ctx, -L / 2 + 3, -W / 2 + 5, L, W, 10);
    ctx.fill();

    // Wheels, poking out slightly at each corner.
    ctx.fillStyle = '#3A3A42';
    const wx = L * 0.28, wy = W / 2;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        roundRect(ctx, sx * wx - 9, sy * wy - 5, 18, 10, 4);
        ctx.fill();
      }
    }

    // Body.
    ctx.fillStyle = s.body;
    roundRect(ctx, -L / 2, -W / 2, L, W, 10);
    ctx.fill();

    // Windscreen and rear window, seen from above.
    ctx.fillStyle = '#BFE6F5';
    roundRect(ctx, L * 0.10, -W / 2 + 5, L * 0.20, W - 10, 4);
    ctx.fill();
    roundRect(ctx, -L * 0.34, -W / 2 + 5, L * 0.14, W - 10, 4);
    ctx.fill();

    // Roof.
    ctx.fillStyle = s.roof;
    roundRect(ctx, -L * 0.18, -W / 2 + 4, L * 0.26, W - 8, 6);
    ctx.fill();

    // Headlights.
    ctx.fillStyle = '#FFF6C9';
    roundRect(ctx, L / 2 - 7, -W / 2 + 5, 6, 8, 3); ctx.fill();
    roundRect(ctx, L / 2 - 7, W / 2 - 13, 6, 8, 3); ctx.fill();

    // Rear lights.
    ctx.fillStyle = '#FF7A7A';
    roundRect(ctx, -L / 2 + 2, -W / 2 + 5, 5, 8, 3); ctx.fill();
    roundRect(ctx, -L / 2 + 2, W / 2 - 13, 5, 8, 3); ctx.fill();

    ctx.restore();
  }
}

/**
 * Where the cars are parked, in map squares. Angles are in quarter turns:
 * 0 faces right (east), 1 faces down, 2 faces left, 3 faces up.
 *
 * They all sit on road squares beside a kerb, the way a parked car would.
 */
const PARKED = [
  // Right by where the player starts, so the very first car is easy to find.
  { tx: 19.5, ty: 20.0, dir: 1, type: 'car', c: 0 },

  { tx: 10.5, ty: 7.5,  dir: 0, type: 'car', c: 1 },
  { tx: 25.0, ty: 6.5,  dir: 2, type: 'van', c: 2 },
  { tx: 37.0, ty: 7.5,  dir: 0, type: 'car', c: 3 },

  { tx: 5.5,  ty: 12.0, dir: 3, type: 'car', c: 4 },
  { tx: 30.0, ty: 17.5, dir: 2, type: 'car', c: 5 },
  { tx: 40.5, ty: 22.0, dir: 1, type: 'van', c: 6 },

  { tx: 24.0, ty: 26.5, dir: 0, type: 'car', c: 7 },
  { tx: 12.0, ty: 27.5, dir: 2, type: 'car', c: 0 },
  { tx: 31.5, ty: 31.0, dir: 3, type: 'car', c: 2 },
];

/** Build every parked car in town. */
export function createCars(world) {
  const tile = CONFIG.TILE;
  return PARKED.map((p) => new Car(
    world,
    p.tx * tile,
    p.ty * tile,
    p.dir * (Math.PI / 2),
    {
      body: CONFIG.CAR_BODY_PALETTE[p.c],
      roof: CONFIG.CAR_ROOF_PALETTE[p.c],
      type: p.type,
    },
  ));
}
