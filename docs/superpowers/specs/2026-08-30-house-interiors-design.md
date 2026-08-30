# House interiors and decorating — design

Date: 2026-08-30
Status: approved, ready for an implementation plan
Covers in full: milestones 1 and 2. Milestones 3–5 are sketches only.

## The problem

The town is finished and he stops playing after about fifteen minutes. Every
reward in the game pays out inside a single session — a job gives coins, coins
buy a colour, and there is nothing left that is different tomorrow.

Two things fix this, and they are related. **Somewhere of his own** that
changes because of him, and **rewards that arrive between sessions** rather
than within one. Interiors are the place; decorating, a pet, and growing things
are the reasons to come back to it.

## What already exists

Facts from the code, not assumptions:

- Houses are plain rectangles — `{ x, y, w, h, wall, roof, shop, seed }`,
  pushed in `_buildBuildings()` (`js/world.js:324`). No door, no window, no
  interior, no identity beyond `seed`, which is the index at generation time.
- The map makes **53 buildings — 43 houses and 10 shops** — deterministically.
  The same town every load, on every phone.
- **There is no interior concept anywhere.** This is a new subsystem.
- `findAction()` (`js/main.js:656`) already picks context for the one big
  button and returns a tagged object (`{ kind: 'enter', car }`,
  `{ kind: 'job', npc }`). New kinds slot in cleanly.
- `mode` is a two-value string, `ON_FOOT` / `DRIVING` (`js/main.js:81`).
- `_findDoorSteps()` (`js/missions.js:74`) already computes a point below each
  building's bottom edge, where the door is drawn. Doors exist visually and as
  delivery targets, but not as data.
- `js/save.js` is a disciplined localStorage wrapper — defaults merged on load,
  every access in try/catch, so old saves survive new fields.
- `js/net.js` syncs `x, y, angle, mode, hat, shirt, car, vehicle, name` and
  nothing else. No world state is ever shared.

## Decisions

**Every house is enterable and decoratable.** All 43. Shops too, eventually.

**A room is not a place on the map.** It is a separate space with its own
camera and its own collision, entered by switching `mode`. No surgery on the
tile grid, no doorways cut into buildings, no chance of walking out through a
wall into the middle of a block.

**Rooms are generated, never stored.** Size, wall colour, floor pattern, window
position and the fixed furniture all derive from `building.seed` by the same
hash the town already uses. All 43 rooms feel distinct and cost zero bytes.
This follows the rule the whole project runs on: the world is a pure function
of its seed.

**Only what he changes is saved.** `save.rooms[seed]` appears the first time he
puts something in that house. An unvisited house is absent from the save
entirely.

**Furniture is bought once and placed freely.** Buying a chair means he owns
chairs, and can put one in every house if he likes. The collection is the
reward; rearranging is free. A six-year-old should never lose a thing he paid
for by putting it in the wrong place — buy-per-placement would make every tap a
small risk, which is the opposite of what this should feel like.

**Decorating is local-only.** Nothing about a room is ever sent. This is not a
limitation to work around; it is the rule the project already keeps.

## Milestone 1 — doors and rooms

He can walk into any house and back out. Nothing to decorate yet.

### Doors become data

`_buildBuildings()` gains a `door: { x, y }` on each building — the point below
the bottom edge where the door is already drawn. `_findDoorSteps()` in
`js/missions.js` is then rewritten to read `b.door` instead of recomputing it,
so the door has exactly one definition. Jobs keep working unchanged.

### Getting in and out

`mode` gains a third value, `INSIDE`. `findAction()` gains two kinds:

- On foot, standing on a door: `{ kind: 'enter-house', building }`
- Inside, standing on the mat: `{ kind: 'leave-house' }`

Both use the big button he already presses to get into cars. **No new control
is introduced.** Entering must require being on foot — a car stays parked
outside.

Leaving puts him back on the doorstep facing away from the house, the way
`exitCar()` (`js/main.js:978`) places him beside a car.

### The room itself

New module **`js/interior.js`**, split deliberately in two:

- `roomFor(building)` — a **pure function returning plain data**: room size,
  wall and floor colours, window positions, the fixed furniture, and the list
  of decorating spots. No canvas, no DOM.
- `drawRoom(ctx, room, ...)` — everything that touches a canvas.

The split is not tidiness. `tests/run.mjs offline` runs in Node with no
browser, so a pure `roomFor` can be asserted directly — spots never overlap the
mat, never overlap fixed furniture, always sit on the floor — while the game
keeps its rule that no test-only code lives in the game.

A room contains, all from the seed:

- Walls in `building.wall`, so the inside matches the outside he just looked at.
- A floor pattern — boards or tiles.
- One or two windows on the back wall, showing sky.
- A mat at the bottom, which is the way out.
- **Two fixed pieces**, a bed and a rug, placed procedurally and not removable,
  so a house he has never touched still looks like somebody lives there rather
  than like an empty box.

### The outside world while he is inside

The town keeps updating — cars keep driving, neighbours keep walking — it is
simply not drawn. Coming back out to a frozen street would feel wrong, and the
update loop is cheap.

Other players are **not drawn while he is inside**, and a peer whose `mode` is
`INSIDE` is not drawn either. `updateGhosts()` (`js/main.js:875`) already gates
on `mode !== ON_FOOT`; `drawGhosts` needs the matching check. Sending a third
`mode` value over the wire is additive and safe — both peers always run the
same deployed build.

### Done when

He can walk to any of the 43 houses, press the button, be inside a room that
matches the house he was looking at, walk around it, and come back out onto the
same doorstep. Jobs still work.

## Milestone 2 — decorating

### Glowing spots

Each room has **four to six** soft pulsing spots on the floor, positioned from
the seed. Tapping one opens a picker of furniture; tapping a piece snaps it
into the spot. Tapping a filled spot offers to change or clear it.

Snapping is the point. It is always tidy, it needs no precision, and it works
with a thumb on a phone — which dragging does not.

### The picker

A compact overlay, not the full-screen shop. It reuses what the shop already
knows how to do: `Menu.priceOf` / `Menu.isUnlocked` (`js/ui.js:188`) extended
with a `'furniture'` row, `save.unlocked.furniture` alongside the existing
lists, and the same wobble-and-unhappy-note when there are not enough coins.

Furniture is pictures only, drawn by code in the manner of `drawHatPreview` and
`drawCarPreview` (`js/ui.js:693`). No binary assets, no text. Starting set:
chair, table, shelf, lamp, plant, picture, chest, stool.

### Storage

```
save.rooms      = { [seed]: { [spotIndex]: furnitureId } }
save.unlocked.furniture = [ furnitureId, ... ]
```

Sparse by construction. `defaultSave()` (`js/save.js:15`) gains `rooms: {}` and
the new unlocked list; the existing merge-over-defaults means old saves upgrade
with no migration.

### Why this makes the jobs matter

Coins currently buy a colour, which is a change he sees for a second. Coins
will now buy a thing that stays where he put it, in a room he can walk back
into tomorrow. That is the whole point of the milestone — not the furniture,
but giving the existing loop somewhere to accumulate.

### Deliberately not in this milestone

**Buying inside the ten shop buildings.** It is a good idea — it would give
shops a purpose and a reason to cross town — but making him walk to a shop
before every chair is friction at six years old. Buying happens at the spot.
Shop interiors can come later as a nicer *second* way to browse.

### Done when

He can buy a chair with job coins, put it in a house, close the game, reopen
it, walk back in, and the chair is still there.

## Milestones 3–5 — sketches

Not designed yet, on purpose. The pet should be designed after watching him use
a room, not guessed at now.

- **3 — A pet.** An animal found in town, fed, named, which follows him and
  lives in a house. Kids attach to creatures far faster than to objects; this
  is likely the strongest of the four and should probably come next.
- **4 — Growing things.** Seeds planted in pots or a garden that have visibly
  grown when he returns. The clearest between-sessions reward.
- **5 — Daily surprise.** Something different each day — a new item, a balloon
  hidden somewhere in town.

## Risks

- **`seed` is an array index.** Reordering generation renumbers every house and
  moves his furniture. The README already warns that generation order matters;
  this makes it load-bearing for saved data, and the note in `js/world.js`
  should say so.
- **Scope.** Interiors touch `main.js`, which is already ~1300 lines and
  described in `CLAUDE.md` as a dumping ground. Room logic belongs in
  `js/interior.js` from the first commit — resisting the pull to add another
  hundred lines to `main.js` is part of the work, not a nicety.
- **Two rooms, one child, one phone.** Not a risk yet, but the reason
  decorating stays local: shared decoration would need a new message type and a
  conflict story, and neither is worth it for a game two children play side by
  side.
