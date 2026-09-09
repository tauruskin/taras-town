/**
 * hazards.js — the things that send the ball back.
 *
 * Spikes only, for now. Saws and crushers belong to phase 3, with the levels
 * that use them: building a hazard no level contains is building ahead, and a
 * crusher in particular needs a level authored around it, since it is a solid
 * moving body that can trap a ball or a crate against the floor.
 *
 * A hazard is NOT a collider. It never becomes a segment and the ball never
 * bounces off it — the ball rolls into it and fails. That is why this file has
 * no connection to physics.js at all, and why its hit tests are ordinary
 * geometry rather than anything to do with resolution.
 *
 * `spikeBox` and `hitsSpikes` are pure and DOM-free, so node tests the real
 * arithmetic. Only `drawSpikes` touches a context, and it is handed one.
 */

/**
 * The rectangle that actually kills, given a spike patch as authored.
 *
 * Smaller than the picture on every side by SPIKE.FORGIVE. See the note on
 * that number in config.js: being killed by something you clearly touched is
 * fair, being killed by something you clearly missed is not, and only one of
 * those two mistakes is worth risking with a six-year-old.
 *
 * `s.y` is the ground the spikes stand on, and they are drawn upward from it,
 * so the box's top is `s.y - SPIKE.H` and it never hangs below the ground.
 */
export function spikeBox(s, cfg) {
  const f = cfg.SPIKE.FORGIVE;
  return {
    x: s.x + f,
    y: s.y - cfg.SPIKE.H + f,
    w: Math.max(0, s.w - f * 2),
    h: Math.max(0, cfg.SPIKE.H - f),
  };
}

/** Is this circle touching this rectangle? Closest point, then distance. */
function circleHitsBox(cx, cy, r, b) {
  const nx = cx < b.x ? b.x : cx > b.x + b.w ? b.x + b.w : cx;
  const ny = cy < b.y ? b.y : cy > b.y + b.h ? b.y + b.h : cy;
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/** Is the ball in any of these spike patches? */
export function hitsSpikes(ball, spikes, cfg) {
  for (const s of spikes) {
    if (circleHitsBox(ball.x, ball.y, ball.r, spikeBox(s, cfg))) return true;
  }
  return false;
}

/**
 * Draw the patches as rows of teeth.
 *
 * Called inside the world transform, so everything here is in world units.
 * Steel, never red: the browser suites find the ball by being the only thing
 * on screen of its hue.
 */
export function drawSpikes(ctx, spikes, cfg) {
  const C = cfg.COLOURS;
  for (const s of spikes) {
    const n = Math.max(1, Math.round(s.w / cfg.SPIKE.TOOTH_W));
    const tw = s.w / n;

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = s.x + i * tw;
      ctx.moveTo(x, s.y);
      ctx.lineTo(x + tw / 2, s.y - cfg.SPIKE.H);
      ctx.lineTo(x + tw, s.y);
      ctx.closePath();
    }
    ctx.fillStyle = C.SPIKE;
    ctx.fill();
    ctx.strokeStyle = C.SPIKE_EDGE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // A base strip, so a patch reads as one fixture rather than a row of
    // loose triangles balanced on the grass.
    ctx.fillStyle = C.SPIKE_EDGE;
    ctx.fillRect(s.x, s.y - 4, s.w, 5);
  }
}
