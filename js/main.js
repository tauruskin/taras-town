/**
 * main.js — Boots Taras Town and runs the game loop.
 *
 * Responsibilities, and nothing else:
 *   - size the canvas to the phone screen (and keep it sized)
 *   - create the world, the player, the cars, the camera and the touch input
 *   - run update/draw once per frame
 *   - switch between walking and driving
 *   - draw the on-screen controls
 *   - save where the player was standing
 *
 * Milestones 1-3: walking around town, driving the cars, and choosing what
 * Taras and his car look like.
 */

import { CONFIG } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { createCars } from './car.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Menu } from './ui.js';
import { loadGame, saveGame } from './save.js';

// ---------------------------------------------------------------------------
// Set-up
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');

const save = loadGame();
const world = new World();
const cars = createCars(world);

// Put the player back where he was last time, if that spot still makes sense.
const spawn = pickSpawn(save, world, cars);
const player = new Player(world, spawn.x, spawn.y);

const camera = new Camera(world);
const input = new Input(canvas);
const menu = new Menu();

// Put on whatever was chosen last time.
player.setOutfit(save.hat, save.shirt);

// What the player is doing right now.
const ON_FOOT = 'foot';
const DRIVING = 'drive';
let mode = ON_FOOT;
let drivenCar = null;      // the Car being driven, or null
let nearbyCar = null;      // the Car close enough to get into, or null

let dpr = 1;       // device pixel ratio, capped for performance
let scale = 1;     // world pixels -> screen pixels
let viewHeight = CONFIG.CAMERA.VIEW_HEIGHT;   // eases when getting in/out
let running = false;
let lastFrame = 0;
let clock = 0;     // total seconds elapsed, used for water sparkle etc.
let saveTimer = 0;

resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

// ---------------------------------------------------------------------------
// Starting the game
// ---------------------------------------------------------------------------
// A tap is required before we begin: it gives us the user gesture that phones
// demand before going full screen (and, later, before playing any sound).
startButton.addEventListener('click', startGame);

function startGame() {
  startScreen.classList.add('hidden');
  // Drop keyboard focus, or Space would keep re-triggering this button.
  startButton.blur();

  // Both of these are unsupported on iPhone Safari and will simply do
  // nothing there, which is why the CSS "please rotate" screen also exists.
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  } catch (_) {}
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (_) {}

  setTimeout(resize, 200);

  if (!running) {
    running = true;
    camera.snapTo(player.x, player.y);
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }
}

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------
function resize() {
  // Cap the pixel ratio: a 3x retina buffer costs a lot of fill rate on a
  // phone and looks no better for flat cartoon shapes.
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  const cssW = window.innerWidth;
  const cssH = window.innerHeight;

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  ctx.imageSmoothingEnabled = true;
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------
function frame(now) {
  // Clamp dt so that switching away from the browser and back doesn't
  // teleport the player across town in one enormous step.
  const dt = Math.min((now - lastFrame) / 1000, 1 / 30);
  lastFrame = now;
  clock += dt;

  update(dt);
  render();

  requestAnimationFrame(frame);
}

function update(dt) {
  // --- what buttons exist this frame? ---------------------------------
  // Worked out even while the menu is open, so picking a car colour repaints
  // the car he is standing next to and he sees the change straight away.
  nearbyCar = mode === ON_FOOT ? findCarToEnter() : null;
  refreshButtons();

  // --- the menu, if it's open, takes every press and pauses the town ----
  if (menu.open) {
    handleMenuPresses();
    return;
  }

  if (input.consumePress('menu-open')) {
    menu.open = true;
    return;
  }

  // --- act on a button press ------------------------------------------
  if (input.consumePress('action')) {
    if (mode === ON_FOOT && nearbyCar) enterCar(nearbyCar);
    else if (mode === DRIVING) exitCar();
  }

  // --- move ------------------------------------------------------------
  if (mode === DRIVING) {
    drivenCar.update(dt, input.vector, cars.filter((c) => c !== drivenCar));
  } else {
    player.update(dt, input.vector, cars.map((c) => c.boundsBox()));
  }

  // --- camera -----------------------------------------------------------
  // Ease the zoom rather than jumping, so getting in a car feels like the
  // view pulling back rather than a cut.
  const wantHeight = mode === DRIVING
    ? CONFIG.CAMERA.VIEW_HEIGHT_CAR
    : CONFIG.CAMERA.VIEW_HEIGHT;
  viewHeight += (wantHeight - viewHeight) * Math.min(1, CONFIG.CAMERA.ZOOM_LERP * dt);
  scale = canvas.clientHeight / viewHeight;

  const target = mode === DRIVING ? drivenCar : player;
  camera.update(dt, target.x, target.y, canvas.clientWidth / scale, canvas.clientHeight / scale);

  // Save every few seconds rather than every frame.
  saveTimer += dt;
  if (saveTimer > 3) {
    saveTimer = 0;
    persist();
  }
}

function render() {
  const view = camera.view;

  // --- world, drawn in world coordinates -------------------------------
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -view.x * dpr * scale, -view.y * dpr * scale);

  world.drawGround(ctx, view, clock);
  world.drawBuildings(ctx, view);

  // A ring under the car you are about to get into, so it is obvious which.
  if (nearbyCar) drawHighlight(nearbyCar);

  for (const car of cars) {
    if (car.x < view.x - 90 || car.x > view.x + view.w + 90) continue;
    if (car.y < view.y - 90 || car.y > view.y + view.h + 90) continue;
    car.draw(ctx);
  }

  if (mode === ON_FOOT) player.draw(ctx);
  world.drawCanopies(ctx, view);   // leaves overlap the player: instant depth

  // --- controls, drawn in screen coordinates ---------------------------
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  if (menu.open) {
    menu.draw(ctx, w, h, { hat: save.hat, shirt: save.shirt, car: save.car });
    return;
  }

  drawJoystick();
  drawActionButton();
  menu.drawOpener(ctx, w, h, input.isHeld('menu-open'));
}

// ---------------------------------------------------------------------------
// Getting in and out of cars
// ---------------------------------------------------------------------------

/** The closest car within reach, or null. */
function findCarToEnter() {
  let best = null;
  let bestDist = CONFIG.CAR.ENTER_RADIUS;

  for (const car of cars) {
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  drivenCar = car;
  mode = DRIVING;
  // Whatever he drives becomes his chosen colour.
  car.repaint(save.car);
}

function exitCar() {
  const car = drivenCar;
  car.speed = 0;                 // never leave a car rolling away by itself

  const spot = findExitSpot(car);
  player.x = spot.x;
  player.y = spot.y;
  player.angle = Math.atan2(spot.y - car.y, spot.x - car.x);
  player.speed01 = 0;

  drivenCar = null;
  mode = ON_FOOT;
  persist();
}

/** Somewhere clear beside `car` for the player to step out onto. */
function findExitSpot(car) {
  return car.exitSpot(cars.filter((c) => c !== car));
}

// ---------------------------------------------------------------------------
// On-screen controls
// ---------------------------------------------------------------------------

/** Where the big action button sits, in screen pixels. */
function actionButtonPos() {
  return {
    x: canvas.clientWidth - 96,
    y: canvas.clientHeight - 92,
    r: 46,
  };
}

/** Tell the input layer which buttons are live this frame. */
function refreshButtons() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // While the menu is open it owns the whole screen.
  if (menu.open) {
    input.setButtons(menu.buttons(w, h));
    return;
  }

  const opener = Menu.openerPos(w, h);
  const list = [{ id: 'menu-open', x: opener.x, y: opener.y, r: opener.r }];

  if (mode === DRIVING || nearbyCar !== null) {
    const b = actionButtonPos();
    list.push({ id: 'action', x: b.x, y: b.y, r: b.r });
  }
  input.setButtons(list);
}

/**
 * Menu taps. Choices apply the instant they're pressed — there is no confirm
 * step, so the change is its own feedback.
 */
function handleMenuPresses() {
  if (input.consumePress('menu-close')) {
    menu.open = false;
    persist();
    return;
  }

  for (const row of menu.rows()) {
    for (let i = 0; i < row.count; i++) {
      if (!input.consumePress(`${row.id}:${i}`)) continue;

      save[row.id] = i;
      applyChoices();
      persist();
    }
  }
}

/** Push the saved choices onto the things they affect. */
function applyChoices() {
  player.setOutfit(save.hat, save.shirt);

  // Repaint the car he's sitting in, or the one he's standing beside, so a
  // colour change is visible right there behind the menu rather than being
  // a surprise later.
  const target = drivenCar || nearbyCar;
  if (target) target.repaint(save.car);
}

function drawJoystick() {
  const J = CONFIG.JOYSTICK;
  const ring = input.getRingCenter();
  const knob = input.getKnobCenter();
  const active = input.isActive;

  ctx.save();

  // A dark halo behind everything. Without it the white control vanishes
  // whenever the player walks over a pale building or the pavement.
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, J.BASE_RADIUS + 5, 0, Math.PI * 2);
  ctx.fill();

  // Outer ring — a bit more solid while it's being used.
  ctx.fillStyle = active ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.20)';
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, J.BASE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Thumb dot, with a dark rim so it reads against any background.
  ctx.fillStyle = active ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, J.KNOB_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

/**
 * The one action button: a car to get in, a little person to get out.
 * No words — it has to be readable by someone who cannot reliably read.
 */
function drawActionButton() {
  const showAction = mode === DRIVING || nearbyCar !== null;
  if (!showAction) return;

  const b = actionButtonPos();
  const held = input.isHeld('action');
  const r = held ? b.r - 3 : b.r;

  ctx.save();

  // Chunky drop shadow that shrinks when pressed, so it visibly pushes in.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(b.x, b.y + (held ? 3 : 7), r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = mode === DRIVING ? '#FF9F45' : '#5AC85A';
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.translate(b.x, b.y);
  if (mode === DRIVING) drawPersonIcon(); else drawCarIcon();

  ctx.restore();
}

/** A tiny car, drawn from above, for the "get in" button. */
function drawCarIcon() {
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(-22, -13, 44, 26, 8);
  ctx.fill();

  ctx.fillStyle = '#5AC85A';
  roundRectPath(-9, -9, 15, 18, 4);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  roundRectPath(-16, -17, 11, 6, 3); ctx.fill();
  roundRectPath(-16, 11, 11, 6, 3); ctx.fill();
  roundRectPath(7, -17, 11, 6, 3); ctx.fill();
  roundRectPath(7, 11, 11, 6, 3); ctx.fill();
}

/** A tiny person, for the "get out" button. */
function drawPersonIcon() {
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, -12, 8, 0, Math.PI * 2);
  ctx.fill();

  roundRectPath(-10, -2, 20, 20, 8);
  ctx.fill();

  roundRectPath(-13, 0, 6, 14, 3); ctx.fill();
  roundRectPath(7, 0, 6, 14, 3); ctx.fill();
}

/** roundRect on the HUD context, in screen pixels. */
function roundRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A soft pulsing ring under whichever car is within reach. */
function drawHighlight(car) {
  const pulse = 1 + Math.sin(clock * 4) * 0.06;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, car.length * 0.62, car.width * 0.95, car.angle, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
function persist() {
  // While driving, remember the spot beside the car rather than the car
  // itself: cars go back to their parking spaces when the game reloads, and
  // we don't want to drop the player inside one.
  const p = mode === DRIVING ? findExitSpot(drivenCar) : { x: player.x, y: player.y };
  save.lastPos = { x: Math.round(p.x), y: Math.round(p.y) };
  saveGame(save);
}

// Save when the player leaves the page or locks the phone. `pagehide` and
// `visibilitychange` are the two that actually fire reliably on mobile.
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

/**
 * Choose where to drop the player in. Uses the saved position, but falls back
 * to the town-centre spawn if it is missing, off the map, or somehow blocked
 * (inside a wall, or inside a parked car).
 */
function pickSpawn(saveData, w, allCars) {
  const p = saveData.lastPos;
  const half = CONFIG.PLAYER.HITBOX / 2;
  const blockers = allCars.map((c) => c.boundsBox());

  const valid =
    p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x > half && p.x < w.width - half &&
    p.y > half && p.y < w.height - half &&
    !w._overlaps(p.x, p.y, half, half, blockers);

  return valid ? { x: p.x, y: p.y } : w.spawn;
}
