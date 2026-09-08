/**
 * hub.js — Registers the service worker for the whole site: the hub itself
 * and every game reachable from it.
 *
 * Wrapped the same defensively as every game's own scripts: any browser too
 * old to support this, any registration failure, any of it — the hub must
 * still show its tiles exactly the same either way. Being installable is a
 * bonus on top, never a requirement.
 */
try {
  if ('serviceWorker' in navigator) {
    // Service workers require a secure context. That is satisfied by the
    // https:// GitHub Pages serves over, and separately by plain http:// on
    // localhost/127.0.0.1 for local testing — but not by opening the file
    // directly, where the call below simply rejects and the catch here
    // quietly does nothing.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
} catch (err) {
  // Never let this stop the hub from starting.
}
