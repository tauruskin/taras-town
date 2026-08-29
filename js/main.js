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
 * Milestones 1-6: walking around town, driving the cars, choosing what Taras
 * and his car look like, running errands for the neighbours, collecting coins
 * to spend on new colours, and playing together on the same wifi.
 */

import { CONFIG } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Car, createCars } from './car.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Menu, drawMissionIcon, drawSoundButton, drawHomeButton, drawNameplate } from './ui.js';
import { createNpcs } from './npc.js';
import { Missions } from './missions.js';
import { Effects, drawCoin } from './effects.js';
import { Coins } from './coins.js';
import { initAudio, setMuted, playAccept, playPickup, playSuccess, playDenied } from './audio.js';
import { loadGame, saveGame } from './save.js';
import { Net, roomFromUrl } from './net.js';
import { StartScreen, sanitizeName } from './startscreen.js';
import { Minimap } from './minimap.js';
import { registerServiceWorker } from './pwa.js';

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
const npcs = createNpcs(world);
const missions = new Missions(world);
const effects = new Effects();
const coins = new Coins(world);
// Don't hand out whatever coin he happened to log off standing on.
coins.clearAtStart(spawn.x, spawn.y);

// Playing together only happens when there is a ?room= in the address. With
// no room, none of the networking code is even downloaded.
// Which room, if any, is decided on the opening screen — or taken from the
// address when a link already says. `net` stays null until then, and stays
// null for good when playing alone, so none of the networking code is even
// downloaded in that case.
let net = null;
let roomCode = null;

// Stand-in characters and cars for the other players. They are only ever
// drawn — they never move themselves, collide, or touch the town.
const ghosts = new Map();   // peer id -> { player, car, x, y, angle, ... }

// Put on whatever was chosen last time.
player.setOutfit(save.hat, save.shirt);
setMuted(save.muted);

// What the player is doing right now.
const ON_FOOT = 'foot';
const DRIVING = 'drive';
let mode = ON_FOOT;
let drivenCar = null;      // the Car being driven, or null
let nearbyCar = null;      // the Car close enough to get into, or null
let action = null;         // what the action button would do right now
let shake = null;          // a locked colour wobbling after a failed purchase

let dpr = 1;       // device pixel ratio, capped for performance
let scale = 1;     // world pixels -> screen pixels
let viewHeight = CONFIG.CAMERA.VIEW_HEIGHT;   // eases when getting in/out
let running = false;
let lastFrame = 0;
let clock = 0;     // total seconds elapsed, used for water sparkle etc.
let saveTimer = 0;

registerServiceWorker();

resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

// ---------------------------------------------------------------------------
// Starting the game
// ---------------------------------------------------------------------------
// A tap is required before we begin: it gives us the user gesture that phones
// demand before going full screen (and, later, before playing any sound).
// The opening screen decides who we are playing with, then hands over.
const fromUrl = roomFromUrl();
const minimap = new Minimap(world);
const startScreenUi = new StartScreen(startGame, save.name);
if (fromUrl) {
  // A link that already names a room has made the choice for us; asking
  // again would be pointless, and this keeps shared links working exactly
  // as they did before there was an opening screen at all.
  startScreenUi.straightToPlay();
}

function startGame(chosenRoom, chosenName) {
  const room = fromUrl || chosenRoom || null;

  // Remember what he asked to be called, so he is not asked again next time.
  if (typeof chosenName === 'string') save.name = chosenName;

  if (room) {
    roomCode = room;
    net = new Net(room);

    // Step aside before anybody else arrives.
    //
    // Everyone joining a room starts from the same spot, so without this two
    // children materialise inside one another — and now that players are
    // solid, standing in the same square is the one place the game cannot
    // sort out for them. A step in some direction each is all it takes.
    // Which way to step is taken from the name rather than from chance, so
    // the same person always starts in the same place. Two people with
    // different names step different ways, which is the whole point; two with
    // the same name step the same way and are simply eased apart afterwards,
    // like anybody else who ends up standing in one another.
    const half = CONFIG.PLAYER.HITBOX / 2;
    const seed = [...(save.name || 'x')].reduce((n, ch) => n + ch.charCodeAt(0), 0);
    const a = ((seed % 12) / 12) * Math.PI * 2;
    const aside = world.findFreeSpot(player.x + Math.cos(a) * 70,
                                     player.y + Math.sin(a) * 70, half, null, 200);
    if (aside && !world.hiddenAt(aside.x, aside.y)) {
      player.x = aside.x;
      player.y = aside.y;
    }
    // Put the room in the address, so this game can be bookmarked or the
    // link shared, exactly like the ones typed in by hand.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', room);
      window.history.replaceState({}, '', url);
    } catch (_) {}
  }

  startScreen.classList.add('hidden');
  // Drop keyboard focus, or Space would keep re-triggering this button.
  if (startButton) startButton.blur();

  // Phones refuse to make any sound until the page has been touched. This
  // tap is that touch, so it is the only moment audio can be set up.
  initAudio();

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

    // Joining happens in the background. If it fails, or takes a while, the
    // game is already running and nobody has waited for anything.
    if (net) net.join();
  }
}

/**
 * Back to the opening screen, so he can leave a game he is playing with
 * somebody else and carry on by himself.
 *
 * This reloads the page rather than unpicking everything by hand, and that is
 * a deliberate choice. Going back to the start means undoing a live connection,
 * every other player's ghost, whichever job was half-finished, and the fact
 * that the game loop is already running — a long list of things to get exactly
 * right, and a stale one left behind would show up as a friend who is still
 * visible but no longer there. A reload cannot leave any of that behind.
 *
 * Nothing is lost by it: coins, unlocks and what he is wearing are saved just
 * before, and the town is generated from a fixed seed, so it comes back
 * identical. The room is dropped from the address on the way out, otherwise
 * the opening screen would send him straight back into the game he just left.
 */
function backToMainMenu() {
  menu.open = false;
  persist();
  if (net) net.leave();

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    // `replace` rather than `href`: no history entry, so the phone's back
    // button cannot walk him straight back into the room he has just left.
    window.location.replace(url.toString());
  } catch (_) {
    window.location.reload();
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
  action = findAction();
  refreshButtons();

  // The sound button works whether the menu is open or shut.
  if (input.consumePress('sound')) toggleSound();

  // So does the way home. It is on the playing screen as well as in the menu,
  // so that leaving a game you are playing with somebody else is one tap and
  // does not mean hunting through the menu first.
  if (input.consumePress('menu-home')) {
    backToMainMenu();
    return;
  }

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
  if (input.consumePress('action') && action) {
    if (action.kind === 'exit') exitCar();
    else if (action.kind === 'enter') enterCar(action.car);
    else if (action.kind === 'job') takeJob(action.npc);
  }

  // --- move ------------------------------------------------------------
  if (mode === DRIVING) {
    drivenCar.update(dt, input.vector, cars.filter((c) => c !== drivenCar));
  } else {
    player.update(dt, input.vector, blockers());
    separateIfInsideSomebody(dt);
  }

  // --- jobs -------------------------------------------------------------
  // Checked against whatever is carrying the player, so a delivery can be
  // finished by driving up to the door as well as by walking to it.
  const who = mode === DRIVING ? drivenCar : player;
  const event = missions.update(who.x, who.y);
  if (event && event.kind === 'checkpoint') passCheckpoint();
  else if (event && event.kind === 'done') completeJob(event.job);

  // Coins are picked up by whoever is moving, so they can be collected at
  // speed in a car as well as on foot.
  const picked = coins.update(dt, who.x, who.y);
  if (picked > 0) {
    save.coins += picked;
    playPickup();
    persist();
  }

  effects.update(dt);

  if (net) {
    net.update(dt, {
      x: Math.round(who.x),
      y: Math.round(who.y),
      angle: Math.round(who.angle * 100) / 100,
      mode,
      hat: save.hat,
      shirt: save.shirt,
      car: save.car,
      vehicle: save.vehicle,
      name: save.name || '',
    });
    updateGhosts(dt);
  }

  // The shake after a failed purchase runs itself down.
  if (shake) {
    shake.amount -= dt;
    if (shake.amount <= 0) shake = null;
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

  coins.draw(ctx, view, clock);

  // A ring under the car you are about to get into, so it is obvious which.
  if (nearbyCar) drawHighlight(nearbyCar);

  for (const car of cars) {
    if (car.x < view.x - 90 || car.x > view.x + view.w + 90) continue;
    if (car.y < view.y - 90 || car.y > view.y + view.h + 90) continue;
    car.draw(ctx);
  }

  // The beacon goes on the ground, under everyone standing on it.
  missions.drawTarget(ctx, clock);

  const visibleNpcs = npcs.filter((n) =>
    !missions.isRidingAlong(n) &&
    n.x > view.x - 90 && n.x < view.x + view.w + 90 &&
    n.y > view.y - 110 && n.y < view.y + view.h + 90);

  // The ground ring goes down first, so the person stands on top of it.
  for (const npc of visibleNpcs) {
    if (missions.canOffer(npc)) npc.drawGlow(ctx, clock);
  }
  for (const npc of visibleNpcs) npc.draw(ctx, clock);

  if (net) drawGhosts(ctx, view);

  if (mode === ON_FOOT) player.draw(ctx);

  // A friend being given a lift rides along with whoever is moving.
  missions.drawPassenger(ctx, mode === DRIVING ? drivenCar : player);

  world.drawCanopies(ctx, view);   // leaves overlap the player: instant depth

  // Badges go on top of the leaves. They are the only sign that a job is on
  // offer here, so a tree must never be able to hide one.
  for (const npc of visibleNpcs) {
    if (missions.canOffer(npc)) npc.drawBadge(ctx, clock);
  }

  // --- controls, drawn in screen coordinates ---------------------------
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // Names go on after the world and before the controls: over the trees, so a
  // friend behind a canopy can still be identified, but under the joystick and
  // the buttons, which must never be obscured by somebody else's long name.
  if (net) drawNameplates(view);

  if (menu.open) {
    menu.draw(ctx, w, h,
      { hat: save.hat, shirt: save.shirt, car: save.car,
        vehicle: save.vehicle, boat: save.boat },
      save, shake);
    // The purse stays on screen in the shop. Deciding whether you can afford
    // something while your total is hidden is no decision at all.
    drawCoinCounter(w, h);
    drawSound(w, h);
    drawHome(w, h);
    effects.draw(ctx);
    return;
  }

  drawJoystick();
  drawActionButton();
  menu.drawOpener(ctx, w, h, input.isHeld('menu-open'));
  drawSound(w, h);
  drawHome(w, h);
  drawWaypointArrow(w, h);
  drawCoinCounter(w, h);
  minimap.draw(ctx, w, h, mode === DRIVING ? drivenCar : player, mode === DRIVING);
  drawPlayerCount(w, h);
  effects.draw(ctx);
}

function drawSound(w, h) {
  const b = soundButtonPos();
  drawSoundButton(ctx, b.x, b.y, b.r, !save.muted, input.isHeld('sound'));
}

/** The way out of the game, shown only while the menu is open. */
function drawHome(w, h) {
  const b = Menu.homePos(w, h);
  drawHomeButton(ctx, b.x, b.y, b.r, input.isHeld('menu-home'));
}

/**
 * How many of you are playing, top middle. Only appears when a room is in the
 * address at all.
 *
 * A failure shows nothing: if joining didn't work the game is simply a
 * single-player game, and telling a 6-year-old that something went wrong on
 * the network helps nobody.
 */
function drawPlayerCount(w, h) {
  if (!net) return;
  if (net.status === 'failed' || net.status === 'off') return;

  const connecting = net.status === 'connecting';
  const count = net.playerCount;

  // On your own in a room, the code is the useful thing to show: whoever
  // started the game still has to read it out to everybody else, and it
  // would be unkind to make them remember it from the opening screen.
  const waitingAlone = !connecting && count < 2 && roomCode;
  if (!connecting && !waitingAlone && count < 2) return;

  const x = w / 2;
  const y = 34;
  const halfWidth = waitingAlone ? 62 : 44;

  ctx.save();
  ctx.fillStyle = connecting ? 'rgba(0,0,0,0.28)'
                : waitingAlone ? 'rgba(0,0,0,0.45)'
                : 'rgba(40,150,60,0.85)';
  roundRectPath(x - halfWidth, y - 19, halfWidth * 2, 38, 19);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (waitingAlone) {
    // The code, and one faint figure: somebody is expected but not here yet.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(x - 44, y - 6, 6, 0, Math.PI * 2); ctx.fill();
    roundRectPath(x - 51, y + 2, 14, 12, 5);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 25px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(roomCode, x + 16, y + 1);
    ctx.restore();
    return;
  }

  if (connecting) {
    // Three dots breathing in turn: "hold on".
    for (let i = 0; i < 3; i++) {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(clock * 4 - i * 0.7));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x - 14 + i * 14, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // A little person, and the number of you.
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x - 16, y - 6, 6.5, 0, Math.PI * 2); ctx.fill();
    roundRectPath(x - 24, y + 2, 16, 13, 6);
    ctx.fill();

    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), x + 2, y + 1);
  }
  ctx.restore();
}

/**
 * An arrow pinned to the edge of the screen pointing at the current job,
 * shown only while the destination is off screen. Once the beacon itself is
 * visible the arrow would just be clutter over the thing it points at.
 */
function drawWaypointArrow(w, h) {
  if (!missions.active) return;

  const t = missions.target;
  const sx = (t.x - camera.x) * scale;
  const sy = (t.y - camera.y) * scale;

  const margin = 62;
  const onScreen = sx > margin && sx < w - margin && sy > margin && sy < h - margin;
  if (onScreen) return;

  // Slide the arrow along the line from the middle of the screen until it
  // meets the edge of an inset rectangle.
  const cx = w / 2, cy = h / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  const ca = Math.cos(a), sa = Math.sin(a);
  const dist = Math.min(
    Math.abs((w / 2 - margin) / (ca || 1e-6)),
    Math.abs((h / 2 - margin) / (sa || 1e-6)),
  );
  const ax = cx + ca * dist;
  const ay = cy + sa * dist;

  ctx.save();
  ctx.translate(ax, ay);

  // The picture of the job, so it says WHAT is over there, not just where.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(0, 4, 25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill();
  drawMissionIcon(ctx, missions.active.type, 18);

  // The pointer itself, just outside the circle.
  ctx.rotate(a);
  ctx.fillStyle = '#FFD23F';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(41, 0);
  ctx.lineTo(25, -13);
  ctx.lineTo(25, 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/** Coins collected so far, top left. A number is text a 6-year-old can read. */
function drawCoinCounter(w, h) {
  const x = 46, y = 44;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  roundRectPath(x - 28, y - 22, 116, 44, 22);
  ctx.fill();

  drawCoin(ctx, x, y, 16);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 25px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(save.coins), x + 24, y + 1);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Getting in and out of cars
// ---------------------------------------------------------------------------

/**
 * What the action button would do if pressed right now, or null if there is
 * nothing to do. There is only one button, so when the player is standing
 * between a neighbour and a car, whichever is nearer wins.
 */
function findAction() {
  if (mode === DRIVING) return { kind: 'exit' };

  const npc = findNpcWithJob();
  if (npc && nearbyCar) {
    const dn = Math.hypot(npc.x - player.x, npc.y - player.y);
    const dc = Math.hypot(nearbyCar.x - player.x, nearbyCar.y - player.y);
    return dn <= dc ? { kind: 'job', npc } : { kind: 'enter', car: nearbyCar };
  }
  if (npc) return { kind: 'job', npc };
  if (nearbyCar) return { kind: 'enter', car: nearbyCar };
  return null;
}

/** The nearest neighbour close enough to hand out a job. */
function findNpcWithJob() {
  let best = null;
  let bestDist = CONFIG.MISSION.OFFER_RADIUS;

  for (const npc of npcs) {
    if (!missions.canOffer(npc)) continue;
    const d = Math.hypot(npc.x - player.x, npc.y - player.y);
    if (d < bestDist) { bestDist = d; best = npc; }
  }
  return best;
}

function takeJob(npc) {
  if (missions.start(npc)) playAccept();
}

/** A race checkpoint ticked off. Small reward, small noise, keep driving. */
function passCheckpoint() {
  playPickup();
  effects.celebrate(canvas.clientWidth / 2, canvas.clientHeight / 2, 0, 22);
}

function completeJob(job) {
  save.coins += job.reward;
  playSuccess();
  // Burst from the middle of the screen: that is where the player is looking,
  // and the camera may be about to move on from where the job actually ended.
  effects.celebrate(canvas.clientWidth / 2, canvas.clientHeight / 2, job.reward);
  persist();
}

// ---------------------------------------------------------------------------
// The other players
//
// They used to be drawn and nothing more, on the grounds that two children
// should never be able to shove each other into a wall and a dropped
// connection should never leave the town in a strange state. Both of those
// are still true and still guarded; what changed is that you can now BUMP
// into somebody, because without that you cannot find a person hiding under a
// bush — you walk straight through them and never know they were there.
//
// How it works, and why it cannot trap anybody:
//
//   - Only players ON FOOT are solid. A vehicle is big and fast, and being
//     shoved along a wall by somebody else's bus is exactly the sort of thing
//     the old note was worried about.
//   - ANOTHER PLAYER IS NEVER A WALL. This was tried the other way first —
//     other players solid, so walking into one stopped you dead — and it did
//     find people, but it also stuck them together. Two children pressing
//     into each other are each blocked by the other; somebody backed into a
//     corner by a friend has nowhere to go at all. It was the same trap the
//     cars used to set.
//   - Instead they PUSH APART. Walk into somebody and you keep moving, slowly,
//     while both of you slide away from one another. You cannot be trapped by
//     a person, because a person never stops you.
//   - And it still does the job it was added for, better than stopping did: a
//     player hiding under a bush is shoved out from under it, so instead of
//     merely feeling a wall you SEE who it was.
//   - Each player only ever moves THEMSELVES, on their own device, through the
//     ordinary movement code — so walls still stop the push and no position is
//     ever forced. Both devices do it, so the shove is mutual.
//   - A player who goes quiet stops being solid, because their stand-in is
//     dropped altogether after a few seconds of silence.
// ---------------------------------------------------------------------------

function updateGhosts(dt) {
  // Add or refresh a stand-in for everyone we have heard from.
  for (const [id, p] of net.others) {
    let g = ghosts.get(id);
    if (!g) {
      g = {
        player: new Player(world, p.x, p.y),
        car: new Car(world, p.x, p.y, p.angle, { body: '#FFFFFF', roof: '#FFFFFF', type: 'car' }),
        x: p.x, y: p.y, angle: p.angle, mode: p.mode,
      };
      ghosts.set(id, g);
    }

    // Updates arrive ten times a second; slide towards them so other players
    // glide instead of jumping from spot to spot.
    const t = Math.min(1, CONFIG.NET.SMOOTHING * dt);
    g.x += (p.x - g.x) * t;
    g.y += (p.y - g.y) * t;

    let d = p.angle - g.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    g.angle += d * t;

    g.mode = p.mode;
    // Cleaned again on the way in. Nothing arriving over the wire is trusted,
    // and this is the one piece of it that gets drawn as words.
    g.name = sanitizeName(p.name);
    g.player.setOutfit(p.hat, p.shirt);
    g.car.repaint(p.car);
    // Look only: a stand-in must never be nudged around the town.
    g.car.setVehicleVisual(p.vehicle || 0);
  }

  // Anybody the network has forgotten loses their stand-in too.
  for (const id of [...ghosts.keys()]) {
    if (!net.others.has(id)) ghosts.delete(id);
  }
}

function drawGhosts(ctx, view) {
  for (const g of ghosts.values()) {
    if (g.x < view.x - 120 || g.x > view.x + view.w + 120) continue;
    if (g.y < view.y - 120 || g.y > view.y + view.h + 120) continue;

    if (g.mode === DRIVING) {
      g.car.x = g.x; g.car.y = g.y; g.car.angle = g.angle;
      g.car.draw(ctx);
    } else {
      g.player.x = g.x; g.player.y = g.y; g.player.angle = g.angle;
      // Always mid-stride, so a distant friend reads as somebody walking
      // about rather than as a statue.
      g.player.speed01 = 1;
      g.player.walkPhase = clock * 9;

      // Swimming if they are in the water. A stand-in never runs update(),
      // which is where that flag is normally set, so a friend out in the
      // river was drawn striding across the surface. It costs nothing to work
      // out here: the town is generated from a fixed seed, so this device
      // already knows exactly where the water is on theirs.
      g.player.swimming = world.isWaterAt(g.x, g.y);
      g.player.swimPhase = clock * 2.4;

      g.player.draw(ctx);
    }
  }
}

/**
 * The little signs over everybody's heads, including our own.
 *
 * Only ever in a game with other people in it. Playing alone there is nobody
 * to tell apart, and a sign following him about his own empty town would be
 * clutter with nothing to say.
 *
 * Positions are converted from world to screen by hand rather than by drawing
 * under the world transform, which is what keeps the text one fixed readable
 * size instead of scaling with the zoom.
 */
function drawNameplates(view) {
  const plate = (wx, wy, lift, name) => {
    if (!name) return;
    // Off the side of the screen: skip it before measuring any text.
    if (wx < view.x - 160 || wx > view.x + view.w + 160) return;
    if (wy < view.y - 160 || wy > view.y + view.h + 160) return;

    // Hidden under a tree, a bush or an awning? Then no name either.
    // A label hanging over the bush he is crouched in would give away the
    // hiding place the bush is there to provide, and hide-and-seek is the
    // whole reason there are so many of them.
    if (world.hiddenAt(wx, wy)) return;
    drawNameplate(ctx, (wx - view.x) * scale, (wy - view.y) * scale - lift * scale, name);
  };

  // Everybody else first, so that where two players stand on the same spot our
  // own name ends up on top and he can always find himself.
  for (const g of ghosts.values()) {
    plate(g.x, g.y, g.mode === DRIVING ? g.car.length / 2 + 18 : 38, g.name);
  }

  const me = mode === DRIVING ? drivenCar : player;
  plate(me.x, me.y, mode === DRIVING ? drivenCar.length / 2 + 18 : 38, save.name);
}

/**
 * Everything solid that moves about: the cars and the neighbours.
 *
 * Other players are deliberately NOT in here. See the note above: they push
 * apart instead of blocking, so that nobody can ever be pinned by a friend.
 */
function blockers() {
  return townBlockers();
}

function townBlockers() {
  return [
    ...cars.map((c) => c.boundsBox()),
    // A neighbour riding along isn't standing there any more, so they must
    // not be left behind as an invisible wall.
    ...npcs.filter((n) => !missions.isRidingAlong(n)).map((n) => n.boundsBox()),
  ];
}

/**
 * Push apart from anybody standing too close.
 *
 * This is the whole of the bumping. Walk into a friend and you are not
 * stopped — you are both eased away from each other, so somebody hidden under
 * a bush is pushed out into the open where you can see them. Since nobody is
 * ever blocked, nobody can ever be pinned against a wall by somebody else.
 *
 * On foot only. Somebody driving is left alone: a vehicle is big enough and
 * fast enough to barge a child along a wall, which is the one thing this must
 * never do.
 */
let bumpQuietFor = 0;   // stops one long bump becoming a rattle of noises

function separateIfInsideSomebody(dt) {
  bumpQuietFor -= dt;
  if (!net || mode !== ON_FOOT) return;

  const half = CONFIG.PLAYER.HITBOX / 2;
  // How far apart two people end up after bumping.
  //
  // Generously more than actually touching, and that is the point. Easing
  // apart to just-not-overlapping moves each of them about a pixel, which is
  // no use at all: the whole reason this exists is so that walking into
  // somebody hidden under a bush SHOVES THEM OUT WHERE YOU CAN SEE THEM.
  const touching = half * 2 + 22;

  for (const g of ghosts.values()) {
    if (g.mode === DRIVING) continue;

    const dx = player.x - g.x;
    const dy = player.y - g.y;
    const gap = Math.hypot(dx, dy);
    if (gap >= touching) continue;

    // Whoever is WALKING does the pushing; whoever is standing gets pushed.
    //
    // Without this the two cancel out. Both players back away from each other
    // at once, they settle at arm's length, and the one who walked over can
    // never actually reach the one hiding — which turns the whole thing into
    // a soft wall and gives away nothing. Standing your ground while walking
    // INTO somebody means their own device is the one that gives way, so a
    // child crouched under a bush is shoved out into the open.
    //
    // If both walk into each other neither gives way and they pass through,
    // which is harmless: nobody can be stuck, which is the rule that matters.
    const intent = input.vector;
    if (intent.mag > 0.2 && (intent.x * -dx + intent.y * -dy) > 0) {
      if (bumpQuietFor <= 0) {
        bumpQuietFor = 0.9;
        if (!save.muted) playAccept();
      }
      continue;
    }

    // Exactly on top of one another: pick a direction rather than dividing by
    // zero. Whichever way we go, the other player is going the opposite way.
    const nx = gap > 0.001 ? dx / gap : Math.cos(clock * 3);
    const ny = gap > 0.001 ? dy / gap : Math.sin(clock * 3);

    // Firm enough that walking into somebody visibly moves them — that is
    // how you know you have found them — and gentle enough not to fling.
    const step = Math.min(touching - gap, CONFIG.PLAYER.SPEED * dt * 1.6);
    const moved = world.moveBox(player.x, player.y, half, half,
                                nx * step, ny * step, townBlockers());
    player.x = moved.x;
    player.y = moved.y;

    // And say so out loud, once per bump. Being shoved is visible, but a
    // small noise is what makes it unmistakable that the thing you just
    // walked into was a person and not a wall — which matters most when they
    // were under a bush and you never saw them at all.
    if (bumpQuietFor <= 0) {
      bumpQuietFor = 0.9;
      if (!save.muted) playAccept();
    }
  }
}

/** The closest car within reach, or null. */
/**
 * Wear or drive the thing just chosen.
 *
 * Boats live in the same row of the menu as the cars but in their own slot,
 * so that buying a speedboat does not turn the car on the road into one.
 */
function chooseItem(rowId, i) {
  if (rowId === 'vehicle' && CONFIG.VEHICLES[i] && CONFIG.VEHICLES[i].water) {
    save.boat = i;
  } else {
    save[rowId] = i;
  }
}

function findCarToEnter() {
  let best = null;
  let bestDist = CONFIG.CAR.ENTER_RADIUS;

  for (const car of cars) {
    // Boats are moored out there from the start, so there is something to
    // save up FOR — but until one has been bought they are scenery, and
    // walking up to one offers nothing.
    if (car.water && save.boat === null) continue;

    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  drivenCar = car;
  mode = DRIVING;
  // Whatever he gets into becomes his chosen vehicle, in his chosen colour —
  // his chosen BOAT if the thing floats, which is a different slot.
  car.repaint(save.car);
  car.setVehicle(car.water ? save.boat : save.vehicle, cars);
}

function exitCar() {
  const car = drivenCar;
  const spot = findExitSpot(car);

  // Wedged somewhere with no room to stand. Staying in is recoverable — drive
  // somewhere with more space and try again — where being put down inside a
  // wall is not. Say so with the same unhappy note the shop uses.
  if (!spot) {
    playDenied();
    return;
  }

  car.speed = 0;                 // never leave a car rolling away by itself
  player.x = spot.x;
  player.y = spot.y;
  player.angle = Math.atan2(spot.y - car.y, spot.x - car.x);
  player.speed01 = 0;

  drivenCar = null;
  mode = ON_FOOT;
  persist();
}

function toggleSound() {
  save.muted = !save.muted;
  setMuted(save.muted);
  // A little pip on the way back on, so you can hear that it worked. Nothing
  // on the way off, for obvious reasons.
  if (!save.muted) playPickup();
  persist();
}

/**
 * Somewhere clear beside `car` for the player to step out onto, or null if
 * there is nowhere at all.
 *
 * Neighbours count just as much as vehicles do. Leaving them out of this once
 * put the player down standing inside somebody, which is every bit as stuck as
 * standing inside a wall — so everything solid goes in, minus the vehicle's
 * own passenger, who is not in the road.
 */
function findExitSpot(car) {
  const solid = [
    ...cars.filter((c) => c !== car),
    ...npcs.filter((n) => !missions.isRidingAlong(n)),
  ];
  return car.exitSpot(solid);
}

// ---------------------------------------------------------------------------
// On-screen controls
// ---------------------------------------------------------------------------

/**
 * The sound button, tucked beside the palette button in the top corner.
 *
 * It stays put whether the menu is open or not, so switching the sound off is
 * never something you have to go looking for — which is the whole point of a
 * mute button.
 */
function soundButtonPos() {
  return { x: canvas.clientWidth - 116, y: 52, r: 26 };
}

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

  const sound = soundButtonPos();
  const soundButton = { id: 'sound', x: sound.x, y: sound.y, r: sound.r };

  // While the menu is open it owns the whole screen — except the sound
  // button, which stays where it is.
  if (menu.open) {
    // menu.buttons already includes the home button, so nothing extra here.
    input.setButtons([...menu.buttons(w, h), soundButton]);
    return;
  }

  const opener = Menu.openerPos(w, h);
  const home = Menu.homePos(w, h);
  const list = [
    { id: 'menu-open', x: opener.x, y: opener.y, r: opener.r },
    soundButton,
    { id: 'menu-home', x: home.x, y: home.y, r: home.r },
  ];

  if (action) {
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

      // Already his? Just wear it.
      if (Menu.isUnlocked(row.id, i, save)) {
        chooseItem(row.id, i);
        applyChoices();
        persist();
        continue;
      }

      // Otherwise it has to be bought, at its own price.
      const price = Menu.priceOf(row.id, i);
      if (save.coins >= price) {
        save.coins -= price;
        save.unlocked[row.id].push(i);
        chooseItem(row.id, i);         // and put it on straight away
        applyChoices();
        playSuccess();
        effects.celebrate(canvas.clientWidth / 2, canvas.clientHeight / 2, 0, 40);
        persist();
      } else {
        // Not enough yet. Say so by wobbling the dot and making an unhappy
        // noise — never with a message, which he could not read anyway.
        shake = { id: `${row.id}:${i}`, amount: 0.45 };
        playDenied();
      }
    }
  }
}

/** Push the saved choices onto the things they affect. */
function applyChoices() {
  player.setOutfit(save.hat, save.shirt);

  // Change the vehicle he's sitting in, or the one he's standing beside, so a
  // choice is visible right there behind the menu rather than being a
  // surprise later.
  const target = drivenCar || nearbyCar;
  if (!target) return;

  target.repaint(save.car);

  // A boat takes the chosen BOAT and a car the chosen car: showing the change
  // behind the menu must not turn the ferry he is standing on into a bus.
  const want = target.water ? save.boat : save.vehicle;
  if (want === null || want === undefined) return;

  // Changing vehicle changes its size, so this can fail: there may be no room
  // for a bus where a hatchback was parked. setVehicle says so rather than
  // leaving it embedded in a wall, and then the choice is quietly refused.
  if (!target.setVehicle(want, cars)) {
    save.vehicle = target.spec ? CONFIG.VEHICLES.indexOf(target.spec) : 0;
    shake = { id: 'vehicle:' + save.vehicle, amount: 0.45 };
    playDenied();
  }
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
  if (!action) return;

  const b = actionButtonPos();
  const held = input.isHeld('action');
  const r = held ? b.r - 3 : b.r;

  // A colour per job, so the button's meaning is readable at a glance even
  // before you look at the picture on it.
  const colour = action.kind === 'exit' ? '#FF9F45'
               : action.kind === 'enter' ? '#5AC85A'
               : '#4EA8FF';

  ctx.save();

  // Chunky drop shadow that shrinks when pressed, so it visibly pushes in.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(b.x, b.y + (held ? 3 : 7), r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.translate(b.x, b.y);
  if (action.kind === 'exit') drawPersonIcon();
  else if (action.kind === 'enter') drawCarIcon(colour);
  else drawMissionIcon(ctx, action.npc.mission, 22);

  ctx.restore();
}

/** A tiny car, drawn from above, for the "get in" button. */
function drawCarIcon(colour) {
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(-22, -13, 44, 26, 8);
  ctx.fill();

  ctx.fillStyle = colour;
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
  // While driving, remember the spot beside the vehicle rather than the
  // vehicle itself: vehicles go back to their parking spaces when the game
  // reloads, and we don't want to drop the player inside one. If there is
  // nowhere beside it, keep the last place the player actually stood rather
  // than inventing somewhere.
  const beside = mode === DRIVING ? findExitSpot(drivenCar) : null;
  const p = beside || (mode === DRIVING ? (save.lastPos || world.spawn) : { x: player.x, y: player.y });
  save.lastPos = { x: Math.round(p.x), y: Math.round(p.y) };
  saveGame(save);
}

// Save when the player leaves the page or locks the phone. `pagehide` and
// `visibilitychange` are the two that actually fire reliably on mobile.
window.addEventListener('pagehide', () => {
  persist();
  if (net) net.leave();
});
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
