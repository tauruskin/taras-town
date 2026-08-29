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
import { roundRect, T, hash } from './world.js';

/** Shortest way round from one angle to another, in the range -PI..PI. */
function angleDelta(target, from) {
  let d = target - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Look a vehicle up by its id, falling back to the first one. */
export function vehicleById(id) {
  return CONFIG.VEHICLES.find((v) => v.id === id) || CONFIG.VEHICLES[0];
}

/** Look a vehicle up by its position in the shop, falling back to the first. */
export function vehicleByIndex(i) {
  return CONFIG.VEHICLES[i] || CONFIG.VEHICLES[0];
}

export class Car {
  /**
   * @param style { body, roof, type } — `type` is a vehicle id, e.g. 'bus'
   */
  constructor(world, x, y, angle, style) {
    this.world = world;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;          // along the car's own heading; negative = reversing
    this.style = style;

    this._applySpec(vehicleById(style.type));

    // Where the car started, so it can be put back if it ever needs to be.
    this.home = { x, y, angle };
  }

  /** Take on a vehicle's size and handling. */
  _applySpec(spec) {
    this.spec = spec;
    this.length = spec.LENGTH;
    this.width = spec.WIDTH;
    this.style = { ...this.style, type: spec.id };
  }

  /**
   * Half-size of the square used to move around town.
   *
   * Scaled from the vehicle's width rather than being one fixed number for
   * everything, so a bus really is less nimble than a hatchback — but still
   * smaller than the vehicle looks, and clamped, so nothing can ever wedge.
   */
  get half() {
    const C = CONFIG.CAR;
    const raw = this.width * C.HITBOX_FROM_WIDTH;
    return Math.max(C.HITBOX_MIN, Math.min(C.HITBOX_MAX, raw)) / 2;
  }

  /**
   * Take on a vehicle's appearance and nothing else — no collision check, no
   * nudging out of the way.
   *
   * This is for the stand-ins that represent other players: they are drawn
   * and nothing more, so shoving one out of a wall would be meaningless, and
   * running the check on somebody else's position would be wrong anyway.
   */
  setVehicleVisual(index) {
    this._applySpec(vehicleByIndex(index));
  }

  /**
   * Swap this vehicle for another, by its position in the shop.
   *
   * Changing vehicle changes its SIZE, so this has to be careful: turning a
   * hatchback into a bus while parked in a tight spot would otherwise leave
   * it embedded in a wall. If the new shape does not fit where the old one
   * was standing, it is nudged to the nearest place it does.
   *
   * @param otherCars vehicles that would be in the way
   * @returns false if there was nowhere at all for the new shape to go, in
   *          which case nothing is changed
   */
  setVehicle(index, otherCars = []) {
    const spec = vehicleByIndex(index);
    if (spec.id === this.spec.id) return true;      // already driving it

    const before = { spec: this.spec, length: this.length, width: this.width, style: this.style };
    this._applySpec(spec);

    const blockers = otherCars.filter((c) => c !== this).map((c) => c.boundsBox());
    if (!this.world._overlaps(this.x, this.y, this.half, this.half, blockers)) return true;

    // It does not fit here. Find the nearest spot it does.
    const spot = this.world.findFreeSpot(this.x, this.y, this.half, blockers, 200);
    if (spot) {
      this.x = spot.x;
      this.y = spot.y;
      this.speed = 0;      // do not let a nudge fling it off somewhere
      return true;
    }

    // Nowhere to put it. Stay as we were rather than end up inside a wall.
    this.spec = before.spec;
    this.length = before.length;
    this.width = before.width;
    this.style = before.style;
    return false;
  }

  /**
   * Drive for one frame.
   * @param stick      { x, y, mag } from the joystick
   * @param otherCars  the cars this one can bump into (not including itself)
   */
  update(dt, stick, otherCars) {
    // Speed, acceleration and turning come from THIS vehicle; the shared
    // feel — reversing, drag, how softly it bumps — stays common to all.
    const A = {
      ...CONFIG.CAR,
      MAX_SPEED: this.spec.MAX_SPEED,
      ACCEL: this.spec.ACCEL,
      TURN_RATE: this.spec.TURN_RATE,
    };
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
    // The last argument keeps the wheels out of the river.
    const next = this.world.moveBox(this.x, this.y, this.half, this.half, dx, dy, blockers, true);

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
   * Somewhere clear to step out onto, or null if there is nowhere at all.
   *
   * Three things here are easy to get wrong, and all three of them were:
   *
   *   - THE VEHICLE ITSELF COUNTS. While driving it is not in the way; the
   *     instant the player is out, it is solid to them like any other. A spot
   *     that overlaps it is therefore a trap, not an exit, so it is included
   *     in the obstacles below.
   *
   *   - HOW FAR OUT TO STEP DEPENDS ON THE DIRECTION. Stepping out sideways
   *     only has to clear the vehicle's width; stepping out behind has to
   *     clear its length. Using the width for both put anyone leaving a bus
   *     inside the bus.
   *
   *   - FOUR PLACES IS NOT ENOUGH. Parked snugly between two things, all four
   *     of left/right/behind/front can be blocked, and the old code then gave
   *     up and dropped the player at the vehicle's own centre — the worst
   *     possible answer, and exactly the "stuck inside things" this fixes.
   *
   * @param others everything else solid and movable — vehicles AND people
   * @returns { x, y }, or null when there is genuinely nowhere to stand
   */
  exitSpot(others) {
    const half = CONFIG.PLAYER.HITBOX / 2;
    const w = this.world;

    const blockers = [...others.filter((o) => o !== this), this]
      .map((o) => o.boundsBox());

    const fits = (x, y) =>
      x > half && y > half && x < w.width - half && y < w.height - half &&
      !w._overlaps(x, y, half, half, blockers);

    // How far this vehicle's body reaches in a given direction. Generous on
    // the diagonals, which is the safe way to be wrong.
    const bodyReach = (angle) => {
      const local = angle - this.angle;
      return Math.abs(Math.cos(local)) * (this.length / 2)
           + Math.abs(Math.sin(local)) * (this.width / 2);
    };

    // Beside first, then behind, then in front — those are the natural places
    // to step out — and only then anywhere else that works.
    const preferred = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];
    const rest = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (!preferred.some((p) => Math.abs(Math.atan2(Math.sin(a - p), Math.cos(a - p))) < 0.05)) {
        rest.push(a);
      }
    }

    for (const extra of [0, 14, 30, 48]) {
      for (const turn of [...preferred, ...rest]) {
        const a = this.angle + turn;
        const d = bodyReach(a) + half + 10 + extra;
        const x = this.x + Math.cos(a) * d;
        const y = this.y + Math.sin(a) * d;
        if (fits(x, y)) return { x, y };
      }
    }

    // Nothing in a ring around the vehicle. Widen the search properly before
    // giving up: findFreeSpot spirals outwards and will find gaps a ring of
    // fixed distances steps straight over.
    const found = w.findFreeSpot(this.x, this.y, half, blockers, 240);
    if (found) return found;

    // Genuinely nowhere. Saying so lets the game keep the player in the
    // vehicle, which is recoverable — they can simply drive somewhere else.
    // Putting them down anyway would not be.
    return null;
  }

  // =====================================================================
  // Drawing
  // =====================================================================
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);   // local +x is the front of the vehicle

    const L = this.length;
    const W = this.width;

    // Shadow, common to everything, so they all sit on the road the same way.
    ctx.fillStyle = CONFIG.COLORS.SHADOW;
    roundRect(ctx, -L / 2 + 3, -W / 2 + 5, L, W, 10);
    ctx.fill();

    this._drawWheels(ctx, L, W);

    switch (this.spec.shape) {
      case 'van':     this._drawVan(ctx, L, W); break;
      case 'jeep':    this._drawJeep(ctx, L, W); break;
      case 'sports':  this._drawSports(ctx, L, W); break;
      case 'monster': this._drawMonster(ctx, L, W); break;
      case 'bus':     this._drawBus(ctx, L, W); break;
      default:        this._drawCar(ctx, L, W); break;
    }

    this._drawLights(ctx, L, W);
    ctx.restore();
  }

  /**
   * Wheels at each corner, sized by the vehicle's own `wheel` factor.
   *
   * Drawn before the body so they tuck underneath it — except on the monster
   * truck, where they are big enough to stick right out past the sides, which
   * is the entire point of a monster truck.
   */
  _drawWheels(ctx, L, W) {
    const k = this.spec.wheel;
    const long = 18 * k;
    const across = 10 * k;

    ctx.fillStyle = '#3A3A42';
    const wx = L * 0.28;
    const wy = W / 2;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        roundRect(ctx, sx * wx - long / 2, sy * wy - across / 2, long, across, 4 * k);
        ctx.fill();
      }
    }

    // Big wheels get a hub, so they read as wheels rather than dark blocks.
    if (k >= 1.4) {
      ctx.fillStyle = '#8A8F9C';
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sx * wx, sy * wy, across * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /** Head and rear lights, common to everything. */
  _drawLights(ctx, L, W) {
    ctx.fillStyle = '#FFF6C9';
    roundRect(ctx, L / 2 - 7, -W / 2 + 5, 6, 8, 3); ctx.fill();
    roundRect(ctx, L / 2 - 7, W / 2 - 13, 6, 8, 3); ctx.fill();

    ctx.fillStyle = '#FF7A7A';
    roundRect(ctx, -L / 2 + 2, -W / 2 + 5, 5, 8, 3); ctx.fill();
    roundRect(ctx, -L / 2 + 2, W / 2 - 13, 5, 8, 3); ctx.fill();
  }

  /** Windows are the same pale blue everywhere, so they read as glass. */
  _glass(ctx, x, y, w, h, r = 4) {
    ctx.fillStyle = '#BFE6F5';
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  }

  // --- the six shapes ---------------------------------------------------

  _drawCar(ctx, L, W) {
    const s = this.style;
    ctx.fillStyle = s.body;
    roundRect(ctx, -L / 2, -W / 2, L, W, 10);
    ctx.fill();

    this._glass(ctx, L * 0.10, -W / 2 + 5, L * 0.20, W - 10);
    this._glass(ctx, -L * 0.34, -W / 2 + 5, L * 0.14, W - 10);

    ctx.fillStyle = s.roof;
    roundRect(ctx, -L * 0.18, -W / 2 + 4, L * 0.26, W - 8, 6);
    ctx.fill();
  }

  /** Boxier than the car, with a long blank flank where the load goes. */
  _drawVan(ctx, L, W) {
    const s = this.style;
    ctx.fillStyle = s.body;
    roundRect(ctx, -L / 2, -W / 2, L, W, 8);
    ctx.fill();

    this._glass(ctx, L * 0.24, -W / 2 + 5, L * 0.16, W - 10);

    ctx.fillStyle = s.roof;
    roundRect(ctx, -L * 0.44, -W / 2 + 4, L * 0.62, W - 8, 6);
    ctx.fill();

    // A seam down the middle of the back doors.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-L * 0.44, 0);
    ctx.lineTo(-L * 0.44 + L * 0.62, 0);
    ctx.stroke();
  }

  /** Squarer and stubbier, with roof bars and a spare wheel on the back. */
  _drawJeep(ctx, L, W) {
    const s = this.style;
    ctx.fillStyle = s.body;
    roundRect(ctx, -L / 2, -W / 2, L, W, 6);
    ctx.fill();

    this._glass(ctx, L * 0.14, -W / 2 + 5, L * 0.18, W - 10, 3);

    ctx.fillStyle = s.roof;
    roundRect(ctx, -L * 0.30, -W / 2 + 4, L * 0.42, W - 8, 4);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 3;
    for (const t of [-0.22, 0, 0.22]) {
      ctx.beginPath();
      ctx.moveTo(L * t - L * 0.06, -W / 2 + 5);
      ctx.lineTo(L * t - L * 0.06, W / 2 - 5);
      ctx.stroke();
    }

    // Spare wheel on the tail.
    ctx.fillStyle = '#3A3A42';
    ctx.beginPath();
    ctx.arc(-L / 2 + 3, 0, W * 0.20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8A8F9C';
    ctx.beginPath();
    ctx.arc(-L / 2 + 3, 0, W * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Low, tapered to a point at the nose, with a spoiler and a racing stripe. */
  _drawSports(ctx, L, W) {
    const s = this.style;

    ctx.fillStyle = s.body;
    ctx.beginPath();
    ctx.moveTo(L / 2, 0);                        // the point of the nose
    ctx.lineTo(L * 0.22, -W / 2);
    ctx.lineTo(-L * 0.46, -W / 2);
    ctx.quadraticCurveTo(-L / 2, 0, -L * 0.46, W / 2);
    ctx.lineTo(L * 0.22, W / 2);
    ctx.closePath();
    ctx.fill();

    // A stripe from nose to tail.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    roundRect(ctx, -L * 0.42, -W * 0.09, L * 0.80, W * 0.18, 2);
    ctx.fill();

    this._glass(ctx, -L * 0.02, -W / 2 + 5, L * 0.20, W - 10, 5);

    ctx.fillStyle = s.roof;
    roundRect(ctx, -L * 0.30, -W / 2 + 5, L * 0.26, W - 10, 5);
    ctx.fill();

    // Spoiler across the tail.
    ctx.fillStyle = s.roof;
    roundRect(ctx, -L / 2 - 1, -W / 2 - 2, 6, W + 4, 2);
    ctx.fill();
  }

  /** A small cab perched on a big chassis. The wheels do the talking. */
  _drawMonster(ctx, L, W) {
    const s = this.style;

    // Chassis, narrower than the wheels so they stick out past it.
    ctx.fillStyle = 'rgba(40,42,52,0.9)';
    roundRect(ctx, -L * 0.42, -W * 0.30, L * 0.84, W * 0.60, 4);
    ctx.fill();

    // The cab sits high and short.
    ctx.fillStyle = s.body;
    roundRect(ctx, -L * 0.26, -W * 0.40, L * 0.62, W * 0.80, 7);
    ctx.fill();

    this._glass(ctx, L * 0.16, -W * 0.34, L * 0.16, W * 0.68, 3);

    ctx.fillStyle = s.roof;
    roundRect(ctx, -L * 0.20, -W * 0.36, L * 0.32, W * 0.72, 5);
    ctx.fill();

    // Exhaust stacks either side of the cab.
    ctx.fillStyle = '#C9CDD6';
    roundRect(ctx, -L * 0.24, -W * 0.44, 5, 7, 2); ctx.fill();
    roundRect(ctx, -L * 0.24, W * 0.44 - 7, 5, 7, 2); ctx.fill();
  }

  /** Long, flat, and lined with windows. */
  _drawBus(ctx, L, W) {
    const s = this.style;

    ctx.fillStyle = s.body;
    roundRect(ctx, -L / 2, -W / 2, L, W, 9);
    ctx.fill();

    // A stripe down each flank, the way a real bus is liveried.
    ctx.fillStyle = s.roof;
    roundRect(ctx, -L / 2 + 4, -W / 2 + 3, L - 8, 5, 2); ctx.fill();
    roundRect(ctx, -L / 2 + 4, W / 2 - 8, L - 8, 5, 2); ctx.fill();

    // Windscreen, then a row of side windows.
    this._glass(ctx, L * 0.36, -W / 2 + 6, L * 0.10, W - 12, 3);

    const first = -L * 0.40;
    const span = L * 0.72;
    const count = 5;
    const gap = span / count;
    for (let i = 0; i < count; i++) {
      const x = first + i * gap + 2;
      this._glass(ctx, x, -W / 2 + 8, gap - 5, 6, 2);
      this._glass(ctx, x, W / 2 - 14, gap - 5, 6, 2);
    }

    // The door, just behind the windscreen.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(ctx, L * 0.20, W / 2 - 6, L * 0.12, 5, 2);
    ctx.fill();
  }

}

/**
 * Where the cars are parked, in map squares. Angles are in quarter turns:
 * 0 faces right (east), 1 faces down, 2 faces left, 3 faces up.
 *
 * They all sit on road squares beside a kerb, the way a parked car would.
 */
/**
 * Park cars all over town.
 *
 * These used to be a hand-typed list of ten, in tile coordinates. That was
 * fine for a map you could see most of at once; on a town four times the size
 * every one of them sat in the top-left corner and the rest of the streets
 * were empty. They are now found from the map itself, so however big the town
 * gets there are always cars a reasonable walk away.
 */
export function createCars(world) {
  const half = CONFIG.CAR.HITBOX_MAX / 2;

  // Spots on the road, well spread out, and not jammed against scenery.
  const spots = world.sweepSpots(
    (kind) => kind === T.ROAD,
    420,          // a good long walk between one car and the next
    0.42,
    half,
    2,
  );

  // The nearest one to where the player starts goes first and is always an
  // ordinary car: the very first vehicle he ever finds should be easy to
  // reach and should drive the way he expects.
  spots.sort((a, b) =>
    Math.hypot(a.x - world.spawn.x, a.y - world.spawn.y) -
    Math.hypot(b.x - world.spawn.x, b.y - world.spawn.y));

  const cars = [];
  const wanted = Math.min(spots.length, 34);

  for (let i = 0; i < wanted; i++) {
    const spot = spots[i];

    // Point the car along the road it is standing on, rather than across it.
    const c = Math.floor(spot.x / world.tile);
    const r = Math.floor(spot.y / world.tile);
    const across = world.grid[r] && world.grid[r][c - 1] === T.ROAD &&
                   world.grid[r][c + 1] === T.ROAD;
    const angle = across ? 0 : Math.PI / 2;

    // A spread of vehicles, but the first is always the plain one.
    const pick = i === 0 ? 0 : Math.floor(hash(c * 13 + 7, r * 5 + 3) * CONFIG.VEHICLES.length);
    const colour = Math.floor(hash(c + 91, r + 17) * CONFIG.CAR_BODY_PALETTE.length);

    const car = new Car(world, spot.x, spot.y, angle, {
      body: CONFIG.CAR_BODY_PALETTE[colour],
      roof: CONFIG.CAR_ROOF_PALETTE[colour],
      type: CONFIG.VEHICLES[pick].id,
    });

    // Never leave one standing inside another.
    if (world._overlaps(car.x, car.y, car.half, car.half, cars.map((k) => k.boundsBox()))) continue;
    cars.push(car);
  }

  return cars;
}
