/**
 * save.js — Progress saving via localStorage.
 *
 * Rules for this file:
 *   1. EVERY read and write is wrapped in try/catch.
 *   2. If storage is unavailable, corrupted, or empty, the game must still
 *      start normally with default values.
 *
 * Nothing here ever leaves the phone. No accounts, no network.
 */

const STORAGE_KEY = 'tarasTown.save.v1';

/** The shape of a brand-new save file. Milestones 3-5 will add fields here. */
function defaultSave() {
  return {
    version: 1,
    coins: 0,
    // Where the player was standing last time, so we can put them back.
    lastPos: null,

    // Chosen appearance, as indexes into the palettes in config.js.
    // Indexes rather than colour strings so that changing a palette entry
    // restyles existing saves instead of leaving them on a dead colour.
    hat: 0,
    shirt: 0,
    car: 0,
  };
}

/**
 * Read the save file.
 * Always returns a usable object, even if storage is broken or empty.
 */
export function loadGame() {
  const defaults = defaultSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;

    // Merge over the defaults so a save written by an older version of the
    // game (missing newer fields) still works.
    return { ...defaults, ...parsed };
  } catch (err) {
    console.warn('[save] Could not load, starting fresh.', err);
    return defaults;
  }
}

/**
 * Write the save file. Returns true on success, false if it silently failed.
 * A failure here must never interrupt gameplay.
 */
export function saveGame(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    // Private browsing mode on iOS, storage full, or storage disabled.
    console.warn('[save] Could not save.', err);
    return false;
  }
}

/** Wipe progress and start over. Used by a "reset" option later on. */
export function clearSave() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (err) {
    console.warn('[save] Could not clear.', err);
    return false;
  }
}
