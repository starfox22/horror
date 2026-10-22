// Prints what the asset pipeline needs to know about a glTF: scene root, emissive (light) fixtures, blended materials.
// Usage: node tools/inspect-model.mjs path/to/scene.gltf
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const fmt = v => v.map(n => n.toFixed(2)).join(',');
for (const n of scene.listChildren()) console.log('root child', n.getName(), 'T', fmt(n.getTranslation()), 'R', fmt(n.getRotation()), 'S', fmt(n.getScale()));
console.log('scene bounds', JSON.stringify(getBounds(scene)));
const emissive = new Set(root.listMaterials().filter(m => m.getEmissiveFactor().some(c => c > 0) || m.getEmissiveTexture()));
for (const m of emissive) console.log('emissive mat', m.getName(), fmt(m.getEmissiveFactor()), 'strength', m.getExtension('KHR_materials_emissive_strength')?.getEmissiveStrength());
for (const m of root.listMaterials()) if (m.getAlphaMode() !== 'OPAQUE') console.log('alpha', m.getAlphaMode(), m.getName(), m.getBaseColorFactor()[3].toFixed(2));
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const mats = mesh.listPrimitives().map(p => p.getMaterial());
  if (mats.some(m => emissive.has(m))) { const b = getBounds(node); console.log('fixture', node.getName(), mats.map(m => m.getName()).join('|'), 'min', fmt(b.min), 'max', fmt(b.max)); }
}
