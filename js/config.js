/**
 * config.js — Every tunable number and colour in Taras Town lives here.
 *
 * If something feels too fast, too slow, too small or the wrong colour,
 * this is the ONLY file you need to open. Nothing here depends on anything
 * else, so you can safely change any value and reload the page.
 */

export const CONFIG = {
  // ---------------------------------------------------------------------
  // World size
  // ---------------------------------------------------------------------
  TILE: 64,          // pixel size of one map square
  MAP_COLS: 48,      // town width  in tiles (48 * 64 = 3072 px)
  MAP_ROWS: 36,      // town height in tiles (36 * 64 = 2304 px)

  // ---------------------------------------------------------------------
  // Player (on foot)
  // ---------------------------------------------------------------------
  PLAYER: {
    SPEED: 175,        // pixels per second at full joystick push
    HITBOX: 22,        // width/height of the square used for collision
    DRAW_SCALE: 1.25,  // makes the character easier for small eyes to follow
    TURN_SPEED: 14,    // how quickly the character swivels to face where they walk
    BOB_SPEED: 11,     // leg/arm swing rate while walking
  },

  // ---------------------------------------------------------------------
  // Cars
  // ---------------------------------------------------------------------
  CAR: {
    ACCEL: 430,          // pixels per second, per second
    MAX_SPEED: 340,      // top speed going forwards
    REVERSE_SPEED: 120,  // much slower backwards, on purpose
    DRAG: 1.7,           // how quickly it coasts to a stop
    TURN_RATE: 3.0,      // radians per second at speed
    TURN_MIN: 0.30,      // fraction of that available at a standstill, so a
                         // car nosed into a corner can always turn out of it
    BOUNCE: 0.32,        // speed kept after bumping something (soft, not bouncy)

    HITBOX: 40,          // square used for collision — deliberately smaller
                         // than the car looks, so it fits wherever it seems
                         // like it should and never wedges on a corner
    ENTER_RADIUS: 104,   // how close you must stand to get in. Measured from
                         // the car's centre, so it is stricter than it looks:
                         // this is roughly 'touching the side of the car'.

    CAR: { LENGTH: 62, WIDTH: 34 },
    VAN: { LENGTH: 74, WIDTH: 38 },
  },

  CAR_BODY_PALETTE: [
    '#FF6B6B', '#4EA8FF', '#FFD93D', '#6BCB77',
    '#C77DFF', '#FF9F45', '#4ECDC4', '#F78FB3',
  ],
  CAR_ROOF_PALETTE: [
    '#E05252', '#3A8CDB', '#E6BE2A', '#54AC61',
    '#A863DB', '#E08838', '#3FB0A8', '#DB7699',
  ],

  // ---------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------
  CAMERA: {
    // How fast the camera catches up to the player. Higher = snappier.
    // Lower = a lazier, floatier follow.
    LERP: 9,
    // The game is drawn at this height in "game pixels" and scaled to fit
    // the phone screen. Smaller number = more zoomed in.
    // 380 keeps the character comfortably big on a phone held sideways.
    VIEW_HEIGHT: 380,
    // Driving pulls the camera back so there is time to see a corner coming.
    VIEW_HEIGHT_CAR: 445,
    // How quickly the view changes between those two when getting in or out.
    ZOOM_LERP: 3.5,
  },

  // ---------------------------------------------------------------------
  // Touch controls
  // ---------------------------------------------------------------------
  JOYSTICK: {
    BASE_RADIUS: 62,   // the big outer ring
    KNOB_RADIUS: 30,   // the little thumb dot
    MAX_PUSH: 52,      // how far the knob can travel from the centre
    DEAD_ZONE: 0.14,   // ignore tiny wobbles below this (0..1)
    MARGIN_X: 100,     // resting position, from the left edge
    MARGIN_Y: 100,     // resting position, from the bottom edge
  },

  // ---------------------------------------------------------------------
  // Colours — bright, flat and cartoonish.
  //
  // Ground uses ONE flat colour per surface plus a light scattering of
  // detail on top. An earlier version alternated two shades in a checker
  // pattern and it read as a glitch rather than as texture.
  // ---------------------------------------------------------------------
  COLORS: {
    GRASS:        '#7BC950',
    GRASS_TUFT:   '#6CB944',
    PARK:         '#8FD95F',
    PARK_TUFT:    '#7DCA4D',

    ROAD:         '#8A94A3',
    ROAD_LINE:    '#FFE86B',
    KERB:         '#6E7889',   // the step down from pavement to road

    SIDEWALK:     '#E9E3D2',
    SIDEWALK_LINE:'#D8D1BB',   // paving-slab joints

    WATER:        '#4FC3F7',
    WATER_LIGHT:  '#7FD5FA',
    SAND:         '#F2DFA6',
    SAND_SPECK:   '#E6CF8E',

    TREE_LEAF:    '#3FA34D',
    TREE_LEAF_HI: '#57BE63',
    TREE_TRUNK:   '#8B5E3C',

    SHADOW:       'rgba(0,0,0,0.16)',

    SKIN:         '#F8C89B',
    HAT_TOP:      '#FFF0A8',   // the little button on the crown
    PANTS:        '#3B7DD8',
    SHOE:         '#5A6785',   // soft navy trainers, not black boots
  },

  // ---------------------------------------------------------------------
  // What Taras can change about himself and his car (milestone 3).
  //
  // Each list is what one row of the customisation menu offers. Adding a
  // colour here adds a dot to that row; nothing else needs touching.
  // ---------------------------------------------------------------------

  // Seen from above he wears a cap, so there is no hair or face to draw.
  // In every pair the brim is MUCH darker than the crown, on purpose: they
  // started out as near neighbours and the brim disappeared into the hat at
  // phone size, losing the very cue that shows which way he is facing.
  HAT_PALETTE: [
    { crown: '#FFD23F', brim: '#B87A0C' },   // yellow (default)
    { crown: '#FF6B6B', brim: '#B03B3B' },   // red
    { crown: '#4EA8FF', brim: '#2A6AB0' },   // blue
    { crown: '#6BCB77', brim: '#3C8547' },   // green
    { crown: '#C77DFF', brim: '#8442B0' },   // purple
    { crown: '#FF9F45', brim: '#BE6712' },   // orange
    { crown: '#4ECDC4', brim: '#2A857E' },   // teal
    { crown: '#F78FB3', brim: '#B25076' },   // pink
  ],

  SHIRT_PALETTE: [
    '#FF6B6B', '#4EA8FF', '#FFD93D', '#6BCB77',
    '#C77DFF', '#FF9F45', '#4ECDC4', '#F78FB3',
  ],

  // Roofs are the big colour you see from above, so they are the cheerful
  // ones. Walls are a deeper version of the same hue and show as a rim
  // around the roof, which is what makes a building look like it has height.
  // The two lists are matched up index for index.
  ROOF_PALETTE: [
    '#FF8FA3', '#FFB77D', '#FFE066', '#8FE06A',
    '#5FD3C4', '#7FB8FF', '#C79BFF', '#FF9E9E',
  ],
  WALL_PALETTE: [
    '#E06A80', '#E0955C', '#E0BE45', '#6FBF4C',
    '#41B3A5', '#5E95E0', '#A377E0', '#E07878',
  ],
};
