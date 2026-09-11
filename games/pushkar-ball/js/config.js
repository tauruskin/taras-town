/**
 * config.js — Every tunable number and colour in Pushkar Ball lives here.
 *
 * If the roll feels too slow, the jump too floaty, the stop too sudden or a
 * colour wrong, this is the ONLY file you need to open. Nothing here imports
 * anything, so any value can be changed and the page reloaded.
 *
 * The physics numbers below are a STARTING POINT, not a result. They were
 * chosen so the arithmetic comes out sane — the jump clears 131px, a 200px gap
 * is comfortable at speed — and they are expected to change once someone has
 * played it with a thumb rather than reasoned about it.
 */
export const CONFIG = {
  // ---------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------
  // The simulation runs at a fixed rate and the drawing at whatever the screen
  // offers. Fixed-step is what makes the physics identical on a 60Hz phone and
  // a 144Hz monitor, and what makes it reproducible in node — which is how it
  // gets tested at all.
  STEP: 1 / 120,
  // A backgrounded tab hands back one enormous delta on return. Without this
  // clamp the world fast-forwards, usually straight through a floor.
  MAX_FRAME: 0.25,

  // ---------------------------------------------------------------------
  // What the player can see
  // ---------------------------------------------------------------------
  // World units visible vertically, on every screen. A small phone therefore
  // sees a little less HORIZONTALLY than a wide desktop, rather than seeing
  // less of the level — a platformer where the small screen shows less is
  // secretly harder on the small screen, which is not a difficulty anyone chose.
  VIEW_H: 540,

  // ---------------------------------------------------------------------
  // The ball
  // ---------------------------------------------------------------------
  BALL: { R: 20 },

  GRAVITY: 2200,        // px/s²
  ACCEL: 1600,          // px/s², rolling on the ground
  AIR_ACCEL: 0.45,      // multiplier on ACCEL while airborne — you can steer in
                        // the air, but far less than on the ground
  MAX_SPEED: 420,       // px/s horizontal
  GROUND_FRICTION: 6.0, // per second; how fast an unpushed ball rolls to a stop
  RESTITUTION: 0.18,    // how much of an impact comes back. A ball bounces a
                        // little; a ball that bounces a lot is a nuisance.
  REST_EPS: 40,         // px/s below which an impact is absorbed rather than
                        // returned, so a resting ball actually rests
  JUMP_V: 760,          // px/s upward impulse — clears 131px
  COYOTE: 0.10,         // s after leaving the ground that a jump still works
  BUFFER: 0.12,         // s before landing that a jump press is remembered
  GROUND_NY: -0.6,      // a contact normal at least this far up counts as ground

  // ---------------------------------------------------------------------
  // The camera
  // ---------------------------------------------------------------------
  CAMERA: {
    LERP: 8,            // horizontal follow, per second
    LERP_Y: 2.5,        // vertical follow, much slower on purpose: a camera
                        // that tracks every jump exactly is nauseating
    DEADZONE_Y: 90,     // world units of vertical slack before it follows at all
    // Where a resting ball's FEET should sit on the screen, as a fraction of
    // its height — so 0.73 puts the ground about three quarters of the way
    // down and leaves a quarter of the screen as land.
    //
    // This replaced a fixed BIAS_Y of 110 world units, which had an accident
    // in it. A settled camera rests `BIAS_Y - DEADZONE_Y` below the ball;
    // that came to 20, the ball's radius is also 20, and the two cancelled
    // exactly — so the ground landed on the precise middle of every screen,
    // whatever its size. On a phone a 50/50 split passes unnoticed. On a
    // 1200px-tall window it reads as a hard half-and-half horizon with a
    // featureless field of green under it.
    //
    // A fraction cannot be honoured everywhere, and that is the point of
    // GROUND_CLEAR below. On a 280px-tall screen the thumb buttons occupy the
    // bottom 124px — 44% of everything — so a ball three quarters of the way
    // down would sit under a thumb, which is exactly what raising it fixed in
    // the first place. So this is a target, not a promise: it is honoured
    // wherever there is room and given up where there is not.
    GROUND_AT: 0.73,

    // The daylight, in CSS pixels, that must remain between the ball and the
    // top of the nearest on-screen button. This is the hard constraint that
    // outranks GROUND_AT, and tests/offline/camera.mjs is what holds it.
    GROUND_CLEAR: 26,
    LOOKAHEAD: 0.35,    // seconds of vx to look ahead, so a fast ball can see
                        // what it is about to hit
  },

  // ---------------------------------------------------------------------
  // Crates
  // ---------------------------------------------------------------------
  // A wooden crate can be pushed. It is how you get somewhere the jump alone
  // will not reach: shove one up against a high ledge and jump off it.
  CRATE: {
    // How fast a pushed crate slides, in px/s. Deliberately far slower than
    // the ball's own MAX_SPEED of 420, because a crate that shot away at the
    // speed of the ball would feel weightless — and because a child needs to
    // be able to stop pushing before the crate is somewhere useless.
    PUSH_SPEED: 150,
    // How side-on a contact has to be before it counts as a push, as |nx|.
    // Without this the ball pushes the crate along merely by standing on it,
    // which looks like the crate is haunted.
    PUSH_NX: 0.6,
    // How far a crate is allowed to be lifted by whatever it is pushed onto,
    // per step. This is what lets a crate ride up a gentle slope while still
    // being stopped dead by a wall.
    STEP_UP: 6,
  },

  // ---------------------------------------------------------------------
  // Checkpoints
  // ---------------------------------------------------------------------
  // A checkpoint is not a collider and never touches the segment world: it is
  // a place the ball remembers, so that failing costs the stretch since the
  // last one and nothing more.
  CHECKPOINT: {
    // Capture is a BOX around the ball's centre, not a circle, and it is
    // shaped like the flag that is drawn: `R` to either side of the pole, and
    // everything from the top of the pole down to `R` below its foot.
    //
    // A circle was the first attempt and it was wrong on the vertical. Its
    // window shrank to nothing as the ball rose, so a jump begun a little
    // before the flag sailed clean over it without arming — and silent
    // non-arming is exactly what makes a checkpoint worse than no checkpoint,
    // because the player believes it armed. A ball that clears the box has
    // genuinely flown over the whole flag, which is at least honest.
    //
    // Generous sideways for the same reason: at MAX_SPEED the ball covers
    // 3.5px per step, so `R` is many steps wide and cannot be tunnelled
    // through at any speed the ball can reach.
    R: 46,
    POLE_H: 70,          // drawn height, and how high capture reaches
    // Daylight between the ball and the floor when it comes back. A
    // checkpoint's `y` is its GROUND ANCHOR — the pole is drawn upward from
    // it — so respawning the ball's centre at that `y` puts the centre exactly
    // on the ground segment, where the resolver does not eject it: the ball
    // falls through the floor, dies, comes back inside the floor again and
    // the level is destroyed with no way out. The respawn point is therefore
    // the anchor lifted by the ball's own radius plus this, so the ball
    // settles rather than starting embedded, and so it follows BALL.R if that
    // is ever retuned.
    CLEARANCE: 4,
    // The pennant, as drawn: half the pole's width, then how far the flag
    // reaches out from it and where its point and its bottom corner sit.
    POLE_W2: 2.5,
    FLAG_OUT: 38,
    FLAG_MID: 13,
    FLAG_DROP: 26,
  },

  // ---------------------------------------------------------------------
  // Failing
  // ---------------------------------------------------------------------
  // How long a relocate takes — the squash-and-respawn sequence `_relocate()`
  // in player.js drives, whether that is a fall with hearts to spare (back to
  // the checkpoint) or the level-start relocate once hearts run out (see
  // HEALTH below). Short on purpose: every extra tenth of a second is a
  // punishment on top of the setback. Long enough to read as something that
  // happened, short enough not to be a wait.
  DEFLATE: {
    TIME: 0.42,          // s squashing flat where it stood
    INFLATE: 0.28,       // s swelling back up at home
    DIM: 0.30,           // how dark the screen goes, 0..1
    // The shape of the squash and the swell, as multipliers on how the ball is
    // DRAWN. None of these touches `ball.r`: that is the collision radius, and
    // the physics must not care what the drawing is doing.
    //
    // They are here rather than typed into main.js because this file is meant
    // to hold every number anybody would ever reach for, and "the puddle is
    // too flat" or "it comes back too suddenly" are exactly the sort of thing
    // that gets said once a child has watched it happen twenty times.
    SQUASH: 0.82,        // fraction of its height a fully deflated ball loses
    SPREAD: 0.45,        // fraction of its width it gains as it flattens. A
                         // HINT of being squeezed sideways, not a conservation
                         // law: at full squash the drawn ball covers about a
                         // quarter of its round area, and actually preserving
                         // that area would need it five and a half times wider,
                         // which looks absurd rather than physical.
    // How big it is the instant it arrives home, before swelling back to 1.
    // Not 0: a ball that starts from literally nothing reads as appearing out
    // of thin air rather than being pumped back up.
    //
    // Named for what it is and not `SEED`, which in this repo means generation
    // ORDER — the sibling game stores a child's furniture under a building's
    // seed — so a reader scanning this block would parse "the deflate is
    // randomised" and need the comment to talk them back out of it.
    INFLATE_FROM: 0.25,
  },

  // ---------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------
  // Three hearts, replacing "any hazard touch is instant" for spikes and
  // falling out of the level (and, once they exist, enemies) — added Sep
  // 2026 once this game's audience became 12, not 6. See
  // docs/superpowers/specs/2026-09-10-health-enemies-curriculum-design.md.
  HEALTH: {
    HEARTS: 3,
    // Seconds of invincibility after a hit. Without it, rolling across a
    // spike patch at speed — many steps of contact in a row — could drain
    // every heart from a single mistake before the ball is even clear of it.
    IFRAME: 0.5,
    // A non-fatal hit's knockback, in px/s: away from whatever was touched,
    // horizontally, plus a small upward bump so it reads as a hop rather
    // than a shove — a purely horizontal knock is easy to miss at a glance.
    KNOCKBACK: 260,
    KNOCKBACK_UP: 200,
  },

  // ---------------------------------------------------------------------
  // Spikes
  // ---------------------------------------------------------------------
  SPIKE: {
    H: 26,               // drawn height above the ground they stand on
    TOOTH_W: 20,         // one tooth, so a patch is drawn as w / TOOTH_W teeth
    // How far the ball may sink into a spike patch before it counts, in world
    // units. Measured off the BALL'S RADIUS, not carved out of the hazard's
    // box — `hitsSpikes` tests a circle this much smaller than the one drawn,
    // against the rectangle the patch is actually drawn in.
    //
    // That distinction is the whole point and it was got wrong first time.
    // Insetting the hazard's box instead is the identical arithmetic on every
    // edge — the kill zone still begins `BALL.R - FORGIVE` outside the
    // picture — so the number read as a promise the code was not keeping, and
    // it also collapsed on a patch narrower than twice itself.
    //
    // Forgiveness, deliberately: a hazard whose hit box matches its picture
    // kills on a graze that looked like a miss, and a six-year-old cannot tell
    // that apart from the game cheating. Being killed by something you clearly
    // touched is fair; being killed by something you clearly missed is not,
    // and only one of those two mistakes is worth risking.
    //
    // Bounded on both sides. It must stay under BALL.R or the effective ball
    // shrinks to a point and the spikes barely work; and under H, or a ball
    // rolling along the floor steps straight over a patch. Both bounds are
    // asserted in tests/offline/hazards.mjs.
    //
    // Its authority is limited whatever it is set to, because BALL.R is 20 and
    // this can only ever be a fraction of it: a rolling ball's leading edge is
    // always a good way in front of its centre. If the spikes still feel like
    // they reach too far once a thumb has tried them, the honest lever is the
    // ball's radius or the shape of the test, not this number.
    FORGIVE: 5,
  },

  // ---------------------------------------------------------------------
  // Enemies
  // ---------------------------------------------------------------------
  // Three types — see js/enemies.js. None of them chase off-screen or swarm.
  // Jumping on top of any of them defeats it instead of costing a heart; any
  // other contact goes through the same Ball.hit() a spike already uses.
  ENEMY: {
    // How close, vertically, the ball's centre must be to an enemy's own top
    // edge before a downward landing counts as a stomp rather than a side
    // hit, in world units. Generous for the same reason SPIKE.FORGIVE is: a
    // stomp that looked close enough and wasn't reads as the game cheating.
    STOMP_MARGIN: 14,
    WALKER: {
      R: 22,          // collision and drawing radius
      SPEED: 1.4,     // rad/s inside the sine — see enemies.js's makeWalker
    },
    POPPER: {
      R: 24,          // the popper's own stationary body
      PROJ_R: 12,     // the lobbed ball
      VX: 160,        // px/s, the projectile's horizontal launch speed
      VY0: 520,       // px/s, its upward launch speed
      PERIOD: 3.0,    // s between launches, unless a level authors its own
    },
  },

  // ---------------------------------------------------------------------
  // The flag, and what happens after it
  // ---------------------------------------------------------------------
  GOAL: {
    // How close the ball's CENTRE gets before the level is won. Generous, for
    // the same reason a checkpoint's radius is: the flag is the reward, and a
    // reward you have to line up precisely is a reward withheld.
    //
    // A circle here rather than the flag-shaped box a checkpoint uses, and
    // that difference is deliberate rather than an oversight. A checkpoint
    // needs the box because sailing over one without arming it is a silent
    // failure the player cannot see — the game goes on looking normal and
    // punishes them later. Flying over the flag is not silent at all: the
    // level does not end, and the player simply comes back and rolls into it.
    // So the honest generous shape is enough here, and being reachable from
    // ABOVE is what a circle gives that matters — the last flag in level one
    // is arrived at off a moving platform.
    R: 52,
  },

  RESULTS: {
    // Seconds the panel is shown before the next level starts on its own.
    // Long enough to see what happened and to reach a button; short enough
    // that a child who just wants to keep playing is not made to wait.
    HOLD: 3.2,

    // The panel, in CSS pixels. Fixed rather than a fraction of the screen,
    // so it is the same size on a phone and a desktop — everything on it is a
    // thumb target or a digit to be read, and neither of those wants to shrink
    // because the window did. Nor is it clamped to a small screen: its rows
    // are laid out from the top and from the bottom, so the face needs every
    // one of PANEL_H's pixels, and a squeezed panel would put its digit over
    // its buttons without complaint. The smallest screen supported is 280px
    // tall, and tests/offline/buttons.mjs proves it fits on every one it knows.
    PANEL_W: 300,
    PANEL_H: 200,

    // The three rows on its face, measured DOWN from the top of the panel in
    // CSS pixels, except the buttons which are measured up from the bottom.
    // Absolute rather than multiples of each other because the one thing that
    // matters here is that the rows do not collide, and rows that each scale
    // off a different number collide the first time one of them is retuned.
    // With the numbers below, the stars end at 62, the number's band runs 67
    // to 111, and the buttons begin at 116 — so all three rows are clear of
    // each other by 5px with nothing relying on how WIDE anything is.
    STAR_R: 20,
    STAR_TOP: 42,        // centre of the row of stars
    STAR_SPACING: 2.5,   // between star centres, as a multiple of STAR_R
    NUMBER_Y: 89,        // centre of the level number
    // The digit's height. Digits are the one kind of text he reads reliably,
    // so this is the only place in the whole game where the legibility of type
    // matters at all — and it wants to be big.
    //
    // It sits in a row of its OWN, above the buttons rather than between them,
    // which is what lets it be this big. Between them it would have had to
    // stay narrower than the gap, and "level 10" is twice as wide as "level 1"
    // — so the layout would have been correct for nine levels and then quietly
    // wrong, with no test able to see it without measuring text in a browser.
    NUMBER_SIZE: 44,
    BUTTON_R: 34,        // the retry and hub buttons
    BUTTON_LIFT: 16,     // from the bottom of the panel to the bottom of them
    GAP: 26,             // between the two of them
    // Daylight, in CSS pixels, between either panel button's HIT circle and
    // the hit circle of any game control. The controls are switched off while
    // the panel is up, so this is a second line of defence rather than the
    // first — but on a narrow phone the two sets of buttons would otherwise
    // sit almost on top of each other, and `Panel.box` lifts the whole panel
    // to keep this much between them.
    CLEAR: 8,
    // How close the panel may be pushed to the top of the screen while it is
    // being lifted clear of the controls.
    TOP_MARGIN: 8,
  },

  // ---------------------------------------------------------------------
  // The hills behind the level
  // ---------------------------------------------------------------------
  // Two bands, drawn in screen space with the camera folded into the phase, so
  // they are endless and cost nothing at either end of a long level.
  //
  // SPAN is the sine's wavelength divided by 2*PI, in screen pixels, and it is
  // the number that matters: the first pass at this used 520, which is a
  // wavelength of 3267px, so on an 844px phone less than a sixth of a wave was
  // ever on screen and both "hills" drew as flat washes tilted slightly. They
  // only read as hills once a crest and a trough both fit. FACTOR is how much
  // slower than the world the band moves, and TOP is where it sits as a
  // fraction of screen height.
  PARALLAX: [
    { colour: 'HILL_FAR', factor: 0.25, top: 0.62, amp: 40, span: 140 },
    { colour: 'HILL_NEAR', factor: 0.45, top: 0.74, amp: 30, span: 95 },
  ],

  // ---------------------------------------------------------------------
  // The controls on screen
  // ---------------------------------------------------------------------
  UI: {
    BUTTON_R: 40,       // the two move buttons
    JUMP_R: 52,         // the jump button, deliberately the biggest thing there
    EDGE: 20,           // gap from the screen edge
    GAP: 14,            // gap between the two move buttons
    HIT: 1.3,           // hit radius as a multiple of the drawn one. A thumb is
                        // not a mouse pointer, and a jump that did not happen
                        // because the press was four pixels low is
                        // indistinguishable from a bug.
  },

  // ---------------------------------------------------------------------
  // The hearts HUD
  // ---------------------------------------------------------------------
  // Top-left, out of the way of every thumb control, which all live along
  // the bottom. Reuses the results panel's star colours rather than
  // inventing a red or pink — the ball is the only red thing anywhere on
  // purpose (see COLOURS.BALL below), and a heart drawn in that family would
  // be picked up as a second ball by every browser suite that finds the ball
  // by its hue.
  HEARTS_UI: {
    R: 14,
    GAP: 10,      // between heart centres
    EDGE: 20,     // from the left edge of the screen
    TOP: 20,      // from the top of the screen
  },

  // ---------------------------------------------------------------------
  // Colours
  // ---------------------------------------------------------------------
  // The ball is the only RED thing anywhere, on purpose: the browser suites
  // find it by the colour of its pixels, since the game carries no test-only
  // code. Adding anything red to the world will break them, loudly.
  COLOURS: {
    SKY_TOP: '#4FC3F7',
    SKY_LOW: '#B3E5FC',
    HILL_FAR: '#8ED6A0',
    HILL_NEAR: '#63BE7B',
    GROUND: '#7ED957',
    GROUND_EDGE: '#4E9E38',
    // Wood means "you can push this". The level's boundary walls are boxes
    // too, and they used to be drawn in exactly this wood, which made the rule
    // a lie the moment crates became pushable — so the walls have their own
    // stone colours below and nothing wooden is ever fixed in place.
    CRATE: '#C98A4B',
    CRATE_LINE: '#9C6631',
    WALL: '#9AA7B0',
    WALL_EDGE: '#78868F',
    PLATFORM: '#B0BEC5',
    PLATFORM_EDGE: '#78909C',
    BALL: '#E8402A',
    BALL_LIGHT: '#FF8A72',
    BALL_MARK: '#A32615',
    FLAG_POLE: '#EFEFEF',
    FLAG: '#FFC93C',
    // Green, not red. The browser suites find the ball by being the only
    // thing on screen of the ball's hue, so a red flag would be picked up as
    // a second ball and every position they measure would be the average of
    // the two.
    CHECK_OFF: '#9AA7B0',
    CHECK_ON: '#41C98A',
    // Steel, and checked by hand against IS_BALL in the browser helpers: it
    // is bluer than it is red, so it can never be mistaken for the hero.
    SPIKE: '#B9C4CC',
    SPIKE_EDGE: '#7C8B95',
    // Violet, not red or pink: r-b is negative for all three of these, so
    // none of them can ever be picked up as the ball by IS_BALL in
    // tests/browser/_helpers.mjs, the same reasoning FLAG and the results
    // panel's colours already follow.
    ENEMY: '#8B5FBF',
    ENEMY_EDGE: '#5E3D8A',
    ENEMY_EYE: '#2A1B40',
    DIM: '#0B1E2A',      // what the screen dims towards during a deflate
    // The results panel. Every one of these was checked by hand against
    // IS_BALL in tests/browser/_helpers.mjs, which calls a pixel the ball when
    // red minus blue exceeds 60 AND green is barely above blue. Both greys are
    // BLUER than they are red, so they fail the first clause outright; the
    // panel itself is white, where red and blue are equal, and blending white
    // over anything only moves a colour towards that equality. The star is the
    // one that needed the arithmetic: 255-60 is 195, which passes the first
    // clause, but (201-60)*4 is 564 and that is not less than 195, so it fails
    // the second. It is a warm yellow, not a red — the same reasoning that
    // already lets FLAG be this exact colour.
    PANEL: 'rgba(255,255,255,0.94)',
    PANEL_EDGE: '#78868F',
    PANEL_INK: '#33444F',
    STAR_ON: '#FFC93C',
    STAR_OFF: '#D8DEE2',
    BUTTON: 'rgba(255,255,255,0.30)',
    BUTTON_HELD: 'rgba(255,255,255,0.58)',
    BUTTON_MARK: '#FFFFFF',
  },
};
