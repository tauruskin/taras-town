/**
 * circuits.js — what drives what.
 *
 * A SENDER is something the world presses: a plate (held down only while
 * something heavy rests on it — level six's switch), a button (pressed by
 * anything that hits its capped side, and stays pressed), or a timer (a
 * button that lets go again after `time` seconds). A RECEIVER — a gate or a
 * bridge, both built in levels.js because they are colliders — lists what it
 * `needs`: every id listed must be on, and an id written `!id` must be off.
 * That is the whole language, AND and NOT; see the spec for why nothing more.
 *
 * Something that presses is a PRESSER: a box `{ x, y, w, h, heavy, resting }`.
 * Every presser can hit a button; a plate wants one that is heavy and resting.
 * The level builds the list each step — its crates, and the ball, which
 * reports itself through `level.noteBall` — and later enemies join the same
 * list without anything here changing.
 *
 * Never touches the DOM. The drawing functions at the bottom take a canvas
 * context as a parameter, the way enemies.js and hazards.js already do, so
 * importing this file into Node is safe.
 */

const KINDS = ['plate', 'button', 'timer'];

/**
 * Move `value` toward `target` at `rate` (a fraction of the value's full
 * range per second) over `dt`, clamping so it never overshoots and holding
 * exactly AT `target` once reached — a two-way ternary
 * (`target > value ? increase : decrease`) oscillates forever the instant
 * `value` hits `target` exactly, since `target > target` is false and falls
 * into the decrease branch. Shared by a gate's and a bridge's `openT`, a
 * beam, and every sender's cosmetic `animT`, which hit exactly this bug once
 * already before being unified. Moved here from levels.js so that both
 * files can use one copy.
 */
export function rampToward(value, target, dt, rate) {
  const step = dt * rate;
  if (target > value) return Math.min(target, value + step);
  if (target < value) return Math.max(target, value - step);
  return value;
}

/**
 * A sender, from its level data. `index` is its place in the level's list,
 * and picks its colour, so a level's first sender is always the first
 * colour. An unknown kind throws: a sender that silently did nothing would
 * be a door a child can never open, with nothing anywhere saying why.
 */
export function makeSender(d, index, cfg) {
  if (!KINDS.includes(d.kind)) throw new Error(`sender '${d.id}' has unknown kind '${d.kind}'`);
  if (d.kind === 'timer' && !(d.time > 0)) throw new Error(`timer '${d.id}' has no positive time`);
  if (d.kind === 'plate' && !(d.w > 0)) throw new Error(`plate '${d.id}' has no positive width`);
  const W = cfg.COLOURS.WIRE;
  return {
    id: d.id,
    kind: d.kind,
    x: d.x,
    y: d.y,                         // ground anchor, like a checkpoint's
    w: d.kind === 'plate' ? d.w : cfg.CIRCUIT.POST_W,
    face: d.face || 'left',
    time: d.time || 0,
    colour: W[index % W.length],
    pressed: false,
    left: 0,                        // timer only: seconds of power left
    touched: false,                 // was anything touching it last step
    animT: 0,                       // cosmetic: how far the drawn press has eased
  };
}

/** A button's or timer's solid stone post, as a box. Plates have none. */
export function postBox(s, cfg) {
  const P = cfg.CIRCUIT;
  return { x: s.x, y: s.y - P.POST_H, w: P.POST_W, h: P.POST_H };
}

/**
 * The thin strip beside the capped side that a presser has to reach. Starts
 * REACH below the post's top, not at it: a presser resting flush on top of
 * the post (or rolling off its top corner) must not press it — there is
 * deliberately no "up" face, only the capped side — and starting the zone
 * exactly at the post top let float dust (a presser's bottom a hair below
 * the top) overlap it and press by accident.
 */
export function hitZone(s, cfg) {
  const P = cfg.CIRCUIT;
  const x = s.face === 'right' ? s.x + P.POST_W : s.x - P.REACH;
  return { x, y: s.y - P.POST_H + P.REACH, w: P.REACH, h: P.POST_H - P.REACH };
}

/** Where the cap — which is also the sender's lamp — is drawn. */
export function capCentre(s, cfg) {
  const P = cfg.CIRCUIT;
  return { x: s.face === 'right' ? s.x + P.POST_W : s.x, y: s.y - P.POST_H / 2 };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * One step of every sender.
 *
 * A plate is recomputed from scratch each step: pressed exactly while a
 * heavy, resting presser overlaps it horizontally — the same test level six's
 * switch has always used, so it behaves exactly as it did.
 *
 * A button or a timer is pressed by a HIT: the step on which something
 * starts touching its capped side. Not by touching — a ball resting against
 * a timer would otherwise hold it full for ever and a timed door would never
 * shut.
 */
export function updateSenders(senders, dt, pressers, cfg) {
  for (const s of senders) {
    if (s.kind === 'plate') {
      s.pressed = pressers.some((p) => p.heavy && p.resting && p.x < s.x + s.w && p.x + p.w > s.x);
    } else {
      const zone = hitZone(s, cfg);
      const touching = pressers.some((p) => overlaps(p, zone));
      const hit = touching && !s.touched;
      s.touched = touching;
      if (hit) {
        s.pressed = true;
        if (s.kind === 'timer') s.left = s.time;
      } else if (s.kind === 'timer' && s.pressed) {
        s.left = Math.max(0, s.left - dt);
        if (s.left === 0) s.pressed = false;
      }
    }
    s.animT = rampToward(s.animT, s.pressed ? 1 : 0, dt, 1 / cfg.SWITCH.PRESS_TIME);
  }
}

/** Put every button and timer back as the level declared it. Plates need nothing: they are recomputed every step. */
export function resetSenders(senders) {
  for (const s of senders) {
    if (s.kind === 'plate') continue;
    s.pressed = false;
    s.left = 0;
    s.touched = false;
  }
}

/** `'a'` → `{ id: 'a', invert: false }`; `'!a'` → `{ id: 'a', invert: true }`. */
export function parseNeed(n) {
  return n.startsWith('!') ? { id: n.slice(1), invert: true } : { id: n, invert: false };
}

/**
 * Is this one lamp on a receiver lit? An ordinary lamp while its sender is on;
 * an inverted one (drawn as a ring) while its sender is off. A need naming no
 * sender counts its sender as off, so level six with its switch removed has a
 * gate that simply never opens — which is what finish.mjs's check 3c relies on.
 */
export function lampLit(need, senders) {
  const { id, invert } = parseNeed(need);
  const s = senders.find((x) => x.id === id);
  const on = !!(s && s.pressed);
  return invert ? !on : on;
}

/** Every lamp lit. A receiver that needs nothing stays shut. */
export function powered(needs, senders) {
  return needs.length > 0 && needs.every((n) => lampLit(n, senders));
}

/**
 * Is a timer this receiver needs ON about to run out? Only ordinary inputs
 * count: an inverted one running out turns the receiver's lamp on, not off.
 */
export function warning(needs, senders, cfg) {
  return needs.some((n) => {
    const { id, invert } = parseNeed(n);
    if (invert) return false;
    const s = senders.find((x) => x.id === id);
    return !!(s && s.kind === 'timer' && s.pressed && s.left < cfg.CIRCUIT.WARN);
  });
}

// --- Drawing -----------------------------------------------------------------
//
// Everything below takes the canvas context as a parameter and is only ever
// called by main.js. Nothing above calls it, so importing this file into
// Node never touches a canvas.
//
// The one rule a child reads: LIGHT EVERY LAMP ON THE DOOR. A lit lamp is its
// sender's colour, exactly; an unlit one is dark grey with a faint wash of
// that colour, so which button it belongs to is still readable, but it never
// matches the lit colour — tests/browser/wiring.mjs counts exact lit pixels.

function receiversOf(level) {
  return [...level.gates, ...(level.bridges || [])];
}

/** Where lamp `i` of a gate or bridge is drawn. A gate's ride up with it. */
export function receiverLampAt(r, i, cfg) {
  const P = cfg.CIRCUIT;
  if (r.kind === 'bridge') return { x: r.x - r.dir * 16, y: r.y - 22 - i * P.LAMP_GAP };
  return { x: r.x + r.w / 2, y: r.y + r.h - 20 - i * P.LAMP_GAP };
}

function senderLampAt(s, cfg) {
  if (s.kind === 'plate') return { x: s.x + s.w / 2, y: s.y - cfg.SWITCH.H / 2 };
  return capCentre(s, cfg);
}

function lamp(ctx, x, y, r, colour, lit, ring, cfg) {
  const C = cfg.COLOURS;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (ring) {
    ctx.lineWidth = r * 0.55;
    ctx.strokeStyle = lit ? colour : C.LAMP_OFF;
    ctx.stroke();
    if (!lit) { ctx.globalAlpha = 0.4; ctx.strokeStyle = colour; ctx.stroke(); ctx.globalAlpha = 1; }
  } else {
    ctx.fillStyle = lit ? colour : C.LAMP_OFF;
    ctx.fill();
    if (!lit) { ctx.globalAlpha = 0.4; ctx.fillStyle = colour; ctx.fill(); ctx.globalAlpha = 1; }
  }
}

/**
 * Every wire, straight from a sender's lamp to the receiver lamp it lights,
 * full colour while the sender is on and faint while it is off. Call it
 * BEFORE the ground is drawn, so a wire reads as buried where it passes under
 * the ground.
 */
export function drawWires(ctx, level, cfg) {
  ctx.lineWidth = cfg.CIRCUIT.WIRE_W;
  for (const r of receiversOf(level)) {
    r.needs.forEach((need, i) => {
      const s = level.senders.find((x) => x.id === parseNeed(need).id);
      if (!s) return;
      const a = senderLampAt(s, cfg), b = receiverLampAt(r, i, cfg);
      ctx.globalAlpha = s.pressed ? 1 : 0.3;
      ctx.strokeStyle = s.colour;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

/**
 * Plates, posts and caps. A plate is level six's slab with a small lamp let
 * into it. A button is a stone post with its cap — which is its lamp — on one
 * side, sinking into the post while pressed; a timer adds a ring round the
 * cap that empties as its time runs down.
 */
export function drawSenders(ctx, level, cfg) {
  const C = cfg.COLOURS, P = cfg.CIRCUIT, S = cfg.SWITCH;
  for (const s of level.senders) {
    if (s.kind === 'plate') {
      const dip = S.PRESS_DEPTH * s.animT;
      ctx.fillStyle = C.SWITCH_PLATE_EDGE;
      ctx.fillRect(s.x, s.y - S.H, s.w, S.H);
      ctx.fillStyle = C.SWITCH_PLATE;
      ctx.fillRect(s.x, s.y - S.H + dip, s.w, S.H - dip);
      lamp(ctx, s.x + s.w / 2, s.y - S.H / 2 + dip / 2, 4, s.colour, s.pressed, false, cfg);
      continue;
    }
    const p = postBox(s, cfg);
    ctx.fillStyle = C.WALL;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = C.WALL_EDGE;
    ctx.fillRect(p.x, p.y, p.w, 6);
    const c = capCentre(s, cfg);
    const into = (s.face === 'right' ? -1 : 1) * S.PRESS_DEPTH * s.animT;
    if (s.kind === 'timer') {
      const R = P.CAP_R + P.RING_W;
      ctx.lineWidth = P.RING_W;
      ctx.strokeStyle = C.RING_TRACK;
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.stroke();
      if (s.pressed && s.time > 0) {
        ctx.strokeStyle = s.colour;
        ctx.beginPath();
        ctx.arc(c.x, c.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (s.left / s.time));
        ctx.stroke();
      }
    }
    lamp(ctx, c.x + into, c.y, P.CAP_R, s.colour, s.pressed, false, cfg);
  }
}

/**
 * Bridges, and every receiver's lamps. A gate's body is drawn by main.js with
 * the other stone; its lamps go on top of it here. A bridge's lamps sit on a
 * thin signal pole at its root, and the slab shakes while `warn` is set.
 */
export function drawReceivers(ctx, level, time, cfg) {
  const C = cfg.COLOURS, P = cfg.CIRCUIT, B = cfg.BRIDGE;
  for (const br of level.bridges || []) {
    const [lo, hi] = br.span();
    const shake = br.warn ? Math.sin(time * 50) * B.SHAKE : 0;
    if (hi - lo > 1) {
      ctx.fillStyle = C.WALL;
      ctx.fillRect(lo, br.y + shake, hi - lo, B.H);
      ctx.fillStyle = C.WALL_EDGE;
      ctx.fillRect(lo, br.y + shake, hi - lo, 5);
    }
    const top = receiverLampAt(br, br.needs.length - 1, cfg).y - P.LAMP_R - 4;
    ctx.fillStyle = C.WALL_EDGE;
    ctx.fillRect(br.x - br.dir * 16 - 2, top, 4, br.y - top);
  }
  for (const r of receiversOf(level)) {
    r.needs.forEach((need, i) => {
      const s = level.senders.find((x) => x.id === parseNeed(need).id);
      const at = receiverLampAt(r, i, cfg);
      lamp(ctx, at.x, at.y, P.LAMP_R, s ? s.colour : C.LAMP_OFF, lampLit(need, level.senders), parseNeed(need).invert, cfg);
    });
  }
}
