// The charger, in the browser: open level ten at both small phone sizes,
// roll up against the pen's stone step (no jump, so it stops there, outside
// the pen; the charger's charge ends in the step's far side), and take a
// picture every quarter second while the charger comes, winds up, charges,
// sits dazed and walks off again. The pictures start while the ball is still
// rolling, so the patrol towards it is in them as well as the one away.
// The assertion is only that the charger is drawn (a count of its own body
// colour, which nothing else in the game uses) and that the page threw
// nothing. The pictures are the point: look at every one of them.
// Then level eleven, opening, roofs and room B.
import { connect, makeHold, press, release, openLevel, IS_BALL } from './_helpers.mjs';

const URL = process.argv[2];
const TAG = process.argv[3] || 'chargers';
const PORT = Number(process.argv[4] || 9335);

const { CONFIG } = await import('../../js/config.js');
const { Buttons } = await import('../../js/ui.js');
const { LEVELS } = await import('../../js/levels.js');

const cdp = await connect(PORT, TAG);
const { send, ev, sleep, shoot, problems } = cdp;
const hold = makeHold(cdp);
let failures = 0;
const fail = (m) => { console.log('  FAIL: ' + m); failures++; };

// The charger has its own body colour, so counting it is an honest way to
// find it: nothing else in the game is drawn in it.
const hex = CONFIG.COLOURS.CHARGER_BODY;
const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const enemyPixels = () => ev(`(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - ${R}) < 6 && Math.abs(d[i + 1] - ${G}) < 6 && Math.abs(d[i + 2] - ${B}) < 6) n++;
  }
  return n;
})()`);

// Where the ball is, roughly and CHEAPLY: every fourth pixel in each
// direction, so a poll costs about a sixtieth of what ballAt's full scan
// costs and comes back in ten milliseconds rather than a couple of hundred.
// That speed is the whole point — level eleven's route below is driven by
// watching the ball stop and start, and a two-hundred-millisecond blindfold
// is wider than the window its one jump has to be taken in. Device pixels,
// not CSS ones, because nothing here compares it to a button.
const roughly = () => ev(`(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < c.height; y += 4) for (let x = 0; x < c.width; x += 4) {
    const i = (y * c.width + x) * 4;
    if (${IS_BALL}) { sx += x; sy += y; n++; }
  }
  // The apparent radius comes back as well, and it is the ruler everything
  // below measures with: the ball is drawn at BALL.R world units whatever the
  // window does to the zoom, so "moved a radius" is "moved twenty units" on
  // every screen, and a threshold in raw pixels is not. Every sixteenth pixel
  // is sampled, hence the 16.
  return n ? { x: sx / n, y: sy / n, r: Math.sqrt(16 * n / Math.PI) } : null;
})()`);

/**
 * Hold right and wait for the ball to come to a stand and then be let go —
 * which on this level means a shut door and the charger opening it.
 *
 * `onStanding` is called once, as soon as the ball has been standing still
 * long enough to be at a door — which is when the shut-door picture is worth
 * taking. `whileStanding` is called on every poll after that, which is how
 * the opening itself is photographed: a picture taken once the ball has been
 * seen to move is half a second late, and half a second is the ball most of
 * the way through the door and the charger off the left of the screen. A
 * picture retaken every poll and stopped by the ball moving leaves the LAST
 * frame before it moved, which is the one wanted — the charger dazed on the
 * plate and the gate on its way up.
 *
 * Returns how long the wait took, or null if it never happened, so the caller
 * can say so rather than photograph whatever was on the screen instead.
 */
async function waitAtDoor(onStanding, whileStanding, seconds = 40) {
  const until = Date.now() + seconds * 1000;
  let last = null, stillSince = 0, home = null;
  while (Date.now() < until) {
    const b = await roughly();
    if (b && last) {
      const moved = Math.hypot(b.x - last.x, b.y - last.y);
      // Still for five seconds is a door, not a slope: the climbs on this
      // level are slow enough to look still for a second at a time, which
      // is exactly what a shorter patience mistook them for.
      if (!home) {
        if (moved < 2) {
          if (!stillSince) stillSince = Date.now();
          else if (Date.now() - stillSince > 5000) { home = b; if (onStanding) await onStanding(); }
        } else stillSince = 0;
      // Gone a whole radius — twenty world units — from where it stood, not
      // "moved since the last poll": a per-poll threshold is a threshold on
      // SPEED, it fires later the faster the polls are, and it fired at a
      // different point on each of the two screen sizes. That is what put
      // the jump below half a second late at 740x280 and dropped the ball
      // in the gap while the same numbers worked at 568x320.
      } else if (Math.hypot(b.x - home.x, b.y - home.y) > home.r) {
        return Date.now() - stillSince;
      } else if (whileStanding) await whileStanding();
    }
    if (b) last = b;
  }
  return null;
}

// Level select is photographed on the way in, every time: it is where the
// eleventh tile has to fit.
const open = (W, H, id) =>
  openLevel(cdp, URL, W, H, LEVELS.findIndex((l) => l.id === id), LEVELS.length,
            () => shoot(`${W}x${H}-levels`));

const K = CONFIG.ENEMY.CHARGER;

for (const [W, H] of [[568, 320], [740, 280]]) {
  console.log(`\n${W}x${H}, level 10: the charger's poses`);
  await open(W, H, 10);
  // Spawn 200 to the pen's step at 1400; with no jump the ball stops there,
  // at about 1375, some three seconds into the hold. The charger starts at
  // 2100 walking left at PATROL_SPEED and sees the ball from SEE away, at
  // about 1615: (2100 - 1615) / 120 is about 4s into the level, or 3.1s
  // into the hold, since the level starts 0.9s before it. So the pictures
  // start at 1.8s, well before that, or the patrol towards the ball is never
  // in one.
  await press(cdp, Buttons.right(W, H));
  const began = Date.now();
  let held = true;
  await sleep(1800);
  // The charge itself is short: from where it sees the ball to the step is
  // about 130 at CHARGE_SPEED, under 0.3s, so a picture every quarter second
  // can step right over it. The wind-up's crouch is the cue: drawCharger
  // squashes the body to 0.82 of its height while winding up, which takes
  // the colour count to about 0.8 of a standing charger's, so a count below
  // 0.9 of the most seen so far is the crouch. From there the pictures are
  // taken back to back, by the clock rather than by counting frames: for
  // the whole of WINDUP (the crouch may be caught at its very start), the
  // longest charge the level allows (SEE / CHARGE_SPEED, 0.5s), and 0.2s
  // over. That is about a dozen pictures at the ~125ms one takes here.
  //
  // 32 pictures in all: a few of the patrol towards the ball, the burst,
  // and then about 17 a quarter second apart (some 6s) — the whole of the
  // 3.5s daze and its stars going, and the patrol away until it walks off.
  // Nothing here is measured off DAZED, so a longer daze eats into the tail
  // rather than the daze itself: at 3.5 there are still some 2.5s of patrol
  // after it, which is why the count stayed at 32 when DAZED was raised.
  const burstFor = (K.WINDUP + K.SEE / K.CHARGE_SPEED + 0.2) * 1000;
  let seen = 0, burstUntil = 0;
  const counts = [];
  for (let i = 0; i < 32; i++) {
    if (held && Date.now() - began >= 3600) {
      await release(cdp);
      held = false;
    }
    const n = await enemyPixels();
    counts.push(n);
    if (!burstUntil && n > 0 && n < 0.9 * seen) burstUntil = Date.now() + burstFor;
    seen = Math.max(seen, n);
    await shoot(`${W}x${H}-10-${String(i).padStart(2, '0')}`);
    if (Date.now() >= burstUntil) await sleep(250);
  }
  if (!burstUntil) fail(`the wind-up's crouch was never seen at ${W}x${H}, so the charge may not be in any picture`);
  if (held) await release(cdp);
  console.log(`   charger-colour pixels, frame by frame: ${counts.join(' ')}`);
  console.log(`   most charger-colour pixels in one frame: ${seen}`);
  // A standing charger, whole on screen, measured about 1500 at 568x320 and
  // 1100 at 740x280 (and a crouch about 1200 and 920). 500 is under half the
  // smaller, so a charger partly off the edge still passes, while a few
  // stray pixels of that blue somewhere never could.
  if (seen < 500) fail(`the charger was never drawn at ${W}x${H} (at most ${seen} pixels of its colour)`);

  console.log(`\n${W}x${H}, level 11: opening`);
  await open(W, H, 11);
  await hold(Buttons.right(W, H), 3000);
  await shoot(`${W}x${H}-11-roof`);
  // And on up the slope onto the roof itself, with the charger in its pen
  // below: the roof has to read as somewhere to roll, not as a wall's top.
  await hold(Buttons.right(W, H), 1500);
  await shoot(`${W}x${H}-11-roof-top`);
  // And on to room B's yard — the room four of the design's open questions
  // were about. Its charger sees 320, not the usual 240, so a ball standing
  // anywhere in this yard (the door is 286 from where the charge ends) is
  // noticed where it stands. The picture is the point: the ball at the shut
  // door with the plate and the charger in the same frame, and then the same
  // door open with the charger dazed on the plate.
  //
  // Holding right alone never gets here, which is worth writing down because
  // it was tried: the ball waits out room A's door, rolls on and drops
  // straight into the 200 gap at 3700, which is the one place on this level
  // a jump is not optional. Hammering the jump does not fix it either — a
  // hop covers about 290 at full speed, so hops land 290 apart and the last
  // landing before the lip is very unlikely to be inside the 90 units from
  // which a jump still clears the gap.
  //
  // So the gap is taken from the one moment on this level that can be seen
  // from out here: room A's door opening. The ball leans on the gate at about
  // 3180 and starts rolling the instant it lifts, with the lip at 3700 some
  // 520 away. waitAtDoor returns once it has gone a radius, 20 of that, by
  // which point it is doing about 250; the remaining 500 takes 1.16s, and a
  // jump clears the gap from anywhere in the last 90 of it — the last 0.21s.
  // 1.05s is the middle of that window. Everything after the jump is holding
  // right again: up room B's roof, off its far end into the yard, and up
  // against the door.
  await press(cdp, Buttons.right(W, H));
  const openedA = await waitAtDoor();
  if (openedA === null) fail(`room A's door never opened at ${W}x${H}, so nothing past it is in a picture`);
  else console.log(`   room A's door: ${(openedA / 1000).toFixed(1)}s of waiting on the charger`);
  await sleep(1050);
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Buttons.right(W, H).x, y: Buttons.right(W, H).y, id: 1 },
                  { x: Buttons.jump(W, H).x, y: Buttons.jump(W, H).y, id: 2 }],
  });
  await sleep(80);
  await send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: Buttons.right(W, H).x, y: Buttons.right(W, H).y, id: 1 }],
  });

  // The same wait again, at room B's door this time. The shut-door picture is
  // taken while the ball stands there; the open-door one the moment it is let
  // through, which is the moment the charger is dazed on the plate.
  const openedB = await waitAtDoor(() => shoot(`${W}x${H}-11-roomB`),
                                   () => shoot(`${W}x${H}-11-roomB-door`));
  await release(cdp);
  if (openedB === null) fail(`room B's door never opened at ${W}x${H}: the ball never reached the yard, or the charger never reached the plate`);
  else console.log(`   room B's door: ${(openedB / 1000).toFixed(1)}s of waiting on the charger`);
}

for (const p of problems) fail(p);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nCHARGERS DRAWN');
process.exit(failures ? 1 : 0);
