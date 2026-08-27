/**
 * effects.js — The celebration when a job is finished.
 *
 * Confetti plus a coin that floats up. Both are drawn in SCREEN space, on top
 * of everything, so the celebration always happens where the player is looking
 * rather than somewhere the camera might be about to leave behind.
 */

const CONFETTI_COLORS = [
  '#FF6B6B', '#4EA8FF', '#FFD93D', '#6BCB77',
  '#C77DFF', '#FF9F45', '#4ECDC4', '#F78FB3',
];

export class Effects {
  constructor() {
    this.bits = [];
    this.coins = [];
  }

  /** Is anything still on screen? */
  get busy() {
    return this.bits.length > 0 || this.coins.length > 0;
  }

  /**
   * Throw confetti from a point on screen.
   * @param reward  how many coins to float up, or 0 for none
   */
  celebrate(x, y, reward = 0) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 320;
      this.bits.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 180,   // biased upwards, so it rains down
        size: 6 + Math.random() * 7,
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * Math.PI,
        life: 1.5 + Math.random() * 0.9,
        age: 0,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      });
    }

    if (reward > 0) {
      this.coins.push({ x, y: y - 20, amount: reward, age: 0, life: 1.5 });
    }
  }

  update(dt) {
    const GRAVITY = 620;

    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.age += dt;
      if (b.age >= b.life) { this.bits.splice(i, 1); continue; }

      b.vy += GRAVITY * dt;
      b.vx *= 1 - Math.min(1, 1.1 * dt);   // air drag, so it flutters to a stop
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.spin * dt;
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      if (c.age >= c.life) this.coins.splice(i, 1);
    }
  }

  /** Draw in screen coordinates. Call after the world and the HUD. */
  draw(ctx) {
    for (const b of this.bits) {
      const fade = 1 - Math.max(0, (b.age - b.life * 0.6) / (b.life * 0.4));

      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = b.color;
      // Squashing the height as it spins fakes a paper flake turning over.
      ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size * 0.55);
      ctx.restore();
    }

    for (const c of this.coins) {
      const t = c.age / c.life;
      const y = c.y - t * 70;

      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t * t);
      ctx.translate(c.x, y);
      const scale = 1 + Math.sin(Math.min(1, t * 4) * Math.PI * 0.5) * 0.5;
      ctx.scale(scale, scale);

      drawCoin(ctx, 0, 0, 17);

      // "+5". A digit is the one bit of text a 6-year-old reliably reads.
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 4;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.strokeText('+' + c.amount, 22, 0);
      ctx.fillText('+' + c.amount, 22, 0);
      ctx.restore();
    }
  }
}

/** A gold coin. Shared by the celebration and the HUD counter. */
export function drawCoin(ctx, x, y, r) {
  ctx.fillStyle = '#E0A81F';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#FFD23F';
  ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#E0A81F';
  ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, Math.PI * 2); ctx.fill();
}
