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

/** The thin strip beside the capped side that a presser has to reach. */
export function hitZone(s, cfg) {
  const P = cfg.CIRCUIT;
  const x = s.face === 'right' ? s.x + P.POST_W : s.x - P.REACH;
  return { x, y: s.y - P.POST_H, w: P.REACH, h: P.POST_H };
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
