// Lists the source model's meshes whose bounds meet a box (world metres): node tools/find-meshes.mjs <gltf> x0 x1 y0 y1 z0 z1
// (e.g. to find which mesh a fixture, handle or lamp shade belongs to before cutting or lighting it).
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [file, ...r] = process.argv.slice(2); const [x0, x1, y0, y1, z0, z1] = r.map(Number);
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
for (const n of doc.getRoot().listNodes()) {
  if (!n.getMesh()) continue; const b = getBounds(n);
  if (b.max[0] < x0 || b.min[0] > x1 || b.max[1] < y0 || b.min[1] > y1 || b.max[2] < z0 || b.min[2] > z1) continue;
  const tris = n.getMesh().listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  console.log(n.getName().padEnd(44), b.min.map(v => v.toFixed(3)).join(','), '|', b.max.map(v => v.toFixed(3)).join(','), tris);
}
