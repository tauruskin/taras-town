# Helicopters — design

Date: 2026-08-31
Status: approved, ready for an implementation plan
Branch: `helicopters` — to be reviewed before it goes anywhere near `main`

## What this is

Four helicopters standing on the map, bought once for **1000 coins**, and
flown. The most expensive thing in the game and the last thing he will own.

## What already exists, and can simply be used

Facts from the code, not assumptions:

- **A vehicle is a `CONFIG.VEHICLES` entry** with its own size, speed,
  acceleration and turning. The `Car` class reads all of that from the entry,
  so a new kind of vehicle is mostly a row of numbers.
- **`water: true` already marks a vehicle as "not a car".** `moveBox`'s
  `terrain` argument is `'land'` for wheels, `'water'` for a hull, `null` for
  a person. Flying needs a fourth answer, and it is the easiest one: nothing
  stops it.
- **Boats are already locked scenery.** `createBoats()` (`js/car.js:725`)
  moors them from the first load whether or not one has been bought, and
  `findCarToEnter()` skips them while `save.boat === null`. Helicopters want
  exactly this, and it is the reason a speedboat is visible in the river long
  before it can be afforded.
- **The camera already eases between zoom levels** — `VIEW_HEIGHT` 380 on
  foot, `VIEW_HEIGHT_CAR` 445 driving, blended by `ZOOM_LERP`.
- **The wire already carries which vehicle you are in.** `vehicleIndexOf()`
  sends whatever is actually being driven, so a peer in a helicopter is
  described correctly with **no protocol change at all**.
- **`pickSpawn()` (`js/main.js:1666`) already refuses a saved position inside
  something solid** and falls back to the town spawn. Quitting mid-flight is
  therefore already safe: the helicopter regenerates at its pad, and he
  restarts on the ground where he was.

## Decisions

**Bought, not found.** 1000 coins, above the ferry at 600. Four of them exist
from the first load as scenery.

**A third save slot.** `save.heli`, null until bought, beside `save.boat` and
`save.vehicle`. Buying a helicopter must not turn the car at the kerb into
one — the same reason boats have their own slot.

**Altitude is a yes or no, not a number.** He is on the ground or in the air.
The joystick is already movement and a six-year-old has no spare control axis
for climbing. Height is a *drawing* offset, not a coordinate.

**Nothing stops a helicopter in the air** except the edge of the map. This is
simpler than driving, not harder.

**Landing is where all the risk is**, and it gets the strictest rule in the
feature. See below.

**No new networking.** Decoration was kept local; flight does not need to be.
The vehicle index already on the wire is enough.

## Milestone 1 — a helicopter you can buy and fly

### The vehicle

A new entry in `CONFIG.VEHICLES`:

```
id: 'helicopter', price: 1000, shape: 'helicopter', air: true
```

`air: true` is the new flag, sitting beside `water: true`. Fast, and turns
tightly at any speed — a helicopter can rotate on the spot, so its `TURN_MIN`
is high where a bus's is low.

### Where the four stand

Placed by the same deterministic sweep that moors the boats, over open ground,
spread far apart so each one is a journey rather than a corner. Each gets a
**helipad** drawn under it: concentric rings.

**No letter H.** "Almost no text" means a letter is a picture he would have to
be taught, and this game has spent a lot of effort avoiding exactly that.

### Flying

`moveBox` gains no new terrain case, because flight does not use it: while
airborne the helicopter moves freely and is clamped to the map edge, the same
shape as the indoor movement in `main.js`. No solids, no water, no cars.

It is **drawn raised** by `CONFIG.HELI.ALTITUDE` with its shadow left on the
ground below it. That offset is what makes it read as flying; without the
shadow it is a car with a fan on the roof. Taking off and landing ease the
offset over about half a second rather than snapping.

It draws **above the tree canopies**. Today the order is ground → buildings →
player → canopies → badges, so this is a new layer near the top.

The camera pulls back to `VIEW_HEIGHT_AIR`, reusing the easing that already
blends walking and driving.

### Landing — the strict part

Three bugs of exactly this shape turned up while interiors were built, and the
rule they produced is in `CLAUDE.md`: **a child must always be able to get out
of whatever he is in.**

Landing is offered only when all of these hold:

1. **It is land.** Not water — no helicopter bobbing on the river.
2. **The helicopter itself fits**, with its own footprint clear of buildings,
   trees and other vehicles.
3. **There is somewhere for him to step out onto**, by the same
   `findExitSpot` rule a car already uses.

If any fails, the action button **does not offer landing at all** and the
unhappy note plays — the existing `exitCar` "no room, refuse politely"
behaviour, which already works and which he has already met.

He can therefore always keep flying, and flying is always safe. The worst
outcome available is having to move somewhere else before landing, which is a
thing he can see and understand.

### Sound

The rotor is `sounds/heli.m4a`, cut from the `helicopter_sound.aac` already in
`D:\Taras-Town-Sound-Ref`, measured and trimmed the way the footsteps were —
looping while airborne, started on take-off and stopped on landing.

It must be **prepared outside the repo and committed once**. Anything put in
`sounds/` is downloaded on install and stays in git history for ever;
`tests/offline/pwa.mjs` holds that folder to 1200KB and it is currently at
831KB, so there is room for one small loop and not much else.

### Done when

He can save 1000 coins, buy a helicopter, walk to one of the four, take off,
fly over the river and the houses, and land on the far side — and cannot land
anywhere that would strand him.

## Deliberately not in this

- **No altitude control.** Covered above.
- **No passengers.** The "give a friend a lift" job is a car job and stays one.
- **No helicopter jobs.** Flying is the reward; it does not also need errands.
- **Nothing about other players' flight beyond drawing them raised.** No new
  messages, no shared airspace rules. They are not solid in the air for the
  same reason they are not solid on the ground.

## Risks

- **Flight makes the river, the islands and the boats optional.** At 1000
  coins it is the last thing he buys, so it reads as an end-game reward rather
  than a shortcut past the game — but expect him to fly everywhere afterwards,
  and expect the boats to go quiet.
- **Draw order is easy to get subtly wrong.** A helicopter drawn under a tree
  it is flying over is the obvious failure; a shadow drawn *over* a building
  is the less obvious one.
- **`sounds/` has a budget for a reason.** One loop, prepared outside the
  repo, committed once. Iterating on it in git costs the size of every
  version, permanently.
- **The shop row getting longer turned out to be fine, and this was checked
  rather than assumed.** The row spacing is derived from whichever row has the
  most items (`js/ui.js:41`), so a ninth vehicle tightens the gap for *every*
  row, colour swatches included. Simulated with a ninth entry pushed into
  `CONFIG.VEHICLES`: all nine dots land on screen at all seven supported sizes,
  and all 33 swatches still answer their own tap at the ±12px aim margin. No
  layout work is needed. `tests/offline/menu-buttons.mjs` guards this for real
  once the entry exists.
