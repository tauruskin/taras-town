/**
 * save.js — which levels are open and which are finished, and nothing else.
 *
 * The storage is handed in rather than reached for, so this file never touches
 * `localStorage` at import time and Node can test every failure: main.js passes
 * the real one, the suite passes fakes. Every read and write is in try/catch
 * and gives the defaults on any failure — a private-mode browser gets a
 * playable game with no memory, never an error. That is a hub rule.
 *
 * `unlocked` counts levels from the start that may be played, so 1 means only
 * the first. `finished` holds level ids, not indexes, so a level moved in the
 * list keeps its star.
 */
export const SAVE_KEY = 'pushkar-ball-save';

export function freshProgress() {
  return { unlocked: 1, finished: [] };
}

/** Progress from `storage`, cleaned against `levels`. Never throws. */
export function loadProgress(storage, levels) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return freshProgress();
    return clean(JSON.parse(raw), levels);
  } catch (_) {
    return freshProgress();
  }
}

/** Write `progress`. True if it was stored, false if storage refused. */
export function saveProgress(storage, progress) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(progress));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Progress after winning the level at `index`: that level finished, and the
 * next one open. A new object — the one given is left alone. Never lowers
 * `unlocked`, so replaying level one does not lock level five again, and never
 * raises it past the last level.
 */
export function markWon(progress, index, levels) {
  const id = levels[index].id;
  return {
    unlocked: Math.min(levels.length, Math.max(progress.unlocked, index + 2)),
    finished: progress.finished.includes(id) ? [...progress.finished] : [...progress.finished, id],
  };
}

/**
 * Whatever was stored, made safe. A value typed in by hand or left by an older
 * version must not open a level that does not exist or crash the tiles.
 */
function clean(data, levels) {
  const n = levels.length;
  const unlocked = Number.isInteger(data?.unlocked) ? Math.min(n, Math.max(1, data.unlocked)) : 1;
  const ids = new Set(levels.map((l) => l.id));
  const finished = Array.isArray(data?.finished) ? [...new Set(data.finished.filter((id) => ids.has(id)))] : [];
  return { unlocked, finished };
}
