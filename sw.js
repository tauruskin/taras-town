/**
 * sw.js — Lets Pushkar Games be installed, and lets it open with no internet.
 *
 * This has to sit at the repository root: a service worker can only ever
 * control pages inside the folder it is served from (its "scope"), and this
 * site is served from the site root. The hub registers it (see js/hub.js);
 * once active its scope covers every game underneath it too.
 *
 * The strategy is NETWORK-FIRST for the app's own files, cache only as a
 * fallback:
 *
 *   - Online:  always fetch fresh. Players always get whatever was pushed
 *              most recently, the same as before this file existed.
 *   - Offline: serve the copy saved the last time the app was online.
 *
 * A cache-FIRST design would be the wrong default for a project that gets
 * pushed to as often as this one does — it would happily keep serving a
 * week-old build forever, with no obvious sign anything was stale. Fetching
 * fresh whenever there IS a connection avoids that trap entirely.
 *
 * Requests this never touches, on purpose:
 *   - anything cross-origin (the PeerJS introduction service, its TURN/STUN
 *     relay) — multiplayer's own reachability is a separate concern from
 *     whether the app shell can open offline, and must not be tangled up
 *     with this cache.
 *   - anything that is not a plain GET.
 */

// Bump this only when files this list references are renamed or removed —
// otherwise the network-first strategy above already keeps everyone current,
// and bumping it needlessly just forces a full re-download for no reason.
// Bumped here because a second game, Pushkar Ball, was added to the list.
//
// Note that `install` below uses cache.addAll, which rejects WHOLESALE on a
// single 404 — one missing path and the service worker fails to install, taking
// offline support for the entire site with it. So a path only ever goes in this
// list once the file behind it exists.
const CACHE = 'pushkar-games-v2';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/hub.css',
  './js/hub.js',
  './icons/icon-192.png',
  './icons/icon-512.png',

  './games/taras-town/index.html',
  './games/taras-town/css/style.css',
  './games/taras-town/js/main.js',
  './games/taras-town/js/config.js',
  './games/taras-town/js/world.js',
  './games/taras-town/js/interior.js',
  './games/taras-town/js/furniture.js',
  './games/taras-town/js/camera.js',
  './games/taras-town/js/input.js',
  './games/taras-town/js/player.js',
  './games/taras-town/js/car.js',
  './games/taras-town/js/flight.js',
  './games/taras-town/js/npc.js',
  './games/taras-town/js/missions.js',
  './games/taras-town/js/ui.js',
  './games/taras-town/js/coins.js',
  './games/taras-town/js/effects.js',
  './games/taras-town/js/audio.js',
  './games/taras-town/js/save.js',
  './games/taras-town/js/net.js',
  './games/taras-town/js/startscreen.js',
  './games/taras-town/js/minimap.js',
  './games/taras-town/js/music.js',
  './games/taras-town/js/vendor/peerjs.min.js',

  // The only recordings in the game. Precached like everything else, because
  // the whole point of this file is that the town works in a car with no
  // signal — music that only played when there was internet would be worse
  // than no music at all.
  './games/taras-town/sounds/step1.m4a',
  './games/taras-town/sounds/step2.m4a',
  './games/taras-town/sounds/step3.m4a',
  './games/taras-town/sounds/step4.m4a',
  './games/taras-town/sounds/swim.m4a',
  './games/taras-town/sounds/heli.m4a',
  './games/taras-town/sounds/music.m4a',

  // Pushkar Ball. Nothing but code: every shape is drawn and every sound is
  // synthesised, so there is no folder of assets to list here and there is not
  // going to be one.
  './games/pushkar-ball/index.html',
  './games/pushkar-ball/css/style.css',
  './games/pushkar-ball/js/main.js',
  './games/pushkar-ball/js/config.js',
  './games/pushkar-ball/js/physics.js',
  './games/pushkar-ball/js/levels.js',
  './games/pushkar-ball/js/player.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Take over immediately rather than waiting for every open tab to
      // close, so an update reaches everyone the next time they tap a tile,
      // not the next time the phone happens to be restarted.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever handle our own plain GETs. Everything else — multiplayer's
  // signalling and relay traffic included — goes straight to the network
  // exactly as if this file did not exist.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Keep the cache fresh with whatever we just successfully fetched,
        // so the offline fallback is never far out of date.
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
