// Reuse the apartment author's hollow table glass. The committed optimized model
// is sufficient: no large source download or apartment rebuild is required.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { writeFileSync } from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read('public/assets/apartment/scene.gltf');
const positions = [], normals = [], indices = [];
// The author's glass on the sofa table, including its inner wall and heavy base.
const bounds = [-4.019, -3.918, 0.506, 0.741, 2.234, 2.334];
const center = [(bounds[0] + bounds[1]) / 2, 0.5076, (bounds[4] + bounds[5]) / 2];
const scale = [0.8, 0.60, 0.8];
for (const node of doc.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
  if (primitive.getMaterial()?.getName() !== 'Glass@main') continue;
  const position = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL'), ids = primitive.getIndices().getArray(), matrix = node.getWorldMatrix();
  const world = Array.from({ length: position.getCount() }, (_, index) => { const p = position.getElement(index, []); return [0, 1, 2].map(k => matrix[k] * p[0] + matrix[k + 4] * p[1] + matrix[k + 8] * p[2] + matrix[k + 12]); });
  const inside = p => p.every((v, k) => v >= bounds[k * 2] && v <= bounds[k * 2 + 1]);
  const used = new Map();
  for (let i = 0; i < ids.length; i += 3) {
    const triangle = Array.from(ids.slice(i, i + 3));
    if (!triangle.every(index => inside(world[index]))) continue;
    for (const index of triangle) {
      if (!used.has(index)) {
        used.set(index, positions.length / 3);
        positions.push(...world[index].map((v, k) => (v - center[k]) * scale[k]));
        const p = normal.getElement(index, []), n = [0, 1, 2].map(k => (matrix[k] * p[0] + matrix[k + 4] * p[1] + matrix[k + 8] * p[2]) / scale[k]);
        const length = Math.hypot(...n); normals.push(...n.map(v => v / length));
      }
      indices.push(used.get(index));
    }
  }
}
if (indices.length < 300 || positions.length < 600) throw new Error('The authored table glass was not found');
const round = v => Math.round(v * 1e7) / 1e7;
const asset = { source: 'Modern Apartment by Visthétique / authored hollow sofa-table glass', sourceUrl: 'https://sketchfab.com/3d-models/modern-apartment-1fbb649cd6624f2bb7b7d6e30c6533a5', license: 'CC-BY-4.0', adaptation: 'Extracted existing glass and scaled 0.8 across / 0.6 tall into a drinking tumbler.', positions: positions.map(round), normals: normals.map(round), indices };
writeFileSync('public/assets/props/drinking-glass.json', JSON.stringify(asset));
console.log(`Extracted ${positions.length / 3} vertices, ${indices.length / 3} triangles`);
