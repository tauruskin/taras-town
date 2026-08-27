/**
 * audio.js — Little sounds, generated on the fly.
 *
 * There are no sound files. Every noise here is a plain oscillator, which
 * keeps the repository tiny and means there is nothing to fail to download.
 *
 * Phones refuse to make any sound until the user has touched the page, which
 * is one of the reasons the game starts with a "tap to play" screen — that
 * tap is what lets `init()` succeed.
 *
 * Every function is wrapped in try/catch. If audio is unavailable, blocked,
 * or the browser is being awkward, the game must carry on silently rather
 * than break.
 */

let ctx = null;
let muted = false;
let music = null;

/** Call once, from inside a real user gesture. */
export function initAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // Safari often hands back a suspended context even inside a gesture.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // Background music
if (!music) {
  music = new Audio('./audio/jazz-bossa-nova-cooking-show-music-312826.mp3');
  music.loop = true;
  music.volume = 0.25;
}

if (!muted) {
  music.play().catch(() => {});
}
  } catch (err) {
    ctx = null;
  }
}

/**
 * Silence everything, or let it speak again.
 *
 * Deliberately the single switch for ALL sound, not just the effects that
 * exist today. When music is added it should go through `note()` or check
 * `isMuted()` too, so the one button in the corner keeps meaning "quiet
 * please" rather than becoming "quiet except for the bit I forgot about".
 */
export function setMuted(v) {
  muted = !!v;

  if (music) {
    if (muted) {
      music.pause();
    } else {
      music.play().catch(() => {});
    }
  }
};
}

export function isMuted() {
  return muted;
}

/**
 * One note.
 * @param freq   pitch in Hz
 * @param start  seconds from now
 * @param dur    length in seconds
 * @param gain   0..1
 * @param type   oscillator shape
 */
function note(freq, start, dur, gain = 0.16, type = 'sine') {
  if (!ctx || muted) return;
  try {
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    // A quick fade in and out. Without it every note starts with an audible
    // click, which sounds broken rather than cheerful.
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch (err) {
    // Never let a sound take the game down.
  }
}

/** A short pip — picking something up, pressing a button. */
export function playPickup() {
  note(880, 0, 0.10, 0.14, 'triangle');
  note(1320, 0.05, 0.12, 0.10, 'triangle');
}

/** A rising three-note fanfare for finishing a job. */
export function playSuccess() {
  note(523.25, 0.00, 0.16, 0.16, 'triangle');  // C5
  note(659.25, 0.11, 0.16, 0.16, 'triangle');  // E5
  note(783.99, 0.22, 0.34, 0.18, 'triangle');  // G5
  note(1046.5, 0.34, 0.42, 0.12, 'sine');      // C6, softer, on top
}

/** A friendly two-note "hello" when a job is handed out. */
export function playAccept() {
  note(659.25, 0, 0.12, 0.14, 'triangle');
  note(880, 0.09, 0.18, 0.13, 'triangle');
}

/**
 * A soft downward "not yet" for trying to buy something unaffordable.
 *
 * Deliberately gentle rather than a buzzer: wanting something you cannot
 * afford yet is not a mistake to be told off for.
 */
export function playDenied() {
  note(392.00, 0, 0.14, 0.12, 'sine');     // G4
  note(293.66, 0.10, 0.22, 0.11, 'sine');  // D4
}
