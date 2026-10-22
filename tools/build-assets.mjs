// Turns the source apartment (assets-src/modern_apartment/scene.gltf, ~3M triangles, 300 MB) into the web build in
// public/assets/apartment/: simplified, joined and Draco-compressed geometry split into <=12 MB .bin files, KTX2 textures
// (ETC1S colour, UASTC normal maps), and collision.json (walk grid + floor heights) for the first-person controller.
// Usage: node tools/build-assets.mjs [--src assets-src/modern_apartment/scene.gltf] [--out public/assets/apartment] [--fast]
//   --fast skips texture compression (PNG/JPEG kept, max 1024 px): quick iteration on geometry or collision.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, flatten, weld, simplify, join, draco, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { buildCollision } from './collision.mjs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const SRC = arg('--src', 'assets-src/modern_apartment/scene.gltf');
const FAST = process.argv.includes('--fast');
const OUT = arg('--out', 'public/assets/apartment');
const CHUNK = 12 * 1024 * 1024;

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
await MeshoptSimplifier.ready;

const doc = await io.read(SRC);
const tris = () => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
log('read', SRC, 'triangles', tris());

// Geometry: drop duplicates, bake the Sketchfab root transform into flat nodes, then simplify within 0.4 mm per metre of
// mesh radius (removes the 1M-triangle door's redundant tessellation without visible change) and join by material.
await doc.transform(dedup(), prune(), flatten());
// The bathroom's only door (bedroom side) is modelled shut: swing its leaf and handle 90 degrees into the bathroom.
// Leaf = the white door pieces; the black piece that starts at the hinge edge holds the handles (the other is the frame).
openDoor(doc, (n, b) => /^Door\.001_White1/.test(n.getName()) || (/^Door\.001_Black/.test(n.getName()) && b.min[2] > 0.38),
  { hinge: [9.15, 0.375], degrees: -90 });
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: 0.0004 }),
  join({ keepNamed: false }), dedup(), prune());
log('simplified + joined: triangles', tris(), 'meshes', doc.getRoot().listMeshes().length);

function openDoor(doc, pick, { hinge: [hx, hz], degrees }) {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  // Column-major rotation about the vertical axis through (hx, hz).
  const R = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, hx - c * hx - s * hz, 0, hz + s * hx - c * hz, 1];
  let moved = 0;
  for (const n of doc.getRoot().listScenes()[0].listChildren()) {
    if (!n.getMesh() || !pick(n, getBounds(n))) continue;
    const M = n.getMatrix(), out = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out[col * 4 + row] += R[k * 4 + row] * M[col * 4 + k];
    n.setMatrix(out);
    moved++;
  }
  log(`opened door: ${moved} pieces turned ${degrees} degrees`);
}

const scene = doc.getRoot().listScenes()[0];
const bounds = getBounds(scene);
log('bounds', JSON.stringify(bounds));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/textures`, { recursive: true });
writeFileSync(`${OUT}/collision.json`, JSON.stringify(buildCollision(doc, bounds)));
log('collision.json written');

// Textures: cap at 2048 px, then KTX2 (GPU-compressed: ~6x less video memory than PNG) unless --fast.
const decoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
if (FAST) {
  await doc.transform(textureCompress({ encoder: sharp, resize: [1024, 1024] }));
} else {
  await doc.transform(textureCompress({ encoder: sharp, resize: [2048, 2048], targetFormat: 'png' }));
  log('textures resized');
  await doc.transform(ktx2({ isUASTC: true, isNormalMap: true, needSupercompression: true, generateMipmap: true,
    slots: /normalTexture/, imageDecoder: decoder }));
  log('normal maps -> UASTC');
  await doc.transform(ktx2({ isUASTC: false, qualityLevel: 200, compressionLevel: 2, generateMipmap: true,
    isPerceptual: true, imageDecoder: decoder }));
  log('other textures -> ETC1S');
}
// Each image gets a stable file name: textures/<index>.<ext>.
doc.getRoot().listTextures().forEach((t, i) => t.setURI(`textures/${i}.${t.getMimeType() === 'image/ktx2' ? 'ktx2' : t.getMimeType().split('/')[1]}`));

await doc.transform(draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
log('draco');
await io.write(`${OUT}/scene.gltf`, doc);

// Split the single .bin at bufferView boundaries so no file exceeds CHUNK (the artifact host caps files at 15 MB).
const gltfPath = `${OUT}/scene.gltf`;
const json = JSON.parse(readFileSync(gltfPath, 'utf8'));
const binName = json.buffers[0].uri;
const bin = readFileSync(`${OUT}/${binName}`);
const parts = [];
let cur = null;
json.bufferViews.forEach((bv, i) => {
  const len = bv.byteLength;
  if (!cur || cur.size + len > CHUNK) { cur = { views: [], size: 0 }; parts.push(cur); }
  const pad = (4 - (cur.size % 4)) % 4;
  cur.views.push({ i, from: bv.byteOffset || 0, at: cur.size + pad, len });
  cur.size += pad + len;
});
json.buffers = parts.map((p, n) => {
  const out = Buffer.alloc(p.size);
  for (const v of p.views) { bin.copy(out, v.at, v.from, v.from + v.len); Object.assign(json.bufferViews[v.i], { buffer: n, byteOffset: v.at }); }
  writeFileSync(`${OUT}/geometry-${n}.bin`, out);
  return { uri: `geometry-${n}.bin`, byteLength: p.size };
});
rmSync(`${OUT}/${binName}`);
writeFileSync(gltfPath, JSON.stringify(json));

const files = readdirSync(OUT, { recursive: true }).filter(f => statSync(`${OUT}/${f}`).isFile());
const total = files.reduce((n, f) => n + statSync(`${OUT}/${f}`).size, 0);
const biggest = Math.max(...files.map(f => statSync(`${OUT}/${f}`).size));
log(`done: ${files.length} files, ${(total / 1e6).toFixed(1)} MB, largest ${(biggest / 1e6).toFixed(1)} MB`);
