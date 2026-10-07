# Session handoff: Pushkar Ball, level 14 stomp in browser/shells (2026-10-07)

- **Repo:** `D:/VIBE CODING/Taras-Town`, branch `main`.
- **State:** HEAD is `6e0d5ca` and everything is pushed. Sub-project 3 (shell, aimed popper, levels 12–15) is built, documented and live.
- **The one open item** is a test fragility, not a known game bug.
- **Ask Oleksandr before pushing.**

## The problem

`games/pushkar-ball/tests/browser/shells.mjs` failed once on level 14 at 740x280, during a full `node games/pushkar-ball/tests/run.mjs`. The output, verbatim:

```
740x280, level 14
   9 presses and pictures by level time; the latest was 9ms behind, the latest press 6ms
   lit heart pixels at the start: 4065; pictures short of it: 14-shellpopA-14 (2710), ... 14-shellpopA-18 (2710)
  FAIL: level 14 at 740x280: a heart was lost before 14-shellpopA-14 ... (4065 lit at the start)
   14-shellpopA, pop/body pixels picture by picture: 0/651 ... 0/838   (no pop in any picture)
   14-shellpopA, every frame drawn: 253 frames, the pop first in frame -1
  FAIL: no frame drawn shows the shell's pop (14-shellpopA) at 740x280
```

What the output shows:
- During the live stomp on the flipped shell (`14-shellpopA`), the ball took a hit instead of popping the shell. It lost one heart: 4065 → 2710 lit pixels, which is one of three hearts.
- After that, 253 frames were drawn with no pop.
- Presses were at most 9ms late, well inside `LATE = 8` steps (~67ms). So late presses alone don't explain it.

What is known about it:
- Run alone afterwards, `run.mjs browser/shells` passed 3 of 3. It failed only in the full run, under load.
- The same heart loss on level 14's live stomp was seen once earlier, before the press-timing fixes in `671d64a` and `4fab783`.
- The offline `finish.mjs` level 14 route always passes. So the game is finishable, and the problem is in the browser suite's live steering (`stompLive` in `shells.mjs`). Prove that rather than assume it. CLAUDE.md warns that "flaky" has twice been wrong here.

## Suggested approach

1. **Instrument before guessing.** Make `stompLive` print the ball's x/y/vx/vy, the shell's state and position, and level time each step around the stomp, at least when a heart is lost. Then reproduce the failure under load, by running the full browser group or `shells` several times in a row.
2. **Look for what differs from Node's plan.** Candidates:
   - frame-time variance under load, which changes how many fixed steps run between a press and its observation;
   - the steering tolerances in `stompLive`: 4/3/30 units, a 70 jump gap, and a 1.5px "grounded" tolerance that was simply chosen;
   - the shell's or charger's position drifting from the plan.
3. **Fix the steering so it holds across that variance.** Never weaken the heart guard or the pop assertions. Prove that the fix can fail.
4. **Run `run.mjs browser/shells` about 5 times, then the full `run.mjs` once.** Expect only "level 7 has no route". If shells passes in the full run, commit and ask before pushing.

## Ground rules (from this project)

- **No test-only code** in `games/pushkar-ball/js/`. Tests touch only `tests/`.
- **Number provenance:** every number in a comment says "printed by <suite>", "from config.js", or "simulated (how)".
- **Never `git stash`.** Verify each edit with `git diff`, because working copies can be CRLF.
- **Use subagent-driven development:** an implementer, then a spec review, then a quality review. Opus does the reviews.
- **Cap the effort.** If the first fix round doesn't hold, stop and record findings here rather than keep looping.

## Background

- `C:\Users\Oleksandr\.claude\projects\d--VIBE-CODING-Taras-Town\memory\pushkar-mechanisms-roadmap.md`
- `games/pushkar-ball/tests/README.md`, the browser `shells` row
- `docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md`, "What the build taught" (browser fragility)

## For Oleksandr to try by thumb (no test can judge this)

- **The camera:** a grounded ball now brings the camera fully to rest, which changes the look on slopes and steps in every level.
- **Level 13 room B's faster, flatter lob:** 0.72s instead of 1.1s.

## Findings, 2026-10-07 session (one fix round, did not hold; stopped)

- **Instrumentation committed, not pushed: `81915b0`** (shells.mjs only). `stompLive` records every look (ms, look cost, ball x/y, screen-space v, GROUND/air, target dx, other enemy, stars, hearts, actions + press cost) and prints the trace only on failure. Passes unloaded. Not yet spec/quality reviewed.
- **Reproduced under load:** 30 spinning worker threads on the 20-core box (scratchpad `burn.mjs`) → level 14 live stomp lost a heart 2/2 (568x320, 740x280). 20 threads: passes. 60: page never draws (meaningless). At 30 threads level 12 `12-roomB-flipped` also often fails "no shell" — separate, uninvestigated.
- **What the trace shows:** looks slow ~5x (20–100ms apart; a tap costs 60–107ms). First jump overshoots; ball drifts in air; a falling ball within 1.5px of ground is read as GROUND, the tap does nothing, and the never-reset `jumped` latch blocks the real jump; time runs out — shell's 4.0s FLIPPED or charger's 3.5s DAZED ends — and the ball rolls into an awake enemy.
- **Fix tried and reverted:** two-look grounded test, tap un-latched if still grounded 300ms later, air gap extrapolated by closing rate. Still 2/2 heart loss at 30 threads. New trace: ball reached the shell (dx -1.3, 3.0) then drifted to dx 37.6 → 83.1 **while holding left**. Latency alone does not explain this.
- **Next leads (unverified):** (1) does `hands.hold('l')` survive a `hands.tap()`? Repeat holds returned in 0ms, suggesting hold skips a direction it thinks is already down — a tap may release it. (2) does a flipped shell push the ball away on contact? (3) screen-x conflates camera and world motion; a world-space reference is needed to separate them.
- Open question for Oleksandr: is 30-thread load a fair bar, given 20 threads passes?

## Oleksandr's decisions, 2026-10-07

- **Next session:** check the two leads above (does a tap release `hold('l')`; does a flipped shell push the ball away) before any new fix.
- **Level 12 `12-roomB-flipped` failing under 30-thread load: closed, accepted as is.** Do not investigate.
- **Played and approved by thumb:** the camera resting fully when grounded, and level 13 room B's 0.72s lob. Nothing to change.
- **`81915b0` (the instrumentation) has not been reviewed.** The next session's spec and quality reviews cover it along with whatever changes it makes to `stompLive`.
