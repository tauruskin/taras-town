# Claude Code Prompt: "Rolling Ball" Platformer (Red Ball 4-inspired)

Copy everything below into Claude Code to build the game.

---

Build a 2D physics-based platformer game for my personal GitHub Pages "games hub," heavily inspired by **Red Ball 4** (a rolling ball hero, momentum-based movement, spikes/saws/enemies, and an end-of-level goal). Do not use any copyrighted Red Ball 4 assets, names, or logos — this should be an original game that captures the same gameplay feel with its own visual identity.

## Tech requirements

- Vanilla JavaScript + HTML5 Canvas. No build step, no bundler, no framework dependencies — the game must run by opening `index.html` directly or via a static file server (this matters because it needs to drop cleanly into a static GitHub Pages games hub alongside other games).
- Organize code into clean, separate modules (e.g. `game.js`, `physics.js`, `player.js`, `levels.js`, `enemies.js`, `input.js`, `ui.js`) loaded as ES modules or plain scripts — your choice, but keep `index.html` thin.
- Target desktop browsers first, with keyboard controls (arrow keys / WASD to roll, spacebar to jump). Add on-screen touch controls (left/right + jump buttons) as a stretch goal so it's playable on mobile too.
- 60fps game loop using `requestAnimationFrame`, with delta-time-based physics so speed is consistent across devices.

## Core mechanics (must-have)

- **Player**: a ball character controlled with rolling physics — acceleration/deceleration (not instant velocity changes), gravity, and momentum that carries into jumps. The ball should visually rotate as it rolls, matching its horizontal speed.
- **Jumping**: a satisfying jump arc with a bit of jump-buffering/coyote-time forgiveness so it doesn't feel stiff. Support jumping off moving platforms.
- **Collision & terrain**: solid ground/platform collision, slopes or ramps the ball can roll up/down, and moving platforms (horizontal and vertical).
- **Hazards**: spikes (instant fail/respawn on touch), rotating saw blades, and crushers/moving obstacles that can pop or damage the ball.
- **Enemies**: 2-3 simple enemy types with basic patrol/chase AI (e.g. a rolling spike ball, a walking blob, a stationary turret that shoots projectiles). The player should be able to defeat some enemies by bouncing on top of them (like squashing), similar to Red Ball 4.
- **Collectibles**: stars or gems scattered through each level, tracked as a per-level score/collection count.
- **Goal/finish**: a clear end-of-level flag or star-gate that completes the level and shows a results screen (time, collectibles gathered).
- **Lives/respawn**: the player has a limited number of lives per level; touching a hazard or falling off the map costs a life and respawns at the last checkpoint; running out of lives returns to the level-select or main menu.

## Levels & progression

- Build **4-5 levels** of increasing difficulty, each with a distinct layout, hazard mix, and difficulty curve (start simple — flat ground and basic jumps — and ramp up to moving platforms, saws, and enemies combined).
- Store level layouts as data (e.g. JSON or plain JS objects describing platforms, hazards, enemies, collectibles, and the goal position) rather than hardcoding pixel-by-pixel drawing — this makes levels easy to tweak or add to later.
- Build a **level-select screen**: a grid or row of level tiles showing level number, a lock icon for levels not yet unlocked, and a star rating based on collectibles gathered. Completing a level unlocks the next one.
- Save progress (unlocked levels, best times, stars collected) to `localStorage` so progress persists between visits.

## Screens & UI

- **Main menu**: game title/logo, "Play" button (goes to level select), and a simple "How to Play" / controls screen.
- **Level-select screen**: as described above.
- **In-game HUD**: lives remaining, collectibles gathered this level, a pause button, and a level timer.
- **Pause menu**: resume, restart level, return to level select.
- **Level-complete screen**: stars earned, time taken, collectibles gathered, buttons for "Next Level," "Retry," and "Level Select."
- **Game-over screen** (out of lives): retry or return to level select.
- Keep the visual style simple, colorful, and cohesive — flat shapes/gradients are fine, no need for hand-drawn art. Use a bright, playful color palette distinct from Red Ball 4's actual branding.

## Polish (nice-to-have, if time allows)

- Simple sound effects (jump, collect, hit/death, level complete) — can be generated or use royalty-free placeholders, clearly noted as placeholders.
- Particle effects for collecting items and defeating enemies.
- Camera that smoothly follows the player and doesn't show beyond level bounds.
- A settings toggle for sound on/off.

## Deliverable structure

Set this up as a self-contained folder (e.g. `rolling-ball-game/`) with:
- `index.html`
- `/js/` for all game logic modules
- `/css/` for styling
- `/assets/` for any sound/image assets (or a note on placeholders used)
- A short `README.md` explaining how to run it locally and how it's structured, so it's easy to plug into my existing games hub's navigation/index page later.

Please build this iteratively: get the core rolling/jumping physics and collision working and playable on one test level first, confirm it feels good, then add hazards, enemies, the remaining levels, and the UI screens on top.
