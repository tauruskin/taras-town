# Wiring: buttons, timers, bridges, and levels 8-9

Sub-project 1 of
`docs/superpowers/specs/2026-09-18-mechanisms-and-enemies-roadmap.md`, agreed
2026-09-18. It generalises level 6's pressure switch and gate into a small
wiring system, adds two new senders and one new receiver, and builds the two
levels that teach them.

## Why this comes first

Every later piece of the roadmap — a charger hitting a button, a shell
holding a plate down, a popper's lob landing on a switch — is a thing that
*drives a mechanism*. Today the only such link is one crate-only plate
opening one gate, written directly into `levels.js`. Combination needs the
link to be general before anything else can plug into it.

## Senders

Three kinds. Each has its own look, so the rule can be read without text.

| Kind | Look | Pressed by | Rule |
|---|---|---|---|
| `plate` (today's switch) | flat grey stone slab, flush with the ground | anything **heavy** resting on it — a crate today, heavy enemies later; **never the ball** | on only while weighed down |
| `button` | a round cap on a short stone post, with a lamp | anything that **hits** it — the ball, a crate pushed into it, later a charger or a popper's lob | on the first hit, and **stays on** for the rest of the attempt |
| `timer` | the same as a button, with a ring round the cap | the same as a button | on when hit; the ring then drains over `time` seconds and the timer goes off; a hit while on refills the ring |

The sentence a child can learn from that: *heavy things hold plates down;
anything that hits a button presses it.* Level 6 already taught the first
half and stays true.

**A button's post is solid stone** — a box collider, which never gives way
like everything stone. The cap sits on one face of it (`face: 'left' |
'right' | 'up'`), and a hit is a presser's shape reaching within a couple of
units of that face. So an `up` button on a shelf is pressed by landing on
it, and a `left` button is pressed by rolling or pushing a crate into it. The
presser stops against the post, exactly as it would against any stone.

A button and a timer are **reset by a respawn** — falling back to a
checkpoint or losing every heart puts every sender back as the level
declared it, the same way a crate returns. Otherwise a button hit before a
fall would leave a room half-solved in a state the player did not choose.
That only works if **no checkpoint sits between a sender and a receiver it
drives** — otherwise a reset would leave the player past the button and in
front of a shut door. The `levels` suite enforces it.

## Receivers

**Gate** — as today: a stone wall that slides up into a slot while it is
powered. One new safety rule: **a closing gate never comes down onto
anything.** While the ball, a crate or (later) an enemy is under it, it stays
where it is, and finishes closing once that body has moved. This matters
now because a timer can go off with the ball halfway through.

**Bridge** (new) — a stone slab that slides out of a stone anchor at a gap's
edge, across the gap, while it is powered, and back into the anchor when it
is not. Data: `{ x, y, w, h, dir: 1 | -1, needs }`, where `x, y` is the
anchor's face and `dir` which way it extends. A bridge **does** withdraw from
under the ball — that is what gives a timer teeth — but it shakes for its
last second of power first, so the player is never surprised. Falling costs a
heart and a checkpoint, as any gap does. A crate on a withdrawing bridge
falls, and like any crate with nothing beneath it returns to where the level
put it.

A bridge is something the ball stands on, so it is a carrier and owes `dx`,
`dy`, `vx`, `vy` like every other carrier in this game (see `CLAUDE.md` —
the crate that did not have them made the ball `NaN`).

## Logic

A receiver lists what it needs: `needs: ['a', 'b']` means *all* of them on.
A leading `!` means that input must be *off*: `needs: ['!c']` opens while
`c` is off. That is the whole language — AND and NOT. No OR, no counters, no
sequences; if a later level wants one, that level's spec argues for it.

## Showing the wiring

Every sender has a lamp. Every receiver has **one lamp per input**, in that
input's colour. A receiver's lamp is lit when that input's condition is met,
so an ordinary lamp is lit while its sender is on, and an inverted input's
lamp — drawn as a **ring** rather than a disc — is lit while its sender is
off. The receiver works exactly when all its lamps are lit. The one rule the
player reads everywhere: *light every lamp on the door.*

A thin wire in the sender's colour is drawn in the background from each
sender to each receiver that needs it, and lights with the sender. Colours
come from a short fixed list in `config.js`, chosen so neighbouring colours
are told apart by more than hue.

**Every receiver is within 1100 units horizontally of each of its senders**,
so both fit on the narrowest screen this project checks — a rule the
`levels` suite enforces rather than a hope. Nothing in a puzzle may depend
on something the player cannot see from where they stand.

## Where it lives

A new DOM-free module, **`js/circuits.js`**, owns sender state, the AND/NOT
evaluation and each receiver's powered flag. `levels.js` keeps the data and
the gate and bridge bodies (they are colliders and belong with the others),
and calls `circuits.update(dt, pressers)` once per step. It must never touch
the DOM, for the same reason as every other simulation module: it is what
lets Node test it.

A **presser** is `{ box, heavy, hits }`. The ball is `{ heavy: false, hits:
true }`, a crate `{ heavy: true, hits: true }`. Later enemies join the same
list with their own flags, and `circuits.js` does not change when they do.

Drawing — lamps, rings, wires, the timer's drain — goes with the entities it
draws, not into `main.js`.

**Level 6 does not change.** When the loader meets the old `switches` and
`switchId`, it reads them as `plate` senders and `needs: [switchId]`. Its
data, tests and behaviour stay exactly as they are.

## Level 8 — Buttons (Introduction)

The one new idea: *hitting a button changes the world, and it stays changed.*

About 13,000 units, the usual shape: a warm-up of taught ideas with one
recurring enemy well away from the puzzles, then three rooms, with two
checkpoints each placed before a hard stretch.

- **Room A — cannot be failed.** A closed gate with its button on the floor
  directly in front of it, in the path. Rolling on lights the lamp, the wire
  and the gate, and it opens. This is where the lamp language is learned,
  before anything depends on it.
- **Room B — look and connect.** A gap of at least 400, wider than any jump
  can clear (the widest proven jumpable is 260). A bridge anchor at its edge.
  The button is on a small ledge back behind the player, reachable with an
  ordinary jump, with its wire running to the anchor.
- **Room C — small complication.** A gate with two lamps. One button is on
  the floor. The other is on a shelf higher than `JUMP_V² / 2·GRAVITY` above
  the floor, so no jump reaches it. A crate is in the room, and **both** ways
  of using it work: push it into a floor-level `left` button so the crate
  does the hitting, or push it under the shelf and climb it to hit the
  `up` button. Two solutions is deliberate.

## Level 9 — Timers, and a reversal (Reinforcement + Reversal)

- **Room A — a timer, safely.** A timer and a gate a short roll away, with
  about three times the time needed. If the ring empties, pressing again
  costs nothing.
- **Room B — set up the room first.** Past the timer, the gate sits on top of
  a ledge taller than a jump. A crate starts between the timer and the ledge,
  and pushed right it comes to rest against the ledge's face — the same
  stop-against-a-face trick levels 3 and 6 use — where it becomes a step.
  Pushing a crate is slow (`PUSH_SPEED` 150 against the ball's 420), so a
  player who hits the timer first watches the ring empty before the step is
  built. The honest order is: crate to the ledge, back to the timer, hit it,
  run, hop the crate, through the gate. Getting it wrong costs nothing but a
  second press.
- **Room C — the reversal of level 6.** A crate already sits on a plate, and
  the gate beyond it has a **ring** lamp: the crate is holding the door
  *shut*. Pushing the crate right, off the plate, drops it into a trench
  exactly its size, where it lands flush and becomes part of the floor. The
  plate is left empty, the ring lights, the gate opens. Everything level 6
  taught says *keep the crate on the plate*; this room says the opposite. The
  trench is shallower than a jump, so a ball that drops into it first can
  always get out, and the crate — never pushed yet — is still there to push.

Then the flag.

## Testing

- **`tests/offline/circuits.mjs`** (new, Node only): a plate is on only
  while weighed, and never by the ball; a button latches; a timer goes off
  after exactly `time`, and a hit refills it; AND and NOT evaluate correctly;
  a respawn resets every sender; a closing gate does not descend onto a body
  under it; a bridge carries the ball (its `dx`/`dy`/`vx`/`vy` exist and are
  finite) and a crate on a withdrawing bridge returns to its start; level 6's
  old `switches` data loads and behaves exactly as it did.
- **`levels.mjs`**: every id in every `needs` names a real sender, every
  receiver is within 1100 of each of its senders, and no checkpoint lies
  between a sender and a receiver it drives.
- **`finish.mjs`**: routes for levels 8 and 9 across the existing lead/delay
  sweep, plus proof that each room is load-bearing:
  - with a room's sender removed from the data, no route gets past it;
  - level 8 room B: no route clears the gap without the bridge;
  - level 8 room C: each of the two solutions completes on its own;
  - level 9 room B: pressing the timer before moving the crate does not get
    through, and the prepared route arrives with **at least 40% of the
    timer's time to spare** across the sweep — the guarantee that this is
    not a pixel-perfect run;
  - level 9 room C: with the crate left on the plate, the gate never opens.
- **One browser suite** that loads levels 8 and 9, hits a button and reads
  the lit lamp colour off the canvas. No button coordinates in any test, and
  no test-only code in the game.
- **Screenshots of every room at 568×320 and 740×280.** A lamp, a ring or a
  wire that cannot be told apart on a phone is a bug, whatever the
  assertions say.

## Out of scope here

Lifts, OR logic, sequence locks, and every enemy — see the roadmap for which
sub-project each belongs to. Sound, as for the rest of the game.
