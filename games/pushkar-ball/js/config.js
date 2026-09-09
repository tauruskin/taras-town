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
    BUTTON: 'rgba(255,255,255,0.30)',
    BUTTON_HELD: 'rgba(255,255,255,0.58)',
    BUTTON_MARK: '#FFFFFF',
  },
};
