// Extract the apartment author's detailed rocker and bezel; never rebuild the apartment.
// Requires the licensed source archive unpacked by tools/fetch-source.mjs.
// Output is bundled JSON so switches need no extra network request during startup.
import { NodeIO } from '@gltf-transform/core';
import { writeFileSync } from 'node:fs';
import { Mat3, Mat4, Vec3 } from 'playcanvas';

const document = await new NodeIO().read('assets-src/modern_apartment/scene.gltf');
const node = document.getRoot().listNodes().find(node => node.getName() === 'ElectricPlugs_White1_0');
if (!node) throw new Error('The source apartment has no ElectricPlugs_White1_0 mesh');
const primitive = node.getMesh().listPrimitives()[0];
const positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL'), indices = primitive.getIndices();
const matrix = node.getWorldMatrix();
const normalMatrix = new Mat3().invertMat4(new Mat4().set(matrix)).transpose();
const transform = (v, point) => {
  if (!point) { const n = normalMatrix.transformVector(new Vec3(...v)).normalize(); return [n.x, n.y, n.z]; }
  return [0, 1, 2].map(k => matrix[k] * v[0] + matrix[4 + k] * v[1] + matrix[8 + k] * v[2] + matrix[12 + k]);
};
const vertices = Array.from({ length: positions.getCount() }, (_, i) => ({ p: transform(positions.getElement(i, []), true), n: transform(normals.getElement(i, []), false) }));
const parent = vertices.map((_, i) => i);
const find = i => parent[i] === i ? i : parent[i] = find(parent[i]);
const union = (a, b) => { parent[find(a)] = find(b); };
const welded = new Map();
vertices.forEach(({ p }, i) => { const key = p.map(v => Math.round(v * 1e5)).join(','); if (welded.has(key)) union(i, welded.get(key)); else welded.set(key, i); });
for (let i = 0; i < indices.getCount(); i += 3) { union(indices.getScalar(i), indices.getScalar(i + 1)); union(indices.getScalar(i), indices.getScalar(i + 2)); }
const groups = new Map();
vertices.forEach(({ p }, i) => {
  const id = find(i); if (!groups.has(id)) groups.set(id, { id, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const group = groups.get(id); p.forEach((v, k) => { group.min[k] = Math.min(group.min[k], v); group.max[k] = Math.max(group.max[k], v); });
});
const candidates = [...groups.values()].filter(g => g.min[0] > 6.57 && g.max[0] < 7.02 && g.min[1] > 1.16 && g.max[1] < 1.28 && g.min[2] > 1.77 && g.max[2] < 1.81);
const frame = candidates.find(g => g.max[0] - g.min[0] > 0.4);
const rocker = candidates.find(g => g.max[0] - g.min[0] > 0.07 && g.max[0] - g.min[0] < 0.08);
if (!frame || !rocker) throw new Error('Could not isolate the authored switch frame and rocker');
const centre = [(rocker.min[0] + rocker.max[0]) / 2, (frame.min[1] + frame.max[1]) / 2, frame.max[2]];
const scale = 0.09 / (frame.max[1] - frame.min[1]);
const triangles = id => {
  const output = [];
  for (let i = 0; i < indices.getCount(); i += 3) if (find(indices.getScalar(i)) === id) output.push([0, 1, 2].map(k => vertices[indices.getScalar(i + k)]));
  return output;
};
const clipped = triangle => {
  const output = [];
  triangle.forEach((b, i) => {
    const a = triangle[(i + 2) % 3], insideA = a.p[0] <= centre[0], insideB = b.p[0] <= centre[0];
    if (insideA !== insideB) {
      const t = (centre[0] - a.p[0]) / (b.p[0] - a.p[0]);
      output.push({ p: a.p.map((v, k) => v + (b.p[k] - v) * t), n: a.n.map((v, k) => v + (b.n[k] - v) * t) });
    }
    if (insideB) output.push(b);
  });
  return output.length < 3 ? [] : Array.from({ length: output.length - 2 }, (_, i) => [output[0], output[i + 1], output[i + 2]]);
};
const half = triangles(frame.id).flatMap(clipped);
const whole = [...half, ...half.map(triangle => [...triangle].reverse().map(v => ({ p: [2 * centre[0] - v.p[0], v.p[1], v.p[2]], n: [-v.n[0], v.n[1], v.n[2]] })))];
function encode(triangles) {
  const mesh = { positions: [], normals: [], indices: [] }, cache = new Map();
  for (const triangle of triangles) for (const v of [...triangle].reverse()) { // source -Z becomes asset +Z
    const p = [(v.p[0] - centre[0]) * scale, (v.p[1] - centre[1]) * scale, (centre[2] - v.p[2]) * scale];
    const n = [v.n[0], v.n[1], -v.n[2]], length = Math.hypot(...n);
    const data = [...p, ...n.map(v => v / length)].map(v => Math.round(v * 1e6) / 1e6), key = data.join(',');
    if (!cache.has(key)) { cache.set(key, mesh.positions.length / 3); mesh.positions.push(...data.slice(0, 3)); mesh.normals.push(...data.slice(3)); }
    mesh.indices.push(cache.get(key));
  }
  return mesh;
}
const result = { source: 'Modern Apartment by Visthétique / ElectricPlugs_White1_0', licence: 'CC BY 4.0', changes: 'Single bezel cropped and mirrored from authored gang frame; original bevels and rocker retained; scaled to 90mm high.', frame: encode(whole), rocker: encode(triangles(rocker.id)) };
writeFileSync('src/switch-model.json', JSON.stringify(result));
console.log('Extracted authored switch:', result.frame.indices.length / 3, 'frame triangles,', result.rocker.indices.length / 3, 'rocker triangles');
