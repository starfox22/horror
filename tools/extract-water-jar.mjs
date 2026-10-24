// Reuse the hollow glass jar authored for the licensed apartment. No generated prop.
// Run after tools/fetch-source.mjs; the small normalized mesh is used by fridge.js.
import { NodeIO } from '@gltf-transform/core';
import { readFileSync, writeFileSync } from 'node:fs';
const doc = await new NodeIO().read('assets-src/modern_apartment/scene.gltf');
const node = doc.getRoot().listNodes().find(n => n.getName() === 'KDecor_Glass_0');
if (!node) throw new Error('The authored kitchen jar is missing');
const primitive = node.getMesh().listPrimitives()[0], m = node.getWorldMatrix();
const pos = primitive.getAttribute('POSITION'), norm = primitive.getAttribute('NORMAL');
const world = Array.from({ length: pos.getCount() }, (_, i) => {
  const p = pos.getElement(i, []);
  return [0, 1, 2].map(k => m[k] * p[0] + m[k + 4] * p[1] + m[k + 8] * p[2] + m[k + 12]);
});
const min = [0, 1, 2].map(k => Math.min(...world.map(p => p[k]))), max = [0, 1, 2].map(k => Math.max(...world.map(p => p[k])));
const origin = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2], scale = 1.4;
const round = x => Math.round(x * 1e6) / 1e6;
const positions = world.flatMap(p => p.map((v, k) => round((v - origin[k]) * scale)));
const normals = Array.from({ length: norm.getCount() }, (_, i) => {
  const p = norm.getElement(i, []), v = [0, 1, 2].map(k => m[k] * p[0] + m[k + 4] * p[1] + m[k + 8] * p[2]);
  const length = Math.hypot(...v); return v.map(x => round(x / length));
}).flat();
const asset = { source: 'Modern Apartment by Visthétique / KDecor_Glass_0', license: 'CC-BY-4.0', sourceUrl: 'https://sketchfab.com/3d-models/modern-apartment-1fbb649cd6624f2bb7b7d6e30c6533a5', positions, normals, indices: [...primitive.getIndices().getArray()] };
writeFileSync('public/assets/props/water-jar.json', JSON.stringify(asset));
console.log(`Extracted authored hollow water jar: ${positions.length / 3} vertices, ${asset.indices.length / 3} triangles, ${readFileSync('public/assets/props/water-jar.json').length} bytes`);
