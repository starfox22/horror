// Where the intruder can walk and what he can see and hear (pure JS: no engine, so tools/check-stalker.mjs runs it in
// Node). Built on the player's walk grid (walkgrid.js, 5 cm cells) and the sight height field (sight.json, baked by
// tools/sight-grid.mjs: how tall the tallest thing in each cell is).
//  - Walking: a 20 cm grid of cells his body (radius 0.24 m) fits in, A* with 8 neighbours, the result pulled tight
//    (straight lines wherever the body fits all along).
//  - Path distance: how far a sound travels along open space (doorways, never through walls); hearing uses it and so do
//    the sounds he makes (heardFrom: where the player hears them come from).
//  - Sight: a line between two eye heights over the height field; walls and wardrobes block it, low furniture (beds,
//    sofas, counters) only when the line passes below its top (a crouching player). Moving walls (doors) block it too.
//  - Doors he opens (setDoors: the bathroom's): his own paths and his hearing (`through: true`) plan with each such leaf
//    where it stands when fully open, and count a shut one as a little longer way (DOOR_COST: opening it, its muffle);
//    walking, he stops at a leaf in his way and opens it (doorAcross; stalker.js). Everything else (sight, the sounds the
//    player hears: sound.js) takes the doors as they stand, a shut door a wall.
import { segmentDistance } from './walkgrid.js';

export const NAV_CELL = 0.2;
const BODY = 0.24;
const DOOR_COST = 0.5;         // extra metres for each cell a shut door of his cuts (about 1 m to get through one)
// How near the line of one of his doors' leaves his body may come (he brushes past a leaf he has pushed open; the 20 cm
// grid would otherwise lose the bathroom's narrow back behind its open door, which the player can still squeeze past).
const DOOR_BAND = 0.12;

export class NavGrid {
  // walk: a WalkGrid; sight: { cell, x0, z0, w, h, topCm (base64 or Uint8Array) }
  constructor(walk, sight) {
    this.walk = walk;
    this.top = typeof sight.topCm === 'string' ? Uint8Array.from(atob(sight.topCm), c => c.charCodeAt(0)) : sight.topCm;
    this.s = sight;
    this.x0 = walk.x0; this.z0 = walk.z0;
    this.w = Math.floor(walk.w * walk.cell / NAV_CELL); this.h = Math.floor(walk.h * walk.cell / NAV_CELL);
    this.free = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const [x, z] = this.centre(i, j);
      const floor = walk.floorAt(x, z);
      this.free[j * this.w + i] = floor !== null && this.fitsStatic(x, z, floor) ? 1 : 0;
    }
  }

  centre(i, j) { return [this.x0 + (i + 0.5) * NAV_CELL, this.z0 + (j + 0.5) * NAV_CELL]; }
  cellOf(x, z) { return [Math.floor((x - this.x0) / NAV_CELL), Math.floor((z - this.z0) / NAV_CELL)]; }
  index(i, j) { return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i; }

  // His body at (x, z) clear of the static walls and furniture (the walk grid's own test, without its moving walls).
  fitsStatic(x, z, floor) {
    const g = this.walk, saved = g.ignoreBlockers;
    g.ignoreBlockers = true;
    const ok = g.fits(x, z, BODY, floor, 0.14);
    g.ignoreBlockers = saved;
    return ok;
  }

  // The doors he can open: [{ blocker (its walk-grid blocker), segmentAt(angle), open (its open angle), locked }] (doors.js).
  setDoors(doors = []) {
    this.doors = new Map(doors.filter(d => d?.segmentAt && Number.isFinite(d.open)).map(d => [d.blocker ?? d.segment, d]));
  }

  // The moving walls for one query: [{ seg, door, now }]. Physical (default): each blocker as it stands. through: each of
  // his doors (unless locked, or in `avoid`) where its leaf stands fully open; `now` is the leaf as it stands (DOOR_COST).
  walls({ through = false, avoid = null } = {}) {
    const out = [];
    for (const b of this.walk.blockers) {
      const door = through ? this.doors?.get(b) : null;
      if (door && !door.locked && !avoid?.has(door)) { out.push({ seg: door.segmentAt(door.open), door, now: b(), band: DOOR_BAND }); continue; }
      const seg = b();
      if (seg) out.push({ seg });
    }
    return out;
  }

  // Free and clear of the given walls (walls()).
  openIn(k, walls) {
    if (!this.free[k]) return false;
    if (!walls.length) return true;
    const i = k % this.w, j = (k - i) / this.w, [x, z] = this.centre(i, j);
    for (const w of walls) if (segmentDistance(x, z, w.seg) < (w.band ?? BODY * 0.8)) return false;
    return true;
  }

  // Open now: statically free and not cut by a moving wall (a shut door).
  open(k) { return this.openIn(k, this.walls()); }

  // Extra cost of standing in cell k: the shut doors of his that cut it (DOOR_COST each).
  doorCost(k, walls) {
    let cost = 0;
    for (const w of walls) {
      if (!w.door || !w.now) continue;
      const i = k % this.w, j = (k - i) / this.w, [x, z] = this.centre(i, j);
      if (segmentDistance(x, z, w.now) < BODY * 0.8) cost += DOOR_COST;
    }
    return cost;
  }

  // The free cell nearest (x, z), searching outwards (for a target inside furniture or a wall).
  nearestFree(x, z, maxRing = 8, walls = this.walls()) {
    const [ci, cj] = this.cellOf(x, z);
    for (let r = 0; r <= maxRing; r++) {
      let best = -1, bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const k = this.index(ci + di, cj + dj);
        if (k < 0 || !this.openIn(k, walls)) continue;
        const [cx, cz] = this.centre(ci + di, cj + dj), d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // A* from (ax, az) to (bx, bz). Returns { points: [[x, z], ...] (pulled tight, ending at the goal cell's centre or the
  // goal itself when it is free), length (metres walked), cost (length plus DOOR_COST for each shut door of his on the
  // way) } or null. Options: through (his paths and his hearing: walls()), avoid (doors of his to take as shut walls).
  path(ax, az, bx, bz, { through = false, avoid = null } = {}) {
    const walls = this.walls({ through, avoid }), doors = through && walls.some(w => w.door && w.now);
    const start = this.nearestFree(ax, az, 8, walls), goal = this.nearestFree(bx, bz, 8, walls);
    if (start < 0 || goal < 0) return null;
    const n = this.w * this.h;
    const g = this._g ||= new Float32Array(n), came = this._came ||= new Int32Array(n), state = this._state ||= new Uint8Array(n);
    g.fill(Infinity); state.fill(0);
    const gi = goal % this.w, gj = (goal - gi) / this.w;
    const hcost = (k) => { const i = k % this.w, j = (k - i) / this.w, dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * NAV_CELL; };
    const heap = new MinHeap();
    g[start] = 0; came[start] = -1; heap.push(start, hcost(start)); state[start] = 1;
    let found = false;
    while (heap.size) {
      const k = heap.pop();
      if (state[k] === 2) continue;
      state[k] = 2;
      if (k === goal) { found = true; break; }
      const i = k % this.w, j = (k - i) / this.w;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const nk = this.index(i + di, j + dj);
        if (nk < 0 || state[nk] === 2 || !this.openIn(nk, walls)) continue;
        // No cutting corners past a blocked cell.
        if (di && dj && (!this.openIn(this.index(i + di, j), walls) || !this.openIn(this.index(i, j + dj), walls))) continue;
        const cost = g[k] + (di && dj ? 1.4142 : 1) * NAV_CELL + (doors ? this.doorCost(nk, walls) : 0);
        if (cost < g[nk]) { g[nk] = cost; came[nk] = k; heap.push(nk, cost + hcost(nk)); state[nk] = 1; }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    const raw = cells.map(k => { const i = k % this.w; return this.centre(i, (k - i) / this.w); });
    raw[0] = [ax, az];
    const goalFree = this.openIn(this.index(...this.cellOf(bx, bz)), walls);
    if (goalFree) raw[raw.length - 1] = [bx, bz];
    const points = this.pull(raw, walls);
    let length = 0;
    for (let p = 1; p < points.length; p++) length += Math.hypot(points[p][0] - points[p - 1][0], points[p][1] - points[p - 1][1]);
    let extra = 0;
    if (doors) for (const k of cells) extra += this.doorCost(k, walls);
    return { points, length, cost: length + extra };
  }

  // String pulling: drop every point the body can skip with a straight walk.
  pull(points, walls = this.walls()) {
    if (points.length < 3) return points;
    const out = [points[0]];
    let anchor = 0;
    for (let p = 2; p < points.length; p++) {
      if (!this.walkable(points[anchor], points[p], walls)) { out.push(points[p - 1]); anchor = p - 1; }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  // Can the body walk straight from a to b (every nav cell under the line, sampled every 10 cm, open)?
  walkable(a, b, walls = this.walls()) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(d / 0.1));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, k = this.index(...this.cellOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
      if (k < 0 || !this.openIn(k, walls)) return false;
    }
    return true;
  }

  // The first of his doors whose leaf, as it stands, is in the way of a straight walk from a to b within `ahead` metres
  // (nearer the walk than DOOR_BAND, as his paths plan with it): { door, at (metres along the walk) } or null.
  doorAcross(ax, az, bx, bz, ahead = 1.5) {
    if (!this.doors?.size) return null;
    const leaves = [];
    for (const door of this.doors.values()) { const seg = door.blocker?.() ?? door.segment?.(); if (seg) leaves.push({ door, seg }); }
    if (!leaves.length) return null;
    const d = Math.hypot(bx - ax, bz - az), reach = Math.min(d, ahead), steps = Math.max(1, Math.ceil(reach / 0.1));
    for (let s = 0; s <= steps; s++) {
      const at = reach * s / steps, t = d > 0 ? at / d : 0, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const l of leaves) if (segmentDistance(x, z, l.seg) < DOOR_BAND) return { door: l.door, at };
    }
    return null;
  }

  // Line of sight between two eyes ({x, y, z}, y above the floor at that point). Steps the height field cell by cell.
  // A cell the walk grid lets a body stand in has nothing between 0.25 and 1.9 m (tools/collision.mjs), so whatever the
  // height field holds there hangs above every eye (a door's head, a bulkhead, a curtain rail: the field keeps only the
  // tallest point of a cell) and hides nothing: doorways are seen through.
  sees(a, b) {
    const s = this.s, d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(d / (s.cell * 0.5)));
    const walk = this.walk, same = walk.w === s.w && walk.h === s.h && walk.x0 === s.x0 && walk.z0 === s.z0 && walk.cell === s.cell;
    for (let k = 1; k < steps; k++) {
      const t = k / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
      const i = Math.floor((x - s.x0) / s.cell), j = Math.floor((z - s.z0) / s.cell);
      if (i < 0 || j < 0 || i >= s.w || j >= s.h) return false;
      const top = this.top[j * s.w + i] / 100;
      if (top > 0 && top >= y - 0.02 && (same ? walk.blockedCells[j * s.w + i] : walk.blockedAt(x, z))) return false;
    }
    for (const blocker of this.walk.blockers) {
      const seg = blocker();
      if (seg && segmentsCross(a.x, a.z, b.x, b.z, seg)) return false;
    }
    return true;
  }

  // Path metres from (x, z) to everywhere at once (a flood over the cells: 8 neighbours, so a little longer than a pulled
  // path): { at(x, z) -> metres or Infinity }. Options as path().
  distances(x, z, { through = false, avoid = null } = {}) {
    const walls = this.walls({ through, avoid }), doors = through && walls.some(w => w.door && w.now);
    const n = this.w * this.h, dist = new Float32Array(n).fill(Infinity), start = this.nearestFree(x, z, 8, walls);
    const at = (px, pz) => {
      const k = this.nearestFree(px, pz, 8, walls);
      if (k < 0 || !Number.isFinite(dist[k])) return Infinity;
      const i = k % this.w, [cx, cz] = this.centre(i, (k - i) / this.w);
      return dist[k] + Math.hypot(px - cx, pz - cz);
    };
    if (start < 0) return { at: () => Infinity };
    const i0 = start % this.w, [sx, sz] = this.centre(i0, (start - i0) / this.w);
    dist[start] = Math.hypot(x - sx, z - sz);
    const heap = new MinHeap(), done = new Uint8Array(n);
    heap.push(start, dist[start]);
    while (heap.size) {
      const k = heap.pop();
      if (done[k]) continue;
      done[k] = 1;
      const i = k % this.w, j = (k - i) / this.w;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const nk = this.index(i + di, j + dj);
        if (nk < 0 || done[nk] || !this.openIn(nk, walls)) continue;
        if (di && dj && (!this.openIn(this.index(i + di, j), walls) || !this.openIn(this.index(i, j + dj), walls))) continue;
        const cost = dist[k] + (di && dj ? 1.4142 : 1) * NAV_CELL + (doors ? this.doorCost(nk, walls) : 0);
        if (cost < dist[nk]) { dist[nk] = cost; heap.push(nk, cost); }
      }
    }
    return { at };
  }

  // Distance along open space between two points (a sound's way round), or Infinity. With `through` (his hearing): the
  // way through his doors, a shut one counting DOOR_COST a cell more.
  pathDistance(ax, az, bx, bz, options) {
    const p = this.path(ax, az, bx, bz, options);
    return p ? (options?.through ? p.cost : p.length) : Infinity;
  }

  // Where a sound made at `from` seems to come from for a listener at `to`: along the open path, the last point the
  // listener can see, pushed out to the full path length (so it comes through the doorway, as far away as it really is).
  heardFrom(from, to) {
    const p = this.path(to.x, to.z, from.x, from.z);
    if (!p) return { x: from.x, z: from.z, distance: Infinity };
    let walked = 0, seen = p.points[0];
    for (let k = 1; k < p.points.length; k++) {
      const q = p.points[k];
      if (!this.sees({ x: to.x, y: 1.5, z: to.z }, { x: q[0], y: 1.5, z: q[1] })) break;
      walked += Math.hypot(q[0] - seen[0], q[1] - seen[1]); seen = q;
    }
    const dx = seen[0] - to.x, dz = seen[1] - to.z, l = Math.hypot(dx, dz) || 1, k = p.length / l;
    return { x: to.x + dx * k, z: to.z + dz * k, distance: p.length, direct: walked >= p.length - 1e-3 };
  }
}

function segmentsCross(ax, az, bx, bz, [cx, cz, dx, dz]) {
  const o = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return o(ax, az, bx, bz, cx, cz) !== o(ax, az, bx, bz, dx, dz) && o(cx, cz, dx, dz, ax, az) !== o(cx, cz, dx, dz, bx, bz);
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p; let i = k.length; k.push(key); p.push(pri);
    while (i > 0) { const up = (i - 1) >> 1; if (p[up] <= pri) break; k[i] = k[up]; p[i] = p[up]; i = up; }
    k[i] = key; p[i] = pri;
  }
  pop() {
    const k = this.k, p = this.p, top = k[0], key = k.pop(), pri = p.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= k.length) break;
        if (c + 1 < k.length && p[c + 1] < p[c]) c++;
        if (p[c] >= pri) break;
        k[i] = k[c]; p[i] = p[c]; i = c;
      }
      k[i] = key; p[i] = pri;
    }
    return top;
  }
}
