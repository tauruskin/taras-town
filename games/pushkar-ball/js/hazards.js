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
 * The rectangle a spike patch occupies: exactly the one it is drawn in.
 *
 * Honest on purpose. Forgiveness is NOT carved out of this box — it is taken
 * off the BALL, in `hitsSpikes` below; insetting the box instead was the first
 * attempt and was rejected, for the reasons set out beside `SPIKE.FORGIVE` in
 * config.js, which is where anyone changing the number will be looking.
 *
 * `s.y` is the ground the spikes stand on and they are drawn upward from it,
 * so the top is `s.y - SPIKE.H` and the bottom sits flush ON the ground.
 * Flush is deliberate and is the one place forgiveness must not reach: a ball
 * rolling along the floor has to be caught, and it is only caught while the
 * box still reaches down to the floor it is rolling on. That holds as long as
 * `SPIKE.H > SPIKE.FORGIVE` — a shorter patch than the forgiveness allowance
 * would be stepped over by a ball on the ground.
 *
 * A rectangle is not the SILHOUETTE, and nobody should read it as one. The
 * teeth are triangles, so between two of them the drawn height falls to zero
 * while this box stays full height, and a ball creeping into that notch is
 * killed by something that looks like a gap. Do not try to fix that with
 * geometry: whether it is even noticeable is a thumb question, and it belongs
 * to Task 7 once there is something on a screen to look at.
 */
export function spikeBox(s, cfg) {
  return {
    x: s.x,
    y: s.y - cfg.SPIKE.H,
    w: s.w,
    h: cfg.SPIKE.H,
  };
}

/** Is this circle touching this rectangle? Closest point, then distance. */
function circleHitsBox(cx, cy, r, b) {
  const nx = cx < b.x ? b.x : cx > b.x + b.w ? b.x + b.w : cx;
  const ny = cy < b.y ? b.y : cy > b.y + b.h ? b.y + b.h : cy;
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/**
 * Which spike patch this body is touching, or null.
 *
 * Forgiveness lives here, and it is measured off the BALL: the circle tested
 * is `SPIKE.FORGIVE` smaller than the one drawn, so the ball may sink that far
 * into the picture before it counts.
 *
 * `FORGIVE` must stay below `BALL.R`, or the effective radius clamps to zero
 * and only a ball whose exact centre is inside the picture dies — which reads
 * as spikes that mostly do not work.
 *
 * Returns the patch itself rather than a boolean, so a caller can work out
 * which way to knock the ball back.
 */
export function spikeHit(body, spikes, cfg) {
  const r = Math.max(0, body.r - cfg.SPIKE.FORGIVE);
  for (const s of spikes) {
    if (circleHitsBox(body.x, body.y, r, spikeBox(s, cfg))) return s;
  }
  return null;
}

/** Boolean form of spikeHit, for callers that don't need which patch. */
export function hitsSpikes(body, spikes, cfg) {
  return !!spikeHit(body, spikes, cfg);
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
