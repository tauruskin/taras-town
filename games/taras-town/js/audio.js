/**
 * audio.js — The game's sound effects.
 *
 * Most of it is generated on the fly out of plain oscillators, which costs
 * nothing to download and cannot fail to arrive. The exceptions are the
 * footsteps, the swimming and the rotor, which are short recordings in
 * `sounds/` — synthesised versions of those were built first and rejected by
 * ear. The generated ones are still here and still run when a file cannot be
 * fetched or decoded.
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

/** Call once, from inside a real user gesture. */
export function initAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // Safari often hands back a suspended context even inside a gesture.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (err) {
    ctx = null;
  }
}

export function setMuted(v) {
  muted = !!v;
}

export function isMuted() {
  return muted;
}

/**
 * The one AudioContext, for the music to share.
 *
 * A second context would be a second lot of hardware plumbing, and on some
 * phones only the first one is allowed to make any noise at all.
 */
export function audioContext() {
  return ctx;
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

// ---------------------------------------------------------------------------
// Footsteps and swimming
//
// These two are different from everything above: they play over and over for
// as long as he is moving, so they have to be quiet, and they have to vary.
// A footstep played identically four times a second stops being a footstep
// and becomes a rattle.
//
// They are noise through a filter rather than notes. A recording of a real
// footstep was measured to build these: the attack is about a millisecond,
// it is dead within ten, the energy sits low — about half of it under 500Hz —
// and the bright part of the click sits around 2kHz. So each step is two
// layers, a short bright tap over a softer low thump, which is what a shoe
// on a pavement actually is.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Recorded sounds
//
// The footsteps and the swimming are the one place this game uses recordings
// rather than generating the noise, because synthesised versions of both were
// tried and rejected by ear. They are kept small on purpose: four footsteps
// and one swimming stroke come to 24KB between them, cut out of longer takes
// and levelled so they sit together.
//
// Four different footsteps rather than one, because a single step played over
// and over is a rattle within four paces. They are dealt out in turn and each
// is nudged slightly in pitch and volume on the way past.
//
// Everything here degrades to silence rather than to an error. If the files
// have not arrived yet, or the browser will not decode them, the game plays
// on without them — which is also what happens for the first second or two of
// a very slow connection.
// ---------------------------------------------------------------------------

const SOUND_FILES = {
  step1: 'sounds/step1.m4a',
  step2: 'sounds/step2.m4a',
  step3: 'sounds/step3.m4a',
  step4: 'sounds/step4.m4a',
  swim: 'sounds/swim.m4a',
  heli: 'sounds/heli.m4a',
};

const buffers = {};      // name -> AudioBuffer, once it has arrived

/**
 * Fetch and decode the recorded effects.
 *
 * Called after the game has started rather than at load, so a slow phone gets
 * a playable town first and its footsteps a moment later.
 */
export function loadSounds() {
  if (!ctx) return;
  for (const [name, url] of Object.entries(SOUND_FILES)) {
    if (buffers[name]) continue;
    // Relative, like everything else here: GitHub Pages serves this game from
    // a subfolder, and a leading slash would look for it at the top of the
    // whole site and quietly find nothing.
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => { buffers[name] = buf; })
      .catch(() => { /* no sound is fine; a broken game is not */ });
  }
}

/** Play a decoded sound, or do nothing if it has not arrived. */
function sample(name, { gain = 1, rate = 1 } = {}) {
  if (!ctx || muted || !buffers[name]) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
    return true;
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The rotor
//
// Unlike everything else in this file this one runs for as long as he is in
// the air, so it is started and stopped rather than fired. It fades in and out
// rather than snapping, because a loop that begins at full volume sounds like
// a fault.
// ---------------------------------------------------------------------------

let rotorSource = null;
let rotorGain = null;

/** Start the rotor if it is not already going. Safe to call every frame. */
export function startRotor() {
  if (!ctx || muted || rotorSource || !buffers.heli) return;
  try {
    rotorSource = ctx.createBufferSource();
    rotorSource.buffer = buffers.heli;
    rotorSource.loop = true;

    rotorGain = ctx.createGain();
    rotorGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    rotorGain.gain.exponentialRampToValueAtTime(0.30, ctx.currentTime + 0.5);

    rotorSource.connect(rotorGain);
    rotorGain.connect(ctx.destination);
    rotorSource.start();
  } catch (err) {
    rotorSource = null;
    rotorGain = null;
  }
}

/** Stop it, fading down rather than cutting off. Safe to call every frame. */
export function stopRotor() {
  if (!rotorSource) return;
  try {
    const src = rotorSource;
    const g = rotorGain;
    rotorSource = null;
    rotorGain = null;
    if (g && ctx) {
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    }
    setTimeout(() => { try { src.stop(); } catch (e) { /* already done */ } }, 600);
  } catch (err) {
    rotorSource = null;
    rotorGain = null;
  }
}

let noiseBuffer = null;

/**
 * A source of white noise. One buffer, made once and looped, because
 * generating a fresh second of random numbers per footstep would be a lot of
 * work several times a second for no audible difference.
 */
function noise() {
  if (!ctx) return null;
  if (!noiseBuffer) {
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  // Start somewhere different each time, so repeated steps are not the same
  // slice of noise over and over.
  return src;
}

/** One layer of filtered noise with its own envelope. */
function burst(t, { filter, freq, q, peak, attack, decay, stop }) {
  const src = noise();
  if (!src) return;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (q != null) f.Q.setValueAtTime(q, t);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + decay);

  src.connect(f);
  f.connect(env);
  env.connect(ctx.destination);
  src.start(t, Math.random() * 0.4);
  src.stop(t + stop);
  return f;
}

/**
 * One footstep.
 *
 * @param strength 0..1, how hard he is walking. Quieter when he is barely
 *                 moving, so easing the stick does not produce full stamps.
 */
let stepTurn = 0;

export function playFootstep(strength = 1) {
  if (!ctx || muted) return;
  const level = Math.min(1, Math.max(0.25, strength));

  // The recordings, dealt out in turn so the same foot never lands twice
  // running, with a little pitch and volume wander on top of that.
  stepTurn = (stepTurn + 1) % 4;
  if (sample(`step${stepTurn + 1}`, {
    gain: 0.5 * level * (0.85 + Math.random() * 0.3),
    rate: 0.94 + Math.random() * 0.12,
  })) return;

  // Not arrived yet, or the browser would not decode them. Fall back to the
  // synthesised version rather than to silence — it is the difference between
  // a quiet first few seconds and a game that never has footsteps at all.
  try {
    const t = ctx.currentTime;
    // No two steps quite alike. Without this it is a machine gun within
    // about four paces.
    const v = 0.85 + Math.random() * 0.3;

    // The tap of the shoe: bright, and gone almost immediately.
    burst(t, {
      filter: 'bandpass', freq: 2100 * v, q: 0.8,
      peak: 0.035 * level, attack: 0.001, decay: 0.035, stop: 0.05,
    });

    // The body of the step under it, where most of the weight is.
    burst(t, {
      filter: 'lowpass', freq: 360 * v, q: 0.7,
      peak: 0.055 * level, attack: 0.001, decay: 0.075, stop: 0.09,
    });
  } catch (err) {
    // Never let a sound take the game down.
  }
}

/**
 * Water moving as he swims through it.
 *
 * The first attempt at this was guessed rather than measured, and it was
 * wrong in a way the recording made obvious. Water here has almost NO bottom
 * end — one per cent of it below 500Hz — and no hiss on top either. Three
 * quarters of it sits between 500Hz and 2kHz, and it is resonant rather than
 * hissy, so it wants a narrow filter rather than a wide one. The first
 * version had its filter down at 520Hz with a fizz at 3kHz on top, which is
 * why it sounded like static instead of like water.
 *
 * It is also a continuous wash, not a series of separate splashes: each one
 * runs long enough to overlap the next, which is what stops it sounding like
 * somebody slapping the surface.
 */
export function playSwimStroke(strength = 1) {
  if (!ctx || muted) return;
  const level = Math.min(1, Math.max(0.25, strength));

  // Only one swimming recording, so the variation has to come from the pitch
  // and the level — a wider wander than the footsteps get, since there is no
  // second take to alternate with.
  if (sample('swim', {
    gain: 0.42 * level * (0.8 + Math.random() * 0.4),
    // Slightly under speed on average, which lengthens each stroke as well as
    // dropping it in pitch — an unhurried arm rather than a splash.
    rate: 0.84 + Math.random() * 0.2,
  })) return;

  try {
    const t = ctx.currentTime;
    const v = 0.88 + Math.random() * 0.24;

    // The body of it, where three quarters of the energy is. Narrow, because
    // the recording is resonant rather than hissy.
    const f = burst(t, {
      filter: 'bandpass', freq: 900 * v, q: 2.2,
      peak: 0.065 * level, attack: 0.055, decay: 0.30, stop: 0.36,
    });
    // Rolling up and back down as he pulls through.
    if (f) {
      f.frequency.exponentialRampToValueAtTime(1550 * v, t + 0.13);
      f.frequency.exponentialRampToValueAtTime(820 * v, t + 0.30);
    }

    // A quieter wash above it, filling out the 2-4kHz shoulder. Nothing
    // higher: there is no content above 8kHz in the recording at all, and
    // adding any reads as radio static rather than as water.
    burst(t, {
      filter: 'bandpass', freq: 2500 * v, q: 1.4,
      peak: 0.022 * level, attack: 0.07, decay: 0.26, stop: 0.32,
    });
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
