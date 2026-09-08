// Shared helpers for the browser suites.
//
// WHY THIS EXISTS. The tests used to navigate by hardcoded directions and
// hardcoded destinations — "drag down-left for 560ms and there will be a car",
// "the teddy is at 1376,1248". Both were true of the small hand-typed map and
// both stopped being true the moment the town was generated at four times the
// size. Worse, they did not fail cleanly: the player would end up beside some
// OTHER car or OTHER neighbour and a check would pass for the wrong reason.
//
// The pattern that survives a changing map is: ask the real generation code
// where something is (it is deterministic, so node and the browser agree),
// then steer towards it while reading the player's actual position.

/**
 * Walking, steered by where the player really is.
 *
 * @param send   the CDP send function
 * @param ev     evaluate-in-page
 * @param sleep  (ms) => Promise
 * @param push   optional (vx, vy, ms) => Promise, for tests that drive the
 *               player with the keyboard rather than the joystick
 */
export function makeWalker({ send, ev, sleep, push: customPush, from = { x: 150, y: 200 } }) {
  const push = customPush || (async (vx, vy, ms) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
    await send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + vx * 60, y: from.y + vy * 60, id: 1 }],
    });
    await sleep(ms);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(120);
  });

  /**
   * Where the player is standing.
   *
   * The game only writes its save at certain moments, so this asks for one by
   * firing the same `pagehide` the phone would send. No test-only code has to
   * ship in the game for this to work.
   */
  const pos = async () => {
    // Ask the game to save, WITHOUT telling it the page is going away.
    //
    // The obvious way to do this is to fire `pagehide`, and that is what this
    // used to do — but the game quite rightly treats `pagehide` as "we are
    // leaving" and hangs up the multiplayer connection. Reading a position
    // therefore ended the shared game, and every check that followed was
    // quietly measuring two children in separate empty towns.
    //
    // `visibilitychange` only saves, so that is the one to use. The state has
    // to be faked for the handler to believe it, and put back afterwards.
    await ev(`(() => {
      const d = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
      try {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      } finally {
        delete document.visibilityState;
        if (d) Object.defineProperty(Document.prototype, 'visibilityState', d);
      }
    })()`);
    const raw = await ev("(() => { try { return localStorage.getItem('tarasTown.save.v1'); } catch (e) { return null; } })()");
    try { return JSON.parse(raw).lastPos; } catch (_) { return null; }
  };

  /**
   * Walk until we are within `tol` of (tx, ty).
   *
   * Walking into something does not end the attempt: it slides along whatever
   * it hit and carries on, alternating sides so it can work its way round a
   * building. Giving up at the first wall was survivable when every target sat
   * in open ground a few steps away, and is not on a town full of corners.
   */
  const walkTo = async (tx, ty, tol = 60, tries = 46, onStep = null) => {
    let last = null;
    let bumps = 0;

    for (let i = 0; i < tries; i++) {
      const p = await pos();
      if (!p) return { arrived: false, pos: null };

      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d <= tol) return { arrived: true, pos: p };

      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) {
        bumps++;
        // Keep going the same way round for a few tries before switching.
        // Alternating on every bump rocks back and forth in a dead end
        // instead of walking out of it.
        const side = Math.floor(bumps / 4) % 2 ? -1 : 1;
        const a = Math.atan2(dy, dx) + side * (Math.PI / 2);
        await push(Math.cos(a), Math.sin(a), 460 + bumps * 60);
        if (onStep) await onStep();
        last = null;
        continue;
      }

      last = p;
      await push(dx / d, dy / d, Math.min(600, Math.max(140, (d / 175) * 1000)));
      if (onStep) await onStep();
    }
    return { arrived: false, pos: await pos() };
  };

  return { push, pos, walkTo };
}

/**
 * The town, built here in node.
 *
 * Same fixed seed as the browser is about to use, so anything asked of this is
 * true of the town the test is looking at.
 */
export async function town() {
  const { World } = await import('../../js/world.js');
  return new World();
}

/** Where the nearest parked vehicle to the start is. */
export async function nearestCar(world) {
  const { createCars } = await import('../../js/car.js');
  const cars = createCars(world);
  let best = null, bestD = Infinity;
  for (const c of cars) {
    const d = Math.hypot(c.x - world.spawn.x, c.y - world.spawn.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best ? { x: best.x, y: best.y, dist: bestD } : null;
}

/** The neighbour offering a particular job. */
export async function npcWithMission(world, mission) {
  const { createNpcs } = await import('../../js/npc.js');
  const npcs = createNpcs(world);
  return npcs.find((n) => n.mission === mission) || npcs[0];
}

/**
 * Work out a walkable route across the town.
 *
 * Steering straight at a target and sliding along whatever you hit gets you
 * most places, and then spends a long time rocking about in the mouth of a
 * dead end. Since the town is available here in node, the honest answer is to
 * look at the map and find a way round before setting off.
 *
 * A plain breadth-first search over a coarse grid. The town is about 28,000
 * cells at this spacing, which is nothing.
 */
export function makeRouter(world, step = 32) {
  const W = Math.floor(world.width / step);
  const H = Math.floor(world.height / step);

  // Half a player, plus a little, so routes do not scrape along walls.
  const free = (cx, cy) =>
    cx >= 0 && cy >= 0 && cx < W && cy < H &&
    !world._overlaps(cx * step + step / 2, cy * step + step / 2, 14, 14, null);

  const nearestFree = (x, y) => {
    const c0 = Math.round(x / step), r0 = Math.round(y / step);
    if (free(c0, r0)) return [c0, r0];
    for (let rad = 1; rad < 20; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          if (free(c0 + dc, r0 + dr)) return [c0 + dc, r0 + dr];
        }
      }
    }
    return null;
  };

  /**
   * @returns waypoints from `from` to `to`, or null if there is no way through
   */
  return function route(from, to, spacing = 4) {
    const start = nearestFree(from.x, from.y);
    const goal = nearestFree(to.x, to.y);
    if (!start || !goal) return null;

    const came = new Int32Array(W * H).fill(-1);
    const seen = new Uint8Array(W * H);
    const queue = [start[1] * W + start[0]];
    seen[queue[0]] = 1;
    const goalIndex = goal[1] * W + goal[0];

    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      if (at === goalIndex) break;
      const cx = at % W, cy = (at / W) | 0;

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!free(nx, ny)) continue;
        const ni = ny * W + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        came[ni] = at;
        queue.push(ni);
      }
    }
    if (!seen[goalIndex]) return null;

    const path = [];
    for (let at = goalIndex; at !== -1; at = came[at]) {
      path.push({ x: (at % W) * step + step / 2, y: (((at / W) | 0)) * step + step / 2 });
      if (at === start[1] * W + start[0]) break;
    }
    path.reverse();

    // Thin it out: following every single cell would be needlessly slow.
    const out = path.filter((_, i) => i % spacing === 0);
    out.push({ x: to.x, y: to.y });
    return out;
  };
}
