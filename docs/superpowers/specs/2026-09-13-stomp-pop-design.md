# Pushkar Ball — a bounce and a pop when stomping an enemy

Follow-up item 5 from `docs/superpowers/specs/2026-09-11-followup-ideas.md`.
Brainstormed 2026-09-13.

## What's there today, and what was actually planned

`Level.stompEnemy()` (`games/pushkar-ball/js/levels.js`) sets the enemy's
`alive` to `false` on a successful stomp and returns `true`; `player.js`
does nothing else that step. The enemy simply stops being drawn on the next
frame. No sound, no motion, no mark of the moment.

The original phase-3 design (`docs/superpowers/specs/2026-09-08-pushkar-ball-design.md`)
described "squares with faces that pop into a few triangles when bounced
on," and its file map lists `js/effects.js` for "particles," marked phase
3. Checked against the real repo: **no particle system exists anywhere in
this codebase today** — not for this, not for the deflate animation's own
planned "soft puff of particles," which was also never built. This item
isn't finishing something half-done; it's the first particle effect this
game will have, and it's scoped to this one use only.

One thing has changed since that original description: enemies are no
longer squares. The Phase A reshuffle (`2026-09-10-health-enemies-curriculum-design.md`)
gave every enemy a "sharper, still unarmed" look — a walker or roller is
drawn (`drawSpikyBody` in `games/pushkar-ball/js/enemies.js`) as a ring of
eight triangular spikes around an angry face. That ring is already made of
exactly the shape the original design wanted the pop to scatter into.

## The bounce

A stomp already feels like a jump-off — the ball is moving downward, lands,
and today just... keeps falling, unaffected, until it hits real ground. This
adds the missing half: landing on an enemy launches the ball upward, the
same one-line-override idiom `Ball.hit()` already uses for a hazard's
knockback, but as a reward instead of a setback.

`games/pushkar-ball/js/player.js`, where `stompEnemy` is called, currently
reads:

```javascript
    if (!level.stompEnemy(this)) {
      const knock = level.hazardKnockDir(this);
      if (knock !== null) this.hit(knock);
    }
```

The `true` branch is empty. It becomes:

```javascript
    if (level.stompEnemy(this)) {
      this.vy = -C.ENEMY.STOMP_BOUNCE;
    } else {
      const knock = level.hazardKnockDir(this);
      if (knock !== null) this.hit(knock);
    }
```

`STOMP_BOUNCE` is a new `CONFIG.ENEMY` field. An initial guess of 550px/s
(`550² / (2·2200) ≈ 69px`, about half a normal jump's 131px reach) turned out
to be wrong once actually tested against `finish.mjs`: level 2's enemies —
walker one, the popper, the roller, and walker two — were placed by
exhaustive sweeps against that same suite (see each enemy's own comment in
`levels.js` for how narrow some of those margins already are, e.g. walker
two's amplitude window of 280–300), and forcing a fixed upward velocity
the instant an incidental "bonus" stomp happens (per `finish.mjs`'s own
comment, a stomp mid-jump is meant to be "a bonus, not a problem for this
check") perturbs the ball's arrival timing at whichever margin comes next
just enough to break one of those already-tight windows. At 550, `lead 0.7
delay 0.5` failed to finish level 2 cleanly. A binary search against the
same suite found the break point between 380 (passes) and 390 (fails);
**300px/s** (`≈ 20px` of hop) was chosen with real margin below that,
confirmed to pass the full offline suite including every `finish.mjs`
sweep. It reads as a smaller, gentler hop than the original guess, not the
"about half a jump" figure first proposed — a real player is unlikely to
notice or mind the difference between a 69px and a 20px bounce, and no
hard constraint (a wall to clear, a gap to cross) ties this number down
the way the bounce pad's velocity was tied to its wall.

This is a case for the numbers, not the level: level 2's already-tuned
enemy placements are not touched by this change, on purpose — reopening
that tuning was judged out of proportion for what this follow-up asks for,
and the bounce's own magnitude was always going to be chosen by feel
regardless.

No other jump mechanic changes: no chain-jump ability, no double jump, no
new aerial control. The bounce is automatic and singular, matching the
bounce pad's own precedent of staying out of jump physics entirely.

## The pop

On a successful stomp, `Level` spawns a handful of small triangles at the
defeated enemy's position, flying outward and fading over a fraction of a
second, then removed. Purely decorative: no gravity, no collision, no
interaction with the ball or anything else in the level.

**Deterministic, not random** — matching this project's general
preference (moving platforms are a sine of level time, not integrated
physics, for the same reason: a level should look identical on every
attempt). The pieces fly out at fixed, evenly-spaced angles rather than
randomized ones — six pieces, 60° apart, the same ring arrangement
`drawSpikyBody` already draws its eight spikes in, just fewer of them and
now flying apart instead of standing still.

**New `CONFIG.ENEMY` fields:**

```javascript
    // The little hop a stomp gives the ball, and the handful of triangles
    // that fly off the defeated enemy — a reward this time, not a setback,
    // so it borrows HEALTH.KNOCKBACK_UP's one-line-override idiom rather
    // than adding a new kind of impulse. 300, not the ~550 first guessed:
    // a bonus stomp mid-jump perturbs the ball's timing at whatever margin
    // comes next, and level 2's already-tuned enemies broke at 390+ against
    // finish.mjs. 300 has real margin below that break point.
    STOMP_BOUNCE: 300,     // px/s upward impulse on a successful stomp
    POP: {
      COUNT: 6,            // triangles flying off, evenly spaced
      SPEED: 180,          // px/s outward
      LIFE: 0.45,          // s before a piece is gone
    },
```

**New state on `Level`:** a `particles` array, empty on load. `stompEnemy`
pushes six entries on a successful stomp, each `{x, y, vx, vy, life}` —
`x`/`y` at the enemy's own position, `vx`/`vy` from `POP.SPEED` at that
piece's fixed angle, `life` starting at `POP.LIFE`. `Level.update(dt)`
advances every particle's position by its velocity and counts `life` down,
filtering out any that reach zero — the same shape `Level.update` already
uses for the bounce pad's `squashT` countdown, just with removal instead of
a floor at zero, since a particle expiring is done for good rather than
resettable.

**Drawing:** a new `drawParticles()` in `main.js`, following `drawPads()`'s
own template — read `CONFIG.COLOURS.ENEMY`/`ENEMY_EDGE` (the same colours a
live enemy is drawn in, so the debris visibly belongs to what it came from)
and each enemy kind's existing shape module for reference, draw each
particle as a small triangle rotated to face its direction of travel,
scaled and faded by `life / POP.LIFE`. Called once per frame from `draw()`,
positioned after `drawEnemies()` so debris draws on top of any enemy still
alive nearby.

## Scope boundaries

- Only a successful stomp triggers this. A side hit (which costs the ball
  a heart and does not defeat the enemy) gets neither the bounce nor the
  pop — nothing changes there.
- The popper's own lobbed projectile is untouched — no pop when it expires
  or lands.
- The ball's own deflate animation does not gain the "soft puff of
  particles" the original design also mentioned for it. That's a separate,
  older, pre-existing gap; noted here for the record, not fixed here.
- No jump-mechanic changes beyond the one-line `vy` override — no chaining,
  no double jump, no new aerial control.

## Testing

- `games/pushkar-ball/tests/offline/enemies.mjs` already has a case
  ("stomping a walker defeats it, without costing a heart") built on a
  fixture where a ball drops straight onto a stationary walker. Extend it
  to assert, at the exact frame the stomp registers: `ball.vy` equals
  `-CONFIG.ENEMY.STOMP_BOUNCE` exactly, and `level.particles.length`
  equals `CONFIG.ENEMY.POP.COUNT`.
- A new case proves the particles are genuinely temporary and deterministic:
  spawn the six from a stomp, step `Level.update` for longer than
  `POP.LIFE`, and assert `level.particles.length` is back to zero — and,
  earlier in the same run, that all six started at fixed, predictable
  angles (checking the six initial velocity vectors are 60° apart, not
  reading anything random).
- Drawing itself gets the same one-time visual check the bounce pad got —
  temporarily jump to a level with a live enemy, stomp it, and confirm by
  eye that the pop reads as debris flying off (triangles, the enemy's own
  colours, fading quickly) rather than a glitch or a flash. No committed
  test can see pixels; this is a look, not an assertion.

## Out of scope

- Any change to the deflate animation, the popper's projectile, or jump
  physics beyond the one `vy` override described above.
- Sound — audio is phase 4 for this game and untouched by this follow-up.
- Items 7 and any other still-open follow-up item.
