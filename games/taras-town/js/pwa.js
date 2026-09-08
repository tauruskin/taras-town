/**
 * pwa.js — Registers the service worker that lets the game be installed and
 * opened with no internet connection.
 *
 * Wrapped the same defensive way as save.js and audio.js: any browser too old
 * to support this, any registration failure, any of it — the game must start
 * and play exactly the same either way. Being installable is a bonus on top
 * of the game, never a requirement for it.
 */
export function registerServiceWorker() {
  try {
    if (!('serviceWorker' in navigator)) return;

    // Service workers require a secure context. That is satisfied by the
    // https:// GitHub Pages serves over, and separately by plain http:// on
    // localhost/127.0.0.1 for local testing — but not by opening the file
    // directly or by some other plain-http address, where the call below
    // simply rejects and the catch here quietly does nothing.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  } catch (err) {
    // Never let this stop the game from starting.
  }
}
