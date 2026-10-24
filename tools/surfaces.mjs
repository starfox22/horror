// Flat surfaces of the built apartment inside a box, to place things on them (and walls to hang them on): every
// triangle facing along an axis (|normal| > 0.95), grouped by its height (or, for walls, its x or z) and mesh.
// Usage: node tools/surfaces.mjs x0 x1 z0 z1 [y0 y1] [axis]   axis: y (default: shelves, tops, floors), x or z (walls)
// e.g. node tools/surfaces.mjs 13.4 14.2 -1.4 -0.4 0.3 1.2    -> the north nightstand's top at 0.57
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const args = process.argv.slice(2);
const [x0, x1, z0, z1, y0 = -1, y1 = 4] = args.slice(0, 6).map(Number);
const axis = { x: 0, y: 1, z: 2 }[args[6] || 'y'];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read('public/assets/apartment/scene.gltf');
const mul = (m, p) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
const levels = new Map();
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const W = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices()?.getArray(); if (!idx) continue;
    const a = [], b = [], c = [];
    for (let t = 0; t < idx.length; t += 3) {
      const A = mul(W, pos.getElement(idx[t], a)), B = mul(W, pos.getElement(idx[t + 1], b)), C = mul(W, pos.getElement(idx[t + 2], c));
      const lo = [0, 1, 2].map(k => Math.min(A[k], B[k], C[k])), hi = [0, 1, 2].map(k => Math.max(A[k], B[k], C[k]));
      if (hi[0] < x0 || lo[0] > x1 || hi[2] < z0 || lo[2] > z1 || hi[1] < y0 || lo[1] > y1) continue;
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const area = Math.hypot(...n) / 2;
      if (area < 1e-7 || Math.abs(n[axis] / (2 * area)) < 0.95) continue;
      const at = (A[axis] + B[axis] + C[axis]) / 3;
      const key = `${'xyz'[axis]} ${at.toFixed(axis === 1 ? 2 : 3)} | ${node.getName().replace(/@.*/, '')}`;
      const L = levels.get(key) || { area: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
      L.area += area;
      for (let k = 0; k < 3; k++) { L.lo[k] = Math.min(L.lo[k], Math.max([x0, y0, z0][k], lo[k])); L.hi[k] = Math.max(L.hi[k], Math.min([x1, y1, z1][k], hi[k])); }
      levels.set(key, L);
    }
  }
}
const f = (v) => v.toFixed(2);
for (const [key, L] of [...levels].sort((p, q) => parseFloat(p[0].slice(2)) - parseFloat(q[0].slice(2)))) {
  if (L.area > 0.002) console.log(key.padEnd(56), 'area', L.area.toFixed(3), ' x', f(L.lo[0]), '..', f(L.hi[0]), ' y', f(L.lo[1]), '..', f(L.hi[1]), ' z', f(L.lo[2]), '..', f(L.hi[2]));
}
