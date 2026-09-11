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
import { hitsSpikes, spikeHit } from './hazards.js';
import { makeWalker, makeRoller, makePopper, enemyHit, projectileHit } from './enemies.js';

// A note on how long a level is, and how sparse its checkpoints are.
//
// Levels 1-3 below were rewritten in Sep 2026 after the first three shipped —
// they were roughly 4000-4800 units wide, about 15-25 seconds of real play,
// and level three had a checkpoint before every one of its three spike
// patches. Both were wrong. A "round" should be long enough to be worth
// sitting down for — these run 13,600-16,800 units, roughly 3.5-4x the
// originals, which is 60-100+ seconds of unhurried play rather than a blink.
// And a checkpoint belongs before the single hardest STRETCH of a level, not
// before every individual jump: each level below carries exactly two,
// positioned to break the level into large, roughly even pieces so one
// mistake costs a third of the level, not the whole run, but a run of easy,
// already-practised ground in between never gets flagged just for existing.
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
      // After a 200px gap: a bowl, a long flat run with nothing in it — pure
      // rolling, the kind of stretch a long level needs and a short one has no
      // room for — then a second, bigger hill and a flat to the second gap.
      [
        [3150, 760], [3500, 760], [3650, 840], [3850, 840], [4000, 760], [4600, 760],
        [6400, 760], [6900, 540], [7500, 540], [8000, 760], [8850, 760],
      ],
      // After the 240px second gap: a second bowl, another long flat, a third
      // and tallest hill, then flat to the final approach. The vertical lift
      // sits somewhere in the long flat between the bowl and the hill —
      // nothing needs it, same as the first level ever had.
      [
        [9090, 760], [10600, 760], [10950, 760], [11100, 840], [11300, 840], [11450, 760], [12200, 760],
        [13800, 760], [14350, 520], [15000, 520], [15550, 760], [16200, 760],
      ],
      // The last ledge. Nothing but the moving platform reaches it.
      [[16560, 680], [16760, 680]],
    ],

    boxes: [
      // Walls at both ends, so the level cannot be left sideways. Not movable,
      // and drawn as stone rather than wood so that "wood means you can push
      // it" stays true everywhere.
      { x: 0, y: 0, w: 40, h: 1080 },
      { x: 16760, y: 0, w: 40, h: 1080 },
      // Two wooden crates, and both can be pushed. Jump them, roll over them
      // at speed, or shove them about.
      //
      // Nothing in THIS level needs a crate to be finished — there is no spot
      // here that a jump cannot already reach, and saying otherwise in a
      // comment would be the easiest kind of lie to leave behind. They are
      // here so the mechanic is in a child's hands from the first level and so
      // the game exercises it; the level that is built around a crate belongs
      // with level two, where the geometry is drawn for it.
      // What a crate can do is proved in tests/offline/crates.mjs, on a level
      // built for the purpose, with a ledge the jump provably cannot reach.
      { x: 2450, y: 660, w: 100, h: 100, movable: true },
      { x: 8300, y: 660, w: 110, h: 100, movable: true },
    ],

    platforms: [
      // Across the last gap. Its travel is chosen so its left edge reaches
      // back over the ground at 16200 and its right edge stops short of the
      // ledge at 16560, leaving a small hop — a platform that docks exactly
      // with the scenery just reads as part of it. This is platforms[0]
      // deliberately: tests/offline/finish.mjs's route for this level reads
      // level.movers[0] to find it, and mover order follows platform order.
      { x: 16275, y: 740, w: 170, h: 28, axis: 'x', dist: 85, period: 5.0, phase: 0 },
      // A lift over the long flat between the first bowl and the second hill.
      // Nothing needs it; it is here so vertical movers are exercised by the
      // game and not only by the tests.
      { x: 9700, y: 470, w: 150, h: 28, axis: 'y', dist: 120, period: 4.0, phase: 0.25 },
    ],

    // Two, breaking the level into three pieces of roughly a third each
    // rather than guarding every gap. The first ~8700 units — the first hill,
    // both crates' worth of terrain, the first gap and bowl, the second hill —
    // have no checkpoint at all: none of it is the level's hard part, it is
    // the level's ROLLING, and a checkpoint there would only be banking
    // progress nobody was going to lose. The two below sit right before the
    // two stretches that can actually be failed: the second gap, and the
    // final hill-then-platform approach.
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
      { kind: 'popper', x: 2350, y: 760 - CONFIG.ENEMY.POPPER.R, dir: -1 },
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
    // It also brings back one thing already taught: a walker, from level
    // two, on the long flat between the first two gaps — see `enemies`
    // below. Not a new idea, so it gets no checkpoint and no rehearsal of its
    // own; it is here so that what level two taught does not simply stop
    // the moment level two ends.
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
    // gaps, crates, a moving platform, enemies — has already been met. Its
    // ground, platform, spikes and checkpoints are unchanged from the
    // original level three.
    //
    // It also brings back one thing already taught: a roller, from level
    // two, on the flat between checkpoint one's spike patch and the ramp —
    // see `enemies` below. Not a new idea, so it gets no checkpoint of its
    // own, for the same reason the gap below gets none.
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
      // meeting a spike for the very first time costs almost nothing even
      // without a flag to catch it — that is the safe rehearsal the rule
      // asks for. The second is the same idea, met a second time, still on
      // easy ground, before the level asks for anything else at once.
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
    ],

    platforms: [
      // Across the gap, so it can be crossed by waiting as well as by jumping.
      // Two ways past the same obstacle is how a level stops being a wall.
      { x: 5240, y: 800, w: 150, h: 26, axis: 'x', dist: 70, period: 4.5, phase: 0 },
    ],

    spikes: [
      // The rehearsal: narrow, flat, unmissable, close to spawn.
      { x: 700, y: 760, w: 70 },
      // A second, still-easy patch on the same long flat — one more rep of
      // the new idea before the gap and the first checkpointed stretch.
      { x: 3400, y: 760, w: 90 },
      // The first patch that is really asked of the player, well after the
      // gap so the gap and the spikes are never one piece of timing.
      { x: 7200, y: 760, w: 100 },
      // On the high ground, in plain view from the top of the ramp before it
      // has to be jumped.
      { x: 11100, y: 620, w: 90 },
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
      // that flat is kept for the first two spikes a child ever meets. Level
      // two's roller does no better on the same sweep.
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
 * A wooden crate: solid, standable, and pushable.
 *
 * It exists so there is a way to reach somewhere the jump alone will not — put
 * a crate under a high ledge and jump off it. Everything wooden in the game can
 * be pushed, and nothing that can be pushed is any other colour, so the rule
 * is legible without a word of explanation.
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
    // — in level one, the boundary walls — and is baked in like the ground.
    this.walls = (data.boxes || []).filter((b) => !b.movable);
    this.crates = (data.boxes || []).filter((b) => b.movable).map(makeCrate);
    for (const b of this.walls) segs.push(...boxSegments(b.x, b.y, b.w, b.h));

    // Checkpoints are not colliders and never touch the segment world; they
    // are places the ball remembers. `taken` is per-run state and belongs on
    // the loaded level rather than in the data, so that reloading a level
    // resets them all with no bookkeeping anywhere.
    this.checkpoints = (data.checkpoints || []).map((c) => ({ x: c.x, y: c.y, taken: false }));

    // Hazards are not colliders and never enter the segment world. The ball
    // does not bounce off a spike; it rolls into one and fails.
    this.spikes = (data.spikes || []).map((s) => ({ x: s.x, y: s.y, w: s.w }));

    // Enemies are the same kind of thing spikes are — not colliders, hit-
    // tested only — except the roller, which asks the real physics engine
    // to move it and so needs to know the level (`this`, below) rather than
    // just its own starting data.
    const MAKERS = { walker: makeWalker, roller: makeRoller, popper: makePopper };
    this.enemies = (data.enemies || []).map((e) => MAKERS[e.kind](e, CONFIG));

    this.statics = segs;
    this.grid = new SegmentGrid(segs);
    this.movers = (data.platforms || []).map(makeMover);
  }

  update(dt) {
    this.time += dt;
    for (const m of this.movers) m.update(this.time);
    for (const c of this.crates) c.update(dt, this.solidsFor(c), CONFIG, this.bounds.h);
    for (const e of this.enemies) e.update(dt, this.time, this, CONFIG);
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
    const e = enemyHit(body, this.enemies);
    if (e) return body.x >= e.x ? 1 : -1;
    const p = projectileHit(body, this.enemies, this.time);
    if (p) return body.x >= p.x ? 1 : -1;
    return null;
  }

  /**
   * Is this body landing on top of an alive enemy? If so, defeat it and
   * return true. False otherwise, including when the body is touching an
   * enemy in any other way — that is `hazardKnockDir`'s job instead.
   *
   * "On top" is a downward-moving body whose centre is still above roughly
   * the enemy's own top edge when the two first overlap — generous for the
   * same reason SPIKE.FORGIVE is: a stomp that looked close enough and
   * wasn't reads as the game cheating.
   */
  stompEnemy(body) {
    const e = enemyHit(body, this.enemies);
    if (!e) return false;
    const box = e.box();
    if (body.vy > 0 && body.y < box.y + CONFIG.ENEMY.STOMP_MARGIN) {
      e.alive = false;
      return true;
    }
    return false;
  }
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
