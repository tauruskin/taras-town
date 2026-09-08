/**
 * player.js — Taras, on foot.
 *
 * The character is drawn from directly above, out of simple shapes: a body,
 * a head with hair, two arms and two feet. The whole thing is rotated to face
 * whichever way he is walking, and the arms and feet swing while he moves.
 *
 * The sprite is drawn "facing up the screen" in its own local coordinates,
 * and the rotation does the rest.
 */

import { CONFIG } from './config.js';
import { roundRect } from './world.js';

export class Player {
  constructor(world, x, y) {
    this.world = world;
    this.x = x;
    this.y = y;

    this.angle = 0;      // radians; 0 = facing right, like Math.atan2
    this.walkPhase = 0;  // drives the arm and leg swing
    this.speed01 = 0;    // 0 = still, 1 = full pelt (smoothed, for animation)

    // In the water. Set every frame from where he is standing, so wading in
    // and climbing out need no special code at the water's edge — he simply
    // starts swimming when he is in it and stops when he is not.
    this.swimming = false;
    this.swimPhase = 0;  // drives the bobbing and the ripples

    // What he's wearing. These are instance fields rather than constants
    // because the customisation menu changes them at runtime.
    this.hat = CONFIG.HAT_PALETTE[0];
    this.shirt = CONFIG.SHIRT_PALETTE[0];
  }

  /** Apply a chosen outfit, by index into the palettes in config.js. */
  setOutfit(hatIndex, shirtIndex) {
    this.hat = CONFIG.HAT_PALETTE[hatIndex] || CONFIG.HAT_PALETTE[0];
    this.shirt = CONFIG.SHIRT_PALETTE[shirtIndex] || CONFIG.SHIRT_PALETTE[0];
  }

  /**
   * @param dt        seconds since last frame
   * @param stick     { x, y, mag } from the joystick
   * @param blockers  extra rectangles to walk around, i.e. the parked cars
   */
  update(dt, stick, blockers) {
    const P = CONFIG.PLAYER;
    this.swimming = this.world.isWaterAt(this.x, this.y);
    this.swimPhase += dt * 2.4;

    // Swimming is slower than running, which is both true and useful: it
    // makes striking out across the river feel like a proper expedition
    // rather than a shortcut.
    const speed = this.swimming ? P.SPEED * P.SWIM_SPEED : P.SPEED;

    if (stick.mag > 0) {
      // Move.
      const dist = speed * stick.mag * dt;
      const next = this.world.moveBox(
        this.x, this.y,
        P.HITBOX / 2, P.HITBOX / 2,
        stick.x * dist, stick.y * dist,
        blockers,
      );
      this.x = next.x;
      this.y = next.y;

      // Water is not solid for a person, so getting in and out is just
      // walking. All that changes is how he looks and how fast he goes.
      this.swimming = this.world.isWaterAt(this.x, this.y);

      // Turn to face where the joystick is pointing, by the shortest way round.
      const want = Math.atan2(stick.y, stick.x);
      let diff = want - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.angle += diff * Math.min(1, P.TURN_SPEED * dt);

      this.walkPhase += dt * P.BOB_SPEED * stick.mag;
    }

    // Ease the animation strength so starting and stopping isn't abrupt.
    const targetSpeed = stick.mag;
    this.speed01 += (targetSpeed - this.speed01) * Math.min(1, 12 * dt);
    if (this.speed01 < 0.02) this.speed01 = 0;
  }

  draw(ctx) {
    if (this.swimming) { this._drawSwimming(ctx); return; }

    const C = CONFIG.COLORS;
    const swing = Math.sin(this.walkPhase) * 6 * this.speed01;

    ctx.save();
    ctx.translate(this.x, this.y);
    // The sprite below is drawn pointing "up" (towards -y), so add a quarter
    // turn to line that up with this.angle.
    ctx.rotate(this.angle + Math.PI / 2);
    ctx.scale(CONFIG.PLAYER.DRAW_SCALE, CONFIG.PLAYER.DRAW_SCALE);

    // --- shadow (drawn unrotated-ish; a circle looks the same either way)
    ctx.fillStyle = C.SHADOW;
    ctx.beginPath();
    ctx.ellipse(0, 4, 17, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- feet. Kept short and close to the body: seen from above, long feet
    //     trailing behind just read as a dark smudge.
    ctx.fillStyle = C.SHOE;
    roundRect(ctx, -10, 2 + swing, 8, 9, 4); ctx.fill();
    roundRect(ctx, 2, 2 - swing, 8, 9, 4); ctx.fill();

    // --- legs
    ctx.fillStyle = C.PANTS;
    roundRect(ctx, -10, -2 + swing * 0.5, 8, 9, 3); ctx.fill();
    roundRect(ctx, 2, -2 - swing * 0.5, 8, 9, 3); ctx.fill();

    // --- arms, swinging the other way to the feet
    ctx.fillStyle = C.SKIN;
    ctx.beginPath(); ctx.arc(-14, -2 - swing * 0.7, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -2 + swing * 0.7, 5.5, 0, Math.PI * 2); ctx.fill();

    // --- body
    ctx.fillStyle = this.shirt;
    roundRect(ctx, -12, -12, 24, 20, 8); ctx.fill();

    // --- head: a cap, seen from straight above. There is no face or hair to
    //     draw from this angle, and the brim is a much stronger direction
    //     cue at phone size than a face ever was — it physically points the
    //     way he is walking.
    ctx.fillStyle = this.hat.brim;
    ctx.beginPath();
    ctx.ellipse(0, -19, 11, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.hat.crown;
    ctx.beginPath(); ctx.arc(0, -9, 11, 0, Math.PI * 2); ctx.fill();

    // The little button on the crown.
    ctx.fillStyle = C.HAT_TOP;
    ctx.beginPath(); ctx.arc(0, -9, 2.6, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }
  /**
   * Taras in the water.
   *
   * Seen from above, a swimmer is mostly rings: the ripple he is making, an
   * orange armband ring, his head, and two hands out in front. Legs and feet
   * are left off entirely — underwater, they would only read as a smudge.
   *
   * The armbands are deliberate. A game that says "jump in the river, it is
   * great fun" to a six-year-old can just as easily say "and you put these on
   * first", and from above they are the clearest thing on him.
   */
  _drawSwimming(ctx) {
    const C = CONFIG.COLORS;
    const bob = Math.sin(this.swimPhase * 2) * 0.8;
    const stroke = Math.sin(this.swimPhase * 3.2) * 4 * (0.35 + this.speed01);

    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(this.angle + Math.PI / 2);
    ctx.scale(CONFIG.PLAYER.DRAW_SCALE, CONFIG.PLAYER.DRAW_SCALE);

    // Ripples spreading out, which is what says "in the water" before any
    // detail of the swimmer registers.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const t = ((this.swimPhase * 0.6 + i * 0.5) % 1);
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.beginPath();
      ctx.ellipse(0, 0, 15 + t * 14, 11 + t * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Hands out in front, pulling.
    ctx.fillStyle = C.SKIN;
    ctx.beginPath(); ctx.arc(-9, -13 - stroke, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(9, -13 + stroke, 4.5, 0, Math.PI * 2); ctx.fill();

    // The armband ring, worn round the middle.
    ctx.fillStyle = '#FF8A2B';
    ctx.beginPath(); ctx.arc(0, -2, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF1DC';
    ctx.beginPath(); ctx.arc(0, -2, 14, -0.5, 0.9); ctx.fill();
    ctx.fillStyle = this.shirt;
    ctx.beginPath(); ctx.arc(0, -2, 8.5, 0, Math.PI * 2); ctx.fill();

    // Head and cap, sitting above the ring.
    ctx.fillStyle = this.hat.brim;
    ctx.beginPath();
    ctx.ellipse(0, -13, 10, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.hat.crown;
    ctx.beginPath(); ctx.arc(0, -5, 10, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

}
