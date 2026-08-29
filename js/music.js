/**
 * music.js — Background music, made of notes rather than a recording.
 *
 * There is no music file. The whole tune is a few lines of note data played
 * through the same oscillators that make the game's other sounds, which means
 * it adds **nothing at all** to what the phone downloads, works with no
 * connection, and leaves nothing permanent in the repository. A recorded loop
 * would be a few hundred kilobytes downloaded on install and kept in git
 * history for ever, even if it were later removed.
 *
 * If a real recording is ever wanted instead, this module is the only place
 * that would change: `startMusic` / `stopMusic` / `setMusicMuted` is the whole
 * of what the game knows about it.
 *
 * HOW IT IS MEANT TO SOUND. Quiet, slow and a bit dreamy — something to play
 * under a game for hours without anybody noticing it, which is the opposite of
 * a tune you would hum. Three things do most of that work:
 *
 *   - Everything is in a MAJOR PENTATONIC scale, which has no semitone steps
 *     in it. Nothing picked at random from it can sound wrong against
 *     anything else, so the melody can wander freely and never sour.
 *   - The chords underneath move slowly and gently, and the melody is sparse:
 *     plenty of bars have only one or two notes in them.
 *   - It never repeats exactly. The melody is chosen fresh each bar rather
 *     than being a fixed loop, so there is no seam to start listening for.
 *
 * Every call is wrapped in try/catch. Music must never be the reason a game
 * stops working.
 */

import { audioContext } from './audio.js';

/**
 * Major pentatonic, in semitones from the root. No semitone steps, so any two
 * of these sound fine together — that is what lets the melody be improvised.
 */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];

/** A slow, plain, happy chord progression, in semitones from the root. */
const CHORDS = [
  [0, 4, 7],    // I
  [5, 9, 12],   // IV
  [7, 11, 14],  // V
  [5, 9, 12],   // IV
  [0, 4, 7],    // I
  [9, 12, 16],  // vi — the one slightly wistful bar
  [5, 9, 12],   // IV
  [7, 11, 14],  // V
];

const ROOT = 130.81;          // C3, low enough to sit under everything
const BEAT = 0.92;            // seconds — about 65 beats a minute
const BEATS_PER_BAR = 4;

/** How far ahead notes are scheduled. */
const LOOKAHEAD = 1.6;

let master = null;
let muted = false;
let running = false;
let nextBarAt = 0;
let bar = 0;

const semitone = (n) => ROOT * Math.pow(2, n / 12);

/**
 * One soft note.
 *
 * Long fades at both ends. A background pad that starts abruptly is the single
 * quickest way to make quiet music annoying.
 */
function voice(ctx, freq, at, dur, gain, type = 'sine') {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);

  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.35, dur * 0.4));
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(env);
  env.connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Lay down one bar: the chord underneath, then a few notes over the top. */
function scheduleBar(ctx, at) {
  const chord = CHORDS[bar % CHORDS.length];
  const barLength = BEAT * BEATS_PER_BAR;

  // The chord, held for the whole bar and very quiet.
  for (const step of chord) {
    voice(ctx, semitone(step), at, barLength * 0.95, 0.030, 'sine');
  }

  // A little bass note on the first beat, for something to sit on.
  voice(ctx, semitone(chord[0] - 12), at, BEAT * 1.8, 0.045, 'triangle');

  // And a sparse melody an octave or two up. Most beats stay empty on
  // purpose: the gaps are what stop it becoming a tune you notice.
  for (let b = 0; b < BEATS_PER_BAR; b++) {
    if (Math.random() > 0.45) continue;

    const step = SCALE[Math.floor(Math.random() * SCALE.length)];
    const octave = Math.random() < 0.35 ? 24 : 12;
    const when = at + b * BEAT + (Math.random() < 0.3 ? BEAT / 2 : 0);

    voice(ctx, semitone(step + octave), when, BEAT * 1.5, 0.026, 'triangle');
  }

  bar++;
}

/**
 * Top up the schedule. Called once a frame, from the game loop.
 *
 * This used to run on its own `setInterval`, which Chrome throttles hard in a
 * page that is not focused — the music simply stopped a few seconds in and
 * came back when the page was clicked. Hanging it off the frame the game is
 * already drawing means the music runs exactly when the game does, which is
 * also the only time anybody can hear it.
 */
export function updateMusic() {
  try {
    const ctx = audioContext();
    if (!ctx || !running) return;

    // A suspended context has a frozen clock, so anything scheduled now would
    // pile up and all play at once the moment it resumes. Safari in particular
    // hands back a suspended context even inside a user gesture, so this is
    // not a theoretical case. Ask it to start, and schedule nothing until it
    // has.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      return;
    }

    const barLength = BEAT * BEATS_PER_BAR;
    if (nextBarAt < ctx.currentTime) nextBarAt = ctx.currentTime + 0.1;

    while (nextBarAt < ctx.currentTime + LOOKAHEAD) {
      scheduleBar(ctx, nextBarAt);
      nextBarAt += barLength;
    }
  } catch (err) {
    // Never let the music take the game down.
  }
}

/**
 * Start playing. Safe to call more than once.
 *
 * Must be called from inside a real user gesture, or after one — phones
 * refuse to make any sound before the page has been touched.
 */
export function startMusic() {
  try {
    const ctx = audioContext();
    if (!ctx || running) return;

    master = ctx.createGain();
    // Deliberately well below the sound effects. Music that competes with the
    // coin pings is music somebody will want turned off.
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.5, ctx.currentTime + 2.5);
    master.connect(ctx.destination);

    running = true;
    nextBarAt = ctx.currentTime + 0.3;
    updateMusic();
  } catch (err) {
    running = false;
  }
}

/** Stop, and let anything already sounding fade out rather than cut off. */
export function stopMusic() {
  try {
    running = false;

    const ctx = audioContext();
    if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    }
    master = null;
  } catch (err) {
    master = null;
  }
}

/** Silence or restore the music without losing its place. */
export function setMusicMuted(v) {
  muted = !!v;
  try {
    const ctx = audioContext();
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.5, ctx.currentTime + 0.4);
  } catch (err) {
    // Nothing to do; the game carries on either way.
  }
}
