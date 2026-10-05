/**
 * levels.js — the levels as data, and the loader that turns them into colliders.
 *
 * A level is a plain object. Nothing is drawn pixel by pixel and no geometry is
 * computed at draw time, so a level can be tweaked or a new one added without
 * going anywhere near the game loop.
 *
 * Ground polylines are authored LEFT TO RIGHT. That is not a convention for
 * tidiness: winding order is what decides which side of a segment is solid, and
 * a backwards polyline is a floor you fall through — which looks completely
 * normal in a screenshot. tests/offline/levels.mjs enforces it.
 *
 * DOM-free, so node can ask it anything the browser knows.
 */
import { segment, boxSegments, SegmentGrid, segmentHitsBox, supportUnder } from './physics.js';
// Crates fall, so they need GRAVITY and the crate numbers. config.js imports
// nothing and touches nothing, so this stays as DOM-free as it was.
import { CONFIG } from './config.js';
// Hazards are geometry, not colliders, so this brings in a hit test and
// nothing that touches the segment world or the DOM.
import { hitsSpikes, spikeHit, spikeHeight, circleHitsBox } from './hazards.js';
import { makeWalker, makeRoller, makePopper, makeCharger, makeShell, enemyHit, projectileHit } from './enemies.js';
// The wiring: senders and the needs logic. circuits.js imports nothing, so
// this adds no cycle and nothing that touches the DOM.
import { makeSender, postBox, updateSenders, resetSenders as clearSenders, powered, warning, rampToward } from './circuits.js';

// A note on how long a level is, and how sparse its checkpoints are.
//
// Levels one, three and four below (then numbered 1-3) were rewritten in Sep
// 2026 after the first three shipped — they were roughly 4000-4800 units wide,
// about 15-25 seconds of real play, and the spike level, then level three, had
// a checkpoint before every one of its three spike patches. Both were wrong. A
// "round" should be long enough to be worth sitting down for — these run
// 13,600-16,800 units, roughly 3.5-4x the originals, which is 60-100+ seconds
// of unhurried play rather than a blink. And a checkpoint belongs before the
// single hardest STRETCH of a level, not before every individual jump: each
// level below carries exactly two, positioned to break the level into large,
// roughly even pieces so one mistake costs a third of the level, not the whole
// run, but a run of easy, already-practised ground in between never gets
// flagged just for existing. Level six is a deliberate exception with only
// one: everything before its checkpoint is already-practised warm-up, not
// this level's hard part, and everything after its one real puzzle is flat
// ground with nothing left to fail — so a second checkpoint would guard
// nothing either side of the one that's there. See level six's own header
// comment.
//
// The gap widths reused here (200, 220, 240, 260) and the spike widths
// (70-100) are not new numbers — they are exactly the ones the original three
// levels proved completable, thirty ways each, in tests/offline/finish.mjs.
// Physics does not care where in the world a jump happens, so reusing proven
// distances at new positions carries the same guarantee forward rather than
// staking a new level on freshly-guessed arithmetic. Every level below is
// re-proven completable by that same suite regardless.
//
// Reshuffled again in Sep 2026, days later: enemies moved to level two, so a
// new level was inserted there and the two levels that followed it (crates,
// spikes) each moved up by one id. Their own geometry did not change — see
// each level's own header comment for what moved and why.
export const LEVELS = [
  {
    id: 1,
    theme: 'hills',
    bounds: { w: 16800, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 16660, y: 680 },

    ground: [
      // A long flat start — MORE room than the original gave before its first
      // hill, so the roll suite's friction measurement, which happens right
      // after spawn, has at least as much clear road as it always had. Then a
      // hill (up, along, down): rolling and slopes, before anything at all is
      // asked of the player.
      [[40, 760], [1100, 760], [1450, 600], [1800, 600], [2150, 760], [2950, 760]],
      // After a 200px gap: a bowl, then a long flat with two small things on
      // it, well apart: a stone block to hop onto and off (see `boxes`) and
      // the game's first spike patch (see `spikes`). Then a second, bigger
      // hill and a flat to the second gap.
      [
        [3150, 760], [3500, 760], [3650, 840], [3850, 840], [4000, 760], [4600, 760],
        [6400, 760], [6900, 540], [7500, 540], [8000, 760], [8850, 760],
      ],
      // After the 240px second gap: a flat with the vertical lift over it
      // (nothing needs the lift, same as the first level ever had), then a
      // third gap. It is 200px, the width the first one already proved, and
      // it comes after checkpoint one, so a miss costs a heart and a short
      // trip back to that flag. As anywhere, a third heart lost since the
      // flag goes back to the start.
      [[9090, 760], [10150, 760]],
      // Then a second bowl, another long flat with a crate and a two-step
      // stone staircase on it (see `boxes`), a third and tallest hill, and
      // flat to the final approach.
      [
        [10350, 760], [10600, 760], [10950, 760], [11100, 840], [11300, 840], [11450, 760], [12200, 760],
        [13800, 760], [14350, 520], [15000, 520], [15550, 760], [16200, 760],
      ],
      // The last ledge. Nothing but the moving platform reaches it.
      [[16560, 680], [16760, 680]],
    ],

    boxes: [
      // Walls at both ends, so the level cannot be left sideways. Not movable,
      // and drawn as stone rather than wood so that "wood gives way; stone
      // never does" stays true everywhere.
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 16760, y: 0, w: 40, h: 1080 },
      // Three wooden crates, and all can be pushed. Jump them, roll over them
      // at speed, or shove them about.
      //
      // Nothing in THIS level needs a crate to be finished — there is no spot
      // here that a jump cannot already reach, and saying otherwise in a
      // comment would be the easiest kind of lie to leave behind. They are
      // here so the mechanic is in a child's hands from the first level and so
      // the game exercises it; the level that is built around a crate is
      // level three, where the geometry is drawn for it.
      // What a crate can do is proved in tests/offline/crates.mjs, on a level
      // built for the purpose, with a ledge the jump provably cannot reach.
      { x: 2450, y: 660, w: 100, h: 100, movable: true },
      { x: 8300, y: 660, w: 110, h: 100, movable: true },
      // A low stone block on the long flat after the first bowl: hop up, roll
      // across, drop off. Stone, not wood, so it cannot be pushed, which keeps
      // "wood gives way; stone never does" true. A step is a box rather than a bend
      // in the ground for the reason level three's ledge face gives: a
      // vertical ground segment faces sideways, and levels.mjs rightly
      // insists every ground segment faces up. 60 tall, so a jump, which
      // lifts the ball 131, clears it with more than twice the height needed.
      { x: 4250, y: 700, w: 200, h: 60 },
      // The third crate, on the long flat after the second bowl, 600 clear of
      // the staircase ahead and well clear of the third gap behind. Shoved a
      // long way back it can end up in the second bowl, resting on a slope;
      // that is not a trap, since the ball can still jump past it.
      { x: 11800, y: 660, w: 100, h: 100, movable: true },
      // A two-step stone staircase: a wide step 60 tall, and a narrower one
      // 60 taller standing on its middle. Up, up, and back down. No step is
      // more than 60 above what the ball stands on, the same as the block.
      { x: 12500, y: 700, w: 400, h: 60 },
      { x: 12600, y: 640, w: 200, h: 60 },
    ],

    platforms: [
      // Across the last gap. Its travel is chosen so its left edge reaches
      // back over the ground at 16200 and its right edge stops short of the
      // ledge at 16560, leaving a small hop — a platform that docks exactly
      // with the scenery just reads as part of it. This is platforms[0]
      // deliberately: tests/offline/finish.mjs's route for this level reads
      // level.movers[0] to find it, and mover order follows platform order.
      { x: 16275, y: 740, w: 170, h: 28, axis: 'x', dist: 85, period: 5.0, phase: 0 },
      // A lift over the flat between the second gap and the third. Nothing
      // needs it; it is here so vertical movers are exercised by the game
      // and not only by the tests.
      //
      // It is deliberately unreachable — background motion, not a mechanic —
      // and that is a decision, not an oversight. Lowering it enough for a
      // jump to catch it (verified by simulation, not just arithmetic: the
      // ball's own jump only ever reaches y=629, but landing needs the
      // lift's low point past y=710 — a ball rising into its underside just
      // gets blocked, it cannot end up above the platform any other way)
      // also lowers it into a standing ball's head at y=720, so a child just
      // standing underneath gets visibly jittered by it twice a cycle.
      // Shrinking the platform's own height makes that worse, not better.
      // No number here reconciles "a jump can reach it" with "it leaves a
      // standing ball alone." See
      // docs/superpowers/specs/2026-09-13-lift-boarding-design.md.
      { x: 9700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 },
    ],

    spikes: [
      // The game's first spike patch, and level one's one preview of a later
      // level's idea. It is a named exception to "at most one new idea per
      // level", recorded in
      // docs/superpowers/specs/2026-09-12-livelier-level-one-design.md, and
      // it is not a precedent. Level four is where spikes are taught; this is
      // one narrow patch, level four's own rehearsal width, on open flat
      // ground 950 units past the stone block and 930 short of hill two, so it
      // is never met at the same moment as anything else. It can cost a
      // heart, never a fall. finish.mjs's runner jumps it without losing a
      // heart at every lead and start delay it tries, and so does a finer
      // sweep (five leads, a start every 0.1s; a scratch check, see the
      // Appendix of docs/superpowers/plans/2026-09-12-livelier-level-one.md)
      // with the patch moved 100 units either way or widened to 90.
      { x: 5400, y: 760, w: 70 },
    ],

    // Two, breaking the level into three pieces of roughly a third each
    // rather than guarding every gap. The first ~8700 units — the first hill,
    // the first two crates' worth of terrain, the first gap and bowl, the
    // stone block, the spike patch, the second hill — have no checkpoint at
    // all: none of it is the level's hard part, it is the level's ROLLING,
    // and a checkpoint there would only be banking progress nobody was going
    // to lose. Because nothing guards it, everything added to that stretch
    // can cost at most a heart a touch, never a fall; its one fall is the
    // first gap, which the level has always had. The two below sit right
    // before the two stretches where failing costs the most: the second and
    // third gaps, and the final hill-then-platform approach.
    checkpoints: [
      { x: 8750, y: 760 },
      { x: 13750, y: 760 },
    ],
  },

  {
    // Level two teaches the enemy — reshuffled here Sep 2026 so it lands as
    // early as the second level, per the request that "just jumping over
    // holes" was getting boring. A walker and a popper are met once each on
    // open, unguarded ground (the same "cheap to fail the first time" rule
    // every new hazard in this game gets); a roller is the level's one real
    // test, protected by a checkpoint; the tightest gap and a second walker
    // close it out, protected by a second checkpoint. Crates, which used to
    // be taught here, move to level three; spikes move to level four — see
    // those levels' own header comments.
    id: 2,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12800, y: 760 },

    ground: [
      // Rehearsal, piece one: a walker met on a long, open flat, close enough
      // to spawn that meeting it for the very first time costs almost
      // nothing — the enemy version of level four's first, easy spike patch.
      [[40, 760], [2200, 760]],
      // A 100px gap — narrower than level one's 200px, and deliberately so:
      // the popper sits just past its landing edge (see the popper's own
      // comment below for why), and a wider gap would land the ball well
      // past the window where the jump that crosses this gap is still
      // rising fast enough to matter for the popper right after it.
      [[2300, 760], [4800, 760]],
      // Rehearsal, piece two: a popper, met once, still before any
      // checkpoint. The 220px gap after it is a shade wider than the first,
      // the same graduated step every level in this game already uses.
      [[5020, 760], [6700, 760]],
      // The 240px gap, then the level's first real test: a roller, patrolling
      // open ground with room either side of it. Checkpoint one, placed at
      // the end of the flat just before this gap, protects this whole piece —
      // failing the roller costs this piece, not the rehearsal before it.
      [[6940, 760], [9200, 760]],
      // The 260px gap — the tightest in the level, already proven completable
      // at this exact width in the original three levels — then a second,
      // lower-stakes rep of the walker idea and a long flat home. Checkpoint
      // two, placed just before this gap, protects this final piece.
      [[9460, 760], [12960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
    ],

    platforms: [],

    // One rising patch, slow — the first spikes in the level, and a new idea,
    // so it sits on open ground before any checkpoint: a mistimed crossing
    // costs a heart, and losing all three only repeats easy ground from the
    // spawn. On the flat after the popper and the 220px gap: 680 past
    // the landing edge, 840 before checkpoint one, and 1340 before the roller's
    // patrol begins, so its timing is never asked at the same moment as
    // anything else's. Too tall to jump at its top; wait for it to sink.
    spikes: [
      { x: 5700, y: 760, w: 60, rise: { period: CONFIG.SPIKE.CYCLE_SLOW, phase: 0 } },
    ],

    enemies: [
      // Walker one: patrols 200 units either side of x=1200, well clear of
      // both the spawn and the gap that follows. The plan's first draft used
      // amplitude 500 — WALKER.SPEED is a fixed angular rate, so a wide
      // amplitude is also a fast one, and at 500 its peak speed exceeded the
      // ball's own MAX_SPEED, making the generic runner's fixed jump lead in
      // finish.mjs unreliable against it. 200 matches the amplitude
      // tests/offline/enemies.mjs already exercises for its own walker
      // fixtures and is the value finish.mjs's 30-way, every-checkpoint pass
      // actually settled on.
      { kind: 'walker', x: 1200, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 200 },
      // Popper: lobs back toward an oncoming ball (dir: -1), on the default
      // period. Placed just past the first gap's landing edge, deliberately
      // sitting in the FLAT TOP of the arc of the jump that crosses that
      // gap — not its steep rising or falling side — because a popper's
      // body sits far closer to the ground than a spike's silhouette (its
      // hitbox is a full circle roughly its own diameter tall) and the
      // runner's fixed jump lead in finish.mjs, tuned against a spike, does
      // not by itself gain enough height to clear a popper's body cleanly.
      // Riding near the apex of the GAP's own jump instead gives a wide,
      // forgiving margin that survives the walker's own hit before it
      // (which perturbs exactly how many simulation steps the ball takes to
      // settle back to rolling speed, and so exactly where along the jump's
      // arc it is when it reaches the gap). This moved twice: first from the
      // middle of the open flat (x=3600), which finish.mjs proved an
      // unrecoverable wall at lead 0.7 — no residual lift from any earlier
      // jump, so the ball never gains enough height in the runner's lead to
      // clear the body at all, grazes every attempt, and never gets past;
      // then from x=2500, just past the landing edge on the arc's STEEP
      // falling side, which finish.mjs also proved unreliable once the
      // walker's own hit was in the picture — a few percent of the run's
      // 30 lead/delay combinations landed the ball just enough earlier or
      // later along that steep part of the arc to graze it after all.
      // Timed, not aimed: tuned against the closed-form lob before poppers
      // could aim; the aimed popper came later.
      { kind: 'popper', x: 2350, y: 760 - CONFIG.ENEMY.POPPER.R, dir: -1, fixed: true },
      // Roller: the level's real test, patrolling a wide stretch (1900
      // units) of flat with room to spare from the gaps at either end and
      // from checkpoint two — there is no version of meeting it that also
      // asks for gap-timing at the same instant. Widened from the plan's
      // original 1600-unit range, and started moving left (dir: -1) rather
      // than right, after finish.mjs proved the first draft an occasional
      // wall at lead 0.7 near the very end of a 30-way, every-checkpoint
      // pass: a roller's exact position when the ball arrives depends on
      // how much level time has already passed, which itself depends on
      // exactly how the walker and popper before it were each met, so
      // reliably dodging it took both a wider range to patrol and a
      // different starting direction, found by exhaustively trying the
      // options against finish.mjs rather than by any closed-form rule.
      { kind: 'roller', x: 8000, y: 760 - CONFIG.ENEMY.ROLLER.R, from: 7100, to: 9000, dir: -1 },
      // Walker two: one more rep of the idea, well clear of the goal and the
      // gap behind it. Amplitude 300, WIDER than walker one's 200 — a code
      // review of this level's first draft (same amplitude as walker one)
      // found that at lead 0.7, checkpoint two's fresh three hearts could
      // drop to one from THIS encounter alone nine times in ten, in several
      // cases from two hits in the same pass, with nothing between here and
      // the goal to absorb a further mistake. That contradicts this comment's
      // own "lower-stakes" claim. Unlike walker one (which sits far from any
      // other hazard, so a slower/narrower patrol was fine), walker two is
      // the last thing between a just-spent checkpoint and the goal, so its
      // own margin matters more, not less. A narrower or slower walker here
      // made it WORSE, not better — a walker parked closer to one spot is
      // more like the popper's original cold-jump problem, and the sweep
      // that found this value showed smaller amplitudes causing actual
      // deaths, not fewer of them. 300, verified against finish.mjs's own
      // 3-lead-by-10-delay matrix with a direct check of hearts after
      // checkpoint two (not just deaths, which finish.mjs alone does not
      // track), never drops below 2 of 3 hearts and never costs a death,
      // with the same margin holding across amplitudes 280-300 at any x in
      // 10490-10530 — comfortably off the single lucky value 300/10500
      // turned out to be, not a coincidence. (Re-review found the margin
      // does NOT extend cleanly all the way to 320: two cells right at
      // amplitude 310-320, x=10490, delay=0.5 die. The shipped value,
      // 300/10500, sits well clear of that edge.)
      { kind: 'walker', x: 10500, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 300 },
    ],

    // Two, at the two places a real test follows: checkpoint one guards the
    // roller (and the 240px gap right before it); checkpoint two guards the
    // level's tightest gap and the final stretch. The rehearsal before
    // checkpoint one — both enemies met for the first time, and two already-
    // practised gaps — is deliberately unguarded, the same rule every level
    // in this game already follows for a new idea's first, cheap-to-fail
    // appearance.
    checkpoints: [
      { x: 6600, y: 760 },
      { x: 9100, y: 760 },
    ],
  },

  {
    // Level three teaches the crate — reshuffled here Sep 2026 from its
    // original home at level two, so enemies could move up to level two
    // instead. Level one has crates and never needs one; here the only way
    // onto the high ledge is to shove a crate under it and jump off the top,
    // so the idea is learned somewhere it can be practised with no hazard
    // anywhere near it. Its ground, boxes and checkpoints are unchanged from
    // the original level two.
    //
    // It also brings back what level two already taught: a walker, on the
    // long flat between the first two gaps, and — added Sep 16 2026 — a
    // roller, on its own flat between the next two gaps, deliberately not
    // sharing the walker's flat so the two enemies' hit chances can never
    // compound. Neither is a new idea, so neither gets a checkpoint or a
    // rehearsal of its own; they are here so that what level two taught
    // does not simply stop the moment level two ends.
    id: 3,
    theme: 'hills',
    bounds: { w: 13600, h: 1080 },
    spawn: { x: 180, y: 560 },
    goal: { x: 13400, y: 620 },

    ground: [
      // A long flat run to get up to speed, then a first 200px gap.
      [[40, 760], [1300, 760]],
      // A long flat, then a 220px gap — a shade wider than the first, so the
      // sequence keeps asking a little more without ever asking two things
      // at once.
      [[1500, 760], [3800, 760]],
      // A long flat, then the 260px gap — the tightest jump in the level.
      [[4020, 760], [6400, 760]],
      // A long flat, then a 240px gap — a little easier than the one just
      // met, a breather before the level's real subject.
      [[6660, 760], [9000, 760]],
      // The step down and along: the flat where the crate lives, below the
      // ledge, and MUCH longer than the original gave — there is room here to
      // experiment with the crate without the flat itself feeling cramped.
      [[9240, 800], [11200, 800]],
      // The high ledge, and the goal is on it. Its top is 180px above the flat
      // below, and a jump from that flat reaches 131px — a ball there is at
      // y=780 and peaks at 649, which is not the 600 it needs to land on 620.
      // Standing on a 100px crate it is at 680 and peaks at 549, which is. So
      // the crate is the only way up, with about 50px of margin either way.
      [[11260, 620], [13560, 620]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 13560, y: 0, w: 40, h: 1080 },
      // The ledge's face, as a stone box rather than a bend in the polyline.
      //
      // A ground polyline cannot turn vertical here: winding order gives a
      // vertical segment a sideways normal, `ny` is 0, and levels.mjs rightly
      // insists every ground segment faces up. So the step's face is a box,
      // which is what boxes are for.
      //
      // It also has to exist at all. Without a face the ledge is a floating
      // horizontal line: the crate gets shoved straight underneath it and off
      // the end of the flat, and there is nothing to push it up against.
      //
      // It runs to the bottom of the level rather than stopping at the flat's
      // 800, because the ground is drawn as a filled band under each line and
      // the two bands here end short of each other otherwise. A face stopping
      // partway left a crevice open below it, and the hills showed through.
      { x: 11200, y: 620, w: 60, h: 460 },
      // The crate that matters, on the flat below the ledge, well clear of
      // the gap behind it so it cannot be shoved off the edge before it is
      // needed. It can be — crates come back when they fall out — but a child
      // who loses it for ten seconds has learned nothing except that things
      // vanish. This is boxes' only movable entry: tests/offline/finish.mjs's
      // route for this level reads level.crates[0] to find it.
      { x: 9700, y: 700, w: 100, h: 100, movable: true },
    ],

    platforms: [],

    // One rising patch, quick — the same idea level two taught slowly, now
    // with a shorter window. After checkpoint one, so a mistimed wait costs
    // this stretch and not the gaps before it: 1140 past the 260px gap's
    // landing edge and 1140 before the 240px gap, far from the walker and the
    // crate flat.
    spikes: [
      { x: 7800, y: 760, w: 60, rise: { period: CONFIG.SPIKE.CYCLE_FAST, phase: 0 } },
    ],

    enemies: [
      // A recurring walker, from level two — the calmest of the three
      // enemies, because this level's own job, the crate, is already a
      // puzzle, and the enemy that comes back here should add company, not
      // thinking. It paces 2395..2955 on the flat between the 200px and
      // 220px gaps, 895 and 845 units clear of them and nowhere near the
      // crate flat, so it is never asked for at the same moment as anything
      // else.
      //
      // Before the first checkpoint on purpose. Whatever it costs is given
      // back at checkpoint one, which refills hearts before the level's
      // tightest gap; and the rare sloppy run that loses all three hearts to
      // it goes back only ~2700 units, over one easy gap, to the spawn.
      //
      // x=2675 and amplitude 280 were found by sweeping, not guessed — as
      // level two's walker two also found, a walker's margin is fussy.
      // Against finish.mjs's 3-lead-by-10-delay matrix, most positions tried
      // on this flat cost some run at lead 0.7 all three hearts; this one
      // never drops below 2 of 3, and neither does any neighbour 25 units
      // either side or 20 of amplitude either side, so it is the middle of a
      // passing region rather than its edge. The region is narrow, though:
      // 50 units either side, at 2625 or 2725, some lead-0.7 runs lose all
      // three hearts again, so do not nudge this without re-checking. A
      // slower walker (the optional `speed`) was tried and was worse at
      // every speed, as it was for walker two. Sampling the start delay every
      // 0.1s and five leads rather than three (230 runs in all) still finds 3
      // that lose all three hearts here, every one at lead 0.7 — fewer than
      // level two as shipped on the same sampling (8 in 230, likewise all at
      // lead 0.7, six of them to its walker one alone).
      { kind: 'walker', x: 2675, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },

      // A roller, level 2's real test rather than its calm one — level
      // four's own comment calls it "the most active of the three
      // enemies... the one that has to be tracked and timed." On its own
      // flat, NOT the walker's: the long run between the 220px and 260px
      // gaps, currently empty. A gap sits on each side of the walker's own
      // flat and this one, so there is no shared knockback/recovery
      // interaction between the two the way a first attempt on the walker's
      // own flat found — a walker hit's knockback and brief slowdown cannot
      // carry a ball into a roller separated from it by a gap.
      //
      // Also well clear of checkpoint one at x=6260, which sits inside this
      // same flat near its end: `to` stops 360 units short of it, so the
      // checkpoint itself is never obstructed.
      //
      // from=4300 and to=5900 are the segment's own starting margins (280
      // units from the flat's start at 4020, and a generous 500 from its
      // end at 6400 — nowhere near tight against where the 260px gap
      // begins) and needed no widening — unlike the walker's own flat, this
      // one had plenty of room. What did need sweeping was `dir` and `x`:
      // the proposed dir=-1 (starting mid-patrol, heading toward `from`)
      // failed 6 of 30 at lead 0.7, all deaths=1 finishes — not the
      // walker/roller cascade a first attempt on the shared flat found
      // (there is no walker within two gaps of here to cascade with), but
      // the same underlying problem alone: at lead 0.7 the runner's
      // 70×0.7=49px jump-trigger window is sometimes too narrow to clear
      // the roller in one pass, and a graze followed too soon by a second
      // one still spends all three hearts. dir=1 (starting mid-patrol,
      // heading toward `to` instead) passed all 30 outright; x was then
      // swept every 5 units from 4900 to 5100 to confirm dir=1 was not a
      // single lucky point but a wide passing region, and it held clean
      // throughout. Settled on x=5000, the middle of that confirmed-clean
      // stretch.
      { kind: 'roller', x: 5000, y: 760 - CONFIG.ENEMY.ROLLER.R, from: 4300, to: 5900, dir: 1 },
    ],

    // Two, not one per gap. The first sits right before the level's tightest
    // jump — the 260px gap — so failing THAT specific jump costs only that
    // jump, not the two easier gaps rolled through to reach it. The second
    // sits on the crate flat, 100px before the crate itself — the same
    // relative spacing the level always used — so a respawn still lands on
    // the correct side to push it. Placing this one BEHIND the crate instead
    // (which the first draft did, at the crate's own far edge) left a
    // respawned ball on the wrong side to push from, unable to finish;
    // tests/offline/finish.mjs's per-checkpoint pass is what caught it.
    // Working out a crate means backing up and trying again, and the flat
    // ends in a gap on its left — without this flag, every child who backs
    // off the flat while experimenting is sent to redo a gap before he may
    // try the crate again.
    checkpoints: [
      { x: 6260, y: 760 },
      { x: 9600, y: 800 },
    ],
  },

  {
    // Level four teaches the spike — reshuffled here Sep 2026 from its
    // original home at level three, so crates could move down to level three
    // and enemies could move up to level two. Everything under it — rolling,
    // gaps, crates, a moving platform, enemies — has already been met, and
    // so has one narrow spike patch, glimpsed once on open ground in level
    // one; this is where spikes are taught. Its ground, platform, spikes and
    // checkpoints are unchanged from the original level three.
    //
    // It also brings back one thing already taught: a roller, from level
    // two, on the flat between checkpoint one's spike patch and the ramp —
    // see `enemies` below. Not a new idea, so it gets no checkpoint of its
    // own, for the same reason the gap below gets none.
    //
    // Past checkpoint two, on the long flat home, it asks something new: a
    // patch no jump clears, on a slab over a boarded-up tunnel — a way must be
    // MADE, with the crate or by smashing the planks.
    //
    // Added Sep 16 2026: the four open-ground patches now rise, ramped from
    // CYCLE_SLOW near spawn to CYCLE_FAST by the time checkpoint one's own
    // patch is reached — jumping a spike was this level's original lesson;
    // timing one is now layered on top of it. The tunnel patch is
    // deliberately excluded — see its own comment in `spikes` below.
    id: 4,
    theme: 'hills',
    bounds: { w: 15200, h: 1080 },
    spawn: { x: 180, y: 560 },
    // On the ground, like every other goal in the game — level one's sits at
    // its ledge's own height. GOAL.R is forgiving enough either way, but a
    // flag floating 60px in the air is a flag drawn hovering.
    goal: { x: 15000, y: 760 },

    ground: [
      // A long flat with the first two patches on it, in the open, well
      // before any checkpoint. The first is close enough to spawn that
      // meeting a spike here costs almost nothing even without a flag to
      // catch it: the safe rehearsal the rule asks for, and a reminder of the
      // one patch level one showed. The second is the same idea, met again,
      // still on easy ground, before the level asks for anything else at
      // once.
      [[40, 760], [5200, 760]],
      // After a 200px gap — the same size as level one's, already met and
      // already practised there — a long flat with the third patch on it,
      // then up a ramp onto high ground with the fourth. Nothing guards the
      // gap itself: it is not the new idea here, only the spikes are, and
      // only a new idea earns its own checkpoint in this level.
      [[5400, 760], [9800, 760], [10150, 620], [11800, 620]],
      // Down off the high ground and a long flat home.
      [[11800, 620], [12150, 760], [15160, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 15160, y: 0, w: 40, h: 1080 },
      // The slab: a stone roof over a 60px tunnel, carrying the tall patch.
      // Its top is at 680 and the teeth reach 600. An unaided jump's underside
      // peaks at 629, 29px below the tips, so it meets the teeth; a jump off a
      // crate peaks at 529, 71px clear. The teeth were 100 tall at first and
      // were lowered to 80: once the crate is flush against the planks, its
      // jump is the only way over, and at 100 a press a moment late after
      // landing on it hit the teeth. Unaided jumps still never cross, hit or
      // not. See this level's routes in tests/offline/finish.mjs, section 3d.
      { x: 13400, y: 680, w: 100, h: 20 },
      // The crate for the first way past, 800 short of the planks, on open
      // flat so it can be shoved all the way without meeting anything. The
      // planks and the slab's face stop it; it is 100 tall and the tunnel is
      // 60, so it can never be pushed in.
      { x: 12500, y: 660, w: 100, h: 100, movable: true },
    ],

    platforms: [
      // Across the gap, so it can be crossed by waiting as well as by jumping.
      // Two ways past the same obstacle is how a level stops being a wall.
      { x: 5240, y: 800, w: 150, h: 26, axis: 'x', dist: 70, period: 4.5, phase: 0 },
    ],

    spikes: [
      // The rehearsal: narrow, flat, unmissable, close to spawn. Rising,
      // added Sep 16 2026 — CYCLE_SLOW, the same cycle level 2 uses, so the
      // very first patch a player meets in this level is also the gentlest
      // introduction to "spikes can move" this game has. Phase 0: no other
      // rising patch is ever on screen with it, so there is nothing for a
      // shared phase to desynchronise from.
      { x: 700, y: 760, w: 70, rise: { period: CONFIG.SPIKE.CYCLE_SLOW, phase: 0 } },
      // A second, still-easy patch on the same long flat — one more rep of
      // the idea before the gap and the first checkpointed stretch. Also
      // CYCLE_SLOW: still rehearsal, not yet the level's real test.
      { x: 3400, y: 760, w: 90, rise: { period: CONFIG.SPIKE.CYCLE_SLOW, phase: 0 } },
      // The first patch that is really asked of the player, well after the
      // gap so the gap and the spikes are never one piece of timing.
      // CYCLE_FAST from here on — the same cycle level 3 uses — since this
      // is where the level stops rehearsing and starts testing.
      { x: 7200, y: 760, w: 100, rise: { period: CONFIG.SPIKE.CYCLE_FAST, phase: 0 } },
      // On the high ground, in plain view from the top of the ramp before it
      // has to be jumped.
      { x: 11100, y: 620, w: 90, rise: { period: CONFIG.SPIKE.CYCLE_FAST, phase: 0 } },
      // The patch that does not come down. It stands on the slab over the
      // tunnel and no jump from the ground clears it. Two ways past: shove the
      // crate against the planks and jump from it, or roll into the planks
      // hard enough to break them and go underneath. Deliberately left
      // static — see config.js's SPIKE.RISE_H comment for why.
      { x: 13400, y: 680, w: 100, h: 80 },
    ],

    // The tunnel's door: planks filling the gap under the slab's left edge,
    // 60 tall from the slab's underside to the ground.
    breakables: [
      { x: 13400, y: 700, w: 30, h: 60 },
    ],

    enemies: [
      // A recurring roller, from level two, where it was that level's real
      // test. It is the most active of the three enemies — the one that has
      // to be tracked and timed — and this is the later level, so it can
      // afford it. It patrols 7800..9400: 500 units past the end of the
      // spike patch at 7200, which checkpoint one guards, and 400 short of
      // the ramp, so a ball never has spike-timing and roller-timing in the
      // same moment. Checkpoint one refills hearts just before that patch,
      // so the patch and the roller share one fresh budget of three, and
      // checkpoint two refills them again on the high ground before anything
      // else is asked. Running out between the two sends the ball back to the
      // spawn, roughly 8,000 units behind, not to checkpoint one.
      //
      // Starting in the middle and heading left, as level two's roller does.
      // What matters is which way it is heading when the ball reaches it:
      // met head-on, a late jump costs one heart; caught from behind or at
      // its turn, a late jump can cost all three. finish.mjs's start delays
      // span 4.5s, about a fifth of this roller's ~23s patrol, so they only
      // see what a quick arrival meets — heading left from here, that is
      // head-on: every lead-0.7 run takes exactly one heart and every run at
      // lead 1 or 1.3 takes none (heading right, the same matrix lost all ten
      // of its lead-0.7 runs from the spawn). That holds for starts 200 units
      // either side of 8600 and for patrols 100 units wider or narrower at
      // each end; narrower still, at 7950..9250, a lead-0.7 run is lost
      // again. Swept over a whole patrol instead (start delays 0-23s every
      // 0.1s, five leads), leads of 0.85 and up still never lose a run or a
      // second heart, but lead 0.7 loses 72 of 229 — an arrival that meets
      // it at its turn or from behind, and jumps late, can lose the run here.
      // That is the roller, not this spot: the same sweep on the flat before
      // checkpoint one, patrolling 1300..2900, lost 72-73 of 229 as well, and
      // that flat is kept for the level's first two spikes. Level two's
      // roller does no better on the same sweep.
      { kind: 'roller', x: 8600, y: 760 - CONFIG.ENEMY.ROLLER.R, from: 7800, to: 9400, dir: -1 },
    ],

    // Two, not one per patch. The first two patches sit close to spawn and
    // are cheap to redo from it, which is the whole point of a rehearsal —
    // flagging them would just be banking progress nobody was going to lose.
    // Each checkpoint below sits right before the one real test that follows
    // it, so failing a patch costs that patch and nothing rolled through to
    // reach it.
    checkpoints: [
      { x: 7050, y: 760 },
      { x: 10950, y: 620 },
    ],
  },

  {
    // Level five: the pad is the one new idea, taught first on open, level
    // ground, then required to clear a wall no ordinary jump can reach.
    // Everything else here already exists — a gap, a crate, a spike patch,
    // a walker, a roller — recombined rather than re-taught, per the
    // recurring-difficulty ruling that an idea already taught may recur in
    // any later level. See
    // docs/superpowers/specs/2026-09-13-bounce-pad-and-level-five-design.md.
    id: 5,
    theme: 'hills',
    bounds: { w: 12800, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12100, y: 760 },

    ground: [
      // The rehearsal: a long flat, well before any checkpoint, with the
      // pad sitting directly in the rolling line. There is nothing after it
      // to clear yet — just open flat ground — so the first bounce is free
      // to feel out, with nothing to fail at.
      [[40, 760], [2500, 760]],
      // A 200px gap — the same size level one's first one already proved —
      // then a long flat carrying the recurring crate, a spike patch, and a
      // walker, all well-practised ideas rather than anything new.
      [[2700, 760], [7000, 760]],
      // The real test: a roller, protected by checkpoint one just before
      // it. Then a second 200px gap.
      [[7000, 760], [9500, 760]],
      // Home to checkpoint two, then straight on to the gate: no third gap
      // here, on purpose — this whole stretch is one continuous flat, so
      // there is nothing to fall into between the checkpoint and the pad.
      // 120 units sit between the pad's right edge (11140 + 100) and the
      // wall (11360) — inside the 50-200 unit window the pad's bounce
      // velocity clears, see the design spec — then flat again to the goal.
      [[9700, 760], [12760, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12760, y: 0, w: 40, h: 1080 },
      // The recurring crate, exactly as pushable as level three's.
      { x: 4200, y: 660, w: 100, h: 100, movable: true },
      // The wall: 200 tall, far beyond any unaided jump's 131px reach, and
      // the only thing in this level the pad is actually required for.
      { x: 11360, y: 560, w: 40, h: 200 },
    ],

    pads: [
      // The rehearsal, on open ground with nothing to clear.
      { x: 1500, y: 760, w: CONFIG.BOUNCE.W },
      // The gate. Its right edge sits 120 units short of the wall at
      // 11360 — comfortably inside the checked 50-200 unit clearance
      // window, with margin either side.
      { x: 11140, y: 760, w: CONFIG.BOUNCE.W },
    ],

    spikes: [
      // One recurring patch, on the long flat with the crate and the
      // walker — well-practised, not this level's point.
      { x: 5600, y: 760, w: 90 },
    ],

    enemies: [
      // A walker, recurring, on the same flat as the crate and the spikes.
      { kind: 'walker', x: 6200, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 300 },
      // The roller, level five's one real test, protected by checkpoint
      // one just before it — the same role it plays in level four.
      { kind: 'roller', x: 8200, y: 760 - CONFIG.ENEMY.ROLLER.R, from: 7300, to: 9300, dir: -1 },
    ],

    // Two, at the same "roughly a third of the level" boundaries every
    // other level uses them at. The first guards the roller, the real test
    // in the level's middle third; the second guards the wall gate — 290
    // units of runway before the pad at 11140, comfortably more than the
    // ~55 units a standing start needs to reach full speed, so a checkpoint
    // respawn is never short of room to build up speed again before the
    // pad.
    checkpoints: [
      { x: 6850, y: 760 },
      { x: 10850, y: 760 },
    ],
  },

  {
    // Level six: the pressure switch and its gate are the one new idea —
    // push a crate onto the plate to hold the gate open, then walk through
    // without it, since nothing here lets the ball pull a crate back. A
    // 200px gap, a recurring low stone step and a recurring walker warm the
    // level up first; none of that is new. See
    // docs/superpowers/specs/2026-09-13-pressure-switch-and-scenery-design.md.
    id: 6,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12760, y: 760 },

    ground: [
      // Warm-up: a proven 200px gap, well before any checkpoint.
      [[40, 760], [2200, 760]],
      // A long flat carrying the recurring stone step and the recurring
      // walker, well apart from each other and from the puzzle ahead.
      [[2400, 760], [7900, 760]],
      // The puzzle stretch, protected by the checkpoint just before it: the
      // crate, the switch plate, and the closed gate.
      [[7900, 760], [11200, 760]],
      // Past the gate, flat to the goal — nothing hard left to guard.
      [[11200, 760], [12960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
      // The recurring low stone step from level one, 60 tall — a jump
      // clears it with more than twice the height needed.
      { x: 3200, y: 700, w: 200, h: 60 },
      // The crate that matters. Pushed right, it comes to rest against the
      // CLOSED gate's own face — the gate does double duty as both the
      // obstacle and the thing that stops the crate exactly on the plate,
      // the same way level three's ledge face stops its crate.
      { x: 8300, y: 660, w: 100, h: 100, movable: true },
    ],

    // The plate's right edge (9700 + 110 = 9810) sits flush against the
    // gate's left face, so a crate pushed all the way right comes to rest
    // with its footprint over the plate — there is nowhere else for it to
    // stop.
    switches: [
      { id: 'gate1', x: 9700, y: 760, w: 110 },
    ],

    // Closed: 200 tall, far beyond any unaided jump's 131px reach — the
    // same wall height level five's own gate already proved needs a real
    // mechanic, not a jump, to clear.
    gates: [
      { x: 9810, y: 560, w: 40, h: 200, switchId: 'gate1' },
    ],

    platforms: [],

    enemies: [
      // A recurring walker, well clear of the step and of the puzzle stretch
      // — never met at the same moment as anything else. Edge to patrol
      // extent: the step's right edge (3200 + 200 = 3400) to the walker's
      // nearest reach (4400 - 280 = 4120) is 720 units; the walker's
      // farthest reach (4400 + 280 = 4680) to the puzzle stretch's start
      // (7900) is 3220 units.
      //
      // x=4400 was found by sweeping finish.mjs's 3-lead-by-10-delay matrix,
      // not guessed — as level three's own walker comment already found, a
      // walker's margin is fussy. 4500 (the first value tried, dead centre of
      // the available flat) loses all three hearts on one combination of that
      // matrix; 4400 does not, and neither does any neighbour 25 units either
      // side or 20 of amplitude either side, so it is the middle of a passing
      // region rather than its edge. The region is narrow, though — as it was
      // for level three's walker — so do not nudge this without re-checking:
      // a denser sweep (5 leads, delay sampled every 0.1s, 250 runs) still
      // finds 3 that lose all three hearts here, every one at lead 0.7.
      { kind: 'walker', x: 4400, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    // One. Everything before it (the first gap, the step, the walker) is
    // already-practised ground — none of it is this level's hard part, so a
    // checkpoint there would only bank progress nobody was going to lose.
    // Everything after the gate, once it's open, is flat with nothing left
    // to fail — a second checkpoint there would guard nothing.
    checkpoints: [
      { x: 8150, y: 760 },
    ],
  },

  {
    // Level seven: the balance beam is the one new idea — push a crate past
    // its fulcrum to level it, then walk across. It rests tilted, one end
    // down on the entry ledge and the other dangling above the exit ledge,
    // until the crate's weight brings the far end down to meet it. A gap,
    // and a recurring walker, warm the level up first; neither is new. See
    // docs/superpowers/specs/2026-09-13-balance-beam-design.md and this
    // plan's own header for how minAngle/halfLength were chosen — steep
    // enough that the ball cannot simply climb the unlevelled beam like a
    // ramp, shallow enough that it still counts as ground a crate can rest
    // on and the ball can walk when it counts.
    id: 7,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12760, y: 630 },

    ground: [
      // Warm-up: a proven 200px gap, well before any checkpoint.
      [[40, 760], [2200, 760]],
      // A long flat carrying the recurring walker, ending at the entry
      // ledge — the checkpoint sits just before the crate.
      [[2400, 760], [8500, 760]],
      // The 200px gap the beam bridges: x=8500 to x=8700. No ground line
      // here at all — between the two ledges, the beam is the only thing
      // to stand on.
      [[8700, 630], [12960, 630]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
      // The crate that matters, well clear of the gap so it cannot be
      // shoved in before it is needed.
      { x: 8300, y: 660, w: 100, h: 100, movable: true },
    ],

    beams: [
      { x: 8610, y: 630, halfLength: 170, minAngle: -Math.PI * 50 / 180, maxAngle: 0 },
    ],

    platforms: [],

    enemies: [
      // A recurring walker, at the exact x/amplitude level six's own walker
      // already proved (see its comment there) — placed on a comparable
      // long flat with at least as much clearance either side, as a
      // starting point. Re-verified for THIS level's own geometry in Task
      // 4, not assumed to carry over unchecked.
      { kind: 'walker', x: 4400, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    // One. Everything before it (the first gap, the walker) is
    // already-practised ground — none of it is this level's hard part, so a
    // checkpoint there would only bank progress nobody was going to lose.
    // Everything after the beam, once it's level, is flat with nothing left
    // to fail — a second checkpoint there would guard nothing.
    checkpoints: [
      { x: 8150, y: 760 },
    ],
  },
  {
    // Level eight: buttons. Stage: INTRODUCTION — see the roadmap,
    // docs/superpowers/specs/2026-09-18-mechanisms-and-enemies-roadmap.md,
    // and the spec, docs/superpowers/specs/2026-09-18-wiring-buttons-timers-bridges-design.md.
    // The one new idea: hitting a button changes the world, and it stays
    // changed. Read by its lamps: light every lamp on the door.
    //
    // Room A comes FIRST, before any warm-up: it cannot be failed, so the
    // level may as well open with its new idea. Then level six's warm-up
    // shape (a proven 200 gap, the recurring stone step, a walker), then:
    //   B — a 420 gap (the widest proven jumpable is 260) and a bridge; its
    //       button faces RIGHT, so it is hopped on the way in and has to be
    //       come back to. The wire shows where.
    //   C — a gate with two lamps on a stone shelf. The shelf's top (590) is
    //       39 above a jump from the floor (a ball's bottom reaches 629) and
    //       61 below one from a crate's top (529). The gate is 240 tall: from
    //       the shelf a jump's bottom reaches 459, which would clear a 200 one.
    //       Room C's floor button's post top (710) would put a jump at 579,
    //       above the shelf — but the post ends 520 short of it (10480 to
    //       11000) and a jump carries at most 290, so it cannot be used as a
    //       step there. The ball presses the button 890 from the gate's
    //       middle, inside CIRCUIT.SEE (900) — how far the camera's reveal
    //       reaches, not how much a screen shows, which is far less.
    id: 8,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12760, y: 760 },

    ground: [
      [[40, 760], [2600, 760]],
      // Past the proven 200 gap: the step, the walker, room B's button.
      [[2800, 760], [8600, 760]],
      // Past room B's 420 gap: room C and the flag.
      [[9020, 760], [12960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
      // The recurring low stone step, 60 tall.
      { x: 3600, y: 700, w: 200, h: 60 },
      // Room C's shelf, standing on the floor like level three's ledge.
      { x: 11000, y: 590, w: 700, h: 170 },
      // Room C's crate. Pushed right, it stops against the shelf's face at
      // x=10900 and is the step up. It starts 20 short of the shelf face —
      // too narrow for the ball — so the ball can never get behind it and
      // shove it back against button c's post, which would leave the room
      // unfinishable (room C has no way to fail, so only the restart button
      // would get a child out). At 10850 a 50 gap trapped the ball in 22 of
      // 62 simple tries; 10865 (a 35 gap) still trapped 15 of 176. Far
      // enough from the floor button (post 10450-10480) that hopping the
      // post never lands on it. finish.mjs's 3g checks all of this.
      { x: 10880, y: 660, w: 100, h: 100, movable: true },
    ],

    senders: [
      { id: 'a', kind: 'button', x: 1400, y: 760, face: 'left' },
      { id: 'b', kind: 'button', x: 8000, y: 760, face: 'right' },
      { id: 'c', kind: 'button', x: 10450, y: 760, face: 'left' },
      { id: 'd', kind: 'button', x: 11150, y: 590, face: 'left' },
    ],

    gates: [
      { x: 1800, y: 560, w: 40, h: 200, needs: ['a'] },
      { x: 11300, y: 350, w: 40, h: 240, needs: ['c', 'd'] },
    ],

    bridges: [
      { x: 8600, y: 760, w: 420, dir: 1, needs: ['b'] },
    ],

    platforms: [],

    enemies: [
      // Level six's walker, about 800 further on because room A sits in
      // front of the warm-up here. A walker's margin is fussy (see level
      // six's own comment) and the arrival time has changed, so its x was
      // found by sweeping finish.mjs's 3-lead-by-10-delay matrix in 25-unit
      // steps from 4900 to 5600, not carried over. 5200, the first guess,
      // loses all three hearts on one combination (lead 0.7). The passing
      // regions are narrow and periodic — 4900, 5050-5100, 5250, 5475 — and
      // 5075 is the middle of the widest: 5040 to 5100 all pass at 10-unit
      // steps, 5110 does not, and amplitude 260-300 all pass here. As for
      // level six, a denser sweep (5 leads, delay every 0.1s, 250 runs) still
      // finds 5 that lose all three hearts, every one at lead 0.7. Do not
      // nudge this without re-running the sweep.
      { kind: 'walker', x: 5075, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    // Before room B, and between room B's bridge and room C. Neither may sit
    // between a button and what it opens — levels.mjs checks.
    checkpoints: [
      { x: 7600, y: 760 },
      { x: 9800, y: 760 },
    ],
  },
  {
    // Level nine: timers, and a reversal. Stage: REINFORCEMENT, then
    // REVERSAL — see the roadmap and the wiring spec named in level eight.
    //
    // Room A first again, as in level eight: a timer in the path, its gate
    // 400 on, 3.5s to get there — about three times what it takes.
    // Then level eight's warm-up exactly (same gap, step, walker), then:
    //   B — set up the room first. A timed gate beyond a 420 gap. The gap's
    //       bridge is driven by an ordinary button on a floating stone ledge
    //       (top 670, bottom 700: a rolling ball's top, 720, passes under
    //       it, and a jump's bottom, 629, rises 41 above it). The timer faces
    //       right, as level eight's room B button did. Pressed first, its
    //       5.5s run out while the bridge is fetched; pressed last, the run
    //       to the gate uses under 60% of it — finish.mjs's SPARE9 holds
    //       every run to that, including one that hesitates 0.9s after the
    //       press and hops for nothing on the way (56% of 5.5s). It was
    //       4.5s, which that sloppy run overran (68%); 5 still did (61%).
    //       The timer-first run in finish.mjs's 3i needs about 7.3s — at
    //       7.25 it still ends at the shut gate, at 7.5 it gets through —
    //       so 5.5 leaves room on both sides.
    //   C — level six reversed. A crate already on a plate holds the gate
    //       SHUT (its lamp is a ring: needs '!p'). Pushed right, off the
    //       plate, the crate drops into a trench exactly its depth and
    //       becomes floor. The trench (100 deep) is shallower than a jump
    //       (131), so a ball that falls in first always gets out, with the
    //       crate still there to push.
    //
    //       The trench is 120 wide, not the crate's own 100. A crate falls
    //       only once nothing at all is under it, and while it is pushed it
    //       is lifted up to CRATE.STEP_UP (6) onto whatever it meets; over a
    //       110 trench it crossed the 10-unit window in 0.07s, dropped 5,
    //       and was lifted straight onto the far side, leaving the ball in
    //       the trench and the plate empty but the crate hanging over the
    //       hole. 120 gives 0.13s and a 20 drop. The crate lands against the
    //       far wall, leaving a 19 slot on its left that a ball rolls over
    //       (at 130 the 29 slot caught a ball rolling slowly).
    //
    //       A low stone kerb, 12 tall, stands just left of the plate. The
    //       ball can hop over the crate and push it LEFT, and nothing else
    //       would stop it short of room B's gate, which is shut once its
    //       timer has run out: a crate flush against a gate can never be got
    //       behind again, and room C has no way to fail. A crate cannot climb
    //       more than STEP_UP, so the kerb stops it at 10000, still on the
    //       plate, and the ball can hop back over it and push it right. A
    //       ball rolls over the kerb from a run-up of a ball's width or
    //       more; stopped right against it, it has to hop. finish.mjs's 3k
    //       checks the kerb.
    id: 9,
    theme: 'hills',
    bounds: { w: 13000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 12760, y: 760 },

    ground: [
      [[40, 760], [2600, 760]],
      [[2800, 760], [8300, 760]],
      // Past room B's 420 gap, up to room C's trench.
      [[8720, 760], [10130, 760]],
      // Past the trench (10130-10250).
      [[10250, 760], [12960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 12960, y: 0, w: 40, h: 1080 },
      { x: 3600, y: 700, w: 200, h: 60 },
      // Room B's floating ledge.
      { x: 7400, y: 670, w: 300, h: 30 },
      // Room C's trench: stone either side under the ground, so nothing in
      // the trench can roll out underneath the ground's one-sided surface,
      // and a stone floor 100 down.
      { x: 10030, y: 760, w: 100, h: 320 },
      { x: 10130, y: 860, w: 120, h: 220 },
      { x: 10250, y: 760, w: 100, h: 320 },
      // Room C's kerb: a crate pushed left stops against it, on the plate.
      { x: 9960, y: 748, w: 40, h: 12 },
      // Room C's crate, resting on the plate from the start.
      { x: 10005, y: 660, w: 100, h: 100, movable: true },
    ],

    senders: [
      { id: 't1', kind: 'timer', x: 1400, y: 760, face: 'left', time: 3.5 },
      { id: 'b', kind: 'button', x: 7660, y: 670, face: 'left' },
      { id: 't2', kind: 'timer', x: 8000, y: 760, face: 'right', time: 5.5 },
      { id: 'p', kind: 'plate', x: 10000, y: 760, w: 110 },
    ],

    gates: [
      { x: 1800, y: 560, w: 40, h: 200, needs: ['t1'] },
      { x: 8850, y: 560, w: 40, h: 200, needs: ['t2'] },
      { x: 10500, y: 560, w: 40, h: 200, needs: ['!p'] },
    ],

    bridges: [
      { x: 8300, y: 760, w: 420, dir: 1, needs: ['b'] },
    ],

    platforms: [],

    enemies: [
      // Level eight's walker, at level eight's final x: room A and the
      // warm-up are the same shape, so the walker is met at the same time.
      // finish.mjs re-proves it here anyway.
      { kind: 'walker', x: 5075, y: 760 - CONFIG.ENEMY.WALKER.R, amplitude: 280 },
    ],

    checkpoints: [
      { x: 7000, y: 760 },
      { x: 9600, y: 760 },
    ],
  },
  {
    // Level ten: the charger. Stage: INTRODUCTION — see the roadmap and
    // docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md.
    // The one new idea: this one warns you, then runs at you. Jump the run,
    // and while it sits dazed, it is yours to stomp.
    //
    // A pen, entered over the recurring 60 stone step at 1400, with nothing
    // else in it that can hurt. The charger starts at 2100 facing left and
    // patrols towards a ball waiting inside the step; its first charge runs
    // into the step's stone face and ends dazed at 1486, a stomp away. Its
    // second, once it has turned and come back right, runs into the planks
    // at 2300 — 200 tall, which no jump clears — breaks them, and carries on
    // to the end of its range at 2800. The ball could break them too; nothing
    // depends on who does. Then level six's warm-up shape: a proven 200 gap
    // and the long stone step, to the flag.
    //
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
    // its patrol, so some arrival always meets it there. What defends the
    // child is the 0.8s crouch-and-paw, which is the charger's whole
    // contract, and the step he can watch it from — outside it nothing can
    // reach him, which is the step's other job. The cost is one of three
    // hearts, instantly undone.
    //
    // finish.mjs's route therefore waits outside the step while the charger
    // is patrolling towards it within 600 (PEN_GUARD) — a device of the
    // ROUTE, not a claim about the level. That number came from a scratch
    // sweep, not from anything finish.mjs runs: five leads, start delays
    // 0-25s every 0.25s (a whole patrol of the pen, 505 runs a value), guard
    // 0 to 900 — 400 still lost hearts, 500 and up none. What finish.mjs
    // runs is its usual three leads at start delays 0-4.5s, and for this
    // level it fails on any heart lost there, not only on a life.
    //
    // The charger's range end, 1486, is exactly where its box meets the
    // stone, and its patrol turns there on the range check first, so the
    // 60-tall step's corner never decides whether a second charge comes; in
    // every run of the route it came, and broke the planks. A ball that
    // sits on the dazed charger until its daze runs out takes a heart as it
    // wakes. No route here does that: finish.mjs's 3l stomps it at three
    // leads from a standing start and fails on a lost heart, and the same
    // scratch sweep of the stomp (five leads, delays 0-13s, 265 runs) always
    // landed before the daze ran out, and more so since DAZED became 3.5,
    // with no hit.
    id: 10,
    theme: 'hills',
    bounds: { w: 6000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 5700, y: 760 },

    ground: [
      [[40, 760], [3600, 760]],
      [[3800, 760], [5960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 5960, y: 0, w: 40, h: 1080 },
      // The pen's left end: the recurring low step, and the stone the first
      // charge stops against.
      { x: 1400, y: 700, w: 60, h: 60 },
      // The long stone step of the warm-up.
      { x: 4500, y: 700, w: 200, h: 60 },
    ],

    breakables: [
      { x: 2300, y: 560, w: 30, h: 200 },
    ],

    platforms: [],

    enemies: [
      { kind: 'charger', x: 2100, y: 760 - CONFIG.ENEMY.CHARGER.R, from: 1486, to: 2800, dir: -1 },
    ],

    // Two. 1150 is before the pen, out of the charger's sight (its range
    // starts at 1486 and it sees 240, so 1246 is the limit); 3300 is after
    // it, past the planks and past its sight too (the range ends at 2800).
    // The first keeps three hearts spent in the pen from costing the walk up
    // to it; the second keeps a death later in the level from making him do
    // the charger again.
    checkpoints: [
      { x: 1150, y: 760 },
      { x: 3300, y: 760 },
    ],
  },
  {
    // Level eleven: lure the charger. Stage: COMBINATION — the charger and
    // the wiring, both already taught. See the spec,
    // docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md.
    //
    // Both rooms are one shape: the charger lives in a closed pen under a
    // stone roof; the ball goes up a slope, across the roof, and drops into a
    // yard; the yard's far side is a stone wall with the door in it. On the
    // roof (ball at y 540, charger at 734) the ball is not on its level and
    // is not seen; in the yard it is. The ball can never get into a pen, so
    // the charger — the room's tool — can never be stomped out of the way;
    // and a yard cannot be climbed out of (the roof is 200 up, a jump 131),
    // which is safe only because the charger always comes round and sees him.
    //
    // Room A: planks, then button b's post, face left, towards the charger.
    // Stone fills the post up to the roof, and the gap between planks and
    // post is 30 — narrower than the ball — so the ball can reach neither the
    // cap nor the planks: only a charge can. Every x the ball can rest at in
    // the yard (3110-3180) is within SEE (240) of where the planks stop the
    // charger (2974). Its range runs on to 3034, flush with the post, so a
    // charge through the planks ends against it, pressing b, not short.
    //
    // Room B: the charge ends against the pen's end wall, on plate p, and the
    // door is open for as long as it sits there dazed. The yard is wider than
    // room A's, and its charger is given 320 of sight rather than the usual
    // 240 so that the whole of it is covered: the furthest a ball can rest
    // from where the charge ends (5734) is the door itself, 286. So there is
    // no spot in the yard where standing still stops working — miss the door,
    // wait where you are, and the charger comes round, sees you there and
    // charges again. What is timed is only the dash to the door while the
    // plate is held down, and finish.mjs's 2c measures that.
    //
    // Every position the suites measure is the paper layout, and finish.mjs
    // let it stand. The only numbers changed since are the two pen floors,
    // extended 40 left under their walls (1840 to 1800, 4740 to 4700) to mend
    // a crack drawn below each wall; finish.mjs and levels.mjs reported the
    // same results before and after. What finish.mjs runs is its usual three
    // leads at start delays 0-4.5s, and from both checkpoints: every run
    // finished, none lost a heart (this level is in its COUNTS_HEARTS, so one
    // would fail it), and the slowest got through room B's door in 48% of the
    // daze, under 2c's 60% — the lead-1.3 thumb that hesitates 0.9s and hops
    // once (1.69s); one that does not hesitate uses 18% (0.63s). The time
    // does not depend on the delay at all, since every charge ends at 5734.
    // 3m shows the ball alone, coming to every spot in the yard from either
    // side and rolling or jumping each way, never presses b or breaks the
    // planks; 3n that a ball which misses the door, then rests against it and
    // steers nothing at all, is found where it stands and gets through on the
    // second daze — 15.6s of it, on the run the suite prints. A scratch
    // sweep, not run there (five leads 0.7-1.3, delays 0-25s every 0.25s —
    // longer than a whole patrol of either pen, 505 runs, plus both
    // checkpoints), found the same: no heart lost, worst 56%. That sweep was
    // run on 2026-09-19, under the 3s daze and this charger's old sight of
    // 240, so its percentage is evidence about a slightly earlier level; its
    // heart claim is not, and stands whatever those two are. It cannot be
    // otherwise for the hearts: each charger is shut in its pen and the ball
    // never gets in, so the route needs no `dodge`. There are no crates here,
    // so no dead-end check of one. 2c's margin was the one thin number: 56%
    // of a 3s daze against a 60% limit. It was mended on 2026-09-20 by
    // raising DAZED to 3.5, not by moving the door. Pulling the door left was
    // the old note's first suggestion, from when a ball resting at it had to
    // stay OUT of the charger's sight; since that charger was given 320, room
    // B depends on exactly the opposite, and shortening the dash now shortens
    // the only timed thing in the room. What is bounded is the other
    // direction: a resting ball sits at 6020 and sight reaches 6054, so the
    // door has 34 units of room to the RIGHT before the lure stops working —
    // the same 34 the charger's own entry gives, and 3n's check.
    id: 11,
    theme: 'hills',
    bounds: { w: 7000, h: 1080 },
    spawn: { x: 200, y: 560 },
    goal: { x: 6700, y: 760 },

    ground: [
      // Up the slope to room A's roof.
      [[40, 760], [1500, 760], [1800, 560]],
      // Room A's pen floor, its yard, and on to the proven 200 gap. It
      // starts under the pen's left wall, not beside it: starting at the
      // wall's inner face left a 40-wide hole in the ground's fill below the
      // wall, drawn as a crack running down to the bottom of the screen.
      [[1800, 760], [3700, 760]],
      // Past the gap, up to room B's roof.
      [[3900, 760], [4400, 760], [4700, 560]],
      // Room B's pen floor, its yard, and on to the flag. Under its wall,
      // like room A's.
      [[4700, 760], [6960, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 6960, y: 0, w: 40, h: 1080 },
      // Room A: the pen's left wall, its roof, and the stone over the
      // button's post up to the roof.
      { x: 1800, y: 600, w: 40, h: 160 },
      { x: 1800, y: 560, w: 1290, h: 40 },
      { x: 3060, y: 600, w: 30, h: 110 },
      // Room A's door wall, above its gate.
      { x: 3200, y: 0, w: 40, h: 560 },
      // Room B: the pen's left wall, its roof, and its end wall.
      { x: 4700, y: 600, w: 40, h: 160 },
      { x: 4700, y: 560, w: 1100, h: 40 },
      { x: 5760, y: 600, w: 40, h: 160 },
      // Room B's door wall, above its gate.
      { x: 6040, y: 0, w: 40, h: 560 },
    ],

    breakables: [
      { x: 3000, y: 600, w: 30, h: 160 },
    ],

    senders: [
      { id: 'b', kind: 'button', x: 3060, y: 760, face: 'left' },
      { id: 'p', kind: 'plate', x: 5650, y: 760, w: 110 },
    ],

    gates: [
      { x: 3200, y: 560, w: 40, h: 200, needs: ['b'] },
      { x: 6040, y: 560, w: 40, h: 200, needs: ['p'] },
    ],

    bridges: [],
    platforms: [],

    enemies: [
      { kind: 'charger', x: 2600, y: 760 - CONFIG.ENEMY.CHARGER.R, from: 1866, to: 3034, dir: 1 },
      // Sees 320 rather than the usual 240, which covers the whole yard: a ball
      // resting at the door sits at 6020, 286 past where the charge ends (5734),
      // and sight reaches 6054 — 34 of slack, so moving the door right undoes
      // this. finish.mjs's 3n is the check. Room A needs none: its yard is 70
      // wide and every spot in it is already in sight.
      { kind: 'charger', x: 5200, y: 760 - CONFIG.ENEMY.CHARGER.R, from: 4766, to: 5734, dir: 1, see: 320 },
    ],

    checkpoints: [
      { x: 1200, y: 760 },
      { x: 4000, y: 760 },
    ],
  },
  {
    // Level twelve: the shell. Stage: INTRODUCTION. See the spec,
    // docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md.
    //
    // Room A, "it can't be stomped, but its weight is useful". The shell
    // patrols a pen under a stone roof, which is the path: the ball walks
    // over it and can never touch it. Plate p, at the pen's far end, holds
    // the door open while the shell stands on it, so the lesson is to wait on
    // the roof for it to walk onto the plate, then go. Its patrol is 15s
    // (from config.js: 2 x 600 / PATROL_SPEED 80), the plate held for 5.66s
    // of it, and the slowest run used 26% of that between the plate going
    // down and the ball being through (printed by finish.mjs 2d; the route
    // goes only on a fresh press, so arriving at the end of a window is not
    // what is timed). 3o shows the door never opens in 45s with the shell's
    // range cut short of the plate.
    //
    // Room B, "drop a crate on it". A corridor 85 high (corridor floor 760,
    // roof underside 675), under the 92 a ball needs to jump a shell (ball
    // 40 + shell 52, from config.js), is the only way on, and its shell
    // patrols it. The ball comes up onto the crate's flat and shoves the
    // crate into hole 1 (4000-4080). Hole 2 (4120-4200) is his way down, and
    // the tall wall just past it stops him walking the roof instead. The
    // crate flips a shell under it (falling 53 to the shell's top, it is
    // doing about 480, over FLIP_VY's 250: from config.js); he jumps hole 1,
    // drops through hole 2 onto the flipped shell, stomps it, and runs the
    // corridor while it is gone.
    //
    // Hole 1 is 80 and not the 70 first worked out by hand. Held right, the
    // ball shoves the crate on while it falls, and at 70 its far side met
    // the stone after about 8 steps, fallen about 5 — under STEP_UP's 6 — so
    // the crate was lifted back up onto the stone between the holes and lay
    // there across hole 1 (simulated, finish.mjs's route on the paper
    // layout). At 80 it has fallen about 20 when it meets that face, which
    // stops it, and it drops. So a crate always lands at 4000-4020, its
    // middle at most 4050; the shell's `from`, 4052, is past that, so a flip
    // always kicks the shell right, towards hole 2 (simulated: every flip in
    // a sweep of the arrival time kicked it right). The window to land on it
    // is about 1.15s a patrol (from config.js and this geometry, by hand),
    // out of a 12.7s patrol (from config.js: 2 x 508 / 80): finish.mjs 3o
    // shoves the crate in at every 0.25s of a patrol, and 5 of the 51 flip
    // it (printed by finish.mjs 3o), which is a window of 1.25s at that
    // spacing. finish.mjs's route aims at the shell's turn at `from` and is
    // up to 0.3s off either way.
    //
    // A crate that misses lands in the corridor under hole 1, where it stays
    // until the ball moves it: wait on the roof for the shell to walk away
    // past hole 2, drop in through hole 2, shove the crate left into the pit
    // at the corridor's closed left end (3920-4000, roofed over), and it falls
    // out of the level and goes home to the roof; jump back out of hole 1.
    // That is the user's option A, with the pit at the corridor's closed end
    // rather than its open one: a crate under hole 1 is left of the shell,
    // and shoving it right would bulldoze the shell along ahead of it (a
    // crate is not stopped by enemies) and out of its range. The pit's edge
    // is hole 1's left edge, so the ball can never get left of a crate in the
    // corridor, and cannot push it right at all. Every get-back in 3o used at
    // most 38% of the time before the shell came back to hole 1 (printed by
    // finish.mjs 3o), and none lost a heart. A ball that follows the crate
    // into hole 1 stands on it, out of the shell's reach (its top is 8 above
    // the shell's), and jumps out. The crate cannot be shoved left off the
    // flat either: the plateau's end, 20 higher, stops it, and a ball on the
    // plateau can still push it from there (3o).
    //
    // Known, and left: a ball that drops into the corridor beside an upright
    // shell can take two hits and run on through it while it cannot be hit
    // again, as with any enemy. 3o's own tries do it. It costs two of three
    // hearts, and the stomp is what this room teaches, not a wall.
    //
    // Checkpoints: 1500, before room A's roof, and 3300, after its door and
    // before room B's slope — out of reach of both shells (one is in a pen,
    // the other in the corridor). Sections 1 and 2 of finish.mjs run three
    // leads at start delays 0-4.5s and from both checkpoints: every run
    // finished, none lost a heart (this level is in COUNTS_HEARTS), slowest
    // 25.9s (printed by finish.mjs 1).
    id: 12,
    theme: 'hills',
    bounds: { w: 5400, h: 1080 },
    spawn: { x: 200, y: 700 },
    goal: { x: 5150, y: 760 },

    ground: [
      [[40, 760], [1800, 760]],
      // Room A's pen floor, running under both its walls.
      [[1800, 900], [3000, 900]],
      // Room A's yard, then up to room B's plateau.
      [[3000, 760], [3400, 760], [3650, 635], [3720, 635]],
      // The crate's flat, 20 below the plateau; it ends at the pit.
      [[3720, 655], [3920, 655]],
      // The corridor's floor, past the pit, and on to the flag.
      [[4000, 760], [5360, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 5360, y: 0, w: 40, h: 1080 },
      // Room A: the roof he walks along, flush with the ground, and the
      // pen's two walls under it.
      { x: 1800, y: 760, w: 1200, h: 20 },
      { x: 1800, y: 780, w: 40, h: 120 },
      { x: 2960, y: 780, w: 40, h: 120 },
      // Room A's door wall, above its gate.
      { x: 3200, y: 0, w: 40, h: 560 },
      // Room B: the corridor's roof. Over the pit; hole 1 (4000-4080); the
      // stone between the holes; hole 2 (4120-4200); the tall wall, which is
      // roof too; then roof on to the corridor's open end at 4660.
      { x: 3920, y: 655, w: 80, h: 20 },
      { x: 4080, y: 655, w: 40, h: 20 },
      { x: 4200, y: 0, w: 40, h: 675 },
      { x: 4240, y: 655, w: 420, h: 20 },
      // The crate.
      { x: 3780, y: 595, w: 60, h: 60, movable: true },
    ],

    senders: [
      { id: 'p', kind: 'plate', x: 2700, y: 900, w: 220 },
    ],

    gates: [
      { x: 3200, y: 560, w: 40, h: 200, needs: ['p'] },
    ],

    bridges: [],
    platforms: [],

    enemies: [
      { kind: 'shell', x: 2500, y: 900 - CONFIG.ENEMY.SHELL.R, from: 2300, to: 2900, dir: 1 },
      { kind: 'shell', x: 4300, y: 760 - CONFIG.ENEMY.SHELL.R, from: 4052, to: 4560, dir: 1 },
    ],

    checkpoints: [
      { x: 1500, y: 760 },
      { x: 3300, y: 760 },
    ],
  },
  {
    // Level thirteen: the aimed popper. Stage: INTRODUCTION. See the spec,
    // docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md.
    //
    // Three rooms in a line, each one popper facing right from a perch at
    // its left, a checkpoint (or the spawn) before each perch. Every popper
    // is out of the ball's reach. A popped popper never comes back, and in
    // rooms B and C it is the room's only tool, so stomping it would leave
    // the room with no way through. The perch is 140 over the floor and a
    // post at each end tops out at 170. A jump lifts the ball's centre to 151
    // (from config.js: BALL.R 20 + the 131 a jump clears), and a ball that
    // meets a stone corner lower than its centre is lifted onto it. Before
    // the posts, finish.mjs 3p's tries found a ball climbing a bare 140
    // perch that way. The posts sit below the lob's launch point, so they
    // never catch a lob.
    //
    // The floor dips 40 under each perch. A popper's centre is 164 over the
    // floor and a ball's is 20, so 144 apart, under LEVEL_TOL's 160
    // (config.js). In the dip they are 184 apart and the popper cannot see
    // him. It first sees him partway up the dip's far side, 92 in front of
    // it (printed by finish.mjs 2e), so its first lock is out in the room
    // and not under its own perch.
    //
    // Room A, "it aims where you were": open floor and nothing to press. The
    // route never stops, and the lob lands where he was long after he has
    // gone. In every run from the spawn, popper A locked on the running ball
    // and its lob came down within 0.7 of where it aimed (printed by
    // finish.mjs 2e), and none cost a heart. A ball that stops halfway into
    // its range loses one heart there (finish.mjs 3q).
    //
    // A deliberate deviation from the spec, which has him walk in over open
    // floor and see the arc before he steps on. Here he comes in from behind
    // each popper, under its perch, because a popper only aims forward and
    // each one's checkpoint has to sit behind it, out of reach. Coming in
    // from the front would mean a room he enters already in range, or a
    // popper he has to get past some other way, and a perch reachable from
    // that side is one he can stomp the popper from. What he does see first
    // is the arc: the first lock is 92 out in the room, and the dotted arc
    // is drawn there for AIM's whole second before anything flies.
    //
    // Room B, "make it hit the button": button b's post is held out 70 from
    // the door by a stone bracket, its cap facing the popper, 185-231 over
    // the floor. A jump's top reaches 171 (config.js), so only a lob reaches
    // it. The lob comes down steeply, about 4.5 down for every 1 forward at
    // the end (simulated, see poppers.mjs 4a), so a cap on a post standing on
    // the floor is hit only on its top, which presses nothing. Up on the
    // bracket, the lob locked on a ball resting under it at the door meets
    // the cap's face over his head. Anywhere from 2030 to 2080 works with no
    // heart lost (50 wide, printed by finish.mjs 3p). Further left, the lob
    // misses the cap and comes down on him.
    //
    // Room C, "make it break the planks": a porch roof 140-175 over the floor
    // covers the foot of a 110 step. Under it the ball's top cannot rise past
    // 140, so its bottom stays below 100, short of the step. The roof's stone
    // left end keeps a running jump off the planks' face, and the roof is
    // too thick to climb onto. The lob locked on a ball resting at the step
    // comes down on the planks and breaks them. Anywhere from 2705 to 2780
    // works with no heart lost (75 wide, printed by finish.mjs 3p). Then he
    // jumps up the step.
    //
    // 3p also shows that without the poppers no ball gets through either
    // room, or up beside a popper, from any spot coming either way, rolling
    // or jumping (240 and 200 runs), and none gets up beside room A's popper
    // either (312 runs, from 400 behind it). Two broken copies do get through: the
    // button lowered 60, and the porch with no stone end and a flat run-up.
    //
    // Ranges: room A's is config.js's 360. Rooms B and C use 280, since
    // their waiting spots are 220 in front of their poppers. Each checkpoint
    // is out of reach of every popper (levels.mjs). The waiting spots were
    // 280 away on paper. Moved to 220 after LOOKing at 568x320: at 280, a
    // waiting ball's popper sat under the hearts.
    //
    // Known, and left: at 740x280 a ball waiting at room B's door has the cap
    // at the very top of the screen, half cut off. The cap has to sit above a
    // jump, and that screen shows about 200 over the ball. The wire from the
    // door and the dotted arc both lead up to it.
    //
    // Sections 1 and 2 of finish.mjs run three leads at start delays 0-4.5s
    // and from both checkpoints. Every run finished and none lost a heart
    // (this level is in COUNTS_HEARTS), slowest 20.1s (printed by
    // finish.mjs 1).
    id: 13,
    theme: 'hills',
    bounds: { w: 3400, h: 1080 },
    spawn: { x: 200, y: 700 },
    goal: { x: 3200, y: 650 },

    ground: [
      // One floor at 760, dipping 40 under each popper's perch, so a ball
      // passing beneath is too far below it to be seen (LEVEL_TOL) and the
      // first spot it locks is out in its room, not under its own feet.
      [[40, 760], [600, 760], [660, 800], [760, 800], [820, 760],
       [1760, 760], [1820, 800], [1920, 800], [1980, 760],
       [2460, 760], [2520, 800], [2620, 800], [2680, 760], [3360, 760]],
    ],

    boxes: [
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 3360, y: 0, w: 40, h: 1080 },
      // Each popper's perch, and a post at each end of it.
      { x: 660, y: 620, w: 80, h: 20 },
      { x: 660, y: 590, w: 10, h: 30 },
      { x: 730, y: 590, w: 10, h: 30 },
      { x: 1820, y: 620, w: 80, h: 20 },
      { x: 1820, y: 590, w: 10, h: 30 },
      { x: 1890, y: 590, w: 10, h: 30 },
      { x: 2520, y: 620, w: 80, h: 20 },
      { x: 2520, y: 590, w: 10, h: 30 },
      { x: 2590, y: 590, w: 10, h: 30 },
      // Room B: the door wall above the gate, and the stone bracket that
      // holds button b's post out from it, 185 over the floor.
      { x: 2100, y: 0, w: 40, h: 575 },
      { x: 2060, y: 525, w: 40, h: 50 },
      // Room C: the step up to the flag, 110 high, and the stone end of the
      // porch roof in front of it, which keeps a jump off the planks' face.
      { x: 2800, y: 650, w: 560, h: 110 },
      { x: 2650, y: 585, w: 40, h: 35 },
    ],

    breakables: [
      // Room C's porch roof.
      { x: 2690, y: 585, w: 110, h: 35 },
    ],

    senders: [
      { id: 'b', kind: 'button', x: 2030, y: 575, face: 'left' },
    ],

    gates: [
      { x: 2100, y: 575, w: 40, h: 185, needs: ['b'] },
    ],

    bridges: [],
    platforms: [],

    enemies: [
      { kind: 'popper', x: 700, y: 620 - CONFIG.ENEMY.POPPER.R, dir: 1, range: 360 },
      { kind: 'popper', x: 1860, y: 620 - CONFIG.ENEMY.POPPER.R, dir: 1, range: 280 },
      { kind: 'popper', x: 2560, y: 620 - CONFIG.ENEMY.POPPER.R, dir: 1, range: 280 },
    ],

    checkpoints: [
      { x: 1500, y: 760 },
      { x: 2300, y: 760 },
    ],
  },
];

/**
 * A moving platform.
 *
 * Driven by a sine of level TIME rather than by integrated velocity, which buys
 * two things worth having: the level looks identical on every attempt, so a
 * player learns the timing instead of re-reading it; and a test can assert
 * where a platform is at time t without running the game.
 */
function makeMover(p) {
  const m = {
    ...p,
    x: p.x, y: p.y,
    dx: 0, dy: 0,     // how far it moved this step, so a rider comes along
    vx: 0, vy: 0,     // how fast it is going, so a jump off it carries
    segments: [],

    update(t) {
      const a = (t / p.period + (p.phase || 0)) * Math.PI * 2;
      const off = Math.sin(a) * p.dist;
      const nx = p.x + (p.axis === 'x' ? off : 0);
      const ny = p.y + (p.axis === 'y' ? off : 0);
      m.dx = nx - m.x; m.dy = ny - m.y;
      m.x = nx; m.y = ny;

      // The exact derivative of the sine above, not a difference divided by dt:
      // a ball jumping off should carry the speed the platform actually has.
      // Without this half, jumping off a moving platform feels broken in a way
      // players notice and cannot name.
      const v = Math.cos(a) * p.dist * (Math.PI * 2 / p.period);
      m.vx = p.axis === 'x' ? v : 0;
      m.vy = p.axis === 'y' ? v : 0;

      m.segments = boxSegments(m.x, m.y, p.w, p.h);
      // So a contact can be traced back to the platform that made it, which is
      // how the ball knows what it is riding.
      for (const s of m.segments) s.owner = m;
    },

    overlaps(x, y, r) {
      return x + r > m.x && x - r < m.x + p.w && y + r > m.y && y - r < m.y + p.h;
    },
  };
  m.update(0);
  // update(0) reports a delta from the platform's declared position to its
  // position at t=0, which is not movement anybody rode.
  m.dx = 0; m.dy = 0;
  return m;
}

/**
 * A gate: a solid box like a wall, except its position slides straight up
 * to clear a passage while it is powered, and back down when it isn't.
 * `g.y`/`g.h` are the CLOSED position and height — the same "y is the top,
 * h reaches down to the ground" convention a plain stone wall already uses —
 * and `gate.y` is where it is RIGHT NOW, sliding from `g.y` (closed) up to
 * `g.y - g.h` (fully open, its old footprint entirely clear).
 *
 * `g.needs` is what powers it — see circuits.js. A closing gate never comes
 * down onto anything: while `blocked`, it holds where it is and finishes
 * closing once the way is clear. A timer can run out with the ball halfway
 * through, and a door that lands on him is not a door he trusts again.
 *
 * Owes the same four carrier fields a crate or a moving platform does: its
 * top is something the ball could be standing on while it swings, and a
 * rider with no dx/dy/vx/vy to add is exactly the NaN bug CLAUDE.md already
 * warns about.
 */
function makeGate(g) {
  const gate = {
    ...g,
    kind: 'gate',
    x: g.x, y: g.y,
    // Where the closed gate stands. Its lamps' signal pole is planted here
    // and stays put while the gate slides up.
    foot: g.y + g.h,
    openT: 0,          // 0 closed, 1 fully open
    dx: 0, dy: 0,
    vx: 0, vy: 0,
    segments: [],

    update(dt, isPowered, blocked) {
      const wasY = gate.y;
      const target = isPowered ? 1 : (blocked ? gate.openT : 0);
      gate.openT = rampToward(gate.openT, target, dt, 1 / CONFIG.GATE.OPEN_TIME);
      const ny = g.y - g.h * gate.openT;
      gate.dy = ny - wasY;
      gate.vy = dt > 0 ? gate.dy / dt : 0;
      gate.y = ny;
      gate.segments = boxSegments(gate.x, gate.y, g.w, g.h);
      // So a contact can be traced back to the gate that made it, the same
      // mechanism movers and crates already use.
      for (const s of gate.segments) s.owner = gate;
    },

    /**
     * Is this presser box standing in the gate's CLOSED footprint? Inset by
     * 2 units either side, so a ball or crate merely resting against the
     * gate's face — flush, give or take floating-point dust — is not "under"
     * it and cannot hold a half-open gate open by leaning.
     */
    isUnder(p) {
      return p.x < g.x + g.w - 2 && p.x + p.w > g.x + 2 && p.y < g.y + g.h && p.y + p.h > g.y;
    },

    overlaps(x, y, r) {
      return x + r > gate.x && x - r < gate.x + g.w && y + r > gate.y && y - r < gate.y + g.h;
    },
  };
  gate.update(0, false, false);
  // update(0, ...) reports a delta from the gate's declared position to its
  // position at t=0, which is not movement anybody rode.
  gate.dy = 0; gate.vy = 0;
  return gate;
}

/**
 * A bridge: a stone slab that slides out of the ground's edge across a gap
 * while powered, and back in when not. `x, y` is the edge it slides from,
 * `dir` which way (1 right, -1 left), `w` how far.
 *
 * Only its TOP is solid — one segment, authored left to right like ground so
 * its solid side is up, and colinear with the ground it slides from, so
 * rolling on is exactly as smooth as rolling along. A box would put a
 * vertical face at the joint for the ball to catch on.
 *
 * It does not carry what stands on it: the slab slides out from under, it
 * does not drag the ball along, so `dx`/`vx` stay 0. It still owes all four
 * carrier fields, because the ball records it as its platform, and
 * player.js adds `platform.dx` without asking — the crate NaN bug in
 * CLAUDE.md.
 *
 * `warn` is set by Level.update when a timer it needs is about to run out;
 * only drawing reads it.
 */
function makeBridge(d) {
  // Bad data fails loudly, the way makeSender does: a bridge with no width or
  // a direction that is neither way would load as no bridge at all, and a
  // level that cannot be crossed says nothing about why.
  const dir = d.dir === undefined ? 1 : d.dir;
  if (!(d.w > 0)) throw new Error(`bridge at (${d.x}, ${d.y}) has no positive width`);
  if (dir !== 1 && dir !== -1) throw new Error(`bridge at (${d.x}, ${d.y}) has dir ${d.dir}, not 1 or -1`);
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) throw new Error(`bridge has no finite x/y (${d.x}, ${d.y})`);
  const br = {
    kind: 'bridge',
    x: d.x, y: d.y, w: d.w, dir,
    needs: d.needs || [],
    openT: 0,
    warn: false,
    dx: 0, dy: 0, vx: 0, vy: 0,
    segments: [],

    /** The slab's current reach, as [left, right]. */
    span() {
      const ext = d.w * br.openT;
      return dir > 0 ? [d.x, d.x + ext] : [d.x - ext, d.x];
    },

    update(dt, isPowered) {
      br.openT = rampToward(br.openT, isPowered ? 1 : 0, dt, 1 / CONFIG.BRIDGE.OPEN_TIME);
      const [lo, hi] = br.span();
      br.segments = hi - lo > 1 ? [segment(lo, d.y, hi, d.y)] : [];
      for (const s of br.segments) s.owner = br;
    },

    overlaps(x, y, r) {
      const [lo, hi] = br.span();
      return hi - lo > 1 && x + r > lo && x - r < hi && y + r > d.y - 1 && y - r < d.y + 1;
    },
  };
  br.update(0, false);
  return br;
}

/**
 * A plank wall: a solid box until it is broken, then nothing at all.
 *
 * `segments` is emptied rather than the object removed, so the level's own
 * list, and anything a test holds, keeps pointing at the same thing. It owes
 * dx/dy/vx/vy because the ball can land on top of it, and player.js adds a
 * carrier's `dx` without asking — the crate NaN bug in CLAUDE.md.
 *
 * `cracked` is permanent once knocked and only ever drawn; `wobbleT` counts
 * down in `Level.update` the way a pad's `squashT` does.
 */
function makeBreakable(d) {
  const b = {
    x: d.x, y: d.y, w: d.w, h: d.h,
    breakable: true,
    broken: false,
    cracked: false,
    wobbleT: 0,
    dx: 0, dy: 0, vx: 0, vy: 0,
    segments: boxSegments(d.x, d.y, d.w, d.h),

    bump() {
      b.cracked = true;
      b.wobbleT = CONFIG.BREAKABLE.WOBBLE_TIME;
    },

    overlaps(x, y, r) {
      return !b.broken && x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h;
    },
  };
  for (const s of b.segments) s.owner = b;
  return b;
}

/**
 * A balance beam: a plank that pivots about a fixed fulcrum, tilting toward
 * whichever end carries more weight. Only a crate weighs it down — never the
 * ball — the same rule the pressure switch already follows, so the puzzle is
 * always about where the crate ends up, not about standing somewhere.
 *
 * Unlike a gate or a mover, which only ever translate, a beam ROTATES: its
 * two endpoints are recomputed from its current angle every step, the same
 * way a gate rebuilds its box from its current height. Nothing riding it
 * needs any special carrying code for that: a crate's resting height is
 * already recalculated fresh every step from whatever segment is under it —
 * `Level.update` (see levels.js) decides which crates weigh a beam down with
 * a plain horizontal check, nothing here or in `makeCrate` — so it simply
 * rides the beam's changing surface at its own fixed x, the same way it
 * already rides any other changing floor. The ball needs none either —
 * standing on a surface that is rising into it is already handled by
 * ordinary contact resolution in physics.js, the same as standing at the
 * foot of a slope that is itself slowly rising. See this plan's own
 * "Important deviation from the approved spec" note for the full reasoning,
 * including why it still carries the same four carrier fields every other
 * carrier does (`dx`/`dy`/`vx`/`vy`, all permanently zero here rather than a
 * translation) — `player.js` reads `platform.dx`/`.dy` unconditionally the
 * moment the ball is standing on anything, and their absence is the exact
 * NaN bug CLAUDE.md already warns about.
 */
function makeBeam(b) {
  const beam = {
    ...b,               // x, y (fulcrum), halfLength, minAngle, maxAngle
    angle: b.minAngle,
    ax: 0, ay: 0, bx: 0, by: 0,
    dx: 0, dy: 0, vx: 0, vy: 0,
    segments: [],

    _reseg() {
      const dirX = Math.cos(beam.angle), dirY = Math.sin(beam.angle);
      beam.ax = b.x - b.halfLength * dirX;
      beam.ay = b.y - b.halfLength * dirY;
      beam.bx = b.x + b.halfLength * dirX;
      beam.by = b.y + b.halfLength * dirY;
      beam.segments = [segment(beam.ax, beam.ay, beam.bx, beam.by)];
      for (const s of beam.segments) s.owner = beam;
    },

    /**
     * Ease the angle toward wherever this step's torque points it, and
     * rebuild the segment from the result. `torque` is the sum, over every
     * crate currently resting on this beam, of how far past the fulcrum
     * (world x, positive toward the far/exit end) its centre sits — see
     * `Level.update`, the only caller and the only place that knows which
     * crates are resting on which beam.
     */
    update(dt, torque) {
      const raw = b.minAngle + torque * CONFIG.BEAM.ANGLE_PER_OFFSET;
      const target = Math.min(b.maxAngle, Math.max(b.minAngle, raw));
      beam.angle = rampToward(beam.angle, target, dt, 1 / CONFIG.BEAM.SWING_TIME);
      beam._reseg();
    },

    overlaps(x, y, r) {
      const minX = Math.min(beam.ax, beam.bx) - r, maxX = Math.max(beam.ax, beam.bx) + r;
      const minY = Math.min(beam.ay, beam.by) - r, maxY = Math.max(beam.ay, beam.by) + r;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    },
  };
  beam._reseg();
  return beam;
}

/**
 * A wooden crate: solid, standable, and pushable.
 *
 * It exists so there is a way to reach somewhere the jump alone will not — put
 * a crate under a high ledge and jump off it. Wood gives way and stone never
 * does — a crate by sliding, a plank wall by breaking — and nothing that gives
 * way is any other colour, so the rule is legible without a word of explanation.
 *
 * Deliberately NOT a general rigid body. It moves horizontally only when
 * something pushes it, and vertically only by falling straight down onto
 * whatever is beneath it. A crate that could tumble, spin, or slide down a
 * slope of its own accord would be more realistic and much worse: the one
 * genuinely bad outcome here is a crate ending up somewhere that makes the
 * level impossible, and a crate that only goes where it is pushed cannot do
 * that by itself.
 */
function makeCrate(b) {
  const c = {
    ...b,
    x: b.x, y: b.y,
    movable: true,       // what player.js looks for before pushing
    grounded: false,
    falls: 0,            // times it has been shoved out of the level
    segments: [],

    // A crate is something the ball can STAND on, which makes it a carrier in
    // exactly the way a moving platform is, and it has to answer the same four
    // questions or it cannot be stood on safely: how far it moved this step, so
    // a rider comes with it, and how fast it is going, so a jump off it
    // carries. Leaving these off is not a missing nicety — `player.js` adds
    // `platform.dx` to the ball's position unconditionally, so an absent `dx`
    // is `undefined`, the ball's position becomes NaN on the first frame it
    // stands on a crate, and the ball simply disappears from the level with
    // nothing logged anywhere.
    dx: 0, dy: 0,
    vx: 0, vy: 0,

    /** Rebuild the colliders, and tag them so a contact leads back here. */
    _reseg() {
      c.segments = boxSegments(c.x, c.y, b.w, b.h);
      for (const s of c.segments) s.owner = c;
    },

    /**
     * Fall, and land.
     *
     * `solids` is everything that could hold this crate up — the level's static
     * geometry and the other crates, but never this crate itself, or it would
     * rest on its own floor and hang in the air for ever.
     */
    update(dt, solids, cfg, boundsH) {
      // A fresh step: whatever it was shoved by last step is spent. Any push
      // this step happens later, during the ball's update, and is carried by a
      // rider on the step after — the same one-step lag a moving platform's
      // rider already lives with.
      const wasY = c.y;
      c.dx = 0;
      c.vx = 0;

      c.vy += cfg.GRAVITY * dt;
      c.y += c.vy * dt;

      const floor = supportUnder(c.x, b.w, c.y, b.h, solids, cfg);
      if (floor < Infinity && c.y + b.h > floor) {
        c.y = floor - b.h;
        c.vy = 0;
        c.grounded = true;
      } else {
        c.grounded = false;
      }

      // Fell out of the level: put it back where the level put it.
      //
      // A crate can be shoved off a ledge, and a crate with nothing under it
      // falls for ever. Without this it is simply gone — and the day a level
      // needs a crate to be finishable, "gone" means a child has permanently
      // broken his own game with no way to undo it and no way to know why. The
      // ball is handed the level back when it falls; so is the crate.
      if (c.y > boundsH) {
        c.x = b.x; c.y = b.y;
        c.vy = 0;
        c.falls++;
        // No rider delta for a respawn. `dy` means "how far the lid moved, so
        // bring whoever is standing on it" — reporting the whole trip back up
        // the level would teleport the ball with it.
        c.dy = 0;
        c._reseg();
        return;
      }

      // What a rider on the lid should be moved by. This is the case that
      // matters: a crate shoved off a ledge with the ball on top takes the ball
      // down with it instead of leaving it hanging in the air.
      c.dy = c.y - wasY;
      c._reseg();
    },

    /**
     * Try to slide by dx. Returns how far it actually went.
     *
     * Refused outright if the crate would end up inside something. A crate is
     * pushed by a ball with no idea what is on the far side of it, so this is
     * the only thing standing between a child and a crate shoved through the
     * level's boundary wall.
     *
     * The exception is a small rise, STEP_UP: the foot of a slope lifts the
     * crate a little rather than stopping it, so a crate can be walked up a
     * ramp but is still stopped dead by anything wall-shaped.
     */
    tryPush(dx, dt, solids, cfg) {
      const nx = c.x + dx;

      // Inset VERTICALLY only, and that asymmetry is the whole point. The
      // inset exists because a crate resting on the ground genuinely touches
      // the ground segment, and counting that as blocked would report every
      // crate everywhere as stuck. But inset horizontally too and the crate
      // may overlap a wall by the width of the inset before anything objects —
      // which showed up as a crate sitting 1.2px inside the level's boundary.
      // Nothing about the ground needs slack sideways.
      const IN = 1.5;
      const clear = (atX, atY) => {
        for (const s of solids) {
          if (segmentHitsBox(s, atX, atY + IN, b.w, b.h - IN * 2)) return false;
        }
        return true;
      };

      if (!clear(nx, c.y)) {
        // Perhaps it is only a step up rather than a wall. Try again lifted;
        // this is what lets a crate ride up the foot of a slope while still
        // being stopped dead by anything wall-shaped.
        const lifted = c.y - cfg.CRATE.STEP_UP;
        if (!clear(nx, lifted)) return 0;
        c.y = lifted;
      }

      c.x = nx;
      c.dx += dx;
      c.vx = dx / dt;
      c._reseg();
      return dx;
    },

    overlaps(x, y, r) {
      return x + r > c.x && x - r < c.x + b.w && y + r > c.y && y - r < c.y + b.h;
    },
  };
  c._reseg();
  return c;
}

class Level {
  constructor(data) {
    this.data = data;
    this.bounds = data.bounds;
    this.spawn = { ...data.spawn };
    this.goal = data.goal ? { ...data.goal } : null;
    this.theme = data.theme;
    this.time = 0;

    const segs = [];

    // Bounce pads sit flush with the ground they stand on — `y` is the same
    // ground-anchor convention checkpoints and spikes already use — and the
    // pad's own solid box extends DOWN from it, into the ground, not up.
    // Rolling onto one is exactly as smooth as rolling onto ordinary ground:
    // no step, no jump needed to reach it. Only the top is ever reachable;
    // the rest is buried under the ground it sits on. Tagged with the pad
    // itself as `owner`, the same mechanism movers and crates already use,
    // which is how player.js tells "this contact is a pad" from an
    // ordinary wall.
    //
    // Built BEFORE the ground below, and not after it alongside the walls,
    // because a pad is authored flush with the ground polyline that runs
    // under it — the two are exactly colinear where the pad sits, not just
    // touching. `resolve()` in physics.js corrects the ball against the
    // first segment at a given position and then, correctly, treats an
    // already-satisfied identical duplicate as no contact at all; whichever
    // of the two colinear segments is checked first therefore wins the tie
    // and is the one the ball's contact list actually reports. Ground has
    // to lose that tie, or a pad would sit under a plain, un-owned ground
    // contact for ever and never launch anything.
    this.pads = (data.pads || []).map((p) => ({ x: p.x, y: p.y, w: p.w, bounce: true, squashT: 0 }));
    for (const p of this.pads) {
      const padSegs = boxSegments(p.x, p.y, p.w, CONFIG.BOUNCE.H);
      for (const s of padSegs) s.owner = p;
      segs.push(...padSegs);
    }

    // Pads above must stay ordered before this loop (see the comment there)
    // — moving them after it would silently un-launch any pad flush with
    // the ground, with no error anywhere to point at why.
    for (const line of data.ground || []) {
      for (let i = 0; i < line.length - 1; i++) {
        const s = segment(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
        // Marked so the level test can insist ground faces up, without having
        // to guess which segments came from a polyline and which from a box.
        s.fromGround = true;
        segs.push(s);
      }
    }
    // Boxes come in two kinds and it matters which. A `movable` one is a
    // wooden crate: it is a body that moves, so it must stay OUT of the static
    // grid, which is built once and never rebuilt. Everything else is scenery
    // — in level one, the boundary walls and its stone steps — and is baked
    // in like the ground.
    this.walls = (data.boxes || []).filter((b) => !b.movable);
    this.crates = (data.boxes || []).filter((b) => b.movable).map(makeCrate);
    for (const b of this.walls) segs.push(...boxSegments(b.x, b.y, b.w, b.h));
    // Senders. Level six's old `switches` are plates by another name and are
    // read as exactly that, first, so its data never has to change. A
    // button's or timer's post is stone and never moves, so it is baked into
    // the static segments like any wall — which is also what stops a crate
    // being pushed through one. Posts are deliberately NOT in `this.walls`:
    // finish.mjs's generic runner hops every low wall it sees, and a button
    // is something a route has to press, not hop.
    const senderData = [
      ...(data.switches || []).map((s) => ({ ...s, kind: 'plate' })),
      ...(data.senders || []),
    ];
    this.senders = senderData.map((d, i) => makeSender(d, i, CONFIG));
    for (const s of this.senders) {
      if (s.kind === 'plate') continue;
      const p = postBox(s, CONFIG);
      segs.push(...boxSegments(p.x, p.y, p.w, p.h));
    }
    // Kept under its old name for the plates alone — the same objects, not
    // copies — because level six's tests and route have always asked for it.
    this.switches = this.senders.filter((s) => s.kind === 'plate');
    // The ball tells the level where it is each step (see noteBall), so the
    // wiring can count it as a presser. Null until the first step.
    this.ball = null;
    // The receivers that came ON this step close enough to the ball to be
    // worth showing — see the end of `update`. Read by main.js, which asks
    // the camera to lean toward each; empty until the first step, and so
    // empty for a level the flow has only just built.
    this.opened = [];

    // Checkpoints are not colliders and never touch the segment world; they
    // are places the ball remembers. `taken` is per-run state and belongs on
    // the loaded level rather than in the data, so that reloading a level
    // resets them all with no bookkeeping anywhere.
    this.checkpoints = (data.checkpoints || []).map((c) => ({ x: c.x, y: c.y, taken: false }));

    // Hazards are not colliders and never enter the segment world. The ball
    // does not bounce off a spike; it rolls into one and fails.
    // `h` is how tall the patch is RIGHT NOW. A rising patch's `h` is rewritten
    // every step in `update`; everything else — the hit box, the drawing —
    // only reads it, so the two can never disagree.
    this.spikes = (data.spikes || []).map((s) => {
      const p = { x: s.x, y: s.y, w: s.w, h: s.h, rise: s.rise || null };
      p.h = spikeHeight(p, 0, CONFIG);
      return p;
    });

    // Gates ARE colliders, but dynamic ones — they move, so like crates and
    // movers they must stay OUT of the static grid built below. An old
    // `switchId` becomes `needs: [switchId]`.
    this.gates = (data.gates || []).map((g) => makeGate({ ...g, needs: g.needs || (g.switchId ? [g.switchId] : []) }));

    // Bridges are colliders that change length, so like gates they stay OUT
    // of the static grid.
    this.bridges = (data.bridges || []).map(makeBridge);

    // Breakables ARE colliders, and dynamic in the one way that matters —
    // they stop existing — so like gates they stay OUT of the static grid.
    this.breakables = (data.breakables || []).map(makeBreakable);

    // Beams ARE colliders too, and dynamic for the same reason gates are —
    // they move (rotate, in this case), so they must stay OUT of the static
    // grid built below.
    this.beams = (data.beams || []).map(makeBeam);

    // Enemies are the same kind of thing spikes are — not colliders, hit-
    // tested only — except the roller, which asks the real physics engine
    // to move it and so needs to know the level (`this`, below) rather than
    // just its own starting data.
    // The charger moves the same way the roller does.
    const MAKERS = { walker: makeWalker, roller: makeRoller, popper: makePopper, charger: makeCharger, shell: makeShell };
    this.enemies = (data.enemies || []).map((e) => MAKERS[e.kind](e, CONFIG));

    // Purely decorative: the triangles a stomp scatters. Nothing else in
    // the game ever reads this array — physics, hazards and every other
    // system are blind to it, the same way hazards are blind to a level's
    // checkpoints.
    this.particles = [];

    this.statics = segs;
    this.grid = new SegmentGrid(segs);
    this.movers = (data.platforms || []).map(makeMover);
  }

  update(dt) {
    this.time += dt;
    // Before anything hit-tests this step, so a ball is asked about the teeth
    // as they are now, not as they were a step ago.
    for (const s of this.spikes) if (s.rise) s.h = spikeHeight(s, this.time, CONFIG);
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
    // A beam's torque comes only from crates resting on it — never the
    // ball — and crates are updated (this step's `grounded`/`x`, not last
    // step's) on the line just above. "Resting on it" is a plain horizontal
    // check — the crate is grounded and its centre sits between the beam's
    // own two current endpoints — rather than asking what specific segment
    // held it up: a crate pushed far enough to matter can start to overlap
    // the real ground beyond the beam too, and a segment-ownership check
    // would risk losing its weight to a tie at exactly the moment the
    // puzzle is being solved. See this plan's own "Important deviation"
    // note.
    for (const beam of this.beams) {
      const lo = Math.min(beam.ax, beam.bx), hi = Math.max(beam.ax, beam.bx);
      let torque = 0;
      for (const c of this.crates) {
        if (!c.grounded) continue;
        const cx = c.x + c.w / 2;
        if (cx < lo || cx > hi) continue;
        torque += cx - beam.x;
      }
      beam.update(dt, torque);
    }
    for (const e of this.enemies) e.update(dt, this.time, this, CONFIG);
    for (const p of this.pads) p.squashT = Math.max(0, p.squashT - dt);
    for (const b of this.breakables) b.wobbleT = Math.max(0, b.wobbleT - dt);
    // Wiring. Every presser is a box. Crates are this step's — they were
    // updated above — and the ball is last step's, the same one-step lag a
    // rider on a platform already lives with.
    //
    // Pressing and holding a gate up are two lists, because a deflating ball
    // belongs in one and not the other. It presses nothing: it is not really
    // there. But it is still drawn squashing flat where it stood, and a timed
    // gate running out over it must not come down through the picture — so
    // it still counts as something under a gate. Anything else ever added
    // here needs the same questions asked of it separately. Every presser
    // says outright whether it hits buttons and timers (`buttons`) and
    // whether it weighs a plate (`heavy`); updateSenders refuses one that
    // leaves `buttons` unsaid. Crates and the ball are not the only things in
    // these lists any more — enemies that use the world join them below.
    const pressers = this.crates.map((c) => ({ key: c, x: c.x, y: c.y, w: c.w, h: c.h, heavy: true, resting: c.grounded, buttons: true }));
    const blockers = pressers.slice();
    const b = this.ball;
    if (b) {
      const box = { key: b, x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2, heavy: false, resting: b.grounded, buttons: true };
      blockers.push(box);
      if (!b.dying) pressers.push(box);
    }
    // Enemies that use the world. Each answers three independent questions
    // with its own fields: `presses` — does it hit buttons and timers;
    // `heavy` — does it weigh a plate down; `blocks` — will a closing gate
    // refuse to come down on it. Any that presses or is heavy joins the
    // pressers, carrying `buttons: presses`; any that blocks joins the
    // blockers. The charger presses, blocks, and is heavy only while dazed;
    // the shell is heavy and blocks but never presses. A popped one is not
    // there at all. `key` names the enemy a box came from.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!e.presses && !e.heavy && !e.blocks) continue;
      const box = { ...e.box(), key: e, heavy: e.heavy, resting: e.grounded, buttons: !!e.presses };
      if (e.presses || e.heavy) pressers.push(box);
      if (e.blocks) blockers.push(box);
    }
    // An aimed popper's lob presses a button by hitting it, like any other
    // presser. Its key is made once per shot, so every lob is one hit of its
    // own and a lob resting against a timer cannot hold it full. It is never
    // heavy and never holds a gate up. Enemies update before this list is
    // built, so the lob's position this step is the one the senders see.
    for (const e of this.enemies) {
      if (!e.alive || e.kind !== 'popper' || e.fixed || !e.lobNow) continue;
      const q = e.lobNow;
      pressers.push({ key: e.lob.shot, x: q.x - q.r, y: q.y - q.r, w: q.r * 2, h: q.r * 2, heavy: false, resting: false, buttons: true });
    }
    updateSenders(this.senders, dt, pressers, CONFIG);
    this.opened = [];
    for (const g of this.gates) {
      const on = powered(g.needs, this.senders);
      this.noteOpening(g, on, revealPoint(g));
      g.update(dt, on, blockers.some((p) => g.isUnder(p)));
    }
    for (const br of this.bridges) {
      const on = powered(br.needs, this.senders);
      this.noteOpening(br, on, revealPoint(br));
      br.update(dt, on);
      br.warn = warning(br.needs, this.senders, CONFIG);
    }
    if (this.particles.length) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    }
  }

  /**
   * The ball saying where it is. Called by player.js once per step, after it
   * has moved, the same way it already asks `takeCheckpoint` — so the wiring
   * can count the ball as a presser on the next `update`, with no caller
   * anywhere having to pass the ball in.
   */
  noteBall(ball) {
    this.ball = ball;
  }

  /**
   * Put receiver `r` in `this.opened` if it has just come on and the ball is
   * within CIRCUIT.SEE of `x` — so the camera can show the player what they
   * just did (camera.js, `reveal`).
   *
   * Opening only. A timer running out behind the player shuts its door, and
   * yanking the camera back to a room they have left would show nothing they
   * did. And nothing on a receiver's very first evaluation: level nine's `!p`
   * gate is on at time zero, before its crate settles onto the plate, and a
   * level whose first frame leans at a door nobody touched is a camera
   * glitch, not cause and effect. SEE is the longest any wire may be, so it
   * is exactly "something a sender near the ball could have driven"; a door
   * further off than that was not opened by anything here.
   */
  noteOpening(r, on, x) {
    const was = r.wasOn;
    r.wasOn = on;
    const b = this.ball;
    if (was === false && on && b && Math.abs(x - b.x) <= CONFIG.CIRCUIT.SEE) this.opened.push({ x, receiver: r });
  }

  /** Every button and timer back as the level declared it. Called on every respawn. */
  resetSenders() {
    clearSenders(this.senders);
  }

  /**
   * Every enemy that can act on a respawned room puts itself back: so far
   * the aimed popper, which goes back to sleep with nothing aimed and no lob
   * in flight, and the shell, which goes home upright, patrolling and alive.
   * Without this, a lob thrown before a fall lands after it, on a button
   * just reset or a plank wall, and the room is changed by nobody. (Not yet
   * the charger: a known gap, deliberately deferred.)
   */
  resetEnemies() {
    for (const e of this.enemies) if (e.reset) e.reset();
  }

  /**
   * Everything a crate may rest on or be stopped by: the level's fixed
   * geometry, the moving platforms, and every crate EXCEPT itself.
   *
   * Excluding itself is the whole point. A crate asked whether it may stand
   * somewhere, with its own four sides in the list, is told no by its own
   * floor — and a crate that rests on itself hangs in mid-air for ever.
   */
  solidsFor(crate) {
    const out = [...this.statics];
    for (const m of this.movers) out.push(...m.segments);
    for (const g of this.gates) out.push(...g.segments);
    for (const br of this.bridges) out.push(...br.segments);
    for (const b of this.breakables) out.push(...b.segments);
    for (const beam of this.beams) out.push(...beam.segments);
    for (const c of this.crates) if (c !== crate) out.push(...c.segments);
    return out;
  }

  /**
   * Every segment the ball could touch right now.
   *
   * Statics come from the grid; movers and crates are checked one by one
   * because there are a handful of them, and rebuilding a grid every step to
   * save a few comparisons would be a poor trade.
   */
  near(x, y, r) {
    const out = [...this.grid.near(x, y, r)];
    for (const m of this.movers) if (m.overlaps(x, y, r)) out.push(...m.segments);
    for (const g of this.gates) if (g.overlaps(x, y, r)) out.push(...g.segments);
    for (const br of this.bridges) if (br.overlaps(x, y, r)) out.push(...br.segments);
    for (const b of this.breakables) if (b.overlaps(x, y, r)) out.push(...b.segments);
    for (const beam of this.beams) if (beam.overlaps(x, y, r)) out.push(...beam.segments);
    for (const c of this.crates) if (c.overlaps(x, y, r)) out.push(...c.segments);
    return out;
  }

  /**
   * The checkpoint a point is inside, if any — and it is marked taken.
   *
   * Takes a bare x and y rather than the ball, because that is all it looks
   * at, and this file has no business knowing what a ball is.
   *
   * The capture region is a box the shape of the flag that is drawn: `R` to
   * either side, and from the top of the pole down to `R` below its foot. A
   * circle around the anchor was tried first and let a jump sail over the
   * flag without arming, because a circle's window narrows to nothing exactly
   * where the pole is tallest.
   *
   * It both marks and returns, deliberately: splitting the question from the
   * arming invites a caller that asks and then forgets to arm.
   *
   * Already taken ones are skipped, which is what stops rolling back over an
   * earlier checkpoint from dragging home backwards down the level.
   */
  takeCheckpoint(x, y) {
    const K = CONFIG.CHECKPOINT;
    for (const c of this.checkpoints) {
      if (c.taken) continue;
      if (x >= c.x - K.R && x <= c.x + K.R &&
          y >= c.y - K.POLE_H && y <= c.y + K.R) {
        c.taken = true;
        return c;
      }
    }
    return null;
  }

  /**
   * Is this body touching anything that should send it back?
   *
   * One question for the whole level, so that when saws and crushers arrive in
   * phase 3 the caller in player.js does not have to learn about them.
   *
   * `body` and not `ball`, because it need not be one: anything with an `x`, a
   * `y` and an `r` can ask, and Task 6 asks on behalf of a candidate spot with
   * a radius of its own to check that a level is authorable there.
   */
  hitsHazard(body) {
    return hitsSpikes(body, this.spikes, CONFIG);
  }

  /**
   * If this body is touching a hazard, which way to knock it — away from
   * whatever it touched, as -1 or 1, never 0. Null if nothing was touched.
   *
   * One question for the whole level, so player.js does not have to learn a
   * separate case for spikes, enemies, and a popper's own lobbed ball.
   * Stomping an enemy is NOT handled here — see `stompEnemy`, which player.js
   * always asks first, so an enemy that has just been stomped this same step
   * is never also reported as a side hit by this method a moment later.
   */
  hazardKnockDir(body) {
    const s = spikeHit(body, this.spikes, CONFIG);
    if (s) {
      const mid = s.x + s.w / 2;
      return body.x >= mid ? 1 : -1;
    }
    // A dazed charger is harmless to touch — it can be stomped, or rolled
    // straight through.
    const e = enemyHit(body, this.enemies.filter((x) => !x.harmless));
    if (e) return body.x >= e.x ? 1 : -1;
    const p = projectileHit(body, this.enemies, this.time);
    if (p) return body.x >= p.x ? 1 : -1;
    return null;
  }

  /**
   * Is this body landing on top of an alive enemy it can stomp? If so, defeat
   * every such enemy under it and return true. False otherwise, including when
   * the body is touching an enemy in any other way — that is `hazardKnockDir`'s
   * job instead.
   *
   * Every enemy under the ball is considered, not just the first: two can
   * overlap, and the ball aimed at the one it can stomp. If any is stompable,
   * every stompable one pops and nothing hurts; hazardKnockDir is then never
   * asked, because player.js asks it only when this returns false. An enemy
   * that cannot be stomped (a charger that is not dazed) neither pops nor
   * stops the stomp.
   *
   * "On top" is a downward-moving body whose centre is still above roughly
   * the enemy's own top edge when the two first overlap — generous for the
   * same reason SPIKE.FORGIVE is: a stomp that looked close enough and
   * wasn't reads as the game cheating. Each enemy is judged against its own box.
   */
  stompEnemy(body) {
    if (!(body.vy > 0)) return false;
    const targets = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const box = e.box();
      if (!circleHitsBox(body.x, body.y, body.r, box)) continue;
      if (e.stompable !== false && body.y < box.y + CONFIG.ENEMY.STOMP_MARGIN) targets.push(e);
    }
    if (!targets.length) return false;
    for (const e of targets) this.pop(e);
    return true;
  }

  /** An enemy popped: gone, and a burst in its own shade at fixed angles. */
  pop(e) {
    e.alive = false;
    // Fixed, evenly-spaced angles around the enemy's own position — not
    // randomised, so a level looks identical on every attempt, the same
    // reason moving platforms are a sine of level time rather than
    // integrated physics. Six pieces, 60° apart — the same ring shape a
    // walker or roller already wears, just fewer pieces and now flying
    // apart instead of standing still. (A popper has no ring of its own,
    // but gets the same burst: one pop animation for every enemy kind,
    // coloured by the kind's own `popShade`, the usual enemy violet by default.)
    const shade = e.popShade || { fill: 'ENEMY', edge: 'ENEMY_EDGE' };
    const P = CONFIG.ENEMY.POP;
    for (let i = 0; i < P.COUNT; i++) {
      const a = (i / P.COUNT) * Math.PI * 2;
      this.particles.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * P.SPEED,
        vy: Math.sin(a) * P.SPEED,
        angle: a,
        life: P.LIFE,
        shade,
      });
    }
  }

  /**
   * Break a plank wall: its segments go, for good, and it throws the same pop
   * a stomped enemy does, in wood. player.js decides WHEN; this is only what
   * breaking is. The pieces are at fixed angles for the reason stompEnemy's
   * are: the level looks the same every time.
   */
  breakWood(b) {
    b.broken = true;
    b.segments = [];
    const P = CONFIG.ENEMY.POP;
    for (let i = 0; i < P.COUNT; i++) {
      const a = (i / P.COUNT) * Math.PI * 2;
      this.particles.push({
        x: b.x + b.w / 2, y: b.y + b.h / 2,
        vx: Math.cos(a) * P.SPEED,
        vy: Math.sin(a) * P.SPEED,
        angle: a,
        life: P.LIFE,
        shade: { fill: 'CRATE', edge: 'CRATE_LINE' },
      });
    }
  }
}

/**
 * Where the camera leans to show receiver `r` opening: a gate's middle, or
 * the middle of a bridge's whole span, out or not — where it will be, since
 * it has only just started to slide.
 *
 * Exported so the levels suite measures a wire by the same point the reveal
 * aims at. Two copies of this would drift, and the suite would then pass a
 * level whose reveal never fires.
 */
export function revealPoint(r) {
  return r.kind === 'bridge' ? r.x + r.dir * r.w / 2 : r.x + r.w / 2;
}

export function loadLevel(data) { return new Level(data); }

/**
 * The index of the level after this one, or null if there is none.
 *
 * Null rather than wrapping round to zero, and rather than clamping to the
 * last one. The caller has to decide what "nowhere to go" means — for the
 * results panel it means staying on the panel instead of promising a level
 * that does not exist — and a function that quietly returned the same level
 * again would hide that decision rather than force it, which is how a child
 * ends up replaying the last level for ever with no idea why.
 *
 * An INDEX and not an id, because that is what the caller has: flow.js holds
 * `levelIndex` into the list, and ids are for the digit on the panel.
 *
 * The list is a parameter, defaulting to LEVELS, so that the flow can be
 * tested on levels built for the purpose — moving on needs somewhere to move
 * on to, and a test should not depend on how many levels the game has today.
 */
export function nextLevel(index, levels = LEVELS) {
  return index + 1 < levels.length ? index + 1 : null;
}
