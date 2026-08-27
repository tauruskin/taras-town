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
and the round button on the right to get in and out of a car.

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
- [ ] 3 — Customising the character and the cars.
- [ ] 4 — Friendly errands to run for the neighbours.
- [ ] 5 — Coins to collect and things to unlock with them.
- [ ] 6 — A silly game of tag with the town helper.

## Two hitboxes per car, on purpose

A car has two different collision boxes, and they are not interchangeable:

- **`half`** (40px square) is what the car itself uses to move around town.
  It is deliberately smaller than the car looks, so a child driving badly
  never wedges the car on a corner.
- **`boundsBox()`** is the car's real footprint, and it is what *other* things
  collide with. Using the small box here let the player walk up onto the
  bonnet and stand on the car.

If you change one, think about whether the other should follow.
