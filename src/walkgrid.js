// Runtime queries on collision.json (baked by tools/collision.mjs): which spots the player's body may stand on,
// and the floor height there. World space, metres, Y up; the grid covers x/z.

export class WalkGrid {
  constructor(json) {
    Object.assign(this, json);
    this.blockedCells = Uint8Array.from(atob(json.blocked), c => c.charCodeAt(0));
    this.floorCells = Uint8Array.from(atob(json.floorCm), c => c.charCodeAt(0));
    this.ceilCells = json.ceilCm ? Uint8Array.from(atob(json.ceilCm), c => c.charCodeAt(0)) : null;
    this.blockers = [];   // moving parts (door leaves): () => [ax, az, bx, bz] or null, a thin wall from a to b
  }

  // A door leaf or other moving wall, re-read on every query. Returns the function (pass it to removeBlocker).
  addBlocker(segment) { this.blockers.push(segment); return segment; }

  // Is a circle at (x, z) clear of every moving wall? `pad` = half the wall's thickness. `except`: one to leave out
  // (a door working out where to push the player out of its own way).
  clearOfBlockers(x, z, radius, pad = 0.03, except = null) {
    for (const b of this.blockers) {
      if (b === except) continue;
      const s = b();
      if (s && segmentDistance(x, z, s) < radius + pad) return false;
    }
    return true;
  }

  index(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }

  blockedAt(x, z) {
    const k = this.index(x, z);
    return k < 0 || this.blockedCells[k] === 1;
  }

  // Floor height in metres under (x, z), or null where there is no floor.
  floorAt(x, z) {
    const k = this.index(x, z);
    if (k < 0) return null;
    const cm = this.floorCells[k];
    return cm === this.noFloor ? null : cm / 100;
  }

  // Ceiling height in metres above (x, z) (lowest overhead surface above 2 m), or null.
  ceilingAt(x, z) {
    const k = this.index(x, z);
    if (k < 0 || !this.ceilCells || this.ceilCells[k] === this.noFloor) return null;
    return 2 + this.ceilCells[k] / 100;
  }

  // A body of `radius` fits at (x, z): the centre and 8 points on the rim are free, and no floor under it is more
  // than `step` above `fromFloor` (stops climbing onto furniture through gaps in the grid).
  fits(x, z, radius, fromFloor, step = 0.12) {
    if (this.blockers.length && !this.ignoreBlockers && !this.clearOfBlockers(x, z, radius)) return false;
    return this.fitsGrid(x, z, radius, fromFloor, step);
  }

  // The same test against the baked grid alone (walls, furniture, floor steps), without the moving walls.
  fitsGrid(x, z, radius, fromFloor, step = 0.12) {
    for (let a = -1; a < 8; a++) {
      const px = a < 0 ? x : x + Math.cos(a * Math.PI / 4) * radius;
      const pz = a < 0 ? z : z + Math.sin(a * Math.PI / 4) * radius;
      if (this.blockedAt(px, pz)) return false;
      const f = this.floorAt(px, pz);
      if (f === null || f - fromFloor > step) return false;
    }
    return true;
  }

  // Highest floor under the body (the feet rest on the highest point they touch).
  floorUnder(x, z, radius) {
    let best = this.floorAt(x, z) ?? 0;
    for (let a = 0; a < 4; a++) {
      const f = this.floorAt(x + Math.cos(a * Math.PI / 2) * radius * 0.5, z + Math.sin(a * Math.PI / 2) * radius * 0.5);
      if (f !== null && f > best) best = f;
    }
    return best;
  }
}

// Distance from (x, z) to the segment [ax, az, bx, bz].
export function segmentDistance(x, z, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

// --- a door swinging into the player (fridge.js, doors.js, closets.js) ------------------------------------------------
// A swinging leaf does not stop against the player: it pushes them out of its way, a few centimetres a frame and only as
// far as it must, off its face on the side they stand, onto spots the walk grid lets a body stand (never into a wall,
// furniture or another door). With no room off its face (the cabinet or a wall behind them) the leaf waits while they
// slide along it, out of its sweep. Which way they go is rehearsed for the rest of the swing as the leaf comes up to them
// (stepping back from the hinge first, else carried ahead of its face, else round towards the hinge and out through the
// doorway the leaf is shutting, else walking out of its sweep before it gets there) and followed frame by frame. Only a
// body that cannot move at all holds the leaf (the caller then stops it, as doors did before).

// Which face of a leaf [hinge x, z, free edge x, z] a point is on: +1 or -1 (0 on its line).
export function leafSide(x, z, [ax, az, bx, bz]) {
  const c = (bx - ax) * (z - az) - (bz - az) * (x - ax);
  return Math.abs(c) < 1e-12 ? 0 : Math.sign(c);
}

// How far (x, z) must move along the unit direction (ux, uz) to be `clear` of the segment s, or Infinity if more than
// `max`. The distance from a point moving along a line to a segment is convex: once the far end is clear, bisection finds
// the first clear point.
function moveToClear(x, z, ux, uz, s, clear, max) {
  if (segmentDistance(x, z, s) >= clear) return 0;
  if (segmentDistance(x + ux * max, z + uz * max, s) < clear) return Infinity;
  let lo = 0, hi = max;
  for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (segmentDistance(x + ux * m, z + uz * m, s) < clear) lo = m; else hi = m; }
  return hi;
}

// Ways off the leaf's face (swingStep): 0 back away from the hinge (off the face and towards the free edge: out of the
// sweep with the least walking, as you step back from a door swinging at you), 1 straight off the face (carried ahead
// of it to where it stops), 2 and 3 turned further towards the free edge, 4 to 6 turned towards the hinge (round a wall
// or a jamb). TURN: how far each is turned, as a share of the leaf's direction added to its normal.
const TURN = [0, 0, 1, 2, -0.5, -1, -2];
// The orders tried (rehearsed per swing): each way in turn, then sliding along the leaf (+1 towards its free edge, -1
// towards its hinge).
const ORDERS = [
  { ways: [0, 1, 2, 3, 4, 5], slide: 1 },        // step back out of its sweep
  { ways: [1, 2, 3, 4, 5, 0], slide: 1 },        // carried ahead of it
  { ways: [5, 6, 4, 1], slide: -1 },             // round towards the hinge: out through the doorway it is shutting
  { ways: [6, 5, 4, 1], slide: -1 },             // the same, sooner (a narrow doorway)
];

// One frame of a leaf swinging from angle `from` towards `to`, against a body at `pos` ({x, z}, moved in place).
// leaf(angle) -> [hinge x, z, free edge x, z]. Options: clear (how near the leaf's line the body's centre may be: its
// radius and half the leaf's thickness), step (the most the body may move this frame), radius and floor (the body, for
// the walk grid), except (this leaf's own blocker in the walk grid: the leaf is tested here at its angle instead),
// target (where the swing ends) and memo (an object the caller keeps for the swing: the plan for this body).
// As the leaf comes up to the body, the rest of the swing is rehearsed (makePlan) and followed frame by frame: the leaf no
// further than `to`, the body no more than `step`; a body that moves by itself is planned for again. Returns { angle, contact, stuck }: the angle the leaf reaches (`to`, or short of it while the body cannot
// keep up or slides out of the way), whether it is pushing the body, and whether the body cannot be moved any further
// (the leaf then stays where it is).
export function swingInto(grid, pos, leaf, from, to, options) {
  if (from === to) return { angle: to, contact: false };
  const sign = Math.sign(to - from), memo = options.memo || {};
  // Planned to the end of the swing (to `to` alone while a spring carries the leaf back from past its end).
  const target = options.target != null && Math.sign(options.target - from) === sign ? options.target : to;
  const ahead = (a, b) => (a - b) * sign > 1e-9;
  let plan = memo.plan, fresh = false;
  // A plan holds while the body is where it left it, for the same swing, with the leaf where it left it.
  if (plan && (plan.target !== target || Math.hypot(pos.x - plan.x, pos.z - plan.z) > 0.01 || Math.abs(plan.angle - from) > 1e-6)) plan = null;
  if (!plan) {
    memo.plan = null;
    // Where the rest of the swing would first come within `clear` of the body: planned for when this frame reaches it,
    // or once the free edge is within 30 cm of it (time for the body to get out of a corner before the leaf is there).
    const touch = firstTouch(pos, leaf, from, target, options.clear);
    if (touch === null) return { angle: to, contact: false };
    const t = leaf(touch), f = leaf(from);
    if (!ahead(to, touch) && Math.hypot(t[2] - f[2], t[3] - f[3]) > 0.3) return { angle: to, contact: false };
    plan = memo.plan = makePlan(grid, pos, leaf, from, touch, target, options);
    fresh = true;
  }
  // Follow it: through its states (angle, body) in order, up to `to` and `step`.
  const states = plan.states;
  let budget = options.step, { k, f } = plan;
  const at = () => { const s0 = states[k], s1 = states[Math.min(k + 1, states.length - 1)];
    return { a: s0.a + (s1.a - s0.a) * f, x: s0.x + (s1.x - s0.x) * f, z: s0.z + (s1.z - s0.z) * f }; };
  let now = at(), stuck = false;
  while (true) {
    if (k + 1 >= states.length) { stuck = !plan.done && ahead(to, now.a); break; }
    const next = states[k + 1];
    let g = 1;                                              // how much of the way to `next` this frame allows
    if (ahead(next.a, to)) g = Math.min(g, (to - now.a) / (next.a - now.a));
    const d = Math.hypot(next.x - now.x, next.z - now.z);
    if (d * g > budget) g = budget / d;
    if (g >= 1 - 1e-9) { budget -= d; k++; f = 0; now = { a: next.a, x: next.x, z: next.z }; continue; }
    if (g > 0) { f += (1 - f) * g; now = at(); }
    break;
  }
  // The world may have changed since it was planned (another door swung): never into anything, never through the leaf.
  // If so, wait for a new plan (next frame); a plan that fails at once leaves the body where it is: the leaf stops.
  const moved = Math.hypot(now.x - pos.x, now.z - pos.z) > 1e-9, radius = options.radius ?? 0.22;
  if ((moved && !(grid.clearOfBlockers(now.x, now.z, radius, 0.03, options.except) && grid.fitsGrid(now.x, now.z, radius, options.floor ?? 0))) ||
    segmentDistance(now.x, now.z, leaf(now.a)) < options.clear - 1e-3) {
    memo.plan = null;
    return { angle: from, contact: true, stuck: fresh };
  }
  pos.x = now.x; pos.z = now.z;
  Object.assign(plan, { k, f, x: pos.x, z: pos.z, angle: now.a });
  return { angle: now.a, contact: moved || (k > 0 && now.a !== to), stuck };
}

function substeps(leaf, from, to) {
  const a = leaf(from), b = leaf(to);
  return Math.max(1, Math.ceil(Math.hypot(b[2] - a[2], b[3] - a[3]) / 0.01));
}

// The last angle the leaf reaches between `from` and `to` without coming within `clear` of (x, z) (in steps of at most
// a centimetre at its free edge), or null when it never does.
function firstTouch({ x, z }, leaf, from, to, clear) {
  const n = substeps(leaf, from, to);
  for (let i = 1; i <= n; i++) if (segmentDistance(x, z, leaf(i === n ? to : from + (to - from) * i / n)) < clear) return from + (to - from) * (i - 1) / n;
  return null;
}

// A plan for the rest of the swing, the leaf now at `from`: free until `touch`, then the push rehearsed in each order
// until one lets the leaf finish. If none does (a corner: the jamb behind the body, say), the body walks out of the
// leaf's sweep first, the leaf waiting where it is; failing that, the order that let the leaf get furthest.
function makePlan(grid, pos, leaf, from, touch, target, options) {
  let best = null;
  for (const order of ORDERS) {
    const r = rehearse(grid, pos, leaf, touch, target, options, order);
    if (!best || (r.done && !best.done) || (!r.done && !best.done && Math.abs(r.reached - touch) > Math.abs(best.reached - touch) + 1e-6)) best = r;
    if (best.done) break;
  }
  let states = [{ a: from, x: pos.x, z: pos.z }, ...best.states], done = best.done;
  if (!done) {
    const walk = walkOut(grid, pos, leaf, from, target, options);
    if (walk) { states = walk; done = true; }
  }
  return { states, done, k: 0, f: 0, target, x: pos.x, z: pos.z, angle: from };
}

// The shortest walk (3 cm steps, within 1.5 m) from the body to a spot clear of everywhere the leaf will sweep from
// `from` to `to`, keeping clear of the leaf where it stands: states for the walk (leaf waiting), then the leaf's swing.
function walkOut(grid, pos, leaf, from, to, { clear, radius = 0.22, floor = 0, except = null }) {
  const n = substeps(leaf, from, to), now = leaf(from), sweep = [];
  // The leaf's positions in a strided order: a spot inside the sweep is near a run of them, found in a few tests.
  for (let s = 0; s < 8; s++) for (let i = s; i <= n; i += 8) sweep.push(leaf(from + (to - from) * i / n));
  const step = 0.03, key = (i, j) => (i + 100) * 1000 + (j + 100), known = new Map();
  const fits = (i, j) => {
    const k = key(i, j);
    if (!known.has(k)) {
      const x = pos.x + i * step, z = pos.z + j * step;
      known.set(k, grid.clearOfBlockers(x, z, radius, 0.03, except) && grid.fitsGrid(x, z, radius, floor) && segmentDistance(x, z, now) >= clear);
    }
    return known.get(k);
  };
  const free = (x, z) => grid.clearOfBlockers(x, z, radius, 0.03, except) && grid.fitsGrid(x, z, radius, floor) && segmentDistance(x, z, now) >= clear;
  const out = (x, z) => sweep.every(s => segmentDistance(x, z, s) >= clear + 0.002);
  const seen = new Map([[key(0, 0), null]]), queue = [[0, 0]];
  for (let q = 0; q < queue.length && q < 5000; q++) {
    const [i, j] = queue[q], x = pos.x + i * step, z = pos.z + j * step;
    if (out(x, z)) {
      const path = [];
      for (let c = [i, j]; c; c = seen.get(key(...c))) path.unshift({ a: from, x: pos.x + c[0] * step, z: pos.z + c[1] * step });
      path[0] = { a: from, x: pos.x, z: pos.z };
      return [...path, { a: to, x, z }];
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj);
      if (seen.has(k) || Math.hypot(ni, nj) * step > 1.5 || !fits(ni, nj)) continue;
      // every centimetre of the step free too (the walk is followed part-way in a frame)
      if (!free(x + di * step / 3, z + dj * step / 3) || !free(x + di * step * 2 / 3, z + dj * step * 2 / 3)) continue;
      seen.set(k, [i, j]); queue.push([ni, nj]);
    }
  }
  return null;
}

// The rest of a swing played out at once with the body pushed in `order`: the states it goes through (leaf angle and
// body), whether the leaf gets to `to`, how far the body walks, how far the leaf gets if not.
function rehearse(grid, pos, leaf, from, to, options, order) {
  const p = { x: pos.x, z: pos.z }, n = substeps(leaf, from, to), states = [{ a: from, x: p.x, z: p.z }];
  let angle = from, walked = 0, i = 1;
  for (let guard = 0; i <= n && guard < 4 * n + 400; guard++) {
    const s1 = i === n ? to : from + (to - from) * i / n, x = p.x, z = p.z;
    const r = swingStep(grid, p, leaf, angle, s1, { ...options, step: 0.03, order });
    if (r.stuck) break;
    walked += Math.hypot(p.x - x, p.z - z);
    angle = r.angle;
    states.push({ a: angle, x: p.x, z: p.z });
    if (angle === s1) i++;
  }
  return { done: i > n, reached: angle, walked, states };
}

function swingStep(grid, pos, leaf, from, to, { clear, step, radius = 0.22, floor = 0, except = null, order = ORDERS[0] }) {
  if (segmentDistance(pos.x, pos.z, leaf(to)) >= clear) return { angle: to, contact: false };
  const fits = (x, z) => grid.clearOfBlockers(x, z, radius, 0.03, except) && grid.fitsGrid(x, z, radius, floor);
  // The whole move, every centimetre of it (a plan is followed part-way in a frame): on walkable floor and clear of the
  // leaf as it turns from `from` to `angle`.
  const way = (x, z, angle) => {
    const n = Math.ceil(Math.hypot(x - pos.x, z - pos.z) / 0.01);
    for (let j = 1; j <= n; j++) {
      const t = j / n, px = pos.x + (x - pos.x) * t, pz = pos.z + (z - pos.z) * t;
      if (!fits(px, pz) || (j < n && segmentDistance(px, pz, leaf(from + (angle - from) * t)) < clear - 1e-3)) return false;
    }
    return true;
  };
  const start = leaf(from);
  // The face the body is on (where it stood before this frame), or the face leading the swing.
  const side = leafSide(pos.x, pos.z, start) || leafSide(leaf(to)[2], leaf(to)[3], start) || 1;
  // Each way with the whole step if the body can be moved clear of the leaf, else part of it (the leaf slows against
  // the body).
  for (const w of order.ways) {
    for (const f of [1, 0.5, 0.25, 0.125, 0.0625]) {
      const angle = from + (to - from) * f, s = leaf(angle);
      const [ax, az, bx, bz] = s, len = Math.hypot(bx - ax, bz - az) || 1, ex = (bx - ax) / len, ez = (bz - az) / len;
      const nx = -ez * side, nz = ex * side;              // the leaf's normal on the body's side
      let vx = nx, vz = nz;
      if (w === 0) {
        // Away from the hinge, kept within 70 degrees of the normal (so it still clears the face).
        const rx = pos.x - ax, rz = pos.z - az, along = rx * ex + rz * ez, off = Math.max(1e-6, rx * nx + rz * nz);
        const k = Math.min(Math.max(0, along) / off, 2.75);
        vx = nx + ex * k; vz = nz + ez * k;
      } else { vx = nx + ex * TURN[w]; vz = nz + ez * TURN[w]; }
      const vl = Math.hypot(vx, vz); vx /= vl; vz /= vl;
      const m = moveToClear(pos.x, pos.z, vx, vz, s, clear, step);
      if (m === Infinity) continue;
      if (m === 0) return { angle, contact: true };       // the leaf can come this far without touching
      const x = pos.x + vx * (m + 1e-4), z = pos.z + vz * (m + 1e-4);
      // Never through the leaf: still on the body's side of it, or round its free edge.
      if (leafSide(x, z, s) !== side && Math.hypot(x - ax, z - az) <= len) continue;
      if (!way(x, z, angle)) continue;
      pos.x = x; pos.z = z;
      return { angle, contact: true };
    }
  }
  // No room off its face: slide along the leaf (the order's way first) while it waits.
  const [ax, az, bx, bz] = start, len = Math.hypot(bx - ax, bz - az) || 1, ex = (bx - ax) / len, ez = (bz - az) / len;
  const near = segmentDistance(pos.x, pos.z, start);
  for (const dir of [order.slide, -order.slide]) for (const k of [1, 0.5, 0.25]) {
    const x = pos.x + ex * step * k * dir, z = pos.z + ez * step * k * dir;
    if (segmentDistance(x, z, start) >= Math.min(near, clear) - 1e-9 && way(x, z, from)) {
      pos.x = x; pos.z = z;
      return { angle: from, contact: true, slid: true };
    }
  }
  return { angle: from, contact: true, stuck: true };
}
