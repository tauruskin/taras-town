// The dashes down the middle of the road must belong to the road.
//
// Only the visible stretch of each line is drawn, which is what keeps a map
// this size cheap. But a dash pattern counts from wherever the path begins, so
// a line starting at the edge of the view had its dashes shift every time the
// camera moved. On screen that read as the markings SLIDING along the road as
// the player walked, as though the road were on a conveyor belt.
//
// The invariant that fixes it, and the one checked here: where the dashes fall
// must depend on the road, never on where the camera happens to be.
import { World } from '../../js/world.js';

const world = new World();

let fail = 0;
const check = (l, ok, d) => { if (!ok) fail++; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + l + (d ? ': ' + d : '')); };

/**
 * Draw the markings for one camera position and write down every line.
 *
 * A stand-in for a canvas: it records the path and the dash offset in force
 * when each line was stroked, which is everything needed to work out where the
 * dashes actually land.
 */
function markingsFrom(view) {
  const strokes = [];
  let dashOffset = 0;
  let pending = null;

  const ctx = {
    save() {}, restore() {},
    beginPath() { pending = {}; },
    moveTo(x, y) { pending.from = { x, y }; },
    lineTo(x, y) { pending.to = { x, y }; },
    stroke() { strokes.push({ ...pending, dashOffset }); },
    setLineDash() {},
    set lineDashOffset(v) { dashOffset = v; },
    get lineDashOffset() { return dashOffset; },
    set strokeStyle(v) {}, set lineWidth(v) {}, set lineCap(v) {},
  };

  world._drawRoadMarkings(ctx, view);
  return strokes;
}

console.log('');
console.log('road markings stay where they are');

// A wide view, so several roads are in shot at once, and a second camera a
// little along from it — the distance a player covers in well under a second,
// which is when the sliding showed.
const near = markingsFrom({ x: 600, y: 600, w: 1600, h: 1200 });
const far = markingsFrom({ x: 731, y: 683, w: 1600, h: 1200 });

check('there are markings to look at', near.length > 2, near.length + ' lines');

// Where the dash pattern starts, in WORLD coordinates. For a line drawn from
// `from` with offset `dashOffset`, the pattern behaves as though it had begun
// at `from - dashOffset`. That number is what must not move.
let drifted = 0;
let compared = 0;
const detail = [];

for (const a of near) {
  const horizontal = a.from.y === a.to.y;
  const b = far.find((o) => (o.from.y === o.to.y) === horizontal &&
                            (horizontal ? o.from.y === a.from.y : o.from.x === a.from.x));
  if (!b) continue;
  compared++;

  const startA = horizontal ? a.from.x - a.dashOffset : a.from.y - a.dashOffset;
  const startB = horizontal ? b.from.x - b.dashOffset : b.from.y - b.dashOffset;

  if (Math.abs(startA - startB) > 0.001) {
    drifted++;
    if (detail.length < 3) detail.push((horizontal ? 'row' : 'col') + ' ' + startA.toFixed(1) + ' vs ' + startB.toFixed(1));
  }
}
check('enough roads were seen from both cameras', compared >= 2, compared + ' compared');
check('the dashes fall in the same place from either camera', drifted === 0,
      drifted ? drifted + ' drifted: ' + detail.join(', ') : 'none drifted');

// The control. Without it the check above would pass just as happily against
// code that drew no dashes at all, or that always used an offset of zero: what
// makes it meaningful is that the offset really does change with the camera,
// and that it changes by exactly the amount that cancels the shift out.
const moved = near.some((a, i) => far[i] && a.dashOffset !== far[i].dashOffset);
check('and the offset is genuinely doing the work', moved,
      moved ? 'it changes with the camera' : 'offset never changes — check is vacuous');

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL ROAD MARKING CHECKS PASSED');
process.exit(fail ? 1 : 0);
