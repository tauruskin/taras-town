# Charger open questions: the decisions, and what they change

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settle the seven open questions left by sub-project 2 (the charger,
levels 10 and 11) and make the five that need code real, with every number
re-swept and written back into the level comments.

**Architecture:** Four changes are one number or one field each — a per-enemy
`see`, a longer daze, a second checkpoint, the charger's own colour. The fifth
is a hard top-edge guard in `camera.js`, which is DOM-free and so is proved in
node. Nothing here adds a mechanic.

**Tech stack:** vanilla ES modules, no build step. Node for the offline suites,
headless Chrome for the browser ones. `node games/pushkar-ball/tests/run.mjs
<name-substring>` runs one suite.

**All paths below are relative to `games/pushkar-ball/`** unless they start
with `docs/` or are `CLAUDE.md`.

---

## The decisions

| # | Question | Decision |
|---|---|---|
| 1 | Level 10: a blind hop into the pen costs a heart ~6% of the time | **Accept.** No geometry can fix it — see Task 3. |
| 2 | Level 10's checkpoint is after the pen, not before | **Both.** Add one at 1150; keep 3300. |
| 3 | Level 11 room B uses 56% of the daze against a 60% limit | **`DAZED` 3.0 → 3.5.** Do not move the door. |
| 4 | Room B's sight line is invisible to the child | **Per-enemy `see`;** room B's charger gets 320. |
| 5 | The charger is ~30 CSS px wide at 740×280 | **Accept.** The whole world is drawn smaller there. |
| 6 | Level 11's roof puts the ball ~13 CSS px from the top at 740×280 | **Fix in `camera.js`,** not in the level. |
| 7 | The charger shares `COLOURS.ENEMY` | **Give it its own,** before level 12 puts three kinds together. |

And the spec's "stone lip" departure: **accept the build**, amend the spec's
wording (Task 7).

## File structure

| File | What changes |
|---|---|
| `js/config.js` | `CHARGER.DAZED` 3.0 → 3.5; `CAMERA.TOP_CLEAR`; `COLOURS.CHARGER_BODY`/`CHARGER_EDGE` |
| `js/enemies.js` | `sees()` and `popped` read a per-charger `see`; `makeCharger` takes `e.see`; `drawCharger` uses the new colours |
| `js/camera.js` | a hard top-edge clamp in `update` |
| `js/levels.js` | level 10 gains a checkpoint and a rewritten comment; level 11's room B charger gains `see: 320` and a rewritten comment |
| `tests/offline/chargers.mjs` | a per-instance `see` case |
| `tests/offline/levels.mjs` | the checkpoint-out-of-sight check reads each charger's own `see` |
| `tests/offline/camera.mjs` | the top clear: never engaged by a jump, always honoured above it |
| `tests/offline/finish.mjs` | `lure11` and 3n follow the per-instance `see`; 3n's first assertion inverts |
| `tests/browser/chargers.mjs` | finds the charger by its own colour; photographs room B |
| `tests/README.md` | the `chargers`, `levels` and browser `chargers` rows |
| `docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md` | the open questions become decisions |

---

## Task 1: a charger sees as far as its level says

A charger's sight is global today, so room B's yard cannot be made wholly
visible without widening every charger's sight everywhere. The roadmap already
says "every mechanism is an instance with its own config"; this brings the
charger's sight under that rule. `CONFIG.ENEMY.CHARGER.SEE` stays as the
default, and nothing that does not ask for one changes.

**Files:**
- Modify: `js/enemies.js` (`sees`, `CHARGER.popped`, `makeCharger`)
- Test: `tests/offline/chargers.mjs`, `tests/offline/levels.mjs`

- [ ] **Step 1: Write the failing test**

In `tests/offline/chargers.mjs`, after section 2's existing cases, add:

```js
// --- 2b. a charger's sight can be widened by its own level data -----------
{
  console.log('\n2b. a level can give one charger longer sight');
  const far = K.SEE + 100;
  for (const [what, e, expect] of [
    ['the default', { kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: 1 }, false],
    ['its own see', { kind: 'charger', x: 1000, y: CY, from: 600, to: 1800, dir: 1, see: far + 40 }, true],
  ]) {
    const level = room();
    const c = makeCharger(e, CONFIG);
    level.noteBall(fakeBall(1000 + far));
    let woke = false;
    for (let i = 0; i < 20; i++) {
      c.update(CONFIG.STEP, i * CONFIG.STEP, level, CONFIG);
      if (c.state !== 'patrol') woke = true;
    }
    if (woke !== expect) fail(`${what}: a ball ${far} ahead ${woke ? 'woke' : 'did not wake'} it, expected the opposite`);
    else console.log(`   ${what}: a ball ${far} ahead ${woke ? 'wakes' : 'does not wake'} it`);
  }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node games/pushkar-ball/tests/run.mjs chargers`
Expected: FAIL — `its own see: a ball 340 ahead did not wake it, expected the
opposite`. The default case passes already.

- [ ] **Step 3: Make it pass**

In `js/enemies.js`, `sees` reads the charger's own sight rather than the
config's:

```js
/** Is the ball on this charger's level, in front of it, and within its sight? */
function sees(c, level, K) {
  const b = level && level.ball;
  if (!b || b.dying) return false;
  const dx = b.x - c.x;
  return Math.sign(dx) === c.dir && Math.abs(dx) < c.see && Math.abs(b.y - c.y) < K.LEVEL_TOL;
}
```

In `CHARGER.popped.update`, the wait for the ball to leave home reads the same
field, so a charger with longer sight also keeps further away when it returns:

```js
      if (b && Math.abs(b.x - c.home.x) < c.see && Math.abs(b.y - c.home.y) < c.see) return;
```

And in `makeCharger`, beside `from`/`to`:

```js
    from: e.from,
    to: e.to,
    // How far ahead it notices the ball. CONFIG's SEE unless the level says
    // otherwise: level eleven's room B gives its charger enough to see the
    // whole of its yard, including the door, so a ball that misses the door
    // is noticed where it stands instead of having to find a sight line
    // nothing on screen shows.
    see: e.see ?? K.SEE,
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node games/pushkar-ball/tests/run.mjs chargers`
Expected: PASS, with 2b printing both lines.

- [ ] **Step 5: The checkpoint check follows the charger, not the config**

`tests/offline/levels.mjs` proves no checkpoint sits within sight of a charger
and reads `CONFIG.ENEMY.CHARGER.SEE`, which would now be wrong for any charger
that has its own. Replace the `const` at the top of that block and add the
per-enemy line:

```js
{
  const R = CONFIG.ENEMY.CHARGER.R;
  let n = 0;
  for (const data of LEVELS) {
    const level = loadLevel(data);
    for (const [i, e] of (data.enemies || []).entries()) {
      if (e.kind !== 'charger') continue;
      n++;
      // Its own sight if the level gave it one — see makeCharger.
      const SEE = e.see ?? CONFIG.ENEMY.CHARGER.SEE;
      const feet = e.y + R;
```

and in the checkpoint loop's message:

```js
        if (c.x > e.from - SEE && c.x < e.to + SEE && Math.abs(c.y - feet) < 200) {
          fail(`level ${data.id}: checkpoint at x=${c.x} is within sight of charger ${i} (${e.from}..${e.to}, sees ${SEE})`);
        }
```

- [ ] **Step 6: Run the two suites this touched**

Run: `node games/pushkar-ball/tests/run.mjs chargers` then
`node games/pushkar-ball/tests/run.mjs levels`
Expected: both PASS. No level asks for a `see` yet, so `levels` reports exactly
what it did before.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/enemies.js games/pushkar-ball/tests/offline/chargers.mjs games/pushkar-ball/tests/offline/levels.mjs
git commit -m "A charger's sight is its level's to set"
```

---

## Task 2: room B's charger sees its whole yard

Room B's lesson is "a dazed charger holds the plate down". Today a ball that
misses the door and rests against it sits 286 from the charge's end, past a
sight of 240, so nothing happens and nothing on screen says why. The child has
to step back towards the thing that hurts him to be noticed — a rule he cannot
see. Widening that one charger's sight to 320 puts the whole yard (at most 286
away) inside it, so the room lures itself: miss the door, wait where you are,
and it comes round and charges again.

**Files:**
- Modify: `js/levels.js` (level 11's room B charger and its comment)
- Modify: `tests/offline/finish.mjs` (`lure11`, 3n)

- [ ] **Step 1: Give the charger its sight**

In `js/levels.js`, level 11's `enemies`, the second charger only:

```js
    enemies: [
      { kind: 'charger', x: 2600, y: 760 - CONFIG.ENEMY.CHARGER.R, from: 1866, to: 3034, dir: 1 },
      // Sees 320 rather than the usual 240, which is the whole of its yard:
      // the door is 286 from where its charge ends, so a ball that misses the
      // door and rests against it is still noticed. Room A needs no such
      // thing — its yard is 70 wide and every spot in it is already in sight.
      { kind: 'charger', x: 5200, y: 760 - CONFIG.ENEMY.CHARGER.R, from: 4766, to: 5734, dir: 1, see: 320 },
    ],
```

- [ ] **Step 2: Run `finish` and watch 3n fail**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: FAIL in 3n — `a ball resting at room B's door (x=6020) is in the
charger's sight of 5734`. That assertion encoded the behaviour being removed,
which is exactly why it fails.

- [ ] **Step 3: Turn 3n round**

3n's job stays "missing the door is not a dead end", but the reason it is not
one has changed: the ball no longer has to go anywhere. Replace 3n's block
comment and body with:

```js
// --- 3n. level eleven, room B: a door missed is not a dead end -------------
//
// A ball that dawdles while the charger is dazed misses the door. It goes and
// rests against the shut door and STAYS there, steering nothing: the charger
// has to come round, notice it where it stands, and charge again. That is
// what room B's charger's longer sight (320, against a door 286 from where
// its charge ends) buys — before it, resting at the door was out of sight,
// and the child had to find a sight line nothing on screen showed.
console.log('\n3n. level eleven: missing room B\'s door is not a dead end');
{
  const data = LEVELS.find((l) => l.id === 11);
  const B0 = room11(loadLevel(data), 1);
  if (B0.x1 > B0.c.to + B0.c.see) fail(`level eleven: a ball resting at room B's door (x=${B0.x1}) is out of the charger's sight of ${B0.c.to} (sees ${B0.c.see})`);
  let dazes = 0, atDoor = 0, idleT = 0;
  const route = (level) => {
    const B = room11(level, 1), lure = lure11(B);
    const p = sender(level, 'p');
    let stage = 'lure', was = false;
    return (ball) => {
      if (p.pressed && !was) dazes++;
      was = p.pressed;
      if (stage === 'lure') { if (dazes === 1) stage = 'miss'; return lure(ball); }
      if (stage === 'miss') { if (!p.pressed && B.gate.openT === 0) stage = 'door'; return {}; }
      if (stage === 'door') {
        atDoor = Math.max(atDoor, ball.x);
        if (ball.x < B.gate.x - 30) return { right: true };
        stage = 'wait';
      }
      // The whole point: sit still at the shut door and be found there.
      if (stage === 'wait') { idleT += CONFIG.STEP; if (dazes < 2) return {}; stage = 'go'; }
      return { right: true };
    };
  };
  const from = { x: B0.x0 + 2 * CONFIG.BALL.R, y: B0.c.y + B0.c.r - CONFIG.BALL.R - 20 };
  const { ball } = play(data, route, { from, seconds: 40 });
  const through = ball.x > B0.gate.x + B0.gate.w;
  console.log(`   rested at the shut door (x=${atDoor.toFixed(0)}), waited ${idleT.toFixed(1)}s without steering, ${dazes} dazes, got through: ${through} (ball at x=${ball.x.toFixed(0)})`);
  if (atDoor < B0.gate.x - 30) fail('level eleven: 3n never went to rest at the shut door — it proves nothing');
  if (idleT < 1) fail(`level eleven: 3n waited only ${idleT.toFixed(2)}s at the door — it proves nothing`);
  if (dazes < 2) fail(`level eleven: 3n saw only ${dazes} daze(s) — the charger never came back for a ball standing still`);
  if (!through) fail('level eleven: after missing room B\'s door once, the ball could not get through');
}
```

- [ ] **Step 4: Let `lure11` read the charger's own sight**

`lure11` checks its band is inside the charger's sight and reads `K.SEE`. It
must read the instance's, or it checks the wrong number the moment a level sets
one:

```js
function lure11(room) {
  const R = CONFIG.BALL.R;
  const near = room.x0 + 2 * R, far = room.x0 + 4 * R;
  if (far > room.c.to + room.c.see - R) throw new Error(`level 11: the lure band ends at ${far}, not inside the charger's sight of ${room.c.to} (sees ${room.c.see})`);
  if (far > room.x1) throw new Error(`level 11: the lure band ends at ${far}, past the door (${room.x1})`);
  return (ball) => (ball.x > far ? { left: true } : ball.x < near ? { right: true } : {});
}
```

`room11` returns the loaded charger as `c`, which is why `c.see` exists here.
If `K` is now unused in `lure11`, remove the local binding; leave `room11`'s
own alone.

- [ ] **Step 5: Run `finish` and `levels`**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: PASS. Note the figure 2c prints — it should still be about 56%, since
this task changes nothing about how far the ball runs. Write it down; Task 4
moves it.

Run: `node games/pushkar-ball/tests/run.mjs levels`
Expected: PASS. Room B's charger now claims 320 of sight, and the nearest
checkpoint is at 4000 against a range starting at 4766, so 4766 − 320 = 4446
still clears it.

- [ ] **Step 6: Commit**

```bash
git add games/pushkar-ball/js/levels.js games/pushkar-ball/tests/offline/finish.mjs
git commit -m "Room B's charger sees its whole yard, so a missed door lures itself"
```

---

## Task 3: level 10's second checkpoint, and the decision not to fix its way in

Two things, both only in the level's data and its comment.

**The checkpoint.** The spec said before the pen; the build put it after. The
level wants both: 3300 keeps a child who dies later from redoing the charger,
and a new one at 1150 keeps a child who spends all three hearts in the pen from
re-walking the whole level. `levels.mjs` forbids a checkpoint within a
charger's sight: the range starts at 1486 and it sees 240, so anything at or
under 1246 is legal, and 1150 leaves ~96 of room rather than 46.

**The way in.** The 6% is accepted and the reasoning goes in the comment, so
nobody spends another session on a kerb. The short version: the ball and the
charger share a floor and a jump clears 131 units, so any safe strip can be
hopped out of; widening it lowers the probability and never reaches zero.

**Files:**
- Modify: `js/levels.js` (level 10's `checkpoints` and its header comment)

- [ ] **Step 1: Add the checkpoint**

```js
    // Two. 1150 is before the pen, out of the charger's sight (its range
    // starts at 1486 and it sees 240, so 1246 is the limit); 3300 is after
    // it, past the planks. The first keeps three hearts spent in the pen
    // from costing the walk up to it; the second keeps a death later in the
    // level from making him do the charger again.
    checkpoints: [
      { x: 1150, y: 760 },
      { x: 3300, y: 760 },
    ],
```

- [ ] **Step 2: Record the decision about the way in**

In level 10's header comment, replace the paragraph beginning "Every position
here is the paper layout" as far as "…is 540 of its patrol." with:

```js
    // Every position here is the paper layout, and finish.mjs let it stand.
    // What it found was about the way IN: hopping the step while the charger
    // is just the other side lands the ball on it, and a ball in the air
    // cannot wait. A child who hops in blind loses a heart about 6% of the
    // time (a spec reviewer's sweep with no guard: 16 of 255 runs). That is
    // ACCEPTED, decided 2026-09-20, and the reason is structural rather than
    // a shrug: the ball and the charger share a floor and a jump clears 131,
    // so every safe strip can be hopped out of. A kerb inside the step only
    // moves the landing; a wider dead zone only lowers the odds, since a
    // running jump carries about 290. Moving the charger's home cannot do it
    // either — the pen is 840 wide and a 4.5s spread of arrivals is 540 of
    // its patrol. What defends the child is the 0.8s crouch-and-paw, which
    // is the charger's whole contract, and the step he can watch it from.
    // The cost is one of three hearts, instantly undone.
    //
    // finish.mjs's route therefore waits outside the step while the charger
    // is patrolling towards it within 600 (PEN_GUARD) — a device of the
    // ROUTE, not a claim about the level. That number came from a scratch
    // sweep, not from anything finish.mjs runs: five leads, start delays
    // 0-25s every 0.25s (a whole patrol of the pen, 505 runs a value), guard
    // 0 to 900 — 400 still lost hearts, 500 and up none. What finish.mjs
    // runs is its usual three leads at start delays 0-4.5s, and for this
    // level it fails on any heart lost there, not only on a life.
```

- [ ] **Step 3: Run `levels` and `finish`**

Run: `node games/pushkar-ball/tests/run.mjs levels`
Expected: PASS — the new checkpoint is proved to be on its own floor, in free
space and out of the charger's sight.

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: PASS. Section 2 plays level 10 from **both** checkpoints now, and the
route's opening stage is chosen from where the ball starts (`ball.x > wood.x +
wood.w ? 'out' : 'in'`), so a start at 1150 takes the `in` branch and waits at
the step exactly as a start at the spawn does. If any run from 1150 fails, that
is a real finding: report it rather than widening PEN_GUARD.

- [ ] **Step 4: Run `checkpoints` and `progress`**

Run: `node games/pushkar-ball/tests/run.mjs checkpoints` then
`node games/pushkar-ball/tests/run.mjs progress`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/js/levels.js
git commit -m "Level ten gets a checkpoint before its pen, and says why the 6% stands"
```

---

## Task 4: a longer daze

2c's margin is thin against its own limit — 56% used of a 60% ceiling, about
0.12s. The honest reading is that the level has 1.31s of real slack and the
LIMIT is what is tight, but `DAZED` is in `config.js` precisely because it is
"a guess awaiting a thumb", and 3.5 is the right direction for the two levels
that introduce the charger: a longer run at the door in level 11, a longer
stomp window in level 10. Nothing reads the number directly — the suites and
the browser burst all take it from config — which is what makes this a one-line
change with a sweep after it.

Moving room B's door left was the level comment's named first fix and is NOT
taken. CORRECTED 2026-09-20 during the build: the "46 units" this plan
originally gave was the answer to the OLD question, how far the door could move
left while keeping the resting spot OUT of sight under a 240 sight. Task 2
inverted that requirement. Pulling the door left is still possible and would
still lower 2c, but it shortens the dash, which is the only timed thing in the
room, until 2c measures nothing. The real bound runs the other way: a resting
ball sits at 6020 and sight reaches 6054, so the door has 34 units of room to
the RIGHT before the lure stops working.

**Files:**
- Modify: `js/config.js` (`ENEMY.CHARGER.DAZED`)
- Modify: `js/levels.js` (levels 10 and 11 comments, after the sweep)

- [ ] **Step 1: Change the number**

```js
      DAZED: 3.5,         // s it sits stunned after a charge: stompable, harmless.
                          // Was 3.0, raised 2026-09-20: level eleven's room B
                          // spent 56% of it on the dash to the door against
                          // finish.mjs's 60% limit. The knob rather than that
                          // level's geometry, because the geometry fix — pull
                          // room B's door left — shortens the only timed thing
                          // in the room until 2c is measuring nothing. Level
                          // ten only gets an easier stomp.
```

- [ ] **Step 2: Run the three suites that read it**

Run: `node games/pushkar-ball/tests/run.mjs chargers`
Expected: PASS. Every assertion about the daze's length reads `K.DAZED`.

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: PASS, and 2c's printed figure drops from ~56% to about 48%. Record
the exact number — it goes into level 11's comment.

Run: `node games/pushkar-ball/tests/run.mjs levels`
Expected: PASS.

- [ ] **Step 3: Write the swept numbers back into the comments**

CLAUDE.md's rule for this repo: every sweep result goes into the level's
comment. In level 11's header comment, replace the sentence beginning "and the
slowest got through room B's door in 56% of the daze" with the figure sections
1 and 2 actually printed, and replace the last two sentences ("The one thin
number is 2c's margin… is the first thing to try if it ever goes over.") with:

```js
    // 2c's margin was the one thin number: 56% of a 3s daze against a 60%
    // limit. It was mended on 2026-09-20 by raising DAZED to 3.5, not by
    // moving the door. Pulling the door left was the old note's first
    // suggestion, from when a ball resting at it had to stay OUT of the
    // charger's sight; since that charger was given 320, room B depends on
    // exactly the opposite, and shortening the dash now shortens the only
    // timed thing in the room. What is bounded is the other direction: a
    // resting ball sits at 6020 and sight reaches 6054, so the door has 34
    // units of room to the RIGHT before the lure stops working.
```

In level 10's comment, the sentence about the stomp sweep ("the same scratch
sweep of the stomp (five leads, delays 0-13s, 265 runs) always landed before
the daze ran out") is still true and gets more so; add ", and more so since
DAZED became 3.5" to it.

- [ ] **Step 4: Re-run `finish` to confirm nothing drifted**

Run: `node games/pushkar-ball/tests/run.mjs finish`
Expected: PASS, identical figures to Step 2 (comments only were touched).

- [ ] **Step 5: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/levels.js
git commit -m "A longer daze, and the swept numbers it changes"
```

---

## Task 5: the camera never puts the ball against the top edge

At 740×280 on level 11's roof the ball's centre sits about 24 CSS px from the
top of the screen just after the climb, while `LERP_Y` (2.5, slow on purpose)
eases up behind it. Nothing is clipped, but the ball is level with the hearts
and there is no ground under it on screen.

The fix belongs in `camera.js`, not in the level: it is DOM-free, so node can
prove it, and every future climb gets it. A hard clamp, applied after the
vertical ease and before the bounds clamp, caps how close to the view's top the
ball may be drawn. It is physics-neutral — nothing in the simulation reads the
camera — so no level timing can move.

**The number.** `VIEW_H` is a constant 540 world units, so the working is the
same shape on every screen. A settled ball's centre sits `-BALL.R + (feet −
cssH/2)/scale` from the view's middle, which puts it 231 world units below the
view's top at 740×280 and 267 at 568×320. A jump is 131, so the tightest
flat-ground apex is **99.7 world units** from the top, at 740×280. `TOP_CLEAR`
must sit below that or an ordinary jump would drag the camera and undo the "a
camera that tracks every jump is nauseating" half of this module. **75** leaves
~25 world units of slack there and lifts the roof case from 24 to 39 CSS px.

**Files:**
- Modify: `js/config.js` (`CAMERA.TOP_CLEAR`)
- Modify: `js/camera.js` (`update`)
- Test: `tests/offline/camera.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/offline/camera.mjs`, after the reveal section:

```js
// --- the top edge ----------------------------------------------------------
//
// The vertical follow is slow on purpose, so a ball that climbs faster than
// the camera can ease — level eleven's 200-unit slope onto room B's roof —
// ends up against the top of the screen with no ground under it. TOP_CLEAR is
// the hard floor under that. It must never engage on an ordinary jump, or the
// camera would be tracking jumps, which is the one thing LERP_Y exists to
// avoid.
console.log('\nthe top edge');
for (const [w, h] of SCREENS) {
  const scale = h / CONFIG.VIEW_H;
  const viewH = CONFIG.VIEW_H, viewW = w / scale;
  const level = flat();
  const ball = new Ball(level.spawn.x, level.spawn.y);
  const camera = new Camera(level);
  camera.biasY = Camera.biasFor(h, scale, CONFIG.BALL.R, w);
  camera.snap(ball);
  const input = { left: false, right: false, takeJump: () => false };
  const settle = () => {
    for (let i = 0; i < Math.round(2 / CONFIG.STEP); i++) {
      level.update(CONFIG.STEP);
      ball.update(CONFIG.STEP, input, level);
      camera.update(CONFIG.STEP, ball, viewW, viewH);
    }
  };
  settle();
  const fromTop = () => viewH / 2 + (ball.y - camera.y);

  // A jump from rest, driven by the ball's own jump speed rather than a
  // number typed here, and watched at its highest point.
  let press = true;
  const jumpIn = { left: false, right: false, takeJump() { const j = press; press = false; return j; } };
  let highest = fromTop();
  for (let i = 0; i < Math.round(1.5 / CONFIG.STEP); i++) {
    level.update(CONFIG.STEP);
    ball.update(CONFIG.STEP, jumpIn, level);
    camera.update(CONFIG.STEP, ball, viewW, viewH);
    highest = Math.min(highest, fromTop());
  }
  if (highest <= CONFIG.CAMERA.TOP_CLEAR) {
    fail(`${w}x${h}: an ordinary jump reached ${highest.toFixed(0)} from the view's top, inside TOP_CLEAR (${CONFIG.CAMERA.TOP_CLEAR}) — the camera would follow jumps`);
  }

  // Now lift the ball far above the camera, the way a fast climb does, and
  // step once: it must be pulled back to the clear, not left against the edge.
  settle();
  ball.y -= 300;
  camera.update(CONFIG.STEP, ball, viewW, viewH);
  const after = fromTop();
  if (after < CONFIG.CAMERA.TOP_CLEAR - 0.5) {
    fail(`${w}x${h}: a ball 300 above the camera was drawn ${after.toFixed(0)} from the view's top, inside TOP_CLEAR (${CONFIG.CAMERA.TOP_CLEAR})`);
  } else {
    console.log(`   ${w}x${h}: jump apex ${highest.toFixed(0)} from the top, a 300 climb held at ${after.toFixed(0)} (clear ${CONFIG.CAMERA.TOP_CLEAR})`);
  }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node games/pushkar-ball/tests/run.mjs camera`
Expected: FAIL. `CONFIG.CAMERA.TOP_CLEAR` is `undefined`, so the comparisons go
false and the second check reports a ball drawn well inside the edge.

- [ ] **Step 3: Add the number**

In `js/config.js`, inside `CAMERA`, after `GROUND_CLEAR`:

```js
    // The hard floor under the slow vertical follow: the ball's CENTRE is
    // never drawn closer than this to the top of the view, in world units.
    // LERP_Y is 2.5 on purpose, so a 200-unit climb — level eleven's slope
    // onto room B's roof — outruns the camera and left the ball about 13 CSS
    // px from the top edge at 740x280, level with the hearts and with no
    // ground under it.
    //
    // It must stay BELOW the tightest flat-ground jump apex, or the camera
    // would follow jumps, which is exactly what LERP_Y exists to prevent.
    // VIEW_H is a constant 540, so the working is the same shape everywhere:
    // a settled ball's centre sits `-BALL.R + (feet - cssH/2)/scale` from the
    // view's middle, which is 231 world units below the view's top at
    // 740x280 and 267 at 568x320; a jump is 131, so the tightest apex is
    // ~100. 75 leaves about 25 of slack there, and lifts the roof case from
    // 24 CSS px to 39. tests/offline/camera.mjs holds both ends of that.
    TOP_CLEAR: 75,
```

- [ ] **Step 4: Apply it in the camera**

In `js/camera.js`, in `update`, between the vertical deadzone block and the
bounds clamp:

```js
    // A hard floor under the slow follow above. `this.y` is the middle of the
    // view, so the ball's centre is `viewH / 2 + (ball.y - this.y)` from the
    // view's top; holding that at or above TOP_CLEAR means capping this.y.
    // Only ever moves the camera UP, and only when the ball has climbed
    // faster than LERP_Y can ease — an ordinary jump stays well clear of it,
    // which camera.mjs proves at every screen size.
    this.y = Math.min(this.y, ball.y + viewH / 2 - CONFIG.CAMERA.TOP_CLEAR);
```

- [ ] **Step 5: Run it and watch it pass**

Run: `node games/pushkar-ball/tests/run.mjs camera`
Expected: PASS, with a line per screen. The jump apex at 740×280 should print
around 100, comfortably outside 75.

- [ ] **Step 6: Run the rest of the offline suites**

Run: `node games/pushkar-ball/tests/run.mjs offline`
Expected: PASS everything except the known `finish` level-7 route failure.
Nothing reads the camera in the simulation, so anything else that moves here is
a real finding.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/camera.js games/pushkar-ball/tests/offline/camera.mjs
git commit -m "The camera never puts the ball against the top of the screen"
```

---

## Task 6: the charger's own colour, and a picture of room B

**The colour.** Every enemy shares `COLOURS.ENEMY`. Nothing needs otherwise
today — levels 10 and 11 have no other kind — but level 12 is the Mastery level
and puts charger, shell and popper together, and the charger is the one whose
stomp rule is conditional: safe while dazed, a heart at any other moment. It
should not be the same violet as a walker you may always stomp. A blue body
also makes the browser suite's "count the charger's pixels" honest instead of
leaning on "level 10 has no other enemy".

The constraint every colour in that file is held to: `IS_BALL` in
`tests/browser/_helpers.mjs` calls a pixel the ball when red − blue > 60 and
green is barely above blue. A blue has red − blue deeply negative, so it fails
the first clause outright.

**The picture.** The browser suite photographs level 11's opening and its two
roofs, and never room B — the room four of these seven questions were about.

**Files:**
- Modify: `js/config.js` (`COLOURS`)
- Modify: `js/enemies.js` (`drawCharger`)
- Modify: `tests/browser/chargers.mjs`, `tests/README.md`

- [ ] **Step 1: Add the colours**

In `js/config.js`, `COLOURS`, beside the shared enemy ones:

```js
    // The charger's own body, so it never reads as a walker. It is the one
    // enemy whose stomp rule is conditional — safe only while dazed — and
    // level twelve puts it beside a shell and a popper. Blue: red minus blue
    // is deeply negative, so it can never be picked up as the ball by
    // IS_BALL in tests/browser/_helpers.mjs, the same reasoning ENEMY, FLAG
    // and the results panel already follow. Darker than the sky, and it is
    // only ever seen against grass.
    CHARGER_BODY: '#2E6BC6',
    CHARGER_EDGE: '#1B4380',
```

- [ ] **Step 2: Use them**

In `js/enemies.js`, `drawCharger`, the body and edge only — the eye stays
`ENEMY_EYE`, since `drawAngryFace` is shared and the face is the same face.
Three `fillStyle`/`strokeStyle` lines change:

```js
  // Stubby legs, the front one pawing during the wind-up.
  ctx.fillStyle = C.CHARGER_EDGE;
```

```js
  ctx.fillStyle = C.CHARGER_BODY;
  ctx.fill();
  ctx.strokeStyle = C.CHARGER_EDGE;
```

```js
  // Two horns out of the front of the head, pointing forward.
  ctx.fillStyle = C.CHARGER_EDGE;
```

The brow's `fillRect` follows the horns' fill style and needs no change.

- [ ] **Step 3: Point the browser suite at the new colour**

In `tests/browser/chargers.mjs`:

```js
// The charger has its own body colour, so counting it is an honest way to
// find it: nothing else in the game is drawn in it.
const hex = CONFIG.COLOURS.CHARGER_BODY;
```

The file's header comment says "a count of its exact body colour, which only
enemies and their pop pieces use, and level ten has no enemy but the charger" —
replace that clause with "a count of its own body colour, which nothing else in
the game uses".

The two pixel-count thresholds further down (the ~1500/~1100 note and the 500
floor) are about a body's area, not its hue, so they stand. Confirm against the
counts the run prints and adjust the note if the numbers moved.

- [ ] **Step 4: Photograph room B**

At the end of the per-screen loop, after the `11-roof-top` shot:

```js
  // And on to room B's yard — the room four of the design's open questions
  // were about. Its charger sees 320, not the usual 240, so a ball standing
  // anywhere in this yard (the door is 286 from where the charge ends) is
  // noticed where it stands. The picture is the point: the ball, the plate,
  // the dazed charger on it and the open door should all be in one frame.
  await hold(Buttons.right(W, H), 9000);
  await shoot(`${W}x${H}-11-roomB`);
  await hold(Buttons.right(W, H), 4000);
  await shoot(`${W}x${H}-11-roomB-door`);
```

If nine seconds of holding right does not get the ball down into room B's yard,
do not guess at the number: print `ev` of the ball's x each second, find where
it actually is, and set the hold from that. `finish.mjs`'s `ROUTES[11]` is the
description of what the ball has to do.

- [ ] **Step 5: Run the browser suite and LOOK at the pictures**

Run: `node games/pushkar-ball/tests/run.mjs browser/chargers`
Expected: PASS, `CHARGERS DRAWN`.

Then open them — this is the step that has found every rendering bug in this
game:
- `tests/screenshots/chargers-568x320-10-08.png` and the 740×280 twin: is the
  blue clearly not the violet, and does it still read as menacing rather than
  friendly against the grass?
- `chargers-*-10-22.png` (dazed, stars): do the `#FFD84A` stars still read
  against blue?
- `chargers-*-11-roomB.png`: is the charger on the plate, the door open?
- `chargers-*-11-roof-top.png`: **Task 5's fix should show here** — the ball
  should now sit clearly below the hearts at 740×280, not level with them.

Report what the pictures show, not just that the suite passed.

- [ ] **Step 6: Update `tests/README.md`**

The browser `chargers` row still says the assertion counts `COLOURS.ENEMY` and
that the suite ends at level eleven's roof: its own colour now, and the two
room B pictures. The offline `chargers` row gains the per-instance sight. The
`levels` row's charger sentence should say the checkpoint check uses each
charger's own sight. If the `camera` row exists, add the top clear to it; if it
does not, leave the table alone and say so.

- [ ] **Step 7: Commit**

```bash
git add games/pushkar-ball/js/config.js games/pushkar-ball/js/enemies.js games/pushkar-ball/tests/browser/chargers.mjs games/pushkar-ball/tests/README.md
git commit -m "The charger gets its own colour, and room B gets its picture"
```

---

## Task 7: the spec says what was decided

A spec that still asks settled questions sends the next session round the same
loop.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md`
- Modify: `docs/superpowers/specs/2026-09-18-mechanisms-and-enemies-roadmap.md`
- Modify: `CLAUDE.md` (repo root)

- [ ] **Step 1: Turn the open questions into decisions**

Replace the whole "### Open questions for the user" section with "### The open
questions, decided (2026-09-20)", a short paragraph per question in the spec's
own voice. Cover all seven, and say plainly which needed no code: the charger's
width at 740×280 (the whole world is drawn smaller there; the horns, brow and
eye all still separate) and the dazed horns overlapping the step's face by
about 3 CSS px (it charged into it — that is what it looks like).

For question 1, carry the structural reasoning across from level 10's comment —
that a jump clears any strip, so no geometry reaches zero — rather than
repeating "6% is acceptable".

- [ ] **Step 2: Accept the stone-lip departure**

In "Where the build departs from this spec", the button's stone item: the
departure is **accepted**, 2026-09-20 — 3m proves the effect the spec asked for
(the ball reaches neither the cap nor the planks) and a thin lip is the more
fragile shape. Change the spec's own room A paragraph from "a stone lip over
it" to what is actually built, so the spec and the level agree.

- [ ] **Step 3: Note what the next sub-project inherits**

In "Carried over from the reviews, for the next sub-project", add that a
charger's sight is now per-instance (`e.see`), that `levels.mjs`'s checkpoint
check reads it, and that `COLOURS.ENEMY` is no longer shared by the charger —
which is the shape the shell and the swooper should follow.

- [ ] **Step 4: The roadmap**

Add one line under sub-project 2 noting the 2026-09-20 pass that settled its
open questions, so a reader knows the spec is closed rather than pending.

- [ ] **Step 5: CLAUDE.md**

Two bullets in "The shape of the thing — Pushkar Ball" are now incomplete. The
camera bullet ("Where the ball sits on screen is derived per screen") gains a
sentence on `TOP_CLEAR` as the hard floor under the slow vertical follow; the
state-machine bullet gains that a charger's sight is its level's to set. One
sentence each: that file is the things worth knowing *before* touching
anything, not a change log.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs CLAUDE.md
git commit -m "Close the charger spec's open questions"
```

---

## Task 8: the full run

Nothing here touches `sw.js` or the hub's `index.html`, so Taras Town's suites
are not required. Pushkar Ball's full run is, before anything is pushed.

- [ ] **Step 1: The whole Pushkar suite**

Run: `node games/pushkar-ball/tests/run.mjs 2>&1 | tail -60`
Expected: 28 of 29 suites pass. The one known failure is `finish`'s level 7
route, which predates all of this. **If anything else fails, it is a finding,
not noise** — say what it is rather than re-running for a better result.

- [ ] **Step 2: Report the numbers that changed**

Collect, from the run's own output: 2c's percentage, level 10's and 11's
slowest finishes, the camera suite's per-screen lines, and whether any run of
either level lost a heart. These are what the level comments claim; if a
comment and the output disagree, the comment is wrong and gets fixed.

- [ ] **Step 3: Stop and ask**

Do not push. Report the full-run result, the changed numbers and what the
screenshots showed, and wait.

---

## Self-review

**Spec coverage.** All seven questions have a task: 1 → Task 3 (accepted, with
reasoning recorded), 2 → Task 3, 3 → Task 4, 4 → Tasks 1 and 2, 5 → Task 7
(accepted, no code), 6 → Task 5, 7 → Task 6. The stone-lip departure → Task 7.
The dazed-horns overlap, which the spec listed under "Looks" but the user did
not number, → Task 7, accepted.

**Ordering.** Tasks 1 and 2 change level 11's behaviour; Task 4 changes its
timing. Each re-runs `finish` itself, and Task 8 sweeps everything once at the
end. Task 5 cannot move a level number, since the camera is not in the
simulation. Task 6's screenshots come after Task 5, so they show its fix.

**Names.** `see` is the field on both the level data (`e.see`) and the charger
(`c.see`); `TOP_CLEAR` is the config key, read in `camera.js` and
`camera.mjs`; `CHARGER_BODY`/`CHARGER_EDGE` are read in `enemies.js` and
`tests/browser/chargers.mjs`. `room11(...).c.see` is what `lure11` and 3n use,
and it exists because `room11` returns the loaded charger, not the level data.

**Not done here, on purpose.** `COUNTS_HEARTS`, `PEN_GUARD` and `holdAtStep`
stay as they are — Task 3 decides they are route devices and says so in the
comment rather than removing them. No new mechanic, no change to walker, roller
or popper, no sound.
