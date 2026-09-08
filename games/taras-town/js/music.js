/**
 * music.js — Background music.
 *
 * A recorded track, `sounds/music.m4a`, with a generated one behind it.
 *
 * The tune below used to be the whole of it: note data played through the
 * same oscillators as the game's other sounds, costing nothing to download.
 * It was replaced on request — short effects synthesise convincingly, a
 * melody does not, and this one was judged not good enough to keep. The file
 * is 809KB, mono at 48kbps, which is the size that decision costs. It is
 * committed once and deliberately not iterated on, because anything put in
 * git stays in its history for ever whether or not it is later removed.
 *
 * The generated tune is kept, and still plays if the file cannot be fetched
 * or decoded — a first run on a bad connection, or a browser that will not
 * take AAC. It is a fallback now rather than the main event.
 *
 * `startMusic` / `stopMusic` / `setMusicMuted` is the whole of what the rest
 * of the game knows about any of this.
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
    // The recording plays itself; there is nothing to schedule.
    if (!useGenerated) return;

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
const MUSIC_FILE = 'sounds/music.m4a';
let trackBuffer = null;    // the decoded recording, once it has arrived
let trackSource = null;    // it playing, on a loop
let useGenerated = false;  // true once the file has been given up on

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

    if (useGenerated) { updateMusic(); return; }
    if (trackBuffer) { playTrack(ctx); return; }

    // Fetch it, and start when it arrives. Music appearing a second late on a
    // first run is not worth noticing; after that the service worker has it
    // and there is no wait at all. Relative path, like everything else here —
    // GitHub Pages serves this game from a subfolder.
    fetch(MUSIC_FILE)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        trackBuffer = buf;
        if (running) playTrack(ctx);
      })
      .catch(() => {
        // No file. Fall back to the tune this module used to be, rather than
        // to silence.
        useGenerated = true;
        if (running) { nextBarAt = ctx.currentTime + 0.3; updateMusic(); }
      });
  } catch (err) {
    running = false;
  }
}

/** The recording, looping, under the same volume control as everything else. */
function playTrack(ctx) {
  try {
    if (trackSource) return;
    trackSource = ctx.createBufferSource();
    trackSource.buffer = trackBuffer;
    trackSource.loop = true;
    trackSource.connect(master);
    trackSource.start();
  } catch (err) {
    trackSource = null;
    useGenerated = true;
  }
}

/** Stop, and let anything already sounding fade out rather than cut off. */
export function stopMusic() {
  try {
    running = false;

    // Let go of the recording, but keep the decoded buffer: starting again
    // should not mean fetching and decoding 800KB a second time.
    if (trackSource) {
      try { trackSource.stop(); } catch (e) { /* already finished */ }
      trackSource = null;
    }

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
