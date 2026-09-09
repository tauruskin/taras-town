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
    // How far BELOW the ball the camera aims, in world units.
    //
    // Without this the camera aims straight at the ball, and because the
    // deadzone stops it as soon as it is within DEADZONE_Y, a ball that
    // settles from above — which is every ball, since gravity brings it down
    // — comes to rest a whole deadzone below the middle of the screen. On a
    // short phone that is inside the band where the buttons are drawn, so a
    // thumb ends up resting on top of the hero.
    //
    // Slightly MORE than DEADZONE_Y, so a grounded ball settles a little
    // above the middle rather than exactly on it. That is worth the small
    // loss of view downwards: tests/offline/camera.mjs measures the daylight
    // between the ball and the controls on the shortest screen, and exactly
    // centred left only a few pixels of it.
    BIAS_Y: 110,
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
  // There are no lives. Failing sends the ball back to its last checkpoint,
  // for ever, and this is how long that takes. Short on purpose: this is the
  // moment a six-year-old is already disappointed, and every extra tenth of a
  // second is a punishment on top of the setback. Long enough to read as
  // something that happened, short enough not to be a wait.
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
    DIM: '#0B1E2A',      // what the screen dims towards during a deflate
    BUTTON: 'rgba(255,255,255,0.30)',
    BUTTON_HELD: 'rgba(255,255,255,0.58)',
    BUTTON_MARK: '#FFFFFF',
  },
};
