# Taras Town

A friendly little open-world town you can wander around, made for a 6-year-old.
Top-down view, touch controls, no violence, nothing scary — just a bright
cartoon town with houses, shops, a park and a river.

**Play:** https://tauruskin.github.io/taras-town/

---

## How it's built

Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies.
**The files in this repository are exactly the files that get served** — what
you see here is what runs on the phone.

Nothing is loaded from another website, and there are no image or sound files:
every tree, house and character is drawn with shapes by the code. That keeps
the whole game tiny and means nothing can break because an external service
changed.

There is no server, no database and no account. The only thing stored is a bit
of progress in the browser's own `localStorage`, which never leaves the phone.

## Controls

On a phone: the joystick on the left half of the screen (grab it anywhere),
the round button on the bottom right to get in and out of a car, and the
palette button in the top right to change colours.

On a computer, for testing:

| Key | Does |
|---|---|
| `W` / `A` / `S` / `D` | Up / left / right / down. Arrow keys work too. |
| `Space`, `E` or `Enter` | Get in or out of a car — the same as the round button. |

The keyboard produces the same direction the joystick does, rather than being
wired in separately. So on foot it's the way he walks, and in a car it's the
heading the car steers towards — one control model, whichever you use.

## Running it on your own computer

The JavaScript uses ES modules, which browsers refuse to load from a
double-clicked file. Serve the folder instead:

```
python -m http.server 8777
```

Then open <http://127.0.0.1:8777/> and press play.

## Publishing an update

```
git add -A
git commit -m "what changed"
git push
```

GitHub Pages usually takes about a minute to catch up. If the phone still shows
the old version after that, pull down to refresh the page.

## The files

| File | What it does |
|---|---|
| `index.html` | The page. Must stay at the repository root so GitHub Pages serves it with no configuration. |
| `css/style.css` | Full-screen layout, the tap-to-start panel, the "turn your phone" screen. |
| `js/config.js` | **Every tunable number and colour.** Start here to change how anything feels. |
| `js/main.js` | Starts the game, runs the loop, draws the on-screen controls. |
| `js/world.js` | The town: map layout, buildings, trees, and everything solid. |
| `js/player.js` | The character on foot. |
| `js/car.js` | The parked cars, how they drive, and where they are parked. |
| `js/camera.js` | Follows the player, never scrolls past the edge of town. |
| `js/input.js` | The touch joystick, and the keyboard controls. |
| `js/ui.js` | The customisation menu: the colour rows and the pictures beside them. |
| `js/npc.js` | The neighbours who hand out jobs, and their badges. |
| `js/missions.js` | Jobs: where they send you, and when they are finished. |
| `js/coins.js` | The coins lying around town. |
| `js/net.js` | Playing together. Only ever loaded when a `?room=` is present. |
| `js/vendor/` | The one piece of third-party code. See the README in there. |
| `js/effects.js` | Confetti and the floating coin when a job is done. |
| `js/audio.js` | Little sounds, generated live. There are no sound files. |
| `js/save.js` | Saving progress. Every read and write is wrapped in try/catch so a broken or empty save can never stop the game starting. |

### Want to change something?

Almost everything worth adjusting lives in **`js/config.js`** — walking speed,
how zoomed-in the camera is, the size of the joystick, every colour. Change a
number, reload the page.

To rearrange the town itself, see the layout description at the top of
`js/world.js`: the road positions and the list of buildings are written out
there in map squares, not pixels.

## Notes for whoever works on this next

- **Never use a leading `/` in a path.** GitHub Pages serves this from
  `/taras-town/`, so `/css/style.css` would look for it at the top of the whole
  site and silently fail. Relative paths only.
- The game is landscape-only. Phone browsers ignore the JavaScript
  orientation-lock API (iPhone Safari has never supported it), so the thing that
  actually enforces this is the CSS overlay in `style.css`.
- The map is a grid of 64-pixel squares, 48 across and 36 down. Only the squares
  currently on screen are drawn.

## Milestones

- [x] **1 — Walking.** Explore the town on foot: roads, pavements, houses,
      shops, a park with a fountain and a pond, a river. Solid collision,
      following camera, touch joystick, position saved between visits.
- [x] **2 — Driving.** Ten cars parked around town. Walk up to one and a green
      button appears; press it to get in, press it again to get out. Steering
      is "point where you want to go", with a turning circle, momentum and
      soft bumps. The camera pulls back while driving.
- [x] **3 — Customising.** A palette button in the top corner opens a menu with
      three rows of colour dots: hat, shirt and car. Choices apply the instant
      they're tapped and are remembered between visits. No text anywhere.
- [x] **4 — Errands.** Four neighbours stand around town with a picture over
      their head showing what they need. Walk up, press the button, and
      somewhere lights up with a beacon; an arrow pins to the screen edge while
      it is off-screen. Arriving pays coins with confetti and a fanfare.
      The four: **take a pizza to a front door**, **find a lost teddy**,
      **give a friend a lift to the park**, and **follow a race course**.
- [x] **5 — Coins and the shop.** 90 coins lie around town, on pavements, grass
      and roads, so they can be collected on foot or at speed in a car. A
      collected one comes back after 45 seconds. The colour menu is now also
      the shop: the first three colours in each row are free, the rest cost 10
      coins and show a price tag — dark when you cannot afford it, gold when
      you can.
- [x] **6 — Playing together.** Open the same `?room=` link on two phones on
      the same wifi and you can see each other walking and driving around the
      same town, in each other's chosen colours. A badge at the top shows how
      many of you there are.
- [ ] 7 — A silly game of tag with the town helper.

## Two hitboxes per car, on purpose

A car has two different collision boxes, and they are not interchangeable:

- **`half`** (40px square) is what the car itself uses to move around town.
  It is deliberately smaller than the car looks, so a child driving badly
  never wedges the car on a corner.
- **`boundsBox()`** is the car's real footprint, and it is what *other* things
  collide with. Using the small box here let the player walk up onto the
  bonnet and stand on the car.

If you change one, think about whether the other should follow.

## Adding a colour to the menu

Add an entry to `HAT_PALETTE`, `SHIRT_PALETTE` or `CAR_BODY_PALETTE` (plus the
matching `CAR_ROOF_PALETTE` entry) in `js/config.js`. The menu builds its rows
from the length of those lists, so a new dot appears on its own and the row
re-spaces itself to fit.

Choices are saved as **positions in those lists**, not as colour strings. So
editing a palette entry restyles everyone who had picked it, rather than
leaving old saves pointing at a colour that no longer exists.

## Where jobs send you

Delivery addresses and hiding places are **worked out from the map when the game
starts**, not typed out as coordinates. Every house's doorstep is taken from the
building itself, so adding a building to `js/world.js` gives it a delivery
address for free.

Both lists are filtered on *openness* — the fraction of directions you can walk
away from a spot. Anything below 45% is dropped.

This matters more than it sounds. An earlier version listed destinations as
literal coordinates. Several were **inside buildings**, and `findFreeSpot`
quietly rescued them by shifting up to 182px, so a "front door" was nowhere near
a door. Two others sat in gaps only 8% open: reachable on paper, but a child
would just bump around in them. Hand-typed coordinates rot as the town changes;
derived ones cannot.

## How a job works

Every job is the same thing underneath: a **list of places to reach, in order**.
Most have one. The race has four, and reaching one lights up the next. That is
the only difference between a delivery and a race — there is no separate race
code path.

Nothing can be failed and there is no timer, not even on the race. A child who
wanders off to look at the river comes back to a job still waiting.

To add a fifth kind: add a `mission` name to a neighbour in `js/npc.js`, a
picture for it in `drawMissionIcon` in `js/ui.js`, and a list of destinations in
the `Missions` constructor. Nothing else needs touching.

## Coins

Where they lie is worked out from the map, the same way job destinations are,
so they are never inside a wall and always reachable. Because that calculation
is deterministic, **which coins are currently collected is deliberately not
saved** — only the total is. Every session starts with a full town.

One consequence needed handling: closing the game while standing on a coin and
reopening it used to hand out a free coin every single time. `clearAtStart`
quietly removes whatever you were standing on, without paying for it.

## Playing together

Add `?room=` and a name of your own to the address, and open that same link on
both phones:

```
https://tauruskin.github.io/taras-town/?room=our-secret-name-4821
```

Whoever opens it first hosts; everyone else joins them. **Only people you send
that link to can join**, so pick something nobody would guess.

### How it works, and what it costs

The phones talk **directly to each other** over the local wifi. The only
outside help is a free introduction service, which is needed because a browser
cannot listen for incoming connections on its own — it tells the two browsers
how to find each other and then gets out of the way. No game data ever goes
through it.

`js/vendor/peerjs.min.js` is the only third-party code in the project. It is
checked in rather than loaded from a CDN, and **it is only downloaded when
there is a `?room=` in the address**. Playing on your own never fetches it.

### What is deliberately not there

No chat. No typed names. No way to send words or pictures between players. The
only things that ever cross the wire are where somebody is and what colour
their hat is — there is a test that fails if that ever stops being true.

Coins, jobs and unlocks stay entirely on each phone. Nobody can spend anybody
else's coins, and nobody can be pushed around: other players are drawn and
nothing more. They do not collide with you.

### If it doesn't connect

The game carries on perfectly well on its own — that is the only thing that
happens. Check both phones are on the same wifi and using the exact same link.

One thing worth knowing: switching away from the game stops your character
moving for everyone else, and after a few seconds the others stop showing you
at all. Switch back and you reappear.
