/**
 * sw.js — Lets Taras Town be installed, and lets it open with no internet.
 *
 * This has to sit at the repository root: a service worker can only ever
 * control pages inside the folder it is served from (its "scope"), and this
 * game is served from the site root.
 *
 * The strategy is NETWORK-FIRST for the game's own files, cache only as a
 * fallback:
 *
 *   - Online:  always fetch fresh. Taras always gets whatever was pushed
 *              most recently, the same as before this file existed.
 *   - Offline: serve the copy saved the last time the game was online.
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
const CACHE = 'taras-town-v1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/config.js',
  './js/world.js',
  './js/interior.js',
  './js/furniture.js',
  './js/camera.js',
  './js/input.js',
  './js/player.js',
  './js/car.js',
  './js/npc.js',
  './js/missions.js',
  './js/ui.js',
  './js/coins.js',
  './js/effects.js',
  './js/audio.js',
  './js/save.js',
  './js/net.js',
  './js/pwa.js',
  './js/startscreen.js',
  './js/minimap.js',
  './js/music.js',
  './js/vendor/peerjs.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',

  // The only recordings in the game. Precached like everything else, because
  // the whole point of this file is that the town works in a car with no
  // signal — music that only played when there was internet would be worse
  // than no music at all.
  './sounds/step1.m4a',
  './sounds/step2.m4a',
  './sounds/step3.m4a',
  './sounds/step4.m4a',
  './sounds/swim.m4a',
  './sounds/music.m4a',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Take over immediately rather than waiting for every open tab to
      // close, so an update reaches Taras the next time he taps Play, not
      // the next time the phone happens to be restarted.
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
