// Geometry for the mask (build.mjs fits it, fit-check.mjs checks it through every clip): a mesh's boundary loops (the
// mask's rim, eye holes and mouth), its surface for nearest-point queries (how far behind it a point of his face or hood
// is: negative in front of it, i.e. poking through), and his skinned body posed by a clip of the GLB.
import { Mat4, Quat, Vec3 } from 'playcanvas';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// positions: [[x, y, z]], indices: flat triangle list. Vertices at the same place count as one (UV seams).
export function boundaryLoops(positions, indices) {
  const key = (p) => p.map(x => Math.round(x * 1e5)).join(), id = new Map();
  const canon = positions.map((p, i) => { const k = key(p); if (!id.has(k)) id.set(k, i); return id.get(k); });
  const edges = new Map();
  for (let t = 0; t < indices.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = canon[indices[t + e]], b = canon[indices[t + (e + 1) % 3]], k = a < b ? `${a},${b}` : `${b},${a}`;
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  const next = new Map();
  for (const [k, n] of edges) if (n === 1) {
    const [a, b] = k.split(',').map(Number);
    if (!next.has(a)) next.set(a, []);
    if (!next.has(b)) next.set(b, []);
    next.get(a).push(b); next.get(b).push(a);
  }
  const seen = new Set(), loops = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    for (let cur = start, prev = -1; cur !== undefined && !seen.has(cur);) {
      seen.add(cur); loop.push(cur);
      const n = next.get(cur).find(x => x !== prev && !seen.has(x)); prev = cur; cur = n;
    }
    const centre = [0, 1, 2].map(k => loop.reduce((s, i) => s + positions[i][k], 0) / loop.length);
    let perimeter = 0;
    for (let i = 0; i < loop.length; i++) perimeter += Math.hypot(...sub(positions[loop[i]], positions[loop[(i + 1) % loop.length]]));
    loops.push({ vertices: loop, centre, perimeter });
  }
  return loops.sort((a, b) => b.perimeter - a.perimeter);
}

// Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5).
function closest(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

// A triangle surface in a grid of `cell` metres; nearest(p, reach) finds the closest point within reach and the signed
// distance (along the surface's outward normal: + in front, - behind; normals: the vertices' own, else the winding's).
export class Surface {
  constructor(positions, indices, normals = null, cell = 0.012) {
    Object.assign(this, { positions, indices, cell });
    this.grid = new Map();
    this.normals = [];
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map(k => positions[indices[t + k]]);
      let n = cross(sub(b, a), sub(c, a));
      if (normals) { const vn = [0, 1, 2].map(k => normals[indices[t + 0]][k] + normals[indices[t + 1]][k] + normals[indices[t + 2]][k]); if (dot(n, vn) < 0) n = n.map(x => -x); }
      const l = Math.hypot(...n) || 1; this.normals.push(n.map(x => x / l));
      const lo = [0, 1, 2].map(k => Math.floor(Math.min(a[k], b[k], c[k]) / cell)), hi = [0, 1, 2].map(k => Math.floor(Math.max(a[k], b[k], c[k]) / cell));
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
        const k = `${x},${y},${z}`;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(t / 3);
      }
    }
  }

  nearest(p, reach = 0.03) {
    const c = p.map(x => Math.floor(x / this.cell)), r = Math.ceil(reach / this.cell);
    let best = null, bestD = reach;
    const tested = new Set();
    for (let x = c[0] - r; x <= c[0] + r; x++) for (let y = c[1] - r; y <= c[1] + r; y++) for (let z = c[2] - r; z <= c[2] + r; z++) {
      for (const t of this.grid.get(`${x},${y},${z}`) || []) {
        if (tested.has(t)) continue;
        tested.add(t);
        const q = closest(p, ...[0, 1, 2].map(k => this.positions[this.indices[t * 3 + k]]));
        const d = Math.hypot(...sub(p, q));
        if (d < bestD) { bestD = d; best = { distance: d, point: q, normal: this.normals[t], signed: Math.sign(dot(sub(p, q), this.normals[t])) * d }; }
      }
    }
    return best;
  }
}

// Where a point is against the mask, along `forward` (the mask's front): { behind: distance to the surface in front of
// it } when a line through it along forward meets the mask ahead (the face and hood should be behind it), { through:
// distance back to the surface } when it meets it only behind (the point stands in front of the mask: poking through,
// or the hood lying over it), null when the line misses the mask (outside its outline) or meets it beyond reach.
export function against(surface, p, forward, reach = 0.06) {
  const key = forward.map(x => x.toFixed(6)).join();
  if (surface.projected?.key !== key) {
    // The triangles in a grid on the plane across `forward` (one lookup per point).
    const f = forward, a = Math.abs(f[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const e1 = cross(f, a), l1 = Math.hypot(...e1); e1.forEach((x, k) => { e1[k] = x / l1; });
    const e2 = cross(f, e1), cell = 0.006, grid = new Map();
    const uv = (q) => [dot(q, e1), dot(q, e2)];
    for (let t = 0; t < surface.indices.length / 3; t++) {
      const pts = [0, 1, 2].map(k => uv(surface.positions[surface.indices[t * 3 + k]]));
      const lo = [0, 1].map(k => Math.floor(Math.min(...pts.map(q => q[k])) / cell)), hi = [0, 1].map(k => Math.floor(Math.max(...pts.map(q => q[k])) / cell));
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) { const k = `${x},${y}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); }
    }
    surface.projected = { key, uv, cell, grid };
  }
  const { uv, cell, grid } = surface.projected, c = uv(p).map(x => Math.floor(x / cell));
  let ahead = Infinity, back = Infinity;
  for (const t of grid.get(`${c[0]},${c[1]}`) || []) {
    const [a, b, cc] = [0, 1, 2].map(k => surface.positions[surface.indices[t * 3 + k]]);
    // Moller-Trumbore along forward (signed: + ahead, - behind)
    const e1 = sub(b, a), e2 = sub(cc, a), h = cross(forward, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-14) continue;
    const inv = 1 / det, s0 = sub(p, a), u = inv * dot(s0, h);
    if (u < 0 || u > 1) continue;
    const qv = cross(s0, e1), v = inv * dot(forward, qv);
    if (v < 0 || u + v > 1) continue;
    const d = inv * dot(e2, qv);
    if (d >= 0) ahead = Math.min(ahead, d); else back = Math.min(back, -d);
  }
  if (ahead <= reach) return { behind: ahead };
  if (ahead === Infinity && back <= reach) return { through: back };
  return null;
}

// His skeleton from a gltf-transform document as PlayCanvas-math nodes (rest pose), the skinned primitives, and a clip
// sampler: pose(clip, time) sets every animated bone; skin(prim) returns the posed vertices (world).
export function rig(doc) {
  const root = doc.getRoot(), nodes = new Map();
  const make = (n, parent) => {
    const g = { name: n.getName(), t: new Vec3(...n.getTranslation()), r: new Quat(...n.getRotation()), s: new Vec3(...n.getScale()), parent, rest: null, world: new Mat4() };
    g.rest = { t: g.t.clone(), r: g.r.clone() };
    nodes.set(n, g);
    for (const c of n.listChildren()) make(c, g);
  };
  for (const n of root.listScenes()[0].listChildren()) make(n, null);
  const order = [...nodes.values()];
  const update = () => { for (const g of order) { g.world.setTRS(g.t, g.r, g.s); if (g.parent) g.world.mul2(g.parent.world, g.world); } };
  const byName = new Map(order.map(g => [g.name, g]));
  const clips = new Map(root.listAnimations().map(a => [a.getName(), a]));
  const sample = (sampler, time, out) => {
    const input = sampler.getInput().getArray(), output = sampler.getOutput().getArray(), size = sampler.getOutput().getElementSize();
    let i = 0;
    while (i < input.length - 2 && input[i + 1] < time) i++;
    const k = input.length > 1 ? Math.min(1, Math.max(0, (time - input[i]) / ((input[i + 1] - input[i]) || 1))) : 0, j = Math.min(input.length - 1, i + 1);
    if (size === 4) {
      const a = new Quat(...output.slice(i * 4, i * 4 + 4)), b = new Quat(...output.slice(j * 4, j * 4 + 4));
      return out.slerp(a, b, k);
    }
    return out.set(...[0, 1, 2].map(c => output[i * 3 + c] + (output[j * 3 + c] - output[i * 3 + c]) * k));
  };
  return {
    nodes: byName,
    clipNames: [...clips.keys()],
    duration: (name) => Math.max(...clips.get(name).listSamplers().map(s => { const a = s.getInput().getArray(); return a[a.length - 1]; })),
    pose(name, time) {
      for (const g of order) { g.t.copy(g.rest.t); g.r.copy(g.rest.r); }
      for (const ch of clips.get(name)?.listChannels() ?? []) {
        const g = nodes.get(ch.getTargetNode()), path = ch.getTargetPath();
        if (path === 'rotation') sample(ch.getSampler(), time, g.r); else if (path === 'translation') sample(ch.getSampler(), time, g.t);
      }
      update();
    },
    update,
    // Posed vertices (world) of a skinned primitive of mesh node `meshNode`; filter(i) picks vertices (all by default).
    skin(meshNode, prim, filter = () => true) {
      const skin = meshNode.getSkin(), joints = skin.listJoints().map(j => nodes.get(j)), ibm = skin.getInverseBindMatrices();
      const jm = joints.map((g, i) => new Mat4().mul2(g.world, new Mat4().set(ibm.getElement(i, []))));
      const pos = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      const out = [], p = [], j = [], w = [], v = new Vec3(), acc = new Vec3(), tmp = new Vec3();
      for (let i = 0; i < pos.getCount(); i++) {
        if (!filter(i)) { out.push(null); continue; }
        pos.getElement(i, p); J.getElement(i, j); W.getElement(i, w); v.set(...p); acc.set(0, 0, 0);
        for (let k = 0; k < 4; k++) if (w[k]) acc.add(jm[j[k]].transformPoint(v, tmp).mulScalar(w[k]));
        out.push([acc.x, acc.y, acc.z]);
      }
      return out;
    },
  };
}
