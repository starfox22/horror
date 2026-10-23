// Turns the source apartment (assets-src/modern_apartment/scene.gltf, ~3M triangles, 300 MB) into the web build in
// public/assets/apartment/: simplified, joined and Draco-compressed geometry split into <=12 MB .bin files, KTX2 textures
// (ETC1S colour, UASTC normal maps), and collision.json (walk grid + floor heights) for the first-person controller.
// Usage: node tools/build-assets.mjs [--src assets-src/modern_apartment/scene.gltf] [--out public/assets/apartment] [--fast]
//   --fast skips texture compression (PNG/JPEG kept, max 1024 px): quick iteration on geometry or collision.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, prune, flatten, weld, simplify, join, draco, textureCompress, listTextureSlots } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { encodeToKTX2 } from 'ktx2-encoder';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { buildCollision } from './collision.mjs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const SRC = arg('--src', 'assets-src/modern_apartment/scene.gltf');
const FAST = process.argv.includes('--fast');
const OUT = arg('--out', 'public/assets/apartment');
const CHUNK = 12 * 1024 * 1024;
// Glowing lamp parts per room (see separateMaterials).
const FIXTURES = { BathroomFurnitures_Light_0: 'bathroom', BedDecors_Light_0: 'bedroom', Hood_Light_0: 'kitchen',
  OficeDecors_Light_0: 'office' };

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
separateMaterials(doc);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: 0.0004 }),
  join({ keepNamed: false }), dedup({ keepUniqueNames: true }), prune({ keepAttributes: true }));   // keep the window UVs (no texture uses them in the file)
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

// Lamp fixtures that glow share one 'Light' material across rooms; give each its own copy ('Light.<room>') so join()
// keeps them apart and the game can switch each room's glow off. Window panes get their own 'WindowGlass' material and
// world-planar UVs (1 unit = 1 m along the wall, v = height) for the rain-on-glass effect.
function separateMaterials(doc) {
  for (const n of doc.getRoot().listScenes()[0].listChildren()) {
    const room = FIXTURES[n.getName()], window = n.getName() === 'Windows_Glass_0';
    if (!n.getMesh() || (!room && !window)) continue;
    for (const prim of n.getMesh().listPrimitives()) {
      const mat = prim.getMaterial().clone().setName(window ? 'WindowGlass' : `${prim.getMaterial().getName()}.${room}`);
      prim.setMaterial(mat);
      if (window) planarUVs(doc, n, prim);
    }
  }
  log('separated fixture and window materials');
}
function planarUVs(doc, node, prim) {
  const m = node.getMatrix(), pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL');
  const uv = new Float32Array(pos.getCount() * 2), p = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, p); nor.getElement(i, q);
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    const nx = m[0] * q[0] + m[4] * q[1] + m[8] * q[2], nz = m[2] * q[0] + m[6] * q[1] + m[10] * q[2];
    uv[i * 2] = Math.abs(nx) > Math.abs(nz) ? z : x;
    uv[i * 2 + 1] = 3 - y;
  }
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(pos.getBuffer()));
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
  // Encoding is slow (UASTC normal maps ~1 min each), so results are cached by content in assets-src/ktx2-cache.
  const CACHE = 'assets-src/ktx2-cache';
  mkdirSync(CACHE, { recursive: true });
  let hits = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const normal = listTextureSlots(tex).some(s => /normalTexture/.test(s));
    const opts = normal
      ? { isUASTC: true, isNormalMap: true, needSupercompression: true, generateMipmap: true }
      : { isUASTC: false, qualityLevel: 200, compressionLevel: 2, generateMipmap: true, isPerceptual: true };
    const key = createHash('sha1').update(tex.getImage()).update(JSON.stringify(opts)).digest('hex');
    const file = `${CACHE}/${key}.ktx2`;
    if (existsSync(file)) hits++;
    else writeFileSync(file, await encodeToKTX2(tex.getImage(), { ...opts, imageDecoder: decoder }));
    tex.setImage(new Uint8Array(readFileSync(file))).setMimeType('image/ktx2');
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  log(`textures -> KTX2 (UASTC normal maps, ETC1S others; ${hits} from cache)`);
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
