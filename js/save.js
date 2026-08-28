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

    // Sound on or off. Off is remembered, so a household that plays quietly
    // does not have to switch it off again every single time.
    muted: false,

    // Chosen appearance, as indexes into the palettes in config.js.
    // Indexes rather than colour strings so that changing a palette entry
    // restyles existing saves instead of leaving them on a dead colour.
    hat: 0,
    shirt: 0,
    car: 0,        // the colour it is painted
    vehicle: 0,    // which vehicle, by its position in CONFIG.VEHICLES

    // Which colours have been bought, as positions in those same palettes.
    // The free ones are added on load rather than stored, so changing
    // FREE_PER_ROW takes effect for existing saves too.
    unlocked: { hat: [], shirt: [], car: [], vehicle: [] },
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
    const merged = { ...defaults, ...parsed };

    // Anything nested needs merging by hand, and needs checking: a corrupt
    // or hand-edited save must not be able to crash the shop.
    merged.unlocked = { ...defaults.unlocked, ...(parsed.unlocked || {}) };
    for (const row of ['hat', 'shirt', 'car', 'vehicle']) {
      const list = merged.unlocked[row];
      merged.unlocked[row] = Array.isArray(list)
        ? list.filter((n) => Number.isInteger(n) && n >= 0)
        : [];
    }
    if (!Number.isFinite(merged.coins) || merged.coins < 0) merged.coins = 0;
    if (!Number.isInteger(merged.vehicle) || merged.vehicle < 0) merged.vehicle = 0;
    merged.muted = merged.muted === true;

    return merged;
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
