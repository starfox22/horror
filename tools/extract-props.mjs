// Downloaded refrigerator props (assets/props/*.glb, see docs/DRINK_ASSETS.md) to the small runtime meshes the game
// loads (public/assets/props/*.json: positions, normals, indices, attribution, and the vessel's measured interior).
//   node tools/extract-props.mjs
// The GLBs are already normalised (metres, Y up, base at y=0, vessel axis at x=z=0); the interior profiles ([y, inner
// radius] from the inner floor up) were measured from these exact meshes (work/props/props-data.json when they were
// prepared) and are checked again in tools/check-fridge.mjs and tools/check-drink-sequence.mjs.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { writeFileSync } from 'node:fs';

const PROPS = [
  {
    src: 'assets/props/water-jug.glb', out: 'public/assets/props/water-jug.json',
    title: 'Glass Water Jug (High Poly)', author: 'ShotaB', license: 'CC-BY-4.0',
    sourceUrl: 'https://sketchfab.com/3d-models/glass-water-jug-high-poly-c0b82c381cd34115ba1462ba0310aca1',
    // Round below 0.205 m; handle toward +X, spout toward -X.
    interior: { floor: 0.0016, brim: 0.2105, profile: [[0.0021, 0.0446], [0.0071, 0.0508], [0.0121, 0.0548], [0.0171, 0.0585], [0.0221, 0.0618],
      [0.0271, 0.0649], [0.0321, 0.0673], [0.0371, 0.0677], [0.0471, 0.0645], [0.0571, 0.0615], [0.0671, 0.0588], [0.0771, 0.0563],
      [0.0871, 0.054], [0.0971, 0.0519], [0.1071, 0.05], [0.1171, 0.0483], [0.1271, 0.0468], [0.1371, 0.0454], [0.1471, 0.0443], [0.1571, 0.0434]] },
  },
  {
    src: 'assets/props/drinking-glass.glb', out: 'public/assets/props/drinking-glass.json',
    title: 'Glass Collection ("highball glass")', author: 'RagingCow', license: 'CC-BY-4.0',
    sourceUrl: 'https://sketchfab.com/3d-models/glass-collection-0ff8fc5007dd4e9da675109fe7c443d6',
    // A slightly tapered tumbler: inner radius 22.6 mm at the floor to 31.9 mm at the rim, before scaling. Scaled by
    // 1.05 (12.6 cm, about 300 ml) to the 72 mm glass the arm's grip was fitted to (public/assets/props/drinking-arm.json).
    scale: 1.05,
    interior: { floor: 0.0071, brim: 0.1195, profile: [[0.0076, 0.0226], [0.119, 0.0319]] },
  },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const prop of PROPS) {
  const doc = await io.read(prop.src);
  const positions = [], normals = [], indices = [];
  for (const node of doc.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const m = node.getWorldMatrix(), base = positions.length / 3;
    const p = primitive.getAttribute('POSITION'), n = primitive.getAttribute('NORMAL'), ids = primitive.getIndices();
    for (let i = 0; i < p.getCount(); i++) {
      const v = p.getElement(i, []), w = n.getElement(i, []);
      positions.push(...[0, 1, 2].map(k => +(m[k] * v[0] + m[k + 4] * v[1] + m[k + 8] * v[2] + m[k + 12]).toFixed(5)));
      const q = [0, 1, 2].map(k => m[k] * w[0] + m[k + 4] * w[1] + m[k + 8] * w[2]), l = Math.hypot(...q) || 1;
      normals.push(...q.map(x => +(x / l).toFixed(4)));
    }
    for (let i = 0; i < ids.getCount(); i++) indices.push(base + ids.getScalar(i));
  }
  const { out, src, scale = 1, ...meta } = prop;
  if (scale !== 1) {
    for (let i = 0; i < positions.length; i++) positions[i] = +(positions[i] * scale).toFixed(5);
    const k = v => +(v * scale).toFixed(5);
    meta.interior = { floor: k(meta.interior.floor), brim: k(meta.interior.brim), profile: meta.interior.profile.map(([y, r]) => [k(y), k(r)]) };
    meta.scale = scale;
  }
  writeFileSync(out, JSON.stringify({ ...meta, positions, normals, indices }));
  console.log(out, positions.length / 3, 'vertices', indices.length / 3, 'triangles');
}
