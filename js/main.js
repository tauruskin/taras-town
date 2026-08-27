/**
 * main.js — Boots Taras Town and runs the game loop.
 *
 * Responsibilities, and nothing else:
 *   - size the canvas to the phone screen (and keep it sized)
 *   - create the world, the player, the camera and the touch input
 *   - run update/draw once per frame
 *   - draw the on-screen controls
 *   - save where the player was standing
 *
 * Milestone 1: walking around town.
 */

import { CONFIG } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
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

// Put the player back where he was last time, if that spot still makes sense.
const spawn = pickSpawn(save, world);
const player = new Player(world, spawn.x, spawn.y);

const camera = new Camera(world);
const input = new Input(canvas);

let dpr = 1;       // device pixel ratio, capped for performance
let scale = 1;     // world pixels -> screen pixels
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

  // Always show the same amount of world vertically, whatever the screen size,
  // so the game feels identical on a small phone and a big one.
  scale = cssH / CONFIG.CAMERA.VIEW_HEIGHT;

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
  player.update(dt, input.vector);

  const viewW = canvas.clientWidth / scale;
  const viewH = canvas.clientHeight / scale;
  camera.update(dt, player.x, player.y, viewW, viewH);

  // Save the player's position every few seconds rather than every frame.
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
  player.draw(ctx);
  world.drawCanopies(ctx, view);   // leaves overlap the player: instant depth

  // --- controls, drawn in screen coordinates ---------------------------
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawJoystick();
}

// ---------------------------------------------------------------------------
// On-screen controls
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
function persist() {
  save.lastPos = { x: Math.round(player.x), y: Math.round(player.y) };
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
 * to the town-centre spawn if it is missing, off the map, or somehow inside a
 * wall (which could happen if we move a building in a future update).
 */
function pickSpawn(saveData, w) {
  const p = saveData.lastPos;
  const half = CONFIG.PLAYER.HITBOX / 2;

  const valid =
    p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x > half && p.x < w.width - half &&
    p.y > half && p.y < w.height - half &&
    !w._overlaps(p.x, p.y, half, half);

  return valid ? { x: p.x, y: p.y } : w.spawn;
}
