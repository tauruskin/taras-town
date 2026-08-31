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
  // The town is generated from these two numbers, so making it bigger is a
  // matter of changing them: the roads, the blocks between them, the houses
  // that fill those blocks, the parks and every hiding place are all worked
  // out from the size. Nothing is typed out square by square.
  MAP_COLS: 96,      // town width  in tiles (96 * 64 = 6144 px)
  MAP_ROWS: 72,      // town height in tiles (72 * 64 = 4608 px)

  // ---------------------------------------------------------------------
  // Player (on foot)
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // The controls on screen
  // ---------------------------------------------------------------------
  UI: {
    // Radius of the little round buttons in the top corner, and of the big
    // action button. One number so they stay in proportion with each other.
    BUTTON_R: 21,
    ACTION_R: 37,

    // Gap between the corner buttons, and how far the row sits from the edge.
    BUTTON_GAP: 10,
    EDGE: 16,
  },

  // Where the neighbours stand.
  //
  // On the world rather than in npc.js because the parked cars have to keep
  // off these squares — both want the pavement — and only the world can tell
  // the two of them the same thing.
  NEIGHBOURS: {
    NEAR_START: 4,      // one of each job kind, within a short walk of the start
    EXTRA: 8,           // and this many more, spread across the rest of town
    MIN_FROM_SPAWN: 150,
    NEAR_GAP: 320,      // how far apart the first few stand
    FAR_GAP: 1100,      // and the rest, so the town does not feel crowded
  },

  // Everything about the insides of houses.
  INTERIOR: {
    DOOR_STEP: 26,     // how far outside the front wall the doorstep sits
    ENTER_RADIUS: 46,  // how close to a door he must be to walk in

    TILE: 96,          // one floor square inside a house
    // How deep every room is, in floor squares. THREE, not four, because the
    // phone is held sideways: four rows made a room 384px tall, which is
    // taller than an iPhone SE in landscape is high. The mat is on the front
    // wall, so an overflowing room put the only way out below the bottom of
    // the screen — a room a child could walk into and not get out of.
    // The room is also scaled to fit in main.js, which covers the sizes this
    // still does not, but it should not need rescuing on an ordinary phone.
    ROWS: 3,
    WALL: 30,          // the band of wall drawn across the back
    MAT: { w: 84, h: 34 },   // the way out, on the front wall
    SPOT_R: 26,        // a decorating spot's radius

    MIN_SPOTS: 4,
    MAX_SPOTS: 6,

    // Floors, picked per house. Warm and domestic — nothing gloomy.
    // Two of these used to be the exact colours of things that stand ON them
    // — one was the furniture wood, one was the plant pot — so those pieces
    // vanished into the floor. The outline in furniture.js is what really
    // fixes that, but there is no reason to keep asking it to rescue a
    // straight collision, so the clashing two are gone.
    FLOORS: ['#C9A227', '#D9C9A8', '#9FB07A', '#CBA6B0', '#8FA9B8'],
  },

  // What can be put in a room. Bought once, then placed as often as he likes
  // in as many houses as he likes — buying a chair means he owns chairs.
  // Paying per placement would make every tap a small risk, which is the
  // opposite of what decorating should feel like at six.
  //
  // The first two are free so an empty purse can still change something.
  FURNITURE: [
    { id: 'stool',   price: 0 },
    { id: 'chair',   price: 0 },
    { id: 'table',   price: 12 },
    { id: 'lamp',    price: 12 },
    { id: 'plant',   price: 18 },
    { id: 'shelf',   price: 18 },
    { id: 'picture', price: 24 },
    { id: 'chest',   price: 24 },
  ],

  PLAYER: {
    SPEED: 175,        // pixels per second at full joystick push
    SWIM_SPEED: 0.62,  // how much of that speed he manages in the water
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

    // The square a vehicle uses to move around town, worked out from its
    // width. Deliberately smaller than the vehicle looks, so it fits wherever
    // it seems like it should and never wedges on a corner — but no longer
    // one fixed number for everything, or a bus would be as nimble as a
    // hatchback. Clamped at both ends so nothing is ever absurd.
    HITBOX_FROM_WIDTH: 1.05,
    HITBOX_MIN: 34,
    HITBOX_MAX: 48,
    ENTER_RADIUS: 104,   // how close you must stand to get in. Measured from
                         // the car's centre, so it is stricter than it looks:
                         // this is roughly 'touching the side of the car'.

  },

  // ---------------------------------------------------------------------
  // The vehicles, in the order they appear in the shop.
  //
  // Each one DRIVES differently, not just looks different. A bus that only
  // looked like a bus would make 400 coins buy a repaint; making it genuinely
  // lumbering, and the sports car genuinely darty, is what makes saving up
  // for one worth doing.
  //
  // Sizes are in pixels. A road is two 64px squares wide, so nothing here
  // should get near 128 long or it could never turn a corner.
  // ---------------------------------------------------------------------
  // Everything you can get into and drive.
  //
  // The last two float. A `water: true` vehicle is the exact opposite of the
  // others: it is stopped by land instead of by water, it is moored in the
  // river rather than parked on the road, and it is chosen separately — buying
  // a speedboat must not turn the car on the driveway into a speedboat.
  VEHICLES: [
    {
      id: 'car', price: 0, shape: 'car',
      LENGTH: 62, WIDTH: 34,
      MAX_SPEED: 340, ACCEL: 430, TURN_RATE: 3.0,
      wheel: 1.0,
    },
    {
      id: 'van', price: 0, shape: 'van',
      LENGTH: 74, WIDTH: 38,
      MAX_SPEED: 300, ACCEL: 360, TURN_RATE: 2.6,
      wheel: 1.0,
    },
    {
      // Chunky and eager. A little quicker off the mark than the car and
      // slightly tighter round a corner, so the first thing bought is
      // noticeably better rather than merely different.
      id: 'jeep', price: 100, shape: 'jeep',
      LENGTH: 66, WIDTH: 40,
      MAX_SPEED: 330, ACCEL: 470, TURN_RATE: 3.1,
      wheel: 1.3,
    },
    {
      // Fast and darty. Deliberately not SO fast that the town becomes hard
      // to steer round — about a third quicker than the car, no more.
      id: 'sports', price: 200, shape: 'sports',
      LENGTH: 64, WIDTH: 32,
      MAX_SPEED: 440, ACCEL: 620, TURN_RATE: 3.4,
      wheel: 0.9,
    },
    {
      // Enormous wheels, small cab, and slow. The wheels stick out well past
      // the body, which is the whole point of it.
      id: 'monster', price: 300, shape: 'monster',
      LENGTH: 68, WIDTH: 44,
      MAX_SPEED: 285, ACCEL: 390, TURN_RATE: 2.3,
      wheel: 2.0,
    },
    {
      // The slowest thing in town and much the longest. Turning it round on
      // a two-lane road is meant to be a bit of a job.
      id: 'bus', price: 400, shape: 'bus',
      LENGTH: 98, WIDTH: 42,
      MAX_SPEED: 250, ACCEL: 280, TURN_RATE: 1.9,
      wheel: 1.05,
    },
    {
      // The first boat. Light and quick, so the reward for saving up 500 is
      // that the river suddenly feels small.
      id: 'speedboat', price: 500, shape: 'speedboat', water: true,
      LENGTH: 70, WIDTH: 30,
      MAX_SPEED: 400, ACCEL: 380, TURN_RATE: 2.3,
      wheel: 0,
    },
    {
      // The big one. Slow and steady and enormous, which is its own kind of
      // fun: it is the bus of the river.
      id: 'ferry', price: 600, shape: 'ferry', water: true,
      LENGTH: 104, WIDTH: 46,
      MAX_SPEED: 300, ACCEL: 250, TURN_RATE: 1.7,
      wheel: 0,
    },
    {
      // The most expensive thing in the game, and the last thing he will own.
      //
      // `air` is the sibling of `water`: it decides what stops the thing.
      // Nothing does, up there. It is quick, and it turns on the spot — a
      // TURN_MIN of nearly 1 means it steers just as well hovering as at
      // speed, which is what makes looking around from up there possible.
      // A bus is the opposite and deliberately so.
      //
      // Friendly and bright. A sightseeing helicopter, never a military one.
      id: 'helicopter', price: 1000, shape: 'helicopter', air: true,
      LENGTH: 76, WIDTH: 34,
      MAX_SPEED: 420, ACCEL: 400, TURN_RATE: 3.4, TURN_MIN: 0.95,
      wheel: 0,
    },
  ],

  CAR_BODY_PALETTE: [
    '#FF6B6B', '#4EA8FF', '#FFD93D', '#6BCB77',
    '#C77DFF', '#FF9F45', '#4ECDC4', '#F78FB3',
  ],
  CAR_ROOF_PALETTE: [
    '#E05252', '#3A8CDB', '#E6BE2A', '#54AC61',
    '#A863DB', '#E08838', '#3FB0A8', '#DB7699',
  ],

  // ---------------------------------------------------------------------
  // Jobs for the neighbours
  // ---------------------------------------------------------------------
  MISSION: {
    REWARD: 5,           // coins for finishing an ordinary job
    RACE_REWARD: 12,     // more for a race, which takes longer
    OFFER_RADIUS: 92,    // how close to stand to be offered a job
    ARRIVE_RADIUS: 62,   // how close counts as "arrived" at the destination

    RACE_CHECKPOINTS: 4,
    // Checkpoints are more forgiving than a doorstep: they are usually taken
    // at speed, and missing one by a metre and having to loop round is the
    // sort of thing that ends the game for a 6-year-old.
    RACE_ARRIVE_RADIUS: 84,
  },

  // ---------------------------------------------------------------------
  // Coins lying around town
  // ---------------------------------------------------------------------
  COIN: {
    SPACING: 210,        // how far apart they lie
    MIN_OPENNESS: 0.40,  // never tucked into a corner you can't reach
    PICKUP_RADIUS: 34,   // generous: you should not have to aim at one
    RESPAWN_SECONDS: 45, // a collected coin comes back, so the town never
                         // runs permanently dry
  },

  // ---------------------------------------------------------------------
  // The shop
  // ---------------------------------------------------------------------
  SHOP: {
    // The first few colours in every row cost nothing, so there is always
    // something to change even with an empty purse.
    FREE_PER_ROW: 3,
    PRICE: 10,
  },

  // ---------------------------------------------------------------------
  // Playing together (only used when there is a ?room= in the address)
  // ---------------------------------------------------------------------
  NET: {
    SENDS_PER_SECOND: 10,      // plenty: the drawing smooths between updates
    JOIN_TIMEOUT_MS: 9000,     // give up quietly rather than hanging the game
    FORGET_AFTER_SECONDS: 4,   // drop a player who has gone quiet, so a phone
                               // that leaves doesn't leave a statue behind
    SMOOTHING: 12,             // how quickly other players slide to where
                               // they actually are, between updates
    RETRY_SECONDS: 5,          // how long to wait before trying to rejoin
                               // after losing touch with everybody
    SILENCE_SECONDS: 6,        // a guest hearing nothing for this long treats
                               // the host as gone. A connection that simply
                               // stops carrying anything does not reliably
                               // report itself as closed, so waiting to be
                               // told is not enough
  },

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
