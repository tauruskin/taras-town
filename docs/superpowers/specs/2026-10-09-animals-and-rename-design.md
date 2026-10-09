# Animals, a best friend, and «Місто пригод» — design

Date: 2026-10-09. Scope: `games/taras-town/` plus the hub tile in `index.html`.

## 1. Rename

The visible name becomes **«Місто пригод»**: the hub tile's `.name` and
`aria-label` (`index.html`), and `<title>` and `<h1>` in
`games/taras-town/index.html`. The folder `games/taras-town/`, its URL, the
service-worker cache paths and every `localStorage` key stay as they are —
renaming them would orphan his saves and the installed home-screen app.
Internal comments and docs may keep "Taras Town". Touching the hub's
`index.html` means **both games' full suites run before the push**.

## 2. What he gets

Five kinds of animal live around town: dog, cat, duck, small bird, hen.
Walking up to one makes the action button show a hand; pressing it pats the
animal (hearts, a hop, its own synthesised sound). The patted animal becomes
his **best friend** and follows him. There is exactly one best friend at a
time: patting another one swaps — the old friend walks home.

When he goes where the friend cannot follow — gets into any vehicle, goes into
a house, or (for cat, hen, bird on foot) into water — the friend **sits and
waits**, looking up and wagging. If he comes back within `WAIT_TIME` (30 s) it
follows again; otherwise it wanders home. Dogs and ducks swim after him.

**A bird friend flies alongside the helicopter**: at take-off it does not wait
but rises with him, drawn at the helicopter's `lift`, with a ground shadow;
on landing it hops after him again.

Nothing about the friend is saved. A reload puts every animal at home.

## 3. Placement — `world.animalSpots`

Computed by a new `_findAnimalSpots()` called as the **last** step of the
`World` constructor, after `neighbourSpots`, `parking` and `_mainland`. That
placement is deliberate: appending cannot move a neighbour, a parking spot, or
a `building.seed` (which keys his furniture).

Uses the existing `sweepSpots(matchFn, …)` helper (overlap, openness and
minimum-separation checks):

| Kind | Where |
|---|---|
| duck | grass/sand tiles adjacent to the duck pond prop and the river bank |
| bird | next to park trees |
| dog  | park and pavement tiles |
| cat  | back-garden grass (leftover grass inside blocks) |
| hen  | back-garden grass |

Each spot is `{id, kind, x, y}`; `id` is the index in the array. Deterministic,
so every phone agrees. Per-kind counts, sizes, colours, speeds and timings live
in a new `CONFIG.ANIMALS` block — about 20–30 animals in total.

## 4. `js/animals.js` (new; nothing about animals goes into `main.js` beyond wiring)

- `class Animal` — home spot, `x, y`, `state`, `stateTime`, `draw(ctx, time, lift)`.
- `class Animals` — owns all animals, `bestFriend` (an `Animal` or `null`),
  `update(dt, player, ctx)`, `pat(animal)`, `nearest(x, y, reach)`,
  `visible(view)`.

State machine — states change only on a timer, a distance or a contact, never
at random:

| State | Behaviour | Leaves when |
|---|---|---|
| idle | pottering near home: a fixed wobble from time and id | patted → happy |
| happy | ~1 s of hearts and hop | timer → following |
| following | moves toward a point ~40 px behind him | he enters vehicle/house, or a land-only animal reaches water → waiting; bird + take-off → flying; another animal patted → home; patted itself → happy |
| waiting | sits by where he left, wags | he is within 60 px on foot → following; patted → happy; `WAIT_TIME` passes → home |
| flying (bird only) | beside the helicopter at its `lift` | helicopter lands → following |
| home | walks back to its spot | arrives → idle |

Following moves straight at its target and is **never solid and never blocked**
— like cover, it passes over everything. If it falls more than ~400 px behind
(e.g. he sprinted round a block) it is placed just behind him off screen, so it
can never get stranded behind a house. Going home does the same jump when far
off screen.

Mode inputs come from what `main.js` already has: `mode` (ON_FOOT / DRIVING /
INSIDE), `isFlying()`, `lift`, `player.swimming`. Flying stays
`mode === DRIVING` with an air vehicle — no new mode.

## 5. Patting

- `findAction()` (main.js) adds `{kind:'pat', animal, d}` for the nearest
  animal within reach while on foot; it competes on distance with jobs and
  doors exactly like today. The current best friend can be patted again at
  any time: it does its happy hop, hearts and sound, stays his friend, and
  goes back to following (from waiting too). Patting never removes a friend.
- The press dispatcher gets one branch: `pat` → `animals.pat(action.animal)`.
- `drawActionButton()` gets its own hand-icon branch — the existing fallback
  calls `drawMissionIcon(action.npc.mission)` and would throw.
- `audio.js` gains `playWoof`, `playMeow`, `playQuack`, `playTweet`,
  `playCluck`, built from `note` and `burst` like `playPickup`. They honour
  `save.muted`. **No new audio files**; the closed list in `sounds/` is
  untouched.

## 6. Drawing

All shapes, no images. Ground animals draw immediately after the NPCs, so
canopies (bushes) still draw over them. A flying bird draws after the
canopies, beside the flying helicopter body, with its shadow drawn with the
helicopter's shadow. Off-screen animals are culled like NPCs.

## 7. Multiplayer

Each player's broadcast state gains one field, `friend`: an animal id or `-1`.
It is added in the send (main.js state object) and in the host's explicit
roster copy in `net.js`. Each phone draws that animal trailing the ghost —
same drawing, simple follow, none of the rules. The real animal at home stays
where it is on that phone; two children can both have the same dog.
A missing or unknown value means no friend, so an older peer is harmless.

`CLAUDE.md`'s "nothing leaves the phone" rule is updated to say: position, a
name, and which animal is following — an index into a map every phone already
has.

## 8. Rules check

- Nothing scary: animals are friendly, nothing chases or bites, no animal can
  be harmed.
- No text: the hand icon and the animals are pictures.
- Always able to get out: animals are never solid, so none can wedge him.
- No image files: all drawn. No test-only code.

## 9. Tests

Offline `tests/offline/animals.mjs`:
- `animalSpots` are identical across two `new World()` builds.
- No spot is on water (ducks stand on the bank) and none overlaps a solid;
  every duck is within 2 tiles of water.
- `neighbourSpots`, `parking` and building seeds are unchanged by the addition
  (compare against values captured before the change).
- Exactly one best friend after any sequence of pats; re-patting the friend
  (following or waiting) keeps it and returns it to following.
- Each transition fires: pat → happy → following; vehicle → waiting;
  return → following; `WAIT_TIME` → home → idle; bird + take-off → flying at
  `lift`; land → following; land-only animal at water → waiting.
- Catch-up jump keeps a follower within ~400 px.

Browser `tests/browser/pat.mjs`:
- Find a dog in Node, walk to it with the existing walker, tap the action
  button at `Menu.actionPos`, walk away, and read canvas pixels to confirm
  something of the dog's colour is near the player.
- Screenshots at 568×320 and 740×280.

## Out of scope

Feeding, naming, saving the friend, animals reacting to cars, flocks, more
kinds. Each can come later on top of the state machine.
