/**
 * flow.js — the sequence of rounds: play a level, touch the flag, see the
 * panel, and move on.
 *
 * This used to be a handful of `let`s and an `if` in main.js, which is exactly
 * how Taras Town's main.js grew to 1800 lines, and nothing could test it
 * there: auto-advance, retry, the hub button and "the ball is not simulated
 * while the panel is up" all lived behind a DOM. None of them needs one. So
 * the whole state machine is here, DOM-free, and main.js is left with the
 * loop, the camera and the drawing — plus the one thing that genuinely needs
 * a browser, which is going to another page. `tap` hands "home" back as a
 * value for exactly that reason.
 *
 * It is handed an Input-shaped object rather than importing input.js, so
 * that node can drive it with the real Input on a fake canvas, and it owns
 * the switch that turns the game's controls off under the panel: the moment
 * the mode changes is the only moment that knows the controls must change.
 */
import { CONFIG } from './config.js';
import { LEVELS, loadLevel, nextLevel } from './levels.js';
import { Ball } from './player.js';
import { Panel } from './ui.js';

export class Flow {
  /**
   * @param input   anything with `left`, `right`, `takeJump()` and
   *                `setControls(on)` — the real Input in the game.
   * @param levels  the list to play through. LEVELS in the game; a list built
   *                for the purpose in a test, because moving on needs somewhere
   *                to move on to.
   * @param onStart called with this flow every time a level begins, including
   *                a retry. main.js builds the camera there, because a camera
   *                needs to know the screen and this file must not.
   */
  constructor(input, { levels = LEVELS, onStart = () => {} } = {}) {
    this.input = input;
    this.levels = levels;
    this.onStart = onStart;
    this.levelIndex = 0;
    this.level = null;
    this.ball = null;
    // 'playing' until the flag, then 'won' while the panel is up. Two values,
    // and it should stay that way: a mode is the thing that quietly grows into
    // a tangle.
    this.mode = 'playing';
    this.wonFor = 0;          // seconds the results panel has been up
  }

  /**
   * Throw away the current level and start the one at `i`.
   *
   * Everything is rebuilt rather than reset — a new level object, so pushed
   * crates, taken checkpoints and the platforms' clock all come back as
   * authored with no bookkeeping, and a new ball, so `won` needs clearing
   * nowhere. A retry is this, called with the same index.
   */
  start(i) {
    this.levelIndex = i;
    this.level = loadLevel(this.levels[i]);
    this.ball = new Ball(this.level.spawn.x, this.level.spawn.y);
    this.mode = 'playing';
    this.wonFor = 0;
    this.input.setControls(true);
    this.onStart(this);
  }

  /**
   * One fixed step.
   *
   * The level keeps running while the panel is up, so the platforms carry on
   * moving behind it: a world that froze the instant you won would look like
   * the game had crashed at the moment of the reward.
   *
   * The ball does not. It is not updated at all once the level is won, which
   * is safe only because a won ball can be neither deflating nor re-inflating
   * — player.js makes that true at the goal check. It does mean the ball stays
   * wherever it won, even in mid-air, and a moving platform can slide through
   * it behind the panel; that is accepted, because the panel covers it and a
   * ball that went on rolling behind a results panel would be worse.
   *
   * Auto-advance is counted here, per step, rather than per frame, so that it
   * happens on exactly the step that reaches RESULTS.HOLD on every screen.
   * The comparison allows a hair of float error because `wonFor` is a sum of
   * 1/120ths, and 384 of them come to a shade under 3.2 rather than 3.2.
   */
  step(dt) {
    this.level.update(dt);

    if (this.mode === 'playing') {
      this.ball.update(dt, this.input, this.level);
      if (this.ball.won) {
        this.mode = 'won';
        // The controls go off, and every press in flight is dropped, on the
        // step the flag is touched. See Input.setControls for what each of
        // those presses would otherwise do.
        this.input.setControls(false);
      }
      return;
    }

    this.wonFor += dt;
    if (this.wonFor < CONFIG.RESULTS.HOLD - 1e-9) return;
    const next = nextLevel(this.levelIndex, this.levels);
    // Null means there is nowhere to go, so the last level stays on its panel
    // rather than promising a level that does not exist. Not a dead end:
    // retry and the hub are both still on it — and phase 4's level select is
    // where this will lead instead.
    if (next !== null) this.start(next);
  }

  /**
   * A tap at (x, y) on a w-by-h screen, in CSS pixels.
   *
   * Returns what it did: 'retry' having restarted the level, 'home' for the
   * caller to act on, or null if it was not on a panel button — which
   * includes every tap while the level is being played.
   *
   * 'home' is handed back rather than acted on because going to another page
   * is the one thing in this whole flow that needs a browser, and keeping it
   * out is what lets node test everything else.
   */
  tap(x, y, w, h) {
    if (this.mode !== 'won') return null;
    const hit = Panel.at(x, y, w, h);
    if (hit === 'retry') { this.start(this.levelIndex); return 'retry'; }
    if (hit === 'home') return 'home';
    return null;
  }

  /**
   * How many of the panel's three stars this finish earned.
   *
   * One, for finishing, because phase 2 has nothing else to earn them with.
   * Phase 3 brings gems, and this is where counting them belongs — named here
   * so that is a change to one function rather than a hunt for a literal.
   */
  get stars() {
    return 1;
  }
}
