/**
 * flight.js — Being in the air.
 *
 * Flying is deliberately NOT a mode of its own. It is `mode === DRIVING` with
 * an `air` vehicle, which is what lets the whole of the rest of the game carry
 * on unchanged: the wire already says which vehicle somebody is in, so a
 * friend in a helicopter is described correctly with no new message, and every
 * existing `mode === DRIVING` check stays true.
 *
 * Height is a DRAWING offset and never a coordinate. The helicopter's x and y
 * are on the ground the whole time — which is why its shadow needs no working
 * out, and why landing is simply a question about the spot it is already over.
 */

import { CONFIG } from './config.js';

/**
 * Ease the height towards up or down.
 *
 * Returns the new lift, 0 on the ground and 1 at full height. Separate from
 * anything that draws so the tests can run it in Node.
 */
export function liftToward(lift, up, dt) {
  const target = up ? 1 : 0;
  const next = lift + (target - lift) * Math.min(1, CONFIG.HELI.LIFT_SPEED * dt);
  // Settle rather than creep towards it for ever.
  if (Math.abs(target - next) < 0.01) return target;
  return next;
}

/**
 * Can this helicopter be put down where it is hovering?
 *
 * Three questions, and all of them have to be yes. This is the strictest rule
 * in the feature on purpose: a child must always be able to get out of
 * whatever he is in, and three separate bugs of exactly that shape turned up
 * while the insides of houses were built.
 */
export function canLandAt(world, heli, others) {
  // 1. Not on the water. A helicopter bobbing on the river is not a thing
  //    this game is going to try to explain.
  if (world.isWaterAt(heli.x, heli.y)) return false;

  // 2. The helicopter itself has to fit, clear of buildings, trees and
  //    anything else parked there.
  const blockers = others.filter((o) => o !== heli).map((o) => o.boundsBox());
  if (world._overlaps(heli.x, heli.y, heli.half, heli.half, blockers)) return false;

  // 3. And there has to be somewhere for him to step out onto — the same
  //    question a car already asks before it lets anybody out.
  return heli.exitSpot(others) !== null;
}

/**
 * The shadow on the ground, drawn at the vehicle's real position.
 *
 * Drawn down with the other ground-level things rather than with the body,
 * because a shadow painted over a tree the helicopter is flying above looks
 * far worse than no shadow at all.
 */
export function drawFlyingShadow(ctx, heli, lift) {
  if (lift <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = 0.28 * lift;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  // Shrinking as it rises, which is most of what says "this is high up" --
  // the gap alone reads as ambiguous, and could just as easily be a machine
  // drawn slightly off centre. The shadow getting smaller is the half of it
  // that says the distance is vertical.
  const k = 1 - 0.34 * lift;
  ctx.ellipse(heli.x, heli.y, heli.length * 0.42 * k, heli.width * 0.55 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The helicopter itself, lifted off its own shadow.
 *
 * Drawn AFTER the tree canopies. Everything else in the town is drawn before
 * them so that leaves fall over the top and give the place some depth; a
 * helicopter passing over a wood has to be the one thing that goes above.
 */
export function drawFlyingBody(ctx, heli, lift) {
  const up = CONFIG.HELI.ALTITUDE * lift;
  ctx.save();
  ctx.translate(0, -up);
  heli.draw(ctx);
  ctx.restore();
}
