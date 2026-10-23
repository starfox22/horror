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

  // Is a circle at (x, z) clear of every moving wall? `pad` = half the wall's thickness.
  clearOfBlockers(x, z, radius, pad = 0.03) {
    for (const b of this.blockers) {
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
