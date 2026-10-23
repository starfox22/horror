// Turns the source apartment (assets-src/modern_apartment/scene.gltf, ~3M triangles, 300 MB) into the web build in
// public/assets/apartment/: simplified, joined and Draco-compressed geometry split into <=12 MB .bin files, KTX2 textures
// (ETC1S colour, UASTC normal maps), and collision.json (walk grid + floor heights) for the first-person controller.
// Usage: node tools/build-assets.mjs [--src assets-src/modern_apartment/scene.gltf] [--out public/assets/apartment] [--fast]
//   --fast skips texture compression (PNG/JPEG kept, max 1024 px): quick iteration on geometry or collision.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, prune, flatten, weld, simplify, join, draco, textureCompress, listTextureSlots, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
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
// Downloaded props merged into the apartment (assets/props/, credited in docs/CREDITS.md), placed in world metres.
// The front door replaces the model's own entrance door (a flat panel with only a thin bar for a handle).
const PROPS = [
  { file: 'assets/props/flashlite_flashlight.glb', name: 'Prop_flashlight', at: [0, -10, 0], scale: [1, 1, 1], yaw: 0 },
  { file: 'assets/props/door_with_frame.glb', name: 'Prop_front_door', at: [12.88, 0.14, 4.40], scale: [0.01155, 0.0120, 0.01], yaw: 180 },
];
const REMOVE = /^EnteranceDoor_/;
// Bedroom wardrobe doors cut out of the carcass so the game can swing them open: front panels (x > 9.70) and their
// chrome handles inside each box. Hinge edges are the outer edges (handles sit at the inner edges).
const WARDROBE = [
  { id: 'left', z: [-1.323, -0.544], y: [0.14, 2.28] },
  { id: 'right', z: [-0.502, 0.277], y: [0.14, 2.28] },
  { id: 'upperleft', z: [1.341, 1.830], y: [1.205, 2.28] },
  { id: 'upperright', z: [1.866, 2.357], y: [1.205, 2.28] },
];
// Parts the game switches or moves on their own get their own material copy '<material>.<tag>' (see separateMaterials):
// lamp glows per room, the iMac's screen, the coffee machine's panel, the bathroom door leaf (hung on a hinge at run time).
const FIXTURES = { BathroomFurnitures_Light_0: 'bathroom', Hood_Light_0: 'kitchen', OficeDecors_Light_0: 'office',
  iMac_Screen_0: 'imac', 'Coffee+Maker_Coffee_Maker_Material5_0': 'coffee' };
// The bathroom door leaf: the white panels and the black piece that starts at the hinge edge (handles); the other black
// piece is the frame. Left out of the walk grid: the game blocks the doorway while the door is shut.
const BATH_DOOR = (n, b) => /^Door\.001_White1/.test(n.getName()) || (/^Door\.001_Black/.test(n.getName()) && b.min[2] > 0.38);
// Triangle-level splits: [node name pattern, (world centroid) => tag or null]. The two bedside reading lamps share one
// glowing mesh (split at the bed's centre line, z 0.5); the MacBook's lid (everything above its base, y > 0.522) swings.
const SPLITS = [
  [/^BedDecors_Light_0$/, (c) => (c[2] < 0.5 ? 'bedside-left' : 'bedside-right')],
  [/^MacBook_/, (c) => (c[1] > 0.522 ? 'laptoplid' : null)],
];
// Materials the walk grid ignores (moving parts).
export const NO_COLLISION = /\.bathdoor$/;

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.decoder': MeshoptDecoder,
});

const doc = await io.read(SRC);
const tris = () => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
log('read', SRC, 'triangles', tris());

// Geometry: drop duplicates, bake the Sketchfab root transform into flat nodes, then simplify within 0.4 mm per metre of
// mesh radius (removes the 1M-triangle door's redundant tessellation without visible change) and join by material.
for (const n of doc.getRoot().listNodes()) if (REMOVE.test(n.getName())) n.dispose();
await mergeProps(doc);
await doc.transform(dedup(), prune(), flatten(), unpartition());
extractWardrobeDoors(doc);
splitTriangles(doc);
separateMaterials(doc);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: 0.0004 }),
  join({ keepNamed: false }), dedup({ keepUniqueNames: true }), prune({ keepAttributes: true }));   // keep the window UVs (no texture uses them in the file)
log('simplified + joined: triangles', tris(), 'meshes', doc.getRoot().listMeshes().length);

async function mergeProps(doc) {
  const scene = doc.getRoot().listScenes()[0];
  for (const p of PROPS) {
    const src = await io.read(p.file);
    for (const e of src.getRoot().listExtensionsUsed()) if (e.extensionName === 'EXT_meshopt_compression') e.dispose();
    // Material names get a prefix so they never collide with (or dedup into) the apartment's own.
    for (const m of src.getRoot().listMaterials()) m.setName(`${p.name}.${m.getName() || 'material'}`);
    const srcScene = src.getRoot().listScenes()[0];
    const map = mergeDocuments(doc, src);
    const holder = doc.createNode(p.name).setTranslation(p.at).setScale(p.scale)
      .setRotation([0, Math.sin(p.yaw * Math.PI / 360), 0, Math.cos(p.yaw * Math.PI / 360)]);
    const merged = map.get(srcScene);
    for (const c of merged.listChildren()) holder.addChild(c);
    merged.dispose();
    scene.addChild(holder);
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  log(`merged props: ${PROPS.map(p => p.name).join(', ')}`);
}

function extractWardrobeDoors(doc) {
  const scene = doc.getRoot().listScenes()[0];
  let made = 0;
  for (const n of scene.listChildren()) {
    const mesh = n.getMesh();
    if (!mesh || !/^BedroomWardrobes_(Wood049|Chrome)/.test(n.getName())) continue;
    const m = n.getMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), e = [0, 0, 0];
      const keep = [], take = WARDROBE.map(() => []);
      for (let t = 0; t < idx.getCount(); t += 3) {
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx.getScalar(t + k), e);
          cx += (m[0] * e[0] + m[4] * e[1] + m[8] * e[2] + m[12]) / 3; cy += (m[1] * e[0] + m[5] * e[1] + m[9] * e[2] + m[13]) / 3; cz += (m[2] * e[0] + m[6] * e[1] + m[10] * e[2] + m[14]) / 3;
        }
        const d = cx > 9.70 ? WARDROBE.findIndex(w => cz > w.z[0] && cz < w.z[1] && cy > w.y[0] && cy < w.y[1]) : -1;
        (d < 0 ? keep : take[d]).push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
      }
      WARDROBE.forEach((w, d) => {
        if (!take[d].length) return;
        const part = doc.createPrimitive().setMode(prim.getMode())
          .setMaterial(prim.getMaterial().clone().setName(`${prim.getMaterial().getName()}.wardrobe-${w.id}`))
          .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take[d])).setBuffer(idx.getBuffer()));
        for (const sem of prim.listSemantics()) part.setAttribute(sem, prim.getAttribute(sem).clone());
        scene.addChild(doc.createNode(`Wardrobe_${w.id}`).setMatrix(m).setMesh(doc.createMesh(`Wardrobe_${w.id}`).addPrimitive(part)));
        made++;
      });
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(idx.getBuffer()));
    }
  }
  log(`wardrobe doors: ${made} door parts cut out`);
}

// Cuts the SPLITS triangles out of their nodes into new nodes whose materials get the tag as a suffix.
function splitTriangles(doc) {
  const scene = doc.getRoot().listScenes()[0];
  let made = 0;
  for (const n of scene.listChildren()) {
    const rule = n.getMesh() && SPLITS.find(([re]) => re.test(n.getName()));
    if (!rule) continue;
    const m = n.getMatrix(), e = [0, 0, 0];
    for (const prim of n.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), groups = new Map();
      for (let t = 0; t < idx.getCount(); t += 3) {
        const c = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx.getScalar(t + k), e);
          for (let r = 0; r < 3; r++) c[r] += (m[r] * e[0] + m[4 + r] * e[1] + m[8 + r] * e[2] + m[12 + r]) / 3;
        }
        const tag = rule[1](c) ?? '';
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
      }
      for (const [tag, list] of groups) {
        if (!tag) continue;
        const part = doc.createPrimitive().setMode(prim.getMode())
          .setMaterial(prim.getMaterial().clone().setName(`${prim.getMaterial().getName()}.${tag}`))
          .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(idx.getBuffer()));
        for (const sem of prim.listSemantics()) part.setAttribute(sem, prim.getAttribute(sem).clone());
        scene.addChild(doc.createNode(`${n.getName()}.${tag}`).setMatrix(m).setMesh(doc.createMesh(tag).addPrimitive(part)));
        made++;
      }
      if (groups.has('')) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(groups.get(''))).setBuffer(idx.getBuffer()));
      else prim.dispose();
    }
  }
  log(`split parts: ${made}`);
}

// Lamp fixtures that glow share one 'Light' material across rooms; give each its own copy ('Light.<room>') so join()
// keeps them apart and the game can switch each room's glow off. Window panes get their own 'WindowGlass' material and
// world-planar UVs (1 unit = 1 m along the wall, v = height) for the rain-on-glass effect.
function separateMaterials(doc) {
  for (const n of doc.getRoot().listScenes()[0].listChildren()) {
    const window = n.getName() === 'Windows_Glass_0';
    const room = FIXTURES[n.getName()] ?? (n.getMesh() && BATH_DOOR(n, getBounds(n)) ? 'bathdoor' : undefined);
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
writeFileSync(`${OUT}/collision.json`, JSON.stringify(buildCollision(doc, bounds, { skip: NO_COLLISION })));
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
