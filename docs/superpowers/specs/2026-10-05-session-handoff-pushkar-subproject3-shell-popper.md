# Session handoff — Pushkar Ball sub-project 3: shell, aimed popper, levels 12–15 (2026-10-05)

- Repo: `D:/VIBE CODING/Taras-Town`, branch `main`. Nothing pushed; ask Oleksandr before pushing.
- Spec: `docs/superpowers/specs/2026-10-05-shell-aimed-popper-design.md`, committed in `397bcec`. That commit also updated the roadmap's levels table: 12 shell intro, 13 aimed popper intro, 14 shell+charger combination, 15 mastery, swooper/conveyor moved to 16+.
- Plan: `docs/superpowers/plans/2026-10-05-shell-aimed-popper.md`. It is untracked, like the two earlier plans in that folder. 13 tasks; Task 8 starts at about line 948, ground rules are lines 15–26.
- HEAD: `d4fbfe1`.
- Background memory, in `C:\Users\Oleksandr\.claude\projects\d--VIBE-CODING-Taras-Town\memory\`:
  - `pushkar-mechanisms-roadmap.md`
  - `taras-town.md`
  - `agent-resume-vs-continue.md`
- Execution is subagent-driven development on main. Each task gets an implementer, then a spec review, then a code-quality review. Opus does the reviews and the harder tasks.

## Where we are

Tasks 1–7 are done. All passed both reviews, and every new check was proven to fail at least once by breaking what it guards. Suites were run by the subagents. The latest offline run reported everything passing except the known level 7 line.

| Task | What | Commits |
|---|---|---|
| 1 | Separate `presses`/`blocks`; the gate check reads `blocks` | `a66e64c`, `b966c28`, `5edce8b` (docs) |
| 2 | A sender's `touched` is a Set of presser keys | `cef209d` |
| 3 | Pop shades per kind: `popShade`, particle `shade`, `CHARGER_POP` | `334e2b5`, `c45a6a5` |
| 4 | `stompEnemy` gathers every overlapped enemy and the stomp wins; new `Level.pop(e)` | `a81471a`, `e2cfed8` |
| 5 | The popper moves onto `enterState`/`runStates` | `9b9b3c9`, `20497a0` |
| 6 | The aimed popper | `1a36d93`, `8701a39`, `815a5ad`, `a9dbb21` |
| 7 | The shell | `bd93272`, `12aec14`, `efabb96`, `d4fbfe1` |

**Task 5.** Level 2's popper is `fixed: true`. The pin test reads level 2's own entry and prints a worst difference of 0.0e+0 over 681 positions (verified, printed by `offline/enemies`).

**Task 6, the aimed popper:**
- States go idle → aim → fire → reload. The target is locked in `idle` on the step the popper sees the ball.
- The lob uses a closed-form `lobVelocity` shared with `drawAimArc`, and ends at the first solid segment.
- The lob presses buttons through a separate presser loop, keyed `lob.shot` once per shot, and breaks planks.
- `updateSenders` throws on a presser with no key.
- `reset()` runs on respawn through `Level.resetEnemies()`, which `Ball.respawn` calls after `resetSenders`.
- `levels.mjs` checks that no popper's range covers a checkpoint or the spawn. It checks 0 poppers until level 13 exists.

**Task 7, the shell:**
- Its colours, `SHELL_BODY` / `EDGE` / `SHINE` / `POP` / `POP_EDGE`, are checked unique in `levels.mjs`.
- A falling crate (vy ≥ `FLIP_VY` 250) flips it; the crate check prints a flip at vy 1118.
- A charge flips it and dazes the charger. A patrolling charger turns at a shell.
- A kick is spent at the edge of its range. It has `reset()`.
- A shared `homeClear()` also stops a popped charger reappearing inside a crate on its home.
- Rendered and looked at, verified by eye: `scratchpad\shells-z2.png` in this session's temp folder.

**Wiring is now three independent questions,** documented in CLAUDE.md and the README:
- `presses` means it hits buttons and timers.
- `heavy` means it weighs plates.
- `blocks` means a closing gate won't come down on it.
- Every presser carries `key` and a boolean `buttons`, both guarded in `updateSenders`.

**Task 8 (level 12) is blocked.** No level data has been written; the tree is clean.

## Decisions made

All by Oleksandr unless noted.

- **The aimed popper locks where the ball was,** with a 1 s arc. It made redirection a real puzzle.
- **A flip is temporary.** The flipped shell is stompable and harmless; a popped one returns. The shell is heavy upright and flipped, so freeing a plate means flip, then stomp.
- **The shell is heavy, blocks gates, and never presses buttons.**
- **Two introduction levels come first,** so mastery is level 15: 12 shell, 13 aimed popper, 14 shell+charger.
- **The carried-over items,** settled during brainstorming:
  - The stomp wins.
  - `touched` is per presser.
  - A popped enemy's return also waits for crates.
  - Each kind has its own pop shade.
  - The gate check reads `blocks`.
- **Plan deviation (Claude):** a crate flips a shell by kicking the *shell* out from under it, not by sliding the crate off. Oleksandr accepted it by approving the plan.
- **Claude, on review advice:** wiring rewritten as the three explicit questions above, with `buttons: !!e.presses`. Chargers deliberately get no `reset()`; that gap is recorded below. The "stomp wins" rule postpones a same-step hurt by one step rather than cancelling it, pinned by chargers check 18.

## Open / next

1. **Get Oleksandr's decision on level 12 room B** (see Waiting on), then resume Task 8.
   - The implementer agent was `aea7fdbbb4dd0f779`. It may not survive into a new chat, so re-dispatch a fresh one with the decision and the analysis below.
   - **Working layout for a hit** (derived by hand from config.js, not simulated):
     - The ball walks on the corridor roof, which has two narrow holes with roof between them, and a tall wall just past the second hole.
     - Hole 1 is about 70 wide and is the crate's. The shell's `from` sits 40 past that hole's left edge, so a kick always goes right.
     - Hole 2 is about 80 wide and is the ball's way down to stomp.
     - The hit window is about 1.15 s per turn at the left end.
   - **Room A has no problem:** a pen under the roof, a plate, and a gate at 3200, clear of a shell ranging 1880–2900.
2. **Tasks 9–13 per the plan:**
   - 9: level 13, aimed popper.
   - 10: level 14, shell+charger.
   - 11: level 15, mastery.
   - 12: `tests/browser/shells.mjs` plus screenshots.
   - 13: docs and the full run.
3. **Task 9 must use the lob geometry found in Task 6.**
   - The lob falls steeply, about 4.5 px down per px forward at the end, simulated. A lob aimed past a floor-standing button lands on the post top and presses nothing.
   - Use a cap mounted **high on a wall** facing the popper. The ball stands at the wall's foot, and the lob falls through the cap's zone.
   - Planks are fine as they are.
4. **Task 13 must write up, in the spec's "What the build taught" / "Where the build departs":**
   - the shell kick decision;
   - the three-question wiring;
   - the target locked in `idle`;
   - the lob geometry;
   - `buttons`/`key` guards;
   - the charger-not-reset gap. It is reachable on level 11: a mid-charge charger can press button b after a respawn. That only opens the door, so it is harmless.
   - Also fix the stale line in `docs/superpowers/specs/2026-09-18-charger-enemy-state-machines-design.md` (~317–321) that says charger debris is still violet.
5. **Full run before any push:** `node games/pushkar-ball/tests/run.mjs`. Expect only "level 7 has no route". Then ask Oleksandr before pushing.

## Gotchas

- **Line endings.** Working copies can be CRLF while the index is LF. Subagents' edits silently failed to apply several times; always verify with `git diff`.
- **Stash races.** One subagent ran `git stash` while a background run was going. Forbid stash in prompts.
- **Slow substring runs.** `run.mjs <substring>` also matches browser suites, which takes about 2 minutes. Use `offline/<name>` for narrow runs.
- **Plan code was wrong in places:**
  - Task 1 omitted the roller comment.
  - The Task 6 room helper clobbered `boxes`.
  - The Task 6 test 4a geometry was wrong.
  - Task 7 had no path for a heavy non-presser to reach plates.
  
  Treat plan code as a starting point; never weaken an assertion.
- **`runStates` runs a new state's `update` only on the next step.** Lock anything that must be captured on entry in the previous state.
- **Quality reviews caught real bugs the spec reviews missed:** the respawn not resetting poppers, the spawn missing from the reach check, and the shell missing plates. Keep both reviews.
- **Subagents can die on API 529.** Resume them with SendMessage alone; never also call Agent with "continue".

## Waiting on

- **Oleksandr: level 12 room B, where a missed crate is a dead end.** The options:
  - **A (recommended):** a pit at the corridor's open end, so the ball shoves a missed crate into it and the crate returns to the roof. It's a timed shove with the upright shell approaching, to be proved with time to spare in `finish.mjs`.
  - **B:** a spare crate on the roof.
  - **C:** let a missed crate fall out of the level. This needs a hole in the shell's range, which breaks the shell ground rule.
  - **D:** drop the stomp, so the ball just rolls past a flipped shell. This loses the flip-then-stomp lesson that level 14 needs, and still needs A or B for a miss.

## UPDATE 2026-10-06 — Tasks 8-11 done; stopped mid Task 12 (usage limit)

HEAD 441652f, nothing pushed. All reviewed (spec + quality) unless noted.
- L12: 48af173, 84fe018. L13: cea2d60, e7d0312, 4d5ccd9. L14: f7ff49a, dbaf281. L15: 2acafc2, 1947225, 9241109.
- f34fc33 + b93f95a: camera — a grounded ball brings the camera to rest inside the deadzone (fixes L13 room B cap off-screen at 740x280). Feel change in EVERY level (slopes, steps): Oleksandr should try by thumb.
- 441652f: browser/small pad check was flaky since 9de233a (sample-count window ran to ~6.3s, into the gap); now bounded by page clock. Not separately reviewed.
- Check labels shifted: L13 2e/3p/3q, L14 2f/3r, L15 2g/3s(a-g).
- Decisions (Oleksandr delegated "make it interesting"): L12 pit at CLOSED end, hole 80, lip, tank-through accepted. L13 bracket/porch/entry-from-behind/perches accepted. L15 room 3 = option A with crate REQUIRED (gate needs t + plate c); room 2 stomp FORCED (door on pen roof, needs !s; plate q dropped — spec-review noted it's now closer to L14, accepted); lingering in pen mouth can cost a heart, accepted; timer 2.5s; 0.9s hesitation kept.
- OPEN for Oleksandr: L14 shell patrol can't exceed ~45 (proof: to-from < 48 given dazed charger heavy + plate by overlap); widening needs dropping a constraint (dazed charger not heavy in L14, or door not wired to a plate under the shell). Stays 30.
- Task 12 IN PROGRESS: untracked games/pushkar-ball/tests/browser/shells.mjs written by a stopped agent, UNREVIEWED, screenshots not yet looked at. Next session: re-dispatch Task 12 (plan line ~1074) telling it to start from that file, look at every PNG, prove the heart guard bites, run `run.mjs browser` once. Then Task 13 (docs incl. the items listed above under Open/next #4, plus all deviations here), full run, ask before push.
